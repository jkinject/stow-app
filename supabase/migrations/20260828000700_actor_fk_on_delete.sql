-- 홈 스토어 — 사용자 삭제를 막던 FK 정리
--
-- 발견 경위: 원격 프로젝트에서 실제로 테스트 계정을 지워보니 실패했다.
--   23503: delete on "profiles" violates foreign key constraint "invites_used_by_fkey"
-- 로컬 SQL 테스트는 사용자 삭제를 시도하지 않아서 이 경로를 못 잡았다.
--
-- 계정 삭제는 App Store 필수 요건(AC29)이므로 반드시 동작해야 한다.
--
-- 두 종류의 참조를 구분한다:
--   (A) **행위자 참조 (nullable)** — "누가 이 초대를 썼는가", "누가 이 이벤트를 일으켰는가".
--       사람이 떠나도 사실 자체는 남아야 하고, 행위자만 비면 된다 → ON DELETE SET NULL
--   (B) **소유/생성자 참조 (NOT NULL)** — created_by / updated_by.
--       비울 수 없으므로 삭제를 막는다. 이건 의도된 것이다 —
--       계정 삭제는 profiles 를 **지우는 게 아니라 익명화**해야 한다는 뜻이며,
--       그래야 감사 이력(AC20/AC21)이 살아남는다. M9 의 계정 삭제 RPC 가 담당한다.

-- (A) 행위자 참조를 SET NULL 로
alter table public.invites       drop constraint invites_used_by_fkey;
alter table public.invites       add  constraint invites_used_by_fkey
  foreign key (used_by) references public.profiles(id) on delete set null;

alter table public.shopping_list drop constraint shopping_list_resolved_by_fkey;
alter table public.shopping_list add  constraint shopping_list_resolved_by_fkey
  foreign key (resolved_by) references public.profiles(id) on delete set null;

alter table public.item_events   drop constraint item_events_actor_id_fkey;
alter table public.item_events   add  constraint item_events_actor_id_fkey
  foreign key (actor_id) references public.profiles(id) on delete set null;

comment on column public.item_events.actor_id is
  '떠난 사용자는 null 이 된다. 이벤트 자체는 남는다 (AC21). 표시할 때 "탈퇴한 사용자" 로 폴백할 것.';

-- (B) NOT NULL 소유 참조는 그대로 둔다 — 아래 함수가 그 이유를 검증 가능하게 만든다.
--     M9 의 계정 삭제는 이 함수를 먼저 호출해 "지울 수 있는가"를 판정한다.
create or replace function public.account_deletion_blockers(p_user uuid)
returns table(tbl text, col text, cnt bigint)
language sql
security definer
stable
set search_path = public
as $$
  select 'households'::text, 'created_by'::text, count(*) from households where created_by = p_user
  union all select 'locations',  'created_by', count(*) from locations  where created_by = p_user
  union all select 'locations',  'updated_by', count(*) from locations  where updated_by = p_user
  union all select 'containers', 'created_by', count(*) from containers where created_by = p_user
  union all select 'containers', 'updated_by', count(*) from containers where updated_by = p_user
  union all select 'items',      'created_by', count(*) from items      where created_by = p_user
  union all select 'items',      'updated_by', count(*) from items      where updated_by = p_user
  union all select 'invites',    'created_by', count(*) from invites    where created_by = p_user;
$$;

comment on function public.account_deletion_blockers is
  'M9 계정 삭제 전 점검용. 0 이 아닌 행이 하나라도 있으면 profiles 를 지울 수 없고 익명화해야 한다.';

revoke all on function public.account_deletion_blockers(uuid) from public;
grant execute on function public.account_deletion_blockers(uuid) to authenticated;
