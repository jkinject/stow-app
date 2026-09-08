-- 사진 파일 고아 검사 (2026-09-08)
--
-- Storage 의 item-photos 버킷에 있는 객체 중 **아무 행도 가리키지 않는 것**을 찾는다.
-- 참조하는 곳: items · containers · item_photos 의 photo_path/thumb_path, 그리고
-- "곧 지울 것" 인 storage_gc 큐. 큐에 든 것은 고아가 아니라 지우기를 기다리는 것이다.
--
-- 쓰는 법:
--   로컬:  docker exec -i supabase_db_home-store psql -U postgres -d postgres -f - < supabase/audits/orphan_photos.sql
--   운영:  npx supabase db query -f supabase/audits/orphan_photos.sql --linked
--
-- 둘째 질의는 반대 방향 — 행은 있는데 파일이 없는 것(깨진 칸). 비용은 아니지만 같이 본다.

with referenced as (
  select photo_path as p from items      where photo_path is not null
  union select thumb_path from items      where thumb_path is not null
  union select photo_path from containers where photo_path is not null
  union select thumb_path from containers where thumb_path is not null
  union select photo_path from item_photos
  union select thumb_path from item_photos
  union select path from storage_gc
)
select 'orphan' as kind, o.name as path, o.created_at,
       pg_size_pretty(coalesce((o.metadata->>'size')::bigint, 0)) as size
  from storage.objects o
 where o.bucket_id = 'item-photos'
   and not exists (select 1 from referenced r where r.p = o.name)
 order by o.created_at;

with referenced as (
  select 'items' as src, photo_path as p from items where photo_path is not null
  union all select 'items', thumb_path from items where thumb_path is not null
  union all select 'containers', photo_path from containers where photo_path is not null
  union all select 'containers', thumb_path from containers where thumb_path is not null
  union all select 'item_photos', photo_path from item_photos
  union all select 'item_photos', thumb_path from item_photos
)
select 'missing' as kind, r.src, r.p as path
  from referenced r
 where not exists (select 1 from storage.objects o where o.bucket_id = 'item-photos' and o.name = r.p)
 order by r.src, r.p;

select 'summary' as kind,
       (select count(*) from storage.objects where bucket_id = 'item-photos') as objects,
       (select count(*) from item_photos) as photo_rows,
       (select count(*) from storage_gc) as gc_pending;
