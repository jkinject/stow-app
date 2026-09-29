import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { photoPaths, supabase } from '@/lib/supabase';

import { itemKeys, type ItemDetail } from './api';

import {
  deletePhotoObjects,
  preparePhoto,
  uploadEntityPhoto,
  type PreparedPhoto,
  type Rotation,
} from './photo';
import { attachPhotosLater } from './photoQueue';

/**
 * 사진 붙이기 · 바꾸기 · 지우기 (사용자 요청 2026-08-30).
 *
 * ══ 두 종류가 있다 (2026-09-08) ═══════════════════════════════════
 *   · **박스** — 한 장. `photo_path` / `thumb_path` 컬럼을 직접 갈아끼운다.
 *   · **물건** — 여러 장. `item_photos` 행을 넣고 빼고 순서를 바꾼다. items 의 두 컬럼은
 *     **손대지 않는다** — 서버 트리거(t61)가 첫 장을 대표로 복사한다.
 *
 *   ⚠ 물건에 사진을 **덧붙이는** 것은 여기가 아니라 `photoQueue.attachPhotosLater` 다.
 *     등록 때와 같은 끈질긴 큐를 거쳐야 "사진이 사라지는" 버그를 다시 얻지 않는다.
 *     여기의 `useAddItemPhotos` 는 그 큐에 맡기는 얇은 껍데기다.
 *
 * 등록할 때 사진을 안 찍고 나중에 붙일 수 있어야 한다 — AC3 가 "필수 입력은 이름 하나" 라
 * 사진 없는 물건이 정상적으로 생긴다. 그런데 나중에 붙일 방법이 없으면
 * 사진을 남기려는 사람은 **등록 시점에 반드시 찍어야 해서** 등록이 느려진다.
 */

export type PhotoOwner = 'items' | 'containers';

/** 이 사진이 보이는 모든 목록을 다시 그리게 한다 */
function invalidatePhotoViews(qc: ReturnType<typeof useQueryClient>, owner: PhotoOwner, id: string) {
  if (owner === 'items') {
    void qc.invalidateQueries({ queryKey: ['item', id] });
    void qc.invalidateQueries({ queryKey: ['items'] });
  } else {
    void qc.invalidateQueries({ queryKey: ['container', id] });
    void qc.invalidateQueries({ queryKey: ['container-by-token'] });
    void qc.invalidateQueries({ queryKey: ['containers'] });
    void qc.invalidateQueries({ queryKey: ['all-containers'] });
  }
  void qc.invalidateQueries({ queryKey: ['search'] });
  // 서명 URL 캐시도 비운다 — 경로가 바뀌었으므로 옛 URL 은 더 이상 유효하지 않다
  void qc.invalidateQueries({ queryKey: ['item-photo'] });
}

/* ───────────────────────────── 박스 — 한 장 ───────────────────────────── */

async function currentPaths(owner: PhotoOwner, id: string) {
  const { data } = await supabase.from(owner).select('photo_path, thumb_path').eq('id', id).maybeSingle();
  return { photo_path: data?.photo_path ?? null, thumb_path: data?.thumb_path ?? null };
}

/**
 * 사진을 새로 붙이거나 기존 것을 갈아끼운다.
 *
 * ⚠ 물건에는 쓰지 않는다. items 의 두 컬럼은 트리거가 채우는 자리라, 여기서 덮어쓰면
 *   다음 사진 변경 때 트리거가 도로 되돌린다 — "바꿨는데 안 바뀐다" 가 된다.
 */
export function useSetPhoto(owner: 'containers', id: string, householdId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photo: PreparedPhoto) => {
      if (!householdId) throw new Error('가구를 찾을 수 없습니다.');
      const old = await currentPaths(owner, id);

      // 교체할 때마다 새 버전 uuid 를 쓴다 (경로가 달라져야 캐시가 안 걸린다)
      const version = Crypto.randomUUID();
      const { thumbPath, photoPath } = await uploadEntityPhoto(householdId, id, version, photo);

      const { error } = await supabase
        .from(owner)
        .update({ photo_path: photoPath, thumb_path: thumbPath })
        .eq('id', id);
      if (error) {
        /**
         * ⚠ 파일은 이미 올라갔는데 행이 그것을 가리키지 못했다. 그냥 던지면 **아무도
         *   못 찾는 파일 두 개가 스토리지에 영원히 남는다** — 지울 실마리가 어디에도
         *   없다(경로를 아는 건 방금 실패한 이 호출뿐이다). 여기서 치운다.
         *
         *   정리에 실패하면 무시한다. 원래 오류를 이 오류로 덮으면 사용자는 진짜
         *   원인을 못 본다.
         */
        await deletePhotoObjects([photoPath, thumbPath]).catch(() => {});
        throw error;
      }

      // 행이 새 경로를 가리킨 뒤에 옛 파일을 정리한다
      await deletePhotoObjects([old.photo_path, old.thumb_path]);
    },
    onSuccess: () => invalidatePhotoViews(qc, owner, id),
  });
}

/** 사진을 뗀다. 박스 자체는 남는다 */
export function useRemovePhoto(owner: 'containers', id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const old = await currentPaths(owner, id);
      const { error } = await supabase
        .from(owner)
        .update({ photo_path: null, thumb_path: null })
        .eq('id', id);
      if (error) throw error;
      await deletePhotoObjects([old.photo_path, old.thumb_path]);
    },
    onSuccess: () => invalidatePhotoViews(qc, owner, id),
  });
}

/* ──────────────────────────── 물건 — 여러 장 ──────────────────────────── */

export type ItemPhotoRef = { id: string; photo_path: string; thumb_path: string };

/**
 * 물건에 사진을 덧붙인다 — 끈질긴 큐에 맡긴다. 업로드가 끝나기를 기다리지 않는다.
 * 큐가 끝나면 스스로 목록을 무효화하므로 여기서는 하지 않는다.
 *
 * @param nextOrder 마지막 장의 sort_order + 1. 부르는 쪽이 지금 목록에서 계산한다.
 */
export function useAddItemPhotos(itemId: string, householdId: string | null) {
  return useMutation({
    mutationFn: async ({ photos, nextOrder }: { photos: PreparedPhoto[]; nextOrder: number }) => {
      if (!householdId) throw new Error('가구를 찾을 수 없습니다.');
      await attachPhotosLater(householdId, itemId, photos, nextOrder);
    },
  });
}

/**
 * 사진 한 장을 뗀다.
 *
 * ⚠ `.select()` 로 **영향 행 수**를 본다. RLS 거부는 오류가 아니라 0행이다(README 의 함정).
 *   0행인데 파일을 지우면 행은 남고 파일만 없어져 목록에 깨진 칸이 남는다.
 */
export function useRemoveItemPhoto(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photo: ItemPhotoRef) => {
      const { data, error } = await supabase.from('item_photos').delete().eq('id', photo.id).select('id');
      if (error) throw error;
      if ((data ?? []).length === 0) throw new Error('사진을 찾을 수 없습니다.');
      // 행이 사라진 뒤에 파일을 치운다 — 반대면 실패 시 깨진 칸이 남는다
      await deletePhotoObjects([photo.photo_path, photo.thumb_path]);
    },
    onSuccess: () => invalidatePhotoViews(qc, 'items', itemId),
  });
}

/**
 * 순서 바꾸기·대표 지정 (2026-09-09 사용자 요청) — 새 순서의 사진 id 를 **전부** 보낸다.
 *
 * 서버 RPC 가 한 트랜잭션에 0부터 다시 적는다(카테고리처럼 행마다 보내면 중간에 끊겼을 때
 * 반쯤 적힌다). 첫 장이 대표이고 items 의 복사본은 t61 이 맞춘다.
 *
 * ⚠ **낙관적으로** 먼저 그린다. "앞으로" 를 누를 때마다 왕복을 기다리면 연타가 안 된다.
 *   실패하면 상세를 다시 읽어 서버 순서로 돌아간다.
 */
export function useReorderItemPhotos(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (idsInOrder: string[]) => {
      const { error } = await supabase.rpc('reorder_item_photos', {
        p_item_id: itemId,
        p_photo_ids: idsInOrder,
      });
      if (error) throw error;
    },
    onMutate: async (idsInOrder) => {
      await qc.cancelQueries({ queryKey: itemKeys.detail(itemId) });
      qc.setQueryData<ItemDetail | null>(itemKeys.detail(itemId), (prev) => {
        if (!prev) return prev;
        const byId = new Map(prev.photos.map((p) => [p.id, p]));
        const photos = idsInOrder
          .map((id, i) => {
            const p = byId.get(id);
            return p ? { ...p, sort_order: i } : null;
          })
          .filter((p): p is NonNullable<typeof p> => !!p);
        return { ...prev, photos };
      });
    },
    onError: () => void qc.invalidateQueries({ queryKey: itemKeys.detail(itemId) }),
    onSuccess: () => invalidatePhotoViews(qc, 'items', itemId),
  });
}

/**
 * 이 사진을 **대표**로 — 맨 앞으로 보낸다.
 *
 * sort_order 를 (지금 가장 작은 값 − 1) 로 둔다. 전체를 다시 번호 매기지 않는다 —
 * 행 하나만 바뀌니 트리거도 한 번만 돌고, 동시에 다른 사람이 만진 것과 부딪히지 않는다.
 * 값이 계속 음수로 내려가도 int 범위에서는 문제가 되지 않는다.
 */
export function useSetItemCover(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ photoId, minOrder }: { photoId: string; minOrder: number }) => {
      const { data, error } = await supabase
        .from('item_photos')
        .update({ sort_order: minOrder - 1 })
        .eq('id', photoId)
        .select('id');
      if (error) throw error;
      if ((data ?? []).length === 0) throw new Error('사진을 찾을 수 없습니다.');
    },
    onSuccess: () => invalidatePhotoViews(qc, 'items', itemId),
  });
}

/**
 * 이미 등록된 사진을 **돌린다** (2026-09-22 사용자 요청).
 *
 * 등록할 때는 저장 전이라 각도만 들고 있다가 한 번에 구우면 됐다. 이미 올라간 사진은
 * 그럴 수 없어서 왕복이 길다 — 내려받고 · 돌려 굽고 · 다시 올리고 · 행을 고친다.
 *
 * ⚠⚠ **새 경로로 올린다.** 같은 경로에 덮어쓰면 파일은 바뀌는데 화면은 안 바뀐다 —
 *   expo-image 의 디스크 캐시 키가 **경로**이기 때문이다(photo.ts 의 uploadEntityPhoto
 *   주석, 박스 사진이 같은 이유로 매번 새 uuid 를 쓴다). 사진을 돌렸는데 그대로면
 *   "안 되네" 하고 여러 번 누르게 되고, 그때마다 왕복이 한 번씩 더 난다.
 *
 * ⚠ 그래서 파일 이름이 더 이상 행 id 와 같지 않다. 괜찮다 — 스토리지 청소(storage_gc)와
 *   고아 점검(orphan_report)은 **행에 적힌 경로 값**으로 대조하지 파일명을 파싱하지 않는다.
 *   (그 규칙이 깨지면 살아 있는 사진이 고아로 잡힌다. 확인하고 들어왔다.)
 *
 * ⚠ 대표 사진을 돌려도 `items.photo_path` 는 **손대지 않는다.** 서버 트리거 t61 이
 *   insert·update·delete 모두에 걸려 있어 첫 장을 다시 복사해 준다. 여기서 같이 쓰면
 *   트리거와 싸운다.
 *
 * ⚠ 옛 파일 치우기가 실패해도 데이터는 멀쩡하다. 그리고 이번에는 조용히 새지 않는다 —
 *   마이그레이션 20260922000100 의 t64 가 경로가 바뀌는 그 트랜잭션에서 옛 경로를
 *   수거 큐에 넣는다. 여기서 지우는 건 빠른 길일 뿐이다.
 *
 * ⚠ 돌릴 때마다 JPEG 를 다시 굽는다. 원본 카메라 파일은 이미 없고 우리가 가진 것은
 *   1280 짜리 표시용 사진뿐이라 피할 수 없다. 한 번 돌릴 때 한 세대씩 깎이므로,
 *   네 번 눌러 제자리로 돌리는 것은 **공짜가 아니다.**
 */
export function useRotateItemPhoto(itemId: string, householdId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ photo, deg }: { photo: ItemPhotoRef; deg: Rotation }) => {
      if (!householdId) throw new Error('가구를 찾을 수 없습니다.');
      if (deg === 0) return;

      const { data: signed, error: signErr } = await supabase.storage
        .from(photoPaths.bucket)
        .createSignedUrl(photo.photo_path, 600);
      if (signErr) throw signErr;
      if (!signed?.signedUrl) throw new Error('사진을 찾을 수 없습니다.');

      // 캐시에 받는다 — 성공하든 실패하든 아래에서 지운다
      const dir = new Directory(Paths.cache, 'rotate');
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      const local = await File.downloadFileAsync(signed.signedUrl, dir);

      try {
        const prepared = await preparePhoto(local.uri, deg);
        const version = Crypto.randomUUID();
        const { thumbPath, photoPath } = await uploadEntityPhoto(
          householdId,
          itemId,
          version,
          prepared,
        );

        const { data, error } = await supabase
          .from('item_photos')
          .update({ photo_path: photoPath, thumb_path: thumbPath })
          .eq('id', photo.id)
          .select('id');
        /**
         * ⚠ 행이 새 파일을 가리키지 못했으면 방금 올린 두 장을 **여기서** 치운다.
         *   경로를 아는 것은 지금 이 호출뿐이라, 그냥 던지면 아무도 못 찾는 파일이 남는다
         *   (useSetPhoto 와 같은 이유). RLS 거부는 오류가 아니라 0행이다.
         */
        if (error || (data ?? []).length === 0) {
          await deletePhotoObjects([photoPath, thumbPath]).catch(() => {});
          throw error ?? new Error('사진을 찾을 수 없습니다.');
        }

        // 행이 새 경로를 가리킨 뒤에 옛 파일을 치운다 — 반대면 실패 시 깨진 칸이 남는다
        await deletePhotoObjects([photo.photo_path, photo.thumb_path]);
      } finally {
        try {
          if (local.exists) local.delete();
        } catch {
          // 캐시에 남는 것뿐이라 해가 없다. 시스템이 알아서 비운다.
        }
      }
    },
    onSuccess: () => invalidatePhotoViews(qc, 'items', itemId),
  });
}
