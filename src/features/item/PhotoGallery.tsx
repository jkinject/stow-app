import { Image, type ImageSource } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { IconChevron, IconImage, IconPlus, IconX } from '@/components/Icon';
import { TextButton } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { overlay, radius, space, type, useTheme } from '@/lib/theme';

import { PHOTO_ASPECT } from './photo';
import { IMAGE_CACHE_POLICY } from './thumbs';

/**
 * 물건 사진 여러 장 — **큰 사진 한 장 + 아래 썸네일 줄** (2026-09-08 사용자 요청).
 *
 * 물건 상세와 등록 2단계가 **같은 것을 쓴다.** 상세는 서명 URL 을, 등록은 방금 찍은
 * 로컬 파일을 넣는다는 것만 다르다. 두 벌로 만들면 한쪽만 고쳐진다.
 *
 * 왜 이 모양인가:
 *   · 큰 사진은 옆으로 넘긴다(pagingEnabled). 물건을 알아보는 데는 사진 한 장이 크게
 *     보여야 한다 — 격자로 늘어놓으면 전부 작아진다.
 *   · 아래 썸네일 줄은 **"몇 장 있고 지금 몇 번째인가"** 를 한눈에 보여 준다. 점(dot)
 *     표시는 어느 장인지 알 수 없어 넘겨 봐야 한다. 줄 끝의 + 가 "더 넣을 수 있다" 다.
 *   · 첫 장에 "대표" 표시. 목록·검색·카드에 그 한 장이 나가므로 어느 장이 그것인지
 *     알아야 바꿀 수 있다.
 *
 * ⚠ 큰 사진의 비율은 `PHOTO_ASPECT` 한 곳에서만 온다 — photo.ts 주석 참조.
 *
 * ⚠ 아직 올라가지 않은 사진(큐)도 **같은 줄에 그린다.** 따로 빼면 "사진이 사라졌다" 가
 *   되돌아온다 — 큐를 만든 이유가 그것이다. 올리는 중/실패 표시는 그 장 위에 얹는다.
 */

export type GallerySlide = {
  key: string;
  /** 없으면 아직 서명 전 — 빈 바탕을 그린다 */
  source?: ImageSource;
  /** 아직 서버에 없는 사진. 상세에서 큐의 상태를 그대로 넘긴다 */
  status?: 'uploading' | 'failed';
};

export function PhotoGallery({
  slides,
  index,
  onIndexChange,
  onPressSlide,
  onAdd,
  canAdd = true,
  onRetry,
  onDropSlide,
  onMoveSlide,
  showCover = true,
}: {
  slides: GallerySlide[];
  /** 지금 보고 있는 장. 부모가 들고 있다 — 뷰어와 같은 값을 공유한다 */
  index: number;
  onIndexChange: (i: number) => void;
  /** 큰 사진을 눌렀을 때(크게 보기 등). 올리는 중/실패 장은 여기로 오지 않는다 */
  onPressSlide?: (i: number) => void;
  onAdd: () => void;
  /** 10장이 차면 + 타일을 감춘다 */
  canAdd?: boolean;
  /** 실패한 장을 눌렀을 때 */
  onRetry?: (key: string) => void;
  /** 넘기면 큰 사진 구석에 "빼기" 가 뜬다 — 등록 화면(아직 저장 전)에서 쓴다 */
  onDropSlide?: (i: number) => void;
  /**
   * 순서 바꾸기 (2026-09-09). 넘기면 썸네일 줄 아래에 "순서 바꾸기" 가 생기고, 그 모드에서
   * 고른 장을 앞으로·뒤로·대표로 옮긴다. 드래그가 아니다 — 이 앱엔 제스처 핸들러 루트가
   * 없어 그쪽 제스처는 조용히 안 되고(PhotoViewer 주석), 카테고리 화면도 버튼으로 옮긴다.
   * `to` 는 새 자리. 아직 올라가는 중인 장(status 있음)은 옮길 수 없다.
   */
  onMoveSlide?: (from: number, to: number) => void;
  /** 첫 장에 "대표" 표시를 할지. 한 장뿐이면 뜻이 없어 안 그린다 */
  showCover?: boolean;
}) {
  const { c } = useTheme();
  const t = useT();
  const [width, setWidth] = useState(0);
  const [reordering, setReordering] = useState(false);
  const pager = useRef<ScrollView>(null);
  const strip = useRef<ScrollView>(null);
  const count = slides.length;
  const cur = Math.min(index, Math.max(0, count - 1));
  const height = width > 0 ? width / PHOTO_ASPECT : 0;

  // 부모가 장을 바꾸면(뷰어에서 넘김·썸네일 누름) 큰 사진을 그 자리로
  useEffect(() => {
    if (width > 0) pager.current?.scrollTo({ x: cur * width, animated: true });
    // 썸네일 줄도 그 장이 보이게 — 줄 폭보다 장수가 많을 때만 뜻이 있지만 늘 해도 무해하다
    strip.current?.scrollTo({ x: Math.max(0, cur * (THUMB_W + space.sm) - THUMB_W), animated: true });
  }, [cur, width]);

  const onPageEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (width <= 0) return;
      const i = Math.round(e.nativeEvent.contentOffset.x / width);
      if (i !== cur && i >= 0 && i < count) onIndexChange(i);
    },
    [width, cur, count, onIndexChange],
  );

  if (count === 0) {
    return (
      <Pressable
        onPress={onAdd}
        style={({ pressed }) => [
          st.empty,
          { borderColor: c.borderStrong, backgroundColor: c.sunk },
          pressed && { opacity: 0.7 },
        ]}
      >
        <IconImage color={c.textFaint} size={28} />
        <Text style={[st.emptyText, { color: c.textMuted }]}>{t.item.addPhoto}</Text>
      </Pressable>
    );
  }

  return (
    <View style={st.root} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={[st.pagerBox, { height, backgroundColor: c.sunk }]}>
        {width > 0 && (
          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onPageEnd}
            // 처음 그릴 때 부모가 준 장에서 시작한다 (iOS). 안드로이드는 위 effect 가 맞춘다
            contentOffset={{ x: cur * width, y: 0 }}
            style={st.pager}
          >
            {slides.map((s, i) => (
              <Pressable
                key={s.key}
                onPress={() => {
                  if (s.status === 'failed') return onRetry?.(s.key);
                  if (s.status === 'uploading') return;
                  onPressSlide?.(i);
                }}
                style={{ width, height }}
              >
                {s.source ? (
                  <Image
                    source={s.source}
                    style={st.fill}
                    contentFit="cover"
                    transition={150}
                    cachePolicy={IMAGE_CACHE_POLICY}
                  />
                ) : (
                  <View style={[st.fill, st.center]}>
                    <IconImage color={c.textFaint} size={28} />
                  </View>
                )}
                {s.status ? (
                  <View style={[st.fill, st.center, st.scrim]}>
                    {s.status === 'uploading' ? (
                      <>
                        <ActivityIndicator color={overlay.fg} />
                        <Text style={st.scrimText}>{t.item.photoUploading}</Text>
                      </>
                    ) : (
                      <>
                        <Text style={[st.scrimText, st.scrimStrong]}>{t.item.photoStuck}</Text>
                        <Text style={st.scrimText}>{t.item.photoRetry}</Text>
                      </>
                    )}
                  </View>
                ) : null}
                {onDropSlide ? (
                  <Pressable
                    onPress={() => onDropSlide(i)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t.photo.dropShot}
                    style={({ pressed }) => [st.dropChip, pressed && { opacity: 0.6 }]}
                  >
                    <IconX size={14} color={overlay.fg} />
                    <Text style={st.chipText}>{t.photo.dropShot}</Text>
                  </Pressable>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* 왼쪽 위 "대표" · 오른쪽 위 "2 / 5" — ItemCard 의 배지 자리와 같다 */}
        {showCover && count > 1 && cur === 0 && !slides[0].status ? (
          <View style={[st.badge, st.badgeLeft]} pointerEvents="none">
            <Text style={st.chipText}>{t.photo.cover}</Text>
          </View>
        ) : null}
        {count > 1 ? (
          <View style={[st.badge, st.badgeRight]} pointerEvents="none">
            <Text style={[st.chipText, st.counter]}>{t.photo.counter(cur + 1, count)}</Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        ref={strip}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.strip}
        keyboardShouldPersistTaps="handled"
      >
        {slides.map((s, i) => (
          <Pressable
            key={s.key}
            onPress={() => onIndexChange(i)}
            accessibilityRole="button"
            accessibilityLabel={t.photo.counter(i + 1, count)}
            style={[
              st.thumb,
              { backgroundColor: c.sunk, borderColor: i === cur ? c.accent : 'transparent' },
            ]}
          >
            {s.source ? (
              <Image
                source={s.source}
                style={st.fill}
                contentFit="cover"
                cachePolicy={IMAGE_CACHE_POLICY}
              />
            ) : null}
            {s.status === 'uploading' ? (
              <View style={[st.fill, st.center, st.scrim]}>
                <ActivityIndicator size="small" color={overlay.fg} />
              </View>
            ) : s.status === 'failed' ? (
              <View style={[st.fill, st.center, st.scrim]}>
                <IconX size={16} color={overlay.danger} />
              </View>
            ) : null}
          </Pressable>
        ))}
        {canAdd && !reordering ? (
          <Pressable
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel={t.photo.add}
            style={({ pressed }) => [
              st.thumb,
              st.addTile,
              { borderColor: c.borderStrong, backgroundColor: c.sunk },
              pressed && { opacity: 0.6 },
            ]}
          >
            <IconPlus size={22} color={c.textMuted} />
          </Pressable>
        ) : null}
      </ScrollView>

      {/* 순서 바꾸기 — 두 장 이상이고 옮길 수 있을 때만. 고른 장(파란 테두리)이 대상이다 */}
      {onMoveSlide && slides.filter((s) => !s.status).length >= 2 ? (
        <View style={st.reorderRow}>
          {reordering ? (
            <>
              <ReorderButton
                label={t.photo.moveLeft}
                dir="left"
                disabled={cur <= 0 || !!slides[cur]?.status}
                onPress={() => onMoveSlide(cur, cur - 1)}
              />
              <ReorderButton
                label={t.photo.moveRight}
                dir="right"
                disabled={cur >= movable(slides) - 1 || !!slides[cur]?.status}
                onPress={() => onMoveSlide(cur, cur + 1)}
              />
              <TextButton
                label={t.photo.setCover}
                size="small"
                onPress={() => onMoveSlide(cur, 0)}
                disabled={cur === 0 || !!slides[cur]?.status}
              />
              <TextButton
                label={t.common.done}
                size="small"
                onPress={() => setReordering(false)}
                style={st.reorderDone}
              />
            </>
          ) : (
            <TextButton label={t.photo.reorder} size="small" tone="muted" onPress={() => setReordering(true)} />
          )}
        </View>
      ) : null}
    </View>
  );
}

/** 옮길 수 있는 장 수 — 서버에 있는 장(앞쪽)만. 큐의 장은 뒤에 붙어 있다 */
function movable(slides: GallerySlide[]) {
  return slides.filter((s) => !s.status).length;
}

function ReorderButton({
  label,
  dir,
  disabled,
  onPress,
}: {
  label: string;
  dir: 'left' | 'right';
  disabled: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        st.arrowBtn,
        { borderColor: c.borderStrong },
        (pressed || disabled) && { opacity: 0.4 },
      ]}
    >
      <IconChevron size={18} color={c.text} style={dir === 'left' ? st.flip : undefined} />
      <Text style={[st.arrowText, { color: c.text }]}>{label}</Text>
    </Pressable>
  );
}

/** 썸네일 폭. 높이는 같은 3:4 */
const THUMB_W = 48;

const st = StyleSheet.create({
  root: { gap: space.sm },
  pagerBox: { width: '100%', borderRadius: radius.md, overflow: 'hidden' },
  pager: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.xs },
  scrim: { position: 'absolute', top: 0, left: 0, backgroundColor: overlay.scrim },
  scrimText: { color: overlay.fg, fontSize: type.small },
  scrimStrong: { fontWeight: '700', fontSize: type.body },
  badge: {
    position: 'absolute',
    top: space.sm,
    backgroundColor: overlay.chip,
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  badgeLeft: { left: space.sm },
  badgeRight: { right: space.sm },
  chipText: { color: overlay.fg, fontSize: type.tiny, fontWeight: '700' },
  counter: { fontVariant: ['tabular-nums'] },
  dropChip: {
    position: 'absolute',
    right: space.sm,
    bottom: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: overlay.chip,
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  strip: { flexDirection: 'row', gap: space.sm },
  reorderRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  reorderDone: { marginLeft: 'auto' },
  arrowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  arrowText: { fontSize: type.small, fontWeight: '600' },
  flip: { transform: [{ rotate: '180deg' }] },
  thumb: {
    width: THUMB_W,
    height: THUMB_W / PHOTO_ASPECT,
    borderRadius: radius.xs,
    borderWidth: 2,
    overflow: 'hidden',
  },
  addTile: { borderStyle: 'dashed', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  empty: {
    height: 96,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  emptyText: { fontSize: type.body, fontWeight: '600' },
});
