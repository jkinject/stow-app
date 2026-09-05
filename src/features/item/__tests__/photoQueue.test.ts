/**
 * 사진 붙이기 큐 (2026-09-06 사용자 보고: "등록했는데 사진이 사라졌다").
 *
 * 이 파일이 지키는 것은 하나다 — **찍은 사진은 조용히 사라지지 않는다.**
 * 잃는 방식이 전부 조용했기 때문에(실패 상태를 그리는 화면이 없었다) 화면 없이도
 * 검증되는 이 층에 못을 박아 둔다.
 *
 * ⚠ jest.config 의 "순수 로직 전용" 방침에서 한 걸음 나간다(네이티브 모듈 3개를 흉내
 *   낸다). 그럴 값이 있다고 봤다 — 되돌릴 수 없는 데이터 유실이고, 실기기로는
 *   "업로드가 실패하는 상황" 을 만들어 보기가 어렵다.
 */

const uploadPhoto = jest.fn();
const deletePhotoObjects = jest.fn().mockResolvedValue(undefined);
const invalidateQueries = jest.fn();

/** 흉내 낸 파일 시스템 — uri 를 키로 하는 맵 하나면 충분하다 */
const files = new Set<string>();

jest.mock('../photo', () => ({
  uploadPhoto: (...a: unknown[]) => uploadPhoto(...a),
  deletePhotoObjects: (...a: unknown[]) => deletePhotoObjects(...a),
}));

jest.mock('@/lib/query', () => ({
  queryClient: { invalidateQueries: (...a: unknown[]) => invalidateQueries(...a) },
}));

const updateResult = { data: [{ id: 'item-1' }] as { id: string }[] | null, error: null as unknown };
const supabaseFrom = jest.fn(() => ({
  update: () => ({
    eq: () => ({
      select: () => Promise.resolve(updateResult),
    }),
  }),
}));
jest.mock('@/lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => supabaseFrom(...(a as [])) } }));

const store = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (k: string) => Promise.resolve(store.get(k) ?? null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve();
    },
  },
}));

jest.mock('expo-file-system', () => {
  class FakeFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      const head = parts[0];
      const base = typeof head === 'string' ? head : head.uri;
      const rest = parts.slice(1) as string[];
      this.uri = rest.length ? `${base}/${rest.join('/')}` : base;
    }
    get exists() {
      return files.has(this.uri);
    }
    delete() {
      files.delete(this.uri);
    }
    async move(dst: { uri: string }) {
      files.delete(this.uri);
      files.add(dst.uri);
      this.uri = dst.uri;
    }
  }
  class FakeDirectory extends FakeFile {
    create() {
      files.add(this.uri);
    }
  }
  return {
    File: FakeFile,
    Directory: FakeDirectory,
    Paths: { document: { uri: 'file:///doc' } },
  };
});

type Queue = typeof import('../photoQueue');

/** 모듈 스코프 상태를 쓰므로 테스트마다 새로 읽는다 */
function load(): Queue {
  let mod: Queue;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../photoQueue');
  });
  return mod!;
}

const PHOTO = { thumbUri: 'file:///cache/t.jpg', fullUri: 'file:///cache/f.jpg' };

beforeEach(() => {
  files.clear();
  store.clear();
  files.add(PHOTO.thumbUri);
  files.add(PHOTO.fullUri);
  uploadPhoto.mockReset().mockResolvedValue({ thumbPath: 'hh/t', photoPath: 'hh/f' });
  deletePhotoObjects.mockClear();
  invalidateQueries.mockClear();
  updateResult.data = [{ id: 'item-1' }];
  updateResult.error = null;
});

/** 큐가 비기를 기다린다 — 업로드는 attach 가 기다려 주지 않는다 */
const settle = () => new Promise((r) => setImmediate(r));

test('업로드가 되면 사진이 붙고 큐가 비워진다', async () => {
  const q = load();
  await q.attachPhotoLater('hh', 'item-1', PHOTO);
  await settle();

  expect(uploadPhoto).toHaveBeenCalledTimes(1);
  expect(JSON.parse(store.get('stow.pending-photos.v1')!)).toHaveLength(0);
  // 다 쓴 임시 파일은 남기지 않는다 (디렉터리 자체는 남는다)
  expect([...files].filter((f) => f.endsWith('.jpg'))).toHaveLength(0);
});

test('업로드 전에 **먼저 적는다** — 화면이 사라져도 남아야 한다', async () => {
  const q = load();
  // 영영 끝나지 않는 업로드: attach 가 끝난 시점에 이미 적혀 있어야 한다
  uploadPhoto.mockImplementation(() => new Promise(() => {}));
  await q.attachPhotoLater('hh', 'item-1', PHOTO);

  const saved = JSON.parse(store.get('stow.pending-photos.v1')!);
  expect(saved).toHaveLength(1);
  expect(saved[0].itemId).toBe('item-1');
  // 임시 파일은 cache 가 아니라 지워지지 않는 자리로 옮겨져 있다
  expect(saved[0].thumbUri).toContain('pending-photos');
});

test('업로드가 실패하면 사유와 함께 남고, 다시 시도하면 붙는다', async () => {
  const q = load();
  uploadPhoto.mockRejectedValueOnce(new Error('네트워크 없음'));
  await q.attachPhotoLater('hh', 'item-1', PHOTO);
  await settle();

  const failed = JSON.parse(store.get('stow.pending-photos.v1')!);
  expect(failed).toHaveLength(1);
  expect(failed[0].error).toBe('네트워크 없음');

  q.retryPendingPhoto('item-1');
  await settle();
  expect(JSON.parse(store.get('stow.pending-photos.v1')!)).toHaveLength(0);
});

test('앱을 껐다 켜면 이어서 올린다', async () => {
  store.set(
    'stow.pending-photos.v1',
    JSON.stringify([
      {
        itemId: 'item-1',
        householdId: 'hh',
        thumbUri: 'file:///doc/pending-photos/item-1-thumb.jpg',
        fullUri: 'file:///doc/pending-photos/item-1-full.jpg',
        error: '네트워크 없음',
      },
    ]),
  );
  files.add('file:///doc/pending-photos/item-1-thumb.jpg');
  files.add('file:///doc/pending-photos/item-1-full.jpg');

  const q = load();
  await q.resumePendingPhotos();
  await settle();

  expect(uploadPhoto).toHaveBeenCalledTimes(1);
  expect(JSON.parse(store.get('stow.pending-photos.v1')!)).toHaveLength(0);
});

test('파일이 사라진 항목은 버린다 — 올릴 것이 없는데 "올리는 중" 을 남기지 않는다', async () => {
  store.set(
    'stow.pending-photos.v1',
    JSON.stringify([
      {
        itemId: 'item-1',
        householdId: 'hh',
        thumbUri: 'file:///doc/pending-photos/gone-thumb.jpg',
        fullUri: 'file:///doc/pending-photos/gone-full.jpg',
      },
    ]),
  );

  const q = load();
  await q.resumePendingPhotos();
  await settle();

  expect(uploadPhoto).not.toHaveBeenCalled();
  expect(JSON.parse(store.get('stow.pending-photos.v1')!)).toHaveLength(0);
});

test('붙일 물건이 없어졌으면(0행) 올린 파일을 치우고 큐에서 뺀다', async () => {
  const q = load();
  updateResult.data = []; // RLS 거부·삭제된 물건 — 오류가 아니라 0행으로 온다
  await q.attachPhotoLater('hh', 'item-1', PHOTO);
  await settle();

  expect(deletePhotoObjects).toHaveBeenCalledWith(['hh/t', 'hh/f']);
  expect(JSON.parse(store.get('stow.pending-photos.v1')!)).toHaveLength(0);
});

test('사용자가 새 사진을 직접 붙이면 기다리던 옛 사진은 버린다', async () => {
  const q = load();
  uploadPhoto.mockImplementation(() => new Promise(() => {}));
  await q.attachPhotoLater('hh', 'item-1', PHOTO);

  q.dropPendingPhoto('item-1');
  await settle();

  expect(JSON.parse(store.get('stow.pending-photos.v1')!)).toHaveLength(0);
});
