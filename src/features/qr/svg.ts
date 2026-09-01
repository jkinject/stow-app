import QR from 'qrcode/lib/core/qrcode';

/**
 * QR 매트릭스를 SVG 문자열로 그린다 (AC11).
 *
 * 왜 직접 그리는가: `qrcode` 패키지의 `toString({type:'svg'})` 는 Node 의 fs 를 끌어와
 * Hermes 에서 죽는다. react-native-qrcode-svg 도 같은 이유로 core 만 쓴다.
 * 여기서 만든 문자열은 **PDF 로 인쇄될 HTML 에 그대로 박히므로** 순수 함수여야 하고,
 * 인쇄 전에 테스트로 검증할 수 있어야 한다 (R14).
 *
 * 에러정정 Q(25%): 박스에 붙인 라벨은 긁히고 먼지가 앉는다. 기본값 M(15%) 보다
 * 한 단계 높이면 모듈이 33→37 로 조금 촘촘해지는 대신 훼손 내성이 크게 는다.
 */

const ECL = 'Q';
/** 조용한 여백. 4모듈은 QR 규격이 요구하는 최소값이다 — 줄이면 인식률이 떨어진다 */
const QUIET_ZONE = 4;

export type QrMatrix = { size: number; get(row: number, col: number): boolean };

export function qrMatrix(payload: string): QrMatrix {
  const q = QR.create(payload, { errorCorrectionLevel: ECL });
  const size: number = q.modules.size;
  const data: Uint8Array = q.modules.data;
  return { size, get: (r, c) => data[r * size + c] === 1 };
}

/**
 * viewBox 좌표계가 곧 모듈 좌표계다. 실제 크기는 쓰는 쪽에서 CSS 로 정한다 —
 * 그래야 같은 문자열을 라벨(24mm)과 화면 미리보기에 그대로 쓸 수 있다.
 */
export function qrSvg(payload: string): string {
  const m = qrMatrix(payload);
  const dim = m.size + QUIET_ZONE * 2;

  // 어두운 모듈을 한 개의 path 로 합친다. rect 를 1,369개 쓰면 문서가 수백 KB 로 붓고
  // 렌더러에 따라 인접 rect 사이에 흰 실선이 비쳐 인식이 나빠진다.
  let d = '';
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.get(r, c)) d += `M${c + QUIET_ZONE} ${r + QUIET_ZONE}h1v1h-1z`;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="QR">` +
    `<rect width="${dim}" height="${dim}" fill="#fff"/>` +
    `<path d="${d}" fill="#000"/>` +
    `</svg>`
  );
}
