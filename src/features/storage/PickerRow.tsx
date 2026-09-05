import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThumbStack } from '@/components/ThumbStack';
import { useThumbUrls } from '@/features/item/thumbs';
import { useT } from '@/lib/i18n';
import { radius, space, tinted, type, useTheme } from '@/lib/theme';

/**
 * "어디로 옮길까" 를 고르는 화면들의 **공통 줄.**
 *
 * 두 곳이 같은 것을 쓴다:
 *   · 물건 이동 (`features/item/MovePicker`)      — 장소 → 박스 2단
 *   · 박스 이동 (`features/storage/BoxMovePicker`) — 장소만 1단
 *
 * ⚠ 각자 그리면 한쪽만 고쳐지는 날이 온다. 이 프로젝트에서 이미 여러 번 겪었고
 *   (LocationSheet 주석 참고), 특히 이 줄에는 실기기에서 얻어낸 규칙이 박혀 있다 —
 *   왼쪽 아이콘 칸은 비어도 자리를 지키고, 강조는 테두리 굵기가 아니라 **색만**
 *   바꾼다. 베껴 두면 그 규칙도 같이 베껴지고, 한쪽에서만 잊힌다.
 */

/** 왼쪽 아이콘 칸과 그 안의 아이콘. 사진 더미는 이보다 작다 — 부속이니까 */
const SLOT = 36;
export const ICON = 20;
export const STACK_TILE = 30;

/** 줄 왼쪽의 아이콘 칸. 크기가 고정이라 모든 줄의 글자가 같은 x 에서 시작한다 */
export function Slot({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return <View style={[pickerSt.slot, { backgroundColor: c.sunk }]}>{children}</View>;
}

/** 누르면 그리로 옮겨지는 한 줄 (박스 · 장소 직속 · 장소) */
export function Target({
  label,
  sub,
  icon,
  paths,
  get,
  here,
  busy,
  onPress,
}: {
  label: string;
  /** 없으면 한 줄짜리 줄이 된다 (장소 직속 항목) */
  sub?: string;
  /** 왼쪽 칸 — 그 줄이 무엇인지(장소냐 박스냐) */
  icon: React.ReactNode;
  paths?: string[];
  get: ReturnType<typeof useThumbUrls>['get'];
  here: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      disabled={here || busy}
      style={({ pressed }) => [
        pickerSt.row,
        {
          backgroundColor: here ? tinted(c.accent, '33', c.card) : c.card,
          borderColor: here ? c.accent : 'transparent',
        },
        (pressed || here || busy) && { opacity: here ? 1 : 0.6 },
      ]}
    >
      {/* ⚠ 왼쪽 자리는 항상 차지한다. 비워 두면 그 줄만 글자가 왼쪽으로 밀려서
          목록의 시작선이 어긋난다(실기기 확인). */}
      <Slot>{icon}</Slot>
      <View style={pickerSt.rowMain}>
        <Text style={[pickerSt.rowTitle, { color: c.text }]} numberOfLines={1}>
          {label}
        </Text>
        {!!sub && (
          <Text style={[pickerSt.rowSub, { color: c.textFaint }]} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
      {here && <Text style={[pickerSt.here, { color: c.accentText }]}>{t.item.moveHere}</Text>}
      <ThumbStack paths={paths} get={get} size={STACK_TILE} />
    </Pressable>
  );
}

/**
 * ⚠ 머리말(제목·닫기)은 여기 없다 — `components/Sheet` 의 `ModalHeader` 가 맡는다
 *   (2026-09-06 점검에서 화면마다 제각각이던 것을 한 벌로 모았다).
 */
export const pickerSt = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.xl },
  group: { gap: space.sm },
  indent: { paddingLeft: space.xl },
  row: {
    borderRadius: radius.sm,
    // ⚠ 강조할 때만 borderWidth 를 주면 그 줄만 2px 커져 목록이 흔들린다.
    //   자리를 항상 잡아 두고 **색만** 바꾼다.
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  rowMain: { flex: 1, gap: space.xs },
  rowTitle: { fontSize: type.body, fontWeight: '600' },
  rowTitleStrong: { fontSize: type.subtitle, fontWeight: '700' },
  rowSub: { fontSize: type.caption },
  here: { fontSize: type.caption, fontWeight: '700' },
  rescue: { paddingHorizontal: space.xl, gap: space.xs },
  addMore: { alignSelf: 'flex-start', paddingVertical: space.sm },
  slot: {
    width: SLOT,
    height: SLOT,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
