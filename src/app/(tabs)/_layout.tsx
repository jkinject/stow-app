import { useQueryClient } from '@tanstack/react-query';
import { Tabs } from 'expo-router';
import { useEffect, useMemo } from 'react';


import { IconBoxes, IconCart, IconDots, IconSearch } from '@/components/Icon';
import { useHousehold } from '@/features/household/context';
import { useAuth } from '@/lib/auth';
import { useExpiryReminderSync } from '@/features/item/reminders';
import { useDrainStorageGc, useReportLocale, useTouchHouseholds } from '@/features/storage/gc';
import { useT } from '@/lib/i18n';
import { useTheme, type } from '@/lib/theme';

/**
 * 하단 탭.
 *
 * 첫 화면을 **찾기**로 둔다. 이 앱을 여는 이유는 대개 "그거 어디 뒀지" 이지
 * "장소를 관리하자" 가 아니다. 정리(장소·박스 만들기)는 가끔 하는 일이므로 두 번째다.
 *
 * 아이콘은 react-native-svg 로 직접 그린다(components/Icon). 문자·이모지는 기기마다
 * 모양이 달라지고 색을 따라오지 않는다.
 */
export default function TabsLayout() {
  const { c } = useTheme();
  const t = useT();
  /**
   * 하드 삭제된 물건의 사진 파일을 치운다.
   *
   * ⚠ **여기 한 곳에서만** 부른다. 화면마다 부르면 같은 배치를 동시에 지우려 들어
   *   요청만 늘고 얻는 것이 없다. 탭 레이아웃은 로그인·가구 확정 뒤 한 번 마운트되고
   *   앱이 살아 있는 동안 유지되므로, "앱을 켤 때 한 번" 에 가장 가까운 자리다.
   */
  const { activeId, households } = useHousehold();
  const { session } = useAuth();
  const qc = useQueryClient();
  /**
   * ⚠⚠ **전 공간이어야 하는 것** (2026-09-09). 한 사람이 여러 공간에 속하고 앱은 활성 공간
   *   하나만 보여 주지만, 아래 넷은 **활성 공간과 무관하게** 옳아야 한다. 새 훅을 여기 붙일 때
   *   "이것도 전 공간이어야 하나" 를 반드시 대조한다 — 빠뜨리면 조용히 어긋난다:
   *     · 휴면 터치 (useTouchHouseholds) — 안 하면 비활성 공간이 90일 뒤 삭제된다
   *     · 사진 수거 큐 (useDrainStorageGc) — 안 하면 비활성 공간의 고아 파일이 쌓인다
   *     · 소비기한 알림 (useExpiryReminderSync) — 안 하면 사무실 물건의 기한은 알림이 안 온다
   *     · 상세 진입 시 공간 맞추기 (useEnsureActive, 상세 화면 안) — 안 하면 남의 공간 물건을 보며 내 공간에 옮긴다
   *   `ids` 는 useMemo 로 안정시킨다 — 렌더마다 새 배열이면 effect 가 매번 돌아 RPC 가 반복된다.
   */
  const ids = useMemo(() => households.map((h) => h.id), [households]);
  /**
   * ⚠ 이 한 줄이 없으면 **쓰고 있는 집이 90일 뒤 휴면으로 판정돼 삭제된다.**
   *   서버는 조회를 기록하지 않으므로 "누가 왔다" 를 앱이 말해 줘야 한다.
   */
  useTouchHouseholds(ids);
  useDrainStorageGc(ids);
  // 소비기한 알림을 목록·설정에 맞춰 다시 건다 (2026-09-08) — 모든 공간의 물건 (2026-09-09)
  useExpiryReminderSync(households);
  /**
   * 공간을 바꾸면 가구 키가 없는 캐시를 비운다 (2026-09-09).
   * 목록 캐시는 전부 키에 가구 id 가 있어 섞이지 않는다. 등록 목적지(`['add-context', target]`)만
   * id 가 전역 고유라 가구 키가 없는데, 옛 공간의 장소로 등록 화면이 열릴 수 있어 지운다.
   */
  useEffect(() => {
    qc.removeQueries({ queryKey: ['add-context'] });
  }, [activeId, qc]);
  /**
   * ⚠ 이게 없으면 **외국인에게 한국어 메일이 나간다.** 삭제 예고 메일은 90일 넘게
   *   앱을 안 열었을 때 나가므로 그때는 기기 정보가 없다 — 미리 적어 둬야 한다.
   */
  useReportLocale(session?.user?.id ?? null);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textFaint,
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.border },
        tabBarLabelStyle: { fontSize: type.tiny, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabs.find,
          tabBarIcon: ({ color }) => <IconSearch color={color} />,
        }}
      />
      <Tabs.Screen
        name="places"
        options={{
          title: t.tabs.places,
          tabBarIcon: ({ color }) => <IconBoxes color={color} />,
        }}
      />
      <Tabs.Screen
        name="shopping"
        options={{
          title: t.tabs.shopping,
          tabBarIcon: ({ color }) => <IconCart color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t.tabs.more,
          tabBarIcon: ({ color }) => <IconDots color={color} />,
        }}
      />
    </Tabs>
  );
}

