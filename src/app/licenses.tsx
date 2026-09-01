import * as WebBrowser from 'expo-web-browser';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';

import { Screen } from '@/components/ui';
import { useT } from '@/lib/i18n';
import LICENSES from '@/lib/licenses.json';
import { radius, space, type, useTheme } from '@/lib/theme';

/**
 * 오픈소스 라이선스 고지.
 *
 * 목록은 `npm run licenses` 가 **프로덕션 의존성만** 훑어 만든다
 * (devDependencies 는 배포물에 안 들어가므로 고지 대상이 아니다).
 *
 * ⚠ 라이선스 전문을 패키지마다 싣지 않는다. 568개면 수 MB 이고 대부분 같은 MIT
 *   문구가 저작권자만 바꿔 반복된다. MIT·BSD 계열이 실제로 요구하는 것은
 *   **저작권 표기의 보존**이라, 그 줄과 원본 저장소 주소를 남긴다.
 */

type Entry = { name: string; version: string; license: string; copyright: string | null; url: string | null };

const ALL = LICENSES as Entry[];

export default function LicensesScreen() {
  const { c } = useTheme();
  const t = useT();

  // 라이선스 종류별로 묶어 보여준다 — 568줄을 그냥 늘어놓으면 훑을 수가 없다.
  // 흔한 종류가 위로 오게 개수 내림차순.
  const rows = useMemo(() => {
    const byLicense = new Map<string, Entry[]>();
    for (const e of ALL) {
      const k = e.license || 'UNKNOWN';
      (byLicense.get(k) ?? byLicense.set(k, []).get(k)!).push(e);
    }
    const out: ({ kind: 'header'; license: string; count: number } | ({ kind: 'pkg' } & Entry))[] = [];
    for (const [license, list] of [...byLicense].sort((a, b) => b[1].length - a[1].length)) {
      out.push({ kind: 'header', license, count: list.length });
      for (const e of list.sort((a, b) => a.name.localeCompare(b.name))) out.push({ kind: 'pkg', ...e });
    }
    return out;
  }, []);

  return (
    <Screen back scroll={false} title={t.licenses.title}>
      <FlatList
        data={rows}
        keyExtractor={(r, i) => (r.kind === 'header' ? `h:${r.license}` : `p:${r.name}:${i}`)}
        contentContainerStyle={st.list}
        ListHeaderComponent={
          <Text style={[st.intro, { color: c.textMuted }]}>{t.licenses.intro(ALL.length)}</Text>
        }
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <Text style={[st.group, { color: c.textFaint }]}>
              {item.license} · {item.count}
            </Text>
          ) : (
            <Pressable
              disabled={!item.url}
              onPress={() => item.url && void WebBrowser.openBrowserAsync(item.url)}
              style={({ pressed }) => [st.row, { backgroundColor: c.card }, pressed && st.pressed]}
            >
              <Text style={[st.name, { color: c.text }]}>
                {item.name} <Text style={[st.version, { color: c.textFaint }]}>{item.version}</Text>
              </Text>
              {item.copyright ? (
                <Text style={[st.copyright, { color: c.textMuted }]} numberOfLines={2}>
                  {item.copyright}
                </Text>
              ) : null}
            </Pressable>
          )
        }
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  list: { paddingHorizontal: space.xl, paddingBottom: space.giant, gap: space.sm },
  intro: { fontSize: type.small, lineHeight: 20, paddingBottom: space.md },
  group: { fontSize: type.small, fontWeight: '700', paddingTop: space.lg, paddingBottom: space.xs },
  row: { borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.md, gap: space.xs },
  pressed: { opacity: 0.6 },
  name: { fontSize: type.label, fontWeight: '600' },
  version: { fontSize: type.tiny, fontWeight: '400' },
  copyright: { fontSize: type.tiny, lineHeight: 16 },
});
