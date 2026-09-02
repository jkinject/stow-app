import glyphMap from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json';

import { ALL_ICONS, CATEGORY_COLORS, FALLBACK_ICON, ICON_GROUPS, safeIcon } from '../icons';

/**
 * ⚠ 이 테스트가 없으면 아이콘 이름 오타가 **빈 네모**로만 드러난다. 화면에서 하나쯤
 *   비어 있어도 눈치채기 어렵고, 눈치채도 어느 이름인지 알 수 없다.
 */
describe('카테고리 아이콘 목록', () => {
  it('모든 이름이 아이콘 팩에 실제로 있다', () => {
    const missing = ALL_ICONS.filter((n) => !(n in glyphMap));
    expect(missing).toEqual([]);
  });

  it('고를 만큼 넉넉하다 (40개 이상)', () => {
    expect(ALL_ICONS.length).toBeGreaterThanOrEqual(40);
  });

  it('같은 아이콘이 두 갈래에 겹쳐 있지 않다', () => {
    expect(new Set(ALL_ICONS).size).toBe(ALL_ICONS.length);
  });

  it('갈래가 비어 있지 않다', () => {
    for (const g of ICON_GROUPS) expect(g.names.length).toBeGreaterThan(0);
  });

  it('기본 아이콘도 팩에 있다', () => {
    expect(FALLBACK_ICON in glyphMap).toBe(true);
  });

  it('모르는 이름은 기본 아이콘으로 떨어진다', () => {
    expect(safeIcon('존재하지-않는-아이콘')).toBe(FALLBACK_ICON);
    expect(safeIcon(null)).toBe(FALLBACK_ICON);
    expect(safeIcon('')).toBe(FALLBACK_ICON);
    expect(safeIcon('wrench-outline')).toBe('wrench-outline');
  });
});

describe('카테고리 색', () => {
  it('DB 의 #RRGGBB check 를 통과하는 형식이다', () => {
    for (const c of CATEGORY_COLORS) expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('충분히 여러 가지다 (8개 이상)', () => {
    expect(CATEGORY_COLORS.length).toBeGreaterThanOrEqual(8);
  });

  it('중복이 없다', () => {
    expect(new Set(CATEGORY_COLORS).size).toBe(CATEGORY_COLORS.length);
  });

  /**
   * ⚠ 이 색 위에는 **흰 아이콘**이 얹힌다. 밝은 색을 고르면 아이콘이 안 보인다.
   *   눈으로만 고르면 언젠가 노란 형광색이 들어온다 — 숫자로 막는다.
   *
   * ⚠ 기준은 **3:1** 이다(WCAG 비텍스트 요소). 처음에 본문 글씨 기준인 4.5 를 넣었다가
   *   멀쩡한 색 다섯 개가 걸렸다 — 타일에 얹히는 것은 큰 그림이지 읽는 글이 아니다.
   *   기준을 잘못 잡으면 테스트가 옳은 것을 막는다.
   */
  it('흰 아이콘이 읽히는 명도다 (대비 3:1 이상)', () => {
    const lum = (hex: string) => {
      const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const lin = ch.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    for (const c of CATEGORY_COLORS) {
      const ratio = (1.0 + 0.05) / (lum(c) + 0.05);
      // 실패했을 때 **어느 색이 몇으로 걸렸는지** 바로 보이게 한다
      expect([c, Number(ratio.toFixed(2))]).toEqual([c, expect.any(Number)]);
      if (ratio < 3) throw new Error(`${c} 의 흰 아이콘 대비가 ${ratio.toFixed(2)} — 3:1 미달`);
    }
  });
});
