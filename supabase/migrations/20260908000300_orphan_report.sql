-- 홈 스토어 — 붙이지 못한 업로드도 서버가 안다 (2026-09-08, 고아 파일 점검의 마지막 구멍)
--
-- ⚠ 남아 있던 구멍: 사진을 올린 뒤 행을 넣기 **전에** 가구에서 빠지면(관리자가 내보냄),
--   행 삽입은 RLS 로 튕기고 그 뒤의 파일 삭제도 같은 정책(가구 구성원만)에 막힌다.
--   경로를 아는 건 그 순간의 클라이언트뿐이라 파일이 **영원히** 남았다.
--
-- 두 겹으로 막는다:
--   ① `report_orphan_photos(paths)` — 클라이언트가 "이 경로를 올렸는데 못 붙였다" 고
--      신고하면 수거 큐에 넣는다. 그 가구의 구성원 앱이 다음 실행 때 지운다.
--      ⚠ 아무 경로나 넣게 두면 남의 살아 있는 파일을 지우게 만들 수 있다. 그래서
--        · 경로 모양이 규약({uuid}/{uuid}/{uuid}(_t).jpg)이어야 하고
--        · items·containers·item_photos 어느 행도 그 경로를 가리키지 않아야 하며
--        · 가구가 있어야(FK) 넣는다.
--        참조되지 않는 파일은 정의상 쓰레기다 — 지워서 손해 볼 사람이 없다. 남이 올리는
--        중인 파일을 노리려면 uuid 셋을 맞혀야 하므로 현실적으로 불가능하다.
--   ② Storage 삭제 정책에 "**내가 올린 객체**는 내가 지운다" 를 더한다(owner_id).
--      가구에서 빠진 뒤에도 제 업로드는 스스로 치울 수 있다. 남의 것은 여전히 못 지운다.

create or replace function public.report_orphan_photos(p_paths text[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path  text;
  v_hh    uuid;
  v_count int := 0;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = 'insufficient_privilege';
  end if;
  if p_paths is null or array_length(p_paths, 1) is null then
    return 0;
  end if;
  if array_length(p_paths, 1) > 20 then
    raise exception '한 번에 최대 20개까지만 신고할 수 있습니다.' using errcode = 'check_violation';
  end if;

  foreach v_path in array p_paths loop
    -- 규약 밖 경로는 조용히 건너뛴다 — 오류로 만들면 나머지 정상 경로까지 못 넣는다
    if v_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}(_t)?\.jpg$' then
      continue;
    end if;
    -- 살아 있는 파일은 절대 넣지 않는다
    if exists (select 1 from items       where photo_path = v_path or thumb_path = v_path)
    or exists (select 1 from containers  where photo_path = v_path or thumb_path = v_path)
    or exists (select 1 from item_photos where photo_path = v_path or thumb_path = v_path) then
      continue;
    end if;
    v_hh := split_part(v_path, '/', 1)::uuid;
    if not exists (select 1 from households where id = v_hh) then
      continue; -- 가구가 없으면 FK 가 튕긴다. 그 파일은 탈퇴·휴면 흐름이 이미 지웠거나 지울 것이다
    end if;
    insert into storage_gc (path, household_id) values (v_path, v_hh)
    on conflict (path) do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.report_orphan_photos(text[]) from public, anon;
grant execute on function public.report_orphan_photos(text[]) to authenticated;

comment on function public.report_orphan_photos(text[]) is
  '올렸지만 행을 붙이지 못한 사진 경로를 수거 큐에. 어느 행도 가리키지 않는 경로만 받는다.';

-- ② 내가 올린 객체는 가구에서 빠진 뒤에도 내가 지운다
drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects for delete
  using (bucket_id = 'item-photos'
         and (public.is_household_member(((storage.foldername(name))[1])::uuid)
              or owner_id = auth.uid()::text));
