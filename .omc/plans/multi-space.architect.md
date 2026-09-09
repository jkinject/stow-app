# 여러 공간 등록/분리 관리 — 아키텍트 리뷰

## Antithesis

Option A(활성 공간 전환기)에 대한 가장 강한 반론은 **"모든-공간" 불변성의 유지보수 부담**이다.

계획이 "활성 공간만 보는 코드 세 곳"을 식별했지만, 이 검토에서 추가로 두 곳을 더 발견했다(storage GC, 알림 탭 핸들러). 앞으로 통계, 내보내기, "모든 공간 검색" 같은 기능이 추가될 때마다 **개발자가 의식적으로 "이건 전 공간이어야 하나?"를 판단해야** 한다. 빠뜨리면 활성 공간에만 적용되고, 그 결과는 데이터 유실(휴면 삭제)부터 사용자 혼란(알림 탭이 엉뚱한 공간의 데이터를 보여줌)까지 다양하다.

Option B(합쳐서 보기 + 공간 칩 필터)는 "모든 공간"을 기본으로 만들어 이 실수 유형을 구조적으로 없앤다. 등록 목적지만 선택기로 해결하면 된다. 사용자의 "분리해서 관리" 요청도 Gmail 라벨처럼 필터로 충족 가능하다.

**그러나 이 반론은 현실적으로 기각이 옳다**: 현재 캐시 키가 전부 `householdId`로 분리되어 있고, 등록·이동·QR 등 모든 쓰기 흐름이 단일 활성 가구를 전제한다. Option B는 이 전제를 모든 화면에서 깨야 하므로 변경 범위가 몇 배로 늘고 위험도 비례한다. Option A가 기존 아키텍처를 활용하는 올바른 실용적 선택이다.

## Tradeoffs

| 긴장 | 설명 |
|---|---|
| **분리 vs 완전성** | Option A의 핵심 긴장. "한 번에 한 공간"은 깔끔하지만, 보이지 않는 공간의 상태를 능동적으로 유지해야 한다(touch, 알림, GC). 새 기능마다 이 판단을 반복해야 하며, 빠뜨리면 조용히 실패한다. Option B는 이 긴장을 없애지만 UI 복잡도와 변경 범위를 대폭 늘린다. |
| **서버 무변경 vs 효율** | touch_household를 공간 수만큼 개별 RPC로 호출한다. 2-3개면 괜찮지만, 서버에 `touch_households(uuid[])` 배치 RPC를 추가하면 N 왕복이 1로 줄어든다. 이번 "서버 변경 0" 원칙과 충돌. |

## Synthesis

Option A를 채택하되, **"활성 공간만 전제하는 코드" 목록을 `progress.txt` 또는 AGENTS.md에 관리 목록으로 유지**한다. 새 기능을 추가할 때 `_layout.tsx`에 `activeId`를 인자로 받는 훅을 넣으면, 그것이 전 공간이어야 하는지를 이 목록과 대조하여 판단한다. 구조적 방어보다 비용이 낮으면서 실수 확률을 줄인다.

## Factual corrections

1. **Step 9 — `useContainerByToken`의 `household_id` 확보는 "확인" 이 아니라 확정된 변경이다.**
   `container_summary` 뷰는 `household_id`를 이미 포함한다(`supabase/migrations/20260828000800_soft_delete_hierarchy.sql:88`). 그러나 `useContainerByToken`의 select 절(`src/features/storage/api.ts:260`)은 `'id, location_id, name, qr_token, thumb_path, item_count, updated_at'`이고 `household_id`가 빠져 있다. TypeScript 타입 `ContainerSummary`(`src/features/storage/api.ts:16-23`)에도 `household_id` 필드가 없다. **서버 변경 없이 앱 코드만 고치면 된다** — select 절에 `household_id` 추가 + 타입에 필드 추가. 계획의 "서버 변경 0" 원칙과 모순 없음.

2. **Step 6 — `setActiveId` 안에서 `queryClient.removeQueries()`를 부를 수 없다.**
   `context.tsx:44-47`의 `setActiveId`는 `setStored(id)` + `AsyncStorage.setItem()`만 하는 순수 클로저로, `queryClient`에 대한 참조가 없다. 캐시 정리를 `setActiveId` 안에 넣으려면 (a) context에 queryClient를 주입하거나, (b) 호출 지점(SpaceSheet, QR landing)에서 직접 정리하거나, (c) `activeId` 변경을 감시하는 별도 훅을 만들어야 한다. 계획은 어디서 정리할지 명확히 해야 한다.

## Missing steps / risks

### 1. `ContainerSummary` TypeScript 타입에 `household_id` 추가 필요
- **위치**: `src/features/storage/api.ts:16-23`
- **영향**: Step 9에서 `data.household_id !== activeId` 비교를 TypeScript가 허용하지 않는다.
- **조치**: 타입에 `household_id: string` 필드 추가. select 절도 함께 수정.

### 2. `useDrainStorageGc`도 활성 공간만 처리한다
- **위치**: `src/app/(tabs)/_layout.tsx:38` — `useDrainStorageGc(activeId)`
- **영향**: 비활성 공간의 `storage_gc` 큐가 비워지지 않아 고아 사진 파일이 쌓인다. 휴면 삭제만큼 치명적이진 않지만(데이터 유실 아님), 스토리지 비용이 누적된다.
- **조치**: Step 8과 마찬가지로 모든 공간의 GC를 돌리거나, 수용된 제한사항으로 문서화한다. GC는 네트워크 부하가 크므로(배치 100건 삭제) 활성 공간만 하고 나머지는 전환 시 처리하는 절충도 가능.

### 3. `StarterChecklist` 상태가 사용자별이라 새 빈 공간에서 안내가 뜨지 않는다
- **위치**: `src/features/onboarding/checklist.ts:85` — `useStarterState(session?.user.id ?? null)`, 키가 `starter.v2:{userId}`
- **영향**: 사용자가 첫 공간에서 체크리스트를 닫으면(`dismissed: true`), 두 번째 공간을 만들어도 물건 0건인 빈 화면에 체크리스트가 나타나지 않는다. "아직 등록된 물건이 없습니다"만 보인다.
- **조치**: 키를 `starter.v2:{userId}:{householdId}`로 바꿔 공간별로 안내를 보여주거나, "빈 공간"은 체크리스트 대신 다른 안내(예: "이 공간에 물건을 등록해 보세요")를 쓴다. 전자가 자연스럽다.

### 4. `useTouchHouseholds` 구현 시 `Promise.all`로 병렬 실행해야 한다
- **위치**: `src/features/storage/gc.ts:56-61` (현재 `useTouchHousehold`)
- **영향**: 순차 실행하면 공간 N개 x RTT가 앱 시작 시간에 더해진다. 2-3개면 수백ms 추가.
- **조치**: `Promise.all(ids.map(id => supabase.rpc('touch_household', { p_household: id })))` 패턴. 실패한 것만 조용히 넘기되 성공한 것까지 무시하지 않는다.

### 5. 알림 탭 핸들러도 공간 자동 전환이 필요하다
- **위치**: `src/app/_layout.tsx:142-150` — `NotificationTapHandler`
- **영향**: 소비기한 알림을 눌러 `/item/${itemId}`으로 이동하면, 그 물건이 비활성 공간의 것일 때 RLS는 통과하지만(내 가구) `activeId`와 어긋난다. 물건 상세에서 편집·이동 등이 잘못된 공간 맥락으로 동작한다.
- **조치**: Step 9의 QR 자동 전환과 같은 패턴. 물건 상세 화면(`src/app/item/[id].tsx`)이 로드한 물건의 `household_id`를 확인하고, `activeId`와 다르면 전환. 또는 `NotificationTapHandler`에서 물건의 household를 먼저 조회하고 전환 후 이동.

### 6. `_layout.tsx`에서 `households` 배열 접근이 필요하다
- **위치**: `src/app/(tabs)/_layout.tsx:31` — 현재 `const { activeId } = useHousehold()`
- **영향**: Step 7(알림 전 공간)과 Step 8(터치 전 공간) 모두 `households` 배열이 필요하다.
- **조치**: `const { activeId, households } = useHousehold()`로 확장. 이건 사소하지만 계획에 명시되지 않았다.

### 7. `place` 필터 초기화 메커니즘이 구체적이지 않다
- **위치**: `src/app/(tabs)/index.tsx:97` — `const [place, setPlace] = useState<string | null>(null)`
- **영향**: 공간 전환 후 이전 공간의 `location_id`가 `place` 상태에 남아 "0건"으로 보이거나, 존재하지 않는 장소가 선택된 상태가 된다.
- **조치**: `useEffect(() => { setPlace(null); }, [activeId])` 추가. 계획 Step 6이 언급은 했지만 구체적 구현을 생략했다.

### 8. 탈퇴 미리보기는 이미 다중 가구를 처리한다 — 변경 불필요
- **위치**: `src/features/household/deleteAccount.ts:25-37`
- **확인**: `account_deletion_preview` RPC가 서버에서 모든 가구를 세어 `doomedCount`(혼자인 집)와 `leavingCount`(남는 집)를 반환한다. 다중 공간에서도 정확히 동작한다. 변경 불필요.

### 9. 사진 큐 작업은 이미 `householdId`를 개별 운반한다 — 변경 불필요
- **위치**: `src/features/item/photoQueue.ts:56` — `householdId: string`
- **확인**: 각 사진 업로드 작업이 생성 시점에 `householdId`를 캡처한다. 공간 전환 후에도 큐에 남은 작업은 원래 공간의 ID로 업로드된다. 변경 불필요.

### 10. Realtime 구독은 코드베이스에 없다 — 검토 불필요
- **확인**: `grep -rn 'Realtime\|realtime\|subscribe.*household\|channel.*household'` 결과, `household:<id>` 패턴의 Supabase Realtime 채널 구독이 없다. 유일한 언급은 `src/features/item/queue.ts:41`의 주석뿐. 변경 불필요.

## Verdict

**SOUND WITH CHANGES** — 계획의 구조와 판단은 건전하지만, 아래 7가지를 반영해야 실행 가능하다.

1. Step 9: `ContainerSummary` 타입에 `household_id: string` 필드를 추가하고, `useContainerByToken` select 절에 `household_id`를 포함한다. "확인"이 아니라 확정 변경으로 기술한다.
2. Step 6: `setActiveId` 안에서 `queryClient`를 쓸 수 없는 문제를 해결한다 — 호출 지점에서 정리하거나, context에 queryClient 주입 방식을 명시한다.
3. `useDrainStorageGc`도 활성 공간만 처리하는 문제를 Step 8 근처에 추가한다 (전 공간 처리 또는 수용된 제한사항으로 문서화).
4. `StarterChecklist` 키를 공간별로 분리하거나, 빈 공간용 대체 안내를 계획에 추가한다.
5. `useTouchHouseholds` 구현 시 `Promise.all` 병렬 실행을 명시한다.
6. 알림 탭 핸들러(`NotificationTapHandler`)의 공간 자동 전환을 Step 9 근처에 추가한다.
7. `index.tsx`의 `place` 필터 초기화 구현(`useEffect`로 `activeId` 변경 감시)을 Step 6에 구체화한다.

## References
- `src/features/storage/api.ts:16-23` — `ContainerSummary` 타입에 `household_id` 없음
- `src/features/storage/api.ts:260` — `useContainerByToken` select 절에 `household_id` 없음
- `supabase/migrations/20260828000800_soft_delete_hierarchy.sql:88` — `container_summary` 뷰에 `household_id` 존재 확인
- `src/features/household/context.tsx:44-47` — `setActiveId`가 queryClient 참조 없는 순수 클로저
- `src/app/(tabs)/_layout.tsx:38` — `useDrainStorageGc(activeId)` 활성 공간만 처리
- `src/features/onboarding/checklist.ts:85-87` — `useStarterState` 키가 userId 기준 (householdId 미포함)
- `src/app/_layout.tsx:142-150` — `NotificationTapHandler`에 공간 전환 로직 없음
- `src/app/(tabs)/index.tsx:97` — `place` 필터가 공간 전환 시 초기화되지 않음
- `src/features/storage/gc.ts:56-61` — `useTouchHousehold` 단일 호출 구조
- `src/features/household/deleteAccount.ts:25-37` — 탈퇴 미리보기가 이미 다중 가구 처리
- `src/features/item/photoQueue.ts:56` — 사진 큐가 이미 `householdId` 개별 운반
- `src/features/mission/api.ts:50` — 미션 queryKey에 `householdId` 이미 포함
- `supabase/migrations/20260902000200_dormant_households.sql:60-87` — `touch_household` RPC (단건, 하루 1회 실제 갱신)
