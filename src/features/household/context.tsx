import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { useMyHouseholds, type Household } from './api';

/**
 * 활성 가구.
 * 한 사람이 여러 가구에 속할 수 있으므로(C10) 어느 가구를 보고 있는지가 앱 전역 상태다.
 * 선택은 기기에 남겨 재실행 시 같은 가구로 돌아온다.
 */
const KEY = 'homestore.activeHouseholdId';

type Ctx = {
  households: Household[];
  active: Household | null;
  activeId: string | null;
  setActiveId: (id: string) => void;
  loading: boolean;
};

const HouseholdContext = createContext<Ctx | null>(null);

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const q = useMyHouseholds();
  const [stored, setStored] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then(setStored)
      .catch(() => setStored(null))
      .finally(() => setRestored(true));
  }, []);

  const list = useMemo(() => q.data ?? [], [q.data]);

  const value = useMemo<Ctx>(() => {
    // 저장된 가구가 아직 유효한지 확인한다 — 추방됐을 수 있다 (AC26)
    const valid = stored && list.some((h) => h.id === stored) ? stored : (list[0]?.id ?? null);
    return {
      households: list,
      activeId: valid,
      active: list.find((h) => h.id === valid) ?? null,
      setActiveId: (id: string) => {
        setStored(id);
        AsyncStorage.setItem(KEY, id).catch(() => {});
      },
      loading: q.isLoading || !restored,
    };
  }, [list, stored, q.isLoading, restored]);

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error('useHousehold 는 HouseholdProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}
