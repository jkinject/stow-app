import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * 키보드 높이를 px 로 돌려준다. 없으면 0.
 *
 * ⚠ `KeyboardAvoidingView` 를 쓰지 않는 이유:
 *   이 앱은 안드로이드 **edge-to-edge**(gradle.properties 의 `edgeToEdgeEnabled=true`)로
 *   돈다. edge-to-edge 에서는 `windowSoftInputMode=adjustResize` 가 **창을 줄이지 않고**
 *   IME inset 만 보고한다. 그런데 `KeyboardAvoidingView` 의 안드로이드 기본 동작
 *   (`behavior={undefined}`)은 **창이 줄어드는 것에 의존**하므로 아무 일도 하지 않는다.
 *   화면 아래쪽 입력칸이 키보드에 덮여 스크롤로도 닿지 않는 증상이 이것이다(실사용 보고).
 *
 *   `Keyboard` 이벤트는 edge-to-edge 와 무관하게 높이를 정확히 준다. 그 값을
 *   스크롤 영역의 아래 여백으로 더해 주면 **가려진 부분까지 스크롤해서 닿을 수 있다.**
 *
 * iOS 는 will* 이벤트가 애니메이션과 함께 와서 더 매끄럽고, 안드로이드는 did* 만 신뢰할 수 있다.
 *
 * ⚠ **삼성 키보드의 툴바 줄은 이 값에 안 잡힌다.** 실측: 보고값 373.8dp 인데 실제 가림은
 *   약 476dp 였다 — 100dp 가량 모자라 하단 고정 버튼이 잘렸다.
 *   화면 아래에 **버튼을 고정**해야 하는 경우에는 이 훅 대신
 *   `components/KeyboardSpacer`(Reanimated 의 IME 인셋)를 쓸 것.
 *   스크롤 여백을 더하는 용도로는 이 훅으로 충분하다.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
