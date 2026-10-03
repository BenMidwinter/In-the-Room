-- One Google connection per clinician. The previous unique
-- (owner_id, provider, account_email) treated NULL emails as distinct and
-- made reconnect / missing-email paths flaky.

alter table public.calendar_connections
  drop constraint if exists calendar_connections_owner_id_provider_account_email_key;

create unique index if not exists calendar_connections_owner_provider_uidx
  on public.calendar_connections (owner_id, provider);
