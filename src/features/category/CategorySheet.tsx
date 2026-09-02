import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardSpacer } from '@/components/KeyboardSpacer';
import { Button, Field } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { overlay, radius, space, tracking, type, useTheme } from '@/lib/theme';

import { ALL_ICONS, CATEGORY_COLORS, DEFAULT_COLOR, type IconName } from './icons';
import type { CategoryDraft } from './api';

/**
 * 카테고리 만들기·고치기 (2026-09-03 사용자 요청).
 *
 * ⚠ 추가와 수정이 **같은 시트**다. 두 벌로 만들면 색을 고르는 방식이 한쪽에만 생기는
 *   날이 온다 — 이 저장소에서 여러 번 겪은 일이다. 다른 것은 제목과 초기값뿐이다.
 *
 * ⚠ 맨 위에 **미리보기 타일**을 둔다. 색과 아이콘은 골라 놓고도 함께 놓인 모습을 봐야
 *   판단이 된다. 목록에서 보게 될 것과 같은 모양으로 그린다.
 */
export function CategorySheet({
  visible,
  initial,
  busy,
  onClose,
  onSave,
}: {
  visible: boolean;
  /** null 이면 새로 만들기 */
  initial: (CategoryDraft & { id: string }) | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (draft: CategoryDraft) => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();

  /**
   * ⚠ `visible` 이 켜질 때마다 초기값으로 되돌려야 한다. 시트를 닫아도 컴포넌트는 살아
   *   있으므로, 지난번에 고치던 값이 다음 카테고리에 그대로 남는다.
   *   `key` 로 강제 재생성하는 대신 여기서 명시적으로 되돌린다 — 어느 쪽이든 되지만,
   *   되돌리는 지점이 코드에 보이는 편이 낫다.
   */
  const [seed, setSeed] = useState<string | null>(null);
  const nowSeed = visible ? (initial?.id ?? 'new') : null;
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [icon, setIcon] = useState<IconName>('shape-outline');

  if (nowSeed !== seed) {
    setSeed(nowSeed);
    setName(initial?.name ?? '');
    setDesc(initial?.description ?? '');
    setColor(initial?.color ?? DEFAULT_COLOR);
    setIcon(initial?.icon ?? 'shape-outline');
  }

  if (!visible) return null;

  const canSave = name.trim().length > 0 && !busy;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.backdrop}>
        <KeyboardSpacer style={st.flexEnd}>
          <View
            style={[
              st.sheet,
              { backgroundColor: c.bg, borderColor: c.border, paddingBottom: insets.bottom + space.lg },
            ]}
          >
            <View style={st.head}>
              <Text style={[st.title, { color: c.text }]}>
                {initial ? t.category.editTitle : t.category.newTitle}
              </Text>
              <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t.common.close}>
                <MaterialCommunityIcons name="close" size={22} color={c.textMuted} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={st.body}>
              {/* 미리보기 — 목록에서 보게 될 모습 그대로 */}
              <View style={st.preview}>
                <View style={[st.tile, { backgroundColor: color }]}>
                  <MaterialCommunityIcons name={icon} size={30} color={overlay.fg} />
                </View>
                <View style={st.flex}>
                  <Text style={[st.previewName, { color: c.text }]} numberOfLines={1}>
                    {name.trim() || t.category.nameLabel}
                  </Text>
                  <Text style={[st.previewDesc, { color: c.textMuted }]} numberOfLines={1}>
                    {desc.trim() || t.category.descPlaceholder}
                  </Text>
                </View>
              </View>

              <View style={st.group}>
                <Text style={[st.label, { color: c.textFaint }]}>{t.category.nameLabel}</Text>
                <Field
                  value={name}
                  onChangeText={setName}
                  placeholder={t.category.namePlaceholder}
                  autoFocus={!initial}
                />
              </View>

              <View style={st.group}>
                <Text style={[st.label, { color: c.textFaint }]}>{t.category.descLabel}</Text>
                <Field
                  value={desc}
                  onChangeText={setDesc}
                  placeholder={t.category.descPlaceholder}
                />
              </View>

              <View style={st.group}>
                <Text style={[st.label, { color: c.textFaint }]}>{t.category.colorLabel}</Text>
                <View style={st.swatches}>
                  {CATEGORY_COLORS.map((v) => {
                    const on = v === color;
                    return (
                      <Pressable
                        key={v}
                        onPress={() => setColor(v)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={({ pressed }) => [
                          st.swatch,
                          { backgroundColor: v, borderColor: on ? c.text : 'transparent' },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        {on && <MaterialCommunityIcons name="check" size={18} color={overlay.fg} />}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={st.group}>
                <Text style={[st.label, { color: c.textFaint }]}>{t.category.iconLabel}</Text>
                {/*
                  ⚠ **검색란을 두지 않는다** (2026-09-03 사용자 요청). 아이콘 이름이 영문이라
                    검색도 영문이어야 하는데, 한국어 사용자에게 "wrench" 를 떠올리라고 하는
                    것은 고르는 것보다 어렵다. 목록이 94개라 훑어서 고르는 편이 빠르다.
                    (갈래 순서대로 늘어놓았다 — features/category/icons.ts 참고)
                */}
                <View style={st.iconGrid}>
                  {ALL_ICONS.map((n) => {
                    const on = n === icon;
                    return (
                      <Pressable
                          key={n}
                          onPress={() => setIcon(n)}
                          accessibilityRole="button"
                          accessibilityLabel={n}
                          accessibilityState={{ selected: on }}
                          style={({ pressed }) => [
                            st.iconCell,
                            {
                              backgroundColor: on ? color : c.card,
                              borderColor: on ? color : c.border,
                            },
                            pressed && { opacity: 0.7 },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={n}
                            size={22}
                            color={on ? overlay.fg : c.textMuted}
                          />
                        </Pressable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            <View style={st.foot}>
              <Button
                label={t.common.save}
                onPress={() => onSave({ name, description: desc, color, icon })}
                disabled={!canSave}
                busy={busy}
              />
            </View>
          </View>
        </KeyboardSpacer>
      </View>
    </Modal>
  );
}

const TILE = 52;

const st = StyleSheet.create({
  flex: { flex: 1 },
  flexEnd: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: overlay.scrim },
  sheet: {
    borderTopWidth: 1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: space.lg,
    maxHeight: '90%',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
  },
  title: { fontSize: type.subtitle, fontWeight: '800', letterSpacing: tracking.tight },
  body: { paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.xl },

  preview: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewName: { fontSize: type.bodyStrong, fontWeight: '800' },
  previewDesc: { fontSize: type.small, marginTop: space.xs },

  group: { gap: space.sm },
  label: { fontSize: type.tiny, fontWeight: '700', letterSpacing: tracking.wide },

  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  iconCell: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  foot: { paddingHorizontal: space.xl, paddingTop: space.md },
});
