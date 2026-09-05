import { QueryClientProvider } from '@tanstack/react-query';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  usePathname,
  useRouter,
  useSegments,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';

import { ToastProvider } from '@/components/Toast';
import { resumePendingPhotos } from '@/features/item/photoQueue';
import { useMyHouseholds } from '@/features/household/api';
import { HouseholdProvider } from '@/features/household/context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { I18nProvider } from '@/lib/i18n';
import { ThemeChoiceProvider } from '@/lib/theme-context';
import { queryClient } from '@/lib/query';
import { useTheme } from '@/lib/theme';

/**
 * 로그인 전에 도착한 딥링크를 기억해 둔다 (R14).
 *
 * ⚠ 이게 없으면 QR 을 찍었을 때 앱이 잠겨 있던 사람은 **로그인 후 홈으로 떨어진다.**
 *   찍은 박스가 뭐였는지 잊고 다시 찍으러 가야 한다. QR 의 요점이 "열어보지 않고 안다"
 *   인데 그 요점이 로그인 상태에 따라 무너지는 셈이다.
 *
 * 모듈 스코프에 두는 이유: 리다이렉트 과정에서 화면이 언마운트되므로 컴포넌트 state 로는
 * 살아남지 못한다. 앱 인스턴스당 하나뿐인 값이라 모듈 변수가 맞다.
 */
let pendingDeepLink: string | null = null;

/** 로그인 전에도 붙잡아 둘 가치가 있는 경로인가 — 지금은 QR 착지점뿐이다 */
function isResumable(path: string): boolean {
  return /^\/c\/[^/]+$/.test(path);
}

/**
 * 라우트 가드.
 * 세션이 없으면 로그인으로, 세션은 있으나 가구가 없으면 온보딩으로 보낸다 (AC25/AC30).
 * 로그인 전에 딥링크로 들어왔다면 그 목적지를 기억해 두었다가 준비된 뒤 이어서 보낸다.
 */
/** 상태바와 네비게이션 테마를 사용자의 테마 선택에 맞춘다 */
function Chrome({ children }: { children: React.ReactNode }) {
  const { isDark } = useTheme();
  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {children}
    </ThemeProvider>
  );
}

/**
 * 못 올린 사진을 이어서 올린다 (2026-09-06 사용자 보고 — 등록했는데 사진이 사라졌다).
 *
 * ⚠ **세션이 생긴 뒤에** 부른다. Storage 업로드는 로그인 없이는 반드시 실패하고,
 *   실패로 적히면 사용자가 다시 누르기 전까지 그대로 남는다. 켜자마자 부르면
 *   세션 복구보다 먼저 달려서 매번 한 번씩 헛되이 실패한다.
 *
 * ⚠ 앱이 앞으로 돌아올 때도 부른다. 전파가 없는 곳에서 등록한 사진은 그때 올라간다 —
 *   등록하고 화면을 끄고 지하철을 타는 흐름이 실제로 있다.
 *
 * ⚠ 타이머로 계속 재시도하지 않는다. 배터리를 태우면서까지 붙잡을 일이 아니고,
 *   물건 상세에 "다시 시도" 가 있어서 사용자가 언제든 밀 수 있다.
 */
function usePhotoQueueDriver(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    void resumePendingPhotos();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void resumePendingPhotos();
    });
    return () => sub.remove();
  }, [ready]);
}

function Guard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const households = useMyHouseholds();
  const { c } = useTheme();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();

  const authed = !!session;
  usePhotoQueueDriver(authed);
  // enabled:false 일 때 isLoading 은 true 로 남는다. isPending+fetchStatus 로 실제 상태를 본다.
  const householdsReady = !authed || households.isFetched;
  const hasHousehold = (households.data?.length ?? 0) > 0;
  const route = segments[0] ?? 'index';

  useEffect(() => {
    if (loading || !householdsReady) return;

    if (!authed && route !== 'sign-in' && route !== 'auth-callback') {
      // 로그인으로 밀어내기 전에 목적지를 붙잡아 둔다
      if (isResumable(pathname)) pendingDeepLink = pathname;
      router.replace('/sign-in');
    } else if (authed && !hasHousehold && route !== 'onboarding') {
      // 가구가 없으면 QR 을 해석할 수 없다. 목적지는 그대로 두고 온보딩부터 시킨다.
      if (isResumable(pathname)) pendingDeepLink = pathname;
      router.replace('/onboarding');
    } else if (authed && hasHousehold && (route === 'sign-in' || route === 'onboarding')) {
      const resume = pendingDeepLink;
      pendingDeepLink = null; // 한 번만 쓴다 — 안 지우면 다음 로그인 때도 그 박스로 튄다
      // typedRoutes 는 런타임에 만들어진 경로 문자열을 알 수 없다. isResumable 이
      // 형태를 이미 검증했으므로 여기서만 좁혀 준다.
      router.replace((resume ?? '/') as '/');
    }
  }, [authed, hasHousehold, householdsReady, loading, pathname, route, router]);

  if (loading || !householdsReady) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: c.bg,
        }}
      >
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
      <ThemeChoiceProvider>
      <AuthProvider>
        <Chrome>
          {/* ⚠ Chrome 안쪽이어야 한다 — 알림이 테마 색을 쓴다.
              Stack 바깥쪽이어야 한다 — 화면이 바뀌어도 알림은 떠 있어야 한다. */}
          <ToastProvider>
            <HouseholdProvider>
              <Guard>
                <Stack screenOptions={{ headerShown: false }} />
              </Guard>
            </HouseholdProvider>
          </ToastProvider>
        </Chrome>
      </AuthProvider>
      </ThemeChoiceProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
