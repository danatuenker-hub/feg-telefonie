-- FEG Telefonie – Teil 4: Berater, Termine, Verfügbarkeiten, Telegram
-- Im Supabase SQL Editor einmal ausführen.

-- ---------------------------------------------------------------------------
-- Rolle "berater" + Felder für Region, Telegram und Kalender-Abo
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'mitarbeiter', 'berater'));

alter table public.profiles
  add column if not exists phone            text,                               -- Handynummer des Beraters
  add column if not exists regions          text,                               -- PLZ-Bereiche, z. B. "80-85, 90"
  add column if not exists telegram_chat_id text;

-- Geheimer Link für das Kalender-Abo (eigene Tabelle, damit andere Benutzer ihn nicht lesen können)
create table public.calendar_tokens (
  user_id  uuid primary key references public.profiles(id) on delete cascade,
  token    uuid not null unique default gen_random_uuid()
);
alter table public.calendar_tokens enable row level security;
create policy calendar_tokens_own on public.calendar_tokens for select to authenticated using (user_id = auth.uid());

create or replace function public.is_berater()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'berater' and active);
$$;

-- ---------------------------------------------------------------------------
-- Termine
-- ---------------------------------------------------------------------------
create table public.appointments (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid references public.leads(id) on delete set null,
  berater_id       uuid not null references public.profiles(id),
  created_by       uuid references public.profiles(id),
  call_id          uuid references public.calls(id) on delete set null,
  kind             text not null default 'vor_ort' check (kind in ('vor_ort', 'telefon')),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  -- Angaben zum Termin (Kopie aus dem Lead, beim Anlegen ergänzbar)
  company          text,
  contact_name     text,
  contact_phone    text,
  street           text,
  zip              text,
  city             text,
  power_kwh        int,
  gas_kwh          int,
  sites            int,            -- Anzahl Lieferstellen
  current_supplier text,
  contract_end     date,
  notes            text,
  -- Ablauf
  status           text not null default 'geplant' check (status in
    ('geplant', 'bestaetigt', 'durchgefuehrt', 'abschluss', 'kein_abschluss', 'verschoben', 'abgesagt', 'nicht_angetroffen')),
  result_note      text,           -- Rückmeldung des Beraters
  notified_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint appointments_time_check check (ends_at > starts_at)
);
create index appointments_berater_idx on public.appointments (berater_id, starts_at);
create index appointments_lead_idx    on public.appointments (lead_id);
create index appointments_creator_idx on public.appointments (created_by, created_at);

create or replace function public.appointments_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger appointments_touch before update on public.appointments
  for each row execute function public.appointments_touch();

-- ---------------------------------------------------------------------------
-- Verfügbarkeit: feste Wochenzeiten + Abwesenheiten
-- ---------------------------------------------------------------------------
create table public.availability (
  id          uuid primary key default gen_random_uuid(),
  berater_id  uuid not null references public.profiles(id) on delete cascade,
  weekday     int  not null check (weekday between 1 and 7),   -- 1 = Montag
  start_time  time not null,
  end_time    time not null,
  constraint availability_time_check check (end_time > start_time)
);
create index availability_berater_idx on public.availability (berater_id);

create table public.absences (
  id          uuid primary key default gen_random_uuid(),
  berater_id  uuid not null references public.profiles(id) on delete cascade,
  from_date   date not null,
  to_date     date not null,
  note        text,
  constraint absences_date_check check (to_date >= from_date)
);
create index absences_berater_idx on public.absences (berater_id, from_date);

-- Belegte Zeiten eines Beraters (ohne Kundendaten) – für die Terminbuchung durch Agenten
create or replace function public.berater_busy(p_berater uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz, kind text)
language sql stable security definer set search_path = public as $$
  select a.starts_at, a.ends_at, a.kind from public.appointments a
  where a.berater_id = p_berater and a.status not in ('abgesagt', 'verschoben')
    and a.starts_at < p_to and a.ends_at > p_from
    and auth.uid() is not null;
$$;

-- ---------------------------------------------------------------------------
-- Zugriffsrechte
-- ---------------------------------------------------------------------------
alter table public.appointments enable row level security;
alter table public.availability enable row level security;
alter table public.absences     enable row level security;

create policy appointments_read on public.appointments for select to authenticated
  using (public.is_admin() or berater_id = auth.uid() or created_by = auth.uid());
create policy appointments_insert on public.appointments for insert to authenticated
  with check (created_by = auth.uid() and not public.is_berater()
              and (lead_id is null or public.can_access_lead(lead_id)));
create policy appointments_update on public.appointments for update to authenticated
  using (public.is_admin() or berater_id = auth.uid() or created_by = auth.uid());
create policy appointments_delete on public.appointments for delete to authenticated
  using (public.is_admin());

create policy availability_read  on public.availability for select to authenticated using (true);
create policy availability_write on public.availability for all to authenticated
  using (public.is_admin() or berater_id = auth.uid()) with check (public.is_admin() or berater_id = auth.uid());
create policy absences_read  on public.absences for select to authenticated using (true);
create policy absences_write on public.absences for all to authenticated
  using (public.is_admin() or berater_id = auth.uid()) with check (public.is_admin() or berater_id = auth.uid());

-- Berater dürfen Leads (inkl. Ansprechpartner und Notizen) ihrer Termine sehen
create or replace function public.can_access_lead(p_lead uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.leads where id = p_lead and assigned_to = auth.uid())
      or exists (select 1 from public.appointments where lead_id = p_lead and berater_id = auth.uid());
$$;

drop policy if exists leads_read on public.leads;
create policy leads_read on public.leads for select to authenticated
  using (public.is_admin() or assigned_to = auth.uid()
         or exists (select 1 from public.appointments a where a.lead_id = leads.id and a.berater_id = auth.uid()));

-- Aufnahmen: nur Admin und der Mitarbeiter, der das Gespräch geführt hat
drop policy if exists recordings_read on storage.objects;
create policy recordings_read on storage.objects for select to authenticated
  using (
    bucket_id = 'recordings'
    and (public.is_admin() or exists (
      select 1 from public.calls c where c.recording_url = storage.objects.name and c.user_id = auth.uid()))
  );

-- Kalender-Token des angemeldeten Benutzers (wird beim ersten Abruf angelegt)
create or replace function public.my_calendar_token()
returns uuid language sql volatile security definer set search_path = public as $$
  insert into public.calendar_tokens (user_id) values (auth.uid())
  on conflict (user_id) do update set user_id = excluded.user_id
  returning token;
$$;
