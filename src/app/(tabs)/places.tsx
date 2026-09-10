import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { IconBoxes } from '@/components/Icon';
import { ThumbRow } from '@/components/ThumbRow';
import { Empty, Loading, Screen, TextButton } from '@/components/ui';
import { useHousehold } from '@/features/household/context';
import { SpaceChip } from '@/features/household/SpaceSheet';
import { useLocations } from '@/features/storage/api';
import { useCoverStacks } from '@/features/storage/covers';
import { LocationSheet } from '@/features/storage/LocationSheet';
import { useT } from '@/lib/i18n';
import { useTheme, type, space, leading } from '@/lib/theme';

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
  const { activeId, households, active } = useHousehold();
  const multiple = households.length > 1 && !!active;

  const locations = useLocations(activeId);

  /**
   * 장소마다 **여러 장**을 겹쳐 보여 준다.
   *
   * ⚠ 예전에는 안의 물건 사진 **한 장**을 썼는데, 그게 그 장소의 대표 사진처럼
   *   읽혔다(사용자 보고 2026-09-02). 장소에는 제 사진이 없다 — 빌려 온 것임이
   *   보여야 한다. 이동 화면과 **같은 규칙·같은 컴포넌트**를 쓴다.
   */
  const { cover, thumbs } = useCoverStacks(activeId);

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

  /**
   * 제목 줄 = "공간 │ 보관 장소 · N개" + 오른쪽 "+ 장소" (2026-09-10, Codex 시안 2 를 사용자가 선택).
   * ⚠ 앱 이름("어디뒀지") 제목은 뺐다 — 이 탭에서 하는 일이 없었다. 공간이 하나면 접두와 구분선이
   *   빠져 "보관 장소 · N개   + 장소" 만 남는다. 찾기 탭 검색창 접두와 같은 글자·꺾쇠를 쓴다.
   */
  const titleNode = (
    <View style={st.titleRow}>
      {multiple && (
        <>
          <SpaceChip variant="header" />
          <View style={[st.divider, { backgroundColor: c.border }]} />
        </>
      )}
      <Text style={[st.title, { color: c.text }]} numberOfLines={1}>
        {t.places.section(list.length)}
      </Text>
    </View>
  );

  return (
    <Screen
      titleNode={titleNode}
      action={<TextButton label={t.places.addLocation} onPress={() => setAdding(true)} size="small" />}
    >
      <View style={st.body}>
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
                stack={{ paths: cover.loc.get(l.id), get: thumbs.get }}
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
  body: { paddingHorizontal: space.xl, gap: space.md },
  titleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  divider: { width: 1, alignSelf: 'stretch', marginVertical: space.sm },
  title: { flexShrink: 0, fontSize: type.small, lineHeight: leading.small, fontWeight: '700' },
  list: { gap: space.sm },
});
