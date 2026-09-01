import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';

/**
 * 키보드가 실제로 가리는 만큼 화면 아래를 비워 주는 컨테이너.
 *
 * ⚠ RN 의 `Keyboard` 이벤트(`endCoordinates.height`)를 쓰면 **삼성 키보드의 툴바 줄**
 *   (이모지·클립보드 아이콘이 있는 띠)이 빠진다. 실측: 보고값 373.8dp 인데 실제 가림은
 *   약 476dp — 100dp 가량 모자라 하단 버튼이 계속 잘렸다(실사용 보고 + 실기기 측정).
 *
 *   Reanimated 의 `useAnimatedKeyboard` 는 안드로이드에서 `WindowInsets` 의 IME 인셋을
 *   읽는다. 그 값에는 **IME 창 전체**가 들어가므로 툴바까지 포함된다.
 *   덤으로 키보드 애니메이션에 맞춰 부드럽게 따라간다.
 */
export function KeyboardSpacer({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  const keyboard = useAnimatedKeyboard();
  const animated = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
