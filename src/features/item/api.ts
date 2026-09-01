import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ImageSource } from 'expo-image';

import { supabase } from '@/lib/supabase';


/* ────────────────────────── 물건 상세 · 수정 ────────────────────────── */

export type ItemDetail = {
  id: string;
  household_id: string;
  location_id: string;
  container_id: string | null;
  name: string;
  category_id: string | null;
  quantity: number;
  threshold: number | null;
  unit: string | null;
  purchase_url: string | null;
  note: string | null;
  photo_path: string | null;
  thumb_path: string | null;
  created_at: string;
  updated_at: string;
  /** 마지막으로 고친 사람 (AC20) — 표시 이름은 profiles 에서 온다 */
  updater: { display_name: string | null } | null;
  /** 들어 있는 박스. 박스 없이 장소에 직접 둔 물건이면 null */
  container: { name: string | null } | null;
  /** 분류. 카테고리를 지우면 DB 가 여기를 null 로 만든다 (ON DELETE SET NULL) */
  category: { id: string; name: string | null } | null;
};

export const itemKeys = {
  detail: (id: string) => ['item', id] as const,
};

/**
 * 물건 한 건의 전체 필드.
 *
 * ⚠ profiles 로 가는 FK 가 `created_by` / `updated_by` 두 개라 PostgREST 가
 *   어느 쪽인지 모른다. 제약 이름(`items_updated_by_fkey`)으로 찍어 줘야 한다.
 *   안 그러면 "Could not embed" 로 조회 자체가 실패한다.
 */
export function useItem(itemId: string | null) {
  return useQuery({
    queryKey: itemKeys.detail(itemId ?? ''),
    enabled: !!itemId,
    queryFn: async (): Promise<ItemDetail | null> => {
      const { data, error } = await supabase
        .from('items')
        // ⚠ 한 줄 리터럴이어야 한다. 문자열을 이어붙이면 PostgREST 타입 추론이 깨져
        //   data 가 GenericStringError 가 된다.
        .select(
          'id, household_id, location_id, container_id, name, category_id, quantity, threshold, unit, purchase_url, note, photo_path, thumb_path, created_at, updated_at, updater:profiles!items_updated_by_fkey(display_name), container:containers!items_container_id_fkey(name), category:categories!items_category_id_fkey(id, name)',
        )
        .eq('id', itemId!)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return (data as ItemDetail | null) ?? null;
    },
  });
}

/**
 * 상세 화면의 큰 사진. 목록의 썸네일과 달리 한 장뿐이라 매번 서명해도 된다 (§4.9).
 *
 * ⚠ 썸네일과 **같은 이유로** URL 이 아니라 `{ uri, cacheKey }` 를 돌려준다.
 *   서명 URL 은 발급할 때마다 토큰이 달라져서, 그대로 쓰면 상세 화면에 들어올 때마다
 *   같은 사진을 통째로 다시 내려받는다. 자세한 근거는 features/item/thumbs.ts 참고.
 */
export function useItemPhotoUrl(photoPath: string | null | undefined) {
  return useQuery({
    queryKey: ['item-photo', photoPath],
    enabled: !!photoPath,
    // 서명 TTL 1시간보다 짧게 잡아 화면에 오래 떠 있어도 끊기지 않게 한다
    staleTime: 50 * 60_000,
    queryFn: async (): Promise<ImageSource | null> => {
      const { data, error } = await supabase.storage
        .from('item-photos')
        .createSignedUrl(photoPath!, 3600);
      if (error) throw error;
      return data?.signedUrl ? { uri: data.signedUrl, cacheKey: photoPath! } : null;
    },
  });
}

export type ItemPatch = {
  name?: string;
  category_id?: string | null;
  quantity?: number;
  threshold?: number | null;
  unit?: string | null;
  purchase_url?: string | null;
  note?: string | null;
};

/**
 * 이 물건이 보이는 **모든 목록**을 다시 불러온다.
 *
 * 물건 하나는 최소 세 곳에 동시에 떠 있다 — 박스 내용물, 장소의 낱개 목록, 검색 인덱스.
 * 상세에서 이름을 고쳤는데 뒤로 갔더니 옛 이름이면 "저장이 안 됐나?" 하고 다시 고친다.
 */
function invalidateItemViews(qc: ReturnType<typeof useQueryClient>, itemId: string) {
  void qc.invalidateQueries({ queryKey: itemKeys.detail(itemId) });
  void qc.invalidateQueries({ queryKey: ['items'] });           // 박스 내용물 · 낱개 목록
  void qc.invalidateQueries({ queryKey: ['search'] });          // 검색 인덱스 (찾기 격자)
  void qc.invalidateQueries({ queryKey: ['locations'] });       // 장소별 물건 수
  void qc.invalidateQueries({ queryKey: ['all-containers'] });
  void qc.invalidateQueries({ queryKey: ['containers'] });      // 장소별 박스 목록의 물건 수
  void qc.invalidateQueries({ queryKey: ['category-list'] });   // 카테고리별 물건 수
  /**
   * ⚠ 구매 리스트도 반드시 비운다.
   *   수량이 0 이 되거나 0 에서 벗어나면 **DB 트리거**가 shopping_list 를 고친다.
   *   그 변화는 앱이 모르므로, 여기서 다시 읽게 하지 않으면 "살 것" 탭이 옛 목록을
   *   그대로 보여준다 — 채워 넣었는데 목록에 그대로 남아 있는 것으로 보인다(실사용 보고).
   *   서버가 조용히 바꾸는 것은 우리가 명시적으로 다시 읽어야 한다.
   */
  void qc.invalidateQueries({ queryKey: ['shopping'] });
}

/**
 * 물건 수정.
 *
 * `updated_by` / `updated_at` 은 **보내지 않는다.** 트리거 t10 이 auth.uid() 로 덮어쓰고,
 * t30 이 변경 이력을 남긴다. 클라이언트가 보낸 값은 어차피 무시된다 (P3).
 */
export function useUpdateItem(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ItemPatch): Promise<ItemDetail> => {
      const { data, error } = await supabase
        .from('items')
        .update(patch)
        .eq('id', itemId)
        .is('deleted_at', null)
        // ⚠ 한 줄 리터럴이어야 한다. 문자열을 이어붙이면 PostgREST 타입 추론이 깨져
        //   data 가 GenericStringError 가 된다.
        .select(
          'id, household_id, location_id, container_id, name, category_id, quantity, threshold, unit, purchase_url, note, photo_path, thumb_path, created_at, updated_at, updater:profiles!items_updated_by_fkey(display_name), container:containers!items_container_id_fkey(name), category:categories!items_category_id_fkey(id, name)',
        )
        .single();
      if (error) throw error;
      /**
       * ⚠⚠ 무효화를 `onSuccess` 가 아니라 **여기서** 한다.
       *
       *   `useMutation` 의 onSuccess 는 그 컴포넌트의 observer 에 매여 있다. 화면을
       *   떠나며 저장하는 경로(물건 상세의 메모 — item/[id].tsx 의 AutoField 주석
       *   참고)에서는 응답이 **언마운트 뒤에** 도착해서 onSuccess 가 통째로 건너뛰어진다.
       *   그러면 DB 는 바뀌었는데 캐시는 옛 값 그대로다 — 저장했는데 안 된 것처럼
       *   보이는, 아무것도 안 된 것보다 나쁜 상태다(2026-09-02 실기기에서 확인).
       *
       *   mutationFn 은 observer 와 무관하게 끝까지 실행되므로 여기 두면 반드시 돈다.
       */
      const item = data as ItemDetail;
      invalidateItemViews(qc, item.id);
      return item;
    },
  });
}

/**
 * 수량 증감 (AC15).
 *
 * ⚠ 화면에서 읽은 값에 더해서 쓰면 안 된다. 두 사람이 동시에 −1 하면 한 번만 반영된다.
 *   RPC 는 DB 안에서 `quantity + delta` 를 계산하므로 동시성에 안전하다.
 *   폼에서 숫자를 직접 고치는 것은 "이 값으로 정한다" 는 뜻이라 일반 update 가 맞다.
 */
export function useAdjustQuantity(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (delta: number) => {
      // RPC 는 items 행을 그대로 돌려준다 — updater 조인은 없다.
      // 어차피 무효화만 하면 되므로 전체 타입을 주장하지 않는다.
      const { error } = await supabase.rpc('adjust_item_quantity', {
        p_item_id: itemId,
        p_delta: delta,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateItemViews(qc, itemId),
  });
}

/**
 * 물건 삭제 — 하드 삭제가 아니라 `deleted_at` 을 채운다 (AC22).
 * DB 에는 items 하드 DELETE 를 막는 규칙이 있고, 이력은 item_events 에 남는다.
 */
export function useDeleteItem(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('items')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', itemId)
        .is('deleted_at', null);
      if (error) throw error;
    },
    onSuccess: () => invalidateItemViews(qc, itemId),
  });
}

/**
 * 물건을 다른 박스(또는 장소 직속)로 옮긴다.
 *
 * ⚠ `location_id` 를 직접 계산해 보내지 않는다. 트리거 `t20_enforce_container_location`
 *   이 컨테이너의 장소로 **자동 정렬**하기 때문이다. 클라이언트가 계산한 값을 같이
 *   보내면 어긋났을 때 조용히 덮어써져 "왜 다른 장소에 있지?" 가 된다.
 *   대신 박스에서 빼내 장소 직속으로 둘 때는 트리거가 관여하지 않으므로
 *   `location_id` 를 반드시 함께 지정해야 한다.
 */
export function useMoveItem(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (target: { containerId: string } | { locationId: string }) => {
      const patch =
        'containerId' in target
          ? { container_id: target.containerId }              // 장소는 트리거가 맞춘다
          : { container_id: null, location_id: target.locationId };
      const { error } = await supabase
        .from('items')
        .update(patch)
        .eq('id', itemId)
        .is('deleted_at', null);
      if (error) throw error;
    },
    // 옮기면 **떠난 곳과 도착한 곳** 두 목록이 모두 바뀐다. 한쪽만 갱신하면
    // 원래 박스에 물건이 남아 있는 것처럼 보인다.
    onSuccess: () => invalidateItemViews(qc, itemId),
  });
}
