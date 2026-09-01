/**
 * AC2 등록 사이클 타임 계측 (계획 §5 M4).
 *
 * ⚠ "저장 완료"를 종료 시점으로 잡으면 안 된다. 낙관적 삽입에서 그건 로컬 캐시
 *   삽입이라 사실상 0ms 다. 그 정의를 쓰면 아무리 느린 앱도 게이트를 통과하고,
 *   반대로 사용자가 망설인 시간은 성능으로 계산된다. 게이트가 무의미해진다.
 *
 * 측정 구간:
 *   1번째 물건  : 첫 입력 행동(셔터 탭 또는 이름 첫 키 입력 중 먼저 오는 것) → 폼 리셋 완료
 *   2번째 이후  : 이전 폼 리셋 완료 → 현재 폼 리셋 완료
 *
 * "폼 리셋 완료"는 **다음 물건을 받을 준비가 된 시점**이다. 카메라 프리뷰 재개와
 * 이름 필드 재포커스가 끝나야 한다. 앞당겨 보고해도 그 시간이 다음 사이클 시작으로
 * 넘어가므로 20건 median 은 변하지 않는다 (영합).
 *
 * 서버 반영 시간은 여기 포함하지 않는다 — 별도 지표다 (계획 §7.4).
 */

export type Cycle = { index: number; ms: number; withPhoto: boolean };

let cycleStart: number | null = null;
let cycles: Cycle[] = [];
let serverLatencies: number[] = [];

/** 첫 입력 행동. 이미 사이클이 열려 있으면 무시한다 (첫 행동만 기록) */
export function markFirstInput() {
  if (cycleStart === null) cycleStart = Date.now();
}

/** 폼 리셋 완료 — 사이클을 닫고 즉시 다음 사이클을 연다 */
export function markFormReady(withPhoto: boolean) {
  const now = Date.now();
  if (cycleStart !== null) {
    cycles.push({ index: cycles.length + 1, ms: now - cycleStart, withPhoto });
  }
  cycleStart = now; // 2번째 이후는 여기가 시작점
}

/** 화면을 벗어나면 열린 사이클을 버린다 (중단된 등록은 계측 대상이 아니다) */
export function abandonCycle() {
  cycleStart = null;
}

export function recordServerLatency(ms: number) {
  serverLatencies.push(ms);
}

export function reset() {
  cycleStart = null;
  cycles = [];
  serverLatencies = [];
}

export function getCycles(): Cycle[] {
  return cycles;
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const a = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

export type Summary = {
  count: number;
  medianMs: number | null;
  p95Ms: number | null;
  photoRatio: number;
  serverMedianMs: number | null;
  /** AC2 판정. 20건 이상 + median ≤10초 + 사진 포함 15건 이상 */
  verdict: 'pending' | 'pass' | 'fail';
  reason: string;
};

export function summarize(): Summary {
  const ms = cycles.map((c) => c.ms);
  const med = median(ms);
  const sorted = [...ms].sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : null;
  const withPhoto = cycles.filter((c) => c.withPhoto).length;

  let verdict: Summary['verdict'] = 'pending';
  let reason = `${cycles.length}/20건`;

  if (cycles.length >= 20) {
    // ⚠ 사진 없이 이름만 넣으면 사이클이 훨씬 빨라 비현실적으로 통과한다.
    //   AC2 원문이 "사진 1장 + 이름 + 저장"이므로 사진 비율을 판정에 넣는다.
    if (withPhoto < 15) {
      verdict = 'fail';
      reason = `사진 포함이 ${withPhoto}/20건 — 최소 15건 필요`;
    } else if (med !== null && med <= 10_000) {
      verdict = 'pass';
      reason = `median ${(med / 1000).toFixed(1)}초 ≤ 10초`;
    } else {
      verdict = 'fail';
      reason = `median ${((med ?? 0) / 1000).toFixed(1)}초 > 10초`;
    }
  }

  return {
    count: cycles.length,
    medianMs: med,
    p95Ms: p95,
    photoRatio: cycles.length ? withPhoto / cycles.length : 0,
    serverMedianMs: median(serverLatencies),
    verdict,
    reason,
  };
}
