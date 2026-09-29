import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconChevron } from '@/components/Icon';
import { useT } from '@/lib/i18n';
import { useTheme, type, radius, space, leading, tracking } from '@/lib/theme';

import type { InventoryLine, Recipe } from '../../../supabase/functions/_shared/recipeSpec';

/**
 * 레시피 한 장 (2026-09-29).
 *
 * 접혀 있을 때 보이는 것: 제목 · 시간·난이도·인분 · **가진 재료** · 더 필요한 재료.
 * "내 재료로 되는 요리인가" 를 카드 첫눈에 판단할 수 있어야 한다 — 그래서 재료는 접지 않는다.
 * 단계만 펼친다. 단계는 만들 때 보는 것이지 고를 때 보는 것이 아니다.
 *
 * ⚠ `owned_refs` 는 `i1` 같은 요청 안의 식별자다. 이름은 세트가 들고 있는 `inventory` 로 푼다 —
 *   그 뒤 물건 이름을 고쳐도 **추천 당시의 이름**이 보인다. 추천은 그때의 재료로 만든 것이니 맞다.
 */
export function RecipeCard({
  recipe,
  inventory,
  index,
  expanded,
  onToggle,
}: {
  recipe: Recipe;
  inventory: InventoryLine[];
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const byRef = new Map(inventory.map((l) => [l.ref, l.name]));
  const owned = recipe.owned_refs.map((r) => byRef.get(r) ?? r);

  return (
    <View style={[st.card, { backgroundColor: c.card }]}>
      <Text style={[st.kicker, { color: c.textFaint }]}>
        {String(index + 1).padStart(2, '0')}
      </Text>
      <Text style={[st.title, { color: c.text }]}>{recipe.title}</Text>
      {recipe.summary ? (
        <Text style={[st.summary, { color: c.textMuted }]}>{recipe.summary}</Text>
      ) : null}
      <Text style={[st.meta, { color: c.textFaint }]}>
        {t.recipes.minutes(recipe.minutes)} · {recipe.difficulty === 'easy' ? t.recipes.easy : t.recipes.medium} · {t.recipes.servings(recipe.servings)}
      </Text>

      <View style={st.block}>
        <Text style={[st.label, { color: c.textFaint }]}>{t.recipes.owned}</Text>
        <Text style={[st.list, { color: c.text }]}>{owned.join(' · ')}</Text>
      </View>
      {recipe.missing.length > 0 ? (
        <View style={st.block}>
          <Text style={[st.label, { color: c.textFaint }]}>{t.recipes.missing}</Text>
          <Text style={[st.list, { color: c.text }]}>{recipe.missing.join(' · ')}</Text>
        </View>
      ) : null}
      {recipe.staples.length > 0 ? (
        <View style={st.block}>
          <Text style={[st.label, { color: c.textFaint }]}>{t.recipes.staples}</Text>
          <Text style={[st.list, { color: c.textMuted }]}>{recipe.staples.join(' · ')}</Text>
        </View>
      ) : null}

      <View style={[st.divider, { backgroundColor: c.border }]} />
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={({ pressed }) => [st.stepsToggle, pressed && { opacity: 0.6 }]}
      >
        <Text style={[st.stepsLabel, { color: c.accentText }]}>{t.recipes.steps}</Text>
        <IconChevron
          size={18}
          color={c.accentText}
          style={expanded ? { transform: [{ rotate: '90deg' }] } : undefined}
        />
      </Pressable>
      {expanded ? (
        <View style={st.steps}>
          {recipe.steps.map((s, i) => (
            <View key={i} style={st.step}>
              <Text style={[st.stepNo, { color: c.textFaint }]}>{i + 1}.</Text>
              <Text style={[st.stepText, { color: c.text }]}>{s}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: radius.md, padding: space.lg, gap: space.sm },
  kicker: { fontSize: type.tiny, fontWeight: '700', letterSpacing: tracking.wide },
  title: { fontSize: type.title, fontWeight: '700', letterSpacing: tracking.tight, lineHeight: leading.title },
  summary: { fontSize: type.small, lineHeight: leading.small },
  meta: { fontSize: type.caption },
  block: { gap: space.xs, paddingTop: space.xs },
  label: { fontSize: type.tiny, fontWeight: '700' },
  list: { fontSize: type.small, lineHeight: leading.small },
  divider: { height: StyleSheet.hairlineWidth, marginTop: space.sm },
  stepsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm },
  stepsLabel: { fontSize: type.label, fontWeight: '600' },
  steps: { gap: space.sm, paddingBottom: space.xs },
  step: { flexDirection: 'row', gap: space.sm },
  stepNo: { fontSize: type.small, fontVariant: ['tabular-nums'], width: 20 },
  stepText: { flex: 1, fontSize: type.small, lineHeight: leading.small },
});
