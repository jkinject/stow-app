import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { EN } from './strings.en';
import { KO, type Dict } from './strings.ko';

/**
 * 국제화 (2026-08-30 사용자 요청).
 *
 * 규칙: **시스템 언어가 한국어면 한국어, 아니면 영어.** 사용자가 명시적으로 고르면 그게 이긴다.
 *
 * ⚠⚠ 예전에는 `Intl.DateTimeFormat().resolvedOptions().locale` 만 봤다. 네이티브 모듈을
 *   안 쓰려는 의도였고, 주석에는 "실기기 확인: ko-KR" 이라고 적혀 있었다.
 *   **그 확인은 안드로이드에서만 한 것이었다.**
 *
 *   iOS 시뮬레이터에서 기기 언어를 `ko-KR` 로 두고 켰는데 앱이 **영어로 떴다**
 *   (2026-09-01). iOS 의 Hermes 는 `Intl` 이 기기 언어를 따라오지 않는다.
 *   한 플랫폼에서 되는 걸 보고 "동작한다" 고 적어 둔 것이 문제였다.
 *
 *   지금은 `expo-localization` 을 쓴다. 네이티브 모듈이라 재빌드가 필요하지만,
 *   언어 판별은 앱의 첫인상을 좌우하는 것이라 확실한 쪽이 맞다.
 *
 * ⚠ 사전은 **한국어를 기준(Dict 타입)** 으로 삼는다. 영어 사전이 키를 빠뜨리면
 *   타입 검사가 잡는다 — 번역 누락이 런타임에 빈 문자열로 새는 것을 막는다.
 */

export type Lang = 'ko' | 'en';

const STORAGE_KEY = 'home-store.lang';

function detectSystemLang(): Lang {
  try {
    // 사용자가 설정에 넣어 둔 **선호 언어 순서**를 그대로 본다.
    // 첫 번째가 한국어가 아니어도 목록에 있으면 한국어를 읽을 수 있는 사람이다.
    const codes = getLocales().map((l) => (l.languageCode ?? '').toLowerCase());
    if (codes.some((c) => c === 'ko')) return 'ko';
    if (codes.length > 0) return 'en';
  } catch {
    // 모듈이 없는 환경(웹 미리보기 등)에서는 아래로 떨어진다
  }
  try {
    // ⚠ 여기까지 왔다면 마지막 수단이다. iOS 에서는 못 믿는다(위 주석 참고).
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('ko')
      ? 'ko'
      : 'en';
  } catch {
    // 읽을 수 있는 쪽으로 떨어뜨린다
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
