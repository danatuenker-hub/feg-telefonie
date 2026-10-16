-- FEG Telefonie – Teil 5: Erinnerung vor dem Termin, Aufnahme für Berater
-- Im Supabase SQL Editor einmal ausführen.

alter table public.appointments add column if not exists reminded_at timestamptz;
create index if not exists appointments_reminder_idx on public.appointments (starts_at) where reminded_at is null;

-- Berater dürfen das Gespräch (und die Aufnahme) sehen, in dem ihr Termin gelegt wurde
drop policy if exists calls_read on public.calls;
create policy calls_read on public.calls for select to authenticated
  using (public.is_admin() or user_id = auth.uid()
         or exists (select 1 from public.appointments a where a.call_id = calls.id and a.berater_id = auth.uid()));

drop policy if exists recordings_read on storage.objects;
create policy recordings_read on storage.objects for select to authenticated
  using (
    bucket_id = 'recordings'
    and (public.is_admin() or exists (
      select 1 from public.calls c
      left join public.appointments a on a.call_id = c.id
      where c.recording_url = storage.objects.name
        and (c.user_id = auth.uid() or a.berater_id = auth.uid())))
  );
