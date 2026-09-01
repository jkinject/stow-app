import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconBox, IconBoxes } from '@/components/Icon';
import { ThumbStack } from '@/components/ThumbStack';
import { Button, Empty, Field, Loading } from '@/components/ui';
import { useThumbUrls } from '@/features/item/thumbs';
import { useAllContainers, useCreateContainerIn, useLocations } from '@/features/storage/api';
import { useCoverStacks } from '@/features/storage/covers';
import { LocationSheet } from '@/features/storage/LocationSheet';
import { useT } from '@/lib/i18n';
import { useTheme, type, radius, space } from '@/lib/theme';

export type MoveTarget = { containerId: string } | { locationId: string };

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** 왼쪽 아이콘 칸과 그 안의 아이콘. 사진 더미는 이보다 작다 — 부속이니까 */
const SLOT = 36;
const ICON = 20;
const STACK_TILE = 30;


/**
 * 강조색에 투명도를 붙여 **옅게 깔 배경**을 만든다.
 *
 * ⚠ 팔레트의 `accent` 는 라이트·다크 둘 다 `#RRGGBB` 6자리다(lib/theme.ts). 누가
 *   rgba() 나 8자리로 바꾸면 `#RRGGBBAA` + `AA` 가 되어 **깨진 색**이 나온다.
 *   그때는 조용히 카드색으로 떨어진다 — 강조가 사라지는 것보다 알아볼 수 없는 줄이
 *   그려지는 쪽이 나쁘다.
 */
function tinted(accent: string, alpha: string, fallback: string) {
  return HEX6.test(accent) ? accent + alpha : fallback;
}

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

  const { cover, thumbs } = useCoverStacks(householdId);

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
  /**
   * 열자마자 **지금 있는 자리**가 보이게 스크롤을 맞춰 둔다.
   *
   * 장소가 열 개를 넘어가면 "지금 여기" 가 화면 밖 한참 아래에 있어서, 옮기려는
   * 사람이 매번 스크롤을 내려 현재 위치부터 찾아야 했다 (사용자 보고).
   *
   * ⚠ `onLayout` 한 번만 보고 스크롤하면 안 된다. 그 시점에는 ScrollView 가 아직
   *   콘텐츠 높이를 모를 수 있어서 목표 y 가 **잘려 버린다**(화면 높이까지만 간다).
   *   그래서 onLayout 과 onContentSizeChange 양쪽에서 부르고, 성공했다고 잠그지
   *   않는다. 대신 사용자가 손으로 스크롤을 시작하면 그 뒤로는 손대지 않는다 —
   *   보고 있는 화면을 도로 끌어당기는 것이 제일 나쁘다. 손으로 스크롤한 경우만이
   *   아니라 **장소를 접거나 펼친 뒤에도** 잠근다 — 아래쪽 장소를 펼쳤는데 화면이
   *   현재 위치로 되돌아가면 펼친 것이 안 보인다.
   */
  const scrollRef = useRef<ScrollView | null>(null);
  const hereY = useRef<{ group?: number; row?: number }>({});
  const viewH = useRef(0);
  const userMoved = useRef(false);

  useEffect(() => {
    if (!visible) {
      hereY.current = {};
      userMoved.current = false;
    }
  }, [visible]);

  /** 대충 잡은 한 줄 높이(사진 40 + 위아래 여백). 정확할 필요는 없다 — 판단용이다 */
  const ROW_H = 66;

  function scrollToHere() {
    const { group, row } = hereY.current;
    if (userMoved.current || group === undefined || row === undefined) return;

    /**
     * 되도록 **장소 머리부터** 보여 준다. 칸만 딱 맞춰 올리면 그 칸이 어느 장소에
     * 속하는지가 화면 밖으로 밀려 나가, 정작 "어디로 옮길까" 를 판단할 수 없다.
     * 박스가 많아 장소 머리부터로는 현재 칸이 화면 아래로 떨어질 때만 칸에 맞춘다.
     */
    const fromTop = group - 16; // 위로 조금 남긴다 — 딱 맞추면 잘린 것처럼 보인다
    const rowBottom = group + row + ROW_H;
    const fits = viewH.current > 0 && rowBottom - fromTop <= viewH.current;
    scrollRef.current?.scrollTo({
      y: Math.max(0, fits ? fromTop : group + row - 16),
      animated: false,
    });
  }

  /**
   * 장소별 펼침 상태. **현재 물건이 있는 장소만** 열어 둔다.
   *
   * 박스가 늘어나면 목록이 하염없이 길어진다 (사용자 보고). 접어 두면 장소 목록이
   * 한 화면에 들어오고, 옮길 곳을 고르는 일이 "장소 → 박스" 두 걸음이 된다.
   *
   * ⚠ 그 대가로 **장소 줄의 뜻이 바뀌었다.** 예전에는 장소를 누르면 곧바로 그 장소로
   *   옮겼는데, 이제는 펼치기다. "박스에 넣지 않고 이 장소에 두기" 는 펼친 안쪽의
   *   별도 줄로 내려갔다 — 누르면 옮겨지던 것이 조용히 사라지면 기능을 잃는다.
   */
  const [open, setOpen] = useState<Record<string, boolean>>({});

  /**
   * 열릴 때마다 펼침 상태를 초기화한다.
   *
   * ⚠ effect 에서 setState 하지 않는다 — 한 번 그린 뒤 다시 그리게 되어 접힌 목록이
   *   깜빡 보인다. React 가 권하는 "렌더 중 상태 조정" 방식을 쓴다.
   *   모달은 닫혀도 언마운트되지 않으므로 초기값만으로는 부족하다.
   */
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setOpen({ [currentLocationId]: true });
  }

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
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[st.body, { paddingBottom: insets.bottom + 32 }]}
            keyboardShouldPersistTaps="handled"
            onLayout={(e) => {
              viewH.current = e.nativeEvent.layout.height;
              scrollToHere();
            }}
            onContentSizeChange={scrollToHere}
            onScrollBeginDrag={() => {
              userMoved.current = true;
            }}
          >
            {locs.map((loc) => {
              const mine = boxes.filter((b) => b.location_id === loc.id);
              // 지금 있는 자리는 고를 수 없다. 눌러도 아무 일이 없으면 고장으로 보인다.
              const hereLoose = currentContainerId === null && currentLocationId === loc.id;
              const holdsCurrent = currentLocationId === loc.id;
              const expanded = !!open[loc.id];
              return (
                <View
                  key={loc.id}
                  style={st.group}
                  onLayout={(e) => {
                    if (!holdsCurrent) return;
                    hereY.current.group = e.nativeEvent.layout.y;
                    // 박스에 안 들어 있으면 장소 줄 자체가 "지금 여기" 다 (그룹 맨 위)
                    if (currentContainerId === null) hereY.current.row = 0;
                    scrollToHere();
                  }}
                >
                  <Pressable
                    onPress={() => {
                      userMoved.current = true;
                      setOpen((o) => ({ ...o, [loc.id]: !o[loc.id] }));
                    }}
                    style={({ pressed }) => [
                      st.row,
                      {
                        // 물건이 든 장소는 옅게, 정확한 자리(박스/직속)는 진하게 —
                        // 두 단계로 나눠야 "이 장소 안, 그중 이 칸" 이 한눈에 읽힌다
                        backgroundColor: holdsCurrent
                          ? tinted(c.accent, '1F', c.card)
                          : c.card,
                        borderColor: holdsCurrent ? c.accent : 'transparent',
                      },
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    {/* 왼쪽은 "이게 무엇인지"(장소) 를 말하는 자리. 안에 든 것들은
                        오른쪽에 딸려 붙는다 — 왼쪽에 사진 세 장을 겹치니 줄의
                        시작이 뭉개져 보였다(사용자 보고). */}
                    <Slot><IconBoxes color={c.textFaint} size={ICON} /></Slot>
                    <View style={st.rowMain}>
                      <Text style={[st.rowTitleStrong, { color: c.text }]} numberOfLines={1}>
                        {loc.name}
                      </Text>
                      <Text style={[st.rowSub, { color: c.textFaint }]} numberOfLines={1}>
                        {mine.length > 0 ? t.places.boxes(mine.length) : t.item.noBoxesYet}
                      </Text>
                    </View>
                    {/* 접혀 있어도 물건이 지금 어느 장소에 있는지는 보여야 한다.
                        ⚠ 사진 **앞**이다. 뒤에 두면 배지 없는 줄에도 자리를 비워 둬야
                        사진 오른쪽 끝이 맞는데, 그러면 대부분의 줄에 빈 칸이 남는다. */}
                    {holdsCurrent && !expanded && (
                      <Text style={[st.here, { color: c.accentText }]}>{t.item.moveHere}</Text>
                    )}
                    <ThumbStack paths={cover.loc.get(loc.id)} get={thumbs.get} size={STACK_TILE} />
                    <Text style={[st.chevron, { color: c.textFaint }]}>
                      {expanded ? '\u25BE' : '\u25B8'}
                    </Text>
                  </Pressable>

                  {expanded && (
                    <>
                      {/* 장소 직속 — 신발장 우산, 냉장고 우유처럼 박스에 안 넣는 물건 */}
                      <View style={st.indent}>
                        {/* ⚠ 여기엔 사진 더미를 달지 않는다. 이 줄은 담는 곳이 아니라
                            **동작**("그냥 두기")이고, 이름이 길어서 오른쪽에 더미까지
                            붙이면 글자가 잘린다. */}
                        <Target
                          label={t.item.moveToLocation}
                          icon={<IconBoxes color={c.textFaint} size={ICON} />}
                          get={thumbs.get}
                          here={hereLoose}
                          busy={busy}
                          onPress={() => onPick({ locationId: loc.id })}
                        />
                      </View>

                      {mine.map((b) => (
                        <View
                          key={b.id}
                          style={st.indent}
                          onLayout={(e) => {
                            if (currentContainerId !== b.id) return;
                            hereY.current.row = e.nativeEvent.layout.y;
                            scrollToHere();
                          }}
                        >
                          <Target
                            label={b.name}
                            icon={<IconBox color={c.textFaint} size={ICON} />}
                            paths={cover.box.get(b.id)}
                            get={thumbs.get}
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
                            <Text style={[st.hint, { color: c.textFaint }]}>
                              {t.item.addBoxHint}
                            </Text>
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
                    </>
                  )}
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

/** 줄 왼쪽의 아이콘 칸. 크기가 고정이라 모든 줄의 글자가 같은 x 에서 시작한다 */
function Slot({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return <View style={[st.slot, { backgroundColor: c.sunk }]}>{children}</View>;
}

function Target({
  label,
  sub,
  icon,
  paths,
  get,
  here,
  busy,
  onPress,
}: {
  label: string;
  /** 없으면 한 줄짜리 줄이 된다 (장소 직속 항목) */
  sub?: string;
  /** 왼쪽 칸 — 그 줄이 무엇인지(장소냐 박스냐) */
  icon: React.ReactNode;
  paths?: string[];
  get: ReturnType<typeof useThumbUrls>['get'];
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
        {
          backgroundColor: here ? tinted(c.accent, '33', c.card) : c.card,
          borderColor: here ? c.accent : 'transparent',
        },
        (pressed || here || busy) && { opacity: here ? 1 : 0.6 },
      ]}
    >
      {/* ⚠ 왼쪽 자리는 항상 차지한다. 비워 두면 그 줄만 글자가 왼쪽으로 밀려서
          목록의 시작선이 어긋난다(실기기 확인). */}
      <Slot>{icon}</Slot>
      <View style={st.rowMain}>
        <Text style={[st.rowTitle, { color: c.text }]} numberOfLines={1}>
          {label}
        </Text>
        {!!sub && (
          <Text style={[st.rowSub, { color: c.textFaint }]} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
      {here && <Text style={[st.here, { color: c.accentText }]}>{t.item.moveHere}</Text>}
      <ThumbStack paths={paths} get={get} size={STACK_TILE} />
    </Pressable>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
    borderBottomWidth: 1,
  },
  title: { fontSize: type.title, fontWeight: '700' },
  close: { fontSize: type.body, fontWeight: '600' },
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.xl },
  group: { gap: space.sm },
  indent: { paddingLeft: space.xl },
  row: {
    borderRadius: radius.sm,
    // ⚠ 강조할 때만 borderWidth 를 주면 그 줄만 2px 커져 목록이 흔들린다.
    //   자리를 항상 잡아 두고 **색만** 바꾼다.
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  rowMain: { flex: 1, gap: space.xs },
  rowTitle: { fontSize: type.body, fontWeight: '600' },
  rowTitleStrong: { fontSize: type.subtitle, fontWeight: '700' },
  rowSub: { fontSize: type.caption },
  here: { fontSize: type.caption, fontWeight: '700' },
  rescue: { paddingHorizontal: space.xl, gap: space.xs },
  addMore: { alignSelf: 'flex-start', paddingVertical: space.sm },
  newBox: { gap: space.md, paddingVertical: space.xs },
  hint: { fontSize: type.caption },
  chevron: { fontSize: type.body, fontWeight: '700' },
  slot: {
    width: SLOT,
    height: SLOT,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMoreText: { fontSize: type.body, fontWeight: '600' },
});
