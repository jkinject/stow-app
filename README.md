# 어디뒀지 · Stow

집 안 물건이 어디 있는지 찾아주는 앱. 물건을 사진 찍어 어느 방, 어느 박스에 뒀는지
기록해 두면 나중에 이름만으로 바로 찾습니다. 가족이 하나의 집을 함께 씁니다.

한국에서는 **어디뒀지**, 그 밖에서는 **Stow** 로 부릅니다 — 바이너리는 하나고
런처 이름만 기기 언어에 따라 갈립니다.

<https://jkinject.github.io/stow-app/>

## 무엇을 하는 앱인가

| | |
|---|---|
| **넣기** | 사진 찍고 이름만 넣으면 등록. 장소 → 박스 → 물건 3단 구조 |
| **찾기** | 이름·초성으로 검색 (`ㄱㅈㅈ` → 건전지). 오프라인에서도 검색됨 |
| **QR** | 박스마다 QR 라벨을 A4 에 인쇄. 찍으면 내용물이 바로 열림 |
| **함께 쓰기** | 초대 코드 하나로 가족이 같은 집에 참여. 누가 언제 뭘 바꿨는지 기록 |
| **살 것** | 수량이 임계치 아래로 떨어지면 자동으로 구매 목록에 올라감 |

## 스택

- **앱** — Expo SDK 57 / React Native 0.86 / expo-router / TypeScript (strict)
- **서버** — Supabase (Postgres + Auth + Storage), RLS 로 가구 단위 격리
- **상태** — TanStack Query
- **인증** — Google OAuth · 이메일 매직링크, 둘 다 **PKCE**

## 시작하기

```bash
npm install
npx supabase start          # 로컬 Postgres·Auth·Storage (Docker 필요)
cp .env.example .env.local  # supabase status 의 값으로 채운다
npm start
```

로컬 메일(매직링크)은 Mailpit <http://127.0.0.1:54324> 에서 봅니다.

### 자주 쓰는 명령

```bash
npm run typecheck        # tsc --noEmit
npm run lint
npm test                 # jest (63건)
npm run db:test          # pgTAP (225건) — RLS·트리거·RPC 전수 검증
npm run db:reset         # 마이그레이션 재적용 + 시드

npm run android:release  # 릴리스 APK 빌드 + 기기 설치
npm run android:aab      # Play Store 업로드용 AAB
```

## 구조

```
src/
  app/          expo-router 화면 (파일 = 경로)
  components/   화면에 종속되지 않는 UI
  features/     도메인별 묶음 — api(질의·변경) + 그 도메인 전용 컴포넌트
    auth  category  history  household  item
    onboarding  qr  search  shopping  storage
  lib/          supabase 클라이언트, 테마, i18n, 공용 유틸
plugins/        Expo config plugin (prebuild 가 android/ 를 지우므로 여기 둔다)
supabase/
  migrations/   스키마·RLS·트리거·RPC
  tests/        pgTAP
docs/           GitHub Pages (개인정보처리방침) + 출시 문서
```

## 알아둘 것

이 저장소에는 **같은 함정을 두 번 밟지 않으려고 남긴 주석**이 많습니다. 특히:

- **`prebuild` 는 `android/` 를 통째로 지웁니다.** 그래서 서명 설정·런처 이름 같은
  네이티브 변경은 전부 `plugins/` 의 config plugin 으로 넣습니다. 손으로 고치면
  다음 빌드에 사라지고, **조용히** 디버그 서명으로 돌아갑니다.
  빌드는 반드시 `scripts/build-android.sh` 로 하세요 — JDK 선택,
  `local.properties`, gradle 메모리, 업로드 키를 매번 다시 맞춥니다.

- **RLS 거부는 오류가 아니라 0행으로 옵니다.** UPDATE/DELETE 에 `.select()` 를 붙여
  영향 행 수를 확인하지 않으면, 권한이 없어 아무 일도 안 일어난 것을
  "성공" 으로 표시하게 됩니다.

- **인증은 PKCE 고정입니다.** supabase-js 기본값(`implicit`)은 리프레시 토큰을
  커스텀 스킴 URL 로 돌려주는데, 안드로이드에서 스킴은 임자가 없어 가로채이면
  계정이 통째로 넘어갑니다. `src/lib/supabase.ts` 의 `flowType` 을 지우지 마세요.

- **서명 URL 은 발급할 때마다 달라집니다.** 사진에 `cacheKey` 를 주지 않으면
  캐시가 매번 빗나가 통째로 다시 내려받습니다 (`src/features/item/thumbs.ts`).

## 출시

[docs/play-store-checklist.md](docs/play-store-checklist.md) 에 남은 일과
데이터 보안 양식 답안을 정리해 뒀습니다.

**iOS 는 아직 못 냅니다.** Apple 심사 지침 4.8 이 소셜 로그인 앱에 "이메일을
비공개로 유지할 수 있는 대안" 을 요구하는데, Sign in with Apple 이 없어 반려됩니다.

## 개인정보

- [개인정보처리방침](https://jkinject.github.io/stow-app/privacy/) ·
  [Privacy Policy](https://jkinject.github.io/stow-app/privacy/en/)
- 광고 없음, 분석 SDK 없음, 데이터 판매 없음
- 모든 데이터는 대한민국(AWS ap-northeast-2)에 저장
