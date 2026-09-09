import { useEffect, useRef } from 'react';

import type { Household } from './api';
import { useHousehold } from './context';

/**
 * 상세 화면이 **자기 공간으로 활성 공간을 맞춘다** (2026-09-09).
 *
 * 물건·박스 상세는 id 만으로 열린다 — QR 딥링크, 소비기한 알림 탭, 앞으로 생길 어떤
 * 진입로든. RLS 는 내가 속한 모든 공간을 허용하므로 다른 공간의 것도 열리는데, 그 화면의
 * 하위 목록·이동·등록은 전부 `activeId` 를 쓴다. 맞춰 주지 않으면 사무실 물건을 보면서
 * 집 장소 목록으로 옮기게 된다.
 *
 * 진입로마다 고치지 않고 **상세 화면 한 곳**에서 잡는다. 진입로는 늘어나도 상세는 둘뿐이다.
 *
 * 루프는 없다: 상세 질의 키(`['item', id]`, `['container', id]`)에 가구 id 가 없어 전환해도
 * 데이터가 안 바뀌고, 한 번 맞추면 조건이 꺼진다.
 *
 * 바꿨으면 `onSwitched(새 공간)` 을 부른다. 토스트는 부르는 화면이 띄운다 — 이 훅은
 * 토스트 컨텍스트를 모르고, 화면마다 문구가 다를 수 있다.
 * (처음엔 `switched` 상태를 돌려줬는데, effect 안의 setState 를 lint 가 막는다. 콜백이 더 곧다.)
 */
export function useEnsureActive(
  householdId: string | null | undefined,
  onSwitched?: (household: Household) => void,
): void {
  const { activeId, setActiveId, households } = useHousehold();
  // 콜백은 ref 로 — 부르는 쪽이 인라인 화살표를 넘겨도 effect 가 매 렌더 돌지 않게
  const cb = useRef(onSwitched);
  useEffect(() => {
    cb.current = onSwitched;
  });

  useEffect(() => {
    if (!householdId || householdId === activeId) return;
    // 내 공간이 아니면(목록에 없으면) 손대지 않는다 — 그럴 일은 RLS 가 막지만, 막는 쪽이 최종이 아니다
    const target = households.find((h) => h.id === householdId);
    if (!target) return;
    setActiveId(householdId);
    cb.current?.(target);
  }, [householdId, activeId, households, setActiveId]);
}
