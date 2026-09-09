import { StyleSheet, View } from 'react-native';

import { TextButton } from '@/components/ui';
import { JoinOrCreate } from '@/features/household/JoinOrCreate';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useTheme, space } from '@/lib/theme';

/**
 * 첫 공간 만들기 — 가구가 0개일 때만 뜬다(`_layout.tsx` Guard).
 *
 * ⚠ 폼은 `JoinOrCreate` 한 벌이다 (2026-09-09). 두 번째 공간을 만드는 `/space/new` 와
 *   같은 것을 쓴다. 성공하면 가구 목록이 무효화되고 가드가 홈으로 보내므로 여기서
 *   따로 이동하지 않는다.
 */
export default function Onboarding() {
  const { signOut } = useAuth();
  const { c } = useTheme();
  const t = useT();

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      <JoinOrCreate onDone={() => {}} nameDefault={t.onboarding.nameDefault} />
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
  root: { flex: 1, justifyContent: 'center', paddingHorizontal: space.xxxl },
  signOut: { position: 'absolute', bottom: space.giant, alignSelf: 'center' },
});
