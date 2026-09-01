import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { EN } from './strings.en';
import { KO, type Dict } from './strings.ko';

/**
 * 국제화 (2026-08-30 사용자 요청).
 *
 * 규칙: **시스템 언어가 한국어면 한국어, 아니면 영어.** 사용자가 명시적으로 고르면 그게 이긴다.
 *
 * ⚠ `expo-localization` 을 쓰지 않았다. 네이티브 모듈이라 APK 재빌드가 필요한데,
 *   `Intl.DateTimeFormat().resolvedOptions().locale` 이 Hermes 에서 그대로 동작한다
 *   (실기기 확인: `ko-KR`). 재빌드 없이 JS 만으로 끝난다.
 *
 * ⚠ 사전은 **한국어를 기준(Dict 타입)** 으로 삼는다. 영어 사전이 키를 빠뜨리면
 *   타입 검사가 잡는다 — 번역 누락이 런타임에 빈 문자열로 새는 것을 막는다.
 */

export type Lang = 'ko' | 'en';

const STORAGE_KEY = 'home-store.lang';

function detectSystemLang(): Lang {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return locale.toLowerCase().startsWith('ko') ? 'ko' : 'en';
  } catch {
    // Intl 이 없는 환경이면 영어로 떨어뜨린다 — 읽을 수 있는 쪽이 낫다
    return 'en';
  }
}

type Ctx = {
  lang: Lang;
  /** 사용자가 직접 고른 값. null 이면 시스템을 따르는 중 */
  chosen: Lang | null;
  setLang: (l: Lang | null) => void;
  t: Dict;
  ready: boolean;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [chosen, setChosen] = useState<Lang | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (!alive) return;
        if (v === 'ko' || v === 'en') setChosen(v);
      })
      .catch(() => {})
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const setLang = useCallback((l: Lang | null) => {
    setChosen(l);
    if (l === null) void AsyncStorage.removeItem(STORAGE_KEY);
    else void AsyncStorage.setItem(STORAGE_KEY, l);
  }, []);

  const lang: Lang = chosen ?? detectSystemLang();

  const value = useMemo<Ctx>(
    () => ({ lang, chosen, setLang, t: lang === 'ko' ? KO : EN, ready }),
    [lang, chosen, setLang, ready],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n 은 I18nProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}

/** 문자열만 필요할 때의 지름길 */
export function useT(): Dict {
  return useI18n().t;
}
