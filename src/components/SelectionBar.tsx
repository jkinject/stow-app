import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconX } from '@/components/Icon';
import { Button, TextButton } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { overlay, radius, space, type, useTheme } from '@/lib/theme';

/**
 * 고르는 중에 화면 아래에 뜨는 막대 — 몇 개를 골랐고 무엇을 할 수 있는지 (2026-09-21).
 *
 * ⚠ `Screen` 의 `float` 자리에 **FAB 대신** 들어간다. ＋는 이 앱 전체에서 "물건 등록"
 *   한 가지 뜻인데 고르는 중에 등록할 일은 없고, 자리도 정확히 겹친다.
 *
 * ⚠⚠ **본문 끝에 이 막대 높이만큼 여백을 따로 줘야 한다.** `Screen` 의 아래 여백은
 *   안전영역 + 40 로 고정이라 이 막대가 마지막 줄 카드를 덮는다. 이 컴포넌트는 떠 있는
 *   것이라 스스로 자리를 만들 수 없다 — 부르는 화면이 `BAR_SPACE` 만큼 비워 준다.
 */

/** 본문이 아래에 비워 둬야 하는 높이 (막대 + 위아래 숨통) */
export const BAR_SPACE = 92;

export function SelectionBar({
  count,
  allPicked,
  busy,
  onToggleAll,
  onCancel,
  onMove,
}: {
  count: number;
  /** 다 골랐는가 — 버튼 하나가 "전체 선택"/"선택 해제" 두 뜻을 겸한다 */
  allPicked: boolean;
  busy: boolean;
  onToggleAll: () => void;
  onCancel: () => void;
  onMove: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();

  return () => sub.remove();
    }, [busy, onCancel]),
  );

  return (
    <View
      style={[
        st.bar,
        {
          backgroundColor: c.card,
          borderTopColor: c.border,
          paddingBottom: insets.bottom + space.md,
        },
      ]}
    >
      {/* 나가기는 **왼쪽 끝**. 주 동작(이동)에서 제일 먼 자리다 — 붙여 두면 손이 미끄러진다 */}
      <Pressable
        onPress={onCancel}
        disabled={busy}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t.select.exit}
        style={({ pressed }) => [st.close, pressed && { opacity: 0.6 }]}
      >
        <IconX size={22} color={c.textMuted} />
      </Pressable>

      <Text style={[st.count, { color: c.text }]} numberOfLines={1}>
        {t.select.count(count)}
      </Text>

      <TextButton
        label={allPicked ? t.select.none : t.select.all}
        onPress={onToggleAll}
        size="small"
        disabled={busy}
      />

      {/* ⚠ 고른 게 없으면 누를 수 없다. 눌러도 아무 일이 없으면 고장으로 보인다 */}
      <Button
        label={t.select.move}
        onPress={onMove}
        size="small"
        busy={busy}
        disabled={count === 0}
      />
    </View>
  );
}

const st = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    // 목록 위에 떠 있다 — FAB 과 같은 이유로 그림자를 준다
    shadowColor: overlay.bg,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  close: { paddingVertical: space.xs },
  /** 개수가 늘 자리를 차지해 오른쪽 버튼들이 들썩이지 않게 한다 */
  count: { flex: 1, fontSize: type.bodyStrong, fontWeight: '700' },
});
