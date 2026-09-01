# Google 로그인 설정

앱 코드는 이미 다 되어 있습니다. **당신이 해야 할 것은 클라이언트 ID 발급과 환경변수 주입뿐입니다.**

> ⚠ **Apple 로그인은 연기됐습니다 (2026-08-28 결정).**
> Apple 심사 가이드라인 4.8은 구글 같은 소셜 로그인을 쓰는 앱에 "사용자가 이메일을 비공개로
> 유지할 수 있는 동등한 대안"을 요구합니다. 매직링크는 링크를 보내야 하므로 그 조건을 못 채웁니다.
> **따라서 지금 상태로는 iOS 스토어 제출이 반려됩니다.** 개발·Android 배포·내부 테스트에는
> 아무 지장이 없습니다. M9 출시 준비 단계에서 반드시 추가해야 합니다 (계획 리스크 R24).

---

## 1. Google Cloud Console에서 OAuth 클라이언트 만들기

1. https://console.cloud.google.com → 프로젝트 생성
2. **API 및 서비스 → OAuth 동의 화면** 구성 (외부, 앱 이름 "어디뒀지 (Stow)", 지원 이메일)
3. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**

지금 필요한 건 **웹 애플리케이션** 유형 하나입니다. 앱은 Supabase의 authorize 엔드포인트를
브라우저로 열고 Supabase가 구글과 통신하므로, 네이티브 클라이언트 ID는 이 방식에선 필요 없습니다.

**승인된 리디렉션 URI**에 넣을 값:

| 환경 | 값 |
|---|---|
| 로컬 개발 | `http://127.0.0.1:54321/auth/v1/callback` |
| 프로덕션 | `https://<프로젝트ref>.supabase.co/auth/v1/callback` |

## 2. 환경변수로 주입

`config.toml`은 커밋되므로 값을 직접 적지 마세요. 셸에서 넘깁니다.

```bash
export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID='xxxx.apps.googleusercontent.com'
export SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET='GOCSPX-xxxx'
npx supabase start   # 이미 떠 있으면 npx supabase stop 후 다시
```

확인:

```bash
./supabase/tests/verify_auth.sh
# "구글 provider 가 활성화되어 있다 (HTTP 302)" 가 나와야 합니다
```

## 3. 실기기 확인이 필요한 이유

`verify_auth.sh`는 Supabase 쪽 설정만 봅니다. **실제 로그인은 실기기 개발 빌드에서 확인해야 합니다.**

```bash
npx expo start
# Expo Go 가 아니라 개발 빌드에서 열어야 합니다 (카메라·딥링크 때문에 어차피 필요)
```

딥링크 스킴은 `app.json`의 `scheme: "stow"`이고, 리다이렉트는
`stow://auth-callback`입니다. `supabase/config.toml`의 `additional_redirect_urls`에
등록되어 있습니다.

## 4. 프로덕션에서 추가로 필요한 것

- **Android**: EAS **릴리스** 키스토어의 SHA-1을 구글 콘솔에 등록해야 합니다.
  디버그 키스토어와 값이 달라 **디버그에서 되던 것이 스토어 빌드에서만 깨집니다** (리스크 R21).
  `eas credentials`로 확인하세요.
- **Supabase 대시보드**: Authentication → Providers → Google에 같은 값을 넣습니다
  (로컬 `config.toml`은 로컬에만 적용됩니다).
- **Site URL / Redirect URLs**: 대시보드에 `stow://auth-callback`을 추가합니다.

## 5. 알려진 함정

| 증상 | 원인 |
|---|---|
| 스토어 빌드에서만 구글 로그인 실패 | 릴리스 키스토어 SHA-1 미등록 (R21) |
| 로그인 후 앱으로 안 돌아옴 | `additional_redirect_urls`에 스킴 누락 |
| 초대 링크로 들어왔는데 가입 후 가구에 없음 | OAuth 왕복에서 코드 유실 (R23). 온보딩에서 재입력 가능하도록 되어 있음 |
| iOS 심사 반려 4.8 | **Sign in with Apple 미구현 — 예정된 일입니다** (R24) |
