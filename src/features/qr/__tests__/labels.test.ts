import { buildLabelSheetHtml, escapeHtml, paginate, PER_PAGE, SHEET } from '../labels';
import type { LabelInput } from '../labels';

const mk = (n: number): LabelInput[] =>
  Array.from({ length: n }, (_, i) => ({
    // 유효한 uuid 여야 한다 — 16진수만 쓴다
    qrToken: `cb83aa5f-603a-47c4-9c0c-7fc43313${String(i).padStart(4, '0')}`,
    containerName: `${i + 1}번 박스`,
    locationName: '현관 팬트리',
  }));

describe('escapeHtml', () => {
  // ⚠ 이게 뚫리면 라벨 한 장이 통째로 백지로 인쇄된다. 악의가 아니라 이름 때문에도 그렇다.
  it('꺾쇠와 따옴표를 막는다', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(escapeHtml(`"'&`)).toBe('&quot;&#39;&amp;');
  });

  it('앰퍼샌드를 먼저 바꿔 이중 이스케이프를 피한다', () => {
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('한글과 공백은 그대로 둔다', () => {
    expect(escapeHtml('현관 팬트리 › 3번')).toBe('현관 팬트리 › 3번');
  });
});

describe('paginate', () => {
  it('21개까지는 한 장', () => {
    expect(paginate(mk(21))).toHaveLength(1);
    expect(paginate(mk(1))).toHaveLength(1);
  });
  it('22개부터 두 장', () => {
    const p = paginate(mk(22));
    expect(p).toHaveLength(2);
    expect(p[0]).toHaveLength(21);
    expect(p[1]).toHaveLength(1);
  });
  it('빈 목록은 0장', () => {
    expect(paginate([])).toHaveLength(0);
  });
});

describe('buildLabelSheetHtml', () => {
  it('한 장에 21칸을 만든다 (AC11)', () => {
    const html = buildLabelSheetHtml(mk(21));
    expect((html.match(/class="cell"/g) ?? []).length).toBe(21);
    expect((html.match(/class="page"/g) ?? []).length).toBe(1);
  });

  it('모자란 만큼 빈칸으로 채워 재단선이 이어진다', () => {
    const html = buildLabelSheetHtml(mk(4));
    expect((html.match(/class="cell"/g) ?? []).length).toBe(PER_PAGE);
    expect((html.match(/<svg/g) ?? []).length).toBe(4); // QR 은 4개만
  });

  it('22개면 두 장으로 나뉜다', () => {
    const html = buildLabelSheetHtml(mk(22));
    expect((html.match(/class="page"/g) ?? []).length).toBe(2);
    expect((html.match(/<svg/g) ?? []).length).toBe(22);
  });

  it('라벨마다 QR·박스명·장소명이 들어간다 (AC11)', () => {
    const html = buildLabelSheetHtml([
      { qrToken: 'cb83aa5f-603a-47c4-9c0c-7fc4331329ee', containerName: '겨울옷', locationName: '베란다 창고' },
    ]);
    expect(html).toContain('<svg');
    expect(html).toContain('겨울옷');
    expect(html).toContain('베란다 창고');
  });

  it('박스 이름의 HTML 이 문서를 깨뜨리지 못한다', () => {
    const html = buildLabelSheetHtml([
      {
        qrToken: 'cb83aa5f-603a-47c4-9c0c-7fc4331329ee',
        containerName: '</div><script>alert(1)</script>',
        locationName: '"><b>',
      },
    ]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    // 셀 개수가 그대로여야 구조가 안 깨진 것이다
    expect((html.match(/class="cell"/g) ?? []).length).toBe(PER_PAGE);
  });

  it('A4 크기와 인쇄 여백을 문서에 못박는다', () => {
    const html = buildLabelSheetHtml(mk(1));
    expect(html).toContain('size: A4');
    expect(html).toContain(`width: ${SHEET.pageW}mm`);
    expect(html).toContain(`height: ${SHEET.pageH}mm`);
    expect(html).toContain(`padding: ${SHEET.margin}mm`);
  });

  it('마지막 페이지 뒤에 빈 장이 딸려 나오지 않는다', () => {
    expect(buildLabelSheetHtml(mk(1))).toContain('.page:last-child { page-break-after: auto; }');
  });

  it('빈 목록이면 만들지 않는다 — 백지 한 장을 인쇄시키지 않는다', () => {
    expect(() => buildLabelSheetHtml([])).toThrow();
  });

  it('토큰이 깨졌으면 인쇄 전에 터진다 (R14)', () => {
    expect(() =>
      buildLabelSheetHtml([{ qrToken: 'oops', containerName: 'x', locationName: 'y' }]),
    ).toThrow();
  });
});

describe('A4_PT', () => {
  it('A4 를 포인트로 정확히 환산한다 — 기본값(Letter)으로 새면 인쇄물이 잘린다', () => {
    const { A4_PT } = jest.requireActual<typeof import('../labels')>('../labels');
    // 210mm × 297mm 를 pt 로: mm / 25.4 * 72
    expect(A4_PT.width).toBeCloseTo((210 / 25.4) * 72, 1);
    expect(A4_PT.height).toBeCloseTo((297 / 25.4) * 72, 1);
    // Letter 가 아니어야 한다
    expect(A4_PT.width).not.toBe(612);
    expect(A4_PT.height).not.toBe(792);
  });
});
