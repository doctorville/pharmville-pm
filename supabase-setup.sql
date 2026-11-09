-- ─────────────────────────────────────────────────────────────
-- 팜빌 활성화 PM · Supabase 초기 설정
-- Supabase 대시보드 → SQL Editor → 새 쿼리에 전체를 붙여 넣고 Run
-- (여러 번 실행해도 안전하도록 작성)
-- ─────────────────────────────────────────────────────────────

-- 최고 관리자 (supabase-config.js의 superAdmins와 같게 유지)
create or replace function public.super_admins() returns text[]
language sql immutable as $$ select array['ojungin@mcircle.biz']::text[] $$;

create or replace function public.my_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

-- ── 계정 (관리자 등록) ─────────────────────────────────────────
create table if not exists public.accounts (
  email       text primary key check (email = lower(email)),
  name        text not null,
  team        text not null default '',
  note        text not null default '',
  role        text not null default 'member' check (role in ('member','admin')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  text,
  updated_at  timestamptz,
  updated_by  text
);

create or replace function public.is_super() returns boolean
language sql stable as $$ select public.my_email() = any(public.super_admins()) $$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super()
      or exists (select 1 from public.accounts where email = public.my_email() and active)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super()
      or exists (select 1 from public.accounts where email = public.my_email() and active and role = 'admin')
$$;

-- 로그인 전 등록 여부만 확인 (목록 조회는 불가)
create or replace function public.is_registered(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select lower(p_email) = any(public.super_admins())
      or exists (select 1 from public.accounts where email = lower(p_email) and active)
$$;
grant execute on function public.is_registered(text) to anon, authenticated;

-- 등록되지 않은 메일은 로그인 계정 자체가 만들어지지 않도록 차단
create or replace function public.guard_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_registered(new.email) then
    raise exception '등록되지 않은 계정입니다: %', new.email;
  end if;
  return new;
end $$;
drop trigger if exists guard_signup on auth.users;
create trigger guard_signup before insert on auth.users
  for each row execute function public.guard_signup();

-- ── 프로젝트 / 세부업무 / 이력 ─────────────────────────────────
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  priority    text not null default 'mid' check (priority in ('high','mid','low')),
  team        text not null default '',
  status      text not null default '대기' check (status in ('대기','진행','완료','보류')),
  start       date not null,
  due         date not null,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  created_by  text,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  check (start <= due)
);

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  priority    text not null default 'mid' check (priority in ('high','mid','low')),
  team        text not null default '',
  status      text not null default '대기' check (status in ('대기','진행','완료','보류')),
  start       date,
  due         date not null,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  created_by  text,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  check (start is null or start <= due)
);
create index if not exists tasks_project_idx on public.tasks(project_id);

create table if not exists public.history (
  id           bigint generated always as identity primary key,
  project_id   uuid,
  target_type  text not null check (target_type in ('project','task')),
  target_id    uuid,
  target_name  text,
  action       text not null check (action in ('create','update','delete')),
  reason       text not null default '',
  changes      jsonb not null default '[]'::jsonb,
  by_email     text not null default public.my_email(),
  by_name      text,
  at           timestamptz not null default now()
);
create index if not exists history_project_idx on public.history(project_id, at desc);

-- 세부업무 일정은 프로젝트 기간 안에서만
create or replace function public.check_task_dates() returns trigger
language plpgsql as $$
declare p record;
begin
  select start, due into p from public.projects where id = new.project_id;
  if new.due < p.start or new.due > p.due or (new.start is not null and (new.start < p.start or new.start > p.due)) then
    raise exception '세부업무 일정은 프로젝트 기간(% ~ %) 안이어야 합니다', p.start, p.due;
  end if;
  return new;
end $$;
drop trigger if exists check_task_dates on public.tasks;
create trigger check_task_dates before insert or update on public.tasks
  for each row execute function public.check_task_dates();

-- 프로젝트 기간을 줄일 때 벗어나는 세부업무가 있으면 차단
create or replace function public.check_project_range() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.tasks t where t.project_id = new.id
             and (t.due < new.start or t.due > new.due or (t.start is not null and (t.start < new.start or t.start > new.due)))) then
    raise exception '기간을 벗어나는 세부업무가 있습니다. 세부업무 일정을 먼저 조정해 주세요';
  end if;
  return new;
end $$;
drop trigger if exists check_project_range on public.projects;
create trigger check_project_range before update on public.projects
  for each row execute function public.check_project_range();

-- ── 변경 + 이력 기록을 한 번에 (수정·삭제는 사유 필수) ─────────
create or replace function public.apply_change(
  p_kind text, p_action text, p_id uuid, p_data jsonb, p_reason text, p_changes jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := p_id;
  v_pid uuid;
  v_name text;
  v_me text := public.my_email();
  v_by text;
begin
  if not public.is_member() then raise exception '권한이 없습니다'; end if;
  if p_action in ('update','delete') and coalesce(trim(p_reason), '') = '' then
    raise exception '수정·삭제 사유를 입력해야 합니다';
  end if;
  select coalesce(nullif(name, ''), v_me) into v_by from public.accounts where email = v_me;
  v_by := coalesce(v_by, v_me);

  if p_kind = 'project' then
    if p_action = 'create' then
      insert into public.projects(name, priority, team, status, start, due, note, created_by, updated_by)
      values (p_data->>'name', p_data->>'priority', p_data->>'team', p_data->>'status',
              (p_data->>'start')::date, (p_data->>'due')::date, coalesce(p_data->>'note',''), v_me, v_me)
      returning id, name into v_id, v_name;
    elsif p_action = 'update' then
      update public.projects set name = p_data->>'name', priority = p_data->>'priority', team = p_data->>'team',
        status = p_data->>'status', start = (p_data->>'start')::date, due = (p_data->>'due')::date,
        note = coalesce(p_data->>'note',''), updated_at = now(), updated_by = v_me
      where id = p_id returning name into v_name;
      if not found then raise exception '프로젝트를 찾을 수 없습니다'; end if;
    else
      delete from public.projects where id = p_id returning name into v_name;
      if not found then raise exception '프로젝트를 찾을 수 없습니다'; end if;
    end if;
    v_pid := v_id;
  elsif p_kind = 'task' then
    if p_action = 'create' then
      insert into public.tasks(project_id, title, priority, team, status, start, due, note, created_by, updated_by)
      values ((p_data->>'project_id')::uuid, p_data->>'title', p_data->>'priority', p_data->>'team', p_data->>'status',
              nullif(p_data->>'start','')::date, (p_data->>'due')::date, coalesce(p_data->>'note',''), v_me, v_me)
      returning id, title, project_id into v_id, v_name, v_pid;
    elsif p_action = 'update' then
      update public.tasks set title = p_data->>'title', priority = p_data->>'priority', team = p_data->>'team',
        status = p_data->>'status', start = nullif(p_data->>'start','')::date, due = (p_data->>'due')::date,
        note = coalesce(p_data->>'note',''), updated_at = now(), updated_by = v_me
      where id = p_id returning title, project_id into v_name, v_pid;
      if not found then raise exception '세부업무를 찾을 수 없습니다'; end if;
    else
      delete from public.tasks where id = p_id returning title, project_id into v_name, v_pid;
      if not found then raise exception '세부업무를 찾을 수 없습니다'; end if;
    end if;
  else
    raise exception '알 수 없는 대상입니다';
  end if;

  insert into public.history(project_id, target_type, target_id, target_name, action, reason, changes, by_email, by_name)
  values (v_pid, p_kind, v_id, v_name, p_action, coalesce(trim(p_reason),''), coalesce(p_changes,'[]'::jsonb), v_me, v_by);
  return v_id;
end $$;
grant execute on function public.apply_change(text, text, uuid, jsonb, text, jsonb) to authenticated;

-- ── 행 단위 보안(RLS) ─────────────────────────────────────────
alter table public.accounts enable row level security;
alter table public.projects enable row level security;
alter table public.tasks    enable row level security;
alter table public.history  enable row level security;

drop policy if exists acc_select on public.accounts;
drop policy if exists acc_write  on public.accounts;
create policy acc_select on public.accounts for select to authenticated using (public.is_admin() or email = public.my_email());
create policy acc_write  on public.accounts for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists prj_all on public.projects;
create policy prj_all on public.projects for all to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists tsk_all on public.tasks;
create policy tsk_all on public.tasks for all to authenticated using (public.is_member()) with check (public.is_member());

-- 이력: 조회·추가만 가능 (수정·삭제 정책 없음 = 불가)
drop policy if exists his_select on public.history;
drop policy if exists his_insert on public.history;
create policy his_select on public.history for select to authenticated using (public.is_member());
create policy his_insert on public.history for insert to authenticated with check (public.is_member() and by_email = public.my_email());

-- ── 실시간 반영 ───────────────────────────────────────────────
do $$ begin
  begin alter publication supabase_realtime add table public.projects; exception when others then null; end;
  begin alter publication supabase_realtime add table public.tasks;    exception when others then null; end;
  begin alter publication supabase_realtime add table public.history;  exception when others then null; end;
  begin alter publication supabase_realtime add table public.accounts; exception when others then null; end;
end $$;

-- 최고 관리자 계정 등록
insert into public.accounts(email, name, team, role, note, created_by)
values ('ojungin@mcircle.biz', '오정인', '콘텐츠운영팀', 'admin', '최고 관리자', 'setup')
on conflict (email) do nothing;
