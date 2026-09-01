import { useMutation } from '@tanstack/react-query';

import { deletePhotoObjects } from '@/features/item/photo';
import { supabase } from '@/lib/supabase';

/**
 * 계정 탈퇴 (M9 — 스토어 심사 필수).
 *
 * 사용자가 정한 규칙:
 *   · 내가 관리자인데 다른 가족이 있으면 → **관리자를 넘기고** 나만 나간다
 *   · 나 혼자인 집이면 → **집과 데이터를 통째로** 지운다
 *   · 관리자가 아니면 → 그냥 나간다
 * 판정과 실행은 전부 서버(`delete_account`)가 한 트랜잭션으로 한다.
 */

export type DeletionPreview = {
  /** 통째로 사라질 집의 수 (나 혼자인 집) */
  doomedCount: number;
  /** 나만 빠지고 남는 집의 수 */
  leavingCount: number;
  /** 함께 지워야 할 사진 경로 */
  photoPaths: string[];
};

export function useDeletionPreview() {
  return useMutation({
    mutationFn: async (): Promise<DeletionPreview> => {
      const { data, error } = await supabase.rpc('account_deletion_preview');
      if (error) throw error;
      const d = data as { doomed_count: number; leaving_count: number; photo_paths: string[] };
      return {
        doomedCount: d.doomed_count ?? 0,
        leavingCount: d.leaving_count ?? 0,
        photoPaths: d.photo_paths ?? [],
      };
    },
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: async (photoPaths: string[]) => {
      /**
       * ⚠ 사진을 **먼저** 지운다. Storage 객체는 SQL 로 지울 수 없다 — `storage.objects`
       *   행을 지워도 실제 파일은 스토리지 계층에 남는다. 정식 API 로 지워야 하고,
       *   그러려면 아직 로그인 상태여야 한다.
       *
       *   실패해도 탈퇴는 계속한다. 남은 파일은 그 집이 사라진 뒤라 아무도 못 읽는다
       *   (Storage 정책이 경로의 가구 id 를 본다). 탈퇴를 못 하게 막는 것보다 낫다.
       */
      if (photoPaths.length > 0) {
        try {
          await deletePhotoObjects(photoPaths);
        } catch {
          // 무시한다 — 위 주석의 이유
        }
      }

      const { error } = await supabase.rpc('delete_account');
      if (error) throw error;

      // 서버에서 계정이 사라졌으므로 기기에 남은 세션도 버린다.
      // 실패해도 상관없다 — 다음 요청이 401 로 떨어지면 가드가 로그인 화면으로 보낸다.
      await supabase.auth.signOut().catch(() => {});
    },
  });
}
