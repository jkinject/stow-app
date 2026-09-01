import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL 과 EXPO_PUBLIC_SUPABASE_ANON_KEY 가 필요합니다. .env.example 을 참고해 .env.local 을 만드세요.',
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // 딥링크(QR)로 앱이 열릴 때 URL 을 세션으로 오해하지 않도록 (RN 에서는 항상 false)
    detectSessionInUrl: false,
    /**
     * ⚠⚠ 이 한 줄을 지우면 계정 탈취가 가능해진다. 기본값이 위험하다.
     *
     * supabase-js 의 기본값은 `'implicit'` 이다(auth-js 2.109.0 GoTrueClient.js:24
     * 에서 직접 확인). implicit 흐름에서는 로그인 결과가
     *     stow://auth-callback#access_token=…&refresh_token=…
     * 로 돌아온다. **리프레시 토큰이 URL 에 실려 온다는 뜻이다.**
     *
     * 안드로이드에서 커스텀 스킴은 임자가 없다. 악성 앱이 매니페스트에
     * `<data android:scheme="stow"/>` 를 똑같이 선언해 두면 리다이렉트가
     * 그쪽으로 갈 수 있고, 그 순간 상대는 만료되지 않는 리프레시 토큰을 쥔다.
     * 비밀번호를 바꿔도 소용없는 완전한 계정 탈취다.
     *
     * PKCE 로 바꾸면 URL 에는 `?code=…` 만 실린다. 이 코드는 앱 저장소에만 있는
     * code_verifier 없이는 세션으로 바꿀 수 없으므로, 링크를 가로채도 쓸모가 없다.
     *
     * 이 값을 바꾸면 `lib/auth.tsx` 의 `createSessionFromUrl` 도 같이 바뀌어야 한다.
     */
    flowType: 'pkce',
  },
});

/**
 * 사진 경로 규약 (계획 §4.9).
 * 목록은 항상 thumb 을 읽고, 원본은 상세 화면에서만 읽는다.
 */
export const photoPaths = {
  bucket: 'item-photos',
  full: (householdId: string, itemId: string, uuid: string) =>
    `${householdId}/${itemId}/${uuid}.jpg`,
  thumb: (householdId: string, itemId: string, uuid: string) =>
    `${householdId}/${itemId}/${uuid}_t.jpg`,
} as const;
