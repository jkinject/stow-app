-- 홈 스토어 — 이미 등록된 사진을 돌릴 수 있게 되면서 생긴 구멍을 막는다 (2026-09-22)
--
-- ⚠⚠ 왜 지금 필요한가.
--   20260908000200 이 사진 파일이 고아가 되지 않게 두 자리를 지켰다:
--     ① item_photos 행 **삭제** (t62)
--     ② containers 의 photo_path/thumb_path 가 **바뀔 때** (t63)
--   item_photos 는 ①만 있다. 그때까지 **경로가 바뀔 일이 없었기 때문이다** — 사진은
--   들어오거나(insert) 나가거나(delete) 순서만 바뀌었다(sort_order).
--
--   사진 회전을 넣으면서 그 전제가 깨졌다. 돌린 사진은 **새 경로로 올리고 행을 갱신한다**
--   (같은 경로에 덮어쓰면 expo-image 의 디스크 캐시가 옛 사진을 계속 보여준다 —
--    캐시 키가 경로다. features/item/photo.ts 의 uploadEntityPhoto 주석 참고).
--   그러면 옛 파일 두 개가 참조를 잃는데, 그걸 큐에 넣어 주는 트리거가 없었다.
--   클라이언트가 직접 지우기는 하지만 그 호출은 실패할 수 있고(지하철·앱 종료),
--   실패하면 **아무 데도 경로가 없어 영원히 남는다.** ②와 똑같은 상황이다.
--
-- 이 마이그레이션은 ②를 item_photos 에 그대로 옮긴 것이다. 새 개념은 없다.

-- ⚠ 본문은 t63 과 **같은 모양**이다. 한쪽만 고치면 두 경로가 갈린다 — 고칠 일이 생기면
--   둘 다 본다. (합치지 않은 이유: 트리거 함수는 OLD/NEW 를 그 표의 타입으로 받는다.)
-- ⚠ 새 경로와 같은 것은 넣지 않는다. 혹시라도 같은 경로에 덮어썼다면 살아 있는 파일을
--   지우게 된다. thumb 와 full 이 서로 뒤바뀌는 경우까지 막는다(t63 과 동일).
create or replace function public.t64_item_photo_path_gc()
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

-- ⚠ `update of photo_path, thumb_path` 로 좁힌다. 순서 바꾸기(sort_order)는 하루에도
--   여러 번 도는데 거기까지 태우면 아무 일도 안 하는 트리거가 매번 돈다.
create trigger t64_item_photo_path_gc after update of photo_path, thumb_path on public.item_photos
  for each row execute function public.t64_item_photo_path_gc();

comment on function public.t64_item_photo_path_gc() is
  '물건 사진의 경로가 바뀌면(회전 등) 옛 파일을 수거 큐에 넣는다. t63 의 item_photos 판.';
