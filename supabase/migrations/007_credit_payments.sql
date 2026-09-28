-- SmartStore NG: Partial payments & credit (the Credit Book)
--
-- Adds two payment methods alongside Cash / Transfer / POS/Card:
--   Partial: customer pays part of the bill now and owes the rest;
--   Credit:  customer takes the goods and pays nothing yet.
-- Both track who owes the money (sales.customer_name) and how much has been
-- handed over so far (sales.amount_paid), so the outstanding balance is
-- always `total - amount_paid`. Every repayment a customer makes later is
-- appended to the credit_payments ledger by the record_credit_payment RPC,
-- which also moves the sale's amount_paid in the same transaction.
--
-- Run after 001 through 006. Fully idempotent: the statements use
-- `add column if not exists`, `create ... if not exists`,
-- `drop policy if exists` / `create policy` and `create or replace function`,
-- so the file can be re-run as often as needed.

-- ------------------------------------------------------------ sales columns
alter table public.sales
  add column if not exists amount_paid numeric not null default 0;
alter table public.sales
  add column if not exists customer_name text not null default '';

-- Every sale that predates this migration was settled at the till.
update public.sales set amount_paid = total where amount_paid = 0;

-- ------------------------------------------------------------ credit_payments
create table if not exists public.credit_payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  receipt_no text not null default '',
  customer_name text not null default '',
  amount numeric not null check (amount > 0),
  method text not null default 'Cash',
  note text not null default '',
  received_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_creditpayments_store
  on public.credit_payments(store_id, created_at desc);
create index if not exists idx_creditpayments_sale
  on public.credit_payments(sale_id);

alter table public.credit_payments enable row level security;

-- Members read their store's ledger; writes only via the RPCs below,
-- mirroring how sales & void logs are handled.
drop policy if exists "members read credit payments" on public.credit_payments;
create policy "members read credit payments" on public.credit_payments
  for select using (store_id = public.my_store_id());

-- ------------------------------------------------------------ RPC: create_sale
-- Extended with p_amount_paid / p_customer_name. Dropped first because adding
-- parameters with defaults can't be done via `create or replace` without
-- changing the signature; all callers pass the original six arguments by
-- name, so the replacement stays compatible.
drop function if exists public.create_sale(uuid, jsonb, text, text, text, boolean);

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
  v_total numeric := 0;
  v_paid numeric;
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
    p_store_id, p_receipt_no, p_payment_method, p_cashier_email, 'completed', p_items, v_total, v_paid,
    case when p_payment_method in ('Partial', 'Credit') then left(btrim(p_customer_name), 100) else '' end
  )
  returning * into v_sale;

  return v_sale;
end;
$$;

-- ------------------------------------------------------------ RPC: record a repayment
-- Collects money against an open debt. Any staff member can collect; the
-- ledger row records who received it. Runs as one transaction: the ledger
-- insert and the sale's amount_paid update always move together.
create or replace function public.record_credit_payment(
  p_sale_id uuid,
  p_amount numeric,
  p_method text default 'Cash',
  p_note text default '',
  p_received_by text default ''
) returns public.credit_payments
language plpgsql security definer set search_path = public as $$
declare
  v_sale public.sales;
  v_balance numeric;
  v_payment public.credit_payments;
begin
  select * into v_sale from sales where id = p_sale_id for update;
  if not found then raise exception 'Sale not found'; end if;
  if v_sale.store_id is distinct from public.my_store_id() then
    raise exception 'Not a member of this store';
  end if;
  if v_sale.status = 'voided' then raise exception 'This sale was voided.'; end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a valid payment amount.';
  end if;

  v_balance := v_sale.total - v_sale.amount_paid;
  if v_balance <= 0 then raise exception 'This debt is already settled.'; end if;
  if p_amount > v_balance then
    raise exception 'Payment is more than the outstanding balance.';
  end if;

  if p_method not in ('Cash', 'Transfer', 'POS/Card') then
    p_method := 'Cash';
  end if;

  insert into credit_payments (store_id, sale_id, receipt_no, customer_name, amount, method, note, received_by)
  values (
    v_sale.store_id, v_sale.id, v_sale.receipt_no, v_sale.customer_name,
    p_amount, p_method, left(coalesce(p_note, ''), 500), left(coalesce(p_received_by, ''), 200)
  )
  returning * into v_payment;

  update sales set amount_paid = amount_paid + p_amount where id = v_sale.id;

  return v_payment;
end;
$$;

-- ------------------------------------------------------------ RPC: delete a repayment
-- Mistake correction for managers and above: the record is removed and its
-- amount returns to the sale's outstanding balance.
create or replace function public.delete_credit_payment(p_payment_id uuid)
returns public.credit_payments
language plpgsql security definer set search_path = public as $$
declare
  v_payment public.credit_payments;
begin
  select * into v_payment from credit_payments where id = p_payment_id;
  if not found then raise exception 'Payment record not found'; end if;
  if v_payment.store_id is distinct from public.my_store_id() then
    raise exception 'Not a member of this store';
  end if;
  if public.my_role() not in ('owner','admin','manager') then
    raise exception 'Only managers and above can delete repayment records';
  end if;

  update sales
  set amount_paid = greatest(0, amount_paid - v_payment.amount)
  where id = v_payment.sale_id;

  delete from credit_payments where id = p_payment_id;

  return v_payment;
end;
$$;
