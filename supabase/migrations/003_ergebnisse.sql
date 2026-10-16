-- FEG Telefonie – Teil 3: Gesprächsergebnisse an das CRM angeglichen, neuer Status "interessent"
-- Im Supabase SQL Editor einmal ausführen.

alter table public.calls drop constraint if exists calls_outcome_check;
alter table public.calls add constraint calls_outcome_check check (outcome in (
  'nicht_erreicht', 'mailbox', 'falscher_ansprechpartner', 'entscheider_nicht_erreichbar', 'wiedervorlage',
  'interesse', 'unterlagen_angefordert', 'angebot_gewuenscht', 'termin', 'vertrag_laeuft',
  'kein_interesse', 'kein_bedarf', 'bereits_kunde', 'falsche_nummer', 'firma_existiert_nicht', 'nicht_anrufen'));

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check check (status in (
  'neu', 'in_bearbeitung', 'wiedervorlage', 'interessent', 'termin', 'kein_interesse', 'bereits_kunde', 'ungueltig', 'gesperrt'));

create or replace function public.status_for_outcome(p_outcome text, p_current text)
returns text language sql immutable as $$
  select case p_outcome
    when 'termin'                       then 'termin'
    when 'interesse'                    then 'interessent'
    when 'unterlagen_angefordert'       then 'interessent'
    when 'angebot_gewuenscht'           then 'interessent'
    when 'kein_interesse'               then 'kein_interesse'
    when 'kein_bedarf'                  then 'kein_interesse'
    when 'bereits_kunde'                then 'bereits_kunde'
    when 'falsche_nummer'               then 'ungueltig'
    when 'firma_existiert_nicht'        then 'ungueltig'
    when 'nicht_anrufen'                then 'gesperrt'
    when 'wiedervorlage'                then 'wiedervorlage'
    when 'vertrag_laeuft'               then 'wiedervorlage'
    when 'entscheider_nicht_erreichbar' then 'wiedervorlage'
    when 'falscher_ansprechpartner'     then 'wiedervorlage'
    else case when p_current = 'neu' then 'in_bearbeitung' else p_current end
  end;
$$;
