import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

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
 * "오늘은 그만 보기" 를 기억하는 자리.
 *
 * ⚠ 참·거짓이 아니라 **날짜를 적어 둔다.** 참으로 적으면 내일도 숨겨져 있어서, 지우는
 *   일을 누군가 따로 해야 한다. 날짜를 적어 두면 자정이 지나는 순간 저절로 안 맞는다.
 */
const HIDE_KEY = 'home-store.mission-hidden';

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

  /**
   * 오늘 이 카드를 닫았는가 (2026-09-02 사용자 요청 — 다 채우면 숨길 수 있어야 한다).
   *
   * ⚠ `undefined` 는 **아직 모른다**는 뜻이다. 모르는 동안 카드를 그리면, 닫아 둔
   *   사람에게 카드가 한 번 번쩍였다 사라진다.
   */
  const [hiddenOn, setHiddenOn] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(HIDE_KEY)
      .then((v) => alive && setHiddenOn(v))
      // 못 읽으면 그냥 보여 준다 — 카드 하나 때문에 화면을 막을 이유가 없다
      .catch(() => alive && setHiddenOn(null));
    return () => {
      alive = false;
    };
  }, []);

  const hide = useCallback(() => {
    setHiddenOn(key);
    void AsyncStorage.setItem(HIDE_KEY, key).catch(() => undefined);
  }, [key]);

  const done = Math.min(q.data ?? 0, MISSION_GOAL);
  return {
    done,
    goal: MISSION_GOAL,
    complete: done >= MISSION_GOAL,
    loading: q.isLoading || hiddenOn === undefined,
    hidden: hiddenOn === key,
    hide,
  };
}
