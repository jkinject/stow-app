import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Keyboard } from 'react-native';
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
 *
 * ⚠⚠ **화면을 떠날 때 키보드를 내린다** (실기기 확인 2026-09-02).
 *
 *   키보드를 올린 채 다른 화면으로 넘어가면, 떠나는 화면이 사라지며 추적이 끊기고
 *   키보드는 그 뒤에 닫힌다 — 닫혔다는 사실을 아무도 못 듣는다. 그래서 도착한 화면이
 *   **닫혀 있는 키보드의 높이**를 그대로 물려받아 아래 3분의 1이 이유 없이 빈다.
 *   등록 직후 물건 상세에서 드러났고, 등록 화면을 취소로 빠져나올 때도 같았다.
 *
 *   화면이 **아직 떠 있는 동안** 내리면 그 변화가 제대로 기록된다.
 *
 *   ⚠ 처음에는 도착한 쪽에서 막으려 했다 — 뜰 때 "지금 키보드가 보이나" 를 물어보고
 *     안 보이는데 높이가 남았으면 0 으로 보는 방식. **안 먹혔다**: 인셋 값은 화면이
 *     붙고 조금 뒤에 native 에서 들어와서, 그 시점에는 아직 0 이었다. 값이 언제
 *     들어오는지에 기대는 대신, 어긋난 값이 생기지 않게 하는 편이 확실하다.
 */
export function KeyboardSpacer({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  const keyboard = useAnimatedKeyboard();

  useFocusEffect(
    useCallback(
      () => () => {
        Keyboard.dismiss();
      },
      [],
    ),
  );

  const animated = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
