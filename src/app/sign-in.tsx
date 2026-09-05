import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { IconLock, IconMail } from '@/components/Icon';
import { KeyboardSpacer } from '@/components/KeyboardSpacer';
import { TextButton } from '@/components/ui';
import { SIGNIN_HERO_URI } from '@/features/auth/heroImage';
import { authMessage, useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useTheme, type, radius, space, tracking, leading } from '@/lib/theme';

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

export default function SignIn() {
  const { signInWithGoogle, sendMagicLink, signInWithPassword, signUpWithPassword } = useAuth();
  const { c, isDark } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();

  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState<'google' | 'magic' | 'pw' | null>(null);
  /** 매직링크를 보냈거나 가입 인증 메일을 보낸 상태 */
  const [sent, setSent] = useState<null | 'magic' | 'confirm'>(null);
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
        if (needsConfirm) setSent('confirm');
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

  async function onMagic() {
    if (!email.includes('@')) {
      Alert.alert(t.auth.emailInvalid, t.auth.emailInvalidBody);
      return;
    }
    setBusy('magic');
    try {
      await sendMagicLink(email);
      setSent('magic');
    } catch (e) {
      Alert.alert(t.auth.sendFailed, e instanceof Error ? e.message : t.common.tryAgain);
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
  const fadeH = Math.round(heroH * FADE_PART);

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      {/* ── 배경: 그림 + 아래로 녹는 그라데이션 ── */}
      <View style={[s.heroLayer, { height: heroH }]} pointerEvents="none">
        {/* ⚠ `require()` 로 된 번들 에셋은 이 기기에서 **오류 없이 안 그려졌다.**
            경위와 시도한 것들은 heroImage.ts 주석에 적어 뒀다. */}
        <Image
          source={{ uri: SIGNIN_HERO_URI }}
          style={[s.hero, isDark && s.heroDim]}
          resizeMode="cover"
        />
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

          {sent ? (
            <View style={[s.sentBox, { backgroundColor: c.card }]}>
              <Text style={[s.sentTitle, { color: c.text }]}>
                {sent === 'confirm' ? t.auth.confirmTitle : t.auth.sentTitle}
              </Text>
              <Text style={[s.sentBody, { color: c.textMuted }]}>
                {sent === 'confirm' ? t.auth.confirmBody(email) : t.auth.sentBody(email)}
              </Text>
              <TextButton
                label={t.auth.resend}
                size="small"
                onPress={() => {
                  setSent(null);
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
                filled
              />

              <TextButton
                label={mode === 'signup' ? t.auth.toSignIn : t.auth.toSignUp}
                onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
                style={s.textBtn}
              />

              {/* 비밀번호를 잊었거나 만들기 싫은 사람을 위한 길. 가입 화면에서는 숨긴다 */}
              {mode === 'signin' && (
                <TextButton
                  label={busy === 'magic' ? t.common.loading : t.auth.orMagic}
                  tone="muted"
                  onPress={onMagic}
                  disabled={busy !== null}
                  style={s.textBtn}
                />
              )}

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
                filled
              />
              <Pill
                label={t.auth.emailCta}
                onPress={() => setEmailMode(true)}
                disabled={busy !== null}
              />
            </View>
          )}
        </View>
      </KeyboardSpacer>
    </View>
  );
}

/** 알약 버튼 — 채운 것(주 동작) 하나와 테두리만 있는 것들이 쌓인다 */
function Pill({
  label,
  onPress,
  busy,
  disabled,
  filled,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  filled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.pill,
        filled
          ? { backgroundColor: c.accent }
          : { borderWidth: 1.5, borderColor: c.borderStrong },
        pressed && s.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={filled ? c.onAccent : c.text} />
      ) : (
        <Text style={[s.pillText, { color: filled ? c.onAccent : c.text }]}>{label}</Text>
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
  /** 알약 — 레퍼런스 셋 다 완전히 둥근 버튼을 쓴다 */
  pill: {
    paddingVertical: space.lg,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
