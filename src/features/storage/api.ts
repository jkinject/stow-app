import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type LocationSummary = {
  id: string;
  name: string;
  note: string | null;
  sort_order: number;
  container_count: number;
  item_count: number;
  updated_at: string;
};

export type ContainerSummary = {
  id: string;
  location_id: string;
  name: string;
  qr_token: string;
  thumb_path: string | null;
  item_count: number;
  updated_at: string;
};

export type ItemRow = {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  container_id: string | null;
  location_id: string;
  thumb_path: string | null;
};

export const storageKeys = {
  locations: (hh: string) => ['locations', hh] as const,
  containers: (hh: string, locationId: string) => ['containers', hh, locationId] as const,
  containerItems: (containerId: string) => ['items', 'container', containerId] as const,
  loose: (locationId: string) => ['items', 'loose', locationId] as const,
};

/** 장소 목록. 박스·물건 개수는 뷰에서 집계해 N+1 을 피한다 */
export function useLocations(householdId: string | null) {
  return useQuery({
    queryKey: storageKeys.locations(householdId ?? ''),
    enabled: !!householdId,
    queryFn: async (): Promise<LocationSummary[]> => {
      const { data, error } = await supabase
        .from('location_summary')
        .select('id, name, note, sort_order, container_count, item_count, updated_at')
        .eq('household_id', householdId!)
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return (data ?? []) as LocationSummary[];
    },
  });
}

export function useCreateLocation(householdId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      // created_by/updated_by 는 보내지 않는다 — t10_stamp_actor 가 auth.uid() 로 스탬프한다 (P3)
      const { data, error } = await supabase
        .from('locations')
        .insert({ household_id: householdId, name: name.trim() })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: storageKeys.locations(householdId) }),
  });
}

/**
 * 장소 삭제 (soft).
 * ⚠ 하위에 박스나 물건이 남아 있으면 DB 트리거가 거부한다 (t45_guard_location).
 * 그 오류 메시지를 그대로 사용자에게 보여준다 — 몇 개가 남았는지 서버가 알려준다.
 */
export function useDeleteLocation(householdId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('locations')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: storageKeys.locations(householdId) }),
  });
}

/** 장소 안의 컨테이너 목록 */
export function useContainers(householdId: string | null, locationId: string) {
  return useQuery({
    queryKey: storageKeys.containers(householdId ?? '', locationId),
    enabled: !!householdId && !!locationId,
    queryFn: async (): Promise<ContainerSummary[]> => {
      const { data, error } = await supabase
        .from('container_summary')
        .select('id, location_id, name, qr_token, thumb_path, item_count, updated_at')
        .eq('location_id', locationId)
        .order('name');
      if (error) throw error;
      return (data ?? []) as ContainerSummary[];
    },
  });
}

/**
 * 박스가 생겼을 때 다시 읽어야 하는 목록들.
 *
 * ⚠ 예전에는 `storageKeys.containers(hh, locationId)` **하나만** 비웠다. 그래서
 *   장소 화면에서 박스를 만든 뒤 물건 이동 화면(`useAllContainers`)을 열면 방금 만든
 *   박스가 안 보였다 — staleTime 30초 동안. 장소 목록의 박스 개수도 옛 값이었다.
 *   목록이 여러 개면 만든 곳만 고쳐 놓고 끝내면 안 된다.
 */
function invalidateContainerViews(
  qc: ReturnType<typeof useQueryClient>,
  householdId: string,
  locationId: string,
) {
  void qc.invalidateQueries({ queryKey: storageKeys.containers(householdId, locationId) });
  void qc.invalidateQueries({ queryKey: ['all-containers'] });  // 이동 화면의 목적지 목록
  void qc.invalidateQueries({ queryKey: storageKeys.locations(householdId) }); // 박스 개수
}

/** 컨테이너 생성. qr_token 은 DB default 로 자동 발급된다 (AC10) */
export function useCreateContainer(householdId: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('containers')
        .insert({ household_id: householdId, location_id: locationId, name: name.trim() })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateContainerViews(qc, householdId, locationId),
  });
}

/**
 * 장소를 **인자로 받는** 박스 생성.
 *
 * 위의 `useCreateContainer` 는 장소 하나에 묶여 있어, 여러 장소가 한 화면에 나열되는
 * 이동 화면에서는 쓸 수 없다 — 훅을 반복문 안에서 부를 수 없기 때문이다.
 */
export function useCreateContainerIn(householdId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ locationId, name }: { locationId: string; name: string }) => {
      if (!householdId) throw new Error('가구 정보가 없습니다.');
      const { data, error } = await supabase
        .from('containers')
        .insert({ household_id: householdId, location_id: locationId, name: name.trim() })
        .select('id, name')
        .single();
      if (error) throw error;
      return data as { id: string; name: string };
    },
    onSuccess: (_d, v) => invalidateContainerViews(qc, householdId!, v.locationId),
  });
}

/**
 * 컨테이너 삭제 (soft).
 * 안의 물건은 사라지지 않는다 — t45_detach_items 가 장소 직속으로 분리한다 (M3 완료조건).
 */
export function useDeleteContainer(householdId: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('containers')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: storageKeys.containers(householdId, locationId) });
      qc.invalidateQueries({ queryKey: storageKeys.locations(householdId) });
    },
  });
}

/** 컨테이너 안의 물건 */
export function useContainerItems(containerId: string) {
  return useQuery({
    queryKey: storageKeys.containerItems(containerId),
    enabled: !!containerId,
    queryFn: async (): Promise<ItemRow[]> => {
      const { data, error } = await supabase
        .from('items')
        .select('id, name, category, quantity, container_id, location_id, thumb_path')
        .eq('container_id', containerId)
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });
}

/** 박스에 안 들어가고 장소에 직접 놓인 물건 (냉장고 우유, 신발장 우산) */
export function useLooseItems(locationId: string) {
  return useQuery({
    queryKey: storageKeys.loose(locationId),
    enabled: !!locationId,
    queryFn: async (): Promise<ItemRow[]> => {
      const { data, error } = await supabase
        .from('items')
        .select('id, name, category, quantity, container_id, location_id, thumb_path')
        .eq('location_id', locationId)
        .is('container_id', null)
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });
}

/**
 * QR 토큰으로 박스를 찾는다 (AC12 · AC14).
 *
 * ⚠ 타 가구의 토큰은 RLS 가 걸러서 **0행**으로 돌아온다. 에러가 아니라 빈 결과다.
 *   그래서 `.single()` 이 아니라 `.maybeSingle()` 을 쓴다 — single() 은 0행일 때
 *   예외를 던져서 "없는 QR" 과 "네트워크 실패" 를 구분할 수 없게 만든다.
 *   이 구분이 AC14 의 안내 문구를 가른다.
 *
 * retry:false 인 이유: 없는 QR 을 3번 다시 물어봐도 없다. AC12 의 2초를 태울 뿐이다.
 */
export function useContainerByToken(token: string | null) {
  return useQuery({
    queryKey: ['container-by-token', token],
    enabled: !!token,
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<ContainerSummary | null> => {
      const { data, error } = await supabase
        .from('container_summary')
        // ⚠ 뷰가 이미 `deleted_at is null` 로 걸러져 있고 그 컬럼을 노출하지도 않는다.
        //   여기서 .is('deleted_at', null) 을 걸면 없는 컬럼이라 쿼리가 통째로 실패한다.
        .select('id, location_id, name, qr_token, thumb_path, item_count, updated_at')
        .eq('qr_token', token!)
        .maybeSingle();
      if (error) throw error;
      return (data as ContainerSummary | null) ?? null;
    },
  });
}

/**
 * 가구의 모든 박스 (AC11 — 라벨 인쇄용).
 *
 * 장소별로 나눠 받지 않고 한 번에 가져온다. 라벨 인쇄는 "이번에 정리한 것들을
 * 한 장에 몰아 찍는" 작업이라 장소를 넘나든다. 장소별로 21장씩 찍으면 종이가 남는다.
 */
export function useAllContainers(householdId: string | null) {
  return useQuery({
    queryKey: ['all-containers', householdId],
    enabled: !!householdId,
    staleTime: 30_000,
    queryFn: async (): Promise<ContainerSummary[]> => {
      const { data, error } = await supabase
        .from('container_summary')
        .select('id, location_id, name, qr_token, thumb_path, item_count, updated_at')
        .eq('household_id', householdId!)
        .order('name');
      if (error) throw error;
      return (data ?? []) as ContainerSummary[];
    },
  });
}

/**
 * 박스 수정 — 박스 상세 화면에서 쓴다.
 *
 * **컨테이너 id 만으로** 동작한다. 상세 화면은 장소를 거치지 않고 QR 딥링크로 바로
 * 들어올 수 있어서, 장소 기준 캐시 키를 만들 수 없기 때문이다.
 *
 * ⚠ 무효화할 곳이 많다. 박스 이름은 박스 상세·장소의 박스 목록·라벨 인쇄 목록·
 *   검색 결과의 경로 문자열에 동시에 떠 있다. 하나라도 빠뜨리면 이름을 고쳤는데
 *   다른 화면엔 옛 이름이 남아 "저장이 안 됐나?" 하게 된다.
 */
/**
 * 박스 수정 — 이름만. 메모는 없앴다 (2026-08-31 사용자 요청).
 * 설정 폼에만 있고 **어디에도 표시되지 않아** 적어도 보이지 않았다.
 * DB 의 `containers.note` 컬럼은 남겨 둔다 — 지우면 이미 적어 둔 내용이 사라진다.
 */
export function useUpdateContainer(containerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { name?: string; note?: string | null }) => {
      const { error } = await supabase.from('containers').update(patch).eq('id', containerId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['container', containerId] });
      void qc.invalidateQueries({ queryKey: ['container-by-token'] });
      void qc.invalidateQueries({ queryKey: ['containers'] });
      void qc.invalidateQueries({ queryKey: ['all-containers'] });
      void qc.invalidateQueries({ queryKey: ['search'] }); // 경로 문자열에 박스 이름이 들어간다
    },
  });
}

/**
 * 박스 삭제 (soft delete).
 * 안의 물건은 지워지지 않는다 — 트리거 t45_detach_items 가 `container_id` 를 null 로
 * 풀어 장소 직속으로 남긴다. 물건을 잃는 것보다 낫다는 판단이다 (§M3).
 */
export function useDeleteContainerById(containerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('containers')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', containerId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['containers'] });
      void qc.invalidateQueries({ queryKey: ['all-containers'] });
      void qc.invalidateQueries({ queryKey: ['locations'] });
      void qc.invalidateQueries({ queryKey: ['items'] });
      void qc.invalidateQueries({ queryKey: ['search'] });
    },
  });
}

/**
 * 장소 수정 (이름·메모).
 *
 * ⚠ 예전 `useRenameLocation` 은 **어떤 화면에서도 호출되지 않았다** — 훅만 있고
 *   이름을 바꿀 경로가 없었다(사용자 보고). 게다가 무효화가 `locations` 하나뿐이라
 *   붙였더라도 다른 화면엔 옛 이름이 남았을 것이다.
 *
 * 장소 이름은 **장소 목록 · 박스 상세의 경로 · 물건 상세의 경로 · 검색 결과의 경로 ·
 * 등록 화면 헤더 · 라벨 인쇄물**에 동시에 나타난다. 하나라도 빠뜨리면
 * "이름을 고쳤는데 저기엔 옛 이름" 이 된다.
 */
export function useUpdateLocation(locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { name?: string; note?: string | null }) => {
      const { error } = await supabase.from('locations').update(patch).eq('id', locationId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['locations'] });
      void qc.invalidateQueries({ queryKey: ['search'] });        // 경로 문자열
      void qc.invalidateQueries({ queryKey: ['containers'] });
      void qc.invalidateQueries({ queryKey: ['all-containers'] });
      void qc.invalidateQueries({ queryKey: ['add-context'] });   // 등록 화면 헤더
      void qc.invalidateQueries({ queryKey: ['item'] });          // 물건 상세의 장소 이름
    },
  });
}
