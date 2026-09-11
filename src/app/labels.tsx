import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { IconCheck } from '@/components/Icon';
import { Button, Empty, Loading, Screen, SectionLabel, TextButton } from '@/components/ui';
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

  /**
   * 사용자가 인쇄 대화상자를 닫은 것은 오류가 아니다.
   * expo-print 는 iOS 에서 취소를 `PrintIncompleteException`("Printing did not complete",
   * code ERR_PRINT_INCOMPLETE) 로 reject 한다 — 메시지에 cancel 이 없어서 문구만 보고
   * 거르면 "라벨을 만들지 못했어요" 경고가 떠 사용자를 겁준다. code 를 먼저 보고,
   * 공유 시트 닫기(cancel/dismiss) 문구도 같이 거른다.
   */
  function isPrintCancelled(e: unknown): boolean {
    const code = (e as { code?: unknown } | null)?.code;
    if (code === 'ERR_PRINT_INCOMPLETE') return true;
    const msg = e instanceof Error ? e.message : String(e);
    return /Printing did not complete|cancel|dismiss/i.test(msg);
  }

  async function run(mode: 'print' | 'share') {
    if (busy || count === 0) return;
    setBusy(true);
    try {
      const html = buildLabelSheetHtml(buildLabels());
      // 용지 크기를 명시하지 않으면 두 경로 모두 US Letter(792pt) 로 렌더링한다.
      // A4 시트(842pt)가 한 장에 못 들어가 인쇄 미리보기에 빈 2페이지가 딸려 나오고,
      // PDF 는 오른쪽 열·아래 행이 잘린다.
      if (mode === 'print') {
        await Print.printAsync({ html, ...A4_PT });
      } else {
        const { uri } = await Print.printToFileAsync({ html, ...A4_PT });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
        } else {
          Alert.alert(t.labels.madePdf, uri);
        }
      }
    } catch (e) {
      if (!isPrintCancelled(e)) {
        Alert.alert(t.labels.failed, e instanceof Error ? e.message : String(e));
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
              <TextButton
                label={t.labels.selectAll}
                onPress={() => setPicked(new Set(list.map((x) => x.id)))}
              />
              <TextButton label={t.labels.clear} onPress={() => setPicked(new Set())} />
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
                      {on && <IconCheck size={14} color={c.onAccent} />}
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
  rowMain: { flex: 1, gap: space.xs },
  name: { fontSize: type.bodyStrong, fontWeight: '600' },
  loc: { fontSize: type.caption },
  footer: { borderTopWidth: 1, paddingTop: space.lg, gap: space.md, marginTop: space.xs },
  tally: { fontSize: type.small, textAlign: 'center' },
});
