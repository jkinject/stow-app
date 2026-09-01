import { Alert } from 'react-native';

/**
 * 되돌릴 수 없는 동작을 하기 전에 한 번 묻는다.
 *
 * ⚠ 확인창을 각 버튼마다 손으로 붙이면 **언젠가 빠뜨린다.** 실제로 사진 제거에서
 *   그랬다 — 뷰어에는 붙였는데 카메라 화면에는 없어서, 실수로 눌러 되돌릴 수 없는
 *   사진이 사라졌다(사용자 보고). 한 곳에 두고 거기서만 부른다.
 *
 * 왜 `Alert` 인가: 이 앱의 다른 파괴적 동작(물건 삭제·구성원 내보내기·탈퇴)이 전부
 *   `Alert` 를 쓴다. 사진 제거만 다른 모양이면 "이건 덜 위험한가" 로 읽힌다.
 */
export function confirmDestructive({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
}) {
  Alert.alert(title, body, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
