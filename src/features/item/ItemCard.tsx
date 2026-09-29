import { Image, type ImageSource } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconCheck, IconImage } from '@/components/Icon';
import { useT } from '@/lib/i18n';
import { useTheme, type, radius, overlay, space, tracking } from '@/lib/theme';

import { daysUntil, expiryTone } from './expiry';
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
  categoryColor,
  quantity,
  width,
  thumb,
  expiresOn,
  inUse,
  selectable = false,
  selected = false,
  onPress,
  onLongPress,
}: {
  name: string;
  subtitle?: string;
  /** 분류 이름 — 사진 **왼쪽 위 배지**로 (수량 배지와 짝) */
  category?: string | null;
  /**
   * 분류 색 `#RRGGBB`.
   *
   * ⚠ 없으면 예전처럼 반투명 검정을 쓴다. 사진 위라서 **테마 팔레트를 쓰지 않는다** —
   *   밑에 깔린 게 이미지라 바탕이 밝을지 어두울지 알 수 없다(overlay 주석과 같은 이유).
   */
  categoryColor?: string | null;
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
  /** 소비기한 — 있으면 사진 **왼쪽 아래**에 D-N 뱃지 (2026-09-08) */
  expiresOn?: string | null;
  /**
   * 꺼내 쓰는 중 — 사진 **오른쪽 아래**에 "사용중" 뱃지 (2026-09-17).
   * 격자를 훑다가 "저건 지금 제자리에 없구나" 가 읽혀야 다 쓰고 돌려놓는 것을 잊지 않는다.
   */
  inUse?: boolean;
  /**
   * 고르는 중 (2026-09-21 일괄 이동).
   *
   * ⚠ 이때는 **수량 배지를 숨긴다.** 카드 네 귀퉁이가 이미 다 차 있어서(왼위 분류 ·
   *   오른위 수량 · 왼아래 기한 · 오른아래 사용중) 체크를 끼워 넣을 자리가 없다.
   *   고르는 동안 수량은 판단에 쓰이지 않으므로 그 자리를 내준다.
   */
  selectable?: boolean;
  selected?: boolean;
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
        {/* 수량 0 은 **살 것**을 뜻한다 — 사진을 짙게 덮어 "여긴 지금 없다" 가
            격자에서 바로 읽히게 한다.
            ⚠ 고르는 중에도 남긴다. 이건 물건에 대한 사실이라 선택과 무관하다. */}
        {quantity === 0 ? (
          <View style={st.outScrim}>
            <Text style={st.outText}>{t.shopping.outOfStock}</Text>
          </View>
        ) : null}
        {!selectable && (quantity ?? 0) > 1 ? (
          <View style={st.qtyBadge}>
            <Text style={st.qtyText}>{t.common.qty(quantity ?? 0)}</Text>
          </View>
        ) : null}

        {/* 분류는 사진 **왼쪽 위**. 예전엔 카드 아래 셋째 줄이었는데, 이름·위치
            아래에 회색 글씨가 한 줄 더 붙으니 카드가 글자로 빽빽해 보였다.
            수량 배지와 짝을 이루는 자리라 눈이 먼저 가고 자리도 안 먹는다.
            ⚠ 재고 없음 가림막 **뒤에** 그린다 — 가림막에 덮이면 안 된다. */}
        {/* 소비기한 — 왼쪽 아래. 급할수록 진하다 (30일 안 주황, 5일 안·만료 빨강).
            ⚠ 사진 위라 테마 색을 쓰지 않는다 — 분류 뱃지와 같은 이유. */}
        {expiresOn ? <ExpiryBadge expiresOn={expiresOn} /> : null}

        {/* 사용중 — 오른쪽 아래. 네 귀퉁이 중 남은 자리다 (왼위 분류 · 오른위 수량 · 왼아래 기한).
            ⚠ 사진 위라 테마 색을 쓰지 않는다 — 다른 뱃지와 같은 이유. */}
        {inUse ? (
          <View style={st.useBadge}>
            <Text style={st.useText}>{t.item.inUse.badge}</Text>
          </View>
        ) : null}

        {category ? (
          <View style={[st.catBadge, categoryColor ? { backgroundColor: categoryColor } : null]}>
            <Text
              style={[st.catText, categoryColor ? { color: overlay.fg } : null]}
              numberOfLines={1}
            >
              {category}
            </Text>
          </View>
        ) : null}

        {/* 고르는 중 — 수량 배지가 비운 오른쪽 위.
            ⚠ 사진 위라 테마 색을 쓰지 않는다(다른 뱃지와 같은 이유). 흰 테두리 동그라미는
              밝은 사진에서도 어두운 사진에서도 보인다.
            ⚠ 재고 없음 가림막 **뒤에** 그린다 — 덮이면 무엇을 골랐는지 알 수 없다. */}
        {selectable ? (
          <View style={[st.check, selected ? { backgroundColor: SELECT_ON } : null]}>
            {selected ? <IconCheck size={14} color={overlay.fg} /> : null}
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

      {/*
        선택 테두리. **절대 위치로 덧그린다** — 카드에 borderWidth 를 주면 선택될 때마다
        안쪽 폭이 2px 씩 줄어 사진이 들썩인다. 카드가 overflow:'hidden' 이라 둥근 모서리에
        맞춰 잘린다.
        ⚠ **맨 마지막 자식**이다. 사진 다음에 두면 이름 줄이 그 위에 그려져 아래쪽
          테두리가 끊겨 보인다(본문에 바탕색이 없어 지금은 비치지만, 나중에 바탕을
          주는 순간 조용히 끊긴다). 누르는 것을 가리지 않게 pointerEvents 를 끈다.
      */}
      {selectable && selected ? (
        <View pointerEvents="none" style={[st.ring, { borderColor: c.accent }]} />
      ) : null}
    </Pressable>
  );
}

function ExpiryBadge({ expiresOn }: { expiresOn: string }) {
  const t = useT();
  const days = daysUntil(expiresOn);
  const tone = expiryTone(days);
  const bg = tone === 'far' ? overlay.chip : tone === 'soon' ? EXPIRY_SOON : EXPIRY_URGENT;
  return (
    <View style={[st.expBadge, { backgroundColor: bg }]}>
      <Text style={st.expText}>{t.expiry.badge(days)}</Text>
    </View>
  );
}

/** 사진 위의 경고색 — 밑이 이미지라 테마와 무관하게 늘 같은 값 (overlay 주석과 같은 이유) */
const EXPIRY_SOON = '#D9821F';
const EXPIRY_URGENT = '#D93A4A';
/** 사용중 — 경고가 아니라 **상태**라 붉은 계열을 피한다. 흰 글씨 대비 5.4 */
const IN_USE = '#2F62D6';
/** 골라진 체크의 속. 라이트 accent 와 같은 값이지만 **사진 위**라 테마를 따르지 않는다 */
const SELECT_ON = '#2547C4';

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
  expBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  expText: { color: overlay.fg, fontSize: type.tiny, fontWeight: '800', fontVariant: ['tabular-nums'] },
  useBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: IN_USE,
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  useText: { color: overlay.fg, fontSize: type.tiny, fontWeight: '800' },
  check: {
    position: 'absolute',
    right: 6,
    top: 6,
    // 동그라미는 기하학이라 간격 토큰을 쓰지 않는다 (theme.ts 의 radius 주석과 같은 이유)
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: overlay.hairline,
    backgroundColor: overlay.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderRadius: radius.md,
  },
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
