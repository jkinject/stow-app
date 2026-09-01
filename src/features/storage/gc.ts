import { useEffect } from 'react';

import { deletePhotoObjects } from '@/features/item/photo';
import { supabase } from '@/lib/supabase';

/**
 * 하드 삭제된 물건·박스의 사진 파일을 실제로 지운다.
 *
 * ⚠⚠ 왜 앱이 하는가. 휴지통 30일이 지나면 서버 cron 이 행을 지우는데, **SQL 은
 *   Storage API 를 부를 수 없다.** `storage.objects` 행을 지워도 실제 파일은 남는다.
 *   그래서 cron 은 경로를 `storage_gc` 큐에 남기기만 하고, 지우는 일은 Storage API 를
 *   부를 수 있는 쪽 — 로그인한 앱 — 이 맡는다.
 *
 * ⚠ 순서가 핵심이다. **파일을 먼저 지우고, 성공한 뒤에 큐 행을 지운다.** 반대로 하면
 *   실패했을 때 경로를 잃어 파일이 영영 남는다 — 이 큐를 만든 이유가 바로 그것이다.
 *
 * ⚠ 조용히 실패한다. 사용자가 요청한 일이 아니라 뒤에서 치우는 일이라, 안 되면
 *   다음 실행에 다시 하면 된다. 오류창을 띄우면 영문 모를 방해가 된다.
 */

/** 한 번에 지울 파일 수. 앱을 켤 때 도는 일이라 화면을 붙잡지 않을 만큼만 */
const BATCH = 100;

export async function drainStorageGc(householdId: string): Promise<number> {
  const { data, error } = await supabase
    .from('storage_gc')
    .select('path')
    .eq('household_id', householdId)
    .order('queued_at')
    .limit(BATCH);
  if (error || !data || data.length === 0) return 0;

  const paths = data.map((r) => r.path);
  await deletePhotoObjects(paths);

  /**
   * ⚠ 여기까지 왔으면 파일은 지워졌거나 **애초에 없었다.** 둘 다 큐에서 빼는 게 맞다.
   *   없는 파일을 큐에 남겨 두면 그 행이 영원히 배치의 앞자리를 차지해 뒤에 쌓인
   *   진짜 파일이 하나도 안 지워진다 — 큐가 통째로 멈춘다.
   */
  await supabase.from('storage_gc').delete().in('path', paths);
  return paths.length;
}

/**
 * 이 집을 방금 썼다고 기록한다.
 *
 * ⚠⚠ 이게 없으면 **쓰고 있는 집이 휴면으로 판정돼 삭제된다.** 90일 동안 아무도
 *   안 들어온 집을 지우는 기능(20260902000200)이 보는 값이 `last_seen_at` 하나뿐이다.
 *   서버는 "누가 읽어 갔는지" 를 모르므로 앱이 말해 줘야 한다.
 *
 * 서버가 하루에 한 번만 실제로 쓴다 — 앱을 열 때마다 UPDATE 하면 같은 행을 하루에도
 * 수십 번 갱신한다. 실패해도 조용히 넘긴다(다음에 열 때 다시 한다).
 */
export function useTouchHousehold(householdId: string | null) {
  useEffect(() => {
    if (!householdId) return;
    void supabase.rpc('touch_household', { p_household: householdId }).then(() => {});
  }, [householdId]);
}

/**
 * 앱을 켤 때 한 번 큐를 비운다.
 *
 * ⚠ 화면마다 부르지 않는다. 탭 레이아웃 한 곳에서만 부른다 — 여러 곳에서 부르면
 *   같은 배치를 동시에 지우려 들고, 요청만 늘고 얻는 것이 없다.
 */
export function useDrainStorageGc(householdId: string | null) {
  useEffect(() => {
    if (!householdId) return;
    let alive = true;
    void (async () => {
      try {
        // 한 번에 다 비우지 않는다. 밀린 게 많아도 앱을 켤 때마다 조금씩 줄어든다.
        const n = await drainStorageGc(householdId);
        if (!alive || n === 0) return;
      } catch {
        // 조용히 넘긴다 — 위 주석의 이유
      }
    })();
    return () => {
      alive = false;
    };
  }, [householdId]);
}
