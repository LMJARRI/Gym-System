-- Phases 2–12: settings, people, plans, membership periods, payments + private receipts,
-- access exceptions, attendance corrections, routines/exercises with versions, workouts,
-- body measurements, notifications (idempotent), scheduled notices and audit log.

------------------------------------------------------------------------------
-- Gym settings
------------------------------------------------------------------------------
alter table public.gyms
  add column if not exists address text check (char_length(address) <= 200),
  add column if not exists phone text check (char_length(phone) <= 40),
  add column if not exists contact_email text check (char_length(contact_email) <= 254),
  add column if not exists logo_url text check (logo_url is null or logo_url ~ '^https://'),
  add column if not exists currency text not null default 'ARS' check (currency ~ '^[A-Z]{3}$'),
  add column if not exists transfer_instructions text check (char_length(transfer_instructions) <= 1000),
  add column if not exists welcome_message text check (char_length(welcome_message) <= 500),
  add column if not exists opening_hours text check (char_length(opening_hours) <= 300),
  add column if not exists day_cutoff_hour integer not null default 0 check (day_cutoff_hour between 0 and 6),
  add column if not exists expiry_notice_days integer not null default 5 check (expiry_notice_days between 0 and 30),
  add column if not exists renewal_policy text not null default 'from_end' check (renewal_policy in ('from_end', 'from_today')),
  add column if not exists teachers_can_scan boolean not null default true;

-- Operational day: gym-local calendar day, shifted back by day_cutoff_hour (e.g. 2 → a 01:30 entry counts for the previous day).
create or replace function public.gym_local_date(p_gym uuid, p_at timestamptz default now()) returns date
language sql stable security definer set search_path = '' as $$
  select ((p_at at time zone g.timezone) - make_interval(hours => g.day_cutoff_hour))::date
  from public.gyms g where g.id = p_gym
$$;

------------------------------------------------------------------------------
-- People
------------------------------------------------------------------------------
alter table public.profiles
  add column if not exists email text check (char_length(email) <= 254),
  add column if not exists phone text check (char_length(phone) <= 40),
  add column if not exists birth_date date check (birth_date is null or birth_date between '1900-01-01' and '2100-01-01'),
  add column if not exists account_status text not null default 'active' check (account_status in ('active', 'inactive')),
  add column if not exists joined_at timestamptz not null default now();

update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;
grant update (phone, birth_date) on public.profiles to authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.can_manage_student(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles s
    where s.id = p_student and s.role = 'student' and s.gym_id = public.current_gym_id()
  ) and (public.current_app_role() = 'owner' or public.is_teacher_of(p_student))
$$;

------------------------------------------------------------------------------
-- Audit log (append-only)
------------------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  gym_id uuid,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_gym_time_idx on public.audit_log (gym_id, created_at desc);
alter table public.audit_log enable row level security;
revoke insert, update, delete on public.audit_log from anon, authenticated;
drop policy if exists audit_log_owner_select on public.audit_log;
create policy audit_log_owner_select on public.audit_log for select to authenticated
  using (public.is_gym_owner(gym_id));

create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  if tg_op = 'UPDATE' and v_old = v_new then return new; end if;
  insert into public.audit_log (gym_id, actor_id, action, entity, entity_id, old_data, new_data)
  values (
    case when tg_table_name = 'gyms' then (v_row ->> 'id')::uuid else (v_row ->> 'gym_id')::uuid end,
    auth.uid(), lower(tg_op), tg_table_name,
    coalesce(v_row ->> 'id', concat_ws(':', v_row ->> 'teacher_id', v_row ->> 'student_id', v_row ->> 'local_date')),
    v_old, v_new
  );
  return coalesce(new, old);
end;
$$;

------------------------------------------------------------------------------
-- Plans and membership periods
------------------------------------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  price numeric(12, 2) not null check (price >= 0 and price <= 100000000),
  duration_count integer not null check (duration_count between 1 and 366),
  duration_unit text not null check (duration_unit in ('day', 'week', 'month')),
  status text not null default 'active' check (status in ('active', 'archived')),
  access_rules text check (char_length(access_rules) <= 300),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, name)
);
alter table public.plans enable row level security;
revoke delete on public.plans from anon, authenticated;
drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans for select to authenticated using (gym_id = public.current_gym_id());
drop policy if exists plans_owner_insert on public.plans;
create policy plans_owner_insert on public.plans for insert to authenticated with check (public.is_gym_owner(gym_id));
drop policy if exists plans_owner_update on public.plans;
create policy plans_owner_update on public.plans for update to authenticated
  using (public.is_gym_owner(gym_id)) with check (public.is_gym_owner(gym_id));

alter table public.memberships
  add column if not exists plan_id uuid references public.plans(id) on delete set null,
  add column if not exists agreed_price numeric(12, 2) not null default 0 check (agreed_price >= 0),
  add column if not exists balance_due numeric(12, 2) not null default 0 check (balance_due >= 0),
  add column if not exists renewal_count integer not null default 0,
  add column if not exists notes text check (char_length(notes) <= 500);

create table if not exists public.membership_periods (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  plan_name text not null,
  kind text not null check (kind in ('assign', 'renew')),
  starts_on date not null,
  ends_on date not null,
  agreed_price numeric(12, 2) not null,
  created_by uuid references public.profiles(id) on delete set null,
  request_id uuid,
  created_at timestamptz not null default now(),
  unique (created_by, request_id)
);
create index if not exists membership_periods_student_idx on public.membership_periods (student_id, created_at desc);
alter table public.membership_periods enable row level security;
revoke insert, update, delete on public.membership_periods from anon, authenticated;
drop policy if exists membership_periods_select on public.membership_periods;
create policy membership_periods_select on public.membership_periods for select to authenticated
  using (student_id = auth.uid() or public.is_gym_owner(gym_id));

create or replace function public.plan_end_date(p_start date, p_count integer, p_unit text) returns date
language sql immutable set search_path = '' as $$
  select (p_start + case p_unit
    when 'day' then make_interval(days => p_count)
    when 'week' then make_interval(weeks => p_count)
    else make_interval(months => p_count) end)::date - 1
$$;

------------------------------------------------------------------------------
-- Notifications (in-app; dedupe_key makes scheduled/re-run notices idempotent)
------------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text check (link is null or link ~ '^/'),
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, dedupe_key)
);
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
alter table public.notifications enable row level security;
revoke insert, delete on public.notifications from anon, authenticated;
revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated using (recipient_id = auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create or replace function public.notify(
  p_gym uuid, p_recipient uuid, p_type text, p_title text, p_body text, p_link text, p_dedupe text
) returns void
language sql volatile security definer set search_path = '' as $$
  insert into public.notifications (gym_id, recipient_id, type, title, body, link, dedupe_key)
  values (p_gym, p_recipient, p_type, p_title, p_body, p_link, p_dedupe)
  on conflict (recipient_id, dedupe_key) do nothing
$$;

create or replace function public.notify_owners(
  p_gym uuid, p_type text, p_title text, p_body text, p_link text, p_dedupe text
) returns void
language sql volatile security definer set search_path = '' as $$
  insert into public.notifications (gym_id, recipient_id, type, title, body, link, dedupe_key)
  select p_gym, p.id, p_type, p_title, p_body, p_link, p_dedupe
  from public.profiles p where p.gym_id = p_gym and p.role = 'owner'
  on conflict (recipient_id, dedupe_key) do nothing
$$;

------------------------------------------------------------------------------
-- Membership RPCs
------------------------------------------------------------------------------
create or replace function public.owner_assign_plan(
  p_student uuid, p_plan uuid, p_starts_on date, p_agreed_price numeric, p_notes text, p_request_id uuid
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_gym uuid := public.current_gym_id();
  v_plan public.plans;
  v_price numeric(12, 2);
  v_end date;
  v_membership uuid;
  v_existing uuid;
begin
  if not public.is_gym_owner(v_gym) then raise exception 'forbidden' using errcode = '42501'; end if;
  select membership_id into v_existing from public.membership_periods where created_by = auth.uid() and request_id = p_request_id;
  if v_existing is not null then return v_existing; end if;
  if not exists (select 1 from public.profiles where id = p_student and gym_id = v_gym and role = 'student') then
    raise exception 'student_not_found';
  end if;
  select * into v_plan from public.plans where id = p_plan and gym_id = v_gym and status = 'active';
  if v_plan.id is null then raise exception 'plan_not_found'; end if;
  if p_starts_on is null then raise exception 'invalid_start'; end if;
  v_price := coalesce(p_agreed_price, v_plan.price);
  if v_price < 0 then raise exception 'invalid_price'; end if;
  v_end := public.plan_end_date(p_starts_on, v_plan.duration_count, v_plan.duration_unit);

  insert into public.memberships (gym_id, student_id, plan_id, plan_name, status, starts_on, ends_on, agreed_price, balance_due, notes, updated_at)
  values (v_gym, p_student, v_plan.id, v_plan.name,
    case when v_price = 0 then 'active'::public.membership_status else 'pending_payment'::public.membership_status end,
    p_starts_on, v_end, v_price, v_price, nullif(trim(p_notes), ''), now())
  on conflict (student_id) do update set
    plan_id = excluded.plan_id, plan_name = excluded.plan_name, status = excluded.status,
    starts_on = excluded.starts_on, ends_on = excluded.ends_on, agreed_price = excluded.agreed_price,
    balance_due = excluded.balance_due, notes = excluded.notes, updated_at = now()
  returning id into v_membership;

  insert into public.membership_periods (gym_id, membership_id, student_id, plan_id, plan_name, kind, starts_on, ends_on, agreed_price, created_by, request_id)
  values (v_gym, v_membership, p_student, v_plan.id, v_plan.name, 'assign', p_starts_on, v_end, v_price, auth.uid(), p_request_id);

  perform public.notify(v_gym, p_student, 'membership_assigned', 'Nueva membresía: ' || v_plan.name,
    'Vigente hasta ' || to_char(v_end, 'DD/MM/YYYY') || '.', '/app/alumno/membresia', 'assign:' || p_request_id);
  return v_membership;
end;
$$;

-- p_mode: 'from_end' (day after current end), 'from_today', or 'custom' (p_starts_on). Previous debt carries over.
create or replace function public.owner_renew_membership(
  p_student uuid, p_mode text, p_starts_on date, p_request_id uuid
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_gym uuid := public.current_gym_id();
  v_m public.memberships;
  v_plan public.plans;
  v_start date;
  v_end date;
  v_existing uuid;
begin
  if not public.is_gym_owner(v_gym) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_request_id is null then raise exception 'missing_request_id'; end if;
  perform pg_advisory_xact_lock(hashtextextended('renew:' || p_student::text, 0));
  select membership_id into v_existing from public.membership_periods where created_by = auth.uid() and request_id = p_request_id;
  if v_existing is not null then return v_existing; end if;

  select * into v_m from public.memberships where student_id = p_student and gym_id = v_gym for update;
  if v_m.id is null then raise exception 'membership_not_found'; end if;
  select * into v_plan from public.plans where id = v_m.plan_id and gym_id = v_gym;
  if v_plan.id is null then raise exception 'plan_required'; end if;

  v_start := case p_mode
    when 'from_end' then v_m.ends_on + 1
    when 'from_today' then public.gym_local_date(v_gym)
    when 'custom' then p_starts_on
  end;
  if v_start is null then raise exception 'invalid_mode'; end if;
  v_end := public.plan_end_date(v_start, v_plan.duration_count, v_plan.duration_unit);

  update public.memberships set
    starts_on = v_start, ends_on = v_end,
    balance_due = v_m.balance_due + v_m.agreed_price,
    status = case when v_m.balance_due + v_m.agreed_price = 0 then 'active'::public.membership_status else 'pending_payment'::public.membership_status end,
    renewal_count = v_m.renewal_count + 1, updated_at = now()
  where id = v_m.id;

  insert into public.membership_periods (gym_id, membership_id, student_id, plan_id, plan_name, kind, starts_on, ends_on, agreed_price, created_by, request_id)
  values (v_gym, v_m.id, p_student, v_plan.id, v_plan.name, 'renew', v_start, v_end, v_m.agreed_price, auth.uid(), p_request_id);

  perform public.notify(v_gym, p_student, 'membership_renewed', 'Membresía renovada',
    'Nuevo período: ' || to_char(v_start, 'DD/MM/YYYY') || ' al ' || to_char(v_end, 'DD/MM/YYYY') || '.',
    '/app/alumno/membresia', 'renew:' || p_request_id);
  return v_m.id;
end;
$$;

------------------------------------------------------------------------------
-- Access exceptions (explicit, time-boxed, audited)
------------------------------------------------------------------------------
create table if not exists public.access_overrides (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  valid_from date not null,
  valid_until date not null,
  reason text not null check (char_length(reason) between 3 and 300),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (valid_until >= valid_from and valid_until - valid_from <= 60)
);
create index if not exists access_overrides_student_idx on public.access_overrides (student_id, valid_until desc);
alter table public.access_overrides enable row level security;
revoke delete on public.access_overrides from anon, authenticated;
drop policy if exists access_overrides_select on public.access_overrides;
create policy access_overrides_select on public.access_overrides for select to authenticated
  using (student_id = auth.uid() or public.is_gym_owner(gym_id));
drop policy if exists access_overrides_owner_insert on public.access_overrides;
create policy access_overrides_owner_insert on public.access_overrides for insert to authenticated
  with check (
    public.is_gym_owner(gym_id) and created_by = auth.uid() and revoked_at is null
    and exists (select 1 from public.profiles p where p.id = student_id and p.gym_id = access_overrides.gym_id and p.role = 'student')
  );
drop policy if exists access_overrides_owner_update on public.access_overrides;
create policy access_overrides_owner_update on public.access_overrides for update to authenticated
  using (public.is_gym_owner(gym_id)) with check (public.is_gym_owner(gym_id));
revoke update on public.access_overrides from authenticated;
grant update (revoked_at) on public.access_overrides to authenticated;

------------------------------------------------------------------------------
-- Attendance corrections
------------------------------------------------------------------------------
alter table public.attendance_days
  add column if not exists source text not null default 'qr' check (source in ('qr', 'manual')),
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text check (char_length(void_reason) <= 300),
  add column if not exists corrected_by uuid references public.profiles(id) on delete set null;

create or replace function public.owner_correct_attendance(p_student uuid, p_date date, p_action text, p_reason text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_gym uuid := public.current_gym_id(); v_now timestamptz := clock_timestamp();
begin
  if not public.is_gym_owner(v_gym) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  if not exists (select 1 from public.profiles where id = p_student and gym_id = v_gym and role = 'student') then
    raise exception 'student_not_found';
  end if;
  if p_date is null or p_date > public.gym_local_date(v_gym) then raise exception 'invalid_date'; end if;

  if p_action = 'add' then
    insert into public.attendance_days (gym_id, student_id, local_date, first_access_at, last_access_at, access_count, source, corrected_by, void_reason)
    values (v_gym, p_student, p_date, v_now, v_now, 1, 'manual', auth.uid(), trim(p_reason))
    on conflict (student_id, local_date) do update
      set voided_at = null, corrected_by = auth.uid(), void_reason = trim(p_reason)
      where public.attendance_days.voided_at is not null;
    if not found then raise exception 'already_present'; end if;
  elsif p_action = 'void' then
    update public.attendance_days set voided_at = v_now, void_reason = trim(p_reason), corrected_by = auth.uid()
    where student_id = p_student and local_date = p_date and gym_id = v_gym and voided_at is null;
    if not found then raise exception 'not_found'; end if;
  else
    raise exception 'invalid_action';
  end if;
end;
$$;

------------------------------------------------------------------------------
-- QR validation v2: operational day, inactive accounts, scanner permissions, audited exceptions.
------------------------------------------------------------------------------
create or replace function public.access_event_payload(p_event uuid, p_replayed boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'event_id', e.id,
    'result', e.result,
    'reason', e.reason,
    'occurred_at', e.occurred_at,
    'local_date', e.local_date,
    'replayed', p_replayed,
    'first_access_at', a.first_access_at,
    'access_count', a.access_count,
    'student', case
      when e.reason in ('ok', 'override', 'no_membership', 'membership_not_started', 'membership_expired',
                        'membership_suspended', 'membership_pending', 'membership_cancelled', 'account_inactive') and s.id is not null
      then jsonb_build_object(
        'full_name', s.full_name,
        'avatar_url', s.avatar_url,
        'member_number', s.member_number,
        'membership_status', m.status,
        'membership_plan', m.plan_name,
        'membership_ends_on', m.ends_on
      )
      else null end
  )
  from public.access_events e
  left join public.profiles s on s.id = e.student_id
  left join public.memberships m on m.student_id = e.student_id and m.gym_id = e.gym_id
  left join public.attendance_days a on a.student_id = e.student_id and a.local_date = e.local_date and e.result = 'granted'
  where e.id = p_event
$$;

create or replace function public.validate_access_qr(p_token text, p_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_scanner public.profiles;
  v_gym public.gyms;
  v_tok public.qr_tokens;
  v_student public.profiles;
  v_m public.memberships;
  v_existing uuid;
  v_event uuid;
  v_now timestamptz;
  v_local date;
  v_reason text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select * into v_scanner from public.profiles where id = v_uid;
  if v_scanner.gym_id is null or v_scanner.role not in ('owner', 'staff', 'teacher') or v_scanner.account_status <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_gym from public.gyms where id = v_scanner.gym_id;
  if v_scanner.role = 'teacher' and not v_gym.teachers_can_scan then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'missing_request_id' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended('qr_req:' || v_uid::text || ':' || p_request_id::text, 0));
  select id into v_existing from public.access_events where scanned_by = v_uid and request_id = p_request_id;
  if v_existing is not null then
    return public.access_event_payload(v_existing, true);
  end if;

  if p_token is not null and char_length(p_token) between 20 and 100 then
    select * into v_tok from public.qr_tokens
    where token_hash = extensions.digest(p_token, 'sha256')
    for update;
  end if;

  v_now := clock_timestamp();
  v_local := public.gym_local_date(v_gym.id, v_now);

  if v_tok.id is null or v_tok.gym_id <> v_gym.id then
    v_reason := 'invalid';
    v_tok := null;
  elsif v_tok.used_at is not null then
    v_reason := 'used';
  elsif v_tok.revoked_at is not null then
    v_reason := 'revoked';
  elsif v_tok.expires_at <= v_now then
    v_reason := 'expired';
  end if;

  if v_reason is null then
    update public.qr_tokens set used_at = v_now, used_by = v_uid where id = v_tok.id;

    select * into v_student from public.profiles where id = v_tok.student_id;
    if v_student.gym_id is distinct from v_gym.id or v_student.role <> 'student' then
      v_reason := 'invalid';
    elsif v_scanner.role = 'teacher' and not public.is_teacher_of(v_student.id) then
      v_reason := 'out_of_scope';
    elsif v_student.account_status <> 'active' then
      v_reason := 'account_inactive';
    else
      select * into v_m from public.memberships where student_id = v_student.id and gym_id = v_gym.id;
      if v_m.id is null then
        v_reason := 'no_membership';
      elsif v_local < v_m.starts_on then
        v_reason := 'membership_not_started';
      elsif v_m.status = 'cancelled' then
        v_reason := 'membership_cancelled';
      elsif v_m.status = 'suspended' then
        v_reason := 'membership_suspended';
      elsif v_m.status = 'expired' then
        v_reason := 'membership_expired';
      elsif v_m.status = 'pending_payment' then
        if not v_gym.allow_pending_payment or v_local > v_m.ends_on + v_gym.pending_grace_days then
          v_reason := 'membership_pending';
        end if;
      elsif v_local > v_m.ends_on then
        v_reason := 'membership_expired';
      end if;

      if v_reason like 'membership_%' or v_reason = 'no_membership' then
        if exists (
          select 1 from public.access_overrides o
          where o.student_id = v_student.id and o.gym_id = v_gym.id and o.revoked_at is null
            and v_local between o.valid_from and o.valid_until
        ) then
          v_reason := 'override';
        end if;
      end if;
    end if;
  end if;

  insert into public.access_events
    (gym_id, student_id, qr_token_id, scanned_by, request_id, result, reason, occurred_at, local_date)
  values (
    v_gym.id, v_tok.student_id, v_tok.id, v_uid, p_request_id,
    case when v_reason is null or v_reason = 'override' then 'granted' else 'denied' end,
    coalesce(v_reason, 'ok'), v_now, v_local
  )
  returning id into v_event;

  if v_reason is null or v_reason = 'override' then
    insert into public.attendance_days (gym_id, student_id, local_date, first_access_at, last_access_at, access_count)
    values (v_gym.id, v_tok.student_id, v_local, v_now, v_now, 1)
    on conflict (student_id, local_date) do update
      set last_access_at = excluded.last_access_at,
          access_count = public.attendance_days.access_count + 1,
          voided_at = null;
  end if;

  return public.access_event_payload(v_event, false);
end;
$$;

create or replace function public.my_attendance_today() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'local_date', public.gym_local_date(g.id),
    'timezone', g.timezone,
    'present', a.student_id is not null and a.voided_at is null,
    'first_access_at', a.first_access_at,
    'last_access_at', a.last_access_at,
    'access_count', case when a.voided_at is null then coalesce(a.access_count, 0) else 0 end
  )
  from public.profiles p
  join public.gyms g on g.id = p.gym_id
  left join public.attendance_days a on a.student_id = p.id and a.local_date = public.gym_local_date(g.id)
  where p.id = auth.uid()
$$;

------------------------------------------------------------------------------
-- Payments and private receipts
------------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete restrict,
  membership_id uuid references public.memberships(id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0 and amount <= 100000000),
  method text not null check (method in ('transfer', 'cash', 'other')),
  method_detail text check (char_length(method_detail) <= 80),
  declared_paid_on date not null,
  submitted_at timestamptz not null default now(),
  receipt_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'void')),
  applied_amount numeric(12, 2) not null default 0 check (applied_amount >= 0),
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  review_notes text check (char_length(review_notes) <= 500),
  notes text check (char_length(notes) <= 500),
  created_by uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null,
  unique (created_by, request_id)
);
create unique index if not exists payments_receipt_unique on public.payments (receipt_path) where receipt_path is not null;
create index if not exists payments_gym_status_idx on public.payments (gym_id, status, submitted_at desc);
create index if not exists payments_student_idx on public.payments (student_id, submitted_at desc);
alter table public.payments enable row level security;
revoke insert, update, delete on public.payments from anon, authenticated;
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (student_id = auth.uid() or public.is_gym_owner(gym_id));

-- Applies an approved payment to the membership balance. Internal only.
create or replace function public.apply_payment(p_payment uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_p public.payments; v_m public.memberships; v_applied numeric(12, 2) := 0;
begin
  select * into v_p from public.payments where id = p_payment for update;
  if v_p.membership_id is not null then
    select * into v_m from public.memberships where id = v_p.membership_id for update;
    v_applied := least(v_p.amount, v_m.balance_due);
    update public.memberships set
      balance_due = v_m.balance_due - v_applied,
      status = case when v_m.balance_due - v_applied = 0 and v_m.status = 'pending_payment'
        then 'active'::public.membership_status else v_m.status end,
      updated_at = now()
    where id = v_m.id;
  end if;
  update public.payments set applied_amount = v_applied where id = v_p.id;
end;
$$;

create or replace function public.submit_payment(
  p_amount numeric, p_declared_paid_on date, p_receipt_path text, p_notes text, p_request_id uuid
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_me public.profiles;
  v_existing uuid;
  v_id uuid;
  v_membership uuid;
  v_currency text;
begin
  select * into v_me from public.profiles where id = v_uid;
  if v_me.gym_id is null or v_me.role <> 'student' or v_me.account_status <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'missing_request_id'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pay:' || v_uid::text, 0));
  select id into v_existing from public.payments where created_by = v_uid and request_id = p_request_id;
  if v_existing is not null then return v_existing; end if;

  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then raise exception 'invalid_amount'; end if;
  if p_declared_paid_on is null or p_declared_paid_on > public.gym_local_date(v_me.gym_id) + 1
     or p_declared_paid_on < public.gym_local_date(v_me.gym_id) - 120 then
    raise exception 'invalid_date';
  end if;
  if p_receipt_path is null or p_receipt_path not like v_me.gym_id::text || '/' || v_uid::text || '/%' then
    raise exception 'invalid_receipt';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'receipts' and name = p_receipt_path) then
    raise exception 'receipt_not_uploaded';
  end if;
  if exists (select 1 from public.payments where receipt_path = p_receipt_path) then
    raise exception 'duplicate_receipt';
  end if;
  if exists (
    select 1 from public.payments where student_id = v_uid and status = 'pending'
      and amount = p_amount and declared_paid_on = p_declared_paid_on
  ) then
    raise exception 'duplicate_pending';
  end if;

  select id into v_membership from public.memberships where student_id = v_uid and gym_id = v_me.gym_id;
  insert into public.payments (gym_id, student_id, membership_id, amount, method, declared_paid_on, receipt_path, notes, created_by, request_id)
  values (v_me.gym_id, v_uid, v_membership, p_amount, 'transfer', p_declared_paid_on, p_receipt_path, nullif(trim(p_notes), ''), v_uid, p_request_id)
  returning id into v_id;

  select currency into v_currency from public.gyms where id = v_me.gym_id;
  perform public.notify(v_me.gym_id, v_uid, 'payment_pending_review', 'Comprobante recibido',
    'Tu transferencia de ' || v_currency || ' ' || p_amount || ' está pendiente de revisión.', '/app/alumno/pagos', 'pay_sub:' || v_id);
  perform public.notify_owners(v_me.gym_id, 'payment_submitted', 'Nuevo comprobante pendiente',
    coalesce(nullif(v_me.full_name, ''), 'Un alumno') || ' informó una transferencia de ' || v_currency || ' ' || p_amount || '.',
    '/app/pagos', 'pay_sub:' || v_id);
  return v_id;
end;
$$;

create or replace function public.owner_record_payment(
  p_student uuid, p_amount numeric, p_method text, p_method_detail text, p_paid_on date, p_notes text, p_request_id uuid
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_gym uuid := public.current_gym_id(); v_existing uuid; v_id uuid; v_membership uuid; v_currency text;
begin
  if not public.is_gym_owner(v_gym) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_request_id is null then raise exception 'missing_request_id'; end if;
  select id into v_existing from public.payments where created_by = auth.uid() and request_id = p_request_id;
  if v_existing is not null then return v_existing; end if;
  if not exists (select 1 from public.profiles where id = p_student and gym_id = v_gym and role = 'student') then
    raise exception 'student_not_found';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_method not in ('cash', 'transfer', 'other') then raise exception 'invalid_method'; end if;
  if p_paid_on is null or p_paid_on > public.gym_local_date(v_gym) + 1 then raise exception 'invalid_date'; end if;

  select id into v_membership from public.memberships where student_id = p_student and gym_id = v_gym;
  insert into public.payments (gym_id, student_id, membership_id, amount, method, method_detail, declared_paid_on, status, verified_by, verified_at, notes, created_by, request_id)
  values (v_gym, p_student, v_membership, p_amount, p_method, nullif(trim(p_method_detail), ''), p_paid_on, 'approved', auth.uid(), now(), nullif(trim(p_notes), ''), auth.uid(), p_request_id)
  returning id into v_id;
  perform public.apply_payment(v_id);

  select currency into v_currency from public.gyms where id = v_gym;
  perform public.notify(v_gym, p_student, 'payment_received', 'Pago registrado',
    'Se registró un pago de ' || v_currency || ' ' || p_amount || '.', '/app/alumno/pagos', 'pay_ok:' || v_id);
  return v_id;
end;
$$;

-- Approve or reject a pending payment exactly once (row lock + status check prevent double application).
create or replace function public.owner_review_payment(p_payment uuid, p_approve boolean, p_notes text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_gym uuid := public.current_gym_id(); v_p public.payments; v_currency text;
begin
  if not public.is_gym_owner(v_gym) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_p from public.payments where id = p_payment and gym_id = v_gym for update;
  if v_p.id is null then raise exception 'not_found'; end if;
  if v_p.status <> 'pending' then raise exception 'already_reviewed'; end if;
  if not p_approve and char_length(trim(coalesce(p_notes, ''))) < 3 then raise exception 'reason_required'; end if;

  update public.payments set
    status = case when p_approve then 'approved' else 'rejected' end,
    verified_by = auth.uid(), verified_at = now(), review_notes = nullif(trim(p_notes), '')
  where id = v_p.id;
  if p_approve then perform public.apply_payment(v_p.id); end if;

  select currency into v_currency from public.gyms where id = v_gym;
  if p_approve then
    perform public.notify(v_gym, v_p.student_id, 'payment_approved', 'Pago aprobado',
      'Tu transferencia de ' || v_currency || ' ' || v_p.amount || ' fue confirmada.', '/app/alumno/pagos', 'pay_rev:' || v_p.id);
  else
    perform public.notify(v_gym, v_p.student_id, 'payment_rejected', 'Pago rechazado',
      'Motivo: ' || trim(p_notes), '/app/alumno/pagos', 'pay_rev:' || v_p.id);
  end if;
  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

-- Corrects an approved payment without deleting it: marks it void and restores the balance it covered.
create or replace function public.owner_void_payment(p_payment uuid, p_reason text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_gym uuid := public.current_gym_id(); v_p public.payments; v_m public.memberships;
begin
  if not public.is_gym_owner(v_gym) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  select * into v_p from public.payments where id = p_payment and gym_id = v_gym for update;
  if v_p.id is null then raise exception 'not_found'; end if;
  if v_p.status <> 'approved' then raise exception 'not_approved'; end if;
  update public.payments set status = 'void', review_notes = trim(p_reason) where id = v_p.id;
  if v_p.membership_id is not null and v_p.applied_amount > 0 then
    select * into v_m from public.memberships where id = v_p.membership_id for update;
    update public.memberships set
      balance_due = v_m.balance_due + v_p.applied_amount,
      status = case when v_m.status = 'active' then 'pending_payment'::public.membership_status else v_m.status end,
      updated_at = now()
    where id = v_m.id;
  end if;
end;
$$;

-- Storage buckets: receipts are private (signed URLs only); avatars/logos are public with unguessable paths.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('public-media', 'public-media', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists receipts_insert_own on storage.objects;
create policy receipts_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = public.current_gym_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.current_app_role() = 'student'
  );
drop policy if exists receipts_select on storage.objects;
create policy receipts_select on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts' and (
      (storage.foldername(name))[2] = auth.uid()::text
      or ((storage.foldername(name))[1] = public.current_gym_id()::text and public.current_app_role() = 'owner')
    )
  );
drop policy if exists media_insert on storage.objects;
create policy media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'public-media' and (
      ((storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text)
      or ((storage.foldername(name))[1] = 'logos' and (storage.foldername(name))[2] = public.current_gym_id()::text
          and public.current_app_role() = 'owner')
    )
  );

------------------------------------------------------------------------------
-- Exercises, routines (versioned), workouts, body measurements
------------------------------------------------------------------------------
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text check (char_length(description) <= 500),
  muscle_group text not null check (char_length(muscle_group) between 1 and 40),
  kind text not null default 'strength' check (kind in ('strength', 'cardio', 'mobility', 'other')),
  instructions text check (char_length(instructions) <= 2000),
  media_url text check (media_url is null or media_url ~ '^https://'),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (gym_id, name)
);
alter table public.exercises enable row level security;
revoke delete on public.exercises from anon, authenticated;
drop policy if exists exercises_select on public.exercises;
create policy exercises_select on public.exercises for select to authenticated using (gym_id = public.current_gym_id());
drop policy if exists exercises_staff_insert on public.exercises;
create policy exercises_staff_insert on public.exercises for insert to authenticated
  with check (gym_id = public.current_gym_id() and public.current_app_role() in ('owner', 'teacher'));
drop policy if exists exercises_staff_update on public.exercises;
create policy exercises_staff_update on public.exercises for update to authenticated
  using (gym_id = public.current_gym_id() and public.current_app_role() in ('owner', 'teacher'))
  with check (gym_id = public.current_gym_id());

create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text check (char_length(description) <= 1000),
  goal text check (char_length(goal) <= 200),
  teacher_id uuid references public.profiles(id) on delete set null,
  student_id uuid not null references public.profiles(id) on delete cascade,
  starts_on date not null,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  status text not null default 'active' check (status in ('draft', 'active', 'finished', 'archived')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists routines_student_idx on public.routines (student_id, status);
create index if not exists routines_gym_idx on public.routines (gym_id, created_at desc);

create table if not exists public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  position integer not null check (position between 1 and 100),
  sets integer not null check (sets between 1 and 50),
  reps text check (char_length(reps) <= 20),
  weight_kg numeric(6, 2) check (weight_kg between 0 and 1000),
  rest_seconds integer check (rest_seconds between 0 and 3600),
  duration_seconds integer check (duration_seconds between 0 and 86400),
  distance_m numeric(9, 2) check (distance_m between 0 and 1000000),
  notes text check (char_length(notes) <= 300),
  unique (routine_id, position)
);

create table if not exists public.routine_versions (
  routine_id uuid not null references public.routines(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  saved_by uuid references public.profiles(id) on delete set null,
  saved_at timestamptz not null default now(),
  primary key (routine_id, version)
);

alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.routine_versions enable row level security;
revoke insert, update, delete on public.routines, public.routine_exercises, public.routine_versions from anon, authenticated;

drop policy if exists routines_select on public.routines;
create policy routines_select on public.routines for select to authenticated
  using ((student_id = auth.uid() and status <> 'draft') or (gym_id = public.current_gym_id() and public.can_manage_student(student_id)));
drop policy if exists routine_exercises_select on public.routine_exercises;
create policy routine_exercises_select on public.routine_exercises for select to authenticated
  using (exists (select 1 from public.routines r where r.id = routine_id));
drop policy if exists routine_versions_select on public.routine_versions;
create policy routine_versions_select on public.routine_versions for select to authenticated
  using (exists (select 1 from public.routines r where r.id = routine_id and public.can_manage_student(r.student_id)));

-- Creates or updates a routine and its ordered exercises atomically; each save is a new version.
create or replace function public.save_routine(p_routine uuid, p jsonb) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_gym uuid := public.current_gym_id();
  v_role public.app_role := public.current_app_role();
  v_old public.routines;
  v_student uuid := (p ->> 'student_id')::uuid;
  v_id uuid;
  v_version integer;
  v_status text := coalesce(p ->> 'status', 'active');
  v_ex jsonb;
  v_pos integer := 0;
  v_teacher uuid;
begin
  if v_role not in ('owner', 'teacher') then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_student is null or not public.can_manage_student(v_student) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p ->> 'name', ''))) = 0 then raise exception 'name_required'; end if;
  if jsonb_typeof(p -> 'exercises') <> 'array' or jsonb_array_length(p -> 'exercises') = 0 then
    raise exception 'exercises_required';
  end if;
  if jsonb_array_length(p -> 'exercises') > 100 then raise exception 'too_many_exercises'; end if;

  v_teacher := case when v_role = 'teacher' then auth.uid() else coalesce(
    (select id from public.profiles where id = (p ->> 'teacher_id')::uuid and gym_id = v_gym and role = 'teacher'), auth.uid()) end;

  if p_routine is null then
    insert into public.routines (gym_id, name, description, goal, teacher_id, student_id, starts_on, ends_on, status)
    values (v_gym, trim(p ->> 'name'), nullif(trim(p ->> 'description'), ''), nullif(trim(p ->> 'goal'), ''),
      v_teacher, v_student, coalesce((p ->> 'starts_on')::date, public.gym_local_date(v_gym)),
      nullif(p ->> 'ends_on', '')::date, v_status)
    returning id, version into v_id, v_version;
  else
    select * into v_old from public.routines where id = p_routine and gym_id = v_gym for update;
    if v_old.id is null or not public.can_manage_student(v_old.student_id) then raise exception 'forbidden' using errcode = '42501'; end if;
    update public.routines set
      name = trim(p ->> 'name'), description = nullif(trim(p ->> 'description'), ''), goal = nullif(trim(p ->> 'goal'), ''),
      student_id = v_student, starts_on = coalesce((p ->> 'starts_on')::date, v_old.starts_on),
      ends_on = nullif(p ->> 'ends_on', '')::date, status = v_status,
      teacher_id = case when v_role = 'teacher' then v_old.teacher_id else v_teacher end,
      version = v_old.version + 1, updated_at = now()
    where id = v_old.id
    returning id, version into v_id, v_version;
    delete from public.routine_exercises where routine_id = v_id;
  end if;

  for v_ex in select value from jsonb_array_elements(p -> 'exercises') loop
    v_pos := v_pos + 1;
    if not exists (select 1 from public.exercises where id = (v_ex ->> 'exercise_id')::uuid and gym_id = v_gym) then
      raise exception 'exercise_not_found';
    end if;
    insert into public.routine_exercises (routine_id, exercise_id, position, sets, reps, weight_kg, rest_seconds, duration_seconds, distance_m, notes)
    values (v_id, (v_ex ->> 'exercise_id')::uuid, v_pos, coalesce((v_ex ->> 'sets')::integer, 3),
      nullif(trim(v_ex ->> 'reps'), ''), nullif(v_ex ->> 'weight_kg', '')::numeric, nullif(v_ex ->> 'rest_seconds', '')::integer,
      nullif(v_ex ->> 'duration_seconds', '')::integer, nullif(v_ex ->> 'distance_m', '')::numeric, nullif(trim(v_ex ->> 'notes'), ''));
  end loop;

  insert into public.routine_versions (routine_id, version, snapshot, saved_by)
  values (v_id, v_version, p, auth.uid());

  if v_status = 'active' then
    if p_routine is null or v_old.student_id <> v_student then
      perform public.notify(v_gym, v_student, 'routine_assigned', 'Nueva rutina: ' || trim(p ->> 'name'),
        'Tu profesor te asignó una rutina.', '/app/alumno/rutinas', 'routine:' || v_id || ':' || v_version);
    else
      perform public.notify(v_gym, v_student, 'routine_updated', 'Rutina actualizada: ' || trim(p ->> 'name'),
        'Se modificaron ejercicios o indicaciones.', '/app/alumno/rutinas', 'routine:' || v_id || ':' || v_version);
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.set_routine_status(p_routine uuid, p_status text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_r public.routines;
begin
  select * into v_r from public.routines where id = p_routine and gym_id = public.current_gym_id() for update;
  if v_r.id is null or not public.can_manage_student(v_r.student_id) or public.current_app_role() not in ('owner', 'teacher') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('draft', 'active', 'finished', 'archived') then raise exception 'invalid_status'; end if;
  update public.routines set status = p_status, updated_at = now() where id = v_r.id;
end;
$$;

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  routine_id uuid references public.routines(id) on delete set null,
  routine_name text not null,
  routine_version integer not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  notes text check (char_length(notes) <= 1000)
);
create index if not exists workouts_student_idx on public.workouts (student_id, started_at desc);
create unique index if not exists workouts_one_in_progress on public.workouts (student_id) where status = 'in_progress';

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  exercise_name text not null,
  position integer not null,
  set_number integer not null check (set_number between 1 and 50),
  planned_reps text,
  planned_weight_kg numeric(6, 2),
  reps integer check (reps between 0 and 1000),
  weight_kg numeric(6, 2) check (weight_kg between 0 and 1000),
  duration_seconds integer check (duration_seconds between 0 and 86400),
  distance_m numeric(9, 2) check (distance_m between 0 and 1000000),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (workout_id, position, set_number)
);

alter table public.workouts enable row level security;
alter table public.workout_sets enable row level security;
revoke insert, update, delete on public.workouts, public.workout_sets from anon, authenticated;
grant update (status, finished_at, notes) on public.workouts to authenticated;
grant update (reps, weight_kg, duration_seconds, distance_m, completed, updated_at) on public.workout_sets to authenticated;

drop policy if exists workouts_select on public.workouts;
create policy workouts_select on public.workouts for select to authenticated
  using (student_id = auth.uid() or (gym_id = public.current_gym_id() and public.can_manage_student(student_id)));
drop policy if exists workouts_update_own on public.workouts;
create policy workouts_update_own on public.workouts for update to authenticated
  using (student_id = auth.uid() and status = 'in_progress')
  with check (student_id = auth.uid() and status in ('in_progress', 'completed', 'abandoned'));
drop policy if exists workout_sets_select on public.workout_sets;
create policy workout_sets_select on public.workout_sets for select to authenticated
  using (exists (select 1 from public.workouts w where w.id = workout_id));
drop policy if exists workout_sets_update_own on public.workout_sets;
create policy workout_sets_update_own on public.workout_sets for update to authenticated
  using (exists (select 1 from public.workouts w where w.id = workout_id and w.student_id = auth.uid() and w.status = 'in_progress'))
  with check (exists (select 1 from public.workouts w where w.id = workout_id and w.student_id = auth.uid() and w.status = 'in_progress'));

-- Starts a workout from a visible active routine, snapshotting planned sets so later routine edits don't alter it.
create or replace function public.start_workout(p_routine uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_r public.routines; v_id uuid;
begin
  select * into v_r from public.routines where id = p_routine and student_id = v_uid and status = 'active';
  if v_r.id is null then raise exception 'routine_not_found'; end if;
  select id into v_id from public.workouts where student_id = v_uid and status = 'in_progress';
  if v_id is not null then return v_id; end if;

  insert into public.workouts (gym_id, student_id, routine_id, routine_name, routine_version)
  values (v_r.gym_id, v_uid, v_r.id, v_r.name, v_r.version) returning id into v_id;

  insert into public.workout_sets (workout_id, exercise_id, exercise_name, position, set_number, planned_reps, planned_weight_kg, weight_kg, duration_seconds, distance_m)
  select v_id, re.exercise_id, e.name, re.position, s.n, re.reps, re.weight_kg, re.weight_kg, re.duration_seconds, re.distance_m
  from public.routine_exercises re
  join public.exercises e on e.id = re.exercise_id
  cross join lateral generate_series(1, re.sets) as s(n)
  where re.routine_id = v_r.id;
  return v_id;
end;
$$;

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5, 2) check (weight_kg between 20 and 400),
  height_cm numeric(5, 1) check (height_cm between 50 and 260),
  chest_cm numeric(5, 1) check (chest_cm between 10 and 300),
  waist_cm numeric(5, 1) check (waist_cm between 10 and 300),
  hip_cm numeric(5, 1) check (hip_cm between 10 and 300),
  arm_cm numeric(5, 1) check (arm_cm between 10 and 300),
  thigh_cm numeric(5, 1) check (thigh_cm between 10 and 300),
  notes text check (char_length(notes) <= 500),
  recorded_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists body_measurements_student_idx on public.body_measurements (student_id, measured_on desc);
alter table public.body_measurements enable row level security;
-- Private: only the student and their assigned teachers (the owner is intentionally excluded).
drop policy if exists body_measurements_select on public.body_measurements;
create policy body_measurements_select on public.body_measurements for select to authenticated
  using (student_id = auth.uid() or public.is_teacher_of(student_id));
drop policy if exists body_measurements_insert on public.body_measurements;
create policy body_measurements_insert on public.body_measurements for insert to authenticated
  with check (
    recorded_by = auth.uid() and gym_id = public.current_gym_id()
    and (student_id = auth.uid() and public.current_app_role() = 'student' or public.is_teacher_of(student_id))
  );
drop policy if exists body_measurements_delete_own on public.body_measurements;
create policy body_measurements_delete_own on public.body_measurements for delete to authenticated
  using (recorded_by = auth.uid());

------------------------------------------------------------------------------
-- Owner people management
------------------------------------------------------------------------------
create or replace function public.owner_update_member(p_user uuid, p_full_name text, p_phone text, p_birth_date date)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_gym uuid := public.current_gym_id();
begin
  if not public.is_gym_owner(v_gym) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_full_name, ''))) < 2 then raise exception 'invalid_name'; end if;
  update public.profiles set full_name = trim(p_full_name), phone = nullif(trim(p_phone), ''), birth_date = p_birth_date
  where id = p_user and gym_id = v_gym;
  if not found then raise exception 'not_found'; end if;
end;
$$;

create or replace function public.owner_set_account_status(p_user uuid, p_status text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_gym uuid := public.current_gym_id();
begin
  if not public.is_gym_owner(v_gym) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'cannot_change_self'; end if;
  if p_status not in ('active', 'inactive') then raise exception 'invalid_status'; end if;
  update public.profiles set account_status = p_status where id = p_user and gym_id = v_gym;
  if not found then raise exception 'not_found'; end if;
  if p_status = 'inactive' then
    update public.qr_tokens set revoked_at = now() where student_id = p_user and used_at is null and revoked_at is null;
  end if;
end;
$$;

-- Used by the server-side invite route (service role) to attach a freshly created account to a gym.
create or replace function public.admin_attach_member(p_user uuid, p_gym uuid, p_role public.app_role) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_next integer;
begin
  perform 1 from public.gyms where id = p_gym for update;
  if not found then raise exception 'gym_not_found'; end if;
  select coalesce(max(member_number), 0) + 1 into v_next from public.profiles where gym_id = p_gym;
  update public.profiles set gym_id = p_gym, role = p_role, member_number = v_next
  where id = p_user and gym_id is null;
  if not found then raise exception 'user_not_attachable'; end if;
  return v_next;
end;
$$;

create or replace function public.owner_update_gym_settings(p jsonb) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_gym uuid := public.current_gym_id();
begin
  if not public.is_gym_owner(v_gym) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p ? 'timezone' and not exists (select 1 from pg_catalog.pg_timezone_names where name = p ->> 'timezone') then
    raise exception 'invalid_timezone';
  end if;
  update public.gyms g set
    name = case when p ? 'name' then trim(p ->> 'name') else g.name end,
    address = case when p ? 'address' then nullif(trim(p ->> 'address'), '') else g.address end,
    phone = case when p ? 'phone' then nullif(trim(p ->> 'phone'), '') else g.phone end,
    contact_email = case when p ? 'contact_email' then nullif(trim(p ->> 'contact_email'), '') else g.contact_email end,
    logo_url = case when p ? 'logo_url' then nullif(trim(p ->> 'logo_url'), '') else g.logo_url end,
    currency = case when p ? 'currency' then upper(trim(p ->> 'currency')) else g.currency end,
    transfer_instructions = case when p ? 'transfer_instructions' then nullif(trim(p ->> 'transfer_instructions'), '') else g.transfer_instructions end,
    welcome_message = case when p ? 'welcome_message' then nullif(trim(p ->> 'welcome_message'), '') else g.welcome_message end,
    opening_hours = case when p ? 'opening_hours' then nullif(trim(p ->> 'opening_hours'), '') else g.opening_hours end,
    timezone = case when p ? 'timezone' then p ->> 'timezone' else g.timezone end,
    day_cutoff_hour = case when p ? 'day_cutoff_hour' then (p ->> 'day_cutoff_hour')::integer else g.day_cutoff_hour end,
    qr_ttl_seconds = case when p ? 'qr_ttl_seconds' then (p ->> 'qr_ttl_seconds')::integer else g.qr_ttl_seconds end,
    allow_pending_payment = case when p ? 'allow_pending_payment' then (p ->> 'allow_pending_payment')::boolean else g.allow_pending_payment end,
    pending_grace_days = case when p ? 'pending_grace_days' then (p ->> 'pending_grace_days')::integer else g.pending_grace_days end,
    expiry_notice_days = case when p ? 'expiry_notice_days' then (p ->> 'expiry_notice_days')::integer else g.expiry_notice_days end,
    renewal_policy = case when p ? 'renewal_policy' then p ->> 'renewal_policy' else g.renewal_policy end,
    teachers_can_scan = case when p ? 'teachers_can_scan' then (p ->> 'teachers_can_scan')::boolean else g.teachers_can_scan end
  where g.id = v_gym;
end;
$$;

------------------------------------------------------------------------------
-- Dashboard indicators (confirmed income only)
------------------------------------------------------------------------------
create or replace function public.owner_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_gym uuid := public.current_gym_id();
  v_g public.gyms;
  v_today date;
  v_month date;
begin
  if not public.is_gym_owner(v_gym) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_g from public.gyms where id = v_gym;
  v_today := public.gym_local_date(v_gym);
  v_month := date_trunc('month', v_today)::date;
  return jsonb_build_object(
    'today', v_today,
    'currency', v_g.currency,
    'students_total', (select count(*) from public.profiles where gym_id = v_gym and role = 'student'),
    'students_inactive', (select count(*) from public.profiles where gym_id = v_gym and role = 'student' and account_status = 'inactive'),
    'memberships_active', (select count(*) from public.memberships where gym_id = v_gym and status = 'active' and ends_on >= v_today and starts_on <= v_today),
    'memberships_expired', (select count(*) from public.memberships where gym_id = v_gym and (status = 'expired' or (status in ('active', 'pending_payment') and ends_on < v_today))),
    'memberships_pending', (select count(*) from public.memberships where gym_id = v_gym and status = 'pending_payment'),
    'expiring_soon', (select count(*) from public.memberships where gym_id = v_gym and status in ('active', 'pending_payment') and ends_on between v_today and v_today + v_g.expiry_notice_days),
    'receipts_pending', (select count(*) from public.payments where gym_id = v_gym and status = 'pending'),
    'income_month', (select coalesce(sum(amount), 0) from public.payments where gym_id = v_gym and status = 'approved' and public.gym_local_date(v_gym, verified_at) >= v_month),
    'attendance_today', (select count(*) from public.attendance_days where gym_id = v_gym and local_date = v_today and voided_at is null),
    'routines_active', (select count(*) from public.routines where gym_id = v_gym and status = 'active'),
    'new_students_month', (select count(*) from public.profiles where gym_id = v_gym and role = 'student' and public.gym_local_date(v_gym, joined_at) >= v_month)
  );
end;
$$;

------------------------------------------------------------------------------
-- Scheduled notices: expiring/expired memberships. Idempotent via dedupe keys.
------------------------------------------------------------------------------
create or replace function public.run_membership_notices() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_g public.gyms; v_today date; v_m record; v_count integer := 0;
begin
  for v_g in select * from public.gyms loop
    v_today := public.gym_local_date(v_g.id);

    for v_m in
      select m.*, p.full_name from public.memberships m join public.profiles p on p.id = m.student_id
      where m.gym_id = v_g.id and m.status in ('active', 'pending_payment')
        and m.ends_on between v_today and v_today + v_g.expiry_notice_days
    loop
      perform public.notify(v_g.id, v_m.student_id, 'membership_expiring', 'Tu membresía vence pronto',
        'Vence el ' || to_char(v_m.ends_on, 'DD/MM/YYYY') || '.', '/app/alumno/membresia', 'expiring:' || v_m.id || ':' || v_m.ends_on);
      perform public.notify_owners(v_g.id, 'membership_expiring', 'Membresía por vencer',
        coalesce(nullif(v_m.full_name, ''), 'Un alumno') || ' vence el ' || to_char(v_m.ends_on, 'DD/MM/YYYY') || '.',
        '/app/alumnos/' || v_m.student_id, 'expiring:' || v_m.id || ':' || v_m.ends_on);
      v_count := v_count + 1;
    end loop;

    for v_m in
      select m.* from public.memberships m
      where m.gym_id = v_g.id and (
        (m.status = 'active' and m.ends_on < v_today)
        or (m.status = 'pending_payment' and m.ends_on + v_g.pending_grace_days < v_today)
      )
    loop
      update public.memberships set status = 'expired', updated_at = now() where id = v_m.id;
      perform public.notify(v_g.id, v_m.student_id, 'membership_expired', 'Tu membresía venció',
        'Venció el ' || to_char(v_m.ends_on, 'DD/MM/YYYY') || '. Acercate a renovarla.', '/app/alumno/membresia',
        'expired:' || v_m.id || ':' || v_m.ends_on);
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end;
$$;

------------------------------------------------------------------------------
-- Audit triggers
------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['gyms', 'profiles', 'plans', 'memberships', 'payments', 'access_overrides',
                           'teacher_students', 'routines', 'exercises', 'attendance_days'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    if t = 'attendance_days' then
      execute format('create trigger audit_%1$s after update on public.%1$I for each row execute function public.audit_trigger()', t);
    else
      execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_trigger()', t);
    end if;
  end loop;
end $$;

------------------------------------------------------------------------------
-- Grants
------------------------------------------------------------------------------
revoke execute on function public.notify(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.notify_owners(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.apply_payment(uuid) from public, anon, authenticated;
revoke execute on function public.audit_trigger() from public, anon, authenticated;
revoke execute on function public.admin_attach_member(uuid, uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.run_membership_notices() from public, anon, authenticated;
grant execute on function public.admin_attach_member(uuid, uuid, public.app_role) to service_role;
grant execute on function public.run_membership_notices() to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'public.owner_assign_plan(uuid, uuid, date, numeric, text, uuid)',
    'public.owner_renew_membership(uuid, text, date, uuid)',
    'public.owner_correct_attendance(uuid, date, text, text)',
    'public.submit_payment(numeric, date, text, text, uuid)',
    'public.owner_record_payment(uuid, numeric, text, text, date, text, uuid)',
    'public.owner_review_payment(uuid, boolean, text)',
    'public.owner_void_payment(uuid, text)',
    'public.save_routine(uuid, jsonb)',
    'public.set_routine_status(uuid, text)',
    'public.start_workout(uuid)',
    'public.owner_update_member(uuid, text, text, date)',
    'public.owner_set_account_status(uuid, text)',
    'public.owner_update_gym_settings(jsonb)',
    'public.owner_dashboard()',
    'public.gym_local_date(uuid, timestamptz)',
    'public.can_manage_student(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Realtime: credential reacts to membership changes; bell reacts to new notifications.
do $$ begin
  alter publication supabase_realtime add table public.memberships;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;
