# Deep Interview Spec: 카테고리를 관리 가능한 엔티티로

## Metadata
- Rounds: 4
- Final Ambiguity: **14.5%** (threshold 20%)
- Type: brownfield
- Generated: 2026-08-31
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal | 0.95 | 0.35 | 0.3325 |
| Constraints | 0.80 | 0.25 | 0.2000 |
| Success Criteria | 0.75 | 0.25 | 0.1875 |
| Context | 0.90 | 0.15 | 0.1350 |
| **Total Clarity** | | | **0.855** |
| **Ambiguity** | | | **0.145** |

## Goal

카테고리를 **물건에 붙은 자유 문자열**에서 **가구가 소유하는 독립 엔티티**로 바꾼다.
사용자는 카테고리를 만들고·이름을 고치고·지울 수 있으며, 물건 등록·수정 시에는
**만들어 둔 목록에서 고르기만** 한다.

## Constraints

- **C1. 자유 입력 없음.** 물건 화면에서 카테고리는 목록에서 선택만 한다.
  새 카테고리는 관리 화면에서만 만든다. (오타·유사 중복을 원천 차단)
- **C2. 삭제 = 물건의 카테고리만 비움.** 물건은 사라지지 않는다.
  삭제해도 물건은 그대로 남고 `category_id` 가 null 이 된다.
- **C3. 기존 값은 전부 버린다.** 마이그레이션에서 `items.category` 를 읽어 옮기지 않는다.
  현재 실데이터는 `electronics` 한 종류뿐이고 물건 8개 규모라 부담이 없다.
- **C4. 가구 단위.** 카테고리는 `household_id` 에 속한다. 가구가 다르면 못 본다(RLS).
- **C5. 이름은 가구 안에서 유일하다.** 같은 이름 두 개를 만들 수 없다.
- **C6. 관리 화면은 더보기 탭에 둔다.** 휴지통·라벨 인쇄와 같은 자리 — 가끔 하는 일이다.

## Non-Goals

- **검색·필터에 카테고리를 쓰지 않는다** (이번 범위 아님). 사용자가 "용도는 나중에" 로 판단.
  찾기 탭의 필터 칩은 지금처럼 **장소**만 유지한다.
- 카테고리별 그룹 보기 없음.
- 카테고리 색상·아이콘 없음.
- 카테고리 계층(대분류/소분류) 없음.
- 기본 카테고리 미리 넣기 없음 — 사용자가 직접 만든다.

## Acceptance Criteria

- [ ] **AC-C1** 더보기 탭에 "카테고리" 항목이 있고, 누르면 관리 화면이 열린다.
- [ ] **AC-C2** 관리 화면에서 이름을 입력해 카테고리를 만들 수 있다.
- [ ] **AC-C3** 이미 있는 이름과 같은 이름은 만들 수 없고, 이유가 화면에 보인다.
- [ ] **AC-C4** 카테고리 이름을 고칠 수 있고, 그 카테고리를 쓰는 물건들에 즉시 반영된다.
- [ ] **AC-C5** 카테고리를 지우면 확인을 거친 뒤, 그 카테고리를 쓰던 물건들의 카테고리가
      비워진다. **물건 자체는 하나도 사라지지 않는다** (물건 수를 세어 확인).
- [ ] **AC-C6** 관리 화면의 각 카테고리에 그것을 쓰는 **물건 수**가 표시된다.
      (지우기 전에 영향 범위를 알 수 있어야 한다)
- [ ] **AC-C7** 물건 상세에서 카테고리는 **목록에서 고르는 것**이다. 타이핑 칸이 아니다.
- [ ] **AC-C8** 물건 상세에서 카테고리를 "없음" 으로 되돌릴 수 있다.
- [ ] **AC-C9** 격자의 물건 카드에 카테고리 이름이 보인다.
- [ ] **AC-C10** 타 가구의 카테고리는 조회·수정·삭제 모두 차단된다 (pgTAP 크로스테넌트).
- [ ] **AC-C11** 마이그레이션 후 기존 물건의 카테고리는 전부 비어 있다.

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| "삭제" 는 카테고리 행만 지우는 것 | 그 카테고리를 쓰던 물건은? | **물건은 남기고 카테고리만 비운다** (C2) |
| 자유 입력을 유지하면서 목록도 관리 | 두 집합이 어긋나면 목록이 무의미해진다 | **목록에서만 고른다** (C1) |
| 기존 값을 카테고리로 이관해야 한다 | 되돌릴 수 없는 마이그레이션인데 값이 하나뿐 | **전부 비우고 새로 시작** (C3) |
| 관리 기능만 붙이면 된다 | **카테고리가 지금 어디에도 안 쓰인다** — 만들어도 쓸 데가 없다 | 물건 카드에 표시(AC-C9)까지만. 필터는 Non-Goal |

## Technical Context (조사 결과)

**현재 구현**
- `items.category text` — nullable 자유 문자열. 별도 테이블 없음.
- 인덱스: `items_category on items(household_id, category) where deleted_at is null`
- `useCategories(householdId)` — 물건 500건을 읽어 값을 모아 **빈도순 정렬**해 제안.
  테이블 조회가 아니라 **파생 목록**이다.
- `filterCategories(all, q, limit=6)` — 부분일치 필터.
- 쓰이는 화면: `src/app/item/[id].tsx` 의 `CategoryField` 뿐.
  (등록 화면의 "추가 정보" 를 걷어내면서 그쪽에서는 빠졌다)

**바꿔야 할 것**
- 새 테이블 `categories(id, household_id, name, created_by, updated_by, ...)`
- `items.category_id uuid references categories(id) on delete set null`
  — ⚠ `ON DELETE SET NULL` 이 곧 C2 다. **애플리케이션이 아니라 DB 가 보장한다.**
- RLS: 기존 12 테이블과 같은 패턴 (`is_household_member`), 커버리지 표에 행 추가
- `items.category` 컬럼은 **드롭하지 않는다** — 되돌릴 수 없다. 읽지 않을 뿐.
  (임계치 `threshold` 를 남겨둔 것과 같은 판단)
- 트리거: `t10_stamp_actor` 를 categories 에도 적용 (created_by/updated_by 자동)

## Ontology

| Entity | Fields | Relationships |
|--------|--------|---------------|
| category | id, household_id, name, created_at, updated_at, created_by, updated_by | household 1:N category · category 1:N item |
| item | …기존… + **category_id** (nullable) | item N:1 category (`ON DELETE SET NULL`) |

**유일성**: `unique (household_id, name)` — 가구 안에서 이름 중복 불가 (C5)

## 위험

| # | 위험 | 완화 |
|---|---|---|
| R-C1 | `ON DELETE SET NULL` 을 빠뜨리면 삭제 시 **물건이 CASCADE 로 사라진다** | 마이그레이션에 명시 + pgTAP 으로 "카테고리 삭제 후 물건 수 불변" 검사 |
| R-C2 | RLS 정책 누락 — 새 테이블은 enable 만 하고 정책을 빠뜨리기 쉽다 (M1 에서 실제로 겪음, R18) | `rowsecurity=false 인 public 테이블 0행` 검사가 이미 있음 + 4칸 커버리지 추가 |
| R-C3 | 목록 전용으로 바꾸면 **카테고리가 없을 때 물건에 카테고리를 못 붙인다** | 관리 화면으로 가는 안내를 물건 화면의 빈 상태에 넣는다 |

## Interview Transcript

<details><summary>Q&A (4 rounds)</summary>

**R1** Q: 삭제 시 물건은? → A: **물건의 카테고리만 비워짐** (모호도 100% → 59%)
**R2** Q: 목록 외 자유 입력 허용? → A: **목록에서만 고른다** (59% → 38%)
**R3** Q: 기존 카테고리 값 처리? → A: **전부 비우고 새로 시작** (38% → 26%)
**R4** Q: (Contrarian) 만든 뒤 무엇에 쓰나? → A: **물건 카드에 표시 + 관리만, 용도는 나중에** (26% → 14.5%)

</details>
