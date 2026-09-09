APPROVE

## 확인한 반영

### Critic 1차 필수 수정 3건

1. [x] **places.tsx:56-80 기존 칩 전환기 → SpaceSheet 교체** — step 5(줄 95-98)에 "이 칩 행을 제거하고 헤더에 SpaceChip 을 둬 SpaceSheet 를 연다" 명시. `st.switcher`/`st.chip`/`st.chipText`(`:124-126`) 제거, `setActiveId` import 걷어냄, Screen title 을 `t.places.title` 고정으로 변경까지 기술. 코드베이스 확인: `:56-80` 인라인 칩 행 존재, `:124` switcher, `:125` chip, `:126` chipText, `:54` `title={active?.name}`, `:26` `setActiveId` import — 전부 정확.
2. [x] **container/[id].tsx:43 useContainer select 에 household_id 추가** — step 9(줄 121-123)에 명시("이게 없으면 박스 상세의 자동 전환이 안 된다"). 코드베이스 확인: `:43` select 에 `household_id` 없음, 변경 지시 정확.
3. [x] **add/[target].tsx 줄 번호 :57 → :61** — step 6(줄 101)에 `:61` 로 정정. 코드베이스 확인: `:61` 에 `queryKey: ['add-context', target, loose]` 정확.

### Critic 1차 권고 4건

1. [x] **ContainerSummary 타입 줄 번호** — `:14-22` 로 보정(줄 122, 반영 기록 줄 181). 실제 타입은 `:15-23`(1줄 차이)이나 내용 정확. 사소하므로 수용.
2. [x] **AsyncStorage 키 근거 기록** — "코드 사실" 섹션(줄 31-34)에 `category-tip-hidden`(일회성 팁), `mission-hidden`(자정 리셋), `expiry-reminders.v1`(사용자 단위 의도)을 근거와 함께 "변경 불필요"로 기록.
3. [x] **알림 설정 키 사용자 단위 명시** — 줄 33 "사용자 단위가 의도다(공간별 끄기는 요청이 오면 후속)" 명시.
4. [x] **fetchAllItems 분리로 useQueries 패턴 구체화** — step 7(줄 108-109) "`useAllItems` 의 `queryFn` 을 `fetchAllItems(hh)` 로 빼내어(`search/api.ts`, 한 벌 유지) `useQueries` 가 공간마다 같은 키(`searchKeys.all(hh)`)·같은 함수로 돌린다(캐시 공유)" 명시. 코드베이스 확인: `useAllItems`(search/api.ts:54-70) queryFn 이 인라인 — 추출 가능.

### Architect 2차 권고 3건

1. [x] **ids 배열 useMemo 안정화** — step 8(줄 115-117) `const ids = useMemo(() => households.map(h => h.id), [households])` 명시. 렌더마다 새 배열로 인한 effect 재실행 방지 근거, `context.tsx:35`의 기존 `useMemo` 안정성까지 기술. 코드베이스 확인: `context.tsx:35` `const list = useMemo(() => q.data ?? [], [q.data])` 정확.
2. [x] **useEnsureActive 가 switched 반환, 토스트는 호출처** — step 9(줄 130-131) "훅은 전환했는지(`switched: boolean`)를 돌려주고, 토스트는 호출처 화면이 띄운다 — 훅은 토스트 컨텍스트를 모른다" 명시.
3. [x] **places.tsx chipText 스타일 제거** — step 5(줄 96) `st.switcher`/`st.chip`/`st.chipText`(`:124-126`) 세 스타일 모두 제거 명시. 코드베이스 확인: `:126` `chipText` 가 칩 행(`:68-74`)에서만 쓰임 — 정확.

**10건 전부 정확하게 반영됨.**

## 신규 추가 항목 검증

### SpaceChip (SpaceSheet.tsx)

계획: 시트를 여는 헤더 칩(`{active.name} ▾`)을 `SpaceChip` 으로 같은 파일에 둬 찾기·보관 장소 탭이 공유한다.
검증: 현재 `setActiveId` 호출처는 `places.tsx:61` 한 곳뿐(`grep -rn setActiveId src/app src/features` 확인). 계획 실행 후 호출처는 SpaceSheet·useEnsureActive·c/[token].tsx·space/new.tsx 로 바뀌며, 수용 기준(줄 150-151)이 이를 `grep` 으로 검증한다. 구체적이고 테스트 가능하며 원칙 4("한 벌")에 일관.

### useEnsureActive(householdId | undefined)

계획: `src/features/household/useEnsureActive.ts` 훅, `switched: boolean` 반환, item/[id].tsx 와 container/[id].tsx 가 공유.
검증: 루프 위험 없음 — `useItem` 키가 `['item', id]`(item/api.ts:80), `useContainer` 키가 `['container', containerId]`(container/[id].tsx:38)로 둘 다 `householdId` 미포함. 전환 후 조건이 꺼진다. 수용 기준 2건(줄 147, 152)이 커버. 구체적이고 원칙 4에 일관.

### fetchAllItems(hh) 추출

계획: `useAllItems` 의 인라인 queryFn 을 `fetchAllItems(hh)` 로 빼내 `useQueries` 에서 재사용.
검증: `useAllItems`(search/api.ts:54-70)의 queryFn 이 인라인이고 `householdId` 만 매개변수 — 추출 단순. `searchKeys.all(hh)` 키(`['search','items',hh]`)가 기존 캐시와 공유되어 활성 공간은 중복 요청 없음. 수용 기준(줄 145)이 jest 테스트로 커버. 구체적.

### useMemo'd ids

계획: `_layout.tsx` 에서 `useMemo(() => households.map(h => h.id), [households])` 로 안정화.
검증: `households` 가 `context.tsx:35`의 `useMemo` 로 이미 안정. 그 위에 한 단계만 더 안정화하면 `useTouchHouseholds`·`useDrainStorageGc` 의 `useEffect` 가 매 렌더 재실행되지 않는다. 수용 기준(줄 142, 149)이 커버. 구체적이고 테스트 가능.

## 실행 시뮬레이션 (3건)

### Step 5 — places.tsx 칩 행 → SpaceChip 교체

집행자가 할 일: (1) SpaceSheet.tsx 에 SpaceChip 컴포넌트 작성, (2) places.tsx:56-80 블록 제거, (3) `:124-126` 스타일 세 개 제거, (4) `:26`에서 `setActiveId` 디스트럭처링 제거, (5) `:54` Screen title 을 `t.places.title` 고정, (6) 헤더에 SpaceChip 추가. 모든 대상 줄·스타일·import 이 명시돼 있어 추측 없이 진행 가능.

### Step 8 — 모든 공간 터치·수거

집행자가 할 일: (1) gc.ts:56-61 `useTouchHousehold` → `useTouchHouseholds(ids: string[])` + `Promise.all`, (2) gc.ts:90-107 `useDrainStorageGc` → `useDrainStorageGc(ids: string[])` + 순차 루프, (3) _layout.tsx:31 디스트럭처링에 `households` 추가, (4) `useMemo`로 ids 안정화, (5) `:37-38` 호출을 `(ids)` 로 변경. 현재 시그니처·줄·패턴이 전부 있어 추측 불필요.

### Step 9 — useEnsureActive 훅

집행자가 할 일: (1) `useEnsureActive.ts` 생성, (2) `useHousehold()` 에서 `activeId`·`setActiveId` 가져와 불일치 시 전환, `switched` 반환, (3) container/[id].tsx:43 select 에 `household_id` 추가, (4) item/[id].tsx·container/[id].tsx 에서 훅 사용 + `switched` 면 토스트. 파일 경로·시그니처·반환 타입·토스트 책임 분담이 명확. 루프 안전성 근거도 제공.

## RALPLAN 기준

| 기준 | 판정 |
|---|---|
| 명확성 (Clarity) | 양호 — 모든 단계가 대상 파일:줄, 변경 내용, 이유를 서술 |
| 검증 가능성 (Verifiability) | 양호 — 수용 기준 15개 전부 테스트 가능 |
| 완결성 (Completeness) | 양호 — 1차에서 누락됐던 places.tsx 칩 행, container/[id].tsx select, 줄 번호가 모두 보정됨 |
| 전체 그림 (Big Picture) | 양호 — 원칙·동인·위험표·반론 대응·반영 기록이 "왜"와 "어디까지"를 충분히 전달 |
| 원칙-선택지 일관성 | Pass — 5개 원칙이 Option A 와 일관, places.tsx 교체로 원칙 4 위반 해소 |
| 대안 탐색 깊이 | Pass — B·C 기각 이유가 기술적으로 구체적 |
| 위험·검증 엄밀성 | Pass — 7개 위험에 짝을 이루는 대응, 가장 큰 위험(휴면 삭제)에 step 8 + 수용 기준 |
| 인용 정확도 | 90%+ — 확인한 인용 전부 내용 정확, 줄 번호 1-2줄 차이가 1건(ContainerSummary :15-23 vs 계획 :14-22) |

## 필수 수정

없음.

## 권고

없음. 1차 권고와 Architect 2차 권고가 모두 반영되어 추가로 지적할 사항이 없다.
