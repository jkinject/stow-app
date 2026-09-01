import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThumbRow } from '@/components/ThumbRow';
import { Empty, Loading, Screen, SectionLabel } from '@/components/ui';
import { useHousehold } from '@/features/household/context';
import { useThumbUrls } from '@/features/item/thumbs';
import { useRemoveFromShopping, useShoppingList } from '@/features/shopping/api';
import { useT } from '@/lib/i18n';
import { useTheme, type, radius } from '@/lib/theme';

/**
 * 살 것 (AC16 · AC18).
 *
 * 이 화면은 **읽는 화면**이다. 편입·해제는 DB 트리거가 수량 변화에 따라 처리한다.
 * 사용자가 여기서 하는 일은 두 가지뿐이다: 구매 링크로 나가기, 사 온 것을 채우기.
 *
 * "사 왔음" 버튼을 따로 두지 않았다(AC19 제외, 사용자 결정). 물건을 눌러 상세로 가서
 * 수량을 올리면 트리거가 목록에서 알아서 뺀다 — 실제로 몇 개를 채웠는지도 함께 기록된다.
 */
export default function ShoppingTab() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { activeId } = useHousehold();

  const list = useShoppingList(activeId);
  const remove = useRemoveFromShopping();
  const thumbs = useThumbUrls();

  const rows = list.data ?? [];

  // ⚠ 의존성은 `rows` 가 아니라 `list.data` 다. `?? []` 가 매 렌더 새 배열을 만든다.
  useEffect(() => {
    thumbs.ensure((list.data ?? []).map((r) => r.item?.thumb_path ?? null));
  }, [list.data, thumbs]);

  const auto = rows.filter((r) => r.added_reason === 'auto_threshold');
  const manual = rows.filter((r) => r.added_reason === 'manual');

  async function openLink(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(t.shopping.linkFailed, url);
    }
  }

  return (
    <Screen title={t.shopping.title}>
      <View style={st.body}>
        {list.isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty
            text={t.shopping.none}
            hint={t.shopping.noneHint}
          />
        ) : (
          <>
            {auto.length > 0 && (
              <>
                <SectionLabel>{t.shopping.autoSection(auto.length)}</SectionLabel>
                {auto.map((r) => (
                  <ShoppingCard
                    key={r.id}
                    row={r}
                    thumb={thumbs.get(r.item?.thumb_path ?? null)}
                    onOpen={() => router.push(`/item/${r.item_id}`)}
                    onLink={openLink}
                  />
                ))}
              </>
            )}

            {manual.length > 0 && (
              <>
                <SectionLabel>{t.shopping.manualSection(manual.length)}</SectionLabel>
                {manual.map((r) => (
                  <ShoppingCard
                    key={r.id}
                    row={r}
                    thumb={thumbs.get(r.item?.thumb_path ?? null)}
                    onOpen={() => router.push(`/item/${r.item_id}`)}
                    onLink={openLink}
                    onRemove={() => remove.mutate(r.id)}
                  />
                ))}
              </>
            )}

            <Text style={[st.footNote, { color: c.textFaint }]}>
              {t.shopping.footNote}
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}

function ShoppingCard({
  row,
  thumb,
  onOpen,
  onLink,
  onRemove,
}: {
  row: import('@/features/shopping/api').ShoppingRow;
  thumb?: import('expo-image').ImageSource;
  onOpen: () => void;
  onLink: (url: string) => void;
  onRemove?: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const it = row.item;
  if (!it) return null;

  return (
    <View style={st.card}>
      <ThumbRow
        title={it.name}
        subtitle={t.shopping.remaining(it.quantity)}
        thumb={thumb}
        onPress={onOpen}
        meta={
          it.quantity === 0 ? <Text style={[st.zero, { color: c.danger }]}>{t.shopping.outOfStock}</Text> : undefined
        }
      />
      <View style={st.actions}>
        {/* AC18 — 구매 링크는 외부 브라우저로 연다 */}
        {it.purchase_url ? (
          <Pressable
            onPress={() => onLink(it.purchase_url!)}
            style={({ pressed }) => [
              st.actionBtn,
              { borderColor: c.accent },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={[st.actionText, { color: c.accentText }]}>{t.shopping.buy}</Text>
          </Pressable>
        ) : (
          <Text style={[st.noLink, { color: c.textFaint }]}>
            {t.shopping.noLink}
          </Text>
        )}
        {onRemove && (
          <Pressable onPress={onRemove} hitSlop={8} style={st.removeBtn}>
            <Text style={[st.actionText, { color: c.textMuted }]}>{t.shopping.removeFromList}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  body: { paddingHorizontal: 20, gap: 10 },
  card: { gap: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 64 },
  actionBtn: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 7 },
  actionText: { fontSize: type.small, fontWeight: '600' },
  removeBtn: { paddingHorizontal: 8, paddingVertical: 7 },
  noLink: { fontSize: type.tiny, flex: 1, lineHeight: 16 },
  zero: { fontSize: type.small, fontWeight: '700' },
  footNote: { fontSize: type.caption, textAlign: 'center', paddingTop: 18, lineHeight: 18 },
});
