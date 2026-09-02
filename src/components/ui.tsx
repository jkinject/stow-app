import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/lib/i18n';
import { useTheme, type, radius, space, tracking } from '@/lib/theme';

/**
 * 공용 UI.
 * ⚠ 색은 반드시 useTheme() 의 토큰을 쓴다. RN 의 <Text> 기본색은 검정 고정이라
 *   색을 안 주면 다크 모드에서 글자가 사라진다 (실기기에서 실제로 났던 버그).
 */

/**
 * 화면 제목의 글씨.
 *
 * ⚠ 밖으로 뺀 이유: 제목을 **입력칸으로** 대체하는 화면이 있다(물건 상세 —
 *   제목을 눌러 이름을 고친다). 같은 모양이어야 하는데 값을 두 곳에 적어 두면
 *   한쪽만 고쳐진다. 이 저장소에서 이미 여러 번 겪은 함정이다.
 */
export const titleText: TextStyle = {
  fontSize: type.h1,
  fontWeight: '700',
  letterSpacing: tracking.tighter,
};

export function Screen({
  children,
  scroll = true,
  title,
  subtitle,
  back = false,
  titleNode,
  action,
  float,
}: {
  children: ReactNode;
  scroll?: boolean;
  title?: string;
  /**
   * 제목 아래 한 줄. **무엇에 대한 화면인지**를 적는 자리다 —
   * 예: 변경 이력 화면에서 어느 물건의 이력인지.
   */
  subtitle?: string;
  back?: boolean;
  /**
   * 제목 자리에 대신 넣을 것.
   *
   * ⚠ 제목을 **눌러서 고치는** 화면을 위한 것이다(물건 상세). `title` 은 문자열이라
   *   입력칸을 넣을 수 없다. 모양은 `titleText` 를 함께 써서 맞춘다.
   */
  titleNode?: ReactNode;
  action?: ReactNode;
  /** 본문 **위에** 떠 있는 것 (플로팅 버튼). 스크롤을 따라가지 않는다 */
  float?: ReactNode;
}) {
  const { c } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const Body = scroll ? ScrollView : View;

  return (
    <View style={[s.screen, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      {(title || titleNode || back) && (
        <View style={s.header}>
          {back && (
            <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
              {/* 화살표는 문자열 밖에 둔다 — 번역해도 방향 기호는 그대로여야 한다 */}
              <Text style={[s.backText, { color: c.accentText }]}>← {t.common.back}</Text>
            </Pressable>
          )}
          <View style={s.headerRow}>
            {titleNode ?? (
              title ? (
                <Text style={[s.h1, { color: c.text }]} numberOfLines={2}>
                  {title}
                </Text>
              ) : (
                <View />
              )
            )}
            {action}
          </View>
          {subtitle ? (
            <Text style={[s.h1sub, { color: c.textMuted }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      )}
      <Body
        style={{ flex: 1 }}
        contentContainerStyle={scroll ? { paddingBottom: insets.bottom + 40 } : undefined}
        /**
         * ⚠ 이게 없으면(기본값 'never') 키보드가 올라와 있을 때 **첫 탭이 키보드를 내리는
         *   데 먹히고 버튼에 닿지 않는다.** 이름을 입력한 뒤 "추가" 를 두 번 눌러야 하는
         *   증상이 정확히 이것이다(실사용 보고). 화면마다 따로 붙이면 새 화면에서 또
         *   빠뜨리므로 Screen 한 곳에서 못박는다.
         */
        keyboardShouldPersistTaps={scroll ? 'handled' : undefined}
      >
        {children}
      </Body>
      {float}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  const bg = variant === 'primary' ? c.accent : 'transparent';
  const border = variant === 'primary' ? c.accent : variant === 'danger' ? c.danger : c.borderStrong;
  const fg = variant === 'primary' ? c.onAccent : variant === 'danger' ? c.danger : c.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, borderColor: border },
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[s.btnText, { color: fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  ref,
  clearable,
  wrapStyle,
  leading,
  ...props
}: TextInputProps & {
  ref?: React.Ref<TextInput>;
  /**
   * 감싸는 View 의 스타일 — 가로로 늘려야 하는 곳에서 `{ flex: 1 }` 을 준다.
   *
   * ⚠ 늘리기는 **반드시 여기로** 준다. `style`(TextInput 쪽)에 `flex` 를 주면
   *   감싸는 View 가 세로 컬럼이라 **세로로** 늘어나 칸이 찌그러진다.
   *   찾기 탭 검색창에서 실제로 글자가 안 보이는 증상으로 나타났다.
   */
  wrapStyle?: StyleProp<ViewStyle>;
  /**
   * 값이 있을 때 오른쪽 끝에 ✕ 를 띄워 한 번에 비운다.
   *
   * ⚠ 기본값이 아니다. 저장되는 값을 담는 칸(물건 이름·메모)에 ✕ 를 두면
   *   실수로 눌러 지운 뒤 포커스가 빠지면서 그대로 저장된다. 검색처럼
   *   **버려도 되는 입력**에만 켠다.
   */
  clearable?: boolean;
  /**
   * 칸 **왼쪽 안쪽**에 놓는 그림(검색 돋보기 등).
   *
   * ⚠ 글자를 그만큼 밀어 준다. 안 밀면 그림 위에 글자가 겹친다.
   * ⚠ 누를 수 없다(`pointerEvents="none"`). 여기 놓이는 것은 **표시**이지 버튼이
   *   아니다 — 누를 수 있게 두면 칸을 누르려다 그림에 막혀 키보드가 안 뜬다.
   */
  leading?: ReactNode;
}) {
  const { c } = useTheme();
  const t = useT();
  const show = clearable && !!props.value;
  return (
    <View style={[s.fieldWrap, wrapStyle]}>
      {leading && (
        <View style={s.leading} pointerEvents="none">
          {leading}
        </View>
      )}
      <TextInput
        ref={ref}
        {...props}
        placeholderTextColor={c.textFaint}
        style={[
          s.field,
          { borderColor: c.border, backgroundColor: c.card, color: c.text },
          show && s.fieldWithClear,
          !!leading && s.fieldWithLeading,
          props.style,
        ]}
      />
      {show && (
        <Pressable
          onPress={() => props.onChangeText?.('')}
          hitSlop={10}
          style={s.clearBtn}
          accessibilityLabel={t.common.clear}
        >
          <View style={[s.clearCircle, { backgroundColor: c.borderStrong }]}>
            <Text style={[s.clearMark, { color: c.card }]}>✕</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

/** 목록 한 줄. 제목 + 부제 + 오른쪽 메타 */
export function Row({
  title,
  subtitle,
  meta,
  onPress,
  onLongPress,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        s.row,
        { borderColor: c.border, backgroundColor: c.card },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={s.rowMain}>
        <Text style={[s.rowTitle, { color: c.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[s.rowSub, { color: c.textFaint }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {meta ? <Text style={[s.rowMeta, { color: c.textMuted }]}>{meta}</Text> : null}
    </Pressable>
  );
}

export function Empty({ text, hint }: { text: string; hint?: string }) {
  const { c } = useTheme();
  return (
    <View style={s.empty}>
      <Text style={[s.emptyText, { color: c.textMuted }]}>{text}</Text>
      {hint ? <Text style={[s.emptyHint, { color: c.textFaint }]}>{hint}</Text> : null}
    </View>
  );
}

export function Loading() {
  const { c } = useTheme();
  return (
    <View style={s.empty}>
      <ActivityIndicator color={c.accent} />
    </View>
  );
}

/**
 * 섹션 제목. `action` 은 제목 **오른쪽에** 붙는다.
 *
 * 추가 버튼을 화면 우측 상단이 아니라 여기에 두는 이유: 버튼이 **무엇을 추가하는지**
 * 가 제목으로 드러난다. 헤더에 있으면 "+ 박스" 인지 "+ 물건" 인지 매번 읽어야 한다.
 */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const { c } = useTheme();
  if (!action) return <Text style={[s.sectionLabel, { color: c.textFaint }]}>{children}</Text>;
  return (
    <View style={s.sectionRow}>
      <Text style={[s.sectionLabel, { color: c.textFaint }]}>{children}</Text>
      {action}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.md, gap: space.sm },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md },
  backBtn: { alignSelf: 'flex-start', paddingVertical: space.xs },
  backText: { fontSize: type.body, fontWeight: '500' },
  h1: { ...titleText, flexShrink: 1 },
  /** 제목 바로 아래 — header 의 gap(6) 이 간격을 만든다 */
  h1sub: { fontSize: type.small },
  btn: { borderWidth: 1, paddingVertical: space.lg, borderRadius: radius.sm, alignItems: 'center' },
  btnText: { fontSize: type.bodyStrong, fontWeight: '600' },
  field: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: space.lg, paddingVertical: space.md, fontSize: type.bodyStrong },
  /**
   * ⚠ `flex: 1` 을 여기 박으면 안 된다. 부모가 **세로** 컬럼일 때
   *   입력칸이 세로로 늘어나 카드가 부풀어 오른다(카테고리 관리 화면에서 실제로 겪었다).
   *   가로로 늘려야 하는 곳은 `wrapStyle` 로 바깥에서 지정한다.
   */
  fieldWrap: { justifyContent: 'center' },
  // ✕ 자리를 비워 둔다 — 안 그러면 긴 글자가 버튼 밑으로 들어간다
  fieldWithClear: { paddingRight: space.giant },
  /** ⚠ 아래 `leading` 의 left + 그림 너비만큼 밀어야 글자가 안 겹친다 */
  fieldWithLeading: { paddingLeft: space.huge + space.md },
  leading: { position: 'absolute', left: space.lg, zIndex: 1 },
  clearBtn: { position: 'absolute', right: 10 },
  clearCircle: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  /* ⚠ 기호를 상자 가운데 앉히는 값이다 — 읽는 행간이 아니므로 `leading` 을 쓰지 않는다 */
  clearMark: { fontSize: type.tiny, fontWeight: '700', lineHeight: 14 },
  row: {
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  rowMain: { flex: 1, gap: space.xs },
  rowTitle: { fontSize: type.bodyStrong, fontWeight: '600' },
  rowSub: { fontSize: type.small },
  rowMeta: { fontSize: type.small, fontVariant: ['tabular-nums'] },
  empty: { paddingVertical: space.giant, alignItems: 'center', gap: space.sm },
  emptyText: { fontSize: type.body },
  emptyHint: { fontSize: type.small, textAlign: 'center' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  /**
   * ⚠ 예전엔 `textTransform: 'uppercase'` 와 `letterSpacing: tracking.wide` 이 있었다.
   *   둘 다 **라틴 문자 습관**이다. 한글에는 대문자가 없어서 uppercase 는 아무 일도
   *   하지 않고, 자간만 벌어져 "보 관 장 소" 처럼 어색하게 읽힌다.
   *   작은 회색 대문자 라벨은 그 자체로 템플릿 같은 인상을 준다 — 그냥 제목으로 쓴다.
   */
  sectionLabel: {
    fontSize: type.small,
    fontWeight: '600',
    marginTop: space.sm,
  },
});
