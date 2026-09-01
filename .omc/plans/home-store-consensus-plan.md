# 작업 계획: 홈 스토어 (집안 물건 위치 관리 앱)

- 입력 스펙: `.omc/specs/deep-interview-home-store.md` (deep-interview 7라운드, 모호도 13.6%)
- 모드: RALPLAN-DR **deliberate** (사유: 멀티테넌트 인증/RLS + 사진 PII + 공개 스토어 출시 = 고위험 신호)
- 대상 디렉토리: `/Users/tim/Documents/projects/home-store` (greenfield, 빈 디렉토리)

---

## 1. Requirements Summary

여러 명이 함께 쓰는 가구 단위 물건 인벤토리 앱. `장소 > 컨테이너(박스) > 물건` 2단계 위치 모델, 물건 단위 등록, 정수 수량 + 임계치 알림, 컨테이너 QR(A4 라벨 PDF) 스캔으로 내용물 즉시 확인, 전 변경 이력 추적. Expo/RN/TS + Supabase, 온라인 전용(읽기는 로컬 캐시), iOS/Android 공개 출시.

**계승 대상**: 스펙의 AC1~AC30 전부, C1~C12 제약 전부, Non-Goals 9항목 전부. 이 계획은 AC를 하나도 삭제·완화하지 않는다.

---

## 2. RALPLAN-DR Summary

### 2.1 Principles (설계 원칙)

| # | 원칙 | 근거 |
|---|------|------|
| **P1** | **등록 마찰 최소화가 다른 모든 UI 결정을 이긴다.** 등록 화면에 필드를 추가하려면 AC2(10초)를 깨지 않는다는 근거를 대야 한다. | Round 4 Contrarian 결과. 물건 단위 정밀도를 선택한 대가는 등록 속도에 대한 집착이다 |
| **P2** | **데이터 격리는 클라이언트가 아니라 DB(RLS)에서 강제한다.** 앱 코드에 `where household_id = ?`가 없어도 타 가구 데이터가 새면 안 된다. | C1 공개 앱 + C10. 클라이언트 필터는 방어선이 아니다 |
| **P3** | **감사 가능성은 DB 트리거로 보장한다.** `updated_by` / `item_events`를 클라이언트가 써 넣지 않는다 — `auth.uid()`로 서버가 스탬프한다. | AC20~AC22. 클라이언트가 쓰면 위조·누락이 가능하다 |
| **P4** | **로컬 캐시는 UX 최적화이지 진실의 원천이 아니다.** 쓰기는 항상 서버를 거친다. 동기화 엔진을 만들지 않는다. | C2. Non-Goal인 오프라인-퍼스트로 미끄러지는 것을 막는 가드레일 |
| **P5** | **Non-Goals는 협상 불가.** 구현 중 "이거 있으면 좋은데"는 전부 v2 백로그로 간다. | 스펙 Non-Goals 9항목 |

### 2.2 Decision Drivers (상위 3)

| 순위 | 드라이버 | 왜 상위인가 |
|------|----------|-------------|
| **D1** | **등록 속도 (AC2: median ≤10초)** | 실패하면 데이터가 안 쌓이고, 데이터가 없으면 나머지 29개 AC가 전부 무의미해진다. 제품 생존 조건 |
| **D2** | **멀티테넌트 격리 정확성 (AC27)** | 공개 앱(C1)이므로 실패 시 타인의 집 사진과 소유물 목록이 유출된다. 되돌릴 수 없는 실패 |
| **D3** | **출시까지의 구현 비용** | 1인 개발 규모를 가정. 관리형 서비스로 해결 가능한 것을 직접 만들지 않는다 |

부차 드라이버: 검색 응답성(AC6), 다중 사용자 반영 지연(AC23), 스토어 심사 통과(AC29).

### 2.3 Viable Options

#### Option A — Expo(managed) + Supabase ✅ 채택

**접근**: Expo managed workflow + expo-router + TypeScript. 백엔드는 Supabase 단일 스택(Postgres / Auth / Storage / Realtime / Edge Functions / pg_cron).

**Pros**
- D2 직결: RLS가 Postgres 행 수준에서 격리를 강제한다. 앱 코드 버그가 격리를 깨뜨릴 수 없다 (P2)
- D3 직결: 인증·파일·실시간·크론·서버리스가 한 벤더 안에서 해결. 별도 서버 운영 없음
- 관계형 모델이 온톨로지(9개 엔티티, 다대일 관계 다수)와 정확히 일치. `장소>컨테이너>물건` 조인과 `qr_token` unique 제약이 자연스럽다
- 감사 이력을 DB 트리거로 구현 가능 (P3). 클라이언트 우회 불가
- `pg_trgm` 인덱스로 서버측 부분일치 검색 확보
- Expo가 camera/barcode/print/notifications/image-manipulator를 전부 커버 → bare workflow 불필요, EAS Build로 양 플랫폼 동시 출시

**Cons**
- Realtime + RLS 조합에 알려진 함정이 있다 (postgres_changes의 RLS 필터링 제약) → M7에서 Broadcast-from-DB 방식으로 우회 필요
- `household_members` 테이블에 자기참조 RLS를 걸면 **무한 재귀**가 발생한다 (Supabase 대표적 함정) → SECURITY DEFINER 헬퍼 함수 필수
- 벤더 종속. 단, 순수 Postgres이므로 최악의 경우 덤프 후 자체 호스팅 가능 (탈출구 존재)
- 무료 티어에서 프로젝트 일시정지 정책이 있어 출시 시 유료 전환 필요

#### Option B — Expo + Firebase (Firestore / Storage / FCM)

**Pros**
- 클라이언트 SDK의 오프라인 캐시가 성숙 → 만약 나중에 C2를 뒤집어 오프라인-퍼스트로 간다면 유리
- FCM 푸시가 Expo 대비 성숙하고 무료 한도가 넉넉

**Cons (채택하지 않은 이유)**
- **D2 열세**: Firestore Security Rules는 문서 경로 기반이라, 온톨로지의 다대일 관계(물건→컨테이너→장소→가구)를 규칙에서 강제하려면 `household_id`를 모든 문서에 비정규화하고 rules에서 `get()` 조회를 해야 한다. `get()`은 규칙 평가마다 과금·지연을 유발한다.
  *공정한 대안 인정 (Critic R-1)*: Custom Claims에 `household_ids`를 넣으면 `get()` 없이 검증할 수 있다. 다만 Custom Claims는 **1KB 제한**(가입 가능 가구 수가 사실상 제한됨)과 **토큰 갱신까지의 전파 지연**(추방된 멤버가 최대 1시간 접근 가능)이라는 자체 문제를 낳는다. RLS는 이 두 문제가 아예 없다 — 매 쿼리마다 DB가 현재 멤버십을 조회하므로 추방이 즉시 반영된다(AC26). **결론은 유지되나, 열세의 근거는 "get()이 불가피하다"가 아니라 "즉시성·확장성을 동시에 만족하는 대안이 없다"이다**
- **P3 열세**: 서버측 트리거가 없으므로 감사 이력을 보장하려면 Cloud Functions를 추가로 붙여야 한다. Firestore는 클라이언트가 직접 문서를 쓰는 모델이라, "이력 없이 쓰는 경로"를 규칙만으로 완전히 막기 어렵다
- **검색 열세**: Firestore는 부분일치 검색을 **네이티브로 지원하지 않는다**. 워크어라운드는 존재한다 — n-gram/초성 배열을 문서에 비정규화해 `array-contains`로 조회하거나, Algolia 등 외부 검색 서비스를 붙이는 것. 전자는 쓰기 비용과 문서 크기가 늘고, 후자는 비용·운영 항목이 추가된다. 어느 쪽이든 `pg_trgm` 인덱스 한 줄보다 비싸다 → D3 열세
- 관계형 집계(`이 장소의 모든 컨테이너의 모든 물건 수량 합`)가 어색하고 비정규화 카운터가 필요하다
- **결론**: D2·P3에서 열세이고 D3도 검색 때문에 올라간다. 결정적으로, C2(온라인 전용)를 확정한 이상 Firebase의 최대 강점인 성숙한 오프라인 캐시의 가치가 소멸했다

#### Option C — Expo + 자체 Node(NestJS/Hono) + 자체 Postgres

**Pros**
- 완전한 제어. 벤더 종속 없음
- 감사·권한 로직을 애플리케이션 계층에 자유롭게 배치

**Cons (채택하지 않은 이유)**
- **D3 치명적**: 인증(토큰 발급·갱신·소셜), 파일 업로드/서명 URL, 실시간 구독, 푸시 발송, 크론, 배포·모니터링을 전부 직접 만들어야 한다. 스펙 범위(30 AC)에 이만큼의 인프라를 얹으면 출시가 몇 배로 늦어진다
- **D2 열세**: 격리가 애플리케이션 코드의 정확성에 의존한다. 라우트 하나에서 `household_id` 필터를 빠뜨리면 유출된다 (P2 위반)
- **결론**: 이 프로젝트에 자체 백엔드가 사줄 유일한 가치는 벤더 독립성인데, Supabase가 순수 Postgres이므로 그 가치가 이미 상당 부분 확보되어 있다

#### 채택 근거 요약
D1(등록 속도)은 세 옵션 모두 클라이언트 문제라 차이가 없다. 결정은 **D2와 D3**에서 갈렸다. A는 D2를 DB 계층에서 선언적으로 해결하면서 동시에 D3가 가장 낮다. B는 D2에서 열세이고 검색 때문에 D3도 올라간다. C는 D2·D3 모두 열세다. → **Option A 채택.**

### 2.4 Antithesis & Tension (Architect 검토 흡수)

#### 반론 — "DB가 모든 것을 한다" 철학이 6개월 뒤 개발 속도의 병목이 된다
P2·P3를 따르면 `items` 한 테이블에 트리거 5개(`t10`~`t50`)와 매 행 `is_household_member()` 호출이 걸린다. 대가는 **디버깅 불투명성**이다. 트리거는 이름순으로 실행되고 앞 트리거가 행을 변형하면 뒤 트리거는 변형된 행을 본다 — `t10_stamp_actor`가 `updated_by`/`updated_at`을 덮어쓴 뒤 `t30_log_item_event`가 diff를 계산하면 감사 로그에 매번 노이즈가 낀다. 자체 백엔드(Option C)였다면 이 로직이 애플리케이션 함수로 존재해 단위 테스트에서 개별 격리 검증이 가능했을 것이다. 트리거는 통합 테스트로만 검증되고, 실패하면 plpgsql 스택 트레이스가 전부다.

**그럼에도 채택안을 유지하는 이유**: Option C의 D2 열세(격리가 코드 정확성에 의존)와 D3 열세(인프라 자체 구축)가 이 디버깅 비용보다 크다. 단 비용을 과소평가하지 않기 위해 §4.4의 번호 접두사 규약, diff에서 감사 필드 제외, 트리거 순서 회귀 테스트(M1)를 계획에 못박았다.

#### 긴장 — P1(등록 마찰 최소화) ↔ P4(서버가 진실의 원천)

낙관적 삽입은 사용자에게 "저장 완료"를 즉시 보여준다. 그런데 2초 뒤 서버 INSERT가 실패하면(트리거 예외, `t20` 거부, 타임아웃) 사용자는 이미 다음 물건을 입력 중이다.

- **P1을 지키면**: 에러를 조용히 표시하고 입력 흐름을 방해하지 않는다 → 사용자가 유실을 못 알아챈다
- **P4를 지키면**: 실패 항목을 캐시에서 제거한다 → 목록에서 항목이 사라져 신뢰가 깨진다 (AC22가 지키려는 바로 그 신뢰)

**해소 (Architect S3)**: 실패 항목을 **삭제하지 않고 "동기화 실패" 배지 + 재시도 큐**에 넣는다. 사진 업로드 실패(AC4/R5)와 정확히 같은 패턴이라 UX가 하나로 통일된다. P1(흐름 불방해)과 P4(최종 진실은 서버)를 동시에 만족한다.

**단, 이 큐가 오프라인 쓰기 큐로 미끄러지면 Non-Goal(C2) 위반이다.** 가드레일:
- 큐 상한 **10건**. 초과 시 등록 화면을 막고 "연결을 확인하세요"를 표시한다
- 네트워크 복귀 시 즉시 플러시. 백오프 재시도는 하되 **앱 종료 후에는 큐를 유지하지 않는다** (사진 업로드 큐와 다른 점 — 사진은 이미 서버에 행이 있고, 여기는 행 자체가 없다)
- 이 큐는 "잠깐의 네트워크 흔들림 흡수"까지만 한다. 오프라인 등록 기능이 아니다

---

## 3. Pre-mortem (3 시나리오)

프로젝트가 실패했다고 가정하고, 왜 실패했는지 역산한다.

### 시나리오 1 — RLS 재귀/누락으로 앱이 죽거나 데이터가 샜다
**어떻게 발생하나**: `household_members`에 "내가 속한 가구의 멤버만 조회 가능" RLS를 걸었는데, 그 정책이 다시 `household_members`를 조회하면서 **무한 재귀(42P17)**가 난다. 급한 마음에 `USING (true)`로 완화하거나 RLS를 끄고 클라이언트 필터로 때운다 → 타 가구 데이터 노출.
또는 나중에 추가한 테이블(`shopping_list`, `item_events`, `device_push_tokens`)에 RLS 활성화를 깜빡한다.

**징후**: 개발 중 `infinite recursion detected in policy` 오류. 또는 새 테이블 추가 후 아무 정책 없이 동작이 잘 되는 것처럼 보임(= RLS 미활성).

**선제 대응 (계획에 반영)**
- M1에서 `public.is_household_member(hid uuid)`를 **SECURITY DEFINER + STABLE**로 정의하고, 모든 테이블의 RLS는 이 함수만 호출한다. `household_members` 자신의 정책도 이 함수를 쓰되 함수 내부는 RLS를 우회하므로 재귀가 발생하지 않는다
- M1 완료 조건에 **"RLS 미활성 테이블 0개"를 SQL로 검증**하는 테스트를 넣는다: `select tablename from pg_tables where schemaname='public' and rowsecurity=false` 가 빈 결과여야 한다
- M1에 **크로스 테넌트 침투 테스트**를 넣는다: 가구 A/B와 사용자 a/b를 만들고, a의 JWT로 B의 모든 테이블·Storage 경로를 조회해 전부 0행/403임을 자동 검증 (AC27)
- 새 테이블을 추가하는 모든 마이그레이션은 같은 파일 안에서 `enable row level security` + 정책을 함께 선언한다 (리뷰 체크리스트 항목)

### 시나리오 2 — 등록이 실제로 20초 걸려서 아무도 안 쓴다
**어떻게 발생하나**: 등록 폼에 이름·카테고리·수량·임계치·구매링크·메모·사진을 다 넣는다. 사진 업로드가 끝날 때까지 저장 버튼이 스피너를 돈다. 저장 후 목록 화면으로 튕겨 나가서 다음 물건을 넣으려면 컨테이너를 다시 찾아 들어가야 한다. 20개 넣고 그만둔다.

**징후**: 개발자 본인이 테스트 데이터를 손으로 넣기 싫어함. 시드 스크립트로 데이터를 만들기 시작함. ← **이게 가장 강한 조기 경보다.**

**선제 대응 (계획에 반영)**
- **M4를 프로젝트에서 가장 큰 마일스톤으로 배정**하고, M4 완료 전에는 M7~M9를 시작하지 않는다 (P1)
- 등록 화면의 **필수 필드는 이름 하나**로 고정하고, 나머지는 접힌 "추가 정보" 영역에 둔다 (AC3)
- 저장은 **낙관적 삽입**으로 즉시 완료 처리하고, 사진 업로드는 백그라운드 큐로 분리한다. 업로드 실패해도 물건 레코드는 이미 살아 있다 (AC4)
- 저장 직후 **폼이 초기화되고 같은 컨테이너 컨텍스트에 머문다**. 장소를 다시 고르지 않는다 (AC1)
- **AC2를 자동 계측한다**: **§5 M4에 정의된 사이클 타임**(1번째: 첫 입력 행동~폼 리셋 / 2번째 이후: 폼 리셋~폼 리셋)을 개발 빌드에서 로깅하고, M4 완료 판정에 "실기기에서 연속 20개 등록, median ≤10초" 실측 결과를 첨부한다. 눈대중으로 통과시키지 않는다. **측정 구간의 권위 있는 정의는 M4에 있다**
- 시드 스크립트는 만들되, **M4 수용 판정에는 반드시 손으로 넣은 20개를 쓴다**

### 시나리오 3 — Realtime + 낙관적 업데이트가 충돌해 화면이 흔들리고 아무도 데이터를 안 믿는다
**어떻게 발생하나**: 낙관적으로 추가한 물건이 화면에 뜨고, 서버 응답으로 한 번 더 뜨고, Realtime 이벤트로 또 한 번 떠서 중복 표시된다. 또는 두 사용자가 같은 물건의 서로 다른 필드를 고쳤는데 전체 객체를 PUT 해서 상대의 수정이 사라진다. "앱이 이상하다"는 인식이 박히면 AC20~24를 아무리 잘 만들어도 신뢰가 회복되지 않는다.

**징후**: 목록에서 항목이 깜빡이거나 순서가 튄다. 두 기기를 나란히 놓고 테스트했을 때 수량이 왔다 갔다 한다.

**선제 대응 (계획에 반영)**
- 낙관적 삽입 시 **클라이언트가 UUID를 생성**해서 서버에 함께 보낸다. 서버 응답·Realtime 이벤트 모두 같은 id를 가지므로 캐시 병합 시 중복이 원천적으로 불가능하다
- 수정은 **항상 변경된 필드만 부분 업데이트(PATCH)**한다. 전체 객체를 덮어쓰지 않는다 → 서로 다른 필드를 고친 두 사용자가 충돌하지 않는다 (AC22)
- 수량 변경은 클라이언트가 계산한 절대값이 아니라 **`adjust_item_quantity(item_id, delta)` RPC로 서버에서 원자적으로 증감**한다. 동시에 두 명이 −1 하면 −2가 되어야지 −1이 되면 안 된다
- Realtime 이벤트는 캐시를 **직접 덮어쓰지 않고 무효화(invalidate)만** 트리거한다. 진실의 원천은 항상 서버 재조회다 (P4)
- M7 완료 조건에 **2기기 동시 조작 시나리오 테스트**를 넣는다

---

## 4. Architecture

### 4.1 스택 확정

| 영역 | 선택 | 버전/비고 |
|------|------|-----------|
| 앱 | Expo SDK (managed) + React Native + TypeScript strict | `npx create-expo-app --template` |
| 라우팅 | expo-router (file-based) | QR 딥링크 처리에 유리 |
| 서버 상태 | TanStack Query + AsyncStorage persister | AC6/AC9 로컬 캐시 |
| 클라이언트 상태 | Zustand (등록 세션, 업로드 큐) | 최소한으로만 |
| 백엔드 | Supabase (Postgres 15+/Auth/Storage/Realtime/Edge Functions/pg_cron) | |
| 카메라·스캔 | `expo-camera` (barcode scanning 내장) | 별도 QR 스캐너 라이브러리 불필요 |
| QR 생성 | `qrcode` (npm, SVG 문자열 출력) | expo-print HTML에 인라인 SVG로 직접 삽입 |
| PDF | `expo-print` + `expo-sharing` | HTML → A4 PDF → 시스템 공유 시트 |
| 이미지 | `expo-image-picker` + `expo-image-manipulator` | 촬영 후 **두 장** 생성: 썸네일 320px q0.6(≈15KB) + 원본 1280px q0.7(≈200KB). §4.9 (C11) |
| 이미지 표시 | `expo-image` | 디스크 캐시 내장. **목록은 항상 `thumb_path`, 상세만 `photo_path`** (§4.9) |
| 푸시 | `expo-notifications` + Expo Push API | Edge Function이 발송 |
| 빌드/배포 | EAS Build + EAS Update | |
| 테스트 | Jest + React Native Testing Library / Playwright(선택) / SQL 테스트 스크립트 | §7 참조 |

### 4.2 데이터 모델

스펙 온톨로지 9개 엔티티 + **스펙 보완 1개**.

> **⚠️ 스펙 갭 (계획 단계에서 발견)**: 스펙 온톨로지에 **푸시 토큰 저장 테이블이 없다.** AC17(임계치 푸시 알림)을 구현할 수 없다. `device_push_tokens`를 추가한다. 이것은 스펙 확장이며 AC 변경이 아니다.

```sql
-- 확장
create extension if not exists pg_trgm;
create extension if not exists pg_cron;

-- 1) profiles
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- 2) households
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

-- 3) household_members
create table household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- 4) invites
create table invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null,
  created_by uuid not null references profiles(id),
  used_by uuid references profiles(id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- 5) locations (장소)
create table locations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  note text,
  sort_order int not null default 0,
  created_by uuid not null references profiles(id),
  updated_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 6) containers (박스)
create table containers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  location_id uuid not null references locations(id) on delete restrict,
  name text not null,
  qr_token uuid not null default gen_random_uuid(),   -- unique 는 §4.5 의 명시적 인덱스로 건다 (중복 방지, Critic O-3)
  photo_path text,
  thumb_path text,                                    -- 320px 썸네일 (§4.9)
  note text,
  created_by uuid not null references profiles(id),
  updated_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 7) items (물건)  ← container_id nullable (스펙 설계 노트)
create table items (
  id uuid primary key,                       -- ⚠ default 없음: 클라이언트가 UUID 생성 (Pre-mortem #3)
  household_id uuid not null references households(id) on delete cascade,
  location_id uuid not null references locations(id) on delete restrict,
  container_id uuid references containers(id) on delete set null,
  name text not null check (length(btrim(name)) > 0),
  category text,
  quantity int not null default 1 check (quantity >= 0),
  threshold int check (threshold >= 0),      -- null = 알림 대상 아님
  unit text,
  purchase_url text,
  note text,
  photo_path text,
  thumb_path text,                                    -- 320px 썸네일 (§4.9). 목록은 항상 이것만 읽는다
  created_by uuid not null references profiles(id),
  updated_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- 무결성: 물건의 컨테이너는 반드시 같은 장소에 있어야 한다
  constraint items_container_location_consistent check (true) -- 트리거로 강제 (아래)
);

-- 8) item_events (이력, append-only)
create table item_events (
  id bigserial primary key,
  household_id uuid not null references households(id) on delete cascade,
  item_id uuid not null,                     -- ⚠ FK 없음: 물건 하드삭제 후에도 이력 보존
  actor_id uuid references profiles(id),
  type text not null check (type in ('created','updated','moved','qty_changed','deleted','restored')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 9) shopping_list
create table shopping_list (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  added_reason text not null check (added_reason in ('auto_threshold','manual')),
  added_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id)
);
-- 미해결 항목은 물건당 1건만
create unique index shopping_list_one_open_per_item
  on shopping_list(item_id) where resolved_at is null;

-- 10) device_push_tokens  ← 스펙 보완
create table device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  expo_token text not null unique,
  platform text not null check (platform in ('ios','android')),
  updated_at timestamptz not null default now()
);

-- 가구 알림 설정 (AC17 "알림을 끌 수 있다")
alter table household_members add column notify_threshold boolean not null default true;

-- 11) maintenance_log  ← pg_cron 안전장치용 (Architect S4)
create table maintenance_log (
  id bigserial primary key,
  job text not null,
  candidate_count int not null,
  deleted_count int,
  aborted_reason text,
  ran_at timestamptz not null default now()
);
```

### 4.2.1 서버 RPC (P3 일관성 — 클라이언트가 감사 필드를 쓰지 못하게 한다)

| RPC | 역할 | 근거 |
|-----|------|------|
| `adjust_item_quantity(item_id uuid, delta int)` | `update items set quantity = quantity + delta` — 행 잠금으로 원자적. 클라이언트 계산 절대값을 받지 않는다 | AC15, AC22 |
| `create_household(name text)` | **SECURITY DEFINER**. `households` INSERT + `household_members`(role='owner') INSERT를 한 트랜잭션으로. RLS만으로는 "가구를 만드는 순간엔 아직 멤버가 아니다"라는 닭과 달걀을 풀 수 없다 | AC25 |
| `accept_invite(code text)` | **SECURITY DEFINER** (참여자는 아직 멤버가 아니라 `iv_select`로 코드를 조회할 수 없다). | **단일 트랜잭션**으로 ① 코드 유효성·만료 검사 ② `household_members` 삽입 ③ `invites.used_by = auth.uid(), used_at = now()` 소비. 클라이언트가 `used_by`를 쓸 수 없다 | AC25, P3 |
| `resolve_shopping_item(id uuid, new_quantity int)` | **단일 트랜잭션**으로 ① 수량 갱신 ② `resolved_at = now(), resolved_by = auth.uid()`. 클라이언트가 `resolved_by`를 위조할 수 없다 | AC19, P3 |
| `sign_item_photos(paths text[])` | 최대 50개 경로의 Storage 서명 URL을 **배치 발급**. 목록 스크롤마다 개별 요청하지 않는다 | AC7, R13 |

> **P3 일관성 보정 (Architect #4)**: 초안은 `shopping_list.resolved_by`와 `invites.used_by`를 클라이언트가 직접 UPDATE하도록 남겨두어, "감사 필드는 서버가 스탬프한다"는 P3를 스스로 위반하고 있었다. 위 두 RPC로 해소한다. 두 테이블 모두 클라이언트 직접 UPDATE 정책을 두지 않는다.

### 4.3 RLS 설계 (Pre-mortem #1 대응)

```sql
-- ★ 재귀 차단의 핵심: SECURITY DEFINER 는 내부 조회에서 RLS 를 우회한다
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

create or replace function public.is_household_owner(hid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid() and role = 'owner'
  );
$$;

-- 모든 테이블 RLS 활성
alter table profiles            enable row level security;
alter table households          enable row level security;
alter table household_members   enable row level security;
alter table invites             enable row level security;
alter table locations           enable row level security;
alter table containers          enable row level security;
alter table items               enable row level security;
alter table item_events         enable row level security;
alter table shopping_list       enable row level security;
alter table device_push_tokens  enable row level security;
alter table maintenance_log     enable row level security;  -- 정책을 두지 않는다 = 클라이언트 전면 차단.
                                                            -- pg_cron 은 postgres 역할이라 RLS 를 우회하므로 영향 없음 (Critic O-2)

> **⚠ RLS 활성 + 정책 없음 = 전면 거부다.** "공통 패턴을 따른다"는 서술로는 테이블이 열리지 않는다. 아래에 **11개 테이블 전부의 정책을 빠짐없이 명시**한다. 정책을 의도적으로 두지 않는 곳은 그 의도를 주석으로 남긴다.

```sql
-- 동일 가구 소속 여부 (profiles 조회용). SECURITY DEFINER 로 재귀 차단
create or replace function public.shares_household_with(uid uuid)
returns boolean language sql security definer stable set search_path = public as $fn$
  select exists (
    select 1 from household_members a
    join household_members b on a.household_id = b.household_id
    where a.user_id = auth.uid() and b.user_id = uid
  );
$fn$;

-- ── profiles ──────────────────────────────────────────────
-- 본인 + 같은 가구 구성원의 프로필을 읽을 수 있어야 AC20 의 "홍길동님이 수정"을 렌더할 수 있다
create policy pr_select on profiles for select
  using (id = auth.uid() or shares_household_with(id));
create policy pr_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
-- insert 는 신규 가입 트리거(auth.users → profiles)가 처리. delete 정책 없음(계정 삭제는 M9 의 익명화 경로)

-- ── households ────────────────────────────────────────────
-- ⚠ 컬럼명이 household_id 가 아니라 id 다
create policy ho_select on households for select
  using (is_household_member(id));
create policy ho_update on households for update
  using (is_household_owner(id)) with check (is_household_owner(id));
-- ⚠ INSERT 정책 없음 — 닭과 달걀 문제: 가구를 만드는 순간엔 아직 멤버가 아니라
--    어떤 with check 도 통과할 수 없다. 가구 생성은 create_household(name) RPC
--    (SECURITY DEFINER) 가 households INSERT + household_members(owner) INSERT 를
--    한 트랜잭션으로 처리한다. §4.2.1 참조
-- delete 정책 없음 — 가구 삭제는 M9 의 계정 삭제 경로에서만

-- ── household_members ─────────────────────────────────────
-- is_household_member() 는 SECURITY DEFINER 라 RLS 를 우회 → 자기참조 재귀 없음
create policy hm_select on household_members for select
  using (is_household_member(household_id));
create policy hm_update on household_members for update      -- 알림 on/off (AC17)
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy hm_delete on household_members for delete
  using (is_household_owner(household_id) or user_id = auth.uid());  -- owner 추방 or 본인 탈퇴
-- ⚠ INSERT 정책 없음 — 멤버 추가는 create_household / accept_invite RPC 만 (P3)

-- ── invites ───────────────────────────────────────────────
create policy iv_select on invites for select
  using (is_household_member(household_id));   -- 발급한 가구의 멤버만 목록 조회
create policy iv_insert on invites for insert
  with check (is_household_owner(household_id));
create policy iv_delete on invites for delete
  using (is_household_owner(household_id));    -- 코드 폐기
-- ⚠ UPDATE 정책 없음 — used_by/used_at 은 accept_invite RPC 만 쓴다 (P3)
-- ⚠ 참여자는 아직 멤버가 아니라 iv_select 로 코드를 조회할 수 없다.
--    accept_invite 가 SECURITY DEFINER 여야 하는 이유다

-- ── locations / containers / items : 가구 스코프 3종 공통 ──
-- (아래 블록을 locations, containers, items 각각에 대해 동일하게 생성한다)
create policy loc_select on locations for select using (is_household_member(household_id));
create policy loc_insert on locations for insert with check (is_household_member(household_id));
create policy loc_update on locations for update
  using (is_household_member(household_id)) with check (is_household_member(household_id));
-- ⚠ delete 정책 없음 = 하드 DELETE 불가. soft delete 만 허용 (AC24)

create policy con_select on containers for select using (is_household_member(household_id));
create policy con_insert on containers for insert with check (is_household_member(household_id));
create policy con_update on containers for update
  using (is_household_member(household_id)) with check (is_household_member(household_id));
-- ⚠ delete 정책 없음 (AC24)

create policy itm_select on items for select using (is_household_member(household_id));
create policy itm_insert on items for insert with check (is_household_member(household_id));
create policy itm_update on items for update
  using (is_household_member(household_id)) with check (is_household_member(household_id));
-- ⚠ delete 정책 없음 (AC24)

-- ── item_events ───────────────────────────────────────────
create policy ev_select on item_events for select
  using (is_household_member(household_id));
-- ⚠ insert/update/delete 정책 없음 = 클라이언트가 이력을 쓰거나 고칠 수 없다.
--    이력은 t30_log_item_event 트리거만 쓴다 (P3)

-- ── shopping_list ─────────────────────────────────────────
create policy sl_select on shopping_list for select
  using (is_household_member(household_id));
create policy sl_insert on shopping_list for insert
  with check (is_household_member(household_id) and added_reason = 'manual');
  -- 수동 추가만 허용. auto_threshold 는 t40_sync_shopping_list 트리거만 삽입한다
create policy sl_delete on shopping_list for delete
  using (is_household_member(household_id) and added_reason = 'manual');
  -- 수동 항목만 직접 삭제 가능
-- ⚠ UPDATE 정책 없음 — resolved_at/resolved_by 는 resolve_shopping_item RPC 만 쓴다 (P3)

-- ── device_push_tokens ────────────────────────────────────
create policy dpt_all on device_push_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── maintenance_log ───────────────────────────────────────
-- ⚠ 정책 없음 = 클라이언트 전면 차단. pg_cron 은 postgres 역할이라 RLS 를 우회한다
```

**RLS 정책 커버리지 요약 (11/11)**

| 테이블 | SELECT | INSERT | UPDATE | DELETE | 비고 |
|--------|:------:|:------:|:------:|:------:|------|
| `profiles` | ✅ 본인+동일가구 | ⛔ 가입 트리거 | ✅ 본인 | ⛔ M9 익명화 | AC20 표시명 조회 |
| `households` | ✅ 멤버 | ⛔ **RPC** | ✅ owner | ⛔ M9 | 컬럼이 `id` |
| `household_members` | ✅ 멤버 | ⛔ **RPC** | ✅ 본인(알림설정) | ✅ owner/본인 | 재귀 없음 |
| `invites` | ✅ 멤버 | ✅ owner | ⛔ **RPC** | ✅ owner | 참여자는 RPC 경유 |
| `locations` | ✅ | ✅ | ✅ | ⛔ soft only | AC24 |
| `containers` | ✅ | ✅ | ✅ | ⛔ soft only | AC24 |
| `items` | ✅ | ✅ | ✅ | ⛔ soft only | AC24 |
| `item_events` | ✅ | ⛔ 트리거 | ⛔ | ⛔ | append-only, P3 |
| `shopping_list` | ✅ | ✅ manual만 | ⛔ **RPC** | ✅ manual만 | P3 |
| `device_push_tokens` | ✅ 본인 | ✅ 본인 | ✅ 본인 | ✅ 본인 | |
| `maintenance_log` | ⛔ | ⛔ | ⛔ | ⛔ | cron 전용 |

⛔ = 정책 없음(전면 거부). **RPC** = SECURITY DEFINER 함수로만 접근.

### 4.9 이미지 해상도 전략

> **⚠ 원본 한 장만 저장하면 목록 스크롤이 전송량을 태운다.** 초안은 1280px 한 장만 올리고 목록에서 그 파일을 작게 표시했다. 1280px q0.7은 약 200KB, 목록 행에 실제로 필요한 것은 200px 남짓 = 약 15KB — **13배 낭비**다. E14의 "3,000건 목록 끝까지 스크롤"은 그대로 두면 **한 번에 600MB 전송**이 된다.

**촬영 시점에 두 장을 만든다.** 서버 이미지 변환 기능은 쓰지 않는다 — 유료 부가 기능이고 원본 수만큼 과금된다.

| 용도 | 크기 | 품질 | 실측 | 컬럼 | 쓰이는 곳 |
|------|------|------|------|------|-----------|
| 썸네일 | 장변 **320px** | q0.6 | **12KB** | `thumb_path` | 검색 결과, 목록, 컨테이너 내용물 |
| 원본 | 장변 **1280px** | q0.7 | **121KB** | `photo_path` | 물건·컨테이너 **상세 화면에서만** |

> **실측 정정 (2026-08-30, M4 구현 중)**: 위 값은 추정이 아니라 실기기에서 잰 것이다.
> 초안의 15KB/200KB(합계 215KB)는 추정이었고, 실제로는 **합계 133KB** 다.
>
> 그 과정에서 버그를 하나 잡았다. `resize({ width })` 는 폭 기준이라 방향 판정이 필요한데,
> **카메라가 보고하는 width/height 는 센서 기준(가로)** 이고 저장되는 이미지는 회전이
> 반영된 세로다. 그 값을 믿었더니 결과가 1280×1706 이 되어 **장변이 1280 이 아니라 1706**,
> 픽셀이 의도보다 33% 많았다(합계 344KB). 한 번 렌더해 실제 치수를 보고 긴 쪽에 값을 주자
> 같은 품질로 344KB → 133KB 가 됐다. **화질을 깎을 필요가 없었고 픽셀 수가 문제였다.**
>
> 무료 티어 1GB 기준 물건 수: 215KB 가정일 때 4,650건 → **실측 133KB 기준 약 7,800건**.

- 업로드 큐는 **썸네일을 먼저** 올린다. 목록에 빨리 뜨고, 원본 업로드가 실패해도 목록은 정상 동작한다
- `sign_item_photos`는 목록용으로 `thumb_path`만, 상세용으로 `photo_path`만 서명한다. 한 화면에서 두 종류를 섞어 발급하지 않는다
- 동기화 페이로드에는 `thumb_path`만 담는다. `photo_path`는 상세 진입 시에만 필요하다
- **이 전략은 벤더 선택과 무관하다.** Supabase Storage든 R2든 목록에 원본을 내려보내면 안 된다

**Storage (AC28)**: 비공개 버킷 `item-photos`. 경로 규약 `{household_id}/{item_id}/{uuid}.jpg`(원본) / `{household_id}/{item_id}/{uuid}_t.jpg`(썸네일). Storage RLS 정책은 경로 첫 세그먼트를 가구 멤버십으로 검증:
```sql
create policy photos_rw on storage.objects for all
  using (bucket_id = 'item-photos'
         and is_household_member(((storage.foldername(name))[1])::uuid));
```
읽기는 서명 URL(TTL 1시간)로만 발급.

### 4.4 트리거 (P3: 감사·무결성을 DB에서 강제)

> **⚠ 트리거 실행 순서는 이름 알파벳 순이다.** PostgreSQL은 동일 timing/event 트리거를 이름순으로 실행하고, 앞 트리거가 행을 변형하면 뒤 트리거는 변형된 행을 본다. 따라서 **모든 트리거 이름에 번호 접두사를 강제**한다. (Architect S1)

| 트리거 | 대상 | 역할 | 충족 AC |
|--------|------|------|---------|
| `t05_rate_limit` | items **BEFORE** INSERT | R15의 남용 방지를 강제한다. ① 가구 물건 수 5,000건 초과 시 경고 플래그, 10,000건 초과 시 예외 ② 당일 `item_events`의 `created` 건수가 사용자당 500건 초과 시 예외. **`t10`보다 먼저 돌아야 무의미한 스탬프 작업을 피한다** (Critic F-5) | R15 |
| `t10_stamp_actor` | locations/containers/items **BEFORE** INSERT/UPDATE | `updated_by = auth.uid()`, `updated_at = now()` 강제 스탬프. 클라이언트 값 무시 | AC20 |
| `t20_enforce_container_location` | items **BEFORE** INSERT/UPDATE | `container_id`가 있으면 그 컨테이너의 `location_id`와 일치하도록 강제(불일치 시 자동 정렬) | 데이터 무결성 |
| `t30_log_item_event` | items **AFTER** INSERT/UPDATE | 변경 필드 diff를 `item_events`에 append. `deleted_at` 전이 시 `deleted`/`restored`, `quantity` 변경 시 `qty_changed`, `container_id`/`location_id` 변경 시 `moved`. **diff 계산 시 `updated_by`/`updated_at`은 제외**한다 (t10이 항상 바꾸므로 노이즈) | AC21 |
| `t40_sync_shopping_list` | items **AFTER** UPDATE | ① `threshold is not null and quantity <= threshold`로 **전이**할 때만 `shopping_list` 삽입(`auto_threshold`). ② 임계치 초과로 복귀 시 미해결 자동항목 해제. ③ **`deleted_at`이 설정되면(soft delete) 해당 물건의 미해결 자동항목을 해제**한다 — 30일 후 하드삭제 시 쇼핑리스트가 조용히 CASCADE로 사라지는 경합을 차단 (Architect #10) | AC16 |
| `t50_broadcast` | locations/containers/items **AFTER** INSERT/UPDATE | `realtime.send()`로 `household:{id}` 토픽에 경량 이벤트 발행. **본문 전체를 `BEGIN ... EXCEPTION WHEN OTHERS THEN NULL; END;`로 감싼다** | AC23 |
| `notify_threshold` | shopping_list AFTER INSERT (`auto_threshold`) | Database Webhook → Edge Function `send-threshold-push` | AC17 |

> **⚠ `t50_broadcast`의 예외 보호는 선택이 아니라 필수다.** `realtime.send()`는 내부적으로 `realtime.messages`에 INSERT하므로, 이 INSERT가 실패하면 **원 트랜잭션 전체가 롤백된다.** 즉 Realtime이라는 편의 기능의 장애가 핵심 CRUD를 차단할 수 있다. Realtime은 정합성 요소가 아니라 UX 최적화이므로, 실패는 삼키고 클라이언트의 주기적 재조회에 맡긴다. (Architect S2 / R16)

**pg_cron (AC24)**: 매일 1회 `deleted_at < now() - interval '30 days'` 인 items/containers/locations를 하드 삭제하고 연관 Storage 객체를 정리한다.

> **⚠ pg_cron 작업은 `postgres` 역할로 실행되어 RLS를 완전히 우회한다.** WHERE 절 버그가 RLS 보호 없이 전 가구의 데이터를 지울 수 있다. **안전장치를 필수로 건다** (Architect S4):
> 1. 삭제 전 대상 건수를 세고, **상한(100건)을 초과하면 실행을 중단**하고 알림 테이블에 기록한다. 정상 운영에서 하루 100건 이상 만료되는 일은 없다
> 2. 매 실행의 대상 건수·소요시간·삭제 결과를 `maintenance_log` 테이블에 남긴다
> 3. 삭제는 `deleted_at is not null and deleted_at < now() - interval '30 days'` **두 조건을 모두** 명시한다 (`is not null` 누락이 곧 전체 삭제)

### 4.5 인덱스

```sql
create index items_hh_active        on items(household_id) where deleted_at is null;
create index items_container_active on items(container_id) where deleted_at is null;
create index items_location_active  on items(location_id)  where deleted_at is null;
create index items_updated_at       on items(household_id, updated_at desc);
create index items_name_trgm        on items using gin (name gin_trgm_ops);   -- 서버측 부분일치
create index items_category         on items(household_id, category) where deleted_at is null;
create unique index containers_qr   on containers(qr_token);  -- §4.2 DDL 에 unique 제약을 두지 않는 이유 (Critic O-3)
create index containers_hh_active   on containers(household_id) where deleted_at is null;
create index locations_hh_active    on locations(household_id) where deleted_at is null;
create index events_item_recent     on item_events(item_id, created_at desc);
create index shopping_open          on shopping_list(household_id) where resolved_at is null;
-- 휴지통 화면 (AC24) 과 pg_cron 만료 스캔은 deleted_at IS NOT NULL 을 조회한다.
-- 위의 부분 인덱스들은 전부 `where deleted_at is null` 이라 여기엔 무용하다.
create index items_trash        on items(household_id, deleted_at desc)      where deleted_at is not null;
create index containers_trash   on containers(household_id, deleted_at desc) where deleted_at is not null;
create index locations_trash    on locations(household_id, deleted_at desc)  where deleted_at is not null;
```

**한글 초성 검색(AC8)의 위치 결정**: `pg_trgm`은 한글 부분일치는 처리하지만 **초성 검색은 불가능**하다. 초성을 서버에서 하려면 Hangul 자모 분해 immutable 함수 + 생성 컬럼 + 별도 인덱스가 필요하다. 반면 가구당 물건 수는 수천 건 규모이므로 **클라이언트 메모리 인덱스로 충분**하다.
→ **결정: 초성 검색은 클라이언트 전담, `pg_trgm`은 서버측 이름 부분일치 전용.** (근거: 5,000건 × 문자열 2회 검사 ≈ 수 ms, AC6의 300ms 예산에 여유. 서버 왕복이 오히려 느리다.)

### 4.6 클라이언트 검색 인덱스 (AC6/AC8)

```
동기화: items 전체(경량 필드만: id, name, category, location_id, container_id,
       quantity, threshold, thumb_path, updated_at)를 TanStack Query 로 조회 →
       ※ photo_path 는 담지 않는다 — 상세 화면 진입 시에만 필요 (§4.9)
       AsyncStorage 에 persist (AC9)
인덱싱: 로드 시 1회 순회하며 항목별로
       - norm  = name.normalize('NFC').toLowerCase()
       - cho   = 초성 문자열   (U+AC00 기준: idx = (code-0xAC00)/588 → 초성 19자 테이블)
검색:  질의어를 동일 정규화 → norm.includes(q) || cho.includes(qCho)
       → 결과에 location/container 이름을 조인해 경로 문자열 구성 (AC7)
```
증분 동기화: `updated_at > lastSync` 조건으로 델타만 가져오고 로컬 인덱스를 갱신한다.

**초기 전량 동기화 (Architect R13/초기로드 지적)**
- 신규 가구원의 최초 동기화는 3,000건 기준 약 600KB. 느린 회선에서 5~10초가 걸릴 수 있으므로 **진행률이 보이는 초기 동기화 화면**을 M5 산출물에 포함한다. 페이지네이션(1,000건 단위)으로 받아 부분 결과부터 검색 가능하게 한다
- 동기화 대상에는 `photo_path`(Storage 경로)만 담고 **서명 URL은 담지 않는다**. 서명 URL은 TTL 1시간이라 캐시에 굳으면 반드시 깨진다
- **썸네일 서명 URL 전략**: 화면에 보이는 범위만 `sign_item_photos(paths[])`로 배치 발급(최대 50개) → 만료시각과 함께 메모리 캐시 → **만료 5분 전 선제 갱신**. `expo-image`의 디스크 캐시가 실제 바이트를 잡아주므로 재발급은 URL만 갱신한다
- 가구당 물건이 **20,000건**을 넘으면 이 전량 동기화 전략을 재검토한다 (설계의 명시적 상한, ADR Follow-up 3)

### 4.7 QR 설계 (AC10~14)

- **payload**: `https://<앱도메인>/c/{qr_token}` (Universal/App Link). 앱 미설치자가 카메라로 스캔해도 웹 랜딩으로 떨어지고, 설치자는 앱이 열린다. `expo-router`가 `/c/[token]` 라우트로 받는다.
> **⚠ M6 범위 결정 (2026-08-30)**: 도메인이 아직 없어 **커스텀 스킴(`homestore://c/{token}`)으로 먼저 간다.**
> · 지금 대가: 앱이 없는 사람이 QR 을 찍으면 아무 일도 일어나지 않는다. 가족만 쓰는 동안은 문제없다.
> · 공개 출시(C1) 전에는 유니버설 링크가 필요하다 — 앱 미설치자를 스토어로 보내야 하기 때문이다. M9 로 이월.
> · **⚠ 나중에 유니버설 링크로 바꾸면 라벨을 다시 인쇄해야 한다.** 토큰(uuid)은 그대로지만
>   QR 에 인코딩되는 문자열이 `homestore://c/{token}` → `https://도메인/c/{token}` 으로 달라지므로
>   QR 이미지 자체가 바뀐다. **박스에 붙이기 전에 이 비용을 감수할지 정할 것.**
>   많이 인쇄하기 전에 도메인을 먼저 확보하는 편이 쌀 수 있다.

- **⚠ 딥링크는 인프라 선행 작업이다 (Architect R14)**: 이 payload가 동작하려면 ① 앱 도메인 확보 ② `apple-app-site-association` 호스팅 ③ Android `assetlinks.json` 호스팅 ④ `app.json`의 `ios.associatedDomains` + `android.intentFilters` 구성 ⑤ **앱 미설치 시 스토어로 유도하는 웹 랜딩 페이지**가 모두 필요하다. 하나라도 틀리면 QR 스캔이 앱 대신 브라우저를 연다. **M6의 첫 산출물로 딥링크 왕복 검증을 먼저 끝내고** 나머지 QR 작업을 진행한다. 라벨을 인쇄한 뒤에 딥링크가 안 되는 것을 발견하면 인쇄물을 전부 버려야 한다
- **스캔**: `expo-camera`의 `onBarcodeScanned` (`barcodeTypes: ['qr']`). 스캔 즉시 로컬 캐시에서 `qr_token`으로 컨테이너를 찾는다 → **네트워크 없이도 2초 내 표시**(AC12). 캐시 미스일 때만 서버 조회.
- **AC14 처리**: 캐시·서버 모두 미스 → "이 가구에 등록되지 않은 코드입니다" 안내 + [새 컨테이너로 등록] 액션 제공. 타 가구 코드는 RLS 때문에 서버에서도 0행이 나오므로 동일 경로로 처리된다(정보 노출 없음).
- **A4 PDF(AC11)**: 컨테이너 다중 선택 → `qrcode` 패키지로 각 토큰의 SVG 문자열 생성 → HTML 템플릿(A4 210×297mm, 3열 × 7행 = 21라벨, 라벨당 QR + 컨테이너명 + 상위 장소명) → `expo-print.printToFileAsync({ html, width, height })` → `expo-sharing.shareAsync()`. 인쇄 여백은 `@page { margin: 10mm }`로 고정.

### 4.8 Realtime (AC23, Pre-mortem #3)

`postgres_changes`는 RLS 필터링에 제약이 있으므로 **Broadcast from Database** 방식을 사용한다: items/containers/locations 트리거에서 `realtime.send()`로 `household:{id}` 토픽에 경량 이벤트(테이블명, id, 작업)를 브로드캐스트하고, 클라이언트는 자기 가구 토픽만 구독한다(구독 권한은 `realtime.messages` RLS로 검증). 수신 시 **캐시를 덮어쓰지 않고 해당 쿼리를 invalidate**한다. 발행 트리거(`t50_broadcast`)는 §4.4의 예외 보호로 감싸므로, Realtime 장애가 쓰기 경로를 막지 않는다. Realtime이 끊긴 동안에는 앱 포그라운드 복귀 시의 재조회가 백스톱이 된다 (AC23의 10초 요구는 정상 연결 상태 기준).

---

### 4.10 인증 방식

> **⚠ 계획이 스펙을 조용히 좁혔던 지점이다.** AC25 원문은 "이메일 매직링크 **또는 소셜 로그인**으로 가입한다"인데, 초안은 매직링크만 넣고 그 축소를 표시하지 않았다. 스펙의 "에이전트 판단" 노트도 매직링크만 적어 AC25 본문과 어긋나 있었다. **소셜 로그인을 복원한다.**

**세 가지를 모두 제공한다**

| 방식 | 대상 | 이유 |
|------|------|------|
| **Google Sign-In** | iOS + Android | 주력 경로. 1~2탭 |
| **Sign in with Apple** | **iOS 필수 — M2에서 연기됨** | 아래 4.8 제약. Face ID로 1탭. **2026-08-28 사용자 결정: 우선 구글만 구현하고 Apple은 나중에.** 개발·Android 배포에는 지장이 없으나 **iOS 스토어 제출 전에 반드시 추가해야 한다** (M9 게이트 R24) |
| 이메일 매직링크 | 전 플랫폼 | 폴백 및 테스트용. 네이티브 설정이 필요 없어 M2 초반에 먼저 붙인다 |

**Apple 심사 가이드라인 4.8 (Login Services) 제약 — 선택이 아니다**

서드파티/소셜 로그인을 쓰는 앱은 **동등한 대안 로그인**을 함께 제공해야 하며, 그 대안은 ① 수집 데이터가 이름·이메일로 제한되고 ② **사용자가 이메일을 비공개로 유지할 수 있어야** 하며 ③ 동의 없이 광고 목적 추적을 하지 않아야 한다.

- **매직링크는 ②를 충족하지 못한다.** 링크를 전달하려면 실제 이메일이 필요하므로 비공개로 둘 수 없다. 매직링크를 대안으로 내세워 4.8을 우회할 수 없다
- 예외 조항 1번("자사 계정 시스템만 **배타적으로** 사용")도 구글을 함께 제공하는 순간 해당되지 않는다
- → **구글을 넣으면 iOS에는 Sign in with Apple이 반드시 따라온다.** M9의 스토어 제출 전제 조건이다

> **⚠ M2 범위 결정 (2026-08-28)**: 사용자가 Apple을 나중으로 미루기로 했다. M2는 **Google + 매직링크**만 구현한다.
> 이 결정의 유일한 대가는 **iOS 스토어 제출 불가**다 — 개발, Android, 내부 테스트 배포에는 지장이 없다.
> M9 완료 조건에 "Sign in with Apple 미구현 시 iOS 제출 금지"를 게이트로 박아, 제출 직전에 발견하는 일이 없게 한다 (R24).

**왜 추가 비용이 작은가 — 선행 작업이 이미 계획에 있다**

| 필요한 것 | 이미 있는 이유 |
|-----------|----------------|
| 개발 빌드(Expo Go 불가) | 카메라·QR 스캔 때문에 이미 필수 |
| 딥링크 / associated domains | QR 유니버설 링크(R14) 때문에 이미 필수. **같은 설정을 공유한다** |
| Apple Developer 계정 | 스토어 출시(AC29) 때문에 이미 필수 |

**구현 시 터지는 함정 둘**

1. **Apple은 이름을 최초 인증 때 딱 한 번만 준다.** 두 번째 로그인부터는 이름 필드가 비어 온다. 이때 `profiles.display_name`을 저장하지 않으면 **영원히 못 받는다.** 그런데 AC20의 "홍길동님이 3시간 전 수정"이 이 이름에 의존한다. → **최초 인증 응답에서 이름을 즉시 `profiles`에 기록**하고, 비어 있으면 온보딩에서 표시 이름을 직접 입력받는 화면을 강제한다. "이메일 가리기"를 선택한 사용자는 `abc@privaterelay.appleid.com`이 오므로 이메일을 표시 이름으로 대체할 수 없다
2. **초대 코드가 OAuth 왕복을 넘어가야 한다.** 초대 링크로 들어온 비회원의 흐름은 `초대 코드 → 소셜 로그인(외부 왕복) → accept_invite`인데, OAuth 리다이렉트 사이에 코드가 유실되면 가입은 됐는데 가구에 못 들어간다. → 코드를 OAuth `state` 또는 로컬 보관소에 넣어 복귀 후 복원하고, 실패해도 온보딩에서 코드를 다시 입력할 경로를 남긴다

---

### 4.11 무료 티어 운용 계획 (v1)

v1은 **Supabase 무료 티어**로 운용한다. 유저가 없는 단계에서 유료 전환은 불필요하고, 무료 한도가 본인 가구 규모를 충분히 덮는다. 다만 무료 티어에는 유료에 없는 두 가지 함정이 있어 계획에 방어를 넣는다.

**한도와 실제 여유** (2026-08 확인 기준, 배포 전 재확인 필요)

| 항목 | 무료 한도 | §4.9 설계 기준 환산 |
|------|-----------|---------------------|
| DB | 500MB | items 1만 건 ≈ 5MB. `item_events`가 더 크지만 병목 아님 |
| **사진 저장** | **1GB** | **실측 133KB/건 → 약 7,800건**. ← **실질적 물건 수 상한** |
| **egress** | **5GB/월** | 썸네일 15KB 기준 3,000건 전체 스크롤 = 45MB → **월 110회**. §4.9 이전(200KB)이었다면 스크롤당 600MB로 **월 8회** — 무료 티어를 못 썼다 |
| 인증 | 50,000 MAU | 무관 |
| 프로젝트 | 2개 | dev + prod 정확히 두 개. 여유 없음 |

> **⚠ R15의 가구당 2.5GB는 유료 전환 이후의 제품 상한이다.** 무료 티어는 **전체 합계**가 1GB이므로, 무료 운용 중에는 가구당 상한을 **800MB(약 3,700건)** 로 낮춰 잡고 총량을 관측한다. 두 값을 환경변수로 두어 전환 시 코드 수정 없이 바꾼다.

**함정 1 — 7일 미사용 시 프로젝트 일시정지**
가족 앱은 매일 쓰지 않는다. 여행을 다녀오면 프로젝트가 정지되어 있고 대시보드에서 **수동 복구**해야 한다. 이 앱의 세 축 중 하나인 "데이터 신뢰도"가 직접 무너지는 실패다.
- 앱 시작 시 정지 상태를 감지하면 **"서버를 깨우는 중"** 안내를 띄우고 재시도한다. 정체불명의 네트워크 오류로 보여주지 않는다
- 무료 운용 중에는 외부 스케줄러(예: GitHub Actions cron)로 **주 1회 헬스 체크 쿼리**를 날려 유휴 카운터를 리셋한다. 유료 전환 시 제거한다

**함정 2 — 자동 백업 없음**
무료 티어에는 일 단위 백업이 없다. 이 앱의 전 가치가 "적힌 것이 실제와 맞다"인데 데이터 유실은 회복 불가다.
- **주 1회 자동 DB 덤프**를 외부 스토리지에 보관한다(GitHub Actions + `pg_dump` → 비공개 저장소 또는 R2)
- 사진은 `photo_path`/`thumb_path` 목록을 덤프에 포함해, 유실 시 무엇이 없어졌는지 최소한 알 수 있게 한다
- **M1 완료 조건에 "덤프 복원 리허설 1회"를 넣는다.** 백업은 복원해 본 적이 있어야 백업이다

**탈출구 — 사진만 Cloudflare R2로 (아직 실행하지 않음)**
사진 저장이 1GB에 근접하면 blob 계층만 R2로 옮긴다. R2 무료는 **10GB + egress 무제한**이라 약 46,500건까지 늘어난다.
- **이것은 증분 변경이지 재작성이 아니다.** Postgres·Auth·Realtime은 그대로 두고 업로드/서명 경로만 교체한다
- **대가를 명시한다**: R2는 Postgres RLS를 모른다. 서명 URL을 발급하는 Edge Function에 **가구 멤버십 검사를 다시 구현**해야 하며, 인가 경로가 둘이 된다. 이는 P2("격리는 DB가 강제한다")의 예외이므로, 옮기는 시점에 그 함수에 대한 크로스 테넌트 침투 테스트를 AC27과 동급으로 추가한다
- 지금 옮기지 않는 이유: 유저가 없어 1GB로 충분하고, 인가 경로 이중화 비용을 앞당겨 낼 이유가 없다

---

## 5. Implementation Milestones

> **순서 원칙**: M4(연속 등록)가 이 프로젝트의 심장이다(P1/D1). **M4의 AC2 실측이 통과하기 전에는 M7 이후를 시작하지 않는다.** M0~M4는 순차, M5·M6은 M4 이후 병렬 가능.

### M0 — 프로젝트 부트스트랩
**산출물**: Expo 앱 스캐폴드, TS strict, expo-router, ESLint/Prettier, Supabase 프로젝트 + 로컬 CLI 연동, 환경변수 분리(dev/prod), `supabase/migrations/` 구조.
**완료 조건**: `npx expo start`로 iOS/Android 시뮬레이터에서 빈 앱이 뜬다. `supabase db reset`이 성공한다.
**충족 AC**: (기반)

### M1 — 데이터베이스 스키마 + RLS + 트리거 🔒
**산출물**: §4.2 전체 스키마(`maintenance_log` 포함), §4.3 RLS 전체, §4.4 트리거 전체(번호 접두사 + `t50_broadcast` 예외 보호), §4.5 인덱스 전체, Storage 버킷·정책, §4.2.1 RPC 4종(`adjust_item_quantity` / `accept_invite` / `resolve_shopping_item` / `sign_item_photos`), 가구당 물건 건수 soft limit, 시드 스크립트.
**완료 조건**
- `pg_tables`에 `rowsecurity=false`인 public 테이블이 **0개**
- **크로스 테넌트 침투 테스트 통과**: 가구 A/B, 사용자 a/b 생성 → a의 JWT로 B의 locations/containers/items/item_events/shopping_list 조회 시 전부 0행, insert/update 시 전부 거부, B의 Storage 경로 접근 시 거부 (**AC27**)
- `item_events`에 클라이언트 JWT로 insert/update/delete 시도 → 전부 거부 (P3)
- items에 하드 DELETE 시도 → 거부 (AC24)
- 물건 수정 시 `updated_by`가 클라이언트가 보낸 값이 아니라 `auth.uid()`로 스탬프됨을 검증 (AC20)
- 동시 `adjust_item_quantity(-1)` 2회 → 수량이 정확히 −2 (Pre-mortem #3)
- **백업 덤프 복원 리허설 1회**: `pg_dump`로 받은 덤프를 빈 인스턴스에 복원해 스키마·RLS·트리거가 살아나는지 확인 (R20 — 복원해 본 적 없는 백업은 백업이 아니다)
- **RLS 정책 커버리지 검증**: §4.3 요약표 11행과 실제 `pg_policies`를 대조해, 각 테이블의 각 작업이 "허용/거부" 의도대로인지 자동 검사한다. **활성화만 확인하고 정책 존재를 안 보면 앱이 전면 거부로 죽는다**
- **트리거 순서 회귀 테스트**: `t10`~`t50`이 이름순으로 실행됨을 검증하고, `t30_log_item_event`의 diff에 `updated_by`/`updated_at`이 포함되지 않음을 확인 (Architect S1)
- **`t50_broadcast` 예외 보호 검증**: `realtime.send()`가 실패하도록 강제(권한 회수 등)한 상태에서 items INSERT/UPDATE가 **정상 커밋**되는지 확인. 롤백되면 실패 (Architect S2 / R16)
- **soft delete 시 쇼핑리스트 해제**: 미해결 자동항목이 있는 물건을 soft delete → 해당 항목이 해제됨 (Architect #10)
- `accept_invite` / `resolve_shopping_item`이 아닌 경로로 `invites.used_by` / `shopping_list.resolved_by`를 클라이언트가 쓰려 하면 거부됨 (P3 일관성, Architect #5)
**충족 AC**: AC20, AC21, AC22(기반), AC24(기반), AC27, AC28
**리스크**: RLS 재귀 → §3 시나리오 1의 대응 적용. 트리거 순서 의존 → S1 적용

### M2 — 인증 · 가구 온보딩
**산출물**: **Google Sign-In + 이메일 매직링크 2종**(§4.10 — Apple은 사용자 결정으로 연기, M9 게이트로 이월), 세션 영속·자동 갱신, 최초 로그인 시 `profiles` 생성 — **Apple 최초 인증 응답의 이름을 즉시 저장**, 표시 이름이 비면 온보딩에서 강제 입력, 가구 생성(`create_household` RPC), **`accept_invite(code)` RPC로 초대 수락**(멤버 추가 + invite 소비를 단일 트랜잭션), **초대 코드의 OAuth 왕복 보존**, owner의 초대 코드 발급·구성원 추방, 가구 전환 UI.
**완료 조건**: **두 가지 로그인이 동작한다** — 구글(iOS·Android), 매직링크. (Apple은 연기) **애플의 "이메일 가리기"를 선택해도 표시 이름이 확보되어 AC20이 렌더된다**(최초 인증에서 이름을 못 받았으면 온보딩이 입력을 요구한다). **초대 링크로 진입한 비회원이 소셜 로그인 왕복 후에도 그 가구에 정확히 참여한다.** 신규 사용자가 가입 → 가구 생성 → 초대 코드 발급 → 다른 계정이 그 코드로 참여 → 두 계정이 같은 데이터를 본다. owner가 member를 추방하면 그 member의 앱에서 해당 가구 데이터가 즉시 사라진다. 만료 코드·재사용 코드는 거부되고, `invites.used_by`는 클라이언트가 아니라 RPC가 스탬프한다 (P3).
**충족 AC**: AC25, AC26

### M3 — 장소 · 컨테이너 CRUD
**산출물**: 장소 목록/생성/수정/삭제, 장소별 컨테이너 목록, 컨테이너 생성 시 `qr_token` 자동 발급, 컨테이너 상세(내용물 목록), 컨테이너 사진.
**완료 조건**: "현관 팬트리" 장소를 만들고 그 안에 박스 10개를 만들 수 있다. 각 박스에 서로 다른 `qr_token`이 부여된다. 컨테이너를 지우면 그 안의 물건은 사라지지 않고 장소 직속으로 남는다.
**충족 AC**: AC10, AC24(적용)

### M4 — ⭐ 물건 연속 등록 플로우 (최대 예산)
**산출물**
- 컨테이너 컨텍스트를 유지하는 **연속 등록 화면**: 상단 고정 카메라 뷰파인더 + 이름 입력 필드(자동 포커스) + 저장. 저장 시 폼만 리셋되고 화면을 벗어나지 않는다 (AC1)
- 필수 입력은 이름 하나. 카테고리·수량·임계치·단위·구매링크·메모는 접힌 "추가 정보" 영역 (AC3)
- 클라이언트 UUID 생성 → 낙관적 캐시 삽입 → 즉시 다음 입력 가능 (Pre-mortem #3)
- **낙관적 삽입 실패 경로 (§2.4 긴장 해소 / Architect S3)**: 서버 INSERT가 거부·타임아웃되면 항목을 **캐시에서 지우지 않고** "동기화 실패" 배지를 붙여 재시도 큐에 넣는다. 큐 상한 10건, 초과 시 등록을 막고 연결 확인 안내. 네트워크 복귀 시 즉시 플러시. **앱 종료 시 큐를 유지하지 않는다**(C2 Non-Goal 방어)
- **백그라운드 사진 업로드 큐**: 촬영 → **썸네일(320px/q0.6)과 원본(1280px/q0.7) 두 장 생성** → 업로드 → `thumb_path`/`photo_path` 패치. **썸네일을 먼저 올려** 목록에 빨리 뜨게 한다. 실패 시 항목에 재시도 배지 (AC4, §4.9)
- 카테고리 자유 입력 + 기존 값 자동완성 (AC5)
- 사진 없이 저장 경로를 1탭으로 (AC3)
- **AC2 계측 계기 — 측정 구간을 엄밀히 정의한다 (Critic R-4)**
  낙관적 삽입에서 "저장 완료"는 로컬 캐시 삽입 시점이라 사실상 0ms다. 이 정의를 쓰면 화면 진입 후 사용자가 5초를 망설여도 계측에 포함되고, 반대로 아무리 느린 앱이라도 "저장 완료"만 즉시면 통과한다 — **게이트가 무의미해진다.**
  따라서 AC2는 **사용자가 물건 하나를 처리하는 데 실제로 걸리는 사이클 타임**으로 측정한다:

  | 대상 | 시작 | 종료 |
  |------|------|------|
  | 연속 등록의 **1번째** 물건 | **첫 입력 행동** — 카메라 셔터 탭 **또는** 이름 필드 첫 키 입력 중 먼저 오는 것 | **폼 리셋 완료** = 다음 물건 입력을 받을 준비가 된 시점 |
  | **2번째 이후** | **이전 물건의 폼 리셋 완료** | **현재 물건의 폼 리셋 완료** |

  - 화면 진입~첫 행동 사이의 망설임 시간은 제외한다 (앱 성능이 아니다)
  - 폼 리셋에는 **카메라 프리뷰 재개와 이름 필드 재포커스가 포함**된다. 여기가 느리면 사이클이 느린 것이 맞다
  - **서버 반영 완료 시간은 AC2에 포함하지 않되 별도 지표로 관측한다**(§7.4). AC2는 사용자 체감 속도의 게이트이고, 서버 반영 지연은 R5/S3의 건전성 지표다
  - median은 20건 전체(1번째 포함)로 계산한다
**완료 조건**
- 실기기에서 **손으로 20개를 연속 등록**하고, 계측 median이 **≤10초**임을 로그로 증명한다. 시드 데이터로 대체하지 않는다
- 비행기 모드에서 저장 시도 시 명확한 오류 안내(C2, 무한 스피너 금지)
- **네트워크 지연 3초 시뮬레이션 상태에서 연속 5개 등록 → 5건 전부 서버 반영 확인**. 하나라도 유실되면 실패 (Architect S3)
- 서버가 INSERT를 거부하도록 강제한 상태에서 등록 → 항목이 사라지지 않고 "동기화 실패" 배지가 뜬다
**충족 AC**: **AC1, AC2, AC3, AC4, AC5**
**리스크**: §3 시나리오 2. median이 초과하면 M5로 넘어가지 않고 M4를 재설계한다

> ### M4 진행 상태 (2026-08-30)
>
> | AC | 상태 | 근거 |
> |----|------|------|
> | AC1 연속 등록 | ✅ 검증 | 저장 후 화면 유지·폼 리셋·포커스 복귀를 실기기에서 확인 |
> | **AC2 median ≤10초** | ⚠️ **미판정** | 사용자가 4건까지만 등록. 20건·사진 15건 조건 미충족으로 게이트가 열리지도 닫히지도 않았다 |
> | AC3 필수는 이름 하나 | ✅ 검증 | 사진 없이 저장되는 경로 확인 |
> | AC4 백그라운드 업로드 | ✅ 검증 | 썸네일→원본 순 업로드, 경로 연결, 상태 배지 |
> | AC5 카테고리 자동완성 | ⬜ 미검증 | 구현했으나 실기기에서 확인하지 않음 |
>
> **⚠ AC2 게이트는 M5 진입 조건이었다.** 사용자 판단으로 건너뛰었으므로 이 계획의
> 원래 규율(미달 시 M4 재설계)은 적용되지 않은 채로 진행된다. 나중에 "등록이 느리다"는
> 문제가 생기면 **비교할 기준점이 없다** — 그때는 다시 20건을 재야 한다.
>
> 구현 중 발견해 고친 것: `globalThis.crypto` 부재(RN), setState 업데이터로 상태를 읽어
> 큐가 멈춘 문제, 카메라 방향 판정 오류(장변 1706→1280, 용량 344KB→133KB),
> 권한 허용 직후 카메라 미부착, 미리보기에 썸네일 사용으로 인한 화질 오인.
>
> M9 확인 항목 추가: `shutterSound: false` 가 이 기기(한국 출시 모델)에서 실제로 동작한다.
> 정식 API 이므로 우회는 아니지만, 한국 스토어 심사에서 촬영음 관련 지적 가능성은 남는다.

### M5 — 검색 · 목록 · 필터 (M4 이후)
**산출물**: 로컬 인덱스 빌드(초성 포함), 검색 화면, 결과 행에 썸네일+이름+전체경로+수량 (AC7), 카테고리별 보기, 장소별 보기, 오프라인 배너, 증분 동기화, **진행률이 보이는 초기 전량 동기화 화면**(페이지네이션 1,000건 단위), **`sign_item_photos` 배치 서명 URL + 만료 5분 전 선제 갱신 캐시** (R13).
**완료 조건**: 1,000건 시드 상태에서 실기기 타이핑→결과 표시 **≤300ms** 실측(AC6). "전지"와 "ㄱㅈㅈ" 모두 "건전지"를 찾는다(AC8). 비행기 모드에서 검색·조회가 되고 "오프라인 — 마지막 동기화 {시각}" 배너가 뜬다(AC9). **3,000건 상태에서 목록을 끝까지 스크롤해도 썸네일이 깨지지 않고**, 1시간 이상 앱을 켜둔 뒤에도 만료된 서명 URL로 인한 이미지 로드 실패가 발생하지 않는다 (R13).
**충족 AC**: AC6, AC7, AC8, AC9

> ### M5 진행 상태 (2026-08-30)
>
> | AC | 상태 | 근거 |
> |----|------|------|
> | AC6 검색 ≤300ms | ✅ | 메모리 필터. 5,000건 선형 탐색 <50ms 를 유닛 테스트로 고정 |
> | AC7 결과 행에 경로 | ✅ | 썸네일 + 이름 + "현관 팬트리 › 1" + 수량. 실기기 확인 |
> | AC8 부분일치 + 초성 | ✅ | 유닛 17건 + **실기기에서 한글 초성 검색 동작 확인** |
> | AC9 오프라인 조회 + 배너 | ⬜ 미검증 | 구현했으나 비행기 모드 확인은 하지 않음 |
>
> 구현 중 잡은 버그: 썸네일 서명 URL 을 **ref + 강제 리렌더**로 관리해 캐시는 차는데
> 화면이 갱신되지 않았다. URL 은 화면에 그려지는 값이므로 state 여야 한다 — 옮기니
> 이 부류의 버그가 구조적으로 불가능해졌다. 아울러 **실패를 조용히 삼키는 catch 가
> 디버깅을 막았다** (개발 빌드에서는 로그를 남기도록 수정).
>
> 설계 결정 실현: 초성은 클라이언트 전담(§4.5). `pg_trgm` 으로 불가능하고 수천 건
> 규모에선 메모리 선형 탐색이 서버 왕복보다 빠르다. §4.9 의 이중 해상도가 여기서
> 처음 값을 한다 — 목록은 12KB 썸네일만 받는다.

### M6 — QR 스캔 · 생성 · A4 PDF (M4 이후, M5와 병렬 가능)
**산출물 (순서 중요)**
1. **[선행] 딥링크 인프라 왕복 검증** — 앱 도메인, `apple-app-site-association`, `assetlinks.json`, `app.json`의 `ios.associatedDomains`/`android.intentFilters`, 앱 미설치 시 스토어 유도 웹 랜딩. **이것이 통과하기 전에 라벨 인쇄 작업을 시작하지 않는다** (R14)
2. 스캔 화면(expo-camera), 딥링크 라우트 `/c/[token]`, 미등록 코드 처리
3. 컨테이너 다중 선택 → A4 라벨 PDF 생성·공유
4. 스캔 결과 화면에서 연속 등록 진입
**완료 조건**: 실제로 A4에 21개 라벨을 인쇄해 박스에 붙이고, 앱으로 스캔해 **2초 이내** 내용물이 뜬다(AC12). 라벨에 QR+컨테이너명+장소명이 인쇄된다(AC11). 스캔 후 1탭으로 연속 등록에 진입한다(AC13). 무작위/타 가구 QR 스캔 시 안내 메시지가 뜨고 크래시하지 않는다(AC14).
**충족 AC**: AC11, AC12, AC13, AC14

#### M6 진행 상황 (2026-08-30)

**결정: 커스텀 스킴 `homestore://c/{token}` 으로 먼저 간다.** 도메인이 없어 유니버설
링크는 M9 로 이월. 대가는 "앱 없는 사람이 QR 을 찍으면 아무 일도 안 일어난다" 이고,
가족만 쓰는 동안은 문제없다. **⚠ 나중에 https 로 바꾸면 QR 문자열이 달라지므로
라벨을 다시 인쇄해야 한다** — 많이 인쇄하기 전에 도메인을 확보하는 편이 쌀 수 있다.

**R14 선행 관문 — 통과.** 라벨을 만들기 전에 딥링크 왕복을 먼저 닫았다:

| 검증 | 방법 | 결과 |
|---|---|---|
| 스킴 등록 | `dumpsys package` 인텐트 필터 | ✅ `homestore` → MainActivity |
| 딥링크 → 라우트 | `am start -d homestore://c/{token}` | ✅ `/c/[token]` 매칭, 박스 해석 **85ms** |
| 페이로드 왕복 | 유닛 테스트 22건 | ✅ build → parse 동일 토큰 |
| 인쇄 크기 판독 | 래스터화 후 jsQR 디코딩 | ✅ 120·150·200·307px 전부 판독 |
| 기기 생성 PDF | `run-as` 로 꺼내 MediaBox 확인 | ✅ **594.96×840.96pt = A4** |
| PDF 속 QR | 2480px 래스터 → 크롭 → 디코딩 | ✅ DB 의 그 토큰과 일치 |

전 구간이 이어진다: **DB 토큰 → 앱 → A4 PDF → 종이 크기 래스터 → 디코딩 → 파싱 →
같은 토큰 → 딥링크 → 박스 상세.**

**AC 현황**

| AC | 상태 | 근거 |
|---|---|---|
| AC11 A4 라벨 시트 | ✅ | 3×7=21칸, QR+박스명+장소명. 기기에서 PDF 생성·공유 확인 |
| AC12 스캔 → 2초 내 내용물 | 🟡 | 딥링크 경로는 85~381ms 로 확인. **카메라로 실제 라벨을 읽는 구간만 미검증** — 사람이 폰을 들어야 한다 |
| AC13 1탭 연속 등록 | ✅ | 박스 상세의 "이 박스에 물건 넣기" (기기 확인) |
| AC14 미등록·타 가구 QR | ✅ | 미등록 UUID·깨진 토큰·다른 경로 3종 기기 확인, 크래시 0건, 안내 문구 렌더 확인 |

**이번에 잡은 함정 (다음에 또 밟지 않도록)**

- **`printToFileAsync` 의 기본 용지는 US Letter(612×792pt)** 다. A4 로 짠 HTML 을 그냥
  넘기면 오른쪽 열과 아래 행이 잘린 PDF 가 나온다. 화면에선 멀쩡해 보이고 **인쇄해야
  드러난다.** `A4_PT` 로 못박고 테스트로 고정했다.
- **뷰(`container_summary`)의 컬럼은 타입 생성기가 전부 nullable 로 본다.** 뷰가 NOT NULL 을
  표현할 수 없기 때문이다. 토큰이 null 인 채로 인쇄되면 빈 라벨이 나오므로 인쇄 직전에 막는다.
- **뷰에 이미 `deleted_at is null` 이 박혀 있고 그 컬럼을 노출하지 않는다.** 습관대로
  `.is('deleted_at', null)` 을 걸면 없는 컬럼이라 쿼리가 통째로 실패한다.
- **`v is string` 타입 술어**를 이미 `string` 인 값에 쓰면 else 가지가 `never` 로 좁혀져
  정상 분기가 컴파일되지 않는다.
- **`useRef(Date.now())`** 는 렌더 중 불순 호출이라 `react-hooks/purity` 가 막는다.
  측정 시작점은 마운트 이펙트로 옮겼다.
- **로그인 전에 도착한 딥링크**는 그냥 두면 로그인 후 홈으로 떨어져 목적지를 잃는다.
  `pendingDeepLink` 로 붙잡아 뒀다가 이어서 보낸다. ⬜ 이 경로는 기기 미검증
  (검증하려면 로그아웃이 필요해 사용자 데이터를 건드린다).
- **`onBarcodeScanned` 는 초당 여러 번 호출된다.** 첫 인식 즉시 잠그지 않으면 같은
  박스로 라우팅이 수십 번 쌓인다.

**남은 것**: 실제 A4 인쇄 → 박스 부착 → 카메라 스캔 (AC12 완결). `npm run verify:qr` 로
인쇄 전 판독 검증을 언제든 다시 돌릴 수 있다.

#### 계획 밖 작업 — 물건 상세 · 수정 (2026-08-30, 사용자 요청)

마일스톤 순서를 벗어나 M7·M8 의 일부를 먼저 만들었다. 사용자가 M6 확인 중에
"내용물 클릭 → 상세, 수정 기능" 을 요청했기 때문이다.

**만든 것**
- `src/features/item/ItemRow.tsx` — 물건 한 줄의 **단일 구현**. 검색 결과·박스 내용물·
  장소 낱개 목록이 모두 이걸 쓴다. 원래 사진은 검색에만 있었는데, 같은 물건이 화면마다
  다르게 보이면 안 되고 두 벌을 두면 한쪽만 고쳐진다 (QR 페이로드와 같은 이유).
- `src/app/item/[id].tsx` — 상세 + 인라인 수정. 큰 사진, 경로(누르면 박스로 이동),
  수량 ±, 카테고리·단위·임계치·구매링크·메모 수정, soft delete.
- `useItem` / `useUpdateItem` / `useAdjustQuantity` / `useDeleteItem` / `useItemPhotoUrl`
- `thumbs.ts` 를 `features/search/` → `features/item/` 으로 이동 (검색 전용이 아니다)

**앞당겨 충족한 AC**: AC15(수량 증감, RPC 로 동시성 안전) · AC20(누가 언제 고쳤는지) ·
AC22(soft delete). 임계치는 **입력만** 가능하고 알림·구매리스트는 여전히 M7 이다.

**이번에 잡은 함정**
- **PostgREST 의 `.select()` 타입 추론은 리터럴만 읽는다.** 문자열을 이어붙이면
  `data` 가 `GenericStringError` 가 되어 타입이 통째로 무너진다. 한 줄 리터럴로 쓸 것.
- **profiles 로 가는 FK 가 `created_by`/`updated_by` 둘이라** 조인에 제약 이름
  (`items_updated_by_fkey`)을 찍어야 한다. 안 그러면 "Could not embed" 로 조회가 실패한다.
- **폼을 props 에 다시 맞추는 useEffect 를 넣지 말 것.** 재조회가 도착하는 순간
  사용자가 입력하던 내용이 지워진다. 폼은 수정 모드 진입 시 마운트되므로 초기화는 자동이다.
- **`Screen` 은 기본으로 ScrollView 를 두른다.** 그 안에 또 넣으면 스크롤이 서로 먹는다.
- **`aspectRatio` 와 `maxHeight` 를 같이 주면** 높이가 잘리며 폭까지 줄어 사진이
  화면 왼쪽에 작게 붙는다.
- **수량은 반드시 RPC(`adjust_item_quantity`)로 증감**한다. 화면에서 읽은 값에 더해
  쓰면 두 사람이 동시에 −1 했을 때 한 번만 반영된다. 폼에서 숫자를 직접 고치는 것은
  "이 값으로 정한다" 는 뜻이라 일반 update 가 맞다.

**기기 검증**: 카테고리 수정 저장 → **원격 DB 에서 `'글씨 잘 보이나', 'electronics', 3`
확인**. 수량 + 두 번(1→3)이 RPC 로 반영됨. 검색·박스·장소 세 목록 모두 썸네일 표시.

#### 박스 이름·메모 수정 (2026-08-30, 사용자 요청)

**⚠ 기능이 없던 게 아니라 조용히 죽어 있었다.** 장소 화면에서 박스를 길게 누르면
"이름 바꾸기" 가 있었는데, 구현이 `Alert.prompt?.('새 이름', …)` 이었다.
**`Alert.prompt` 는 iOS 전용 API 다.** 옵셔널 체이닝으로 불렀기 때문에 안드로이드에서는
아무 일도 일어나지 않고 **오류도 나지 않았다** — 눌러도 반응이 없을 뿐이라
"기능이 없다" 로 보였다. 이런 종류는 타입 검사도 린트도 잡지 못한다.

**대응**
- 박스 상세 우측 상단에 설정(⚙) — 이름·메모 수정 + 박스 삭제. 화면 안의 폼이라
  플랫폼 API 에 기대지 않는다.
- 장소 화면의 길게 누르기 메뉴는 박스 상세로 보낸다. **편집은 한 곳에서만** 한다.
- `useRenameContainer` 는 삭제했다. 남겨 두면 다음에 누가 그걸 쓰고 또 안드로이드에서 죽는다.
- `useUpdateContainer(containerId)` — 장소를 거치지 않고 **컨테이너 id 만으로** 동작한다.
  QR 딥링크로 바로 들어오면 장소 기준 캐시 키를 만들 수 없기 때문이다.

**무효화 범위가 관건이었다.** 박스 이름은 박스 상세 · 장소의 박스 목록 · 라벨 인쇄 목록 ·
**검색 결과의 경로 문자열**에 동시에 떠 있다. 기기 검증: 이름을 바꾸자 헤더 · 경로 ·
검색 결과 6건의 "현관 팬트리 › …" 가 모두 즉시 갱신됐다.

**교훈**: 플랫폼 한쪽에만 있는 API 를 `?.` 로 부르면 다른 플랫폼에서 **무증상으로 죽는다.**
`Alert.prompt` · `Share.share` 옵션 일부 · `Linking.canOpenURL` 등이 여기 해당한다.

#### 물건 이동 · 카메라 크기 (2026-08-30, 사용자 요청)

**이동** — 물건 상세의 경로 옆 "이동" 버튼. 수정 모드를 거치지 않는다. 물건은 자리를
자주 옮기는데 그때마다 폼을 열게 하면 안 옮기고 방치하게 된다.
목적지를 **한 번 누르면 즉시 이동**한다(확인 단계 없음 — 되돌리기도 한 번이면 된다).
장소 이름 줄 자체도 목적지다: 박스에 넣지 않고 장소에 두는 물건이 있기 때문이다.

- `useMoveItem(itemId)` — 박스로 옮길 때는 **`container_id` 만 보낸다.** 트리거
  `t20_enforce_container_location` 이 컨테이너의 장소로 자동 정렬하므로, 클라이언트가
  계산한 `location_id` 를 같이 보내면 어긋났을 때 조용히 덮어써진다.
  박스에서 빼내 장소 직속으로 둘 때만 `location_id` 를 함께 지정한다.
- 무효화는 **떠난 곳과 도착한 곳 양쪽**이다. 한쪽만 갱신하면 원래 박스에 물건이
  남아 있는 것처럼 보인다.

**함께 고친 것 — 경로에 박스 이름이 없었다.** 상세의 경로가 장소 이름만 보여줬는데,
이동 기능이 생기니 **같은 장소 안에서 옮기면 화면이 하나도 안 바뀌어** "이동이 된 건가?"
가 됐다. `useItem` 에 `container:containers!items_container_id_fkey(name)` 을 조인해
"현관 팬트리 › 2번" 으로 표시한다.

**카메라 1:1** — 등록 화면 카메라가 `height: 190` 고정이라 폭 대비 약 2:1 로 납작했다.
`Math.min(width - 32, height * 0.42)` 로 계산해 정사각에 가깝게 키웠다.
- ⚠ `aspectRatio: 1` 을 쓰지 않았다. 높이를 제한하는 순간 **폭까지 같이 줄어** 카메라가
  화면 왼쪽에 작게 붙는다(물건 상세 사진에서 겪은 그 버그).
- 세로 상한 `height * 0.42` 를 둔 이유: 정사각이면 폭 좁은 기기에서 이름 입력칸이
  키보드에 가려 **연속 등록이 오히려 느려진다.** 등록 속도가 중심 원칙이므로
  카메라가 그걸 잡아먹게 두지 않는다.

**기기 검증**: "글씨 잘 보이나" 를 박스 1 → 2번으로 이동 → **원격 DB 에서 확인**.
카메라는 이 기기(1080×2520)에서 379dp 정사각, 이름칸·저장 버튼 모두 스크롤 없이 보임.

#### 박스 없이 장소에 물건 두기 + 등록 큐 무효화 버그 (2026-08-30, 사용자 요청)

**1) 기능이 반쪽만 있었다.** `items.container_id` 는 nullable 이고(신발장 우산, 냉장고 우유),
`useLooseItems` 도 있고, 장소 화면에 "박스 없이 이 장소에" 섹션도 있었다.
그런데 **그런 물건을 만들 진입점이 없었다.** 게다가 섹션은 `ls.length > 0` 일 때만 렌더돼서
하나도 없으면 그게 가능하다는 사실 자체가 화면에 없었다 — 첫 물건을 넣을 방법이 없는 셈.

- 등록 화면을 `/add/[containerId]` → `/add/[target]` 으로 일반화. `?loose=1` 이면 target 을
  **장소 id** 로 해석한다. 화면을 두 벌 만들지 않는다.
- 헤더 표기: 박스면 `현관 팬트리 › 2번`, 낱개면 `현관 팬트리 · 박스 없이`.
  `현관 팬트리 › ` 로 끝나면 뒤가 잘린 것처럼 보인다.
- 장소 화면에 **항상 보이는** "박스 없이 여기에 물건 넣기" 버튼.

**2) ⚠ 그러다 더 큰 버그가 드러났다 — 등록 큐가 어떤 캐시도 무효화하지 않았다.**

`useRegisterQueue` 는 서버 INSERT 성공 후 `onSynced` 콜백(카테고리 refetch)만 부르고
**목록 캐시는 건드리지 않았다.** 등록을 마치고 "완료" 로 돌아가면 아래 화면은
언마운트된 적이 없어 TanStack Query 가 다시 조회하지 않는다 → **방금 넣은 물건이 목록에 없다.**

이게 M4 이후 계속 있었는데 안 드러난 이유: 지금까지 등록을 확인할 때마다 앱을
**force-stop 후 재시작**해서 봤다. 재시작하면 전부 새로 조회되므로 정상으로 보인다.
낱개 등록에서 처음 발견했고, DB 에는 있는데 화면에 없는 것으로 확인했다.

→ INSERT 성공 시점과 사진 업로드 완료 시점에 `items`·`search`·`locations`·`containers`·
  `all-containers`·`container` 를 무효화한다. 등록은 사람 손 속도(실측 median 1.3초)라
  항목당 작은 조회 몇 건은 문제가 되지 않는다. 반대로 목록이 안 맞으면 "저장이 안 됐다"
  로 읽혀 **같은 물건을 두 번 넣게 된다** — 그쪽이 훨씬 비싸다.

**교훈**: 화면을 재시작해서 확인하면 캐시 무효화 버그를 영원히 못 본다.
**앱을 켠 채로** 등록 → 뒤로 → 목록 확인의 경로를 밟아야 한다.

**기기 검증**: 앱 재시작 없이 낱개 등록 → "완료" → 섹션이 즉시 나타남. 삭제도 즉시 반영.
DB 대조로 `container_id: NULL`, `location_id` = 현관 팬트리 확인. 테스트 물건 2건은 정리함.

#### 사진 추가·교체·제거 (물건 + 박스) · 문구 정리 (2026-08-30, 사용자 요청)

**문구**: "물건 넣기" → "물건 등록", "여기에" → "이 장소에" 로 통일.

**사진 관리** — 요청 2·3·4 는 결국 같은 기능이라 **한 벌로** 만들었다.
`containers` 에도 `photo_path`/`thumb_path` 가 이미 있고 Storage 정책은 경로의 첫 조각
(가구 id)만 보므로 **마이그레이션 없이** 박스에도 그대로 적용된다.

- `PhotoSheet` — 촬영 시트. 물건·박스가 공유한다.
- `useSetPhoto(owner, id, householdId)` / `useRemovePhoto(owner, id)` — `owner` 는
  `'items' | 'containers'`. 두 벌로 만들면 한쪽만 고쳐진다.
- 등록할 때 사진을 안 찍고 **나중에 붙일 수 있어야** 한다. AC3 가 이름만 필수라
  사진 없는 물건이 정상적으로 생기는데, 나중에 붙일 방법이 없으면 사진을 남기려는
  사람은 등록 시점에 반드시 찍어야 해서 **등록이 느려진다**(P1 위반).

**⚠ 교체할 때 옛 사진이 계속 보이는 문제.** 기존 `uploadPhoto` 는 파일명에 itemId 를 써서
경로가 고정이고 `upsert: true` 였다. 교체해도 **서명 URL 의 경로가 같아** expo-image 의
디스크 캐시가 옛 사진을 계속 보여준다 — 파일은 바뀌었는데 화면은 안 바뀌므로
"업로드가 실패했나" 로 보인다. → 교체마다 **버전 uuid 로 새 경로**를 쓴다. 행을 갱신한
뒤 옛 객체를 지운다(순서를 뒤집으면 업로드 실패 시 행이 없는 파일을 가리킨다).

**⚠ 실기기에서 드러난 진짜 버그 — 시트를 다시 열면 카메라가 검은 화면.**
셔터를 누르면 `Failed to capture image` 가 **잡히지 않은 promise 오류**로 터졌다.
logcat 이 원인을 확정했다: 시트를 닫아도 `CameraService: disconnect` 가 **약 6초 뒤에야**
찍힌다. 안드로이드는 카메라 클라이언트를 하나만 허용하므로 두 번째 시트가 붙지 못한 것.
대응 셋:
  1. `onCameraReady` 전에는 **셔터를 렌더하지 않는다.** 검은 화면 위의 멀쩡한 셔터가
     "눌렀는데 아무 일도 안 남" 의 직접적 원인이었다
  2. 1.5초 간격으로 최대 6회 다시 붙인다(≈9초). 1회 재시도로는 6초 창을 못 넘는다
  3. 촬영은 반드시 try/catch — 조용히 삼키지도, 앱 밖으로 던지지도 않는다.
     실패하면 카메라를 다시 붙이고 사용자에게 알린다
  그래도 안 되면 "카메라 다시 켜기" 버튼을 내준다 — 영원히 "준비 중" 으로 두지 않는다.

**기기 검증 (Storage 객체 수로 대조)**: 18 → **20**(추가) → **20**(교체, 옛 파일 정리됨)
→ **18**(제거). 행의 `photo_path`/`thumb_path` 도 null 로 정리. 고아 파일 0.
교체 후 화면의 사진이 **눈에 보이게 바뀌는 것**까지 확인(캐시 문제 해소).

#### 실사용 피드백 3건 (2026-08-30) — ⚠ AC1/AC2 설계 변경 포함

사용자가 **릴리스 빌드를 실제로 들고 다니며** 발견한 것들.

**1) "추가" 를 두 번 눌러야 했다 — 실제 버그였다.**
`components/ui.tsx` 의 `Screen` 이 감싸는 ScrollView 에 `keyboardShouldPersistTaps` 가
없어 기본값 `'never'` 였다. 키보드가 올라와 있으면 **첫 탭이 키보드를 내리는 데 먹히고
버튼에 닿지 않는다.** 장소·박스 추가가 모두 같은 증상이었던 이유가 이것이다.
화면마다 붙이면 새 화면에서 또 빠뜨리므로 **Screen 한 곳에서** 못박았다.

**2) 카메라 줌** — `useCameraZoom` + `ZoomBar`. 두 카메라(등록 화면·PhotoSheet)가 공유.
- ⚠ **안드로이드에서는 줌인만 된다.** `CameraView.zoom` 은 0~1 로 현재 렌즈의 디지털
  줌이고, 초광각 렌즈로 바꾸는 `selectedLens` 는 **iOS 전용**이다. 사용자가 요청한
  "광각으로 찍기" 는 안드로이드에서 **경로가 없다** — 요청을 절반만 충족했다.
- ⚠ 제스처를 react-native-gesture-handler 로 하지 않았다. 앱에 `GestureHandlerRootView`
  가 없어 제스처가 **조용히 동작하지 않을** 위험이 있다. RN 기본 터치 이벤트로
  두 손가락 거리를 직접 쟀다.
- 표시는 배율이 아니라 **최대 줌 대비 %** 다. 기기마다 최대 배율이 달라 "2배" 는 거짓말이 된다.

**3) ⚠ "저장하고 다음" → "등록" + 상세로 이동 — 연속 등록 플로우를 뒤집었다.**

이것은 **AC1(연속 등록 모드)의 설계 변경**이다. 인터뷰 Round 4 에서 "등록 속도" 가
중심 원칙으로 잡혔고 M4 에 최대 예산을 배정한 근거가 AC1 이었다. 실사용 결과
사용자가 **"등록한 게 어떻게 저장됐는지 바로 확인하고 싶다"** 를 더 중요하게 판단했다.

- **비용**: 물건 20개를 넣으려면 상세 → 뒤로 → 등록을 20번 왕복한다. 원래 설계가
  피하려던 바로 그 마찰이다. 정리 작업처럼 한 번에 많이 넣는 상황에서 다시 문제가
  될 수 있고, 그때는 "등록하고 계속" 을 **보조 버튼**으로 되살리는 것이 답이다.
- **기술적 필수 변경**: 낙관적 삽입(P1) 그대로 넘어가면 상세가 아직 없는 행을 조회해
  "물건을 찾을 수 없습니다" 를 띄운다. 큐에 `enqueueAndWaitForRow` 를 추가해
  **행 저장만 기다리고** 사진 업로드는 배경에 남긴다(AC4 유지). 실측 서버 왕복 ~145ms.
- **AC2 계측기를 제거했다.** "폼 리셋 → 다음 폼 리셋" 사이를 재던 계기인데
  **그 사이클 자체가 없어졌다.** 측정 대상이 사라진 계기를 남겨두면 의미 없는 숫자를
  보게 된다. 서버 왕복 기록(`recordServerLatency`)은 큐에서 계속 남는다.
  → **AC2(등록 median ≤10초)는 이제 판정 수단이 없다.** 사용자가 4건에서 중단해
  원래도 판정된 적이 없었고, 이제 측정 대상 흐름 자체가 바뀌었다.

#### 장소 이름 변경 (2026-08-30, 사용자 보고)

**훅은 있는데 부르는 화면이 없었다.** `useRenameLocation` 이 `storage/api.ts` 에
구현돼 있었지만 `src/app/` 어디에서도 호출하지 않았다 — 장소 이름을 바꿀 경로가
**처음부터 없었다.** 박스 이름 변경(iOS 전용 `Alert.prompt` 로 조용히 죽어 있던 것)과
증상은 같지만 원인이 다르다: 이쪽은 **UI 자체가 없었다.**

→ 장소 상세 헤더에 설정(⚙) 추가. 이름·메모 수정 + 삭제. 박스 설정과 같은 모양으로 맞췄다.
  기존 본문 하단의 "이 장소 삭제" 는 설정 안으로 옮겼다.

**`useRenameLocation` 은 삭제하고 `useUpdateLocation(locationId)` 로 대체했다.**
옛 훅은 무효화가 `locations` 하나뿐이라, 그대로 UI 에 붙였더라도 다른 화면엔
옛 이름이 남았을 것이다. 장소 이름이 나타나는 곳은 여섯 군데다:
장소 목록 · 박스 상세의 경로 · 물건 상세의 경로 · 검색 결과의 경로 ·
등록 화면 헤더(`add-context`) · 라벨 인쇄물.

**패턴이 반복되고 있다.** 지금까지 같은 종류를 셋 봤다:
  1. 박스 이름 변경 — 코드는 있고 플랫폼 API 때문에 무증상 실패
  2. 낱개 물건 등록 — 조회·표시는 되는데 만들 진입점 없음
  3. 장소 이름 변경 — 훅은 있고 부르는 화면 없음
→ **M9 출시 준비에 "모든 엔티티의 CRUD 진입점 실기기 전수 점검" 을 넣어야 한다.**
  타입 검사도 린트도 "구현했지만 아무도 안 부르는 코드" 를 잡지 못한다.

#### ⚠ 범위 축소 — AC15·AC17·AC19·AC23 제외 (2026-08-30, 사용자 결정)

실사용 후 사용자가 네 개를 **불필요**로 판정했다. 스펙의 AC 를 빼는 결정이므로 근거와
대가를 남긴다.

| AC | 내용 | 상태 | 빠짐으로써 잃는 것 |
|---|---|---|---|
| AC15 | 수량 빠른 조정 | **부분 완료** — 물건 상세의 `+/−` 는 있다. **목록 스와이프 차감**만 제외 | 목록에서 화면 전환 없이 차감하는 경로. 상세를 열어야 한다 |
| AC17 | 임계치 푸시 알림 | 제외 | **떨어진 걸 앱을 열어야만 안다.** 구매 리스트는 만들되 알림은 없다 |
| AC19 | "구매 완료" 처리 | 제외 | 전용 버튼. **기능 자체는 잃지 않는다** — 아래 참조 |
| AC23 | 10초 내 타기기 반영 | 제외 | **실시간 동기화 없음.** 가족이 넣은 물건은 화면을 다시 열어야 보인다 |

**AC19 는 빼도 흐름이 끊기지 않는다.** `t40_sync_shopping_list` 가 이미 양방향이다 —
수량이 임계치 **이하로 전이하면 편입**, **초과로 복귀하면 자동 해제**한다. 사서 채운 뒤
물건 상세에서 `+` 를 누르면 리스트에서 알아서 빠진다. 전용 RPC(`resolve_shopping_item`)
는 편의였을 뿐이다. → **RPC 는 DB 에 남겨 둔다.** 나중에 필요해지면 UI 만 붙이면 된다.

**AC23 제외의 실제 영향**: Realtime 구독이 없어도 TanStack Query 가 화면 진입·
staleTime 만료 시 재조회하므로 **완전히 안 보이는 것은 아니다.** 화면을 다시 열면 보인다.
다만 "아내가 방금 넣은 것이 내 화면에 뜨는" 경험은 없다. 계획의 Pre-mortem #3 이
경계하던 지점이므로, 가족이 동시에 정리하는 상황이 잦아지면 되살릴 후보 1순위다.

**남는 DB 자산** (지우지 않는다 — 지우려면 마이그레이션이 필요하고, 되살릴 때 다시 만들어야 한다):
`t50_broadcast` 트리거, `device_push_tokens` 테이블, `resolve_shopping_item` RPC.
전부 미사용 상태로 남지만 동작에 영향은 없다.

**M7 의 남은 범위**: AC16(임계치 → 구매 리스트 화면) · AC18(구매 링크 외부 열기) 둘뿐이다.

#### M7·M8 완료 + UI 개편 + 국제화 (2026-08-30)

**M7 (축소 범위)** — AC16·AC18 완료. "살 것" 탭. 편입·해제는 `t40_sync_shopping_list`
트리거가 하고 화면은 읽기 위주다. 구매 링크는 외부 브라우저로 연다.

**M8 완료**
- **AC20 (3종 전부)** — 물건·박스·장소 상세에 "누가 언제 수정".
  ⚠ 뷰(`container_summary`/`location_summary`)에서는 조인이 안 된다 — **뷰는 FK 를 갖지
  않아** PostgREST 가 관계를 못 찾는다. `useAudit` 이 기본 테이블에서 따로 읽는다.
- **AC21** — 물건 상세의 변경 이력 타임라인. ⚠ 정렬은 `id` 다(`created_at` 은 트랜잭션
  시작 시각이라 한 트랜잭션의 이벤트가 동률이 된다 — M1 에서 이미 겪은 함정).
- **AC24** — 휴지통 + 복구. 물건·박스·장소 3종.
  ⚠ **박스를 복구해도 안에 있던 물건은 돌아오지 않는다.** 박스를 지울 때
  `t45_detach_items` 가 `container_id` 를 null 로 풀어 장소 직속으로 남겼기 때문이다.
  기대와 다르므로 복구 전에 확인 대화상자로 알린다.

**UI 개편 (사용자 요청)**
- **하단 탭 4개**: 찾기 / 보관 장소 / 살 것 / 더보기. 첫 화면은 **찾기**다 —
  앱을 여는 이유는 "그거 어디 뒀지" 이지 "장소를 관리하자" 가 아니다.
- **찾기 = 사진 격자**(2열, 무작위, 무한 스크롤) + 검색창 + QR 스캔 + 장소 필터 칩 + FAB.
  ⚠ 무한 스크롤을 **서버 페이지네이션으로 만들지 않았다.** 무작위 정렬 + 페이지네이션은
  페이지마다 순서가 다시 섞여 중복·누락을 낳는다. 전체를 메모리에 두고(§4.6) 한 번만
  섞은 뒤 그릴 개수만 늘린다. 개수 제한의 진짜 이유는 렌더가 아니라 **썸네일 서명**이다(R13).
- **등록 2단계**: 카메라 전체화면 → 폼. 사진첩 불러오기 추가(`expo-image-picker`, 네이티브).
  `/add/new` 로 들어오면 목적지를 2단계에서 고른다 — 그래서 FAB 이 성립한다.
- **썸네일 320 → 640px**. 격자 카드가 490 물리 픽셀인데 320 을 1.6배로 늘려 그려
  뭉갰다. 기존 사진은 더보기의 "사진 화질 개선" 이 원본에서 다시 만든다(원본은 불변).

**국제화** — 한국어/English. 시스템 언어가 한국어면 한국어, 아니면 영어.
- ⚠ `expo-localization` 을 쓰지 않았다. `Intl.DateTimeFormat().resolvedOptions().locale`
  이 Hermes 에서 동작한다(실기기 `ko-KR` 확인) → **네이티브 의존성도 재빌드도 없다.**
- 사전은 **한국어가 기준 타입**이다. 영어가 키를 빠뜨리면 컴파일이 막힌다 —
  번역 누락이 런타임에 빈 문자열로 새지 않는다.
- ⚠ `as const` 를 붙이면 안 된다. 값이 리터럴 타입으로 굳어 영어 사전이 만족할 수 없다.

**테마 선택** — 시스템/라이트/다크. 색 결정 지점은 `useTheme()` 하나로 유지했다.

**키보드 가림 (실사용 보고)** — `edgeToEdgeEnabled=true` 에서는 `adjustResize` 가 창을
줄이지 않아 `KeyboardAvoidingView` 의 안드로이드 기본 동작이 **아무 일도 하지 않는다.**
`useKeyboardHeight()` 로 높이를 읽어 스크롤 여백에 더한다.

#### 디자인 토큰 정리 · UI 점검 (2026-08-31, 사용자 요청)

**점검에서 드러난 실태**
| | 정리 전 | 정리 후 |
|---|---|---|
| 글자 크기 | **24종** (11.5·12.5·13.5·14.5·15.5·16.5 등 반포인트가 절반) | 11종 척도 |
| 모서리 반경 | 13종 | 5종 토큰 + 기하학적 원형 |
| 하드코딩 색 | 38곳 | **0곳** |

12 와 12.5 는 사람이 구분하지 못한다 — 의도가 아니라 화면을 하나씩 만들며 쌓인 소음이었다.

**만든 것** (`src/lib/theme.ts`)
- `type` — 이름이 쓰임새다(`caption`/`body`/`title`/`h1`). 숫자를 외우지 않게.
- `radius` — `xs/sm/md/lg/full`
- `space` — 4의 배수
- `overlay` — ⚠ **테마 토큰이 아니다.** 사진 위의 배지·카메라 UI 는 밑에 깔린 것이
  이미지라 라이트/다크와 무관하게 같은 대비가 필요하다. 팔레트에 섞으면
  "테마를 따라가야 하는 색" 과 헷갈린다.

**⚠ 원형 반경은 토큰화하지 않았다.** `borderRadius: 29` 같은 값은 크기(58)의 절반이라
**기하학적 값**이다. 토큰으로 바꾸면 원이 깨진다. 자동 치환에서 제외했다.

**⚠ 자동 치환의 함정**: JSX 속성(`color="#fff"`)을 치환하면 `color=overlay.fg` 가 되어
중괄호가 빠진다. 파싱이 깨져서 곧바로 드러났지만, 속성과 객체 리터럴을 같은 규칙으로
바꾸면 안 된다는 뜻이다.

**아이콘을 SVG 로** (`components/Icon.tsx`) — 이모지·문자(⚙ ◧ ⋯)를 아이콘으로 쓰면
기기·폰트마다 모양이 달라지고 색을 따라오지 않는다. 24px 격자에 stroke 로 그린다.
탭 아이콘의 `color` 는 `ColorValue` 다(`string` 아님) — 좁히면 탭에서 못 쓴다.

**더보기 화면 재구성** — 전체폭 버튼 나열 → 묶음 카드 + 줄(아이콘·라벨·값·꺾쇠).
언어·테마는 값을 보여주고 누르면 시트가 올라온다.

**"사진 화질 개선" 제거** (사용자 결정) — 썸네일 기준을 640 으로 올린 뒤 한 번 쓰고
역할이 끝났다. `useRegenerateThumbs` 와 그것만 쓰던 헬퍼(`downloadToCache`/`makeThumb`/
`uploadFile`)도 함께 지웠다. 남겨 두면 다음에 누가 쓰다 문제가 생긴다.

#### ⚠ 구매 리스트 기준 변경 · 물건 상세 단순화 (2026-08-31, 사용자 결정)

**AC16 의 규칙이 바뀌었다: 임계치 → 수량 0.**
마이그레이션 `20260831000100_shopping_on_zero.sql` 에서 `t40_sync_shopping_list` 를 교체했다.
- ⚠ `items.threshold` 컬럼은 **드롭하지 않았다.** 되돌릴 수 없고 값이 들어 있을 수 있다.
  트리거와 UI 가 보지 않을 뿐이다 — 되살리기로 하면 컬럼이 그대로 있다.
- 옛 기준으로 편입돼 있던 미해결 항목 중 **수량이 0 이 아닌 것**은 마이그레이션에서 한 번
  정리했다. 새 규칙에서는 살 이유가 없는데, RLS 가 자동 항목의 수동 삭제를 막으므로
  사용자가 스스로 뺄 수 없기 때문이다.
- pgTAP 을 새 규칙으로 다시 썼다(149건). **"임계치 이하라도 0 이 아니면 편입하지 않는다"**
  를 명시적으로 검사한다 — 기준이 바뀌었다는 사실 자체를 테스트가 지킨다.

**물건 상세에서 수정 모드를 없앴다.**
보기 화면과 수정 화면이 따로면 고칠 때마다 "수정" 을 먼저 눌러야 한다. 물건 정보는
자주 손대는 것이라 그 한 번이 계속 쌓인다. 모든 칸이 항상 입력칸이고,
**포커스를 벗어날 때 바뀐 값만** 저장한다.
- ⚠ 저장 뒤 재조회가 와도 폼을 되돌리지 않는다. 되돌리면 입력 중이던 내용이 사라진다
  (이 프로젝트에서 이미 겪은 함정).
- 이름을 비우면 되돌린다 — 필수값이라 빈 채로 저장할 수 없다.

**제거한 것**: 단위(`unit`), 알림 임계치(`threshold`) — UI 에서만. 컬럼은 보존.

**재고 없음 표시**: 격자에서 사진을 짙게(0.72) 덮고 가운데 크게 쓴다. 구석의 작은 배지로는
훑어볼 때 놓친다 — 이 앱의 격자는 "빠르게 훑는" 화면이므로 멀리서 읽혀야 한다.

**AC 영향**: AC16 은 유지되나 **판정 기준이 바뀌었다**(임계치 → 0). AC17(푸시)은 이미 제외됨.

#### 카테고리를 독립 엔티티로 (2026-08-31, deep-interview 4라운드 · 모호도 14.5%)

스펙: `.omc/specs/deep-interview-categories.md`

**전**: `items.category` 자유 문자열. 목록이 없어 오타·유사 중복이 쌓이고 관리 불가.
**후**: `categories` 테이블 + `items.category_id`. 물건은 만들어 둔 것 중에서 **고르기만** 한다.

**⚠ 이 기능의 안전장치는 코드가 아니라 FK 다.**
`items.category_id ... ON DELETE SET NULL` — 카테고리를 지우면 물건의 분류만 비워지고
물건은 남는다. CASCADE 였다면 카테고리 하나에 물건 수십 개가 함께 사라진다.
애플리케이션에서 물건을 update 하는 방식은 **일부러 택하지 않았다** — 규칙이 두 곳에
있으면 한쪽만 고쳐지는 날이 온다. pgTAP 이 삭제 후 물건 수와 `confdeltype='n'` 을 모두 검사한다.

**인터뷰가 드러낸 것**
- "삭제" 의 뜻이 갈림길이었다 → 물건은 남기고 분류만 비운다
- 자유 입력 + 목록 병행은 두 집합이 어긋나 목록을 무의미하게 만든다 → **목록 전용**
- 기존 값은 이관하지 않고 **버린다** (값이 한 종류, 물건 8개 규모라 부담 없음)
- (Contrarian) **카테고리가 지금 어디에도 안 쓰인다** — 관리만 붙이면 쓸 데 없는 목록이
  된다 → 격자 카드 표시(AC-C9)까지 넣어 최소한의 쓸모를 확보

**테스트를 쓰면서 겪은 것 (다음에 또 밟지 않도록)**
- ⚠ **픽스처 상태를 가정하지 말 것.** "가구 A 에 물건 1개" 를 전제했는데 앞선 테스트들이
  만들어 실제로 4개였다. 자기 물건을 만들어 그것만 세도록 자립적으로 다시 썼다.
- ⚠ **크로스테넌트는 초대 이전에 검사할 것.** 검증 12 에서 사용자 b 가 `accept_invite` 로
  가구 A 에 **합류한다.** 그 뒤에 검사하면 b 는 외부인이 아니라 멤버다
  (`is_household_member(ha) = true` 로 확인). 검증 2 블록으로 옮겼다.
- 새 테이블을 만들면 `supabase gen types` 를 다시 돌려야 한다. 안 그러면
  `.from('categories')` 가 타입 오류가 난다.

**남긴 것**: `items.category` (text) 컬럼은 드롭하지 않았다 — 되돌릴 수 없다. 읽지 않을 뿐이다.
(임계치 `threshold` 를 남겨둔 것과 같은 판단)

**기기 검증**: 중복 이름 차단(대소문자·공백 무시) → 물건에 부착 → 카드에 표시 →
**카테고리 삭제 후 원격 DB 에서 물건 10개 전부 생존, category_id 만 NULL 확인.**

### M7 — 수량 · 임계치 · 구매 리스트 · 푸시 · Realtime
**산출물**: 물건 상세의 +/− 조정(`adjust_item_quantity` RPC), 목록 스와이프 빠른 차감, 임계치 설정 UI, 구매 리스트 화면, 구매링크 외부 열기, **`resolve_shopping_item` RPC로 "구매 완료" 처리**(수량 갱신 + `resolved_by` 서버 스탬프, P3), `device_push_tokens` 등록·갱신·`DeviceNotRegistered` 정리, Edge Function `send-threshold-push`, 가구 알림 on/off, Realtime 구독 + invalidate.
**완료 조건**: **물건 상세에서 +/− 버튼 1탭으로 수량이 즉시 바뀌고(RPC 왕복 중에도 UI가 막히지 않는다), 목록 화면에서 스와이프 제스처로 화면 전환 없이 −1 차감이 된다**(AC15 — 임계치 흐름만 보고 통과시키지 않는다). 수량을 임계치 이하로 내리면 구매 리스트에 자동 편입되고(AC16) 구성원 기기에 푸시가 온다(AC17). 알림을 끄면 오지 않는다. 구매링크 탭 시 외부 브라우저가 열린다(AC18). 구매 완료 시 수량이 갱신되고 리스트에서 빠진다(AC19). **2기기 동시 조작 테스트**: A기기에서 추가한 물건이 B기기에 10초 이내 나타나고, 중복 표시나 깜빡임이 없다(AC23, Pre-mortem #3).
**충족 AC**: AC15, AC16, AC17, AC18, AC19, AC23

### M8 — 감사 이력 UI · 휴지통
**산출물**: **물건·컨테이너·장소 상세 모두**에 "홍길동님이 3시간 전 수정" 표시(AC20 원문이 세 엔티티를 전부 요구한다), 물건의 변경 이력 타임라인 화면, 휴지통(삭제된 항목 30일) + 복구, **안전장치를 갖춘 pg_cron 정리 작업**(대상 100건 초과 시 중단 + `maintenance_log` 기록 + `deleted_at is not null` 명시, §4.4).
**완료 조건**: **물건·컨테이너·장소 세 엔티티 각각의 상세 화면에서** 생성자·최종수정자·수정시각이 표시된다(AC20 — 물건만 확인하고 통과시키지 않는다). 두 사용자가 서로 다른 필드를 동시에 수정해도 양쪽 변경이 모두 남는다(AC22). 삭제 후 휴지통에서 복구된다. 31일 경과분이 cron으로 사라지고 Storage 객체도 함께 정리된다(AC24). **101건이 만료된 상태를 인위적으로 만들어 cron을 돌리면 삭제가 실행되지 않고 `maintenance_log`에 `aborted_reason`이 기록된다** (Architect S4).
**충족 AC**: AC20(UI), AC21, AC22, AC24

### M9 — 온보딩 · 출시 준비
**산출물**: 빈 상태 온보딩(장소→박스→첫 물건), 앱 아이콘/스플래시, 스토어 스크린샷, 개인정보처리방침 페이지·URL, iOS 카메라/사진/알림 권한 문구(한국어), Android 권한 선언, **🔒 게이트: Sign in with Apple**(가이드라인 4.8 — 구글을 제공하는 이상 iOS 빌드에 반드시 포함되어야 한다. M2에서 연기했으므로 **여기서 구현하지 않으면 iOS 제출 자체를 하지 않는다.** Android는 이 게이트와 무관하게 출시 가능), EAS 프로덕션 프로파일, **계정 삭제 경로 + cascading 명세**.

> **계정 삭제 cascading (Architect #9 — 스토어 심사 필수 항목)**
> - 사용자가 **유일한 owner가 아닌 가구**: 해당 가구에서 탈퇴만 한다. 가구 데이터는 남는다
> - 사용자가 **유일한 owner이고 다른 멤버가 있는 가구**: 삭제를 막고 **owner 권한을 다른 멤버에게 위임**하도록 요구한다
> - 사용자가 **유일한 멤버인 가구**: 가구와 전 데이터(장소·컨테이너·물건·이력·Storage 사진)를 함께 삭제한다
> - `profiles` 삭제 시 `created_by`/`updated_by` FK가 걸린 행이 남아 있으므로, 삭제 대신 **익명화**(`display_name = '탈퇴한 사용자'`)한다.
> - **⚠ 2026-08-28 원격 검증에서 확인된 사실 (R26)**: 이건 권장사항이 아니라 **강제 조건**이다. `auth.users` 삭제는 `profiles` 로 cascade 되는데 FK 참조가 남아 있으면 `23503` 으로 **실패한다**. 즉 익명화 없이는 계정 삭제 자체가 불가능하다.
>   - 행위자 FK 3종은 마이그레이션 `000700` 에서 `ON DELETE SET NULL` 로 바꿨다 — 사람이 떠나도 초대·이력·구매 기록이라는 **사실은 남고 행위자만 비워진다**. 표시할 때 "탈퇴한 사용자" 로 폴백한다
>   - 소유자 FK(`created_by`/`updated_by`)는 **의도적으로 남겨둔다.** 이것이 익명화를 강제하는 장치이고, 덕분에 AC20/AC21 감사 이력이 살아남는다
>   - M9 의 계정 삭제 RPC 는 `account_deletion_blockers(uuid)` 로 먼저 판정한다: 0이면 하드 삭제, 아니면 익명화
**완료 조건**: EAS Build로 iOS/Android 프로덕션 빌드가 성공하고 TestFlight/내부테스트에 업로드된다(AC29). 데이터가 0건인 신규 계정이 온보딩만 따라가면 첫 물건 등록까지 도달한다(AC30).
**충족 AC**: AC29, AC30

### 5.1 AC ↔ 마일스톤 완전 매핑 (30/30)

| AC | 내용 | 마일스톤 |
|----|------|----------|
| AC1 | 연속 등록 모드 | M4 |
| AC2 | 등록 median ≤10초 | M4 |
| AC3 | 필수 입력은 이름 하나 | M4 |
| AC4 | 사진 백그라운드 업로드 | M4 |
| AC5 | 카테고리 자유입력+자동완성 | M4 |
| AC6 | 검색 ≤300ms | M5 |
| AC7 | 결과행에 썸네일+경로+수량 | M5 |
| AC8 | 부분일치 + 초성 검색 | M5 |
| AC9 | 오프라인 조회 + 배너 | M5 |
| AC10 | 컨테이너 QR 자동 발급 | M3 |
| AC11 | A4 라벨 PDF | M6 |
| AC12 | 스캔 → 2초 내 내용물 | M6 |
| AC13 | 스캔 → 연속 등록 진입 | M6 |
| AC14 | 미등록 QR 안내, 무크래시 | M6 |
| AC15 | 수량 +/− 빠른 조정 (**상세 +/− 1탭 + 목록 스와이프 차감 2종**) | M7 (완료조건·E8에서 2종 각각 검증) |
| AC16 | 임계치 → 구매리스트 자동편입 | M7 (트리거는 M1) |
| AC17 | 임계치 푸시 + on/off | M7 |
| AC18 | 구매링크 외부 열기 | M7 |
| AC19 | 구매 완료 처리 | M7 |
| AC20 | 생성/수정자·시각 표시 (**물건·컨테이너·장소 3종 전부**) | M1(저장 — `t10`이 3종 모두 적용) + M8(3종 전부 UI 표시, E10-1로 검증) |
| AC21 | 변경 이력 append-only + 열람 | M1(저장) + M8(UI) |
| AC22 | 동시 수정 무손실 | M1(부분업데이트·RPC) + M8(검증) |
| AC23 | 10초 내 타기기 반영 | M7 |
| AC24 | soft delete + 30일 휴지통 | M1(스키마·cron) + M3/M8(UI) |
| AC25 | 가입(**구글 / 애플 / 매직링크 3종**) + 가구 생성·참여 | M2 (§4.10) |
| AC26 | owner 초대·추방 / member 읽기쓰기 | M2 |
| AC27 | RLS 크로스테넌트 차단 검증 | M1 |
| AC28 | 비공개 버킷 + 서명 URL | M1 |
| AC29 | EAS 프로덕션 빌드 성공 | M9 |
| AC30 | 빈 상태 온보딩 | M9 |

**누락 0건.**

---

## 6. Risks & Mitigations

| # | 리스크 | 영향 | 완화책 | 담당 마일스톤 |
|---|--------|------|--------|---------------|
| R1 | `household_members` RLS 무한 재귀(42P17) | 앱 전체 쿼리 실패 → 급하게 RLS 완화 → 유출 | 모든 정책이 `SECURITY DEFINER` 헬퍼만 호출. M1에서 재귀 케이스 회귀 테스트 | M1 |
| R2 | 신규 테이블 RLS 활성화 누락 | 조용한 데이터 유출 | `rowsecurity=false` 0개를 CI 검사로 강제. 마이그레이션 1파일 = 테이블+RLS+정책 규칙 | M1 + 전 구간 |
| R3 | 등록 median 10초 초과 | 제품 실패(D1) | M4를 최대 예산 배정 + 실기기 손입력 20개 계측을 게이트로. 미달 시 M5 진행 금지 | M4 |
| R4 | 낙관적 업데이트 ↔ Realtime 중복/깜빡임 | 데이터 신뢰 상실 | 클라이언트 UUID 생성, Realtime은 invalidate만, 부분 PATCH, 수량은 원자 RPC | M1, M4, M7 |
| R5 | 사진 업로드 실패가 조용히 유실됨 | 사진 없는 유령 항목 누적 | 업로드 큐를 영속화, 실패 항목에 재시도 배지, 앱 재시작 시 큐 재개 | M4 |
| R6 | Expo 푸시 토큰이 기기 초기화/재설치로 무효화 | 알림 미도달 | 앱 시작 시마다 토큰 갱신·upsert. Expo Push API의 `DeviceNotRegistered` 응답 시 토큰 삭제 | M7 |
| R7 | `pg_trgm`으로 초성 검색 불가 | AC8 미충족 | 초성은 클라이언트 전담으로 설계 확정(§4.5). 서버 초성 인덱스는 만들지 않음 | M5 |
| R8 | A4 라벨 인쇄 시 여백·스케일이 틀어져 QR 인식 실패 | AC11/AC12 실패 | `@page margin` 고정 + 실제 인쇄물로 스캔 검증을 M6 완료 조건에 포함. QR 최소 20mm 확보 | M6 |
| R9 | 스토어 심사 반려(계정 삭제 경로 부재, 권한 문구 미비, 개인정보처리방침 누락) | 출시 지연 | M9에 계정 삭제·권한 문구·정책 URL을 명시적 산출물로 포함 | M9 |
| R10 | Supabase 무료 티어 프로젝트 일시정지 | 출시 후 앱 다운 | M9 전에 유료 플랜 전환. 백업 정책 확인 | M9 |
| R11 | 범위 확대(Non-Goals 유입) | 출시 무기한 지연 | P5. 구현 중 나온 아이디어는 `.omc/backlog-v2.md`로 축출, 계획 수정 없이 진행 | 전 구간 |
| R12 | 컨테이너 삭제 시 내부 물건의 위치 정보 유실 | 데이터 손상 | `container_id`는 `on delete set null`, `location_id`는 유지. 컨테이너 삭제 UI에서 내부 물건 처리 방식을 명시적으로 확인 | M3 |
| **R13** | 서명 URL(TTL 1시간) 만료·개별 발급으로 목록 썸네일이 깨지거나 느려짐 | AC7 실질 무력화 | `sign_item_photos` 배치 RPC(최대 50), 만료시각 추적, 만료 5분 전 선제 갱신, 동기화 페이로드에 서명 URL 미포함 | M1, M5 |
| **R14** | Universal/App Link 설정 실패로 QR 스캔이 앱 대신 브라우저를 염 | AC12·AC14 실패. **인쇄한 라벨 전부 폐기** | 딥링크 왕복 검증을 M6의 **첫 산출물**로 배치. 통과 전 라벨 인쇄 금지. 앱 미설치용 웹 랜딩 동반 | M6 |
| **R15** | 공개 앱인데 비즈니스 수준 rate limit 부재 — 대량 item 생성/Storage 업로드 남용 | 비용 폭증, 서비스 저하 | **초기 수치를 명시한다 (Critic R-5)**: 가구당 물건 **5,000건 경고 / 10,000건 차단** — §4.6의 클라이언트 전량 동기화 상한 20,000건의 절반 지점에서 미리 막아 검색 성능(AC6)이 무너지기 전에 개입한다. 사용자당 **일일 등록 500건**, 가구당 **Storage 2.5GB**.
  ⚠ 초안의 500MB는 물건 상한과 모순이었다 — 사진이 200KB면 500MB는 **2,500건**에서 차는데 물건 상한은 10,000건이고 경고는 5,000건이다. **저장 한도가 경고보다 먼저 막아버린다.** §4.9의 이중 저장(215KB/건)을 반영해 10,000건 × 215KB ≈ 2.15GB에 여유를 준 **2.5GB**로 올려 두 상한이 같은 지점에서 걸리도록 맞춘다. 5,000/10,000은 `items` BEFORE INSERT 트리거, 일일 상한은 당일 `item_events`의 `created` 건수로 판정. 초과 시 차단 사유를 명확히 안내한다 | M1, M7 |
| **R16** | `t50_broadcast`의 `realtime.send()` 실패가 원 트랜잭션을 롤백해 CRUD가 막힘 | 편의 기능 장애가 핵심 기능을 차단 | 트리거 본문을 `EXCEPTION WHEN OTHERS THEN NULL`로 감싸고, 예외 강제 상황에서 INSERT가 커밋되는지 M1에서 검증 | M1 |
| **R26** | **계정 삭제가 FK 벽에 막혀 아예 불가능** — `auth.users` 삭제가 `profiles` 로 cascade 되는데 행위자/소유자 FK 들이 참조 중이라 23503 | **App Store 필수 요건(AC29) 미충족.** 심사 반려 | 행위자 FK 3종(`invites.used_by`, `item_events.actor_id`, `shopping_list.resolved_by`)을 `ON DELETE SET NULL` 로 변경(마이그레이션 000700). 소유자 FK 는 의도적으로 남겨 **삭제 대신 익명화**를 강제. `account_deletion_blockers()` 로 사전 판정. **원격에서 실제 삭제를 시도해 발견** — 로컬 SQL 테스트는 이 경로를 밟지 않았다 | M1(FK), M9(익명화 RPC) |
| **R25** | 무료 티어 내장 SMTP 가 시간당 수 통 수준이라 **매직링크가 프로덕션에서 사실상 못 쓰임** (429 `over_email_send_rate_limit`) | 폴백 로그인 경로가 죽는다. 구글이 막힌 사용자는 들어올 방법이 없음 | 커스텀 SMTP(Resend/SES 등) 연결. 그전까지는 **구글이 사실상 유일한 실사용 경로**임을 인지. 검증 스크립트도 429 를 실패가 아니라 경고로 구분 | M9 |
| **R24** | Apple 로그인 연기를 잊은 채 iOS 제출 → 4.8 위반으로 반려 | 출시 지연. 심사 왕복에 수일 | M9 완료 조건에 게이트로 명시(§4.10). Android는 영향 없으므로 먼저 출시 가능 | M9 |
| **R21** | OAuth 설정 실패로 소셜 로그인이 안 됨 — Android 릴리스 키스토어 SHA-1이 디버그와 달라 EAS 빌드에서만 깨지거나, 리다이렉트 URL 불일치 | 첫 화면에서 막힘. **디버그에서 되던 것이 스토어 빌드에서 깨져 늦게 발견됨** | Google OAuth 클라이언트를 iOS·Android·Web 3종으로 등록하고 **EAS 릴리스 키스토어의 SHA-1로 사전 등록**. M2 완료 조건을 시뮬레이터가 아니라 **EAS 개발 빌드 실기기**에서 판정 | M2, M9 |
| **R22** | Apple이 이름을 **최초 인증 때 한 번만** 주는데 그때 저장하지 않아 표시 이름을 영원히 못 받음 | AC20의 "홍길동님이 수정"이 UUID나 공백으로 렌더됨. 되돌리려면 사용자가 앱을 Apple ID 설정에서 해제 후 재인증해야 함 | 최초 인증 응답의 이름을 **즉시** `profiles`에 기록. 비어 있으면 온보딩에서 표시 이름 입력을 강제 (§4.10) | M2 |
| **R23** | 초대 코드가 OAuth 리다이렉트 왕복에서 유실되어 가입은 됐는데 가구에 못 들어감 | 초대받은 가족이 빈 상태로 떨어짐. 원인 파악이 어려움 | 코드를 OAuth `state` 또는 로컬 보관소에 보존해 복귀 후 복원. 실패해도 온보딩에서 재입력 경로 제공 (§4.10) | M2 |
| **R19** | 무료 티어 프로젝트가 **7일 미사용으로 일시정지**되어 앱이 죽고 수동 복구가 필요 | 가족이 여행 다녀오면 앱이 안 열림. "데이터 신뢰도" 축이 직접 무너짐 | 앱에서 정지 상태를 감지해 "서버를 깨우는 중" 안내. 외부 스케줄러로 주 1회 헬스 체크. 유료 전환 시 제거 (§4.11) | M0, M9 |
| **R20** | 무료 티어에 **자동 백업이 없어** 데이터 유실 시 회복 불가 | 이 앱의 전 가치가 "적힌 것이 맞다"인데 그게 사라짐 | 주 1회 외부 `pg_dump` 덤프 + 사진 경로 목록 포함. **M1 완료 조건에 복원 리허설 1회** (§4.11) | M1 |
| **R18** | RLS를 활성화했으나 정책을 안 써서 테이블이 **전면 거부**가 됨 (R2의 반대 방향 실패) | 앱이 아무것도 못 읽음. `households`/`locations`/`containers`가 막히면 M3부터 동작 불가 | §4.3에 11개 테이블 정책을 전부 명시하고 커버리지 요약표를 유지. M1 완료조건에서 `pg_policies` 대조 검증 | M1 |
| **R17** | 트리거 5개의 실행 순서 의존으로 감사 diff·임계치 판정이 미묘하게 틀어짐 | 조용한 데이터 오류. 통합 테스트로만 발견 가능 | 이름 번호 접두사(`t10`~`t50`)로 순서 고정, diff에서 `updated_by`/`updated_at` 제외, M1에 순서 회귀 테스트 | M1 |

---

## 7. Expanded Test Plan

### 7.1 Unit
| 대상 | 검증 내용 |
|------|-----------|
| 초성 추출 함수 | "건전지"→"ㄱㅈㅈ", 영문·숫자·공백·이모지 혼재, 자음만 있는 문자, NFD 입력 정규화 |
| 검색 매처 | 부분일치, 초성일치, 대소문자, 공백 무시, 빈 질의, 1,000건 입력 시 실행시간 |
| 경로 문자열 빌더 | 컨테이너 있음/없음 두 경우 (`장소 > 박스` vs `장소`) |
| 이미지 리사이즈 | 세로/가로/정사각 원본에서 **썸네일 장변 320 / 원본 장변 1280** 두 장이 생성되고, 썸네일이 20KB 이하 |
| 업로드 큐 리듀서 | 대기→진행→성공/실패→재시도 전이, 앱 재시작 후 복원 |
| A4 라벨 레이아웃 계산 | 컨테이너 1개/21개/22개(2페이지)/0개 |
| QR payload 파서 | 정상 URL, 잘못된 토큰, 다른 스킴, 빈 문자열 |

### 7.2 Integration (DB / API — 실제 Supabase 로컬 인스턴스 대상)
| 대상 | 검증 내용 | AC |
|------|-----------|-----|
| **RLS 크로스테넌트** | 가구 A/B × 전 테이블 × select/insert/update/delete 매트릭스. a의 JWT로 B 데이터 접근 시 전부 차단 | **AC27** |
| RLS 활성화 감사 | `pg_tables`에 `rowsecurity=false`인 public 테이블 0개 | R2 |
| Storage 정책 | 타 가구 경로 업로드/다운로드 거부, 서명 URL 만료 후 403 | AC28 |
| `item_events` 불변성 | 클라이언트 JWT로 insert/update/delete 전부 거부 | AC21 |
| 감사 스탬프 | 클라이언트가 위조한 `updated_by`를 보내도 `auth.uid()`로 덮어씀 | AC20 |
| 이벤트 생성 | 생성/이동/수량변경/삭제/복구 각각에 대해 정확한 `type`의 이벤트 1건 | AC21 |
| 부분 업데이트 무손실 | 두 세션이 각각 `name`/`quantity`만 PATCH → 둘 다 반영 | AC22 |
| 수량 원자성 | 동시 `adjust_item_quantity(-1)` 2회 → 정확히 −2 | AC22 |
| 임계치 트리거 | 임계치 초과→이하 **전이 시에만** shopping_list 삽입. 이미 이하인 상태에서 추가 감소 시 중복 삽입 없음. 임계치 초과로 복귀 시 자동항목 해제 | AC16 |
| soft delete | items 하드 DELETE 거부. `deleted_at` 설정 후 기본 쿼리에서 제외. 31일 경과분 cron 정리 + Storage 객체 동반 삭제 | AC24 |
| 컨테이너-장소 일관성 | 다른 장소의 컨테이너를 물건에 지정 시 거부/자동정렬 | R12 |
| 초대 코드 | 만료 코드 거부, 재사용 거부, 타 가구 코드로 데이터 접근 불가. `accept_invite`가 멤버 추가와 invite 소비를 원자적으로 수행 | AC25, AC26 |
| **RLS 정책 커버리지** | §4.3 요약표 11행 × 4작업 = 44칸을 `pg_policies`와 대조. ⛔ 칸은 실제로 거부되고 ✅ 칸은 실제로 통과하는지 양방향 검증. 특히 `households` SELECT, `locations`/`containers` CRUD, `profiles` 동일가구 조회가 열려 있는지 | R18, AC20, AC25 |
| **소셜 로그인 계정 병합** | 같은 이메일로 구글과 매직링크를 각각 시도했을 때의 동작이 정의되어 있고(연결 또는 명확한 거부), 계정이 조용히 둘로 갈라지지 않는다 | AC25 |
| **가구 생성 닭·달걀** | `create_household` RPC 없이 `households`에 직접 INSERT 시도 → 거부. RPC 경유 시 가구 + owner 멤버십이 원자적으로 생성됨 | AC25 |
| **초대 조회 경로** | 비멤버가 `invites`를 직접 SELECT → 0행. `accept_invite(code)` RPC로는 성공 | AC25 |
| **트리거 실행 순서** | `t10`~`t50` 이름순 실행 확인. `t30`의 diff에 `updated_by`/`updated_at` 미포함 | R17 |
| **broadcast 예외 격리** | `realtime.send()`가 실패하도록 강제한 상태에서 items INSERT/UPDATE가 정상 커밋 | R16 |
| **soft delete ↔ 쇼핑리스트** | 미해결 자동항목이 있는 물건 soft delete → 항목 해제. 30일 후 하드삭제 시 미해결 항목이 남아 있지 않음 | AC16, AC24 |
| **감사 필드 위조 차단** | 클라이언트 JWT로 `invites.used_by` / `shopping_list.resolved_by` 직접 UPDATE 시도 → 거부. RPC 경유 시에만 `auth.uid()`로 기록 | P3 |
| **pg_cron 안전장치** | 만료 대상 101건 상태에서 cron 실행 → 삭제 미수행 + `maintenance_log.aborted_reason` 기록. `deleted_at is null`인 행이 절대 삭제되지 않음 | R11(cron), S4 |
| **배치 서명 URL** | `sign_item_photos`가 50개 초과 요청을 거부, 타 가구 경로를 섞어 보내면 거부 | R13, AC28 |
| 계정 삭제 cascading | ① 멀티 멤버 가구의 non-owner 탈퇴 ② 유일 owner + 타 멤버 존재 시 삭제 차단 ③ 유일 멤버 가구 전체 삭제 ④ `profiles` 익명화 후 감사 이력 보존 | AC29(심사) |

### 7.3 E2E (실기기, Expo dev build)
| # | 시나리오 | AC |
|---|----------|-----|
| E1 | 신규 가입 → 가구 생성 → 온보딩 따라 장소·박스·첫 물건까지 | AC25, AC30 |
| **E1-1** | **EAS 개발 빌드 실기기에서 2종 로그인 각각 성공** — 구글(iOS·Android), 매직링크. 시뮬레이터로 대체하지 않는다 (R21). *Apple은 연기* | AC25 |
| **E1-2** | **애플 "이메일 가리기"로 가입 → 표시 이름이 확보되어** 다른 기기의 물건 상세에 "○○님이 수정"이 정상 렌더된다 (R22) | AC20, AC25 |
| **E1-3** | **초대 링크로 진입한 비회원이 구글 로그인 왕복 후 그 가구에 참여**한다. 왕복 중 코드가 유실된 경우에도 온보딩에서 재입력해 참여할 수 있다 (R23) | AC25, AC26 |
| E2 | 초대 코드로 2번째 계정 참여 → 같은 데이터 확인 → owner가 추방 → 데이터 접근 불가 | AC26 |
| E3 | **연속 등록 20개 손입력, median ≤10초 계측** (게이트) | **AC1~AC5** |
| E4 | 1,000건 상태에서 검색 ≤300ms, "ㄱㅈㅈ"→"건전지", 결과행에 경로·수량·썸네일 | AC6~AC8 |
| E5 | 비행기 모드: 검색·조회 동작 + 오프라인 배너 + 저장 시 명확한 오류 | AC9, C2 |
| E6 | A4 라벨 21개 실제 인쇄 → 박스 부착 → 스캔 → 2초 내 내용물 → 1탭으로 연속 등록 | AC11~AC13 |
| E7 | 무작위 QR / 타 가구 QR 스캔 → 안내 메시지, 무크래시 | AC14 |
| E8 | **물건 상세 +/− 1탭 조정 → 목록에서 스와이프 −1 차감(화면 전환 없음)** → 임계치 이하 도달 → 구매리스트 자동 편입 → 타 기기 푸시 수신 → 링크 외부 브라우저 열기 → 구매 완료 후 리스트에서 제거 | AC15~AC19 |
| E9 | **2기기 동시**: A가 추가/수정 → B에 10초 내 반영, 중복·깜빡임 없음. 동시 수량 조작 정합 | AC22, AC23 |
| E10 | 물건 삭제 → 휴지통 확인 → 복구 → 이력 타임라인에 deleted/restored 기록 | AC21, AC24 |
| **E10-1** | **A계정이 장소·컨테이너·물건을 각각 수정 → B계정에서 세 엔티티의 상세를 열어 "A님이 방금 수정"을 각각 확인** (AC20의 "모든 물건·컨테이너·장소") | AC20 |
| E11 | EAS 프로덕션 빌드 → TestFlight/내부테스트 설치 → E1 재수행 | AC29 |
| **E12** | **딥링크 왕복** (M6 선행 게이트): 앱 설치 상태에서 QR 스캔 → 앱이 열림. 앱 삭제 후 스캔 → 웹 랜딩 → 스토어 유도. iOS/Android 양쪽 | R14, AC12 |
| **E13** | 네트워크 지연 3초 상태에서 연속 5개 등록 → 5건 전부 서버 반영. 서버 거부 강제 시 항목이 사라지지 않고 "동기화 실패" 배지 | AC1~AC4, S3 |
| **E13-1** | **사진 포함 등록 → Storage 업로드만 실패하도록 강제 → 물건 레코드는 그대로 남고 사진 재시도 배지가 뜬다 → 재시도 시 업로드 성공하고 배지가 사라진다** (AC4 원문의 "업로드 실패 시 재시도 가능하며 물건 데이터는 이미 저장된 상태다"를 E2E로 증명. 단위 테스트의 큐 리듀서 검증만으로는 부족) | AC4, R5 |
| **E14** | 3,000건 상태에서 목록 끝까지 스크롤 + 1시간 이상 앱 유지 → 썸네일 로드 실패 0건. **네트워크 계측으로 전체 스크롤 전송량이 60MB 이하임을 확인** — 원본을 내려받고 있으면 600MB가 나오므로 §4.9 위반이 즉시 탐지된다 | AC7, R13, §4.9 |
| **E15** | 신규 가구원의 초기 전량 동기화: 진행률 표시, 부분 결과부터 검색 가능, 완료까지 앱이 멈추지 않음 | AC6, R13 |

### 7.4 Observability
| 항목 | 구현 |
|------|------|
| **등록 사이클 타임** | §5 M4에 정의된 구간(1번째: 첫 입력 행동~폼 리셋 / 2번째 이후: 폼 리셋~폼 리셋). dev 빌드는 콘솔, 프로덕션은 익명 집계(p50/p95). **AC2의 지속적 감시 지표** |
| **등록 서버 반영 지연** | 낙관적 삽입 시점 ~ 서버 INSERT 확정 시점. **AC2와 분리된 별도 지표.** 이 값이 커지면 재시도 큐가 차오르고 §2.4의 가드레일(상한 10건)에 걸리기 시작한다 — 조기 경보 |
| **검색 응답 시간** | 질의 입력~결과 렌더 구간. p50/p95 (AC6) |
| **스캔→표시 시간** | 바코드 인식~컨테이너 화면 렌더 (AC12) |
| **사진 업로드 성공률** | 큐 성공/실패/재시도 카운터. 실패율 상승은 R5의 조기 경보 |
| **푸시 도달률** | Expo Push API 응답의 `ok`/`DeviceNotRegistered` 집계 (R6) |
| **Realtime 반영 지연** | 서버 `updated_at` ↔ 타기기 수신 시각 차이 (AC23) |
| 오류 추적 | Sentry(Expo 플러그인). RLS 거부(42501)와 재귀(42P17)는 **별도 알림 채널**로 분리 (R1/R2 조기 경보) |
| DB | Supabase 대시보드의 느린 쿼리 로그. `items_name_trgm` 인덱스 사용률 확인 |

---

## 8. Verification Steps (최종 수용 절차)

1. `supabase db reset` 후 §7.2 통합 테스트 스위트 전체 실행 → 전부 통과. 특히 **RLS 크로스테넌트 매트릭스 100% 차단** 확인 (AC27)
2. `select tablename from pg_tables where schemaname='public' and rowsecurity=false` → **0행**
3. 실기기에서 E3(연속 등록 20개) 수행 → **median ≤10초 로그 첨부** (AC2). 미달 시 수용 거부
4. 1,000건 시드 후 E4 수행 → **검색 ≤300ms 실측 첨부** (AC6)
5. A4 라벨을 **실제로 인쇄**해 E6 수행 → 스캔 ≤2초 확인 (AC11, AC12)
6. 2기기로 E9 수행 → 10초 내 반영, 중복 없음 (AC23)
7. E8로 푸시 실제 수신 확인 (AC17)
8. AC1~AC30 체크리스트를 한 줄씩 대조해 30/30 표시
9. Non-Goals 9항목이 코드베이스에 유입되지 않았음을 확인 (오프라인 쓰기 큐, 3단계 장소, 라벨프린터 SDK, 바코드 상품 조회, AI 인식, 결제 SDK, 유통기한 필드, 웹 앱, 구독 SDK 부재). **특히 M4의 재시도 큐가 상한 10건·앱 종료 시 미유지 규약을 지키는지 확인** — 이 규약이 깨지면 오프라인 쓰기 큐가 되어 C2 위반이다
9-1. E12(딥링크 왕복)가 **라벨 인쇄 이전에** 통과했음을 확인 (R14)
9-2. `maintenance_log`에 cron 실행 기록이 남고, 중단 안전장치가 실제로 동작함을 확인 (S4)
10. EAS 프로덕션 빌드 성공 + 내부 배포 설치 확인 (AC29)

---

## 9. ADR — 홈 스토어 아키텍처 결정 기록

**상태**: Architect(APPROVE_WITH_CHANGES, 10건) + Critic(REVISE, 5건) 검토 반영 완료. Critic 재검토 대기
**일자**: 2026-08-28

### Decision
집안 물건 인벤토리 앱을 **Expo(managed) + React Native + TypeScript** 클라이언트와 **Supabase(Postgres + Auth + Storage + Realtime + Edge Functions + pg_cron)** 백엔드로 구축한다. 멀티테넌트 격리는 **Postgres RLS**로, 감사 이력과 임계치 편입은 **DB 트리거**로 강제한다. 한글 초성 검색은 **클라이언트 메모리 인덱스**가 담당하고, 서버는 `pg_trgm`으로 부분일치만 지원한다. 오프라인 쓰기 동기화 엔진은 만들지 않는다.

### Drivers
1. **D1 등록 속도(AC2 ≤10초)** — 제품 생존 조건
2. **D2 멀티테넌트 격리 정확성(AC27)** — 공개 앱이므로 실패가 되돌릴 수 없음
3. **D3 출시까지의 구현 비용** — 관리형 서비스로 되는 것을 직접 만들지 않음

### Alternatives considered
- **Firebase (Firestore/Storage/FCM)** — Security Rules로 온톨로지의 다대일 관계를 강제하려면 `get()` 조회가 필요하다. Custom Claims에 `household_ids`를 넣는 대안이 존재하나, 1KB 제한과 토큰 갱신 전파 지연(추방된 멤버가 최대 1시간 접근 가능 → AC26 위협)이라는 자체 문제를 낳는다. RLS는 매 쿼리마다 현재 멤버십을 조회하므로 두 문제가 없다(D2 열세). 부분일치 검색을 **네이티브로 지원하지 않아** n-gram 비정규화 또는 외부 검색 서비스가 필요하다(D3 열세). C2(온라인 전용) 확정으로 Firebase 최대 강점인 오프라인 캐시의 가치가 소멸했다.
- **자체 Node 백엔드 + Postgres** — 벤더 독립성을 얻지만 인증·스토리지·실시간·푸시·크론·배포를 전부 자체 구축해야 해 D3가 크게 나빠지고, 격리가 애플리케이션 코드 정확성에 의존해 D2도 열세다. Supabase가 순수 Postgres라 이 옵션의 유일한 장점(탈출 가능성)이 이미 상당 부분 확보되어 있다.
- **Neon (서버리스 Postgres) + 조립형 구성** — Neon은 Postgres만 제공하므로 인증·사진·실시간·푸시·크론을 별도 벤더로 조립해야 한다. **DB 브랜칭은 이 프로젝트에 실질적 가치가 있다** — 최대 리스크가 RLS 정책 정확성인데 PR마다 격리된 DB 사본에서 마이그레이션을 검증할 수 있기 때문이다. 이것을 포기하는 것이 채택안의 실제 비용이다. 그럼에도 기각한 이유: (a) Neon의 Object Storage·Functions가 **베타**이고 (b) **실시간 구독이 없다** — 이 앱의 두 핵심인 사진과 다중 사용자 동기화가 정확히 Neon이 약한 지점이다. (c) 무료 티어 기준으로도 Neon 조립이 Supabase 단독보다 얻는 것이 적으면서 벤더는 4~5개가 된다.
- **Upstash** — Redis + QStash로, 관계형 모델(11개 테이블·조인·RLS·트리거)을 담을 수 없어 **대안이 아니다**. 보완재로 쓸 자리는 `@upstash/ratelimit`(R15)과 QStash(pg_cron 대체) 둘인데, 양쪽 다 이미 Postgres 트리거와 pg_cron으로 덮여 있어 벤더를 추가할 이유가 없다.
- **사진만 Cloudflare R2로 분리** — R2 무료는 10GB + **egress 무제한**이라 사진 용량이 Supabase 무료(1GB)의 10배가 된다. **기각이 아니라 연기다** — §4.11에 탈출구로 문서화했다. 지금 옮기지 않는 이유는 인가 경로가 둘이 되기 때문이다: R2는 Postgres RLS를 모르므로 서명 URL 발급 함수에 가구 멤버십 검사를 재구현해야 하고, 이는 D2(되돌릴 수 없는 실패 축)에 직접 닿는다. 유저가 없어 1GB로 충분한 지금 그 비용을 앞당겨 낼 이유가 없다.
- **서버측 초성 검색(자모 분해 immutable 함수 + 생성 컬럼)** — 가구당 물건 수가 수천 건 규모라 클라이언트 선형 탐색이 서버 왕복보다 빠르다. 인덱스·마이그레이션 복잡도만 늘어 기각.
- **`postgres_changes` 기반 Realtime** — RLS 필터링 제약으로 타 가구 이벤트 노출 위험이 있어 **Broadcast from Database**로 대체.

### Why chosen
결정은 D2와 D3에서 갈렸다. RLS는 격리를 **선언적으로, 앱 코드와 무관하게** 강제하며 SQL로 침투 테스트가 가능하다(AC27을 자동 검증 가능한 형태로 만든다). 동시에 Supabase 한 벤더가 D3의 인프라 항목 대부분을 흡수한다. D1은 세 옵션 모두 클라이언트 측 문제라 차이가 없으므로, 남은 두 드라이버에서 모두 우위인 A가 유일한 합리적 선택이다.

### Consequences
**긍정**
- 격리·감사·무결성이 DB 계층에 모여 있어 클라이언트 버그가 데이터 안전성을 깨뜨릴 수 없다
- AC27이 SQL 테스트로 자동 검증 가능해진다
- 관계형 모델이 온톨로지와 1:1로 대응해 조인 질의가 자연스럽다
- EAS로 iOS/Android가 사실상 한 번의 작업으로 출시된다

**부정 / 감수하는 비용**
- RLS 재귀와 신규 테이블 RLS 누락이라는 두 개의 구체적 함정을 떠안는다 → R1/R2와 M1 완료 조건으로 방어
- **로직이 DB 트리거에 모이면서 디버깅 불투명성을 떠안는다** (§2.4 Antithesis). 트리거 5개의 실행 순서 의존은 통합 테스트로만 검증 가능하다 → 번호 접두사 규약(R17)과 M1 순서 회귀 테스트로 방어
- **Realtime 발행이 트랜잭션 안에 있어 예외 보호가 필수다** (R16). 보호를 빠뜨리면 편의 기능 장애가 CRUD를 막는다
- **pg_cron이 RLS를 우회한다** — WHERE 절 버그가 무방비로 데이터를 지운다 → 건수 상한 안전장치(S4)로 방어
- Realtime을 표준 `postgres_changes` 대신 Broadcast로 우회해야 해 구현이 약간 비표준적이다
- 초성 검색이 클라이언트에만 존재하므로, 나중에 서버측 검색 API가 필요해지면 자모 분해를 서버에도 구현해야 한다
- 온라인 전용이므로 신호 없는 곳에서 등록이 불가능하다 — C2로 명시 합의된 트레이드오프
- Supabase 벤더 종속. 완화: 순수 Postgres라 덤프 이관 경로가 존재
- **무료 티어 운용의 두 함정을 떠안는다** — 7일 미사용 일시정지(R19)와 자동 백업 부재(R20). 유료 전환 시 둘 다 사라지지만, 그때까지는 헬스 체크와 주간 덤프로 방어한다 (§4.11)
- **Neon의 DB 브랜칭을 포기한다.** RLS 정책 검증에 실질적 가치가 있었으므로 이는 실제 손실이다. 대신 로컬 `supabase db reset` + 침투 테스트 자동화로 메운다

### Follow-ups
1. M1 완료 시 RLS 침투 테스트를 CI에 상시 편입 (신규 테이블 추가마다 자동 검사)
2. M4의 AC2 계측치를 프로덕션 관측 지표로 승격해 회귀 감시
3. 가구당 물건이 20,000건을 넘으면 클라이언트 전량 동기화 전략을 재검토 (현재 설계의 명시적 상한)
4. Non-Goals 유입 시도는 `.omc/backlog-v2.md`에 기록해 v2 계획의 입력으로 삼는다
5. 출시 전 Supabase 유료 플랜 전환 및 백업 정책 확정 (R10). 전환 시 §4.11의 헬스 체크 스케줄러를 제거하고 가구당 Storage 상한을 800MB → 2.5GB로 올린다
5-1. 사진 저장이 무료 한도 1GB의 70%에 도달하면 §4.11의 R2 탈출구를 실행할지 판단한다. 실행 시 서명 URL 발급 함수에 대한 크로스 테넌트 침투 테스트를 AC27과 동급으로 추가한다
6. 트리거가 6개를 넘어가면 로직 일부를 Edge Function으로 이전할지 재평가한다 (§2.4 Antithesis의 임계점)
7. R15의 soft limit을 관측 데이터에 근거해 hard limit으로 전환할지 출시 3개월 후 결정

---

## 10. Changelog — Architect 검토 반영 (2026-08-28)

| # | Architect 지적 | 우선순위 | 반영 위치 |
|---|----------------|----------|-----------|
| 1 | Realtime broadcast 트리거 예외 보호 | Must | §4.4 `t50_broadcast`, §4.8, M1 완료조건, R16, §7.2 |
| 2 | 낙관적 삽입 실패 경로 미정의 (P1↔P4 긴장) | Must | §2.4 긴장 절 신설, M4 산출물·완료조건, E13, 검증 9 |
| 3 | pg_cron RLS bypass 안전장치 | Must | §4.2 `maintenance_log`, §4.4 경고 블록, M8, §7.2, 검증 9-2 |
| 4 | 트리거 실행 순서 접두사 | Should | §4.4 전체 재작성(`t10`~`t50`), R17, M1, §7.2 |
| 5 | `shopping_list.resolved_by` / `invites.used_by` P3 위반 | Should | §4.2.1 RPC 신설(`accept_invite`, `resolve_shopping_item`), M2, M7, §7.2 |
| 6 | 서명 URL 배치 발급 + 캐시 전략 | Should | §4.2.1 `sign_item_photos`, §4.6 초기동기화 절, R13, M5, E14 |
| 7 | Universal/App Link 설정 검증 선행 | Should | §4.7 경고 블록, M6 산출물 순서 재배치, R14, E12, 검증 9-1 |
| 8 | 가구당 물건 건수 상한 | Could | R15, M1 산출물 |
| 9 | 계정 삭제 sole-owner cascading | Could | M9 명세 블록, §7.2 |
| 10 | soft delete 시 미해결 쇼핑리스트 해제 | Could | §4.4 `t40_sync_shopping_list` ③, M1 완료조건, §7.2 |
| — | Antithesis(DB 중심 설계의 디버깅 비용) | 흡수 | §2.4, ADR Consequences, Follow-up 6 |

## 11. Changelog — Critic 검토 반영 (2026-08-28, iteration 1)

Critic 판정 **REVISE** (5건). 전부 반영.

| # | 심각도 | Critic 지적 | 반영 위치 |
|---|--------|-------------|-----------|
| R-1 | 중 | Option B(Firestore) 평가 과장 — "부분일치 불가능"은 과장(n-gram 워크어라운드 존재), Custom Claims 대안 미언급 | §2.3 Option B Cons 전면 재작성. 결론(A 우위)은 유지하되 열세의 근거를 "get() 불가피"에서 "즉시성·확장성 동시 만족 대안 부재"로 정정 |
| **R-2** | **상** | **AC20이 "표만 채운 매핑"** — AC 원문은 물건·컨테이너·장소 3종을 요구하는데 M8 완료조건은 물건만 검증 | M8 산출물·완료조건에 3종 명시, **E10-1 신설**, §5.1 매핑표에 3종 명기 |
| R-3 | 중 | AC15의 "목록 스와이프 차감"이 어떤 완료조건에도 없음 — E8은 임계치 흐름만 테스트 | M7 완료조건에 "+/− 1탭 + 스와이프 차감" 2종 명시, E8 재작성, 매핑표 보정 |
| **R-4** | **상** | **AC2 측정 구간이 낙관적 삽입과 충돌** — "저장 완료"가 로컬 캐시 삽입이라 사실상 0ms. 망설임 시간은 포함되고 실제 앱 성능은 측정 안 됨 → 핵심 게이트가 무의미해짐 | M4 계측 정의를 **사이클 타임**으로 전면 재정의(1번째: 첫 입력 행동~폼 리셋 / 2번째 이후: 폼 리셋~폼 리셋). §7.4에 "등록 서버 반영 지연"을 **별도 지표로 분리** |
| R-5 | 중 | R15의 soft limit에 수치가 없어 구현 불가. §4.6의 20,000건과 연결 안 됨 | R15에 구체 수치 명시(가구당 5,000 경고/10,000 차단, 일일 500건, Storage 500MB) 및 20,000건 상한과의 관계 서술 |

**Critic이 PASS 판정한 축 (변경 불필요)**: 원칙-옵션 일관성(P1~P5 위반 없음), Pre-mortem 3 시나리오의 실질성, 테스트 4계층의 실행 가능성, **범위 규율 — Non-Goals 9항목 전부 미유입 확인 및 M4 재시도 큐의 3중 가드레일이 오프라인 쓰기 큐로의 미끄러짐을 차단함**, 마일스톤 순서·규모의 현실성, 스펙 요구사항 누락 없음.

---

**Architect가 검증한 사항 (변경 불필요)**: `is_household_member()` SECURITY DEFINER의 재귀 차단 및 권한 상승 무위험, items DELETE 정책 부재로 하드삭제 차단, `item_events.item_id` FK 부재의 타당성, 클라이언트 UUID 생성의 안전성, `adjust_item_quantity` 원자성과 현실적 필요성, Storage `foldername()` 정책의 안전성, 마일스톤 순서(M1→M4 게이트), `device_push_tokens` 추가의 정당성.
