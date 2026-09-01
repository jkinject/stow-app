import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { IconTrash } from '@/components/Icon';
import { KeyboardSpacer } from '@/components/KeyboardSpacer';
import { Button, Empty, Field, Loading, Screen, SectionLabel } from '@/components/ui';
import {
  isDuplicateName,
  useCategoryList,
  useCreateCategory,
  useDeleteCategory,
  useRenameCategory,
  type Category,
} from '@/features/category/api';
import { useHousehold } from '@/features/household/context';
import { useT } from '@/lib/i18n';
import { radius, type, useTheme, space } from '@/lib/theme';

/**
 * 카테고리 관리 (AC-C1~C6).
 *
 * 이름은 줄에서 바로 고친다 — 물건 상세와 같은 방식(포커스를 벗어날 때 저장)으로 맞췄다.
 * 각 줄에 **쓰는 물건 수**를 보여준다: 지우기 전에 영향 범위를 알아야 한다(AC-C6).
 */
export default function CategoriesScreen() {
  const t = useT();
  const { activeId } = useHousehold();

  const list = useCategoryList(activeId);
  const create = useCreateCategory(activeId);
  const remove = useDeleteCategory();

  const [name, setName] = useState('');

  async function onAdd() {
    const n = name.trim();
    if (!n) return;
    try {
      await create.mutateAsync(n);
      setName('');
    } catch (e) {
      // 중복은 DB 가 판정한다 — 클라이언트가 먼저 검사하면 동시 생성에서 새어 나간다
      Alert.alert(
        t.category.addFailed,
        isDuplicateName(e) ? t.category.duplicate : e instanceof Error ? e.message : t.common.tryAgain,
      );
    }
  }

  function onDelete(row: Category) {
    Alert.alert(
      t.category.deleteTitle(row.name),
      // ⚠ 연결된 물건이 없으면 본문을 넘기지 않는다 — 제목만으로 충분하다
      row.item_count > 0 ? t.category.deleteBodyUsed(row.item_count) : undefined,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: async () => {
            try {
              await remove.mutateAsync(row.id);
            } catch (e) {
              Alert.alert(t.category.deleteFailed, e instanceof Error ? e.message : t.common.tryAgain);
            }
          },
        },
      ],
    );
  }

  const rows = list.data ?? [];

  return (
    <Screen back scroll={false} title={t.category.title}>
      <KeyboardSpacer style={st.flex}>
        <View style={st.body}>
          <View style={st.addRow}>
            <Field
              value={name}
              onChangeText={setName}
              placeholder={t.category.namePlaceholder}
              onSubmitEditing={() => void onAdd()}
              returnKeyType="done"
              wrapStyle={st.flex}
            />
            <View style={st.addBtn}>
              <Button
                label={t.common.add}
                onPress={() => void onAdd()}
                busy={create.isPending}
                disabled={!name.trim()}
              />
            </View>
          </View>

          {list.isLoading ? (
            <Loading />
          ) : rows.length === 0 ? (
            <Empty text={t.category.none} hint={t.category.noneHint} />
          ) : (
            <>
              <SectionLabel>{t.category.section(rows.length)}</SectionLabel>
              <View style={st.list}>
                {rows.map((row) => (
                  <CategoryRow key={row.id} row={row} onDelete={() => onDelete(row)} />
                ))}
              </View>
            </>
          )}
        </View>
      </KeyboardSpacer>
    </Screen>
  );
}

/** 이름을 그 자리에서 고친다 — 포커스를 벗어날 때, 바뀐 경우에만 저장 */
function CategoryRow({ row, onDelete }: { row: Category; onDelete: () => void }) {
  const { c } = useTheme();
  const t = useT();
  const rename = useRenameCategory();
  const [draft, setDraft] = useState(row.name);

  async function commit() {
    const next = draft.trim();
    if (!next || next === row.name.trim()) {
      if (!next) setDraft(row.name); // 비우면 되돌린다 — 이름 없는 카테고리는 없다
      return;
    }
    try {
      await rename.mutateAsync({ id: row.id, name: next });
    } catch (e) {
      setDraft(row.name);
      Alert.alert(
        t.category.renameFailed,
        isDuplicateName(e) ? t.category.duplicate : e instanceof Error ? e.message : t.common.tryAgain,
      );
    }
  }

  return (
    <View style={[st.row, { backgroundColor: c.card }]}>
      <View style={st.rowMain}>
        <Field value={draft} onChangeText={setDraft} onBlur={() => void commit()} />
        <Text style={[st.count, { color: c.textFaint }]}>{t.category.itemCount(row.item_count)}</Text>
      </View>
      <Pressable onPress={onDelete} hitSlop={10} style={st.del}>
        <IconTrash color={c.danger} size={20} />
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingHorizontal: space.xl, gap: space.md, flex: 1 },
  addRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  addBtn: { width: 84 },
  list: { gap: space.sm },
  row: {
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  rowMain: { flex: 1, gap: space.xs },
  count: { fontSize: type.caption, paddingLeft: space.xs },
  del: { padding: space.sm },
});
