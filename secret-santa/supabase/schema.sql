-- Secret Santa: run this entire file in Supabase SQL Editor.
-- Uses Supabase Auth anonymous users. Enable Anonymous Sign-Ins in Authentication settings.

create extension if not exists pgcrypto;

create table if not exists public.ss_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date,
  budget text,
  invite_code text not null unique,
  host_uid uuid not null,
  status text not null default 'open' check (status in ('open','drawn')),
  created_at timestamptz not null default now()
);

create table if not exists public.ss_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ss_events(id) on delete cascade,
  user_id uuid not null,
  name text not null,
  wishes text not null default '',
  created_at timestamptz not null default now(),
  unique(event_id, user_id)
);
create unique index if not exists ss_unique_name_per_event on public.ss_participants(event_id, lower(name));

create table if not exists public.ss_assignments (
  event_id uuid not null references public.ss_events(id) on delete cascade,
  giver_uid uuid not null,
  receiver_participant_id uuid not null references public.ss_participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(event_id, giver_uid),
  unique(event_id, receiver_participant_id)
);

alter table public.ss_events enable row level security;
alter table public.ss_participants enable row level security;
alter table public.ss_assignments enable row level security;
revoke all on public.ss_events, public.ss_participants, public.ss_assignments from anon, authenticated;

create or replace function public.create_event(p_title text, p_event_date date, p_budget text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_code text; v_event public.ss_events;
begin
  if v_uid is null then raise exception '請先登入'; end if;
  if length(trim(coalesce(p_title,''))) = 0 then raise exception '請輸入活動名稱'; end if;
  loop
    v_code := upper(substr(encode(gen_random_bytes(8),'hex'),1,10));
    exit when not exists(select 1 from ss_events where invite_code=v_code);
  end loop;
  insert into ss_events(title,event_date,budget,invite_code,host_uid)
  values(trim(p_title),p_event_date,nullif(trim(coalesce(p_budget,'')),''),v_code,v_uid)
  returning * into v_event;
  return jsonb_build_object('id',v_event.id,'invite_code',v_event.invite_code);
end $$;

create or replace function public.join_event(p_code text, p_name text, p_wishes text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_event ss_events; v_participant ss_participants;
begin
  if v_uid is null then raise exception '請先登入'; end if;
  select * into v_event from ss_events where invite_code=upper(trim(p_code));
  if not found then raise exception '找不到這個活動，請確認邀請代碼'; end if;
  if v_event.status <> 'open' then raise exception '活動已完成抽籤，不能再加入'; end if;
  if length(trim(coalesce(p_name,'')))=0 then raise exception '請輸入名字'; end if;
  insert into ss_participants(event_id,user_id,name,wishes)
  values(v_event.id,v_uid,trim(p_name),coalesce(p_wishes,''))
  on conflict(event_id,user_id) do update set name=excluded.name,wishes=excluded.wishes
  returning * into v_participant;
  return jsonb_build_object('participant_id',v_participant.id);
exception when unique_violation then
  raise exception '這個名字已經有人使用，請加上區別或換個名字';
end $$;

create or replace function public.update_my_wishes(p_event_id uuid, p_wishes text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update ss_participants set wishes=coalesce(p_wishes,'')
  where event_id=p_event_id and user_id=auth.uid()
  and exists(select 1 from ss_events e where e.id=p_event_id and e.status='open');
  if not found then raise exception '找不到你的參加資料，或活動已經抽籤'; end if;
  return true;
end $$;


-- Invitation preview exposes event details only, before a guest has joined.
create or replace function public.get_invite_preview(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event ss_events;
begin
  select * into v_event from ss_events where invite_code=upper(trim(p_code));
  if not found then raise exception '找不到這個活動'; end if;
  return jsonb_build_object(
    'id',v_event.id,'title',v_event.title,'event_date',v_event.event_date,
    'budget',v_event.budget,'invite_code',v_event.invite_code,'status',v_event.status
  );
end $$;

create or replace function public.get_event_by_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event ss_events; v_uid uuid := auth.uid(); v_people jsonb;
begin
  select * into v_event from ss_events where invite_code=upper(trim(p_code));
  if not found then raise exception '找不到這個活動'; end if;
  if v_uid is null or (v_uid <> v_event.host_uid and not exists(
    select 1 from ss_participants where event_id=v_event.id and user_id=v_uid
  )) then raise exception '請先使用邀請連結加入活動'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'user_id',p.user_id,'name',p.name,'wishes',p.wishes
  ) order by p.created_at),'[]'::jsonb) into v_people
  from ss_participants p where p.event_id=v_event.id;
  return jsonb_build_object('event',jsonb_build_object(
    'id',v_event.id,'title',v_event.title,'event_date',v_event.event_date,
    'budget',v_event.budget,'invite_code',v_event.invite_code,
    'host_uid',v_event.host_uid,'status',v_event.status
  ),'participants',v_people);
end $$;

create or replace function public.draw_event(p_event_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_event ss_events; v_uids uuid[]; v_shuffled uuid[]; v_n int; v_i int; v_attempt int:=0; v_receiver_id uuid;
begin
  select * into v_event from ss_events where id=p_event_id for update;
  if not found then raise exception '找不到活動'; end if;
  if auth.uid() is null or auth.uid() <> v_event.host_uid then raise exception '只有主辦人可以抽籤'; end if;
  if v_event.status <> 'open' then raise exception '這個活動已經抽過籤'; end if;
  select array_agg(user_id order by created_at),count(*) into v_uids,v_n from ss_participants where event_id=p_event_id;
  if v_n < 2 then raise exception '至少需要兩位參加者'; end if;
  loop
    v_attempt:=v_attempt+1;
    select array_agg(x order by random()) into v_shuffled from unnest(v_uids) x;
    exit when not exists(
      select 1 from generate_subscripts(v_uids,1) as gs(i) where v_uids[gs.i] = v_shuffled[gs.i]
    );
    if v_attempt > 10000 then raise exception '抽籤失敗，請稍後重試'; end if;
  end loop;
  for v_i in 1..v_n loop
    select id into v_receiver_id from ss_participants
    where event_id=p_event_id and user_id=v_shuffled[v_i];
    insert into ss_assignments(event_id,giver_uid,receiver_participant_id)
    values(p_event_id,v_uids[v_i],v_receiver_id);
  end loop;
  update ss_events set status='drawn' where id=p_event_id;
  return true;
end $$;

create or replace function public.get_my_assignment(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  if not exists(select 1 from ss_participants where event_id=p_event_id and user_id=auth.uid()) then
    raise exception '你不是這個活動的參加者';
  end if;
  select jsonb_build_object('receiver_name',p.name,'receiver_wishes',p.wishes)
  into v_result
  from ss_assignments a join ss_participants p on p.id=a.receiver_participant_id
  where a.event_id=p_event_id and a.giver_uid=auth.uid();
  return v_result;
end $$;

revoke all on function public.create_event(text,date,text) from public;
revoke all on function public.join_event(text,text,text) from public;
revoke all on function public.update_my_wishes(uuid,text) from public;
revoke all on function public.get_invite_preview(text) from public;
revoke all on function public.get_event_by_code(text) from public;
revoke all on function public.draw_event(uuid) from public;
revoke all on function public.get_my_assignment(uuid) from public;
grant execute on function public.create_event(text,date,text) to authenticated;
grant execute on function public.join_event(text,text,text) to authenticated;
grant execute on function public.update_my_wishes(uuid,text) to authenticated;
grant execute on function public.get_invite_preview(text) to authenticated;
grant execute on function public.get_event_by_code(text) to authenticated;
grant execute on function public.draw_event(uuid) to authenticated;
grant execute on function public.get_my_assignment(uuid) to authenticated;