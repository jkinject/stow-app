-- 홈 스토어 — 붙이지 못한 업로드의 신고와 정리 (2026-09-08)
--
-- 고정하려는 것:
--   (1) 가구에서 빠진 사람이 올려 둔(행 없는) 경로를 신고하면 수거 큐에 들어간다
--   (2) 어느 행이든 가리키는 경로(살아 있는 파일)는 신고해도 들어가지 않는다 — 남의 파일을 지우게 만들 수 없다
--   (3) 규약 밖 경로는 들어가지 않는다
--   (4) 가구가 없는 경로는 들어가지 않는다 (FK 가 튕기지 않고 그냥 건너뛴다)
--   (5) 로그인 없이는 부를 수 없다
--   (6) 가구에서 빠진 뒤에도 **내가 올린** Storage 객체는 지울 수 있고, 남의 것은 못 지운다

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set ua 'e1000000-0000-0000-0000-000000000001'
\set ub 'e1000000-0000-0000-0000-000000000002'
\set ha 'e1000001-0000-0000-0000-00000000000a'
\set la 'e1000002-0000-0000-0000-00000000000a'
\set ia 'e1000004-0000-0000-0000-00000000000a'
\set pa 'e1000005-0000-0000-0000-00000000000a'
\set orphan 'e1000006-0000-0000-0000-000000000001'

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_user_meta_data) values
  (:'ua','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@orphan.test','x',now(),now(),'{"full_name":"에이"}'),
  (:'ub','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@orphan.test','x',now(),now(),'{"full_name":"비"}');
insert into households (id, name, created_by) values (:'ha','집A',:'ub');
insert into household_members (household_id, user_id, role) values (:'ha',:'ub','owner'), (:'ha',:'ua','member');
insert into locations (id, household_id, name, created_by, updated_by) values (:'la',:'ha','창고',:'ub',:'ub');
insert into items (id, household_id, location_id, name, created_by, updated_by) values (:'ia',:'ha',:'la','물건',:'ub',:'ub');
-- 살아 있는 사진 한 장 (비가 올린 것)
insert into item_photos (id, household_id, item_id, photo_path, thumb_path, created_by) values
  (:'pa',:'ha',:'ia', :'ha' || '/' || :'ia' || '/' || :'pa' || '.jpg', :'ha' || '/' || :'ia' || '/' || :'pa' || '_t.jpg', :'ub');
insert into storage.objects (bucket_id, name, owner, owner_id) values
  ('item-photos', :'ha' || '/' || :'ia' || '/' || :'pa' || '.jpg',   :'ub', :'ub'),
  ('item-photos', :'ha' || '/' || :'ia' || '/' || :'pa' || '_t.jpg', :'ub', :'ub');

-- 에이가 올렸지만 행을 못 붙인 두 파일 (구성원일 때 올렸다)
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}';
insert into storage.objects (bucket_id, name, owner, owner_id) values
  ('item-photos', :'ha' || '/' || :'ia' || '/' || :'orphan' || '.jpg',   :'ua', :'ua'),
  ('item-photos', :'ha' || '/' || :'ia' || '/' || :'orphan' || '_t.jpg', :'ua', :'ua');
reset role; reset request.jwt.claims;

-- 그 사이 에이가 가구에서 빠졌다
delete from household_members where household_id = :'ha' and user_id = :'ua';

-- ─────────────────────────────────────────────────────────────
-- 빠진 에이로
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- (2) 살아 있는 파일을 신고해도 들어가지 않는다
select is(
  report_orphan_photos(array[:'ha' || '/' || :'ia' || '/' || :'pa' || '.jpg']),
  0, '(2) 행이 가리키는 경로는 신고해도 큐에 안 들어간다');

-- (3) 규약 밖 경로
select is(report_orphan_photos(array['../etc/passwd', 'abc.jpg', :'ha' || '/x/y.jpg']), 0,
  '(3) 규약 밖 경로는 무시된다');

-- (4) 없는 가구
select is(report_orphan_photos(array['e1999999-0000-0000-0000-000000000000/' || :'ia' || '/' || :'orphan' || '.jpg']), 0,
  '(4) 가구가 없는 경로는 무시된다 (오류 없이)');

-- (1) 진짜 고아 두 개 → 큐에
select is(
  report_orphan_photos(array[:'ha' || '/' || :'ia' || '/' || :'orphan' || '.jpg', :'ha' || '/' || :'ia' || '/' || :'orphan' || '_t.jpg']),
  2, '(1) 행이 없는 경로는 큐에 들어간다');
select is(
  report_orphan_photos(array[:'ha' || '/' || :'ia' || '/' || :'orphan' || '.jpg']),
  0, '(1) 같은 경로를 또 신고해도 한 번만');

-- (6) 삭제 정책: 구성원이거나 **내가 올린 것**이면 지울 수 있다.
--     ⚠ storage.objects 는 SQL 로 직접 지울 수 없다(Storage 가 막는다 — API 로만). 그래서
--       정책의 술어를 읽어 확인한다. 실제 삭제는 앱의 deletePhotoObjects 가 API 로 한다.
reset role; reset request.jwt.claims;
select ok(
  (select qual like '%owner_id = (auth.uid())::text%' from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos_delete'),
  '(6) 삭제 정책에 "내가 올린 객체" 조건이 있다');
select ok(
  (select qual like '%is_household_member%' from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos_delete'),
  '(6) 구성원 조건도 그대로다 — 남의 것은 여전히 구성원만 지운다');
select is((select count(*)::int from storage_gc where household_id = :'ha'), 2,
  '(1) 큐에는 고아 두 경로만 있다 — 구성원 앱이 다음 실행 때 치운다');

-- (5) 익명은 못 부른다
set local role anon;
select throws_ok($$select report_orphan_photos(array['x'])$$, '42501', null, '(5) 로그인 없이는 신고할 수 없다');

select * from finish();
rollback;
