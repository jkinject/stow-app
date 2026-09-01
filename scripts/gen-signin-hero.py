import base64
import io
import os

from PIL import Image

SP = os.path.dirname(os.path.abspath(__file__))
ROOT = '/Users/tim/Documents/projects/home-store'

im = Image.open(os.path.join(SP, 'hero_raw.png')).convert('RGB')
w, h = im.size
tw = 720   # ⚠ 세로형이라 같은 폭이면 픽셀이 는다. 배경이라 720 이면 충분하다
im2 = im.resize((tw, round(h * tw / w)), Image.LANCZOS)

buf = io.BytesIO()
im2.save(buf, 'JPEG', quality=80, optimize=True)  # progressive 는 켜지 않는다
raw = buf.getvalue()
b64 = base64.b64encode(raw).decode()

print('  jpeg %d bytes -> base64 %.1f KB' % (len(raw), len(b64) / 1024))
print('  size:', im2.size, 'ratio %.4f' % (im2.size[0] / im2.size[1]))

header = '''/**
 * 로그인 화면 배경 그림 — **base64 로 소스에 박아 둔다.**
 *
 * ⚠⚠ 왜 `require()` 로 안 쓰나. 그렇게 해 봤고, **안 됐다**(2026-09-01 실기기).
 *   · 에셋은 APK 안에 정상적으로 들어갔다 (`drawable/assets_images_signinhero`,
 *     리소스 테이블에도 있고 바이트 수도 정확히 일치)
 *   · `expo-image` 도, RN 기본 `Image` 도 **오류 한 줄 없이 빈 화면**만 그렸다
 *   · 같은 레이어 안의 SVG 그라데이션은 멀쩡히 그려졌다 → 레이아웃 문제가 아니다
 *   · 파일명 하이픈(`signin-hero` -> `signinhero`)도 원인이 아니었다
 *   · shrinkResources·minifyEnabled 는 둘 다 꺼져 있다
 *   빌드를 네 번 돌려도 원인을 못 찾아, **안드로이드 리소스 경로를 아예 거치지
 *   않는 길**을 택했다. data URI 는 그냥 JS 문자열이라 번들만 실리면 반드시 그려진다.
 *
 * 대가는 번들 크기다(아래 상수 하나가 약 {kb:.0f} KB). 그래서 860px·품질 80 으로
 * 줄여 담았다 — 화면 폭을 채우는 배경이고 아래로 흐려지므로 이 정도면 충분하다.
 *
 * ⚠ 손으로 고치지 말 것. 그림을 바꾸려면 원본을 다시 인코딩해 통째로 갈아끼운다.
 */

/** 원본 비율({w}x{h}). 그림을 바꾸면 이 값도 같이 바꿔야 한다 */
export const SIGNIN_HERO_RATIO = {w} / {h};

export const SIGNIN_HERO_URI =
  'data:image/jpeg;base64,'''.format(kb=len(b64) / 1024, w=im2.size[0], h=im2.size[1])

out = header + b64 + "';\n"
dst = os.path.join(ROOT, 'src/features/auth/heroImage.ts')
os.makedirs(os.path.dirname(dst), exist_ok=True)
with open(dst, 'w') as f:
    f.write(out)
print('  wrote', dst, len(out), 'bytes')
