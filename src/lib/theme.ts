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
  /**
   * 오늘의 미션 카드 전용 색.
   *
   * ⚠ 이 카드만 **테마마다 결이 다르다**(사용자 결정 2026-09-02):
   *   다크는 진한 남색 바탕에 강조색 도장, 라이트는 크림 바탕에 주황 도장.
   *   같은 토큰으로 두 결을 낼 수 없어 따로 둔다 — 컴포넌트에 색을 박으면
   *   테마가 하나 늘 때마다 그 파일을 다시 열어야 한다.
   */
  mission: {
    surface: string;
    border: string;
    text: string;
    textFaint: string;
    /** 채워진 도장 */
    stampOn: string;
    /** 빈 도장의 테두리·숫자 */
    stampOff: string;
    /** 도장 사이를 잇는 선 (지나온 구간) */
    trackOn: string;
    trackOff: string;
    badgeBg: string;
    badgeFg: string;
    /** 다 채웠을 때의 배지 */
    doneBg: string;
    doneFg: string;
  };
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
  // 시안 1 warm-stamp — 크림 카드 위 주황 도장. 어두운 목록 사이에서 눈에 띄라고 따뜻하게.
  mission: {
    surface: '#FFF4E0',
    border: '#F1DFBE',
    text: '#1B2340',
    textFaint: '#6B5C42',   // 크림 위 4.9 — 작은 글씨도 읽힌다
    stampOn: '#E08A0B',
    stampOff: '#DCC79E',
    trackOn: '#E08A0B',
    trackOff: '#EADCC0',
    badgeBg: '#E08A0B',
    badgeFg: '#FFFFFF',
    doneBg: '#0C6E48',
    doneFg: '#FFFFFF',
  },
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
  // 시안 2 dark-neon — 카드보다 더 가라앉은 바탕에 강조색 도장.
  mission: {
    surface: '#141A2E',
    border: '#26304C',
    text: '#E8EAF2',
    textFaint: '#8B93AC',
    stampOn: '#3E5FE0',
    stampOff: '#333C57',
    trackOn: '#3E5FE0',
    trackOff: '#2A3149',
    badgeBg: '#3E5FE0',
    badgeFg: '#FFFFFF',
    doneBg: '#66D3A2',
    doneFg: '#0D0F16',
  },
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

/**
 * 행간. **`type` 의 각 단계와 짝**이다 — `type.body` 를 쓰면 `leading.body` 를 쓴다.
 *
 * ⚠ 왜 필요한가: 값 자체는 스케일 안에 있었는데 **짝을 맞출 기준이 없어** 화면마다
 *   눈대중으로 적혀 있었다(23곳). 크기 토큰만 있고 행간 토큰이 없으면, 같은 크기의
 *   글이 화면마다 다른 밀도로 읽힌다. 간격에서 겪은 것과 같은 종류의 문제다
 *   (찾기 탭 위·아래 여백, 2026-09-02).
 *
 * ⚠ **큰 글씨일수록 배수가 작다** (본문 ×1.45 → 제목 ×1.3). 타이포그래피의 기본이고
 *   기존 값들도 이미 그렇게 잡혀 있었다 — 큰 글씨에 본문 배수를 주면 줄이 흩어진다.
 *   여기 있는 값은 **기존 화면에서 쓰이던 값을 그대로 모은 것**이라, 이 토큰으로
 *   바꿔도 보이는 결과는 달라지지 않는다.
 *
 * ⚠⚠ **기호를 상자 가운데 놓으려고 주는 `lineHeight` 는 여기 해당하지 않는다.**
 *   ＋ · − · ✕ · ⋯ 같은 글자를 버튼 한가운데 앉히는 값은 읽는 리듬이 아니라 기하학이다
 *   (radius 의 "원형은 반지름=크기/2" 와 같은 판단). 그런 곳은 숫자를 그대로 둔다.
 */
export const leading = {
  /** 11 × 1.45 */
  tiny: 16,
  /** 12 × 1.5 */
  caption: 18,
  /** 13 × 1.54 */
  small: 20,
  /** 14 × 1.43 */
  label: 20,
  /** 15 × 1.47 — 여러 줄 안내문의 기준 */
  body: 22,
  /** 16 × 1.44 */
  bodyStrong: 23,
  /** 17 × 1.41 */
  subtitle: 24,
  /** 19 × 1.32 */
  title: 25,
  /** 21 × 1.29 */
  h2: 27,
  /** 26 × 1.23 */
  h1: 32,
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

/**
 * 간격. **4의 배수만 쓴다.**
 *
 * ⚠ 예전 척도는 여섯 칸(4·8·12·16·20·28)이었는데, 정작 화면에서는 두 파일만 쓰고
 *   나머지는 날숫자를 적고 있었다. 점검해 보니 간격 지정 278곳 중 **57%가 척도
 *   밖**이었고 10·14·6·2·18·3·7 같은 값이 널려 있었다. 주석은 "4의 배수" 라고
 *   말하는데 코드는 아니었다 — 척도가 아니라 장식이었다.
 *
 * ⚠ 24·32·40·64 를 새로 넣은 이유: 이 값들은 4의 배수인데 **척도에 자리가 없었다.**
 *   자리가 없으니 척도로 밀면 24→20, 40→28, 64→28 이 되어 레이아웃이 부서진다.
 *   척도가 현실을 못 담으면 사람은 척도를 버린다. 실제로 그래서 버려져 있었다.
 *
 * ⚠ `xxl` 은 28 → **24** 로 바뀌었다. 사다리에 24 자리를 만들면서 한 칸씩 밀렸다.
 *   28 은 `xxxl` 이다. 예전 `space.xxl` 을 쓰던 곳은 `xxxl` 로 옮겼다.
 *
 * 새 값이 필요하면 여기 칸을 늘리지, 화면에 숫자를 적지 않는다.
 */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  /** 화면 좌우 여백 */
  xl: 20,
  xxl: 24,
  xxxl: 28,
  huge: 32,
  giant: 40,
  max: 64,
} as const;

/**
 * 자간.
 *
 * ⚠ 점검에서 아홉 종이 나왔다(-1 · -0.6 · -0.5 · -0.3 · -0.2 · 0.5 · 0.6 · 3 · 4).
 *   그중 -0.5 와 -0.6 은 **둘 다 h1** 에, 0.5 와 0.6 은 **둘 다 tiny 라벨** 에,
 *   3 과 4 는 **둘 다 코드 입력** 에 쓰이고 있었다. 같은 자리에 다른 값이면 의도가
 *   아니라 소음이다 — 글자 크기를 24종에서 정리했던 것과 같은 문제다.
 *
 * 음수 쪽이 여러 칸인 것은 소음이 아니다. 굵고 큰 글자일수록 더 좁혀야 눈에
 * 고르게 보인다(광학적 자간). 그래서 **글자 크기에 짝을 지어** 골라 쓴다.
 */
export const tracking = {
  /** 목록 제목 (body · bodyStrong) */
  snug: -0.2,
  /** 카드·모달 제목 (subtitle · title · h2) */
  tight: -0.3,
  /** 화면 제목 (h1) */
  tighter: -0.5,
  /** 가장 큰 글자 (display) */
  tightest: -1,
  /** 작은 대문자 라벨 — 촘촘한 글자를 벌린다 (tiny) */
  wide: 0.6,
  /** 초대 코드처럼 한 글자씩 읽는 것 */
  code: 4,
} as const;

/**
 * 사진 위에 얹는 색.
 *
 * ⚠ 이건 테마 토큰이 **아니다.** 사진 위의 배지·카메라 UI 는 밑에 깔린 것이 이미지라
 *   라이트/다크와 무관하게 항상 같은 대비가 필요하다. 그래서 팔레트에 넣지 않고
 *   따로 둔다 — 테마를 따라가야 하는 색과 섞이면 다음에 누가 반드시 헷갈린다.
 */
/**
 * 색에 투명도를 붙여 **옅게 깔 배경**을 만든다.
 *
 * ⚠ 6자리 `#RRGGBB` 에만 붙일 수 있다. 8자리(`#RRGGBBAA`)나 `rgba()` 에 붙이면
 *   `#RRGGBBAA` + `AA` 가 되어 **깨진 색**이 나오고, RN 은 조용히 검정으로 떨어뜨린다.
 *   그래서 형식을 검사하고, 아니면 `fallback` 을 쓴다 — 강조가 사라지는 것보다
 *   알아볼 수 없는 줄이 그려지는 쪽이 나쁘다.
 *
 * ⚠ 여기 두는 이유: 예전에는 MovePicker 안에만 있었는데, 카테고리 색 배지에서 같은
 *   것이 또 필요해졌다. 두 곳에 적으면 한쪽만 고쳐진다.
 */
const HEX6 = /^#[0-9a-fA-F]{6}$/;
export function tinted(color: string, alpha: string, fallback: string): string {
  return HEX6.test(color) ? color + alpha : fallback;
}

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
