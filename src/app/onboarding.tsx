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
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useTheme, type, radius, space, tracking } from '@/lib/theme';

type Mode = 'choose' | 'create' | 'join';

export default function Onboarding() {
  const { signOut } = useAuth();
  const { c } = useTheme();
  const t = useT();

  // OAuth 왕복에서 살아남은 초대 코드를 첫 렌더에 한 번만 꺼낸다 (R23).
  // effect 에서 setState 하면 한 프레임 깜빡이므로 지연 초기화로 처리한다.
  // 코드가 유실됐더라도 아래에서 직접 입력할 수 있으므로 막다른 길이 되지 않는다.
  const [mode, setMode] = useState<Mode>('choose');
  const [name, setName] = useState(() => t.onboarding.nameDefault);
  const [code, setCode] = useState('');

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
  root: { flex: 1, justifyContent: 'center', paddingHorizontal: space.xxxl, gap: space.md },
  title: { fontSize: type.h1, fontWeight: '700', letterSpacing: tracking.tighter },
  sub: { fontSize: type.body, marginBottom: space.md },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontSize: type.bodyStrong,
  },
  codeInput: { fontSize: type.title, letterSpacing: tracking.code, textAlign: 'center', fontVariant: ['tabular-nums'] },
  primary: {
    paddingVertical: space.lg,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  primaryText: { fontSize: type.bodyStrong, fontWeight: '600' },
  secondary: {
    borderWidth: 1,
    paddingVertical: space.lg,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  secondaryText: { fontSize: type.bodyStrong, fontWeight: '500' },
  link: { fontSize: type.label, textAlign: 'center', paddingVertical: space.sm },
  signOut: { position: 'absolute', bottom: 40, alignSelf: 'center' },
  signOutText: { fontSize: type.small },
});
