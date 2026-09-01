import { useColorScheme } from 'react-native';

import { useThemeOverride } from './theme-context';

/**
 * 앱 색상 토큰.
 *
 * ⚠ RN 의 <Text> 기본 색은 **검정 고정**이다. 테마를 따라가지 않는다.
 *   색을 지정하지 않은 텍스트는 다크 모드에서 검정 배경 위 검정이 되어 사라진다.
 *   실기기(Galaxy Z Fold 7, 다크 모드)에서 제목·부제·버튼 라벨이 전부 안 보이는
 *   버그가 실제로 났다. 화면에서 색을 직접 쓰지 말고 반드시 이 토큰을 거칠 것.
 *
 * 팔레트는 "라벨 스티커 위 볼펜 잉크" — 재고 태그의 어휘를 따른다.
 */
export type Palette = {
  bg: string;
  card: string;
  sunk: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  borderStrong: string;
  /** 채워진 버튼의 바탕. 그 위에 `onAccent` 로 글씨를 얹는다 */
  accent: string;
  onAccent: string;
  /**
   * 강조색 **글씨**(링크·체크·되돌아가기).
   *
   * ⚠ `accent` 와 나눠 놓은 이유가 있다. 하나로 쓰면 다크 모드에서 둘 중 하나가
   *   반드시 대비 기준에 걸린다 — 어두운 카드 위에서 읽히게 밝히면 그 위의 흰
   *   버튼 글씨가 흐려지고, 흰 글씨가 읽히게 낮추면 링크가 배경에 묻힌다.
   *   실측(WCAG): 예전 단일값 #4A6BFF 는 카드 위 4.07, 흰 글씨 4.34 로 **양쪽 다**
   *   본문 기준 4.5 에 미달이었다. 지금은 버튼 5.36 / 링크 6.11 로 둘 다 통과한다.
   *   라이트 모드는 #2547C4 하나로 7.56 이라 나눌 필요가 없어 같은 값을 쓴다.
   */
  accentText: string;
  danger: string;
  ok: string;
};

const light: Palette = {
  bg: '#F1F3F8',     // 흰 카드가 뜨려면 바탕이 조금 더 내려가야 한다 (1.09 → 1.11)
  card: '#FFFFFF',
  sunk: '#EDEFF6',
  text: '#14161F',
  textMuted: '#3E445A',
  textFaint: '#6E7591',
  border: '#DCE0EC',
  borderStrong: '#C3C9DB',
  accent: '#2547C4',
  onAccent: '#FFFFFF',
  accentText: '#2547C4', // 흰 바탕에서 7.56 — 나눌 이유가 없다
  danger: '#C41E38',
  ok: '#0C6E48',
};

const dark: Palette = {
  bg: '#0D0F16',
  card: '#1A1E2E',   // 테두리를 걷어낸 만큼 바탕과의 차이를 키웠다 (1.08 → 1.16)
  sunk: '#11141F',   // 카드보다 **어둡게** — 카드를 올린 만큼 같이 내렸다
  text: '#E8EAF2',
  textMuted: '#AEB4C8',
  textFaint: '#7C8399',
  border: '#282D3E',
  borderStrong: '#3A4157',
  accent: '#3E5FE0',     // 흰 글씨 5.36 · 카드와 경계 3.30
  accentText: '#7691FF', // 카드 위 6.11 · 배경 위 6.62
  onAccent: '#FFFFFF',
  danger: '#FF8A9C',
  ok: '#66D3A2',
};

export const PALETTES = { light, dark };

/**
 * ⚠ 이 훅은 `ThemeProvider`(lib/theme-context.tsx) 안에서만 정확하다.
 *   프로바이더가 없으면 시스템 설정으로 떨어진다 — 앱 밖(테스트 등)에서도 깨지지 않게.
 */
export function useTheme(): { c: Palette; isDark: boolean } {
  const override = useThemeOverride();
  const system = useColorScheme() === 'dark';
  const isDark = override === 'system' || override === null ? system : override === 'dark';
  return { c: isDark ? dark : light, isDark };
}

/* ─────────────────────────── 디자인 토큰 (2026-08-31) ───────────────────────────

   ⚠ 점검에서 드러난 것: 글자 크기가 **24종**(11.5·12.5·13.5 같은 반포인트가 절반),
     모서리 반경이 **13종**이었다. 화면을 하나씩 만들며 그때그때 정한 값이 쌓인 결과다.
     12 와 12.5 는 사람이 구분하지 못한다 — 의도가 아니라 소음이다.

   아래 척도만 쓴다. 새 값이 필요하면 척도를 고치지, 화면에 숫자를 적지 않는다.
   ─────────────────────────────────────────────────────────────────────────────── */

/** 글자 크기. 이름은 쓰임새다 — 숫자를 외우지 않게. */
export const type = {
  /** 대문자 라벨, 배지 */
  tiny: 11,
  /** 보조 설명, 시각 */
  caption: 12,
  /** 목록의 부제 */
  small: 13,
  /** 칩, 작은 버튼 */
  label: 14,
  /** 본문 */
  body: 15,
  /** 강조 본문, 목록 제목, 버튼 */
  bodyStrong: 16,
  /** 모달 제목 */
  subtitle: 17,
  /** 카드 제목, 화면 안 제목 */
  title: 19,
  /** 카드 대제목 */
  h2: 21,
  /** 화면 제목 */
  h1: 26,
  /** 사진 없는 칸의 첫 글자 */
  display: 30,
} as const;

/** 모서리 반경. 원형(반지름=크기/2)은 기하학적 값이므로 여기 해당하지 않는다. */
export const radius = {
  xs: 6,
  sm: 10,
  md: 12,
  lg: 16,
  /** 알약 모양 */
  full: 999,
} as const;

/** 간격. 4의 배수로 통일한다. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

/**
 * 사진 위에 얹는 색.
 *
 * ⚠ 이건 테마 토큰이 **아니다.** 사진 위의 배지·카메라 UI 는 밑에 깔린 것이 이미지라
 *   라이트/다크와 무관하게 항상 같은 대비가 필요하다. 그래서 팔레트에 넣지 않고
 *   따로 둔다 — 테마를 따라가야 하는 색과 섞이면 다음에 누가 반드시 헷갈린다.
 */
export const overlay = {
  fg: '#fff',
  bg: '#000',
  scrim: 'rgba(0,0,0,0.45)',
  /** 사진을 확실히 죽여야 할 때 — 재고 없음 표시 */
  heavy: 'rgba(0,0,0,0.72)',
  /**
   * 사진 위의 지우기 글씨.
   *
   * ⚠ 팔레트의 `danger` 를 쓰면 안 된다. 라이트 모드 값(#C41E38)은 어두운 사진 위에서
   *   묻힌다 — 밑에 깔린 게 이미지라 테마와 무관하게 늘 밝아야 한다.
   *   (PhotoViewer 안에 이 값이 떠돌고 있던 것을 여기로 옮겼다)
   */
  danger: '#FF8A8A',
  chip: 'rgba(0,0,0,0.6)',
  hairline: 'rgba(255,255,255,0.9)',
  faint: 'rgba(255,255,255,0.75)',
  shadow: 'rgba(0,0,0,0.8)',
} as const;
