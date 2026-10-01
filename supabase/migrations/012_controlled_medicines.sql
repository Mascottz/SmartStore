-- ============================================================
-- Pharmacy Mode Phase 3: controlled medicines & pharmacist oversight
--
-- 1. products.is_controlled - the PCN-style flag for medicines that need a
--    controlled-substance register (opioid analgesics, sedatives, etc.).
--    Controlled medicines are also prescription-only in practice; is_rx and
--    is_controlled are kept separate so the register and the Rx gate can
--    evolve independently.
-- 2. sales.verified_by - the team member (a flagged pharmacist) who verified
--    the prescription check for a sale containing prescription-only or
--    controlled lines. SmartStore records who verified; the professional
--    judgment stays with them.
-- 3. store_members.is_pharmacist - marks which team members are licensed
--    pharmacists, so the POS can offer them as the verifying pharmacist and
--    the Team page can flag them.
--
-- The controlled register itself needs no table: it is a view over sales
-- (items carry isControlled + the FEFO batch allocation) joined to the
-- dispensing audit trail from 011 (which links receipts to patients).
-- ============================================================

alter table public.products
  add column if not exists is_controlled boolean not null default false;

alter table public.sales
  add column if not exists verified_by text not null default '';

alter table public.store_members
  add column if not exists is_pharmacist boolean not null default false;

-- ============================================================ RPC: create_pharmacy_product (+ is_controlled)

drop function if exists public.create_pharmacy_product(
  uuid, text, text, text, numeric, numeric, text, text, text, text, boolean, jsonb
);

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
  p_batch jsonb default null,
  p_is_controlled boolean default false
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
    generic_name, strength, dosage_form, pack_size, is_rx, is_controlled
  ) values (
    p_store_id, p_name, coalesce(nullif(btrim(p_sku), ''), ''),
    coalesce(nullif(btrim(p_category), ''), 'General'),
    coalesce(p_cost_price, 0), coalesce(p_sale_price, 0), 0, null,
    coalesce(p_generic_name, ''), coalesce(p_strength, ''),
    coalesce(p_dosage_form, ''), coalesce(p_pack_size, ''),
    coalesce(p_is_rx, false), coalesce(p_is_controlled, false)
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
      left(coalesce(p_batch->>'supplier', ''), 120)
    );
  end if;

  return v_product;
end;
$$;

grant execute on function public.create_pharmacy_product to authenticated;

-- ============================================================ RPC: create_sale (+ verified_by)

-- Recreated from 010 with one addition: p_verified_by is stored on the sale
-- so the controlled register (and receipts) can show which pharmacist
-- verified the dispensing.
drop function if exists public.create_sale(
  uuid, jsonb, text, text, text, boolean, numeric, text
);

create or replace function public.create_sale(
  p_store_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_receipt_no text,
  p_cashier_email text default '',
  p_track_stock boolean default true,
  p_amount_paid numeric default null,
  p_customer_name text default '',
  p_verified_by text default ''
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

  insert into sales (store_id, receipt_no, payment_method, cashier_email, status, items, total, amount_paid, customer_name, verified_by)
  values (
    p_store_id, p_receipt_no, p_payment_method, p_cashier_email, 'completed', v_items, v_total, v_paid,
    case when p_payment_method in ('Partial', 'Credit') then left(btrim(p_customer_name), 100) else '' end,
    left(btrim(coalesce(p_verified_by, '')), 200)
  )
  returning * into v_sale;

  return v_sale;
end;
$$;

grant execute on function public.create_sale to authenticated;
