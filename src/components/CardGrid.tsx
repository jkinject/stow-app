import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { space } from '@/lib/theme';

/**
 * 물건 카드 2열 격자의 **치수 한 벌.**
 *
 * ⚠⚠ 이 계산이 세 화면(찾기 탭 · 장소 상세 · 박스 상세)에 각자 적혀 있었다.
 *   그 자체로도 함정이지만(폭 계산과 스타일의 gap 이 어긋나면 카드 두 장이 1px
 *   넘쳐 **한 줄에 하나씩** 떨어진다 — 2026-09-02 에 실제로 겪었다), 값까지 갈렸다:
 *   찾기 탭만 좌우 여백이 16 이고 나머지는 20 이라 **같은 카드가 화면마다 폭이
 *   달랐다**(2026-09-06 점검). 한 곳에서 내보내면 어긋날 수가 없다.
 *
 * ⚠ `PADDING` 은 화면 좌우 여백(`space.xl`)과 같은 값이어야 한다 — 격자가 다른
 *   본문보다 안쪽에서 시작하면 목록만 들여쓴 것처럼 보인다.
 */
export const GRID_PADDING = space.xl;
export const GRID_GAP = space.md;
const COLUMNS = 2;

/** 카드 한 장의 폭. 남는 폭을 열 수만큼 정확히 나눈다 */
export function useCardWidth(): number {
  const win = useWindowDimensions();
  return (win.width - GRID_PADDING * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;
}

/**
 * 감싸기(flexWrap) 격자.
 *
 * ⚠ 찾기 탭은 이걸 쓰지 않는다 — 거기는 수천 건을 그려야 해서 `FlatList` 의
 *   가상화가 필요하다(`numColumns={2}`). 대신 **같은 상수**(GRID_PADDING · GRID_GAP)를
 *   가져다 쓰므로 치수는 어긋나지 않는다.
 */
export function CardGrid({ children }: { children: ReactNode }) {
  return <View style={st.grid}>{children}</View>;
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
});
