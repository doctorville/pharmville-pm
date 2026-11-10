-- ─────────────────────────────────────────────────────────────
-- 팜빌 활성화 PM · 첨부파일 / 참고 URL 추가 (supabase-setup.sql 실행 후 1회 실행)
-- 여러 번 실행해도 안전하도록 작성
-- ─────────────────────────────────────────────────────────────

create table if not exists public.attachments (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  task_id       uuid references public.tasks(id) on delete cascade,
  kind          text not null check (kind in ('file','url')),
  name          text not null check (length(trim(name)) > 0),
  url           text check (url is null or url ~* '^https?://'),
  storage_path  text,
  size          bigint,
  mime          text,
  created_by    text not null default public.my_email(),
  created_at    timestamptz not null default now(),
  check ((kind = 'url' and url is not null) or (kind = 'file' and storage_path is not null))
);
create index if not exists attachments_project_idx on public.attachments(project_id);

alter table public.attachments enable row level security;
drop policy if exists att_select on public.attachments;
create policy att_select on public.attachments for select to authenticated using (public.is_member());
-- 추가·삭제는 아래 함수로만 (이력 기록 보장)

-- 첨부 추가 + 이력
create or replace function public.add_attachment(
  p_project uuid, p_task uuid, p_kind text, p_name text, p_url text, p_path text, p_size bigint, p_mime text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_me text := public.my_email(); v_by text; v_target text; v_tname text;
begin
  if not public.is_member() then raise exception '권한이 없습니다'; end if;
  if p_task is not null and not exists (select 1 from public.tasks where id = p_task and project_id = p_project) then
    raise exception '세부업무를 찾을 수 없습니다';
  end if;
  insert into public.attachments(project_id, task_id, kind, name, url, storage_path, size, mime, created_by)
  values (p_project, p_task, p_kind, trim(p_name), nullif(trim(coalesce(p_url,'')),''), p_path, p_size, p_mime, v_me)
  returning id into v_id;
  select coalesce(nullif(name,''), v_me) into v_by from public.accounts where email = v_me;
  if p_task is null then select name  into v_tname from public.projects where id = p_project; v_target := 'project';
  else                   select title into v_tname from public.tasks    where id = p_task;    v_target := 'task'; end if;
  insert into public.history(project_id, target_type, target_id, target_name, action, reason, changes, by_email, by_name)
  values (p_project, v_target, coalesce(p_task, p_project), v_tname, 'update', '',
          jsonb_build_array(jsonb_build_object('field', case when p_kind='url' then 'link' else 'file' end, 'from', '', 'to', trim(p_name))),
          v_me, coalesce(v_by, v_me));
  return v_id;
end $$;
grant execute on function public.add_attachment(uuid, uuid, text, text, text, text, bigint, text) to authenticated;

-- 첨부 삭제(사유 필수) + 이력, 지울 저장 경로 반환
create or replace function public.remove_attachment(p_id uuid, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare a record; v_me text := public.my_email(); v_by text; v_tname text;
begin
  if not public.is_member() then raise exception '권한이 없습니다'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception '삭제 사유를 입력해야 합니다'; end if;
  delete from public.attachments where id = p_id returning * into a;
  if a.id is null then raise exception '첨부를 찾을 수 없습니다'; end if;
  select coalesce(nullif(name,''), v_me) into v_by from public.accounts where email = v_me;
  if a.task_id is null then select name into v_tname from public.projects where id = a.project_id;
  else select title into v_tname from public.tasks where id = a.task_id; end if;
  insert into public.history(project_id, target_type, target_id, target_name, action, reason, changes, by_email, by_name)
  values (a.project_id, case when a.task_id is null then 'project' else 'task' end, coalesce(a.task_id, a.project_id), v_tname,
          'update', trim(p_reason),
          jsonb_build_array(jsonb_build_object('field', case when a.kind='url' then 'link' else 'file' end, 'from', a.name, 'to', '')),
          v_me, coalesce(v_by, v_me));
  return a.storage_path;
end $$;
grant execute on function public.remove_attachment(uuid, text) to authenticated;

-- ── 파일 저장소 (비공개 버킷, 파일당 20MB) ───────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists pv_att_read   on storage.objects;
drop policy if exists pv_att_insert on storage.objects;
drop policy if exists pv_att_delete on storage.objects;
create policy pv_att_read   on storage.objects for select to authenticated using (bucket_id = 'attachments' and public.is_member());
create policy pv_att_insert on storage.objects for insert to authenticated with check (bucket_id = 'attachments' and public.is_member());
create policy pv_att_delete on storage.objects for delete to authenticated using (bucket_id = 'attachments' and public.is_member());

do $$ begin
  begin alter publication supabase_realtime add table public.attachments; exception when others then null; end;
end $$;
