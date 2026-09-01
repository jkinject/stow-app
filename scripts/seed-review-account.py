"""심사용 계정(tester@gmail.com)에 데모 데이터를 넣는다.

    python3 scripts/seed-review-account.py

빈 계정이면 Play 심사자가 기능을 볼 수 없다. 계정을 다시 만들 일이 생기면
이 스크립트를 그대로 돌리면 된다 (사진은 gen-review-photos.py 가 따로 채운다).

⚠ 이름을 영어로 쓴다. 심사자는 영어 기기로 보게 되고, 그러면 UI 는 영어인데
  데이터만 한국어인 화면이 된다. 심사자가 무슨 앱인지 읽을 수 있어야 한다.

⚠ 재고 부족 항목을 **insert 로 낮게 넣으면 안 된다.** 구매 목록 트리거는
  20260831000100_shopping_on_zero 에서 기준이 임계치 → **수량 0** 으로 바뀌었고,
  그것도 '0 으로 전이할 때만' 담는다. 넉넉히 넣은 뒤 adjust_item_quantity 로
  떨어뜨려야 실제로 담긴다. (처음에 임계치로 넣었다가 한 건도 안 담겨서 알았다)

⚠ items.threshold 는 이제 아무도 보지 않는 컬럼이다. 값을 넣지 말 것 —
  읽는 사람을 헷갈리게 한다.
"""
import json, os, sys, urllib.request, urllib.error, uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EMAIL, PASSWORD = 'tester@gmail.com', '12345678'

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


hh = call('POST', '/rest/v1/rpc/create_household', {'p_name': 'Kim Family'})
HH = hh['id']
print('가구', hh['name'], HH)

LOCS = ['Bedroom', 'Kitchen', 'Living Room', 'Storage Closet']
loc = {}
for i, n in enumerate(LOCS):
    r = call('POST', '/rest/v1/locations', {'household_id': HH, 'name': n, 'sort_order': i})[0]
    loc[n] = r['id']
print('장소', len(loc), '개 —', ', '.join(LOCS))

BOXES = [('Top Shelf Bin', 'Bedroom'), ('Under-Sink Cabinet', 'Kitchen')]
box = {}
for n, l in BOXES:
    r = call('POST', '/rest/v1/containers',
             {'household_id': HH, 'location_id': loc[l], 'name': n})[0]
    box[n] = r['id']
print('박스', len(box), '개 —', ', '.join(b for b, _ in BOXES))

CATS = ['Medicine', 'Tools', 'Cleaning', 'Kids', 'Kitchen']
cat = {}
for n in CATS:
    r = call('POST', '/rest/v1/categories', {'household_id': HH, 'name': n})[0]
    cat[n] = r['id']
print('카테고리', len(cat), '개 —', ', '.join(CATS))

#      이름                     장소             박스                  카테고리     수량 단위     메모
ITEMS = [
    ('Winter Blanket',        'Bedroom',        'Top Shelf Bin',      None,        2, None,  'Vacuum-sealed, washed last spring'),
    ('Spare Bed Sheets',      'Bedroom',        'Top Shelf Bin',      None,        3, None,  None),
    ('Passport & Documents',  'Bedroom',        None,                 None,        1, None,  'Second drawer, blue folder'),
    ('Cold Medicine',         'Kitchen',        'Under-Sink Cabinet', 'Medicine',  6, 'box', 'Check the date before taking'),
    ('Band-Aids',             'Kitchen',        'Under-Sink Cabinet', 'Medicine',  4, 'box', None),
    ('Dish Soap',             'Kitchen',        'Under-Sink Cabinet', 'Cleaning',  4, None,  None),
    ('Trash Bags 20L',        'Kitchen',        'Under-Sink Cabinet', 'Cleaning',  5, 'roll', None),
    ('Coffee Filters',        'Kitchen',        None,                 'Kitchen',   3, 'pack', None),
    ('Screwdriver Set',       'Storage Closet', None,                 'Tools',     1, None,  'Phillips + flathead, 6 pieces'),
    ('Light Bulbs (LED)',     'Storage Closet', None,                 'Tools',     6, None,  'E26 socket, warm white'),
    ('Camping Tent',          'Storage Closet', None,                 None,        1, None,  'Bottom shelf, green bag'),
    ('Kids Winter Boots',     'Storage Closet', None,                 'Kids',      1, None,  'Size 180 — too small next year'),
    ('Board Games',           'Living Room',    None,                 'Kids',      4, None,  'Under the TV stand'),
    ('AA Batteries',          'Living Room',    None,                 'Tools',     8, None,  'For the remote and the wall clock'),
]

ids = {}
for name, l, b, c, qty, unit, note in ITEMS:
    iid = str(uuid.uuid4())
    body = {'id': iid, 'household_id': HH, 'location_id': loc[l],
            'container_id': box[b] if b else None, 'name': name,
            'category_id': cat[c] if c else None, 'quantity': qty}
    if unit:
        body['unit'] = unit
    if note:
        body['note'] = note
    call('POST', '/rest/v1/items', body)
    ids[name] = iid
print('물건', len(ids), '개')

# ── 구매 목록 ────────────────────────────────────────────────────────────
# ⚠ 여기서 반드시 **0 까지** 내려야 한다. 트리거는 수량 0 으로 '전이할 때만' 담는다.
#   1 로만 내리면 아무 일도 일어나지 않는다 (처음에 그렇게 했다가 빈 목록을 봤다).
for name in ('Dish Soap', 'Coffee Filters'):
    qty = dict((i[0], i[4]) for i in ITEMS)[name]
    call('POST', '/rest/v1/rpc/adjust_item_quantity', {'p_item_id': ids[name], 'p_delta': -qty})

# 수동 추가도 한 건 — 자동/수동 두 경로가 다 보이게
call('POST', '/rest/v1/shopping_list',
     {'household_id': HH, 'item_id': ids['Light Bulbs (LED)'], 'added_reason': 'manual'})
print('구매 목록 — 자동 2건(수량 0) + 수동 1건')

# ── 확인 ────────────────────────────────────────────────────────────────
def get(path):
    req = urllib.request.Request(URL + path, headers={'apikey': KEY, 'Authorization': 'Bearer ' + TOKEN})
    return json.load(urllib.request.urlopen(req))

print()
print('═══ 결과 ═══')
for t, q in (('locations', 'select=id'), ('containers', 'select=id'),
             ('categories', 'select=id'), ('items', 'select=id'),
             ('item_events', 'select=id')):
    print(f'  {t:14} {len(get(f"/rest/v1/{t}?{q}")):3} 행')
sl = get('/rest/v1/shopping_list?select=added_reason,items(name,quantity)&resolved_at=is.null')
print(f'  shopping_list  {len(sl):3} 행')
for r in sl:
    it = r['items']
    print(f"      · {it['name']:20} 수량 {it['quantity']}  ({r['added_reason']})")
