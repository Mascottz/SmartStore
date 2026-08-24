-- SmartStore NG — Supabase schema
-- Run this in the Supabase SQL editor (or `supabase db push`) once,
-- then set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.

-- ============================================================ tables

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'other',
  plan text not null default 'free',
  is_demo boolean not null default false,
  join_code text not null unique,
  onboarding jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.store_members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null default '',
  role text not null default 'cashier' check (role in ('owner','admin','manager','cashier')),
  created_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  sku text default '',
  category text default 'General',
  cost_price numeric not null default 0,
  sale_price numeric not null default 0,
  stock numeric not null default 0,
  expiry_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  receipt_no text not null,
  payment_method text not null default 'Cash',
  cashier_email text default '',
  status text not null default 'completed' check (status in ('completed','voided')),
  items jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  title text not null,
  amount numeric not null default 0,
  category text default 'Other',
  note text default '',
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.void_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  receipt_no text not null,
  total numeric not null default 0,
  reason text not null default '',
  voided_by text default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_members_store on public.store_members(store_id);
create index if not exists idx_products_store on public.products(store_id);
create index if not exists idx_sales_store on public.sales(store_id, created_at desc);
create index if not exists idx_expenses_store on public.expenses(store_id, date desc);
create index if not exists idx_voidlogs_store on public.void_logs(store_id, created_at desc);

-- ============================================================ helpers

create or replace function public.my_store_id()
returns uuid language sql stable security definer set search_path = public as $$
  select store_id from public.store_members where user_id = auth.uid() limit 1;
$$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.store_members where user_id = auth.uid() limit 1;
$$;

-- ============================================================ RLS

alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;
alter table public.void_logs enable row level security;

-- stores: members can read; owner/admin can update
create policy "members read store" on public.stores
  for select using (id = public.my_store_id());
create policy "owner updates store" on public.stores
  for update using (id = public.my_store_id() and public.my_role() in ('owner','admin'));

-- store_members: members can read team; owner manages
create policy "members read team" on public.store_members
  for select using (store_id = public.my_store_id());
create policy "owner updates team" on public.store_members
  for update using (store_id = public.my_store_id() and public.my_role() = 'owner');
create policy "owner removes team" on public.store_members
  for delete using (store_id = public.my_store_id() and public.my_role() = 'owner');

-- categories / products / expenses: any member reads, manager+ writes
create policy "members read categories" on public.categories
  for select using (store_id = public.my_store_id());
create policy "managers write categories" on public.categories
  for all using (store_id = public.my_store_id() and public.my_role() in ('owner','admin','manager'));

create policy "members read products" on public.products
  for select using (store_id = public.my_store_id());
create policy "managers write products" on public.products
  for all using (store_id = public.my_store_id() and public.my_role() in ('owner','admin','manager'));

create policy "members read expenses" on public.expenses
  for select using (store_id = public.my_store_id());
create policy "managers write expenses" on public.expenses
  for all using (store_id = public.my_store_id() and public.my_role() in ('owner','admin','manager'));

-- sales & void logs: read for members; writes only via RPCs below
create policy "members read sales" on public.sales
  for select using (store_id = public.my_store_id());
create policy "members read voids" on public.void_logs
  for select using (store_id = public.my_store_id());

-- ============================================================ RPCs

-- Create a store + owner membership + starter categories (called at onboarding)
create or replace function public.create_store(
  p_name text,
  p_type text,
  p_categories jsonb default '[]'::jsonb
) returns public.stores
language plpgsql security definer set search_path = public as $$
declare
  v_store public.stores;
  v_email text;
  v_cat text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from store_members where user_id = auth.uid()) then
    raise exception 'You already belong to a store';
  end if;

  select coalesce(email, '') into v_email from auth.users where id = auth.uid();

  insert into stores (name, type, join_code, onboarding)
  values (
    p_name,
    p_type,
    upper(substr(md5(random()::text), 1, 6)),
    jsonb_build_object('completed', true, 'businessType', p_type,
                       'firstProductAdded', false, 'firstSaleCompleted', false)
  )
  returning * into v_store;

  insert into store_members (store_id, user_id, email, role)
  values (v_store.id, auth.uid(), v_email, 'owner');

  for v_cat in select jsonb_array_elements_text(p_categories) loop
    insert into categories (store_id, name) values (v_store.id, v_cat);
  end loop;

  return v_store;
end;
$$;

-- Join an existing store with its join code (staff signup)
create or replace function public.join_store_with_code(p_code text)
returns public.stores
language plpgsql security definer set search_path = public as $$
declare
  v_store public.stores;
  v_email text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_store from stores where join_code = upper(p_code);
  if not found then raise exception 'No store found for that join code.'; end if;

  select coalesce(email, '') into v_email from auth.users where id = auth.uid();

  insert into store_members (store_id, user_id, email, role)
  values (v_store.id, auth.uid(), v_email, 'cashier')
  on conflict (user_id) do nothing;

  return v_store;
end;
$$;

-- Transactional checkout: verify stock, decrement, insert sale atomically
create or replace function public.create_sale(
  p_store_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_receipt_no text,
  p_cashier_email text default '',
  p_track_stock boolean default true
) returns public.sales
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_stock numeric;
  v_total numeric := 0;
  v_sale public.sales;
begin
  if public.my_store_id() is distinct from p_store_id then
    raise exception 'Not a member of this store';
  end if;

  for v_item in select jsonb_array_elements(p_items) loop
    v_total := v_total + coalesce((v_item->>'lineTotal')::numeric, 0);

    if p_track_stock then
      select stock into v_stock from products
      where id = (v_item->>'productId')::uuid and store_id = p_store_id
      for update;

      if not found then
        raise exception 'Product not found: %', v_item->>'name';
      end if;
      if v_stock - (v_item->>'qty')::numeric < 0 then
        raise exception 'Insufficient stock for %', v_item->>'name';
      end if;

      update products
      set stock = stock - (v_item->>'qty')::numeric
      where id = (v_item->>'productId')::uuid;
    end if;
  end loop;

  insert into sales (store_id, receipt_no, payment_method, cashier_email, status, items, total)
  values (p_store_id, p_receipt_no, p_payment_method, p_cashier_email, 'completed', p_items, v_total)
  returning * into v_sale;

  return v_sale;
end;
$$;

-- Void a sale: restock items, mark voided, write audit log
create or replace function public.void_sale(
  p_sale_id uuid,
  p_reason text,
  p_voided_by text default '',
  p_track_stock boolean default true
) returns public.sales
language plpgsql security definer set search_path = public as $$
declare
  v_sale public.sales;
  v_item jsonb;
begin
  select * into v_sale from sales where id = p_sale_id for update;
  if not found then raise exception 'Sale not found'; end if;
  if v_sale.store_id is distinct from public.my_store_id() then
    raise exception 'Not a member of this store';
  end if;
  if public.my_role() not in ('owner','admin','manager') then
    raise exception 'Only managers and above can void sales';
  end if;
  if v_sale.status = 'voided' then raise exception 'Sale already voided'; end if;

  update sales set status = 'voided' where id = p_sale_id;

  if p_track_stock then
    for v_item in select jsonb_array_elements(v_sale.items) loop
      update products
      set stock = stock + (v_item->>'qty')::numeric
      where id = (v_item->>'productId')::uuid;
    end loop;
  end if;

  insert into void_logs (store_id, sale_id, receipt_no, total, reason, voided_by)
  values (v_sale.store_id, v_sale.id, v_sale.receipt_no, v_sale.total, p_reason, p_voided_by);

  select * into v_sale from sales where id = p_sale_id;
  return v_sale;
end;
$$;
