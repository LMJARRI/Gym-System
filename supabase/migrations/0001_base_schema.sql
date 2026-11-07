-- Base schema: gyms, profiles (roles), memberships, teacher assignments.
create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create type public.app_role as enum ('owner', 'staff', 'teacher', 'student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.membership_status as enum ('active', 'pending_payment', 'suspended', 'expired');
exception when duplicate_object then null; end $$;

create table if not exists public.gyms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  timezone text not null default 'America/Argentina/Buenos_Aires',
  join_code text not null unique default upper(encode(extensions.gen_random_bytes(5), 'hex')),
  qr_ttl_seconds integer not null default 30 check (qr_ttl_seconds between 10 and 300),
  allow_pending_payment boolean not null default false,
  pending_grace_days integer not null default 0 check (pending_grace_days between 0 and 60),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  gym_id uuid references public.gyms(id) on delete set null,
  role public.app_role not null default 'student',
  full_name text not null default '' check (char_length(full_name) <= 120),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  member_number integer,
  created_at timestamptz not null default now(),
  unique (gym_id, member_number)
);
create index if not exists profiles_gym_role_idx on public.profiles (gym_id, role);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  student_id uuid not null unique references public.profiles(id) on delete cascade,
  plan_name text not null check (char_length(plan_name) between 1 and 80),
  status public.membership_status not null default 'active',
  starts_on date not null,
  ends_on date not null,
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index if not exists memberships_gym_idx on public.memberships (gym_id);

create table if not exists public.teacher_students (
  gym_id uuid not null references public.gyms(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (teacher_id, student_id)
);
create index if not exists teacher_students_student_idx on public.teacher_students (student_id);

-- Helpers (security definer so policies can read profiles without recursion)
create or replace function public.current_gym_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select gym_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_gym_owner(p_gym uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and gym_id = p_gym and role = 'owner')
$$;

create or replace function public.is_teacher_of(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.teacher_students ts
    join public.profiles p on p.id = ts.teacher_id
    where ts.teacher_id = auth.uid() and ts.student_id = p_student
      and p.role = 'teacher' and p.gym_id = ts.gym_id
  )
$$;

-- Profile creation on sign-up
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.gyms enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.teacher_students enable row level security;

drop policy if exists gyms_select_members on public.gyms;
create policy gyms_select_members on public.gyms for select to authenticated
  using (id = public.current_gym_id());

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or (gym_id = public.current_gym_id() and public.current_app_role() = 'owner')
    or (gym_id = public.current_gym_id() and role in ('owner', 'staff', 'teacher'))
    or public.is_teacher_of(id)
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using (student_id = auth.uid() or public.is_gym_owner(gym_id) or public.is_teacher_of(student_id));

drop policy if exists memberships_owner_write on public.memberships;
create policy memberships_owner_write on public.memberships for all to authenticated
  using (public.is_gym_owner(gym_id))
  with check (
    public.is_gym_owner(gym_id)
    and exists (select 1 from public.profiles p where p.id = student_id and p.gym_id = memberships.gym_id and p.role = 'student')
  );

drop policy if exists teacher_students_select on public.teacher_students;
create policy teacher_students_select on public.teacher_students for select to authenticated
  using (teacher_id = auth.uid() or public.is_gym_owner(gym_id));

drop policy if exists teacher_students_owner_write on public.teacher_students;
create policy teacher_students_owner_write on public.teacher_students for all to authenticated
  using (public.is_gym_owner(gym_id))
  with check (
    public.is_gym_owner(gym_id)
    and exists (select 1 from public.profiles t where t.id = teacher_id and t.gym_id = teacher_students.gym_id and t.role = 'teacher')
    and exists (select 1 from public.profiles s where s.id = student_id and s.gym_id = teacher_students.gym_id and s.role = 'student')
  );

-- Onboarding / administration RPCs
create or replace function public.create_gym(p_name text, p_timezone text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_gym uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and gym_id is not null) then
    raise exception 'already_in_gym';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'invalid_timezone';
  end if;
  insert into public.gyms (name, timezone) values (trim(p_name), p_timezone) returning id into v_gym;
  update public.profiles set gym_id = v_gym, role = 'owner', member_number = 1 where id = auth.uid();
  return v_gym;
end;
$$;

create or replace function public.join_gym(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_gym uuid; v_next integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and gym_id is not null) then
    raise exception 'already_in_gym';
  end if;
  select id into v_gym from public.gyms where join_code = upper(trim(p_code)) for update;
  if v_gym is null then raise exception 'invalid_code'; end if;
  select coalesce(max(member_number), 0) + 1 into v_next from public.profiles where gym_id = v_gym;
  update public.profiles set gym_id = v_gym, role = 'student', member_number = v_next where id = auth.uid();
  return v_gym;
end;
$$;

create or replace function public.owner_set_role(p_user uuid, p_role public.app_role) returns void
language plpgsql security definer set search_path = '' as $$
declare v_gym uuid := public.current_gym_id();
begin
  if not public.is_gym_owner(v_gym) then raise exception 'forbidden'; end if;
  if p_user = auth.uid() then raise exception 'cannot_change_own_role'; end if;
  update public.profiles set role = p_role where id = p_user and gym_id = v_gym;
  if not found then raise exception 'not_found'; end if;
  if p_role <> 'teacher' then delete from public.teacher_students where teacher_id = p_user; end if;
  if p_role <> 'student' then
    delete from public.teacher_students where student_id = p_user;
  end if;
end;
$$;

create or replace function public.owner_update_gym(
  p_timezone text, p_qr_ttl_seconds integer, p_allow_pending_payment boolean, p_pending_grace_days integer
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_gym uuid := public.current_gym_id();
begin
  if not public.is_gym_owner(v_gym) then raise exception 'forbidden'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'invalid_timezone';
  end if;
  update public.gyms set timezone = p_timezone, qr_ttl_seconds = p_qr_ttl_seconds,
    allow_pending_payment = p_allow_pending_payment, pending_grace_days = p_pending_grace_days
  where id = v_gym;
end;
$$;

revoke execute on function public.create_gym(text, text) from public, anon;
revoke execute on function public.join_gym(text) from public, anon;
revoke execute on function public.owner_set_role(uuid, public.app_role) from public, anon;
revoke execute on function public.owner_update_gym(text, integer, boolean, integer) from public, anon;
grant execute on function public.create_gym(text, text) to authenticated;
grant execute on function public.join_gym(text) to authenticated;
grant execute on function public.owner_set_role(uuid, public.app_role) to authenticated;
grant execute on function public.owner_update_gym(text, integer, boolean, integer) to authenticated;
