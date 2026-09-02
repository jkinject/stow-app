"""미션 카드 디자인 시안 (gpt-image-2).

⚠ 이 그림은 **참고용**이다. 앱에는 컴포넌트로 다시 그린다 — 래스터를 박으면
  라이트/다크 전환도, 진행에 따른 상태 변화도 못 한다.
⚠ Replicate 는 크레딧이 $5 미만이면 분당 6회·동시 1회다. 순차로 돌린다.
"""
import json, os, sys, time, urllib.request, urllib.error

SP = os.path.dirname(os.path.abspath(__file__))
TOK = open(os.path.expanduser('~/.replicate_api_token')).read().strip()
MODEL = 'openai/gpt-image-2'

BASE = ('UI design mockup of a single daily-mission card for a mobile app, '
        'shown alone on a plain background, no phone frame, no other UI. '
        'The card has a small pill-shaped badge at the top center, and a row of five '
        'circular step stamps below it — the first two stamps are filled and marked done, '
        'the remaining three are empty and muted. A short title and one line of small helper text. '
        'Clean modern product design, generous padding, rounded corners, soft shadow, '
        'crisp vector-like rendering, no lorem text, no watermark.')

VARIANTS = [
    ('warm-stamp',
     'Warm and playful, like a coffee-shop stamp card. Cream card on a soft amber background, '
     'deep navy text, the completed stamps in a confident amber-orange with a check mark.'),
    ('dark-neon',
     'Dark mode. Deep charcoal-navy card on a near-black background, the completed stamps glowing '
     'in a vivid indigo-blue, empty stamps as thin grey outlines, white text, subtle inner glow.'),
    ('paper-tag',
     'Inspired by a paper storage label taped to a cardboard box. Off-white card with a thin ruled '
     'border, muted indigo accent, completed stamps look like inked rubber-stamp circles, '
     'quiet and typographic.'),
]

def req(url, data=None, headers=None, raw=False):
    r = urllib.request.Request(url, data, headers or {})
    try:
        b = urllib.request.urlopen(r, timeout=180).read()
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        if e.code == 429:
            raise TimeoutError(json.loads(body).get('retry_after', 10))
        raise RuntimeError(f'{e.code} {body[:300]}')
    return b if raw else json.loads(b)

hdr = {'Authorization': 'Bearer ' + TOK, 'Content-Type': 'application/json'}
for name, style in VARIANTS:
    out = os.path.join(SP, 'mission', name + '.png')
    if os.path.exists(out):
        print('  이미 있음:', name); continue
    body = json.dumps({'input': {
        'prompt': f'{BASE} Style: {style}',
        'aspect_ratio': '3:2', 'quality': 'high', 'output_format': 'png',
    }}).encode()
    p = None
    for _ in range(8):
        try:
            p = req(f'https://api.replicate.com/v1/models/{MODEL}/predictions', body, hdr); break
        except TimeoutError as t:
            time.sleep(float(t.args[0]) + 1)
    if p is None:
        print('  ✗', name, '429 반복'); continue
    pid = p['id']
    for _ in range(120):
        time.sleep(4)   # ⚠ 먼저 기다린다. 만들자마자 물으면 늘 starting 이다
        p = req('https://api.replicate.com/v1/predictions/' + pid, headers={'Authorization': 'Bearer ' + TOK})
        if p['status'] in ('succeeded', 'failed', 'canceled'): break
    if p['status'] != 'succeeded':
        print('  ✗', name, p['status'], str(p.get('error'))[:200]); continue
    url = p['output'][0] if isinstance(p['output'], list) else p['output']
    open(out, 'wb').write(req(url, raw=True))
    print('  ✅', name, os.path.getsize(out) // 1024, 'KB')
