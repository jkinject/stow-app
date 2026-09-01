import type { useT } from './i18n';

/**
 * "방금 · 3분 전 · 2시간 전 · 5일 전 · 2026. 8. 1." 로 적는다.
 *
 * ⚠ 이 함수는 원래 `item/[id].tsx`, `container/[id].tsx`, `location/[id].tsx` 에
 *   **글자 하나 다르지 않은 사본으로 세 벌** 있었다. 변경 이력을 별도 화면으로
 *   뺄 때 네 번째 사본이 생길 참이어서 여기로 모았다. 이런 것은 한쪽만 고쳐지는
 *   날이 반드시 온다 — 이 프로젝트에서 이미 여러 번 겪었다.
 *
 * ⚠ 일주일이 넘으면 상대 시간을 그만두고 날짜를 적는다. "37일 전" 은 사람이
 *   머릿속에서 다시 날짜로 바꿔야 하므로 그 시점부터는 도움이 안 된다.
 */
export function relTime(iso: string, t: ReturnType<typeof useT>): string {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return t.time.justNow;
  if (mins < 60) return t.time.minutesAgo(mins);
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t.time.hoursAgo(hrs);
  const days = Math.floor(hrs / 24);
  if (days < 7) return t.time.daysAgo(days);
  return t.time.date(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
