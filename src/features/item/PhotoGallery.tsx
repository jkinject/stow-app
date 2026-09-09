import { Image, type ImageSource } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { IconImage, IconPlus, IconX } from '@/components/Icon';
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
 *
 * ══ 순서 바꾸기 — 썸네일을 **길게 눌러 끈다** (2026-09-09 사용자 요청) ══════════
 * 처음엔 "순서 바꾸기 → 앞으로/뒤로" 버튼이었는데 끌어서 옮기는 쪽을 원했다.
 * ⚠ 드래그 정렬 라이브러리를 쓰지 않는다. 그쪽은 react-native-gesture-handler 위에 서는데
 *   이 앱엔 `GestureHandlerRootView` 가 없어 **조용히 동작하지 않는다**(PhotoViewer 주석).
 *   RN 기본 터치(onTouchMove)로 직접 한다 — 뷰어의 핀치·넘기기와 같은 방식이다.
 *   · 길게 누르면(250ms) 그 장이 들리고, 그 순간 줄의 스크롤을 끈다(손가락을 놓을 때까지)
 *   · 손가락 x 로 "지금 어느 칸 위인가" 를 계산해 **그 자리로 미리 옮겨 그린다** —
 *     나머지 장이 실시간으로 비켜난다. 들린 장은 그 칸에서 손가락만큼 더 밀려 따라온다.
 *   · 놓으면 `onMoveSlide(from, to)` 한 번. 큰 사진도 그 장으로 넘어간다.
 *   · 아직 올라가는 중인 장(status)은 끌 수 없고, 그 앞을 지나칠 수도 없다(서버에 없는
 *     장의 순서는 정할 수 없다). 첫 칸으로 끌면 곧 대표 지정이다.
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
  /** 넘기면 썸네일을 길게 눌러 끌어 옮길 수 있다. `to` 는 새 자리 (위 주석) */
  onMoveSlide?: (from: number, to: number) => void;
  /** 첫 장에 "대표" 표시를 할지. 한 장뿐이면 뜻이 없어 안 그린다 */
  showCover?: boolean;
}) {
  const { c } = useTheme();
  const t = useT();
  const [width, setWidth] = useState(0);
  const pager = useRef<ScrollView>(null);
  const strip = useRef<ScrollView>(null);
  /** 줄을 감싼 View — 화면 위치를 재는 데 쓴다 (ScrollView 는 measureInWindow 가 없다) */
  const stripBox = useRef<View>(null);
  const count = slides.length;
  const cur = Math.min(index, Math.max(0, count - 1));
  const height = width > 0 ? width / PHOTO_ASPECT : 0;

  // 부모가 장을 바꾸면(뷰어에서 넘김·썸네일 누름) 큰 사진을 그 자리로
  useEffect(() => {
    if (width > 0) pager.current?.scrollTo({ x: cur * width, animated: true });
    // 썸네일 줄도 그 장이 보이게 — 줄 폭보다 장수가 많을 때만 뜻이 있지만 늘 해도 무해하다
    strip.current?.scrollTo({ x: Math.max(0, cur * SLOT - THUMB_W), animated: true });
  }, [cur, width]);

  const onPageEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (width <= 0) return;
      const i = Math.round(e.nativeEvent.contentOffset.x / width);
      if (i !== cur && i >= 0 && i < count) onIndexChange(i);
    },
    [width, cur, count, onIndexChange],
  );

  /* ── 끌어서 옮기기 ────────────────────────────────────────────── */
  const movable = slides.filter((s) => !s.status).length; // 서버에 있는 장은 앞쪽에 모여 있다
  const canDrag = !!onMoveSlide && movable >= 2;
  /** 끄는 동안의 상태. `to` 가 바뀔 때만 다시 그린다 */
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const dragRef = useRef<{ from: number; to: number; stripX: number } | null>(null);
  const scrollX = useRef(0);
  /** 들린 장이 제 칸에서 손가락만큼 더 밀리는 양 — 리렌더 없이 움직인다 */
  const lift = useMemo(() => new Animated.Value(0), []);

  const startDrag = useCallback(
    (i: number) => {
      if (!canDrag || slides[i]?.status) return;
      // 줄의 화면 x — 손가락 pageX 를 줄 내용 좌표로 바꾸는 데 쓴다
      stripBox.current?.measureInWindow((x: number) => {
        dragRef.current = { from: i, to: i, stripX: x };
        lift.setValue(0);
        setDrag({ from: i, to: i });
        onIndexChange(i);
      });
    },
    [canDrag, slides, lift, onIndexChange],
  );

  const onStripTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const touch = e.nativeEvent.touches[0];
      if (!touch) return;
      const contentX = touch.pageX - d.stripX + scrollX.current;
      const to = Math.max(0, Math.min(movable - 1, Math.floor(contentX / SLOT)));
      if (to !== d.to) {
        d.to = to;
        setDrag({ from: d.from, to });
      }
      // 그 칸의 가운데에서 손가락까지 — 들린 장이 손가락을 따라오게
      lift.setValue(contentX - (to * SLOT + THUMB_W / 2));
    },
    [movable, lift],
  );

  const endDrag = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setDrag(null);
    lift.setValue(0);
    if (d.to !== d.from) onMoveSlide?.(d.from, d.to);
    else onIndexChange(d.from);
  }, [lift, onMoveSlide, onIndexChange]);

  /** 끄는 동안 보이는 순서 — 들린 장을 `to` 자리에 미리 넣어 그린다 */
  const shown = useMemo(() => {
    const arr = slides.map((s, i) => ({ s, i }));
    if (!drag) return arr;
    const [moved] = arr.splice(drag.from, 1);
    arr.splice(drag.to, 0, moved);
    return arr;
  }, [slides, drag]);

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

      {/*
        ⚠ 끄는 동안 스크롤을 끈다. 켜 두면 손가락 움직임을 줄이 가져가 장이 안 따라온다.
          길게 누르는 동안엔 손가락이 멈춰 있어 줄이 아직 스크롤을 잡지 않았고, 그 뒤엔 잡지 못한다.
        ⚠ 터치 이벤트는 자식(썸네일)에서 올라온다 — 줄에 onTouchMove 를 달면 다 받는다.
      */}
      <View ref={stripBox} collapsable={false}>
      <ScrollView
        ref={strip}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.strip}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!drag}
        scrollEventThrottle={32}
        onScroll={(e) => {
          scrollX.current = e.nativeEvent.contentOffset.x;
        }}
        onTouchMove={onStripTouchMove}
        onTouchEnd={endDrag}
        onTouchCancel={endDrag}
      >
        {shown.map(({ s, i }, slot) => {
          const lifted = drag?.from === i;
          return (
            <Animated.View
              key={s.key}
              style={
                lifted
                  ? { transform: [{ translateX: lift }, { scale: 1.08 }], zIndex: 2, elevation: 4 }
                  : undefined
              }
            >
              <Pressable
                onPress={() => onIndexChange(i)}
                onLongPress={canDrag && !s.status ? () => startDrag(i) : undefined}
                delayLongPress={LONG_PRESS_MS}
                /**
                 * ⚠ 손가락이 조금 벗어나도 누름을 유지한다 (사용자 보고 2026-09-09: "끌다가
                 *   취소된다"). 기본값(20)이면 길게 누르는 0.2초 사이에 살짝만 움직여도 취소되어
                 *   드래그가 시작조차 안 된다. 썸네일이 작으니 더 넉넉히 준다.
                 */
                pressRetentionOffset={RETENTION}
                hitSlop={{ top: 8, bottom: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t.photo.counter(slot + 1, count)}
                accessibilityHint={canDrag && !s.status ? t.photo.dragHint : undefined}
                style={[
                  st.thumb,
                  {
                    backgroundColor: c.sunk,
                    borderColor: i === cur || lifted ? c.accent : 'transparent',
                    opacity: lifted ? 0.92 : 1,
                  },
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
            </Animated.View>
          );
        })}
        {canAdd && !drag ? (
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
      </View>
      {canDrag ? (
        <Text style={[st.dragHint, { color: c.textFaint }]}>{t.photo.dragHint}</Text>
      ) : null}
    </View>
  );
}

/**
 * 썸네일 폭. 높이는 같은 3:4.
 * ⚠ 48 → 64 (2026-09-09). 48 은 손가락 하나 폭이라 길게 누르는 동안 벗어나기 쉬웠다 —
 *   끌기가 시작되기 전에 취소되어 "영역이 너무 작다" 는 보고가 왔다.
 */
const THUMB_W = 64;
/** 길게 누르기. 250 이면 그 사이 손가락이 움직여 스크롤로 새 버린다 */
const LONG_PRESS_MS = 180;
const RETENTION = { top: 60, bottom: 60, left: 60, right: 60 };
/** 썸네일 한 칸의 간격 — 끌 때 "몇 번째 칸 위인가" 를 이걸로 나눈다. strip 의 gap 과 같아야 한다 */
const SLOT = THUMB_W + space.sm;

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
  /** ⚠ gap 은 SLOT 계산과 같아야 한다 (space.sm) */
  strip: { flexDirection: 'row', gap: space.sm },
  thumb: {
    width: THUMB_W,
    height: THUMB_W / PHOTO_ASPECT,
    borderRadius: radius.xs,
    borderWidth: 2,
    overflow: 'hidden',
  },
  addTile: { borderStyle: 'dashed', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dragHint: { fontSize: type.tiny },
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
