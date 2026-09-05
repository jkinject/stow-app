import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button, Field, TextButton, titleText } from '@/components/ui';
import { useAcceptInvite, useCreateHousehold } from '@/features/household/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useTheme, type, space, tracking } from '@/lib/theme';

/**
 * ⚠ 입력칸·버튼·링크를 **여기서 다시 만들지 않는다** (2026-09-06 점검).
 *   예전에는 `input`·`primary`·`secondary`·`link` 를 직접 정의했는데, 값이 `ui.tsx` 의
 *   `Field`·`Button` 과 글자 하나까지 같았다. 우연히 같은 것은 언젠가 갈라진다 —
 *   한쪽만 고쳐지는 날이 반드시 온다. 공용 컴포넌트를 쓴다.
 */

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
          <Button label={t.onboarding.createCta} onPress={() => setMode('create')} />
          <Button label={t.onboarding.joinCta} onPress={() => setMode('join')} variant="secondary" />
        </>
      )}

      {mode === 'create' && (
        <>
          <Text style={[s.title, { color: c.text }]}>{t.onboarding.nameTitle}</Text>
          <Text style={[s.sub, { color: c.textMuted }]}>{t.onboarding.nameSub}</Text>
          <Field
            value={name}
            onChangeText={setName}
            placeholder={t.onboarding.namePlaceholder}
            autoFocus
            editable={!create.isPending}
          />
          <Button label={t.onboarding.create} onPress={onCreate} busy={create.isPending} />
          <TextButton label={t.common.back} onPress={() => setMode('choose')} style={s.link} />
        </>
      )}

      {mode === 'join' && (
        <>
          <Text style={[s.title, { color: c.text }]}>{t.onboarding.codeTitle}</Text>
          <Text style={[s.sub, { color: c.textMuted }]}>{t.onboarding.codeSub}</Text>
          <Field
            style={s.codeInput}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder="ABCD2345"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={32}
            autoFocus
            editable={!join.isPending}
          />
          <Button label={t.onboarding.join} onPress={onJoin} busy={join.isPending} />
          <TextButton label={t.common.back} onPress={() => setMode('choose')} style={s.link} />
        </>
      )}

      <TextButton
        label={t.more.signOut}
        onPress={() => signOut()}
        size="small"
        tone="muted"
        style={s.signOut}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', paddingHorizontal: space.xxxl, gap: space.md },
  /** 화면 제목은 `Screen` 과 같은 값을 쓴다 — 이 화면만 헤더가 없을 뿐이다 */
  title: titleText,
  sub: { fontSize: type.body, marginBottom: space.md },
  /** 초대 코드는 한 글자씩 읽는다 — 크게, 벌려서, 폭이 고르게 */
  codeInput: { fontSize: type.title, letterSpacing: tracking.code, textAlign: 'center', fontVariant: ['tabular-nums'] },
  link: { alignSelf: 'center', paddingVertical: space.sm },
  signOut: { position: 'absolute', bottom: space.giant, alignSelf: 'center' },
});
