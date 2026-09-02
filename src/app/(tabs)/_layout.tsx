import { Tabs } from 'expo-router';


import { IconBoxes, IconCart, IconDots, IconSearch } from '@/components/Icon';
import { useHousehold } from '@/features/household/context';
import { useAuth } from '@/lib/auth';
import { useDrainStorageGc, useReportLocale, useTouchHousehold } from '@/features/storage/gc';
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
  const { activeId } = useHousehold();
  const { session } = useAuth();
  /**
   * ⚠ 이 한 줄이 없으면 **쓰고 있는 집이 90일 뒤 휴면으로 판정돼 삭제된다.**
   *   서버는 조회를 기록하지 않으므로 "누가 왔다" 를 앱이 말해 줘야 한다.
   */
  useTouchHousehold(activeId);
  useDrainStorageGc(activeId);
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

