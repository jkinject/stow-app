import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconBoxes } from '@/components/Icon';
import { ThumbRow } from '@/components/ThumbRow';
import { Empty, Loading, Screen, SectionLabel } from '@/components/ui';
import { useHousehold } from '@/features/household/context';
import { useThumbUrls } from '@/features/item/thumbs';
import { useAllItems } from '@/features/search/api';
import { useLocations } from '@/features/storage/api';
import { LocationSheet } from '@/features/storage/LocationSheet';
import { useT } from '@/lib/i18n';
import { useTheme, type, radius } from '@/lib/theme';

/**
 * 보관 장소 — 정리 작업용 탭.
 *
 * 검색·스캔은 "찾기" 탭으로 갔다. 여기는 **집 구조를 만드는 곳**이다:
 * 장소를 만들고, 그 안에 박스를 만들고, 물건을 넣는다.
 * 가끔 하는 일이라 첫 화면이 아니어도 된다.
 */
export default function PlacesTab() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { households, active, activeId, setActiveId } = useHousehold();

  const locations = useLocations(activeId);

  /**
   * 장소마다 대표 사진 한 장.
   *
   * 이름과 개수만 있으면 줄이 커다란 빈 판처럼 보인다. 사진이 있으면 "아, 저기" 하고
   * 바로 알아본다 — 이 앱에서 장소를 기억하는 방식은 이름이 아니라 그 안의 물건이다.
   *
   * ⚠ 새 질의를 만들지 않는다. 찾기 탭이 쓰는 `useAllItems` 와 **같은 캐시 키**라
   *   이미 받아 둔 데이터를 그대로 읽는다 (네트워크 비용 0).
   */
  const items = useAllItems(activeId);
  const thumbs = useThumbUrls();
  const coverOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items.data ?? []) {
      if (it.thumb_path && !m.has(it.location_id)) m.set(it.location_id, it.thumb_path);
    }
    return m;
  }, [items.data]);

  useEffect(() => {
    thumbs.ensure([...coverOf.values()]);
  }, [coverOf, thumbs]);

  /**
   * ⚠ 여기 있던 인라인 입력칸을 **공용 시트**(LocationSheet)로 바꿨다 (2026-09-01).
   *   첫 실행 안내와 물건 등록 화면에서도 장소를 만들 수 있게 되면서 같은 UI 가
   *   세 곳이 됐는데, 각자 만들면 한쪽만 고쳐지는 날이 반드시 온다.
   *
   *   덤: 예전 주석에 "장소는 연속으로 만들지 않는다(한 번에 하나씩 생각하며
   *   만든다)" 고 적혀 있었는데, 그건 **빈 입력칸일 때** 맞는 말이었다. 흔한
   *   이름을 칩으로 제안하면 오히려 몰아서 만드는 게 자연스럽다 — 처음 설정할 때
   *   집 구조는 이미 머릿속에 다 있다.
   */
  const [adding, setAdding] = useState(false);

  const list = locations.data ?? [];

  return (
    <Screen title={active?.name ?? t.places.title}>
      <View style={st.body}>
        {households.length > 1 && (
          <View style={st.switcher}>
            {households.map((h) => (
              <Pressable
                key={h.id}
                onPress={() => setActiveId(h.id)}
                style={[
                  st.chip,
                  { borderColor: c.border },
                  h.id === activeId && { backgroundColor: c.accent, borderColor: c.accent },
                ]}
              >
                <Text
                  style={[
                    st.chipText,
                    { color: c.text },
                    h.id === activeId && { color: c.onAccent, fontWeight: '600' },
                  ]}
                >
                  {h.name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <SectionLabel
          action={
            <Pressable onPress={() => setAdding(true)} hitSlop={12}>
              <Text style={[st.addBtn, { color: c.accentText }]}>{t.places.addLocation}</Text>
            </Pressable>
          }
        >
          {t.places.section(list.length)}
        </SectionLabel>

        {locations.isLoading ? (
          <Loading />
        ) : list.length === 0 ? (
          <Empty
            text={t.places.none}
            hint={t.places.noneHint}
          />
        ) : (
          <View style={st.list}>
            {list.map((l) => (
              <ThumbRow
                key={l.id}
                title={l.name}
                subtitle={t.places.summary(l.container_count, l.item_count)}
                thumb={thumbs.get(coverOf.get(l.id))}
                fallback={<IconBoxes color={c.textFaint} size={20} />}
                onPress={() => router.push(`/location/${l.id}`)}
              />
            ))}
          </View>
        )}
      </View>

      <LocationSheet
        visible={adding}
        householdId={activeId}
        onClose={() => setAdding(false)}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  body: { paddingHorizontal: 20, gap: 12 },
  addBtn: { fontSize: type.body, fontWeight: '600' },
  switcher: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: type.label },
  hint: { fontSize: type.caption },
  list: { gap: 8 },
});
