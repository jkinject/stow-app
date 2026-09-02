import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, Loading, Screen, SectionLabel } from '@/components/ui';
import { useHousehold } from '@/features/household/context';
import { A4_PT, buildLabelSheetHtml, PER_PAGE, type LabelInput } from '@/features/qr/labels';
import { useAllContainers, useLocations } from '@/features/storage/api';
import { useT } from '@/lib/i18n';
import { useTheme, type, radius, space, leading } from '@/lib/theme';

/**
 * A4 라벨 시트 만들기 (AC11).
 *
 * 박스를 골라 한 장에 21개까지 찍는다. 21개를 넘기면 다음 장으로 넘어간다.
 * 남은 칸 수를 계속 보여 주는 이유: 종이 한 장을 꽉 채워 쓰게 하려는 것이다.
 */
export default function Labels() {
  const { c } = useTheme();
  const t = useT();
  const { activeId } = useHousehold();

  const containers = useAllContainers(activeId);
  const locations = useLocations(activeId);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const locName = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of locations.data ?? []) m.set(l.id, l.name);
    return m;
  }, [locations.data]);

  const list = containers.data ?? [];
  const count = picked.size;
  const pages = Math.ceil(count / PER_PAGE);
  const roomLeft = count === 0 ? PER_PAGE : (PER_PAGE - (count % PER_PAGE)) % PER_PAGE;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** 고른 순서가 아니라 **장소 → 이름** 순으로 배치한다. 같은 장소 라벨이 붙어 나와야 붙이기 편하다 */
  function buildLabels(): LabelInput[] {
    return list
      .filter((x) => picked.has(x.id))
      .map((x) => ({
        qrToken: x.qr_token,
        containerName: x.name,
        locationName: locName.get(x.location_id) ?? '',
      }))
      .sort((a, b) =>
        a.locationName === b.locationName
          ? a.containerName.localeCompare(b.containerName, 'ko')
          : a.locationName.localeCompare(b.locationName, 'ko'),
      );
  }

  async function run(mode: 'print' | 'share') {
    if (busy || count === 0) return;
    setBusy(true);
    try {
      const html = buildLabelSheetHtml(buildLabels());
      if (mode === 'print') {
        await Print.printAsync({ html });
      } else {
        // 용지 크기를 명시하지 않으면 US Letter 로 나와 A4 레이아웃이 잘린다
        const { uri } = await Print.printToFileAsync({ html, ...A4_PT });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
        } else {
          Alert.alert(t.labels.madePdf, uri);
        }
      }
    } catch (e) {
      // 인쇄 대화상자를 사용자가 닫은 것도 여기로 온다 — 오류로 겁주지 않는다
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel|dismiss/i.test(msg)) {
        Alert.alert(t.labels.failed, msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen back title={t.labels.title}>
      <View style={st.body}>
        <Text style={[st.intro, { color: c.textMuted }]}>
          {t.labels.intro}
        </Text>

        {containers.isLoading ? (
          <Loading />
        ) : list.length === 0 ? (
          <Empty text={t.labels.noBoxes} hint={t.labels.noBoxesHint} />
        ) : (
          <>
            <View style={st.bulk}>
              <Pressable onPress={() => setPicked(new Set(list.map((x) => x.id)))} hitSlop={8}>
                <Text style={[st.bulkText, { color: c.accentText }]}>{t.labels.selectAll}</Text>
              </Pressable>
              <Pressable onPress={() => setPicked(new Set())} hitSlop={8}>
                <Text style={[st.bulkText, { color: c.accentText }]}>{t.labels.clear}</Text>
              </Pressable>
            </View>

            <SectionLabel>{t.labels.boxCount(list.length)}</SectionLabel>
            <ScrollView style={st.scroll} contentContainerStyle={st.scrollInner} keyboardShouldPersistTaps="handled">
              {list.map((x) => {
                const on = picked.has(x.id);
                return (
                  <Pressable
                    key={x.id}
                    onPress={() => toggle(x.id)}
                    style={({ pressed }) => [
                      st.row,
                      { borderColor: on ? c.accent : c.border, backgroundColor: c.card },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <View
                      style={[
                        st.check,
                        { borderColor: on ? c.accent : c.border },
                        on && { backgroundColor: c.accent },
                      ]}
                    >
                      {on && <Text style={[st.checkMark, { color: c.onAccent }]}>✓</Text>}
                    </View>
                    <View style={st.rowMain}>
                      <Text style={[st.name, { color: c.text }]} numberOfLines={1}>
                        {x.name}
                      </Text>
                      <Text style={[st.loc, { color: c.textFaint }]} numberOfLines={1}>
                        {locName.get(x.location_id) ?? ''}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={[st.footer, { borderTopColor: c.border }]}>
              <Text style={[st.tally, { color: c.textMuted }]}>
                {count === 0
                  ? t.labels.pickSome
                  : t.labels.tally(count, pages, roomLeft)}
              </Text>
              {/* 아무것도 고르지 않았을 때 버튼이 멀쩡해 보이면 눌러 보고 아무 일도
                  안 일어나는 걸 겪는다. 못 누른다는 걸 눈으로 알려 준다. */}
              <Button
                label={busy ? t.labels.making : t.labels.print}
                onPress={() => void run('print')}
                busy={busy}
                disabled={count === 0}
              />
              <Button
                label={t.labels.sharePdf}
                onPress={() => void run('share')}
                variant="secondary"
                disabled={count === 0 || busy}
              />
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  body: { paddingHorizontal: space.xl, gap: space.md, flex: 1 },
  intro: { fontSize: type.label, lineHeight: leading.label },
  bulk: { flexDirection: 'row', gap: space.xl },
  bulkText: { fontSize: type.label, fontWeight: '600' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollInner: { gap: space.sm, paddingBottom: space.sm },
  row: {
    borderRadius: radius.sm,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: radius.xs,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { fontSize: type.body, fontWeight: '800' },
  rowMain: { flex: 1, gap: space.xs },
  name: { fontSize: type.bodyStrong, fontWeight: '600' },
  loc: { fontSize: type.caption },
  footer: { borderTopWidth: 1, paddingTop: space.lg, gap: space.md, marginTop: space.xs },
  tally: { fontSize: type.small, textAlign: 'center' },
});
