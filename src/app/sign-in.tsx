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

import { IconMail } from '@/components/Icon';
import { KeyboardSpacer } from '@/components/KeyboardSpacer';
import { SIGNIN_HERO_URI } from '@/features/auth/heroImage';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useTheme, type, radius } from '@/lib/theme';

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
  const { signInWithGoogle, sendMagicLink } = useAuth();
  const { c, isDark } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'google' | 'magic' | null>(null);
  const [sent, setSent] = useState(false);
  /** 레퍼런스처럼 입력칸은 처음에 숨긴다 — 한 번 더 눌러야 나온다 */
  const [emailMode, setEmailMode] = useState(false);

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

  async function onMagic() {
    if (!email.includes('@')) {
      Alert.alert(t.auth.emailInvalid, t.auth.emailInvalidBody);
      return;
    }
    setBusy('magic');
    try {
      await sendMagicLink(email);
      setSent(true);
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
              <Text style={[s.sentTitle, { color: c.text }]}>{t.auth.sentTitle}</Text>
              <Text style={[s.sentBody, { color: c.textMuted }]}>{t.auth.sentBody(email)}</Text>
              <Pressable
                onPress={() => {
                  setSent(false);
                  setEmailMode(true);
                }}
                hitSlop={8}
              >
                <Text style={[s.link, { color: c.accentText }]}>{t.auth.resend}</Text>
              </Pressable>
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
                  onSubmitEditing={() => void onMagic()}
                  returnKeyType="send"
                />
              </View>
              <Pill
                label={t.auth.magicLink}
                onPress={onMagic}
                busy={busy === 'magic'}
                disabled={busy !== null}
                filled
              />
              <Pressable onPress={() => setEmailMode(false)} hitSlop={10} style={s.textBtn}>
                <Text style={[s.textBtnLabel, { color: c.textMuted }]}>{t.common.back}</Text>
              </Pressable>
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

  content: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24, gap: 28 },
  headings: { gap: 10 },
  title: { fontSize: type.display, fontWeight: '800', letterSpacing: -1 },
  sub: { fontSize: type.bodyStrong, lineHeight: 23 },

  actions: { gap: 12 },
  /** 알약 — 레퍼런스 셋 다 완전히 둥근 버튼을 쓴다 */
  pill: {
    paddingVertical: 17,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontSize: type.bodyStrong, fontWeight: '700' },
  pressed: { opacity: 0.72 },

  textBtn: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  textBtnLabel: { fontSize: type.body, fontWeight: '600' },

  inputWrap: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: { flex: 1, paddingVertical: 16, fontSize: type.bodyStrong },

  sentBox: { gap: 8, padding: 18, borderRadius: radius.lg },
  sentTitle: { fontSize: type.subtitle, fontWeight: '700' },
  sentBody: { fontSize: type.label, lineHeight: 20 },
  link: { fontSize: type.label, fontWeight: '600', marginTop: 4 },
});
