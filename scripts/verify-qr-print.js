#!/usr/bin/env node
/**
 * 인쇄 전 QR 판독 검증 (R14).
 *
 * "화면에서 예뻐 보인다" 와 "종이에 찍힌 걸 폰이 읽는다" 는 다른 문제다.
 * 21장을 인쇄해 박스에 붙인 뒤에 안 읽히면 전부 떼어내야 한다.
 * 그래서 여기서 **실제 인쇄 크기로 래스터화해 디코딩까지** 해 본다.
 *
 *   node scripts/verify-qr-print.js
 *
 * 필요: Chrome(래스터화), jsqr·pngjs(디코딩) — 모두 devDependency 이거나 시스템에 있다.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const jsQR = require('jsqr');
const { PNG } = require('pngjs');

/**
 * TS 소스를 그때그때 컴파일해서 쓴다. 빌드 산출물을 저장소에 남겨 두면
 * 소스를 고친 뒤 낡은 산출물을 검증하는 사고가 난다 — 그 경우 "통과" 가 거짓이 된다.
 */
const BUILD = path.join(__dirname, '..', 'node_modules', '.cache', 'qr-verify');
execFileSync('npx', [
  'tsc', '--ignoreConfig',
  'src/features/qr/payload.ts', 'src/features/qr/svg.ts', 'src/features/qr/labels.ts',
  // --ignoreConfig 면 tsconfig 의 include 를 안 읽으므로 선언 파일을 직접 넘긴다
  'types/qrcode-core.d.ts',
  '--outDir', BUILD,
  '--module', 'commonjs', '--target', 'es2020', '--esModuleInterop', '--skipLibCheck',
], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });

const { buildQrPayload } = require(path.join(BUILD, 'payload.js'));
const { qrSvg } = require(path.join(BUILD, 'svg.js'));

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * 시험할 픽셀 크기.
 * 라벨의 QR 은 26mm 다. 폰 카메라가 그걸 몇 픽셀로 잡느냐가 관건인데,
 *   · 300dpi 레이저 인쇄물 자체  = 307px
 *   · 30cm 거리 12MP 카메라 촬영 ≈ 500~700px
 *   · 어두운 창고에서 대충 찍음  ≈ 150~200px  ← 여기가 현실적인 바닥
 * 200px 에서 읽히면 실사용에서 문제 없다고 본다.
 */
const SIZES = [120, 150, 200, 307];

const TOKENS = [
  'cb83aa5f-603a-47c4-9c0c-7fc4331329ee',
  '00000000-1111-2222-3333-444444444444',
  'ffffffff-ffff-4fff-bfff-ffffffffffff',
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qrverify-'));
let fail = 0;

for (const token of TOKENS) {
  const payload = buildQrPayload(token);
  const svg = qrSvg(payload);
  const row = [];

  for (const px of SIZES) {
    const html = path.join(tmp, `q-${px}.html`);
    const png = path.join(tmp, `q-${px}.png`);
    fs.writeFileSync(
      html,
      `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
       html,body{margin:0;padding:0;background:#fff}
       .w{width:${px}px;height:${px}px}svg{width:100%;height:100%;display:block}
       </style></head><body><div class="w">${svg}</div></body></html>`,
    );
    execFileSync(CHROME, [
      '--headless', '--disable-gpu', '--hide-scrollbars',
      `--window-size=${px},${px}`,
      `--screenshot=${png}`,
      `file://${html}`,
    ], { stdio: 'ignore' });

    const img = PNG.sync.read(fs.readFileSync(png));
    const res = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
    const ok = res && res.data === payload;
    if (!ok && px >= 200) fail++;
    row.push(`${px}px ${ok ? '✅' : '❌'}`);
  }
  console.log(`  ${token.slice(0, 8)}…  ${row.join('  ')}`);
}

fs.rmSync(tmp, { recursive: true, force: true });

if (fail > 0) {
  console.error(`\n❌ 200px 이상에서 읽히지 않는 QR 이 ${fail}건 있습니다. 인쇄하지 마세요.`);
  process.exit(1);
}
console.log('\n✅ 라벨 QR 이 실제 인쇄 크기에서 판독됩니다. 인쇄해도 좋습니다.');
