-- 좋아회 — Supabase 초기 설정
--
-- 쓰는 법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run.
-- 여러 번 실행해도 안전합니다.
--
-- 권한 요약
--   관리자(로그인한 사람) : 전부
--   친구 둘(로그인 없음)   : 읽기 + 가고 싶은 곳 추가 + 👍 + 한 줄
--   우표·사진·가게정보     : 관리자만. 친구는 손이 닿지 않습니다.

create extension if not exists "pgcrypto";

-- ───────────────────────────────────────────────────────────── 1. 테이블

create table if not exists settings (
  id            text primary key default 'app',
  style         text not null default 'B',
  members       jsonb not null default
                '[{"id":"m1","name":""},{"id":"m2","name":""},{"id":"m3","name":""}]'::jsonb,
  ref_stamp_ids jsonb not null default '[]'::jsonb,
  area_pos      jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);
insert into settings (id) values ('app') on conflict (id) do nothing;

create table if not exists shops (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  wish       boolean not null default true,
  proposer   text not null default '',
  folded     boolean not null default false,
  reason     text not null default '',
  url        text not null default '',
  area       text not null default '',
  lat        double precision,
  lng        double precision,
  created_at timestamptz not null default now(),
  visited_at timestamptz
);

-- 가게 검색으로 받아둔 좌표. 지금은 쓰지 않고 모아두기만 합니다.
-- 나중에 손그림 지도를 진짜 지도로 바꿀 때 쓰려고 미리 받아둡니다.
-- (이미 만들어진 테이블에도 칸을 더합니다. 여러 번 실행해도 안전합니다)
alter table shops add column if not exists lat double precision;
alter table shops add column if not exists lng double precision;

create table if not exists stamps (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid references shops(id) on delete set null,
  shop_name   text not null default '',
  date        date not null default current_date,
  attendees   jsonb not null default '[]'::jsonb,
  food_ko     text not null default '',
  food_en     text not null default '',
  color       text not null default '',
  photo_paths jsonb not null default '[]'::jsonb,
  art_path    text,
  prompt_ver  text not null default '',
  by_member   text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists stamps_shop_idx on stamps(shop_id);
create index if not exists stamps_date_idx on stamps(date);

-- ───────────────────────────────── 1-b. 모임
-- settings 행 하나가 모임 하나입니다. id 가 모임 키이고, 'app' 이 처음 만든 모임입니다.
-- 가게와 우표는 gid 로 어느 모임 것인지 가립니다. 기존 데이터는 전부 'app' 으로 들어갑니다.
-- 친구들은 로그인을 하지 않으므로 모임끼리 서로 가려지지는 않습니다 — 나누기만 합니다.
alter table settings add column if not exists name       text not null default '좋아회';
alter table settings add column if not exists created_at timestamptz not null default now();
alter table shops    add column if not exists gid text not null default 'app';
alter table stamps   add column if not exists gid text not null default 'app';
create index if not exists shops_gid_idx  on shops(gid);
create index if not exists stamps_gid_idx on stamps(gid);

-- 한 줄 메모: 우표 하나에 멤버별 한 줄
create table if not exists notes (
  stamp_id   uuid not null references stamps(id) on delete cascade,
  member     text not null,
  text       text not null default '',
  updated_at timestamptz not null default now(),
  primary key (stamp_id, member)
);

-- 👍 찜
create table if not exists likes (
  shop_id    uuid not null references shops(id) on delete cascade,
  member     text not null,
  created_at timestamptz not null default now(),
  primary key (shop_id, member)
);

-- ───────────────────────────────────────────────── 2. 권한 (RLS)

alter table settings enable row level security;
alter table shops    enable row level security;
alter table stamps   enable row level security;
alter table notes    enable row level security;
alter table likes    enable row level security;

-- 누구나 읽기
drop policy if exists "read settings" on settings;
drop policy if exists "read shops"    on shops;
drop policy if exists "read stamps"   on stamps;
drop policy if exists "read notes"    on notes;
drop policy if exists "read likes"    on likes;
create policy "read settings" on settings for select using (true);
create policy "read shops"    on shops    for select using (true);
create policy "read stamps"   on stamps   for select using (true);
create policy "read notes"    on notes    for select using (true);
create policy "read likes"    on likes    for select using (true);

-- 관리자(로그인한 사람)는 전부
drop policy if exists "admin settings" on settings;
drop policy if exists "admin shops"    on shops;
drop policy if exists "admin stamps"   on stamps;
drop policy if exists "admin notes"    on notes;
drop policy if exists "admin likes"    on likes;
create policy "admin settings" on settings for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "admin shops" on shops for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "admin stamps" on stamps for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "admin notes" on notes for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "admin likes" on likes for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- 친구 둘: 가고 싶은 곳 "추가"만. 수정·삭제는 불가.
drop policy if exists "guest adds wish" on shops;
create policy "guest adds wish" on shops for insert with check (wish = true);

-- 친구 둘: 👍 넣고 빼기
drop policy if exists "guest likes"   on likes;
drop policy if exists "guest unlikes" on likes;
create policy "guest likes"   on likes for insert with check (true);
create policy "guest unlikes" on likes for delete using (true);

-- 친구 둘: 한 줄 쓰기와 고치기
drop policy if exists "guest writes note" on notes;
drop policy if exists "guest edits note"  on notes;
create policy "guest writes note" on notes for insert with check (true);
create policy "guest edits note"  on notes for update using (true) with check (true);

-- ─────────────────────────────────────────────────── 3. 실시간

-- 한 명이 바꾸면 나머지 둘 화면에 바로 반영되게 합니다.
-- 이 부분이 실패해도 앱은 돌아갑니다 (새로고침하면 보입니다).
do $$
declare
  t text;
  tables text[] := array['settings','shops','stamps','notes','likes'];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when others then
        raise notice '실시간 등록 건너뜀: %', t;
      end;
    end if;
  end loop;
end $$;

-- ───────────────────────────────────────────── 4. 사진 저장소

insert into storage.buckets (id, name, public)
values ('photos','photos',true)
on conflict (id) do update set public = true;

-- 저장소 정책은 프로젝트에 따라 SQL로 못 만들 수도 있습니다.
-- 그때는 아래 NOTICE 가 뜨고, 대시보드 Storage → photos → Policies 에서
-- 손으로 만들면 됩니다 (README 참고). 스크립트 전체가 실패하지는 않습니다.
do $$
begin
  execute 'drop policy if exists "read photos"          on storage.objects';
  execute 'drop policy if exists "admin uploads photos" on storage.objects';
  execute 'drop policy if exists "admin updates photos" on storage.objects';
  execute 'drop policy if exists "admin deletes photos" on storage.objects';

  execute 'create policy "read photos" on storage.objects for select
             using (bucket_id = ''photos'')';
  execute 'create policy "admin uploads photos" on storage.objects for insert
             with check (bucket_id = ''photos'' and auth.uid() is not null)';
  execute 'create policy "admin updates photos" on storage.objects for update
             using (bucket_id = ''photos'' and auth.uid() is not null)';
  execute 'create policy "admin deletes photos" on storage.objects for delete
             using (bucket_id = ''photos'' and auth.uid() is not null)';
exception when others then
  raise notice '저장소 정책을 SQL로 만들지 못했습니다: %. 대시보드에서 손으로 만들어주세요 (README 5-b).', sqlerrm;
end $$;
