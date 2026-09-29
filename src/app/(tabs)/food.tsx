import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { CardGrid, useCardWidth } from '@/components/CardGrid';
import { useToast } from '@/components/Toast';
import { Button, Empty, Field, Loading, Screen, SectionLabel } from '@/components/ui';
import {
  GenerateError,
  useCurrentRecipes,
  useFoodItems,
  useGenerateRecipes,
} from '@/features/food/api';
import { RecipeCard } from '@/features/food/RecipeCard';
import { useHousehold } from '@/features/household/context';
import { todayYmd } from '@/features/item/expiry';
import { ItemCard } from '@/features/item/ItemCard';
import { useThumbUrls } from '@/features/item/thumbs';
import { useI18n } from '@/lib/i18n';
import { useTheme, type, radius, space, leading } from '@/lib/theme';
import { relTime } from '@/lib/time';

/**
 * 음식 탭 (2026-09-29 사용자 요청) — 살 것 탭 자리를 이어받았다.
 *
 * 위에는 **레시피**, 아래에는 **가진 음식**. 이 순서인 이유: 이 집의 음식은 100~200일짜리
 * 대용량이라 목록이 잘 안 바뀐다. 매번 보러 오는 건 목록이 아니라 "이걸로 뭐 해 먹지" 다.
 *
 * 사용자 결정(2026-09-29):
 *   Q1 음식 = 소비기한이 있는 물건 (features/food/api.ts)
 *   Q2 재료는 전부 자동. 고르는 UI 없음. 대신 **자유 입력 한 줄**(힌트)
 *   Q3 비용 최소 — 탭을 열 때 호출하지 않는다. 버튼으로만. 같은 조합은 서버 캐시
 *   Q4 결과는 서버에 고정. 바뀌는 건 "다른 레시피 추천" 을 눌렀을 때뿐
 *   Q5 살 것은 더보기로
 *
 * ⚠ 임박 재료·우선 지정·보관 같은 설계 시안(docs/design/food-tab)의 장치는 **넣지 않았다.**
 *   기한이 100일 뒤인 재료에 "먼저 쓰기" 는 뜻이 없다.
 */
export default function FoodTab() {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { activeId } = useHousehold();

  const foods = useFoodItems(activeId);
  const current = useCurrentRecipes(activeId);
  const generate = useGenerateRecipes(activeId);
  const thumbs = useThumbUrls();
  const cardW = useCardWidth();

  const [hint, setHint] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  /** 마지막 응답이 알려 준 오늘 남은 횟수. 아직 안 불렀으면 모른다(null) */
  const [remaining, setRemaining] = useState<number | null>(null);

  const list = foods.data ?? [];
  useEffect(() => {
    thumbs.ensure((foods.data ?? []).map((f) => f.thumb_path));
  }, [foods.data, thumbs]);

  const set = current.data?.set ?? null;

  async function onGenerate() {
    try {
      const res = await generate.mutateAsync({
        intent: set ? 'replace' : 'initial',
        hint,
        locale: lang,
        expectedRevision: current.data?.revision ?? 0,
        today: todayYmd(),
      });
      setRemaining(res.remaining_today);
      setOpen(null);
      toast(res.cache_hit ? t.recipes.fromCache : t.recipes.savedToast);
    } catch (e) {
      /**
       * 실패는 Alert — 사라지는 알림으로 알리면 놓친다(components/Toast.tsx 규칙).
       * 코드별 문구를 고른다. 서버 메시지는 사용자용이 아니다.
       */
      const err = e instanceof GenerateError ? e : null;
      switch (err?.code) {
        case 'DAILY_LIMIT':
          setRemaining(0);
          Alert.alert(t.recipes.limit, t.recipes.limitHint);
          return;
        case 'REVISION_MISMATCH':
          Alert.alert(t.recipes.changed, t.recipes.changedHint);
          return;
        case 'NO_FOOD':
        case 'NO_USABLE':
          Alert.alert(t.recipes.noFood, t.food.noUsableHint);
          return;
        case 'TOO_MANY_ITEMS':
          Alert.alert(t.recipes.tooMany);
          return;
        case 'NOT_CONFIGURED':
          Alert.alert(t.recipes.notConfigured);
          return;
        case 'MODEL_FAILED':
        case 'INVALID_RESULT':
          Alert.alert(t.recipes.failed, t.recipes.modelFailed);
          return;
        default:
          Alert.alert(t.recipes.failed, err?.message ?? (e instanceof Error ? e.message : t.common.tryAgain));
      }
    }
  }

  const loading = foods.isLoading || current.isLoading;
  const nothingAtAll = !loading && list.length === 0 && !set;

  return (
    <Screen title={t.food.title}>
      <View style={st.body}>
        {loading ? (
          <Loading />
        ) : nothingAtAll ? (
          /* ⚠ 여기가 Q1 의 함정을 가르치는 자리 — 기한을 안 넣은 식품은 여기 안 보인다 */
          <View style={st.emptyWrap}>
            <Empty text={t.food.empty} hint={t.food.emptyHint} />
            <Button label={t.food.findExisting} onPress={() => router.navigate('/')} />
          </View>
        ) : (
          <>
            {/* ── 레시피 ───────────────────────────────────── */}
            <View style={[st.panel, { backgroundColor: c.card }]}>
              {set ? (
                <>
                  <Text style={[st.panelKicker, { color: c.textFaint }]}>{t.recipes.saved}</Text>
                  <Text style={[st.panelSub, { color: c.textFaint }]}>
                    {t.recipes.savedAt(relTime(set.created_at, t))}
                    {set.hint ? ` · ${t.recipes.withHint(set.hint)}` : ''}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[st.panelTitle, { color: c.text }]}>{t.recipes.title}</Text>
                  <Text style={[st.panelSub, { color: c.textMuted }]}>{t.recipes.intro(list.length)}</Text>
                </>
              )}
            </View>

            {set
              ? set.result.recipes.map((r, i) => (
                  <RecipeCard
                    key={`${set.id}-${i}`}
                    recipe={r}
                    inventory={set.inventory}
                    index={i}
                    expanded={open === i}
                    onToggle={() => setOpen(open === i ? null : i)}
                  />
                ))
              : null}

            {/* 자유 입력 한 줄 + 버튼. 우선 지정 대신 이게 자유도다 (사용자 결정) */}
            <View style={st.ask}>
              <Field
                value={hint}
                onChangeText={setHint}
                placeholder={t.recipes.hintPlaceholder}
                returnKeyType="done"
                clearable
                onSubmitEditing={() => void onGenerate()}
              />
              <Button
                label={generate.isPending ? t.recipes.generating : set ? t.recipes.replace : t.recipes.generate}
                onPress={() => void onGenerate()}
                busy={generate.isPending}
                disabled={list.length === 0}
              />
              <Text style={[st.fine, { color: c.textFaint }]}>
                {remaining !== null ? `${t.recipes.remaining(remaining)} · ` : ''}
                {set ? t.recipes.reference : t.recipes.dataHint}
              </Text>
            </View>

            {/* ── 가진 음식 ─────────────────────────────────── */}
            <SectionLabel>{t.food.section(list.length)}</SectionLabel>
            {list.length === 0 ? (
              <Empty text={t.food.empty} hint={t.food.emptyHint} />
            ) : (
              <CardGrid>
                {list.map((it) => (
                  <ItemCard
                    key={it.id}
                    name={it.name}
                    subtitle={it.path}
                    category={it.category?.name ?? null}
                    categoryColor={it.category?.color ?? null}
                    quantity={it.quantity}
                    width={cardW}
                    thumb={thumbs.get(it.thumb_path)}
                    expiresOn={it.expires_on}
                    inUse={!!it.in_use_since}
                    onPress={() => router.push(`/item/${it.id}`)}
                  />
                ))}
              </CardGrid>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  body: { paddingHorizontal: space.xl, gap: space.md },
  emptyWrap: { gap: space.lg, paddingTop: space.xxl },
  panel: { borderRadius: radius.md, padding: space.lg, gap: space.xs },
  panelKicker: { fontSize: type.tiny, fontWeight: '700' },
  panelTitle: { fontSize: type.title, fontWeight: '700' },
  panelSub: { fontSize: type.small, lineHeight: leading.small },
  ask: { gap: space.sm, paddingTop: space.xs },
  fine: { fontSize: type.caption, lineHeight: leading.caption, textAlign: 'center' },
});
