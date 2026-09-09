SOUND

## 확인한 반영

### Architect 1차 필수 수정 7건

1. [x] **ContainerSummary 타입 + select 에 household_id** — step 9 (줄 120-121) 에 타입·select 변경이 "확정 변경" 으로 기술됨. `storage/api.ts:14-22` 타입과 `:260` select 에 `household_id` 추가 명시. 코드베이스 확인: 현재 타입에 필드 없음(`:14-22`), select 에도 없음(`:260`). 변경 지시 정확.
2. [x] **캐시 정리를 activeId 감시 훅에서** — step 6 (줄 99-101) 에 `(tabs)/_layout.tsx` 의 `useEffect([activeId])` 에서 `queryClient.removeQueries({ queryKey: ['add-context'] })` 로 명시. setActiveId 안이 아님을 확인. `add/[target].tsx:61` 줄 번호 정정 완료.
3. [x] **useDrainStorageGc 전 공간** — step 8 (줄 117-118) 에 `useDrainStorageGc(ids)` 로 변경, 순차 처리 명시. 현재 코드 `gc.ts:90` 이 `householdId: string | null` 단일 인자 확인.
4. [x] **StarterChecklist 키에 공간 id** — step 6 (줄 104) 에 `starter.v2:{userId}:{householdId}` 로 변경 명시. 현재 코드 `checklist.ts:27-28` 이 `PREFIX + (userId ?? 'anon')` 만 사용하고 householdId 미포함 확인.
5. [x] **useTouchHouseholds 병렬** — step 8 (줄 113-114) 에 `Promise.all` 패턴 명시. 현재 코드 `gc.ts:56-61` 이 단일 호출 확인.
6. [x] **알림 탭 핸들러의 공간 자동 전환** — step 9 (줄 124-128) 에 `useEnsureActive` 훅으로 상세 화면이 스스로 전환하는 방식 채택. `_layout.tsx:142-150` 의 NotificationTapHandler 는 `/item/{id}` 로 보내기만 하고 물건 상세가 교정 — QR·알림·미래 진입로를 한 곳에서 잡는 설계. 현재 코드에 전환 로직 없음 확인.
7. [x] **place 필터 useEffect** — step 6 (줄 103) 에 `useEffect(() => setPlace(null), [activeId])` 명시. 현재 코드 `index.tsx:97` 에 해당 effect 없음 확인.

### Critic 1차 필수 수정 3건

1. [x] **places.tsx:56-80 기존 칩 전환기 → SpaceSheet 교체** — step 5 (줄 95-98) 에 "이 칩 행을 제거하고 헤더에 SpaceChip 을 둬 SpaceSheet 를 연다" 명시. `st.switcher`/`st.chip` (`:124-125`) 제거, `setActiveId` import 걷어냄, Screen title 을 `t.places.title` 고정으로 변경까지 기술. 현재 코드 `:56-80` 에 인라인 칩 행 존재, `:54` 에 `title={active?.name}` 확인.
2. [x] **container/[id].tsx:43 useContainer select 에 household_id 추가** — step 9 (줄 121) 에 명시. 현재 코드 `:43` 의 select 에 `household_id` 없음 확인.
3. [x] **add/[target].tsx 줄 번호 :57 → :61** — step 6 (줄 101) 에 `:61` 로 정정. 현재 코드 `:61` 에 `queryKey: ['add-context', target, loose]` 확인.

**10건 전부 정확하게 반영됨.**

## 아키텍처 검증

### SpaceChip (SpaceSheet.tsx)

계획: `SpaceChip` 과 `SpaceSheet` 를 한 파일에 두고, 찾기·보관 장소 탭이 같은 컴포넌트를 쓴다. places.tsx 의 기존 칩 행(`:56-80`) 과 관련 스타일(`:124-125`)을 제거한다.

검증 결과: 건전하다. 현재 places.tsx 의 칩 행은 `households.map` + `setActiveId` 직접 호출로, SpaceSheet 와 중복이다. "한 벌" 원칙에 따라 제거가 맞다. 찾기 탭은 `households.length > 1` 일 때만 칩을 그린다 — 공간 하나뿐이면 소음이 없고, "추가" 입구는 더보기 카드가 맡는다.

### useEnsureActive(householdId)

계획: `src/features/household/useEnsureActive.ts` 에 `useEnsureActive(householdId | undefined)` 를 두고, `item/[id].tsx` 와 `container/[id].tsx` 가 공유한다.

**스위치 루프 위험**: 없다. `useItem` 의 queryKey 가 `['item', id]`(`item/api.ts:80`), `useContainer` 의 queryKey 가 `['container', containerId]`(`container/[id].tsx:38`) — 둘 다 `householdId` 를 키에 포함하지 않으므로, `activeId` 가 바뀌어도 쿼리 결과가 달라지지 않는다. 훅이 한 번 전환하면 `householdId === activeId` 가 되어 멈춘다.

**이펙트 순서**: 상세 화면이 마운트될 때 데이터가 아직 없으면(`householdId` 가 `undefined`) 훅은 아무것도 안 한다. 데이터가 도착하면 불일치를 감지해 전환한다. `item/[id].tsx:78` 의 `useLocations(activeId)` 가 잠깐 옛 공간의 장소를 가져올 수 있지만, MovePicker 가 즉시 보이지 않으므로 실질적 문제가 아니다.

**setActiveId 참조 안정성**: `context.tsx:44` 에서 `setActiveId` 가 `useMemo` 안에 정의된다. `setActiveId` 호출 → `setStored` → `stored` 변경 → `useMemo` 재계산 → 새 `setActiveId` 참조. 하지만 재계산 후 `activeId === householdId` 이므로 `useEnsureActive` 의 조건문이 false 가 되어 재호출되지 않는다. 루프 없음.

### fetchAllItems(hh) + useQueries (reminders.ts)

계획: `useAllItems` 의 `queryFn` 을 `fetchAllItems(hh)` 로 추출하고, `useExpiryReminderSync(households)` 에서 `useQueries` 로 공간마다 같은 키(`searchKeys.all(hh)`)·같은 함수로 호출한다.

**캐시 공유**: `searchKeys.all(hh)` 는 `['search', 'items', householdId]`(`search/api.ts:46`). 활성 공간의 키는 `useAllItems`(찾기 탭)가 이미 채워 둔다. `useQueries` 가 같은 키를 쓰면 React Query 가 캐시를 공유하므로 중복 요청 없다. 비활성 공간의 키는 `useQueries` 가 처음 채운다. **키 충돌 없음, 캐시 공유 정상.**

**useSearchIndex 대체**: `useSearchIndex`(`search/api.ts:97`) 는 `useAllItems` + `useLocationNames` + `useMemo` 로 `Indexed[]` 를 만든다. 루프에서 훅을 부를 수 없으므로 `fetchAllItems` 추출이 올바르다. 알림의 경로 접두어(공간 이름)는 `Household.name` 에서 오므로 `useLocationNames` 없이도 공간 식별이 가능하다. 알림 본문에 전체 경로가 필요하다면 `useLocationNames` 의 `queryFn` 도 추출이 필요하지만, 이는 구현 단계의 세부 사항이다.

### useTouchHouseholds(ids) — Promise.all

계획: `Promise.all(ids.map(...))` 로 병렬 호출.

검증 결과: 패턴은 건전하다. `touch_household` RPC 가 하루 한 번만 실제 갱신하므로(`gc.ts:53-54` 주석) 병렬 호출의 서버 부하는 왕복뿐이다.

### useDrainStorageGc(ids) — 순차

계획: 공간마다 `drainStorageGc` 를 순서대로(배치 100건 삭제라 병렬로 몰지 않는다).

검증 결과: 건전하다. `drainStorageGc`(`gc.ts:25-44`) 가 `deletePhotoObjects`(Storage API) 를 부르므로 병렬이면 동시 삭제 요청이 몰린다. 순차가 맞다.

## 필수 수정

없음.

## 권고

### 1. useTouchHouseholds · useDrainStorageGc 의 ids 배열 참조 안정성

`_layout.tsx` 에서 `households.map(h => h.id)` 를 렌더마다 호출하면 매번 새 배열 참조가 만들어진다. `useEffect` 의 의존성 배열에 이 참조가 들어가면 **매 렌더마다 effect 가 재실행**된다. `useTouchHouseholds` 는 RPC 를 매번 보내고, `useDrainStorageGc` 는 cleanup 후 재실행된다.

대응: step 8 에 `const ids = useMemo(() => households.map(h => h.id), [households])` 를 한 줄 추가하거나, 훅 내부에서 `JSON.stringify(ids)` 를 의존성으로 쓰도록 한다. `households` 는 `context.tsx:35` 에서 `useMemo(() => q.data ?? [], [q.data])` 로 이미 안정화되어 있으므로, 그 위에 한 단계만 더 안정화하면 된다.

### 2. useEnsureActive 전환 시 토스트

위험표(줄 157) 에 "QR·알림 자동 전환이 사용자 몰래 공간을 바꿈 → 토스트로 `t.space.switched` 를 띄운다" 고 했지만, `useEnsureActive` 자체는 토스트 컨텍스트에 접근할 수 없다. step 9 에 "훅이 전환 여부를 리턴하고, 호출처(`item/[id].tsx`, `container/[id].tsx`) 가 토스트를 띄운다" 를 한 줄 추가하면 집행자가 헤매지 않는다.

### 3. places.tsx 에서 제거할 스타일에 chipText 포함

step 5 가 `st.switcher`/`st.chip` (`:124-125`) 제거를 명시하지만, `chipText` (`:126`) 도 칩 행(`:68-74`) 에서만 쓰인다. 칩 행을 제거하면 `chipText` 도 함께 없어야 한다. 집행자가 lint 로 잡을 수 있지만 명시해 두면 깔끔하다.

## 반론 (Antithesis)

1차와 동일하다. Option A(활성 공간 전환기)의 가장 강한 반론은 **"전-공간 불변성" 의 유지보수 부담**이다. 이번 검토에서 식별한 "전 공간이어야 하는 코드" 가 다섯 곳(알림·휴면 터치·수거 큐·상세 진입 전환·시작 체크리스트) 이고, 앞으로 통계·내보내기·공간 간 검색 같은 기능이 추가될 때마다 개발자가 "이건 전 공간이어야 하나?" 를 판단해야 한다. 빠뜨리면 조용히 실패한다. 계획이 이 위험에 대해 `progress.txt` 목록과 `_layout.tsx` 주석으로 대응한 것(줄 158)은 구조적 방어 대비 저비용이면서 합리적이다. Option B(합쳐 보기)가 이 실수 유형을 구조적으로 없애지만, 현재 모든 캐시 키와 쓰기 흐름이 단일 활성 가구를 전제하므로 변경 범위와 위험이 몇 배로 늘어 기각이 여전히 옳다.

## References

- `src/features/storage/api.ts:14-22` — ContainerSummary 타입, household_id 없음
- `src/features/storage/api.ts:260` — useContainerByToken select, household_id 없음
- `src/features/household/context.tsx:35` — households 배열 useMemo 안정화
- `src/features/household/context.tsx:44-47` — setActiveId 정의, useMemo 안에서 재생성
- `src/features/storage/gc.ts:56-61` — useTouchHousehold 단일 호출
- `src/features/storage/gc.ts:90-107` — useDrainStorageGc 단일 공간
- `src/features/search/api.ts:46` — searchKeys.all(householdId) 키 형태
- `src/features/search/api.ts:53-69` — useAllItems queryFn 인라인 정의
- `src/features/search/api.ts:97-107` — useSearchIndex 가 useAllItems 를 감쌈
- `src/features/item/api.ts:80-88` — useItem queryKey 에 householdId 미포함, select 에 household_id 포함
- `src/features/item/reminders.ts:227-248` — useExpiryReminderSync 현재 단일 공간
- `src/app/(tabs)/places.tsx:56-80` — 기존 칩 전환기
- `src/app/(tabs)/places.tsx:124-126` — switcher/chip/chipText 스타일
- `src/app/(tabs)/index.tsx:97` — place 필터 useState
- `src/app/(tabs)/_layout.tsx:31,37-40` — activeId 만 사용, touch/gc/reminders 단일 공간
- `src/app/item/[id].tsx:75,77-78` — useHousehold, useItem, useLocations(activeId)
- `src/app/container/[id].tsx:36-50` — useContainer select 에 household_id 없음
- `src/app/c/[token].tsx:29-48` — QR 착지, 자동 전환 로직 없음
- `src/app/_layout.tsx:142-150` — NotificationTapHandler, 공간 전환 없음
- `src/app/add/[target].tsx:61` — add-context 캐시 키에 householdId 미포함
- `src/features/onboarding/checklist.ts:27-28` — keyFor 에 householdId 미포함
