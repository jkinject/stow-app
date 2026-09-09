import { useEffect } from 'react';

import { deletePhotoObjects } from '@/features/item/photo';
import { useI18n } from '@/lib/i18n';
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
/**
 * ⚠ **내가 속한 모든 공간**을 터치한다 (2026-09-09). 활성 공간만 터치하면, 집을 활성으로 두고
 *   쓰는 동안 사무실은 아무도 안 온 것으로 보여 90일 뒤 삭제 예고가 간다. 앱을 켰다는 건
 *   그 사람의 모든 공간이 살아 있다는 뜻이다.
 *   병렬로 부른다 — 서버가 하루 한 번만 실제로 쓰므로 비용은 왕복뿐이다.
 *
 * ⚠ `ids` 는 부르는 쪽이 `useMemo` 로 안정시킨 배열이어야 한다. 렌더마다 새 배열을 넘기면
 *   이 effect 가 매 렌더 돌아 RPC 가 반복된다.
 */
export function useTouchHouseholds(ids: readonly string[]) {
  useEffect(() => {
    if (ids.length === 0) return;
    void Promise.all(ids.map((id) => supabase.rpc('touch_household', { p_household: id }))).catch(() => {});
  }, [ids]);
}

/**
 * 지금 쓰고 있는 화면 언어를 서버에 알린다.
 *
 * ⚠⚠ 이게 없으면 **외국인에게 한국어 메일이 나간다.** 휴면 삭제 예고 메일은 그 사람이
 *   앱을 90일 넘게 안 열었을 때 나가므로, 그때는 요청도 기기 정보도 없다. 서버가
 *   언어를 알 방법은 미리 적어 두는 것뿐이다.
 *
 * 값이 바뀔 때만 쓴다 — 앱을 열 때마다 UPDATE 할 이유가 없다. 실패는 조용히 넘긴다.
 */
export function useReportLocale(userId: string | null) {
  const { lang } = useI18n();
  useEffect(() => {
    if (!userId) return;
    void (async () => {
      const { data } = await supabase.from('profiles').select('locale').eq('id', userId).maybeSingle();
      if (data?.locale === lang) return;
      await supabase.from('profiles').update({ locale: lang }).eq('id', userId);
    })().catch(() => {});
  }, [userId, lang]);
}

/**
 * 앱을 켤 때 한 번 큐를 비운다.
 *
 * ⚠ 화면마다 부르지 않는다. 탭 레이아웃 한 곳에서만 부른다 — 여러 곳에서 부르면
 *   같은 배치를 동시에 지우려 들고, 요청만 늘고 얻는 것이 없다.
 */
/**
 * ⚠ **모든 공간**의 큐를 비운다 (2026-09-09). 활성 공간만 비우면 비활성 공간의 고아 파일이
 *   그 공간을 다시 열 때까지 쌓인다 — 파일은 비용이다.
 *   공간마다 **순서대로** 돈다. 배치 100건 삭제를 공간 수만큼 동시에 던지지 않는다.
 * ⚠ `ids` 는 `useMemo` 로 안정시킨 배열이어야 한다 (useTouchHouseholds 와 같은 이유).
 */
export function useDrainStorageGc(ids: readonly string[]) {
  useEffect(() => {
    if (ids.length === 0) return;
    let alive = true;
    void (async () => {
      for (const id of ids) {
        if (!alive) return;
        try {
          // 한 번에 다 비우지 않는다. 밀린 게 많아도 앱을 켤 때마다 조금씩 줄어든다.
          await drainStorageGc(id);
        } catch {
          // 조용히 넘긴다 — 위 주석의 이유. 다음 공간은 계속한다
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [ids]);
}
