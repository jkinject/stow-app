import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { MISSION_GOAL } from '@/features/mission/api';
import { useT } from '@/lib/i18n';
import { radius, space, tracking, type, useTheme } from '@/lib/theme';

/**
 * 오늘의 미션 — 물건 다섯 개 등록하기.
 *
 * 생김새는 출석 도장판이다(사용자 레퍼런스 2026-09-02): 위쪽에 알약 배지, 그 아래
 * 이어진 도장 다섯 개, 채운 것은 체크·남은 것은 번호. 다 채우면 배지가 바뀐다.
 *
 * ⚠ **테마마다 결이 다르다.** 다크는 진한 남색에 강조색 도장(시안 dark-neon),
 *   라이트는 크림에 주황 도장(시안 warm-stamp). 색은 전부 팔레트의 `c.mission` 에서
 *   온다 — 여기에 색을 박으면 테마가 하나 늘 때 이 파일을 다시 열어야 한다.
 *
 * ⚠ 이 카드는 **목록과 함께 스크롤된다**(FlatList 의 ListHeaderComponent). 화면 위에
 *   고정하면 물건을 찾는 내내 자리를 먹는다 — 이 앱을 여는 이유는 미션이 아니라
 *   "그거 어디 뒀지" 다.
 *
 * ⚠ 다 채우면 사라지지 않고 **성공을 보여 준다.** 채운 순간 없어지면 해낸 것이
 *   눈에 남지 않는다 — 첫 실행 안내에서 이미 겪은 문제다.
 */

const STAMP = 40;

function Stamp({ n, filled, index }: { n: number; filled: boolean; index: number }) {
  const { c } = useTheme();
  const m = c.mission;
  /**
   * 채워질 때 살짝 튀어오른다. 숫자가 하나 오르는 것보다 "찍혔다" 가 몸으로 읽힌다.
   * ⚠ 처음 그릴 때는 튀지 않는다 — 화면에 들어올 때마다 전부 튀면 시끄럽다.
   */
  const [pop] = useState(() => new Animated.Value(filled ? 1 : 0));
  useEffect(() => {
    Animated.timing(pop, {
      toValue: filled ? 1 : 0,
      duration: 280,
      delay: filled ? index * 45 : 0,
      easing: Easing.out(Easing.back(2.2)),
      useNativeDriver: true,
    }).start();
  }, [filled, index, pop]);

  return (
    <Animated.View
      style={[
        st.stamp,
        {
          backgroundColor: filled ? m.stampOn : 'transparent',
          borderColor: filled ? m.stampOn : m.stampOff,
          transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
        },
      ]}
    >
      <Text style={[st.stampText, { color: filled ? m.badgeFg : m.stampOff }]}>
        {filled ? '✓' : n}
      </Text>
    </Animated.View>
  );
}

export function DailyMission({ done, complete }: { done: number; complete: boolean }) {
  const { c } = useTheme();
  const t = useT();
  const m = c.mission;

  return (
    /**
     * ⚠ 배지가 카드 위 테두리에 걸친다. 그래서 바깥에 `marginTop` 을 주어 잘리지 않게
     *   하고, 카드에는 배지 높이만큼 위 여백을 더 준다. 이걸 빼면 배지가 잘린다.
     */
    <View style={st.outer}>
      <View style={[st.card, { backgroundColor: m.surface, borderColor: m.border }]}>
        <View style={st.stamps}>
          {Array.from({ length: MISSION_GOAL }, (_, i) => (
            <View key={i} style={st.stampCell}>
              {i > 0 && (
                /* 도장 사이를 잇는 선. 지나온 구간만 켠다 — 진행이 한눈에 읽힌다 */
                <View style={[st.track, { backgroundColor: i <= done - 1 ? m.trackOn : m.trackOff }]} />
              )}
              <Stamp n={i + 1} index={i} filled={i < done} />
            </View>
          ))}
        </View>

        <View style={st.foot}>
          <Text style={[st.title, { color: m.text }]} numberOfLines={1}>
            {complete ? t.mission.successHint : t.mission.hint(MISSION_GOAL - done)}
          </Text>
          <Text style={[st.count, { color: m.textFaint }]}>
            {done}/{MISSION_GOAL}
          </Text>
        </View>
      </View>

      <View
        style={[
          st.badge,
          { backgroundColor: complete ? m.doneBg : m.badgeBg },
        ]}
      >
        <Text style={[st.badgeText, { color: complete ? m.doneFg : m.badgeFg }]}>
          {complete ? `✓  ${t.mission.success}` : t.mission.title}
        </Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  outer: { marginTop: space.md },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    // ⚠ 위 여백이 큰 이유: 배지가 카드 위쪽에 걸쳐 앉는다
    paddingTop: space.xxxl,
    paddingBottom: space.lg,
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  /** 카드 위 테두리에 걸치는 알약 배지 */
  badge: {
    position: 'absolute',
    top: -space.md,
    alignSelf: 'center',
    borderRadius: radius.full,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  badgeText: { fontSize: type.caption, fontWeight: '800', letterSpacing: tracking.wide },

  stamps: { flexDirection: 'row', alignItems: 'center' },
  /** ⚠ 각 칸이 균등하게 늘어나야 도장 사이 간격이 같다 */
  stampCell: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  track: { flex: 1, height: 2 },
  stamp: {
    width: STAMP,
    height: STAMP,
    borderRadius: STAMP / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampText: { fontSize: type.label, fontWeight: '800' },

  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  title: { flex: 1, fontSize: type.small, fontWeight: '600' },
  count: { fontSize: type.small, fontWeight: '800' },
});
