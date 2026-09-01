import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';

import { recordServerLatency } from './metrics';
import { uploadPhoto, type PreparedPhoto } from './photo';

/**
 * 등록 큐 — 계획 §2.4 의 긴장(P1 등록 마찰 최소화 ↔ P4 서버가 진실의 원천) 해소.
 *
 * 낙관적 삽입은 "저장 완료"를 즉시 보여준다. 그런데 2초 뒤 서버 INSERT 가 실패하면
 * 사용자는 이미 다음 물건을 입력 중이다.
 *   · P1 을 지키면 → 에러를 조용히 두어 유실을 못 알아챈다
 *   · P4 를 지키면 → 항목을 캐시에서 지워 목록이 깜빡이고 신뢰가 깨진다
 *
 * 해소: **실패해도 항목을 지우지 않고 "동기화 실패" 배지 + 재시도**.
 * 사진 업로드 실패(AC4)와 같은 패턴이라 UX 가 하나로 통일된다.
 *
 * ⚠ 이 큐가 오프라인 쓰기 큐로 미끄러지면 Non-Goal(C2) 위반이다. 가드레일:
 *   · 상한 10건. 초과하면 등록을 막는다
 *   · **앱 종료 시 큐를 유지하지 않는다** (사진 업로드와 다른 점 — 사진은 이미 서버에
 *     행이 있지만 여기는 행 자체가 없다). 영속화하면 오프라인 등록 기능이 되어버린다.
 *
 * ⚠ 설계 주의: 이전 구현은 `setPending(prev => { snapshot = prev; return prev; })` 로
 *   현재 목록을 읽어 순회했다. **setState 업데이터는 동기적으로 실행되지 않으므로**
 *   snapshot 이 빈 배열인 채 루프가 돌아 아무것도 저장되지 않았다(실기기에서 "저장 중…"
 *   에서 멈춤). 이제 항목을 직접 넘겨 처리하고, 상태는 UI 표시용으로만 쓴다.
 *
 * ⚠ 설계 주의 2: 이 큐는 원래 **어떤 캐시도 무효화하지 않았다.** 등록을 마치고 "완료" 로
 *   돌아가면 아래 화면은 언마운트된 적이 없어서 TanStack Query 가 다시 조회하지 않는다.
 *   그래서 방금 넣은 물건이 목록에 없다. 앱을 껐다 켜면 나타나므로 "저장이 안 됐나?" 로
 *   보이지만 실제로는 저장돼 있다(실기기 낱개 등록에서 확인, DB 대조까지 함).
 *   서버 INSERT 가 성공한 시점에 관련 목록을 무효화한다.
 */

export const QUEUE_LIMIT = 10;

export type DraftItem = {
  id: string; // 클라이언트가 만든 UUID — 서버 응답·Realtime 과 같은 id 라 중복이 불가능하다
  household_id: string;
  location_id: string;
  container_id: string | null;
  name: string;
  category: string | null;
  quantity: number;
  threshold: number | null;
  unit: string | null;
  purchase_url: string | null;
  note: string | null;
};

export type PendingState = 'saving' | 'uploading' | 'done' | 'row_failed' | 'photo_failed';

export type Pending = {
  draft: DraftItem;
  photo: PreparedPhoto | null;
  state: PendingState;
  error?: string;
  attempts: number;
};

async function insertRow(draft: DraftItem) {
  const t0 = Date.now();
  // created_by/updated_by 는 보내지 않는다 — default auth.uid() + t10 트리거가 채운다 (P3)
  const { error } = await supabase.from('items').insert({
    id: draft.id,
    household_id: draft.household_id,
    location_id: draft.location_id,
    container_id: draft.container_id,
    name: draft.name,
    category: draft.category,
    quantity: draft.quantity,
    threshold: draft.threshold,
    unit: draft.unit,
    purchase_url: draft.purchase_url,
    note: draft.note,
  });
  if (error) throw error;
  recordServerLatency(Date.now() - t0);
}

async function attachPhoto(draft: DraftItem, photo: PreparedPhoto) {
  const { thumbPath, photoPath } = await uploadPhoto(draft.household_id, draft.id, photo);
  const { error } = await supabase
    .from('items')
    .update({ thumb_path: thumbPath, photo_path: photoPath })
    .eq('id', draft.id);
  if (error) throw error;
}

export function useRegisterQueue(onSynced?: () => void) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<Pending[]>([]);
  const itemsRef = useRef(new Map<string, Pending>()); // 재시도 시 원본을 찾기 위한 거울
  const onSyncedRef = useRef(onSynced);

  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  const patch = useCallback((id: string, next: Partial<Pending>) => {
    const cur = itemsRef.current.get(id);
    if (cur) itemsRef.current.set(id, { ...cur, ...next });
    setPending((prev) => prev.map((p) => (p.draft.id === id ? { ...p, ...next } : p)));
  }, []);

  /** 항목 하나를 끝까지 처리한다. 목록을 훑지 않고 대상을 직접 받는다 */
  /**
   * 방금 넣은 물건이 보여야 할 목록들을 다시 불러오게 한다.
   *
   * 등록은 사람 손 속도(실측 median 1.3초)라 항목당 작은 조회 몇 건이 더 도는 건
   * 문제가 되지 않는다. 반대로 목록이 안 맞으면 "저장이 안 됐다" 로 읽혀
   * 같은 물건을 두 번 넣게 된다 — 그쪽이 훨씬 비싸다.
   */
  const invalidateLists = useCallback(
    (draft: DraftItem) => {
      void qc.invalidateQueries({ queryKey: ['items'] });        // 박스 내용물 · 낱개 목록
      void qc.invalidateQueries({ queryKey: ['search'] });       // 검색 인덱스
      void qc.invalidateQueries({ queryKey: ['locations'] });    // 장소별 물건 수
      void qc.invalidateQueries({ queryKey: ['containers'] });   // 박스별 물건 수
      void qc.invalidateQueries({ queryKey: ['all-containers'] });
      void qc.invalidateQueries({ queryKey: ['container', draft.container_id ?? ''] });
      // ⚠ 등록 직후 **그 물건의 상세 화면**으로 넘어가므로 상세 캐시도 비워야 한다.
      //   빠뜨리면 사진 업로드가 끝나도 상세는 "사진 추가" 인 채로 남는다(실기기 확인).
      void qc.invalidateQueries({ queryKey: ['item', draft.id] });
      // 수량 0 으로 등록하면 트리거가 곧바로 구매 리스트에 넣는다 — 그것도 다시 읽는다
      void qc.invalidateQueries({ queryKey: ['shopping'] });
      void qc.invalidateQueries({ queryKey: ['category-list'] });
    },
    [qc],
  );

  /**
   * @param onRowSaved 행이 서버에 들어간 **직후** 호출된다. 사진 업로드는 기다리지 않는다.
   *   등록 후 상세 화면으로 넘어가는 흐름에서, 행이 없는 상태로 넘어가면 상세가
   *   "물건을 찾을 수 없습니다" 를 띄우기 때문에 이 시점이 필요하다.
   */
  const processOne = useCallback(
    async (
      draft: DraftItem,
      photo: PreparedPhoto | null,
      skipInsert = false,
      onRowSaved?: () => void,
    ) => {
      if (!skipInsert) {
        try {
          await insertRow(draft);
          patch(draft.id, { state: photo ? 'uploading' : 'done', error: undefined });
          invalidateLists(draft);
          onSyncedRef.current?.();
          onRowSaved?.();
        } catch (e) {
          patch(draft.id, {
            state: 'row_failed',
            error: e instanceof Error ? e.message : '저장 실패',
          });
          throw e; // 부르는 쪽이 "저장 실패" 를 알아야 화면을 넘기지 않는다
        }
      }

      // 사진은 행이 생긴 뒤에 붙인다. 실패해도 물건은 이미 저장돼 있다 (AC4)
      if (photo) {
        try {
          await attachPhoto(draft, photo);
          patch(draft.id, { state: 'done', error: undefined });
          invalidateLists(draft); // 썸네일 경로가 생겼으므로 목록을 다시 그린다
          onSyncedRef.current?.();
        } catch (e) {
          patch(draft.id, {
            state: 'photo_failed',
            error: e instanceof Error ? e.message : '사진 업로드 실패',
          });
        }
      }
    },
    [invalidateLists, patch],
  );

  const enqueue = useCallback(
    (draft: DraftItem, photo: PreparedPhoto | null) => {
      const entry: Pending = { draft, photo, state: 'saving', attempts: 0 };
      itemsRef.current.set(draft.id, entry);
      setPending((prev) => [entry, ...prev]);
      // 서버 응답을 기다리지 않는다 (P1). 실패는 목록의 배지로 알린다.
      void processOne(draft, photo).catch(() => {});
    },
    [processOne],
  );

  /**
   * 행이 저장될 때까지 기다린다. **사진 업로드는 기다리지 않는다** —
   * 사진은 뒤에서 계속 올라가고, 끝나면 무효화가 화면을 갱신한다 (AC4).
   *
   * 등록 후 곧바로 상세 화면으로 넘어가는 흐름에서 쓴다. 실측 서버 왕복이 ~145ms 라
   * 기다려도 체감이 없다. 반대로 안 기다리면 상세가 빈 화면을 띄운다.
   */
  const enqueueAndWaitForRow = useCallback(
    (draft: DraftItem, photo: PreparedPhoto | null): Promise<void> => {
      const entry: Pending = { draft, photo, state: 'saving', attempts: 0 };
      itemsRef.current.set(draft.id, entry);
      setPending((prev) => [entry, ...prev]);
      return new Promise<void>((resolve, reject) => {
        processOne(draft, photo, false, resolve).catch(reject);
      });
    },
    [processOne],
  );

  const retry = useCallback(
    (id: string) => {
      const entry = itemsRef.current.get(id);
      if (!entry) return;
      const wasPhotoOnly = entry.state === 'photo_failed'; // 행은 이미 있다
      patch(id, {
        state: wasPhotoOnly ? 'uploading' : 'saving',
        error: undefined,
        attempts: entry.attempts + 1,
      });
      void processOne(entry.draft, entry.photo, wasPhotoOnly).catch(() => {});
    },
    [patch, processOne],
  );

  /** 재시도해도 안 되는 항목을 사용자가 버린다 */
  const discard = useCallback((id: string) => {
    itemsRef.current.delete(id);
    setPending((prev) => prev.filter((p) => p.draft.id !== id));
  }, []);

  const unsynced = pending.filter((p) => p.state !== 'done').length;
  const blocked = unsynced >= QUEUE_LIMIT;

  return { pending, enqueue, enqueueAndWaitForRow, retry, discard, unsynced, blocked };
}
