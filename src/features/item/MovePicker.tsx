import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Empty, Field, Loading } from '@/components/ui';
import { useAllContainers, useCreateContainerIn, useLocations } from '@/features/storage/api';
import { LocationSheet } from '@/features/storage/LocationSheet';
import { useT } from '@/lib/i18n';
import { useTheme, type, radius } from '@/lib/theme';

export type MoveTarget = { containerId: string } | { locationId: string };

/**
 * 물건을 옮길 곳 고르기.
 *
 * 목적지를 **한 번 누르면 바로 옮긴다.** 고르고 → 확인 누르고 → 닫기 였다면
 * "수정 모드에 들어가지 않고 손쉽게" 라는 요청을 절반만 들어준 셈이 된다.
 * 되돌리기도 같은 방식으로 한 번이면 되므로 확인 단계를 두지 않았다.
 *
 * 장소 이름 줄 자체도 누를 수 있다 — 박스에 넣지 않고 장소에 그냥 두는 물건이
 * 있기 때문이다(신발장 우산, 냉장고 우유).
 */
export function MovePicker({
  visible,
  title,
  householdId,
  currentContainerId,
  currentLocationId,
  busy,
  onPick,
  onClose,
}: {
  visible: boolean;
  /** 등록 화면에서는 "어디에 둘까요?" 다 — 이동이 아니다 */
  title?: string;
  householdId: string | null;
  currentContainerId: string | null;
  currentLocationId: string;
  busy: boolean;
  onPick: (t: MoveTarget) => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const locations = useLocations(householdId);
  const containers = useAllContainers(householdId);

  const locs = locations.data ?? [];
  const boxes = containers.data ?? [];
  const loading = locations.isLoading || containers.isLoading;

  /**
   * ⚠⚠ 여기가 신규 사용자 전원이 부딪히던 막다른 길이었다 (2026-09-01 발견).
   *
   *   찾기 탭에서 제일 눈에 띄는 + 를 누르면 → 카메라 → 사진 촬영 → 2단계에서
   *   이 화면이 자동으로 열린다. 그런데 장소가 하나도 없으면 "등록된 장소가
   *   없습니다" 만 뜨고, 등록 버튼은 `!dest` 라서 비활성이었다.
   *   **방금 찍은 사진을 버리고 나가는 것 말고는 할 수 있는 일이 없었다.**
   *
   *   고를 것이 없으면 만들 수 있어야 한다. 장소가 있을 때도 열어 둔다 —
   *   등록하다가 "아 이건 넣을 데가 없네" 하는 순간이 실제로 있다.
   */
  const [creating, setCreating] = useState(false);

  /**
   * ⚠⚠ 두 번째 막다른 길 (2026-09-01 사용자 보고).
   *
   *   이 화면에는 **장소를 만드는 길만** 있었다. 박스가 하나도 없는 장소를 고르면
   *   할 수 있는 건 "박스에 넣지 않고 이 장소에 두기" 뿐이다. 물건을 박스에 담으려고
   *   들어온 사람이 박스를 만들 수 없었다 — 나가서 장소 화면을 찾아 들어가 박스를
   *   만들고 다시 돌아와야 했다.
   *
   *   만든 박스로 **바로 옮긴다.** 이 화면은 원래 한 번 누르면 옮기는 화면이고,
   *   박스를 만드는 이유가 곧 "여기에 넣겠다" 이기 때문이다. 이름을 잘못 지었다면
   *   박스 상세에서 고치면 된다 — 되돌리는 비용이 작다.
   */
  const [boxFor, setBoxFor] = useState<string | null>(null);
  const [boxName, setBoxName] = useState('');
  const createBox = useCreateContainerIn(householdId);

  async function onAddBox(locationId: string) {
    const n = boxName.trim();
    if (!n || createBox.isPending) return;
    try {
      const row = await createBox.mutateAsync({ locationId, name: n });
      setBoxName('');
      setBoxFor(null);
      onPick({ containerId: row.id });
    } catch (e) {
      Alert.alert(t.location.boxAddFailed, e instanceof Error ? e.message : t.common.tryAgain);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={[st.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        <View style={[st.head, { borderBottomColor: c.border }]}>
          <Text style={[st.title, { color: c.text }]}>{title ?? t.item.moveTitle}</Text>
          <Pressable onPress={onClose} hitSlop={12} disabled={busy}>
            <Text style={[st.close, { color: c.accentText }]}>{t.common.close}</Text>
          </Pressable>
        </View>

        {loading ? (
          <Loading />
        ) : locs.length === 0 ? (
          <View style={st.rescue}>
            <Empty text={t.item.noPlaces} hint={t.item.noPlacesHint} />
            <Button label={t.locSheet.title} onPress={() => setCreating(true)} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={[st.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
            {locs.map((loc) => {
              const mine = boxes.filter((b) => b.location_id === loc.id);
              // 지금 있는 자리는 고를 수 없다. 눌러도 아무 일이 없으면 고장으로 보인다.
              const hereLoose = currentContainerId === null && currentLocationId === loc.id;
              return (
                <View key={loc.id} style={st.group}>
                  <Target
                    label={loc.name}
                    sub={t.item.moveToLocation}
                    strong
                    here={hereLoose}
                    busy={busy}
                    onPress={() => onPick({ locationId: loc.id })}
                  />
                  {mine.map((b) => (
                    <View key={b.id} style={st.indent}>
                      <Target
                        label={b.name}
                        sub={b.item_count > 0 ? t.places.itemCount(b.item_count) : t.common.empty}
                        here={currentContainerId === b.id}
                        busy={busy}
                        onPress={() => onPick({ containerId: b.id })}
                      />
                    </View>
                  ))}

                  {/* 박스를 만드는 길. 장소마다 따로 둔다 — 어느 장소에 만드는지가
                      곧 그 물건이 갈 자리라, 목록 맨 아래 버튼 하나로는 알 수 없다. */}
                  <View style={st.indent}>
                    {boxFor === loc.id ? (
                      <View style={st.newBox}>
                        <Field
                          value={boxName}
                          onChangeText={setBoxName}
                          placeholder={t.location.boxPlaceholder}
                          autoFocus
                          onSubmitEditing={() => onAddBox(loc.id)}
                          returnKeyType="done"
                        />
                        <Button
                          label={t.common.add}
                          onPress={() => onAddBox(loc.id)}
                          busy={createBox.isPending}
                        />
                        <Text style={[st.hint, { color: c.textFaint }]}>{t.item.addBoxHint}</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setBoxName('');
                          setBoxFor(loc.id);
                        }}
                        disabled={busy}
                        hitSlop={8}
                        style={st.addMore}
                      >
                        <Text style={[st.addMoreText, { color: c.accentText }]}>
                          {t.item.addBoxHere}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}

            {/* 목록이 있어도 새로 만들 수 있다 */}
            <Pressable onPress={() => setCreating(true)} hitSlop={8} style={st.addMore}>
              <Text style={[st.addMoreText, { color: c.accentText }]}>+ {t.locSheet.title}</Text>
            </Pressable>
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

function Target({
  label,
  sub,
  strong,
  here,
  busy,
  onPress,
}: {
  label: string;
  sub: string;
  strong?: boolean;
  here: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      disabled={here || busy}
      style={({ pressed }) => [
        st.row,
        { backgroundColor: c.card },
        here && { borderColor: c.accent },
        (pressed || here || busy) && { opacity: here ? 1 : 0.6 },
      ]}
    >
      <View style={st.rowMain}>
        <Text style={[strong ? st.rowTitleStrong : st.rowTitle, { color: c.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[st.rowSub, { color: c.textFaint }]} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      {here && <Text style={[st.here, { color: c.accentText }]}>{t.item.moveHere}</Text>}
    </Pressable>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: type.title, fontWeight: '700' },
  close: { fontSize: type.body, fontWeight: '600' },
  body: { paddingHorizontal: 20, paddingTop: 14, gap: 18 },
  group: { gap: 8 },
  indent: { paddingLeft: 20 },
  row: {
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: type.body, fontWeight: '600' },
  rowTitleStrong: { fontSize: type.subtitle, fontWeight: '700' },
  rowSub: { fontSize: type.caption },
  here: { fontSize: type.caption, fontWeight: '700' },
  rescue: { paddingHorizontal: 20, gap: 4 },
  addMore: { alignSelf: 'flex-start', paddingVertical: 8 },
  newBox: { gap: 10, paddingVertical: 4 },
  hint: { fontSize: type.caption },
  addMoreText: { fontSize: type.body, fontWeight: '600' },
});
