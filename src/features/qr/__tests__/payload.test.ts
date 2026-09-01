import { buildQrPayload, isQrToken, parseQrPayload } from '../payload';

const T = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607';

describe('QR 페이로드 왕복 (R14)', () => {
  // ⚠ 이 테스트가 M6 의 첫 관문이다. 라벨을 인쇄한 뒤에 깨지면 인쇄물을 전부 버려야 한다.
  it('만든 문자열이 그대로 다시 읽힌다', () => {
    const payload = buildQrPayload(T);
    expect(payload).toBe(`stow://c/${T}`);
    expect(parseQrPayload(payload)).toEqual({ kind: 'token', token: T });
  });

  it('대문자 토큰을 넣어도 소문자로 왕복한다', () => {
    expect(parseQrPayload(buildQrPayload(T.toUpperCase()))).toEqual({ kind: 'token', token: T });
  });

  it('uuid 가 아니면 만들지 않는다 — 깨진 라벨을 인쇄하느니 여기서 터지는 게 낫다', () => {
    expect(() => buildQrPayload('abc')).toThrow();
    expect(() => buildQrPayload('')).toThrow();
  });
});

describe('스캔 입력 관대하게 받기', () => {
  it.each([
    ['우리가 인쇄한 형태', `stow://c/${T}`],
    ['Linking.createURL 형태(슬래시 3개)', `stow:///c/${T}`],
    ['앞뒤 공백', `  stow://c/${T}  `],
    ['스킴 대문자', `STOW://c/${T}`],
    ['토큰만 있는 QR', T],
    ['쿼리스트링이 붙은 경우', `stow://c/${T}?from=label`],
    ['나중에 붙일 유니버설 링크', `https://stow.jangstar.net/c/${T}`],
  ])('%s → 토큰을 뽑는다', (_label, raw) => {
    expect(parseQrPayload(raw)).toEqual({ kind: 'token', token: T });
  });

  // AC14 — 남의 QR 로 앱이 죽으면 안 된다
  it.each([
    ['빈 문자열', ''],
    ['평범한 웹사이트', 'https://www.naver.com'],
    ['와이파이 QR', 'WIFI:S:home;T:WPA;P:pw;;'],
    ['전화번호', 'tel:01012345678'],
    ['다른 앱 딥링크', 'kakaotalk://open'],
    // /c/ 로 시작하지 않는 https 를 '깨진 우리 QR' 로 보고하면 안 된다
    ['우리 것이 아닌 https 경로', 'https://example.com/items/3'],
  ])('%s → foreign', (_label, raw) => {
    expect(parseQrPayload(raw)).toEqual({ kind: 'foreign' });
  });

  it.each([
    ['형식은 맞는데 토큰이 깨짐', 'stow://c/not-a-uuid'],
    ['토큰이 아예 없음', 'stow://c/'],
    ['경로가 다름', 'stow://item/3'],
    ['https 인데 토큰이 깨짐', 'https://stow.jangstar.net/c/oops'],
  ])('%s → malformed', (_label, raw) => {
    expect(parseQrPayload(raw)).toEqual({ kind: 'malformed' });
  });

  it('어떤 입력에도 예외를 던지지 않는다 (AC14)', () => {
    const junk = ['', ' ', '\n', '://', 'stow://', 'a'.repeat(5000), '한글', '🎁'];
    for (const j of junk) expect(() => parseQrPayload(j)).not.toThrow();
  });
});

describe('isQrToken', () => {
  it('uuid 만 통과시킨다', () => {
    expect(isQrToken(T)).toBe(true);
    expect(isQrToken(T.toUpperCase())).toBe(true);
    expect(isQrToken('3f2a1b4c5d6e4f708a91b2c3d4e5f607')).toBe(false); // 하이픈 없음
    expect(isQrToken(null)).toBe(false);
    expect(isQrToken(123)).toBe(false);
  });
});
