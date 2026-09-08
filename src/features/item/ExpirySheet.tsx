import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
 *   · **직접 입력** — 포장에 찍힌 날짜를 년·월·일로 옮겨 적는다. 기기마다 다른
 *     네이티브 달력 대신 숫자 세 칸이다. 2027 년 3 월을 달력에서 스크롤로 찾는 것보다
 *     그냥 치는 게 빠르다.
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
  if (nowSeed !== seed) {
    setSeed(nowSeed);
    const [yy, mm, dd] = (value ?? '').split('-');
    setY(yy ?? '');
    setM(mm ? String(Number(mm)) : '');
    setD(dd ? String(Number(dd)) : '');
  }

  if (!visible) return null;

  const ymd = buildYmd(y, m, d);
  const touched = !!(y || m || d);
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
          <Field
            value={y}
            onChangeText={(v) => setY(v.replace(/\D/g, '').slice(0, 4))}
            placeholder="2027"
            keyboardType="number-pad"
            maxLength={4}
            wrapStyle={st.year}
          />
          <Text style={[st.unit, { color: c.textMuted }]}>{t.expiry.year}</Text>
          <Field
            value={m}
            onChangeText={(v) => setM(v.replace(/\D/g, '').slice(0, 2))}
            placeholder="3"
            keyboardType="number-pad"
            maxLength={2}
            wrapStyle={st.small}
          />
          <Text style={[st.unit, { color: c.textMuted }]}>{t.expiry.month}</Text>
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
    </BottomSheet>
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
  year: { flex: 1.6 },
  small: { flex: 1 },
  unit: { fontSize: type.body },
  preview: { fontSize: type.body, fontWeight: '600', marginTop: space.xs },
  clear: { alignSelf: 'center' },
});
