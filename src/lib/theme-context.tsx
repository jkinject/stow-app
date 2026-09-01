import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * 테마 선택 (2026-08-30 사용자 요청): 시스템 기본 / 라이트 / 다크.
 *
 * ⚠ 실제 색을 고르는 곳은 `useTheme()`(lib/theme.ts) 하나로 유지한다.
 *   여기서는 "무엇을 따를지"만 들고 있는다. 색 결정 지점이 둘이 되면
 *   한쪽만 고쳐지는 날이 온다.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'home-store.theme';

type Ctx = { choice: ThemeChoice; setChoice: (v: ThemeChoice) => void };
const ThemeChoiceContext = createContext<Ctx | null>(null);

export function ThemeChoiceProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>('system');

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (alive && (v === 'light' || v === 'dark' || v === 'system')) setChoiceState(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const setChoice = useCallback((v: ThemeChoice) => {
    setChoiceState(v);
    void AsyncStorage.setItem(STORAGE_KEY, v);
  }, []);

  const value = useMemo(() => ({ choice, setChoice }), [choice, setChoice]);
  return <ThemeChoiceContext.Provider value={value}>{children}</ThemeChoiceContext.Provider>;
}

/** 선택값을 읽는다. 프로바이더 밖이면 null — 그때는 시스템을 따른다 */
export function useThemeOverride(): ThemeChoice | null {
  return useContext(ThemeChoiceContext)?.choice ?? null;
}

export function useThemeChoice(): Ctx {
  const ctx = useContext(ThemeChoiceContext);
  if (!ctx) throw new Error('useThemeChoice 는 ThemeChoiceProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}
