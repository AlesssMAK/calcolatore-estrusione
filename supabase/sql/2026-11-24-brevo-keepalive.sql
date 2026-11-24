-- 2026-11-24 · Keep the Brevo API key alive.
-- Run once in Supabase → SQL Editor, AFTER the Edge Function «company-signup»
-- is deployed. Safe to run again.
--
-- Brevo retires an API key after 90 days without use, and sign-ups may be
-- rarer than that — then the emails would silently stop. Every Monday this
-- calls the function, which makes one read from Brevo with the key.

-- 1. When the function last reached Brevo (it does at most once in 20 h, so
--    calling it in a loop doesn't hammer Brevo). Server only: RLS, no policy.
create table if not exists public.service_pings (
  name text primary key,
  last_at timestamptz not null default 'epoch'
);
alter table public.service_pings enable row level security;
insert into public.service_pings (name) values ('brevo')
  on conflict (name) do nothing;

-- 2. HTTP calls from the database.
create extension if not exists pg_net with schema extensions;

-- 3. Every Monday at 07:00 UTC (same name again = the job is updated).
select cron.schedule(
  'brevo-keepalive',
  '0 7 * * 1',
  $job$
  select net.http_post(
    url := 'https://vufezvazkiygumnelhtu.supabase.co/functions/v1/company-signup',
    body := '{"action":"keepalive"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  $job$
);

-- 4. Once now, to check it works (the call goes out right after this script).
select net.http_post(
  url := 'https://vufezvazkiygumnelhtu.supabase.co/functions/v1/company-signup',
  body := '{"action":"keepalive"}'::jsonb,
  headers := '{"Content-Type":"application/json"}'::jsonb
);

-- 5. A few seconds later, in a NEW query, run only this — expected:
--    status_code 200, content {"ok":true}.
--
-- select status_code, content from net._http_response order by id desc limit 1;
