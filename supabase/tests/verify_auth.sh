#!/usr/bin/env bash
# 홈 스토어 M2 — 인증·가구 온보딩 실제 경로 검증 (AC25, AC26)
# 로컬 Supabase 를 실제 HTTP 로 두드린다. SQL 테스트가 아니라 앱이 실제로 타는 경로다.
set -o pipefail

API="${API:-http://127.0.0.1:54321}"
ANON="${ANON:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0}"
FAIL=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAIL=1; }

j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const o=JSON.parse(s);const v=$1;console.log(v===undefined||v===null?'':v)}catch(e){console.log('')}})"; }

E1="owner_$RANDOM@homestore-test.com"
E2="member_$RANDOM@homestore-test.com"
PW="devpassword123"

echo "═══ M2 인증 · 가구 온보딩 ═══"

# ── 사용자 생성
#
# ⚠ 원격(호스팅)에서는 일반 signup 이 확인 메일을 보내는데, 무료 티어의 내장 SMTP 는
#   **시간당 몇 통** 수준이라 곧바로 429 over_email_send_rate_limit 이 난다.
#   따라서 SERVICE_KEY 가 주어지면 admin API 로 메일 발송 없이 생성한다.
#   (로컬에서는 SERVICE_KEY 없이 일반 signup 으로도 충분하다)
signup() {
  if [ -n "${SERVICE_KEY:-}" ]; then
    curl -s -X POST "$API/auth/v1/admin/users" \
      -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H "Content-Type: application/json" \
      -d "{\"email\":\"$1\",\"password\":\"$PW\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"$2\"}}" >/dev/null
    curl -s -X POST "$API/auth/v1/token?grant_type=password" \
      -H "apikey: $ANON" -H "Content-Type: application/json" \
      -d "{\"email\":\"$1\",\"password\":\"$PW\"}"
  else
    curl -s -X POST "$API/auth/v1/signup" -H "apikey: $ANON" -H "Content-Type: application/json" \
      -d "{\"email\":\"$1\",\"password\":\"$PW\",\"data\":{\"full_name\":\"$2\"}}"
  fi
}
T1=$(signup "$E1" "김소유" | j "o.access_token")
T2=$(signup "$E2" "이참여" | j "o.access_token")

[ -n "$T1" ] && [ -n "$T2" ] && ok "사용자 2명 가입 성공" || { bad "가입 실패"; exit 1; }

# ── 가입 트리거가 profiles 를 만들었는지 (표시 이름은 AC20 이 의존한다)
NAME=$(curl -s "$API/rest/v1/profiles?select=display_name" -H "apikey: $ANON" -H "Authorization: Bearer $T1" | j "o[0] && o[0].display_name")
[ "$NAME" = "김소유" ] && ok "가입 트리거가 profiles 를 만들고 표시 이름을 넣었다 (AC20 전제)" \
                       || bad "profiles 표시 이름이 '김소유' 가 아니라 '$NAME'"

# ── households 직접 INSERT 는 막혀야 한다 (닭과 달걀 → RPC 만)
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/rest/v1/households" \
  -H "apikey: $ANON" -H "Authorization: Bearer $T1" -H "Content-Type: application/json" \
  -d '{"name":"직접생성"}')
[ "$CODE" = "403" ] || [ "$CODE" = "401" ] && ok "households 직접 INSERT 차단 (HTTP $CODE)" \
                                            || bad "households 직접 INSERT 가 막히지 않음 (HTTP $CODE)"

# ── create_household RPC 로는 되어야 한다 (AC25)
HH=$(curl -s -X POST "$API/rest/v1/rpc/create_household" \
  -H "apikey: $ANON" -H "Authorization: Bearer $T1" -H "Content-Type: application/json" \
  -d '{"p_name":"우리집"}' | j "o.id")
[ -n "$HH" ] && ok "create_household RPC 로 가구 생성 (AC25)" || { bad "create_household 실패"; exit 1; }

ROLE=$(curl -s "$API/rest/v1/household_members?select=role" -H "apikey: $ANON" -H "Authorization: Bearer $T1" | j "o[0] && o[0].role")
[ "$ROLE" = "owner" ] && ok "생성자가 owner 로 원자적으로 등록됐다" || bad "역할이 owner 가 아니라 '$ROLE'"

# ── owner 가 초대 코드 발급 (AC26)
INV=$(curl -s -X POST "$API/rest/v1/invites" \
  -H "apikey: $ANON" -H "Authorization: Bearer $T1" -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"household_id\":\"$HH\",\"code\":\"TESTCODE$RANDOM\",\"expires_at\":\"2030-01-01T00:00:00Z\"}" | j "o[0] && o[0].code")
[ -n "$INV" ] && ok "owner 가 초대 코드를 발급했다 (AC26)" || { bad "초대 코드 발급 실패"; exit 1; }

# ── 비멤버는 초대 코드를 조회조차 못 한다 (accept_invite 가 DEFINER 여야 하는 이유)
SEEN=$(curl -s "$API/rest/v1/invites?select=code" -H "apikey: $ANON" -H "Authorization: Bearer $T2" | j "o.length")
[ "$SEEN" = "0" ] && ok "비멤버는 invites 를 조회할 수 없다" || bad "비멤버에게 invites 가 $SEEN 건 보인다"

# ── 그런데 RPC 로는 참여할 수 있어야 한다 (AC25)
JOINED=$(curl -s -X POST "$API/rest/v1/rpc/accept_invite" \
  -H "apikey: $ANON" -H "Authorization: Bearer $T2" -H "Content-Type: application/json" \
  -d "{\"p_code\":\"$INV\"}" | j "o.id")
[ "$JOINED" = "$HH" ] && ok "accept_invite RPC 로 참여했다 (AC25)" || bad "참여 실패 ($JOINED)"

# ── used_by 는 서버가 스탬프한다 (P3)
USEDBY=$(curl -s "$API/rest/v1/invites?select=used_by" -H "apikey: $ANON" -H "Authorization: Bearer $T1" | j "o[0] && o[0].used_by")
[ -n "$USEDBY" ] && ok "used_by 를 서버가 스탬프했다 (P3)" || bad "used_by 가 비어 있다"

# ── 재사용 거부
REUSE=$(curl -s -X POST "$API/rest/v1/rpc/accept_invite" -H "apikey: $ANON" -H "Authorization: Bearer $T2" \
  -H "Content-Type: application/json" -d "{\"p_code\":\"$INV\"}" | j "o.message")
echo "$REUSE" | grep -q "이미 사용" && ok "사용된 코드는 재사용할 수 없다" || bad "재사용이 막히지 않음 ($REUSE)"

# ── 두 계정이 같은 데이터를 본다 (AC25 완료 조건)
N1=$(curl -s "$API/rest/v1/households?select=id" -H "apikey: $ANON" -H "Authorization: Bearer $T1" | j "o.length")
N2=$(curl -s "$API/rest/v1/households?select=id" -H "apikey: $ANON" -H "Authorization: Bearer $T2" | j "o.length")
[ "$N1" = "1" ] && [ "$N2" = "1" ] && ok "두 계정이 같은 가구를 본다" || bad "가구 조회 불일치 ($N1 / $N2)"

# ── 매직링크 발송 경로가 살아 있는지 (메일 왕복은 수동 확인 영역)
MAGIC=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/v1/otp" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"magic_$RANDOM@homestore-test.com\",\"create_user\":true}")
if [ "$MAGIC" = "200" ]; then
  ok "매직링크 발송 요청이 수락된다 (HTTP 200)"
elif [ "$MAGIC" = "429" ]; then
  echo "  ⚠️  매직링크 발송이 rate limit 에 걸렸다 (HTTP 429) — 내장 SMTP 의 시간당 한도."
  echo "      프로덕션에서 매직링크를 쓰려면 커스텀 SMTP 가 필요하다 (R25). 구글 로그인은 영향 없음."
else
  bad "매직링크 발송 실패 (HTTP $MAGIC)"
fi

# ── 구글 provider 가 설정되어 authorize 로 리다이렉트되는지
GOOG=$(curl -s -o /dev/null -w '%{http_code}' "$API/auth/v1/authorize?provider=google&redirect_to=homestore://auth-callback")
if [ "$GOOG" = "302" ]; then
  ok "구글 provider 가 활성화되어 있다 (HTTP 302)"
elif [ "$GOOG" = "400" ]; then
  echo "  ⚠️  구글 provider 미설정 (HTTP 400) — CLIENT_ID/SECRET 환경변수가 필요하다. docs/google-oauth.md 참조"
else
  bad "구글 authorize 응답이 예상 밖 (HTTP $GOOG)"
fi

echo
[ "$FAIL" = "0" ] && echo "═══ 전체 통과 ═══" || echo "═══ 실패 있음 ═══"
exit $FAIL
