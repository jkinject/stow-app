import type { Session } from '@supabase/supabase-js';
import * as AuthSession from 'expo-auth-session';
import { getQueryParams } from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useT } from './i18n';
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
  /** 이메일 + 비밀번호 로그인 */
  signInWithPassword: (email: string, password: string) => Promise<void>;
  /**
   * 이메일 + 비밀번호 가입.
   * @returns 메일 인증이 필요하면 true — 화면이 "메일함을 확인하세요" 로 바뀐다.
   */
  signUpWithPassword: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

/**
 * Supabase 가 돌려주는 오류 문구는 영어다. 사용자에게 그대로 보여주면 안 된다.
 *
 * ⚠ `Invalid login credentials` 는 **"비밀번호가 틀렸다" 와 "그런 계정이 없다" 를
 *   구분하지 않는다.** 일부러 그렇게 설계돼 있다 — 구분해 주면 남의 이메일이
 *   가입돼 있는지 캐낼 수 있기 때문이다. 그러니 우리 문구도 구분하면 안 된다.
 */
function authMessage(raw: string, t: ReturnType<typeof useT>): string {
  const m = raw.toLowerCase();
  if (m.includes('invalid login credentials')) return t.auth.badCredentials;
  if (m.includes('email not confirmed')) return t.auth.notConfirmed;
  if (m.includes('already registered') || m.includes('already been registered'))
    return t.auth.alreadyRegistered;
  if (m.includes('password') && m.includes('characters')) return t.auth.passwordTooShort;
  if (m.includes('rate limit') || m.includes('too many')) return t.auth.tooMany;
  return raw;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * ⚠ 여기 있던 `setPendingInviteCode` / `takePendingInviteCode` 를 지웠다 (2026-09-02).
 *
 *   "초대 링크로 들어온 비회원 → 로그인 왕복 → accept_invite" 흐름을 위해 만들었는데,
 *   **초대 링크라는 것이 없다.** 초대는 코드를 복사해 손으로 입력하는 방식뿐이고
 *   (app/family.tsx), 코드를 URL 에서 읽는 라우트도 없다. 그래서 `set...` 을 부르는
 *   곳이 어디에도 없었고, 온보딩의 `take...` 는 **언제나 null 을 받았다.**
 *
 *   있지도 않은 흐름을 위한 코드가 남아 있으면, 다음 사람이 "초대 링크가 되는구나"
 *   하고 그 위에 무언가를 얹는다. 초대 링크를 만들 때 다시 넣으면 된다.
 */

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

      async signInWithPassword(email: string, password: string) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      },

      async signUpWithPassword(email: string, password: string) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          // 인증 메일의 링크도 앱으로 떨어져야 한다
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        /**
         * ⚠ 운영에서는 `enable_confirmations = true` 라 **세션이 바로 나오지 않는다.**
         *   남의 이메일로 가입하는 것을 막으려고 켜 둔 설정이다.
         *   세션이 없으면 "메일함을 확인하세요" 로 안내해야 한다 — 이걸 빠뜨리면
         *   가입 버튼을 눌렀는데 아무 일도 안 일어난 것처럼 보인다.
         */
        return !data.session;
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

export { authMessage, createSessionFromUrl, redirectTo };
