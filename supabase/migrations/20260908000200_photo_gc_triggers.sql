-- 홈 스토어 — 사진 파일이 고아가 되지 않게 서버가 지킨다 (2026-09-08 사용자 요청)
--
-- ⚠⚠ 왜 필요한가. 사진 파일을 지우는 일은 지금까지 **클라이언트가 직접** 했다
--   (행을 지운 뒤 Storage API 호출). 그 호출이 실패하면 — 지하철에서 신호가 끊기거나,
--   앱이 그 순간 죽거나 — 행은 없는데 파일만 남는다. 아무 데도 경로가 없으니 **영원히
--   남고, 그만큼 스토리지 비용이 된다.** 실패는 `deletePhotoObjects` 가 조용히 삼키므로
--   알아챌 길도 없었다.
--
--   해결: 행이 사라지거나 경로가 바뀌는 **바로 그 트랜잭션**에서 옛 경로를 `storage_gc`
--   큐에 남긴다. 클라이언트의 직접 삭제는 그대로 둔다(빠른 길). 그게 실패해도 앱을
--   다음에 켤 때 큐를 비우면서 지워진다(features/storage/gc.ts). 둘 다 성공하면 큐의
--   항목은 "이미 없는 파일" 이라 그냥 빠진다 — drainStorageGc 가 그렇게 처리한다.
--
-- 다루는 자리:
--   ① item_photos 행 삭제 (사진 한 장 떼기 · 물건 하드 삭제의 CASCADE)
--   ② containers 의 photo_path / thumb_path 가 바뀌거나 비워질 때 (박스 사진 교체·제거)
--   items 의 두 컬럼은 t61 이 item_photos 에서 복사하는 것이라 ①이 곧 그것이다.
--
-- ⚠ 가구가 통째로 지워지는 CASCADE(탈퇴·휴면)에서는 **넣지 않는다.** 그때는 households
--   행이 이미 없어서 storage_gc 의 FK 가 튕기고 탈퇴 자체가 실패한다. 그 경로들은
--   탈퇴 미리보기·휴면 삭제 목록이 이미 들고 있고, 앱·Edge Function 이 행보다 먼저 지운다.
--
-- ⚠ storage_gc 에는 insert 정책이 없다(클라이언트가 남의 파일을 지우게 만들 수 없게).
--   그래서 트리거 함수는 SECURITY DEFINER 다. 넣는 경로는 지워지는 그 행의 것뿐이다.

create or replace function public.enqueue_storage_gc(p_household uuid, p_paths text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 가구가 사라지는 중이면(CASCADE) FK 가 튕긴다 — 위 주석. 그 경로는 다른 흐름이 지운다.
  if not exists (select 1 from households where id = p_household) then
    return;
  end if;
  insert into storage_gc (path, household_id)
  select p, p_household from unnest(p_paths) as p
  where p is not null and length(p) > 0
  on conflict (path) do nothing;
end;
$$;

revoke all on function public.enqueue_storage_gc(uuid, text[]) from public, anon, authenticated;

-- ① 사진 행이 사라지면 그 파일 두 개를 큐에
create or replace function public.t62_item_photo_gc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform enqueue_storage_gc(old.household_id, array[old.photo_path, old.thumb_path]);
  return old;
end;
$$;

create trigger t62_item_photo_gc after delete on public.item_photos
  for each row execute function public.t62_item_photo_gc();

-- ② 박스 사진이 바뀌거나 비워지면 **옛** 파일을 큐에.
--    새 경로와 같은 것은 넣지 않는다(같은 경로에 덮어쓴 경우 — 지금 코드는 늘 새 uuid 를
--    쓰지만, 혹시라도 같으면 살아 있는 파일을 지우게 된다).
create or replace function public.t63_container_photo_gc()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_paths text[] := '{}';
begin
  if old.photo_path is not null and old.photo_path is distinct from new.photo_path
     and old.photo_path is distinct from new.thumb_path then
    v_paths := v_paths || old.photo_path;
  end if;
  if old.thumb_path is not null and old.thumb_path is distinct from new.thumb_path
     and old.thumb_path is distinct from new.photo_path then
    v_paths := v_paths || old.thumb_path;
  end if;
  if array_length(v_paths, 1) > 0 then
    perform enqueue_storage_gc(old.household_id, v_paths);
  end if;
  return new;
end;
$$;

create trigger t63_container_photo_gc after update of photo_path, thumb_path on public.containers
  for each row execute function public.t63_container_photo_gc();

comment on function public.enqueue_storage_gc(uuid, text[]) is
  '사진 경로를 수거 큐에 넣는다. 트리거 전용 — 가구가 사라지는 중이면 아무것도 하지 않는다.';
