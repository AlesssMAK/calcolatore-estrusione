-- 2026-11-23 · Self-registration of companies (Edge Function «company-signup»).
-- Run once in Supabase → SQL Editor → New query → Run. Safe to run again.
--
-- A company that signs up waits («pending») until the super-admin approves it
-- in «Aziende». Until then it isn't public, and its account can't make itself
-- an admin of anything else nor approve itself.

-- 1. A company's status. The existing ones stay active.
alter table public.companies
  add column if not exists status text not null default 'active';
do $$
begin
  alter table public.companies
    add constraint companies_status_check check (status in ('pending', 'active'));
exception when duplicate_object then null;
end $$;

-- 2. The sign-up's details (contact, confirmation link). Private: only the
--    server (service role) writes it, only the super-admin reads it.
create table if not exists public.company_signups (
  company_id uuid primary key references public.companies (id) on delete cascade,
  user_id uuid not null,
  email text not null,
  phone text,
  token_hash text not null unique,
  token_expires_at timestamptz not null,
  requested_at timestamptz not null default now(),
  email_confirmed_at timestamptz,
  approved_at timestamptz
);
create index if not exists company_signups_email_idx
  on public.company_signups (email);
create index if not exists company_signups_requested_idx
  on public.company_signups (requested_at);
alter table public.company_signups enable row level security;
drop policy if exists company_signups_super_read on public.company_signups;
create policy company_signups_super_read on public.company_signups
  for select to authenticated
  using (public.is_super_admin(auth.uid()));

-- 3. The signed-in admin's company (for the policy below; SECURITY DEFINER,
--    so reading «admins» inside a «companies» policy doesn't loop).
create or replace function public.my_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.admins where user_id = auth.uid() limit 1
$$;

-- 4. A pending company isn't public: its calculator link doesn't open. Only
--    its own admin and the super-admin see it. RESTRICTIVE = on top of the
--    existing read policy, whatever that one is called.
drop policy if exists companies_pending_hidden on public.companies;
create policy companies_pending_hidden on public.companies
  as restrictive for select to anon, authenticated
  using (
    status = 'active'
    or id = public.my_company_id()
    or public.is_super_admin(auth.uid())
  );

-- 5. From the browser, only the super-admin creates or deletes companies and
--    writes the admin links (the Edge Functions use the service role, which
--    these don't touch). So a fresh account can't add itself to a company or
--    give itself «is_super».
drop policy if exists companies_insert_super_only on public.companies;
create policy companies_insert_super_only on public.companies
  as restrictive for insert to anon, authenticated
  with check (public.is_super_admin(auth.uid()));
drop policy if exists companies_delete_super_only on public.companies;
create policy companies_delete_super_only on public.companies
  as restrictive for delete to anon, authenticated
  using (public.is_super_admin(auth.uid()));

drop policy if exists admins_insert_super_only on public.admins;
create policy admins_insert_super_only on public.admins
  as restrictive for insert to anon, authenticated
  with check (public.is_super_admin(auth.uid()));
drop policy if exists admins_update_super_only on public.admins;
create policy admins_update_super_only on public.admins
  as restrictive for update to anon, authenticated
  using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));
drop policy if exists admins_delete_super_only on public.admins;
create policy admins_delete_super_only on public.admins
  as restrictive for delete to anon, authenticated
  using (public.is_super_admin(auth.uid()));

-- 6. Only the super-admin (or the server) changes a company's status — a
--    pending company's admin can't approve it by editing its own row.
create or replace function public.guard_company_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and coalesce(auth.role(), '') in ('anon', 'authenticated')
     and not coalesce(public.is_super_admin(auth.uid()), false) then
    raise exception 'Only the super-admin can change a company''s status';
  end if;
  return new;
end
$$;
drop trigger if exists companies_status_guard on public.companies;
create trigger companies_status_guard
  before update on public.companies
  for each row execute function public.guard_company_status();

-- 7. Check (read-only): every rule on these tables. Copy the result to Claude.
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('companies', 'admins', 'products', 'company_settings', 'company_signups')
order by tablename, cmd, policyname;
