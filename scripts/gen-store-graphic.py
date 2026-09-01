"""Play Store 등록용 에셋 생성.

⚠ 피처 그래픽은 1024×500 이 **정확히** 요구된다. 다르면 업로드가 거부된다.
⚠ 스크린샷은 세로 16:9~9:16 사이여야 한다. 기기 원본 1080×2520 은 그대로 통과한다.
"""

import os
import shutil

from PIL import Image, ImageDraw, ImageFont

# ⚠ 원본 경로는 인자로 받는다 (스크립트를 옮기면 상대경로가 곧바로 깨진다)
import sys
SP = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else None
ROOT = '/Users/tim/Documents/projects/home-store'
OUT = os.path.join(ROOT, 'docs/store')
SHOTS = os.path.join(OUT, 'screenshots')
os.makedirs(SHOTS, exist_ok=True)


def font(size, bold=True):
    """한글이 나오는 시스템 폰트를 고른다. 없으면 기본 폰트로 떨어진다."""
    candidates = [
        '/System/Library/Fonts/AppleSDGothicNeo.ttc',
        '/System/Library/Fonts/Supplemental/AppleGothic.ttf',
        '/Library/Fonts/AppleGothic.ttf',
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size, index=(10 if bold and p.endswith('.ttc') else 0))
            except Exception:
                try:
                    return ImageFont.truetype(p, size)
                except Exception:
                    pass
    return ImageFont.load_default()


# ── 피처 그래픽 1024×500 ──────────────────────────────────────────
W, H = 1024, 500
if not SRC or not os.path.exists(SRC):
    raise SystemExit('사용: python3 scripts/gen-store-graphic.py <히어로_원본.png>')
hero = Image.open(SRC).convert('RGB')

# 오른쪽 절반에 그림, 왼쪽에 글. 그림은 폭에 맞춰 자른다.
img_w = 470   # ⚠ 소스가 세로형으로 바뀌어 좁게 잡아야 선반이 온전히 들어간다
scale = max(img_w / hero.width, H / hero.height)
hs = hero.resize((round(hero.width * scale), round(hero.height * scale)), Image.LANCZOS)
left = (hs.width - img_w) // 2
top = max(0, (hs.height - H) // 4)          # 위쪽(선반)이 보이게 살짝 위로
hs = hs.crop((left, top, left + img_w, top + H))

canvas = Image.new('RGB', (W, H), '#0d0f16')
canvas.paste(hs, (W - img_w, 0))

# 그림 왼쪽 가장자리를 배경색으로 부드럽게 녹인다 — 딱 잘린 경계를 없앤다
fade_w = 200
px = canvas.load()
for x in range(fade_w):
    a = 1.0 - (x / fade_w)                   # 왼쪽일수록 배경색 비중이 높다
    gx = W - img_w + x
    for y in range(H):
        r, g, b = px[gx, y]
        px[gx, y] = (
            round(r * (1 - a) + 0x0d * a),
            round(g * (1 - a) + 0x0f * a),
            round(b * (1 - a) + 0x16 * a),
        )

d = ImageDraw.Draw(canvas)
d.text((64, 178), '어디뒀지', font=font(76), fill='#e8eaf2')
d.text((66, 286), '집 안 물건이 어디 있는지', font=font(30, False), fill='#a8afc4')
d.text((66, 330), '찾아주는 앱', font=font(30, False), fill='#a8afc4')
canvas.save(os.path.join(OUT, 'feature-graphic-1024x500.png'), optimize=True)
print('  feature-graphic-1024x500.png', canvas.size)

# 스크린샷은 mkshots.py 가 만든다 (Play 규격 1080×1920). 여기서는 만들지 않는다.
