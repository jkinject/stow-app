import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
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
  const win = useWindowDimensions();

  /**
   * 아이콘 격자를 **남는 폭에 정확히 맞춘다** (2026-09-03 사용자 지적).
   *
   * ⚠ 칸 크기를 숫자로 박아 두면(전에는 44) 마지막 칸 뒤에 자투리가 남아 **오른쪽 끝이
   *   위 입력칸과 안 맞는다.** 기기 폭이 제각각이라 어떤 숫자를 골라도 어딘가에서는
   *   어긋난다.
   *
   * ⚠ 나눗셈 결과를 그대로 쓰면 안 된다. 소수 폭은 픽셀 격자로 반올림되면서 한 줄의
   *   합이 컨테이너를 아주 조금 넘길 수 있고, 그러면 **마지막 칸이 다음 줄로 밀린다**
   *   (8개 줄이 7개 줄로 보인다). 그래서 칸은 정수로 내리고, **남는 폭은 간격에**
   *   나눠 준다 — 간격은 조금 어긋나도 눈에 띄지 않지만 줄바꿈은 바로 보인다.
   *
   * ⚠ 여기 쓰는 여백은 아래 `body` 의 `paddingHorizontal` 과 **같은 토큰**이어야 한다.
   */
  const avail = win.width - space.xl * 2;
  const cell = Math.floor((avail - space.sm * (ICON_COLS - 1)) / ICON_COLS);
  const iconGap = (avail - cell * ICON_COLS) / (ICON_COLS - 1);
  /**
   * 색 원도 같은 규칙으로 **한 줄에 다 넣는다**.
   * ⚠ 전에는 고정 40dp 라 여덟 개까지만 들어가고 둘째 줄에 두 개가 덩그러니 남았다.
   *   고를 것이 열 개뿐인데 두 줄로 나뉘면 "여기까지가 전부인가" 를 한 번 생각하게 된다.
   */
  const dot = Math.floor((avail - space.sm * (CATEGORY_COLORS.length - 1)) / CATEGORY_COLORS.length);
  const dotGap = (avail - dot * CATEGORY_COLORS.length) / (CATEGORY_COLORS.length - 1);

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
                <View style={[st.swatches, { gap: dotGap }]}>
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
                          {
                            width: dot,
                            height: dot,
                            borderRadius: dot / 2,
                            backgroundColor: v,
                            borderColor: on ? c.text : 'transparent',
                          },
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
                <View style={[st.iconGrid, { gap: iconGap }]}>
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
                              width: cell,
                              height: cell,
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
/** 아이콘 격자의 열 수. 칸 크기는 폭에서 나눠 구한다 — 위 `cell` 참고 */
const ICON_COLS = 8;

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

  /** ⚠ 크기·간격은 위에서 계산해 넘긴다 — 폭에 정확히 맞춘다 */
  swatches: { flexDirection: 'row' },
  swatch: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },

  /** ⚠ `gap` 은 위에서 계산해 넘긴다 — 남는 폭을 여기로 흡수한다 */
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.xs },
  /** ⚠ 크기는 여기서 정하지 않는다 — 폭에서 나눠 넘긴다(`cell`) */
  iconCell: {
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  foot: { paddingHorizontal: space.xl, paddingTop: space.md },
});
