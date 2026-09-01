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
 * ⚠ 자리 폭은 **장수와 무관하게 고정**이고, 사진은 그 안에서 **오른쪽에 붙인다.**
 *   왼쪽에 붙이면 한 장짜리 줄에 오른쪽 공백이 남아 목록의 오른쪽 끝이 들쭉날쭉해
 *   보인다(사용자 보고 2026-09-02). 줄의 끝은 늘 같은 x 여야 한다.
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
}: {
  paths?: string[];
  /** 경로 → `{ uri, cacheKey }`. `useThumbUrls().get` 을 그대로 넘긴다 */
  get: (path?: string | null) => ImageSource | undefined;
  /** 한 장의 한 변. 목록 행마다 크기가 달라 인자로 받는다 */
  size?: number;
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

  /**
   * ⚠ 사진이 없으면 **아무것도 그리지 않는다.** 예전에는 빈 회색 타일을 뒀는데,
   *   그건 사진이 왼쪽에 있던 시절 글자 시작선을 맞추려던 것이다. 이제 왼쪽 자리는
   *   아이콘이 잡으므로 오른쪽은 비어도 줄이 흔들리지 않는다.
   */
  if (list.length === 0) return null;

  return (
    <View style={[st.stack, { width, height: size }]}>
      {list.map((p, i) => {
          const src = get(p);
          return (
            <View
              key={p}
              /**
               * ⚠ `left` 가 아니라 `right` 로 잡는다. 마지막 장이 자리의 오른쪽 끝에
               *   딱 붙고, 앞 장들이 왼쪽으로 밀려 나가며 겹친다.
               */
              style={[
                st.tile,
                tile,
                { right: (list.length - 1 - i) * step, zIndex: STACK_MAX - i },
              ]}
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
      })}
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
