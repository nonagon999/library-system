-- Run this in Supabase SQL Editor.
-- Purpose: unblock app reads/writes when RLS is enabled.

alter table if exists public.books enable row level security;
alter table if exists public.admin_users enable row level security;
alter table if exists public.borrow_records enable row level security;

-- Public OPAC read access for books (used by /api/books and /api/books/latest)
drop policy if exists "public can read books" on public.books;
create policy "public can read books"
on public.books
for select
to anon, authenticated
using (true);

-- Backend access for service role (Render server with SUPABASE_SERVICE_ROLE_KEY)
drop policy if exists "service role full books" on public.books;
create policy "service role full books"
on public.books
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role full admin_users" on public.admin_users;
create policy "service role full admin_users"
on public.admin_users
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role full borrow_records" on public.borrow_records;
create policy "service role full borrow_records"
on public.borrow_records
for all
to service_role
using (true)
with check (true);
