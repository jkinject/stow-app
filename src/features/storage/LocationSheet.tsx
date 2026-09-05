import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Field } from '@/components/ui';
import { confirmDestructive } from '@/lib/confirm';
import { useT } from '@/lib/i18n';
import { radius, type, useTheme, space } from '@/lib/theme';

import { useCreateLocation, useLocations } from './api';

/**
 * 보관 장소 만들기 — **세 곳이 같은 것을 쓴다.**
 * (첫 실행 안내 · 보관 장소 탭 · 물건 등록 중 "둘 곳이 없을 때")
 *
 * ⚠ 각자 만들면 한쪽만 고쳐지는 날이 반드시 온다. 이 프로젝트에서 이미 여러 번 겪었다.
 *
 * ─────────────────────────────────────────────────────────────
 * 왜 칩으로 제안하는가:
 *   빈 입력칸은 사람을 멈추게 한다. "보관 장소" 라는 말 자체가 이 앱의 개념이라
 *   처음 보는 사람은 무엇을 적어야 하는지 모른다 — 방 이름인지, 가구 이름인지,
 *   아니면 "1번 선반" 같은 것인지. 흔한 이름을 눌러 볼 수 있게 두면 그 자리에서
 *   **개념을 배우면서 동시에 설정이 끝난다.**
 *
 * ⚠ 제안 목록은 번역이 아니라 **그 나라 집 구조로 다시 쓰는 것**이다
 *   (strings 의 locSheet.suggestions 주석 참고).
 * ─────────────────────────────────────────────────────────────
 *
 * ⚠⚠ **누르는 즉시 저장하지 않는다** (2026-09-01 사용자 보고).
 *
 *   처음엔 칩을 누르면 곧바로 DB 에 만들었다. 그런데 화면이 그렇게 안 읽힌다:
 *     · 칩이 **토글처럼** 생겼다 → 눌렀다 다시 누르면 꺼질 것 같다
 *     · 상단에 **"완료"** 가 있다 → 그걸 눌러야 저장될 것 같다
 *   둘 다 "고른 뒤 확정한다" 는 신호인데 실제로는 즉시 확정이었고, 되돌릴 방법도
 *   없었다. 잘못 누르면 지우러 가는 수밖에 없었다.
 *
 *   보이는 대로 만드는 게 맞다. 지금은 고르는 것과 저장하는 것이 나뉘어 있다:
 *   칩은 진짜 토글이고, 저장은 **완료를 누를 때 한 번에** 일어난다.
 *
 * ⚠ 토글할 때 **칩의 폭이 변하면 안 된다.** 폭이 변하면 줄이 재배치돼 손가락이
 *   닿는 순간 다른 칩이 그 자리에 와 있다 — 실기기에서 실제로 겪었다(같은 날,
 *   "주방" 을 누르려다 "거실" 이 만들어졌다). 글자·테두리 굵기·여백은 그대로 두고
 *   **색만** 바꾼다.
 */
export function LocationSheet({
  visible,
  householdId,
  onClose,
}: {
  visible: boolean;
  householdId: string | null;
  /** 몇 곳을 실제로 만들었는지 알려준다 — 부른 쪽이 다음 행동을 정할 수 있게 */
  onClose: (created: number) => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();

  const locations = useLocations(householdId);
  const create = useCreateLocation(householdId ?? '');

  const [name, setName] = useState('');
  /** 이미 있는 이름을 적었을 때 입력칸 아래에 뜨는 문구 */
  const [dupe, setDupe] = useState<string | null>(null);
  /** 아직 저장하지 않고 담아 둔 것들. 고른 순서를 지키려고 배열로 둔다 */
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  /**
   * 자판이 가리는 만큼 아래에 여유를 준다 (2026-09-06).
   *
   * ⚠ 이 화면도 `Modal` 이라 액티비티의 IME 인셋이 닿지 않는다 — `KeyboardSpacer` 로
   *   감싸도 **아무 일도 일어나지 않는다**(이동 화면에서 실기기 로그로 확인했다).
   *   RN 의 `Keyboard` 이벤트는 모달 안에서도 오므로 그것으로 여유를 만들고,
   *   입력칸은 **화면 좌표를 재서** 가린 만큼만 밀어 올린다.
   */
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollY = useRef(0);
  const inputRef = useRef<View | null>(null);
  const [kbPad, setKbPad] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const top = e.endCoordinates.screenY;
      setKbPad(e.endCoordinates.height + 120); // 삼성 자판의 툴바 줄만큼 넉넉히
      requestAnimationFrame(() =>
        inputRef.current?.measureInWindow((_x, y, _w, h) => {
          const overlap = y + h + 16 - top;
          if (overlap > 0) {
            scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + overlap), animated: true });
          }
        }),
      );
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbPad(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [visible]);

  /** 이미 DB 에 있는 곳 — 여기서는 만들 수도 없앨 수도 없다(없애는 건 삭제다) */
  const taken = useMemo(
    () => new Set((locations.data ?? []).map((l) => l.name.trim())),
    [locations.data],
  );
  const pickedSet = useMemo(() => new Set(picked), [picked]);

  /**
   * 제안 칩 — **이미 만들어 둔 이름은 아예 빼고** 보여 준다 (2026-09-02 사용자 요청).
   *
   * 예전에는 전부 보여 주고 이미 있는 것만 회색으로 죽였다. 고를 수 없는 것을
   * 자리만 차지하게 둘 이유가 없다. 하나도 남지 않으면 이 구역 자체를 감추고
   * 직접 입력칸만 남긴다.
   *
   * ⚠ "칩을 빼면 줄이 재배치된다" 는 옛 경고는 **누를 때 빠지는 경우** 이야기다
   *   (안방을 눌러 뺐더니 줄이 밀려 다음 탭이 거실에 맞았다). 여기서 빠지는 기준은
   *   DB 목록이고, 시트가 열려 있는 동안에는 바뀌지 않는다 — 저장하면 시트가 닫힌다.
   */
  const chips = useMemo(
    () => t.locSheet.suggestions.filter((sug) => !taken.has(sug)),
    [t.locSheet.suggestions, taken],
  );
  /** 제안에 없는 이름으로 직접 담은 것 */
  const customPicked = picked.filter((p) => !chips.includes(p));

  function toggle(n: string) {
    if (taken.has(n) || saving) return;
    setPicked((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  }

  function stageTyped() {
    const n = name.trim();
    if (!n) return;
    /**
     * ⚠ 예전에는 중복이면 **조용히 넘겼다.** 화면 아래에 '이미 있는 곳' 목록이
     *   있어서 왜 안 담기는지 알아볼 수 있었기 때문이다. 그 목록을 뺐으니 이제는
     *   말해 줘야 한다 — 안 그러면 눌러도 아무 일이 없는 고장으로 보인다.
     *   경고창은 과하다. 잘못한 일이 아니라 알려 주기만 하면 되는 일이다.
     *
     * ⚠ 토스트로 알리려다 실패했다 — 이 화면이 `Modal` 이라 알림이 뒤에 깔려
     *   **보이지 않는다**(실기기 확인, components/Toast.tsx 주석 참고).
     *   입력칸 바로 아래에 두어야 눈에 들어온다. 적은 이름은 지우지 않는다 —
     *   고쳐 쓰라고 남겨 둔다.
     */
    if (taken.has(n)) {
      setDupe(n);
      return;
    }
    setDupe(null);
    if (!pickedSet.has(n)) setPicked((prev) => [...prev, n]);
    setName('');
  }

  function reset() {
    setPicked([]);
    setName('');
  }

  /** 완료 — **여기서만** 실제로 만든다 */
  async function commit() {
    if (picked.length === 0) {
      reset();
      onClose(0);
      return;
    }
    setSaving(true);
    const failed: string[] = [];
    let made = 0;
    // ⚠ 하나씩 순서대로. 한꺼번에 보내면 어느 것이 실패했는지 말해 줄 수 없다.
    for (const n of picked) {
      try {
        await create.mutateAsync(n);
        made += 1;
      } catch {
        failed.push(n);
      }
    }
    setSaving(false);

    if (failed.length > 0) {
      // 실패한 것만 담긴 채로 남겨 둔다 — 다시 누르면 그것만 재시도된다
      setPicked(failed);
      Alert.alert(t.places.addFailed, t.locSheet.addFailed(failed.join(', ')));
      return; // 화면은 열어 둔다
    }
    reset();
    onClose(made);
  }

  /** 닫기 — 담아 둔 게 있으면 묻는다. 안 물으면 고른 것이 조용히 사라진다 */
  function requestClose() {
    if (saving) return;
    if (picked.length === 0) {
      onClose(0);
      return;
    }
    confirmDestructive({
      title: t.locSheet.discardTitle,
      body: t.locSheet.discardBody(picked.length),
      confirmLabel: t.locSheet.discard,
      cancelLabel: t.common.cancel,
      onConfirm: () => {
        reset();
        onClose(0);
      },
    });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={requestClose} transparent={false}>
      <View style={[st.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        <View style={[st.head, { borderBottomColor: c.border }]}>
          <Pressable onPress={requestClose} hitSlop={12} disabled={saving}>
            <Text style={[st.close, { color: c.textMuted }]}>{t.common.close}</Text>
          </Pressable>
          <Text style={[st.title, { color: c.text }]} numberOfLines={1}>
            {t.locSheet.title}
          </Text>
          {/* ⚠ 담아 둔 게 있으면 이 버튼이 곧 저장이다. 몇 곳이 저장되는지 밝힌다 —
              "완료" 만 있으면 그냥 닫는 것인지 저장인지 또 헷갈린다. */}
          <Pressable onPress={() => void commit()} hitSlop={12} disabled={saving}>
            <Text style={[st.save, { color: saving ? c.textFaint : c.accentText }]}>
              {saving
                ? t.locSheet.saving
                : picked.length > 0
                  ? t.locSheet.saveN(picked.length)
                  : t.locSheet.done}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[st.body, { paddingBottom: insets.bottom + 32 + kbPad }]}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={32}
          onScroll={(e) => {
            scrollY.current = e.nativeEvent.contentOffset.y;
          }}
        >
          {chips.length > 0 && (
            <View style={st.block}>
              <Text style={[st.label, { color: c.textFaint }]}>{t.locSheet.suggestHint}</Text>
              <View style={st.chips}>
                {chips.map((sug) => {
                  const on = pickedSet.has(sug);
                  return (
                    <Pressable
                      key={sug}
                      onPress={() => toggle(sug)}
                      disabled={saving}
                      style={({ pressed }) => [
                        st.chip,
                        { borderColor: c.borderStrong, backgroundColor: c.card },
                        /* ⚠ 폭에 영향을 주는 것(글자·borderWidth·padding)은 건드리지 않는다 */
                        on && { borderColor: c.accent, backgroundColor: c.accent },
                        pressed && { opacity: 0.6 },
                      ]}
                    >
                      <Text style={[st.chipText, { color: on ? c.onAccent : c.text }]}>{sug}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <View ref={inputRef} style={st.block}>
            <Text style={[st.label, { color: c.textFaint }]}>{t.locSheet.manualHint}</Text>
            <View style={st.manual}>
              <Field
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  setDupe(null); // 고쳐 쓰기 시작하면 지적을 거둔다
                }}
                placeholder={t.locSheet.placeholder}
                onSubmitEditing={stageTyped}
                returnKeyType="done"
                wrapStyle={st.flex}
              />
              <View style={st.addBtn}>
                {/* "추가" 가 아니라 "담기" 다 — 아직 저장이 아니라는 걸 말로도 밝힌다 */}
                <Button
                  label={t.locSheet.stage}
                  onPress={stageTyped}
                  disabled={!name.trim() || saving}
                  variant="secondary"
                />
              </View>
            </View>
            {/* ⚠ 입력칸 **바로 아래**다. 토스트로 알리려 했다가 이 화면이 Modal 이라
                가려져 보이지 않는 것을 실기기에서 확인했다. */}
            {dupe !== null && (
              <Text style={[st.dupe, { color: c.danger }]}>{t.locSheet.alreadyExists(dupe)}</Text>
            )}
          </View>

          {/* 직접 담은 것은 제안 칩에 없으므로 여기 보여주고, 눌러서 뺄 수 있게 한다 */}
          {customPicked.length > 0 && (
            <View style={st.block}>
              {/* ⚠ 여기 보이는 건 **직접 담은 것뿐**이다. 전체 개수를 적으면 숫자와
                  아래 칩 개수가 안 맞는다. 전체는 상단 버튼이 말해 준다. */}
              <Text style={[st.label, { color: c.textFaint }]}>
                {t.locSheet.picked(customPicked.length)}
              </Text>
              <View style={st.chips}>
                {customPicked.map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => toggle(n)}
                    disabled={saving}
                    style={({ pressed }) => [
                      st.chip,
                      { borderColor: c.accent, backgroundColor: c.accent },
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <Text style={[st.chipText, { color: c.onAccent }]}>{n}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* ⚠ 여기 있던 '이미 있는 곳' 목록을 뺐다 (2026-09-02 사용자 요청).
              "등록하러 들어왔다는 건 없으니깐 이 메뉴에 진입했겠지" — 맞는 말이다.
              이제 제안 칩은 이미 만들어진 이름을 **아예 빼고** 보여 주므로 그 목록이
              말하던 것도 남지 않는다. 대신 직접 입력이 중복일 때는 입력칸 아래에서
              알려 준다 — 조용히 삼키면 눌러도 아무 일이 없는 고장으로 보인다. */}
        </ScrollView>
      </View>
    </Modal>
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
    gap: space.md,
  },
  title: { fontSize: type.bodyStrong, fontWeight: '700', flex: 1, textAlign: 'center' },
  close: { fontSize: type.body },
  save: { fontSize: type.body, fontWeight: '700' },
  flex: { flex: 1 },
  body: { paddingHorizontal: space.xl, paddingTop: space.xl, gap: space.xxl },
  block: { gap: space.md },
  label: { fontSize: type.caption },
  /** 이미 있는 이름을 적었을 때 입력칸 아래에 붙는 지적 */
  dupe: { fontSize: type.caption },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  chipText: { fontSize: type.body, fontWeight: '600' },
  manual: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  addBtn: { width: 84 },
});
