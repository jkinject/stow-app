import type { Session } from '@supabase/supabase-js';
import * as AuthSession from 'expo-auth-session';
import { getQueryParams } from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * 인증 방식 (계획 §4.10)
 *  - Google Sign-In : 주력 경로
 *  - 이메일 매직링크 : 폴백 및 로컬 테스트용 (네이티브 설정이 필요 없다)
 *
 * ⚠ Sign in with Apple 은 사용자 결정으로 연기됐다 (2026-08-28).
 *   Apple 심사 가이드라인 4.8 은 소셜 로그인을 쓰는 앱에 "이메일을 비공개로
 *   유지할 수 있는 동등한 대안"을 요구하는데, 매직링크는 링크를 보내야 하므로
 *   그 조건을 채우지 못한다. 따라서 **이 상태로는 iOS 스토어 제출이 반려된다.**
 *   개발·Android 배포에는 지장이 없다. M9 에서 반드시 추가할 것 (R24).
 */

type AuthState = {
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  sendMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * OAuth 왕복 사이에 초대 코드를 보존한다 (R23).
 * 초대 링크로 들어온 비회원의 흐름은 `코드 → 구글 로그인(외부 왕복) → accept_invite` 인데,
 * 리다이렉트 사이에 코드가 유실되면 **가입은 됐는데 가구에 못 들어간다.**
 * 모듈 스코프에 두어 브라우저 왕복 동안 살아남게 하고, 실패해도 온보딩에서
 * 다시 입력할 수 있는 경로를 남긴다.
 */
let pendingInviteCode: string | null = null;
export const setPendingInviteCode = (code: string | null) => {
  pendingInviteCode = code;
};
export const takePendingInviteCode = () => {
  const c = pendingInviteCode;
  pendingInviteCode = null;
  return c;
};

/** `stow://auth-callback` — app.json 의 scheme 과 일치해야 한다 */
const redirectTo = AuthSession.makeRedirectUri({ path: 'auth-callback' });

/**
 * OAuth 콜백 URL 을 세션으로 바꾼다.
 *
 * ⚠ **URL 에서 토큰을 꺼내 쓰지 않는다.** 예전에는 그렇게 했다 —
 *   `#access_token=…&refresh_token=…` 을 파싱해 `setSession()` 에 넣었다.
 *   supabase-js 기본값이 implicit 흐름이라 정말 그렇게 돌아왔기 때문이다.
 *   문제는 안드로이드에서 `stow://` 같은 커스텀 스킴은 아무 앱이나
 *   같이 선언할 수 있다는 것이다. 리다이렉트가 가로채이면 리프레시 토큰이
 *   통째로 넘어가고, 그건 되돌릴 수 없는 계정 탈취다.
 *
 *   지금은 PKCE 라(`lib/supabase.ts` 의 `flowType`) URL 에 `?code=` 만 온다.
 *   이 코드는 **이 앱 저장소에만 있는** code_verifier 와 짝이 맞아야 세션이
 *   되므로, 링크를 가로채도 상대가 할 수 있는 일이 없다.
 *
 * 토큰 경로를 남겨 두면 안 된다 — 남겨 두는 순간 공격자가 굳이 PKCE 를 거칠
 * 이유가 없어져서 방어가 통째로 무의미해진다(다운그레이드 공격).
 */
async function createSessionFromUrl(url: string) {
  const { params, errorCode } = getQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  const { code } = params;
  if (!code) return null;

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return data.session;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted.current) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted.current) return;
      setSession(next);
    });

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      loading,

      async signInWithGoogle() {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            skipBrowserRedirect: true,
            queryParams: { prompt: 'select_account' },
          },
        });
        if (error) throw error;
        if (!data.url) throw new Error('구글 로그인 주소를 받지 못했습니다.');

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type !== 'success') {
          // 사용자가 취소한 경우 — 조용히 돌아간다
          return;
        }
        await createSessionFromUrl(result.url);
      },

      async sendMagicLink(email: string) {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
      },

      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 는 AuthProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}

export { createSessionFromUrl, redirectTo };
