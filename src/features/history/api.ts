import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

/**
 * 변경 이력 (AC21) · 휴지통 (AC24).
 *
 * `item_events` 는 **트리거만 쓴다** (RLS 에 insert 정책이 없다, P3). 여기서는 읽기만 한다.
 *
 * ⚠ 정렬은 반드시 `id` 다. `created_at` 의 `now()` 는 **트랜잭션 시작 시각**이라
 *   한 트랜잭션에서 생긴 이벤트들이 같은 값을 갖는다 — 시간순으로 정렬하면 순서가 뒤섞인다.
 *   테이블 주석에도 같은 경고가 달려 있다.
 */

export type ItemEvent = {
  id: number;
  type: 'created' | 'updated' | 'moved' | 'qty_changed' | 'deleted' | 'restored';
  payload: Record<string, unknown>;
  created_at: string;
  actor: { display_name: string | null } | null;
};

export function useItemHistory(itemId: string | null) {
  return useQuery({
    queryKey: ['item-history', itemId],
    enabled: !!itemId,
    queryFn: async (): Promise<ItemEvent[]> => {
      const { data, error } = await supabase
        .from('item_events')
        .select('id, type, payload, created_at, actor:profiles!item_events_actor_id_fkey(display_name)')
        .eq('item_id', itemId!)
        .order('id', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ItemEvent[];
    },
  });
}

/* ─────────────────────────── 휴지통 (AC24) ─────────────────────────── */

export type TrashRow = {
  id: string;
  name: string;
  deleted_at: string;
  kind: 'item' | 'container' | 'location';
  /** 물건·박스만 사진이 있다. 장소에는 사진 컬럼이 없다 */
  thumb_path: string | null;
};

/**
 * 지워진 것들. 30일 뒤 cron 이 하드삭제한다.
 *
 * ⚠ 세 테이블을 **따로** 조회해 합친다. 뷰를 만들면 마이그레이션이 필요하고,
 *   휴지통은 원래 비어 있는 게 정상이라 왕복 3번이 문제가 되지 않는다.
 */
export function useTrash(householdId: string | null) {
  return useQuery({
    queryKey: ['trash', householdId],
    enabled: !!householdId,
    staleTime: 10_000,
    queryFn: async (): Promise<TrashRow[]> => {
      const [items, containers, locations] = await Promise.all([
        supabase
          .from('items')
          // ⚠ 이름만으로는 무엇을 지웠는지 알기 어렵다 — 사진을 같이 가져온다(사용자 보고)
          .select('id, name, deleted_at, thumb_path')
          .eq('household_id', householdId!)
          .not('deleted_at', 'is', null),
        supabase
          .from('containers')
          .select('id, name, deleted_at, thumb_path')
          .eq('household_id', householdId!)
          .not('deleted_at', 'is', null),
        supabase
          .from('locations')
          .select('id, name, deleted_at')
          .eq('household_id', householdId!)
          .not('deleted_at', 'is', null),
      ]);
      if (items.error) throw items.error;
      if (containers.error) throw containers.error;
      if (locations.error) throw locations.error;

      const rows: TrashRow[] = [
        ...(items.data ?? []).map((r) => ({ ...r, kind: 'item' as const })),
        ...(containers.data ?? []).map((r) => ({ ...r, kind: 'container' as const })),
        // 장소에는 사진 컬럼이 없다 — 목록의 모양을 맞추려고 null 로 채운다.
        // ⚠ 타입 주석이 필요하다. 그냥 `null` 로 두면 리터럴 타입 `null` 로 좁혀져
        //   아래 filter 의 술어가 세 갈래를 하나로 합치지 못한다.
        ...(locations.data ?? []).map((r) => ({
          ...r,
          kind: 'location' as const,
          thumb_path: null as string | null,
        })),
      ].filter((r): r is TrashRow => !!r.deleted_at && !!r.name);
      return rows.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
    },
  });
}

/**
 * 복구 — `deleted_at` 을 null 로 되돌린다.
 *
 * ⚠ 박스를 복구해도 **안에 있던 물건은 돌아오지 않는다.** 박스를 지울 때 트리거
 *   `t45_detach_items` 가 물건의 `container_id` 를 null 로 풀어 장소 직속으로 남겼기
 *   때문이다(물건을 잃지 않으려는 의도적 설계). 복구된 박스는 비어 있고 물건은
 *   장소에 그대로 있다 — 화면에서 이 점을 말해 준다.
 */
export function useRestore(householdId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: TrashRow) => {
      const table =
        row.kind === 'item' ? 'items' : row.kind === 'container' ? 'containers' : 'locations';
      const { error } = await supabase.from(table).update({ deleted_at: null }).eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['trash', householdId] });
      void qc.invalidateQueries({ queryKey: ['items'] });
      void qc.invalidateQueries({ queryKey: ['containers'] });
      void qc.invalidateQueries({ queryKey: ['all-containers'] });
      void qc.invalidateQueries({ queryKey: ['locations'] });
      void qc.invalidateQueries({ queryKey: ['search'] });
      // 복구한 물건의 수량이 0 이면 구매 리스트에 들어간다 (트리거)
      void qc.invalidateQueries({ queryKey: ['shopping'] });
      void qc.invalidateQueries({ queryKey: ['category-list'] });
    },
  });
}

/* ─────────────────── 생성·수정자 표시 (AC20) ─────────────────── */

export type AuditInfo = {
  created_at: string;
  updated_at: string;
  updater: { display_name: string | null } | null;
};

/**
 * 박스·장소의 "누가 언제 고쳤는지".
 *
 * ⚠ 뷰(`container_summary`/`location_summary`)에서 조인할 수 없다 — **뷰는 FK 를
 *   갖지 않아** PostgREST 가 관계를 찾지 못한다. 기본 테이블에서 따로 읽는다.
 *   행 하나짜리 조회라 비용은 무시할 만하다.
 */
export function useAudit(table: 'containers' | 'locations', id: string | null) {
  return useQuery({
    queryKey: ['audit', table, id],
    enabled: !!id,
    queryFn: async (): Promise<AuditInfo | null> => {
      const sel =
        table === 'containers'
          ? 'created_at, updated_at, updater:profiles!containers_updated_by_fkey(display_name)'
          : 'created_at, updated_at, updater:profiles!locations_updated_by_fkey(display_name)';
      const { data, error } = await supabase.from(table).select(sel).eq('id', id!).maybeSingle();
      if (error) throw error;
      return (data as AuditInfo | null) ?? null;
    },
  });
}
