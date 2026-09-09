import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChoiceSheet } from '@/components/ChoiceSheet';
import { IconChevron } from '@/components/Icon';
import { BottomSheet } from '@/components/Sheet';
import { Button, Field, TextButton } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { radius, space, tracking, type, useTheme } from '@/lib/theme';

import { buildYmd, daysUntil, expiryTone, shiftYmd, todayYmd, type ExpiryTone } from './expiry';

/**
 * 소비기한 넣기·고치기 (2026-09-08 사용자 요청).
 *
 * 두 길을 다 둔다:
 *   · **빠른 선택** — "1개월·6개월·1년·2년" 처럼 오늘부터 얼마. 포장에 기한이 없는
 *     것(직접 만든 반찬, 개봉한 것)은 대개 이렇게 정한다.
 *   · **직접 입력** — 포장에 찍힌 날짜를 옮겨 적는다. 연도·월은 **고르고**(select),
 *     일만 숫자로 친다(사용자 요청 2026-09-08). 처음엔 셋 다 숫자 칸이었는데 자판이
 *     올라오면 시트가 좁아지고 연도를 네 자리나 쳐야 했다. 연도는 올해부터 5년 뒤까지면
 *     충분하다 — 소비기한이 그보다 먼 물건은 사실상 없다.
 *
 * 저장 전에 **D-N 을 미리 보여 준다.** 오타로 2072 년을 넣으면 "D-16000" 이 보여서 바로 안다.
 */
export function ExpirySheet({
  visible,
  value,
  busy,
  onClose,
  onSave,
}: {
  visible: boolean;
  /** 지금 값(YYYY-MM-DD) 또는 null */
  value: string | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (ymd: string | null) => void;
}) {
  const { c } = useTheme();
  const t = useT();

  // 열릴 때마다 지금 값으로 되돌린다 (CategorySheet 와 같은 방식)
  const [seed, setSeed] = useState<string | null>(null);
  const nowSeed = visible ? (value ?? 'none') : null;
  const [y, setY] = useState('');
  const [m, setM] = useState('');
  const [d, setD] = useState('');
  const [pick, setPick] = useState<'year' | 'month' | null>(null);
  if (nowSeed !== seed) {
    setSeed(nowSeed);
    const [yy, mm, dd] = (value ?? todayYmd()).split('-');
    setY(yy);
    setM(String(Number(mm)));
    setD(value && dd ? String(Number(dd)) : '');
    setPick(null);
  }

  if (!visible) return null;

  /** 올해부터 5년 뒤까지. 지금 값이 그 밖이면(옛 데이터) 그것도 목록에 넣는다 */
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => String(thisYear + i));
  if (y && !years.includes(y)) years.unshift(y);
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1));

  const ymd = buildYmd(y, m, d);
  const touched = !!d;
  const days = ymd ? daysUntil(ymd) : null;
  const tone: ExpiryTone | null = days === null ? null : expiryTone(days);

  const apply = (next: string) => {
    const [yy, mm, dd] = next.split('-');
    setY(yy);
    setM(String(Number(mm)));
    setD(String(Number(dd)));
  };
  const today = todayYmd();
  const quick: { label: string; ymd: string }[] = [
    { label: t.expiry.quick.week, ymd: shiftYmd(today, { days: 7 }) },
    { label: t.expiry.quick.month1, ymd: shiftYmd(today, { months: 1 }) },
    { label: t.expiry.quick.month3, ymd: shiftYmd(today, { months: 3 }) },
    { label: t.expiry.quick.month6, ymd: shiftYmd(today, { months: 6 }) },
    { label: t.expiry.quick.year1, ymd: shiftYmd(today, { years: 1 }) },
    { label: t.expiry.quick.year2, ymd: shiftYmd(today, { years: 2 }) },
  ];

  return (
    <BottomSheet title={t.expiry.title} onClose={onClose} dismissOnBackdrop={false} keyboard>
      <View style={st.body}>
        <Text style={[st.label, { color: c.textFaint }]}>{t.expiry.quickHint}</Text>
        <View style={st.chips}>
          {quick.map((q) => {
            const on = ymd === q.ymd;
            return (
              <Pressable
                key={q.label}
                onPress={() => apply(q.ymd)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [
                  st.chip,
                  { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent : c.card },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[st.chipText, { color: on ? c.onAccent : c.text }]}>{q.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[st.label, { color: c.textFaint }]}>{t.expiry.manualHint}</Text>
        <View style={st.row}>
          <SelectBox
            value={`${y}${t.expiry.year}`}
            label={t.expiry.yearLabel}
            onPress={() => {
              Keyboard.dismiss();
              setPick('year');
            }}
            style={st.year}
          />
          <SelectBox
            value={`${m}${t.expiry.month}`}
            label={t.expiry.monthLabel}
            onPress={() => {
              Keyboard.dismiss();
              setPick('month');
            }}
            style={st.small}
          />
          <Field
            value={d}
            onChangeText={(v) => setD(v.replace(/\D/g, '').slice(0, 2))}
            placeholder="15"
            keyboardType="number-pad"
            maxLength={2}
            wrapStyle={st.small}
          />
          <Text style={[st.unit, { color: c.textMuted }]}>{t.expiry.day}</Text>
        </View>

        {/* 미리보기 — 저장 전에 D-N 이 보여야 오타를 잡는다 */}
        <Text
          style={[
            st.preview,
            { color: ymd ? (tone === 'far' ? c.textMuted : c.danger) : touched ? c.danger : c.textFaint },
          ]}
        >
          {ymd && days !== null
            ? `${t.expiry.until(ymd)} · ${t.expiry.dLabel(days)}`
            : touched
              ? t.expiry.invalid
              : t.expiry.empty}
        </Text>

        <Button label={t.common.save} onPress={() => ymd && onSave(ymd)} disabled={!ymd || !!busy} busy={busy} />
        {value ? (
          <TextButton label={t.expiry.clear} tone="danger" onPress={() => onSave(null)} style={st.clear} />
        ) : null}
      </View>

      {/* 연도·월 고르기 — 시트 위에 한 겹 더 (Modal 은 겹쳐 뜬다) */}
      {pick === 'year' && (
        <ChoiceSheet
          title={t.expiry.yearLabel}
          options={years.map((v) => ({ key: v, label: `${v}${t.expiry.year}`, on: v === y }))}
          onPick={(k) => {
            setY(k);
            setPick(null);
          }}
          onClose={() => setPick(null)}
        />
      )}
      {pick === 'month' && (
        <ChoiceSheet
          title={t.expiry.monthLabel}
          options={months.map((v) => ({ key: v, label: `${v}${t.expiry.month}`, on: v === m }))}
          onPick={(k) => {
            setM(k);
            setPick(null);
          }}
          onClose={() => setPick(null)}
          scroll
          maxHeightRatio="70%"
        />
      )}
    </BottomSheet>
  );
}

/** 연도·월 한 칸 — 물건 상세의 카테고리 줄과 같은 생김새(테두리 상자 + 오른쪽 화살표) */
function SelectBox({
  value,
  label,
  onPress,
  style,
}: {
  value: string;
  label: string;
  onPress: () => void;
  style?: object;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        st.select,
        { borderColor: c.border, backgroundColor: c.card },
        style,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[st.selectText, { color: c.text }]} numberOfLines={1}>
        {value}
      </Text>
      <IconChevron size={16} color={c.textFaint} style={st.chevronDown} />
    </Pressable>
  );
}

const st = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.md },
  label: { fontSize: type.tiny, fontWeight: '700', letterSpacing: tracking.wide },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  chipText: { fontSize: type.label, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  year: { flex: 1.5 },
  small: { flex: 1.1 },
  select: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  selectText: { flex: 1, fontSize: type.bodyStrong },
  /** 오른쪽 화살표(›)를 아래로 돌려 "펼쳐진다" 로 읽히게 — Icon 은 `style` 로 돌려 쓴다 */
  chevronDown: { transform: [{ rotate: '90deg' }] },
  unit: { fontSize: type.body },
  preview: { fontSize: type.body, fontWeight: '600', marginTop: space.xs },
  clear: { alignSelf: 'center' },
});
