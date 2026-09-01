import { Image, type ImageSource } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconImage } from '@/components/Icon';
import { useT } from '@/lib/i18n';
import { useTheme, type, radius, overlay, space, tracking } from '@/lib/theme';

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
  /** 분류 이름 — 사진 **왼쪽 위 배지**로 (수량 배지와 짝) */
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
          /**
           * ⚠ 이름의 앞 두 글자를 크게 박아 두었었다. 그러면 격자에 "목배 스타 식물"
           *   같은 글자 타일이 줄줄이 서서, 사진이 있는 카드와 없는 카드가 아예 다른
           *   물건처럼 보였다(사용자 보고 2026-09-02). 이름은 바로 아래 줄에 이미
           *   있으므로 같은 말을 두 번 하는 셈이기도 하다. 조용한 아이콘이 맞다.
           */
          <IconImage color={c.textFaint} size={28} />
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

        {/* 분류는 사진 **왼쪽 위**. 예전엔 카드 아래 셋째 줄이었는데, 이름·위치
            아래에 회색 글씨가 한 줄 더 붙으니 카드가 글자로 빽빽해 보였다.
            수량 배지와 짝을 이루는 자리라 눈이 먼저 가고 자리도 안 먹는다.
            ⚠ 재고 없음 가림막 **뒤에** 그린다 — 가림막에 덮이면 안 된다. */}
        {category ? (
          <View style={st.catBadge}>
            <Text style={st.catText} numberOfLines={1}>{category}</Text>
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
  qtyBadge: {
    position: 'absolute',
    right: 6,
    top: 6,
    backgroundColor: overlay.chip,
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  qtyText: { color: overlay.fg, fontSize: type.tiny, fontWeight: '700' },
  catBadge: {
    position: 'absolute',
    left: 6,
    top: 6,
    maxWidth: '70%',
    backgroundColor: overlay.chip,
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  catText: { color: overlay.faint, fontSize: type.tiny, fontWeight: '600' },
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
    letterSpacing: tracking.tight,
  },
  body: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.md, gap: space.xs },
  name: { fontSize: type.body, fontWeight: '700', letterSpacing: tracking.snug },
  subtitle: { fontSize: type.tiny },
});
