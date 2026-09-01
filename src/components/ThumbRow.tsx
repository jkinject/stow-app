import { Image, type ImageSource } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconImage } from '@/components/Icon';
import { ThumbStack } from '@/components/ThumbStack';
import { IMAGE_CACHE_POLICY } from '@/features/item/thumbs';
import { useTheme, type, radius, space, tracking } from '@/lib/theme';

/**
 * 썸네일 + 제목 + 부제 + 우측 정보로 이루어진 목록 행.
 *
 * **물건과 박스가 같은 구현을 쓴다.** 원래 물건에만 사진이 있었는데, 박스도 모양이
 * 제각각이라 사진이 필요하다는 요청이 왔다(2026-08-30). 각자 만들면 한쪽만 고쳐지는
 * 날이 반드시 온다 — 이 프로젝트에서 이미 세 번 겪었다.
 *
 * 사진이 없으면 **아이콘**으로 자리를 채운다. 빈 칸을 두면 목록이 들쭉날쭉해 보이고,
 * 예전처럼 이름의 첫 글자를 넣으면 회색 글자 타일이 줄줄이 서서 오히려 틀에 찍어낸
 * 것처럼 보인다(2026-09-02 사용자 보고).
 */
export function ThumbRow({
  title,
  subtitle,
  caption,
  meta,
  thumb,
  stack,
  fallback,
  onPress,
  onLongPress,
}: {
  title: string;
  /** 제목 아래 첫 줄 — 물건이면 위치 경로, 박스면 "물건 N개" */
  subtitle?: string | null;
  /** 그 아래 한 줄 더 (물건의 카테고리) */
  caption?: string | null;
  /** 우측 끝 — 물건이면 수량, 박스면 "QR" */
  meta?: ReactNode;
  /** ⚠ `{ uri, cacheKey }` 통째로 — 자세한 이유는 features/item/thumbs.ts 참고 */
  thumb?: ImageSource;
  /**
   * 사진 **여러 장**을 겹쳐 **줄 오른쪽에** 보여 줄 때.
   *
   * ⚠ 왼쪽이 아니다. 왼쪽에 세 장을 겹쳐 놓으니 줄의 시작이 뭉개져 보였다
   *   (사용자 보고 2026-09-02). 왼쪽은 그 줄이 **무엇인지**(장소냐 박스냐) 말하는
   *   자리이므로 아이콘이 맡고, 안에 든 것들은 오른쪽에 딸려 붙는다.
   *   `stack` 을 넘기면 왼쪽 칸은 `fallback` 아이콘으로 채워진다.
   *
   * ⚠ 물건에는 쓰지 않는다. 물건 사진은 그 물건의 진짜 사진이라 한 장이 맞다.
   *   장소·박스처럼 **제 사진이 없어 안의 것을 빌려 오는** 줄에만 쓴다.
   */
  stack?: { paths?: string[]; get: (p?: string | null) => ImageSource | undefined };
  /** 사진이 없을 때 자리에 넣을 것. 기본은 사진 아이콘 — 쓰는 곳에서 바꿀 수 있다 */
  fallback?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        st.row,
        { borderColor: c.border, backgroundColor: c.card },
        pressed && onPress ? { opacity: 0.7 } : null,
      ]}
    >
      <View style={[st.thumb, { backgroundColor: c.sunk }]}>
        {!stack && thumb ? (
          <Image
            source={thumb}
            style={st.thumbImg}
            contentFit="cover"
            transition={120}
            cachePolicy={IMAGE_CACHE_POLICY}
            recyclingKey={thumb.cacheKey}
          />
        ) : (
          (fallback ?? <IconImage color={c.textFaint} size={22} />)
        )}
      </View>

      <View style={st.main}>
        <Text style={[st.title, { color: c.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[st.subtitle, { color: c.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {caption ? (
          <Text style={[st.caption, { color: c.textFaint }]} numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>

      {!!stack && <ThumbStack paths={stack.paths} get={stack.get} size={THUMB} />}
      {meta}
    </Pressable>
  );
}

/** 썸네일 한 변. 겹쳐 놓을 때도 같은 크기라야 다른 목록과 줄이 맞는다 */
const THUMB = 52;

const st = StyleSheet.create({
  row: {
    borderRadius: radius.sm,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImg: { width: '100%', height: '100%' },
  main: { flex: 1, gap: space.xs },
  title: { fontSize: type.bodyStrong, fontWeight: '700', letterSpacing: tracking.snug },
  subtitle: { fontSize: type.small },
  caption: { fontSize: type.caption },
});
