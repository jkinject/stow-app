import { Image, type ImageSource } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { useTheme, type, radius, overlay } from '@/lib/theme';

import { PHOTO_ASPECT } from './photo';
import { IMAGE_CACHE_POLICY } from './thumbs';

/**
 * 사진 격자의 카드 한 장 — **찾기 탭과 박스 내용물이 같은 것을 쓴다.**
 *
 * 두 벌로 만들면 한쪽만 고쳐지는 날이 온다. 이 프로젝트에서 이미 여러 번 겪었다.
 *
 * `subtitle` 은 쓰는 곳마다 다르다 — 찾기 탭에서는 **위치 경로**(어디 있는지 몰라
 * 찾는 중이므로), 박스 목록에서는 **내용물 개수**다. 박스 안의 물건에는 없다
 * (이미 그 박스를 보고 있으므로 경로가 군더더기다).
 */
export function ItemCard({
  name,
  subtitle,
  category,
  quantity,
  width,
  thumb,
  onPress,
  onLongPress,
}: {
  name: string;
  subtitle?: string;
  /** 분류 이름 — 위치 경로와 별개 줄로 작게 (AC-C9) */
  category?: string | null;
  /**
   * ⚠ **선택값이다.** 넘기지 않으면 재고 개념이 없는 카드다(박스 목록이 그렇다).
   *   예전에 박스 카드가 `quantity={0}` 을 넘겨서 "재고 없음" 이 떴다 — 박스는
   *   비어 있을 수 있을 뿐 "다 떨어진" 것이 아니다.
   */
  quantity?: number;
  width: number;
  /**
   * ⚠ URL 문자열이 아니라 `{ uri, cacheKey }` 를 통째로 받는다.
   *   서명 URL 은 발급할 때마다 달라지므로 URL 만 넘기면 캐시가 매번 빗나간다.
   *   `useThumbUrls().get()` 이 만들어 주는 값을 그대로 넘길 것.
   */
  thumb?: ImageSource;
  onPress: () => void;
  /** 박스 카드의 이름·삭제 메뉴 */
  onLongPress?: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        st.card,
        { width, borderColor: c.border, backgroundColor: c.card },
        pressed && { opacity: 0.75 },
      ]}
    >
      {/* ⚠ 높이를 폭과 같게(정사각) 두면 안 된다. 저장이 3:4 라 위아래가 잘린다.
          비율은 photo.ts 의 PHOTO_ASPECT 한 곳에서만 정한다. */}
      <View style={[st.photo, { height: width / PHOTO_ASPECT, backgroundColor: c.sunk }]}>
        {thumb ? (
          <Image
            source={thumb}
            style={st.photoImg}
            contentFit="cover"
            transition={140}
            cachePolicy={IMAGE_CACHE_POLICY}
            /* 격자가 셀을 재활용할 때 이전 물건의 사진이 잠깐 비치는 것을 막는다 */
            recyclingKey={thumb.cacheKey}
          />
        ) : (
          // 사진 없이 등록한 물건도 격자에서 자리를 지켜야 한다
          <Text style={[st.photoFallback, { color: c.textFaint }]}>{name.slice(0, 2)}</Text>
        )}
        {/* 수량 0 은 **살 것**을 뜻한다 — 배지로 눈에 띄게 하고 사진을 흐리게 해서
            "여긴 지금 없다" 가 격자에서 바로 읽히게 한다 */}
        {quantity === 0 ? (
          <View style={st.outScrim}>
            <Text style={st.outText}>{t.shopping.outOfStock}</Text>
          </View>
        ) : (quantity ?? 0) > 1 ? (
          <View style={st.qtyBadge}>
            <Text style={st.qtyText}>{t.common.qty(quantity ?? 0)}</Text>
          </View>
        ) : null}
      </View>
      <View style={st.body}>
        <Text style={[st.name, { color: c.text }]} numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? (
          <Text style={[st.subtitle, { color: c.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {category ? (
          <Text style={[st.category, { color: c.textFaint }]} numberOfLines={1}>
            {category}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  /**
   * ⚠ 테두리를 두르지 않는다. 사진 자체가 이미 카드의 경계다 —
   *   거기에 1px 선을 더하면 액자가 두 겹이 되고, 격자 전체가 표처럼 보인다.
   *   구분은 바탕색(c.card vs c.bg) 차이로 충분하다.
   */
  card: { borderRadius: radius.md, overflow: 'hidden' },
  photo: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  photoImg: { width: '100%', height: '100%' },
  photoFallback: { fontSize: type.display, fontWeight: '700' },
  qtyBadge: {
    position: 'absolute',
    right: 6,
    top: 6,
    backgroundColor: overlay.chip,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  qtyText: { color: overlay.fg, fontSize: type.tiny, fontWeight: '700' },
  /**
   * 다 떨어진 물건은 격자에서 **멀리서도** 구분돼야 한다.
   * 구석의 작은 배지로는 훑어볼 때 놓친다 — 사진을 짙게 덮고 가운데 크게 쓴다.
   */
  outScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: overlay.heavy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outText: {
    color: overlay.fg,
    fontSize: type.title,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  body: { paddingHorizontal: 11, paddingTop: 9, paddingBottom: 11, gap: 3 },
  name: { fontSize: type.body, fontWeight: '700', letterSpacing: -0.2 },
  subtitle: { fontSize: type.tiny },
  category: { fontSize: type.tiny },
});
