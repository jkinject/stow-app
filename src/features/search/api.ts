import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { supabase } from '@/lib/supabase';

import { buildEntry, matches, type SearchIndexEntry } from './hangul';

/**
 * 검색 (AC6~AC9).
 *
 * 계획 §4.6 의 전략:
 *   · 물건 전체를 **경량 필드만** 한 번 받아 로컬에 두고, 검색은 메모리에서 한다.
 *     서버 왕복 없이 타이핑에 즉시 반응해야 AC6(300ms)을 지킬 수 있다.
 *   · 동기화 페이로드에 `photo_path` 를 담지 않는다. 목록은 `thumb_path` 만 쓴다 (§4.9).
 *     실측 기준 12KB 대 121KB — 목록 스크롤에서 10배로 벌어진다.
 *   · 초성은 클라이언트 전담. `pg_trgm` 으로는 불가능하고, 수천 건 규모에선
 *     메모리 선형 탐색이 서버 왕복보다 빠르다.
 */

export type SearchRow = {
  id: string;
  name: string;
  /** 분류 이름 — 격자 카드에 보여준다 (AC-C9) */
  category: { name: string | null } | null;
  quantity: number;
  unit: string | null;
  thumb_path: string | null;
  location_id: string;
  container_id: string | null;
  updated_at: string;
};

export type Indexed = SearchRow & {
  entry: SearchIndexEntry;
  /** "현관 팬트리 › 3번 박스" — 결과 행에 바로 보여줄 경로 (AC7) */
  path: string;
};

export const searchKeys = {
  all: (householdId: string | null) => ['search', 'items', householdId] as const,
};

/**
 * 가구의 물건 전체를 경량 필드로 가져온다.
 * gcTime 을 길게 잡아 앱을 다시 열어도 마지막 목록이 남아 있게 한다 (AC9 오프라인 조회).
 */
export function useAllItems(householdId: string | null) {
  return useQuery({
    queryKey: searchKeys.all(householdId),
    enabled: !!householdId,
    staleTime: 30_000,
    queryFn: async (): Promise<SearchRow[]> => {
      const { data, error } = await supabase
        .from('items')
        .select('id, name, quantity, unit, thumb_path, location_id, container_id, updated_at, category:categories!items_category_id_fkey(name)')
        .eq('household_id', householdId!)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SearchRow[];
    },
  });
}

/** 장소·컨테이너 이름 사전 — 경로 문자열을 만드는 데 쓴다 */
export function useLocationNames(householdId: string | null) {
  return useQuery({
    queryKey: ['search', 'names', householdId],
    enabled: !!householdId,
    staleTime: 60_000,
    queryFn: async () => {
      const [loc, con] = await Promise.all([
        supabase.from('locations').select('id, name').eq('household_id', householdId!).is('deleted_at', null),
        supabase.from('containers').select('id, name').eq('household_id', householdId!).is('deleted_at', null),
      ]);
      if (loc.error) throw loc.error;
      if (con.error) throw con.error;
      return {
        locations: new Map((loc.data ?? []).map((l) => [l.id, l.name])),
        containers: new Map((con.data ?? []).map((c) => [c.id, c.name])),
      };
    },
  });
}

/**
 * 검색 인덱스를 만든다. 목록이 바뀔 때만 다시 계산한다 —
 * 타이핑마다 초성 변환을 다시 돌리면 AC6 예산을 태운다.
 */
export function useSearchIndex(householdId: string | null) {
  const items = useAllItems(householdId);
  const names = useLocationNames(householdId);

  const indexed = useMemo<Indexed[]>(() => {
    const rows = items.data ?? [];
    const locMap = names.data?.locations;
    const conMap = names.data?.containers;

    return rows.map((r) => {
      const loc = locMap?.get(r.location_id) ?? '';
      const con = r.container_id ? conMap?.get(r.container_id) : null;
      // 박스에 안 들어간 물건은 장소만 표시한다 (container_id 가 nullable 인 이유)
      const path = con ? `${loc} › ${con}` : loc;
      // 카테고리 이름도 검색 대상에 넣는다 — "화장품" 으로 그 분류의 물건들을 찾을 수 있다
      return { ...r, entry: buildEntry(r.name, r.category?.name ?? null), path };
    });
  }, [items.data, names.data]);

  return {
    indexed,
    isLoading: items.isLoading || names.isLoading,
    isFetching: items.isFetching,
    error: items.error ?? names.error,
    dataUpdatedAt: items.dataUpdatedAt,
    refetch: () => {
      void items.refetch();
      void names.refetch();
    },
  };
}

/** 실제 필터링. 순수 함수라 화면 밖에서도 테스트할 수 있다 */
export function filterItems(indexed: Indexed[], query: string): Indexed[] {
  const q = query.trim();
  if (!q) return indexed;
  return indexed.filter((i) => matches(i.entry, q));
}
