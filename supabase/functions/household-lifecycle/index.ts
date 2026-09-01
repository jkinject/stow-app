import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * 휴면 집 정리 — 하루 한 번 도는 관리 작업.
 *
 * ⚠⚠ 왜 SQL 이 아니라 여기인가. 이 일에는 SQL 이 못 하는 것이 **두 개** 있다.
 *   1. 메일 발송 (Resend HTTP API)
 *   2. **사진 파일 삭제** — `storage.objects` 행을 지워도 실제 파일은 남는다.
 *      정식 Storage API 를 불러야 하고, 그러려면 service_role 키가 필요하다.
 *
 *   판정은 전부 SQL 에 있다(20260902000200 마이그레이션). 여기서는 **부작용만** 낸다.
 *   그래야 위험한 판정 로직을 pgTAP 으로 고정할 수 있다.
 *
 * ⚠ service_role 키를 **DB 에 두지 않는다.** vault 에 넣으면 SECURITY DEFINER 함수
 *   하나만 뚫려도 전체 데이터에 닿는다. 여기 환경변수로만 둔다.
 *
 * ⚠ 순서가 전부다. 어느 단계든 뒤집으면 되돌릴 수 없는 손해가 난다.
 *     · 메일 → **성공한 뒤에** warned_at 표시   (실패했는데 표시하면 예고 없이 지운다)
 *     · 파일 → **지운 뒤에** 집 삭제            (뒤집으면 경로를 잃어 파일이 영영 남는다)
 *
 * ⚠ 이 파일은 **Deno** 로 돈다. 앱의 tsconfig 검사 대상에서 빼 두었다
 *   (`exclude: supabase/functions/**`) — 안 그러면 Deno 전역과 jsr: 임포트를 못 찾아
 *   `tsc --noEmit` 이 실패한다. 이쪽 검사는 `supabase functions` 가 한다.
 *
 * 호출: pg_cron 이 pg_net 으로 매일 부른다. `x-cron-secret` 헤더로 확인한다.
 *   그 비밀이 새도 할 수 있는 건 이 작업을 한 번 더 돌리는 것뿐이다(멱등).
 */

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SENDER = Deno.env.get('RESEND_SENDER') ?? 'no-reply@jangstar.net';
const BUCKET = 'item-photos';

/** Storage 는 한 번에 지울 수 있는 개수에 한계가 있다. 넉넉히 잡되 쪼갠다 */
const REMOVE_CHUNK = 100;

type Warn = { household_id: string; household_name: string; emails: string[] };
type Doomed = { household_id: string; paths: string[] };

const db = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });

function warnEmail(name: string) {
  return {
    subject: `[어디뒀지] '${name}' 이(가) 30일 뒤 삭제됩니다`,
    html: `
<div style="font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;
            max-width:520px;margin:0 auto;padding:32px 24px;color:#14161F;line-height:1.7">
  <p style="font-size:13px;letter-spacing:.06em;color:#6E7591;margin:0 0 8px">어디뒀지 · Stow</p>
  <h1 style="font-size:21px;margin:0 0 20px">'${name}' 을(를) 정리하려고 합니다</h1>
  <p style="margin:0 0 16px">
    이 집에 <strong>90일 넘게 아무도 들어오지 않았습니다.</strong>
    쓰지 않는 데이터를 계속 보관하지 않기 위해, <strong>30일 뒤에 이 집의
    모든 내용(물건·사진·장소·가족 연결)을 삭제</strong>합니다.
  </p>
  <p style="margin:0 0 16px">
    계속 쓰시려면 <strong>앱을 한 번만 열어 주세요.</strong> 그것으로 삭제 예약이 취소되고
    처음부터 다시 셉니다. 따로 하실 일은 없습니다.
  </p>
  <p style="margin:0 0 24px;color:#6E7591;font-size:14px">
    삭제는 되돌릴 수 없습니다. 이 메일은 이 집의 관리자에게만 보냅니다.
  </p>
  <p style="margin:0;color:#6E7591;font-size:13px">
    문의: <a href="mailto:jkinject@gmail.com" style="color:#2547C4">jkinject@gmail.com</a>
  </p>
</div>`.trim(),
  };
}

async function sendWarning(w: Warn): Promise<boolean> {
  if (!RESEND_KEY || w.emails.length === 0) return false;
  const { subject, html } = warnEmail(w.household_name);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `어디뒀지 <${SENDER}>`, to: w.emails, subject, html }),
  });
  return res.ok;
}

/** 없는 파일이 섞여 있어도 나머지는 지워야 한다. 조각내 부르고 실패한 조각만 표시한다 */
async function removeAll(paths: string[]): Promise<boolean> {
  let ok = true;
  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const chunk = paths.slice(i, i + REMOVE_CHUNK);
    const { error } = await db.storage.from(BUCKET).remove(chunk);
    if (error) ok = false;
  }
  return ok;
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  const report: Record<string, unknown> = {};

  // ── 1) 휴면 표시 ────────────────────────────────────────────
  const marked = await db.rpc('mark_dormant_households');
  report.marked_dormant = marked.error ? `error: ${marked.error.message}` : marked.data;

  // ── 2) 예고 메일 ────────────────────────────────────────────
  const warns = await db.rpc('dormant_households_to_warn');
  const sent: string[] = [];
  const failed: string[] = [];
  for (const w of (warns.data ?? []) as Warn[]) {
    (await sendWarning(w)) ? sent.push(w.household_id) : failed.push(w.household_id);
  }
  /**
   * ⚠ 보낸 것만 표시한다. 실패한 집은 표시하지 않으므로 내일 다시 시도한다.
   *   전부 한꺼번에 표시하면 메일을 못 받은 사람의 집이 30일 뒤 그냥 사라진다.
   */
  if (sent.length > 0) await db.rpc('mark_household_warned', { p_ids: sent });
  report.warned = sent.length;
  report.warn_failed = failed.length;

  // ── 3) 삭제 ─────────────────────────────────────────────────
  const doomed = await db.rpc('dormant_households_to_delete');
  const rows = (doomed.data ?? []) as Doomed[];
  const deletable: string[] = [];
  for (const d of rows) {
    // 사진을 먼저 지운다. 실패하면 그 집은 오늘 지우지 않는다 — 내일 다시 한다.
    // 행을 먼저 지우면 경로를 잃어 파일이 영영 남는다.
    if (d.paths.length === 0 || (await removeAll(d.paths))) deletable.push(d.household_id);
  }
  if (deletable.length > 0) {
    const del = await db.rpc('delete_dormant_households', { p_ids: deletable });
    report.deleted_households = del.error ? `error: ${del.error.message}` : del.data;
    // 집이 사라져도 수거 큐 행은 남는다(FK 를 끊어 뒀다). 파일은 위에서 지웠으니 정리한다.
    await db.from('storage_gc').delete().in('household_id', deletable);
  } else {
    report.deleted_households = 0;
  }

  // ── 4) 남은 수거 큐 비우기 ───────────────────────────────────
  /**
   * 앱도 자기 가구 큐를 비우지만(features/storage/gc.ts), **휴면 집은 아무도 앱을
   * 열지 않는다.** 그 집의 큐는 여기서만 비울 수 있다.
   */
  const gc = await db.from('storage_gc').select('path').limit(500);
  const gcPaths = (gc.data ?? []).map((r: { path: string }) => r.path);
  if (gcPaths.length > 0 && (await removeAll(gcPaths))) {
    await db.from('storage_gc').delete().in('path', gcPaths);
  }
  report.storage_gc_drained = gcPaths.length;

  return new Response(JSON.stringify(report), {
    headers: { 'Content-Type': 'application/json' },
  });
});
