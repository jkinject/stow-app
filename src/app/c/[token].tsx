import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Loading, Screen } from '@/components/ui';
import { parseQrPayload } from '@/features/qr/payload';
import { useContainerByToken } from '@/features/storage/api';
import { useT } from '@/lib/i18n';
import { useTheme, type } from '@/lib/theme';

/**
 * QR 딥링크 착지점 — `stow://c/{token}` (AC12 · AC14).
 *
 * 스캐너 앱으로 찍든 우리 앱의 스캔 화면으로 찍든 결국 여기로 온다.
 * 여기서 토큰을 박스로 바꿔 상세로 넘긴다.
 *
 * ⚠ 여기서 `replace` 를 쓴다. `push` 를 쓰면 상세에서 뒤로가기를 눌렀을 때
 *   이 중간 화면으로 돌아와 다시 상세로 튕겨나가는 무한 루프가 된다.
 */
export default function QrLanding() {
  const { token: raw } = useLocalSearchParams<{ token: string }>();
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();

  const parsed = parseQrPayload(String(raw ?? ''));
  const token = parsed.kind === 'token' ? parsed.token : null;

  const container = useContainerByToken(token);
  // ⚠ useRef(Date.now()) 는 렌더 중에 불순 함수를 부르는 것이라 react-hooks/purity 가 막는다.
  //   측정 시작점은 마운트 이펙트로 옮긴다 — 렌더 직후라 오차는 1프레임 안쪽이다.
  const startedAt = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const jumped = useRef(false);

  useEffect(() => {
    startedAt.current ??= Date.now();
  }, []);

  useEffect(() => {
    if (jumped.current || !container.data) return;
    jumped.current = true;
    // AC12 — 스캔부터 내용물이 보이기까지 2초. 개발 빌드에서만 실측을 남긴다.
    const ms = Date.now() - (startedAt.current ?? Date.now());
    setElapsed(ms);
    if (__DEV__) console.log(`[qr] 토큰 해석 ${ms}ms → ${container.data.name}`);
    router.replace(`/container/${container.data.id}`);
  }, [container.data, router]);

  if (parsed.kind !== 'token') {
    return (
      <Fail
        title={parsed.kind === 'foreign' ? t.scan.notOurs : t.scan.unreadable}
        hint={
          parsed.kind === 'foreign'
            ? t.scan.foreignHint
            : t.scan.damagedHint
        }
      />
    );
  }

  if (container.isLoading) {
    return (
      <Screen back title={t.scan.findingBox}>
        <Loading />
      </Screen>
    );
  }

  if (container.error) {
    return (
      <Fail
        title={t.scan.loadFailed}
        hint={t.scan.loadFailedHint}
        onRetry={() => container.refetch()}
      />
    );
  }

  // 0행 — 지운 박스이거나, 우리 가구 것이 아니거나(RLS), 아직 안 만든 라벨이다.
  // 어느 쪽인지는 알 수 없고, 알려줘서도 안 된다. 남의 가구에 그 박스가 있는지를
  // 알려주면 그 자체가 정보 유출이다 (AC27).
  if (!container.data) {
    return (
      <Fail
        title={t.scan.unregistered}
        hint={t.scan.unregisteredHint}
      />
    );
  }

  return (
    <Screen back title={t.scan.opening}>
      <View style={st.center}>
        <Text style={[st.name, { color: c.text }]}>{container.data.name}</Text>
        {elapsed !== null && __DEV__ && (
          <Text style={[st.ms, { color: c.textFaint }]}>{elapsed}ms</Text>
        )}
      </View>
    </Screen>
  );
}

function Fail({ title, hint, onRetry }: { title: string; hint: string; onRetry?: () => void }) {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  return (
    <Screen back title="QR">
      <View style={st.center}>
        <Text style={[st.failTitle, { color: c.text }]}>{title}</Text>
        <Text style={[st.failHint, { color: c.textMuted }]}>{hint}</Text>
        <View style={st.actions}>
          {onRetry && <Button label={t.common.retry} onPress={onRetry} />}
          <Button label={t.scan.scanAgain} onPress={() => router.replace('/scan')} variant="secondary" />
          <Button label={t.common.home} onPress={() => router.replace('/')} variant="secondary" />
        </View>
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  center: { paddingHorizontal: 24, paddingTop: 60, alignItems: 'center', gap: 10 },
  name: { fontSize: type.title, fontWeight: '700' },
  ms: { fontSize: type.caption, fontVariant: ['tabular-nums'] },
  failTitle: { fontSize: type.title, fontWeight: '700', textAlign: 'center' },
  failHint: { fontSize: type.body, lineHeight: 22, textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 24 },
});
