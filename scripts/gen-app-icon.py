"""앱 아이콘 생성 — 시안 하나에서 필요한 파일 전부를 만든다.

    python3 scripts/gen-app-icon.py <시안.png> [배경색#RRGGBB]

⚠⚠ 안드로이드 적응형 아이콘은 **잘린다.** 런처가 원·사각·물방울 등 제 모양으로
   마스크를 씌우고, 화면 전환 때 살짝 확대·이동까지 한다. 가운데 66% 안에 든 것만
   반드시 보인다고 보장된다. 시안을 그대로 넣으면 가장자리가 잘려 나간다 —
   그래서 배경을 떼고, 그림만 **60% 로 줄여** 가운데 놓는다.

⚠ 배경을 색으로 지우므로 **시안의 배경이 단색**이어야 한다. 그라데이션이면 얼룩이
   남는다. 지우기 전에 실제 색을 재서 쓴다(모서리 픽셀).

⚠ 경계를 딱 잘라내면 톱니가 남는다. 색 거리로 부드럽게 알파를 매긴다.

만드는 것:
  assets/images/icon.png                    iOS·일반 (정사각, 여백 포함)
  assets/images/android-icon-foreground.png 적응형 앞면 (투명, 안전영역 안)
  assets/images/android-icon-background.png 적응형 뒷면 (단색)
  assets/images/android-icon-monochrome.png 테마 아이콘 (실루엣)
  assets/images/splash-icon.png             스플래시 (투명)
  docs/store/icon-512.png                   Play 등록용 512x512
"""

import os
import sys

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SRC = sys.argv[1] if len(sys.argv) > 1 else None
if not SRC or not os.path.exists(SRC):
    print(__doc__)
    sys.exit(1)

S = 1024


def cut_background(im, bg=None, tol=26, feather=1.2):
    """단색 배경을 알파로 지운다. 색 거리 tol 안쪽은 완전 투명, 바깥은 서서히 불투명."""
    im = im.convert('RGB')
    w, h = im.size
    if bg is None:
        bg = im.getpixel((3, 3))
    px = im.load()
    mask = Image.new('L', (w, h))
    mp = mask.load()
    hard = tol
    soft = tol * 2.2  # 이 거리부터는 완전히 그림으로 본다
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            d = ((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2) ** 0.5
            if d <= hard:
                mp[x, y] = 0
            elif d >= soft:
                mp[x, y] = 255
            else:
                mp[x, y] = int(255 * (d - hard) / (soft - hard))
    mask = mask.filter(ImageFilter.GaussianBlur(feather))
    out = im.convert('RGBA')
    out.putalpha(mask)
    return out, bg


def place(subject, canvas_size, frac, bg_rgba=(0, 0, 0, 0)):
    """그림을 캔버스의 frac 비율로 줄여 가운데 놓는다."""
    box = subject.getbbox()
    sub = subject.crop(box) if box else subject
    target = int(canvas_size * frac)
    sw, sh = sub.size
    sc = target / max(sw, sh)
    sub = sub.resize((max(1, round(sw * sc)), max(1, round(sh * sc))), Image.LANCZOS)
    out = Image.new('RGBA', (canvas_size, canvas_size), bg_rgba)
    out.alpha_composite(sub, ((canvas_size - sub.width) // 2, (canvas_size - sub.height) // 2))
    return out


src = Image.open(SRC)
subject, detected = cut_background(src.resize((S, S), Image.LANCZOS))

arg_bg = sys.argv[2] if len(sys.argv) > 2 else None
if arg_bg:
    h = arg_bg.lstrip('#')
    BG = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
else:
    BG = detected
print(f'· 원본 {SRC}')
print(f'· 배경색 #{BG[0]:02X}{BG[1]:02X}{BG[2]:02X}' + ('' if arg_bg else ' (시안에서 잰 값)'))

A = os.path.join(ROOT, 'assets/images')
os.makedirs(A, exist_ok=True)
os.makedirs(os.path.join(ROOT, 'docs/store'), exist_ok=True)


def save(img, rel, mode='RGBA'):
    p = os.path.join(ROOT, rel)
    img.convert(mode).save(p, optimize=True)
    print(f'  {rel:44} {img.size} {mode}')


# ⚠ 적응형 앞면은 **60%** 다. 66% 가 보장 영역이지만 전환 애니메이션에서 살짝
#   확대되므로 여유를 둔다. 핀이 위로 튀어나와 세로가 더 길다는 점도 감안했다.
fg = place(subject, S, 0.60)
save(fg, 'assets/images/android-icon-foreground.png')

save(Image.new('RGBA', (S, S), BG + (255,)), 'assets/images/android-icon-background.png', 'RGB')

# 테마 아이콘: 색을 버리고 실루엣만. 런처가 알아서 한 가지 색으로 칠한다.
mono = Image.new('RGBA', (S, S), (0, 0, 0, 0))
white = Image.new('RGBA', fg.size, (255, 255, 255, 255))
white.putalpha(fg.getchannel('A'))
mono.alpha_composite(white)
save(mono, 'assets/images/android-icon-monochrome.png')

# iOS·일반 아이콘은 잘리지 않는다. 여백만 조금 두고 꽉 채운다.
icon = place(subject, S, 0.78, BG + (255,))
save(icon, 'assets/images/icon.png', 'RGB')
save(icon.resize((512, 512), Image.LANCZOS), 'docs/store/icon-512.png', 'RGB')

# 스플래시는 배경을 앱이 칠한다 — 그림만 투명으로.
save(place(subject, S, 0.55), 'assets/images/splash-icon.png')
