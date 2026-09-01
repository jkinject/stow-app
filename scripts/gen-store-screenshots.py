"""Play Store 휴대전화 스크린샷 생성.

⚠ Play 규격: 각 변 320~3840px, **긴 변이 짧은 변의 2배를 넘으면 안 된다**(최대 2:1).
  기기 원본은 1080×2520 = 2.33 배라 **그대로 올리면 거부된다.**

  그렇다고 잘라서 2:1 을 맞추려면 탭바나 헤더가 날아간다. 그래서 9:16(1080×1920)
  캔버스에 줄여 앉히고, 남는 위쪽 공간에 캡션을 넣는다 — 여백을 버리는 대신
  "이 화면이 무엇인지" 를 말하게 한다. 스토어 목록은 어차피 작게 보여서
  캡션이 없으면 무슨 화면인지 알아보기 어렵다.
"""

import os

from PIL import Image, ImageDraw, ImageFont

SP = os.path.dirname(os.path.abspath(__file__))
OUT = '/Users/tim/Documents/projects/home-store/docs/store/screenshots'
os.makedirs(OUT, exist_ok=True)

W, H = 1080, 1920            # 9:16 — Play 권장 크기

# ⚠ 캔버스 배경을 앱 배경(#0d0f16)과 **같은 색으로 두면 안 된다.** 화면 경계가
#   사라져서 한 덩어리 검은 판으로 보이고, 둥근 모서리도 묻힌다. 실제로 그랬다.
#   앱보다 살짝 밝은 남색으로 깔고, 화면 둘레에 옅은 테두리를 둘러 기기처럼 읽히게 한다.
BG_TOP = (0x1c, 0x22, 0x3d)
BG_BOT = (0x0b, 0x0d, 0x14)
EDGE = (0x3a, 0x44, 0x6b)    # 화면 둘레 테두리
FG = (0xf2, 0xf4, 0xfa)
SUB = (0xb4, 0xbb, 0xd0)

FONT_PATH = '/System/Library/Fonts/AppleSDGothicNeo.ttc'


def font(size, weight):
    """AppleSDGothicNeo.ttc 는 굵기별 index 를 갖는다. 없으면 기본 폰트."""
    try:
        return ImageFont.truetype(FONT_PATH, size, index=weight)
    except Exception:
        try:
            return ImageFont.truetype(FONT_PATH, size)
        except Exception:
            return ImageFont.load_default()


def gradient():
    """위에서 아래로 어두워지는 배경. 평평한 단색보다 화면이 떠 보인다."""
    g = Image.new('RGB', (1, H))
    px = g.load()
    for y in range(H):
        t = y / (H - 1)
        px[0, y] = tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOT))
    return g.resize((W, H), Image.BILINEAR)


def framed(im, r):
    """둥근 모서리 + 옅은 테두리. ⚠ 알파를 남기지 않는다 — Play 는 알파 PNG 를 거부한다."""
    pad = 3
    out = Image.new('RGB', (im.width + pad * 2, im.height + pad * 2), EDGE)
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.width - 1, im.height - 1], r, fill=255)
    base = Image.new('RGB', im.size, EDGE)
    base.paste(im, (0, 0), mask)
    out.paste(base, (pad, pad))
    # 바깥 모서리도 둥글게 — 배경 위에 얹을 때 각진 테두리가 남지 않게
    om = Image.new('L', out.size, 0)
    ImageDraw.Draw(om).rounded_rectangle([0, 0, out.width - 1, out.height - 1], r + pad, fill=255)
    return out, om


def center(d, text, y, f, fill):
    w = d.textbbox((0, 0), text, font=f)[2]
    d.text(((W - w) // 2, y), text, font=f, fill=fill)


SHOTS = [
    ('t1.png', '그거 어디 뒀더라?', '이제 온 집을 뒤지지 않아도 됩니다'),
    ('t5.png', '이름만 검색하면 끝', '초성으로도 찾아집니다'),
    ('d2.png', '수량까지 함께 기억', '다 떨어지기 전에 알려줍니다'),
    ('fam2.png', '가족이 함께 씁니다', '초대 코드 하나면 됩니다'),
    ('c1.png', '카테고리로 묶어서', '약·공구·아이 물건처럼'),
]

TITLE = font(62, 12)   # Bold
SUBF = font(34, 10)    # Regular

for i, (src, title, sub) in enumerate(SHOTS, 1):
    p = os.path.join(SP, src)
    if not os.path.exists(p):
        print('  건너뜀(원본 없음):', src)
        continue

    shot = Image.open(p).convert('RGB')

    canvas = gradient()
    d = ImageDraw.Draw(canvas)
    center(d, title, 96, TITLE, FG)
    center(d, sub, 190, SUBF, SUB)

    # 남는 공간에 화면을 앉힌다 (아래는 살짝 잘려 나가도 되게 여유를 둔다)
    top = 288
    avail_h = H - top - 40
    scale = avail_h / shot.height
    sw, sh = round(shot.width * scale), round(shot.height * scale)
    dev, devmask = framed(shot.resize((sw, sh), Image.LANCZOS), 30)
    canvas.paste(dev, ((W - dev.width) // 2, top), devmask)

    dst = os.path.join(OUT, f'{i:02d}-{src.split(".")[0]}.png')
    canvas.save(dst, optimize=True)
    ratio = max(canvas.size) / min(canvas.size)
    print(f'  {os.path.basename(dst):22} {canvas.size} 비율 {ratio:.2f} '
          f'{os.path.getsize(dst)//1024}KB')
