import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button, Field, TextButton, titleText } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useTheme, type, space, tracking } from '@/lib/theme';

import { useAcceptInvite, useCreateHousehold } from './api';

/**
 * 공간 만들기 / 초대 코드로 참여 — **한 벌**이다 (2026-09-09).
 *
 * 온보딩(첫 공간)과 "공간 추가"(두 번째 이후)가 같은 폼을 쓴다. 두 화면이 각자 만들면
 * 한쪽만 고쳐지는 날이 반드시 온다 — 이 프로젝트에서 이미 겪은 일이다.
 *
 * 성공하면 `onDone` 에 만들거나 참여한 가구를 넘긴다. 어디로 갈지는 부르는 쪽이 정한다:
 * 온보딩은 가드가 알아서 홈으로 보내고, 공간 추가는 그 공간을 활성으로 바꾼다.
 *
 * ⚠ 입력칸·버튼은 `ui.tsx` 의 공용 컴포넌트다. 여기서 다시 만들지 않는다.
 */

type Mode = 'choose' | 'create' | 'join';

export type JoinOrCreateResult = { id: string; name: string };

export function JoinOrCreate({
  onDone,
  initialMode = 'choose',
  createCta,
  namePlaceholder,
  nameDefault,
}: {
  onDone: (household: JoinOrCreateResult) => void;
  initialMode?: Mode;
  /** 고르기 화면의 만들기 버튼 글귀 — 온보딩은 "첫 공간", 추가는 "새 공간" */
  createCta?: string;
  namePlaceholder?: string;
  /** 첫 공간은 "우리집" 이 기본값이지만, 두 번째 공간은 빈 칸이 맞다 */
  nameDefault?: string;
}) {
  const { c } = useTheme();
  const t = useT();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState(() => nameDefault ?? '');
  const [code, setCode] = useState('');

  const create = useCreateHousehold();
  const join = useAcceptInvite();

  async function onCreate() {
    if (!name.trim()) return;
    try {
      const h = await create.mutateAsync(name.trim());
      onDone({ id: h.id, name: h.name });
    } catch (e) {
      Alert.alert(t.onboarding.createFailed, e instanceof Error ? e.message : t.common.tryAgain);
    }
  }

  async function onJoin() {
    if (!code.trim()) return;
    try {
      const h = await join.mutateAsync(code);
      onDone({ id: h.id, name: h.name });
    } catch (e) {
      Alert.alert(t.onboarding.joinFailed, e instanceof Error ? e.message : t.onboarding.joinFailedBody);
    }
  }

  if (mode === 'choose') {
    return (
      <View style={s.stack}>
        <Text style={[s.title, { color: c.text }]}>{t.onboarding.chooseTitle}</Text>
        <Text style={[s.sub, { color: c.textMuted }]}>{t.onboarding.chooseSub}</Text>
        <Button label={createCta ?? t.onboarding.createCta} onPress={() => setMode('create')} />
        <Button label={t.onboarding.joinCta} onPress={() => setMode('join')} variant="secondary" />
      </View>
    );
  }

  if (mode === 'create') {
    return (
      <View style={s.stack}>
        <Text style={[s.title, { color: c.text }]}>{t.onboarding.nameTitle}</Text>
        <Text style={[s.sub, { color: c.textMuted }]}>{t.onboarding.nameSub}</Text>
        <Field
          value={name}
          onChangeText={setName}
          placeholder={namePlaceholder ?? t.onboarding.namePlaceholder}
          autoFocus
          editable={!create.isPending}
        />
        <Button label={t.onboarding.create} onPress={onCreate} busy={create.isPending} />
        <TextButton label={t.common.back} onPress={() => setMode('choose')} style={s.link} />
      </View>
    );
  }

  return (
    <View style={s.stack}>
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
    </View>
  );
}

const s = StyleSheet.create({
  stack: { gap: space.md },
  /** 화면 제목은 `Screen` 과 같은 값을 쓴다 — 온보딩만 헤더가 없을 뿐이다 */
  title: titleText,
  sub: { fontSize: type.body, marginBottom: space.md },
  /** 초대 코드는 한 글자씩 읽는다 — 크게, 벌려서, 폭이 고르게 */
  codeInput: { fontSize: type.title, letterSpacing: tracking.code, textAlign: 'center', fontVariant: ['tabular-nums'] },
  link: { alignSelf: 'center', paddingVertical: space.sm },
});
