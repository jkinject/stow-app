import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Empty, Loading, Screen } from '@/components/ui';
import { useItemHistory, type ItemEvent } from '@/features/history/api';
import { useItem } from '@/features/item/api';
import { useT } from '@/lib/i18n';
import { radius, type, useTheme, space } from '@/lib/theme';
import { relTime } from '@/lib/time';

/**
 * 변경 이력 — **물건 상세에서 한 단계 더 들어가야 보인다** (2026-09-01 사용자 요청).
 *
 * 원래는 상세 화면 안에 최근 3개를 펼쳐 두고 나머지를 접었는데, 그래도 자리를
 * 차지했다. 이력은 "뭔가 이상할 때 확인하는 것" 이지 매번 볼 것이 아니다.
 * 그래서 상세에는 줄 하나만 남기고 전부 이리로 옮겼다.
 *
 * 화면을 나눈 덕에 **상세 화면이 이력을 조회하지 않는다** — 물건을 열 때마다
 * 나가던 왕복 한 번이 사라졌다. 이력은 여기 들어올 때만 받는다.
 *
 * ⚠ 여기서는 접지 않는다. 일부러 들어온 사람에게 다시 "더 보기" 를 누르게 할
 *   이유가 없다. 조회는 어차피 50개로 잘려 있다(features/history/api.ts).
 */
export default function ItemHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const itemId = String(id);
  const t = useT();

  // 제목 아래에 어느 물건의 이력인지 적는다 — 이 화면만 보면 알 수 없으므로.
  // 상세를 거쳐 들어오니 캐시에 이미 있어 대개 즉시 뜬다.
  const item = useItem(itemId);
  const history = useItemHistory(itemId);

  const events = history.data ?? [];

  return (
    <Screen back scroll={false} title={t.history.title} subtitle={item.data?.name ?? undefined}>
      {history.isLoading ? (
        <Loading />
      ) : events.length === 0 ? (
        <Empty text={t.history.none} hint={t.history.noneHint} />
      ) : (
        <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
          <View style={st.list}>
            {events.map((ev) => (
              <EventRow key={ev.id} ev={ev} />
            ))}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

function EventRow({ ev }: { ev: ItemEvent }) {
  const { c } = useTheme();
  const t = useT();
  const label = t.history[ev.type] ?? ev.type;
  // ⚠ '알 수 없음' 이 아니다 — 프로필이 안 보이는 건 그 사람이 집을 떠났기 때문이다
  const who = ev.actor?.display_name ?? t.item.formerMember;
  return (
    <View style={[st.event, { backgroundColor: c.card }]}>
      <View style={[st.dot, { backgroundColor: c.borderStrong }]} />
      <View style={st.eventMain}>
        <Text style={[st.eventType, { color: c.text }]}>{label}</Text>
        <Text style={[st.eventMeta, { color: c.textFaint }]}>
          {who} · {relTime(ev.created_at, t)}
        </Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingBottom: space.huge },
  list: { gap: space.sm },
  event: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  eventMain: { flex: 1, gap: space.xs },
  eventType: { fontSize: type.body, fontWeight: '600' },
  eventMeta: { fontSize: type.caption },
});
