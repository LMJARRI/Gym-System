-- QR temporal + access events + daily attendance.
-- Raw QR tokens are never stored: only their SHA-256 hash.

create table if not exists public.qr_tokens (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
-- At most one live (unused, unrevoked) code per student.
create unique index if not exists qr_tokens_one_live_per_student
  on public.qr_tokens (student_id) where used_at is null and revoked_at is null;
create index if not exists qr_tokens_expires_idx on public.qr_tokens (expires_at);

-- Every scan attempt (granted or denied) is an access event.
create table if not exists public.access_events (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  qr_token_id uuid references public.qr_tokens(id) on delete set null,
  scanned_by uuid references public.profiles(id) on delete set null,
  request_id uuid not null,
  result text not null check (result in ('granted', 'denied')),
  reason text not null,
  occurred_at timestamptz not null default now(),
  local_date date not null,
  unique (scanned_by, request_id)
);
-- A QR can produce at most one granted entry.
create unique index if not exists access_events_one_grant_per_token
  on public.access_events (qr_token_id) where result = 'granted';
create index if not exists access_events_gym_time_idx on public.access_events (gym_id, occurred_at desc);
create index if not exists access_events_student_time_idx on public.access_events (student_id, occurred_at desc);
create index if not exists access_events_scanner_time_idx on public.access_events (scanned_by, occurred_at desc);

-- One row per student per gym-local day ("días asistidos"); access_count = physical entries.
create table if not exists public.attendance_days (
  gym_id uuid not null references public.gyms(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  first_access_at timestamptz not null,
  last_access_at timestamptz not null,
  access_count integer not null default 1 check (access_count >= 1),
  primary key (student_id, local_date)
);
create index if not exists attendance_days_gym_date_idx on public.attendance_days (gym_id, local_date desc);

alter table public.qr_tokens enable row level security; -- no policies: only definer RPCs touch it
alter table public.access_events enable row level security;
alter table public.attendance_days enable row level security;
revoke all on public.qr_tokens from anon, authenticated;
revoke insert, update, delete on public.access_events from anon, authenticated;
revoke insert, update, delete on public.attendance_days from anon, authenticated;

drop policy if exists access_events_select on public.access_events;
create policy access_events_select on public.access_events for select to authenticated
  using (
    student_id = auth.uid()
    or scanned_by = auth.uid()
    or public.is_gym_owner(gym_id)
    or (student_id is not null and public.is_teacher_of(student_id))
  );

drop policy if exists attendance_days_select on public.attendance_days;
create policy attendance_days_select on public.attendance_days for select to authenticated
  using (student_id = auth.uid() or public.is_gym_owner(gym_id) or public.is_teacher_of(student_id));

-- Issue a fresh QR token for the calling student; revokes any previous live code.
create or replace function public.issue_qr_token() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_ttl integer;
  v_token text;
  v_now timestamptz := clock_timestamp();
  v_expires timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.gym_id is null or v_profile.role <> 'student' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('qr_issue:' || v_uid::text, 0));

  select qr_ttl_seconds into v_ttl from public.gyms where id = v_profile.gym_id;

  update public.qr_tokens set revoked_at = v_now
  where student_id = v_uid and used_at is null and revoked_at is null;

  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  v_expires := v_now + make_interval(secs => v_ttl);

  insert into public.qr_tokens (gym_id, student_id, token_hash, expires_at)
  values (v_profile.gym_id, v_uid, extensions.digest(v_token, 'sha256'), v_expires);

  return jsonb_build_object(
    'token', v_token,
    'expires_at', v_expires,
    'server_now', v_now,
    'ttl_seconds', v_ttl
  );
end;
$$;

-- Builds the response for a stored access event (also used for idempotent replays).
create or replace function public.access_event_payload(p_event uuid, p_replayed boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'event_id', e.id,
    'result', e.result,
    'reason', e.reason,
    'occurred_at', e.occurred_at,
    'local_date', e.local_date,
    'replayed', p_replayed,
    'student', case
      when e.reason in ('ok', 'no_membership', 'membership_not_started', 'membership_expired',
                        'membership_suspended', 'membership_pending') and s.id is not null
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
  where e.id = p_event
$$;

-- Validates and atomically consumes a QR. Registers attendance only on success.
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
  if v_scanner.gym_id is null or v_scanner.role not in ('owner', 'staff', 'teacher') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'missing_request_id' using errcode = '22023'; end if;

  -- Serialize retries of the same request, then replay stored result if it already ran.
  perform pg_advisory_xact_lock(hashtextextended('qr_req:' || v_uid::text || ':' || p_request_id::text, 0));
  select id into v_existing from public.access_events where scanned_by = v_uid and request_id = p_request_id;
  if v_existing is not null then
    return public.access_event_payload(v_existing, true);
  end if;

  select * into v_gym from public.gyms where id = v_scanner.gym_id;

  if p_token is not null and char_length(p_token) between 20 and 100 then
    -- Row lock: concurrent scans of the same code queue here; only the first consumes it.
    select * into v_tok from public.qr_tokens
    where token_hash = extensions.digest(p_token, 'sha256')
    for update;
  end if;

  v_now := clock_timestamp();
  v_local := (v_now at time zone v_gym.timezone)::date;

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
    else
      select * into v_m from public.memberships where student_id = v_student.id and gym_id = v_gym.id;
      if v_m.id is null then
        v_reason := 'no_membership';
      elsif v_local < v_m.starts_on then
        v_reason := 'membership_not_started';
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
    end if;
  end if;

  insert into public.access_events
    (gym_id, student_id, qr_token_id, scanned_by, request_id, result, reason, occurred_at, local_date)
  values (
    v_gym.id, v_tok.student_id, v_tok.id, v_uid, p_request_id,
    case when v_reason is null then 'granted' else 'denied' end,
    coalesce(v_reason, 'ok'), v_now, v_local
  )
  returning id into v_event;

  if v_reason is null then
    insert into public.attendance_days (gym_id, student_id, local_date, first_access_at, last_access_at, access_count)
    values (v_gym.id, v_tok.student_id, v_local, v_now, v_now, 1)
    on conflict (student_id, local_date) do update
      set last_access_at = excluded.last_access_at,
          access_count = public.attendance_days.access_count + 1;
  end if;

  return public.access_event_payload(v_event, false);
end;
$$;

-- Today's status for the calling student, computed in the gym's timezone.
create or replace function public.my_attendance_today() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'local_date', (now() at time zone g.timezone)::date,
    'timezone', g.timezone,
    'present', a.student_id is not null,
    'first_access_at', a.first_access_at,
    'last_access_at', a.last_access_at,
    'access_count', coalesce(a.access_count, 0)
  )
  from public.profiles p
  join public.gyms g on g.id = p.gym_id
  left join public.attendance_days a
    on a.student_id = p.id and a.local_date = (now() at time zone g.timezone)::date
  where p.id = auth.uid()
$$;

revoke execute on function public.issue_qr_token() from public, anon;
revoke execute on function public.validate_access_qr(text, uuid) from public, anon;
revoke execute on function public.my_attendance_today() from public, anon;
revoke execute on function public.access_event_payload(uuid, boolean) from public, anon, authenticated;
grant execute on function public.issue_qr_token() to authenticated;
grant execute on function public.validate_access_qr(text, uuid) to authenticated;
grant execute on function public.my_attendance_today() to authenticated;

-- Realtime: students receive their own attendance/access rows (RLS applies).
do $$ begin
  alter publication supabase_realtime add table public.attendance_days;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.access_events;
exception when duplicate_object then null; end $$;
