/**
 * 사진 회전 (2026-09-22 사용자 요청 — 눕혀 찍으면 다시 찍는 수밖에 없었다).
 *
 * 여기서 지키는 것은 하나다 — **돌린 뒤 치수로 장변을 잡는다.**
 * 이 파일(photo.ts)은 이미 같은 종류로 한 번 데였다: 세로 사진에 `resize({ width })` 를
 * 걸어 장변이 1280 이 아니라 1706 이 되어 픽셀이 33% 많아졌다(§4.9 용량 예산이 어긋난다).
 * 90·270 도 회전은 가로세로를 뒤바꾸므로 정확히 같은 함정이 다시 열린다.
 *
 * ⚠ photo.ts 는 네이티브 모듈을 쓰므로 photoQueue 테스트와 같은 방식으로 흉내 낸다.
 *   jest.config 의 "순수 로직 전용" 방침에서 한 걸음 나가지만, 이 계산은 화면으로는
 *   드러나지 않고 **용량으로만** 드러나서 실기기로 잡기가 어렵다.
 */

/** fitResize 가 부른 resize 인자들 — 장수만큼 쌓인다 (썸네일 640, 원본 1280) */
const resizeCalls: { width: number; height: number }[] = [];
const rotateCalls: number[] = [];

jest.mock('expo-image-manipulator', () => {
  const makeCtx = () => {
    const ctx = {
      rotate: (deg: number) => {
        rotateCalls.push(deg);
        return ctx;
      },
      resize: (size: { width: number; height: number }) => {
        resizeCalls.push(size);
        return ctx;
      },
      renderAsync: async () => ({
        // probe 가 읽는 값 — 세로 원본 3024×4032 를 흉내 낸다
        width: 3024,
        height: 4032,
        saveAsync: async () => ({ uri: 'file:///out.jpg' }),
      }),
    };
    return ctx;
  };
  return {
    ImageManipulator: { manipulate: () => makeCtx() },
    SaveFormat: { JPEG: 'jpeg' },
  };
});

jest.mock('@/lib/supabase', () => ({ supabase: {}, photoPaths: {} }));

/**
 * ⚠ import 가 `jest.mock` **아래**에 있어야 한다. 위로 올리면 photo.ts 가 진짜
 *   expo-image-manipulator 를 먼저 끌어와 node 환경에서 터진다. 린트 규칙이 맞는
 *   상황이 아니라 여기서만 끈다.
 */
// eslint-disable-next-line import/first
import { isQuarterTurn, nextRotation, preparePhoto, SIZES } from '../photo';

beforeEach(() => {
  resizeCalls.length = 0;
  rotateCalls.length = 0;
});

test('nextRotation — 네 번 누르면 제자리', () => {
  expect(nextRotation(0)).toBe(90);
  expect(nextRotation(90)).toBe(180);
  expect(nextRotation(180)).toBe(270);
  expect(nextRotation(270)).toBe(0);
});

test('isQuarterTurn — 90·270 만 가로세로가 뒤바뀐다', () => {
  expect(isQuarterTurn(90)).toBe(true);
  expect(isQuarterTurn(270)).toBe(true);
  expect(isQuarterTurn(0)).toBe(false);
  expect(isQuarterTurn(180)).toBe(false);
});

test('회전 없음 — 장변(높이)이 예산에 맞는다', async () => {
  await preparePhoto('file:///in.jpg');
  // 3024×4032 의 장변은 높이 4032. 1280/4032 로 줄이면 960×1280
  expect(resizeCalls).toContainEqual({ width: 960, height: 1280 });
  expect(resizeCalls).toContainEqual({ width: 480, height: 640 }); // 썸네일 640
  expect(rotateCalls).toHaveLength(0); // 0도면 사슬에 넣지 않는다
});

test('90도 — 뒤바뀐 치수로 장변을 잡는다 (가로가 장변이 된다)', async () => {
  await preparePhoto('file:///in.jpg', 90);
  /**
   * 돌리면 4032×3024 가 된다. 장변은 **폭** 4032 이므로 1280×960 이어야 한다.
   * ⚠ 돌리기 전 치수(3024×4032)로 계산하면 960×1280 이 나온다 — 장변이 짧은 쪽에
   *   붙어 결과가 의도보다 크고, 게다가 회전된 이미지와 비율이 안 맞는다.
   */
  expect(resizeCalls).toContainEqual({ width: 1280, height: 960 });
  expect(resizeCalls).toContainEqual({ width: 640, height: 480 });
  // 썸네일·원본 두 장 모두 같은 사슬 안에서 돌아야 한다 (두 번 굽지 않는다)
  expect(rotateCalls).toEqual([90, 90]);
});

test('180도 — 치수는 그대로, 돌리기만 사슬에 들어간다', async () => {
  await preparePhoto('file:///in.jpg', 180);
  expect(resizeCalls).toContainEqual({ width: 960, height: 1280 });
  expect(rotateCalls).toEqual([180, 180]);
});

test('원본이 예산보다 작으면 키우지 않는다', () => {
  // 위 흉내의 원본(장변 4032)은 둘 다보다 크므로 축소만 일어난다 — 예산 값 자체를 못박아 둔다
  expect(SIZES.full.long).toBe(1280);
  expect(SIZES.thumb.long).toBe(640);
});
