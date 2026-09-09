import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useToast } from '@/components/Toast';
import { Screen } from '@/components/ui';
import { useHousehold } from '@/features/household/context';
import { JoinOrCreate } from '@/features/household/JoinOrCreate';
import { useT } from '@/lib/i18n';
import { space } from '@/lib/theme';

/**
 * 공간 추가 — 두 번째 이후의 공간을 만들거나 초대 코드로 참여한다 (2026-09-09).
 *
 * 폼은 온보딩과 같은 `JoinOrCreate` 다. 다른 점은 끝난 뒤뿐이다: 새 공간을 **활성으로**
 * 바꾸고 홈으로 간다. 만든 공간이 비어 있는 화면을 바로 보여 줘야 "됐구나" 가 된다.
 *
 * ⚠ `replace` 다. 뒤로가기로 이 화면에 돌아와 같은 공간을 또 만들면 안 된다.
 */
export default function NewSpace() {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const { setActiveId } = useHousehold();

  return (
    <Screen back title={t.space.add}>
      <View style={st.body}>
        <JoinOrCreate
          createCta={t.space.create}
          namePlaceholder={t.space.namePlaceholder}
          onDone={(h) => {
            setActiveId(h.id);
            router.replace('/');
            toast(t.space.switched(h.name));
          }}
        />
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingTop: space.xl },
});
