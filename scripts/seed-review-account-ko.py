"""심사용 계정(tester@gmail.com)에 **한국어 데모 공간** "우리 집" 을 하나 더 만든다.

    python3 scripts/seed-review-account-ko.py

왜 따로 만드나: 한국어 스토어 스크린샷은 UI 도 데이터도 한국어여야 읽힌다.
영어 공간(Kim Family, seed-review-account.py)의 이름을 한국어로 바꾸면 영어 세트를
다시 못 찍으니, 같은 사진을 **복사**해서 이름만 한국어인 두 번째 공간을 둔다.

⚠ 사진은 새로 만들지 않는다. Kim Family 의 Storage 객체를 storage copy API 로
  새 가구 폴더에 복사한다 — Storage 정책이 첫 폴더(household_id)로 권한을 보므로
  같은 사용자(tester)가 두 가구의 구성원이면 읽기·쓰기 모두 통과한다.
⚠ 물건 사진은 item_photos 에 넣는다. items.photo_path 는 t61 트리거가 첫 장을 복사한다.
  박스(containers)는 아직 사진 표가 없어 photo_path 를 직접 적는다.
⚠ 수량 0 전이(구매 목록 자동 담기)는 seed-review-account.py 와 같은 이유로 RPC 로 내린다.
"""
import json, os, sys, urllib.request, urllib.error, uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EMAIL, PASSWORD = 'tester@gmail.com', '12345678'
SRC_NAME, NEW_NAME = 'Kim Family', '우리 집'

env = {}
for line in open(os.path.join(ROOT, '.env.production.local')):
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
URL, KEY = env['EXPO_PUBLIC_SUPABASE_URL'], env['EXPO_PUBLIC_SUPABASE_ANON_KEY']

TOKEN = json.load(urllib.request.urlopen(urllib.request.Request(
    URL + '/auth/v1/token?grant_type=password',
    json.dumps({'email': EMAIL, 'password': PASSWORD}).encode(),
    {'apikey': KEY, 'Content-Type': 'application/json'})))['access_token']


def call(method, path, body=None, prefer='return=representation'):
    data = json.dumps(body).encode() if body is not None else None
    h = {'apikey': KEY, 'Authorization': 'Bearer ' + TOKEN,
         'Content-Type': 'application/json', 'Prefer': prefer}
    req = urllib.request.Request(URL + path, data, h, method=method)
    try:
        raw = urllib.request.urlopen(req).read()
    except urllib.error.HTTPError as e:
        print('✗', method, path, e.code, e.read().decode()[:300]); sys.exit(1)
    return json.loads(raw) if raw else None


def get(path):
    return call('GET', path)


# ── 원본(영어 공간) ────────────────────────────────────────────────────
src = [h for h in get('/rest/v1/households?select=id,name') if h['name'] == SRC_NAME]
if not src:
    sys.exit('원본 공간 %s 이 없다' % SRC_NAME)
SRC = src[0]['id']
src_items = {r['name']: r for r in get(
    '/rest/v1/items?select=id,name,photo_path,thumb_path&deleted_at=is.null&household_id=eq.' + SRC)}
src_boxes = {r['name']: r for r in get(
    '/rest/v1/containers?select=id,name,photo_path,thumb_path&deleted_at=is.null&household_id=eq.' + SRC)}

# ⚠ 중간에 실패하면 다시 돌릴 수 있게 **있는 것은 재사용**한다. (첫 실행이 item_photos.id
#   누락으로 중간에 죽었고, 가구는 지울 RPC 가 없어 반쯤 만들어진 채 남았다.)
have = [h for h in get('/rest/v1/households?select=id,name') if h['name'] == NEW_NAME]
if have:
    HH = have[0]['id']
    print('가구 (재사용)', NEW_NAME, HH)
else:
    hh = call('POST', '/rest/v1/rpc/create_household', {'p_name': NEW_NAME})
    HH = hh['id']
    print('가구', hh['name'], HH)


def existing(table):
    # ⚠ locations·categories 에는 사진 컬럼이 없다 — 있는 표에서만 photo_path 를 고른다.
    cols = 'id,name,photo_path' if table in ('items', 'containers') else 'id,name'
    return {r['name']: r for r in get('/rest/v1/%s?select=%s&household_id=eq.%s' % (table, cols, HH))}

LOCS = ['안방', '주방', '거실', '창고']
loc = {n: r['id'] for n, r in existing('locations').items()}
for i, n in enumerate(LOCS):
    if n not in loc:
        loc[n] = call('POST', '/rest/v1/locations', {'household_id': HH, 'name': n, 'sort_order': i})[0]['id']
print('장소', len(loc), '개')

#         한국어 이름       장소     영어 원본(사진 복사용)
BOXES = [('옷장 위 칸',     '안방',  'Top Shelf Bin'),
         ('싱크대 아래 수납장', '주방', 'Under-Sink Cabinet')]
CATS = {'Medicine': '상비약', 'Tools': '공구', 'Cleaning': '청소', 'Kids': '아이', 'Kitchen': '주방'}
have_cat = existing('categories')
cat = {}
for en, ko in CATS.items():
    cat[en] = have_cat[ko]['id'] if ko in have_cat else \
        call('POST', '/rest/v1/categories', {'household_id': HH, 'name': ko})[0]['id']

#      한국어 이름          장소    박스                 카테고리     수량 단위    메모                          영어 원본
ITEMS = [
    ('겨울 이불',         '안방', '옷장 위 칸',        None,       2, None,  '압축팩, 지난봄에 세탁함',       'Winter Blanket'),
    ('여분 침대 시트',    '안방', '옷장 위 칸',        None,       3, None,  None,                           'Spare Bed Sheets'),
    ('여권·서류',         '안방', None,                None,       1, None,  '두 번째 서랍, 파란 파일',       'Passport & Documents'),
    ('감기약',            '주방', '싱크대 아래 수납장', 'Medicine', 6, '박스', '먹기 전에 날짜 확인',          'Cold Medicine'),
    ('밴드',              '주방', '싱크대 아래 수납장', 'Medicine', 4, '박스', None,                          'Band-Aids'),
    ('주방 세제',         '주방', '싱크대 아래 수납장', 'Cleaning', 4, None,  None,                           'Dish Soap'),
    ('쓰레기봉투 20L',    '주방', '싱크대 아래 수납장', 'Cleaning', 5, '롤',  None,                           'Trash Bags 20L'),
    ('커피 필터',         '주방', None,                'Kitchen',  3, '팩',  None,                           'Coffee Filters'),
    ('드라이버 세트',     '창고', None,                'Tools',    1, None,  '십자·일자 6개',                'Screwdriver Set'),
    ('LED 전구',          '창고', None,                'Tools',    6, None,  'E26, 전구색',                  'Light Bulbs (LED)'),
    ('캠핑 텐트',         '창고', None,                None,       1, None,  '맨 아래 칸, 초록 가방',         'Camping Tent'),
    ('아이 겨울 부츠',    '창고', None,                'Kids',     1, None,  '180 — 내년엔 작을 듯',          'Kids Winter Boots'),
    ('보드게임',          '거실', None,                'Kids',     4, None,  'TV 장 아래',                   'Board Games'),
    ('AA 건전지',         '거실', None,                'Tools',    8, None,  '리모컨·벽시계용',               'AA Batteries'),
]


def copy_obj(src_key, dst_key):
    """Storage 객체 복사. 원본 가구 폴더는 읽기, 새 가구 폴더는 쓰기 — 둘 다 tester 가 구성원이라 통과."""
    call('POST', '/storage/v1/object/copy',
         {'bucketId': 'item-photos', 'sourceKey': src_key, 'destinationKey': dst_key},
         prefer='return=minimal')


def clone_photo(src_row, new_row_id):
    if not src_row or not src_row.get('photo_path'):
        return None, None
    u = str(uuid.uuid4())
    full, thumb = '%s/%s/%s.jpg' % (HH, new_row_id, u), '%s/%s/%s_t.jpg' % (HH, new_row_id, u)
    copy_obj(src_row['photo_path'], full)
    copy_obj(src_row['thumb_path'], thumb)
    return full, thumb


have_box = existing('containers')
box = {}
for ko, l, en in BOXES:
    if ko in have_box:
        box[ko] = have_box[ko]['id']
        continue
    cid = call('POST', '/rest/v1/containers', {'household_id': HH, 'location_id': loc[l], 'name': ko})[0]['id']
    full, thumb = clone_photo(src_boxes.get(en), cid)
    if full:
        call('PATCH', '/rest/v1/containers?id=eq.' + cid, {'photo_path': full, 'thumb_path': thumb})
    box[ko] = cid
print('박스', len(box), '개')

have_item = existing('items')
ids = {}
photos = 0
fresh = []
for ko, l, b, c, qty, unit, note, en in ITEMS:
    if ko in have_item:
        iid = have_item[ko]['id']
        ids[ko] = iid
        if have_item[ko].get('photo_path'):
            continue
    else:
        iid = str(uuid.uuid4())
        body = {'id': iid, 'household_id': HH, 'location_id': loc[l],
                'container_id': box[b] if b else None, 'name': ko,
                'category_id': cat[c] if c else None, 'quantity': qty}
        if unit:
            body['unit'] = unit
        if note:
            body['note'] = note
        call('POST', '/rest/v1/items', body)
        ids[ko] = iid
        fresh.append(ko)
    full, thumb = clone_photo(src_items.get(en), iid)
    if full:
        # ⚠ item_photos.id 는 default 가 없다 — 앱도 클라이언트에서 uuid 를 만들어 넣는다.
        call('POST', '/rest/v1/item_photos',
             {'id': str(uuid.uuid4()), 'household_id': HH, 'item_id': iid,
              'photo_path': full, 'thumb_path': thumb, 'sort_order': 0})
        photos += 1
print('물건', len(ids), '개 · 사진', photos, '장')

for ko in ('주방 세제', '커피 필터'):
    if ko in fresh:
        qty = {i[0]: i[4] for i in ITEMS}[ko]
        call('POST', '/rest/v1/rpc/adjust_item_quantity', {'p_item_id': ids[ko], 'p_delta': -qty})
# ⚠ shopping_list 직접 insert 는 이제 RLS 가 막는다(2026-09-12 확인, 42501). 수동 담기는 앱 UI 로만.
print('구매 목록 — 자동 2건 (수량 0 전이)')

n = len(get('/rest/v1/items?select=id&household_id=eq.%s&photo_path=not.is.null' % HH))
print('대표 사진이 붙은 물건', n, '개 (t61 확인)')
