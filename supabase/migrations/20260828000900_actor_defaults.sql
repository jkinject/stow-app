-- 홈 스토어 — created_by / updated_by 에 default auth.uid()
--
-- 발견 경위: M3 화면을 만들다 타입 검사가 잡았다. 두 컬럼이 NOT NULL 인데 default 가 없어
--   클라이언트가 반드시 보내야 했다. `t10_stamp_actor` 가 BEFORE INSERT 에서 채우므로
--   런타임은 동작하지만, 생성된 타입은 그걸 모르고 필수 필드로 요구한다.
--   `invites.created_by` 에서 겪었던 것과 같은 문제다 (거기선 RLS with check 가 42501 로 튕겼다).
--
-- default 를 주면:
--   · 클라이언트가 감사 필드를 아예 몰라도 된다 (보내지 않는다 = 위조할 여지도 없다, P3)
--   · 트리거가 여전히 auth.uid() 로 덮어쓰므로 방어는 이중이다
--   · 트리거가 어떤 이유로 빠져도 컬럼이 올바른 값을 갖는다

alter table public.locations  alter column created_by set default auth.uid();
alter table public.locations  alter column updated_by set default auth.uid();
alter table public.containers alter column created_by set default auth.uid();
alter table public.containers alter column updated_by set default auth.uid();
alter table public.items      alter column created_by set default auth.uid();
alter table public.items      alter column updated_by set default auth.uid();

comment on column public.items.created_by is
  'default auth.uid() + t10_stamp_actor 이중 방어. 클라이언트는 이 값을 보내지 않는다 (P3).';
