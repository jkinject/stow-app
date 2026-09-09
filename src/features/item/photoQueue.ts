import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { useMemo, useSyncExternalStore } from 'react';

import { queryClient } from '@/lib/query';
import { photoPaths, supabase } from '@/lib/supabase';

import { deletePhotoObjects, uploadEntityPhoto, type PreparedPhoto } from './photo';

/**
 * 물건에 사진을 **끝까지** 붙이는 큐 (2026-09-06 사용자 보고로 만들었다).
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
 * ══ 사진 여러 장 (2026-09-08) ═══════════════════════════════════
 *   일감의 단위가 **물건**에서 **사진 한 장**으로 바뀌었다. 물건 하나에 사진이 여러 장
 *   들어가므로, 물건 id 로 큐를 잡으면 두 번째 장이 첫 장을 밀어낸다.
 *   각 사진은 제 uuid(`photoId`)를 갖고, 그 값이 파일명이자 `item_photos` 행의 id 다.
 *   같은 물건의 사진은 **순서대로 하나씩** 올린다 — 첫 장(대표)이 먼저 목록에 떠야 한다.
 *
 *   ⚠ 상세 화면에서 나중에 붙이는 사진도 이 큐를 거친다. 등록과 상세가 다른 길을 쓰면
 *     한쪽만 "사진이 사라지는" 버그를 다시 얻는다.
 *
 * ⚠ 이건 `queue.ts` 가 경계한 "오프라인 쓰기 큐"(Non-Goal C2)가 아니다. 그 경계는
 *   **행이 없는** 등록을 쌓아 두지 말라는 것이고, 여기는 물건 행이 이미 서버에 있다.
 */

const KEY = 'stow.pending-photos.v2';
/** 한 장짜리 시절의 키. 업그레이드 직후 한 번 읽어 옮기고 지운다 — 기다리던 사진을 잃지 않기 위해 */
const KEY_V1 = 'stow.pending-photos.v1';
const DIR = 'pending-photos';

type Job = {
  /** 파일명이자 item_photos 행의 id */
  photoId: string;
  itemId: string;
  householdId: string;
  thumbUri: string;
  fullUri: string;
  sortOrder: number;
  /** 마지막 실패 사유. 있으면 "실패", 없으면 "올리는 중" 이다 */
  error?: string;
};

/**
 * ⚠ 스냅샷은 **갈아끼운다**(제자리에서 고치지 않는다). useSyncExternalStore 는 참조가
 *   같으면 "안 바뀌었다" 로 본다 — thumbs.ts 에서 이미 한 번 겪은 함정이다.
 */
let jobs: ReadonlyMap<string, Job> = new Map();
/** 지금 올라가고 있는 것 — 같은 사진을 두 번 올리지 않는다 */
const running = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function setJobs(next: Map<string, Job>) {
  jobs = next;
  emit();
}

function patch(photoId: string, next: Job | null) {
  const m = new Map(jobs);
  if (next) m.set(photoId, next);
  else m.delete(photoId);
  setJobs(m);
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
async function makeDurable(photoId: string, photo: PreparedPhoto): Promise<PreparedPhoto> {
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
      thumbUri: await move(photo.thumbUri, `${photoId}-thumb.jpg`),
      fullUri: await move(photo.fullUri, `${photoId}-full.jpg`),
    };
  } catch {
    return photo;
  }
}

/**
 * 큐에서 **버리는** 일감이 올려 뒀을지 모르는 파일을 치운다.
 *
 * ⚠ 업로드는 썸네일 → 원본 순이라, 썸네일만 올라가고 원본에서 실패한 채 사용자가
 *   "이 사진 취소" 를 누르면(또는 앱을 껐다 켰는데 임시 파일이 사라져 버려지면)
 *   **썸네일이 스토리지에 고아로 남는다.** 행이 없으니 수거 큐에도 안 들어간다 —
 *   경로를 아는 건 여기뿐이다. 없는 파일을 지우는 건 무해하므로 늘 둘 다 지운다.
 */
function discardUploaded(job: Job) {
  void deletePhotoObjects([
    photoPaths.thumb(job.householdId, job.itemId, job.photoId),
    photoPaths.full(job.householdId, job.itemId, job.photoId),
  ]).catch(() => {});
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

/**
 * 사진이 보이는 모든 목록을 다시 그리게 한다.
 *
 * ⚠ **기다린다.** 상세 화면은 "올라간 사진(서버)" 과 "올리는 중(큐)" 을 한 줄에 그리는데,
 *   큐에서 먼저 빼고 재조회가 뒤에 끝나면 그 사이 그 장이 **잠깐 사라졌다 다시 나타난다.**
 *   재조회가 끝난 뒤에 빼면 화면에는 늘 그 장이 있다.
 */
async function invalidate(itemId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['item', itemId] }),
    queryClient.invalidateQueries({ queryKey: ['items'] }),
    queryClient.invalidateQueries({ queryKey: ['search'] }),
    queryClient.invalidateQueries({ queryKey: ['item-photo'] }),
  ]).catch(() => {});
}

/**
 * 다시 해도 안 될 실패 — 큐에 남겨 두면 "실패" 가 영원히 떠 있고 다시 시도해도 또 실패한다.
 *   23503 물건이 없다(하드 삭제됐다)  · 42501 권한이 없다(가구에서 나갔다)
 *   23514 10장 상한
 */
const PERMANENT = new Set(['23503', '42501', '23514']);

async function run(photoId: string) {
  const job = jobs.get(photoId);
  if (!job || running.has(photoId)) return;
  running.add(photoId);
  // 실패 표시를 지우고 "올리는 중" 으로 되돌린다
  if (job.error !== undefined) patch(photoId, { ...job, error: undefined });

  try {
    const { thumbPath, photoPath } = await uploadEntityPhoto(job.householdId, job.itemId, job.photoId, {
      thumbUri: job.thumbUri,
      fullUri: job.fullUri,
    });

    /**
     * ⚠ 행 삽입. 같은 id 로 **다시** 넣는 경우(앞 시도에서 행은 들어갔는데 응답을 못 받은
     *   경우)는 23505 중복이 오는데, 그건 성공이다 — 파일도 행도 이미 있다.
     *   `household_id` 는 서버(t60)가 물건의 것으로 덮어쓰므로 여기 값은 형식일 뿐이다.
     */
    const { error } = await supabase.from('item_photos').insert({
      id: job.photoId,
      household_id: job.householdId,
      item_id: job.itemId,
      photo_path: photoPath,
      thumb_path: thumbPath,
      sort_order: job.sortOrder,
    });
    if (error && error.code !== '23505') {
      if (PERMANENT.has(error.code)) {
        /**
         * 붙일 물건이 없거나 붙일 수 없다. 방금 올린 파일은 주인이 없으므로 치운다.
         *
         * ⚠ 지우기 **전에 서버에 먼저 신고한다.** 그 사이 가구에서 빠졌으면(42501) 삭제가
         *   정책에 막힐 수 있고, 지금 이 지점의 네트워크가 끊길 수도 있다. 신고가 들어가면
         *   경로를 서버(수거 큐)가 알게 되어 누군가의 앱이 나중에라도 지운다.
         *   서버는 어느 행도 가리키지 않는 경로만 받으므로 살아 있는 파일은 다치지 않는다.
         */
        await supabase.rpc('report_orphan_photos', { p_paths: [thumbPath, photoPath] }).then(() => {}, () => {});
        await deletePhotoObjects([thumbPath, photoPath]).catch(() => {});
        patch(photoId, null);
        cleanup(job);
        await persist();
        return;
      }
      throw error;
    }

    await invalidate(job.itemId);
    patch(photoId, null);
    cleanup(job);
    await persist();
  } catch (e) {
    const cur = jobs.get(photoId);
    if (cur) {
      patch(photoId, { ...cur, error: e instanceof Error ? e.message : '사진 업로드 실패' });
      await persist();
    }
  } finally {
    running.delete(photoId);
  }
}

/** 같은 물건의 사진을 **순서대로** 올린다 — 첫 장이 대표라 먼저 떠야 한다 */
async function runInOrder(photoIds: string[]) {
  for (const id of photoIds) await run(id);
}

/**
 * 물건에 사진들을 맡긴다. **물건 행이 이미 서버에 있어야 한다.**
 *
 * 업로드가 끝나기를 기다리지 않는다(P1). 다만 **적어 두는 것까지는** 기다린다 —
 * 등록 화면은 여기서 넘어가면 곧바로 사라지므로, 그 전에 남겨야 잃지 않는다.
 *
 * @param firstOrder 첫 장의 sort_order. 등록이면 0, 상세에서 덧붙이면 (마지막 장 + 1)
 */
export async function attachPhotosLater(
  householdId: string,
  itemId: string,
  photos: PreparedPhoto[],
  firstOrder = 0,
): Promise<void> {
  if (photos.length === 0) return;
  const next = new Map(jobs);
  const ids: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const photoId = Crypto.randomUUID();
    const durable = await makeDurable(photoId, photos[i]);
    next.set(photoId, {
      photoId,
      itemId,
      householdId,
      thumbUri: durable.thumbUri,
      fullUri: durable.fullUri,
      sortOrder: firstOrder + i,
    });
    ids.push(photoId);
  }
  setJobs(next);
  await persist();
  void runInOrder(ids);
}

/** 한 장짜리 시절(v1)의 항목. 옮길 때만 쓴다 */
type JobV1 = { itemId: string; householdId: string; thumbUri: string; fullUri: string; error?: string };

async function readSaved(): Promise<Job[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw) return JSON.parse(raw) as Job[];

  // 업그레이드 직후 — 옛 큐에 기다리던 사진이 있으면 버리지 않고 옮긴다
  const old = await AsyncStorage.getItem(KEY_V1);
  if (!old) return [];
  /**
   * ⚠ photoId 는 **물건 id 를 그대로** 쓴다. v1 은 파일명이 물건 id 였다 — 반쯤 올라간
   *   파일(썸네일만)이 있다면 같은 이름으로 덮어써야 고아가 안 남는다. 물건 id 도 uuid 라
   *   행 id 로 쓰기에 문제없다.
   */
  const moved = (JSON.parse(old) as JobV1[])
    .filter((j) => j?.itemId && j.thumbUri && j.fullUri)
    .map((j) => ({ ...j, photoId: j.itemId, sortOrder: 0 }));
  await AsyncStorage.setItem(KEY, JSON.stringify(moved));
  await AsyncStorage.removeItem(KEY_V1).catch(() => {});
  return moved;
}

/**
 * 앱이 켜질 때 못 끝낸 것을 이어서 올린다.
 *
 * ⚠ 파일이 없어진 항목은 **버린다.** 올릴 것이 없는데 "올리는 중" 을 계속 보여주면
 *   사용자는 기다리기만 한다 — 차라리 사진이 없다고 보여주고 다시 찍게 하는 게 낫다.
 */
export async function resumePendingPhotos(): Promise<void> {
  try {
    const saved = await readSaved();
    const next = new Map(jobs);
    let dropped = false;
    for (const job of saved) {
      if (!job?.photoId || next.has(job.photoId)) continue;
      const alive = (() => {
        try {
          return new File(job.thumbUri).exists && new File(job.fullUri).exists;
        } catch {
          return false;
        }
      })();
      if (!alive) {
        dropped = true;
        discardUploaded(job); // 올릴 것은 없어졌어도 올라간 것은 있을 수 있다
        continue;
      }
      next.set(job.photoId, { ...job, error: undefined });
    }
    setJobs(next);
    if (dropped) await persist();
  } catch {
    /* 읽지 못하면 이번 실행에는 이어서 올릴 것이 없다 */
  }
  // 물건별로 묶어 각 물건 안에서는 순서대로, 물건끼리는 나란히
  const byItem = new Map<string, Job[]>();
  for (const j of jobs.values()) {
    const a = byItem.get(j.itemId) ?? [];
    a.push(j);
    byItem.set(j.itemId, a);
  }
  for (const list of byItem.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
    void runInOrder(list.map((j) => j.photoId));
  }
}

/** 실패한 것을 다시 시도한다 (물건 상세의 "다시 시도") */
export function retryPendingPhoto(photoId: string) {
  void run(photoId);
}

/** 사용자가 기다리던 사진을 포기했다 — 파일까지 치운다 */
export function dropPendingPhoto(photoId: string) {
  const job = jobs.get(photoId);
  if (!job) return;
  patch(photoId, null);
  cleanup(job);
  discardUploaded(job);
  void persist();
}

export type PendingPhoto = {
  photoId: string;
  /** 화면에 보여 줄 로컬 썸네일 */
  thumbUri: string;
  sortOrder: number;
  state: 'uploading' | 'failed';
  error?: string;
};

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const EMPTY: PendingPhoto[] = [];

/**
 * 이 물건에서 아직 올라가는 중이거나 실패한 사진들. 순서대로.
 *
 * ⚠ 스냅샷은 모듈의 Map 을 그대로 돌려주고(같은 값이면 같은 객체 — useSyncExternalStore
 *   규칙), 물건별로 거르는 건 useMemo 로 한다. 거르는 결과를 getSnapshot 에서 만들면
 *   매번 새 배열이라 무한 렌더가 난다.
 */
export function usePendingPhotos(itemId: string | null): PendingPhoto[] {
  const snap = useSyncExternalStore(subscribe, () => jobs, () => jobs);
  return useMemo(() => {
    if (!itemId) return EMPTY;
    const list: PendingPhoto[] = [];
    for (const j of snap.values()) {
      if (j.itemId !== itemId) continue;
      list.push({
        photoId: j.photoId,
        thumbUri: j.thumbUri,
        sortOrder: j.sortOrder,
        state: j.error === undefined ? 'uploading' : 'failed',
        error: j.error,
      });
    }
    list.sort((a, b) => a.sortOrder - b.sortOrder);
    return list.length ? list : EMPTY;
  }, [snap, itemId]);
}
