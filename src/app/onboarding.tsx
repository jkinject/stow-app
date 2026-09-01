import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAcceptInvite, useCreateHousehold } from '@/features/household/api';
import { takePendingInviteCode, useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useTheme, type, radius } from '@/lib/theme';

type Mode = 'choose' | 'create' | 'join';

export default function Onboarding() {
  const { signOut } = useAuth();
  const { c } = useTheme();
  const t = useT();

  // OAuth 왕복에서 살아남은 초대 코드를 첫 렌더에 한 번만 꺼낸다 (R23).
  // effect 에서 setState 하면 한 프레임 깜빡이므로 지연 초기화로 처리한다.
  // 코드가 유실됐더라도 아래에서 직접 입력할 수 있으므로 막다른 길이 되지 않는다.
  const [pendingCode] = useState(() => takePendingInviteCode());
  const [mode, setMode] = useState<Mode>(pendingCode ? 'join' : 'choose');
  const [name, setName] = useState(() => t.onboarding.nameDefault);
  const [code, setCode] = useState(pendingCode ?? '');

  const create = useCreateHousehold();
  const join = useAcceptInvite();

  async function onCreate() {
    if (!name.trim()) return;
    try {
      await create.mutateAsync(name.trim());
    } catch (e) {
      Alert.alert(t.onboarding.createFailed, e instanceof Error ? e.message : t.common.tryAgain);
    }
  }

  async function onJoin() {
    if (!code.trim()) return;
    try {
      await join.mutateAsync(code);
    } catch (e) {
      Alert.alert(t.onboarding.joinFailed, e instanceof Error ? e.message : t.onboarding.joinFailedBody);
    }
  }

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      {mode === 'choose' && (
        <>
          <Text style={[s.title, { color: c.text }]}>{t.onboarding.chooseTitle}</Text>
          <Text style={[s.sub, { color: c.textMuted }]}>{t.onboarding.chooseSub}</Text>
          <Pressable style={[s.primary, { backgroundColor: c.accent }]} onPress={() => setMode('create')}>
            <Text style={[s.primaryText, { color: c.onAccent }]}>{t.onboarding.createCta}</Text>
          </Pressable>
          <Pressable style={[s.secondary, { borderColor: c.borderStrong }]} onPress={() => setMode('join')}>
            <Text style={[s.secondaryText, { color: c.text }]}>{t.onboarding.joinCta}</Text>
          </Pressable>
        </>
      )}

      {mode === 'create' && (
        <>
          <Text style={[s.title, { color: c.text }]}>{t.onboarding.nameTitle}</Text>
          <Text style={[s.sub, { color: c.textMuted }]}>{t.onboarding.nameSub}</Text>
          <TextInput
            style={[s.input, { borderColor: c.border, color: c.text, backgroundColor: c.card }]}
            value={name}
            onChangeText={setName}
            placeholder={t.onboarding.namePlaceholder}
            placeholderTextColor={c.textFaint}
            autoFocus
            editable={!create.isPending}
          />
          <Pressable style={[s.primary, { backgroundColor: c.accent }]} onPress={onCreate} disabled={create.isPending}>
            {create.isPending ? (
              <ActivityIndicator color={c.onAccent} />
            ) : (
              <Text style={[s.primaryText, { color: c.onAccent }]}>{t.onboarding.create}</Text>
            )}
          </Pressable>
          <Pressable onPress={() => setMode('choose')}>
            <Text style={[s.link, { color: c.accentText }]}>{t.common.back}</Text>
          </Pressable>
        </>
      )}

      {mode === 'join' && (
        <>
          <Text style={[s.title, { color: c.text }]}>{t.onboarding.codeTitle}</Text>
          <Text style={[s.sub, { color: c.textMuted }]}>{t.onboarding.codeSub}</Text>
          <TextInput
            style={[s.input, s.codeInput, { borderColor: c.border, color: c.text, backgroundColor: c.card }]}
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="ABCD2345"
            placeholderTextColor={c.textFaint}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={32}
            autoFocus
            editable={!join.isPending}
          />
          <Pressable style={[s.primary, { backgroundColor: c.accent }]} onPress={onJoin} disabled={join.isPending}>
            {join.isPending ? (
              <ActivityIndicator color={c.onAccent} />
            ) : (
              <Text style={[s.primaryText, { color: c.onAccent }]}>{t.onboarding.join}</Text>
            )}
          </Pressable>
          <Pressable onPress={() => setMode('choose')}>
            <Text style={[s.link, { color: c.accentText }]}>{t.common.back}</Text>
          </Pressable>
        </>
      )}

      <Pressable style={s.signOut} onPress={() => signOut()}>
        <Text style={[s.signOutText, { color: c.textFaint }]}>{t.more.signOut}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 12 },
  title: { fontSize: type.h1, fontWeight: '700', letterSpacing: -0.6 },
  sub: { fontSize: type.body, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: type.bodyStrong,
  },
  codeInput: { fontSize: type.title, letterSpacing: 3, textAlign: 'center', fontVariant: ['tabular-nums'] },
  primary: {
    paddingVertical: 15,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  primaryText: { fontSize: type.bodyStrong, fontWeight: '600' },
  secondary: {
    borderWidth: 1,
    paddingVertical: 15,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  secondaryText: { fontSize: type.bodyStrong, fontWeight: '500' },
  link: { fontSize: type.label, textAlign: 'center', paddingVertical: 8 },
  signOut: { position: 'absolute', bottom: 40, alignSelf: 'center' },
  signOutText: { fontSize: type.small },
});
