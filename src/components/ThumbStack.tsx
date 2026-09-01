import { Image, type ImageSource } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { IMAGE_CACHE_POLICY } from '@/features/item/thumbs';
import { useTheme, radius } from '@/lib/theme';

/**
 * 겹쳐 놓은 작은 사진들.
 *
 * ⚠⚠ 왜 한 장이 아닌가. 장소에는 제 사진이 없어서 안의 것을 빌려 오는데, **한 장만
 *   놓으면 그게 그 장소의 대표 사진처럼 읽힌다**(사용자 보고 2026-09-01·09-02).
 *   겹쳐서 여러 장 보여 주면 "안에 이런 것들이 있다" 로 읽힌다. 박스도 마찬가지 —
 *   제 사진이 없을 때 물건 한 장을 박으면 그 물건이 박스를 대표하는 것처럼 보인다.
 *
 * ⚠ 자리 폭은 **장수와 무관하게 고정**이다. 한 장짜리 줄과 세 장짜리 줄의 글자
 *   시작선이 달라지면 목록을 훑어볼 수 없다.
 * ⚠ 타일마다 화면 바탕색 테두리를 두른다. 안 두르면 겹친 사진끼리 경계가 없어
 *   한 장의 이상한 콜라주로 보인다.
 *
 * ⚠ 이동 화면과 보관 장소 탭이 **이 하나를 같이 쓴다.** 각자 만들면 한쪽만
 *   고쳐지는 날이 반드시 온다 — 이 프로젝트에서 이미 여러 번 겪었다.
 */

/** 겹쳐 보여 줄 사진 수. 셋이면 "여러 개" 로 읽히고, 넷부터는 줄이 너무 넓어진다 */
export const STACK_MAX = 3;

export function ThumbStack({
  paths,
  get,
  size = 40,
  fallback,
}: {
  paths?: string[];
  /** 경로 → `{ uri, cacheKey }`. `useThumbUrls().get` 을 그대로 넘긴다 */
  get: (path?: string | null) => ImageSource | undefined;
  /** 한 장의 한 변. 목록 행마다 크기가 달라 인자로 받는다 */
  size?: number;
  /** 한 장도 없을 때 첫 칸에 넣을 것 (장소 아이콘 등) */
  fallback?: React.ReactNode;
}) {
  const { c } = useTheme();
  /**
   * 다음 장이 밀려나는 간격.
   *
   * ⚠ 크기의 절반으로 뒀더니 각 사진이 **반씩만** 보여 뭐가 뭔지 알아볼 수
   *   없었다(실기기 확인). 60% 는 보여야 사진 구실을 한다.
   */
  const step = Math.round(size * 0.6);
  const width = size + step * (STACK_MAX - 1);
  const list = (paths ?? []).slice(0, STACK_MAX);
  const tile = { width: size, height: size, backgroundColor: c.sunk, borderColor: c.bg };

  return (
    <View style={[st.stack, { width, height: size }]}>
      {list.length === 0 ? (
        <View style={[st.tile, tile, { left: 0 }]}>{fallback}</View>
      ) : (
        list.map((p, i) => {
          const src = get(p);
          return (
            <View
              key={p}
              style={[st.tile, tile, { left: i * step, zIndex: STACK_MAX - i }]}
            >
              {!!src && (
                <Image
                  source={src}
                  style={st.img}
                  contentFit="cover"
                  transition={120}
                  cachePolicy={IMAGE_CACHE_POLICY}
                  recyclingKey={src.cacheKey}
                />
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

const st = StyleSheet.create({
  stack: { justifyContent: 'center' },
  tile: {
    position: 'absolute',
    borderRadius: radius.sm,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: { width: '100%', height: '100%' },
});
