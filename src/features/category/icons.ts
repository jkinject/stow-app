/**
 * ⚠ 아이콘 **컴포넌트**가 아니라 **글리프맵(JSON)** 을 가져온다.
 *
 *   컴포넌트를 가져오면 이 파일이 react-native 를 끌고 들어와, 이름 목록을 검사하는
 *   테스트가 ESM 변환에 걸려 아예 못 돈다(실제로 걸렸다). 여기서 필요한 것은 "이 이름이
 *   팩에 있느냐" 뿐이고, 그 답은 JSON 안에 그대로 있다.
 *   같은 파일을 앱과 테스트가 함께 보므로 **근거가 하나**다.
 */
import glyphMap from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json';

/**
 * 카테고리의 **아이콘과 색** (2026-09-03 사용자 요청).
 *
 * 아이콘 팩은 `@expo/vector-icons` 의 MaterialCommunityIcons 를 쓴다(약 7,000개).
 *
 * ⚠ `components/Icon.tsx` 의 "직접 그린다" 규칙과 어긋나 보이지만 **다른 문제**다.
 *   그 규칙은 **이모지·문자**(⚙ ◧ ⋯)를 아이콘 대신 쓰지 말라는 것이다 — 기기마다
 *   모양이 달라지고 색을 안 따라온다. 여기 쓰는 것은 글자가 아니라 **아이콘 폰트**라
 *   기기와 무관하게 같은 모양이고 색·크기를 그대로 따른다.
 *   화면 곳곳의 붙박이 아이콘은 계속 Icon.tsx 를 쓴다. 이 팩은 **사용자가 고르는**
 *   자리에만 쓴다 — 붙박이 열 몇 개를 위해 7,000개를 들고 다닐 이유는 없지만,
 *   고르게 하려면 손으로 그려서는 수가 모자란다.
 *
 * ⚠ 아래 목록은 **큐레이션**이다. 7,000개를 그대로 보여주면 고를 수가 없다.
 *   집안 물건 분류에 실제로 쓸 만한 것만 골라 갈래로 묶었다.
 *
 * ⚠ 이름이 팩에 실제로 있는지는 **테스트가 검사한다**(icons.test.ts). 오타가 나면
 *   그 자리에 빈 네모가 뜰 뿐 아무도 모른다.
 */

export type IconName = keyof typeof glyphMap;

/** 아이콘 이름이 없거나 팩에서 사라졌을 때 대신 그리는 것 */
export const FALLBACK_ICON: IconName = 'shape-outline';

export type IconGroup = { key: string; names: IconName[] };

/**
 * 고를 수 있는 아이콘. 갈래는 **찾는 순서**대로 뒀다 —
 * 집안일 → 살림 → 옷·몸 → 먹을 것 → 취미 → 일·전자 → 모양.
 */
export const ICON_GROUPS: IconGroup[] = [
  {
    key: 'home',
    names: [
      'home-outline',
      'sofa-outline',
      'bed-outline',
      'door-closed',
      'window-closed-variant',
      'stairs',
      'lightbulb-outline',
      'broom',
      'spray-bottle',
      'washing-machine',
      'shower',
      'toilet',
      'hanger',
      'iron-outline',
    ],
  },
  {
    key: 'tools',
    names: [
      'wrench-outline',
      'hammer',
      'screwdriver',
      'toolbox-outline',
      'saw-blade',
      'nail',
      'tape-measure',
      'ladder',
      'flashlight',
      'battery-outline',
      'power-plug-outline',
      'lightning-bolt-outline',
    ],
  },
  {
    key: 'wear',
    names: [
      'tshirt-crew-outline',
      'shoe-sneaker',
      'shoe-heel',
      'sunglasses',
      'watch-variant',
      'bag-personal-outline',
      'briefcase-outline',
      'umbrella-outline',
      'hat-fedora',
      'necklace',
    ],
  },
  {
    key: 'food',
    names: [
      'silverware-fork-knife',
      'cup-outline',
      'coffee-outline',
      'bottle-soda-outline',
      'food-apple-outline',
      'bread-slice-outline',
      'noodles',
      'fridge-outline',
      'stove',
      'pot-steam-outline',
      'kettle-outline',
      'blender-outline',
    ],
  },
  {
    key: 'life',
    names: [
      'sprout-outline',
      'flower-outline',
      'paw-outline',
      'baby-carriage',
      'teddy-bear',
      'medical-bag',
      'pill',
      'bandage',
      'gift-outline',
      'candle',
      'pine-tree',
      'snowflake',
      'beach',
      'weather-sunny',
    ],
  },
  {
    key: 'play',
    names: [
      'gamepad-variant-outline',
      'puzzle-outline',
      'book-open-outline',
      'music-note-outline',
      'guitar-acoustic',
      'palette-outline',
      'camera-outline',
      'dumbbell',
      'bike',
      'tent',
      'fish',
      'basketball',
    ],
  },
  {
    key: 'work',
    names: [
      'laptop',
      'cellphone',
      'headphones',
      'printer-outline',
      'usb-flash-drive-outline',
      'cable-data',
      'pencil-outline',
      'paperclip',
      'scissors-cutting',
      'folder-outline',
      'archive-outline',
      'key-variant',
    ],
  },
  {
    key: 'shape',
    names: [
      'shape-outline',
      'star-outline',
      'heart-outline',
      'tag-outline',
      'package-variant-closed',
      'cube-outline',
      'dots-horizontal-circle-outline',
      'help-circle-outline',
    ],
  },
];

/** 격자에 그대로 펼칠 때 쓰는 평평한 목록 */
export const ALL_ICONS: IconName[] = ICON_GROUPS.flatMap((g) => g.names);

/**
 * 고를 수 있는 색.
 *
 * ⚠ **테마와 무관하게 같은 값**을 쓴다. 이 색은 팔레트(테마 색)가 아니라 사용자가 고른
 *   **데이터**다 — 라이트에서 고른 초록이 다크에서 다른 초록이 되면 안 된다.
 *
 * ⚠ 이 색 위에는 **흰 아이콘**이 얹힌다. 대비 기준은 **3:1**(WCAG 비텍스트 요소)이다.
 *   본문 글씨 기준인 4.5:1 을 적용하면 선명한 색이 전부 탁해진다 — 여기 얹히는 것은
 *   28px 짜리 그림이지 읽는 글이 아니다. 테스트가 이 값을 지킨다.
 *
 * ⚠ 여기 값이 DB 의 `#RRGGBB` check 를 통과하는 형식이어야 한다.
 */
export const CATEGORY_COLORS = [
  '#6366F1', // 인디고
  '#2563EB', // 파랑
  '#0D9488', // 청록
  '#16A34A', // 초록
  '#B45309', // 노랑 (#CA8A04 는 흰 아이콘 대비 2.94 로 미달이었다)
  '#D97706', // 주황
  '#DC2626', // 빨강
  '#DB2777', // 분홍
  '#7C3AED', // 보라
  '#475569', // 회색
] as const;

export const DEFAULT_COLOR = CATEGORY_COLORS[0];

/** 팩에 없는 이름이 들어와도 화면이 깨지지 않게 한다 */
export function safeIcon(name: string | null | undefined): IconName {
  if (name && name in glyphMap) return name as IconName;
  return FALLBACK_ICON;
}
