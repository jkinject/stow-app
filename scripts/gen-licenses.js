#!/usr/bin/env node
/**
 * 오픈소스 라이선스 목록 생성.
 *
 * 앱에 들어가는 것은 **프로덕션 의존성뿐**이다 (`--omit=dev`). devDependencies 는
 * 빌드할 때만 쓰이고 배포물에 포함되지 않으므로 고지 대상이 아니다.
 *
 * ⚠ 라이선스 **전문**을 644개 패키지만큼 넣지 않는다. 수 MB가 되고, 대부분 같은
 *   MIT 문구가 저작권자만 바꿔 반복된다. 대신 패키지마다
 *   이름·버전·라이선스 식별자·저작권 표기·저장소 주소를 담는다.
 *   저작권 표기를 살리는 것이 MIT·BSD 계열이 실제로 요구하는 핵심이다.
 *
 * 실행: npm run licenses
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src/lib/licenses.json');

const tree = JSON.parse(execSync('npm ls --omit=dev --all --json', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString());

const names = new Set();
(function walk(node) {
  for (const [name, dep] of Object.entries(node.dependencies || {})) {
    names.add(name);
    walk(dep);
  }
})(tree);

/** LICENSE 파일에서 저작권 한 줄만 뽑는다 */
function copyrightOf(dir) {
  for (const f of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'LICENCE']) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8').slice(0, 4000);
    const m = text.match(/Copyright\s+(?:\(c\)\s*)?[^\n]{0,120}/i);
    if (m) return m[0].trim().replace(/\s+/g, ' ');
  }
  return null;
}

function licenseOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type || l).join(' OR ');
  return null;
}

function repoOf(pkg) {
  const r = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  if (!r) return pkg.homepage ?? null;
  return r.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://');
}

const out = [];
const missing = [];
for (const name of [...names].sort()) {
  const dir = path.join(ROOT, 'node_modules', ...name.split('/'));
  const pj = path.join(dir, 'package.json');
  if (!fs.existsSync(pj)) continue;
  const pkg = JSON.parse(fs.readFileSync(pj, 'utf8'));
  const license = licenseOf(pkg);
  if (!license) missing.push(name);
  out.push({
    name,
    version: pkg.version ?? '',
    license: license ?? 'UNKNOWN',
    copyright: copyrightOf(dir),
    url: repoOf(pkg),
  });
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 0) + '\n');

const byLicense = out.reduce((m, p) => ((m[p.license] = (m[p.license] || 0) + 1), m), {});
console.log(`패키지 ${out.length}개 → ${path.relative(ROOT, OUT)} (${Math.round(fs.statSync(OUT).size / 1024)}KB)`);
console.log('라이선스별:', Object.entries(byLicense).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
if (missing.length) console.log(`⚠ 라이선스 표기가 없는 패키지 ${missing.length}개: ${missing.slice(0, 10).join(', ')}`);
