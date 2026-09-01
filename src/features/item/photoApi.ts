import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';

import { deletePhotoObjects, uploadEntityPhoto, type PreparedPhoto } from './photo';

/**
 * 사진 붙이기 · 바꾸기 · 지우기 (사용자 요청 2026-08-30).
 *
 * 물건과 박스가 **같은 구현**을 쓴다. 둘 다 `photo_path` / `thumb_path` 컬럼을 갖고,
 * Storage 정책도 경로의 첫 조각(가구 id)만 보므로 테이블만 다를 뿐 동작이 같다.
 * 두 벌로 만들면 한쪽만 고쳐진다.
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

async function currentPaths(owner: PhotoOwner, id: string) {
  const { data } = await supabase.from(owner).select('photo_path, thumb_path').eq('id', id).maybeSingle();
  return { photo_path: data?.photo_path ?? null, thumb_path: data?.thumb_path ?? null };
}

/** 사진을 새로 붙이거나 기존 것을 갈아끼운다 */
export function useSetPhoto(owner: PhotoOwner, id: string, householdId: string | null) {
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
      if (error) throw error;

      // 행이 새 경로를 가리킨 뒤에 옛 파일을 정리한다
      await deletePhotoObjects([old.photo_path, old.thumb_path]);
    },
    onSuccess: () => invalidatePhotoViews(qc, owner, id),
  });
}

/** 사진을 뗀다. 물건·박스 자체는 남는다 */
export function useRemovePhoto(owner: PhotoOwner, id: string) {
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

