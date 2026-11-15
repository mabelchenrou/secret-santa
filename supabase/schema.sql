-- Secret Santa 第 2 版資料庫設定
-- 用法：整份貼到 Supabase 的 SQL Editor 按 Run。可以重複執行，不會刪掉已經建立的活動。
-- 需要在 Authentication 設定裡開啟 Anonymous Sign-Ins（匿名登入）。

-- ───────── 資料表 ─────────

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

-- 第 2 版新增：每個人自己設定的 4 位數密碼（換手機或瀏覽器時用來找回身分）
alter table public.ss_participants add column if not exists pin_hash text;
alter table public.ss_participants add column if not exists pin_fails int not null default 0;
alter table public.ss_participants add column if not exists pin_locked_until timestamptz;

create table if not exists public.ss_assignments (
  event_id uuid not null references public.ss_events(id) on delete cascade,
  giver_uid uuid not null,
  receiver_participant_id uuid not null references public.ss_participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(event_id, giver_uid),
  unique(event_id, receiver_participant_id)
);

-- 網頁不能直接讀寫資料表，只能呼叫下面的函式。
-- 配對結果（ss_assignments）沒有任何函式會回傳整張表，所以主辦人在網頁上也看不到。
alter table public.ss_events enable row level security;
alter table public.ss_participants enable row level security;
alter table public.ss_assignments enable row level security;
revoke all on public.ss_events, public.ss_participants, public.ss_assignments from anon, authenticated;

-- ───────── 移除第 1 版的函式 ─────────

drop function if exists public.create_event(text, date, text);
drop function if exists public.join_event(text, text, text);
drop function if exists public.update_my_wishes(uuid, text);
drop function if exists public.get_invite_preview(text);
drop function if exists public.get_event_by_code(text);
drop function if exists public.draw_event(uuid);
drop function if exists public.get_my_assignment(uuid);

-- ───────── 內部小工具（網頁不能直接呼叫） ─────────

create or replace function public.ss_pin_hash(p_id uuid, p_pin text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(p_id::text || ':' || p_pin, 'UTF8')), 'hex')
$$;

-- 6 碼邀請代碼，不含容易看錯的 I、O、0、1
create or replace function public.ss_new_code()
returns text language plpgsql set search_path = public as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
begin
  loop
    v_bytes := uuid_send(gen_random_uuid());
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alphabet, get_byte(v_bytes, i) % 32 + 1, 1);
    end loop;
    exit when not exists (select 1 from ss_events where invite_code = v_code);
  end loop;
  return v_code;
end $$;

-- 檢查名字與密碼，回傳整理過的名字
create or replace function public.ss_check_person(p_name text, p_pin text)
returns text language plpgsql immutable as $$
declare v_name text := trim(coalesce(p_name, ''));
begin
  if v_name = '' then raise exception '請輸入你的名字'; end if;
  if char_length(v_name) > 20 then raise exception '名字請在 20 個字以內'; end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then raise exception '密碼請輸入 4 個數字'; end if;
  return v_name;
end $$;

-- ───────── 網頁呼叫的函式 ─────────

-- 建立活動；建立的人就是主辦人，同時也是第一位參加者。回傳邀請代碼。
create or replace function public.ss_create_event(
  p_title text, p_event_date date, p_budget text, p_name text, p_pin text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_title text := trim(coalesce(p_title, ''));
  v_name text;
  v_code text;
  v_event_id uuid;
  v_pid uuid := gen_random_uuid();
begin
  if v_uid is null then raise exception '請重新整理頁面後再試一次'; end if;
  if v_title = '' then raise exception '請輸入活動名稱'; end if;
  if char_length(v_title) > 60 then raise exception '活動名稱請在 60 個字以內'; end if;
  v_name := ss_check_person(p_name, p_pin);
  v_code := ss_new_code();
  insert into ss_events(title, event_date, budget, invite_code, host_uid)
  values (v_title, p_event_date, nullif(left(trim(coalesce(p_budget, '')), 40), ''), v_code, v_uid)
  returning id into v_event_id;
  insert into ss_participants(id, event_id, user_id, name, pin_hash)
  values (v_pid, v_event_id, v_uid, v_name, ss_pin_hash(v_pid, p_pin));
  return v_code;
end $$;

-- 用邀請代碼加入活動
create or replace function public.ss_join(p_code text, p_name text, p_wishes text, p_pin text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_event ss_events;
  v_name text;
  v_pid uuid := gen_random_uuid();
begin
  if v_uid is null then raise exception '請重新整理頁面後再試一次'; end if;
  select * into v_event from ss_events where invite_code = upper(trim(p_code));
  if not found then raise exception '找不到這個活動，請確認邀請連結或代碼'; end if;
  if v_event.status <> 'open' then raise exception '這場活動已經抽完籤，不能再加入了'; end if;
  if exists (select 1 from ss_participants where event_id = v_event.id and user_id = v_uid) then
    raise exception '你已經加入這場活動了';
  end if;
  v_name := ss_check_person(p_name, p_pin);
  insert into ss_participants(id, event_id, user_id, name, wishes, pin_hash)
  values (v_pid, v_event.id, v_uid, v_name, left(coalesce(p_wishes, ''), 300), ss_pin_hash(v_pid, p_pin));
exception when unique_violation then
  raise exception '這個名字已經有人用了，請換一個（例如加上姓氏）';
end $$;

-- 修改自己的願望（抽籤前才能改）
create or replace function public.ss_update_wishes(p_code text, p_wishes text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update ss_participants p set wishes = left(coalesce(p_wishes, ''), 300)
  from ss_events e
  where e.invite_code = upper(trim(p_code)) and e.status = 'open'
    and p.event_id = e.id and p.user_id = auth.uid();
  if not found then raise exception '抽籤後就不能再改願望了'; end if;
end $$;

-- 讀取活動畫面需要的所有資料。
-- 還沒加入的人只看得到活動資訊與名單上的名字；配對結果永遠只回傳「自己要送給誰」。
create or replace function public.ss_state(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_event ss_events;
  v_me ss_participants;
  v_people jsonb;
  v_assignment jsonb;
begin
  if v_uid is null then raise exception '請重新整理頁面後再試一次'; end if;
  select * into v_event from ss_events where invite_code = upper(trim(p_code));
  if not found then raise exception '找不到這個活動，請確認邀請連結或代碼'; end if;
  select * into v_me from ss_participants where event_id = v_event.id and user_id = v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'wishes', case when v_me.id is not null then p.wishes end,
    'is_host', p.user_id = v_event.host_uid,
    'is_me', p.user_id = v_uid
  ) order by p.created_at), '[]'::jsonb)
  into v_people
  from ss_participants p where p.event_id = v_event.id;

  if v_me.id is not null then
    select jsonb_build_object('name', p.name, 'wishes', p.wishes)
    into v_assignment
    from ss_assignments a join ss_participants p on p.id = a.receiver_participant_id
    where a.event_id = v_event.id and a.giver_uid = v_uid;
  end if;

  return jsonb_build_object(
    'event', jsonb_build_object(
      'title', v_event.title, 'event_date', v_event.event_date, 'budget', v_event.budget,
      'invite_code', v_event.invite_code, 'status', v_event.status),
    'participants', v_people,
    'me', case when v_me.id is not null then jsonb_build_object(
      'id', v_me.id, 'name', v_me.name, 'wishes', v_me.wishes,
      'is_host', v_uid = v_event.host_uid) end,
    'assignment', v_assignment
  );
end $$;

-- 抽籤（只有主辦人可以）。把所有人隨機排成一圈，每個人送給下一位，
-- 所以不會抽到自己，每個人也剛好收到一份禮物。
create or replace function public.ss_draw(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_event ss_events;
  v_ids uuid[];
  v_uids uuid[];
  v_n int;
begin
  select * into v_event from ss_events where invite_code = upper(trim(p_code)) for update;
  if not found then raise exception '找不到這個活動'; end if;
  if auth.uid() is null or auth.uid() <> v_event.host_uid then raise exception '只有主辦人可以抽籤'; end if;
  if v_event.status <> 'open' then raise exception '這場活動已經抽過籤了'; end if;
  select array_agg(s.id order by s.r), array_agg(s.user_id order by s.r), count(*)
  into v_ids, v_uids, v_n
  from (select id, user_id, random() as r from ss_participants where event_id = v_event.id) s;
  if v_n < 2 then raise exception '至少要有 2 個人才能抽籤'; end if;
  for i in 1..v_n loop
    insert into ss_assignments(event_id, giver_uid, receiver_participant_id)
    values (v_event.id, v_uids[i], v_ids[i % v_n + 1]);
  end loop;
  update ss_events set status = 'drawn' where id = v_event.id;
end $$;

-- 取消抽籤結果、重新開放報名（只有主辦人可以）。之後要再抽一次。
create or replace function public.ss_reopen(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_event ss_events;
begin
  select * into v_event from ss_events where invite_code = upper(trim(p_code)) for update;
  if not found then raise exception '找不到這個活動'; end if;
  if auth.uid() is null or auth.uid() <> v_event.host_uid then raise exception '只有主辦人可以重新開放'; end if;
  delete from ss_assignments where event_id = v_event.id;
  update ss_events set status = 'open' where id = v_event.id;
end $$;

-- 把某個人從名單移除（只有主辦人可以，而且要在抽籤前）
create or replace function public.ss_remove(p_code text, p_participant_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_event ss_events;
begin
  select * into v_event from ss_events where invite_code = upper(trim(p_code)) for update;
  if not found then raise exception '找不到這個活動'; end if;
  if auth.uid() is null or auth.uid() <> v_event.host_uid then raise exception '只有主辦人可以移除參加者'; end if;
  if v_event.status <> 'open' then raise exception '抽籤後不能移除參加者，請先重新開放'; end if;
  delete from ss_participants
  where id = p_participant_id and event_id = v_event.id and user_id <> v_event.host_uid;
  if not found then raise exception '沒辦法移除這位參加者'; end if;
end $$;

-- 換了手機或瀏覽器時，用名字加密碼找回原本的身分。
-- 回傳 {ok: true} 或 {ok: false, error: '...'}（用回傳值而不是丟錯誤，錯誤次數才記得住）。
create or replace function public.ss_claim(p_code text, p_participant_id uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_event ss_events;
  v_p ss_participants;
  v_current text;
begin
  if v_uid is null then raise exception '請重新整理頁面後再試一次'; end if;
  select * into v_event from ss_events where invite_code = upper(trim(p_code));
  if not found then raise exception '找不到這個活動'; end if;
  select * into v_p from ss_participants
  where id = p_participant_id and event_id = v_event.id for update;
  if not found then raise exception '找不到這位參加者'; end if;
  if v_p.user_id = v_uid then return jsonb_build_object('ok', true); end if;

  select name into v_current from ss_participants where event_id = v_event.id and user_id = v_uid;
  if v_current is not null then
    return jsonb_build_object('ok', false, 'error',
      '這個瀏覽器已經用「' || v_current || '」參加了這場活動');
  end if;
  if v_p.pin_hash is null then
    return jsonb_build_object('ok', false, 'error', '這位參加者沒有設定密碼，沒辦法在這裡找回');
  end if;
  if v_p.pin_locked_until > now() then
    return jsonb_build_object('ok', false, 'error', '密碼錯太多次了，請 15 分鐘後再試');
  end if;
  if v_p.pin_hash <> ss_pin_hash(v_p.id, coalesce(p_pin, '')) then
    update ss_participants set
      pin_fails = case when pin_fails >= 4 then 0 else pin_fails + 1 end,
      pin_locked_until = case when pin_fails >= 4 then now() + interval '15 minutes' end
    where id = v_p.id;
    return jsonb_build_object('ok', false, 'error', '密碼不對，請再試一次');
  end if;

  update ss_assignments set giver_uid = v_uid where event_id = v_event.id and giver_uid = v_p.user_id;
  update ss_events set host_uid = v_uid where id = v_event.id and host_uid = v_p.user_id;
  update ss_participants set user_id = v_uid, pin_fails = 0, pin_locked_until = null where id = v_p.id;
  return jsonb_build_object('ok', true);
end $$;

-- ───────── 權限 ─────────

revoke all on function public.ss_pin_hash(uuid, text) from public, anon, authenticated;
revoke all on function public.ss_new_code() from public, anon, authenticated;
revoke all on function public.ss_check_person(text, text) from public, anon, authenticated;

revoke all on function public.ss_create_event(text, date, text, text, text) from public, anon;
revoke all on function public.ss_join(text, text, text, text) from public, anon;
revoke all on function public.ss_update_wishes(text, text) from public, anon;
revoke all on function public.ss_state(text) from public, anon;
revoke all on function public.ss_draw(text) from public, anon;
revoke all on function public.ss_reopen(text) from public, anon;
revoke all on function public.ss_remove(text, uuid) from public, anon;
revoke all on function public.ss_claim(text, uuid, text) from public, anon;

grant execute on function public.ss_create_event(text, date, text, text, text) to authenticated;
grant execute on function public.ss_join(text, text, text, text) to authenticated;
grant execute on function public.ss_update_wishes(text, text) to authenticated;
grant execute on function public.ss_state(text) to authenticated;
grant execute on function public.ss_draw(text) to authenticated;
grant execute on function public.ss_reopen(text) to authenticated;
grant execute on function public.ss_remove(text, uuid) to authenticated;
grant execute on function public.ss_claim(text, uuid, text) to authenticated;

-- 讓 Supabase 的 API 立刻認得新的函式
notify pgrst, 'reload schema';
