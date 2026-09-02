# Play Store 출시 준비

2026-09-01 기준. 코드 쪽에서 끝난 것과, **사람이 해야 하는 것**을 나눴습니다.

> 실제로 Play Console 화면에 무엇을 넣을지는
> **[play-store-listing.md](play-store-listing.md)** 에 붙여넣기용으로 정리해 뒀습니다.
> 이 문서는 "무엇이 남았나", 그쪽은 "어떻게 넣나" 입니다.

## 앱 정보

| | |
|---|---|
| 패키지명 | `net.jangstar.stow` (출시 후 **영구 고정**) |
| 앱 이름 | 기본 `Stow` / 한국어 기기 `어디뒀지` |
| 버전 | `1.0.0` (versionCode `1`) |
| 최소 SDK | 24 (Android 7.0) |
| 타깃 SDK | 36 |
| 업로드 키 SHA-1 | `23:52:2B:6B:28:5C:23:78:3B:6E:90:EB:D4:07:20:DA:30:FE:A5:D6` |

## 코드 쪽 — 완료

- [x] AAB 빌드: `./scripts/build-android.sh bundleRelease` → `android/app/build/outputs/bundle/release/app-release.aab`
- [x] 업로드 키 서명 (서명 지문 대조 완료)
- [x] `allowBackup=false` — 세션 토큰이 백업으로 새지 않음
- [x] 불필요 권한 제거 (`RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`)
- [x] 개인정보처리방침 페이지 — GitHub Pages 활성화 완료 (`gh api ... /pages`)
      - Play Console 입력용: `https://jkinject.github.io/stow-app/privacy/`
      - 영문: `https://jkinject.github.io/stow-app/privacy/en/`
- [x] 계정·데이터 삭제 기능 (앱 내 *더보기 → 탈퇴하기*) — Play 필수 요건
- [x] 분석 SDK·광고 SDK 없음

## 사람이 해야 하는 것

### 1. Play Console 계정
- 개발자 등록비 **$25(1회)**
- 개인 계정은 신원 확인이 필요하고, 며칠 걸릴 수 있습니다.

### 2. 앱 만들기 → AAB 업로드
- **Play 앱 서명 사용**을 켭니다(기본값). 그러면 지금 키는 *업로드 키* 로만 쓰이고,
  잃어버려도 구글에 재설정을 요청할 수 있습니다.

### 3. 구글 OAuth 에 앱 서명 키 등록 ⚠️
Play 앱 서명을 켜면 **구글이 다시 서명**하므로, 스토어에서 받은 앱의 지문은
위 업로드 키 지문과 **다릅니다.**

1. Play Console → **설정 → 앱 무결성 → 앱 서명** 에서 *앱 서명 키 인증서*의 SHA-1 을 복사
2. Google Cloud Console → 사용자 인증 정보 → Android OAuth 클라이언트에 그 SHA-1 을 등록

이 단계를 빠뜨리면 **스토어에서 받은 앱만 구글 로그인이 실패합니다.**
직접 설치한 APK 는 멀쩡하기 때문에 원인을 찾기가 아주 어렵습니다.

### 4. 데이터 보안(Data safety) 양식
개인정보처리방침과 같은 내용으로 답하면 됩니다.

| 질문 | 답 |
|---|---|
| 데이터를 수집하나요 | 예 |
| 이메일 주소 | 수집 · 앱 기능(계정) · 필수 |
| 이름 | 수집 · 앱 기능(구성원 표시) · 필수 |
| 사진 | 수집 · 앱 기능 · 선택 |
| 기타 사용자 콘텐츠 | 수집 · 앱 기능 (물건·장소 이름, 메모) |
| 앱 활동 / 앱 내 검색 | 수집 안 함 |
| 위치 · 연락처 · 광고 ID | 수집 안 함 |
| 제3자와 공유 | 아니요 (처리 위탁만: Supabase / Google / Resend) |
| 전송 중 암호화 | 예 |
| 삭제 요청 가능 | 예 — 앱 내 탈퇴 |

### 5. 스토어 등록 정보 (직접 준비)
- 앱 아이콘 512×512 PNG — `assets/images/icon.png` 를 리사이즈
- 그래픽 이미지 1024×500
- 휴대전화 스크린샷 최소 2장 (권장 4~8장)
- 짧은 설명 80자 / 자세한 설명 4000자

### 6. 콘텐츠 등급 설문
전 연령. 폭력·성적 콘텐츠·도박 없음, 사용자 간 소통 없음(같은 가구 안에서만 데이터 공유).

## 남은 이슈

- **iOS 미출시**: Apple 심사 지침 4.8 은 소셜 로그인을 쓰는 앱에 "이메일 비공개 대안"을 요구합니다.
  Sign in with Apple 이 없어 **현재 상태로는 iOS 제출 시 반려**됩니다. (`src/lib/auth.tsx` 주석 참고)
- **AAB 97MB**: Play 가 기기별로 쪼개 배포하므로 실제 다운로드는 훨씬 작습니다.
  다만 `react-native-worklets` 등 네이티브가 커서, 필요하면 나중에 줄일 여지가 있습니다.

## ⚠️ 업로드 키 백업

키스토어는 `~/keystores/stow-upload.jks` 에 있고 **저장소에는 없습니다.**
비밀번호는 `.env.production.local` 에만 있습니다.

**둘 다 잃으면 업로드 키를 재설정해야 합니다** (Play 앱 서명을 쓰면 가능하지만 번거롭습니다).
비밀번호 관리자나 암호화된 백업에 **파일과 비밀번호를 함께** 보관해 두세요.

---

## 업로드 자동화 (Play Developer API)

`scripts/play.mjs` 가 로컬 AAB 를 Play 에 직접 올린다. 중간 서버를 거치지 않고,
Expo 계정도 필요 없다.

```bash
npm run play:status                                  # 트랙별 현재 버전
npm run play:upload -- --track internal              # 내부 테스트에 올리기
npm run play:upload -- --track production \
  --notes-ko "물건 이동 화면을 고쳤습니다." \
  --notes-en "Improved the move screen."
npm run play:promote -- --from internal --to production
```

### 처음 한 번만: 서비스 계정 준비

⚠ **이 세 단계는 사람이 해야 한다.** Play Console 은 웹 UI 로만 초대할 수 있다.

**1) GCP 프로젝트를 정하고 API 를 켠다**

어느 프로젝트든 되지만, 서비스 계정을 만든 **그 프로젝트에서** API 를 켜야 한다.
법인 프로젝트에 둘지 이 앱 전용 프로젝트를 새로 팔지는 정해야 할 문제다.

```bash
gcloud config set project <프로젝트ID>
gcloud services enable androidpublisher.googleapis.com
```

**2) 서비스 계정과 키를 만든다**

```bash
gcloud iam service-accounts create stow-play \
  --display-name="Stow Play 업로드"

# ⚠ 키 파일은 **저장소 밖**에 둔다. 업로드 키스토어와 같은 자리.
gcloud iam service-accounts keys create ~/keystores/play-service-account.json \
  --iam-account=stow-play@<프로젝트ID>.iam.gserviceaccount.com
chmod 600 ~/keystores/play-service-account.json

printf 'GOOGLE_PLAY_SERVICE_ACCOUNT=~/keystores/play-service-account.json\n' \
  >> .env.production.local
```

⚠ 이 JSON 하나면 **앱을 스토어에 배포할 수 있다.** 키스토어와 같은 급으로 다룰 것.
   GCP 쪽에는 아무 역할(role)도 줄 필요가 없다 — 권한은 Play Console 이 준다.

**3) Play Console 에 초대한다** (웹 UI, 대체 경로 없음)

<https://play.google.com/console> → **사용자 및 권한** → **사용자 초대**
→ 위 서비스 계정 이메일(`stow-play@...gserviceaccount.com`) 입력
→ 앱 선택 후 권한:

| 권한 | 필요한 이유 |
|---|---|
| 앱 정보 보기 | `play:status` |
| 프로덕션·테스트 트랙에 배포 관리 | 업로드·승격 |
| 스토어 등록정보 관리 *(선택)* | 나중에 문구·스크린샷도 스크립트로 |

초대 직후에는 권한 전파에 **몇 분** 걸린다. 바로 401/403 이 나면 잠시 뒤 다시 해 볼 것.

### 확인

```bash
npm run play:status
```

트랙 목록이 나오면 준비 끝이다. 실패하면 스크립트가 무엇이 빠졌는지 말해 준다.
