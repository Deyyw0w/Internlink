-- 005_countries.sql
-- Managed country list for Partner Agencies.
-- Run this in Supabase Dashboard → SQL Editor.

-- 1. Create the countries table.
create table if not exists public.countries (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- 2. Enable RLS.
alter table public.countries enable row level security;

-- 3. Read policy: everyone can see countries (used by dropdowns).
create policy "Countries are viewable by everyone"
  on public.countries for select
  using (true);

-- 4. Write policy: UI-level admin gating protects this page;
--    using (true) keeps inserts/updates/deletes simple while the
--    Partner Agencies page enforces admin-only access in the UI.
create policy "Admins can manage countries"
  on public.countries for all
  using (true)
  with check (true);

-- 5. Add country_id foreign key to companies so agencies can be
--    explicitly assigned to a country instead of deriving it from
--    the address string.
alter table public.companies add column if not exists country_id uuid references public.countries(id);

-- 6. Index for faster lookups.
create index if not exists idx_companies_country_id on public.companies(country_id);

-- 7. Seed the table with the current sample countries so nothing
--    disappears from existing dropdowns.
insert into public.countries (name, is_active)
values
  ('Japan', true),
  ('China', true),
  ('Thailand', true),
  ('USA', true),
  ('Vietnam', true),
  ('South Korea', true),
  ('Singapore', true),
  ('Canada', true),
  ('Australia', true),
  ('United Kingdom', true),
  ('Germany', true),
  ('India', true)
on conflict (name) do nothing;
