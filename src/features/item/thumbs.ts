import type { ImageSource } from 'expo-image';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { photoPaths, supabase } from '@/lib/supabase';

/**
 * 썸네일 서명 URL 캐시 (R13).
 *
 * ⚠ Storage 는 비공개 버킷이라 서명 URL 이 필요한데 TTL 이 1시간이다. 그래서:
 *   · 동기화 페이로드에 서명 URL 을 담으면 안 된다 — 캐시에 굳으면 반드시 깨진다
 *   · 목록 스크롤마다 개별 발급하면 요청이 폭주한다
 *   · 앱을 한 시간 넘게 켜두면 화면에 떠 있던 URL 이 만료된다
 *
 * 대응: 보이는 범위만 **배치 발급**하고, 만료 시각을 추적해 **5분 전에 선제 갱신**한다.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠⚠ 여기 오래 있던 거짓말: "expo-image 의 디스크 캐시가 실제 바이트를 잡아준다".
 *     **틀렸다. 잡아준 적이 없다.**
 *
 *     expo-image 는 **URL 전체**를 캐시 키로 쓴다. 그런데 서명 URL 은
 *         .../object/sign/item-photos/<경로>?token=<JWT>
 *     이고 저 JWT 는 서명할 때마다 새로 만들어진다(exp 가 달라서 서명도 달라진다).
 *     실측으로 확인했다 — 같은 파일을 1.5초 간격으로 두 번 서명했더니
 *     물음표 앞은 같고 **전체 URL 은 달랐다.**
 *
 *     즉 서명을 새로 할 때마다 캐시 키가 바뀌어 **매번 통째로 다시 내려받고 있었다.**
 *     사진이 늦게 뜨는 이유가 이것이다.
 *
 *     고치는 법: `cacheKey` 를 **경로**로 준다. 경로는 사진을 바꿀 때마다 새 버전
 *     uuid 가 붙으므로(photoApi 의 `useSetPhoto`) 내용이 바뀌면 키도 바뀐다 —
 *     캐시 키로 쓰기에 정확히 맞는 값이다. 그래서 `get()` 이 문자열이 아니라
 *     **`{ uri, cacheKey }` 를 통째로** 돌려준다. 쓰는 쪽에서 cacheKey 를 빠뜨릴 수
 *     없게 하려는 것이다 — 빠뜨리면 조용히 예전 상태로 돌아간다.
 *
 *     덤: 캐시가 경로로 잡히므로 **토큰이 만료돼도 이미 받아둔 사진은 그대로 뜬다.**
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ⚠ 이 캐시는 **모듈 단위**다(화면마다가 아니라). 전에는 useState 라 탭을 옮길 때마다
 *   비워졌고, 돌아오면 보이는 것 전부를 다시 서명했다. 서명 한 번이 곧 재다운로드였으니
 *   탭 왕복마다 사진이 다시 로딩됐다.
 */

/**
 * 사진을 그리는 모든 곳이 같은 정책을 쓴다.
 *
 * expo-image 의 기본값은 `'disk'` 라 **메모리 캐시를 안 쓴다.** 그래서 스크롤을
 * 조금만 올렸다 내려도 디스크에서 다시 읽고 다시 디코드한다. `'memory-disk'` 는
 * 디코드된 비트맵을 메모리에 들고 있다가 바로 내준다 — 되돌아온 화면은 즉시 뜬다.
 * (메모리가 모자라면 알아서 비우고 디스크로 떨어진다)
 */
export const IMAGE_CACHE_POLICY = 'memory-disk' as const;

const TTL_SECONDS = 3600;
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // 만료 5분 전
const BATCH_LIMIT = 50;
/** 사진을 바꾸면 옛 경로 항목이 남는다. 무한히 쌓이지 않게 가끔 턴다 */
const MAX_ENTRIES = 1000;

type Entry = { url: string; expiresAt: number };

// ── 모듈 저장소 ────────────────────────────────────────────────
//
// ⚠ 스냅샷은 **갈아끼운다**(제자리에서 고치지 않는다). 같은 Map 을 계속 고치면
//   참조가 그대로라 React 가 "안 바뀌었다" 고 판단해 화면을 다시 그리지 않는다.
//   서명은 성공했는데 사진이 안 뜨는 그 버그가 정확히 이렇게 생긴다.
//   50건 남짓을 복사하는 비용은 서명이 도착할 때만 드는 것이라 무시할 수 있다.
let snapshot: ReadonlyMap<string, Entry> = new Map();
const inflight = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot() {
  return snapshot;
}

function commit(updates: Map<string, Entry>) {
  const next = new Map(snapshot);
  for (const [k, v] of updates) next.set(k, v);

  // 사진을 바꾸면 옛 경로 항목이 남는다. 넘칠 때만 만료된 것을 턴다
  if (next.size > MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of next) if (v.expiresAt <= now) next.delete(k);
  }

  snapshot = next;
  listeners.forEach((l) => l());
}

async function signBatch(paths: string[]) {
  const fresh = paths.filter((p) => !inflight.has(p));
  if (fresh.length === 0) return;
  fresh.forEach((p) => inflight.add(p));

  try {
    const updates = new Map<string, Entry>();
    for (let i = 0; i < fresh.length; i += BATCH_LIMIT) {
      const chunk = fresh.slice(i, i + BATCH_LIMIT);
      const { data, error } = await supabase.storage
        .from(photoPaths.bucket)
        .createSignedUrls(chunk, TTL_SECONDS);
      if (error) throw error;
      const now = Date.now();
      for (const row of data ?? []) {
        if (row.signedUrl && row.path) {
          updates.set(row.path, { url: row.signedUrl, expiresAt: now + TTL_SECONDS * 1000 });
        }
      }
    }
    if (updates.size > 0) commit(updates);
  } catch (e) {
    // 서명 실패는 화면을 막지 않는다 — 글자 폴백이 뜨고 목록은 그대로다.
    // 다만 조용히 삼키면 원인을 알 수 없으므로 개발 빌드에서는 남긴다.
    if (__DEV__) console.warn('[thumbs] 서명 실패', e);
  } finally {
    fresh.forEach((p) => inflight.delete(p));
  }
}

export function useThumbUrls() {
  // 모듈 저장소가 바뀌면 이 화면을 다시 그린다.
  // (전에는 useState 였다 — 그래서 화면마다 캐시가 따로 놀았다)
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  /**
   * 화면에 보이는 경로 중 없거나 곧 만료될 것만 배치로 발급한다.
   * 판단은 **모듈의 최신 스냅샷**으로 한다 — 렌더 시점에 붙잡힌 값으로 보면
   * 이미 서명된 것을 또 서명한다.
   */
  const ensure = useCallback((paths: (string | null | undefined)[]) => {
    const now = Date.now();
    const need = paths
      .filter((p): p is string => !!p)
      .filter((p) => {
        const e = snapshot.get(p);
        return !e || e.expiresAt - now < REFRESH_MARGIN_MS;
      });
    if (need.length > 0) void signBatch(need);
  }, []);

  /**
   * expo-image 에 그대로 넘길 source.
   * ⚠ `cacheKey` 가 핵심이다 — 이게 없으면 서명할 때마다 다시 내려받는다.
   *
   * ⚠ 읽는 곳은 모듈 변수가 아니라 **구독한 스냅샷**(`snap`)이다. 그래야 스냅샷이
   *   갈릴 때 이 함수의 참조도 함께 갈리고, 찾기 탭처럼 `renderItem` 을
   *   `useCallback([..., thumbs])` 로 memo 해 둔 FlatList 가 셀을 다시 그린다.
   *   모듈 변수를 직접 읽으면 참조가 영원히 그대로라 **서명이 끝나도 화면이 빈 채**
   *   남는다 — 이 파일에 이미 한 번 있었던 버그다(URL 을 ref 에 담았던 건).
   */
  const get = useCallback(
    (path: string | null | undefined): ImageSource | undefined => {
      if (!path) return undefined;
      const e = snap.get(path);
      return e ? { uri: e.url, cacheKey: path } : undefined;
    },
    [snap],
  );

  return useMemo(() => ({ ensure, get }), [ensure, get]);
}
