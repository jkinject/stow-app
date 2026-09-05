import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';

import { deletePhotoObjects, uploadPhoto, type PreparedPhoto } from './photo';

/**
 * 등록한 물건에 사진을 **끝까지** 붙이는 큐 (2026-09-06 사용자 보고로 만들었다).
 *
 * ══ 무슨 일이 있었나 ═══════════════════════════════════════════
 * "분명 사진을 찍고 장소를 선택해서 물건이 등록됐는데 사진이 사라진 케이스가 발생."
 *
 * 등록 흐름은 이랬다:
 *   ① 행을 INSERT 하고 **그때 바로** 물건 상세로 넘어간다 (P1 — 사진 업로드를
 *      기다리게 하면 등록이 느려진다)
 *   ② 사진 업로드는 등록 화면의 `useRegisterQueue` 안에서 계속 돈다
 *
 * ②가 실패하면 상태를 `photo_failed` 로 적었는데 — **그 상태를 그리는 화면이
 * 어디에도 없었다.** 게다가 상태를 들고 있던 등록 화면은 ①에서 이미 언마운트됐다.
 * 그래서 실패가 아무 흔적 없이 사라졌다. 사진은 사라지고, 앱은 아무 말도 안 했고,
 * 다시 시도할 방법도 없었다. **사용자가 찍은 사진을 잃는 것**이라 가장 나쁜 종류의
 * 조용한 실패다.
 *
 * ══ 그래서 이렇게 고친다 ═══════════════════════════════════════
 *   · 사진 붙이기를 **화면 밖(모듈)** 으로 뺀다 — 화면이 사라져도 일이 남는다
 *   · **AsyncStorage 에 적어 둔다** — 앱을 껐다 켜도 이어서 올린다
 *   · 임시 파일을 **document 디렉터리로 옮긴다** — cache 는 OS 가 언제든 비운다
 *   · 물건 상세가 "올리는 중 / 실패 · 다시 시도" 를 **보여준다**
 *
 * ⚠ 이건 `queue.ts` 가 경계한 "오프라인 쓰기 큐"(Non-Goal C2)가 아니다. 그 경계는
 *   **행이 없는** 등록을 쌓아 두지 말라는 것이고, 여기는 행이 이미 서버에 있다.
 *   `queue.ts` 주석도 그 둘을 구분해 두었다 — "사진은 이미 서버에 행이 있지만".
 */

const KEY = 'stow.pending-photos.v1';
const DIR = 'pending-photos';

type Job = {
  itemId: string;
  householdId: string;
  thumbUri: string;
  fullUri: string;
  /** 마지막 실패 사유. 있으면 "실패", 없으면 "올리는 중" 이다 */
  error?: string;
};

const jobs = new Map<string, Job>();
/** 지금 올라가고 있는 것 — 같은 물건을 두 번 올리지 않는다 */
const running = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

async function persist() {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify([...jobs.values()]));
  } catch {
    /* 적어 두지 못해도 이번 실행 중에는 메모리의 큐가 돈다 — 던져서 업로드를 막지 않는다 */
  }
}

/**
 * 임시 파일을 **지워지지 않는 자리**로 옮긴다.
 *
 * ⚠ `preparePhoto` 가 만든 파일은 cache 에 있다. cache 는 "저장 공간이 부족하면
 *   시스템이 지워도 되는 곳" 이라, 업로드가 밀리는 동안(비행기 모드·지하철) 사라질 수
 *   있다. 그러면 다시 시도할 것 자체가 없어진다.
 *
 * ⚠ 옮기다 실패해도 던지지 않는다. 원래 uri 로 그냥 진행하는 편이 낫다 —
 *   "덜 안전한 자리에 있는 사진" 이 "사진 없음" 보다 낫다.
 */
async function makeDurable(itemId: string, photo: PreparedPhoto): Promise<PreparedPhoto> {
  try {
    const dir = new Directory(Paths.document, DIR);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });

    const move = async (uri: string, name: string) => {
      const src = new File(uri);
      if (!src.exists) return uri;
      const dst = new File(dir, name);
      if (dst.exists) dst.delete();
      await src.move(dst);
      return dst.uri;
    };

    return {
      thumbUri: await move(photo.thumbUri, `${itemId}-thumb.jpg`),
      fullUri: await move(photo.fullUri, `${itemId}-full.jpg`),
    };
  } catch {
    return photo;
  }
}

/** 다 쓴 임시 파일을 치운다. 실패해도 무해하다 — 다음 정리 때 걸린다 */
function cleanup(job: Job) {
  for (const uri of [job.thumbUri, job.fullUri]) {
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch {
      /* 지우지 못한 파일이 남을 뿐이다 */
    }
  }
}

/** 사진이 보이는 모든 목록을 다시 그리게 한다 */
function invalidate(itemId: string) {
  void queryClient.invalidateQueries({ queryKey: ['item', itemId] });
  void queryClient.invalidateQueries({ queryKey: ['items'] });
  void queryClient.invalidateQueries({ queryKey: ['search'] });
  void queryClient.invalidateQueries({ queryKey: ['item-photo'] });
}

async function run(itemId: string) {
  const job = jobs.get(itemId);
  if (!job || running.has(itemId)) return;
  running.add(itemId);
  // 실패 표시를 지우고 "올리는 중" 으로 되돌린다
  if (job.error !== undefined) {
    jobs.set(itemId, { ...job, error: undefined });
    emit();
  }

  try {
    const { thumbPath, photoPath } = await uploadPhoto(job.householdId, job.itemId, {
      thumbUri: job.thumbUri,
      fullUri: job.fullUri,
    });

    /**
     * ⚠ `.select()` 로 **영향 행 수**를 본다. RLS 거부도, 그 사이 물건이 지워진 것도
     *   오류가 아니라 0행으로 온다(README 의 함정). 0행인데 성공으로 치면 파일만
     *   덩그러니 남고 화면엔 영원히 사진이 안 뜬다.
     */
    const { data, error } = await supabase
      .from('items')
      .update({ thumb_path: thumbPath, photo_path: photoPath })
      .eq('id', job.itemId)
      .select('id');
    if (error) throw error;

    if ((data ?? []).length === 0) {
      // 붙일 물건이 없어졌다(지웠거나 권한이 없다). 방금 올린 파일은 주인이 없으므로 치운다.
      await deletePhotoObjects([thumbPath, photoPath]).catch(() => {});
      jobs.delete(itemId);
      cleanup(job);
      await persist();
      emit();
      return;
    }

    jobs.delete(itemId);
    cleanup(job);
    await persist();
    invalidate(itemId);
    emit();
  } catch (e) {
    const cur = jobs.get(itemId);
    if (cur) {
      jobs.set(itemId, { ...cur, error: e instanceof Error ? e.message : '사진 업로드 실패' });
      await persist();
      emit();
    }
  } finally {
    running.delete(itemId);
  }
}

/**
 * 등록 직후 사진을 맡긴다. **행이 이미 서버에 있어야 한다.**
 *
 * 업로드가 끝나기를 기다리지 않는다(P1). 다만 **적어 두는 것까지는** 기다린다 —
 * 여기서 넘어가면 화면이 곧바로 바뀌므로, 그 전에 남겨야 사라지지 않는다.
 */
export async function attachPhotoLater(
  householdId: string,
  itemId: string,
  photo: PreparedPhoto,
): Promise<void> {
  const durable = await makeDurable(itemId, photo);
  jobs.set(itemId, { itemId, householdId, thumbUri: durable.thumbUri, fullUri: durable.fullUri });
  await persist();
  emit();
  void run(itemId);
}

/**
 * 앱이 켜질 때 못 끝낸 것을 이어서 올린다.
 *
 * ⚠ 파일이 없어진 항목은 **버린다.** 올릴 것이 없는데 "올리는 중" 을 계속 보여주면
 *   사용자는 기다리기만 한다 — 차라리 사진이 없다고 보여주고 다시 찍게 하는 게 낫다.
 */
export async function resumePendingPhotos(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Job[];
      let dropped = false;
      for (const job of saved) {
        if (!job?.itemId || jobs.has(job.itemId)) continue;
        const alive = (() => {
          try {
            return new File(job.thumbUri).exists && new File(job.fullUri).exists;
          } catch {
            return false;
          }
        })();
        if (!alive) {
          dropped = true;
          continue;
        }
        jobs.set(job.itemId, { ...job, error: undefined });
      }
      if (dropped) await persist();
      emit();
    }
  } catch {
    /* 읽지 못하면 이번 실행에는 이어서 올릴 것이 없다 */
  }
  for (const id of [...jobs.keys()]) void run(id);
}

/** 실패한 것을 다시 시도한다 (물건 상세의 "다시 시도") */
export function retryPendingPhoto(itemId: string) {
  void run(itemId);
}

/** 사용자가 새 사진을 직접 붙였다 — 기다리던 옛 사진은 버린다 */
export function dropPendingPhoto(itemId: string) {
  const job = jobs.get(itemId);
  if (!job) return;
  jobs.delete(itemId);
  cleanup(job);
  void persist();
  emit();
}

export type PhotoJobStatus = { state: 'uploading' | 'failed'; error?: string };

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * 이 물건의 사진이 아직 올라가는 중인가.
 *
 * ⚠ 스냅샷은 **같은 값이면 같은 객체**여야 한다(useSyncExternalStore 규칙). 그래서
 *   Map 에 든 job 객체를 그대로 돌려주고, 바뀔 때만 새 객체로 갈아 끼운다.
 */
export function usePendingPhoto(itemId: string | null): PhotoJobStatus | null {
  const job = useSyncExternalStore(
    subscribe,
    () => (itemId ? (jobs.get(itemId) ?? null) : null),
    () => null,
  );
  if (!job) return null;
  return job.error === undefined ? { state: 'uploading' } : { state: 'failed', error: job.error };
}
