import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, type, overlay } from '@/lib/theme';

/**
 * 아래에서 올라와 값 하나를 고르는 시트.
 *
 * 원래 더보기 화면 안에만 있었다. 가족 화면에서도 같은 것이 필요해졌을 때
 * 복사해 두면 언젠가 한쪽만 고쳐져 갈라진다 — 카메라 화면에서 실제로 그렇게 됐다.
 * 처음부터 한 벌로 꺼낸다.
 *
 * 버튼 3개짜리 `Alert` 로 대신하지 않는 이유: 안드로이드는 버튼을
 * neutral/negative/positive 자리에 배치해 **적은 순서와 보이는 순서가 달라진다.**
 */
export type Choice = {
  key: string;
  label: string;
  /** 체크 표시 — 값을 고르는 용도일 때만 쓴다 */
  on?: boolean;
  /** 되돌리기 어려운 동작 (내보내기 등) */
  danger?: boolean;
};

export function ChoiceSheet({
  title,
  options,
  onPick,
  onClose,
}: {
  title: string;
  options: Choice[];
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose}>
        <Pressable
          style={[
            st.sheet,
            { backgroundColor: c.bg, borderColor: c.border, paddingBottom: insets.bottom + 16 },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[st.title, { color: c.textFaint }]} numberOfLines={2}>
            {title}
          </Text>
          {options.map((o, i) => (
            <Pressable
              key={o.key}
              onPress={() => onPick(o.key)}
              style={({ pressed }) => [
                st.option,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text
                style={[st.optionText, { color: o.danger ? c.danger : o.on ? c.accentText : c.text }]}
              >
                {o.label}
              </Text>
              {o.on && <Text style={[st.check, { color: c.accentText }]}>✓</Text>}
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: overlay.scrim, justifyContent: 'flex-end' },
  sheet: { borderTopWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 14 },
  title: {
    fontSize: type.tiny,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  optionText: { fontSize: type.bodyStrong, fontWeight: '500' },
  check: { fontSize: type.subtitle, fontWeight: '800' },
});
