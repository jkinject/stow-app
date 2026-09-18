# App Store 출시 준비

2026-09-18 기준. 코드 쪽에서 끝난 것과, **사람이 해야 하는 것**을 나눴습니다.
Play 쪽은 [play-store-checklist.md](play-store-checklist.md), 스토어 문구는 [play-store-listing.md](play-store-listing.md) 를 그대로 씁니다(en-US 기본, ko 번역).

## 앱 정보

| | |
|---|---|
| 번들 ID | `net.jangstar.stow` (출시 후 **영구 고정**, Android 패키지명과 같음) |
| 런처 이름 | 기본 `Stow` / 한국어 기기 `어디뒀지` (iOS 는 `locales/ko.json`, Android 는 `plugins/withKoreanAppName`) |
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
- [x] 카메라·사진 권한 문구 — **영어가 기본, 한국어 기기만 한국어** (`locales/{en,ko}.json`)
- [x] 계정·데이터 삭제 (*더보기 → 탈퇴하기*) — 지침 5.1.1(v) 필수 요건
- [x] 개인정보처리방침 `https://jkinject.github.io/stow-app/privacy/` (영문 `/privacy/en/`)
- [x] 분석 SDK·광고 SDK·추적 없음 → App Tracking Transparency 불필요

## 계정·등록 — 완료 (2026-09-18)

| | |
|---|---|
| Apple Developer | **EP Soft Co., Ltd.** / 팀 ID `GZNYLNJY9P` / 조직 / 소유자 Jungkyu Jang |
| 로그인 | jkinject@gmail.com (Aside `--account u0`) · 갱신일 2027-09-18 |
| App ID | `net.jangstar.stow` (Sign in with Apple capability 켜짐) |
| App Store Connect | **Stow - Find What You Put Away** · Apple ID `6813274331` |
| 앱 URL | https://appstoreconnect.apple.com/apps/6813274331/distribution |
| Supabase Apple provider | 프로덕션 반영 완료 (네이티브 흐름 검증됨) |

> ⚠ 앱 이름이 Play 와 다르다. App Store 에서 **"Stow" 단독은 이미 선점**돼 있어
> ("입력한 앱 이름이 이미 사용 중입니다") Play 의 영어 이름을 그대로 썼다. 29자로 30자 제한에 딱 맞는다.

## 사람이 해야 하는 것

### 1. 빌드 → TestFlight
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

### 2. 스크린샷 — 영어 세트는 만들어 뒀다
- **영어 5장 완료**: `docs/store/screenshots/ios/en/` (1320×2868, 6.9인치). Play 세트와 같은 캡션 디자인이다.
- **한국어 세트는 아직 없다.** 같은 방법으로 찍는다:
  ```bash
  # iPhone 17 Pro Max 시뮬레이터 — 캡처가 정확히 1320×2868 이라 그대로 쓴다
  xcodebuild -workspace ios/Stow.xcworkspace -scheme Stow -configuration Release \
    -sdk iphonesimulator -destination 'platform=iOS Simulator,id=<udid>' \
    -derivedDataPath ios/build/rel CODE_SIGNING_ALLOWED=NO build
  xcrun simctl install <udid> ios/build/rel/Build/Products/Release-iphonesimulator/Stow.app
  # 심사 계정 로그인 → 더보기에서 언어를 한국어로 → 공간을 "우리 집"으로 → 5장 캡처
  python3 scripts/gen-store-screenshots.py <캡처_폴더> ko appstore
  ```
- 장면 순서: ① 찾기(검색 "Winter") ② 물건 상세 ③ 박스 상세 ④ 장소 목록 ⑤ 가족.
- ⚠ 시뮬레이터 키보드가 한글 모드라 영문 입력이 깨진다. `printf '…' | LANG=en_US.UTF-8 xcrun simctl pbcopy <udid>`
  로 복사한 뒤 입력칸을 길게 눌러 Paste 한다.

### 3. App Privacy (앱 개인정보 보호 세부사항)
| 항목 | 답 |
|---|---|
| 데이터 수집 여부 | 예 |
| 연락처 정보 → 이메일 주소 | 앱 기능(계정). 사용자에 연결됨. 추적 아님 |
| 연락처 정보 → 이름 | 앱 기능(가족 화면 표시). 사용자에 연결됨 |
| 사용자 콘텐츠 → 사진 | 앱 기능. 사용자에 연결됨 |
| 식별자·위치·진단·구매·검색 기록 | 수집 안 함 |
| 데이터로 사용자 추적 | 아니요 |

### 4. 심사 정보
- 데모 계정: `tester@gmail.com` / `12345678` (공간 "Kim Family", 영어 데이터 14개). 심사 노트에 적는다.
- 노트에 한 줄: "Sign in with Apple, Google, and email/password are all supported. The demo account uses email/password."
- 연락처 전화번호·이메일 필수.

### 5. 제출
- 수출 규정: `ITSAppUsesNonExemptEncryption=false` 가 Info.plist 에 있어 질문이 안 뜬다.
- 광고 식별자(IDFA) 사용: **아니요**.
- 심사 통과 후 **수동 출시**로 두면 원하는 날 켤 수 있다.

## 알아 둘 것

- 권한 문구와 한국어 앱 이름은 `locales/{en,ko}.json` 이 갈라 준다(app.json 의 `locales`). 기본 Info.plist 는
  **영어**이고, 한국어 기기만 `ko.lproj/InfoPlist.strings` 를 본다. 전에는 한국어 문구 하나뿐이라 영어권
  사용자와 심사자에게 한국어 권한 창이 떴다(2026-09-18 시뮬레이터에서 발견).
  ⚠ Android 런처 이름은 여전히 `plugins/withKoreanAppName` 담당이다 — Expo `locales` 는 iOS 전용이다.

- ⚠ **`expo-apple-authentication` 을 넣으면서 Android 의 fingerprint 도 바뀌었다.** 지금 스토어의
  Android 1.1.1(runtime `d43d4730…`)에는 더 이상 OTA 를 보낼 수 없다. 다음 Android 배포는
  versionCode 4 스토어 빌드(`npm run android:aab`)여야 하고, 그 뒤부터 새 runtime 으로 OTA 가 다시 된다.
- iOS 의 OTA 도 같은 규칙: 스토어에 올라간 빌드의 runtime 과 같을 때만 내려간다.
  올리기 전에 `npx eas-cli fingerprint:compare <라이브 runtime>` 으로 "matches" 를 확인.
- Apple 로그인은 **이름을 첫 로그인에만** 준다. 사용자가 설정 → Apple 계정 → "Apple 로 로그인" 에서
  앱을 지우고 다시 로그인하면 다시 온다 — 지원 문의가 오면 이 안내를.
