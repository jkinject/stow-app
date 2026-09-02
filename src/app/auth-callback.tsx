import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { createSessionFromUrl } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useTheme, type, space, leading } from '@/lib/theme';

/**
 * OAuth / 매직링크 콜백 착지점.
 *
 * ⚠ 이 화면은 오랫동안 **아무 일도 하지 않았다.** 1.2초 기다렸다가 홈으로
 *   보내는 게 전부였고, 주석에는 "세션 수립은 auth.tsx 가 처리한다" 고 적혀
 *   있었다. 그 말은 **구글 로그인에만** 맞는 말이다 — 구글은
 *   `openAuthSessionAsync` 가 결과 URL 을 함수 반환값으로 돌려주니까.
 *
 *   매직링크는 다르다. 메일 속 링크는 **외부 브라우저**에서 열려 앱을 딥링크로
 *   깨우므로, 돌아온 URL 을 받아 줄 사람이 이 화면밖에 없다. 그런데 아무도 안
 *   받았으니 매직링크 로그인은 처음부터 완성된 적이 없다. 로그인 화면까지
 *   만들어 놓고 마지막 한 칸이 비어 있었다(2026-09-01 보안 점검 중 발견).
 *
 * PKCE 로 바꾸면서 이 구멍이 더 중요해졌다: 이제 URL 에 `?code=` 만 오고,
 * 그걸 세션으로 바꾸는 일은 **반드시 앱 안에서** 일어나야 한다.
 */
export default function AuthCallback() {
  const router = useRouter();
  const { c } = useTheme();
  const t = useT();
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();

  const [failed, setFailed] = useState(false);
  /** ⚠ 코드는 **한 번만** 쓸 수 있다. 리렌더로 두 번 교환하면 두 번째가 실패한다 */
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    void (async () => {
      const code = typeof params.code === 'string' ? params.code : undefined;

      // 코드가 없으면 구글 경로(auth.tsx 가 이미 세션을 세웠다)이거나 취소다.
      // 어느 쪽이든 가드(_layout)가 세션 상태를 보고 알아서 보낸다.
      if (!code) {
        router.replace('/');
        return;
      }

      try {
        await createSessionFromUrl(`stow://auth-callback?code=${encodeURIComponent(code)}`);
        router.replace('/');
      } catch {
        // 만료·재사용된 링크가 대부분이다. 홈으로 튕기면 왜 안 됐는지 알 수 없으니
        // 이 화면에서 이유를 보여 주고 로그인 화면으로 돌려보낸다.
        setFailed(true);
        // ⚠ 2.5초였다. 두 줄짜리 안내를 읽기엔 짧아서, 사용자는 **화면이 그냥
        //   로그인으로 돌아갔다**고만 느낀다(실사용 보고 2026-09-01).
        setTimeout(() => router.replace('/sign-in'), 5000);
      }
    })();
  }, [params.code, router]);

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      {failed ? (
        <View style={s.failBox}>
          <Text style={[s.text, s.failed, { color: c.danger }]}>{t.auth.linkFailed}</Text>
          {/* 무엇을 하면 되는지까지 적는다 — 원인만 말하면 사용자는 멈춘다 */}
          <Text style={[s.text, s.failed, { color: c.textMuted }]}>{t.auth.linkFailedHint}</Text>
        </View>
      ) : (
        <>
          <ActivityIndicator color={c.accent} />
          <Text style={[s.text, { color: c.textMuted }]}>{t.auth.signingIn}</Text>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, paddingHorizontal: space.huge },
  text: { fontSize: type.body },
  failed: { textAlign: 'center', lineHeight: leading.body },
  failBox: { gap: space.md },
});
