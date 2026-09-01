import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { type, radius, overlay, space } from '@/lib/theme';
import { useT } from '@/lib/i18n';

/**
 * 카메라 줌 (사용자 요청 2026-08-30 — "창고라 멀리 있는 물건도 찍어야 한다").
 *
 * ⚠ 안드로이드에서는 **줌인만** 된다. `CameraView` 의 `zoom` 은 0~1 로,
 *   현재 렌즈의 **디지털 줌 비율**이다. 초광각 렌즈로 바꾸는 `selectedLens` 는
 *   expo-camera 에서 **iOS 전용**이라 안드로이드에는 광각 전환 경로가 없다.
 *   0 이 이미 기본 화각이고 그보다 넓게는 못 간다.
 *
 * ⚠ 제스처를 react-native-gesture-handler 로 하지 않았다. 이 앱에는
 *   `GestureHandlerRootView` 가 없어서 제스처가 **조용히 동작하지 않는다.**
 *   RN 기본 터치 이벤트로 두 손가락 거리를 직접 재면 그 위험이 없다.
 */

const STEP = 0.1;
const clamp = (v: number) => Math.min(1, Math.max(0, v));

export function useCameraZoom() {
  const [zoom, setZoom] = useState(0);
  // 핀치 시작 시점의 손가락 간격과 그때의 줌. 이걸 기준으로 상대 변화를 계산한다.
  const start = useRef<{ dist: number; zoom: number } | null>(null);

  const onTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      const t = e.nativeEvent.touches;
      if (t.length !== 2) {
        start.current = null;
        return;
      }
      const dist = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
      if (!start.current) {
        start.current = { dist, zoom };
        return;
      }
      // 손가락을 2배로 벌리면 줌이 0.5 오른다. 화면 크기와 무관하게 일관되도록 비율로 잡는다.
      const ratio = dist / start.current.dist;
      setZoom(clamp(start.current.zoom + (ratio - 1) * 0.5));
    },
    [zoom],
  );

  const onTouchEnd = useCallback(() => {
    start.current = null;
  }, []);

  return {
    zoom,
    /** CameraView 를 감싸는 View 에 그대로 펼쳐 넣는다 */
    pinchHandlers: { onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
    stepIn: useCallback(() => setZoom((z) => clamp(z + STEP)), []),
    stepOut: useCallback(() => setZoom((z) => clamp(z - STEP)), []),
    reset: useCallback(() => setZoom(0), []),
  };
}

/**
 * 줌 조절 막대.
 * 핀치만 두면 "줌이 되는지" 자체를 알 수 없어서 버튼을 함께 낸다.
 * 숫자는 배율이 아니라 **기기 최대 줌 대비 비율**이다 — 최대 배율은 기기마다 달라
 * "2배" 라고 쓰면 거짓말이 된다.
 */
export function ZoomBar({
  zoom,
  onIn,
  onOut,
  onReset,
}: {
  zoom: number;
  onIn: () => void;
  onOut: () => void;
  onReset: () => void;
}) {
  const t = useT();
  return (
    <View style={st.bar} pointerEvents="box-none">
      <Pressable onPress={onOut} disabled={zoom <= 0} style={[st.btn, zoom <= 0 && st.off]}>
        <Text style={st.btnText}>−</Text>
      </Pressable>
      <Pressable onPress={onReset} style={st.level}>
        <Text style={st.levelText}>
          {zoom === 0 ? t.camera.zoomNone : t.camera.zoomLevel(Math.round(zoom * 100))}
        </Text>
      </Pressable>
      <Pressable onPress={onIn} disabled={zoom >= 1} style={[st.btn, zoom >= 1 && st.off]}>
        <Text style={st.btnText}>+</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: overlay.scrim,
    borderRadius: radius.full,
    padding: space.xs,
  },
  btn: {
    width: 38,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  off: { opacity: 0.35 },
  btnText: { color: overlay.fg, fontSize: type.title, fontWeight: '700', lineHeight: 24 },
  level: { paddingHorizontal: space.md, minWidth: 76, alignItems: 'center' },
  levelText: { color: overlay.fg, fontSize: type.caption, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
