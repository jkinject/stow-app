import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * 선 아이콘 모음.
 *
 * ⚠ 이모지나 문자(⚙ ◧ ⋯)를 아이콘으로 쓰지 않는다. 기기·폰트마다 모양이 달라지고
 *   색을 따라오지 않으며 크기도 제각각이다. 24px 격자에 stroke 로 직접 그린다.
 */

/**
 * ⚠ `color` 는 `ColorValue` 다. 하단 탭의 `tabBarIcon` 이 넘겨주는 값이 `string` 이
 *   아니라 `ColorValue`(플랫폼 색 객체를 포함)라서, string 으로 좁히면 탭에서 못 쓴다.
 */
type P = { size?: number; color: ColorValue };
const S = ({ size = 22, color, children }: P & { children: React.ReactNode }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </Svg>
);

export const IconChevron = ({ size = 20, color }: P) => (
  <S size={size} color={color}><Path d="M9 5l7 7-7 7" /></S>
);

export const IconGlobe = (p: P) => (
  <S {...p}>
    <Circle cx="12" cy="12" r="9" />
    <Path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
  </S>
);

export const IconMoon = (p: P) => (
  <S {...p}><Path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" /></S>
);

export const IconPrinter = (p: P) => (
  <S {...p}>
    <Path d="M7 9V3h10v6" />
    <Path d="M7 19H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <Rect x="7" y="15" width="10" height="6" rx="1" />
  </S>
);

export const IconUsers = (p: P) => (
  <S {...p}>
    <Path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
    <Circle cx="9" cy="7" r="3.5" />
    <Path d="M17 4.5a3.5 3.5 0 0 1 0 6.8M22 20v-1.5a4 4 0 0 0-3-3.8" />
  </S>
);

export const IconImage = (p: P) => (
  <S {...p}>
    <Rect x="3" y="4" width="18" height="16" rx="2" />
    <Circle cx="8.5" cy="9.5" r="1.6" />
    <Path d="M21 16l-5-5-6.5 7" />
  </S>
);

export const IconTrash = (p: P) => (
  <S {...p}>
    <Path d="M4 7h16M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" />
    <Path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    <Path d="M10 11v6M14 11v6" />
  </S>
);

/**
 * 계정 탈퇴.
 *
 * ⚠ 휴지통(IconTrash)을 쓰면 안 된다. 더보기 화면에 "휴지통"(30일 안에 되돌릴 수
 *   있다)과 "탈퇴하기"(되돌릴 수 없다)가 함께 있어서, 같은 그림이면 훑어볼 때
 *   두 줄이 같은 무게로 읽힌다. 사람에 ✕ 를 그려 성격을 다르게 만든다.
 */
export const IconInfo = (p: P) => (
  <S {...p}>
    <Circle cx="12" cy="12" r="9" />
    <Path d="M12 11v5" />
    <Path d="M12 8h.01" />
  </S>
);

export const IconUserX = (p: P) => (
  <S {...p}>
    <Circle cx="9" cy="8" r="3.4" />
    <Path d="M3 20a6 6 0 0 1 12 0" />
    <Path d="M17 9l5 5M22 9l-5 5" />
  </S>
);

export const IconSignOut = (p: P) => (
  <S {...p}>
    <Path d="M9 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3" />
    <Path d="M15 16l4-4-4-4M19 12H10" />
  </S>
);

export const IconGear = (p: P) => (
  <S {...p}>
    <Circle cx="12" cy="12" r="3" />
    <Path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 18.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </S>
);

export const IconSearch = (p: P) => (
  <S {...p}><Circle cx="11" cy="11" r="7" /><Path d="M20 20l-4.3-4.3" /></S>
);

export const IconBoxes = (p: P) => (
  <S {...p}>
    <Rect x="3" y="4" width="18" height="7" rx="1.5" />
    <Rect x="3" y="13" width="18" height="7" rx="1.5" />
  </S>
);

export const IconCart = (p: P) => (
  <S {...p}>
    <Path d="M3 4h2l2.2 10.4a2 2 0 0 0 2 1.6h7.4a2 2 0 0 0 2-1.5L20 7H6" />
    <Circle cx="10" cy="19.5" r="1.3" /><Circle cx="17" cy="19.5" r="1.3" />
  </S>
);

export const IconDots = (p: P) => (
  <S {...p}>
    <Circle cx="5" cy="12" r="1.4" /><Circle cx="12" cy="12" r="1.4" /><Circle cx="19" cy="12" r="1.4" />
  </S>
);

export const IconQr = (p: P) => (
  <S {...p}>
    <Rect x="3" y="3" width="7" height="7" rx="1" />
    <Rect x="14" y="3" width="7" height="7" rx="1" />
    <Rect x="3" y="14" width="7" height="7" rx="1" />
    <Path d="M14 14h3v3h-3zM20 14v3M14 20h6" />
  </S>
);

export const IconLock = (p: P) => (
  <S {...p}>
    <Rect x="4" y="10.5" width="16" height="10" rx="2.5" />
    <Path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </S>
);

export const IconMail = (p: P) => (
  <S {...p}>
    <Rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <Path d="M3 7l9 6 9-6" />
  </S>
);

export const IconTag = (p: P) => (
  <S {...p}>
    <Path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9z" />
    <Circle cx="7.5" cy="7.5" r="1.3" />
  </S>
);

export const IconPlus = (p: P) => (
  <S {...p}><Path d="M12 5v14M5 12h14" /></S>
);
