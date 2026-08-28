-- SmartStore NG — Idempotent re-assert of the tenant RLS policies
--
-- 001_init.sql creates its policies with a bare `create policy`, so re-running
-- it aborts on the first statement ("policy \"members read store\" already
-- exists") and leaves the database wherever it stopped. That is a real problem
-- for a live project: a policy that was hand-edited in the dashboard, or lost
-- while a schema was being repaired, silently changes who can read which
-- store's rows, and there was no safe way to put it back short of dropping
-- data. Migrations 003 and 005 each worked around this with a pg_policies
-- probe inside a DO block; this one re-asserts the tenant policy set the short
-- way instead — `drop policy if exists` followed by `create policy`.
--
-- Run in order (it is 006) or run on its own, as often as you like: the end
-- state is always the same shipped definition for every policy, and the
-- statements never error on a database where they were already applied.
--
-- The drop/create pair also covers the POS page's new behaviour: the register
-- now filters and pages the product grid by category, and the store's category
-- rows are read on every POS mount, so both are re-asserted here alongside a
-- composite index for the (store_id, category) lookup.

-- ------------------------------------------------------------ RLS on, always
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;
alter table public.void_logs enable row level security;

-- ------------------------------------------------------------ stores
-- Members read their own store; owner/admin update it.
drop policy if exists "members read store" on public.stores;
create policy "members read store" on public.stores
  for select using (id = public.my_store_id());

drop policy if exists "owner updates store" on public.stores;
create policy "owner updates store" on public.stores
  for update using (id = public.my_store_id() and public.my_role() in ('owner','admin'));

-- ------------------------------------------------------------ store_members
-- Anyone in the store reads the team list; only the owner edits or removes it.
drop policy if exists "members read team" on public.store_members;
create policy "members read team" on public.store_members
  for select using (store_id = public.my_store_id());

drop policy if exists "owner updates team" on public.store_members;
create policy "owner updates team" on public.store_members
  for update using (store_id = public.my_store_id() and public.my_role() = 'owner');

drop policy if exists "owner removes team" on public.store_members;
create policy "owner removes team" on public.store_members
  for delete using (store_id = public.my_store_id() and public.my_role() = 'owner');

-- ------------------------------------------------------------ categories / products / expenses
-- Any member reads, manager and above writes. The products and categories
-- policies are what the POS category tabs and the inventory worth summary
-- (cost price is part of the same row) rely on.
drop policy if exists "members read categories" on public.categories;
create policy "members read categories" on public.categories
  for select using (store_id = public.my_store_id());

drop policy if exists "managers write categories" on public.categories;
create policy "managers write categories" on public.categories
  for all using (store_id = public.my_store_id() and public.my_role() in ('owner','admin','manager'));

drop policy if exists "members read products" on public.products;
create policy "members read products" on public.products
  for select using (store_id = public.my_store_id());

drop policy if exists "managers write products" on public.products;
create policy "managers write products" on public.products
  for all using (store_id = public.my_store_id() and public.my_role() in ('owner','admin','manager'));

drop policy if exists "members read expenses" on public.expenses;
create policy "members read expenses" on public.expenses
  for select using (store_id = public.my_store_id());

drop policy if exists "managers write expenses" on public.expenses;
create policy "managers write expenses" on public.expenses
  for all using (store_id = public.my_store_id() and public.my_role() in ('owner','admin','manager'));

-- ------------------------------------------------------------ sales & void logs
-- Read for members; writes stay on the security-definer RPCs in 001.
drop policy if exists "members read sales" on public.sales;
create policy "members read sales" on public.sales
  for select using (store_id = public.my_store_id());

drop policy if exists "members read voids" on public.void_logs;
create policy "members read voids" on public.void_logs
  for select using (store_id = public.my_store_id());

-- ------------------------------------------------------------ POS query support
-- The register lists a store's products ordered by name inside a category
-- tab; this serves that lookup (and the inventory table's category column)
-- without a per-store sequential scan. `create index if not exists` keeps this
-- idempotent too, so the whole migration stays safe to re-run.
create index if not exists idx_products_store_category
  on public.products(store_id, category);

-- Refresh PostgREST's schema cache so the re-created policies and the new
-- index are picked up by the running API.
notify pgrst, 'reload schema';
