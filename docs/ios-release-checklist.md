# App Store 출시 준비

2026-09-18 기준. 코드 쪽에서 끝난 것과, **사람이 해야 하는 것**을 나눴습니다.
Play 쪽은 [play-store-checklist.md](play-store-checklist.md), 스토어 문구는 [play-store-listing.md](play-store-listing.md) 를 그대로 씁니다(en-US 기본, ko 번역).

## 앱 정보

| | |
|---|---|
| 번들 ID | `net.jangstar.stow` (출시 후 **영구 고정**, Android 패키지명과 같음) |
| 앱 이름 | 기본 `Stow` / 한국어 기기 `어디뒀지` (`plugins/withKoreanAppName`) |
| 버전 | `1.1.1` — 빌드 번호는 EAS 가 관리 (`appVersionSource: remote`) |
| EAS 프로젝트 | `@jkinject/stow` (ab3e4a13-9fff-470c-bdbb-0f940bfaba22) |
| 최소 iOS | Expo SDK 57 기본값 (iOS 15.1) |
| iPad | 지원 안 함 (`supportsTablet: false`) — 스크린샷도 iPhone 만 |

## 코드 쪽 — 완료 (2026-09-18)

- [x] **Sign in with Apple** — 심사 지침 4.8 의 반려 사유였다(구글 로그인이 있으면 Apple 로그인도 있어야 한다).
      네이티브 흐름(`expo-apple-authentication` → `supabase.auth.signInWithIdToken`)이라 Supabase 쪽엔
      비밀키가 필요 없고 번들 ID 만 client_id 로 등록한다. `src/lib/auth.tsx` 머리말 참고.
      iOS 로그인 화면에서는 Apple 버튼이 맨 위(주 동작), 구글은 테두리 버튼이다 — Apple 로그인이
      다른 소셜 로그인보다 덜 눈에 띄면 그것도 반려 사유다.
- [x] `ios.usesAppleSignIn: true` → entitlement `com.apple.developer.applesignin` (prebuild 가 넣는다)
- [x] `ITSAppUsesNonExemptEncryption: false` — 제출 때마다 뜨는 수출 규정 질문을 건너뛴다 (HTTPS 만 쓴다)
- [x] 카메라·사진 권한 문구 (`expo-camera`, `expo-image-picker` 플러그인)
- [x] 계정·데이터 삭제 (*더보기 → 탈퇴하기*) — 지침 5.1.1(v) 필수 요건
- [x] 개인정보처리방침 `https://jkinject.github.io/stow-app/privacy/` (영문 `/privacy/en/`)
- [x] 분석 SDK·광고 SDK·추적 없음 → App Tracking Transparency 불필요

## 사람이 해야 하는 것

### 1. Apple Developer Program
- 연 **$99**. 개인 또는 조직(사업자 등록 + D-U-N-S 번호, 며칠~몇 주).
- 이 Mac 에는 `Developer ID Application: Young suk Lee (Z6W6BC2L2L)` 인증서가 있다.
  그 팀으로 낼지, Play 처럼 이피소프트 명의로 새로 등록할지 **먼저 정한다.** 팀 ID 가 곧 앱의 소유자다.

### 2. Supabase 프로덕션에 Apple provider 반영
코드는 `supabase/config.toml` 의 `[auth.external.apple]` 에 이미 들어 있다(enabled, client_id = 번들 ID).
원격에 밀어넣는 것만 남았다 — 이 스크립트는 구글·SMTP 값도 함께 검증한다:

```bash
./scripts/push-auth-config.sh
```

확인: 아래가 `302` 면 켜진 것이다.

```bash
curl -s -o /dev/null -w '%{http_code}\n' "https://fvattiumiwpwkakykhru.supabase.co/auth/v1/authorize?provider=apple&redirect_to=stow://auth-callback"
```

> ⚠ Supabase 대시보드 *Authentication → Providers → Apple* 에서 **Client IDs 에 `net.jangstar.stow`** 가
> 들어 있는지 눈으로 한 번 확인. 이게 없으면 앱이 준 id_token 의 audience 가 안 맞아 로그인이 실패한다.

### 3. App Store Connect 에 앱 만들기
- 번들 ID 등록은 아래 4 의 `eas build` 가 Apple 계정으로 로그인해 **자동으로** 한다
  (Sign in with Apple capability 도 같이 켠다). 먼저 손으로 만들 필요 없다.
- App Store Connect → 새로운 앱: 이름 `Stow`, 기본 언어 영어(미국), 한국어 지역화 추가, SKU `stow`.
- 카테고리: 기본 **Lifestyle**, 보조 Utilities. 연령 등급 4+.
- 문구는 [play-store-listing.md](play-store-listing.md) 의 것을 그대로(부제목 30자, 프로모션 170자, 설명 4000자, 키워드 100자).

### 4. 빌드 → TestFlight
```bash
npx eas-cli build --platform ios --profile production
```
- 처음 한 번 Apple ID 로 로그인을 묻는다. 인증서·프로비저닝 프로파일은 EAS 가 만들어 보관한다.
- 끝나면:
```bash
npx eas-cli submit --platform ios --latest
```
- TestFlight 에서 **실기기로 Apple 로그인을 한 번 해 본다.** 시뮬레이터는 Apple ID 가 없어 시트만 뜬다.
  이름이 프로필에 들어가는지(*더보기* 의 표시 이름), "이메일 숨기기" 로도 가입되는지 본다.

### 5. 스크린샷 — **다시 찍어야 한다**
- App Store 는 **6.9" (1320×2868)** 또는 6.5" (1284×2778) 만 받는다. Play 용 세트(1080×1920)와
  스크린샷 시뮬레이터 "Stow Shots"(iPhone 17, 1206×2622)의 캡처는 **둘 다 크기가 안 맞는다.**
- iPhone 17 Pro Max 시뮬레이터에서 en·ko 각 5장. 장면은 Play 세트와 같게(찾기·상세·QR 라벨·가족·살 것).
  계정·공간·dev 메뉴 함정은 메모 [stow-shots-simulator] 참고. 캡처 `xcrun simctl io <udid> screenshot`
  은 상태바 포함 원본 그대로 올려도 된다(App Store 는 상태바를 요구하지 않지만 잘라내도 된다).

### 6. App Privacy (앱 개인정보 보호 세부사항)
| 항목 | 답 |
|---|---|
| 데이터 수집 여부 | 예 |
| 연락처 정보 → 이메일 주소 | 앱 기능(계정). 사용자에 연결됨. 추적 아님 |
| 연락처 정보 → 이름 | 앱 기능(가족 화면 표시). 사용자에 연결됨 |
| 사용자 콘텐츠 → 사진 | 앱 기능. 사용자에 연결됨 |
| 식별자·위치·진단·구매·검색 기록 | 수집 안 함 |
| 데이터로 사용자 추적 | 아니요 |

### 7. 심사 정보
- 데모 계정: `tester@gmail.com` / `12345678` (공간 "Kim Family", 영어 데이터 14개). 심사 노트에 적는다.
- 노트에 한 줄: "Sign in with Apple, Google, and email/password are all supported. The demo account uses email/password."
- 연락처 전화번호·이메일 필수.

### 8. 제출
- 수출 규정: `ITSAppUsesNonExemptEncryption=false` 가 Info.plist 에 있어 질문이 안 뜬다.
- 광고 식별자(IDFA) 사용: **아니요**.
- 심사 통과 후 **수동 출시**로 두면 원하는 날 켤 수 있다.

## 알아 둘 것

- ⚠ **`expo-apple-authentication` 을 넣으면서 Android 의 fingerprint 도 바뀌었다.** 지금 스토어의
  Android 1.1.1(runtime `d43d4730…`)에는 더 이상 OTA 를 보낼 수 없다. 다음 Android 배포는
  versionCode 4 스토어 빌드(`npm run android:aab`)여야 하고, 그 뒤부터 새 runtime 으로 OTA 가 다시 된다.
- iOS 의 OTA 도 같은 규칙: 스토어에 올라간 빌드의 runtime 과 같을 때만 내려간다.
  올리기 전에 `npx eas-cli fingerprint:compare <라이브 runtime>` 으로 "matches" 를 확인.
- Apple 로그인은 **이름을 첫 로그인에만** 준다. 사용자가 설정 → Apple 계정 → "Apple 로 로그인" 에서
  앱을 지우고 다시 로그인하면 다시 온다 — 지원 문의가 오면 이 안내를.
