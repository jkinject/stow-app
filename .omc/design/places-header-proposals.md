**보관 장소 탭 헤더 리디자인 시안 3개**

찾기 탭의 확정된 접두 규격을 기준으로 한다. 공간명은 `type.small`(13pt)·700, 색은 `c.textMuted`, chevron은 기존 `IconChevron` 14pt를 90도 회전한다. 공간 전환은 모두 기존 `SpaceSheet`를 연다.

아래 코드는 적용 가능한 구현 스케치이며, 소스 수정이나 파일 생성은 하지 않았다.

**공통 설계·구현 기준**

- 402pt 화면에서 좌우 `space.xl`(20pt), 실제 콘텐츠 폭은 362pt.
- 공간이 두 개 이상이고 `active`가 있을 때만 공간 버튼을 표시한다. 한 개면 버튼과 구분선을 함께 제거한다.
- 공간 버튼과 추가 버튼은 실제 레이아웃 기준 최소 44×44pt. 높이를 고정하지 않아 글자 확대 시 늘어날 수 있다.
- 기존 `ThumbRow`, `Loading`, `Empty`, `LocationSheet`와 데이터 흐름을 유지한다.
- 기존 `places.title`의 앱 이름은 세 안 모두 헤더에서 제거한다. 탭명은 이미 있는 `t.tabs.places`를 사용한다.
- 숫자 44는 터치 최소 규격, 14는 확정된 SVG 크기, 1은 선 두께다. 글자·여백·색·반경은 기존 토큰을 사용한다.

세 안의 차이는 다음과 같다.

| 시안 | 첫 행의 역할 | 목록 앞 층 수 | 추가 버튼 위치 |
|---|---|---:|---|
| 1. 범위 바 | 공간 + 탭 이름을 한 컨테이너로 표시 | 2층 | 둘째 행 |
| 2. 한 줄 제목 | 공간 + 목록 제목 + 개수를 한 줄로 표시 | 1층 | 첫 행 오른쪽 |
| 3. 공간 도구 행 | 공간 전환 + 장소 추가를 한 줄로 배치 | 2층 | 첫 행 오른쪽 |

**공통 `SpaceChip` 스케치**

세 안 모두 보관 장소용 variant 이름으로 `header`를 제안한다. 최종적으로 **`prefix | header`만 남긴다.** 차이는 `header`가 바깥 컨테이너의 여백을 사용한다는 점이다. 글자와 chevron 규격은 같다.

`SpaceSheet.tsx`의 기존 `SpaceSheet` 구현과 관련 스타일은 유지하고, `SpaceChip`을 아래처럼 정리한다. 필요한 import는 기존 파일의 import에 합친다.

```tsx
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { IconChevron } from '@/components/Icon';
import { useHousehold } from '@/features/household/context';
import { useT } from '@/lib/i18n';
import { space, type, useTheme } from '@/lib/theme';

export function SpaceChip({
  variant = 'prefix',
}: {
  variant?: 'prefix' | 'header';
}) {
  const { c } = useTheme();
  const t = useT();
  const { households, active } = useHousehold();
  const [open, setOpen] = useState(false);

  if (households.length < 2 || !active) return null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${active.name}, ${t.space.switch}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          chipStyles.base,
          variant === 'prefix' && chipStyles.prefix,
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[chipStyles.name, { color: c.textMuted }]}
        >
          {active.name}
        </Text>
        <IconChevron
          size={14}
          color={c.textFaint}
          style={chipStyles.chevron}
        />
      </Pressable>
      {open && <SpaceSheet onClose={() => setOpen(false)} />}
    </>
  );
}

const chipStyles = StyleSheet.create({
  base: {
    minHeight: 44,
    minWidth: 44,
    maxWidth: space.max * 2 + space.xs,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  prefix: {
    paddingLeft: space.md,
    paddingRight: space.sm,
  },
  name: {
    fontSize: type.small,
    fontWeight: '700',
    maxWidth: space.max + space.giant,
    flexShrink: 1,
  },
  chevron: { transform: [{ rotate: '90deg' }] },
});
```

현재 `index.tsx`에는 비교용 `SPACE_VARIANT`와 `title`·`filter` 분기가 남아 있다. 실제 적용 시에는 확정된 `prefix` 분기만 남겨야 위 타입으로 컴파일된다. 저장소의 다른 `SpaceChip` 호출도 함께 확인하고, 사용하지 않는 variant 스타일만 제거한다.

**각 시안 코드의 적용 방식**

아래 세 컴포넌트 중 **선택한 하나만** `places.tsx`에 둔다. 기존 헤더와 `SectionLabel`을 교체하되 목록 렌더링은 그대로 전달한다.

공통 import와 props:

```tsx
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen, SectionLabel, TextButton } from '@/components/ui';
import { useHousehold } from '@/features/household/context';
import { SpaceChip } from '@/features/household/SpaceSheet';
import { useT } from '@/lib/i18n';
import {
  leading, radius, space, tracking, type, useTheme,
} from '@/lib/theme';

type PlacesFrameProps = {
  count: number;
  onAdd: () => void;
  children: ReactNode;
  sheet: ReactNode;
};

const headerStyles = StyleSheet.create({
  body: {
    paddingHorizontal: space.xl,
    gap: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
  },
  fill: { flex: 1, minWidth: 0 },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: space.sm,
  },
  add: {
    minHeight: 44,
    minWidth: 44,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

既存 `PlacesTab`에서는 선택한 `PlacesFrame`에 `count={list.length}`, `onAdd={() => setAdding(true)}`를 전달한다. `children`에는 현재 `locations.isLoading ? … : …` 목록 분기 전체를, `sheet`에는 현재 `LocationSheet`를 전달한다.

---

**시안 1. 범위 바 — “이 공간의 보관 장소”를 하나의 상자에 담기**

**왜 지금보다 나은가**

앱 이름을 삭제하고, `Kim Family ˅ │ 보관 장소`를 첫 행에 넣는다. 독립 알약 칩이 사라지고 공간명이 화면의 범위로 읽힌다.

현재의 제목 → 칩 → 섹션 라벨 **3층을 범위 바 → 개수·추가 행 2층으로 줄인다.** 찾기 탭의 접두·세로 구분선·컨테이너를 가장 직접적으로 이어받는다.

공간이 하나면 바 안에는 `보관 장소`만 남는다. 공간 선택 자리나 빈 구분선은 남기지 않는다.

**레이아웃 명세**

1. `Screen.titleNode`: 테두리 있는 범위 바. 배경 `c.card`, 테두리 `c.border`, 반경 `radius.sm`, 최소 높이 44pt.
2. 바 내부: 좌우 `space.md`, 요소 간 `space.sm`. 왼쪽 `SpaceChip header`, 구분선, 오른쪽 탭 이름.
3. 탭 이름: `type.bodyStrong`·600, `leading.bodyStrong`, `tracking.snug`, `c.text`.
4. 둘째 행: 기존 `SectionLabel`의 개수와 `+ 장소`. 범위 바와 간격은 `Screen`의 하단 `space.md`.
5. 목록까지 `space.md`, 카드 간 기존 `space.sm`.

다크 모드에서는 동일한 토큰을 사용해 어두운 `c.card`와 `c.border`로 전환한다. 그림자나 별도의 칩 배경은 없다.

**ASCII 와이어프레임**

공간 2개:

```text
┌────────────────────────────────────┐
│ Kim Family ˅ │ 보관 장소           │
└────────────────────────────────────┘
보관 장소 · 4개                 + 장소

[ Bedroom                 사진 겹침 ]
[ Kitchen                 사진 겹침 ]
```

공간 1개:

```text
┌────────────────────────────────────┐
│ 보관 장소                          │
└────────────────────────────────────┘
보관 장소 · 4개                 + 장소

[ Bedroom                 사진 겹침 ]
[ Kitchen                 사진 겹침 ]
```

**구현 스케치**

`Screen`은 `titleNode`만 사용한다. `title`, `subtitle`, `action`은 생략한다.

```tsx
function PlacesFrame({
  count, onAdd, children, sheet,
}: PlacesFrameProps) {
  const { c } = useTheme();
  const t = useT();
  const { households, active } = useHousehold();
  const multiple = households.length > 1 && !!active;

  return (
    <Screen
      titleNode={
        <View
          style={[
            headerStyles.row,
            headerStyles.fill,
            {
              paddingHorizontal: space.md,
              borderWidth: 1,
              borderRadius: radius.sm,
              borderColor: c.border,
              backgroundColor: c.card,
            },
          ]}
        >
          {multiple && (
            <>
              <SpaceChip variant="header" />
              <View
                style={[
                  headerStyles.divider,
                  { backgroundColor: c.border },
                ]}
              />
            </>
          )}
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: type.bodyStrong,
              lineHeight: leading.bodyStrong,
              fontWeight: '600',
              letterSpacing: tracking.snug,
              color: c.text,
            }}
          >
            {t.tabs.places}
          </Text>
        </View>
      }
    >
      <View style={headerStyles.body}>
        <SectionLabel
          action={
            <TextButton
              label={t.places.addLocation}
              onPress={onAdd}
              size="small"
              style={headerStyles.add}
            />
          }
        >
          {t.places.section(count)}
        </SectionLabel>
        {children}
      </View>
      {sheet}
    </Screen>
  );
}
```

**위험·트레이드오프**

찾기 탭과 닮은 테두리 때문에 바 전체를 입력 가능하다고 오해할 수 있다. 또한 `보관 장소`가 두 번 등장하며, 단일 공간에서는 바가 다소 장식적으로 느껴진다.

---

**시안 2. 한 줄 제목 — 접두를 목록 제목에 바로 붙이기**

**왜 지금보다 나은가**

앱 이름을 삭제하고 `Kim Family ˅ │ 보관 장소 · 4개`를 화면 제목으로 삼는다. 테두리와 알약 배경 없이 정보 자체로 정렬한다.

**3층을 1층으로 줄여** 장소 카드가 가장 빨리 시작된다. 찾기 탭과 같은 왼쪽 접두 → 구분선 → 본문 순서를 유지하면서, 보관 장소에서는 검색창 대신 제목에 흡수한다.

공간이 하나면 `보관 장소 · 4개`와 `+ 장소`만 남는 평범한 목록 헤더가 된다.

**레이아웃 명세**

1. `Screen.titleNode`: 공간 접두·세로 구분선·목록 제목. 최소 높이 44pt, 요소 간 `space.sm`.
2. `Screen.action`: `+ 장소`, `TextButton size="small"`, 색 `c.accentText`, 최소 44×44pt.
3. 목록 제목: 접두와 같은 `type.small`·700, `leading.small`, 색은 더 강한 `c.text`.
4. 배경은 화면의 `c.bg`. 외곽 테두리와 반경 없음. 구분선만 `c.border`.
5. 헤더 아래 `space.md` 후 목록. 별도 `SectionLabel` 없음.

다크 모드에서도 구조는 같다. `c.textMuted`의 공간명과 `c.text`의 목록 제목으로 위계를 구분한다.

**ASCII 와이어프레임**

공간 2개:

```text
Kim Family ˅ │ 보관 장소 · 4개   + 장소

[ Bedroom                 사진 겹침 ]
[ Kitchen                 사진 겹침 ]
```

공간 1개:

```text
보관 장소 · 4개                 + 장소

[ Bedroom                 사진 겹침 ]
[ Kitchen                 사진 겹침 ]
```

**구현 스케치**

`Screen.titleNode`와 `Screen.action`을 사용한다. `title`, `subtitle`과 본문의 `SectionLabel`은 제거한다.

```tsx
function PlacesFrame({
  count, onAdd, children, sheet,
}: PlacesFrameProps) {
  const { c } = useTheme();
  const t = useT();
  const { households, active } = useHousehold();
  const multiple = households.length > 1 && !!active;

  return (
    <Screen
      titleNode={
        <View style={[headerStyles.row, headerStyles.fill]}>
          {multiple && (
            <>
              <SpaceChip variant="header" />
              <View
                style={[
                  headerStyles.divider,
                  { backgroundColor: c.border },
                ]}
              />
            </>
          )}
          <Text
            accessibilityRole="header"
            style={{
              flexShrink: 0,
              fontSize: type.small,
              lineHeight: leading.small,
              fontWeight: '700',
              color: c.text,
            }}
          >
            {t.places.section(count)}
          </Text>
        </View>
      }
      action={
        <TextButton
          label={t.places.addLocation}
          onPress={onAdd}
          size="small"
          style={headerStyles.add}
        />
      }
    >
      <View style={headerStyles.body}>{children}</View>
      {sheet}
    </Screen>
  );
}
```

402pt 기본 글자 크기에서는 제목과 추가 버튼의 폭을 우선 확보하고 공간명을 말줄임한다. `SpaceChip`의 `flexShrink: 1`이 이를 담당한다.

**위험·트레이드오프**

긴 공간명·큰 개수·접근성 글자 확대가 겹치면 공간명에 할당되는 폭이 작아진다. 큰 글자 모드까지 적용하려면 개수나 추가 액션을 다음 행으로 보내는 적응형 배치를 추가 검증해야 한다.

---

**시안 3. 공간 도구 행 — 범위와 추가 동작을 맨 위에 묶기**

**왜 지금보다 나은가**

앱 이름을 삭제하고 첫 행을 `Kim Family ˅`와 `+ 장소`가 공유한다. 둘째 행에는 공간의 실제 콘텐츠인 `보관 장소 · 4개`를 제목으로 둔다.

**3층을 도구 행 → 목록 제목 2층으로 줄인다.** 찾기 탭에서 접두가 검색 행동의 왼쪽에 있듯, 여기서는 장소 추가 행동의 왼쪽에 있다. 공간명은 같은 글자 규격과 chevron을 유지한다.

공간이 하나면 첫 행 왼쪽을 `보관 장소`로 치환하고 둘째 제목 행은 제거한다. 단일 공간에서는 목록 헤더 한 줄만 남는다.

**레이아웃 명세**

1. `Screen.titleNode`: 복수 공간이면 `SpaceChip header`, 단일 공간이면 `t.places.section(count)`. 최소 높이 44pt.
2. `Screen.action`: 오른쪽 `+ 장소`, 최소 44×44pt, `c.accentText`.
3. 복수 공간에서만 둘째 행 제목: `type.title`·700, `leading.title`, `tracking.tight`, `c.text`.
4. 공간 도구 행 아래 `Screen`의 `space.md`, 둘째 제목과 목록 사이 `space.md`.
5. 외곽 테두리·구분선·알약 배경 없음. 바탕 `c.bg`, 카드 간격 `space.sm`.

다크 모드에서는 공간명이 `c.textMuted`, 콘텐츠 제목이 `c.text`로 전환된다. 밝은 별도 표면 없이 여백과 글자 크기로 두 행을 구분한다.

**ASCII 와이어프레임**

공간 2개:

```text
Kim Family ˅                    + 장소

보관 장소 · 4개
[ Bedroom                 사진 겹침 ]
[ Kitchen                 사진 겹침 ]
```

공간 1개:

```text
보관 장소 · 4개                 + 장소

[ Bedroom                 사진 겹침 ]
[ Kitchen                 사진 겹침 ]
```

**구현 스케치**

`Screen.titleNode`와 `Screen.action`을 사용한다. `subtitle`은 사용하지 않는다. 현재 `subtitle`은 작은 보조 글자이므로 둘째 행의 콘텐츠 제목에 맞지 않는다.

```tsx
function PlacesFrame({
  count, onAdd, children, sheet,
}: PlacesFrameProps) {
  const { c } = useTheme();
  const t = useT();
  const { households, active } = useHousehold();
  const multiple = households.length > 1 && !!active;

  return (
    <Screen
      titleNode={
        <View style={[headerStyles.row, headerStyles.fill]}>
          {multiple ? (
            <SpaceChip variant="header" />
          ) : (
            <Text
              accessibilityRole="header"
              style={{
                flexShrink: 1,
                fontSize: type.bodyStrong,
                lineHeight: leading.bodyStrong,
                fontWeight: '700',
                letterSpacing: tracking.snug,
                color: c.text,
              }}
            >
              {t.places.section(count)}
            </Text>
          )}
        </View>
      }
      action={
        <TextButton
          label={t.places.addLocation}
          onPress={onAdd}
          size="small"
          style={headerStyles.add}
        />
      }
    >
      <View style={headerStyles.body}>
        {multiple && (
          <Text
            accessibilityRole="header"
            style={{
              fontSize: type.title,
              lineHeight: leading.title,
              fontWeight: '700',
              letterSpacing: tracking.tight,
              color: c.text,
            }}
          >
            {t.places.section(count)}
          </Text>
        )}
        {children}
      </View>
      {sheet}
    </Screen>
  );
}
```

**위험·트레이드오프**

추가 버튼이 목록 제목보다 위에 있어 현재 `SectionLabel`보다 연결이 약하다. 공간 수가 하나에서 둘로 바뀌면 제목이 아래로 이동하며 헤더가 한 층 늘어난다.

---

**추천: 시안 2 ‘한 줄 제목’**

찾기 탭의 왼쪽 접두 → 구분선 → 본문 순서를 가장 간결하게 이어간다.  
앱 이름과 독립 칩을 없애고, 공간·장소 수·추가 동작을 한 줄에서 이해하게 한다.  
단일 공간에서는 자연스러운 목록 제목만 남으며, 세 안 중 장소 카드에 가장 많은 높이를 돌려준다.