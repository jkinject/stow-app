# 여러 공간(집·사무실…) 등록과 분리 관리 — 계획

요청: "집 1개에만 소속된다는 보장이 없음. 사무실이나 다른 공간도 등록하고 분리해서 관리할 수 있도록."

## 코드 사실 (조사 결과)

- 데이터 모델은 **이미 다중 가구**다. `household_members(household_id, user_id)` 다대다이고
  `create_household` RPC(`supabase/migrations/20260828000500_rpc.sql:40`) 는 두 번째 가구 생성을 막지 않는다.
- 앱 전역 "활성 가구" 가 있다: `src/features/household/context.tsx:11-53` — `activeId`, `setActiveId`
  (AsyncStorage `homestore.activeHouseholdId` 에 보존, 유효하지 않으면 첫 가구로 폴백).
  `setActiveId` 를 부르는 곳이 하나 있다 — 보관 장소 탭(`src/app/(tabs)/places.tsx:56-80`)이 `households.length > 1` 일 때
  칩 행을 그리고 누르면 `setActiveId(h.id)` 를 부른다. 그러나 두 번째 가구를 **만드는** 입구는 없다.
  온보딩(`src/app/onboarding.tsx`)은 가구가 0개일 때만 뜬다(`src/app/_layout.tsx` Guard).
- 목록 질의는 전부 가구 id 로 캐시 키가 갈린다: search `['search','items',hh]`(`src/features/search/api.ts:47`),
  `['category-list',hh]`, `['all-containers',hh]`, `['mission',hh,uid,key]`, `['trash',hh]`, shopping `shoppingKeys.list(hh)`,
  locations/containers `storageKeys.*(hh)`. 물건 상세 `['item', id]` 는 id 가 전역 고유라 그대로.
- 활성 가구 하나만 전제하는 곳 다섯 (Architect 검토로 둘 추가):
  1. **소비기한 알림** `src/features/item/reminders.ts:227-246` — `useSearchIndex(activeId)` 로 활성 가구 물건만 건다.
     다른 공간의 기한은 알림이 안 온다.
  2. **휴면 판정** `src/app/(tabs)/_layout.tsx:37` `useTouchHousehold(activeId)` — 활성 가구만 `last_seen_at` 을 올린다.
     사무실을 90일 안 열면(다른 공간을 활성으로 두고 쓰는 동안) **그 공간이 휴면으로 삭제 예고**된다
     (`supabase/migrations/20260902000200_dormant_households.sql`).
  3. **QR 딥링크** `src/app/c/[token].tsx:29-48` — 토큰으로 박스를 찾아 `/container/{id}` 로 보낸다. 박스가 다른 공간의
     것이면 상세는 열리지만(RLS 는 내 모든 가구를 허용) 그 화면의 하위 목록·등록은 `activeId` 를 쓰므로 어긋난다.
     `useContainerByToken` 의 select(`src/features/storage/api.ts:260`)와 `ContainerSummary` 타입(`:15-23`)에는
     `household_id` 가 **없다**(뷰 `container_summary` 에는 있다 — `20260828000800_soft_delete_hierarchy.sql:88`).
  4. **사진 수거 큐 비우기** `src/app/(tabs)/_layout.tsx:38` `useDrainStorageGc(activeId)` — 활성 가구의 `storage_gc` 만 비운다.
  5. **알림 탭 핸들러** `src/app/_layout.tsx:142-150` — 알림의 물건이 다른 공간 것이면 상세는 열리되 `activeId` 와 어긋난다.
- 이미 다중 가구를 올바로 다루는 곳(변경 불필요): 사진 업로드 큐는 작업마다 `householdId` 를 운반(`photoQueue.ts:56`),
  탈퇴 미리보기는 서버가 모든 가구를 센다(`deleteAccount.ts:25-37`), 미션 키에 가구 id 포함(`mission/api.ts:50`),
  Realtime 구독 없음. 가구 id 없는 AsyncStorage 키 중 `home-store.category-tip-hidden`(`categories.tsx:34`, 일회성 팁)과
  `home-store.mission-hidden`(`mission/api.ts:28`, 자정에 풀림)은 공간 간에 공유돼도 무해해 그대로 둔다. 알림 설정
  `stow.expiry-reminders.v1`(`reminders.ts:36`)은 **사용자 단위가 의도**다(공간별 끄기는 요청이 오면 후속). 시작 체크리스트 상태는 **사용자별** 키(`src/features/onboarding/checklist.ts:85` `starter.v2:{userId}`)라
  새 빈 공간에서 안내가 안 뜬다.
- 더보기 프로필 카드(`src/app/(tabs)/more.tsx:159-176`)가 `active.name · 역할` 을 글자로만 보여 준다.
- 가족 화면(`src/app/family.tsx`)의 이름 바꾸기·나가기·초대는 모두 `activeId` 기준 — 전환만 되면 그대로 쓸 수 있다.
- 온보딩의 만들기/참여 폼(`src/app/onboarding.tsx:54-97`)은 `useCreateHousehold`/`useAcceptInvite` 를 쓰고
  성공 시 `['households','mine']` 을 무효화한다 — 두 번째 공간에도 그대로 쓸 수 있다.

## RALPLAN-DR 요약

### 원칙 (Principles)
1. **서버는 손대지 않는다.** 모델·RLS·RPC 가 이미 다중 가구를 허용한다. 이번 일은 앱의 흐름·UI 문제다.
2. **활성 공간은 하나, 전환은 명시적.** 화면들이 "지금 어느 공간인가" 를 전역 한 값에서 읽는 구조를 유지한다.
   여러 공간의 데이터를 한 화면에 섞지 않는다 — 요청이 "분리해서 관리" 다.
3. **공간에 무관하게 옳아야 하는 것은 전부 훑는다** (알림·휴면·딥링크). 활성 공간만 보는 코드가 어디 있는지 목록으로 못 박는다.
4. **한 벌.** 만들기/참여 폼은 온보딩과 공간 추가가 같은 컴포넌트를 쓴다. 전환 UI 는 시트 하나 — 더보기·찾기·보관 장소 탭이
   같은 것을 열고, 보관 장소 탭의 기존 칩 행은 **없앤다**(칩 행은 "추가" 입구가 없고, 공간이 늘면 여러 줄로 접힌다).
5. **용어는 "공간".** "집" 은 브랜드 문구(앱 소개)에만 남기고 관리 UI 는 "공간" 으로 — 사무실이 "우리 집" 아래 있으면 어색하다.

### 결정 동인 (Decision Drivers)
1. 사무실 같은 별개 공간을 **가족과 분리해** 관리해야 한다 (공유 범위가 공간마다 다르다).
2. 기존 가족 공유·초대·QR·알림 흐름이 깨지지 않아야 한다.
3. 서버 변경 없이(마이그레이션 0) 안전하게 — 운영 DB 를 건드릴 이유가 없다.

### 선택지 (Viable Options)
- **A. 활성 공간 전환기 (채택)** — 더보기·찾기 탭에서 공간 목록 시트를 열어 전환하고, 거기서 "공간 추가(만들기/참여)".
  장점: 서버 변경 0, 모든 질의가 이미 활성 가구 키로 갈려 있어 화면 수정 최소, 가족 공유 범위가 공간별로 자연히 분리.
  단점: 한 번에 한 공간만 본다(공간을 넘나드는 검색 없음). 활성 공간만 전제한 코드 세 곳을 고쳐야 한다.
- **B. 여러 공간을 합쳐 보기 (찾기 탭에 공간 칩)** — 모든 화면이 다중 가구 데이터를 합친다.
  장점: 공간을 넘나드는 검색. 단점: 캐시 키·등록 목적지·QR·미션·구매목록 전부 다중 가구로 재설계, 물건 등록마다
  공간 선택 필요, 요청("분리") 과 반대. **기각.**
- **C. 공간을 같은 가구 안의 상위 장소 계층으로** — 서버에 `spaces` 표를 더하고 장소를 그 아래 둔다.
  장점: 전환 없이 한 목록. 단점: 가족이 사무실 물건까지 본다(공유 범위 분리 불가), 마이그레이션·RLS·QR·라벨 전부 변경.
  **기각.**

## 요구사항 요약
- 공간을 여러 개 만들거나(만들기) 초대 코드로 참여할 수 있다(온보딩 이후에도).
- 지금 어느 공간인지 항상 보이고, 두 번 이내의 탭으로 전환한다. 선택은 기기에 남는다(이미 그렇다).
- 공간을 전환하면 찾기·보관 장소·살 것·더보기·등록 목적지가 전부 그 공간 것만 보여 준다.
- 소비기한 알림은 내가 속한 **모든** 공간의 물건에 대해 온다. 알림 본문에 공간 이름이 붙는다(공간이 둘 이상일 때).
- 어떤 공간을 오래 안 열어도 앱만 켜면 휴면으로 빠지지 않는다.
- QR 로 다른 공간의 박스를 열면 그 공간으로 자동 전환된다.

## 구현 단계

1. **문자열** — `src/lib/strings.ko.ts` / `strings.en.ts`
   - `space` 묶음 신설: `title:'공간'`, `switch:'공간 바꾸기'`, `add:'공간 추가'`, `create:'새 공간 만들기'`, `join:'초대 코드로 참여'`,
     `current:'지금 여기'`, `count:(n)=>\`${n}개 공간\``, `namePlaceholder:'예: 사무실, 본가, 창고'`, `switched:(name)=>\`${name}(으)로 바꿨습니다\``.
   - 관리 UI 의 "우리 집" 을 "공간" 으로: `more.household`(`strings.ko.ts:424`), 온보딩 `createCta`(`:113` "우리 집 만들기" → "첫 공간 만들기"),
     초대 힌트(`:470`). 앱 소개 문구("집 안 물건이…")는 그대로.
2. **만들기/참여 폼을 한 벌로** — `src/features/household/JoinOrCreate.tsx` 신설.
   `src/app/onboarding.tsx:54-97` 의 `create`/`join` 모드 UI 를 옮기고, 온보딩은 이 컴포넌트를 쓴다(동작 동일).
   props: `onDone(household)` — 만들거나 참여한 가구를 돌려준다.
3. **공간 추가 화면** — `src/app/space/new.tsx` 신설 (`Screen back title={t.space.add}`), `JoinOrCreate` 를 넣고 `onDone` 에서
   `setActiveId(h.id)` → `router.replace('/')` → 토스트 `t.space.switched(h.name)`. 참여도 같은 화면(모드 선택).
4. **공간 전환 시트** — `src/features/household/SpaceSheet.tsx` 신설. `BottomSheet label={t.space.title}` +
   `SheetOption`(공간마다, `on={id===activeId}`, leading 은 이름 첫 글자 타일) + 맨 아래 `accent` 로 `t.space.add` → `/space/new`.
   고르면 `setActiveId(id)` 후 닫고 토스트. 공간이 하나뿐이어도 "추가" 는 보인다(그게 이 기능의 입구다).
   시트를 여는 헤더 칩(`{active.name} ▾`)도 같은 파일에 `SpaceChip` 으로 한 벌만 둔다 — 찾기·보관 장소 탭이 이걸 쓴다.
5. **입구 셋** — 같은 시트를 연다.
   - 더보기 프로필 카드(`more.tsx:159-176`)의 `active.name · 역할` 줄을 Pressable 로 → 오른쪽에 `IconChevron`, 아래 `t.space.count(n)`.
   - 찾기 탭 헤더(`src/app/(tabs)/index.tsx` 검색창 위 또는 장소 칩 왼쪽): `SpaceChip`. 공간이
     둘 이상일 때만 그린다 — 하나뿐이면 소음이다(추가 입구는 더보기 카드가 맡는다).
   - 보관 장소 탭(`places.tsx:56-80`)에 이미 인라인 칩 전환기가 있다. **이 칩 행을 제거**하고 헤더에 찾기 탭과 같은
     `SpaceChip` 을 둬 SpaceSheet 를 연다 — "한 벌" 원칙(4번)에 따라 전환 UI 를 SpaceSheet 로 통일한다. `st.switcher`/`st.chip`/`st.chipText`
     (`:124-126`)과 `setActiveId` import 를 걷어낸다. Screen title 도 `active?.name` 에서 `t.places.title` 고정으로 바꾸고,
     공간 이름은 칩이 보여 준다.
6. **전환 시 뒷정리** — `setActiveId`(`context.tsx:44-47`) 는 queryClient 를 모르는 순수 클로저다. 캐시 정리는 **호출 지점이 아니라
   `activeId` 를 감시하는 훅 한 곳**에서 한다: `(tabs)/_layout.tsx` 에 `useEffect(() => {...}, [activeId])` 로
   `queryClient.removeQueries({ queryKey: ['add-context'] })` (등록 목적지 캐시 — 키에 가구 id 가 없다, `add/[target].tsx:61`).
   그 밖의 목록 키는 전부 가구 id 를 포함하므로 손대지 않는다.
   찾기 탭 `place` 필터(`index.tsx:97` `useState<string|null>`)는 `useEffect(() => setPlace(null), [activeId])` 로 되돌린다.
   시작 체크리스트 키를 `starter.v2:{userId}:{householdId}` 로 바꿔(`checklist.ts:85`) 새 공간에서도 안내가 뜨게 한다
   (옛 키의 진행 상태는 첫 공간으로 옮기지 않는다 — 안내가 한 번 더 뜰 뿐이다).
7. **알림은 모든 공간** — `src/features/item/reminders.ts:227`
   `useExpiryReminderSync(householdId)` → `useExpiryReminderSync(households: Household[])`.
   `useSearchIndex` 는 `useAllItems` 를 감싼 훅이라 루프에서 못 부른다 → `useAllItems` 의 `queryFn` 을 `fetchAllItems(hh)` 로
   빼내어(`search/api.ts`, 한 벌 유지) `useQueries` 가 공간마다 같은 키(`searchKeys.all(hh)`)·같은 함수로 돌린다(캐시 공유). 합쳐서
   `path` 앞에 공간 이름을 붙인다(공간이 둘 이상일 때: "사무실 › 책상 › 서랍"). 경로 사전(`useLocationNames`)도 공간별로.
   `planReminders` 는 순수 함수라 그대로. 상한 60 은 합친 목록 기준.
8. **휴면 터치·수거 큐는 모든 공간** — `src/features/storage/gc.ts:56-61` `useTouchHousehold(householdId)` →
   `useTouchHouseholds(ids: string[])`: `Promise.all(ids.map(id => supabase.rpc('touch_household', {p_household:id})))` 로
   **병렬** 호출(서버가 하루 한 번만 실제 갱신하므로 비용은 왕복뿐). `(tabs)/_layout.tsx:31` 을
   `const { activeId, households } = useHousehold()` 로 넓혀 `const ids = useMemo(() => households.map(h => h.id), [households])` 를
   넘긴다 — 렌더마다 새 배열을 만들면 두 훅의 effect 가 매 렌더 재실행돼 RPC 가 반복된다(`households` 는 `context.tsx:35` 에서
   이미 `useMemo` 로 안정).
   **이게 없으면 다른 공간이 휴면 삭제된다** — 이번 기능의 가장 큰 위험.
   `useDrainStorageGc(activeId)`(`:38`) 도 같은 이유로 `useDrainStorageGc(ids)` — 공간마다 `drainStorageGc` 를 순서대로(배치 100건
   삭제라 병렬로 몰지 않는다). 비활성 공간의 고아 파일이 쌓이지 않게.
9. **QR 딥링크·알림 탭의 자동 전환** —
   - `src/features/storage/api.ts:15-23` `ContainerSummary` 에 `household_id: string` 추가, `:260` select 에 `household_id` 추가(뷰에 이미 있다).
   - `src/app/container/[id].tsx:43` 의 로컬 `useContainer` 도 select 에 `household_id` 추가 — 이게 없으면 박스 상세의 자동 전환이 안 된다.
   - `src/app/c/[token].tsx:29-48`: 데이터가 오면 `if (data.household_id !== activeId) setActiveId(data.household_id)` 뒤
     `/container/{id}` 로. `scan.tsx:74` 는 `/c/{token}` 으로 보내므로 같은 길을 탄다. 전환됐으면 토스트 `t.space.switched`.
   - 알림 탭(`src/app/_layout.tsx:142-150` `NotificationTapHandler`)은 물건 id 만 안다. 물건 상세(`src/app/item/[id].tsx`)가 로드한
     `row.household_id` 가 `activeId` 와 다르면 **상세 화면이** `setActiveId(row.household_id)` 한다(딥링크·알림·앞으로 생길 어떤
     진입로든 한 곳에서 잡힌다). 물건 상세는 `household_id` 를 이미 선택한다(`item/api.ts:87-88`). 같은 규칙을 박스 상세
     (`container/[id].tsx`)에도 둔다 — 그러면 QR 착지의 전환은 보조가 된다. 이 "상세가 스스로 전환" 은
     `src/features/household/useEnsureActive.ts` 훅 하나(`useEnsureActive(householdId | undefined)`)로 두 화면이 공유한다(한 벌).
     훅은 전환했는지(`switched: boolean`)를 돌려주고, 토스트(`t.space.switched(name)`)는 호출처 화면이 띄운다 — 훅은 토스트 컨텍스트를 모른다.
     루프 위험 없음: 상세 질의 키(`['item', id]`, `['container', id]`)에 가구 id 가 없어 전환해도 데이터가 안 바뀌고, 한 번 맞추면 조건이 꺼진다.
10. **가족 화면 제목** — `src/app/family.tsx` 제목에 활성 공간 이름을 붙인다(`{active.name} · 가족`) — 어느 공간의 구성원인지 보이게.
11. **기록·문서** — `progress.txt` 에 원인·결정 기록.

## 수용 기준 (테스트 가능)
- [ ] 더보기 › 공간 줄 → 시트 → "공간 추가" → "사무실" 만들기 → 활성이 사무실로 바뀌고 찾기 탭이 **0건**, 보관 장소 탭이 빈 상태.
- [ ] 시트에서 원래 공간을 고르면 찾기 탭이 원래 물건(예: 40건)으로 돌아온다. 앱을 껐다 켜도 마지막 공간이 유지된다.
- [ ] 사무실에서 물건을 등록하면 사무실에만 보이고, 원래 공간의 가족 구성원 화면에는 나타나지 않는다(RLS).
- [ ] 초대 코드로 참여하면 새 공간이 목록에 생기고 즉시 활성이 된다.
- [ ] 두 공간에 각각 소비기한이 있는 물건을 두면 `dumpsys alarm`(Android) 에 **두 공간의 알림이 모두** 예약되고, 본문에 공간 이름이 붙는다.
- [ ] 앱을 열면 내가 속한 모든 공간의 `last_seen_at` 이 오늘로 올라간다(로컬 DB 질의로 확인).
- [ ] 다른 공간 박스의 QR 을 스캔하면 그 공간으로 전환되어 박스 상세가 열리고, 뒤로 가면 그 공간의 목록이다.
- [ ] 공간이 하나뿐이면 찾기 탭에 공간 칩이 없다.
- [ ] jest: 알림 합치기 순수 로직(공간 이름 접두, 60 상한이 합친 목록 기준) 테스트 통과. 기존 96건 유지.
- [ ] typecheck·lint 통과. pgTAP 348건 유지(서버 변경 없음).
- [ ] 소비기한 알림을 눌러 다른 공간의 물건이 열리면 그 공간으로 전환되어 있다(더보기 카드로 확인).
- [ ] 새로 만든 빈 공간의 찾기 탭에 시작 체크리스트가 다시 뜬다.
- [ ] 앱을 열면 모든 공간의 `storage_gc` 큐가 비워진다(로컬 DB 로 확인).
- [ ] 보관 장소 탭에 옛 칩 행이 없고, 헤더 칩으로 같은 시트가 열린다. `grep -rn setActiveId src/app src/features` 의 호출처가
      SpaceSheet·useEnsureActive·`c/[token].tsx`·`space/new.tsx` 뿐이다.
- [ ] `/container/{id}` 로 직접 들어가도(뒤로가기·알림) 다른 공간 박스면 그 공간으로 전환된다.

## 위험과 대응
| 위험 | 대응 |
|---|---|
| 활성 공간만 터치해 다른 공간이 휴면 삭제됨 | 단계 8 — 모든 공간 터치. 로컬 DB 로 `last_seen_at` 갱신 확인을 수용 기준에 둔다 |
| 전환 뒤 옛 공간의 캐시가 화면에 잠깐 보임 | 캐시 키가 가구별이라 섞이지 않는다. 가구 키가 없는 것(`add-context`)만 점검(단계 6) |
| 알림 60 상한을 한 공간이 다 차지 | 합친 목록을 가까운 순으로 자르므로 공간 무관하게 "가까운 것" 이 우선 — 의도된 동작. 기록에 남긴다 |
| 온보딩 폼을 옮기다 온보딩이 깨짐 | 단계 2 는 이동만(동작 동일). 온보딩 경로를 시뮬레이터/기기에서 로그아웃 후 확인 |
| QR·알림 자동 전환이 사용자 몰래 공간을 바꿈 | 토스트로 `t.space.switched` 를 띄운다 |
| "활성 공간만 보는 코드" 가 앞으로 또 생김 (Architect 반론) | `progress.txt` 에 **전 공간이어야 하는 것 목록**(알림·휴면 터치·수거 큐·상세 진입 전환)을 남기고, `(tabs)/_layout.tsx` 의 훅 주석에 같은 목록을 둔다 — 새 훅을 붙일 때 대조한다 |
| 공간 수만큼 RPC 왕복이 앱 시작에 더해짐 | 병렬 호출(단계 8). 공간은 보통 2~3개라 수백 ms 이내. 그 이상이면 `touch_households(uuid[])` 배치 RPC 를 후속으로(ADR follow-up) |

## 검증 단계
1. `npm run typecheck && npm run lint && npx jest` — 전부 통과.
2. 안드로이드 기기: 공간 추가 → 전환 → 등록 → 되돌리기 → 앱 재시작 유지 → QR 스캔 자동 전환 → 알림 예약 개수(`dumpsys alarm`).
3. 로컬 DB(시뮬레이터): `select name, last_seen_at from households` 로 모든 공간이 터치되는지.
4. 두 계정(시드 dev1/dev2)으로 사무실 물건이 가족에게 안 보이는지 — RLS 는 기존 pgTAP(`rls_matrix.test.sql`) 이 보장.

## Architect 반영 기록 (1차)
- 판정 SOUND WITH CHANGES, 7건 전부 반영: ContainerSummary 타입·select 에 household_id(확정 변경), 캐시 정리는 activeId 감시 훅에서,
  수거 큐도 전 공간, 시작 체크리스트 키에 공간 id, 터치 병렬, 알림 탭 전환(상세 화면이 스스로 전환), place 필터 useEffect.
- Architect 의 반론(전-공간 불변성의 유지보수 부담)은 위험표의 "목록으로 못 박기" 로 대응. 배치 터치 RPC 는 후속 과제.

## Critic 반영 기록 (2차)
- 판정 ITERATE, 3건 반영:
  1. places.tsx:56-80 의 기존 칩 전환기를 "코드 사실"에 추가하고 step 5 에서 SpaceSheet 로 교체하도록 명시(원칙 4 "한 벌" 준수).
  2. container/[id].tsx:43 의 로컬 useContainer select 에 household_id 추가를 step 9 에 명시.
  3. add/[target].tsx 줄 번호를 :57 → :61 로 정정.
- ContainerSummary 타입 줄 번호도 :16-23 → :14-22 로 보정(Critic 권고).
- 권고 4건 반영: 가구 id 없는 AsyncStorage 키(팁·미션 숨김·알림 설정)를 "변경 불필요" 에 근거와 함께 기록,
  `fetchAllItems` 분리로 `useQueries` 패턴을 구체화. 덤으로 `SpaceChip`·`useEnsureActive` 를 한 벌로 못 박고 수용 기준 2건 추가.

## Architect 반영 기록 (2차)
- 판정 SOUND, 필수 수정 없음. 권고 3건 반영: ids 배열 `useMemo` 안정화(단계 8), `useEnsureActive` 가 전환 여부를 돌려주고 토스트는
  호출처가(단계 9), places.tsx 에서 `chipText` 스타일까지 제거(단계 5). 반론은 1차와 같고 대응도 같다.

## ADR — 여러 공간은 "활성 공간 전환기" 로 (2026-09-09)

**결정 (Decision)**
서버는 그대로 두고, 앱에 "활성 공간" 전환 시트와 "공간 추가(만들기/참여)" 입구를 만든다. 한 번에 한 공간만 보고, 전환은 명시적이다.
공간과 무관하게 옳아야 하는 다섯 곳(소비기한 알림·휴면 터치·사진 수거 큐·상세 화면 진입 시 자동 전환·시작 체크리스트 키)은 모든 공간을 훑도록 고친다.

**동인 (Drivers)**
1. 사무실 같은 별개 공간을 가족과 **분리해** 관리(공유 범위가 공간마다 다르다).
2. 기존 가족 공유·초대·QR·알림 흐름이 깨지지 않을 것.
3. 서버 변경 0 — 모델·RLS·RPC 가 이미 다중 가구를 허용한다.

**검토한 대안 (Alternatives considered)**
- B. 여러 공간을 합쳐 보기(찾기 탭에 공간 칩) — 캐시 키·등록 목적지·QR·미션·구매목록 전부 다중 가구로 재설계해야 하고, 물건 등록마다 공간을 골라야 하며, 요청("분리") 과 반대. 기각.
- C. 공간을 같은 가구 안의 상위 장소 계층으로 — 가족이 사무실 물건까지 본다(공유 범위 분리 불가), 마이그레이션·RLS·QR·라벨 전부 변경. 기각.

**선택 이유 (Why chosen)**
모든 목록 질의가 이미 가구 id 로 캐시 키가 갈려 있고 `HouseholdProvider` 에 `activeId`/`setActiveId` 가 있어, 화면 수정이 가장 적고 서버를 건드리지 않는다.
가족 공유 범위가 공간별로 자연히 분리된다. 보관 장소 탭에 있던 칩 전환기가 이 방향의 씨앗이었고, 그것을 시트 한 벌로 흡수한다.

**결과 (Consequences)**
- 좋음: 마이그레이션 0, pgTAP 348건 그대로. 전환 UI 가 한 벌(`SpaceSheet`/`SpaceChip`)로 모인다. 딥링크·알림 진입은 상세 화면이 스스로 공간을 맞춘다(`useEnsureActive`).
- 감수: 공간을 넘나드는 검색은 없다. "전 공간이어야 하는 코드" 목록을 사람이 유지해야 한다(Architect 반론) — `progress.txt` 와 `(tabs)/_layout.tsx` 주석에 목록을 못 박아 새 훅을 붙일 때 대조한다.
- 앱 시작 시 공간 수만큼 `touch_household` 왕복(병렬)과 순차 `storage_gc` 비우기가 더해진다. 공간 2~3개 기준 수백 ms 이내.

**후속 (Follow-ups)**
- 공간이 많아지면 `touch_households(uuid[])` 배치 RPC.
- 공간별 알림 끄기 요청이 오면 알림 설정 키를 공간 단위로.
- 시작 체크리스트의 옛 키(`starter.v2:{userId}`) 진행 상태 이전은 하지 않는다 — 첫 공간에서 안내가 한 번 더 뜰 뿐.
- 공간 삭제/나가기는 기존 가족 화면의 "나가기" 로 충분한지 사용 후 재검토.

## 변경 이력 (Changelog)
- 1차 초안(Planner) → Architect SOUND WITH CHANGES(7건) 반영 → Critic ITERATE(필수 3건·권고 4건) 반영
  → Architect 2차 SOUND(권고 3건) 반영 → Critic 2차 **APPROVE**(필수·권고 없음). 합의 완료.
- 마지막 보정: `ContainerSummary` 인용 줄을 `:15-23` 으로.
