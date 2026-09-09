import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueries } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import type { Household } from '@/features/household/api';
import { fetchAllItems, fetchLocationNames, itemPath, searchKeys } from '@/features/search/api';
import { useT } from '@/lib/i18n';

import {
  DEFAULT_REMINDER_SETTINGS,
  fromYmd,
  mergeSpaceSources,
  planReminders,
  type ReminderSettings,
  type ReminderSource,
} from './expiry';

/**
 * 소비기한 알림 (2026-09-08 사용자 요청) — **기기 로컬 알림**이다.
 *
 * ⚠⚠ 왜 서버 푸시가 아닌가. 서버에서 보내려면 FCM(Android)·APNs(iOS) 자격 증명을
 *   Expo 에 등록해야 하는데 아직 없다(google-services.json 없음, EAS 푸시 키 없음).
 *   로컬 알림은 자격 증명 없이 되고, 한 번 걸어 두면 **앱을 안 열어도** 그 시각에 울린다.
 *   대신 두 가지 한계가 있다 — expiry.ts 의 MAX_SCHEDULED 주석 참고:
 *     · iOS 는 예약 알림 64개 상한. 가까운 60개만 걸고 앱을 열 때마다 다시 계산한다.
 *     · 설정(며칠 전)이 **기기별**이다. 가족이 각자 원하는 대로 켜고 끈다.
 *
 * ⚠ 다시 거는 방식은 "전부 지우고 다시 건다" 다. 물건별로 맞춰 고치면 상태가 둘이 되어
 *   반드시 어긋난다(지운 물건의 알림이 남는 식). 이 앱은 다른 알림을 쓰지 않으므로
 *   전부 지워도 잃는 것이 없다.
 *
 * ⚠ 권한은 **설정 화면에서만** 묻지 않는다 — 물건에 기한을 넣는 순간이 "알림이 필요한
 *   순간" 이라 거기서도 한 번 묻는다(아직 안 물어본 경우에만). 거부했으면 다시 묻지 않고
 *   설정 화면에서 기기 설정으로 안내한다.
 */

const KEY = 'stow.expiry-reminders.v1';
const CHANNEL = 'expiry';

// 앱이 떠 있을 때 도착한 알림도 배너로 보여 준다 (기본은 조용히 삼킨다)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/* ───────────────────────────── 설정 저장소 ───────────────────────────── */

let settings: ReminderSettings = DEFAULT_REMINDER_SETTINGS;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 앱이 켜진 뒤 한 번만 읽는다. 읽기 전에는 기본값으로 동작한다 */
export function loadReminderSettings(): Promise<void> {
  if (!loaded) {
    loaded = AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as Partial<ReminderSettings>;
        settings = {
          ...DEFAULT_REMINDER_SETTINGS,
          ...saved,
          days: { ...DEFAULT_REMINDER_SETTINGS.days, ...(saved.days ?? {}) },
        };
        emit();
      })
      .catch(() => {
        /* 읽지 못하면 기본값 — 다음 저장 때 덮어쓴다 */
      });
  }
  return loaded;
}

export async function saveReminderSettings(next: ReminderSettings): Promise<void> {
  settings = next;
  emit();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 이번 실행에서는 메모리 값으로 동작한다 */
  }
}

export function useReminderSettings(): [ReminderSettings, (next: ReminderSettings) => Promise<void>] {
  const s = useSyncExternalStore(subscribe, () => settings, () => settings);
  useEffect(() => {
    void loadReminderSettings();
  }, []);
  return [s, saveReminderSettings];
}

/* ───────────────────────────── 권한 ───────────────────────────── */

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function getReminderPermission(): Promise<PermissionState> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return 'granted';
    /**
     * ⚠ 안드로이드(13+)는 **한 번도 안 물어본 상태**를 status 'denied' 로 보고한다
     *   (canAskAgain 만 true). status 로만 가르면 "권한이 꺼져 있습니다 → 기기 설정" 으로
     *   보내 버려서 앱이 물어볼 기회를 잃는다 — 실기기(Galaxy, Android 16)에서 그랬다.
     *   "다시 물어볼 수 있다" 가 곧 "아직 안 정했다" 다.
     */
    return p.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'denied';
  }
}

export async function requestReminderPermission(): Promise<boolean> {
  try {
    const p = await Notifications.requestPermissionsAsync();
    if (p.granted) {
      /**
       * ⚠ 허용된 순간 **다시 걸어야** 한다. 동기화는 목록·설정이 바뀔 때만 도는데, 권한만
       *   바뀐 지금은 둘 다 그대로라 아무것도 안 걸린다 — 앱을 껐다 켜기 전까지 "0개 예약".
       *   설정 객체를 새로 만들어 구독자를 깨운다(값은 같다).
       */
      settings = { ...settings };
      emit();
    }
    return p.granted;
  } catch {
    return false;
  }
}

/** 아직 안 물어봤을 때만 묻는다 — 기한을 넣는 순간에 부른다 */
export async function nudgeReminderPermission(): Promise<void> {
  if (!settings.enabled) return;
  if ((await getReminderPermission()) !== 'undetermined') return;
  await requestReminderPermission();
}

/* ───────────────────────────── 스케줄 ───────────────────────────── */

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Expiry reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

type Texts = {
  title: (name: string, daysBefore: number) => string;
  body: (date: string, path: string) => string;
  date: (y: number, m: number, d: number) => string;
};

let syncing: Promise<number> | null = null;
let queued: { items: ReminderSource[]; texts: Texts } | null = null;

/**
 * 지금 목록·설정대로 알림을 다시 건다. 걸린 개수를 돌려준다.
 *
 * ⚠ 겹쳐 부르면 마지막 것만 남긴다. 목록 재조회·설정 변경·앱 복귀가 연달아 오는데,
 *   그때마다 "전부 지우고 다시" 를 동시에 돌리면 서로의 결과를 지운다.
 */
export function syncExpiryReminders(items: ReminderSource[], texts: Texts): Promise<number> {
  queued = { items, texts };
  if (syncing) return syncing;
  syncing = (async () => {
    let n = 0;
    while (queued) {
      const job = queued;
      queued = null;
      n = await syncOnce(job.items, job.texts);
    }
    syncing = null;
    return n;
  })();
  return syncing;
}

async function syncOnce(items: ReminderSource[], texts: Texts): Promise<number> {
  try {
    await loadReminderSettings();
    const plans = planReminders(items, settings);
    if (plans.length === 0 || (await getReminderPermission()) !== 'granted') {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return 0;
    }
    await ensureChannel();
    await Notifications.cancelAllScheduledNotificationsAsync();
    for (const p of plans) {
      const d = fromYmd(p.expiresOn);
      await Notifications.scheduleNotificationAsync({
        identifier: `expiry:${p.itemId}:${p.daysBefore}`,
        content: {
          title: texts.title(p.name, p.daysBefore),
          body: texts.body(texts.date(d.getFullYear(), d.getMonth() + 1, d.getDate()), p.path),
          data: { itemId: p.itemId },
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: p.fireAt,
          channelId: CHANNEL,
        },
      });
    }
    return plans.length;
  } catch (e) {
    if (__DEV__) console.warn('[reminders] 스케줄 실패', e);
    return 0;
  }
}

/**
 * 목록이나 설정이 바뀌면, 그리고 앱으로 돌아올 때마다 알림을 다시 건다.
 * 탭 레이아웃 한 곳에서만 부른다 — 화면마다 부르면 같은 일을 여러 번 한다.
 *
 * ⚠ **내가 속한 모든 공간**의 물건이다 (2026-09-09). 활성 공간만 걸면 집을 보는 동안
 *   사무실 물건의 기한은 알림이 안 온다. 공간마다 찾기 탭과 같은 키(`searchKeys.all`)·같은
 *   조회로 돌려 활성 공간은 캐시를 공유하고, 나머지는 여기서 처음 읽는다.
 */
export function useExpiryReminderSync(households: Household[]) {
  const itemQueries = useQueries({
    queries: households.map((h) => ({
      queryKey: searchKeys.all(h.id),
      queryFn: () => fetchAllItems(h.id),
      staleTime: 30_000,
    })),
  });
  const nameQueries = useQueries({
    queries: households.map((h) => ({
      queryKey: searchKeys.names(h.id),
      queryFn: () => fetchLocationNames(h.id),
      staleTime: 60_000,
    })),
  });
  const [s] = useReminderSettings();
  const t = useT();

  const isLoading = itemQueries.some((q) => q.isLoading) || nameQueries.some((q) => q.isLoading);
  /**
   * ⚠ 데이터가 실제로 바뀔 때만 다시 합친다. `useQueries` 결과 배열은 렌더마다 새것이라
   *   그대로 의존성에 넣으면 매 렌더 합치고, 그러면 아래 effect 가 매 렌더 알림을 다시 건다.
   *   공간 수가 바뀌면 의존성 길이가 바뀌므로 스프레드 대신 갱신 시각을 한 문자열로 접는다.
   */
  const version = [...itemQueries, ...nameQueries].map((q) => q.dataUpdatedAt).join(',');
  const items = useMemo<ReminderSource[]>(
    () =>
      mergeSpaceSources(
        households.map((h, i) => ({
          name: h.name,
          items: (itemQueries[i]?.data ?? []).map((r) => ({
            id: r.id,
            name: r.name,
            expires_on: r.expires_on,
            path: itemPath(r, nameQueries[i]?.data),
          })),
        })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version 이 두 결과 배열을 대신한다
    [households, version],
  );

  useEffect(() => {
    if (items.length === 0 && isLoading) return; // 아직 안 읽었으면 지금 걸린 것을 지우지 않는다
    const texts: Texts = {
      title: t.reminders.notifTitle,
      body: t.reminders.notifBody,
      date: t.time.date,
    };
    const run = () => void syncExpiryReminders(items, texts);
    run();
    // 하루가 지나 앞의 알림이 울렸으면 그 자리에 다음 것을 넣어야 한다
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') run();
    });
    return () => sub.remove();
  }, [items, isLoading, s, t]);
}
