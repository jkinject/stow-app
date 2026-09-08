import { Image, type ImageSource } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IMAGE_CACHE_POLICY } from '@/features/item/thumbs';
import { confirmDestructive } from '@/lib/confirm';
import { useT } from '@/lib/i18n';
import { overlay, radius, type, space } from '@/lib/theme';

/**
 * 사진 크게 보기.
 *
 * 물건 상세와 박스 상세가 **같은 것을 쓴다.** 전에는 박스에만 있었고 물건은 사진을
 * 누르면 곧장 카메라가 떴다 — 누르는 의도는 "크게 보고 싶다" 인데 "바꾸겠다" 로
 * 받아들여졌다(사용자 보고). 바꾸기는 여기 아래 줄에 둔다.
 *
 * ══ 여러 장 (2026-09-08) ══════════════════════════════════════════
 * `sources` 를 배열로 받고 **옆으로 넘긴다.** 박스는 한 장짜리 배열을 넘긴다.
 *
 * ⚠ 넘기기를 ScrollView(pagingEnabled)로 하지 않았다. 확대는 두 손가락, 이동은
 *   한 손가락인데 UIScrollView 는 두 손가락도 스크롤로 받아들여 **핀치하는 동안 옆
 *   장으로 미끄러진다.** 그래서 넘기기도 아래 손 처리에서 같이 한다 — 원래 크기에서
 *   한 손가락으로 옆으로 끌면 넘기고, 확대된 상태에서는 사진을 움직인다.
 *   장을 넘기면 배율은 원래대로 돌아간다(그래야 변환값 한 벌로 충분하다).
 *
 * ⚠ 제스처를 react-native-gesture-handler 로 하지 않았다. 이 앱에는
 *   `GestureHandlerRootView` 가 없어서 그쪽 제스처는 **조용히 동작하지 않는다.**
 *   CameraZoom 이 같은 이유로 RN 기본 터치를 쓴다 — 여기서도 같은 방식을 따른다.
 *
 * ⚠ 배율·이동을 useState 로 두면 손가락을 움직일 때마다 리렌더가 돈다.
 *   `Animated.Value` 에 담아 변환만 갱신한다.
 */

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_MS = 280;
/** 이만큼 안쪽 움직임은 '가만히 두드렸다' 로 본다 (px) */
const TAP_SLOP = 8;
/** 이만큼 끌면 옆 장으로 — 화면 폭의 1/4 */
const FLIP_RATIO = 0.25;
/** 빠르게 튕기면 짧게 끌어도 넘긴다 */
const FLICK_MS = 250;
const FLICK_PX = 40;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function PhotoViewer({
  visible,
  sources,
  index,
  onIndexChange,
  onClose,
  onChange,
  onAdd,
  onSetCover,
  onRemove,
}: {
  visible: boolean;
  /** 순서대로. 비어 있으면 아무것도 그리지 않는다 */
  sources: ImageSource[];
  /** 지금 보고 있는 장. 부모가 들고 있다 — 썸네일 줄과 같은 값을 공유한다 */
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  /** "사진 바꾸기" — 한 장짜리(박스). 누르면 뷰어를 닫고 카메라로 간다 */
  onChange?: () => void;
  /** "사진 추가" — 여러 장(물건) */
  onAdd?: () => void;
  /** "대표로" — 첫 장이 아닐 때만 뜬다 */
  onSetCover?: (i: number) => void;
  /** 넘기면 "지우기" 가 함께 뜬다 (확인창은 여기서 띄운다) */
  onRemove?: (i: number) => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const W = win.width;
  const H = win.height;
  const count = sources.length;
  const cur = clamp(index, 0, Math.max(0, count - 1));

  /**
   * ⚠ `useRef(new Animated.Value(1)).current` 로 쓰면 안 된다. 이 값들은 변환에
   *   **렌더에서 쓰이므로** ref 를 렌더 중 읽는 셈이 되고, react-hooks 규칙이 잡는다.
   *   인스턴스만 고정하면 되므로 useMemo 가 맞다.
   */
  const scale = useMemo(() => new Animated.Value(1), []);
  const tx = useMemo(() => new Animated.Value(0), []);
  const ty = useMemo(() => new Animated.Value(0), []);
  /**
   * 장 띠의 가로 위치. -index × 폭.
   *
   * ⚠ 인스턴스는 **하나**만 만들고 값만 바꾼다. 장이 바뀔 때마다 새 Animated.Value 를
   *   만들면, 네이티브 드라이버로 돌던 옛 노드가 뷰에 붙은 채 남아 **카운터는 1/3 인데
   *   띠는 3번째 장에 멈춰 있는** 상태가 났다(시뮬레이터에서 "대표로" 직후 확인).
   */
  const pageX = useMemo(() => new Animated.Value(-cur * W), []); // eslint-disable-line react-hooks/exhaustive-deps

  // 제스처 기준점. 렌더에 쓰이지 않으므로 ref 에 둔다.
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  const state = useRef({ scale: 1, tx: 0, ty: 0 });
  const lastTap = useRef(0);
  /** 넘기는 애니메이션이 도는 동안 새 제스처를 받지 않는다 */
  const flipping = useRef(false);

  const reset = useCallback(() => {
    state.current = { scale: 1, tx: 0, ty: 0 };
    scale.setValue(1);
    tx.setValue(0);
    ty.setValue(0);
  }, [scale, tx, ty]);

  // 부모가 장을 바꾸면(썸네일 줄·"대표로") 그 자리로 — 확대는 푼다.
  // 넘기는 애니메이션이 아직 돌고 있으면 멈추고 자리를 잡는다.
  useEffect(() => {
    pageX.stopAnimation();
    pageX.setValue(-cur * W);
    reset();
  }, [cur, W, pageX, reset]);

  /**
   * 이 제스처에서 무슨 일이 있었는지. 손가락을 다 뗄 때 "가벼운 한 번 두드림" 인지
   * 판정하는 데 쓴다.
   */
  const gesture = useRef({ multi: false, moved: false });

  const flipTo = useCallback(
    (next: number) => {
      const target = clamp(next, 0, count - 1);
      flipping.current = true;
      /**
       * ⚠ 네이티브 드라이버를 쓰지 않는다. 한 번이라도 네이티브로 돌리면 이 값이 네이티브
       *   노드가 되고, 그 뒤의 `setValue`(썸네일 줄에서 장 고르기·"대표로" 직후 첫 장으로)가
       *   화면에 반영되지 않았다 — 카운터는 1/3 인데 띠는 3번째 장에 멈춰 있었다
       *   (시뮬레이터에서 확인, RN 0.86 새 아키텍처). 확대·이동은 어차피 JS 로 돌리므로
       *   여기만 네이티브일 이유도 없다. 180ms 짜리 한 번이라 JS 로도 충분히 매끄럽다.
       */
      Animated.timing(pageX, { toValue: -target * W, duration: 180, useNativeDriver: false }).start(
        () => {
          flipping.current = false;
          if (target !== cur) {
            reset();
            onIndexChange(target);
          }
        },
      );
    },
    [count, cur, W, pageX, reset, onIndexChange],
  );

  const onTouchStart = useCallback((e: GestureResponderEvent) => {
    /**
     * ⚠ 여기서 더블탭을 판정하면 안 된다. `onTouchStart` 는 **손가락마다** 오므로,
     *   두 손가락을 얹는 순간 두 번이 연달아 들어와 더블탭으로 오인된다 —
     *   실제로 "확대해 놓고 다시 잡으면 원래 크기로 돌아간다" 는 증상이 났다.
     *   여기서는 "여러 손가락이 닿았다" 는 사실만 기록하고, 판정은 다 뗄 때 한다.
     */
    if (e.nativeEvent.touches.length > 1) {
      gesture.current.multi = true;
      swipe.current = null;
    }
  }, []);

  const onTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      if (flipping.current) return;
      const touches = e.nativeEvent.touches;

      if (touches.length === 2) {
        gesture.current.multi = true;
        pan.current = null;
        swipe.current = null;
        pageX.setValue(-cur * W); // 핀치 중에 띠가 밀려 있었다면 제자리로
        const d = Math.hypot(
          touches[0].pageX - touches[1].pageX,
          touches[0].pageY - touches[1].pageY,
        );
        // 기준점은 **지금 배율**로 잡는다 — 그래야 확대된 상태에서 이어서 조절된다
        if (!pinch.current) {
          pinch.current = { dist: d, scale: state.current.scale };
          return;
        }
        const next = clamp((d / pinch.current.dist) * pinch.current.scale, MIN_SCALE, MAX_SCALE);
        gesture.current.moved = true;
        state.current.scale = next;
        scale.setValue(next);
        return;
      }

      if (touches.length !== 1) return;
      const p = touches[0];

      // 확대된 상태에서만 사진을 끌어서 움직인다
      if (state.current.scale > 1) {
        pinch.current = null;
        if (!pan.current) {
          pan.current = { x: p.pageX, y: p.pageY, tx: state.current.tx, ty: state.current.ty };
          return;
        }
        const dx = p.pageX - pan.current.x;
        const dy = p.pageY - pan.current.y;
        // 손떨림은 이동으로 치지 않는다 — 그래야 확대 상태에서도 더블탭이 산다
        if (Math.hypot(dx, dy) > TAP_SLOP) gesture.current.moved = true;
        const nx = pan.current.tx + dx;
        const ny = pan.current.ty + dy;
        state.current.tx = nx;
        state.current.ty = ny;
        tx.setValue(nx);
        ty.setValue(ny);
        return;
      }

      // 원래 크기에서 한 손가락 — 옆으로 끌면 장을 넘긴다 (여러 장일 때만)
      if (gesture.current.multi) return; // 두 손가락 중 하나만 뗀 것 — 넘기기로 오인하지 않는다
      if (!swipe.current) {
        swipe.current = { x: p.pageX, y: p.pageY, t: Date.now() };
        return;
      }
      const dx = p.pageX - swipe.current.x;
      if (Math.abs(dx) > TAP_SLOP) gesture.current.moved = true;
      if (count > 1) {
        // 끝 장에서는 저항을 준다 — 더 없다는 것이 손에 느껴지게
        const atEdge = (cur === 0 && dx > 0) || (cur === count - 1 && dx < 0);
        pageX.setValue(-cur * W + (atEdge ? dx * 0.3 : dx));
      }
    },
    [cur, count, W, pageX, scale, tx, ty],
  );

  const onTouchEnd = useCallback(
    (e: GestureResponderEvent) => {
      // 손가락이 하나라도 남아 있으면 제스처가 끝난 게 아니다.
      // (두 손가락 중 하나만 떼고 계속 움직이는 경우가 흔하다)
      pinch.current = null;
      pan.current = null;
      if (e.nativeEvent.touches.length > 0) return;

      const sw = swipe.current;
      swipe.current = null;
      // 한 손가락으로 움직임 없이 톡 친 것만 두드림으로 센다
      const wasTap = !gesture.current.multi && !gesture.current.moved;
      const wasSwipe = !gesture.current.multi && gesture.current.moved && sw && state.current.scale <= 1;
      gesture.current = { multi: false, moved: false };

      if (wasTap) {
        const now = Date.now();
        if (now - lastTap.current < DOUBLE_TAP_MS) {
          reset();
          lastTap.current = 0;
        } else {
          lastTap.current = now;
        }
        return;
      }

      if (wasSwipe && sw) {
        const dx = e.nativeEvent.pageX - sw.x;
        const fast = Date.now() - sw.t < FLICK_MS && Math.abs(dx) > FLICK_PX;
        if (count > 1 && (Math.abs(dx) > W * FLIP_RATIO || fast)) {
          flipTo(cur + (dx < 0 ? 1 : -1));
        } else {
          flipTo(cur); // 제자리로
        }
        return;
      }

      // 원래 크기로 돌아오면 위치도 가운데로 — 안 그러면 빈 여백이 남는다
      if (state.current.scale <= 1.02) reset();
    },
    [count, cur, W, flipTo, reset],
  );

  /**
   * 취소(전화가 오는 등)는 끝난 것과 다르게 다룬다 — `touches` 가 비어 있지 않을 수
   * 있어 위 조기 반환에 걸리면 제스처 상태가 더럽게 남는다. 여기서 통째로 턴다.
   */
  const onTouchCancel = useCallback(() => {
    pinch.current = null;
    pan.current = null;
    swipe.current = null;
    gesture.current = { multi: false, moved: false };
    pageX.setValue(-cur * W);
    if (state.current.scale <= 1.02) reset();
  }, [cur, W, pageX, reset]);

  const [confirming, setConfirming] = useState(false);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={reset}
      statusBarTranslucent
    >
      <View style={st.root}>
        <View
          style={st.stage}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchCancel}
        >
          {/* 장들을 옆으로 늘어놓은 띠. 지금 장에만 확대 변환이 붙는다 */}
          <Animated.View
            style={[st.strip, { width: W * Math.max(1, count), transform: [{ translateX: pageX }] }]}
          >
            {sources.map((source, i) => (
              <Animated.View
                key={`${i}-${source.cacheKey ?? source.uri ?? ''}`}
                style={[
                  { width: W, height: H },
                  i === cur && { transform: [{ translateX: tx }, { translateY: ty }, { scale }] },
                ]}
              >
                <Image
                  source={source}
                  style={st.fill}
                  contentFit="contain"
                  cachePolicy={IMAGE_CACHE_POLICY}
                />
              </Animated.View>
            ))}
          </Animated.View>
        </View>

        <View style={[st.topRow, { top: insets.top + 12 }]} pointerEvents="none">
          {count > 1 ? (
            <View style={st.counter}>
              <Text style={st.counterText}>{t.photo.counter(cur + 1, count)}</Text>
            </View>
          ) : null}
          <Text style={st.hint}>{count > 1 ? t.photo.swipeHint : t.photo.zoomHint}</Text>
        </View>

        <View style={[st.bar, { paddingBottom: insets.bottom + 20 }]}>
          {onChange && (
            <Pressable
              onPress={() => {
                reset();
                onChange();
              }}
              style={st.btn}
              hitSlop={8}
            >
              <Text style={st.btnText}>{t.photo.change}</Text>
            </Pressable>
          )}
          {onAdd && (
            <Pressable
              onPress={() => {
                reset();
                onAdd();
              }}
              style={st.btn}
              hitSlop={8}
            >
              <Text style={st.btnText}>{t.photo.add}</Text>
            </Pressable>
          )}
          {onSetCover && cur > 0 && (
            <Pressable
              onPress={() => {
                reset();
                onSetCover(cur);
              }}
              style={st.btn}
              hitSlop={8}
            >
              <Text style={st.btnText}>{t.photo.setCover}</Text>
            </Pressable>
          )}
          {onRemove && count > 0 && (
            <Pressable
              disabled={confirming}
              onPress={() => {
                /**
                 * ⚠ 반드시 한 번 묻는다. 사진 제거는 **되돌릴 수 없다** —
                 *   DB 행만 지우는 게 아니라 Storage 객체까지 지우고,
                 *   Supabase Storage 에는 휴지통도 버전 관리도 없다.
                 *   확인 없이 두었다가 실수로 눌러 사진을 잃은 일이 실제로 났다.
                 */
                setConfirming(true);
                confirmDestructive({
                  title: t.photo.removeTitle,
                  body: t.photo.removeBody,
                  confirmLabel: t.photo.remove,
                  cancelLabel: t.common.cancel,
                  onConfirm: () => {
                    setConfirming(false);
                    reset();
                    onRemove(cur);
                  },
                  onCancel: () => setConfirming(false),
                });
              }}
              style={st.btn}
              hitSlop={8}
            >
              <Text style={[st.btnText, st.danger]}>{t.photo.remove}</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              reset();
              onClose();
            }}
            style={st.btn}
            hitSlop={8}
          >
            <Text style={st.btnText}>{t.common.close}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: overlay.bg },
  stage: { flex: 1, overflow: 'hidden' },
  strip: { flexDirection: 'row', height: '100%' },
  fill: { width: '100%', height: '100%' },
  topRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: space.sm },
  counter: {
    backgroundColor: overlay.chip,
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  counterText: { color: overlay.fg, fontSize: type.caption, fontWeight: '700', fontVariant: ['tabular-nums'] },
  hint: { color: overlay.faint, fontSize: type.caption },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: space.xl,
    paddingTop: space.xl,
    paddingHorizontal: space.lg,
  },
  btn: { paddingHorizontal: space.md, paddingVertical: space.sm },
  btnText: { color: overlay.fg, fontSize: type.bodyStrong, fontWeight: '600' },
  danger: { color: overlay.danger },
});
