import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * 첫 실행 안내의 진행 상태.
 *
 * 3단계 중 **1·2단계는 저장하지 않는다** — 장소가 있는지, 물건이 있는지는
 * 이미 DB 에 있는 사실이라 화면에서 세면 된다. 따로 저장해 두면 두 값이
 * 어긋나는 날이 온다(물건을 다 지웠는데 "완료" 로 남는 식).
 *
 * 저장이 필요한 것은 두 가지뿐이다:
 *   · `searched`  — 검색해서 실제로 찾아본 적이 있는가 (3단계). DB 가 모른다.
 *   · `dismissed` — 사용자가 안내를 닫았는가.
 *
 * ⚠⚠ **사용자별로 따로 저장한다.** 처음엔 기기별이었고, 주석에 "안내는 사람이 아니라
 *   그 기기의 경험에 붙는 것이 맞다" 고 적어 뒀었다. **틀렸다.**
 *   같은 폰에서 안내를 닫은 뒤 **다른 계정으로 새로 가입**했더니, 물건이 하나도 없는
 *   빈 화면에 "아직 등록된 물건이 없습니다" 만 떴다(사용자 보고 2026-09-01).
 *   그 사람에게는 분명히 처음인데 안내가 사라진 것이다.
 *   기기를 공유하는 가족 앱이라 이 상황은 예외가 아니라 **정상 경로**다.
 *
 * ⚠ 그래도 서버에는 두지 않는다. 서버에 두면 가구 단위가 되어, 이미 익숙한 가족이
 *   켠 앱 때문에 새로 들어온 사람의 안내까지 사라진다. 기기 안에, 사람별로 둔다.
 */

/** ⚠ v1 은 기기 단위였다. 키를 바꿔 옛 값이 새 규칙에 섞이지 않게 한다 */
const PREFIX = 'starter.v2:';
const keyFor = (userId: string | null) => PREFIX + (userId ?? 'anon');

type State = { searched: boolean; dismissed: boolean };
const EMPTY: State = { searched: false, dismissed: false };

// ── 저장소 ────────────────────────────────────────────────────
//
// ⚠ 스냅샷은 갈아끼운다(제자리 수정 금지). 같은 객체를 고치면 참조가 그대로라
//   React 가 "안 바뀌었다" 고 보고 화면을 다시 그리지 않는다.
const snapshots = new Map<string, State>();
const loading = new Set<string>();
/**
 * ⚠ 이미 `patch()` 가 돈 키.
 *   저장소 읽기는 비동기다. 그 사이에 사용자가 검색을 하면 `patch()` 가 먼저
 *   메모리를 고치고 저장까지 끝내는데, **뒤늦게 도착한 예전 값이 그걸 덮어썼다.**
 *   화면이 3/3 이 됐다가 2/3 으로 되돌아가고 그 뒤로 아무도 다시 쓰지 않으니
 *   영영 사라진다 — 실기기에서 실제로 그렇게 잃었다(2026-09-01).
 *   `patch()` 는 항상 합쳐진 전체를 저장하므로, 한 번이라도 돌았다면 메모리 쪽이
 *   최신이고 이미 저장도 됐다. 그럴 땐 읽어 온 값을 버린다.
 */
const dirty = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function ensureLoaded(key: string) {
  if (loading.has(key) || snapshots.has(key)) return;
  loading.add(key);
  void AsyncStorage.getItem(key)
    .then((raw) => {
      if (!raw || dirty.has(key)) return;
      snapshots.set(key, { ...EMPTY, ...(JSON.parse(raw) as Partial<State>) });
      emit();
    })
    // 읽기 실패는 안내를 다시 보여주는 것으로 끝난다 — 화면을 막을 이유가 없다
    .catch(() => undefined);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function patch(key: string, next: Partial<State>) {
  const cur = snapshots.get(key) ?? EMPTY;
  const merged = { ...cur, ...next };
  if (merged.searched === cur.searched && merged.dismissed === cur.dismissed) return;
  snapshots.set(key, merged);
  dirty.add(key);
  emit();
  void AsyncStorage.setItem(key, JSON.stringify(merged)).catch(() => undefined);
}

export function useStarterState(userId: string | null) {
  const key = keyFor(userId);
  ensureLoaded(key);

  const state = useSyncExternalStore(
    subscribe,
    () => snapshots.get(key) ?? EMPTY,
    () => snapshots.get(key) ?? EMPTY,
  );

  const markSearched = useCallback(() => patch(key, { searched: true }), [key]);
  const dismiss = useCallback(() => patch(key, { dismissed: true }), [key]);

  /**
   * ⚠ 매 렌더마다 새 객체를 돌려주면, 이걸 의존성으로 쓰는 쪽(찾기 탭의 `onQuery`)의
   *   useCallback 이 계속 다시 만들어진다. 스냅샷이 바뀔 때만 갈리도록 묶어 둔다.
   */
  return useMemo(() => ({ ...state, markSearched, dismiss }), [state, markSearched, dismiss]);
}
