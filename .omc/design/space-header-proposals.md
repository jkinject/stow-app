# 찾기 탭 활성 공간 표시 리디자인 시안

전제: 공간 전환 바텀시트는 `SpaceSheet` 한 벌만 유지한다. 화면마다 별도 전환 UI를 만들지 않고, `SpaceChip`에 `variant` 정도의 표현 옵션만 추가한다. 공간이 하나뿐이면 찾기 탭에서는 렌더하지 않는다.

## 시안 1. 제목 자체가 공간

한 줄 콘셉트: 찾기 탭의 최상단 제목을 활성 공간 이름으로 쓰고, 검색은 바로 그 아래 첫 행동으로 둔다.

### 왜 지금 것보다 나은지

층 수: 현재는 `공간 칩 -> 검색줄 -> 장소 필터 -> 체크리스트/목록`이라 층이 하나 늘어난다. 이 시안은 `공간 제목 -> 검색줄 -> 장소 필터`로 공간을 화면 제목 역할에 흡수한다.

시선 흐름: 사용자는 화면에 들어오자마자 “Kim Family에서 찾는 중”을 읽고, 바로 아래 검색창/QR 버튼으로 내려간다. 떠 있는 작은 칩보다 정보 위계가 명확하다.

공간 하나일 때: 별도 UI 없이 바로 검색줄부터 시작한다. 기본 사용자의 화면 밀도는 지금보다 좋아진다.

보관 장소 탭 일관성: `places.tsx`도 `Screen` 제목 아래 같은 `SpaceChip variant="title"`을 둔다. “이 탭이 어느 공간의 데이터인가”를 제목 바로 아래에서 같은 언어로 보여 준다.

### 레이아웃 명세

위에서 아래:

1. 공간 2개 이상: `SpaceChip variant="title"` 행
2. 검색 `Field` + QR 스캔 버튼
3. 장소 필터 가로 `ScrollView`
4. 오프라인 배너 또는 체크리스트/격자

크기와 간격:

- 루트 상단은 현재처럼 `insets.top`.
- 공간 제목 행은 `paddingHorizontal: PADDING`, `paddingTop: space.sm`, `paddingBottom: space.xs`.
- `SpaceChip title`은 최소 높이 44pt, 좌측 정렬, `maxWidth: 260`.
- 검색줄 `st.head`는 `paddingTop: space.xs`, `paddingBottom: GUTTER`.
- 검색창과 QR 버튼은 지금과 동일하게 화면 상단 근처에 고정.

색:

- 공간 제목 텍스트: `c.text`
- 보조 카운트: `c.textFaint`
- 눌림 배경 없음, 필요 시 `pressed && { opacity: 0.65 }`
- chevron: `c.textFaint`

다크 모드:

- 별도 배경을 깔지 않으므로 `c.bg` 위에 `c.text`/`c.textFaint`만 바뀐다.
- 카드처럼 뜨는 면이 추가되지 않아 다크에서도 검색창과 필터가 주 레이어로 남는다.

### ASCII 와이어프레임

공간 2개:

```text
┌──────────────────────────────────────────┐
│ Kim Family                    2개 공간 ˅ │
│ ┌──────────────────────────────┐ ┌─────┐ │
│ │ 물건 이름 (초성도 됩니다...) │ │ QR  │ │
│ └──────────────────────────────┘ └─────┘ │
│ [전체] [거실] [부엌] [창고]              │
│ ┌──────────────────────────────────────┐ │
│ │ 시작 체크리스트 / 오늘의 미션        │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────┐ ┌──────────────┐       │
│ │ 물건 카드    │ │ 물건 카드    │       │
└──────────────────────────────────────────┘
```

공간 1개:

```text
┌──────────────────────────────────────────┐
│ ┌──────────────────────────────┐ ┌─────┐ │
│ │ 물건 이름 (초성도 됩니다...) │ │ QR  │ │
│ └──────────────────────────────┘ └─────┘ │
│ [전체] [거실] [부엌] [창고]              │
│ ┌──────────────────────────────────────┐ │
│ │ 시작 체크리스트 / 오늘의 미션        │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────┐ ┌──────────────┐       │
│ │ 물건 카드    │ │ 물건 카드    │       │
└──────────────────────────────────────────┘
```

### 구현 스케치

`SpaceSheet.tsx`

```tsx
export function SpaceChip({ variant = 'pill' }: { variant?: 'pill' | 'title' }) {
  const { c } = useTheme();
  const t = useT();
  const { households, active } = useHousehold();
  const [open, setOpen] = useState(false);
  if (households.length < 2 || !active) return null;

  const title = variant === 'title';
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${active.name} ${t.space.switch}`}
        style={({ pressed }) => [
          title ? st.titleChip : st.chip,
          !title && { borderColor: c.border, backgroundColor: c.card },
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={title ? st.titleTextWrap : undefined}>
          <Text
            style={[title ? st.titleName : st.chipText, { color: c.text }]}
            numberOfLines={1}
          >
            {active.name}
          </Text>
          {title && (
            <Text style={[st.titleMeta, { color: c.textFaint }]} numberOfLines={1}>
              {t.space.count(households.length)}
            </Text>
          )}
        </View>
        <IconChevron
          color={c.textFaint}
          size={title ? 18 : 14}
          style={st.chevron}
        />
      </Pressable>
      {open && <SpaceSheet onClose={() => setOpen(false)} />}
    </>
  );
}

const st = StyleSheet.create({
  // 기존 tile/chip/chipText/chevron 유지
  titleChip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    maxWidth: 300,
  },
  titleTextWrap: { maxWidth: 260 },
  titleName: { fontSize: type.h2, fontWeight: '700' },
  titleMeta: { fontSize: type.caption, fontWeight: '600' },
});
```

`index.tsx`

```tsx
{households.length > 1 && (
  <View style={st.spaceTitleRow}>
    <SpaceChip variant="title" />
  </View>
)}

<View style={[st.head, households.length > 1 && st.headAfterSpaceTitle]}>
  <Field
    value={q}
    onChangeText={onQuery}
    placeholder={t.find.searchPlaceholder}
    autoCorrect={false}
    returnKeyType="search"
    clearable
    wrapStyle={st.flex}
    style={st.input}
  />
  <Pressable
    onPress={() => router.push('/scan')}
    style={({ pressed }) => [
      st.scanBtn,
      { borderColor: c.border, backgroundColor: c.card },
      pressed && { opacity: 0.7 },
    ]}
  >
    <IconQr color={c.accent} size={24} />
  </Pressable>
</View>
```

```tsx
const st = StyleSheet.create({
  // 기존 스타일 유지
  spaceTitleRow: {
    paddingHorizontal: PADDING,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  headAfterSpaceTitle: { paddingTop: space.xs },
});
```

`places.tsx`

```tsx
<View style={st.body}>
  <SpaceChip variant="title" />
  <SectionLabel action={...}>{t.places.section(list.length)}</SectionLabel>
  ...
</View>
```

### 위험/트레이드오프

공간 이름이 길면 제목처럼 강하게 보이므로 앱 타이틀보다 공간명이 우선한다. “찾기”라는 탭 이름은 하단 탭으로만 읽히기 때문에, 화면 안 제목이 꼭 필요하다고 보면 어색할 수 있다.

## 시안 2. 검색창에 접두

한 줄 콘셉트: 활성 공간을 검색창 왼쪽 접두 영역으로 넣어 “이 공간에서 검색”을 한 줄로 만든다.

### 왜 지금 것보다 나은지

층 수: 현재의 독립 공간 행을 없애고 검색줄 내부 정보로 합친다. 최상단 행동은 한 줄이다.

시선 흐름: 사용자가 가장 먼저 보는 검색창 안에서 범위와 검색어 입력을 함께 이해한다. “공간 선택 후 검색”이 아니라 “Kim Family 안에서 검색”으로 읽힌다.

공간 하나일 때: 접두 영역을 숨기고 기존 검색창 그대로 보인다. 단일 공간 사용자는 아무 변화가 없다.

보관 장소 탭 일관성: 보관 장소 탭에는 검색창이 없으므로 같은 `SpaceChip variant="inline"`을 `SectionLabel` 액션 자리나 섹션 위 작은 접두 버튼으로 쓴다. 칩 모양은 같되 찾기 탭에서는 검색 필드 내부에 들어간다.

### 레이아웃 명세

위에서 아래:

1. 검색 컨테이너: 내부 왼쪽 `SpaceChip variant="prefix"`, 오른쪽 텍스트 입력
2. QR 스캔 버튼
3. 장소 필터 가로 `ScrollView`
4. 오프라인 배너 또는 체크리스트/격자

크기와 간격:

- `st.head`가 최상단 첫 행이다. `paddingTop: space.sm`.
- 검색 컨테이너 높이는 `Field`와 같은 높이로 유지.
- 접두 버튼은 최소 높이 44pt, `paddingLeft: space.md`, `paddingRight: space.sm`.
- 접두와 입력 사이에 1px 세로 구분선: `backgroundColor: c.border`.
- QR 버튼은 기존 `st.scanBtn` 유지.

색:

- 검색 컨테이너: `c.card`, 테두리 `c.border`
- 접두 텍스트: `c.textMuted`
- 활성 공간 이름은 `fontWeight: '700'`
- chevron: `c.textFaint`

다크 모드:

- 컨테이너는 `c.card`, 내부 구분선은 `c.border`.
- 별도의 흰 칩이 생기지 않아 다크에서도 검색창 한 덩어리로 읽힌다.

### ASCII 와이어프레임

공간 2개:

```text
┌──────────────────────────────────────────┐
│ ┌──────────────────────────────┐ ┌─────┐ │
│ │ Kim Family ˅ │ 물건 이름...  │ │ QR  │ │
│ └──────────────────────────────┘ └─────┘ │
│ [전체] [거실] [부엌] [창고]              │
│ ┌──────────────────────────────────────┐ │
│ │ 시작 체크리스트 / 오늘의 미션        │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────┐ ┌──────────────┐       │
│ │ 물건 카드    │ │ 물건 카드    │       │
└──────────────────────────────────────────┘
```

공간 1개:

```text
┌──────────────────────────────────────────┐
│ ┌──────────────────────────────┐ ┌─────┐ │
│ │ 물건 이름 (초성도 됩니다...) │ │ QR  │ │
│ └──────────────────────────────┘ └─────┘ │
│ [전체] [거실] [부엌] [창고]              │
│ ┌──────────────────────────────────────┐ │
│ │ 시작 체크리스트 / 오늘의 미션        │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────┐ ┌──────────────┐       │
│ │ 물건 카드    │ │ 물건 카드    │       │
└──────────────────────────────────────────┘
```

### 구현 스케치

`SpaceSheet.tsx`

```tsx
export function SpaceChip({ variant = 'pill' }: { variant?: 'pill' | 'prefix' | 'inline' }) {
  const { c } = useTheme();
  const t = useT();
  const { households, active } = useHousehold();
  const [open, setOpen] = useState(false);
  if (households.length < 2 || !active) return null;

  const prefix = variant === 'prefix';
  const inline = variant === 'inline';

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${active.name} ${t.space.switch}`}
        style={({ pressed }) => [
          prefix ? st.prefixChip : inline ? st.inlineChip : st.chip,
          !prefix && { borderColor: c.border, backgroundColor: c.card },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text
          style={[prefix ? st.prefixText : st.chipText, { color: prefix ? c.textMuted : c.text }]}
          numberOfLines={1}
        >
          {active.name}
        </Text>
        <IconChevron color={c.textFaint} size={14} style={st.chevron} />
      </Pressable>
      {open && <SpaceSheet onClose={() => setOpen(false)} />}
    </>
  );
}

const st = StyleSheet.create({
  // 기존 tile/chip/chipText/chevron 유지
  prefixChip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingLeft: space.md,
    paddingRight: space.sm,
    maxWidth: 132,
  },
  prefixText: { fontSize: type.small, fontWeight: '700', maxWidth: 104 },
  inlineChip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingLeft: space.md,
    paddingRight: space.sm,
  },
});
```

`index.tsx`

```tsx
<View style={st.head}>
  <View style={[st.searchBox, { borderColor: c.border, backgroundColor: c.card }]}>
    {households.length > 1 && (
      <>
        <SpaceChip variant="prefix" />
        <View style={[st.searchDivider, { backgroundColor: c.border }]} />
      </>
    )}
    <Field
      value={q}
      onChangeText={onQuery}
      placeholder={t.find.searchPlaceholder}
      autoCorrect={false}
      returnKeyType="search"
      clearable
      wrapStyle={st.searchInputWrap}
      style={[st.input, st.searchInput, { backgroundColor: c.card }]}
    />
  </View>
  <Pressable
    onPress={() => router.push('/scan')}
    style={({ pressed }) => [
      st.scanBtn,
      { borderColor: c.border, backgroundColor: c.card },
      pressed && { opacity: 0.7 },
    ]}
  >
    <IconQr color={c.accent} size={24} />
  </Pressable>
</View>
```

```tsx
const st = StyleSheet.create({
  // 기존 스타일 유지
  searchBox: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  searchDivider: { width: 1, alignSelf: 'stretch', marginVertical: space.sm },
  searchInputWrap: { flex: 1 },
  searchInput: { borderWidth: 0 },
});
```

`places.tsx`

```tsx
<SectionLabel
  action={<SpaceChip variant="inline" />}
>
  {t.places.section(list.length)}
</SectionLabel>
```

### 위험/트레이드오프

`Field`가 자체 카드/테두리를 갖는 구조라 `wrapStyle`로 테두리를 완전히 걷어낼 수 있는지 실제 스타일 확인이 필요하다. 공간 이름이 길면 검색 입력 폭을 먹으므로 402pt에서 `maxWidth`를 보수적으로 제한해야 한다.

## 시안 3. 장소 필터의 첫 칩

한 줄 콘셉트: 활성 공간을 장소 필터와 같은 칩 언어로 묶되, 검색줄 아래 필터 행의 첫 번째 범위 칩으로 둔다.

### 왜 지금 것보다 나은지

층 수: 현재의 독립 공간 행을 제거한다. `검색줄 -> 범위/장소 필터 -> 목록`으로 정리되어 검색 시작점이 다시 최상단이 된다.

시선 흐름: 먼저 검색/스캔을 보고, 바로 아래에서 “어느 공간/어느 장소 범위인가”를 한 줄로 조정한다. 공간 전환은 장소 필터와 성격이 가까운 범위 선택으로 읽힌다.

공간 하나일 때: 공간 칩은 숨기고 기존 장소 필터만 남는다. 장소도 하나뿐이면 검색줄 아래가 바로 목록이다.

보관 장소 탭 일관성: `places.tsx`에서는 섹션 라벨 위 또는 라벨 액션에 같은 `SpaceChip variant="filter"`를 둔다. 찾기 탭처럼 필터성 컨트롤로 보이며, 더보기의 프로필 카드와는 별개로 유지된다.

### 레이아웃 명세

위에서 아래:

1. 검색 `Field` + QR 스캔 버튼
2. 필터 가로 `ScrollView`
   - 첫 칩: 공간 2개 이상일 때 `SpaceChip variant="filter"`
   - 다음 칩: `전체`, 장소 목록
3. 오프라인 배너 또는 체크리스트/격자

크기와 간격:

- 검색줄은 현재 `st.head` 그대로 사용한다.
- 필터 행은 기존 `st.filterRow`와 같은 `paddingHorizontal: PADDING`, `gap: space.sm`.
- 공간 필터 칩은 장소 칩보다 살짝 더 강하게: `borderColor: c.accent`, `backgroundColor: c.card`.
- 모든 칩은 `minHeight: 44`로 터치 기준을 맞춘다.

색:

- 공간 칩: `c.card`, 테두리 `c.accent`, 텍스트 `c.accentText`
- 장소 선택 칩: 기존처럼 on이면 `c.accent`/`c.onAccent`, off면 `c.card`/`c.textMuted`
- chevron: `c.accentText`

다크 모드:

- 공간 칩은 `c.card` 위 `c.accentText`로 대비를 확보한다.
- 선택된 장소 칩은 `c.accent`가 채워져 현재 필터 상태가 유지된다.

### ASCII 와이어프레임

공간 2개:

```text
┌──────────────────────────────────────────┐
│ ┌──────────────────────────────┐ ┌─────┐ │
│ │ 물건 이름 (초성도 됩니다...) │ │ QR  │ │
│ └──────────────────────────────┘ └─────┘ │
│ [Kim Family ˅] [전체] [거실] [부엌]      │
│ ┌──────────────────────────────────────┐ │
│ │ 시작 체크리스트 / 오늘의 미션        │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────┐ ┌──────────────┐       │
│ │ 물건 카드    │ │ 물건 카드    │       │
└──────────────────────────────────────────┘
```

공간 1개:

```text
┌──────────────────────────────────────────┐
│ ┌──────────────────────────────┐ ┌─────┐ │
│ │ 물건 이름 (초성도 됩니다...) │ │ QR  │ │
│ └──────────────────────────────┘ └─────┘ │
│ [전체] [거실] [부엌] [창고]              │
│ ┌──────────────────────────────────────┐ │
│ │ 시작 체크리스트 / 오늘의 미션        │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────┐ ┌──────────────┐       │
│ │ 물건 카드    │ │ 물건 카드    │       │
└──────────────────────────────────────────┘
```

### 구현 스케치

`SpaceSheet.tsx`

```tsx
export function SpaceChip({ variant = 'pill' }: { variant?: 'pill' | 'filter' }) {
  const { c } = useTheme();
  const t = useT();
  const { households, active } = useHousehold();
  const [open, setOpen] = useState(false);
  if (households.length < 2 || !active) return null;

  const filter = variant === 'filter';

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${active.name} ${t.space.switch}`}
        style={({ pressed }) => [
          filter ? st.filterSpaceChip : st.chip,
          {
            borderColor: filter ? c.accent : c.border,
            backgroundColor: c.card,
          },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text
          style={[filter ? st.filterSpaceText : st.chipText, { color: filter ? c.accentText : c.text }]}
          numberOfLines={1}
        >
          {active.name}
        </Text>
        <IconChevron
          color={filter ? c.accentText : c.textFaint}
          size={14}
          style={st.chevron}
        />
      </Pressable>
      {open && <SpaceSheet onClose={() => setOpen(false)} />}
    </>
  );
}

const st = StyleSheet.create({
  // 기존 tile/chip/chipText/chevron 유지
  filterSpaceChip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingLeft: space.lg,
    paddingRight: space.md,
  },
  filterSpaceText: { fontSize: type.small, fontWeight: '700', maxWidth: 132 },
});
```

`index.tsx`

```tsx
{(households.length > 1 || showFilters) && (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={st.filterRow}
    keyboardShouldPersistTaps="handled"
    style={st.filterScroll}
  >
    {households.length > 1 && <SpaceChip variant="filter" />}
    {showFilters &&
      [{ id: null as string | null, name: t.find.allPlaces }, ...(locations.data ?? [])].map((l) => {
        const on = place === l.id;
        return (
          <Pressable
            key={l.id ?? 'all'}
            onPress={() => onPlace(l.id)}
            style={[
              st.filterChip,
              { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent : c.card },
            ]}
          >
            <Text style={[st.filterText, { color: on ? c.onAccent : c.textMuted }]}>
              {l.name}
            </Text>
          </Pressable>
        );
      })}
  </ScrollView>
)}
```

```tsx
const st = StyleSheet.create({
  // 기존 스타일 유지
  filterChip: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    justifyContent: 'center',
  },
});
```

`places.tsx`

```tsx
<View style={st.body}>
  <SpaceChip variant="filter" />
  <SectionLabel action={...}>{t.places.section(list.length)}</SectionLabel>
  ...
</View>
```

### 위험/트레이드오프

공간과 장소가 같은 줄에 있으면 둘 다 “필터”로 읽혀 개념 구분이 약해질 수 있다. 장소 필터가 많을 때 공간 칩이 첫 자리를 차지해 실제 장소 칩 노출 수가 하나 줄어든다.

## 추천

추천: 시안 1 “제목 자체가 공간”.

이유:

1. 검색창/QR 버튼을 위쪽에 유지하면서도 공간 상태를 가장 명확하게 보여 준다.
2. 공간 UI가 필터나 검색 입력 폭을 빼앗지 않아 402pt 화면에서 안정적이다.
3. 보관 장소 탭에서도 같은 위치와 같은 위계로 쓰기 쉬워, `SpaceSheet` 한 벌 원칙과 화면 간 언어를 가장 잘 지킨다.
