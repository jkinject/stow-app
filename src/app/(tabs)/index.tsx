import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fab } from '@/components/Fab';
import { IconQr } from '@/components/Icon';
import { StarterChecklist } from '@/components/StarterChecklist';
import { useCategoryList } from '@/features/category/api';
import { Empty, Field, Loading } from '@/components/ui';
import { useHousehold } from '@/features/household/context';
import { useAuth } from '@/lib/auth';
import { useStarterState } from '@/features/onboarding/checklist';
import { ItemCard } from '@/features/item/ItemCard';
import { useThumbUrls } from '@/features/item/thumbs';
import { filterItems, useSearchIndex, type Indexed } from '@/features/search/api';
import { useLocations } from '@/features/storage/api';
import { LocationSheet } from '@/features/storage/LocationSheet';
import { useT } from '@/lib/i18n';
import { useTheme, type, radius, overlay } from '@/lib/theme';

/**
 * 찾기 — 앱의 첫 화면 (2026-08-30 UI 개편).
 *
 * 목록 대신 **사진 격자**를 보여준다. 집안 물건은 이름이 잘 기억나지 않지만
 * **보면 안다.** "파란 뚜껑 통" 을 글자로 검색하긴 어려워도 사진으로는 즉시 찾는다.
 *
 * 순서는 **무작위**다(사용자 요청). 같은 것만 위에 고정돼 있으면 아래쪽 물건은
 * 영영 눈에 띄지 않는다. 대가: 어제 본 위치에 오늘은 없다.
 *
 * ⚠ 무한 스크롤을 **서버 페이지네이션으로 만들지 않았다.** 무작위 정렬 + 페이지네이션은
 *   페이지마다 순서가 다시 섞여 **같은 물건이 중복되거나 영영 안 나오는** 고전적인 버그를
 *   낳는다. 이 앱은 이미 가구의 물건 전체를 메모리에 올려 검색한다(§4.6, 상한 2만 건).
 *   그래서 **한 번 섞어 두고 FlatList 가 화면에 보이는 것만 그리게** 한다.
 *   가상화는 FlatList 가 기본으로 해 주므로 별도 윈도잉 코드가 필요 없다.
 */

const GAP = 10;
const PADDING = 14;
/** 한 번에 더 그릴 개수. 2열이므로 짝수여야 마지막 줄이 어긋나지 않는다 */
const PAGE = 24;

export default function FindTab() {
  const { c } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const win = useWindowDimensions();
  const { activeId } = useHousehold();

  const { indexed, isLoading, isFetching, dataUpdatedAt } = useSearchIndex(activeId);
  const locations = useLocations(activeId);
  const thumbs = useThumbUrls();

  const [q, setQ] = useState('');
  const [offline, setOffline] = useState(false);

  /**
   * 첫 실행 안내.
   * ⚠ **사용자별**이다. 기기별로 두면 같은 폰에서 새 계정으로 가입한 사람에게
   *   안내가 안 뜬다 — 가족이 폰을 돌려 쓰는 앱이라 실제로 그런 일이 있었다.
   */
  const { session } = useAuth();
  const starter = useStarterState(session?.user.id ?? null);
  const [creatingPlace, setCreatingPlace] = useState(false);

  /**
   * 섞는 순서를 고정하는 씨앗. 앱을 켜는 동안 유지되고, 당겨서 새로고침할 때만 바뀐다.
   * 렌더마다 다시 섞으면 스크롤 도중 물건이 눈앞에서 자리를 바꾼다.
   */
  const [seed, setSeed] = useState(1);

  /**
   * 장소 필터. null 이면 전체.
   * 물건이 수백 개가 되면 "어느 방" 만으로도 후보가 확 줄어든다 — 검색어를 떠올리기
   * 전에 쓸 수 있는 가장 싼 필터다.
   */
  const [place, setPlace] = useState<string | null>(null);

  const shuffled = useMemo(() => shuffle(indexed, seed), [indexed, seed]);
  const scoped = useMemo(
    () => (place ? shuffled.filter((i) => i.location_id === place) : shuffled),
    [shuffled, place],
  );
  const results = useMemo(() => filterItems(scoped, q), [scoped, q]);

  const cardW = (win.width - PADDING * 2 - GAP) / 2;

  /**
   * 첫 실행 안내를 띄울지.
   *
   * ⚠ "물건이 0개일 때" 로 하면 안 된다. 2단계(물건 등록)를 끝내는 순간 목록이
   *   생겨서 안내가 사라지고, **3단계는 아무도 못 본다.** 세 단계를 다 끝냈거나
   *   사용자가 치웠을 때만 사라져야 한다.
   */
  const hasPlace = (locations.data ?? []).length > 0;
  const hasItem = indexed.length > 0;

  /**
   * ⚠ 다 끝났다고 여기서 숨기지 않는다 (2026-09-01 사용자 보고).
   *   전에는 `!allDone` 조건이 있어서 3단계를 마치는 **순간 카드가 사라졌다.**
   *   마지막 체크가 들어오는 걸 보지도 못하고 화면만 비니까, 끝낸 건지 잘못 눌러
   *   없앤 건지 알 수가 없었다. 이제 사라지는 건 사람이 "시작하기" 를 눌렀을 때뿐이다.
   */
  const showStarter = !starter.dismissed;

  /**
   * 카테고리 개수 — 안내 4단계 판정에만 쓴다.
   * ⚠ 안내를 닫으면 `null` 을 넘겨 **질의 자체를 끈다**(훅의 `enabled: !!householdId`).
   *   이 조회는 왕복이 두 번(카테고리 + 물건)이라, 홈 화면에서 계속 돌 이유가 없다.
   */
  const categories = useCategoryList(showStarter ? activeId : null);

  const checklist = showStarter ? (
    <StarterChecklist
      hasPlace={hasPlace}
      hasItem={hasItem}
      hasSearched={starter.searched}
      hasCategory={(categories.data ?? []).length > 0}
      onCreatePlace={() => setCreatingPlace(true)}
      onAddItem={() => router.push('/add/new')}
      onManageCategories={() => router.push('/categories')}
      onDismiss={starter.dismiss}
    />
  ) : null;

  /**
   * 무한 스크롤. 목록 전체는 이미 메모리에 있으므로 **서버를 다시 부르지 않고**
   * 그려낼 개수만 늘린다.
   *
   * ⚠ 개수를 제한하는 진짜 이유는 렌더 성능이 아니라 **썸네일 서명**이다.
   *   물건 2,000건의 서명 URL 을 한 번에 요청하면 무료 티어에서 곧바로 문제가 된다.
   *   보이는 만큼만 서명하고, 스크롤하면 그만큼 더 서명한다 (R13).
   */
  const [limit, setLimit] = useState(PAGE);
  const visible = useMemo(() => results.slice(0, limit), [results, limit]);

  /**
   * ⚠ 검색어·순서가 바뀔 때의 초기화는 **이펙트가 아니라 바꾸는 지점에서** 한다.
   *   이펙트 안에서 setState 를 하면 렌더가 연쇄된다(react-hooks 규칙).
   */
  const onQuery = useCallback(
    (t: string) => {
      setQ(t);
      setLimit(PAGE);
      // 첫 실행 안내 3단계.
      // ⚠ 물건이 하나도 없을 때의 검색은 세지 않는다 — 찾을 게 없는데 친 것을
      //   "찾아봤다" 로 치면 2단계보다 3단계가 먼저 끝나는 이상한 순서가 된다.
      if (t.trim() && indexed.length > 0) starter.markSearched();
    },
    [starter, indexed.length],
  );
  const onReshuffle = useCallback(() => {
    setSeed((n) => n + 1);
    setLimit(PAGE);
  }, []);
  const onPlace = useCallback((id: string | null) => {
    setPlace(id);
    setLimit(PAGE);
  }, []);

  useEffect(() => {
    thumbs.ensure(visible.map((r) => r.thumb_path));
  }, [visible, thumbs]);

  useEffect(() => {
    const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!base) return;
    let alive = true;
    fetch(`${base}/auth/v1/health`)
      .then(() => alive && setOffline(false))
      .catch(() => alive && setOffline(true));
    return () => {
      alive = false;
    };
  }, [dataUpdatedAt]);

  const renderItem = useCallback(
    ({ item }: { item: Indexed }) => (
      <ItemCard
        name={item.name}
        subtitle={item.path}
        category={item.category?.name ?? null}
        quantity={item.quantity}
        width={cardW}
        thumb={thumbs.get(item.thumb_path)}
        onPress={() => router.push(`/item/${item.id}`)}
      />
    ),
    [cardW, router, thumbs],
  );

  return (
    <View style={[st.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      {/* 검색창과 스캔은 항상 맨 위에 고정된다 — 이 화면의 두 시작점이다 */}
      <View style={st.head}>
        <Field
          value={q}
          onChangeText={onQuery}
          placeholder={t.find.searchPlaceholder}
          autoCorrect={false}
          returnKeyType="search"
          clearable
          wrapStyle={st.flex}
          style={st.input}
        />
        <Pressable
          onPress={() => router.push('/scan')}
          style={({ pressed }) => [
            st.scanBtn,
            { borderColor: c.border, backgroundColor: c.card },
            pressed && { opacity: 0.7 },
          ]}
        >
          {/* ⚠ '⌗'(우물 정)은 QR 이 아니다 — 해시 기호다. 실제 QR 모양으로 그린다 */}
          <IconQr color={c.accent} size={24} />
        </Pressable>
      </View>

      {/* 장소 필터 — 좌우로 넘겨 고른다. 장소가 하나뿐이면 고를 게 없으므로 숨긴다 */}
      {(locations.data?.length ?? 0) > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.filterRow}
          keyboardShouldPersistTaps="handled"
          /**
           * ⚠ 가로 ScrollView 를 세로 flex 안에 그냥 두면 **남는 세로 공간을 전부 차지한다.**
           *   칩이 화면 끝까지 늘어나 목록을 덮는다(실사용 보고 — 필터로 0건일 때 특히 눈에 띈다).
           *   높이를 내용에 맞추도록 flexGrow: 0 을 준다.
           */
          style={st.filterScroll}
        >
          {[{ id: null as string | null, name: t.find.allPlaces }, ...(locations.data ?? [])].map(
            (l) => {
              const on = place === l.id;
              return (
                <Pressable
                  key={l.id ?? 'all'}
                  onPress={() => onPlace(l.id)}
                  style={[
                    st.filterChip,
                    { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent : c.card },
                  ]}
                >
                  <Text style={[st.filterText, { color: on ? c.onAccent : c.textMuted }]}>
                    {l.name}
                  </Text>
                </Pressable>
              );
            },
          )}
        </ScrollView>
      )}

      <View style={st.meta}>
        <Text style={[st.metaText, { color: c.textFaint }]}>
          {q ? t.find.hits(results.length) : t.find.total(indexed.length)}
        </Text>
        {isFetching && <Text style={[st.metaText, { color: c.textFaint }]}>{t.find.syncing}</Text>}
      </View>

      {offline && (
        <View style={[st.banner, { backgroundColor: c.sunk, borderColor: c.border }]}>
          <Text style={[st.bannerText, { color: c.textMuted }]}>
            {t.find.offline(formatWhen(dataUpdatedAt, t))}
          </Text>
        </View>
      )}

      {isLoading ? (
        <Loading />
      ) : indexed.length === 0 ? (
        /* ⚠ 여기가 "앱 깔고 처음 들어왔을 때" 보이던 화면이다. 전에는 문장 하나로
           "보관 장소 탭에서 넣어 보세요" 라고만 했다 — 데려다주지도 않고, 바로
           아래 + 버튼 얘기도 없었다. 지금은 할 일을 순서대로 두고 눌러서 간다. */
        checklist ?? <Empty text={t.find.noItems} hint={t.find.noItemsHint} />
      ) : results.length === 0 ? (
        /* ⚠ 검색어 없이 장소 필터만으로 0건이 될 수 있다. 그때 검색 실패 문구를 쓰면
           `"" 를 찾지 못했습니다` 라는 빈 따옴표가 나온다(실사용 보고). */
        q.trim() ? (
          <Empty text={t.find.noHits(q)} hint={t.find.noHitsHint} />
        ) : (
          <Empty text={t.find.emptyPlace} hint={t.find.emptyPlaceHint} />
        )
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          /* 썸네일 서명이 도착하면 셀을 다시 그려야 한다 */
          extraData={thumbs}
          numColumns={2}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{
            paddingHorizontal: PADDING,
            paddingBottom: insets.bottom + 24,
            gap: GAP,
          }}
          keyboardShouldPersistTaps="handled"
          /* 물건이 생겨도 남은 단계가 있으면 격자 위에 계속 둔다 */
          ListHeaderComponent={checklist ? <View style={st.starterWrap}>{checklist}</View> : null}
          onEndReached={() => setLimit((n) => Math.min(n + PAGE, results.length))}
          onEndReachedThreshold={0.6}
          // 당겨서 새로고침하면 순서를 다시 섞는다 — "다른 물건이 보고 싶다" 는 뜻이다
          refreshing={false}
          onRefresh={onReshuffle}
          removeClippedSubviews
          ListFooterComponent={
            limit < results.length ? (
              <Text style={[st.more, { color: c.textFaint }]}>
                {t.find.more(results.length - limit)}
              </Text>
            ) : null
          }
        />
      )}
      {/* 어디서든 바로 등록. 목적지는 등록 2단계에서 고른다 */}
      <Fab onPress={() => router.push('/add/new')} tabBar />

      <LocationSheet
        visible={creatingPlace}
        householdId={activeId}
        onClose={(created) => {
          setCreatingPlace(false);
          // 장소를 만들었으면 곧바로 다음 단계로 데려간다 — 여기서 멈추면
          // "장소는 만들었는데 그래서 뭐?" 가 된다.
          if (created > 0 && indexed.length === 0) router.push('/add/new');
        }}
      />
    </View>
  );
}

/**
 * 씨앗 기반 셔플 (Fisher–Yates + 결정적 난수).
 *
 * ⚠ `Math.random()` 을 쓰면 안 된다. 렌더마다 순서가 달라져 스크롤 중에 물건이
 *   눈앞에서 자리를 바꾼다. 같은 (목록, 씨앗) 이면 항상 같은 순서가 나와야 한다.
 */
function shuffle(items: Indexed[], seed: number): Indexed[] {
  const out = items.slice();
  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function formatWhen(ts: number, t: ReturnType<typeof useT>): string {
  if (!ts) return t.time.noRecord;
  const d = new Date(ts);
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return t.time.justNow;
  if (mins < 60) return t.time.minutesAgo(mins);
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t.time.hoursAgo(hrs);
  return t.time.monthDay(d.getMonth() + 1, d.getDate());
}

const st = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  head: { flexDirection: 'row', gap: 8, paddingHorizontal: PADDING, paddingTop: 8 },
  /**
   * ⚠ 여기에 `flex: 1` 을 두면 안 된다. `Field` 는 ✕ 버튼을 얹으려고 TextInput 을
   *   **세로 컬럼** View 로 감싼다. 그래서 이 스타일의 flex 는 가로가 아니라
   *   **세로**로 작동해 입력칸이 찌그러지고 글자가 안 보인다 (실사용 보고).
   *   가로로 늘리는 것은 `wrapStyle={st.flex}` 가 바깥에서 한다.
   */
  input: { fontSize: type.bodyStrong },
  scanBtn: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: PADDING,
    paddingVertical: 8,
  },
  metaText: { fontSize: type.caption, fontVariant: ['tabular-nums'] },
  banner: {
    marginHorizontal: PADDING,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  bannerText: { fontSize: type.small },
  starterWrap: { paddingBottom: 16, marginHorizontal: -PADDING },
  more: { fontSize: type.caption, textAlign: 'center', paddingVertical: 16 },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: { paddingHorizontal: PADDING, gap: 7, paddingTop: 4, alignItems: 'center' },
  filterChip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7 },
  filterText: { fontSize: type.small, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 18,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    // 격자 위에 떠 있어야 하므로 그림자로 띄운다
    shadowColor: overlay.bg,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
});
