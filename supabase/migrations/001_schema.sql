-- FEG Telefonie – Grundschema
-- Im Supabase-Dashboard unter "SQL Editor" komplett ausführen.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Benutzer
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  email       text,
  role        text not null default 'mitarbeiter' check (role in ('admin', 'mitarbeiter')),
  caller_id   text,            -- Rufnummer, die beim Angerufenen angezeigt wird (E.164)
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Neues Auth-Konto -> automatisch Profil anlegen
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active);
$$;

-- ---------------------------------------------------------------------------
-- Importlisten
-- ---------------------------------------------------------------------------
create table public.lead_lists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
create table public.leads (
  id               uuid primary key default gen_random_uuid(),
  list_id          uuid references public.lead_lists(id) on delete set null,
  company          text not null,
  phone            text not null,          -- normalisiert, E.164 (+49...)
  phone2           text,
  email            text,
  website          text,
  street           text,
  zip              text,
  city             text,
  state            text,                   -- Bundesland
  industry         text,                   -- Branche
  current_supplier text,                   -- aktueller Versorger
  contract_end     date,                   -- Vertragsende
  status           text not null default 'neu',
  assigned_to      uuid references public.profiles(id) on delete set null,
  -- automatisch gepflegt (Trigger)
  last_outcome     text,
  last_call_at     timestamptz,
  call_count       int not null default 0,
  next_followup_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint leads_phone_unique unique (phone),
  constraint leads_status_check check (status in
    ('neu', 'in_bearbeitung', 'wiedervorlage', 'termin', 'kein_interesse', 'bereits_kunde', 'ungueltig', 'gesperrt'))
);

create index leads_assigned_idx  on public.leads (assigned_to);
create index leads_status_idx    on public.leads (status);
create index leads_zip_idx       on public.leads (zip);
create index leads_state_idx     on public.leads (state);
create index leads_industry_idx  on public.leads (industry);
create index leads_list_idx      on public.leads (list_id);
create index leads_followup_idx  on public.leads (next_followup_at);
create index leads_company_trgm  on public.leads using gin (company gin_trgm_ops);

-- Mitarbeiter dürfen die Zuweisung nicht ändern
create or replace function public.leads_guard()
returns trigger language plpgsql as $$
begin
  if not public.is_admin() and new.assigned_to is distinct from old.assigned_to then
    raise exception 'Nur Admins dürfen Leads zuweisen';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger leads_guard before update on public.leads
  for each row execute function public.leads_guard();

create or replace function public.can_access_lead(p_lead uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.leads where id = p_lead and assigned_to = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Ansprechpartner
-- ---------------------------------------------------------------------------
create table public.contacts (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  name        text not null,
  position    text,
  phone       text,
  email       text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index contacts_lead_idx on public.contacts (lead_id);

-- ---------------------------------------------------------------------------
-- Notizen
-- ---------------------------------------------------------------------------
create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  user_id     uuid references public.profiles(id),
  body        text not null,
  created_at  timestamptz not null default now()
);
create index notes_lead_idx on public.notes (lead_id);

-- ---------------------------------------------------------------------------
-- Anrufe (aus Twilio oder manuell erfasst)
-- ---------------------------------------------------------------------------
create table public.calls (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid references public.leads(id) on delete set null,
  user_id         uuid references public.profiles(id),
  direction       text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  from_number     text,
  to_number       text,
  started_at      timestamptz not null default now(),
  answered_at     timestamptz,
  ended_at        timestamptz,
  duration_sec    int not null default 0,     -- Gesprächszeit (ab Annahme)
  outcome         text check (outcome in (
    'nicht_erreicht', 'mailbox', 'kein_interesse', 'termin', 'wiedervorlage', 'falsche_nummer',
    'entscheider_nicht_erreichbar', 'vertrag_laeuft', 'kein_bedarf', 'bereits_kunde',
    'firma_existiert_nicht', 'nicht_anrufen')),
  provider_sid    text unique,                -- Twilio CallSid
  recording_url   text,
  transcript      text,
  missed          boolean not null default false,
  created_at      timestamptz not null default now()
);
create index calls_lead_idx    on public.calls (lead_id);
create index calls_user_idx    on public.calls (user_id, started_at);

-- ---------------------------------------------------------------------------
-- Wiedervorlagen
-- ---------------------------------------------------------------------------
create table public.followups (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  user_id     uuid references public.profiles(id),
  due_at      timestamptz not null,
  note        text,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index followups_open_idx on public.followups (user_id, due_at) where done_at is null;

-- ---------------------------------------------------------------------------
-- Sperrliste (gilt für alle Importe)
-- ---------------------------------------------------------------------------
create table public.blocked_phones (
  phone       text primary key,
  reason      text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Automatik: Lead-Felder aus Anrufen und Wiedervorlagen pflegen
-- ---------------------------------------------------------------------------
create or replace function public.status_for_outcome(p_outcome text, p_current text)
returns text language sql immutable as $$
  select case p_outcome
    when 'termin'                       then 'termin'
    when 'kein_interesse'               then 'kein_interesse'
    when 'kein_bedarf'                  then 'kein_interesse'
    when 'bereits_kunde'                then 'bereits_kunde'
    when 'falsche_nummer'               then 'ungueltig'
    when 'firma_existiert_nicht'        then 'ungueltig'
    when 'nicht_anrufen'                then 'gesperrt'
    when 'wiedervorlage'                then 'wiedervorlage'
    when 'vertrag_laeuft'               then 'wiedervorlage'
    when 'entscheider_nicht_erreichbar' then 'wiedervorlage'
    else case when p_current = 'neu' then 'in_bearbeitung' else p_current end
  end;
$$;

create or replace function public.calls_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is null or new.direction <> 'outbound' then
    return new;
  end if;

  update public.leads l set
    call_count   = (select count(*) from public.calls c where c.lead_id = l.id and c.direction = 'outbound'),
    last_call_at = greatest(coalesce(l.last_call_at, new.started_at), new.started_at),
    last_outcome = coalesce(new.outcome, l.last_outcome),
    status       = case when new.outcome is null
                        then case when l.status = 'neu' then 'in_bearbeitung' else l.status end
                        else public.status_for_outcome(new.outcome, l.status) end
  where l.id = new.lead_id;

  if new.outcome = 'nicht_anrufen' then
    insert into public.blocked_phones (phone, reason)
    select phone, 'Ergebnis: nicht anrufen' from public.leads where id = new.lead_id
    on conflict do nothing;
  end if;

  return new;
end $$;

create trigger calls_after_write
  after insert or update of outcome on public.calls
  for each row execute function public.calls_after_write();

create or replace function public.followups_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lead uuid := coalesce(new.lead_id, old.lead_id);
begin
  update public.leads set next_followup_at =
    (select min(due_at) from public.followups where lead_id = v_lead and done_at is null)
  where id = v_lead;
  return null;
end $$;

create trigger followups_after_write
  after insert or update or delete on public.followups
  for each row execute function public.followups_after_write();

-- ---------------------------------------------------------------------------
-- Zugriffsrechte (Row Level Security)
-- Admin: alles. Mitarbeiter: nur zugewiesene Leads und deren Daten.
-- ---------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.lead_lists     enable row level security;
alter table public.leads          enable row level security;
alter table public.contacts       enable row level security;
alter table public.notes          enable row level security;
alter table public.calls          enable row level security;
alter table public.followups      enable row level security;
alter table public.blocked_phones enable row level security;

create policy profiles_read   on public.profiles for select to authenticated using (true);
create policy profiles_admin  on public.profiles for update to authenticated using (public.is_admin());

create policy lists_read      on public.lead_lists for select to authenticated using (true);
create policy lists_admin     on public.lead_lists for all    to authenticated using (public.is_admin()) with check (public.is_admin());

create policy leads_read      on public.leads for select to authenticated using (public.is_admin() or assigned_to = auth.uid());
create policy leads_update    on public.leads for update to authenticated using (public.is_admin() or assigned_to = auth.uid());
create policy leads_insert    on public.leads for insert to authenticated with check (public.is_admin());
create policy leads_delete    on public.leads for delete to authenticated using (public.is_admin());

create policy contacts_all    on public.contacts  for all to authenticated
  using (public.can_access_lead(lead_id)) with check (public.can_access_lead(lead_id));
create policy notes_read      on public.notes     for select to authenticated using (public.can_access_lead(lead_id));
create policy notes_insert    on public.notes     for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_lead(lead_id));
create policy notes_delete    on public.notes     for delete to authenticated using (user_id = auth.uid() or public.is_admin());

create policy calls_read      on public.calls     for select to authenticated using (public.is_admin() or user_id = auth.uid());
create policy calls_insert    on public.calls     for insert to authenticated
  with check (user_id = auth.uid() and (lead_id is null or public.can_access_lead(lead_id)));
create policy calls_update    on public.calls     for update to authenticated using (public.is_admin() or user_id = auth.uid());

create policy followups_all   on public.followups for all to authenticated
  using (public.can_access_lead(lead_id)) with check (public.can_access_lead(lead_id));

create policy blocked_read    on public.blocked_phones for select to authenticated using (true);
create policy blocked_admin   on public.blocked_phones for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Filterwerte für Dropdowns (Branchen, Bundesländer, Orte)
-- ---------------------------------------------------------------------------
create or replace function public.lead_filter_values()
returns json language sql stable security invoker as $$
  select json_build_object(
    'industries', coalesce((select json_agg(distinct industry order by industry) from public.leads where industry is not null and industry <> ''), '[]'),
    'states',     coalesce((select json_agg(distinct state    order by state)    from public.leads where state    is not null and state    <> ''), '[]')
  );
$$;
