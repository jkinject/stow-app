#!/usr/bin/env node
/**
 * Google Play 업로드·관리 (Play Developer API v3 직접 호출).
 *
 * 왜 직접 부르나:
 *   · 로컬에서 빌드한 AAB 를 **그대로** 올린다. 중간 서버를 거치지 않는다.
 *   · Expo 계정이 필요 없다. 이 저장소는 지금까지 로컬 빌드로 왔다.
 *   · 업로드뿐 아니라 트랙 승격·릴리스 노트·스토어 문구까지 같은 길로 할 수 있다.
 *
 * 왜 의존성이 없나: 서비스 계정 인증은 RS256 서명 한 번이면 되고, Node 의 `crypto`
 *   가 그걸 할 수 있다. googleapis 패키지를 넣으면 트랜지티브 의존성이 수십 개 늘고,
 *   이 저장소는 이미 npm 취약점 19건을 안고 있다.
 *
 * ⚠⚠ Play 의 편집은 **트랜잭션**이다. insert → 작업 → commit 이고, commit 하지 않으면
 *   아무 일도 일어나지 않는다. 중간에 실패하면 그 edit 를 버리고 다시 시작해야 한다
 *   (버려도 부작용이 없다). 그래서 오류가 나면 commit 하지 않고 그냥 끝낸다.
 *
 * ⚠ 업로드 키로 서명한 AAB 만 받는다. scripts/build-android.sh 가 그걸 보장한다.
 *
 * 사용:
 *   node scripts/play.mjs status
 *   node scripts/play.mjs upload --track internal
 *   node scripts/play.mjs upload --track production --notes-ko "..." --notes-en "..."
 *   node scripts/play.mjs promote --from internal --to production
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3';

// ── 설정 ──────────────────────────────────────────────────────
function env() {
  const f = path.join(ROOT, '.env.production.local');
  if (!fs.existsSync(f)) die('.env.production.local 이 없습니다.');
  const out = {};
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo.android.package;

// ── 인증 ──────────────────────────────────────────────────────
/**
 * 서비스 계정 → 액세스 토큰.
 * JWT 를 만들어 서명하고 토큰과 바꾼다(OAuth 2.0 JWT bearer flow).
 */
async function token(keyPath) {
  if (!fs.existsSync(keyPath)) {
    die(`서비스 계정 키를 찾을 수 없습니다: ${keyPath}\n` +
        '  만드는 법은 docs/play-store-checklist.md 의 "업로드 자동화" 를 보세요.');
  }
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const claim = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  });
  const sig = crypto.createSign('RSA-SHA256').update(claim).end()
    .sign(key.private_key).toString('base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${claim}.${sig}`,
    }),
  });
  const j = await res.json();
  if (!res.ok) {
    die(`토큰 발급 실패 (${res.status}): ${JSON.stringify(j)}\n` +
        '  Play Console 에서 이 서비스 계정을 초대하고 권한을 줬는지 확인하세요.');
  }
  return j.access_token;
}

async function api(tok, method, url, body, extraHeaders) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${tok}`, ...(extraHeaders ?? {}) },
    body,
  });
  const text = await res.text();
  let j;
  try { j = text ? JSON.parse(text) : {}; } catch { j = { raw: text }; }
  if (!res.ok) {
    const detail = j?.error?.message ?? text.slice(0, 400);
    throw new Error(`${method} ${url.replace(API, '').replace(UPLOAD, '')} → ${res.status}\n    ${detail}`);
  }
  return j;
}

const jsonHeaders = { 'Content-Type': 'application/json' };

// ── 명령 ──────────────────────────────────────────────────────
async function cmdStatus(tok) {
  const edit = await api(tok, 'POST', `${API}/applications/${PKG}/edits`, null, jsonHeaders);
  try {
    const tracks = await api(tok, 'GET', `${API}/applications/${PKG}/edits/${edit.id}/tracks`);
    console.log(`· 앱  ${PKG}\n`);
    for (const t of tracks.tracks ?? []) {
      const rel = (t.releases ?? []).map((r) =>
        `${(r.versionCodes ?? []).join(',') || '-'} (${r.status}${r.userFraction ? ` ${Math.round(r.userFraction * 100)}%` : ''})`,
      );
      console.log(`  ${t.track.padEnd(14)} ${rel.join(' · ') || '(릴리스 없음)'}`);
    }
  } finally {
    // ⚠ 읽기만 했어도 edit 는 버린다. 남겨 두면 다음 edit 가 충돌한다.
    await api(tok, 'DELETE', `${API}/applications/${PKG}/edits/${edit.id}`).catch(() => {});
  }
}

async function cmdUpload(tok, opts) {
  const aab = opts.aab ?? path.join(ROOT, 'android/app/build/outputs/bundle/release/app-release.aab');
  if (!fs.existsSync(aab)) {
    die(`AAB 가 없습니다: ${aab}\n  먼저: npm run android:aab`);
  }
  const size = fs.statSync(aab).size;
  console.log(`· 올릴 파일  ${path.relative(ROOT, aab)}  (${(size / 1024 / 1024).toFixed(0)} MB)`);
  console.log(`· 트랙       ${opts.track}`);

  const edit = await api(tok, 'POST', `${API}/applications/${PKG}/edits`, null, jsonHeaders);
  console.log(`· edit       ${edit.id}`);

  try {
    console.log('· 업로드 중… (몇 분 걸립니다)');
    const bundle = await api(
      tok, 'POST',
      `${UPLOAD}/applications/${PKG}/edits/${edit.id}/bundles?uploadType=media`,
      fs.readFileSync(aab),
      { 'Content-Type': 'application/octet-stream' },
    );
    console.log(`· versionCode ${bundle.versionCode}`);

    const releaseNotes = [];
    if (opts.notesKo) releaseNotes.push({ language: 'ko-KR', text: opts.notesKo });
    if (opts.notesEn) releaseNotes.push({ language: 'en-US', text: opts.notesEn });

    await api(
      tok, 'PUT',
      `${API}/applications/${PKG}/edits/${edit.id}/tracks/${opts.track}`,
      JSON.stringify({
        track: opts.track,
        releases: [{
          versionCodes: [String(bundle.versionCode)],
          status: opts.draft ? 'draft' : 'completed',
          ...(releaseNotes.length ? { releaseNotes } : {}),
        }],
      }),
      jsonHeaders,
    );
    console.log(`· 트랙에 배정 (${opts.draft ? 'draft' : 'completed'})`);

    await api(tok, 'POST', `${API}/applications/${PKG}/edits/${edit.id}:commit`, null, jsonHeaders);
    console.log(`\n✓ 올렸습니다. versionCode ${bundle.versionCode} → ${opts.track}`);
  } catch (e) {
    /**
     * ⚠ commit 하지 않고 버린다. Play 의 편집은 트랜잭션이라, commit 전에는 아무것도
     *   반영되지 않는다 — 반쯤 올라간 상태가 남지 않는다.
     */
    await api(tok, 'DELETE', `${API}/applications/${PKG}/edits/${edit.id}`).catch(() => {});
    throw e;
  }
}

async function cmdPromote(tok, opts) {
  const edit = await api(tok, 'POST', `${API}/applications/${PKG}/edits`, null, jsonHeaders);
  try {
    const from = await api(tok, 'GET', `${API}/applications/${PKG}/edits/${edit.id}/tracks/${opts.from}`);
    const rel = (from.releases ?? []).find((r) => (r.versionCodes ?? []).length);
    if (!rel) die(`'${opts.from}' 트랙에 올릴 릴리스가 없습니다.`);
    console.log(`· ${opts.from} → ${opts.to}  versionCode ${rel.versionCodes.join(',')}`);

    await api(
      tok, 'PUT',
      `${API}/applications/${PKG}/edits/${edit.id}/tracks/${opts.to}`,
      JSON.stringify({ track: opts.to, releases: [{ ...rel, status: 'completed' }] }),
      jsonHeaders,
    );
    await api(tok, 'POST', `${API}/applications/${PKG}/edits/${edit.id}:commit`, null, jsonHeaders);
    console.log(`\n✓ 승격했습니다.`);
  } catch (e) {
    await api(tok, 'DELETE', `${API}/applications/${PKG}/edits/${edit.id}`).catch(() => {});
    throw e;
  }
}

// ── 진입점 ────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};

const e = env();
const keyPath = (e.GOOGLE_PLAY_SERVICE_ACCOUNT ?? '').replace(/^~/, process.env.HOME ?? '~');
if (!keyPath) {
  die('GOOGLE_PLAY_SERVICE_ACCOUNT 가 .env.production.local 에 없습니다.\n' +
      '  예: GOOGLE_PLAY_SERVICE_ACCOUNT=~/keystores/play-service-account.json');
}

try {
  const tok = await token(keyPath);
  if (cmd === 'status') await cmdStatus(tok);
  else if (cmd === 'upload') {
    await cmdUpload(tok, {
      track: flag('track', 'internal'),
      aab: flag('aab'),
      notesKo: flag('notes-ko'),
      notesEn: flag('notes-en'),
      draft: argv.includes('--draft'),
    });
  } else if (cmd === 'promote') {
    await cmdPromote(tok, { from: flag('from', 'internal'), to: flag('to', 'production') });
  } else {
    console.log(`사용법:
  node scripts/play.mjs status
  node scripts/play.mjs upload  [--track internal|production] [--draft]
                                [--notes-ko "..."] [--notes-en "..."] [--aab <경로>]
  node scripts/play.mjs promote [--from internal] [--to production]`);
    process.exit(cmd ? 1 : 0);
  }
} catch (err) {
  die(err.message);
}
