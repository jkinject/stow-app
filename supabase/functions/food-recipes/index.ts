import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  buildPrompt,
  cacheKeyMaterial,
  LIMITS,
  normalizeHint,
  responseSchema,
  SPEC_VERSION,
  toInventory,
  validateResult,
  type FoodRow,
  type InventoryLine,
  type Locale,
  type RecipeResult,
} from '../_shared/recipeSpec.ts';

/**
 * 음식 탭 — 가진 음식으로 레시피 추천 (2026-09-29 사용자 요청).
 *
 * 한 번의 호출이 하는 일, 순서대로:
 *   ① JWT → 사용자 → 가구 멤버십          (남의 가구 재료로 추천받을 수 없다)
 *   ② 음식 조회 (expires_on 있는 물건 전부)  — 사용자 결정 Q1·Q2: 기한이 곧 음식, 재료는 전부 자동
 *   ③ 캐시 키 → 이미 있으면 **호출 없이** 그 세트를 현재로
 *   ④ 하루 상한 예약 (DB 가 원자적으로)      — 외부 호출 **전에**
 *   ⑤ Gemini 호출 → 규격 검증 → 저장 + 현재 포인터 교체
 *
 * ⚠ 비용이 나가는 줄은 ⑤ 하나다. 그 앞의 모든 단계는 "부르지 않아도 되는 이유" 를 찾는다.
 *   특히 ③: 대용량 음식은 목록이 잘 안 바뀌어서, 실제 호출은 거의 "다른 레시피 추천" 때만 난다.
 *
 * ⚠ 무료 티어 키만 쓴다(사용자 결정 Q3). 무료 한도가 차면 429 로 끝난다 — 유료로 넘어가는
 *   경로는 **없다.** 결제를 붙인 키를 넣으면 그 순간부터 돈이 나간다.
 *
 * ⚠ 설계 시안의 영수증 표·lease·202 합류·전역 잠금은 넣지 않았다(마이그레이션 주석 참고).
 *   멱등성은 request_id 유니크, 가족 동시 요청은 revision CAS 로 막는다.
 *
 * ⚠ 이 파일은 Deno 로 돈다 — 앱 tsc 검사에서 빠져 있다(household-lifecycle 주석 참고).
 *   규격(_shared/recipeSpec.ts)은 순수 TS 라 jest 가 본다.
 */

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
/**
 * ⚠ 모델 ID 를 코드에 못박지 않고 환경변수로 둔다 — 2026-09 에 2.5 계열이 "접근 제한" 으로
 *   바뀐 것을 봤다. 기본은 무료 티어에서 되는 가장 싼 텍스트 모델.
 * ⚠ thinking 설정을 보내지 않는다. flash-lite 는 기본이 minimal 이고, REST 필드명이 문서마다
 *   달라(thinkingBudget / thinking_level) 추측해서 보내면 400 으로 호출이 통째로 죽는다.
 */
const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite';
/** 로컬 검증 때 스텁 서버를 가리키게 — 실제 키 없이 전체 경로를 돌려 본다 */
const GEMINI_BASE = Deno.env.get('GEMINI_BASE_URL') ?? 'https://generativelanguage.googleapis.com';
const DAILY_LIMIT = Number(Deno.env.get('FOOD_DAILY_LIMIT') ?? '5');
const MAX_OUTPUT_TOKENS = 2048;
const TIMEOUT_MS = 25_000;

type Intent = 'initial' | 'replace';
type Body = {
  household_id: string;
  locale: Locale;
  intent: Intent;
  hint?: unknown;
  request_id: string;
  expected_revision: number;
  /** 클라이언트의 오늘 YYYY-MM-DD — 기한 판정은 사용자의 달력 기준이어야 한다 */
  today: string;
};

type SetRow = {
  id: string;
  cache_key: string;
  generation: number;
  locale: Locale;
  hint: string;
  model: string;
  inventory: InventoryLine[];
  result: RecipeResult;
  created_at: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return json(status, { error: { code, message }, ...extra });
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 오늘(UTC) 기준 ±1일 안이면 클라이언트 날짜를 믿는다 — 시간대 차이는 하루를 넘지 않는다 */
function todayIsPlausible(ymd: string): boolean {
  if (!YMD.test(ymd)) return false;
  const client = Date.parse(ymd + 'T00:00:00Z');
  const server = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  return Number.isFinite(client) && Math.abs(client - server) <= 86_400_000;
}

const db = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'METHOD', 'POST only');

  // ── ① 누가 부르나 ──────────────────────────────────────────
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return fail(401, 'UNAUTHORIZED', 'missing token');
  /**
   * ⚠⚠ 사용자 클라이언트에 **전역 authorization 헤더를 넣지 않는다.** 넣은 채로
   *   `getUser(token)` 을 부르면 supabase-js 가 Authorization 을 하나 더 붙여 헤더가 둘이 되고,
   *   게이트웨이가 평문 "Bad request" 로 거절한다 — 로컬 검증에서 그렇게 전부 401 이었다
   *   (2026-09-29). 토큰은 `getUser(token)` 인자로만 넘긴다(인자 없이 부르면 세션 저장소를
   *   봐서 서버에선 늘 "세션 없음"). 멤버십은 아래에서 service_role 로 직접 본다.
   */
  const asUser = createClient(SB_URL, SB_ANON, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await asUser.auth.getUser(auth.slice('Bearer '.length));
  if (userErr || !userData.user) return fail(401, 'UNAUTHORIZED', 'invalid token');
  const userId = userData.user.id;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail(400, 'BAD_REQUEST', 'invalid json');
  }
  const { household_id: hh, locale, intent, request_id: requestId, expected_revision: expected, today } = body;
  if (!UUID.test(hh ?? '') || !UUID.test(requestId ?? '')) return fail(400, 'BAD_REQUEST', 'bad ids');
  if (locale !== 'ko' && locale !== 'en') return fail(400, 'BAD_REQUEST', 'bad locale');
  if (intent !== 'initial' && intent !== 'replace') return fail(400, 'BAD_REQUEST', 'bad intent');
  if (!Number.isInteger(expected) || expected < 0) return fail(400, 'BAD_REQUEST', 'bad revision');
  if (!todayIsPlausible(today ?? '')) return fail(400, 'BAD_REQUEST', 'bad today');
  const hint = normalizeHint(body.hint);

  // 멤버십 — 남의 가구 재료로 추천받을 수 없다. 표를 직접 본다(RLS 헬퍼와 같은 판정)
  const { data: member, error: memberErr } = await db
    .from('household_members')
    .select('household_id')
    .eq('household_id', hh)
    .eq('user_id', userId)
    .maybeSingle();
  if (memberErr || !member) return fail(403, 'FORBIDDEN', 'not a member');

  // ── ② 음식 = 소비기한이 있는 물건 전부 ───────────────────────
  const { data: rows, error: rowsErr } = await db
    .from('items')
    .select('id, name, quantity, unit, expires_on')
    .eq('household_id', hh)
    .is('deleted_at', null)
    .not('expires_on', 'is', null);
  if (rowsErr) return fail(500, 'DB', rowsErr.message);
  if ((rows ?? []).length === 0) return fail(409, 'NO_FOOD', 'no food items');
  if ((rows ?? []).length > LIMITS.items) return fail(422, 'TOO_MANY_ITEMS', 'too many items');

  const inventory = toInventory(rows as FoodRow[], today);
  if (inventory.length === 0) return fail(409, 'NO_USABLE', 'nothing usable');

  const cacheKey = await sha256Hex(
    cacheKeyMaterial({ householdId: hh, locale, inventory, hint, model: MODEL }),
  );

  // ── ③ 현재 세트와 캐시 ────────────────────────────────────
  const { data: current } = await db
    .from('food_recipe_current')
    .select('set_id, revision')
    .eq('household_id', hh)
    .maybeSingle();
  const currentRevision = current?.revision ?? 0;
  if (currentRevision !== expected) {
    return fail(409, 'REVISION_MISMATCH', 'someone else changed the suggestions', {
      revision: currentRevision,
    });
  }

  const { data: cached } = await db
    .from('food_recipe_sets')
    .select('id, cache_key, generation, locale, hint, model, inventory, result, created_at')
    .eq('household_id', hh)
    .eq('cache_key', cacheKey)
    .order('generation', { ascending: false })
    .limit(1)
    .maybeSingle();
  const latest = (cached ?? null) as SetRow | null;

  if (intent === 'initial' && latest) {
    // 같은 조합을 이미 만들었다 — 호출 없이 그걸 현재로
    if (current?.set_id === latest.id) {
      return json(200, { set: latest, revision: currentRevision, cache_hit: true, remaining_today: await remaining(hh) });
    }
    const { data: rev, error: pointErr } = await db.rpc('food_recipe_point', {
      p_household: hh,
      p_set_id: latest.id,
      p_expected_revision: expected,
    });
    if (pointErr) return mapDbError(pointErr.message);
    return json(200, { set: latest, revision: rev, cache_hit: true, remaining_today: await remaining(hh) });
  }

  // ── ④ 상한 예약 — 외부 호출 전에 ──────────────────────────
  if (!GEMINI_KEY) return fail(503, 'NOT_CONFIGURED', 'GEMINI_API_KEY missing');
  const { data: left, error: reserveErr } = await db.rpc('food_recipe_reserve', {
    p_household: hh,
    p_limit: DAILY_LIMIT,
  });
  if (reserveErr) {
    if (reserveErr.message.includes('DAILY_LIMIT')) {
      return fail(429, 'DAILY_LIMIT', 'no more suggestions today', { remaining_today: 0 });
    }
    return fail(500, 'DB', reserveErr.message);
  }

  // 재추천이면 지금 세트(그리고 같은 조합의 앞 세대들)의 제목을 피하게 한다
  const avoidTitles: string[] = [];
  if (intent === 'replace') {
    const { data: prev } = await db
      .from('food_recipe_sets')
      .select('result')
      .eq('household_id', hh)
      .eq('cache_key', cacheKey)
      .order('generation', { ascending: false })
      .limit(4);
    for (const p of (prev ?? []) as { result: RecipeResult }[]) {
      for (const r of p.result.recipes) avoidTitles.push(r.title);
    }
    if (current?.set_id) {
      const { data: cur } = await db.from('food_recipe_sets').select('result').eq('id', current.set_id).maybeSingle();
      for (const r of ((cur as { result: RecipeResult } | null)?.result.recipes ?? [])) avoidTitles.push(r.title);
    }
  }
  const generation = intent === 'replace' ? (latest ? latest.generation + 1 : 0) : 0;

  // ── ⑤ Gemini ──────────────────────────────────────────────
  const prompt = buildPrompt({ locale, inventory, hint, avoidTitles: [...new Set(avoidTitles)] });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let text = '';
  try {
    const res = await fetch(`${GEMINI_BASE}/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
      signal: ctrl.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema(),
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          candidateCount: 1,
          // 재추천이 실제로 다른 요리를 주려면 온도가 있어야 한다. 규격은 스키마+검증이 지킨다
          temperature: 0.9,
        },
      }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      console.error('[food-recipes] gemini', res.status, JSON.stringify(payload).slice(0, 500));
      return fail(502, 'MODEL_FAILED', `model http ${res.status}`, { remaining_today: left });
    }
    const cand = payload?.candidates?.[0];
    text = cand?.content?.parts?.[0]?.text ?? '';
    if (cand?.finishReason && cand.finishReason !== 'STOP') {
      console.error('[food-recipes] finishReason', cand.finishReason);
    }
  } catch (e) {
    console.error('[food-recipes] fetch', e instanceof Error ? e.message : e);
    return fail(502, 'MODEL_FAILED', 'model unreachable', { remaining_today: left });
  } finally {
    clearTimeout(timer);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error('[food-recipes] not json', text.slice(0, 200));
    return fail(502, 'INVALID_RESULT', 'model returned non-json', { remaining_today: left });
  }
  const v = validateResult(parsed, inventory);
  if (!v.ok) {
    console.error('[food-recipes] invalid', v.reason);
    return fail(502, 'INVALID_RESULT', v.reason, { remaining_today: left });
  }

  // ── 저장 + 현재 교체 (한 트랜잭션) ────────────────────────
  const { data: stored, error: storeErr } = await db.rpc('food_recipe_store', {
    p_household: hh,
    p_request_id: requestId,
    p_created_by: userId,
    p_cache_key: cacheKey,
    p_generation: generation,
    p_locale: locale,
    p_model: MODEL,
    p_spec_version: SPEC_VERSION,
    p_hint: hint,
    p_inventory: inventory,
    p_result: v.result,
    p_expected_revision: expected,
  });
  if (storeErr) return mapDbError(storeErr.message);
  const row = (stored as { set_id: string; revision: number }[] | null)?.[0];
  if (!row) return fail(500, 'STORE_FAILED', 'no row');

  const set: SetRow = {
    id: row.set_id,
    cache_key: cacheKey,
    generation,
    locale,
    hint,
    model: MODEL,
    inventory,
    result: v.result,
    created_at: new Date().toISOString(),
  };
  return json(200, { set, revision: row.revision, cache_hit: false, remaining_today: left });
});

async function remaining(hh: string): Promise<number> {
  const { data } = await db
    .from('food_recipe_usage')
    .select('attempts')
    .eq('household_id', hh)
    .eq('day', new Date().toISOString().slice(0, 10))
    .maybeSingle();
  return Math.max(0, DAILY_LIMIT - (data?.attempts ?? 0));
}

function mapDbError(message: string): Response {
  if (message.includes('REVISION_MISMATCH')) return fail(409, 'REVISION_MISMATCH', 'suggestions changed meanwhile');
  if (message.includes('SET_NOT_FOUND')) return fail(500, 'STORE_FAILED', 'cached set vanished');
  return fail(500, 'DB', message);
}
