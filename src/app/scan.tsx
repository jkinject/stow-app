import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { parseQrPayload } from '@/features/qr/payload';
import { useT } from '@/lib/i18n';
import { useTheme, type, radius, overlay } from '@/lib/theme';

/**
 * QR 스캔 (AC12 · AC13 · AC14).
 *
 * 읽은 뒤엔 `/c/{token}` 으로 넘긴다 — 카메라로 찍든 다른 스캐너 앱으로 찍든
 * **똑같은 경로를 타게** 하기 위해서다. 해석 로직이 두 벌이면 한쪽만 고쳐지는 일이 생긴다.
 */
export default function Scan() {
  const { c } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  /**
   * ⚠ onBarcodeScanned 는 코드가 화면에 있는 동안 **초당 여러 번** 호출된다.
   *   잠그지 않으면 같은 박스로 라우팅이 수십 번 쌓여 뒤로가기가 먹통이 된다.
   *   화면을 벗어날 때가 아니라 **첫 인식 즉시** 잠근다.
   */
  const locked = useRef(false);
  const [rejected, setRejected] = useState<string | null>(null);

  // M4 에서 겪은 것과 같은 문제 — 권한 부여·복귀 시점에 카메라가 검은 화면으로 남는다
  const [camKey, setCamKey] = useState(0);
  const remountCamera = useCallback(() => setCamKey((k) => k + 1), []);

  useEffect(() => {
    if (!permission?.granted) void requestPermission();
  }, [permission?.granted, requestPermission]);

  // 화면에 돌아올 때마다 잠금을 푼다 — 안 풀면 두 번째 스캔부터 아무 반응이 없다
  useFocusEffect(
    useCallback(() => {
      locked.current = false;
      setRejected(null);
      remountCamera();
    }, [remountCamera]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') remountCamera();
    });
    return () => sub.remove();
  }, [remountCamera]);

  const onScanned = useCallback(
    ({ data }: { data: string }) => {
      if (locked.current) return;
      const parsed = parseQrPayload(data);

      // AC14 — 남의 QR 은 화면을 떠나지 않고 그 자리에서 알려준다.
      // 라우팅까지 갔다 오면 다시 스캔하려고 뒤로가기를 눌러야 해서 번거롭다.
      if (parsed.kind !== 'token') {
        setRejected(
          parsed.kind === 'foreign'
            ? t.scan.notOurs
            : t.scan.damaged,
        );
        return;
      }

      locked.current = true;
      router.replace(`/c/${parsed.token}`);
    },
    [router, t],
  );

  if (!permission) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  if (!permission.granted) {
    return (
      <View style={[st.root, st.pad, { backgroundColor: c.bg, paddingTop: insets.top + 80 }]}>
        <Text style={[st.denyTitle, { color: c.text }]}>{t.camera.permissionNeeded}</Text>
        <Text style={[st.denyHint, { color: c.textMuted }]}>
          {t.camera.permissionBody}
        </Text>
        <View style={st.denyActions}>
          <Button label={t.camera.grantPermission} onPress={() => void requestPermission()} />
          <Button label={t.common.back} onPress={() => router.back()} variant="secondary" />
        </View>
      </View>
    );
  }

  return (
    <View style={[st.root, { backgroundColor: overlay.bg }]}>
      <CameraView
        key={`scan-${permission.granted}-${camKey}`}
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScanned}
      />

      {/* 조준 틀 — 어디에 대야 하는지 알려준다 */}
      <View pointerEvents="none" style={st.overlay}>
        <View style={st.reticle} />
        <Text style={st.guide}>
          {rejected ?? t.scan.guide}
        </Text>
      </View>

      <View style={[st.top, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={14}>
          <Text style={st.close}>← {t.common.close}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const RETICLE = 240;

const st = StyleSheet.create({
  root: { flex: 1 },
  pad: { paddingHorizontal: 24, gap: 10 },
  denyTitle: { fontSize: type.title, fontWeight: '700' },
  denyHint: { fontSize: type.body, lineHeight: 22 },
  denyActions: { gap: 10, marginTop: 24 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticle: {
    width: RETICLE,
    height: RETICLE,
    borderWidth: 2,
    borderColor: overlay.hairline,
    borderRadius: radius.lg,
  },
  guide: {
    marginTop: 20,
    color: overlay.fg,
    fontSize: type.body,
    textAlign: 'center',
    paddingHorizontal: 32,
    textShadowColor: overlay.shadow,
    textShadowRadius: 6,
  },
  top: { position: 'absolute', left: 16, right: 16 },
  close: { color: overlay.fg, fontSize: type.bodyStrong, fontWeight: '600', textShadowColor: overlay.shadow, textShadowRadius: 6 },
});
