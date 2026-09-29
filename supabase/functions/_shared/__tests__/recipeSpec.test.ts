import {
  buildPrompt,
  cacheKeyMaterial,
  LIMITS,
  normalizeHint,
  RECIPE_COUNT,
  responseSchema,
  toInventory,
  validateResult,
  type InventoryLine,
} from '../recipeSpec';

/**
 * 레시피 규격 (2026-09-29).
 *
 * 여기서 지키는 것: 쓸 수 없는 재료는 모델에 안 간다 · 캐시 키는 재료의 **정체**만 본다 ·
 * 모델이 규격을 어기면 통째로 거절한다. 셋 다 화면에는 안 보이고 비용·저장 품질로만 드러난다.
 */

const rows = [
  { id: 'b', name: '두부  ', quantity: 2, unit: '모', expires_on: '2027-01-01' },
  { id: 'a', name: '쌀', quantity: 1, unit: 'kg', expires_on: '2027-06-01' },
  { id: 'c', name: '우유', quantity: 0, unit: null, expires_on: '2027-01-01' }, // 수량 0
  { id: 'd', name: '요거트', quantity: 3, unit: null, expires_on: '2026-09-01' }, // 기한 지남
];

test('toInventory — 수량 0·기한 지남은 빠지고, id 순으로 ref 가 매겨지고, 이름이 정리된다', () => {
  const inv = toInventory(rows, '2026-09-29');
  expect(inv.map((l) => l.name)).toEqual(['쌀', '두부']);
  expect(inv.map((l) => l.ref)).toEqual(['i1', 'i2']);
});

test('cacheKeyMaterial — 기한·ref 는 키에 안 들어가고, 이름·수량·힌트·언어·모델은 들어간다', () => {
  const base = { householdId: 'h', locale: 'ko' as const, hint: '', model: 'm' };
  const a = toInventory(rows, '2026-09-29');
  // ⚠ 쓸 수 있던 행만 기한을 바꾼다. 전부 바꾸면 기한이 지나 빠져 있던 요거트가 살아나
  //   목록 자체가 달라진다 — 그건 키가 달라지는 게 맞다 (처음 이 테스트가 그렇게 틀렸다)
  const b = toInventory(rows.map((r) => (r.quantity > 0 && r.expires_on >= '2026-09-29' ? { ...r, expires_on: '2028-01-01' } : r)), '2026-09-29');
  expect(cacheKeyMaterial({ ...base, inventory: a })).toBe(cacheKeyMaterial({ ...base, inventory: b }));

  const more = toInventory(rows.map((r) => (r.id === 'a' ? { ...r, quantity: 5 } : r)), '2026-09-29');
  expect(cacheKeyMaterial({ ...base, inventory: more })).not.toBe(cacheKeyMaterial({ ...base, inventory: a }));
  expect(cacheKeyMaterial({ ...base, inventory: a, hint: '매운 거' })).not.toBe(cacheKeyMaterial({ ...base, inventory: a }));
  expect(cacheKeyMaterial({ ...base, inventory: a, locale: 'en' })).not.toBe(cacheKeyMaterial({ ...base, inventory: a }));
});

test('normalizeHint — 제어문자·연속 공백 정리, 길이 상한, 문자열 아니면 빈 값', () => {
  expect(normalizeHint('  매운\t거\n  ')).toBe('매운 거');
  expect(normalizeHint('a'.repeat(200))).toHaveLength(LIMITS.hint);
  expect(normalizeHint(42)).toBe('');
});

test('buildPrompt — 힌트와 피할 제목이 들어가고, 재료가 ref 로 나열된다', () => {
  const inv = toInventory(rows, '2026-09-29');
  const p = buildPrompt({ locale: 'ko', inventory: inv, hint: '국물', avoidTitles: ['두부조림'] });
  expect(p).toContain('i1: 쌀 × 1 kg');
  expect(p).toContain('"국물"');
  expect(p).toContain('두부조림');
  expect(p).toContain(`${RECIPE_COUNT}개`);
});

test('responseSchema — 보수적 키워드만 쓴다 (길이 제약은 검증기 몫)', () => {
  const s = JSON.stringify(responseSchema());
  expect(s).not.toContain('maxLength');
  expect(s).not.toContain('additionalProperties');
  expect(s).toContain('"enum":["easy","medium"]');
});

function goodRecipe(over: Partial<Record<string, unknown>> = {}) {
  return {
    title: '두부 부침',
    summary: '노릇하게 구운 두부',
    minutes: 15,
    difficulty: 'easy',
    servings: 2,
    owned_refs: ['i2'],
    staples: ['소금', '식용유'],
    missing: [],
    steps: ['두부 1모를 썬다.', '팬에 기름을 두르고 두부를 굽는다.', '소금을 뿌려 낸다.'],
    ...over,
  };
}
const inv: InventoryLine[] = toInventory(rows, '2026-09-29');
const three = () => ({ recipes: [goodRecipe(), goodRecipe({ title: '두부 조림' }), goodRecipe({ title: '두부 국' })] });

test('validateResult — 정상 결과는 통과하고 정리된 값을 돌려준다', () => {
  const v = validateResult(three(), inv);
  expect(v.ok).toBe(true);
  if (v.ok) expect(v.result.recipes).toHaveLength(RECIPE_COUNT);
});

test('validateResult — 개수가 다르면 거절', () => {
  expect(validateResult({ recipes: [goodRecipe()] }, inv).ok).toBe(false);
});

test('validateResult — 목록에 없는 ref, 중복 ref, 빈 owned_refs 는 거절', () => {
  const r = three();
  r.recipes[0] = goodRecipe({ owned_refs: ['i9'] });
  expect(validateResult(r, inv).ok).toBe(false);
  r.recipes[0] = goodRecipe({ owned_refs: ['i2', 'i2'] });
  expect(validateResult(r, inv).ok).toBe(false);
  r.recipes[0] = goodRecipe({ owned_refs: [] });
  expect(validateResult(r, inv).ok).toBe(false);
});

test('validateResult — 적어 둔 재료를 단계에서 안 쓰면 거절 (ref 만 적는 속임수)', () => {
  const r = three();
  r.recipes[0] = goodRecipe({ owned_refs: ['i1'] }); // 쌀을 썼다는데 단계에 쌀이 없다
  const v = validateResult(r, inv);
  expect(v.ok).toBe(false);
  if (!v.ok) expect(v.reason).toContain('not used');
});

test('validateResult — 길이·개수 상한', () => {
  const r = three();
  r.recipes[0] = goodRecipe({ title: 'x'.repeat(LIMITS.title + 1) });
  expect(validateResult(r, inv).ok).toBe(false);
  r.recipes[0] = goodRecipe({ steps: ['두부', '굽기'] }); // 최소 3단계
  expect(validateResult(r, inv).ok).toBe(false);
  r.recipes[0] = goodRecipe({ minutes: 0 });
  expect(validateResult(r, inv).ok).toBe(false);
  r.recipes[0] = goodRecipe({ difficulty: 'hard' });
  expect(validateResult(r, inv).ok).toBe(false);
});
