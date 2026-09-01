/**
 * 한글 초성 검색 (AC8).
 *
 * 계획 §4.5 의 결정: **초성은 클라이언트가 전담한다.**
 *   `pg_trgm` 은 한글 부분일치는 처리하지만 초성 검색은 불가능하다. 서버에서 하려면
 *   자모 분해 immutable 함수 + 생성 컬럼 + 별도 인덱스가 필요한데, 가구당 물건이
 *   수천 건 규모라 클라이언트 메모리 선형 탐색이 서버 왕복보다 빠르다.
 *
 * 한글 음절은 U+AC00 부터 시작하고 (초성 19 × 중성 21 × 종성 28) 로 배열된다.
 *   초성 인덱스 = (코드 - 0xAC00) / 588
 */

const CHO = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
] as const;

const SYLLABLE_BASE = 0xac00;
const SYLLABLE_LAST = 0xd7a3;
const CHO_STRIDE = 588; // 21 중성 × 28 종성

/** 이미 자음 하나로 입력된 경우(ㄱ~ㅎ)도 초성으로 인정한다 */
const COMPAT_JAMO_START = 0x3131;
const COMPAT_JAMO_END = 0x314e;

/**
 * 문자열을 초성 문자열로 바꾼다.
 * 한글이 아닌 문자는 그대로 둔다 — "AA 건전지" → "AA ㄱㅈㅈ" 처럼 섞여도 검색되게.
 */
export function toChoseong(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (code >= SYLLABLE_BASE && code <= SYLLABLE_LAST) {
      out += CHO[Math.floor((code - SYLLABLE_BASE) / CHO_STRIDE)];
    } else {
      out += ch;
    }
  }
  return out;
}

/** 질의어가 초성만으로 이루어졌는가 — 그럴 때만 초성 매칭을 시도한다 */
export function isChoseongQuery(q: string): boolean {
  const t = q.replace(/\s/g, '');
  if (!t) return false;
  for (const ch of t) {
    const code = ch.codePointAt(0)!;
    const isCompatJamo = code >= COMPAT_JAMO_START && code <= COMPAT_JAMO_END;
    if (!isCompatJamo) return false;
  }
  return true;
}

/** 검색용 정규화: NFC 통일 + 소문자 + 공백 제거 */
export function normalize(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/\s+/g, '');
}

export type SearchIndexEntry = {
  /** 정규화된 이름 — 부분일치용 */
  norm: string;
  /** 초성 문자열 — 초성 질의용 */
  cho: string;
};

/** 물건 하나의 검색 인덱스를 만든다. 목록 로드 시 한 번만 계산한다 */
export function buildEntry(name: string, category?: string | null): SearchIndexEntry {
  const raw = category ? `${name} ${category}` : name;
  const norm = normalize(raw);
  return { norm, cho: normalize(toChoseong(raw)) };
}

/**
 * 매칭 판정.
 * 질의가 초성만이면 초성 문자열에서, 아니면 정규화된 이름에서 부분일치를 본다.
 * "전지" → norm 매칭, "ㄱㅈㅈ" → cho 매칭. 둘 다 "건전지"를 찾는다.
 */
export function matches(entry: SearchIndexEntry, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  if (isChoseongQuery(query)) return entry.cho.includes(q);
  // 초성이 아니어도 초성 문자열을 함께 본다 — "ㄱ전지" 같은 혼합 입력을 놓치지 않는다
  return entry.norm.includes(q) || entry.cho.includes(normalize(toChoseong(query)));
}
