import { Tabs } from 'expo-router';


import { IconBoxes, IconCart, IconDots, IconSearch } from '@/components/Icon';
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

