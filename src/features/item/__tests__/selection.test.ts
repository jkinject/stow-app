import { pickedIn, toggleId } from '../selection';

/**
 * 다중 선택 (2026-09-21).
 *
 * 여기서 지키는 것: 집합을 **갈아끼우고**(제자리 수정 금지), 화면에 없는 것을 세지 않는다.
 * 그 둘이 어긋나면 "3개 선택" 이라 써 놓고 두 개만 옮기는 일이 생긴다.
 */

test('toggleId — 없으면 넣고 있으면 뺀다', () => {
  const a = toggleId(new Set(), 'x');
  expect([...a]).toEqual(['x']);
  expect([...toggleId(a, 'x')]).toEqual([]);
  expect([...toggleId(a, 'y')].sort()).toEqual(['x', 'y']);
});

test('toggleId — 원본을 건드리지 않고 새 집합을 준다', () => {
  const before = new Set(['x']);
  const after = toggleId(before, 'y');
  expect(after).not.toBe(before);
  expect([...before]).toEqual(['x']); // 원본 그대로
});

test('pickedIn — 목록에 없는 것은 세지 않는다 (옮긴 뒤·지워진 뒤)', () => {
  const ids = new Set(['a', 'b', 'c']);
  expect(pickedIn(ids, ['b', 'a'])).toEqual(['b', 'a']);
  // c 는 이미 이 목록을 떠났다 — 개수는 2 여야 한다
  expect(pickedIn(ids, ['a', 'b'])).toHaveLength(2);
  expect(pickedIn(ids, [])).toEqual([]);
});

test('pickedIn — 순서는 고른 순서가 아니라 화면 순서다', () => {
  const ids = new Set(['c', 'a']);
  expect(pickedIn(ids, ['a', 'b', 'c'])).toEqual(['a', 'c']);
});

test('pickedIn — 고른 게 없으면 목록을 훑지 않는다', () => {
  expect(pickedIn(new Set(), ['a', 'b'])).toEqual([]);
});
