import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconChevron } from '@/components/Icon';
import { BottomSheet, SheetOption } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { useT } from '@/lib/i18n';
import { useTheme, type, radius, space } from '@/lib/theme';

import { useHousehold } from './context';

/**
 * 공간 전환 — **한 벌**이다 (2026-09-09).
 *
 * 한 사람이 집·사무실·본가처럼 여러 공간에 속할 수 있다. 앱은 한 번에 한 공간만 보여 주고
 * (요청이 "분리해서 관리" 다), 어느 공간인지는 `HouseholdProvider` 의 `activeId` 한 값이 정한다.
 * 그 값을 바꾸는 UI 는 이 시트 하나다. 더보기·찾기·보관 장소 탭이 전부 이걸 연다.
 *
 * ⚠ 전에는 보관 장소 탭에 칩 행이 따로 있었다. 두 군데서 각자 바꾸면 한쪽만 고쳐지는
 *   날이 온다 — 그 칩 행은 이 시트로 흡수했다.
 *
 * "공간 추가" 는 공간이 하나뿐이어도 보인다. 그게 두 번째 공간을 만드는 유일한 입구다.
 */
export function SpaceSheet({ onClose }: { onClose: () => void }) {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const { households, activeId, setActiveId } = useHousehold();

  function pick(id: string, name: string) {
    onClose();
    if (id === activeId) return;
    setActiveId(id);
    toast(t.space.switched(name));
  }

  return (
    <BottomSheet onClose={onClose} label={t.space.title}>
      {households.map((h) => (
        <SheetOption
          key={h.id}
          label={h.name}
          on={h.id === activeId}
          leading={<Tile name={h.name} on={h.id === activeId} />}
          onPress={() => pick(h.id, h.name)}
        />
      ))}
      <SheetOption
        label={t.space.add}
        accent
        divider
        leading={<Tile name="+" on={false} />}
        onPress={() => {
          onClose();
          router.push('/space/new');
        }}
      />
    </BottomSheet>
  );

  /** 이름 첫 글자 타일 — 목록 전체가 그림을 쓰므로 "추가" 줄에도 자리를 만든다 */
  function Tile({ name, on }: { name: string; on: boolean }) {
    return (
      <View style={[st.tile, { backgroundColor: on ? c.accent : c.sunk }]}>
        <Text style={[st.tileText, { color: on ? c.onAccent : c.textMuted }]}>{name.slice(0, 1)}</Text>
      </View>
    );
  }
}

/**
 * 헤더에 두는 작은 칩 — 활성 공간 이름 + 꺾쇠. 누르면 위 시트가 열린다.
 * 공간이 하나뿐이면 아무것도 그리지 않는다 — 바꿀 것이 없는데 칩이 있으면 소음이다.
 * (그때의 "추가" 입구는 더보기 프로필 카드가 맡는다.)
 */
export function SpaceChip() {
  const { c } = useTheme();
  const { households, active } = useHousehold();
  const [open, setOpen] = useState(false);
  if (households.length < 2 || !active) return null;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={({ pressed }) => [
          st.chip,
          { borderColor: c.border, backgroundColor: c.card },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text style={[st.chipText, { color: c.text }]} numberOfLines={1}>
          {active.name}
        </Text>
        <IconChevron color={c.textFaint} size={14} style={st.chevron} />
      </Pressable>
      {open && <SpaceSheet onClose={() => setOpen(false)} />}
    </>
  );
}

const st = StyleSheet.create({
  tile: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  tileText: { fontSize: type.label, fontWeight: '700' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingLeft: space.md,
    paddingRight: space.sm,
    paddingVertical: space.xs,
  },
  chipText: { fontSize: type.label, fontWeight: '600', maxWidth: 160 },
  chevron: { transform: [{ rotate: '90deg' }] },
});
