import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconBox, IconBoxes } from '@/components/Icon';
import { ThumbStack } from '@/components/ThumbStack';
import { Button, Empty, Field, Loading } from '@/components/ui';
import { useAllContainers, useCreateContainerIn, useLocations } from '@/features/storage/api';
import { useCoverStacks } from '@/features/storage/covers';
import { LocationSheet } from '@/features/storage/LocationSheet';
import { ICON, pickerSt, Slot, STACK_TILE, Target } from '@/features/storage/PickerRow';
import { useT } from '@/lib/i18n';
import { useTheme, type, space, tinted } from '@/lib/theme';

export type MoveTarget = { containerId: string } | { locationId: string };


/* ⚠ `tinted` 는 lib/theme 으로 옮겼다 — 카테고리 색 배지에서도 같은 규칙이 필요해졌다.
   두 곳에 적어 두면 한쪽만 고쳐진다. */

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
  /**
   * `label` 은 방금 고른 곳의 **보이는 이름**("신발장 › 왼쪽 신발장").
   *
   * ⚠ 부르는 쪽에서 다시 만들지 않게 여기서 넘긴다. 이 화면이 그 이름을 이미 그렸고,
   *   부르는 쪽은 이동 직후라 아직 옛 위치를 들고 있어 스스로 만들 수 없다.
   */
  onPick: (t: MoveTarget, label: string) => void;
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
  /** 지금 스크롤 위치 — 얼마나 더 끌어올려야 하는지 계산하는 기준점 */
  const scrollY = useRef(0);
  /** 열려 있는 "새 박스" 입력칸. 화면 좌표를 직접 재려고 들고 있는다 */
  const addRef = useRef<View | null>(null);

  /**
   * ⚠⚠ **자판 높이를 여기서 직접 듣는다** (2026-09-06 실기기 로그로 확인).
   *
   *   처음엔 `KeyboardSpacer`(reanimated 의 IME 인셋)로 감쌌는데 **아무 일도 하지
   *   않았다.** 실기기 로그에서 ScrollView 높이가 자판 전후로 1015.1 그대로였다 —
   *   즉 인셋이 0 으로 들어온다. `Modal` 은 제 윈도우를 따로 띄우므로 액티비티
   *   윈도우의 IME 인셋이 닿지 않는다(토스트가 Modal 뒤에 깔리는 것과 같은 뿌리다).
   *
   *   RN 의 `Keyboard` 이벤트는 윈도우와 무관하게 IME 수명주기로 오므로 모달
   *   안에서도 들어온다. 다만 이 프로젝트는 삼성 자판에서 **보고 높이가 실제보다
   *   작다**는 것을 이미 겪었다(툴바 줄만큼). 그래서 높이를 믿고 계산하지 않고,
   *   **`screenY`(자판 윗변)와 입력칸의 실측 좌표만 비교한다** — 겹친 만큼만 밀어
   *   올린다. 어긋날 여지가 없다.
   *
   * ⚠ 카테고리 시트(`features/category/CategorySheet`)에서는 `KeyboardSpacer` 가
   *   **제대로 동작한다**(같은 날 실기기 확인). 그쪽은 `transparent` Modal 이라는
   *   차이가 있는데, 그것이 원인인지까지는 확인하지 않았다. 그러니 "모달이면 무조건
   *   안 된다" 고 읽지 말 것 — 확인한 사실은 **이 화면에서 인셋이 0 이었다**는 것뿐이다.
   */
  const kbTop = useRef<number | null>(null);
  const [kbPad, setKbPad] = useState(0);

  useEffect(() => {
    if (!visible) {
      hereY.current = {};
      userMoved.current = false;
      kbTop.current = null;
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
   * 열려 있는 "새 박스" 입력칸이 자판에 가리면 **가린 만큼만** 밀어 올린다.
   *
   * ⚠ 높이를 계산하지 않고 **화면 좌표를 잰다.** 자판 윗변(screenY)과 입력칸 아랫변을
   *   비교하면 보고 높이가 얼마나 정확한지와 무관하게 정확히 겹친 만큼이 나온다.
   * ⚠ 이미 보이면 아무 것도 하지 않는다 — 보고 있는 화면을 끌어당기지 않는다.
   */
  function revealAddBox() {
    const top = kbTop.current;
    const node = addRef.current;
    if (top === null || !node) return;
    node.measureInWindow((_x, y, _w, h) => {
      const overlap = y + h + 16 - top; // 아래로 조금 남긴다
      if (overlap > 0) {
        scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + overlap), animated: true });
      }
    });
  }

  /**
   * 자판이 오르내릴 때: (1) 스크롤 여유를 만들고 (2) 입력칸을 끌어올린다.
   *
   * ⚠ **여유(padding)가 없으면 밀어 올릴 수가 없다.** 목록 끝 장소(맨 아래 두세 개)는
   *   이미 바닥까지 내려온 상태라 더 내려갈 데가 없다 — 실제로 "카페장은 되는데
   *   컴퓨터방은 잘린다" 가 이것이었다(2026-09-06 사용자 보고, 실기기 로그로 확인).
   *
   * ⚠ 보고 높이에 여유분을 얹는다. 삼성 자판은 툴바 줄만큼 작게 보고하는 일이 있는데,
   *   남는 여백은 스크롤을 조금 더 내릴 수 있다는 뜻일 뿐 해가 없다. 모자라면
   *   입력칸을 끝내 못 올린다 — 한쪽으로만 틀리게 만든다.
   */
  useEffect(() => {
    if (!visible) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      kbTop.current = e.endCoordinates.screenY;
      setKbPad(e.endCoordinates.height + 120);
      // 여유가 붙은 뒤에 밀어야 실제로 밀린다 — 다음 프레임에 잰다
      requestAnimationFrame(revealAddBox);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      kbTop.current = null;
      setKbPad(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [visible]);

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
    // ⚠ 닫힐 때 자판 여유도 함께 턴다. 남겨 두면 다음에 열었을 때 목록 아래가
    //   이유 없이 비어 있다(자판은 이미 내려갔는데 여백만 남는다).
    setKbPad(0);
  }

  const [boxFor, setBoxFor] = useState<string | null>(null);
  const [boxName, setBoxName] = useState('');
  const createBox = useCreateContainerIn(householdId);

  async function onAddBox(locationId: string, locName: string) {
    const n = boxName.trim();
    if (!n || createBox.isPending) return;
    try {
      const row = await createBox.mutateAsync({ locationId, name: n });
      setBoxName('');
      setBoxFor(null);
      onPick({ containerId: row.id }, `${locName} \u203a ${row.name}`);
    } catch (e) {
      Alert.alert(t.location.boxAddFailed, e instanceof Error ? e.message : t.common.tryAgain);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={[pickerSt.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        <View style={[pickerSt.head, { borderBottomColor: c.border }]}>
          <Text style={[pickerSt.title, { color: c.text }]}>{title ?? t.item.moveTitle}</Text>
          <Pressable onPress={onClose} hitSlop={12} disabled={busy}>
            <Text style={[pickerSt.close, { color: c.accentText }]}>{t.common.close}</Text>
          </Pressable>
        </View>

        {loading ? (
          <Loading />
        ) : locs.length === 0 ? (
          <View style={pickerSt.rescue}>
            <Empty text={t.item.noPlaces} hint={t.item.noPlacesHint} />
            <Button label={t.locSheet.title} onPress={() => setCreating(true)} />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[pickerSt.body, { paddingBottom: insets.bottom + 32 + kbPad }]}
            keyboardShouldPersistTaps="handled"
            onLayout={(e) => {
              viewH.current = e.nativeEvent.layout.height;
              scrollToHere();
            }}
            onContentSizeChange={() => {
              scrollToHere();
              // 여유가 늘어 스크롤할 수 있게 된 직후다 — 이때 밀어 올린다
              revealAddBox();
            }}
            scrollEventThrottle={32}
            onScroll={(e) => {
              scrollY.current = e.nativeEvent.contentOffset.y;
            }}
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
                  style={pickerSt.group}
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
                      pickerSt.row,
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
                    <View style={pickerSt.rowMain}>
                      <Text style={[pickerSt.rowTitleStrong, { color: c.text }]} numberOfLines={1}>
                        {loc.name}
                      </Text>
                      <Text style={[pickerSt.rowSub, { color: c.textFaint }]} numberOfLines={1}>
                        {mine.length > 0 ? t.places.boxes(mine.length) : t.item.noBoxesYet}
                      </Text>
                    </View>
                    {/* 접혀 있어도 물건이 지금 어느 장소에 있는지는 보여야 한다.
                        ⚠ 사진 **앞**이다. 뒤에 두면 배지 없는 줄에도 자리를 비워 둬야
                        사진 오른쪽 끝이 맞는데, 그러면 대부분의 줄에 빈 칸이 남는다. */}
                    {holdsCurrent && !expanded && (
                      <Text style={[pickerSt.here, { color: c.accentText }]}>{t.item.moveHere}</Text>
                    )}
                    <ThumbStack paths={cover.loc.get(loc.id)} get={thumbs.get} size={STACK_TILE} />
                    <Text style={[pickerSt.chevron, { color: c.textFaint }]}>
                      {expanded ? '\u25BE' : '\u25B8'}
                    </Text>
                  </Pressable>

                  {expanded && (
                    <>
                      {/* 장소 직속 — 신발장 우산, 냉장고 우유처럼 박스에 안 넣는 물건 */}
                      <View style={pickerSt.indent}>
                        {/* ⚠ 여기엔 사진 더미를 달지 않는다. 이 줄은 담는 곳이 아니라
                            **동작**("그냥 두기")이고, 이름이 길어서 오른쪽에 더미까지
                            붙이면 글자가 잘린다. */}
                        <Target
                          label={t.item.moveToLocation}
                          icon={<IconBoxes color={c.textFaint} size={ICON} />}
                          get={thumbs.get}
                          here={hereLoose}
                          busy={busy}
                          onPress={() => onPick({ locationId: loc.id }, `${loc.name}${t.item.loose}`)}
                        />
                      </View>

                      {mine.map((b) => (
                        <View
                          key={b.id}
                          style={pickerSt.indent}
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
                            onPress={() => onPick({ containerId: b.id }, `${loc.name} \u203a ${b.name}`)}
                          />
                        </View>
                      ))}

                      {/* 박스를 만드는 길. 장소마다 따로 둔다 — 어느 장소에 만드는지가
                          곧 그 물건이 갈 자리라, 목록 맨 아래 버튼 하나로는 알 수 없다. */}
                      <View style={pickerSt.indent}>
                        {boxFor === loc.id ? (
                          <View ref={addRef} style={st.newBox}>
                            <Field
                              value={boxName}
                              onChangeText={setBoxName}
                              placeholder={t.location.boxPlaceholder}
                              autoFocus
                              onSubmitEditing={() => onAddBox(loc.id, loc.name)}
                              returnKeyType="done"
                            />
                            <Button
                              label={t.common.add}
                              onPress={() => onAddBox(loc.id, loc.name)}
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
                              requestAnimationFrame(revealAddBox);
                              /* 여기서부터는 사람이 자리를 정한 것이다 — "지금 여기" 로
                                 되돌리는 자동 스크롤이 입력칸을 도로 밀어내면 안 된다 */
                              userMoved.current = true;
                            }}
                            disabled={busy}
                            hitSlop={8}
                            style={pickerSt.addMore}
                          >
                            <Text style={[pickerSt.addMoreText, { color: c.accentText }]}>
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
            <Pressable onPress={() => setCreating(true)} hitSlop={8} style={pickerSt.addMore}>
              <Text style={[pickerSt.addMoreText, { color: c.accentText }]}>+ {t.locSheet.title}</Text>
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

const st = StyleSheet.create({
  /** 이 화면에만 있는 것 — 목적지 목록 안에서 박스를 새로 만드는 자리 */
  newBox: { gap: space.md, paddingVertical: space.xs },
  hint: { fontSize: type.caption },
});
