import { type ReactNode, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { radius, space, tracking, type, useTheme } from '@/lib/theme';

/**
 * ⚙ 를 눌러 펼치는 **설정 카드** — 이름 고치기 + 지우기.
 *
 * ⚠ 장소 상세와 박스 상세가 **거의 같은 것을 각자** 갖고 있었다 (2026-09-06 점검):
 *   `LocationSettings` 와 `BoxSettings` 는 라벨 문구와 삭제 버튼 이름만 달랐다.
 *   둘 다 "이름은 마운트 때 한 번만 읽는다"(재조회에 맞춰 되돌리면 입력하던 게
 *   지워진다) 같은 **판단**을 품고 있었는데, 두 벌이면 그 판단도 두 벌이 된다.
 *
 * ⚠ 저장 버튼은 **바뀐 게 있을 때만** 눌린다. 안 그러면 "저장했는데 아무 일도
 *   안 일어난" 것처럼 보이는 누름이 생긴다.
 */
export function SettingsCard({
  label,
  placeholder,
  initialName,
  busy,
  onSave,
  children,
  danger,
}: {
  /** 입력칸 위의 작은 라벨 ("장소 이름" · "박스 이름") */
  label: string;
  placeholder: string;
  initialName: string;
  busy: boolean;
  onSave: (name: string) => void;
  /** 이름과 삭제 **사이**에 들어가는 것 (박스의 "다른 장소로 옮기기") */
  children?: ReactNode;
  danger: { label: string; onPress: () => void; busy?: boolean };
}) {
  const { c } = useTheme();
  const t = useT();
  // 초기값은 마운트 때 한 번만. 재조회에 맞춰 되돌리면 입력하던 게 지워진다.
  const [name, setName] = useState(initialName);

  const trimmed = name.trim();
  const nameOk = trimmed.length > 0;
  const changed = trimmed !== initialName;

  return (
    <View style={[st.card, { backgroundColor: c.card }]}>
      <Text style={[st.label, { color: c.textFaint }]}>{label}</Text>
      <Field value={name} onChangeText={setName} placeholder={placeholder} />
      {!nameOk && <Text style={[st.err, { color: c.danger }]}>{t.item.nameRequired}</Text>}

      <Button
        label={busy ? t.common.saving : t.common.save}
        busy={busy}
        disabled={!nameOk || !changed}
        onPress={() => onSave(trimmed)}
      />

      {children}

      {/* ⚠ 지우기는 **떨어뜨려 둔다.** 되돌릴 수 있는 것과 없는 것이 붙어 있으면
          손이 미끄러진다 (박스 이동을 여기 넣을 때 같은 이유로 사이를 벌렸다) */}
      <View style={st.danger}>
        <Button
          label={danger.label}
          onPress={danger.onPress}
          variant="danger"
          busy={danger.busy}
        />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: radius.md, padding: space.lg, gap: space.sm },
  label: { fontSize: type.tiny, fontWeight: '600', letterSpacing: tracking.wide },
  err: { fontSize: type.caption },
  danger: { marginTop: space.lg },
});
