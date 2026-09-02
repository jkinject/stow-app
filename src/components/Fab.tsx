import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, type, overlay, space } from '@/lib/theme';

/**
 * 우측 하단 플로팅 버튼 — 찾기 탭, 장소 상세, 박스 상세가 같은 것을 쓴다.
 *
 * ⚠⚠ **아래 여백을 두 번 세지 않는다** (2026-09-02 사용자 지적 — 화면마다 여백이
 *   달라 보였다).
 *
 *   하단 탭이 있는 화면에서는 탭 막대가 **이미 안전영역만큼 자기 아래에 여백을 두고**
 *   있고, 화면 본문은 그 탭 막대 **위**에서 끝난다. 그래서 여기서 `bottom` 이 재는
 *   0 은 이미 탭 막대의 윗선이다 — 거기에 `insets.bottom` 을 또 더하면 그만큼 더
 *   떠올라 다른 화면보다 높이 앉는다.
 *
 *   탭이 없는 화면(박스·장소 상세)에서만 안전영역을 우리가 챙긴다.
 *   결과적으로 **두 경우 모두 "경계에서 GAP 만큼"** 으로 같아진다.
 */

/** 경계(탭 막대 윗선 또는 안전영역)에서 띄우는 거리 */
const GAP = space.xxl;

export function Fab({ onPress, tabBar = false }: { onPress: () => void; tabBar?: boolean }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        st.fab,
        { backgroundColor: c.accent, bottom: (tabBar ? 0 : insets.bottom) + GAP },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={[st.icon, { color: c.onAccent }]}>＋</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: space.xl,
    // ⚠ 지름과 반지름은 기하학이라 간격 토큰을 쓰지 않는다 (theme.ts 의 radius 주석 참고)
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    // 목록 위에 떠 있어야 하므로 그림자로 띄운다
    shadowColor: overlay.bg,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  /* ⚠ 기호를 상자 가운데 앉히는 값이다 — 읽는 행간이 아니므로 `leading` 을 쓰지 않는다 */
  icon: { fontSize: type.display, fontWeight: '600', lineHeight: 34 },
});
