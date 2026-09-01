/**
 * QR 페이로드 (AC12 · AC14).
 *
 * 계획 §M6 결정(2026-08-30): 도메인이 없어 **커스텀 스킴**으로 먼저 간다.
 *   현재:  stow://c/{token}
 *   나중:  https://{도메인}/c/{token}   ← 유니버설 링크로 전환 시
 *
 * ⚠ 전환하면 QR 이미지가 달라지므로 **라벨을 다시 인쇄해야 한다.** 토큰(uuid)은
 *   그대로지만 인코딩되는 문자열이 바뀌기 때문이다. 많이 인쇄하기 전에 결정할 것.
 *
 * 이 파일이 순수 함수인 이유: 인쇄물은 되돌릴 수 없다. 앱을 띄우지 않고도
 * "만든 문자열이 그대로 다시 읽히는가"를 테스트로 고정해야 한다 (R14).
 */

export const QR_SCHEME = 'stow';
export const QR_PATH = 'c';

/** 8-4-4-4-12 hex. 대문자로 와도 받아준다 — QR 리더가 대문자로 정규화하는 경우가 있다 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ⚠ `v is string` 술어를 쓰면 안 된다. 인자가 이미 string 일 때 else 가지가 never 로
//    좁혀져서, 토큰이 아닐 때의 정상 분기가 컴파일되지 않는다.
export function isQrToken(v: unknown): boolean {
  return typeof v === 'string' && UUID_RE.test(v.trim());
}

/** 라벨에 인쇄될 문자열을 만든다 */
export function buildQrPayload(token: string): string {
  if (!isQrToken(token)) throw new Error(`QR 토큰이 uuid 형식이 아닙니다: ${token}`);
  return `${QR_SCHEME}://${QR_PATH}/${token.toLowerCase()}`;
}

export type ParseResult =
  | { kind: 'token'; token: string }
  | { kind: 'foreign' }   // 우리 QR 이 아니다 (다른 앱/사이트 QR)
  | { kind: 'malformed' }; // 우리 형식인데 토큰이 깨졌다

/**
 * 스캔된 문자열을 해석한다.
 *
 * 관대하게 받는다 — 실제 QR 리더는 다음을 모두 뱉는다:
 *   · stow://c/{token}      우리가 인쇄한 것
 *   · stow:///c/{token}     Linking.createURL 이 만드는 형태 (슬래시 3개)
 *   · https://{도메인}/c/{token}  나중에 붙일 유니버설 링크 (미리 받아둔다)
 *   · {token}                    토큰만 들어 있는 구형/수기 QR
 * 앞뒤 공백과 대소문자는 무시한다.
 */
export function parseQrPayload(raw: string): ParseResult {
  const s = (raw ?? '').trim();
  if (!s) return { kind: 'foreign' };

  // 토큰만 있는 경우
  if (isQrToken(s)) return { kind: 'token', token: s.toLowerCase() };

  const lower = s.toLowerCase();
  const isOurs =
    lower.startsWith(`${QR_SCHEME}://`) ||
    // https 는 경로가 /c/ 로 시작할 때만 우리 것으로 본다.
    // 그렇지 않으면 세상의 모든 https QR 이 '깨진 우리 QR' 로 잘못 보고된다.
    (/^https?:\/\//.test(lower) && /^https?:\/\/[^/]+\/+c\/+[^/?#]+/.test(lower));
  if (!isOurs) return { kind: 'foreign' };

  // 스킴을 떼고 경로만 본다. 커스텀 스킴은 슬래시 개수가 들쭉날쭉하다.
  const afterScheme = s.replace(/^[a-z][a-z0-9+.-]*:\/*/i, '');
  // https 면 첫 조각이 호스트다 — 떼어낸다
  const segs = afterScheme.split(/[?#]/)[0].split('/').filter(Boolean);
  const start = /^https?:/i.test(s) ? 1 : 0;
  const path = segs.slice(start);

  if (path[0]?.toLowerCase() !== QR_PATH) return { kind: 'malformed' };
  const token = path[1];
  if (!token || !isQrToken(token)) return { kind: 'malformed' };
  return { kind: 'token', token: token.toLowerCase() };
}
