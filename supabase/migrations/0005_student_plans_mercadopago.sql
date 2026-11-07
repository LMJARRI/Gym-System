-- Self-service plan selection by students + Mercado Pago payments confirmed by webhook.

------------------------------------------------------------------------------
-- Schema changes
------------------------------------------------------------------------------
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments
  add constraint payments_method_check check (method in ('transfer', 'cash', 'other', 'mercadopago')),
  -- 'checkout' = Mercado Pago payment started but not confirmed yet. It is NOT reviewable by the owner and never counts as income.
  add constraint payments_status_check check (status in ('checkout', 'pending', 'approved', 'rejected', 'void'));

alter table public.payments
  add column if not exists mp_preference_id text,
  add column if not exists mp_init_point text,
  add column if not exists mp_payment_id text;
create unique index if not exists payments_mp_payment_unique on public.payments (mp_payment_id) where mp_payment_id is not null;

alter table public.membership_periods drop constraint if exists membership_periods_kind_check;
alter table public.membership_periods add constraint membership_periods_kind_check check (kind in ('assign', 'renew', 'self'));

------------------------------------------------------------------------------
-- apply_payment: a plan the student picked by themselves starts counting from the day it is fully paid
-- (not from the day it was picked). Plans assigned or renewed by the owner keep the previous behaviour.
------------------------------------------------------------------------------
create or replace function public.apply_payment(p_payment uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_p public.payments;
  v_m public.memberships;
  v_plan public.plans;
  v_applied numeric(12, 2) := 0;
  v_new_balance numeric(12, 2);
  v_self boolean;
  v_start date;
  v_end date;
begin
  select * into v_p from public.payments where id = p_payment for update;
  if v_p.membership_id is not null then
    select * into v_m from public.memberships where id = v_p.membership_id for update;
    v_applied := least(v_p.amount, v_m.balance_due);
    v_new_balance := v_m.balance_due - v_applied;

    select (kind = 'self') into v_self from public.membership_periods
      where membership_id = v_m.id order by created_at desc limit 1;

    if v_new_balance = 0 and v_m.status = 'pending_payment' and coalesce(v_self, false) then
      select * into v_plan from public.plans where id = v_m.plan_id;
      v_start := public.gym_local_date(v_m.gym_id);
      v_end := case when v_plan.id is not null
        then public.plan_end_date(v_start, v_plan.duration_count, v_plan.duration_unit) else v_m.ends_on end;
      update public.memberships set balance_due = 0, status = 'active', starts_on = v_start, ends_on = v_end, updated_at = now()
      where id = v_m.id;
      update public.membership_periods set starts_on = v_start, ends_on = v_end
      where id = (select id from public.membership_periods where membership_id = v_m.id order by created_at desc limit 1);
    else
      update public.memberships set
        balance_due = v_new_balance,
        status = case when v_new_balance = 0 and v_m.status = 'pending_payment'
          then 'active'::public.membership_status else v_m.status end,
        updated_at = now()
      where id = v_m.id;
    end if;
  end if;
  update public.payments set applied_amount = v_applied where id = v_p.id;
end;
$$;

------------------------------------------------------------------------------
-- Student picks one of the gym's active plans
------------------------------------------------------------------------------
create or replace function public.student_select_plan(p_plan uuid, p_request_id uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_me public.profiles;
  v_plan public.plans;
  v_m public.memberships;
  v_today date;
  v_end date;
  v_membership uuid;
  v_existing uuid;
begin
  select * into v_me from public.profiles where id = v_uid;
  if v_me.id is null or v_me.gym_id is null or v_me.role <> 'student' or v_me.account_status <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'missing_request_id'; end if;
  perform pg_advisory_xact_lock(hashtextextended('select_plan:' || v_uid::text, 0));
  select membership_id into v_existing from public.membership_periods where created_by = v_uid and request_id = p_request_id;
  if v_existing is not null then return v_existing; end if;

  select * into v_plan from public.plans where id = p_plan and gym_id = v_me.gym_id and status = 'active';
  if v_plan.id is null then raise exception 'plan_not_found'; end if;

  v_today := public.gym_local_date(v_me.gym_id);
  select * into v_m from public.memberships where student_id = v_uid and gym_id = v_me.gym_id for update;
  if v_m.id is not null then
    if v_m.status = 'suspended' then raise exception 'membership_suspended'; end if;
    if v_m.status = 'active' and v_m.ends_on >= v_today then raise exception 'membership_active'; end if;
    -- Never erase a debt or a partial payment by replacing the plan.
    if v_m.balance_due > 0 and v_m.balance_due <> v_m.agreed_price then raise exception 'outstanding_balance'; end if;
    if exists (select 1 from public.payments where membership_id = v_m.id and status = 'pending') then raise exception 'payment_in_review'; end if;
    update public.payments set status = 'void', review_notes = 'Plan cambiado por el alumno'
    where membership_id = v_m.id and status = 'checkout';
  end if;

  v_end := public.plan_end_date(v_today, v_plan.duration_count, v_plan.duration_unit);
  insert into public.memberships (gym_id, student_id, plan_id, plan_name, status, starts_on, ends_on, agreed_price, balance_due, notes, updated_at)
  values (v_me.gym_id, v_uid, v_plan.id, v_plan.name,
    case when v_plan.price = 0 then 'active'::public.membership_status else 'pending_payment'::public.membership_status end,
    v_today, v_end, v_plan.price, v_plan.price, null, now())
  on conflict (student_id) do update set
    plan_id = excluded.plan_id, plan_name = excluded.plan_name, status = excluded.status,
    starts_on = excluded.starts_on, ends_on = excluded.ends_on, agreed_price = excluded.agreed_price,
    balance_due = excluded.balance_due, notes = null, updated_at = now()
  returning id into v_membership;

  insert into public.membership_periods (gym_id, membership_id, student_id, plan_id, plan_name, kind, starts_on, ends_on, agreed_price, created_by, request_id)
  values (v_me.gym_id, v_membership, v_uid, v_plan.id, v_plan.name, 'self', v_today, v_end, v_plan.price, v_uid, p_request_id);

  perform public.notify(v_me.gym_id, v_uid, 'plan_selected', 'Elegiste el plan ' || v_plan.name,
    case when v_plan.price = 0 then 'Tu membresía ya está activa.' else 'Completá el pago para activarla.' end,
    '/app/alumno/pagos', 'plan_sel:' || p_request_id);
  perform public.notify_owners(v_me.gym_id, 'plan_selected', 'Un alumno eligió un plan',
    coalesce(nullif(v_me.full_name, ''), 'Un alumno') || ' eligió ' || v_plan.name || '.',
    '/app/alumnos/' || v_uid, 'plan_sel:' || p_request_id);
  return v_membership;
end;
$$;

------------------------------------------------------------------------------
-- Mercado Pago: the student starts a checkout for the balance of their membership.
-- The amount is always read from the database, never from the browser.
------------------------------------------------------------------------------
create or replace function public.student_prepare_mp_payment(p_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_me public.profiles;
  v_m public.memberships;
  v_p public.payments;
  v_currency text;
begin
  select * into v_me from public.profiles where id = v_uid;
  if v_me.id is null or v_me.gym_id is null or v_me.role <> 'student' or v_me.account_status <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'missing_request_id'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mp:' || v_uid::text, 0));

  select * into v_m from public.memberships where student_id = v_uid and gym_id = v_me.gym_id for update;
  if v_m.id is null then raise exception 'membership_not_found'; end if;
  if v_m.balance_due <= 0 then raise exception 'nothing_to_pay'; end if;
  select currency into v_currency from public.gyms where id = v_me.gym_id;

  select * into v_p from public.payments
  where membership_id = v_m.id and method = 'mercadopago' and status = 'checkout' and amount = v_m.balance_due
  order by submitted_at desc limit 1;

  if v_p.id is null then
    update public.payments set status = 'void', review_notes = 'Reemplazado por un nuevo intento'
    where membership_id = v_m.id and method = 'mercadopago' and status = 'checkout';
    insert into public.payments (gym_id, student_id, membership_id, amount, method, declared_paid_on, status, created_by, request_id)
    values (v_me.gym_id, v_uid, v_m.id, v_m.balance_due, 'mercadopago', public.gym_local_date(v_me.gym_id), 'checkout', v_uid, p_request_id)
    on conflict (created_by, request_id) do nothing
    returning * into v_p;
    if v_p.id is null then
      select * into v_p from public.payments where created_by = v_uid and request_id = p_request_id;
    end if;
  end if;

  return jsonb_build_object(
    'payment_id', v_p.id, 'amount', v_p.amount, 'currency', v_currency,
    'plan_name', v_m.plan_name, 'init_point', v_p.mp_init_point, 'gym_id', v_me.gym_id);
end;
$$;

------------------------------------------------------------------------------
-- Mercado Pago webhook outcome. Service role only: the API route has already fetched the payment
-- from Mercado Pago with the gym's access token, so p_status/p_amount are authoritative.
------------------------------------------------------------------------------
create or replace function public.system_apply_mp_payment(p_payment uuid, p_mp_payment_id text, p_status text, p_amount numeric)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_p public.payments;
  v_m public.memberships;
  v_currency text;
begin
  select * into v_p from public.payments where id = p_payment and method = 'mercadopago' for update;
  if v_p.id is null then raise exception 'not_found'; end if;
  select currency into v_currency from public.gyms where id = v_p.gym_id;

  if p_status = 'approved' then
    if v_p.status = 'approved' then
      if v_p.mp_payment_id is distinct from p_mp_payment_id then
        perform public.notify_owners(v_p.gym_id, 'payment_duplicate', 'Pago duplicado en Mercado Pago',
          'Se recibió un segundo pago (MP ' || p_mp_payment_id || ') por una operación ya acreditada. Revisalo y reembolsalo desde Mercado Pago.',
          '/app/pagos?estado=approved', 'mp_dup:' || p_mp_payment_id);
        return 'duplicate';
      end if;
      return 'already_approved';
    end if;
    if v_p.status <> 'checkout' then
      perform public.notify_owners(v_p.gym_id, 'payment_orphan', 'Pago de Mercado Pago sin acreditar',
        'Llegó un pago aprobado (MP ' || p_mp_payment_id || ', ' || v_currency || ' ' || p_amount || ') para una operación que ya no estaba vigente. Acreditalo a mano o reembolsalo.',
        '/app/pagos', 'mp_orphan:' || p_mp_payment_id);
      return 'orphan';
    end if;
    if p_amount <> v_p.amount then raise exception 'amount_mismatch'; end if;

    update public.payments set
      status = 'approved', mp_payment_id = p_mp_payment_id, verified_at = now(),
      review_notes = 'Aprobado automáticamente por Mercado Pago'
    where id = v_p.id;
    perform public.apply_payment(v_p.id);

    perform public.notify(v_p.gym_id, v_p.student_id, 'payment_approved', 'Pago aprobado',
      'Tu pago de ' || v_currency || ' ' || v_p.amount || ' fue confirmado.', '/app/alumno/pagos', 'pay_rev:' || v_p.id);
    perform public.notify_owners(v_p.gym_id, 'payment_received', 'Pago recibido por Mercado Pago',
      v_currency || ' ' || v_p.amount || ' acreditados automáticamente.', '/app/pagos?estado=approved', 'pay_rev:' || v_p.id);
    return 'approved';
  end if;

  if p_status in ('refunded', 'charged_back', 'cancelled') and v_p.status = 'approved' and v_p.mp_payment_id = p_mp_payment_id then
    update public.payments set status = 'void', review_notes = 'Mercado Pago: ' || p_status where id = v_p.id;
    if v_p.membership_id is not null and v_p.applied_amount > 0 then
      select * into v_m from public.memberships where id = v_p.membership_id for update;
      update public.memberships set
        balance_due = v_m.balance_due + v_p.applied_amount,
        status = case when v_m.status = 'active' then 'pending_payment'::public.membership_status else v_m.status end,
        updated_at = now()
      where id = v_m.id;
    end if;
    perform public.notify_owners(v_p.gym_id, 'payment_reversed', 'Pago revertido en Mercado Pago',
      'Un pago de ' || v_currency || ' ' || v_p.amount || ' fue ' || p_status || '. La membresía volvió a pendiente.',
      '/app/pagos?estado=void', 'mp_rev:' || p_mp_payment_id || ':' || p_status);
    return 'voided';
  end if;
  return 'ignored';
end;
$$;

------------------------------------------------------------------------------
-- Grants
------------------------------------------------------------------------------
revoke execute on function public.apply_payment(uuid) from public, anon, authenticated;
revoke execute on function public.student_select_plan(uuid, uuid) from public, anon;
revoke execute on function public.student_prepare_mp_payment(uuid) from public, anon;
grant execute on function public.student_select_plan(uuid, uuid) to authenticated;
grant execute on function public.student_prepare_mp_payment(uuid) to authenticated;
revoke execute on function public.system_apply_mp_payment(uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.system_apply_mp_payment(uuid, text, text, numeric) to service_role;

-- The server (service role) stores the preference created in Mercado Pago.
grant update (mp_preference_id, mp_init_point) on public.payments to service_role;
