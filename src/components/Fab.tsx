import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, type, overlay } from '@/lib/theme';

/**
 * 우측 하단 플로팅 버튼 — 찾기 탭과 박스 상세가 같은 것을 쓴다.
 *
 * `tabBar` 는 하단 탭 위에 떠야 하는 화면에서 켠다. 탭이 없는 화면(박스 상세)에서
 * 그만큼 띄우면 허공에 뜬 것처럼 보인다.
 */
export function Fab({ onPress, tabBar = false }: { onPress: () => void; tabBar?: boolean }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        st.fab,
        { backgroundColor: c.accent, bottom: insets.bottom + (tabBar ? 18 : 24) },
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
    right: 18,
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
  icon: { fontSize: type.display, fontWeight: '600', lineHeight: 34 },
});
