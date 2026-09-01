import { buildEntry, isChoseongQuery, matches, normalize, toChoseong } from '../hangul';

describe('toChoseong', () => {
  it('한글 음절을 초성으로 바꾼다', () => {
    expect(toChoseong('건전지')).toBe('ㄱㅈㅈ');
    expect(toChoseong('세탁세제')).toBe('ㅅㅌㅅㅈ');
    expect(toChoseong('우산')).toBe('ㅇㅅ');
  });

  it('쌍자음 초성을 정확히 뽑는다', () => {
    expect(toChoseong('꽃')).toBe('ㄲ');
    expect(toChoseong('빵')).toBe('ㅃ');
    expect(toChoseong('짜장')).toBe('ㅉㅈ');
  });

  it('한글이 아닌 문자는 그대로 둔다', () => {
    expect(toChoseong('AA 건전지')).toBe('AA ㄱㅈㅈ');
    expect(toChoseong('USB-C 케이블')).toBe('USB-C ㅋㅇㅂ');
    expect(toChoseong('123')).toBe('123');
  });

  it('종성이 있어도 초성만 뽑는다', () => {
    // 각(종성 ㄱ) 과 가(종성 없음) 는 초성이 같다
    expect(toChoseong('각')).toBe(toChoseong('가'));
  });
});

describe('isChoseongQuery', () => {
  it('자음만 입력하면 초성 질의로 본다', () => {
    expect(isChoseongQuery('ㄱㅈㅈ')).toBe(true);
    expect(isChoseongQuery('ㅅㅌ')).toBe(true);
  });

  it('완성형 한글이 섞이면 초성 질의가 아니다', () => {
    expect(isChoseongQuery('건전지')).toBe(false);
    expect(isChoseongQuery('ㄱ전지')).toBe(false);
  });

  it('빈 문자열은 초성 질의가 아니다', () => {
    expect(isChoseongQuery('')).toBe(false);
    expect(isChoseongQuery('   ')).toBe(false);
  });
});

describe('normalize', () => {
  it('NFD 로 들어와도 NFC 로 통일한다', () => {
    // macOS 파일명 등에서 오는 분해형
    const nfd = '건전지'.normalize('NFD');
    expect(normalize(nfd)).toBe(normalize('건전지'));
  });

  it('대소문자와 공백을 없앤다', () => {
    expect(normalize('AA 건전지')).toBe('aa건전지');
  });
});

describe('matches — AC8', () => {
  const battery = buildEntry('건전지 AA');
  const detergent = buildEntry('세탁세제', '세제');
  const umbrella = buildEntry('우산');

  it('부분일치로 찾는다', () => {
    expect(matches(battery, '전지')).toBe(true);
    expect(matches(battery, '건전')).toBe(true);
  });

  it('초성으로 찾는다', () => {
    expect(matches(battery, 'ㄱㅈㅈ')).toBe(true);
    expect(matches(detergent, 'ㅅㅌ')).toBe(true);
    expect(matches(umbrella, 'ㅇㅅ')).toBe(true);
  });

  it('계획의 예시가 실제로 동작한다 — "전지"와 "ㄱㅈㅈ" 둘 다 건전지를 찾는다', () => {
    expect(matches(battery, '전지')).toBe(true);
    expect(matches(battery, 'ㄱㅈㅈ')).toBe(true);
  });

  it('카테고리도 검색 대상이다', () => {
    expect(matches(detergent, '세제')).toBe(true);
  });

  it('관계없는 질의는 걸리지 않는다', () => {
    expect(matches(battery, '우산')).toBe(false);
    expect(matches(umbrella, 'ㄱㅈㅈ')).toBe(false);
  });

  it('빈 질의는 전부 통과시킨다', () => {
    expect(matches(battery, '')).toBe(true);
  });

  it('대소문자·공백을 무시한다', () => {
    expect(matches(battery, 'aa')).toBe(true);
    expect(matches(battery, '건 전 지')).toBe(true);
  });
});

describe('성능 — AC6 예산', () => {
  it('5,000건 선형 탐색이 50ms 안에 끝난다', () => {
    const names = ['건전지 AA', '세탁세제', '우산', '겨울 양말', '캠핑 의자', '테이프'];
    const idx = Array.from({ length: 5000 }, (_, i) => buildEntry(`${names[i % 6]} ${i}`));
    const t0 = Date.now();
    const hits = idx.filter((e) => matches(e, 'ㄱㅈㅈ'));
    const ms = Date.now() - t0;
    expect(hits.length).toBeGreaterThan(0);
    // AC6 은 300ms 예산이고 여기에 렌더까지 들어간다. 탐색은 그 일부만 써야 한다.
    expect(ms).toBeLessThan(50);
  });
});
