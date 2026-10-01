-- SmartStore NG: Pharmacy Mode - batch-aware stock, FEFO dispensing
--
-- A pharmacy product's stock is no longer one number with one expiry date;
-- it is a set of batches, each carrying its own batch number, expiry date,
-- quantity, cost and supplier. Selling allocates FEFO (first-expiry-
-- first-out) inside create_sale, and the allocation is embedded in each
-- sale line item so receipts, recalls and voids can trace exact batches.
--
-- Backwards compatibility is deliberate: products.stock stays the sum of
-- the product's active batches and products.expiry_date mirrors the
-- earliest active batch expiry (maintained by the trigger below), so every
-- existing consumer - POS tiles, low-stock lists, mobile inventory,
-- reports, exports - keeps working unchanged. Non-pharmacy stores never
-- grow batch rows and behave exactly as before.
--
-- The client-side rules live in src/lib/pharmacy.js; this migration is the
-- server-side twin. Keep the two in sync.

-- ============================================================ medicine fields

alter table public.products
  add column if not exists generic_name text not null default '',
  add column if not exists strength text not null default '',
  add column if not exists dosage_form text not null default '',
  add column if not exists pack_size text not null default '',
  add column if not exists is_rx boolean not null default false;

-- ============================================================ batches table

create table if not exists public.product_batches (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  batch_no text not null default '',
  expiry_date date,
  qty numeric not null default 0 check (qty >= 0),
  cost_price numeric not null default 0,
  supplier text not null default '',
  -- 'active' stock is sellable and counted in products.stock. 'quarantined'
  -- (damaged / awaiting inspection) and 'recalled' stock is kept for the
  -- record but never dispensed and never counted in the rollup.
  status text not null default 'active' check (status in ('active','quarantined','recalled')),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_batches_store on public.product_batches(store_id);
create index if not exists idx_batches_product on public.product_batches(product_id);
-- FEFO scan: a product's active, in-date batches soonest-expiry first.
create index if not exists idx_batches_fefo
  on public.product_batches(product_id, expiry_date)
  where status = 'active' and qty > 0;

alter table public.product_batches enable row level security;

drop policy if exists "members read batches" on public.product_batches;
create policy "members read batches" on public.product_batches
  for select using (store_id = public.my_store_id());

-- Same trust line as products themselves: managers and above receive,
-- edit, quarantine and remove batches.
drop policy if exists "managers write batches" on public.product_batches;
create policy "managers write batches" on public.product_batches
  for all using (store_id = public.my_store_id() and public.my_role() in ('owner','admin','manager'));

-- ============================================================ stock rollup

-- Every batch change resyncs the product's rollup: stock = active batch
-- quantity, expiry_date = earliest active batch expiry. This is what lets
-- the whole existing app keep reading products.stock / products.expiry_date
-- while the truth lives one level down, in the batches.
create or replace function public.sync_product_stock_from_batches()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_product_id uuid;
  v_sum numeric;
  v_min_expiry date;
begin
  v_product_id := coalesce(new.product_id, old.product_id);

  select coalesce(sum(qty), 0), min(expiry_date)
    into v_sum, v_min_expiry
  from public.product_batches
  where product_id = v_product_id
    and status = 'active'
    and qty > 0;

  update public.products
  set stock = v_sum,
      expiry_date = v_min_expiry
  where id = v_product_id;

  return null;
end;
$$;

drop trigger if exists product_batches_sync_stock on public.product_batches;
create trigger product_batches_sync_stock
after insert or update or delete on public.product_batches
for each row execute function public.sync_product_stock_from_batches();

-- ============================================================ backfill

-- Existing pharmacy products carried a single stock number and a single
-- expiry date. Seed one "OPENING" batch per product so history is preserved
-- and the data becomes batch-aware without anyone retyping anything.
-- Products whose expiry has already passed stay 'active' on purpose: the
-- stock remains visible, the POS refuses to dispense it, and the expiry
-- dashboard flags it for quarantine - which is exactly the conversation a
-- pharmacist needs to have with that shelf.
insert into public.product_batches
  (store_id, product_id, batch_no, expiry_date, qty, cost_price, supplier, status)
select p.store_id, p.id, 'OPENING', p.expiry_date, p.stock, p.cost_price, '', 'active'
from public.products p
join public.stores s on s.id = p.store_id
where s.type = 'pharmacy'
  and p.stock > 0
  and not exists (
    select 1 from public.product_batches b where b.product_id = p.id
  );

-- ============================================================ RPC: receive a product with batches

-- Atomic "add medicine": inserts the product plus its optional opening
-- batch in one transaction, so a network blip can never leave a half-built
-- product behind. Returns the products row (the batch is a side effect;
-- the rollup trigger has already folded it into stock).
create or replace function public.create_pharmacy_product(
  p_store_id uuid,
  p_name text,
  p_sku text,
  p_category text,
  p_cost_price numeric default 0,
  p_sale_price numeric default 0,
  p_generic_name text default '',
  p_strength text default '',
  p_dosage_form text default '',
  p_pack_size text default '',
  p_is_rx boolean default false,
  p_batch jsonb default null
) returns public.products
language plpgsql security definer set search_path = public as $$
declare
  v_product public.products;
  v_qty numeric;
begin
  if public.my_store_id() is distinct from p_store_id then
    raise exception 'Not a member of this store';
  end if;
  if public.my_role() not in ('owner','admin','manager') then
    raise exception 'Only managers and above can add products';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Product name is required';
  end if;

  insert into products (
    store_id, name, sku, category, cost_price, sale_price, stock, expiry_date,
    generic_name, strength, dosage_form, pack_size, is_rx
  ) values (
    p_store_id, p_name, coalesce(nullif(btrim(p_sku), ''), ''),
    coalesce(nullif(btrim(p_category), ''), 'General'),
    coalesce(p_cost_price, 0), coalesce(p_sale_price, 0), 0, null,
    coalesce(p_generic_name, ''), coalesce(p_strength, ''),
    coalesce(p_dosage_form, ''), coalesce(p_pack_size, ''),
    coalesce(p_is_rx, false)
  )
  returning * into v_product;

  v_qty := coalesce((p_batch->>'qty')::numeric, 0);
  if p_batch is not null and v_qty > 0 then
    insert into product_batches
      (store_id, product_id, batch_no, expiry_date, qty, cost_price, supplier)
    values (
      p_store_id, v_product.id,
      coalesce(nullif(btrim(p_batch->>'batchNo'), ''), 'OPENING'),
      nullif(p_batch->>'expiryDate', '')::date,
      v_qty,
      coalesce((p_batch->>'costPrice')::numeric, 0),
      coalesce(p_batch->>'supplier', '')
    );
  end if;

  return v_product;
end;
$$;

-- ============================================================ RPC: create_sale (FEFO)

-- Same signature and behaviour as the migration 007 version, extended for
-- batches: when a product has batch rows, the requested quantity is
-- allocated FEFO across its active, in-date batches (locked for update),
-- each batch is decremented, and the allocation is written into the line
-- item as `batches: [{batchId, batchNo, expiryDate, qty}]`. The rollup
-- trigger keeps products.stock correct as the batches move. Products
-- without batches take the original path, byte for byte.
create or replace function public.create_sale(
  p_store_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_receipt_no text,
  p_cashier_email text default '',
  p_track_stock boolean default true,
  p_amount_paid numeric default null,
  p_customer_name text default ''
) returns public.sales
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_stock numeric;
  v_qty numeric;
  v_remaining numeric;
  v_take numeric;
  v_total numeric := 0;
  v_paid numeric;
  v_sale public.sales;
  v_batch public.product_batches;
  v_alloc jsonb;
  v_items jsonb := '[]'::jsonb;
begin
  if public.my_store_id() is distinct from p_store_id then
    raise exception 'Not a member of this store';
  end if;

  for v_item in select jsonb_array_elements(p_items) loop
    v_total := v_total + coalesce((v_item->>'lineTotal')::numeric, 0);
    v_qty := (v_item->>'qty')::numeric;

    if p_track_stock then
      select stock into v_stock from products
      where id = (v_item->>'productId')::uuid and store_id = p_store_id
      for update;

      if not found then
        raise exception 'Product not found: %', v_item->>'name';
      end if;

      if exists (
        select 1 from product_batches
        where product_id = (v_item->>'productId')::uuid
      ) then
        -- Batch-aware product: allocate FEFO over active, in-date stock.
        v_remaining := v_qty;
        v_alloc := '[]'::jsonb;

        for v_batch in
          select * from product_batches
          where product_id = (v_item->>'productId')::uuid
            and status = 'active'
            and qty > 0
            and (expiry_date is null or expiry_date >= current_date)
          order by coalesce(expiry_date, '9999-12-31'::date), received_at, created_at
          for update
        loop
          exit when v_remaining <= 0;
          v_take := least(v_batch.qty, v_remaining);

          update product_batches
          set qty = qty - v_take
          where id = v_batch.id;

          v_alloc := v_alloc || jsonb_build_object(
            'batchId', v_batch.id,
            'batchNo', v_batch.batch_no,
            'expiryDate', v_batch.expiry_date,
            'qty', v_take
          );
          v_remaining := v_remaining - v_take;
        end loop;

        if v_remaining > 0 then
          raise exception
            'Insufficient in-date stock for % (short by % units; expired or quarantined batches do not count)',
            v_item->>'name', v_remaining;
        end if;

        v_item := jsonb_set(v_item, '{batches}', v_alloc);
        -- products.stock is resynced by the batch trigger.
      else
        if v_stock - v_qty < 0 then
          raise exception 'Insufficient stock for %', v_item->>'name';
        end if;

        update products
        set stock = stock - v_qty
        where id = (v_item->>'productId')::uuid;
      end if;
    end if;

    v_items := v_items || v_item;
  end loop;

  -- Partial / Credit sales leave money outstanding against a named customer;
  -- anything else counts as paid in full at the till.
  if p_payment_method in ('Partial', 'Credit') then
    if nullif(btrim(p_customer_name), '') is null then
      raise exception 'Enter the customer''s name so the debt can be tracked.';
    end if;
    if p_payment_method = 'Credit' then
      v_paid := 0;
    else
      v_paid := coalesce(p_amount_paid, 0);
      if v_paid <= 0 then
        raise exception 'Enter how much the customer is paying now.';
      end if;
      if v_paid >= v_total then
        raise exception 'Amount paid must be less than the sale total for a partial payment.';
      end if;
    end if;
  else
    v_paid := v_total;
  end if;

  insert into sales (store_id, receipt_no, payment_method, cashier_email, status, items, total, amount_paid, customer_name)
  values (
    p_store_id, p_receipt_no, p_payment_method, p_cashier_email, 'completed', v_items, v_total, v_paid,
    case when p_payment_method in ('Partial', 'Credit') then left(btrim(p_customer_name), 100) else '' end
  )
  returning * into v_sale;

  return v_sale;
end;
$$;

-- ============================================================ RPC: void_sale (batch restore)

-- Voids now return stock to the exact batches it came from (the allocation
-- travels inside each line item). If the originating batch was deleted in
-- the meantime, the units fall back to plain product stock so nothing is
-- ever silently lost.
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
  v_alloc jsonb;
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
      if v_item ? 'batches' then
        for v_alloc in select jsonb_array_elements(v_item->'batches') loop
          update product_batches
          set qty = qty + (v_alloc->>'qty')::numeric
          where id = (v_alloc->>'batchId')::uuid;

          if not found then
            update products
            set stock = stock + (v_alloc->>'qty')::numeric
            where id = (v_item->>'productId')::uuid;
          end if;
        end loop;
      else
        update products
        set stock = stock + (v_item->>'qty')::numeric
        where id = (v_item->>'productId')::uuid;
      end if;
    end loop;
  end if;

  insert into void_logs (store_id, sale_id, receipt_no, total, reason, voided_by)
  values (v_sale.store_id, v_sale.id, v_sale.receipt_no, v_sale.total, p_reason, p_voided_by);

  select * into v_sale from sales where id = p_sale_id;
  return v_sale;
end;
$$;
