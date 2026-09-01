import { Image, type ImageSource } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IMAGE_CACHE_POLICY } from '@/features/item/thumbs';
import { useTheme, type, radius, space, tracking } from '@/lib/theme';

/**
 * 썸네일 + 제목 + 부제 + 우측 정보로 이루어진 목록 행.
 *
 * **물건과 박스가 같은 구현을 쓴다.** 원래 물건에만 사진이 있었는데, 박스도 모양이
 * 제각각이라 사진이 필요하다는 요청이 왔다(2026-08-30). 각자 만들면 한쪽만 고쳐지는
 * 날이 반드시 온다 — 이 프로젝트에서 이미 세 번 겪었다.
 *
 * 사진이 없을 때 첫 글자로 자리를 채우는 이유: 빈 칸을 두면 목록이 들쭉날쭉해 보인다.
 */
export function ThumbRow({
  title,
  subtitle,
  caption,
  meta,
  thumb,
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
   * 사진이 없을 때 자리에 넣을 것. 기본은 **제목 첫 글자**다.
   *
   * ⚠ 첫 글자가 늘 옳지는 않다. 장소 목록처럼 사진 없는 줄이 대부분이면
   *   "게 냉 드 세 실 안 카 컴 현" 같은 회색 글자 타일이 줄줄이 서서 오히려
   *   틀에 찍어낸 것처럼 보인다(실기기에서 확인). 그럴 땐 조용한 아이콘을 넘긴다.
   */
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
        {thumb ? (
          <Image
            source={thumb}
            style={st.thumbImg}
            contentFit="cover"
            transition={120}
            cachePolicy={IMAGE_CACHE_POLICY}
            recyclingKey={thumb.cacheKey}
          />
        ) : (
          (fallback ?? <Text style={[st.thumbFallback, { color: c.textFaint }]}>{title.slice(0, 1)}</Text>)
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

      {meta}
    </Pressable>
  );
}

const st = StyleSheet.create({
  row: {
    borderRadius: radius.sm,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbFallback: { fontSize: type.title, fontWeight: '600' },
  main: { flex: 1, gap: space.xs },
  title: { fontSize: type.bodyStrong, fontWeight: '700', letterSpacing: tracking.snug },
  subtitle: { fontSize: type.small },
  caption: { fontSize: type.caption },
});
