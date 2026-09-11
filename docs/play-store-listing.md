# Play Console 등록 — 붙여넣기용 문서

Play Console 이 묻는 **순서 그대로** 정리했습니다. 코드 블록은 그대로 복사해 넣으면 됩니다.
글자 수는 Play 제한에 맞춰 미리 맞춰 뒀습니다.

준비된 파일은 전부 `docs/store/` 에 있습니다.

---

## 포지셔닝 (2026-09-12)

**정리 앱이 아니다. 집의 기억이다.**

- 사용자는 "정리하고 싶은" 사람이 아니라 **"그거 어디 뒀더라?" 를 반복하는** 사람이다.
  정리 앱(라벨링·미니멀리즘)과 나란히 놓이면 진다 — 그 시장은 이미 포화이고 우리는 정리를 시키지 않는다.
- 약속은 하나다: **넣을 때 사진 한 장, 찾을 때 이름 한 번.** 방과 박스까지 바로 알려준다.
- 글로벌 우선. 한국 창고·수납 시장은 너무 작다. 기본 언어는 **en-US**, 한국어는 번역 중 하나다.
  스토어 문구·스크린샷·랜딩 페이지(`docs/index.html`)는 영어가 원본이고 한국어(`docs/ko/`)가 번역이다.
- 이 문장을 스토어 설명·랜딩 페이지·SNS 소개에 그대로 쓴다:
  ```
  Stow is not an organizing app. It's a memory for your house.
  Snap a photo when you put something away. Search by name when you need it back.
  ```

---

## 0. 앱 만들기

| 항목 | 값 |
|---|---|
| 앱 이름 | `어디뒀지` |
| 기본 언어 | 한국어 – ko-KR |
| 앱 또는 게임 | 앱 |
| 무료 또는 유료 | 무료 |

> ⚠️ **앱 이름은 나중에 바꿀 수 있지만 패키지명은 못 바꿉니다.** `net.jangstar.stow` 로 고정입니다.

---

## 1. 스토어 등록정보 (한국어)

### 앱 이름 (30자 이내)
```
어디뒀지 - 집 안 물건 찾기
```

### 간단한 설명 (80자 이내)
```
정리 앱이 아닙니다. 집의 기억입니다. 넣을 때 사진 한 장, 찾을 때 이름 한 번 — 방과 박스까지 바로.
```

### 자세한 설명 (4000자 이내)
```
"그거 어디 뒀더라?"

어디뒀지는 정리 앱이 아닙니다. 집의 기억입니다.
계절 옷, 캐리어, 공구, 아이 장난감, 상비약… 분명 어딘가에 잘 넣어뒀는데
막상 필요할 때는 온 집을 뒤집니다. 정리를 더 하라는 앱은 많습니다.
어디뒀지는 "어디 뒀는지" 를 대신 기억합니다.


■ 넣을 때 사진 한 장, 찾을 때 이름 한 번

물건을 넣으면서 사진 찍고 이름만 적으면 끝입니다. 어느 방, 어느 박스에
들어갔는지가 함께 남습니다. 나중에는 이름만 검색하면 방과 박스가 바로 나옵니다.

• 초성으로도 찾아집니다 — "ㄱㅈㅈ" 만 쳐도 "건전지" 가 나옵니다
• 사진이 함께 보여서 목록만 훑어도 뭐가 어디 있는지 읽힙니다


■ 집 구조 그대로

장소(안방·주방·창고) 안에 박스를 두고, 박스 안에 물건을 넣습니다.
박스 없이 장소에 그냥 두는 물건도 됩니다 — 신발장의 우산처럼요.
사무실이나 세컨하우스는 별도 공간으로 나눠 관리할 수 있습니다.


■ 박스에 QR 라벨을 붙이세요

박스를 만들면 QR 코드가 자동으로 생깁니다. A4 한 장에 21개까지 인쇄해
잘라 붙이면, 스캔하는 순간 그 박스에 뭐가 들었는지 열립니다.
상자를 하나하나 열어 볼 필요가 없습니다.


■ 가족이 함께 씁니다

초대 코드 하나면 가족이 같은 집에 들어옵니다. 누가 무엇을 어디로 옮겼는지
기록이 남아서 "내가 안 옮겼는데?" 로 끝나는 대화가 줄어듭니다.


■ 다 떨어지면 알려줍니다

수량이 0 이 되는 순간 살 것 목록에 자동으로 올라갑니다. 세제, 건전지, 아이 약처럼
떨어지고 나서야 알아채는 것들에 좋습니다. 소비기한을 적어 두면 기한 전에 알려줍니다.


■ 실수해도 되돌릴 수 있습니다

지운 물건은 30일 동안 휴지통에 남아 언제든 복구할 수 있습니다.


■ 개인정보

광고를 넣지 않고, 분석 도구를 쓰지 않으며, 어떤 데이터도 팔지 않습니다.
광고 식별자·위치정보·연락처를 수집하지 않습니다.
사진과 물건 목록은 같은 집 구성원에게만 보입니다.

개인정보처리방침: https://jkinject.github.io/stow-app/privacy/
```

---

## 2. 스토어 등록정보 (영어 — **기본 언어**)

2026-09-12 부터 en-US 가 기본 언어다. 한국어(1번)는 번역 언어 중 하나로 남는다.

### 앱 이름
```
Stow - Find What You Put Away
```

### 간단한 설명
```
Not an organizing app. A memory for your house: snap it, name it, find it later.
```

### 자세한 설명
```
"Where did I put that?"

Stow is not an organizing app. It's a memory for your house.
The winter coats, the suitcase, the tools, the kids' old toys, the medicine —
you put them somewhere sensible, and six months later you tear the house apart.
Plenty of apps tell you to tidy more. Stow just remembers where things went.


■ Snap it when you stow it, search it when you need it

Take a photo as you put something away and type a name. Stow keeps the room
and the box it went into. Later, search the name and both come straight back.

• Partial names work — no need to remember exactly what you called it
• Photos in every list, so you recognise things at a glance


■ Mirrors how your home is actually laid out

Places (bedroom, kitchen, garage) hold boxes, and boxes hold items.
Things can also sit loose in a place — like the umbrella by the front door.
An office, a storage unit or a second home can be a separate space.


■ QR labels on your boxes

Every box gets a QR code. Print up to 21 per A4 sheet, cut, stick.
Scan one and its contents open instantly — no more opening every box.


■ Built for households

One invite code brings your family into the same home. Every change is logged,
so "I didn't move it" conversations get a lot shorter.


■ Know when you run out

The moment an item hits zero it lands on your shopping list automatically —
detergent, batteries, medicine. Add an expiry date and Stow reminds you before it passes.


■ Undo is always there

Deleted items stay in Trash for 30 days.


■ Privacy

No ads, no analytics trackers, nothing sold. No advertising ID, location or contacts.
Photos and lists are visible only to the members of your home.

Privacy policy: https://jkinject.github.io/stow-app/privacy/en/
```

---

## 3. 그래픽 애셋

| 항목 | 파일 | 규격 |
|---|---|---|
| 앱 아이콘 | `docs/store/icon-512.png` | 512×512 PNG ✅ |
| 그래픽 이미지 | `docs/store/feature-graphic-1024x500.png` | 1024×500 PNG ✅ |
| 휴대전화 스크린샷 (영어) | `docs/store/screenshots/en/01~05` | 1080×1920 PNG ✅ (2~8장) |

> ⚠️ **기기 원본(1080×2520)을 그대로 올리면 거부됩니다.** Play 는 긴 변이 짧은 변의
> **2배를 넘으면** 받지 않는데, 이 기기는 2.33배입니다. 그렇다고 잘라서 맞추면
> 탭바나 헤더가 날아갑니다. 그래서 9:16 캔버스에 줄여 앉히고 남는 위쪽에
> 캡션을 넣었습니다 — 스토어 목록에서는 작게 보여서 캡션이 없으면
> 무슨 화면인지 알아보기 어렵습니다.

스크린샷 순서가 곧 스토어에 보이는 순서입니다. 첫 장이 가장 중요합니다.

| # | 캡션 (en-US) | 보여주는 것 |
|---|---|---|
| 1 | Where did I put that? — One search. Room and box, instantly | 찾기 탭, "Winter" 검색 결과에 `Bedroom › Top Shelf Bin` 경로 |
| 2 | Snap it, name it, done — Stow remembers where it went | 물건 상세 (사진·위치 경로·수량) |
| 3 | Scan the box, skip the digging — Every box gets a QR label | 박스 상세 (스캔하면 보이는 화면) |
| 4 | Your home, mapped — Places hold boxes, boxes hold things | 보관 장소 목록 |
| 5 | Whole family, one home — One invite code, everyone in sync | 구성원 + 초대 코드 |

원본은 iOS 시뮬레이터 "Stow Shots"(iPhone 17, 심사 계정 tester@gmail.com, 공간 Kim Family, 영어 UI)에서
`xcrun simctl io <udid> screenshot` 으로 찍고, 상태 표시줄(위 177px)·홈 인디케이터(아래 102px)를 잘라낸 뒤 스크립트에 넣었다.
같은 파일을 540×960 으로 줄인 것이 랜딩 페이지용 `docs/site/01~05.png` 다.

다시 만들려면 (모두 원본 경로를 인자로 받습니다):
```bash
python3 scripts/gen-signin-hero.py       <히어로원본.png>   # 앱 안 배경 (base64 모듈)
python3 scripts/gen-store-graphic.py     <히어로원본.png>   # 1024×500 그래픽 이미지
python3 scripts/gen-store-screenshots.py <기기캡처_폴더>     # 1080×1920 스크린샷
```

> 한국어 세트(`docs/store/screenshots/ko/`)는 같은 계정의 두 번째 공간 "우리 집"(`scripts/seed-review-account-ko.py`,
> 사진은 Kim Family 것을 복사)에서 UI 를 한국어로 두고 같은 5장을 찍었다: `python3 scripts/gen-store-screenshots.py <폴더> ko`.

---

## 4. 앱 콘텐츠

### 개인정보처리방침
```
https://jkinject.github.io/stow-app/privacy/
```

### 데이터 삭제 링크 (앱 콘텐츠 → 데이터 보안)
"사용자가 계정 및 관련 데이터의 삭제를 요청하는 데 사용할 수 있는 링크"
```
https://jkinject.github.io/stow-app/delete-account/
```

> ⚠️ 앱 안의 *더보기 → 탈퇴하기* 만으로는 부족합니다. Play 는 **앱을 이미 지운 사람도
> 볼 수 있는 웹 주소**를 요구합니다. 위 페이지에 앱 내 삭제 방법과, 앱 없이 메일로
> 요청하는 방법을 함께 적어 뒀습니다.
>
> 같은 화면의 "계정만 삭제" / "계정과 데이터 모두 삭제" 선택에서는
> **계정과 데이터를 모두 삭제**를 고르시면 됩니다 — 혼자 쓰던 집이면 사진까지
> 전부 지워집니다. 가족이 남아 있으면 그들의 데이터는 유지되고 회원님을
> 식별할 수 있는 정보만 지워지는데, 그 내용도 페이지에 적혀 있습니다.

### 앱 액세스 권한 ⚠️ 놓치기 쉬움
이 앱은 **로그인해야 쓸 수 있으므로**, 심사자에게 계정을 줘야 합니다.
주지 않으면 "로그인 화면만 보여서 심사할 수 없다" 로 반려됩니다.

> **전체 또는 일부 기능이 제한됨** 선택 → 안내 문구에 아래를 넣으세요.

```
로그인이 필요합니다.

1. 첫 화면에서 "이메일로 계속하기" 를 누릅니다
2. 아래 계정으로 로그인합니다

   이메일: tester@gmail.com
   비밀번호: 12345678

메일함이나 외부 서비스에 접속하실 필요는 없습니다.
```

> ⚠️ **구글 로그인 정보를 주면 안 됩니다.** 심사자는 해외에서 접속하므로 구글이
> "낯선 위치" 로 판단해 차단합니다. (메일 링크 로그인은 2026-09-09 에 없앴습니다.)
> **이메일 + 비밀번호** 만이 외부 의존 없이 동작합니다 — 그래서 이 방식을 넣었습니다.

### 심사용 계정 — **이미 만들어져 있습니다**

`tester@gmail.com` / `12345678` 는 운영 Supabase 에 **생성·인증까지 끝난 상태**입니다.
실기기에서 로그인되는 것도 확인했습니다. 위 문구를 그대로 붙여 넣으면 됩니다.

> ⚠️ **이 주소는 우리 것이 아닙니다.** `tester@gmail.com` 은 실제로 남이 쓰고 있을 수
> 있는 구글 주소입니다. 그래서 평범한 가입 절차(인증 메일 발송)를 쓰지 않고,
> 메일을 **한 통도 보내지 않는 방식**으로 만들었습니다:
>
> 1. `supabase/config.toml` 의 `enable_confirmations` 를 잠깐 `false` 로 두고 push
> 2. Admin API 로 가입시켜 즉시 인증 상태로 만듦 (`confirmation_sent_at` 없음)
> 3. `enable_confirmations = true` 로 되돌리고 다시 push
>
> 되돌린 것까지 확인했습니다 — 지금 새로 가입하면 인증 메일이 정상적으로 갑니다.
> 계정을 다시 만들 일이 생기면 **같은 순서를 지키세요.** 그냥 가입시키면 모르는
> 사람에게 메일이 가고, 그 사람이 링크를 안 누르니 계정은 영영 인증되지 않습니다.

> ⚠️ **비밀번호가 공개됩니다.** `12345678` 은 Play Console 과 이 공개 저장소에 함께
> 적혀 있습니다. 누구나 로그인해서 **그 가구의 데이터를 고치거나 지울 수 있습니다.**
> 심사용 더미 데이터만 넣고, 실제 물건 정보는 절대 넣지 마세요.

**데이터도 채워 뒀습니다** — 심사자가 로그인하면 바로 이렇게 보입니다:

| | |
|---|---|
| 가구 | Kim Family |
| 장소 | Bedroom · Kitchen · Living Room · Storage Closet |
| 박스 | Top Shelf Bin (Bedroom) · Under-Sink Cabinet (Kitchen) |
| 카테고리 | Medicine · Tools · Cleaning · Kids · Kitchen |
| 물건 | 14개 (박스 안·장소 직속 섞어서) |
| 구매 목록 | 3건 — 수량 0 자동 편입 2건 + 수동 추가 1건 |
| 사진 | 16장 (물건 14 + 박스 2), 원본·썸네일 모두 |

> **이름을 영어로 넣은 이유.** 심사자는 영어 기기로 보게 됩니다. 앱은 기기 언어를
> 따라가므로 UI 는 영어로 뜨는데 데이터만 한국어면 무슨 앱인지 읽히지 않습니다.
> 그래서 데이터도 영어로 맞췄습니다.

**다시 채워야 할 때** — 계정을 새로 만들었거나 데이터가 날아갔으면 이 둘을 차례로:

```bash
python3 scripts/seed-review-account.py    # 가구·장소·박스·카테고리·물건·구매목록
python3 scripts/gen-review-photos.py      # 사진 (Replicate gpt-image-2)
```

사진 쪽은 `~/.replicate_api_token` 이 필요하고, 크레딧이 $5 미만이면 분당 6장으로
제한되어 16장에 3분쯤 걸립니다. 이미 사진이 있는 것은 건너뜁니다.

### 광고
```
아니요, 앱에 광고가 없습니다
```

### 콘텐츠 등급 설문
| 질문 | 답 |
|---|---|
| 앱 카테고리 | 유틸리티·생산성 |
| 폭력 | 없음 |
| 성적 콘텐츠 | 없음 |
| 욕설 | 없음 |
| 약물·주류·담배 | 없음 |
| 도박 | 없음 |
| 사용자 간 소통 | **없음** — 같은 가구 안에서 데이터만 공유되고, 메시지·채팅 기능이 없습니다 |
| 사용자 위치 공유 | 없음 |
| 개인정보 공유 | 없음 |
| 디지털 구매 | 없음 |

→ 전체 이용가로 나옵니다.

### 타겟층
```
연령대: 18세 이상
아동에게 어필하는 요소: 없음
```

### 데이터 보안 (Data safety)

**수집 여부**: 예 / **전송 중 암호화**: 예 / **삭제 요청 가능**: 예 (앱 내 탈퇴)

| 데이터 유형 | 수집 | 공유 | 목적 | 필수 |
|---|---|---|---|---|
| 이메일 주소 | ✅ | ❌ | 계정 관리 | 필수 |
| 이름 | ✅ | ❌ | 계정 관리, 앱 기능 | 필수 |
| 사진 | ✅ | ❌ | 앱 기능 | 선택 |
| 기타 사용자 콘텐츠 | ✅ | ❌ | 앱 기능 | 선택 |
| 앱 상호작용 / 검색 기록 | ❌ | | | |
| 위치 · 연락처 · 광고 ID | ❌ | | | |
| 기기 ID | ❌ | | | |

> "공유"는 제3자에게 넘기는 것을 뜻합니다. Supabase·Google·Resend 는 **처리 위탁**이라
> Play 기준으로 "공유" 에 해당하지 않습니다.

### 정부 앱 / 금융 기능
```
둘 다 아니요
```

---

## 5. 출시

1. **프로덕션 → 새 버전 만들기**
2. **Play 앱 서명 사용** 켜기 (기본값)
3. AAB 업로드:
   ```
   android/app/build/outputs/bundle/release/app-release.aab
   ```
   없으면 `npm run android:aab` 로 다시 만듭니다.
4. 출시명 `1.0.0 (1)` · 출시 노트:
   ```
   첫 출시입니다.

   • 사진 찍어 물건 위치 기록
   • 이름·초성으로 검색
   • 박스 QR 라벨 인쇄
   • 가족과 함께 쓰기
   • 다 떨어지면 살 것 목록에 자동 추가
   ```

### 출시 직후 반드시 할 일 ⚠️
Play 앱 서명을 켜면 **구글이 앱을 다시 서명**합니다. 그래서 스토어에서 받은 앱의
지문은 업로드 키 지문과 다릅니다.

1. Play Console → **설정 → 앱 무결성 → 앱 서명** 에서 *앱 서명 키 인증서* SHA-1 복사
2. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
   Android OAuth 클라이언트에 그 SHA-1 추가

**이걸 빠뜨리면 스토어에서 받은 앱만 구글 로그인이 실패합니다.**
직접 설치한 APK 는 멀쩡하기 때문에 원인을 찾기가 아주 어렵습니다.
(참고: 업로드 키 SHA-1 은 `23:52:2B:6B:28:5C:23:78:3B:6E:90:EB:D4:07:20:DA:30:FE:A5:D6`
— 이건 등록하는 값이 **아닙니다.** 위에서 복사한 앱 서명 키를 넣으세요.)

---

## 6. 출시 전 점검

- [x] 심사용 계정을 만들었다 (`tester@gmail.com` / `12345678`)
- [x] 심사용 계정에 데이터를 넣어 뒀다 (장소 4 · 박스 2 · 물건 14 · 구매목록 3)
- [ ] 개인정보처리방침 URL 이 열린다 (<https://jkinject.github.io/stow-app/privacy/>)
- [ ] AAB 가 업로드 키로 서명됐다 (`npm run android:aab` 가 "· 서명 업로드 키" 를 출력)
- [ ] 데이터 보안 양식과 개인정보처리방침 내용이 서로 맞다
- [ ] 업로드 키 백업 (`~/keystores/stow-upload.jks` + `.env.production.local` 의 비밀번호)
