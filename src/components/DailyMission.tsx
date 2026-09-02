import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { MISSION_GOAL } from '@/features/mission/api';
import { useT } from '@/lib/i18n';
import { radius, space, tracking, type, useTheme } from '@/lib/theme';

/**
 * 오늘의 미션 — 물건 다섯 개 등록하기.
 *
 * ⚠ 이 카드는 **목록과 함께 스크롤된다**(FlatList 의 ListHeaderComponent). 화면 위에
 *   고정하면 물건을 찾는 내내 자리를 먹는다 — 이 앱을 여는 이유는 미션이 아니라
 *   "그거 어디 뒀지" 다(사용자 요청 2026-09-02).
 *
 * ⚠ 다 채우면 사라지지 않고 **성공을 보여 준다.** 채운 순간 없어지면 해낸 것이
 *   눈에 남지 않는다 — 첫 실행 안내(StarterChecklist)에서 이미 겪은 문제다.
 */

const DOT = 26;

function Dot({ filled, index }: { filled: boolean; index: number }) {
  const { c } = useTheme();
  /**
   * 채워질 때 살짝 튀어오른다. 숫자가 하나 오르는 것보다 "찼다" 가 몸으로 읽힌다.
   * ⚠ 처음 그릴 때는 튀지 않는다 — 화면에 들어올 때마다 전부 튀면 시끄럽다.
   */
  const [pop] = useState(() => new Animated.Value(filled ? 1 : 0));
  useEffect(() => {
    Animated.timing(pop, {
      toValue: filled ? 1 : 0,
      duration: 260,
      delay: filled ? index * 40 : 0,
      easing: Easing.out(Easing.back(2)),
      useNativeDriver: true,
    }).start();
  }, [filled, index, pop]);

  return (
    <Animated.View
      style={[
        st.dot,
        {
          borderColor: filled ? c.accent : c.borderStrong,
          backgroundColor: filled ? c.accent : 'transparent',
          transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }],
        },
      ]}
    >
      {filled && <Text style={[st.check, { color: c.onAccent }]}>✓</Text>}
    </Animated.View>
  );
}

export function DailyMission({ done, complete }: { done: number; complete: boolean }) {
  const { c } = useTheme();
  const t = useT();
  return (
    <View
      style={[
        st.card,
        {
          backgroundColor: c.card,
          // 성공했을 때만 테두리로 알린다. 평소에는 조용해야 목록이 주인공이다.
          borderColor: complete ? c.ok : 'transparent',
        },
      ]}
    >
      <View style={st.head}>
        <Text style={[st.title, { color: c.text }]}>
          {complete ? t.mission.success : t.mission.title}
        </Text>
        <Text style={[st.count, { color: complete ? c.ok : c.textFaint }]}>
          {done}/{MISSION_GOAL}
        </Text>
      </View>
      <Text style={[st.sub, { color: c.textFaint }]}>
        {complete ? t.mission.successHint : t.mission.hint(MISSION_GOAL - done)}
      </Text>
      <View style={st.dots}>
        {Array.from({ length: MISSION_GOAL }, (_, i) => (
          <Dot key={i} index={i} filled={i < done} />
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.sm,
    // ⚠ 자리를 항상 잡아 둔다. 성공했을 때만 테두리를 켜면 그때 카드가 2px 커진다.
    borderWidth: 1,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: type.subtitle, fontWeight: '700', letterSpacing: tracking.tight },
  count: { fontSize: type.small, fontWeight: '700' },
  sub: { fontSize: type.caption },
  dots: { flexDirection: 'row', gap: space.sm, paddingTop: space.xs },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: { fontSize: type.caption, fontWeight: '800' },
});
