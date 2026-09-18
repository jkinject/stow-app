import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { IconLock, IconMail } from '@/components/Icon';
import { KeyboardSpacer } from '@/components/KeyboardSpacer';
import { TextButton } from '@/components/ui';
import { SIGNIN_HERO_URI } from '@/features/auth/heroImage';
import { appleMessage, authMessage, useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { PALETTES, type, radius, space, tracking, leading } from '@/lib/theme';

/**
 * 로그인 — 앱을 처음 여는 사람이 보는 **유일한** 화면이다.
 *
 * ⚠ 두 번 고쳤다. 처음엔 제목·버튼·입력칸만 세로로 쌓여 있었고("너무 밋밋"),
 *   다음엔 그림을 **카드에 담아** 가운데 놓았다. 둘 다 아니었다.
 *
 *   사용자가 보여준 레퍼런스(Spotify · Dot · QUITTR)의 공통점은 분명했다:
 *     · 그림이 **화면을 가득 채운다.** 상자에 담기지 않는다
 *     · 그림이 아래로 **배경색에 녹아든다** — 경계선이 없다
 *     · 글과 버튼은 **아래쪽에** 모여 있다
 *     · 버튼은 **알약 모양**으로 쌓인다 (채운 것 하나 + 테두리 것들)
 *     · 첫 화면에 입력칸을 두지 않는다 — 이메일은 한 번 더 눌러야 나온다
 *
 *   그대로 따랐다. 그림은 상단에서 화면 폭을 다 쓰고 그라데이션으로 사라진다.
 *
 * ⚠ 길은 둘뿐이다: 구글, 이메일+비밀번호(가입/로그인). "메일 링크로 받기" 는 지웠다
 *   (2026-09-09) — lib/auth.tsx 머리말 참고. 여기에 세 번째 길을 다시 두지 말 것.
 *   **iOS 에만** Sign in with Apple 이 하나 더 선다(2026-09-18, 심사 지침 4.8 — 소셜 로그인이
 *   있으면 Apple 로그인도 있어야 한다). 새 길이 아니라 Apple 이 요구하는 짝이다.
 *
 * ⚠⚠ 버튼 셋은 **같은 무게**다 — 흰 알약 세 개, 순서는 구글 → 애플 → 이메일
 *   (2026-09-18 사용자 결정, 시안 "시네마 화이트"). 전에는 Apple 만 네이티브 검정 버튼이라
 *   혼자 튀었고 구글이 강조색으로 채워져 있어 위계가 셋 다 달랐다.
 *
 * ⚠ 그래서 이 화면만 **테마를 따르지 않는다.** 버튼 뒤 바탕을 항상 어둡게(다크 팔레트) 깔고
 *   그 위에 흰 버튼을 얹는다. 라이트 팔레트를 쓰면 흰 바탕에 흰 버튼이라 버튼이 사라진다.
 *   제목·설명·입력칸 색도 전부 그 어두운 바탕 기준이다.
 *
 * ⚠⚠ Apple 버튼도 **우리가 그린다.** 전에는 네이티브 `AppleAuthenticationButton` 을 썼는데,
 *   그 버튼은 **글씨 크기를 받지 않는다** — 높이에 비례해 iOS 가 자체 계산한다. 높이를 다른
 *   버튼과 같은 55 로 맞추자 글씨만 23pt 로 그려져 혼자 1.35배 컸다(사용자 지적, 실측).
 *   디자인 토큰이 닿지 않는 버튼이 하나 있으면 나란히 선 셋이 영영 안 맞는다.
 *
 *   대신 Apple HIG 의 커스텀 버튼 규칙을 **우리가 지킨다**:
 *     · 배경은 흰색 — Apple 이 허용한 셋(흰색·검정·흰색+테두리) 중 하나
 *     · 로고는 검정, 공식 모양 그대로. 변형·회전·색 바꾸기 금지
 *     · 문구는 승인된 것만(`t.auth.apple`). 기기 언어로 지역화 — 우리 앱은 en·ko 뿐이라
 *       사전 두 곳이면 끝이다. 문구를 손볼 때 Apple 승인 목록 밖으로 나가지 말 것
 *     · 크기는 다른 로그인 버튼과 같게 — 작으면 반려 사유다(지침 4.8)
 *
 * ⚠ 그라데이션은 `react-native-svg` 로 그린다. `expo-linear-gradient` 를 넣으면
 *   네이티브 의존성이 하나 더 늘어나는데, svg 는 이미 쓰고 있다(아이콘·QR).
 */

/**
 * 그림이 차지하는 세로 비율. 아래쪽 절반 이상은 그라데이션이 먹는다.
 * ⚠ 0.62 였을 때 그림과 버튼 사이에 **검은 공백**이 크게 남았다(실기기 확인).
 *   레퍼런스(Spotify·QUITTR)는 그림이 화면 2/3 을 차지한다.
 */
const HERO_SCREEN = 0.68;
/** 폴더블을 펼치면 화면이 정사각에 가까워진다 — 그때만 줄인다 */
const HERO_SCREEN_WIDE = 0.5;
/**
 * 이메일을 입력할 때는 키보드가 올라와 **글과 버튼이 위로 밀린다.** 그림이 그대로면
 * 아직 안 흐려진 부분(선반) 위에 글자가 얹혀 안 읽힌다 — 실기기에서 확인했다.
 * 그림을 줄이면 그라데이션도 같이 올라와 바탕이 다시 깨끗해진다.
 */
const HERO_SCREEN_INPUT = 0.34;
/** 그림 높이 중 그라데이션이 덮는 비율 */
const FADE_PART = 0.62;
/**
 * 입력 모드에서는 **더 많이 덮는다.**
 *
 * ⚠ 그림이 34% 로 줄면 그라데이션도 같은 비율로 짧아져서, 사진이 어두운 바탕 위에
 *   상자처럼 뚝 끊긴다(시뮬레이터에서 확인). 바탕이 늘 어두워진 뒤로 그 선이 더 보인다.
 *   덮는 비율을 키워 사진이 끝까지 녹게 한다.
 */
const FADE_PART_INPUT = 0.88;

/** 로그인 버튼 세 개의 높이. Apple 버튼도 이 값을 쓴다 — 아래 `pill` 주석 참고 */
const PILL_H = space.lg * 2 + leading.bodyStrong;

/**
 * 이 화면은 테마를 따르지 않는다(머리말 참고). 바탕은 늘 어둡다.
 * ⚠ `useTheme()` 을 쓰지 말 것 — 라이트에서 버튼이 바탕에 묻힌다.
 */
const c = PALETTES.dark;

/**
 * 버튼 세 개의 색. 사진 위이고 브랜드 규칙이 걸려 있어 **테마 팔레트를 쓰지 않는다**
 * (overlay 주석과 같은 이유).
 *
 * ⚠ 구글 글자·테두리 값은 구글 브랜드 가이드의 라이트 버튼 규격이다. 임의로 바꾸지 말 것.
 * ⚠ Apple 은 여기 없다 — Apple 이 자기 버튼을 그린다.
 */
const BTN = {
  face: '#FFFFFF',
  googleText: '#1F1F1F',
  googleBorder: '#747775',
  text: '#000000',
} as const;

/**
 * Apple 로고. 흰 버튼 위이므로 **검정** 고정 — Apple 이 허용한 두 색(흰색·검정) 중 하나다.
 * ⚠ 모양을 손대지 말 것. 로고 변형은 브랜드 규칙 위반이고 심사에서 지적된다.
 */
/**
 * Apple 로고 — **Apple 이 배포하는 공식 도형 그대로**다.
 *
 * ⚠ 손으로 그리지 말 것. 처음엔 기억에 의존해 path 를 썼다가 잎과 몸통 비율이 어긋나
 *   "아이콘이 이상하다" 는 지적을 받았다(2026-09-18). 지금 값은 Apple 의 Sign in with Apple
 *   웹 SDK(appleid.cdn-apple.com 의 appleid.auth.js, 로케일별 경로)가 버튼에
 *   그려 넣는 그 path 다. 로고 변형은 브랜드 규칙 위반이기도 하다.
 *
 * ⚠ viewBox 는 도형에 딱 맞춘 값(20.5 16 15 19)이라 **세로가 더 길다**(15:19). 정사각으로
 *   두면 사과가 눌린다 — 너비는 높이에서 계산한다.
 */
/**
 * 버튼 로고 크기. **셋이 같은 값을 쓴다** — 하나만 달라지면 나란히 선 줄이 어긋나 보인다.
 * ⚠ Apple 만 작게 두지 말 것(2026-09-18 사용자 지적). 도형이 무거워 보인다는 이유로 줄였다가
 *   되돌렸다 — 광학 보정보다 셋이 같은 것이 먼저다.
 */
const LOGO = 18;
/** Apple 마크는 정사각이 아니다 — 세로가 더 길다. 너비는 높이에서 계산한다 */
const APPLE_LOGO_RATIO = 15 / 19;
function AppleLogo({ height = LOGO }: { height?: number }) {
  return (
    <Svg width={height * APPLE_LOGO_RATIO} height={height} viewBox="20.5 16 15 19" fill={BTN.text}>
      <Path d="M28.2226562,20.3846154 C29.0546875,20.3846154 30.0976562,19.8048315 30.71875,19.0317864 C31.28125,18.3312142 31.6914062,17.352829 31.6914062,16.3744437 C31.6914062,16.2415766 31.6796875,16.1087095 31.65625,16 C30.7304687,16.0362365 29.6171875,16.640178 28.9492187,17.4494596 C28.421875,18.06548 27.9414062,19.0317864 27.9414062,20.0222505 C27.9414062,20.1671964 27.9648438,20.3121424 27.9765625,20.3604577 C28.0351562,20.3725366 28.1289062,20.3846154 28.2226562,20.3846154 Z M25.2929688,35 C26.4296875,35 26.9335938,34.214876 28.3515625,34.214876 C29.7929688,34.214876 30.109375,34.9758423 31.375,34.9758423 C32.6171875,34.9758423 33.4492188,33.792117 34.234375,32.6325493 C35.1132812,31.3038779 35.4765625,29.9993643 35.5,29.9389701 C35.4179688,29.9148125 33.0390625,28.9122695 33.0390625,26.0979021 C33.0390625,23.6579784 34.9140625,22.5588048 35.0195312,22.474253 C33.7773438,20.6382708 31.890625,20.5899555 31.375,20.5899555 C29.9804688,20.5899555 28.84375,21.4596313 28.1289062,21.4596313 C27.3554688,21.4596313 26.3359375,20.6382708 25.1289062,20.6382708 C22.8320312,20.6382708 20.5,22.5950413 20.5,26.2911634 C20.5,28.5861411 21.3671875,31.013986 22.4335938,32.5842339 C23.3476562,33.9129053 24.1445312,35 25.2929688,35 Z" />
    </Svg>
  );
}

/**
 * 구글 G 로고. 브랜드 가이드가 **변형·단색화를 금지**하므로 공식 4색 그대로 그린다.
 * (Icon.tsx 의 선 아이콘들과 달리 stroke 가 아니라 fill 이라 여기 따로 둔다)
 */
function GoogleLogo({ size = LOGO }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

export default function SignIn() {
  const { signInWithGoogle, signInWithApple, signInWithPassword, signUpWithPassword } = useAuth();
  const t = useT();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();

  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState<'google' | 'apple' | 'pw' | null>(null);
  /** 가입 인증 메일을 보낸 상태 — "메일함을 확인하세요" 를 보여 준다 */
  const [confirmSent, setConfirmSent] = useState(false);
  /** 레퍼런스처럼 입력칸은 처음에 숨긴다 — 한 번 더 눌러야 나온다 */
  const [emailMode, setEmailMode] = useState(false);
  /**
   * ⚠ 로그인/가입을 **자동으로 판별하지 않는다.** Supabase 는 "비밀번호가 틀렸다" 와
   *   "그런 계정이 없다" 를 같은 오류로 돌려준다(일부러 그렇다 — 구분해 주면 남의
   *   이메일이 가입돼 있는지 캐낼 수 있다). 그래서 오류만 보고 가입으로 넘기면,
   *   비밀번호를 오타 낸 사람에게 **쓰레기 계정을 만들어 주게 된다.**
   *   사용자가 직접 고르게 한다.
   */
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  async function onGoogle() {
    setBusy('google');
    try {
      await signInWithGoogle();
    } catch (e) {
      Alert.alert(t.auth.googleFailed, e instanceof Error ? e.message : t.common.tryAgain);
    } finally {
      setBusy(null);
    }
  }

  async function onApple() {
    if (busy !== null) return; // Apple 버튼엔 disabled 가 없다 — 여기서 막는다
    setBusy('apple');
    try {
      await signInWithApple();
    } catch (e) {
      Alert.alert(t.auth.appleFailed, appleMessage(e, t));
    } finally {
      setBusy(null);
    }
  }

  async function onPassword() {
    if (!email.includes('@')) {
      Alert.alert(t.auth.emailInvalid, t.auth.emailInvalidBody);
      return;
    }
    if (pw.length < 8) {
      Alert.alert(t.auth.signUpFailed, t.auth.passwordTooShort);
      return;
    }
    setBusy('pw');
    try {
      if (mode === 'signup') {
        const needsConfirm = await signUpWithPassword(email, pw);
        if (needsConfirm) setConfirmSent(true);
      } else {
        await signInWithPassword(email, pw);
      }
    } catch (e) {
      Alert.alert(
        mode === 'signup' ? t.auth.signUpFailed : t.auth.signInFailed,
        authMessage(e instanceof Error ? e.message : t.common.tryAgain, t),
      );
    } finally {
      setBusy(null);
    }
  }

  /**
   * 그림은 **화면 폭을 꽉 채운다.** 비율을 지키느라 세로가 넘치면 위쪽이 잘리는데,
   * 잘려도 되는 그림이라(선반 장면) `cover` 로 둔다.
   * ⚠ 폴더블을 펼치면 화면이 정사각에 가까워져 그림이 너무 커진다 — 상한을 둔다.
   */
  const wide = win.width / win.height > 0.75;
  const heroH =
    win.height * (wide ? HERO_SCREEN_WIDE : emailMode ? HERO_SCREEN_INPUT : HERO_SCREEN);
  /**
   * ⚠ 그라데이션 높이를 `"62%"` 로 주면 안 된다. SVG 가 절대배치라 퍼센트가
   *   기준 삼을 상자가 없어서, 아래가 다 안 덮이고 **그림이 뚝 잘린 선**이 보인다
   *   (실기기에서 그 선을 봤다). 픽셀로 계산해서 넘긴다.
   */
  const fadeH = Math.round(heroH * (emailMode ? FADE_PART_INPUT : FADE_PART));

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      {/* ── 배경: 그림 + 아래로 녹는 그라데이션 ── */}
      <View style={[s.heroLayer, { height: heroH }]} pointerEvents="none">
        {/* ⚠ `require()` 로 된 번들 에셋은 이 기기에서 **오류 없이 안 그려졌다.**
            경위와 시도한 것들은 heroImage.ts 주석에 적어 뒀다. */}
        {/* ⚠ 늘 살짝 죽인다. 전에는 다크 모드에서만 그랬는데, 이제 아래 바탕이 항상
            어두워서 원본 그대로면 사진만 혼자 밝게 떠 버린다. */}
        <Image source={{ uri: SIGNIN_HERO_URI }} style={[s.hero, s.heroDim]} resizeMode="cover" />
        {/* ⚠ 그라데이션이 그림의 **아래 절반**을 덮어 배경색으로 이어 준다.
            이게 없으면 그림이 상자처럼 뚝 끊긴다 — 그게 이전 시안의 문제였다. */}
        <Svg style={[s.fade, { height: fadeH }]} width="100%" height={fadeH}>
          <Defs>
            <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c.bg} stopOpacity="0" />
              <Stop offset="0.55" stopColor={c.bg} stopOpacity="0.88" />
              <Stop offset="1" stopColor={c.bg} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#fade)" />
        </Svg>
      </View>

      {/* ── 앞: 글과 버튼. 아래쪽에 모은다 ── */}
      <KeyboardSpacer style={s.flex}>
        <View style={[s.content, { paddingBottom: insets.bottom + 28, paddingTop: insets.top }]}>
          <View style={s.headings}>
            <Text style={[s.title, { color: c.text }]}>{t.auth.appName}</Text>
            <Text style={[s.sub, { color: c.textMuted }]}>{t.auth.tagline}</Text>
          </View>

          {confirmSent ? (
            <View style={[s.sentBox, { backgroundColor: c.card }]}>
              <Text style={[s.sentTitle, { color: c.text }]}>{t.auth.confirmTitle}</Text>
              <Text style={[s.sentBody, { color: c.textMuted }]}>{t.auth.confirmBody(email)}</Text>
              <TextButton
                label={t.auth.resend}
                size="small"
                onPress={() => {
                  setConfirmSent(false);
                  setEmailMode(true);
                }}
                style={s.link}
              />
            </View>
          ) : emailMode ? (
            <View style={s.actions}>
              <View style={[s.inputWrap, { borderColor: c.border, backgroundColor: c.card }]}>
                <IconMail color={c.textFaint} size={20} />
                <TextInput
                  style={[s.input, { color: c.text }]}
                  placeholder={t.auth.emailPlaceholder}
                  placeholderTextColor={c.textFaint}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  keyboardType="email-address"
                  inputMode="email"
                  editable={busy === null}
                  returnKeyType="next"
                />
              </View>

              <View style={[s.inputWrap, { borderColor: c.border, backgroundColor: c.card }]}>
                <IconLock color={c.textFaint} size={20} />
                <TextInput
                  style={[s.input, { color: c.text }]}
                  placeholder={mode === 'signup' ? t.auth.passwordNew : t.auth.password}
                  placeholderTextColor={c.textFaint}
                  value={pw}
                  onChangeText={setPw}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  /* ⚠ 새 비밀번호와 기존 비밀번호를 구분해 줘야 기기 비밀번호 관리자가
                     엉뚱하게 동작하지 않는다 */
                  textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                  editable={busy === null}
                  onSubmitEditing={() => void onPassword()}
                  returnKeyType="go"
                />
              </View>

              <Pill
                label={mode === 'signup' ? t.auth.signUp : t.auth.signIn}
                onPress={onPassword}
                busy={busy === 'pw'}
                disabled={busy !== null}
                accent
              />

              <TextButton
                label={mode === 'signup' ? t.auth.toSignIn : t.auth.toSignUp}
                onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
                style={s.textBtn}
              />

              <TextButton
                label={t.common.back}
                tone="muted"
                onPress={() => setEmailMode(false)}
                style={s.textBtn}
              />
            </View>
          ) : (
            <View style={s.actions}>
              <Pill
                label={t.auth.google}
                onPress={onGoogle}
                busy={busy === 'google'}
                disabled={busy !== null}
                icon={<GoogleLogo />}
                textColor={BTN.googleText}
                borderColor={BTN.googleBorder}
              />
              {/* iOS 에만. 나머지 둘과 **완전히 같은 Pill** 이다 — 머리말의 HIG 항목 참고 */}
              {Platform.OS === 'ios' && (
                <Pill
                  label={t.auth.apple}
                  onPress={() => void onApple()}
                  busy={busy === 'apple'}
                  disabled={busy !== null}
                  icon={<AppleLogo />}
                  textColor={BTN.text}
                />
              )}
              <Pill
                label={t.auth.emailCta}
                onPress={() => setEmailMode(true)}
                disabled={busy !== null}
                icon={<IconMail size={LOGO} color={BTN.text} />}
                textColor={BTN.text}
              />
            </View>
          )}
        </View>
      </KeyboardSpacer>
    </View>
  );
}

/**
 * 알약 버튼.
 *
 * ⚠ 로그인 방법 버튼들은 **전부 같은 모양**이다 — 흰 알약에 왼쪽 로고, 가운데 글자
 *   (2026-09-18 시안 "시네마 화이트"). 하나만 채워 강조하던 예전 구조로 되돌리지 말 것:
 *   Apple 로그인이 다른 소셜 로그인보다 덜 눈에 띄면 심사에서 반려된다(지침 4.8).
 *
 * ⚠ 아래 이메일 입력 모드의 "로그인/가입하기" 는 이야기가 다르다. 거기서는 그것이 유일한
 *   주 동작이라 강조색으로 채운다 — `accent` 를 넘겨서 쓴다.
 */
function Pill({
  label,
  onPress,
  busy,
  disabled,
  icon,
  textColor = BTN.text,
  borderColor,
  accent,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  /** 글자 왼쪽 로고. 없으면 글자만 가운데 */
  icon?: React.ReactNode;
  textColor?: string;
  /** 있으면 1.5px 테두리 (구글 브랜드 규격) */
  borderColor?: string;
  /** 강조색으로 채운다 — 이메일 폼의 주 동작 전용 */
  accent?: boolean;
}) {
  const bg = accent ? c.accent : BTN.face;
  const fg = accent ? c.onAccent : textColor;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.pill,
        { backgroundColor: bg },
        borderColor ? { borderWidth: 1.5, borderColor } : null,
        pressed && s.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <View style={s.pillIcon}>{icon}</View> : null}
          <Text style={[s.pillText, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },

  /** ⚠ 화면 맨 위(상태바 뒤)부터 시작한다 — 여백을 두면 다시 "상자" 가 된다 */
  heroLayer: { position: 'absolute', top: 0, left: 0, right: 0 },
  hero: { width: '100%', height: '100%' },
  heroDim: { opacity: 0.9 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },

  content: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: space.xxl, gap: space.xxxl },
  headings: { gap: space.md },
  title: { fontSize: type.display, fontWeight: '800', letterSpacing: tracking.tightest },
  sub: { fontSize: type.bodyStrong, lineHeight: leading.bodyStrong },

  actions: { gap: space.md },
  /**
   * 알약 — 레퍼런스 셋 다 완전히 둥근 버튼을 쓴다.
   * ⚠ 높이를 **값으로 못 박는다**(PILL_H). Apple 버튼은 우리가 그리는 게 아니라 높이를
   *   따로 줘야 하는데, 여기 여백으로만 정해 두면 둘이 조금씩 어긋난다 — 나란히 서는
   *   버튼이라 1px 차이도 보인다.
   */
  pill: {
    height: PILL_H,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  pillIcon: { alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: type.bodyStrong, fontWeight: '700' },
  pressed: { opacity: 0.72 },

  textBtn: { alignSelf: 'center', paddingVertical: space.md, paddingHorizontal: space.lg },

  /**
   * ⚠ 이 화면의 입력칸은 **알약**이다(`radius.full`). `ui.tsx` 의 `Field`(radius.sm)와
   *   다른 것은 실수가 아니라 이 화면의 결이다 — 아래 `Pill` 버튼들과 같은 모양을
   *   이룬다. 다른 화면에서 이 모양을 베끼지 말 것. (2026-09-06 점검에서 확인)
   */
  inputWrap: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  input: { flex: 1, paddingVertical: space.lg, fontSize: type.bodyStrong },

  sentBox: { gap: space.sm, padding: space.xl, borderRadius: radius.lg },
  sentTitle: { fontSize: type.subtitle, fontWeight: '700' },
  sentBody: { fontSize: type.label, lineHeight: leading.label },
  link: { marginTop: space.xs },
});
