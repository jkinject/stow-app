import { useCallback, useMemo, useState } from 'react';

/**
 * 격자에서 물건 여러 개를 골라 **한 번에 옮기기** 위한 선택 상태 (2026-09-21 사용자 요청).
 *
 * 왜 필요한가: 박스 없이 장소에 쌓아 둔 물건이 수십 개가 된 뒤 박스를 사서 정리하면,
 * 지금은 물건 하나하나를 상세로 열고 → 이동 → 목적지 고르기를 개수만큼 반복해야 한다.
 * 스무 개면 예순 번을 누른다.
 *
 * ⚠ 고른 id 집합(`ids`)과 **화면에 실제로 있는 것**(`picked`)을 나눠 둔다.
 *   옮기고 나면 그 물건들은 이 목록에서 사라지고, 다른 기기에서 지워질 수도 있다.
 *   집합을 그대로 세면 "3개 선택" 이라고 써 놓고 화면에는 두 개만 켜져 있게 된다 —
 *   숫자와 눈에 보이는 것이 어긋나면 "이동" 을 눌러도 될지 판단할 수가 없다.
 */

const EMPTY: ReadonlySet<string> = new Set();

/** 하나 켜고 끄기. 집합을 **갈아끼운다** — 제자리에서 고치면 리렌더가 안 걸린다 */
export function toggleId(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(ids);
  if (!next.delete(id)) next.add(id);
  return next;
}

/**
 * 고른 것 중 **지금 목록에 있는 것만**, 목록 순서로.
 *
 * 순서를 목록에서 가져오는 이유: 옮길 때 서버로 보내는 순서이자 "18개 중 3개" 같은
 * 문구의 기준이라, 고른 순서(사람이 누른 순서)보다 화면 순서가 설명하기 쉽다.
 */
export function pickedIn(ids: ReadonlySet<string>, list: readonly string[]): string[] {
  if (ids.size === 0) return [];
  return list.filter((id) => ids.has(id));
}

/**
 * 격자 한 벌의 선택 상태.
 *
 * @param list 지금 화면에 그려진 물건 id 들. **호출하는 쪽에서 `useMemo` 로 감싼다** —
 *   렌더마다 새 배열을 만들면 아래 `picked` 도 매번 새 참조가 되어, 이걸 받는 쪽의
 *   memo 가 전부 헛돈다 (이 프로젝트에서 이미 `thumbs.ensure` 로 같은 함정을 겪었다).
 */
export function useSelection(list: readonly string[]) {
  const [active, setActive] = useState(false);
  const [ids, setIds] = useState<ReadonlySet<string>>(EMPTY);

  const picked = useMemo(() => pickedIn(ids, list), [ids, list]);
  /** 목록이 비어 있을 때 "전체 선택됨" 이라고 하지 않는다 — 고른 게 없는 것이다 */
  const allPicked = list.length > 0 && picked.length === list.length;

  /** 길게 눌러 들어오는 길 — 누른 그 물건이 첫 선택이다 */
  const start = useCallback((id: string) => {
    setActive(true);
    setIds(new Set([id]));
  }, []);

  /** 섹션 제목의 "선택" 으로 들어오는 길 — 아무것도 고르지 않은 채 시작한다 */
  const open = useCallback(() => {
    setActive(true);
    setIds(EMPTY);
  }, []);

  const toggle = useCallback((id: string) => setIds((s) => toggleId(s, id)), []);

  /** 다 골랐으면 해제, 아니면 전부 — 버튼 하나가 두 뜻을 겸한다 */
  const toggleAll = useCallback(() => {
    setIds((s) => (pickedIn(s, list).length === list.length ? EMPTY : new Set(list)));
  }, [list]);

  const exit = useCallback(() => {
    setActive(false);
    setIds(EMPTY);
  }, []);

  return { active, ids, picked, allPicked, start, open, toggle, toggleAll, exit };
}

export type Selection = ReturnType<typeof useSelection>;
