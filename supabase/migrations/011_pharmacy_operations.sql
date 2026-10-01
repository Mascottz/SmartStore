-- SmartStore NG: Pharmacy Mode Phase 2 — purchasing & prescriptions
--
-- Phase 1 (010) made stock batch-aware. This migration adds the operations
-- around those batches:
--
--   suppliers            who medicines are bought from
--   purchases            a recorded delivery (GRN): supplier, reference and
--                        the batches it brought in, in one transaction
--   prescriptions        a structured script: patient, prescriber, items
--                        with prescribed quantities
--   prescription_items   per-line prescribed vs dispensed quantities, so a
--                        script can be part-filled across visits
--   prescription_dispensings  every dispensing event linked to the sale it
--                        created (receipt no + FEFO batch allocation), the
--                        audit trail a recall or inspector asks for
--
-- As everywhere in Pharmacy Mode: aggregate/operational data only. No
-- clinical notes, no diagnoses — the record says what was prescribed and
-- what was dispensed, never why.

-- ============================================================ suppliers

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_suppliers_store on public.suppliers(store_id);

alter table public.suppliers enable row level security;

drop policy if exists "members read suppliers" on public.suppliers;
create policy "members read suppliers" on public.suppliers
  for select using (store_id = public.my_store_id());

drop policy if exists "managers write suppliers" on public.suppliers;
create policy "managers write suppliers" on public.suppliers
  for all using (store_id = public.my_store_id() and public.my_role() in ('owner','admin','manager'));

-- ============================================================ purchases

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  -- Waybill / invoice number from the supplier's paperwork.
  reference text not null default '',
  status text not null default 'received' check (status in ('received','cancelled')),
  -- [{productId, name, qty, unitCost, lineTotal, batchId, batchNo, expiryDate}]
  items jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  received_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_purchases_store on public.purchases(store_id, created_at desc);

alter table public.purchases enable row level security;

drop policy if exists "members read purchases" on public.purchases;
create policy "members read purchases" on public.purchases
  for select using (store_id = public.my_store_id());

drop policy if exists "managers write purchases" on public.purchases;
create policy "managers write purchases" on public.purchases
  for all using (store_id = public.my_store_id() and public.my_role() in ('owner','admin','manager'));

-- ------------------------------------------------------------ RPC: record a delivery
-- One transaction: the purchase row AND every batch it brought in. A network
-- blip can never leave a half-received delivery behind. Batches sync the
-- product rollup through the 010 trigger as usual.

create or replace function public.record_purchase(
  p_store_id uuid,
  p_supplier_id uuid default null,
  p_reference text default '',
  p_items jsonb default '[]'::jsonb,
  p_received_by text default ''
) returns public.purchases
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_batch public.product_batches;
  v_items jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_qty numeric;
  v_cost numeric;
  v_purchase public.purchases;
begin
  if public.my_store_id() is distinct from p_store_id then
    raise exception 'Not a member of this store';
  end if;
  if public.my_role() not in ('owner','admin','manager') then
    raise exception 'Only managers and above can record deliveries';
  end if;

  for v_item in select jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_qty := coalesce((v_item->>'qty')::numeric, 0);
    if v_qty <= 0 then
      raise exception 'Every delivery line needs a quantity of at least 1';
    end if;

    insert into product_batches
      (store_id, product_id, batch_no, expiry_date, qty, cost_price, supplier)
    values (
      p_store_id,
      (v_item->>'productId')::uuid,
      coalesce(nullif(btrim(v_item->>'batchNo'), ''), 'OPENING'),
      nullif(v_item->>'expiryDate', '')::date,
      v_qty,
      coalesce((v_item->>'unitCost')::numeric, 0),
      coalesce(v_item->>'supplier', '')
    )
    returning * into v_batch;

    v_cost := coalesce((v_item->>'unitCost')::numeric, 0);
    v_total := v_total + v_qty * v_cost;

    v_items := v_items || jsonb_build_object(
      'productId', v_batch.product_id,
      'name', v_item->>'name',
      'qty', v_qty,
      'unitCost', v_cost,
      'lineTotal', v_qty * v_cost,
      'batchId', v_batch.id,
      'batchNo', v_batch.batch_no,
      'expiryDate', v_batch.expiry_date
    );
  end loop;

  if v_items = '[]'::jsonb then
    raise exception 'A delivery needs at least one line';
  end if;

  insert into purchases (store_id, supplier_id, reference, status, items, total, received_by)
  values (p_store_id, p_supplier_id, coalesce(nullif(btrim(p_reference), ''), ''), 'received', v_items, v_total,
          coalesce(nullif(btrim(p_received_by), ''), ''))
  returning * into v_purchase;

  return v_purchase;
end;
$$;

-- ============================================================ prescriptions

create table if not exists public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code text not null,
  patient_name text not null,
  patient_phone text not null default '',
  patient_age text not null default '',
  prescriber text not null default '',
  notes text not null default '',
  -- open = items still to dispense; dispensed = fully filled; cancelled.
  status text not null default 'open' check (status in ('open','dispensed','cancelled')),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_prescriptions_store on public.prescriptions(store_id, created_at desc);

alter table public.prescriptions enable row level security;

drop policy if exists "members read prescriptions" on public.prescriptions;
create policy "members read prescriptions" on public.prescriptions
  for select using (store_id = public.my_store_id());

drop policy if exists "staff write prescriptions" on public.prescriptions;
create policy "staff write prescriptions" on public.prescriptions
  for all using (store_id = public.my_store_id() and public.my_role() in ('owner','admin','manager','cashier'));

create table if not exists public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  product_name text not null default '',
  prescribed_qty numeric not null default 0 check (prescribed_qty > 0),
  dispensed_qty numeric not null default 0 check (dispensed_qty >= 0)
);

create index if not exists idx_prescription_items_rx on public.prescription_items(prescription_id);

alter table public.prescription_items enable row level security;

drop policy if exists "members read prescription items" on public.prescription_items;
create policy "members read prescription items" on public.prescription_items
  for select using (
    exists (
      select 1 from public.prescriptions p
      where p.id = prescription_id and p.store_id = public.my_store_id()
    )
  );

drop policy if exists "staff write prescription items" on public.prescription_items;
create policy "staff write prescription items" on public.prescription_items
  for all using (
    exists (
      select 1 from public.prescriptions p
      where p.id = prescription_id and p.store_id = public.my_store_id()
    )
  );

create table if not exists public.prescription_dispensings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  receipt_no text not null default '',
  -- The sale lines with their FEFO batch allocations, snapshotted.
  items jsonb not null default '[]'::jsonb,
  dispensed_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_dispensings_rx on public.prescription_dispensings(prescription_id);
create index if not exists idx_dispensings_store on public.prescription_dispensings(store_id, created_at desc);

alter table public.prescription_dispensings enable row level security;

drop policy if exists "members read dispensings" on public.prescription_dispensings;
create policy "members read dispensings" on public.prescription_dispensings
  for select using (store_id = public.my_store_id());

drop policy if exists "staff write dispensings" on public.prescription_dispensings;
create policy "staff write dispensings" on public.prescription_dispensings
  for all using (store_id = public.my_store_id() and public.my_role() in ('owner','admin','manager','cashier'));
