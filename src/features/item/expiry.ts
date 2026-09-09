/**
 * 소비기한 (2026-09-08 사용자 요청) — **순수 계산만.** 화면·알림 모듈이 이걸 가져다 쓴다.
 *
 * 음식처럼 오래 두는 물건은 1~2년 뒤 기한이 오는데 그때쯤엔 있는지도 잊는다.
 * 그래서 ① 상세·격자에서 "D-N" 으로 보이고 ② 기기 알림이 미리 온다.
 *
 * ⚠ 날짜는 전부 `YYYY-MM-DD` 문자열(기기 로컬 날짜)로 다룬다. Date 객체로 들고 다니면
 *   시간대 때문에 하루가 밀린다 — 소비기한은 "그날까지" 라 시각이 없다.
 */

/** 알림을 걸 수 있는 "며칠 전" — 더보기의 토글이 이 넷이다 */
export const REMINDER_DAYS = [30, 10, 5, 1] as const;
export type ReminderDay = (typeof REMINDER_DAYS)[number];

const pad = (n: number) => String(n).padStart(2, '0');

export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 로컬 자정의 Date. 계산용 — 저장은 늘 문자열로 */
export function fromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayYmd(now: Date = new Date()): string {
  return toYmd(now);
}

/** 오늘부터 며칠 남았나. 오늘이면 0, 지났으면 음수 */
export function daysUntil(expiresOn: string, today: string = todayYmd()): number {
  // 로컬 자정끼리의 차이. 서머타임으로 한 시간 어긋나도 반올림하면 정수 일수다
  return Math.round((fromYmd(expiresOn).getTime() - fromYmd(today).getTime()) / 86_400_000);
}

/** 급한 정도. 색과 알림 단계가 여기서 갈린다 — 30일 안이면 "곧", 5일 안이면 "급함" */
export type ExpiryTone = 'expired' | 'urgent' | 'soon' | 'far';
export function expiryTone(days: number): ExpiryTone {
  if (days < 0) return 'expired';
  if (days <= 5) return 'urgent';
  if (days <= 30) return 'soon';
  return 'far';
}

/** 달을 더할 때 말일을 넘기면 그 달의 말일로 붙인다 (1/31 + 1개월 = 2/28) */
export function shiftYmd(ymd: string, by: { days?: number; months?: number; years?: number }): string {
  const base = fromYmd(ymd);
  const y = base.getFullYear() + (by.years ?? 0);
  const m = base.getMonth() + (by.months ?? 0);
  const lastDay = new Date(y, m + 1, 0).getDate();
  const d = new Date(y, m, Math.min(base.getDate(), lastDay));
  d.setDate(d.getDate() + (by.days ?? 0));
  return toYmd(d);
}

export function isValidYmd(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1970 || y > 2999 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(y, m, 0).getDate();
}

/** 세 칸(년·월·일)에서 만든다. 틀리면 null */
export function buildYmd(y: string, m: string, d: string): string | null {
  const yy = Number(y), mm = Number(m), dd = Number(d);
  if (!y || !m || !d || !isValidYmd(yy, mm, dd)) return null;
  return `${yy}-${pad(mm)}-${pad(dd)}`;
}

/* ───────────────────────────── 알림 계획 ───────────────────────────── */

export type ReminderSettings = {
  /** 통째로 끄기 */
  enabled: boolean;
  days: Record<ReminderDay, boolean>;
  /** 알림이 오는 시각(로컬, 0~23). 아침에 오는 편이 "오늘 확인해 봐야지" 로 이어진다 */
  hour: number;
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  days: { 30: true, 10: true, 5: true, 1: true },
  hour: 9,
};

export type ReminderSource = {
  id: string;
  name: string;
  /** "현관 팬트리 › 냉장고" — 알림 본문에 어디 있는지 적는다 */
  path?: string;
  expires_on: string | null;
};

export type ReminderPlan = {
  itemId: string;
  name: string;
  path: string;
  expiresOn: string;
  daysBefore: ReminderDay;
  fireAt: Date;
};

/**
 * ⚠ iOS 는 앱 하나가 걸어 둘 수 있는 예약 알림이 **64개**다. 물건 100개 × 4단계면 400개라
 *   다 걸 수 없다. 가까운 것부터 이만큼만 걸고, 앱을 열 때마다 다시 계산한다 —
 *   시간이 지나 앞의 것이 울리고 나면 그 뒤가 자리를 얻는다.
 *   대가: 앱을 아주 오래 안 열면 60번째 이후의 알림은 안 온다. 서버 푸시가 없는
 *   한계이고, 그래도 60개 안에는 몇 달치가 들어간다.
 */
export const MAX_SCHEDULED = 60;

/**
 * 지금 걸어야 할 알림들. **미래의 것만**, 가까운 순으로, 상한까지.
 *
 * 이미 지난 단계(D-30 이 어제였던 것)는 걸지 않는다 — 과거 시각으로 걸면 iOS 는 즉시
 * 울리는데, 기한을 방금 넣은 물건이 D-3 이라고 30·10·5 알림이 한꺼번에 오면 안 된다.
 */
/** 한 공간의 알림 재료 — 공간 이름과 그 공간의 물건들 */
export type SpaceSources = { name: string; items: ReminderSource[] };

/**
 * 여러 공간의 물건을 한 목록으로 합친다 (2026-09-09).
 * 공간이 둘 이상이면 경로 앞에 공간 이름을 붙인다("사무실 › 책상 › 서랍") — 알림만 보고
 * 어느 공간의 물건인지 알아야 한다. 하나뿐이면 붙이지 않는다(늘 같은 말이라 소음이다).
 * 상한(MAX_SCHEDULED)은 `planReminders` 가 **합친 목록**에 건다 — 공간 무관하게 가까운 순.
 */
export function mergeSpaceSources(spaces: SpaceSources[]): ReminderSource[] {
  const multi = spaces.length > 1;
  const out: ReminderSource[] = [];
  for (const sp of spaces) {
    for (const it of sp.items) {
      const path = multi ? [sp.name, it.path].filter(Boolean).join(' › ') : (it.path ?? '');
      out.push({ ...it, path });
    }
  }
  return out;
}

export function planReminders(
  items: ReminderSource[],
  settings: ReminderSettings,
  now: Date = new Date(),
): ReminderPlan[] {
  if (!settings.enabled) return [];
  const out: ReminderPlan[] = [];
  for (const it of items) {
    if (!it.expires_on) continue;
    for (const n of REMINDER_DAYS) {
      if (!settings.days[n]) continue;
      const fireAt = fromYmd(shiftYmd(it.expires_on, { days: -n }));
      fireAt.setHours(settings.hour, 0, 0, 0);
      if (fireAt.getTime() <= now.getTime()) continue;
      out.push({
        itemId: it.id,
        name: it.name,
        path: it.path ?? '',
        expiresOn: it.expires_on,
        daysBefore: n,
        fireAt,
      });
    }
  }
  out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  return out.slice(0, MAX_SCHEDULED);
}
