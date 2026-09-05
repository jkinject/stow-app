import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconBoxes } from '@/components/Icon';
import { ModalHeader } from '@/components/Sheet';
import { Button, Empty, Loading, TextButton } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { space, type, useTheme } from '@/lib/theme';

import { useLocations } from './api';
import { useCoverStacks } from './covers';
import { LocationSheet } from './LocationSheet';
import { ICON, pickerSt, Target } from './PickerRow';

/**
 * 박스를 **통째로** 옮길 장소 고르기 (2026-09-05 사용자 요청).
 *
 * 물건 이동(`features/item/MovePicker`)과 **같은 줄**을 쓴다(`PickerRow`). 두 화면이
 * 하는 말이 같기 때문이다 — "여기로 옮긴다". 다르게 생기면 같은 동작을 두 번 배워야 한다.
 *
 * ⚠ 다만 목록은 **1단**이다. 박스는 장소에만 들어간다(박스 안의 박스는 없다).
 *   그래서 여기엔 접었다 펴는 것도, 장소 직속 줄도 없다.
 *
 * 한 번 누르면 바로 옮긴다 — 이동 화면의 규칙을 그대로 따른다. 되돌리는 것도
 * 같은 방식으로 한 번이면 되므로 확인 단계를 두지 않는다.
 *
 * ⚠ **안에 든 물건도 함께 간다는 것을 머리말에서 밝힌다.** 박스만 옮겨지고 물건은
 *   남는 줄 알면 누르기가 무섭다. 실제로는 DB 트리거가 안의 물건까지 옮긴다.
 */
export function BoxMovePicker({
  visible,
  householdId,
  currentLocationId,
  itemCount,
  busy,
  onPick,
  onClose,
}: {
  visible: boolean;
  householdId: string | null;
  currentLocationId: string | null;
  /** 이 박스에 든 물건 수 — 함께 옮겨진다고 알려 주려고 받는다 */
  itemCount: number;
  busy: boolean;
  /** `name` 은 방금 고른 장소의 보이는 이름. 부르는 쪽은 아직 옛 위치를 들고 있다 */
  onPick: (locationId: string, name: string) => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();

  const locations = useLocations(householdId);
  const locs = locations.data ?? [];
  const { cover, thumbs } = useCoverStacks(householdId);

  /** 지금 있는 곳 말고 갈 데가 있는가 — 없으면 만들 길을 앞세운다 */
  const others = locs.filter((l) => l.id !== currentLocationId);
  const [creating, setCreating] = useState(false);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={[pickerSt.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        <ModalHeader
          title={t.container.moveTitle}
          right={<TextButton label={t.common.close} onPress={onClose} disabled={busy} />}
        />

        {locations.isLoading ? (
          <Loading />
        ) : (
          <ScrollView
            contentContainerStyle={[pickerSt.body, { paddingBottom: insets.bottom + 32 }]}
          >
            {/* 안에 든 물건도 같이 간다 — 누르기 전에 알아야 하는 사실이다 */}
            {itemCount > 0 && (
              <Text style={[st.lead, { color: c.textMuted }]}>
                {t.container.moveWithItems(itemCount)}
              </Text>
            )}

            {others.length === 0 ? (
              /* ⚠ `pickerSt.rescue` 를 쓰지 않는다 — 그건 스크롤 밖에 놓일 때의
                   좌우 여백까지 들고 있어서, 이미 여백이 있는 이 안에서는 두 번 들어간다 */
              <View style={st.rescue}>
                <Empty text={t.container.moveNowhere} hint={t.container.moveNowhereHint} />
                <Button label={t.locSheet.title} onPress={() => setCreating(true)} />
              </View>
            ) : (
              <View style={pickerSt.group}>
                {locs.map((loc) => (
                  <Target
                    key={loc.id}
                    label={loc.name}
                    sub={t.places.summary(loc.container_count, loc.item_count)}
                    icon={<IconBoxes color={c.textFaint} size={ICON} />}
                    paths={cover.loc.get(loc.id)}
                    get={thumbs.get}
                    here={loc.id === currentLocationId}
                    busy={busy}
                    onPress={() => onPick(loc.id, loc.name)}
                  />
                ))}
              </View>
            )}

            {/* 목록이 있어도 새로 만들 수 있다 — 이동 화면과 같은 자리, 같은 문구 */}
            {others.length > 0 && (
              <TextButton
                label={`+ ${t.locSheet.title}`}
                onPress={() => setCreating(true)}
                style={pickerSt.addMore}
              />
            )}
          </ScrollView>
        )}

        <LocationSheet
          visible={creating}
          householdId={householdId}
          onClose={() => setCreating(false)}
        />
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  lead: { fontSize: type.caption, paddingHorizontal: space.xs },
  rescue: { gap: space.xs },
});
