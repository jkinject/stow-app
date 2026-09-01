import { buildQrPayload } from '../payload';
import { qrMatrix, qrSvg } from '../svg';

const T = 'cb83aa5f-603a-47c4-9c0c-7fc4331329ee';
const PAYLOAD = buildQrPayload(T);

describe('qrMatrix', () => {
  /**
   * ⚠ 숫자를 박아 두는 이유: **모듈이 늘면 인쇄된 라벨이 안 읽힌다.**
   *   라벨 크기는 그대로인데 모듈만 촘촘해지면 점 하나가 작아져 카메라가 못 읽는다.
   *   페이로드를 길게 만드는 변경이 조용히 들어오는 것을 여기서 잡는다.
   *
   *   33 은 `stow://c/{uuid}` (41자) 가 Q 레벨에 들어가는 크기다.
   *   앱 이름을 `homestore` 에서 `stow` 로 줄였을 때 37 → 33 으로 **줄었다** —
   *   점이 커졌으니 스캔이 쉬워진 것이고, 그래서 이 값을 낮춰 고정한다.
   *   이 숫자가 다시 커지면 라벨 인쇄 크기부터 다시 봐야 한다.
   */
  it('Q 레벨로 33모듈을 만든다 — 커지면 인쇄 라벨이 안 읽힌다', () => {
    expect(qrMatrix(PAYLOAD).size).toBe(33);
  });

  it('세 모서리에 파인더 패턴이 있다 — QR 이 맞다는 최소 증거', () => {
    const m = qrMatrix(PAYLOAD);
    const finder = (r0: number, c0: number) => m.get(r0, c0) && m.get(r0 + 6, c0 + 6);
    expect(finder(0, 0)).toBe(true);                    // 좌상
    expect(finder(0, m.size - 7)).toBe(true);           // 우상
    expect(finder(m.size - 7, 0)).toBe(true);           // 좌하
  });

  it('토큰이 다르면 매트릭스도 다르다', () => {
    const a = qrSvg(buildQrPayload(T));
    const b = qrSvg(buildQrPayload('00000000-1111-2222-3333-444444444444'));
    expect(a).not.toBe(b);
  });

  it('같은 토큰은 항상 같은 그림이다 — 재인쇄해도 스캔되어야 한다', () => {
    expect(qrSvg(PAYLOAD)).toBe(qrSvg(PAYLOAD));
  });
});

describe('qrSvg', () => {
  it('조용한 여백 4모듈을 포함한 viewBox 를 만든다', () => {
    // ⚠ 숫자를 또 박지 않는다. 매트릭스에서 끌어와야 둘이 어긋나지 않는다
    const size = qrMatrix(PAYLOAD).size;
    expect(qrSvg(PAYLOAD)).toContain(`viewBox="0 0 ${size + 8} ${size + 8}"`);
  });

  it('흰 배경을 깐다 — 어두운 종이나 배경색 위에서도 읽혀야 한다', () => {
    expect(qrSvg(PAYLOAD)).toContain('fill="#fff"');
  });

  it('rect 를 남발하지 않고 path 하나로 합친다', () => {
    const svg = qrSvg(PAYLOAD);
    expect((svg.match(/<rect/g) ?? []).length).toBe(1); // 배경 하나뿐
    expect((svg.match(/<path/g) ?? []).length).toBe(1);
  });

  it('HTML 에 그대로 박아도 깨지지 않는다 — 따옴표가 닫혀 있다', () => {
    const svg = qrSvg(PAYLOAD);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect((svg.match(/"/g) ?? []).length % 2).toBe(0);
  });
});
