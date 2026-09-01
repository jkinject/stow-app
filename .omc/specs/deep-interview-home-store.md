# Deep Interview Spec: 홈 스토어 (집안 물건 위치 관리 앱)

## Metadata
- Interview ID: home-store-2026-08-27
- Rounds: 7
- Final Ambiguity Score: 13.6%
- Type: greenfield
- Generated: 2026-08-27
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 0.40 | 0.360 |
| Constraint Clarity | 0.90 | 0.30 | 0.270 |
| Success Criteria | 0.78 | 0.30 | 0.234 |
| **Total Clarity** | | | **0.864** |
| **Ambiguity** | | | **0.136** |

---

## Goal

여러 명이 함께 사는 집에서, **물건 단위로** "무엇이 / 어디에 / 몇 개 있는지"를 등록하고 즉시 찾을 수 있게 하는 iOS/Android 앱. 보관 위치는 `장소 > 컨테이너(박스)` 2단계로 표현하고, 컨테이너에는 A4로 출력한 QR 라벨을 붙여 **열어보지 않고 스캔만으로 내용물을 확인**할 수 있다. 소모품은 수량과 임계치를 관리해 부족해지면 알림과 함께 등록된 구매 링크로 바로 이어진다. 모든 변경은 누가 언제 했는지 남는다.

**이 프로젝트의 중심축:** 등록 속도. 물건 단위 정밀도를 선택했으므로(Round 4), 대량 등록이 고통스러우면 제품이 죽는다. 개발력의 최대 지분은 "연속 등록 플로우"에 배정한다.

---

## Constraints

### 확정 (인터뷰에서 사용자가 직접 결정)
- **C1. 공개 앱**: App Store / Play Store 정식 출시 목표. 가족 전용 사설 앱이 아니다. → 회원가입, 가구(household) 생성·초대, 권한 관리, 개인정보처리방침, 스토어 심사 대응이 범위에 포함된다.
- **C2. 온라인 전용**: 쓰기(등록/수정)는 네트워크 필수. 단, 목록/검색은 로컬 캐시로 오프라인에서도 즉시 조회 가능해야 한다. 완전 오프라인-퍼스트 동기화 엔진은 만들지 않는다.
- **C3. 등록 최소 단위 = 물건(item)**: 박스 단위 요약 등록으로 타협하지 않는다. 정밀도가 생명. 대신 등록 속도에 개발력을 집중한다.
- **C4. 수량 = 정확한 정수 + 임계치 알림**: 상태 토글(충분/부족)이 아니라 실제 숫자. 임계치 이하가 되면 알림 + 구매 리스트 자동 편입.
- **C5. 장소 계층 = 2단계 고정**: `location(장소) > container(박스)`. 재귀 트리 없음. 3단계 이상 없음.
- **C6. QR 발급 = A4 라벨 시트 PDF**: 선택한 컨테이너들의 QR을 격자로 배치한 A4 PDF를 앱에서 생성해 공유/인쇄. QR 아래에 컨테이너 이름을 함께 인쇄해 육안으로도 식별 가능해야 한다.

### 기술 스택 (에이전트 판단, 사용자 위임)
- **C7. Expo + React Native**, iOS/Android 동시 지원. 카메라·QR스캔·푸시알림·PDF 인쇄가 모두 Expo 모듈로 해결되므로 bare workflow 불필요.
- **C8. Supabase**: Postgres(데이터) + Auth(인증) + Storage(사진) + Realtime(동기화) + RLS(가구 단위 데이터 격리).
- **C9. 언어/타입**: TypeScript strict.

### 비기능 제약
- **C10.** 가구 단위 멀티테넌시. 한 사용자는 여러 가구에 속할 수 있고, 데이터는 RLS로 가구 밖에서 절대 조회 불가.
- **C11.** 사진은 업로드 전 클라이언트에서 리사이즈(장변 1280px, JPEG q0.7)해 저장 비용과 업로드 시간을 억제.
- **C12.** 한글 검색은 부분 문자열 + 초성 검색을 지원해야 한다 (예: "ㄱㅈㅈ" → "건전지").

---

## Non-Goals (v1에서 명시적으로 제외)

- 완전 오프라인-퍼스트 쓰기 및 충돌 병합 엔진 (C2)
- 3단계 이상 또는 무한 깊이 장소 트리 (C5)
- 라벨 프린터(브라더·니모본 등) 직접 연동 — A4 PDF만 (C6)
- 바코드(EAN/UPC) 스캔으로 상품 DB 자동 조회
- 사진 AI 자동 물체 인식 / 이름 자동 추천
- 앱 내 결제·주문 (구매 링크는 외부 브라우저로 열기만)
- 유통기한 관리, 자산 가치 평가, 보험용 리포트
- 웹 대시보드 (모바일 앱만)
- 수익화(구독·광고) 기능

---

## Acceptance Criteria

> **⚠ 2026-08-30 범위 축소 (사용자 결정)**: AC15(목록 스와이프 차감 부분) · AC17(푸시 알림) ·
> AC19(구매 완료 버튼) · AC23(실시간 동기화)을 제외한다. 근거와 대가는
> `.omc/plans/home-store-consensus-plan.md` 의 "범위 축소" 절에 있다.
> AC15 의 물건 상세 `+/−` 는 구현되어 있다. AC19 는 트리거가 자동 해제하므로 흐름은 유지된다.


### 등록 속도 (최우선)
- [ ] AC1. **연속 등록 모드**: 컨테이너를 한 번 지정하면 그 안에 물건을 반복 추가하는 모드에 진입하고, 저장 후 자동으로 다음 물건 입력 상태로 돌아간다. 물건마다 장소를 다시 고르지 않는다.
- [ ] AC2. 연속 등록 모드에서 물건 1개 등록(사진 1장 + 이름 + 저장)의 median 소요 시간이 **10초 이하**다. 수량·카테고리·구매링크는 모두 선택 입력이며 비워도 저장된다.
- [ ] AC3. 등록 화면에서 필수 입력은 **이름 하나**뿐이다. 사진 없이도 저장된다.
- [ ] AC4. 사진 촬영 후 업로드는 백그라운드로 처리되어 UI를 블로킹하지 않는다. 업로드 실패 시 재시도 가능하며 물건 데이터는 이미 저장된 상태다.
- [ ] AC5. 카테고리는 자유 입력 + 기존 값 자동완성이다. 미리 정의된 고정 목록을 강요하지 않는다.

### 검색 속도
- [ ] AC6. 앱 실행 후 검색어 입력 → 결과 표시까지 **300ms 이하** (물건 1,000건 기준, 로컬 캐시 조회).
- [ ] AC7. 검색 결과의 각 행에 **썸네일 + 물건명 + 전체 경로(`현관 팬트리 > 3번 박스`) + 수량**이 함께 보인다. 위치를 알려고 상세 화면에 들어갈 필요가 없다.
- [ ] AC8. 한글 부분 일치와 초성 검색이 모두 동작한다 ("전지", "ㄱㅈㅈ" → "건전지").
- [ ] AC9. 네트워크가 없어도 마지막 동기화 시점의 목록을 검색·조회할 수 있고, 화면에 "오프라인 — 마지막 동기화 {시각}" 배너가 뜬다.

### QR
- [ ] AC10. 컨테이너 생성 시 고유 QR 토큰(UUID)이 자동 발급된다.
- [ ] AC11. 컨테이너를 다중 선택해 **A4 라벨 시트 PDF**를 생성할 수 있고, 각 라벨에 QR + 컨테이너명 + 상위 장소명이 인쇄된다. 시스템 공유 시트로 인쇄/저장이 가능하다.
- [ ] AC12. 앱의 스캔 버튼으로 QR을 인식하면 **2초 이내**에 해당 컨테이너의 내용물 목록 화면이 열린다.
- [ ] AC13. 스캔한 컨테이너 화면에서 곧바로 연속 등록 모드로 진입할 수 있다 (스캔 → 바로 물건 채워넣기).
- [ ] AC14. 등록되지 않은/다른 가구의 QR을 스캔하면 명확한 안내 메시지를 보여주고 크래시하지 않는다.

### 수량 · 구매
- [ ] AC15. 물건 상세에서 수량을 +/− 버튼 한 번으로 조정할 수 있고, 목록에서도 스와이프 등으로 빠르게 차감할 수 있다.
- [ ] AC16. 물건마다 임계치를 설정할 수 있다. `수량 ≤ 임계치`가 되는 순간 해당 물건이 **구매 리스트**에 자동 편입된다.
- [ ] AC17. 임계치 도달 시 가구 구성원에게 푸시 알림이 전송된다. 알림은 가구 설정에서 끌 수 있다.
- [ ] AC18. 물건에 구매 링크(URL)를 저장할 수 있고, 구매 리스트에서 탭하면 외부 브라우저/앱으로 열린다.
- [ ] AC19. 구매 리스트에서 "구매 완료" 처리 시 수량을 갱신하고 리스트에서 제거된다.

### 데이터 신뢰도 · 다중 사용자
- [ ] AC20. 모든 물건·컨테이너·장소에 `생성자 / 최종 수정자 / 최종 수정 시각`이 저장되고 상세 화면에 "홍길동님이 3시간 전 수정"처럼 표시된다.
- [ ] AC21. 물건의 변경 이력(생성·이동·수량변경·삭제)이 별도 이벤트로 append-only 저장되고, 상세 화면에서 열람 가능하다.
- [ ] AC22. 두 사용자가 같은 물건을 동시에 수정해도 크래시나 데이터 유실이 없다 (last-write-wins + 전체 이력 보존).
- [ ] AC23. 한 사용자가 물건을 추가/수정하면 다른 구성원의 화면에 **10초 이내** 반영된다 (Supabase Realtime 구독).
- [ ] AC24. 삭제는 soft delete이며 30일간 휴지통에서 복구 가능하다.

### 계정 · 가구 · 보안
- [ ] AC25. 이메일 매직링크 또는 소셜 로그인으로 가입한다. 최초 로그인 시 가구를 새로 만들거나 초대 코드로 참여한다.
- [ ] AC26. 가구 owner는 초대 코드를 발급하고 구성원을 추방할 수 있다. member는 모든 물건·장소를 읽고 쓸 수 있다.
- [ ] AC27. RLS 정책으로 자신이 속하지 않은 가구의 데이터는 API 레벨에서 조회 불가함이 테스트로 검증된다.
- [ ] AC28. 사진은 비공개 Storage 버킷에 저장되고 서명 URL로만 접근된다.

### 출시 준비
- [ ] AC29. 앱 아이콘, 스플래시, 스토어 스크린샷, 개인정보처리방침 URL이 준비되어 EAS Build로 iOS/Android 프로덕션 빌드가 성공한다.
- [ ] AC30. 데이터가 하나도 없는 최초 상태에서 온보딩이 "장소 만들기 → 박스 만들기 → 첫 물건 등록"까지 안내한다.

---

## Assumptions Exposed & Resolved

| 가정 | 도전 방식 | 결론 |
|------|-----------|------|
| "가족끼리 쓰는 앱" | 배포 범위를 명시적으로 물음 (R1) | **공개 앱**으로 확정. 멀티테넌시·인증·스토어 심사가 범위에 포함 |
| "기능이 많으면 좋은 앱" | 성공 기준을 하나로 좁히도록 압박 (R2) | 등록속도·검색속도·데이터신뢰도 **세 축 모두** 필수로 확정. 셋 다 수치 AC로 고정 |
| "인터넷은 항상 된다" | 창고·지하실 신호 문제 제기 (R3) | **온라인 전용 + 읽기 캐시**. 오프라인 쓰기 엔진은 명시적 non-goal |
| **"모든 물건을 하나씩 등록할 것이다"** | 🔥 Contrarian: 홈 인벤토리 앱은 검색이 느려서가 아니라 데이터가 썩어서 죽는다. 박스 단위면 충분하지 않은가? (R4) | **물건 단위 필수**로 재확인. 대신 "등록 속도가 이 프로젝트의 중심축"이라는 설계 원칙을 스펙에 못박음 (AC1~AC5) |
| "수량은 정확히 세야 한다" | 매번 차감하는 유지 부담 제기 (R5) | **정수 수량 + 임계치 알림** 확정. 대신 수량은 선택 입력이고 +/− 한 번으로 조정되도록 마찰 최소화 |
| "장소는 깊게 중첩된다" | ✂️ Simplifier: 예시가 2단계인데 무한 트리가 정말 필요한가? (R6) | **2단계 고정**. 재귀 모델·드릴다운 UI 제거. 깊은 위치는 장소 이름을 길게 써서 표현 |
| "QR은 앱에서 만들면 끝" | 물리적으로 어떻게 박스에 붙는지 추궁 (R7) | **A4 라벨 시트 PDF**. 라벨 프린터 연동은 non-goal |

---

## Technical Context

### 스택
| 영역 | 선택 | 이유 |
|------|------|------|
| 앱 | Expo (managed) + React Native + TypeScript | 카메라/QR/푸시/PDF가 전부 Expo 모듈. iOS+Android 동시 |
| 라우팅 | expo-router | 파일 기반, 딥링크(QR) 처리 용이 |
| 백엔드 | Supabase | Postgres + Auth + Storage + Realtime + RLS 단일 스택 |
| 서버 상태 | TanStack Query + AsyncStorage persister | AC6/AC9의 로컬 캐시 조회를 그대로 충족 |
| 카메라/스캔 | expo-camera (barcode scanning 내장) | 별도 QR 라이브러리 불필요 |
| QR 생성 | react-native-qrcode-svg | 라벨 렌더링용 |
| PDF | expo-print + expo-sharing | HTML→A4 PDF, 시스템 공유 시트 |
| 알림 | expo-notifications + Supabase Edge Function | 임계치 트리거 시 발송 |
| 이미지 | expo-image-picker + expo-image-manipulator | 촬영 후 클라이언트 리사이즈 |
| 검색 | 로컬: 메모리 인덱스(초성 변환 포함) / 서버: pg_trgm | AC6·AC8 |
| 빌드/배포 | EAS Build + EAS Update | 스토어 제출 및 OTA |

### 데이터 격리
모든 테이블에 `household_id`를 두고 RLS로 `household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())` 정책을 건다. Storage는 `household_id/` 프리픽스 + 서명 URL.

---

## Ontology (Key Entities)

| Entity | Fields | Relationships |
|--------|--------|---------------|
| `profiles` | id(=auth.users.id), display_name, avatar_url | 1:N household_members |
| `households` | id, name, created_by, created_at | 1:N members / locations / items |
| `household_members` | household_id, user_id, role(`owner`\|`member`), joined_at | N:1 households, N:1 profiles |
| `invites` | id, household_id, code, expires_at, created_by, used_by | N:1 households |
| `locations` (장소) | id, household_id, name, note, sort_order, created_by, updated_by, updated_at, deleted_at | 1:N containers, 1:N items |
| `containers` (박스) | id, household_id, location_id, name, qr_token(uuid, unique), photo_path, note, created_by, updated_by, updated_at, deleted_at | N:1 locations, 1:N items |
| `items` (물건) | id, household_id, location_id, container_id(nullable), name, category, quantity(int), threshold(int, nullable), unit, purchase_url, note, photo_path, created_by, updated_by, updated_at, deleted_at | N:1 locations, N:1 containers |
| `item_events` (이력) | id, household_id, item_id, actor_id, type(`created`\|`updated`\|`moved`\|`qty_changed`\|`deleted`\|`restored`), payload(jsonb), created_at | N:1 items, append-only |
| `shopping_list` | id, household_id, item_id, added_reason(`auto_threshold`\|`manual`), added_at, resolved_at, resolved_by | N:1 items |

**핵심 설계 노트**
- `items.container_id`는 **nullable**이다. 박스에 안 들어가고 장소에 직접 놓인 물건(냉장고 안 우유, 신발장 우산)이 실제로 많다. 이 경우 경로는 `현관 팬트리`로만 표시된다.
- `containers.qr_token`은 UUID. QR payload는 딥링크 형태(`homestore://c/{qr_token}`)로 인코딩해 카메라 앱에서 스캔해도 앱이 열리게 한다.
- `quantity`는 기본값 1, `threshold`가 NULL이면 임계치 알림 대상이 아니다 (게스트이불에 알림이 오지 않도록).
- 소프트 삭제(`deleted_at`)로 AC24를 충족하고, 모든 조회 쿼리는 `deleted_at IS NULL` 필터를 기본으로 한다.

---

## Interview Transcript

<details>
<summary>전체 Q&A (7 라운드)</summary>

### Round 1 — 배포 범위
**Q:** 이 앱의 사용 범위와 배포 방식은? (가족 전용 / 확장 여지 / 공개 앱)
**A:** 처음부터 공개 앱
**Ambiguity:** 57.5% (Goal 0.65, Constraints 0.35, Criteria 0.20)

### Round 2 — 성공 기준
**Q:** 성공을 판단할 가장 중요한 기준은? (등록속도 / 검색속도 / 데이터신뢰도 / 전부)
**A:** 세 가지 모두 — 하나라도 깨지면 안 씀
**Ambiguity:** 48% (Goal 0.70, Constraints 0.35, Criteria 0.45)

### Round 3 — 오프라인
**Q:** 신호가 없는 창고·지하실에서 앱이 어떻게 동작해야 하나?
**A:** 온라인 전용 (읽기는 로컬 캐시)
**Ambiguity:** 40.5% (Goal 0.70, Constraints 0.60, Criteria 0.45)

### Round 4 — 🔥 Contrarian: 등록 단위
**Q:** "모든 물건을 하나씩 등록한다"는 전제가 틀렸다면? 박스 단위면 충분하지 않은가?
**A:** 물건 단위 필수 — 정밀도가 생명 (등록 속도에 개발력 투입)
**Ambiguity:** 31.2% (Goal 0.82, Constraints 0.60, Criteria 0.60)

### Round 5 — 수량 관리
**Q:** 수량·재고를 어느 수준까지 관리하나?
**A:** 정확한 숫자 수량 + 임계치 알림
**Ambiguity:** 24% (Goal 0.85, Constraints 0.72, Criteria 0.68)

### Round 6 — ✂️ Simplifier: 장소 계층
**Q:** 무한 트리가 정말 필요한가? 이 계층 중 꼭 필요한 건 어디까지?
**A:** 2단계 고정 — 장소 > 컨테이너(박스)
**Ambiguity:** 18.6% (Goal 0.88, Constraints 0.82, Criteria 0.72)

### Round 7 — QR 물리 발급
**Q:** QR을 물리적으로 박스에 어떻게 붙이나?
**A:** A4 라벨 시트 PDF 출력
**Ambiguity:** 13.6% (Goal 0.90, Constraints 0.90, Criteria 0.78)

</details>

---

## 에이전트 판단으로 확정한 사항 (사용자 위임)
사용자가 명시적으로 답하지 않았으나 스펙 완결을 위해 결정한 항목. 이견이 있으면 실행 전에 뒤집을 수 있다.
1. Expo + RN, iOS/Android 동시 (Round 6에서 통보, 이의 없음)
2. Supabase를 백엔드로 (Round 3에서 통보, 이의 없음)
3. 인증은 **Google Sign-In + Sign in with Apple(iOS) + 이메일 매직링크 3종** + 초대 코드 기반 가구 참여.
   ※ 2026-08-28 정정: 초안은 "매직링크"만 적어 AC25 원문("매직링크 **또는 소셜 로그인**")과 어긋나 있었다. 소셜 로그인을 복원했다. 구글을 제공하면 Apple 심사 가이드라인 4.8에 따라 iOS에 Sign in with Apple이 반드시 함께 들어간다 (계획 §4.10).
4. 권한 모델은 owner / member 2단계 (물건 단위 소유권 없음 — 가구원은 모두 쓰기 가능)
5. 삭제는 soft delete, 30일 휴지통
6. 수익화 없음 (v1 무료)
7. 성공 기준의 구체 수치(10초 / 300ms / 2초 / 10초 반영)는 Round 2·4의 답변에서 도출
