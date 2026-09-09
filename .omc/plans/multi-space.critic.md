# 여러 공간 등록/분리 관리 — 비평 (Critic Review)

ITERATE

---

## 검증한 인용

| 인용 | 파일:줄 | 정확? | 비고 |
|---|---|---|---|
| context.tsx:11-53 — activeId, setActiveId, AsyncStorage 키 | context.tsx:11 KEY, :23-53 Provider, :44-47 setActiveId | **정확** | |
| context.tsx:44-47 — setActiveId 는 queryClient 참조 없는 순수 클로저 | :44-47 `setStored(id) + AsyncStorage.setItem` 만 | **정확** | |
| storage/api.ts:16-23 — ContainerSummary 타입, household_id 없음 | 실제 :14-22 | **줄 2칸 차이** | 내용은 정확 |
| storage/api.ts:260 — select 에 household_id 없음 | :260 `.select('id, location_id, name, qr_token, thumb_path, item_count, updated_at')` | **정확** | |
| (tabs)/_layout.tsx:37 — useTouchHousehold(activeId) | :37 | **정확** | |
| (tabs)/_layout.tsx:38 — useDrainStorageGc(activeId) | :38 | **정확** | |
| (tabs)/_layout.tsx:31 — `const { activeId } = useHousehold()` | :31 | **정확** | |
| _layout.tsx:142-150 — NotificationTapHandler | :142-150 | **정확** | |
| reminders.ts:227-246 — useExpiryReminderSync | :227 시작, :248 종료 (계획은 246) | **줄 2칸 차이** | 내용은 정확 |
| gc.ts:56-61 — useTouchHousehold | :56-61 | **정확** | |
| checklist.ts:85 — useStarterState(userId), 키 starter.v2:{userId} | :85 함수, :27 `keyFor = (userId) => PREFIX + (userId ?? 'anon')` | **정확** | |
| c/[token].tsx:29-48 — 토큰→박스→/container/{id} | :29 useContainerByToken, :47 router.replace | **정확** | |
| onboarding.tsx:54-97 — create/join 모드 UI | :54-97 | **정확** | |
| more.tsx:159-176 — 프로필 카드 active.name·역할 | :158-178 (1줄 차이) | **거의 정확** | |
| index.tsx:97 — place 필터 useState | :97 | **정확** | |
| add/[target].tsx:57 — add-context 캐시 키에 가구 id 없음 | 실제 :61 (`queryKey: ['add-context', target, loose]`) | **줄 4칸 차이** | 내용은 정확 |
| search/api.ts:47 — `['search','items',hh]` | :47 | **정확** | |
| strings.ko.ts:424 — `more.household: '우리 집'` | :424 | **정확** | |
| strings.ko.ts:113 — createCta: '우리 집 만들기' | :113 | **정확** | |
| strings.ko.ts:470 — inviteHint 에 '우리 집' | :470 | **정확** | |
| 20260828000800_soft_delete_hierarchy.sql:88 — 뷰에 household_id | :88 `c.household_id` | **정확** | |
| 20260828000500_rpc.sql:40 — create_household RPC | :40 | **정확** | |
| scan.tsx:74 — `/c/{token}` 으로 이동 | :74 `router.replace(\`/c/${parsed.token}\`)` | **정확** | |
| mission/api.ts:50 — queryKey 에 householdId 포함 | :50 `['mission', householdId, userId, key]` | **정확** | |

**총 24건 중 정확 20, 줄 소폭 차이 4, 내용 오류 0.** 인용 정확도 양호.

---

## Architect 반영 확인

Architect 가 요구한 7건 변경을 모두 계획에서 확인했다.

1. ContainerSummary 타입 + select 에 household_id → **step 9 반영** ✓
2. 캐시 정리를 activeId 감시 훅에서 → **step 6 반영** ✓
3. useDrainStorageGc 전 공간 → **step 8 반영** ✓
4. StarterChecklist 키에 공간 id → **step 6 반영** ✓
5. useTouchHouseholds 병렬 → **step 8 반영** ✓
6. 알림 탭 핸들러의 공간 자동 전환 → **step 9 반영** ✓
7. place 필터 useEffect → **step 6 반영** ✓

---

## RALPLAN 기준 평가

### 원칙-선택지 일관성 (Principle–Option Consistency)

**Pass, 단 예외 1건.** 원칙 4("한 벌 — 전환 시트도 더보기·찾기 탭이 같은 것을 연다")는 Option A 와 일치한다. 그러나 `src/app/(tabs)/places.tsx:56-80` 에 **이미 공간 전환 칩 행이 존재**하고, 계획은 이를 전혀 언급하지 않는다. SpaceSheet(시트)와 places.tsx 칩(인라인)이라는 두 가지 다른 UI 패턴이 공존하게 되어 원칙 4 "한 벌"에 위배된다. 아래 필수 수정 1번 참조.

### 대안 탐색 깊이 (Alternatives Depth)

**Pass.** Option B(합쳐 보기)는 캐시 키 전면 재설계·등록 목적지 모호·요청("분리")과 반대라는 구체적 이유로 기각. Option C(가구 내 계층)는 공유 범위 분리 불가·서버 변경 필수로 기각. 두 기각 모두 기술적으로 타당하다.

### 위험·검증 엄밀성 (Risk & Verification Rigor)

**Pass.** 위험표 7행이 대응과 짝을 이루고, 가장 큰 위험(다른 공간 휴면 삭제)에는 구체적 대응(step 8 + 수용 기준)이 있다. 검증 단계 4개가 typecheck/lint/jest, 기기 수동 확인, 로컬 DB 질의, 두 계정 RLS 확인을 커버한다.

### 수용 기준 구체성 (Acceptance Criteria)

**Pass (90%+).** 13개 기준 중 12개가 구체적이고 테스트 가능하다. "jest: 알림 합치기 순수 로직 테스트 통과"는 새로 작성할 테스트의 내용을 약술하므로 충분하다.

---

## 필수 수정

### 1. places.tsx 의 기존 공간 전환기를 계획에 포함시켜야 한다

`src/app/(tabs)/places.tsx:56-80` 에 이미 `households.map` 으로 칩을 그리고 `setActiveId` 를 부르는 전환기가 있다. 계획은 SpaceSheet(step 4) 를 새로 만들고 "입구 둘"(step 5: 더보기·찾기)만 말하는데, 세 번째 입구인 보관 장소 탭을 무시한다.

**해야 할 것**: 다음 중 하나를 step 4~5 에 명시해야 한다:
- (a) places.tsx 의 칩 행을 제거하고 SpaceSheet 를 여는 진입점(헤더 칩 등)으로 교체 — "한 벌" 원칙에 맞음.
- (b) places.tsx 칩을 그대로 두고 SpaceSheet 는 더보기·찾기 전용으로 한정 — 그렇다면 원칙 4 를 수정하거나 "보관 장소 탭은 칩이 더 어울리므로 예외" 라고 명시.

현재 상태로 실행하면 집행자가 places.tsx 를 건드려야 하는지 판단할 수 없다.

### 2. container/[id].tsx:43 의 useContainer select 에도 household_id 추가 필요

step 9 는 "같은 규칙을 박스 상세(`container/[id].tsx`)에도 둔다" 고 하지만, 이 화면의 로컬 `useContainer` 함수(`container/[id].tsx:36-50`)가 `container_summary` 를 조회하면서 select 에 `household_id` 가 없다:

```
.select('id, location_id, name, qr_token, photo_path, thumb_path, item_count')
```

`storage/api.ts:260` 의 `useContainerByToken` select 만 고치면 QR 경로는 되지만, `/container/{id}` 로 직접 들어오는 경로(알림·뒤로가기·다른 진입)에서 자동 전환이 깨진다. step 9 에 이 select 수정을 추가해야 한다.

### 3. add/[target].tsx 인용 줄 번호 수정

계획이 "add/[target].tsx:57" 이라 했지만 `['add-context', target, loose]` 캐시 키는 실제로 `:61` 에 있다. 집행자가 :57 을 보면 `const NEW = 'new'` 이라 혼란이 생긴다. 정확한 줄로 고쳐야 한다.

---

## 권고 (선택)

1. **ContainerSummary 타입 줄 번호** — `storage/api.ts:16-23` 으로 인용하지만 실제 :14-22. 사소하나 정확하면 좋다.

2. **AsyncStorage 키 중 TIP_KEY(`categories.tsx:34`, `'home-store.category-tip-hidden'`)와 HIDE_KEY(`mission/api.ts:28`, `'home-store.mission-hidden'`)** — 가구 id 가 없어서 한 공간에서 닫으면 다른 공간에서도 숨겨진다. 치명적이지 않지만(TIP은 일회성, HIDE는 자정 리셋), "변경 불필요" 목록에 근거를 한 줄 적어 두면 후속 리뷰에서 같은 질문이 반복되지 않는다.

3. **알림 설정 키(`reminders.ts:36`, `'stow.expiry-reminders.v1'`)** — 사용자 전역이므로 의도된 것이지만, 향후 "사무실은 알림 끄기" 같은 요청이 올 수 있다. 현재는 사용자 단위가 맞다고 명시해 두면 좋다.

4. **step 7 의 useQueries 패턴** — `useSearchIndex` 는 `useAllItems` 를 감싸는 훅이라 루프에서 부를 수 없다. `useQueries` 로 `useAllItems` 의 queryFn 을 직접 복제해야 한다는 점을 한 줄 더 써 주면 집행자가 "useSearchIndex 를 N번 부르면 되나?" 라고 헤매지 않는다.

---

## 놓친 곳 (단일 가구 전제)

계획이 식별한 5곳(알림, 휴면 터치, QR 딥링크, 수거 큐, 알림 탭)은 정확하다. 추가로 놓친 곳은 다음과 같다:

1. **places.tsx:56-80 — 이미 존재하는 공간 전환기.** "한 곳만 전제" 가 아니라 "이미 다중을 처리하는 코드" 이지만, 계획이 아예 모르고 있어서 새 SpaceSheet 와 중복된다. 필수 수정 1 에 해당.

2. **container/[id].tsx:43 — useContainer select 에 household_id 없음.** 계획의 step 9 에서 "박스 상세에도 같은 규칙" 이라 했지만, 데이터에 household_id 가 없어서 구현이 불가능하다. 필수 수정 2 에 해당.

3. 나머지 `activeId` 사용처(labels.tsx, location/[id].tsx, categories.tsx, shopping.tsx, add/[target].tsx, container/[id].tsx 의 `setPhoto`, `useLocations` 등)는 전부 활성 가구 기준으로 동작하는 것이 **올바르다** — 전환만 되면 그 공간의 데이터를 보여 주는 것이 맞다. 이 점은 계획의 판단이 정확하다.

---

## 요약

| 기준 | 판정 |
|---|---|
| 명확성 (Clarity) | 양호 — 대부분의 단계가 "어디를 어떻게" 를 구체적으로 서술. 단, places.tsx 기존 코드와의 관계가 빠져 있어 step 4-5 에서 혼란 가능 |
| 검증 가능성 (Verifiability) | 양호 — 수용 기준 13개 중 12개가 구체적으로 테스트 가능 |
| 완결성 (Completeness) | 미흡 — container/[id].tsx 의 household_id 누락이 step 9 실행을 막는다. places.tsx 기존 전환기 미언급 |
| 전체 그림 (Big Picture) | 양호 — 원칙·동인·위험표가 "왜" 를 충분히 전달. Architect 반론 대응도 기록됨 |
| 원칙-선택지 일관성 | 조건부 Pass — places.tsx 전환기 처리를 명시하면 통과 |
| 대안 탐색 깊이 | Pass |
| 위험·검증 엄밀성 | Pass |

**필수 수정 3건을 반영하면 APPROVE 로 올릴 수 있다.** 구조와 판단은 건전하다.
