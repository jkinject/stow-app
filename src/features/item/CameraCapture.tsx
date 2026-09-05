import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { confirmDestructive } from '@/lib/confirm';
import { IconChevron, IconImage, IconTrash, IconX } from '@/components/Icon';
import { useT } from '@/lib/i18n';
import { overlay, radius, type, space } from '@/lib/theme';

import { useCameraZoom, ZoomBar } from './CameraZoom';
import { PHOTO_ASPECT, PHOTO_ASPECT_PAIR } from './photo';

/**
 * 사진 촬영 화면 — **등록과 "사진 바꾸기" 가 같은 것을 쓴다.**
 *
 * ⚠ 전에는 두 벌이었다(등록 화면의 CameraStep, PhotoSheet). 그 결과 등록 쪽만
 *   개선되고 사진 바꾸기는 옛 UI 로 남아 실제로 갈라졌다(사용자 보고).
 *   화면이 둘이면 다음 개선도 한쪽만 받는다 — 그래서 하나로 합친다.
 *
 * 여기 담긴 함정들은 전부 실기기에서 겪은 것이다:
 *   · 미리보기를 **정사각**으로 띄운다. 전체화면이면 찍히는 범위와 어긋난다 —
 *     미리보기는 센서 4:3 의 좌우를 잘라 보여주는데 촬영은 4:3 전체를 돌려준다.
 *   · 시트를 닫고 다시 열면 카메라가 검은 화면으로 남는다. 안드로이드는 카메라
 *     클라이언트를 하나만 허용하고, 앞 화면이 **약 6초 뒤에야** 놓아준다(logcat 확인).
 *     `onCameraReady` 전에는 셔터를 렌더하지 않고, 1.5초 간격으로 다시 붙인다.
 *   · 촬영 결과는 **처리하지 않고 원본 uri 만** 넘긴다. preparePhoto 를 기다리면
 *     셔터를 눌러도 화면이 곧바로 안 넘어가는 지연이 생긴다.
 */

/** 실측: 앞 화면의 카메라가 놓이기까지 6초쯤 걸린다. 1.5초 × 6 = 9초까지 기다린다 */
const MAX_ATTACH_ATTEMPTS = 6;

export function CameraCapture({
  /** 상단 가운데 문구 — 등록에서는 목적지 경로, 사진 바꾸기에서는 물건 이름 */
  title,
  /** 셔터·사진첩이 돌려주는 것은 **원본 uri** 다. 처리는 부르는 쪽에서 한다 */
  onPhoto,
  onClose,
  /** 사진 없이 넘어가기 — 등록에서만 쓴다 (AC3) */
  onSkip,
  /** 기존 사진을 지우기 — 사진 바꾸기에서만 쓴다 */
  onRemove,
  busy = false,
}: {
  title?: string;
  onPhoto: (rawUri: string) => void;
  onClose: () => void;
  onSkip?: () => void;
  onRemove?: () => void;
  busy?: boolean;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const zoomer = useCameraZoom();

  const [shooting, setShooting] = useState(false);
  const [camKey, setCamKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const remount = useCallback(() => {
    setReady(false);
    setCamKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!permission?.granted) void requestPermission();
  }, [permission?.granted, requestPermission]);

  useFocusEffect(remount);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') remount();
    });
    return () => sub.remove();
  }, [remount]);

  // 앞 화면의 카메라가 놓일 때까지 기다리며 다시 붙인다. 무한 재시도는 오히려 나쁘다.
  useEffect(() => {
    if (ready || attempts >= MAX_ATTACH_ATTEMPTS || !permission?.granted) return;
    const timer = setTimeout(() => {
      setAttempts((n) => n + 1);
      setCamKey((k) => k + 1);
    }, 1500);
    return () => clearTimeout(timer);
  }, [ready, attempts, permission?.granted]);

  async function shoot() {
    if (shooting || !cameraRef.current || !ready) return;
    setShooting(true);
    try {
      const shot = await cameraRef.current.takePictureAsync({
        quality: 1,
        shutterSound: false, // 연속으로 쓰는 화면이라 소리가 거슬린다
        skipProcessing: false, // 방향이 반영된 이미지를 받아야 한다
      });
      if (shot?.uri) onPhoto(shot.uri);
    } catch (e) {
      // 조용히 삼키면 셔터를 눌러도 아무 일이 없는 것처럼 보이고,
      // 그대로 두면 잡히지 않은 promise 오류가 된다.
      setReady(false);
      setAttempts(0);
      setCamKey((k) => k + 1);
      Alert.alert(t.camera.captureFailed, t.camera.captureFailedBody);
      if (__DEV__) console.warn('[camera] 촬영 실패', e);
    } finally {
      setShooting(false);
    }
  }

  async function fromGallery() {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsMultipleSelection: false,
        /**
         * 어디를 남길지는 사용자가 고른다 — 중앙을 기계적으로 자르면 물건이 잘려 나간다.
         *
         * ⚠ 비율은 반드시 `PHOTO_ASPECT` 와 같아야 한다. 카메라는 3:4 로 찍는데 여기만
         *   1:1 이면, 사진첩에서 가져온 것만 격자에서 다르게 잘려 보인다.
         *   실제로 그랬다 — 카메라 비율만 바꾸고 이 줄을 놓쳤다(사용자 보고).
         *
         * 카메라와 달리 **자르기 화면을 거치는 이유**: 사진첩에는 파노라마도 가로
         *   사진도 있다. 안 자르고 두면 격자가 표시할 때 제멋대로 잘라내고,
         *   그건 사용자가 고른 구도가 아니다. 한 번 직접 정하게 한다.
         */
        allowsEditing: true,
        aspect: [PHOTO_ASPECT_PAIR[0], PHOTO_ASPECT_PAIR[1]],
      });
      if (!res.canceled && res.assets[0]?.uri) onPhoto(res.assets[0].uri);
    } catch (e) {
      Alert.alert(t.camera.captureFailed, e instanceof Error ? e.message : t.common.tryAgain);
    }
  }

  /**
   * 미리보기 상자가 **곧 찍히는 범위**다. 저장 비율과 반드시 같아야 한다 —
   * 다르면 "프레임에 담았는데 잘려 나왔다" 가 된다(예전에 실제로 겪었다).
   *
   * 3:4 는 센서 원본 비율이라 위아래를 도려낼 일이 없다. 화면이 허락하는 만큼
   * 크게 잡되, 아래 버튼 줄을 가리지 않도록 높이를 78% 로 제한한다.
   */
  const frameW = Math.min(win.width, win.height * 0.78 * PHOTO_ASPECT);
  const frameH = frameW / PHOTO_ASPECT;

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.stage}>
        {permission?.granted ? (
          <View style={[st.frame, { width: frameW, height: frameH }]} {...zoomer.pinchHandlers}>
            <CameraView
              key={`cap-${permission.granted}-${camKey}`}
              ref={cameraRef}
              style={st.fill}
              facing="back"
              zoom={zoomer.zoom}
              onCameraReady={() => setReady(true)}
            />
            {!ready && (
              <View style={st.waiting}>
                {attempts < MAX_ATTACH_ATTEMPTS ? (
                  <>
                    <ActivityIndicator color={overlay.fg} />
                    <Text style={st.waitingText}>{t.camera.preparing}</Text>
                  </>
                ) : (
                  <Pressable onPress={remount} style={st.retry}>
                    <Text style={st.retryText}>{t.camera.restart}</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        ) : (
          <View style={[st.frame, st.center, { width: frameW, height: frameH }]}>
            <Text style={st.hint}>{t.camera.permissionNeeded}</Text>
          </View>
        )}
      </View>

      <View style={[st.top, { paddingTop: insets.top + 6 }]}>
        <Pressable
          onPress={onClose}
          hitSlop={14}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t.common.close}
          style={st.actionSpacer}
        >
          <IconX size={24} color={overlay.fg} />
        </Pressable>
        <Text style={st.title} numberOfLines={1}>
          {title ?? ''}
        </Text>
        <View style={st.actionSpacer} />
      </View>

      <View style={[st.zoom, { top: insets.top + 56 }]}>
        {permission?.granted && ready && (
          <ZoomBar
            zoom={zoomer.zoom}
            onIn={zoomer.stepIn}
            onOut={zoomer.stepOut}
            onReset={zoomer.reset}
          />
        )}
      </View>

      <View style={[st.bottom, { paddingBottom: insets.bottom + 22 }]}>
        <Pressable onPress={() => void fromGallery()} style={st.side} hitSlop={10} disabled={busy}>
          <IconImage size={26} color={overlay.fg} />
          <Text style={st.sideLabel}>{t.addFlow.fromGallery}</Text>
        </Pressable>

        <Pressable
          onPress={() => void shoot()}
          disabled={shooting || busy || !ready}
          style={[st.shutter, (shooting || busy || !ready) && { opacity: 0.4 }]}
        >
          {shooting || busy ? (
            <ActivityIndicator color={overlay.fg} />
          ) : (
            <View style={st.shutterInner} />
          )}
        </Pressable>

        {/* 오른쪽 자리는 화면에 따라 다르다: 등록이면 "사진 없이", 교체면 "사진 제거" */}
        {onSkip ? (
          <Pressable onPress={onSkip} style={st.side} hitSlop={10} disabled={busy}>
            <IconChevron size={26} color={overlay.fg} />
            <Text style={st.sideLabel}>{t.addFlow.skipPhoto}</Text>
          </Pressable>
        ) : onRemove ? (
          <Pressable
            /* 되돌릴 수 없다 — 뷰어와 **같은 확인창**을 쓴다 */
            onPress={() =>
              confirmDestructive({
                title: t.photo.removeTitle,
                body: t.photo.removeBody,
                confirmLabel: t.photo.remove,
                cancelLabel: t.common.cancel,
                onConfirm: onRemove,
              })
            }
            style={st.side}
            hitSlop={10}
            disabled={busy}
          >
            <IconTrash size={26} color={overlay.fg} />
            <Text style={st.sideLabel}>{t.camera.removePhoto}</Text>
          </Pressable>
        ) : (
          <View style={st.side} />
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: overlay.bg },
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { overflow: 'hidden', borderRadius: radius.xs },
  waiting: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  waitingText: { color: overlay.fg, fontSize: type.small },
  retry: {
    borderWidth: 1,
    borderColor: overlay.hairline,
    borderRadius: radius.sm,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
  retryText: { color: overlay.fg, fontSize: type.label, fontWeight: '600' },
  top: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  actionSpacer: { width: 40 },
  title: {
    flex: 1,
    color: overlay.fg,
    fontSize: type.small,
    textAlign: 'center',
    textShadowColor: overlay.shadow,
    textShadowRadius: 6,
  },
  hint: { color: overlay.faint, fontSize: type.body },
  zoom: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: space.xl,
  },
  side: { alignItems: 'center', gap: space.xs, width: 76 },
  sideLabel: { color: overlay.faint, fontSize: type.caption },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: overlay.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: overlay.fg },
});
