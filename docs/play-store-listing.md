# Play Console 등록 — 붙여넣기용 문서

Play Console 이 묻는 **순서 그대로** 정리했습니다. 코드 블록은 그대로 복사해 넣으면 됩니다.
글자 수는 Play 제한에 맞춰 미리 맞춰 뒀습니다.

준비된 파일은 전부 `docs/store/` 에 있습니다.

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
그거 어디 뒀더라? 사진 찍어 두면 이름만으로 바로 찾습니다. 가족이 함께 쓰는 우리 집 물건 지도.
```

### 자세한 설명 (4000자 이내)
```
"그거 어디 뒀더라?"

계절 옷, 여행용 캐리어, 아이 장난감, 공구함, 약… 분명 어딘가에 잘 넣어뒀는데
막상 필요할 때는 온 집을 뒤집니다. 어디뒀지는 그 시간을 없애 줍니다.


■ 넣을 때 10초, 찾을 때 1초

물건을 사진 찍고 이름만 넣으면 끝입니다. 어느 방, 어느 박스에 뒀는지가
함께 기록됩니다. 나중에는 이름만 검색하면 바로 나옵니다.

• 초성으로도 찾아집니다 — "ㄱㅈㅈ" 만 쳐도 "건전지"가 나옵니다
• 사진이 함께 보여서 목록만 훑어도 뭐가 어디 있는지 바로 읽힙니다


■ 집 구조 그대로 정리

장소(안방·주방·창고) 안에 박스를 두고, 박스 안에 물건을 넣습니다.
박스에 넣지 않고 장소에 그냥 두는 물건도 됩니다 — 신발장의 우산처럼요.


■ 박스에 QR 라벨을 붙이세요

박스를 만들면 QR 코드가 자동으로 만들어집니다. A4 한 장에 21개까지 인쇄해
잘라 붙이면, 스캔하는 순간 그 박스에 뭐가 들었는지 열립니다.
상자를 하나하나 열어 볼 필요가 없습니다.


■ 가족이 함께 씁니다

초대 코드 하나면 가족이 같은 집에 들어옵니다. 누가 무엇을 어디로 옮겼는지
기록이 남아서, "내가 안 옮겼는데?" 로 끝나는 대화가 줄어듭니다.


■ 다 떨어지기 전에 알려줍니다

물건마다 "이만큼 남으면 알려줘" 를 정해 두면, 그 아래로 내려갈 때
살 것 목록에 자동으로 올라갑니다. 세제, 건전지, 아이 약처럼
떨어지고 나서야 알아채는 것들에 좋습니다.


■ 실수해도 되돌릴 수 있습니다

지운 물건은 30일 동안 휴지통에 남아 언제든 복구할 수 있습니다.


■ 개인정보

광고를 넣지 않고, 분석 도구를 쓰지 않으며, 어떤 데이터도 팔지 않습니다.
광고 식별자·위치정보·연락처를 수집하지 않습니다.
사진과 물건 목록은 같은 집 구성원에게만 보이며, 모든 데이터는
대한민국(AWS 서울)에 저장됩니다.

개인정보처리방침: https://jkinject.github.io/stow-app/privacy/
```

---

## 2. 스토어 등록정보 (영어 — 선택)

언어를 추가할 때 씁니다. 한국만 출시한다면 건너뛰어도 됩니다.

### 앱 이름
```
Stow - Find What You Put Away
```

### 간단한 설명
```
Where did I put that? Snap a photo when you stow it, then find it by name.
```

### 자세한 설명
```
"Where did I put that?"

Seasonal clothes, the suitcase, tools, the kids' toys, medicine — you put them
somewhere sensible, and then you tear the house apart looking for them.
Stow removes that.


■ Ten seconds to store, one second to find

Snap a photo, type a name. Stow remembers which room and which box it went into.
Later, just search the name.

• Photos in the list, so you recognise things at a glance
• Partial names work — no need to remember exactly what you called it


■ Mirrors how your home is actually organised

Places (bedroom, kitchen, garage) hold boxes, and boxes hold items.
Things can also sit loose in a place — like the umbrella by the front door.


■ Put QR labels on your boxes

Every box gets a QR code. Print up to 21 per A4 sheet, cut, stick.
Scan one and its contents open instantly — no more opening every box.


■ Built for households

One invite code brings your family into the same home. Every change is logged,
so "I didn't move it" conversations get a lot shorter.


■ Know before you run out

Set a threshold per item. Drop below it and the item lands on your shopping list
automatically — detergent, batteries, medicine.


■ Undo is always there

Deleted items stay in Trash for 30 days.


■ Privacy

No ads, no analytics SDKs, and we never sell your data. We don't collect
advertising IDs, location, or contacts. Your photos and lists are visible only
to members of your household.

Privacy policy: https://jkinject.github.io/stow-app/privacy/en/
```

---

## 3. 그래픽 애셋

| 항목 | 파일 | 규격 |
|---|---|---|
| 앱 아이콘 | `docs/store/icon-512.png` | 512×512 PNG ✅ |
| 그래픽 이미지 | `docs/store/feature-graphic-1024x500.png` | 1024×500 PNG ✅ |
| 휴대전화 스크린샷 | `docs/store/screenshots/01~06` | 1080×2520 PNG ✅ (최소 2장, 최대 8장) |

스크린샷 순서가 곧 스토어에 보이는 순서입니다. 첫 장이 가장 중요합니다.

| # | 파일 | 보여주는 것 |
|---|---|---|
| 1 | `01-signin.png` | 첫인상 — 앱이 무슨 앱인지 |
| 2 | `02-find.png` | 찾기 격자 (사진으로 훑기) |
| 3 | `03-item.png` | 물건 상세 (수량·위치·이동) |
| 4 | `04-category.png` | 카테고리 |
| 5 | `05-family.png` | 가족 초대 코드 |
| 6 | `06-more.png` | 설정 |

> 물건이 많이 들어간 상태로 다시 찍으면 훨씬 좋아집니다. 지금은 물건이 1개뿐이라
> 격자 화면이 비어 보입니다. 실제로 집을 정리하며 20~30개쯤 넣은 뒤
> 2번 스크린샷만 다시 찍는 것을 권합니다.

---

## 4. 앱 콘텐츠

### 개인정보처리방침
```
https://jkinject.github.io/stow-app/privacy/
```

### 앱 액세스 권한 ⚠️ 놓치기 쉬움
이 앱은 **로그인해야 쓸 수 있으므로**, 심사자에게 계정을 줘야 합니다.
주지 않으면 "로그인 화면만 보여서 심사할 수 없다" 로 반려됩니다.

> **전체 또는 일부 기능이 제한됨** 선택 → 안내 문구에 아래를 넣으세요.

```
로그인이 필요합니다. 아래 계정으로 "이메일로 계속하기"를 눌러 주세요.
받은 메일의 링크를 같은 기기에서 열면 로그인됩니다.

이메일: (심사용 계정 주소)

또는 구글 계정으로 로그인할 수 있습니다.
```

> 심사용 계정을 하나 만들어 두고, 장소·박스·물건을 몇 개 넣어 두면
> 심사자가 기능을 다 볼 수 있어 통과가 빨라집니다.

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

- [ ] 심사용 계정을 만들고 데이터를 조금 넣어 뒀다
- [ ] 개인정보처리방침 URL 이 열린다 (<https://jkinject.github.io/stow-app/privacy/>)
- [ ] AAB 가 업로드 키로 서명됐다 (`npm run android:aab` 가 "· 서명 업로드 키" 를 출력)
- [ ] 데이터 보안 양식과 개인정보처리방침 내용이 서로 맞다
- [ ] 업로드 키 백업 (`~/keystores/stow-upload.jks` + `.env.production.local` 의 비밀번호)
