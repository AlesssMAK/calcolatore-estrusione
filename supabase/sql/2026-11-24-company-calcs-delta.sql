-- 2026-11-24 · Less traffic for Produzione.
-- Run once in Supabase → SQL Editor → New query → Run. Safe to run again.
--
-- The Produzione page reads its company's list every minute, and so far that
-- brought back every calc in full (~20 KB each) even when nothing changed.
-- This one takes what the app already has ({ "id": version, … }) and sends a
-- calc's payload only when it's new or changed — the rest come back as
-- id + version only. The same calcs as get_company_calcs (it reads through
-- it), so nothing more becomes visible. Until this runs, the app keeps using
-- get_company_calcs.

create or replace function public.get_company_calcs_delta(
  p_company text,
  p_known jsonb default '{}'::jsonb
)
returns table (
  id text,
  payload jsonb,
  version integer,
  updated_at timestamptz,
  is_editable boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         case
           when jsonb_typeof(p_known) is distinct from 'object' then c.payload
           when p_known ->> c.id = c.version::text then null
           else c.payload
         end,
         c.version,
         c.updated_at,
         c.is_editable
  from public.get_company_calcs(p_company) c
$$;

grant execute on function public.get_company_calcs_delta(text, jsonb)
  to anon, authenticated;

-- The API sees the new function at once.
notify pgrst, 'reload schema';
