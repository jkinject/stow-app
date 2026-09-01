import { Image, type ImageSource } from 'expo-image';
import { useCallback, useMemo, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IMAGE_CACHE_POLICY } from '@/features/item/thumbs';
import { confirmDestructive } from '@/lib/confirm';
import { useT } from '@/lib/i18n';
import { overlay, type, space } from '@/lib/theme';

/**
 * 사진 크게 보기.
 *
 * 물건 상세와 박스 상세가 **같은 것을 쓴다.** 전에는 박스에만 있었고 물건은 사진을
 * 누르면 곧장 카메라가 떴다 — 누르는 의도는 "크게 보고 싶다" 인데 "바꾸겠다" 로
 * 받아들여졌다(사용자 보고). 바꾸기는 여기 아래 줄에 둔다.
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
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function PhotoViewer({
  visible,
  source,
  onClose,
  onChange,
  onRemove,
}: {
  visible: boolean;
  source: ImageSource | null | undefined;
  onClose: () => void;
  /** "사진 바꾸기" — 누르면 뷰어를 닫고 카메라로 간다 */
  onChange: () => void;
  /** 넘기면 "사진 제거" 가 함께 뜬다 */
  onRemove?: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();

  /**
   * ⚠ `useRef(new Animated.Value(1)).current` 로 쓰면 안 된다. 이 값들은 변환에
   *   **렌더에서 쓰이므로** ref 를 렌더 중 읽는 셈이 되고, react-hooks 규칙이 잡는다.
   *   인스턴스만 고정하면 되므로 useMemo 가 맞다.
   */
  const scale = useMemo(() => new Animated.Value(1), []);
  const tx = useMemo(() => new Animated.Value(0), []);
  const ty = useMemo(() => new Animated.Value(0), []);

  // 제스처 기준점. 렌더에 쓰이지 않으므로 ref 에 둔다.
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const cur = useRef({ scale: 1, tx: 0, ty: 0 });
  const lastTap = useRef(0);

  const reset = useCallback(() => {
    cur.current = { scale: 1, tx: 0, ty: 0 };
    scale.setValue(1);
    tx.setValue(0);
    ty.setValue(0);
  }, [scale, tx, ty]);

  /**
   * 이 제스처에서 무슨 일이 있었는지. 손가락을 다 뗄 때 "가벼운 한 번 두드림" 인지
   * 판정하는 데 쓴다.
   */
  const gesture = useRef({ multi: false, moved: false });

  const onTouchStart = useCallback((e: GestureResponderEvent) => {
    /**
     * ⚠ 여기서 더블탭을 판정하면 안 된다. `onTouchStart` 는 **손가락마다** 오므로,
     *   두 손가락을 얹는 순간 두 번이 연달아 들어와 더블탭으로 오인된다 —
     *   실제로 "확대해 놓고 다시 잡으면 원래 크기로 돌아간다" 는 증상이 났다.
     *   여기서는 "여러 손가락이 닿았다" 는 사실만 기록하고, 판정은 다 뗄 때 한다.
     */
    if (e.nativeEvent.touches.length > 1) gesture.current.multi = true;
  }, []);

  const onTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      const touches = e.nativeEvent.touches;

      if (touches.length === 2) {
        gesture.current.multi = true;
        pan.current = null;
        const d = Math.hypot(
          touches[0].pageX - touches[1].pageX,
          touches[0].pageY - touches[1].pageY,
        );
        // 기준점은 **지금 배율**로 잡는다 — 그래야 확대된 상태에서 이어서 조절된다
        if (!pinch.current) {
          pinch.current = { dist: d, scale: cur.current.scale };
          return;
        }
        const next = clamp((d / pinch.current.dist) * pinch.current.scale, MIN_SCALE, MAX_SCALE);
        gesture.current.moved = true;
        cur.current.scale = next;
        scale.setValue(next);
        return;
      }

      // 확대된 상태에서만 끌어서 움직인다 — 원래 크기에서 움직이면 사진이 화면 밖으로 나간다
      if (touches.length === 1 && cur.current.scale > 1) {
        pinch.current = null;
        const p = touches[0];
        if (!pan.current) {
          pan.current = { x: p.pageX, y: p.pageY, tx: cur.current.tx, ty: cur.current.ty };
          return;
        }
        const dx = p.pageX - pan.current.x;
        const dy = p.pageY - pan.current.y;
        // 손떨림은 이동으로 치지 않는다 — 그래야 확대 상태에서도 더블탭이 산다
        if (Math.hypot(dx, dy) > TAP_SLOP) gesture.current.moved = true;
        const nx = pan.current.tx + dx;
        const ny = pan.current.ty + dy;
        cur.current.tx = nx;
        cur.current.ty = ny;
        tx.setValue(nx);
        ty.setValue(ny);
      }
    },
    [scale, tx, ty],
  );

  const onTouchEnd = useCallback(
    (e: GestureResponderEvent) => {
      // 손가락이 하나라도 남아 있으면 제스처가 끝난 게 아니다.
      // (두 손가락 중 하나만 떼고 계속 움직이는 경우가 흔하다)
      pinch.current = null;
      pan.current = null;
      if (e.nativeEvent.touches.length > 0) return;

      // 한 손가락으로 움직임 없이 톡 친 것만 두드림으로 센다
      const wasTap = !gesture.current.multi && !gesture.current.moved;
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

      // 원래 크기로 돌아오면 위치도 가운데로 — 안 그러면 빈 여백이 남는다
      if (cur.current.scale <= 1.02) reset();
    },
    [reset],
  );

  /**
   * 취소(전화가 오는 등)는 끝난 것과 다르게 다룬다 — `touches` 가 비어 있지 않을 수
   * 있어 위 조기 반환에 걸리면 제스처 상태가 더럽게 남는다. 여기서 통째로 턴다.
   */
  const onTouchCancel = useCallback(() => {
    pinch.current = null;
    pan.current = null;
    gesture.current = { multi: false, moved: false };
    if (cur.current.scale <= 1.02) reset();
  }, [reset]);

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
          {source && (
            <Animated.View
              style={[
                st.fill,
                { transform: [{ translateX: tx }, { translateY: ty }, { scale }] },
              ]}
            >
              <Image
                source={source}
                style={st.fill}
                contentFit="contain"
                cachePolicy={IMAGE_CACHE_POLICY}
              />
            </Animated.View>
          )}
        </View>

        <Text style={[st.hint, { top: insets.top + 12 }]}>{t.photo.zoomHint}</Text>

        <View style={[st.bar, { paddingBottom: insets.bottom + 20 }]}>
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
          {onRemove && (
            <Pressable
              onPress={() => {
                /**
                 * ⚠ 반드시 한 번 묻는다. 사진 제거는 **되돌릴 수 없다** —
                 *   DB 컬럼만 비우는 게 아니라 Storage 객체까지 지우고,
                 *   Supabase Storage 에는 휴지통도 버전 관리도 없다.
                 *   확인 없이 두었다가 실수로 눌러 사진을 잃은 일이 실제로 났다.
                 */
                confirmDestructive({
                  title: t.photo.removeTitle,
                  body: t.photo.removeBody,
                  confirmLabel: t.photo.remove,
                  cancelLabel: t.common.cancel,
                  onConfirm: () => {
                    reset();
                    onRemove();
                  },
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
  fill: { width: '100%', height: '100%' },
  hint: { position: 'absolute', alignSelf: 'center', color: overlay.faint, fontSize: type.caption },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.xxxl,
    paddingTop: space.xl,
  },
  btn: { paddingHorizontal: space.md, paddingVertical: space.sm },
  btnText: { color: overlay.fg, fontSize: type.bodyStrong, fontWeight: '600' },
  danger: { color: overlay.danger },
});
