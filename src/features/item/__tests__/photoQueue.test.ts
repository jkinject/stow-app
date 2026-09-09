/**
 * 사진 붙이기 큐 (2026-09-06 사용자 보고: "등록했는데 사진이 사라졌다").
 *
 * 이 파일이 지키는 것은 하나다 — **찍은 사진은 조용히 사라지지 않는다.**
 * 잃는 방식이 전부 조용했기 때문에(실패 상태를 그리는 화면이 없었다) 화면 없이도
 * 검증되는 이 층에 못을 박아 둔다.
 *
 * 2026-09-08 사진 여러 장: 일감의 단위가 물건 → 사진 한 장으로 바뀌었다. 여기서
 * 새로 지키는 것 — 같은 물건의 사진은 **순서대로** 올라가고, 각 장이 제 행을 갖는다.
 *
 * ⚠ jest.config 의 "순수 로직 전용" 방침에서 한 걸음 나간다(네이티브 모듈 몇 개를 흉내
 *   낸다). 그럴 값이 있다고 봤다 — 되돌릴 수 없는 데이터 유실이고, 실기기로는
 *   "업로드가 실패하는 상황" 을 만들어 보기가 어렵다.
 */

const uploadEntityPhoto = jest.fn();
const deletePhotoObjects = jest.fn().mockResolvedValue(undefined);
const invalidateQueries = jest.fn();

/** 흉내 낸 파일 시스템 — uri 를 키로 하는 맵 하나면 충분하다 */
const files = new Set<string>();

jest.mock('../photo', () => ({
  uploadEntityPhoto: (...a: unknown[]) => uploadEntityPhoto(...a),
  deletePhotoObjects: (...a: unknown[]) => deletePhotoObjects(...a),
}));

jest.mock('@/lib/query', () => ({
  queryClient: { invalidateQueries: (...a: unknown[]) => invalidateQueries(...a) },
}));

let uuidSeq = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++uuidSeq}` }));

/** insert 가 돌려줄 것. code 를 주면 그 오류로 실패한다 */
const insertResult = { error: null as null | { code: string; message: string } };
const inserted: Record<string, unknown>[] = [];
const supabaseFrom = jest.fn(() => ({
  insert: (row: Record<string, unknown>) => {
    inserted.push(row);
    return Promise.resolve(insertResult);
  },
}));
const rpc = jest.fn(() => Promise.resolve({ data: 0, error: null }));
jest.mock('@/lib/supabase', () => ({
  supabase: { from: (...a: unknown[]) => supabaseFrom(...(a as [])), rpc: (...a: unknown[]) => rpc(...(a as [])) },
  photoPaths: {
    thumb: (hh: string, owner: string, id: string) => `${hh}/${owner}/${id}_t.jpg`,
    full: (hh: string, owner: string, id: string) => `${hh}/${owner}/${id}.jpg`,
  },
}));

const store = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (k: string) => Promise.resolve(store.get(k) ?? null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve();
    },
    removeItem: (k: string) => {
      store.delete(k);
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

const KEY = 'stow.pending-photos.v2';
const PHOTO = { thumbUri: 'file:///cache/t.jpg', fullUri: 'file:///cache/f.jpg' };
const PHOTO2 = { thumbUri: 'file:///cache/t2.jpg', fullUri: 'file:///cache/f2.jpg' };
const saved = () =>
  JSON.parse(store.get(KEY)!) as { photoId: string; itemId: string; thumbUri: string; error?: string }[];

beforeEach(() => {
  files.clear();
  store.clear();
  inserted.length = 0;
  uuidSeq = 0;
  for (const p of [PHOTO, PHOTO2]) {
    files.add(p.thumbUri);
    files.add(p.fullUri);
  }
  uploadEntityPhoto
    .mockReset()
    .mockImplementation((_hh: string, _item: string, id: string) =>
      Promise.resolve({ thumbPath: `hh/${id}_t`, photoPath: `hh/${id}` }),
    );
  deletePhotoObjects.mockClear();
  rpc.mockClear();
  invalidateQueries.mockClear();
  insertResult.error = null;
});

/** 큐가 비기를 기다린다 — 업로드는 attach 가 기다려 주지 않는다 */
const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};

test('업로드가 되면 사진마다 행이 생기고 큐가 비워진다', async () => {
  const q = load();
  await q.attachPhotosLater('hh', 'item-1', [PHOTO, PHOTO2]);
  await settle();

  expect(uploadEntityPhoto).toHaveBeenCalledTimes(2);
  expect(inserted).toHaveLength(2);
  expect(inserted[0]).toMatchObject({ id: 'uuid-1', item_id: 'item-1', sort_order: 0 });
  expect(inserted[1]).toMatchObject({ id: 'uuid-2', item_id: 'item-1', sort_order: 1 });
  expect(saved()).toHaveLength(0);
  // 다 쓴 임시 파일은 남기지 않는다 (디렉터리 자체는 남는다)
  expect([...files].filter((f) => f.endsWith('.jpg'))).toHaveLength(0);
});

test('같은 물건의 사진은 **순서대로** 올린다 — 첫 장이 대표라 먼저 떠야 한다', async () => {
  const q = load();
  const order: string[] = [];
  let releaseFirst: () => void = () => {};
  uploadEntityPhoto.mockImplementation((_hh: string, _item: string, id: string) => {
    order.push(id);
    if (id === 'uuid-1') {
      return new Promise((r) => {
        releaseFirst = () => r({ thumbPath: `hh/${id}_t`, photoPath: `hh/${id}` });
      });
    }
    return Promise.resolve({ thumbPath: `hh/${id}_t`, photoPath: `hh/${id}` });
  });
  await q.attachPhotosLater('hh', 'item-1', [PHOTO, PHOTO2]);
  await settle();
  // 첫 장이 끝나기 전에는 둘째 장을 시작하지 않는다
  expect(order).toEqual(['uuid-1']);
  releaseFirst();
  await settle();
  expect(order).toEqual(['uuid-1', 'uuid-2']);
  expect(saved()).toHaveLength(0);
});

test('덧붙이는 사진은 이어지는 순서 번호를 받는다', async () => {
  const q = load();
  await q.attachPhotosLater('hh', 'item-1', [PHOTO], 5);
  await settle();
  expect(inserted[0]).toMatchObject({ sort_order: 5 });
});

test('업로드 전에 **먼저 적는다** — 화면이 사라져도 남아야 한다', async () => {
  const q = load();
  // 영영 끝나지 않는 업로드: attach 가 끝난 시점에 이미 적혀 있어야 한다
  uploadEntityPhoto.mockImplementation(() => new Promise(() => {}));
  await q.attachPhotosLater('hh', 'item-1', [PHOTO]);

  const s = saved();
  expect(s).toHaveLength(1);
  expect(s[0].itemId).toBe('item-1');
  expect(s[0].photoId).toBe('uuid-1');
  // 임시 파일은 cache 가 아니라 지워지지 않는 자리로 옮겨져 있다
  expect(s[0].thumbUri).toContain('pending-photos');
});

test('업로드가 실패하면 사유와 함께 남고, 다시 시도하면 붙는다', async () => {
  const q = load();
  uploadEntityPhoto.mockRejectedValueOnce(new Error('네트워크 없음'));
  await q.attachPhotosLater('hh', 'item-1', [PHOTO]);
  await settle();

  const failed = saved();
  expect(failed).toHaveLength(1);
  expect(failed[0].error).toBe('네트워크 없음');

  q.retryPendingPhoto('uuid-1');
  await settle();
  expect(saved()).toHaveLength(0);
});

test('앱을 껐다 켜면 이어서 올린다', async () => {
  store.set(
    KEY,
    JSON.stringify([
      {
        photoId: 'p-1',
        itemId: 'item-1',
        householdId: 'hh',
        thumbUri: 'file:///doc/pending-photos/p-1-thumb.jpg',
        fullUri: 'file:///doc/pending-photos/p-1-full.jpg',
        sortOrder: 0,
        error: '네트워크 없음',
      },
    ]),
  );
  files.add('file:///doc/pending-photos/p-1-thumb.jpg');
  files.add('file:///doc/pending-photos/p-1-full.jpg');

  const q = load();
  await q.resumePendingPhotos();
  await settle();

  expect(uploadEntityPhoto).toHaveBeenCalledTimes(1);
  expect(saved()).toHaveLength(0);
});

test('한 장짜리 시절(v1)에 기다리던 사진도 버리지 않고 옮겨서 올린다', async () => {
  store.set(
    'stow.pending-photos.v1',
    JSON.stringify([
      {
        itemId: 'item-1',
        householdId: 'hh',
        thumbUri: 'file:///doc/pending-photos/item-1-thumb.jpg',
        fullUri: 'file:///doc/pending-photos/item-1-full.jpg',
      },
    ]),
  );
  files.add('file:///doc/pending-photos/item-1-thumb.jpg');
  files.add('file:///doc/pending-photos/item-1-full.jpg');

  const q = load();
  await q.resumePendingPhotos();
  await settle();

  expect(uploadEntityPhoto).toHaveBeenCalledTimes(1);
  expect(inserted[0]).toMatchObject({ item_id: 'item-1', sort_order: 0 });
  expect(store.has('stow.pending-photos.v1')).toBe(false);
  expect(saved()).toHaveLength(0);
});

test('파일이 사라진 항목은 버린다 — 올릴 것이 없는데 "올리는 중" 을 남기지 않는다', async () => {
  store.set(
    KEY,
    JSON.stringify([
      {
        photoId: 'p-1',
        itemId: 'item-1',
        householdId: 'hh',
        thumbUri: 'file:///doc/pending-photos/gone-thumb.jpg',
        fullUri: 'file:///doc/pending-photos/gone-full.jpg',
        sortOrder: 0,
      },
    ]),
  );

  const q = load();
  await q.resumePendingPhotos();
  await settle();

  expect(uploadEntityPhoto).not.toHaveBeenCalled();
  expect(saved()).toHaveLength(0);
});

test('붙일 물건이 없어졌으면(23503) 올린 파일을 치우고 큐에서 뺀다', async () => {
  const q = load();
  insertResult.error = { code: '23503', message: '물건을 찾을 수 없습니다.' };
  await q.attachPhotosLater('hh', 'item-1', [PHOTO]);
  await settle();

  expect(deletePhotoObjects).toHaveBeenCalledWith(['hh/uuid-1_t', 'hh/uuid-1']);
  expect(saved()).toHaveLength(0);
});

test('붙일 수 없게 된 파일은 지우기 전에 서버에 **신고**한다 — 삭제가 막혀도 서버가 경로를 안다', async () => {
  const q = load();
  insertResult.error = { code: '42501', message: 'RLS' }; // 그 사이 가구에서 빠졌다
  await q.attachPhotosLater('hh', 'item-1', [PHOTO]);
  await settle();

  expect(rpc).toHaveBeenCalledWith('report_orphan_photos', { p_paths: ['hh/uuid-1_t', 'hh/uuid-1'] });
  // 신고 뒤에 삭제를 시도한다 (순서)
  expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(deletePhotoObjects.mock.invocationCallOrder[0]);
  expect(saved()).toHaveLength(0);
});

test('행이 이미 있으면(23505 — 앞 시도에서 응답만 놓친 경우) 성공으로 친다', async () => {
  const q = load();
  insertResult.error = { code: '23505', message: 'duplicate key' };
  await q.attachPhotosLater('hh', 'item-1', [PHOTO]);
  await settle();

  expect(deletePhotoObjects).not.toHaveBeenCalled();
  expect(saved()).toHaveLength(0);
});

test('사용자가 기다리던 사진을 포기하면 큐에서 빠진다', async () => {
  const q = load();
  uploadEntityPhoto.mockImplementation(() => new Promise(() => {}));
  await q.attachPhotosLater('hh', 'item-1', [PHOTO]);

  q.dropPendingPhoto('uuid-1');
  await settle();

  expect(saved()).toHaveLength(0);
});

test('실패한 사진을 포기하면 **올라갔을지 모르는 파일까지** 치운다 — 썸네일만 올라간 채 남는 고아를 막는다', async () => {
  const q = load();
  // 썸네일은 올라갔는데 원본에서 실패한 상황: uploadEntityPhoto 가 던진다
  uploadEntityPhoto.mockRejectedValueOnce(new Error('원본 업로드 실패'));
  await q.attachPhotosLater('hh', 'item-1', [PHOTO]);
  await settle();
  expect(saved()[0].error).toBe('원본 업로드 실패');

  q.dropPendingPhoto('uuid-1');
  await settle();
  expect(deletePhotoObjects).toHaveBeenCalledWith(['hh/item-1/uuid-1_t.jpg', 'hh/item-1/uuid-1.jpg']);
  expect(saved()).toHaveLength(0);
});

test('앱을 껐다 켰는데 임시 파일이 사라진 항목도 올라간 파일을 치우고 버린다', async () => {
  store.set(
    KEY,
    JSON.stringify([
      {
        photoId: 'p-gone',
        itemId: 'item-1',
        householdId: 'hh',
        thumbUri: 'file:///doc/pending-photos/gone-thumb.jpg',
        fullUri: 'file:///doc/pending-photos/gone-full.jpg',
        sortOrder: 0,
      },
    ]),
  );
  const q = load();
  await q.resumePendingPhotos();
  await settle();
  expect(deletePhotoObjects).toHaveBeenCalledWith(['hh/item-1/p-gone_t.jpg', 'hh/item-1/p-gone.jpg']);
});

test('옛(v1) 큐를 옮길 때 파일명은 물건 id 그대로 — 반쯤 올라간 파일에 덮어쓴다', async () => {
  store.set(
    'stow.pending-photos.v1',
    JSON.stringify([{ itemId: 'item-1', householdId: 'hh', thumbUri: 'file:///doc/pending-photos/item-1-thumb.jpg', fullUri: 'file:///doc/pending-photos/item-1-full.jpg' }]),
  );
  files.add('file:///doc/pending-photos/item-1-thumb.jpg');
  files.add('file:///doc/pending-photos/item-1-full.jpg');
  const q = load();
  await q.resumePendingPhotos();
  await settle();
  expect(uploadEntityPhoto).toHaveBeenCalledWith('hh', 'item-1', 'item-1', expect.anything());
  expect(inserted[0]).toMatchObject({ id: 'item-1' });
});
