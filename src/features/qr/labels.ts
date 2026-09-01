import { buildQrPayload } from './payload';
import { qrSvg } from './svg';

/**
 * A4 라벨 시트 (AC11).
 *
 * 한 장에 3열 × 7행 = **21개**. 라벨 용지 규격에 맞추지 않고 **일반 A4 에 인쇄해
 * 잘라 쓰는** 것을 기본으로 잡았다. 어떤 라벨지를 살지 모르는 상태에서 특정 규격에
 * 맞추면, 용지가 다를 때 21장이 통째로 어긋나 버린다. 재단선을 그려 두면 어느 종이든 쓸 수 있다.
 *
 * 여백 10mm 는 임의값이 아니다 — 대부분의 가정용 프린터가 인쇄하지 못하는 가장자리
 * 폭이 5~8mm 다. 여기에 맞추지 않으면 바깥쪽 라벨의 QR 이 잘려 나온다.
 */

export const SHEET = {
  pageW: 210,
  pageH: 297,
  margin: 10,
  cols: 3,
  rows: 7,
} as const;

export const PER_PAGE = SHEET.cols * SHEET.rows; // 21

/**
 * A4 를 포인트로 환산한 값 (1pt = 1/72 inch).
 *
 * ⚠ `Print.printToFileAsync` 의 기본 용지는 **US Letter(612×792pt)** 다.
 *   A4 로 짠 HTML 을 그대로 넘기면 오른쪽 열과 아래 행이 잘린 PDF 가 나온다.
 *   화면에서는 멀쩡해 보이고 인쇄해야 드러나므로 여기서 못박는다.
 */
export const A4_PT = { width: 595.28, height: 841.89 } as const;

export type LabelInput = {
  qrToken: string;
  containerName: string;
  locationName: string;
};

/**
 * ⚠ 박스 이름과 장소 이름은 **사용자가 친 글자**다. 그대로 HTML 에 넣으면
 *   `<` 하나로 문서가 깨져 라벨 전체가 백지로 인쇄된다. 악의가 없어도 `A<B 상자`
 *   같은 이름이면 그렇게 된다.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 라벨을 21개씩 페이지로 나눈다 */
export function paginate<T>(items: T[], perPage = PER_PAGE): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return pages;
}

function cell(l: LabelInput): string {
  const svg = qrSvg(buildQrPayload(l.qrToken));
  return (
    `<div class="cell">` +
    `<div class="qr">${svg}</div>` +
    `<div class="txt">` +
    `<div class="name">${escapeHtml(l.containerName)}</div>` +
    `<div class="loc">${escapeHtml(l.locationName)}</div>` +
    `</div></div>`
  );
}

/** 인쇄용 HTML 전체. expo-print 에 그대로 넘긴다 */
export function buildLabelSheetHtml(labels: LabelInput[]): string {
  if (labels.length === 0) throw new Error('인쇄할 라벨이 없습니다');

  const pages = paginate(labels)
    .map((page) => {
      // 마지막 페이지의 빈칸도 재단선이 이어지도록 채운다
      const blanks = Array.from({ length: PER_PAGE - page.length }, () => '<div class="cell"></div>');
      return `<div class="page">${page.map(cell).join('')}${blanks.join('')}</div>`;
    })
    .join('');

  const { pageW, pageH, margin, cols, rows } = SHEET;
  const cw = (pageW - margin * 2) / cols;
  const ch = (pageH - margin * 2) / rows;

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
  .page {
    width: ${pageW}mm; height: ${pageH}mm;
    padding: ${margin}mm;
    display: grid;
    grid-template-columns: repeat(${cols}, ${cw}mm);
    grid-template-rows: repeat(${rows}, ${ch}mm);
    page-break-after: always;
  }
  /* 마지막 페이지 뒤에 빈 장이 딸려 나오지 않게 한다 */
  .page:last-child { page-break-after: auto; }
  .cell {
    display: flex; align-items: center; gap: 2.5mm;
    padding: 2mm;
    /* 재단선 — 인쇄되지만 눈에 거슬리지 않을 만큼만 흐리게 */
    border: 0.2mm dashed #bbb;
    overflow: hidden;
  }
  .qr { width: ${Math.min(ch - 6, 26)}mm; flex: 0 0 auto; }
  .qr svg { width: 100%; height: auto; display: block; }
  .txt { min-width: 0; }
  .name {
    font-size: 11pt; font-weight: 700; line-height: 1.15;
    /* 이름이 길면 두 줄까지 보여주고 자른다 — 넘치면 옆 칸을 밀어낸다 */
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; word-break: break-all;
  }
  .loc {
    font-size: 8pt; color: #555; margin-top: 1mm;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
</style></head><body>${pages}</body></html>`;
}
