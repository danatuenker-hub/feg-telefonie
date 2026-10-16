-- FEG Telefonie – Teil 2: Aufnahmen und Rückrufe
-- Im Supabase SQL Editor einmal ausführen.

-- Privater Speicher für Gesprächsaufnahmen (Pfad: <lead_id>/<call_id>.mp3)
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

create policy recordings_read on storage.objects for select to authenticated
  using (
    bucket_id = 'recordings'
    and public.can_access_lead(((storage.foldername(name))[1])::uuid)
  );

-- Verpasste Rückrufe als "gesehen" markieren
alter table public.calls add column if not exists seen_at timestamptz;

create index if not exists calls_missed_idx on public.calls (user_id) where missed and seen_at is null;
