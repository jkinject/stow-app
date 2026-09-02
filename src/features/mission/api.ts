import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

/**
 * 오늘의 미션 — 하루에 물건 다섯 개 등록하기.
 *
 * 왜 서버에서 세나: 기기에 세면 폰을 바꾸거나 앱을 지웠다 깔면 진행이 사라진다.
 * 등록 사실은 이미 DB 에 있으므로, 그것을 그대로 세는 편이 정확하고 저장할 것도 없다.
 *
 * ⚠ 세는 기준은 **나**다(`created_by`). 집 전체로 세면 가족이 넣은 것까지 내 미션이
 *   차서 "내가 오늘 뭘 했다" 는 느낌이 사라진다. 미션은 개인의 동기 부여다.
 *
 * ⚠ 지운 물건도 센다. 등록은 이미 일어난 일이고, 정리하다 하나 지웠다고 오늘의 미션이
 *   되돌아가면 "치우면 손해" 라는 이상한 신호를 준다.
 */

export const MISSION_GOAL = 5;

/**
 * 오늘 자정을 **기기 시간대로** 구한다.
 *
 * ⚠ UTC 자정을 쓰면 안 된다. 한국은 UTC+9 라, 아침 8시에 등록한 물건이 "어제" 로
 *   잡혀 미션이 안 차거나, 자정 직후 등록이 "오늘" 로 잡히지 않는다.
 */
function todayStart(): { iso: string; key: string } {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  return { iso: d.toISOString(), key };
}

export function useTodayMission(householdId: string | null, userId: string | null) {
  const { iso, key } = todayStart();
  const q = useQuery({
    /**
     * ⚠ 날짜를 키에 넣는다. 앱을 켜 둔 채 자정을 넘기면 어제 진행이 그대로 남는데,
     *   키가 바뀌면 자동으로 새 질의가 되어 0 부터 다시 센다.
     */
    queryKey: ['mission', householdId, userId, key],
    enabled: !!householdId && !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('household_id', householdId!)
        .eq('created_by', userId!)
        .gte('created_at', iso);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const done = Math.min(q.data ?? 0, MISSION_GOAL);
  return { done, goal: MISSION_GOAL, complete: done >= MISSION_GOAL, loading: q.isLoading };
}
