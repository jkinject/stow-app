import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space, type, useTheme } from '@/lib/theme';

/**
 * 화면 아래에 잠깐 떴다 사라지는 알림.
 *
 * 왜 필요한가: 성공을 알리는 데 `Alert` 을 쓰면 사용자가 확인을 눌러야 다음 일을 할 수
 * 있다. 잘된 일에 손을 한 번 더 쓰게 만드는 셈이라, 잦은 동작(물건 이동)에는 맞지 않는다.
 *
 * ⚠ `ToastAndroid` 를 쓰지 않는다. **안드로이드 전용**이라 iOS 에서는 아무 일도
 *   일어나지 않는다. 이 프로젝트에서 "한 플랫폼에서 되는 걸 보고 된다고 단정한" 실수를
 *   이미 여러 번 했다(기기 언어 판별, 매직링크). 직접 그리면 두 곳에서 똑같이 뜬다.
 *
 * ⚠ 실패는 여기로 알리지 않는다. 사라지는 알림은 놓칠 수 있다 — 무언가 잘못됐을 때는
 *   `Alert` 으로 붙잡아 두는 편이 맞다.
 */

type ToastFn = (message: string) => void;

const Ctx = createContext<ToastFn>(() => {});

/** 읽고 사라지기까지. 짧으면 놓치고, 길면 화면을 가린다 */
const VISIBLE_MS = 2600;
const FADE_MS = 180;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  /**
   * ⚠ `useRef(new Animated.Value(0)).current` 로 쓰지 않는다. 흔한 관용구지만
   *   렌더 중에 ref 를 읽는 것이라 린트가 막는다. 초기화 함수를 쓰는 useState 도
   *   똑같이 **한 번만** 만들고, 값 자체는 절대 바뀌지 않는다.
   */
  const [opacity] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<ToastFn>(
    (next) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(next);
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setMessage(null);
        });
      }, VISIBLE_MS);
    },
    [opacity],
  );

  // 화면이 사라진 뒤 타이머가 남아 setState 를 부르지 않게 한다
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      {message !== null && (
        /**
         * ⚠ `pointerEvents="none"` 이 없으면 알림이 떠 있는 동안 그 아래 버튼이
         *   눌리지 않는다. 알림은 보여 주기만 할 뿐 길을 막아서는 안 된다.
         */
        <View style={[st.layer, { bottom: insets.bottom + 24 }]} pointerEvents="none">
          <Animated.View
            style={[
              st.pill,
              { backgroundColor: c.text, opacity },
              {
                transform: [
                  { translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
                ],
              },
            ]}
          >
            <Text style={[st.text, { color: c.bg }]} numberOfLines={2}>
              {message}
            </Text>
          </Animated.View>
        </View>
      )}
    </Ctx.Provider>
  );
}

/** 성공을 알린다. 실패는 Alert 으로 — 위 주석 참고 */
export function useToast(): ToastFn {
  return useContext(Ctx);
}

const st = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: space.xl },
  pill: {
    maxWidth: '100%',
    borderRadius: radius.full,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  text: { fontSize: type.label, fontWeight: '600', textAlign: 'center' },
});
