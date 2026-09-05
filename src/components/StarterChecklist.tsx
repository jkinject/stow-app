import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { IconCheck } from '@/components/Icon';
import { useT } from '@/lib/i18n';
import { radius, type, useTheme, space, tracking, leading } from '@/lib/theme';

/**
 * 첫 실행 안내 (2026-09-01 사용자 요청: "앱 깔고 처음 로그인 딱 했을때 뭘 해야하는지 막막함").
 *
 * ⚠ 전에는 이 자리에 "보관 장소 탭에서 첫 물건을 넣어 보세요" 라는 **문장 하나**만
 *   있었다. 문제가 두 개였다:
 *     · 다른 탭으로 가라고만 하고 데려다주지 않는다
 *     · 정작 화면에서 제일 눈에 띄는 + 버튼 얘기는 없다 (그리고 그 버튼은
 *       장소가 없으면 막다른 길이었다 — MovePicker 주석 참고)
 *
 * 전체화면 소개 슬라이드를 쓰지 않은 이유: 읽고 넘기면 끝이라 **다시 볼 수 없다.**
 * 막막한 사람에게 필요한 것은 한 번의 설명이 아니라 "지금 뭘 해야 하는지" 가
 * 화면에 계속 남아 있는 것이다.
 *
 * 코치마크(화살표로 버튼 가리키기)도 쓰지 않았다. 실기기가 폴더블(Z폴드)이라
 * 펼침·접힘에서 좌표가 어긋난다.
 *
 * ⚠ 1·2단계의 완료 여부는 **넘겨받는다**(DB 사실). 여기서 저장하지 않는다.
 *
 * ⚠⚠ 다 끝났다고 **저절로 사라지면 안 된다** (2026-09-01 사용자 보고).
 *   3단계를 끝낸 순간 카드가 그냥 없어지니까 "다 한 건지, 뭘 잘못 눌러 없앤 건지"
 *   알 수가 없었다. 마지막 체크가 들어오는 걸 못 보고 화면만 비는 셈이다.
 *   그래서 끝나면 **다 채워진 모습을 보여 주고**, 닫는 것은 사람이 한다.
 */
export function StarterChecklist({
  hasPlace,
  hasItem,
  hasSearched,
  hasCategory,
  onCreatePlace,
  onAddItem,
  onManageCategories,
  onDismiss,
}: {
  hasPlace: boolean;
  hasItem: boolean;
  hasSearched: boolean;
  hasCategory: boolean;
  onCreatePlace: () => void;
  onAddItem: () => void;
  onManageCategories: () => void;
  onDismiss: () => void;
}) {
  const { c } = useTheme();
  const t = useT();

  const steps = [
    {
      done: hasPlace,
      label: t.starter.step1,
      hint: t.starter.step1Hint,
      onPress: onCreatePlace,
    },
    {
      done: hasItem,
      label: t.starter.step2,
      hint: t.starter.step2Hint,
      // ⚠ 장소가 없으면 등록이 막다른 길이 된다. 그때는 장소 만들기로 보낸다.
      onPress: hasPlace ? onAddItem : onCreatePlace,
    },
    {
      done: hasSearched,
      label: t.starter.step3,
      hint: t.starter.step3Hint,
      // 검색은 위 입력칸에서 하는 것이라 여기서 할 일이 없다 — 누를 수 없게 둔다
      onPress: undefined,
    },
    {
      /**
       * ⚠ 카테고리는 **핵심 흐름이 아니다**(넣고 → 찾는 데는 없어도 된다).
       *   그런데 화면이 더보기 깊숙이 있어서 아무도 못 찾는다(사용자 요청 2026-09-01).
       *   그래서 안내에 넣되 **마지막**에 둔다 — 앞의 셋을 막지 않는다.
       */
      done: hasCategory,
      label: t.starter.step4,
      hint: t.starter.step4Hint,
      onPress: onManageCategories,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  /** 다음에 할 일 하나만 강조한다. 셋 다 똑같이 보이면 어디부터인지 또 고민하게 된다 */
  const nextIndex = steps.findIndex((s) => !s.done);

  return (
    <View style={[st.card, { backgroundColor: c.card }]}>
      <View style={st.head}>
        <Text style={[st.title, { color: c.text }]}>
          {allDone ? t.starter.doneTitle : t.starter.title}
        </Text>
        <Text style={[st.progress, { color: allDone ? c.accentText : c.textFaint }]}>
          {t.starter.progress(doneCount, steps.length)}
        </Text>
      </View>

      <View style={st.steps}>
        {steps.map((s, i) => (
          <Step
            key={s.label}
            n={i + 1}
            done={s.done}
            next={i === nextIndex}
            label={s.label}
            hint={s.hint}
            onPress={s.onPress}
          />
        ))}
      </View>

      {allDone ? (
        /* 다 끝났을 때만 닫기가 **주된 행동**이 된다 — 글자 링크가 아니라 버튼으로 둔다.
           눌러야 사라지므로 "내가 끝냈다" 는 것이 손끝으로 남는다. */
        <View style={st.finish}>
          <Text style={[st.finishHint, { color: c.textMuted }]}>{t.starter.doneHint}</Text>
          <Button label={t.starter.finish} onPress={onDismiss} />
        </View>
      ) : (
        <Pressable onPress={onDismiss} hitSlop={8} style={st.hide}>
          <Text style={[st.hideText, { color: c.textFaint }]}>{t.starter.hide}</Text>
        </Pressable>
      )}
    </View>
  );
}

function Step({
  n,
  done,
  next,
  label,
  hint,
  onPress,
}: {
  n: number;
  done: boolean;
  next: boolean;
  label: string;
  hint: string;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  const t = useT();

  return (
    <Pressable
      onPress={onPress}
      disabled={done || !onPress}
      style={({ pressed }) => [st.step, pressed && onPress && !done ? { opacity: 0.6 } : null]}
    >
      <View
        style={[
          st.bullet,
          { borderColor: c.borderStrong },
          done && { backgroundColor: c.accent, borderColor: c.accent },
        ]}
      >
        {/* 체크는 그림이다 — 문자로 그리면 기기 폰트마다 크기·위치가 달라진다 */}
        {done ? (
          <IconCheck size={14} color={c.onAccent} />
        ) : (
          <Text style={[st.bulletText, { color: c.textFaint }]}>{String(n)}</Text>
        )}
      </View>

      <View style={st.stepMain}>
        <Text
          style={[
            st.stepLabel,
            { color: done ? c.textFaint : c.text },
            done && st.struck,
            next && { fontWeight: '700' },
          ]}
        >
          {label}
        </Text>
        {!done && <Text style={[st.stepHint, { color: c.textFaint }]}>{hint}</Text>}
      </View>

      {/* 지금 할 일에만 실행 버튼을 붙인다 */}
      {next && onPress ? (
        <Text style={[st.open, { color: c.accentText }]}>{t.starter.open}</Text>
      ) : null}
    </Pressable>
  );
}

const st = StyleSheet.create({
  card: {
    marginHorizontal: space.xl,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
    gap: space.lg,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: type.subtitle, fontWeight: '700', letterSpacing: tracking.tight },
  progress: { fontSize: type.caption, fontWeight: '600' },
  steps: { gap: space.lg },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  bullet: {
    width: 24,
    height: 24,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletText: { fontSize: type.caption, fontWeight: '700' },
  stepMain: { flex: 1, gap: space.xs },
  stepLabel: { fontSize: type.body, fontWeight: '600' },
  struck: { textDecorationLine: 'line-through' },
  stepHint: { fontSize: type.caption },
  open: { fontSize: type.label, fontWeight: '700' },
  finish: { gap: space.md, paddingBottom: space.sm },
  finishHint: { fontSize: type.small, lineHeight: leading.small },
  hide: { alignSelf: 'center', paddingVertical: space.sm, paddingHorizontal: space.md },
  hideText: { fontSize: type.caption },
});
