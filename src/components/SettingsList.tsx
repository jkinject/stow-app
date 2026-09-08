import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { IconChevron } from './Icon';
import { useTheme, type, radius, space } from '@/lib/theme';

/**
 * 설정 화면의 묶음 카드와 줄.
 *
 * 항목마다 전체폭 버튼을 세우면 화면이 버튼 목록이 된다. 성격이 비슷한 것끼리
 * 한 카드에 묶고 가는 선으로 나누면 훑어보기가 훨씬 쉽다.
 */

export function SettingsGroup({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[st.group, { backgroundColor: c.card }]}>{children}</View>
  );
}

export function SettingsRow({
  icon,
  label,
  value,
  onPress,
  danger,
  first,
}: {
  /** 색을 받는 함수 — 아이콘이 테마와 상태(위험)를 따라가야 한다 */
  icon: (color: string) => ReactNode;
  label: string;
  /** 오른쪽에 현재 값 (언어 = 한국어) */
  value?: string;
  onPress: () => void;
  danger?: boolean;
  /** 카드의 첫 줄이면 위 구분선을 그리지 않는다 */
  first?: boolean;
}) {
  const { c } = useTheme();
  const tint = danger ? c.danger : c.text;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        st.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
        pressed && { opacity: 0.6 },
      ]}
    >
      <View style={st.icon}>{icon(danger ? c.danger : c.textMuted)}</View>
      <Text style={[st.label, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text style={[st.value, { color: c.textMuted }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <IconChevron color={c.textFaint} />
    </Pressable>
  );
}

const st = StyleSheet.create({
  group: { borderRadius: radius.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.lg, paddingVertical: space.lg },
  icon: { width: 22, alignItems: 'center' },
  label: { flex: 1, fontSize: type.bodyStrong, fontWeight: '500' },
  value: { fontSize: type.body },
});

/**
 * 켜고 끄는 한 줄. 눌러서 어디로 가는 줄(`SettingsRow`)과 모양을 맞추되 오른쪽이 스위치다.
 * ⚠ 스위치 자체가 곧 동작이라 줄 전체를 누르게 두지 않는다 — 실수로 스치기만 해도 바뀐다.
 */
export function SettingsSwitchRow({
  icon,
  label,
  value,
  onValueChange,
  disabled,
  first,
}: {
  icon?: (color: string) => ReactNode;
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  first?: boolean;
}) {
  const { c } = useTheme();
  const tint = disabled ? c.textFaint : c.text;
  return (
    <View style={[st.row, !first && { borderTopWidth: 1, borderTopColor: c.border }]}>
      {icon ? <View style={st.icon}>{icon(tint)}</View> : null}
      <Text style={[st.label, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: c.accent }}
        accessibilityLabel={label}
      />
    </View>
  );
}
