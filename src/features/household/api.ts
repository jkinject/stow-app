import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';


export type Household = { id: string; name: string; role: 'owner' | 'member' };

export type Member = {
  userId: string;
  name: string;
  role: 'owner' | 'member';
  joinedAt: string;
};

export type Invite = { id: string; code: string };

/**
 * RLS 에 막혔을 때 쓰는 메시지.
 *
 * Postgres 는 RLS 거부를 오류가 아니라 **0행**으로 돌려준다(INSERT 만 42501 을 던진다).
 * 그래서 UPDATE·DELETE 는 "몇 행이 바뀌었나" 를 직접 봐야 거부를 알 수 있다.
 */
const DENIED = '권한이 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.';

export const householdKeys = {
  mine: (userId: string | null = null) => ['households', 'mine', userId] as const,
  members: (householdId: string | null) => ['household-members', householdId] as const,
  invite: (householdId: string | null) => ['invite', householdId] as const,
};

/**
 * 내가 속한 가구 목록. 한 사람이 여러 가구에 속할 수 있다 (계획 C10).
 *
 * ⚠ 반드시 세션에 묶어야 한다. 세션이 세워지기 전에 이 쿼리가 나가면 **익명으로**
 *   조회돼 0건이 나오고, 그게 캐시에 굳으면 가드가 "가구 없음"으로 판단해
 *   온보딩으로 보낸다. 실제로 로그인 직후 이 증상이 났다.
 *   queryKey 에 user id 를 넣어 계정이 바뀌면 캐시도 갈리게 한다.
 *
 * ⚠⚠ `user_id` 필터를 빼면 안 된다. RLS 가 걸러 줄 것 같지만 **아니다.**
 *   `hm_select` 는 `is_household_member(household_id)` 라서, 내가 속한 가구의
 *   **구성원 전원의 행**이 돌아온다. 내 행만 오는 게 아니다.
 *
 *   그래서 2인 가구에서 이 질의는 같은 가구를 **두 번** 돌려주고, joined_at 오름차순
 *   첫 행이 먼저 들어온 사람(대개 관리자)의 것이라 **구성원이 자기를 관리자로 본다.**
 *   실측(2026-08-31): 구성원 JWT 로 2행 반환, 첫 행 role='owner', 실제 내 role='member'.
 *
 *   증상은 가족 화면에서 터졌다 — 구성원에게 ⋯ 메뉴(내보내기·관리자 지정)가 보였다.
 *   서버는 정상적으로 막았지만(데이터는 안전했다) 화면이 거짓말을 했다.
 *   1인 가구에서는 중복이 없어 여태 드러나지 않았다.
 */
export function useMyHouseholds() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  return useQuery({
    queryKey: householdKeys.mine(userId),
    enabled: !!userId,
    queryFn: async (): Promise<Household[]> => {
      const { data, error } = await supabase
        .from('household_members')
        .select('role, households(id, name)')
        .eq('user_id', userId!)
        .order('joined_at', { ascending: true });
      if (error) throw error;

      return (data ?? [])
        .filter((row) => row.households)
        .map((row) => ({
          id: row.households!.id,
          name: row.households!.name,
          role: row.role as 'owner' | 'member',
        }));
    },
  });
}

/**
 * 가구 생성.
 * ⚠ households 에는 INSERT 정책이 없다 — 가구를 만드는 순간엔 아직 멤버가 아니라
 * 어떤 RLS with check 도 통과할 수 없다(닭과 달걀). RPC 가 가구 생성과 owner
 * 멤버십 부여를 한 트랜잭션으로 처리한다. (계획 §4.3)
 */
export function useCreateHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.rpc('create_household', { p_name: name });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['households', 'mine'] }),
  });
}

/**
 * 초대 코드로 참여.
 * ⚠ 참여자는 아직 멤버가 아니라 invites 를 SELECT 할 수조차 없다.
 * accept_invite 가 SECURITY DEFINER 여야 하는 이유다. used_by 도 서버가 스탬프한다(P3).
 */
export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc('accept_invite', { p_code: code.trim() });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['households', 'mine'] }),
  });
}

/** 가구 이름 변경 — owner 만 (RLS ho_update) */
export function useRenameHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data, error } = await supabase
        .from('households')
        .update({ name })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(DENIED); // RLS 거부 = 0행
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['households', 'mine'] }),
  });
}

// ─────────────────────────────────────────────────────────────
// 구성원
// ─────────────────────────────────────────────────────────────

/**
 * 가구 구성원 목록.
 *
 * ⚠ 이메일은 못 읽는다. 이메일은 `auth.users` 에 있고 클라이언트에게 열려 있지 않다
 *   (본인 것만 세션에서 온다). 남을 식별하는 값은 `profiles.display_name` 뿐이다.
 *   따라서 이름이 겹치면 화면에서 구분되지 않는다 — 그건 표시 이름을 고쳐야 풀린다.
 */
export function useMembers(householdId: string | null) {
  return useQuery({
    queryKey: householdKeys.members(householdId),
    enabled: !!householdId,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase
        .from('household_members')
        .select('user_id, role, joined_at, profiles(display_name)')
        .eq('household_id', householdId!)
        .order('joined_at', { ascending: true });
      if (error) throw error;

      return (data ?? []).map((r) => ({
        userId: r.user_id,
        name: r.profiles?.display_name ?? '',
        role: r.role as 'owner' | 'member',
        joinedAt: r.joined_at,
      }));
    },
  });
}

/**
 * 구성원 내보내기 — owner 만 (RLS hm_delete).
 *
 * ⚠ 지운 사람의 앱은 즉시 알지 못한다. 실시간 동기화는 범위에서 뺐으므로(AC23),
 *   그 사람이 다음에 가구 목록을 다시 읽을 때 빠진 것을 알게 된다.
 */
export function useRemoveMember(householdId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      /**
       * ⚠ `.select()` 를 붙여 **몇 행이 지워졌는지** 확인한다.
       *   RLS 가 막으면 Postgres 는 오류가 아니라 **0행**을 돌려준다. 그대로 두면
       *   권한이 없는데도 "지워졌다" 로 보이고, 목록을 다시 읽어야 비로소 그대로인
       *   걸 알게 된다. 거부는 거부라고 말해야 한다.
       */
      const { data, error } = await supabase
        .from('household_members')
        .delete()
        .eq('household_id', householdId!)
        .eq('user_id', userId)
        .select('user_id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(DENIED);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: householdKeys.members(householdId) }),
  });
}

/** 관리자 지정 / 해제 — owner 만. 서버의 t05·t06 트리거가 최종 판정한다 */
export function useSetMemberRole(householdId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'owner' | 'member' }) => {
      const { data, error } = await supabase
        .from('household_members')
        .update({ role })
        .eq('household_id', householdId!)
        .eq('user_id', userId)
        .select('user_id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(DENIED); // RLS 거부 = 0행
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: householdKeys.members(householdId) });
      // 내 역할이 바뀌었을 수 있다 — 역할에 따라 화면의 버튼이 달라진다
      void qc.invalidateQueries({ queryKey: ['households', 'mine'] });
    },
  });
}

/**
 * 집 나가기 (본인 탈퇴).
 *
 * ⚠ 나간 뒤에는 캐시에 남아 있는 그 집의 물건·장소가 **전부 무효**다. 활성 가구만
 *   바꾸고 나머지를 두면 다음 화면에 남의 집 물건이 잠깐 비친다. 통째로 무효화한다.
 */
export function useLeaveHousehold() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (householdId: string) => {
      const uid = session?.user.id;
      if (!uid) throw new Error('로그인이 필요합니다.');
      const { error } = await supabase
        .from('household_members')
        .delete()
        .eq('household_id', householdId)
        .eq('user_id', uid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

// ─────────────────────────────────────────────────────────────
// 초대
// ─────────────────────────────────────────────────────────────

/**
 * 우리 집 초대 코드. **가구당 한 장**이고 만료가 없다 (2026-08-31 사용자 판단).
 *
 * 전에는 발급할 때마다 행이 하나씩 생기고 7일 뒤 만료되는 일회용 티켓이었다.
 * 가족 서너 명이 쓰는 앱에 유효기간·소비·목록 관리를 얹을 이유가 없었다.
 *
 * ⚠ 없을 수도 있다: 이 방식으로 바꾸기 전에 만들어진 집은 마이그레이션이 채워 넣지만,
 *   그래도 `maybeSingle` 로 받는다. 없을 때 화면이 "코드 만들기" 를 보여주는 편이,
 *   있다고 가정하고 터지는 것보다 낫다.
 */
export function useInvite(householdId: string | null) {
  return useQuery({
    queryKey: householdKeys.invite(householdId),
    enabled: !!householdId,
    queryFn: async (): Promise<Invite | null> => {
      const { data, error } = await supabase
        .from('invites')
        .select('id, code')
        .eq('household_id', householdId!)
        .maybeSingle();
      if (error) throw error;
      return data ? { id: data.id, code: data.code } : null;
    },
  });
}

/**
 * 코드 바꾸기 — 영구 코드에서 **유일한 회수 수단**이다.
 *
 * 코드가 만료되지 않으므로, 한 번 내보낸 사람이 코드를 기억하고 있으면 그대로 다시
 * 들어올 수 있다. 바꾸면 남이 가진 코드가 전부 한꺼번에 죽는다.
 *
 * ⚠ 새 코드는 **서버가** 만든다(`gen_invite_code`). 클라이언트가 만들어 보내면
 *   드물게 중복이 나고, 그 23505 를 사용자가 보게 된다.
 */
export function useRotateInvite(householdId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<Invite> => {
      const { data, error } = await supabase.rpc('rotate_invite', { p_household_id: householdId! });
      if (error) throw error;
      return { id: data.id, code: data.code };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: householdKeys.invite(householdId) }),
  });
}
