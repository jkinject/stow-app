import { useEffect, useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { IconBoxes } from '@/components/Icon';
import { ThumbRow } from '@/components/ThumbRow';
import { Button, Empty, Loading, Screen, SectionLabel } from '@/components/ui';
import { useHousehold } from '@/features/household/context';
import { useRestore, useTrash, type TrashRow } from '@/features/history/api';
import { useThumbUrls } from '@/features/item/thumbs';
import { useT } from '@/lib/i18n';
import { useTheme, type, space, leading } from '@/lib/theme';

/**
 * 휴지통 (AC24).
 *
 * 지운 것은 `deleted_at` 만 채워져 30일 남아 있다. 여기서 되돌린다.
 * 30일 뒤 pg_cron 이 하드삭제하고, 그때 Storage 사진도 함께 정리된다.
 */
export default function TrashScreen() {
  const { c } = useTheme();
  const t = useT();
  const { activeId } = useHousehold();

  const trash = useTrash(activeId);
  const restore = useRestore(activeId);

  // ⚠ `trash.data ?? []` 를 그대로 쓰면 데이터가 없을 때 **매 렌더마다 새 빈 배열**이
  //   되어 아래 이펙트가 끝없이 돈다. 참조를 고정한다.
  const rows = useMemo(() => trash.data ?? [], [trash.data]);

  // 목록에 보이는 사진만 서명한다 — 찾기 탭과 같은 캐시를 쓴다
  const thumbs = useThumbUrls();
  useEffect(() => {
    thumbs.ensure(rows.map((r) => r.thumb_path));
  }, [rows, thumbs]);

  function onRestore(row: TrashRow) {
    const go = async () => {
      try {
        await restore.mutateAsync(row);
      } catch (e) {
        Alert.alert(t.trash.restoreFailed, e instanceof Error ? e.message : t.common.tryAgain);
      }
    };
    // 박스 복구는 기대와 다르게 동작한다 — 미리 말해 준다
    if (row.kind === 'container') {
      Alert.alert(t.trash.restore, t.trash.boxRestoreNote, [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.trash.restore, onPress: () => void go() },
      ]);
    } else {
      void go();
    }
  }

  const kindLabel = (k: TrashRow['kind']) =>
    k === 'item' ? t.trash.kindItem : k === 'container' ? t.trash.kindContainer : t.trash.kindLocation;

  return (
    <Screen back title={t.trash.title}>
      <View style={st.body}>
        {trash.isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty text={t.trash.none} hint={t.trash.noneHint} />
        ) : (
          <>
            <Text style={[st.hint, { color: c.textFaint }]}>{t.trash.hint}</Text>
            <SectionLabel>{t.trash.section(rows.length)}</SectionLabel>
            {rows.map((row) => (
              /* ⚠ 이름만으로는 무엇을 지웠는지 알 수 없다(사용자 보고).
                 목록의 다른 화면과 **같은 ThumbRow** 를 써서 사진을 보여준다.
                 장소는 사진 컬럼이 없으므로 조용한 아이콘으로 대신한다. */
              <ThumbRow
                key={`${row.kind}-${row.id}`}
                title={row.name}
                subtitle={kindLabel(row.kind)}
                caption={t.trash.deletedAt(formatWhen(row.deleted_at, t))}
                thumb={thumbs.get(row.thumb_path)}
                fallback={<IconBoxes color={c.textFaint} size={20} />}
                meta={
                  <View style={st.action}>
                    <Button
                      label={restore.isPending ? t.trash.restoring : t.trash.restore}
                      onPress={() => onRestore(row)}
                      variant="secondary"
                      busy={restore.isPending}
                    />
                  </View>
                }
              />
            ))}
          </>
        )}
      </View>
    </Screen>
  );
}

function formatWhen(iso: string, t: ReturnType<typeof useT>): string {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return t.time.justNow;
  if (mins < 60) return t.time.minutesAgo(mins);
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t.time.hoursAgo(hrs);
  const days = Math.floor(hrs / 24);
  if (days < 7) return t.time.daysAgo(days);
  return t.time.date(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

const st = StyleSheet.create({
  body: { paddingHorizontal: space.xl, gap: space.sm },
  hint: { fontSize: type.caption, lineHeight: leading.caption },
  action: { width: 96 },
});
