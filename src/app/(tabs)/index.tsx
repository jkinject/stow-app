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
import { IconQr, IconSort } from '@/components/Icon';
import { DailyMission } from '@/components/DailyMission';
import { StarterChecklist } from '@/components/StarterChecklist';
import { useCategoryList } from '@/features/category/api';
import { Empty, Field, Loading } from '@/components/ui';
import { useHousehold } from '@/features/household/context';
import { useTodayMission } from '@/features/mission/api';
import { useAuth } from '@/lib/auth';
import { useStarterState } from '@/features/onboarding/checklist';
import { ItemCard } from '@/features/item/ItemCard';
import { useThumbUrls } from '@/features/item/thumbs';
import { filterItems, useSearchIndex, type Indexed } from '@/features/search/api';
import { useLocations } from '@/features/storage/api';
import { LocationSheet } from '@/features/storage/LocationSheet';
import { useT } from '@/lib/i18n';
import { useTheme, type, radius, space } from '@/lib/theme';

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

// ⚠ 이 두 값은 격자 스타일과 cardW 계산이 **함께** 본다. 하나만 고치면 카드가
//   넘쳐서 한 줄에 하나씩 떨어진다 — 박스·장소 상세에서 실제로 그랬다.
const GAP = space.md;
const PADDING = space.lg;
/**
 * 화면 위쪽에 **고정된 줄들 사이**의 간격 (검색줄 · 장소 필터 · 목록).
 *
 * ⚠ 한 값을 위아래가 함께 쓴다. 전에는 위 4 · 아래 16 이라 필터 줄이 아래로 쏠려
 *   보였다 — 스케일 안의 값이어도 짝이 안 맞으면 어긋나 보인다(사용자 지적).
 */
const GUTTER = space.lg;
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

  /**
   * 정렬 (2026-09-02 사용자 요청).
   *
   * ⚠ **랜덤이 기본이다.** 이 앱은 "그거 어디 뒀지" 로 여는데, 최근 등록순으로 두면
   *   맨 위 몇 개만 늘 보이고 나머지는 영영 안 보인다. 섞어 두면 열 때마다 다른 물건이
   *   눈에 들어와 "아 저것도 있었지" 가 된다.
   *
   * ⚠ 고른 값을 저장하지 않는다. 앱을 다시 켜면 랜덤으로 돌아온다 — 위 이유가
   *   기본값의 근거이고, "방금 넣은 것 찾기" 는 그 순간에만 필요한 일이다.
   */
  const [sort, setSort] = useState<'shuffle' | 'recent'>('shuffle');

  const ordered = useMemo(
    () =>
      sort === 'recent'
        ? // ⚠ ISO 8601 문자열이라 사전순 비교가 곧 시간순이다 (Date 로 바꿀 이유가 없다)
          indexed.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))
        : shuffle(indexed, seed),
    [indexed, seed, sort],
  );
  const scoped = useMemo(
    () => (place ? ordered.filter((i) => i.location_id === place) : ordered),
    [ordered, place],
  );
  const results = useMemo(() => filterItems(scoped, q), [scoped, q]);

  /**
   * 장소 필터를 그릴지. 장소가 하나뿐이면 고를 게 없어 숨긴다.
   * ⚠ 아래 여백을 누가 줄지도 이 값으로 갈린다 — `headAlone` 주석 참고.
   */
  const showFilters = (locations.data?.length ?? 0) > 1;

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
   * 오늘의 미션.
   *
   * ⚠ 첫 실행 안내가 떠 있는 동안에는 숨긴다. 처음 온 사람에게 "장소를 만드세요"
   *   와 "다섯 개를 등록하세요" 를 같이 들이밀면 무엇부터 할지 모른다 — 안내를
   *   끝낸 사람에게만 다음 목표를 준다.
   * ⚠ 물건이 하나도 없을 때도 숨긴다. 이 화면은 그때 빈 상태 안내를 보여 준다.
   * ⚠ 다 채운 뒤 사용자가 닫았으면 **그날 하루** 안 보인다(`hidden`). 내일은 다시 뜬다.
   */
  const missionState = useTodayMission(showStarter ? null : activeId, session?.user.id ?? null);
  const mission =
    !showStarter && !missionState.loading && !missionState.hidden && results.length > 0 ? (
      <DailyMission
        done={missionState.done}
        complete={missionState.complete}
        onHide={missionState.hide}
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
  const onToggleSort = useCallback(() => {
    setSort((v) => (v === 'shuffle' ? 'recent' : 'shuffle'));
    setLimit(PAGE); // 순서가 통째로 바뀌므로 처음부터 다시 본다
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
      {showFilters && (
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
          /**
           * ⚠ 위 여백을 **여기 두지 않는다.** 목록 안에 주면 스크롤과 함께 밀려 올라가,
           *   내리는 순간 카드가 장소 필터에 그대로 닿는다(실기기 확인 — 사용자가 두 번
           *   지적한 지점이다). 필터 아래 간격은 **고정된 쪽**(필터 줄 자신)이 가져야
           *   스크롤해도 남는다. `filterScroll` / `headAlone` 참고.
           */
          contentContainerStyle={{
            paddingHorizontal: PADDING,
            paddingBottom: insets.bottom + space.xxl,
            gap: GAP,
          }}
          keyboardShouldPersistTaps="handled"
          /* 물건이 생겨도 남은 단계가 있으면 격자 위에 계속 둔다 */
          /**
           * ⚠ 헤더로 넣는 이유가 있다. 화면 위에 고정하면 물건을 찾는 내내 자리를
           *   먹는다 — 이 앱을 여는 이유는 미션이 아니라 "그거 어디 뒀지" 다.
           *   목록과 함께 밀려 올라가야 격자에 집중할 수 있다(사용자 요청).
           */
          ListHeaderComponent={
            <>
              {(checklist || mission) && (
                <View style={st.starterWrap}>
                  {checklist}
                  {mission}
                </View>
              )}
              {/*
                ⚠ "전체 18건" 은 **격자 바로 위**에 둔다 (2026-09-02 사용자 지적).
                  전에는 필터 칩 아래 고정이라 미션 카드보다 위에 있었는데, 그러면
                  무엇의 개수인지 알 수 없다 — 세는 대상은 아래 격자다.
                  같이 스크롤되는 것도 맞다: 개수는 목록의 머리말이지 화면의 머리말이 아니다.
              */}
              <View style={st.meta}>
                <Text style={[st.metaText, { color: c.textFaint }]}>
                  {q ? t.find.hits(results.length) : t.find.total(indexed.length)}
                </Text>
                {isFetching && (
                  <Text style={[st.metaText, { color: c.textFaint }]}>{t.find.syncing}</Text>
                )}
                {/*
                  ⚠ **지금 어떤 순서인지**를 적는다. "누르면 이렇게 됩니다" 로 적으면
                    지금 무엇으로 보고 있는지 알 수 없다 — 순서는 보기만 해선 모른다.
                */}
                <Pressable
                  onPress={onToggleSort}
                  hitSlop={10}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    st.sortBtn,
                    { borderColor: c.border, backgroundColor: c.card },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <IconSort size={13} color={c.textMuted} />
                  <Text style={[st.sortText, { color: c.textMuted }]}>
                    {sort === 'recent' ? t.find.sortRecent : t.find.sortShuffle}
                  </Text>
                </Pressable>
              </View>
            </>
          }
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
  /**
   * ⚠ 아래 여백을 **늘 준다.** 다음에 오는 것이 필터든 목록이든 간격은 같아야 한다.
   *   전에는 필터가 있을 때만 4(space.xs)였는데, 필터 아래(16)와 짝이 안 맞아
   *   위아래가 어긋나 보였다(2026-09-02 사용자 지적, 실측 4dp vs 16dp).
   */
  head: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: PADDING,
    paddingTop: space.sm,
    paddingBottom: GUTTER,
  },
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
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * ⚠ 좌우 여백을 주지 않는다 — 목록 안에 있어 격자의 여백을 그대로 쓴다.
   * ⚠ 아래 여백은 `GUTTER` 에서 격자의 `GAP` 을 뺀 값이다. 이 줄은 목록의 첫 항목이라
   *   **격자 간격이 뒤에 자동으로 붙는다** — GUTTER 를 그대로 주면 16+12=28 이 되어
   *   위 두 칸(16)보다 벌어진다(실측으로 20dp 였다).
   */
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingBottom: GUTTER - GAP,
  },
  /**
   * ⚠ 위 장소 필터와 **같은 어휘**(테두리 있는 알약)로 그린다. 파란 글씨만 두었더니
   *   "누를 수 있다" 가 전혀 안 읽혔다(2026-09-02 사용자 지적). 다만 칩보다 작게 —
   *   장소 필터가 주인공이고 이건 곁다리다.
   * ⚠ `marginLeft: 'auto'` 로 오른쪽 끝에 붙인다 — 가운데 "동기화 중" 이 끼어도 안 밀린다.
   */
  sortBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  sortText: { fontSize: type.caption, fontWeight: '700' },
  metaText: { fontSize: type.caption, fontVariant: ['tabular-nums'] },
  banner: {
    marginHorizontal: PADDING,
    marginBottom: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  bannerText: { fontSize: type.small },
  starterWrap: { paddingBottom: space.lg, marginHorizontal: -PADDING },
  more: { fontSize: type.caption, textAlign: 'center', paddingVertical: space.lg },
  /**
   * ⚠ 아래 여백은 **스크롤과 무관해야** 한다 — 위 contentContainerStyle 주석 참고.
   * ⚠ 값은 `GUTTER` 하나를 위아래가 함께 쓴다. 두 곳에 따로 적으면 한쪽만 고쳐진다.
   */
  filterScroll: { flexGrow: 0, flexShrink: 0, marginBottom: GUTTER },
  filterRow: { paddingHorizontal: PADDING, gap: space.sm, alignItems: 'center' },
  filterChip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: space.lg, paddingVertical: space.sm },
  filterText: { fontSize: type.small, fontWeight: '600' },
});
