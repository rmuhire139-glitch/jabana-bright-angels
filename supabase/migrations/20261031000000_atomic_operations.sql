create or replace function public.record_fee_payment(
  p_fee_id text,
  p_payment_id text,
  p_amount numeric,
  p_reference text,
  p_paid_at timestamptz
)
returns setof public.student_fees
language plpgsql
set search_path = public
as $$
declare
  current_fee public.student_fees%rowtype;
begin
  select * into current_fee
  from public.student_fees
  where "_id" = p_fee_id
  for update;

  if not found or (
    coalesce((
      select sum((payment.value ->> 'amount')::numeric)
      from jsonb_array_elements(current_fee.payments) as payment(value)
    ), 0) + p_amount > current_fee."amountDue"
  ) then
    return;
  end if;

  update public.student_fees
  set payments = payments || jsonb_build_array(jsonb_build_object(
        '_id', p_payment_id,
        'amount', p_amount,
        'reference', p_reference,
        'paidAt', p_paid_at
      )),
      "updatedAt" = p_paid_at
  where "_id" = p_fee_id
  returning * into current_fee;

  return next current_fee;
end;
$$;

create or replace function public.record_stock_movement(
  p_item_id text,
  p_movement_id text,
  p_type text,
  p_quantity numeric,
  p_note text,
  p_at timestamptz
)
returns setof public.stock_items
language plpgsql
set search_path = public
as $$
declare
  current_item public.stock_items%rowtype;
  updated_quantity numeric;
begin
  select * into current_item
  from public.stock_items
  where "_id" = p_item_id
  for update;

  if not found then
    return;
  end if;

  updated_quantity := current_item.quantity +
    case when p_type = 'restock' then p_quantity else -p_quantity end;
  if updated_quantity < 0 then
    return;
  end if;

  update public.stock_items
  set quantity = updated_quantity,
      movements = (
        select coalesce(jsonb_agg(movement order by ordinal), '[]'::jsonb)
        from (
          select movement, ordinal
          from jsonb_array_elements(stock_items.movements || jsonb_build_array(jsonb_build_object(
            '_id', p_movement_id,
            'type', p_type,
            'quantity', p_quantity,
            'note', p_note,
            'at', p_at
          ))) with ordinality as entries(movement, ordinal)
          order by ordinal desc
          limit 100
        ) recent
      ),
      "updatedAt" = p_at
  where "_id" = p_item_id
  returning * into current_item;

  return next current_item;
end;
$$;

create or replace function public.update_task_state(
  p_user_id text,
  p_task_key text,
  p_completed boolean,
  p_history_id text,
  p_at timestamptz
)
returns setof public.task_states
language plpgsql
set search_path = public
as $$
declare
  current_state public.task_states%rowtype;
  history_entry jsonb;
begin
  history_entry := jsonb_build_object(
    '_id', p_history_id,
    'completed', p_completed,
    'at', p_at
  );

  insert into public.task_states (
    "_id", "userId", "taskKey", "completedAt", history, "createdAt", "updatedAt"
  ) values (
    substring(md5(random()::text || clock_timestamp()::text) from 1 for 24),
    p_user_id,
    p_task_key,
    case when p_completed then p_at else null end,
    jsonb_build_array(history_entry),
    p_at,
    p_at
  )
  on conflict ("userId", "taskKey") do update
  set "completedAt" = case when p_completed then p_at else null end,
      history = (
        select coalesce(jsonb_agg(entry order by ordinal), '[]'::jsonb)
        from (
          select entry, ordinal
          from jsonb_array_elements(task_states.history || jsonb_build_array(history_entry))
            with ordinality as entries(entry, ordinal)
          order by ordinal desc
          limit 20
        ) recent
      ),
      "updatedAt" = p_at
  returning * into current_state;

  return next current_state;
end;
$$;

revoke all on function public.record_fee_payment(text, text, numeric, text, timestamptz) from public, anon, authenticated;
revoke all on function public.record_stock_movement(text, text, text, numeric, text, timestamptz) from public, anon, authenticated;
revoke all on function public.update_task_state(text, text, boolean, text, timestamptz) from public, anon, authenticated;

grant execute on function public.record_fee_payment(text, text, numeric, text, timestamptz) to service_role;
grant execute on function public.record_stock_movement(text, text, text, numeric, text, timestamptz) to service_role;
grant execute on function public.update_task_state(text, text, boolean, text, timestamptz) to service_role;
