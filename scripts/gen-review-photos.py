"""심사용 계정의 물건·박스 사진을 Replicate(gpt-image-2)로 만들어 Storage 에 올린다.

    python3 scripts/gen-review-photos.py            # 사진이 없는 것만
    python3 scripts/gen-review-photos.py --test     # 한 장만 (전 과정 점검)

토큰은 ~/.replicate_api_token 에서 읽는다.

⚠ 경로 규약은 앱과 **똑같아야** 한다 (src/lib/supabase.ts photoPaths):
     {household_id}/{owner_id}/{uuid}.jpg      원본
     {household_id}/{owner_id}/{uuid}_t.jpg    썸네일
   Storage 정책이 첫 폴더(household_id)로 권한을 판정하므로 순서가 틀리면 조용히 막힌다.

⚠ 썸네일은 **640px** 이다. 320 이던 시절 값이 아니다 (photo.ts, 2026-08-30 변경).
   격자 카드가 490 물리픽셀이라 320 은 흐리게 보인다.

⚠ 프롬프트에 브랜드·읽히는 글자를 넣지 않는다. 심사 계정에 가짜 상표가 박힌 사진이
   들어가면 곤란하다.

⚠ **순차로 돌린다.** Replicate 는 크레딧이 $5 미만이면 분당 6회 · **동시 1회** 로
   조인다. 병렬 4개로 던졌더니 11장이 전부 429 로 튕겼다.
"""
import io, json, os, sys, threading, time, urllib.request, urllib.error, uuid
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RTOK = open(os.path.expanduser('~/.replicate_api_token')).read().strip()
MODEL = 'openai/gpt-image-2'

env = {}
for line in open(ROOT + '/.env.production.local'):
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
URL, KEY = env['EXPO_PUBLIC_SUPABASE_URL'], env['EXPO_PUBLIC_SUPABASE_ANON_KEY']

_p = threading.Lock()
def say(*a):
    with _p:
        print(*a, flush=True)


class Throttled(Exception):
    def __init__(self, wait):
        self.wait = wait


def req(url, data=None, headers=None, method=None, raw=False, timeout=180):
    r = urllib.request.Request(url, data, headers or {}, method=method)
    try:
        b = urllib.request.urlopen(r, timeout=timeout).read()
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        # ⚠ Replicate 는 크레딧이 $5 미만이면 **분당 6회 · 동시 1회**로 조인다.
        #   병렬로 던지면 전부 429 로 튕긴다. 429 는 실패가 아니라 "기다려라" 다.
        if e.code == 429:
            try:
                wait = float(json.loads(body).get('retry_after', 10))
            except Exception:
                wait = 10.0
            raise Throttled(wait)
        raise RuntimeError(f'{method or "GET"} {url.split("?")[0]} -> {e.code} {body[:400]}')
    return b if raw else (json.loads(b) if b else None)


# ── Supabase ────────────────────────────────────────────────────────────
tok = req(URL + '/auth/v1/token?grant_type=password',
          json.dumps({'email': 'tester@gmail.com', 'password': '12345678'}).encode(),
          {'apikey': KEY, 'Content-Type': 'application/json'})['access_token']
AUTH = {'apikey': KEY, 'Authorization': 'Bearer ' + tok}


def sb(method, path, body=None, extra=None):
    h = dict(AUTH, **{'Content-Type': 'application/json', 'Prefer': 'return=representation'})
    if extra:
        h.update(extra)
    return req(URL + path, json.dumps(body).encode() if body is not None else None, h, method)


HH = sb('GET', '/rest/v1/household_members?select=household_id')[0]['household_id']

# ── 프롬프트 ─────────────────────────────────────────────────────────────
STYLE = ('Casual smartphone snapshot taken by a person tidying up at home. '
         'Natural indoor daylight, slightly off-center handheld framing, realistic '
         'ordinary home, mild shadows. Photorealistic, not a studio product shot, '
         'not an advertisement. Plain unbranded packaging with no legible text and '
         'no logos anywhere in the frame.')

ITEM_PROMPTS = {
    'Winter Blanket':       'A thick folded winter blanket compressed inside a clear vacuum storage bag, resting on a closet shelf.',
    'Spare Bed Sheets':     'A neat stack of folded cotton bed sheets and pillowcases in soft grey and white, on a shelf.',
    'Passport & Documents': 'A passport lying on a blue paper document folder inside an open wooden drawer.',
    'Cold Medicine':        'A small plain white cardboard medicine box next to a blister pack of round tablets on a kitchen counter.',
    'Band-Aids':            'A small opened tin of assorted adhesive bandages, a few bandages spilling out, on a bathroom shelf.',
    'Dish Soap':            'An empty plain green plastic dish soap bottle standing beside a kitchen sink.',
    'Trash Bags 20L':       'A roll of black plastic trash bags, partly unrolled, sitting inside a cabinet.',
    'Coffee Filters':       'An empty cardboard sleeve of white paper coffee filters lying next to a coffee maker.',
    'Screwdriver Set':      'An open plastic case holding a set of six screwdrivers with red and black handles.',
    'Light Bulbs (LED)':    'Several LED light bulbs in plain white cardboard boxes stacked in a storage closet.',
    'Camping Tent':         'A rolled up camping tent in a dark green carry bag on the bottom shelf of a closet.',
    'Kids Winter Boots':    "A pair of small child's navy winter snow boots side by side on a shoe shelf.",
    'Board Games':          'A stack of three board game boxes with plain colored lids, under a TV stand.',
    'AA Batteries':         'A pack of AA alkaline batteries in plain silver wrapping, lying in a drawer with a TV remote.',
}
CONTAINER_PROMPTS = {
    'Top Shelf Bin':        'A grey fabric storage bin with handles sitting on the top shelf of a bedroom closet.',
    'Under-Sink Cabinet':   'An open cabinet under a kitchen sink with cleaning supplies and a pipe visible inside.',
}


# ── Replicate ────────────────────────────────────────────────────────────
def generate(prompt):
    """예측을 만들고 끝날 때까지 기다린 뒤 이미지 바이트를 돌려준다."""
    body = json.dumps({'input': {
        'prompt': prompt + ' ' + STYLE,
        'aspect_ratio': '1:1',
        'quality': 'medium',
        'output_format': 'jpeg',
        'output_compression': 90,
        'moderation': 'low',
    }}).encode()
    hdr = {'Authorization': 'Bearer ' + RTOK, 'Content-Type': 'application/json',
           'Prefer': 'wait'}
    # 429 는 무한정 재시도하지 않는다 — 크레딧이 바닥나면 영원히 429 다.
    for attempt in range(8):
        try:
            p = req('https://api.replicate.com/v1/models/%s/predictions' % MODEL, body, hdr)
            break
        except Throttled as t:
            time.sleep(t.wait + 1)
    else:
        raise RuntimeError('429 가 8번 반복 — 크레딧을 확인하세요')
    for _ in range(120):
        if p['status'] in ('succeeded', 'failed', 'canceled'):
            break
        time.sleep(3)
        p = req('https://api.replicate.com/v1/predictions/' + p['id'],
                headers={'Authorization': 'Bearer ' + RTOK})
    if p['status'] != 'succeeded':
        raise RuntimeError('replicate %s: %s' % (p['status'], str(p.get('error'))[:300]))
    out = p['output']
    if isinstance(out, list):
        out = out[0]
    return req(out, raw=True)


def jpeg(im, long_side, q=70):
    w, h = im.size
    s = long_side / max(w, h)
    if s < 1:
        im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
    b = io.BytesIO()
    im.convert('RGB').save(b, 'JPEG', quality=q, optimize=True)
    return b.getvalue()


def upload(path, data):
    req('%s/storage/v1/object/%s' % (URL, path), data,
        dict(AUTH, **{'Content-Type': 'image/jpeg', 'x-upsert': 'true'}), 'POST', raw=True)


def do_one(table, row_id, name, prompt):
    try:
        png = generate(prompt)
        im = Image.open(io.BytesIO(png))
        u = str(uuid.uuid4())
        full = '%s/%s/%s.jpg' % (HH, row_id, u)
        thumb = '%s/%s/%s_t.jpg' % (HH, row_id, u)
        fb, tb = jpeg(im, 1280), jpeg(im, 640)
        upload('item-photos/' + full, fb)
        upload('item-photos/' + thumb, tb)
        sb('PATCH', '/rest/v1/%s?id=eq.%s' % (table, row_id),
           {'photo_path': full, 'thumb_path': thumb})
        say('  ✅ %-22s 원본 %4dKB · 썸네일 %3dKB' % (name, len(fb) // 1024, len(tb) // 1024))
        return True
    except Exception as e:
        say('  ✗ %-22s %s' % (name, e))
        return False


# ── 실행 ────────────────────────────────────────────────────────────────
items = sb('GET', '/rest/v1/items?select=id,name&deleted_at=is.null')
cons = sb('GET', '/rest/v1/containers?select=id,name&deleted_at=is.null')
jobs = ([('items', r['id'], r['name'], ITEM_PROMPTS[r['name']]) for r in items
         if r['name'] in ITEM_PROMPTS]
        + [('containers', r['id'], r['name'], CONTAINER_PROMPTS[r['name']]) for r in cons
           if r['name'] in CONTAINER_PROMPTS])

only = sys.argv[1] if len(sys.argv) > 1 else None
if only == '--test':
    jobs = jobs[:1]
elif only == '--rest':
    jobs = [j for j in jobs if not (
        sb('GET', '/rest/v1/%s?select=thumb_path&id=eq.%s' % (j[0], j[1]))[0]['thumb_path'])]

say('대상 %d건' % len(jobs))
ok = sum(do_one(*j) for j in jobs)   # ⚠ 순차. 버스트 한도가 1이라 병렬은 전부 429 다
say('\n완료 %d / %d' % (ok, len(jobs)))
