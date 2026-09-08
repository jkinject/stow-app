import {
  DEFAULT_REMINDER_SETTINGS,
  MAX_SCHEDULED,
  buildYmd,
  daysUntil,
  expiryTone,
  planReminders,
  shiftYmd,
} from '../expiry';

/**
 * 소비기한 계산 (2026-09-08).
 *
 * 여기서 지키는 것: 날짜 산수가 시간대·서머타임·말일에 흔들리지 않고, 알림 계획이
 * **지난 단계를 걸지 않으며** iOS 상한(64)을 넘지 않는다.
 */

test('daysUntil — 오늘 0, 내일 1, 어제 -1', () => {
  expect(daysUntil('2026-09-08', '2026-09-08')).toBe(0);
  expect(daysUntil('2026-09-09', '2026-09-08')).toBe(1);
  expect(daysUntil('2026-09-07', '2026-09-08')).toBe(-1);
  // 서머타임 경계를 지나도 정수 일수다
  expect(daysUntil('2027-03-15', '2026-09-08')).toBe(188);
});

test('expiryTone — 만료·급함(≤5)·곧(≤30)·먼', () => {
  expect(expiryTone(-1)).toBe('expired');
  expect(expiryTone(0)).toBe('urgent');
  expect(expiryTone(5)).toBe('urgent');
  expect(expiryTone(6)).toBe('soon');
  expect(expiryTone(30)).toBe('soon');
  expect(expiryTone(31)).toBe('far');
});

test('shiftYmd — 말일을 넘기면 그 달 말일로, 연도는 그대로 더한다', () => {
  expect(shiftYmd('2026-01-31', { months: 1 })).toBe('2026-02-28');
  expect(shiftYmd('2028-01-31', { months: 1 })).toBe('2028-02-29');
  expect(shiftYmd('2026-09-08', { years: 2 })).toBe('2028-09-08');
  expect(shiftYmd('2026-09-08', { days: -30 })).toBe('2026-08-09');
  expect(shiftYmd('2026-09-08', { days: 7 })).toBe('2026-09-15');
});

test('buildYmd — 세 칸에서 만들고, 없는 날짜는 거른다', () => {
  expect(buildYmd('2027', '3', '5')).toBe('2027-03-05');
  expect(buildYmd('2027', '2', '30')).toBeNull();
  expect(buildYmd('2027', '13', '1')).toBeNull();
  expect(buildYmd('', '3', '5')).toBeNull();
  expect(buildYmd('27', '3', '5')).toBeNull();
});

const NOW = new Date(2026, 8, 8, 12, 0, 0); // 2026-09-08 정오

test('planReminders — 켠 단계만, 미래의 것만, 가까운 순', () => {
  const plans = planReminders(
    [{ id: 'a', name: '참치캔', path: '창고', expires_on: '2026-09-20' }],
    DEFAULT_REMINDER_SETTINGS,
    NOW,
  );
  // D-30(8/21) 은 지났다. D-10(9/10)·D-5(9/15)·D-1(9/19) 셋만
  expect(plans.map((p) => p.daysBefore)).toEqual([10, 5, 1]);
  expect(plans[0].fireAt.getHours()).toBe(9);
  expect(plans[0].fireAt.getDate()).toBe(10);
});

test('planReminders — 단계를 끄면 빠지고, 통째로 끄면 아무것도 없다', () => {
  const items = [{ id: 'a', name: 'x', expires_on: '2026-12-31' }];
  const off10 = planReminders(items, { ...DEFAULT_REMINDER_SETTINGS, days: { 30: true, 10: false, 5: true, 1: true } }, NOW);
  expect(off10.map((p) => p.daysBefore)).toEqual([30, 5, 1]);
  expect(planReminders(items, { ...DEFAULT_REMINDER_SETTINGS, enabled: false }, NOW)).toEqual([]);
});

test('planReminders — 기한이 오늘 지나면(D-1 이 어제) 아무것도 걸지 않는다', () => {
  expect(planReminders([{ id: 'a', name: 'x', expires_on: '2026-09-08' }], DEFAULT_REMINDER_SETTINGS, NOW)).toEqual([]);
});

test('planReminders — 상한(iOS 64)을 넘지 않고 가까운 것부터 남긴다', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({
    id: `i${i}`,
    name: `n${i}`,
    expires_on: shiftYmd('2026-12-01', { days: i }),
  }));
  const plans = planReminders(items, DEFAULT_REMINDER_SETTINGS, NOW);
  expect(plans).toHaveLength(MAX_SCHEDULED);
  for (let i = 1; i < plans.length; i++) {
    expect(plans[i].fireAt.getTime()).toBeGreaterThanOrEqual(plans[i - 1].fireAt.getTime());
  }
});
