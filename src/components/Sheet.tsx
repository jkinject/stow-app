import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconCheck, IconX } from '@/components/Icon';
import { IconButton } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { overlay, radius, space, tracking, type, useTheme } from '@/lib/theme';

/**
 * 아래에서 올라오는 시트의 **껍데기**.
 *
 * ⚠⚠ 점검에서 같은 껍데기가 **세 곳에 각자** 적혀 있었다 (2026-09-06):
 *   `components/ChoiceSheet` · `features/category/CategorySheet` · 물건 상세의
 *   카테고리 고르기. 셋 다 `borderTopLeftRadius: 18` 이었는데 **18 은 척도 밖**이다
 *   (`radius.lg` = 16). 세 곳이 똑같이 척도를 벗어났다는 건 한 곳에서 베껴 갔다는
 *   뜻이고, 그러면 고칠 때도 한 곳만 고쳐진다.
 *
 * 머리말은 두 종류다. 섞어 쓰면 "고르는 시트" 와 "채우는 시트" 가 같아 보인다:
 *   `label` — 작은 대문자 라벨. **값 하나를 고르는** 시트 (닫기 버튼 없음, 밖을 눌러 닫는다)
 *   `title` — 제목 + ✕. **폼**이 든 시트 (실수로 닫히면 입력이 날아가므로 명시적으로 닫는다)
 */
export function BottomSheet({
  label,
  title,
  onClose,
  children,
  scroll = false,
  /** 폼처럼 길어질 수 있는 시트에서 화면을 다 덮지 않게 */
  maxHeightRatio,
  dismissOnBackdrop = true,
  keyboard = false,
}: {
  label?: string;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  /** 내용이 길면 시트 안에서만 스크롤한다 */
  scroll?: boolean;
  maxHeightRatio?: `${number}%`;
  /**
   * 밖을 눌러 닫을 수 있는가.
   *
   * ⚠ **폼이 든 시트는 끈다.** 적던 내용이 손끝 하나에 조용히 사라지면 안 된다
   *   (장소 만들기 시트가 닫기 전에 묻는 것과 같은 이유).
   */
  dismissOnBackdrop?: boolean;
  /** 입력칸이 있으면 켠다 — 자판이 시트를 가리지 않게 밀어 올린다 */
  keyboard?: boolean;
}) {
  const { c } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const Body = scroll ? ScrollView : View;
  const Backdrop = dismissOnBackdrop ? Pressable : View;
  const Card = dismissOnBackdrop ? Pressable : View;
  const kb = useModalKeyboardHeight(keyboard);

  return (
    <Modal visible transparent animationType={title ? 'slide' : 'fade'} onRequestClose={onClose}>
      {/* 밖을 누르면 닫힌다. 안쪽 누름이 새어 나가지 않게 stopPropagation 한다 */}
      <Backdrop style={st.backdrop} onPress={dismissOnBackdrop ? onClose : undefined}>
        <View style={[st.flexEnd, { paddingBottom: kb }]}>
        <Card
          style={[
            st.sheet,
            {
              backgroundColor: c.bg,
              borderColor: c.border,
              paddingBottom: insets.bottom + space.lg,
              maxHeight: maxHeightRatio,
            },
          ]}
          onPress={dismissOnBackdrop ? (e) => e.stopPropagation() : undefined}
        >
          {!!label && (
            <Text style={[st.label, { color: c.textFaint }]} numberOfLines={2}>
              {label}
            </Text>
          )}
          {!!title && (
            <View style={st.head}>
              <Text style={[st.title, { color: c.text }]} numberOfLines={1}>
                {title}
              </Text>
              <IconButton
                icon={<IconX size={22} color={c.textMuted} />}
                onPress={onClose}
                label={t.common.close}
              />
            </View>
          )}
          {/*
            ⚠ 본문은 **줄어들 수 있어야** 한다 (2026-09-08 사용자 보고: "카테고리 만들 때
              저장 버튼이 없다"). RN 의 View 는 기본이 flexShrink: 0 이라, 내용이
              maxHeight 를 넘으면 본문이 그대로 커지고 **그 아래 버튼이 시트 밖으로
              밀려난다** — 보이지도, 눌리지도 않는다. 줄어들게 두면 안쪽 ScrollView 가
              남는 높이 안에서 스크롤하고 버튼은 바닥에 남는다.
          */}
          <Body style={scroll ? st.flex : st.shrink}>{children}</Body>
        </Card>
        </View>
      </Backdrop>
    </Modal>
  );
}

/**
 * Modal 안에서 자판 높이를 **직접 듣는다** (2026-09-08 사용자 보고: 소비기한 날짜를 직접
 * 입력하려는데 자판이 시트를 통째로 덮었다).
 *
 * ⚠⚠ 왜 `KeyboardSpacer` 가 아닌가. 그건 reanimated 의 IME 인셋을 읽는데, Modal 은 제
 *   윈도우를 따로 띄우므로 액티비티 윈도우의 인셋이 닿지 않아 **0** 이다 — 2026-09-06
 *   이동 화면에서 계측으로 확인한 사실이다. 카테고리 시트가 "잘 되는" 것처럼 보였던 건
 *   입력칸이 맨 위에 있어 자판이 덮어도 안 가려졌기 때문이지, 인셋이 왔기 때문이 아니다.
 *   실기기(Galaxy, Android 16)에서 소비기한 시트는 입력칸이 아래쪽이라 바로 드러났다.
 *
 *   RN 의 `Keyboard` 이벤트는 Modal 안에서도 온다. 그 높이만큼 시트를 밀어 올린다.
 *
 * ⚠ 안드로이드는 보고 높이에 **삼성 자판의 툴바 줄이 빠진다**(components/KeyboardSpacer
 *   주석 — 실측 100dp 가량). 넉넉하게 더한다. 남으면 시트가 조금 더 올라갈 뿐이고,
 *   모자라면 입력칸이 가려진다 — 틀릴 거면 넉넉한 쪽으로.
 */
function useModalKeyboardHeight(enabled: boolean): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEv, (e) =>
      setH(e.endCoordinates.height + (Platform.OS === 'android' ? 100 : 0)),
    );
    const hide = Keyboard.addListener(hideEv, () => setH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [enabled]);
  return h;
}

/**
 * 시트 안의 한 줄. 왼쪽 그림(선택) · 이름 · 고른 표시.
 *
 * ⚠ 그림 자리는 **하나라도 그림이 있으면 전부 자리를 차지한다.** 빈 줄만 글자가
 *   왼쪽으로 튀면 목록의 시작선이 어긋난다(이동 화면에서 겪은 것과 같은 문제).
 *   그래서 자리는 부르는 쪽이 `leading` 을 주는 줄에만 만들고, 목록 전체가 그림을
 *   쓰면 빈 줄에도 빈 타일을 넘긴다.
 */
export function SheetOption({
  label,
  leading,
  on = false,
  accent = false,
  danger = false,
  divider = false,
  onPress,
}: {
  label: string;
  leading?: ReactNode;
  /** 지금 고른 것 — 오른쪽에 체크가 붙는다 */
  on?: boolean;
  /**
   * 고른 값이 아니라 **다른 곳으로 데려가는 줄**(예: "카테고리 관리").
   * 강조색이지만 체크는 붙지 않는다 — 체크는 "지금 이것" 이라는 뜻이라 거짓말이 된다.
   */
  accent?: boolean;
  /** 되돌리기 어려운 동작 */
  danger?: boolean;
  divider?: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [
        st.option,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
        pressed && { opacity: 0.6 },
      ]}
    >
      {leading}
      <Text
        style={[
          st.optionText,
          { color: danger ? c.danger : on || accent ? c.accentText : c.text },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {on && <IconCheck size={20} color={c.accentText} />}
    </Pressable>
  );
}

/**
 * 화면을 꽉 채우는 모달의 머리말.
 *
 * ⚠ 점검에서 세 화면의 머리말이 제각각이었다 (2026-09-06): 제목 크기가 16·17·19,
 *   정렬이 가운데·왼쪽, 닫는 자리가 왼쪽·오른쪽으로 갈렸다. 등록 도중 이동 화면 →
 *   장소 만들기 시트로 **연달아 열리는 경로**가 있어서 사용자 눈에 바로 걸린다.
 *   한 벌로 못박는다 — 제목은 왼쪽, 동작은 오른쪽.
 */
export function ModalHeader({
  title,
  left,
  right,
}: {
  title: string;
  /** 취소처럼 **떠나는** 동작. 없으면 제목이 맨 왼쪽에서 시작한다 */
  left?: ReactNode;
  /** 확정하는 동작(저장·완료) 또는 닫기 */
  right?: ReactNode;
}) {
  const { c } = useTheme();
  return (
    <View style={[st.modalHead, { borderBottomColor: c.border }]}>
      {left}
      <Text style={[st.modalTitle, { color: c.text }]} numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}

const st = StyleSheet.create({
  /** 위 주석 참조 — minHeight: 0 이 없으면 내용 높이가 최소 높이가 되어 줄지 않는다 */
  shrink: { flexShrink: 1, minHeight: 0 },
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: overlay.scrim },
  /** 시트는 항상 아래에 붙는다 — 자판이 올라오면 KeyboardSpacer 가 그만큼 밀어 올린다 */
  flexEnd: { flex: 1, justifyContent: 'flex-end' },
  /** ⚠ 18 이 아니라 `radius.lg`(16) 다 — 세 곳이 나란히 척도를 벗어나 있었다 */
  sheet: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: space.lg,
  },
  label: {
    fontSize: type.tiny,
    fontWeight: '700',
    letterSpacing: tracking.wide,
    textTransform: 'uppercase',
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
    gap: space.md,
  },
  title: { flex: 1, fontSize: type.subtitle, fontWeight: '800', letterSpacing: tracking.tight },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
  },
  optionText: { flex: 1, fontSize: type.bodyStrong, fontWeight: '500' },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
    borderBottomWidth: 1,
    gap: space.md,
  },
  modalTitle: { flex: 1, fontSize: type.title, fontWeight: '700', letterSpacing: tracking.tight },
});
