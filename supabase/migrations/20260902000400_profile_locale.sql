-- ═════════════════════════════════════════════════════════════
-- 사용자 언어 (2026-09-02)
--
-- ⚠⚠ 왜 필요한가. 휴면 삭제 예고 메일이 **한국어로만** 나가고 있었다. 이 앱은
--   해외에도 나가는데(Stow), 서버는 그 사람이 어떤 언어를 쓰는지 **알 방법이 없다** —
--   언어는 앱이 기기 설정으로 판단하고(lib/i18n.tsx) 서버에 알린 적이 없다.
--
--   요청이 있을 때만 언어를 아는 것으로는 부족하다. 예고 메일은 **그 사람이 앱을
--   90일 넘게 안 열었을 때** 나가므로, 그때는 요청도 기기 정보도 없다. 미리 적어 둬야 한다.
--
-- ⚠ 값이 없을 수 있다. 이 기능 이전에 마지막으로 앱을 연 사람은 영영 null 일 수 있다
--   (다시 열면 그때 채워진다). 그런 사람에게는 **두 언어로 함께** 보낸다 —
--   찍어서 한쪽으로 보내면 절반은 못 읽는다.
-- ═════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists locale text
    check (locale is null or locale in ('ko', 'en'));

comment on column public.profiles.locale is
  '앱이 마지막으로 쓴 화면 언어. null = 아직 모름(그 경우 메일은 두 언어로 보낸다).';

-- ═════════════════════════════════════════════════════════════
-- 예고 대상 조회가 **사람별 언어**를 함께 주도록 바꾼다.
--
-- ⚠ 예전에는 `emails text[]` 하나로 묶어 한 통을 여러 명에게 보냈다. 언어가 사람마다
--   다를 수 있으므로 더 이상 묶을 수 없다 — 관리자가 둘인데 한 명은 한국어, 한 명은
--   영어면 한 통으로는 둘 다 만족시킬 수 없다. 사람별로 나눠 보낸다.
-- ═════════════════════════════════════════════════════════════
drop function if exists public.dormant_households_to_warn();

create or replace function public.dormant_households_to_warn()
returns table (household_id uuid, household_name text, owners jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_maintenance_caller();
  return query
  select h.id, h.name,
         coalesce(
           jsonb_agg(jsonb_build_object('email', u.email::text, 'locale', p.locale))
             filter (where u.email is not null),
           '[]'::jsonb)
    from households h
    join household_members m on m.household_id = h.id and m.role = 'owner'
    join auth.users u        on u.id = m.user_id
    left join profiles p     on p.id = m.user_id
   where h.dormant_since is not null
     and h.warned_at is null
     and h.dormant_since < now() - make_interval(days => setting_int('warn_after_dormant_days', 30))
   group by h.id, h.name;
end;
$$;

revoke all on function public.dormant_households_to_warn() from public, anon, authenticated;
