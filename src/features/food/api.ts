import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useMemo } from 'react';

import { itemPath, useAllItems, useLocationNames, type SearchRow } from '@/features/search/api';
import { supabase } from '@/lib/supabase';

import type {
  InventoryLine,
  Locale,
  RecipeResult,
} from '../../../supabase/functions/_shared/recipeSpec';

/**
 * 음식 탭 (2026-09-29 사용자 요청).
 *
 * "음식" 의 정의는 하나다 — **소비기한(`expires_on`)이 있는 물건.** 카테고리를 보지 않는다
 * (사용자 결정 Q1). 카테고리는 가구마다 사용자가 편집하는 표라 이름으로는 못 믿고, 영어
 * 시드에는 'Food' 자체가 없다. 대가: 기한을 안 넣은 식품은 여기 안 보이고, 기한을 넣은
 * 약·화장품은 보인다. 빈 상태가 이걸 가르친다.
 *
 * ⚠ 목록을 **따로 조회하지 않는다.** 찾기 탭이 이미 가구의 물건 전체를 경량 필드로 들고
 *   있다(`useAllItems`, 30초 stale). 거기서 거른다 — 같은 물건이 화면마다 다른 시점의
 *   값으로 보이는 일이 없고, 요청도 늘지 않는다.
 *
 * ⚠ 규격 타입은 Edge Function 과 **같은 파일**에서 가져온다(`_shared/recipeSpec`).
 *   `import type` 이라 번들에는 아무것도 안 들어간다 — 그 폴더는 앱 tsc 대상도 아니다.
 *   두 벌로 적어 두면 한쪽만 고쳐진다.
 */

export type FoodItem = SearchRow & { path: string; expires_on: string };

export function useFoodItems(householdId: string | null) {
  const all = useAllItems(householdId);
  const names = useLocationNames(householdId);
  const data = useMemo(() => {
    if (!all.data) return undefined;
    return all.data
      .filter((r): r is SearchRow & { expires_on: string } => !!r.expires_on)
      .map((r) => ({ ...r, path: itemPath(r, names.data) }))
      /* 이름순. 기한순은 이 집 데이터(대용량·장기)에선 뜻이 없다 — 사용자 결정 */
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [all.data, names.data]);
  return { data, isLoading: all.isLoading, refetch: all.refetch };
}

/* ────────────────────────── 저장된 추천 ────────────────────────── */

export type RecipeSet = {
  id: string;
  cache_key: string;
  generation: number;
  locale: Locale;
  hint: string;
  model: string;
  inventory: InventoryLine[];
  result: RecipeResult;
  created_at: string;
};

export type CurrentRecipes = { revision: number; set: RecipeSet } | null;

export const foodKeys = {
  current: (hh: string | null) => ['food-current', hh] as const,
};

/**
 * 가구의 **지금 보이는** 추천 세트. 없으면 null (아직 한 번도 안 받음).
 *
 * 서버에 있는 이유: "레시피는 참고용이지만 바뀌면 안 된다" (사용자 결정 Q4). 탭을 다시 열어도,
 * 앱을 껐다 켜도, 가족 폰에서 봐도 같아야 하고, 바뀌는 건 "다른 레시피 추천" 을 눌렀을 때뿐.
 */
export function useCurrentRecipes(householdId: string | null) {
  return useQuery({
    queryKey: foodKeys.current(householdId),
    enabled: !!householdId,
    staleTime: 30_000,
    queryFn: async (): Promise<CurrentRecipes> => {
      const { data, error } = await supabase
        .from('food_recipe_current')
        // ⚠ 한 줄 리터럴 — 문자열을 이어붙이면 PostgREST 타입 추론이 깨진다 (item/api.ts 와 같은 이유)
        .select('revision, set:food_recipe_sets!food_recipe_current_set_id_fkey(id, cache_key, generation, locale, hint, model, inventory, result, created_at)')
        .eq('household_id', householdId!)
        .maybeSingle();
      if (error) throw error;
      if (!data || !data.set) return null;
      return { revision: data.revision, set: data.set as unknown as RecipeSet };
    },
  });
}

/* ────────────────────────── 추천 받기 ────────────────────────── */

export type GenerateArgs = {
  intent: 'initial' | 'replace';
  hint: string;
  locale: Locale;
  /** `useCurrentRecipes` 가 준 revision. 없으면 0 */
  expectedRevision: number;
  /** 오늘 YYYY-MM-DD — 기한 판정은 사용자의 달력 기준 */
  today: string;
};

export type GenerateResult = {
  set: RecipeSet;
  revision: number;
  cache_hit: boolean;
  remaining_today: number;
};

/** Edge Function 이 돌려주는 실패. `code` 로 문구를 고른다 — 서버 메시지는 사용자용이 아니다 */
export class GenerateError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public revision?: number,
  ) {
    super(message);
  }
}

/**
 * 레시피 추천 호출.
 *
 * ⚠ 버튼 한 번 = `request_id` 하나. 서버가 이 id 로 재전송을 묶는다 — 네트워크가 흔들려
 *   같은 요청이 두 번 도착해도 두 번 만들지 않는다.
 * ⚠ 성공하면 응답을 **캐시에 직접 써 넣는다.** invalidate 만 하면 한 번 더 왕복이고,
 *   응답에 이미 세트 전체가 있다.
 */
export function useGenerateRecipes(householdId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: GenerateArgs): Promise<GenerateResult> => {
      if (!householdId) throw new GenerateError('NO_HOUSEHOLD', 'no household', 0);
      const { data, error } = await supabase.functions.invoke('food-recipes', {
        body: {
          household_id: householdId,
          locale: args.locale,
          intent: args.intent,
          hint: args.hint,
          // ⚠ 전역 `crypto` 가 아니다 — RN(Hermes)엔 없어서 "Property 'crypto' doesn't exist" 로
          //   터진다(시뮬레이터 검증에서 확인, 2026-09-29). 등록 화면과 같은 expo-crypto 를 쓴다.
          request_id: Crypto.randomUUID(),
          expected_revision: args.expectedRevision,
          today: args.today,
        },
      });
      if (error) {
        /**
         * ⚠ supabase-js 는 2xx 가 아니면 본문을 버리고 `FunctionsHttpError` 만 준다.
         *   우리 오류 코드는 본문에 있다 — `context`(Response)에서 다시 읽는다.
         */
        const ctx = (error as { context?: Response }).context;
        let code = 'UNKNOWN';
        let message = error.message;
        let revision: number | undefined;
        let status = 0;
        if (ctx && typeof ctx.json === 'function') {
          status = ctx.status;
          try {
            const body = await ctx.json();
            code = body?.error?.code ?? code;
            message = body?.error?.message ?? message;
            revision = typeof body?.revision === 'number' ? body.revision : undefined;
          } catch {
            // 본문이 JSON 이 아니면 기본값으로
          }
        }
        throw new GenerateError(code, message, status, revision);
      }
      const res = data as GenerateResult;
      // ⚠ 값을 먼저 변수에 담고 함수형으로 넘긴다 — 객체 리터럴을 바로 주면 TanStack 의
      //   Updater 오버로드 추론이 `null` 을 포함한 유니온에서 엉뚱한 쪽을 고른다(tsc 실패로 확인)
      const next: CurrentRecipes = { revision: res.revision, set: res.set };
      qc.setQueryData<CurrentRecipes>(foodKeys.current(householdId), () => next);
      return res;
    },
    /** 서버가 "누가 먼저 바꿨다" 고 하면 최신을 다시 읽는다 — 그래야 다음 시도의 revision 이 맞는다 */
    onError: (e) => {
      if (e instanceof GenerateError && e.code === 'REVISION_MISMATCH') {
        void qc.invalidateQueries({ queryKey: foodKeys.current(householdId) });
      }
    },
  });
}
