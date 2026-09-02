import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Empty, Field, Loading, Screen } from '@/components/ui';
import {
  isDuplicateName,
  useCategoryList,
  useCreateCategory,
  useDeleteCategory,
  useReorderCategories,
  useUpdateCategory,
  type Category,
  type CategoryDraft,
} from '@/features/category/api';
import { CategorySheet } from '@/features/category/CategorySheet';
import { useHousehold } from '@/features/household/context';
import { useT } from '@/lib/i18n';
import { leading, overlay, radius, space, tinted, tracking, type, useTheme } from '@/lib/theme';

/**
 * 카테고리 관리 (2026-09-03 개편 — 사용자 레퍼런스 이미지).
 *
 * 전에는 이름만 있는 글자 줄 목록이었다. 지금은 카테고리마다 **색 · 아이콘 · 설명**이
 * 있고, 검색과 순서 바꾸기가 된다. 분류는 훑어보며 하는 일이라 색과 그림이 있으면
 * 읽지 않고도 찾는다.
 *
 * ⚠ 화면 안에서 지우는 길과 고치는 길이 **한 곳**(줄 오른쪽 메뉴)으로 모인다. 예전처럼
 *   길게 누르기 같은 숨은 동작에 걸어 두면 아무도 못 찾는다.
 */

/** 팁 카드를 닫았는지. 한 번 닫으면 다시 안 띄운다 */
const TIP_KEY = 'home-store.category-tip-hidden';

export default function CategoriesScreen() {
  const { c } = useTheme();
  const t = useT();
  const { activeId } = useHousehold();

  const list = useCategoryList(activeId);
  const create = useCreateCategory(activeId);
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const reorder = useReorderCategories();

  const [q, setQ] = useState('');
  const [reordering, setReordering] = useState(false);
  const [sheet, setSheet] = useState<{ open: boolean; edit: Category | null }>({
    open: false,
    edit: null,
  });

  /**
   * 순서를 바꾸는 동안의 **화면용 순서**.
   *
   * ⚠ 서버 응답을 기다렸다 다시 그리면 버튼을 눌러도 한참 뒤에 움직인다. 여기서 먼저
   *   바꾸고 저장을 뒤로 보낸다. 저장이 실패하면 `onSettled` 의 무효화가 서버 순서로
   *   되돌린다 — 되돌릴 값을 우리가 따로 들고 있지 않는다.
   */
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);

  const rows = useMemo(() => {
    const base = list.data ?? [];
    if (!localOrder) return base;
    const byId = new Map(base.map((r) => [r.id, r]));
    const out = localOrder.map((id) => byId.get(id)).filter((r): r is Category => !!r);
    // 목록이 새로 와서 내가 모르는 카테고리가 생겼으면 뒤에 붙인다
    for (const r of base) if (!localOrder.includes(r.id)) out.push(r);
    return out;
  }, [list.data, localOrder]);

  /** ⚠ 순서 편집 중에는 거르지 않는다 — 걸러진 목록에서 옮기면 안 보이는 이웃과 자리가 바뀐다 */
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || reordering) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) || r.description.toLowerCase().includes(needle),
    );
  }, [rows, q, reordering]);

  const [tipHidden, setTipHidden] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(TIP_KEY)
      .then((v) => alive && setTipHidden(v === '1'))
      .catch(() => alive && setTipHidden(false));
    return () => {
      alive = false;
    };
  }, []);
  const hideTip = useCallback(() => {
    setTipHidden(true);
    void AsyncStorage.setItem(TIP_KEY, '1').catch(() => undefined);
  }, []);

  function onSave(draft: CategoryDraft) {
    const editing = sheet.edit;
    const done = () => setSheet({ open: false, edit: null });
    const fail = (e: unknown) =>
      Alert.alert(
        isDuplicateName(e) ? t.category.duplicate : t.category.saveFailed,
        isDuplicateName(e) ? '' : e instanceof Error ? e.message : t.common.tryAgain,
      );

    if (editing) update.mutate({ id: editing.id, ...draft }, { onSuccess: done, onError: fail });
    else create.mutate(draft, { onSuccess: done, onError: fail });
  }

  function onRowMenu(row: Category) {
    Alert.alert(row.name, row.description || undefined, [
      { text: t.category.edit, onPress: () => setSheet({ open: true, edit: row }) },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: () => onDelete(row),
      },
      { text: t.common.cancel, style: 'cancel' },
    ]);
  }

  function onDelete(row: Category) {
    Alert.alert(
      t.category.deleteTitle(row.name),
      // ⚠ 연결된 물건이 없으면 본문을 아예 띄우지 않는다 (기존 판단 유지)
      row.item_count > 0 ? t.category.deleteBodyUsed(row.item_count) : undefined,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: () =>
            remove.mutate(row.id, {
              onError: (e) =>
                Alert.alert(
                  t.category.deleteFailed,
                  e instanceof Error ? e.message : t.common.tryAgain,
                ),
            }),
        },
      ],
    );
  }

  function move(index: number, delta: number) {
    const next = rows.map((r) => r.id);
    const to = index + delta;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    setLocalOrder(next);
    reorder.mutate(next);
  }

  return (
    <Screen
      back
      title={t.category.manage}
      subtitle={t.category.manageHint}
      action={
        <Pressable
          onPress={() => setSheet({ open: true, edit: null })}
          style={({ pressed }) => [
            st.addBtn,
            { backgroundColor: c.accent },
            pressed && { opacity: 0.8 },
          ]}
        >
          <MaterialCommunityIcons name="plus" size={16} color={c.onAccent} />
          <Text style={[st.addText, { color: c.onAccent }]}>{t.category.add}</Text>
        </Pressable>
      }
    >
      <View style={st.body}>
        <Field
          value={q}
          onChangeText={setQ}
          placeholder={t.category.searchPlaceholder}
          autoCorrect={false}
          clearable
          leading={<MaterialCommunityIcons name="magnify" size={18} color={c.textFaint} />}
        />

        <View style={st.meta}>
          <Text style={[st.metaText, { color: c.textFaint }]}>
            {t.category.countAll(rows.length)}
          </Text>
          {rows.length > 1 && (
            <Pressable
              onPress={() => setReordering((v) => !v)}
              hitSlop={10}
              style={({ pressed }) => [st.reorderBtn, pressed && { opacity: 0.6 }]}
            >
              <MaterialCommunityIcons
                name={reordering ? 'check' : 'swap-vertical'}
                size={15}
                color={reordering ? c.accentText : c.textMuted}
              />
              <Text
                style={[st.metaText, { color: reordering ? c.accentText : c.textMuted, fontWeight: '700' }]}
              >
                {reordering ? t.category.reorderDone : t.category.reorder}
              </Text>
            </Pressable>
          )}
        </View>

        {list.isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty text={t.category.none} hint={t.category.noneHint} />
        ) : visible.length === 0 ? (
          <Empty text={t.category.noMatch(q.trim())} />
        ) : (
          visible.map((row, i) => (
            <Row
              key={row.id}
              row={row}
              reordering={reordering}
              first={i === 0}
              last={i === visible.length - 1}
              onPress={() => setSheet({ open: true, edit: row })}
              onMenu={() => onRowMenu(row)}
              onMove={(d) => move(i, d)}
            />
          ))
        )}

        {/*
          ⚠ 팁은 **목록 끝**에 둔다. 위에 두면 매번 지나가야 하는 벽이 된다.
            닫으면 기기에 기억해 다시 띄우지 않는다.
        */}
        {tipHidden === false && rows.length > 0 && (
          <View style={[st.tip, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[st.tipIcon, { backgroundColor: c.sunk }]}>
              <MaterialCommunityIcons name="lightbulb-on-outline" size={20} color={c.accentText} />
            </View>
            <View style={st.flex}>
              <Text style={[st.tipTitle, { color: c.text }]}>{t.category.tipTitle}</Text>
              <Text style={[st.tipBody, { color: c.textMuted }]}>{t.category.tipBody}</Text>
            </View>
            <Pressable onPress={hideTip} hitSlop={12} accessibilityLabel={t.category.tipClose}>
              <MaterialCommunityIcons name="close" size={18} color={c.textFaint} />
            </Pressable>
          </View>
        )}
      </View>

      <CategorySheet
        visible={sheet.open}
        initial={
          sheet.edit
            ? {
                id: sheet.edit.id,
                name: sheet.edit.name,
                description: sheet.edit.description,
                color: sheet.edit.color,
                icon: sheet.edit.icon,
              }
            : null
        }
        busy={create.isPending || update.isPending}
        onClose={() => setSheet({ open: false, edit: null })}
        onSave={onSave}
      />
    </Screen>
  );
}

/* ───────────────────────────── 한 줄 ───────────────────────────── */

function Row({
  row,
  reordering,
  first,
  last,
  onPress,
  onMenu,
  onMove,
}: {
  row: Category;
  reordering: boolean;
  first: boolean;
  last: boolean;
  onPress: () => void;
  onMenu: () => void;
  onMove: (delta: number) => void;
}) {
  const { c } = useTheme();
  const t = useT();

  return (
    <Pressable
      onPress={reordering ? undefined : onPress}
      style={({ pressed }) => [
        st.row,
        { backgroundColor: c.card, borderColor: c.border },
        pressed && !reordering && { opacity: 0.75 },
      ]}
    >
      <View style={[st.tile, { backgroundColor: row.color }]}>
        <MaterialCommunityIcons name={row.icon} size={26} color={overlay.fg} />
      </View>

      <View style={st.flex}>
        <View style={st.nameRow}>
          <Text style={[st.name, { color: c.text }]} numberOfLines={1}>
            {row.name}
          </Text>
          {/*
            ⚠ 개수 배지에 **그 카테고리의 색**을 옅게 깐다. 배지가 전부 같은 회색이면
              어느 줄을 보고 있었는지 눈이 놓친다. 글자는 색 자체로 둔다.
            ⚠ 직접 이어 붙이지 않고 `tinted` 를 쓴다 — 6자리가 아닌 값이 오면 깨진 색이
              나온다(그 함정의 근거는 lib/theme 의 주석에).
          */}
          <View style={[st.badge, { backgroundColor: tinted(row.color, '26', c.sunk) }]}>
            <Text style={[st.badgeText, { color: row.color }]}>{row.item_count}</Text>
          </View>
        </View>
        {!!row.description && (
          <Text style={[st.desc, { color: c.textMuted }]} numberOfLines={2}>
            {row.description}
          </Text>
        )}
      </View>

      {reordering ? (
        <View style={st.moveCol}>
          <Pressable
            onPress={() => onMove(-1)}
            disabled={first}
            hitSlop={8}
            accessibilityLabel={t.category.moveUp}
            style={({ pressed }) => [st.moveBtn, (pressed || first) && { opacity: 0.3 }]}
          >
            <MaterialCommunityIcons name="chevron-up" size={22} color={c.text} />
          </Pressable>
          <Pressable
            onPress={() => onMove(1)}
            disabled={last}
            hitSlop={8}
            accessibilityLabel={t.category.moveDown}
            style={({ pressed }) => [st.moveBtn, (pressed || last) && { opacity: 0.3 }]}
          >
            <MaterialCommunityIcons name="chevron-down" size={22} color={c.text} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={onMenu}
          hitSlop={12}
          accessibilityLabel={t.category.edit}
          style={({ pressed }) => [st.menuBtn, pressed && { opacity: 0.5 }]}
        >
          <MaterialCommunityIcons name="dots-vertical" size={20} color={c.textFaint} />
        </Pressable>
      )}
    </Pressable>
  );
}

const TILE = 52;

const st = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingHorizontal: space.xl, gap: space.md },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  addText: { fontSize: type.caption, fontWeight: '800' },

  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaText: { fontSize: type.caption },
  reorderBtn: { flexDirection: 'row', alignItems: 'center', gap: space.xs },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.lg,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { flexShrink: 1, fontSize: type.bodyStrong, fontWeight: '800', letterSpacing: tracking.tight },
  badge: { borderRadius: radius.xs, paddingHorizontal: space.sm, paddingVertical: 2 },
  badgeText: { fontSize: type.tiny, fontWeight: '800', fontVariant: ['tabular-nums'] },
  desc: { fontSize: type.small, lineHeight: leading.small, marginTop: space.xs },

  menuBtn: { padding: space.xs },
  moveCol: { gap: space.xs },
  moveBtn: { padding: space.xs },

  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.lg,
    marginTop: space.sm,
  },
  tipIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipTitle: { fontSize: type.label, fontWeight: '800' },
  tipBody: { fontSize: type.small, lineHeight: leading.small, marginTop: space.xs },
});
