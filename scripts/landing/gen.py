# 랜딩 페이지 생성기 — getflect.app 문법(안개 그라디언트·그레인·이탤릭 세리프 강조·라운드 패널)을 Stow 에 맞춰 쓴다.
# 영어/한국어는 같은 뼈대에 문구만 다르다. 실행: python3 scripts/landing/gen.py .  → docs/index.html, docs/ko/index.html 을 다시 쓴다.
import sys, os
ROOT = sys.argv[1]
PLAY = 'https://play.google.com/store/apps/details?id=net.jangstar.stow'
BASE = 'https://jkinject.github.io/stow-app/'
GSV = '<meta name="google-site-verification" content="K4lu8mos72T_vt28bGPbaz6qlm2qfO47-Oh6_fT6Rf0" />'

CSS = r'''
:root{--ink:#241d1e;--ink-2:#5a5153;--ink-3:#8a8184;--line:#e6e2dd;--paper:#fff;--mint:#eef3ef;--blue:#e6ecf3;--cream:#fbf5ea;--night:#141a30;--accent:#2b3fd6;--r:46px}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;font-size:18px;line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit;text-decoration:none}img{display:block;max-width:100%}
em,.serif{font-family:"Instrument Serif",Georgia,"Times New Roman",serif;font-style:italic;font-weight:400}
h1,h2,h3{margin:0;font-weight:500;letter-spacing:-.03em}
h1{font-size:clamp(38px,5.2vw,74px);line-height:1.06}
h2{font-size:clamp(32px,3.6vw,52px);line-height:1.1}
h3{font-size:clamp(24px,2.2vw,32px);line-height:1.2}
p{margin:0}
.wrap{width:min(1180px,calc(100% - 48px));margin:0 auto}
.narrow{width:min(720px,100%);margin:0 auto;text-align:center}
.eyebrow{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);font-weight:500}
.num{font-family:"Instrument Serif",serif;font-style:italic;font-size:22px;color:var(--ink-3);letter-spacing:.06em}
.pill{display:inline-flex;align-items:center;gap:10px;background:var(--ink);color:#fff;padding:16px 26px;border-radius:999px;font-weight:500;font-size:17px;transition:transform .2s,background .2s}
.pill:hover{background:#000;transform:translateY(-1px)}
.pill .arr{transition:transform .2s}.pill:hover .arr{transform:translateX(3px)}
.pill.light{background:#fff;color:var(--ink)}.pill.light:hover{background:var(--cream)}
.note{font-size:14px;color:var(--ink-3)}
/* 그레인 — 레퍼런스의 종이 질감. 사진처럼 보이지 않게 아주 옅게 */
.grain{position:relative;isolation:isolate}
.grain::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;opacity:.28;mix-blend-mode:multiply;border-radius:inherit;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
.grain>*{position:relative;z-index:1}
/* nav */
nav{display:flex;align-items:center;justify-content:space-between;height:84px}
.brand{display:flex;align-items:center;gap:10px;font-weight:600;font-size:22px;letter-spacing:-.02em}
.brand i{width:28px;height:28px;border-radius:9px;background:var(--accent);display:inline-block;position:relative}
.brand i::after{content:"";position:absolute;inset:8px 7px 7px;border:2px solid #fff;border-radius:4px;border-top-width:3px}
.links{display:flex;gap:28px;font-size:15px;color:var(--ink-2)}.links a:hover{color:var(--ink)}
/* hero — 안개 그라디언트 */
.hero{position:relative;padding:70px 0 90px;text-align:center}
.hero::before{content:"";position:absolute;inset:-84px -20vw 0;z-index:-1;background:
 radial-gradient(60% 55% at 50% 0%,#eef3d3 0%,rgba(238,243,211,0) 70%),
 radial-gradient(45% 40% at 20% 20%,#f8f1dc 0%,rgba(248,241,220,0) 70%),
 radial-gradient(45% 40% at 80% 15%,#e9f1e4 0%,rgba(233,241,228,0) 70%)}
.hero h1{max-width:860px;margin:0 auto 26px}
.hero .lead{max-width:560px;margin:0 auto 34px;color:var(--ink-2);font-size:19px}
.hero .cta{display:flex;flex-direction:column;align-items:center;gap:14px}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:64px;text-align:left}
.card{border-radius:32px;overflow:hidden;aspect-ratio:1/1;position:relative;background:#eee}
.card img.ph{width:100%;height:100%;object-fit:cover}
.card.device{background:radial-gradient(70% 70% at 30% 20%,#f4f0d8 0%,#e3ecd9 45%,#d5e0d2 100%);display:flex;justify-content:center;align-items:flex-end;padding:56px 56px 0}
.phone{width:min(330px,72%);border-radius:44px 44px 0 0;background:#111420;padding:11px 11px 0;box-shadow:0 30px 60px rgba(20,24,40,.25)}
.phone .scr{border-radius:34px 34px 0 0;overflow:hidden;aspect-ratio:1206/1500;background:#f4f5fa}
.phone .scr img{width:100%;height:auto}
/* rounded panels */
.panel{border-radius:var(--r);padding:110px 24px;margin:20px auto 0;width:min(1400px,calc(100% - 20px))}
.panel.mint{background:var(--mint)}.panel.blue{background:var(--blue)}.panel.cream{background:var(--cream)}
.panel h2{margin-bottom:26px}
.panel .body{max-width:640px;margin:0 auto;color:var(--ink-2);text-align:center;font-size:19px}
.big{width:min(560px,100%);margin:64px auto;border-radius:32px;overflow:hidden;aspect-ratio:1/1;background:#ddd}
.big img{width:100%;height:100%;object-fit:cover}
.statement{max-width:760px;margin:0 auto;text-align:center}
/* how */
.section{padding:120px 0}
.section .head{max-width:680px;margin:0 auto 90px;text-align:center}
.section .head p{color:var(--ink-2);margin-top:22px;font-size:19px}
.step{display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:center;padding:60px 0}
.step:nth-child(even) .step-copy{order:2}
.step-copy{max-width:420px}.step-copy .num{display:block;margin:14px 0 22px}.step-copy p{color:var(--ink-2)}
.step-art{border-radius:32px;overflow:hidden;background:var(--cream);display:flex;justify-content:center;align-items:flex-end;padding:48px 48px 0;aspect-ratio:1/1}
.step:nth-child(2) .step-art{background:var(--blue)}.step:nth-child(3) .step-art{background:var(--mint)}
/* benefits */
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.tile{border:1px solid var(--line);border-radius:26px;padding:30px 28px 34px;min-height:260px;display:flex;flex-direction:column;justify-content:space-between;background:#fff}
.tile .num{font-size:19px}.tile h3{font-size:22px;margin:22px 0 10px}.tile p{color:var(--ink-2);font-size:16px}
/* compare */
.compare{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.col{border-radius:32px;padding:44px 42px}
.col.no{background:#f5f2ee}.col.yes{background:var(--night);color:#fff}
.col h3{margin-bottom:28px}.col ul{list-style:none;margin:0;padding:0}.col li{padding:16px 0;border-top:1px solid rgba(0,0,0,.08);font-size:18px}
.col.yes li{border-top-color:rgba(255,255,255,.14)}
.col.no li{color:var(--ink-2)}
/* household panel */
.house{display:grid;grid-template-columns:1.1fr .9fr;gap:60px;align-items:center;width:min(1080px,100%);margin:0 auto}
.house .body{text-align:left;margin:0;max-width:480px}
.invite{background:#fff;border-radius:26px;padding:30px;box-shadow:0 20px 50px rgba(30,40,60,.10);width:min(420px,100%);margin:0 auto}
.invite .row{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px}
.avs{display:flex}.avs span{width:32px;height:32px;border-radius:50%;background:var(--cream);border:2px solid #fff;margin-left:-8px;display:grid;place-items:center;font-size:12px;font-weight:600;color:var(--ink-2)}
.code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:34px;letter-spacing:.32em;background:#f4f5fa;border-radius:16px;padding:18px 0 18px 10px;text-align:center;color:var(--accent);font-weight:600}
/* faq */
.faq{width:min(760px,100%);margin:0 auto}
details{border-top:1px solid var(--line)}details:last-child{border-bottom:1px solid var(--line)}
summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:20px;padding:24px 0;font-size:20px;font-weight:500}
summary::-webkit-details-marker{display:none}summary::after{content:"+";color:var(--ink-3);font-size:26px;font-weight:300}
details[open] summary::after{content:"–"}details p{color:var(--ink-2);padding-bottom:26px;max-width:620px}
/* final */
.final{border-radius:var(--r) var(--r) 0 0;background:var(--night);color:#fff;padding:130px 24px 60px;margin-top:40px;text-align:center;position:relative;overflow:hidden}
.final::before{content:"";position:absolute;inset:0;background:radial-gradient(55% 45% at 50% 0%,rgba(122,140,255,.35),rgba(122,140,255,0) 70%)}
.final h2{font-size:clamp(40px,5vw,68px);margin-bottom:22px}
.final .body{max-width:520px;margin:0 auto 36px;color:rgba(255,255,255,.72);font-size:19px}
.final .serif{color:#c9d0ff}
footer{margin-top:120px;display:flex;justify-content:space-between;align-items:flex-start;gap:40px;text-align:left;color:rgba(255,255,255,.62);font-size:14px;flex-wrap:wrap}
footer .cols{display:flex;gap:64px}footer .cols b{display:block;color:#fff;margin-bottom:12px;font-weight:500}footer .cols a{display:block;margin-bottom:9px}footer .cols a:hover{color:#fff}
.copy{margin-top:60px;color:rgba(255,255,255,.4);font-size:13px;text-align:left}
/* reveal */
.rv{opacity:0;transform:translateY(22px);transition:opacity .8s ease,transform .8s ease}.rv.in{opacity:1;transform:none}
html[lang="ko"] em,html[lang="ko"] .serif{font-family:"Noto Serif KR","Apple SD Gothic Neo",serif;font-style:normal;font-weight:500}
html[lang="ko"] .num{font-style:italic}
html[lang="ko"] h1,html[lang="ko"] h2,html[lang="ko"] h3{letter-spacing:-.02em;word-break:keep-all}
html[lang="ko"] p{word-break:keep-all}
@media(max-width:820px){
 body{font-size:17px}.wrap{width:calc(100% - 32px)}.links{gap:16px;font-size:14px}.links .hide-m{display:none}
 .hero{padding:40px 0 60px}.cards{grid-template-columns:1fr;gap:14px;margin-top:40px}.card.device{padding:36px 36px 0}
 .panel{padding:70px 18px;width:calc(100% - 12px);border-radius:32px}.big{margin:40px auto}
 .section{padding:80px 0}.section .head{margin-bottom:40px}
 .step{grid-template-columns:1fr;gap:26px;padding:30px 0}.step:nth-child(even) .step-copy{order:0}.step-art{padding:32px 32px 0}
 .grid4{grid-template-columns:1fr 1fr;gap:12px}.tile{min-height:0;padding:22px 20px 24px}
 .compare{grid-template-columns:1fr}.col{padding:30px 26px}
 .house{grid-template-columns:1fr;gap:34px}.house .body{text-align:center;margin:0 auto}
 .final{padding:90px 18px 40px;border-radius:32px 32px 0 0}footer{margin-top:70px}footer .cols{gap:32px;flex-wrap:wrap}
}
'''

JS = r'''
document.addEventListener('DOMContentLoaded',()=>{const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12});document.querySelectorAll('.rv').forEach(el=>io.observe(el))});
'''

def page(T, lang, prefix):
    """T: 문구 사전. prefix: 자산 경로 접두어('./' 또는 '../'). 스크린샷 폴더는 언어별."""
    shots = f'{prefix}site/' + ('ko/' if lang == 'ko' else '')
    alt = lang == 'en'
    other = ('./ko/', '한국어') if lang == 'en' else ('../', 'English')
    canon = BASE if lang == 'en' else BASE + 'ko/'
    faq_ld = ',\n    '.join(
        '{"@type":"Question","name":%s,"acceptedAnswer":{"@type":"Answer","text":%s}}' % (jsq(q), jsq(a))
        for q, a in T['faq'])
    steps = ''.join(f'''
      <div class="step rv">
        <div class="step-copy"><h3>{h}</h3><span class="num">( 0{i} )</span><p>{p}</p></div>
        <div class="step-art"><div class="phone"><div class="scr"><img src="{shots}0{n}.png" alt="{a}" width="540" height="1049" loading="lazy" /></div></div></div>
      </div>''' for i, (h, p, n, a) in enumerate(T['steps'], 1))
    tiles = ''.join(f'<div class="tile rv"><span class="num">( 0{i} )</span><div><h3>{h}</h3><p>{p}</p></div></div>'
                    for i, (h, p) in enumerate(T['tiles'], 1))
    no = ''.join(f'<li>{x}</li>' for x in T['instead'])
    yes = ''.join(f'<li>{x}</li>' for x in T['gives'])
    faq = ''.join(f'<details><summary>{q}</summary><p>{a}</p></details>' for q, a in T['faq'])
    return f'''<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{T['title']}</title>
<meta name="description" content="{T['desc']}" />
{GSV}
<link rel="canonical" href="{canon}" />
<link rel="alternate" hreflang="en" href="{BASE}" />
<link rel="alternate" hreflang="ko" href="{BASE}ko/" />
<link rel="alternate" hreflang="x-default" href="{BASE}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="{T['og_title']}" />
<meta property="og:description" content="{T['og_desc']}" />
<meta property="og:url" content="{canon}" />
<meta property="og:image" content="{BASE}store/feature-graphic-1024x500.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="{prefix}store/icon-512.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&display=swap" />
{'<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;600&display=swap" />' if lang == 'ko' else ''}
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "{T['app_name']}",
  "alternateName": "{T['app_alt']}",
  "operatingSystem": "Android",
  "applicationCategory": "LifestyleApplication",
  "description": {jsq(T['desc'])},
  "offers": {{ "@type": "Offer", "price": "0", "priceCurrency": "{'USD' if lang=='en' else 'KRW'}" }},
  "installUrl": "{PLAY}",
  "url": "{canon}",
  "image": "{BASE}store/icon-512.png",
  "screenshot": ["{BASE}site/{'ko/' if lang=='ko' else ''}01.png","{BASE}site/{'ko/' if lang=='ko' else ''}02.png","{BASE}site/{'ko/' if lang=='ko' else ''}03.png"],
  "inLanguage": ["en", "ko"]
}}
</script>
<script type="application/ld+json">
{{ "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
    {faq_ld}
] }}
</script>
<style>{CSS}</style>
</head>
<body>
<header class="wrap">
  <nav aria-label="{T['nav_label']}">
    <a class="brand" href="./"><i></i>{T['brand']}</a>
    <div class="links">
      <a class="hide-m" href="#how">{T['nav_how']}</a>
      <a class="hide-m" href="#family">{T['nav_family']}</a>
      <a class="hide-m" href="#faq">{T['nav_faq']}</a>
      <a href="{other[0]}" hreflang="{'ko' if lang=='en' else 'en'}">{other[1]}</a>
      <a href="{PLAY}">Google Play</a>
    </div>
  </nav>
</header>

<main>
  <section class="hero wrap">
    <p class="eyebrow" style="margin-bottom:26px">{T['hero_eyebrow']}</p>
    <h1>{T['h1']}</h1>
    <p class="lead">{T['lead']}</p>
    <div class="cta">
      <a class="pill" href="{PLAY}">{T['cta']} <span class="arr">→</span></a>
      <span class="note">{T['trust']}</span>
    </div>
    <div class="cards">
      <div class="card rv"><img class="ph" src="{prefix}site/photo-closet.jpg" alt="{T['alt_closet']}" width="1200" height="1200" /></div>
      <div class="card device rv"><div class="phone"><div class="scr"><img src="{shots}01.png" alt="{T['alt_search']}" width="540" height="1049" /></div></div></div>
    </div>
  </section>

  <section class="panel mint grain">
    <div class="narrow rv">
      <h2>{T['p1_h']}</h2>
      <p class="body">{T['p1_body']}</p>
    </div>
    <div class="big rv"><img src="{prefix}site/photo-blanket.jpg" alt="{T['alt_blanket']}" width="1200" height="1200" loading="lazy" /></div>
    <h2 class="statement rv">{T['p1_statement']}</h2>
  </section>

  <section class="section wrap" id="how">
    <div class="head rv"><h2>{T['how_h']}</h2><p>{T['how_p']}</p></div>
    {steps}
  </section>

  <section class="section wrap" style="padding-top:0">
    <div class="head rv"><p class="eyebrow" style="margin-bottom:22px">{T['ben_eyebrow']}</p><h2>{T['ben_h']}</h2><p>{T['ben_p']}</p></div>
    <div class="grid4">{tiles}</div>
  </section>

  <section class="section wrap" style="padding-top:0">
    <div class="compare">
      <div class="col no rv"><h3>{T['instead_h']}</h3><ul>{no}</ul></div>
      <div class="col yes rv"><h3>{T['gives_h']}</h3><ul>{yes}</ul></div>
    </div>
  </section>

  <section class="panel blue grain" id="family">
    <div class="house">
      <div class="rv">
        <p class="eyebrow" style="margin-bottom:22px">{T['fam_eyebrow']}</p>
        <h2>{T['fam_h']}</h2>
        <p class="body">{T['fam_p']}</p>
      </div>
      <div class="invite rv">
        <div class="row"><b>{T['inv_title']}</b><div class="avs"><span>{T['av'][0]}</span><span>{T['av'][1]}</span><span>{T['av'][2]}</span></div></div>
        <p class="note" style="margin-bottom:10px">{T['inv_label']}</p>
        <div class="code">STOW24</div>
        <p class="note" style="margin-top:14px">{T['inv_note']}</p>
      </div>
    </div>
  </section>

  <section class="section wrap" id="faq">
    <div class="head rv"><h2>{T['faq_h']}</h2></div>
    <div class="faq rv">{faq}</div>
  </section>
</main>

<section class="final grain">
  <div class="rv">
    <h2>{T['final_h']}</h2>
    <p class="body">{T['final_p']}</p>
    <a class="pill light" href="{PLAY}">{T['cta']} <span class="arr">→</span></a>
  </div>
  <footer class="wrap">
    <div><a class="brand" href="./" style="color:#fff"><i></i>{T['brand']}</a><p style="margin-top:14px;max-width:260px">{T['foot_tag']}</p></div>
    <div class="cols">
      <div><b>{T['foot_product']}</b><a href="#how">{T['nav_how']}</a><a href="#family">{T['nav_family']}</a><a href="#faq">{T['nav_faq']}</a><a href="{PLAY}">Google Play</a></div>
      <div><b>{T['foot_legal']}</b><a href="{T['privacy_href']}">{T['privacy']}</a><a href="{T['delete_href']}">{T['delete']}</a><a href="mailto:jkinject@gmail.com">{T['contact']}</a></div>
      <div><b>{T['foot_lang']}</b><a href="{'./' if lang=='en' else '../'}">English</a><a href="{'./ko/' if lang=='en' else './'}">한국어</a></div>
    </div>
  </footer>
  <p class="copy wrap">© 2026 Stow · 어디뒀지. {T['copy']}</p>
</section>
<script>{JS}</script>
</body>
</html>
'''

def jsq(s):
    import json; return json.dumps(s, ensure_ascii=False)

EN = dict(
    title='Stow – Find what you put away | Home item finder app for Android',
    desc="Where did I put that? Stow is not an organizing app. It's a memory for your house: snap a photo when you put something away, search by name later, and Stow tells you the room and the box. Free on Google Play.",
    og_title='Stow – You didn’t lose it. You just forgot where.', og_desc='Not an organizing app. A memory for your house: snap it, name it, find it later.',
    app_name='Stow', app_alt='어디뒀지', nav_label='Main navigation', brand='Stow', nav_how='How it works', nav_family='Family', nav_faq='FAQ',
    hero_eyebrow='Free on Android',
    h1='You didn’t lose it.<br>You just forgot <em>where</em>.',
    lead='Stow is not an organizing app. It’s a <em>memory for your house</em>. Snap it when you put it away, search it when you need it back.',
    cta='Get it on Google Play', trust='Free · No ads · No trackers',
    alt_closet='A grey storage bin on the top shelf of a bedroom closet', alt_search='Stow search results for “winter”: Winter Blanket in Bedroom › Top Shelf Bin', alt_blanket='A vacuum-sealed winter blanket on a closet shelf',
    p1_h='Finding is a <em>habit</em>', p1_body='You bought the boxes. You labeled the shelves. And still, six months later, nobody remembers where the winter blanket went. Tidying was never the problem. <em>Remembering</em> was.',
    p1_statement='Everything you put away can be <em>found</em> in one search.',
    how_h='How Stow works', how_p='Stow keeps the one thing every organizing system forgets: where it actually went. Three moves, ten seconds each.',
    steps=[('Snap it as you stow it', 'Take a photo, type a name, pick the place and the box. That’s the whole ritual.', 2, 'Item detail with photo, location path and quantity'),
           ('Search when you need it', 'Type part of the name. Stow shows the photo, the room and the box — no mental retracing.', 1, 'Search results showing room and box for each item'),
           ('Scan the box, skip the digging', 'Print QR labels, 21 per A4 sheet. Scan one and that box opens on your phone.', 3, 'Box detail listing everything inside')],
    ben_eyebrow='A little memory, everywhere', ben_h='For the things you’ll need. <em>Eventually.</em>', ben_p='From spare cables to the good scissors.',
    tiles=[('Your home, mapped', 'Places hold boxes, boxes hold things. Loose items are fine too.'),
           ('Know before it expires', 'Add a date to food or medicine and Stow reminds you first.'),
           ('Runs out? It’s on the list', 'The moment an item hits zero it lands on your shopping list.'),
           ('Thirty days to undo', 'Deleted by accident? It waits in Trash for a month.')],
    instead_h='Instead of', instead=['Buying more matching boxes', 'Labeling everything twice', 'Asking the family group chat', 'Opening every box in the closet', 'A spreadsheet nobody updates'],
    gives_h='Stow gives', gives=['One search that answers <em>where</em>', 'A photo you took in ten seconds', 'One shared home, every change logged', 'A QR label that opens the box', 'A memory that keeps itself'],
    fam_eyebrow='A shared home, a shared memory', fam_h='You shouldn’t have to be the <em>family search engine</em>.',
    fam_p='One invite code brings everyone into the same home. Everyone sees the same boxes, every move is logged, and an office or a storage unit can be its own space.',
    inv_title='Our home', av=['J', 'A', 'M'], inv_label='One code. Everyone’s invited.', inv_note='Example invite code · Same home, same answers',
    faq_h='A few things <em>worth knowing</em>',
    faq=[('Is Stow really free?', 'Yes. No ads, no subscription, no analytics trackers. Photos and lists are visible only to the members of your home.'),
         ('Do I have to catalog my whole house?', 'No. Start with the things you actually lose: seasonal clothes, cables, documents, medicine. Add more whenever you put something away.'),
         ('Can my family use the same home?', 'Yes. One invite code brings everyone into the same home. Every change is logged so you can see who moved what.'),
         ('Do I need QR labels to use Stow?', 'No. Search works without them. Labels are optional: print 21 per A4 sheet, stick them on boxes, and scanning one opens that box’s contents.'),
         ('Is there an iPhone version?', 'Not yet. Stow is on Android today; iOS is planned.')],
    final_h='Start <span class="serif">remembering</span>.', final_p='Free on Google Play. No ads, no trackers, no subscription. Just a house that remembers where things went.',
    foot_tag='A memory for your house.', foot_product='Product', foot_legal='Legal', foot_lang='Language',
    privacy='Privacy Policy', privacy_href='./privacy/en/', delete='Delete account', delete_href='./delete-account/en/', contact='Contact',
    copy='Less “where is it?” More “found it.”',
)

KO = dict(
    title='어디뒀지 (Stow) – 그거 어디 뒀더라? 집 안 물건 찾기 앱',
    desc='어디뒀지는 정리 앱이 아닙니다. 집의 기억입니다. 넣을 때 사진 한 장, 찾을 때 이름 한 번 — 어느 방 어느 박스인지 바로 알려줍니다. 박스 QR 라벨, 가족 공유. Google Play 무료.',
    og_title='어디뒀지 – 잃어버린 게 아니라, 어디 뒀는지 잊은 것뿐.', og_desc='정리 앱이 아닙니다. 집의 기억입니다. 넣을 때 사진 한 장, 찾을 때 이름 한 번.',
    app_name='어디뒀지', app_alt='Stow', nav_label='주 메뉴', brand='어디뒀지', nav_how='이렇게 씁니다', nav_family='가족', nav_faq='자주 묻는 질문',
    hero_eyebrow='Android · 무료',
    h1='잃어버린 게 아닙니다.<br><em>어디</em> 뒀는지 잊은 것뿐.',
    lead='어디뒀지는 정리 앱이 아닙니다. <em>집의 기억</em>입니다. 넣을 때 사진 한 장, 찾을 때 이름 한 번.',
    cta='Google Play에서 받기', trust='무료 · 광고 없음 · 추적기 없음',
    alt_closet='안방 옷장 위 칸의 회색 수납함', alt_search='어디뒀지 검색 결과: 겨울 이불 — 안방 › 옷장 위 칸', alt_blanket='옷장 선반 위 압축팩에 든 겨울 이불',
    p1_h='찾는 것도 <em>습관</em>입니다', p1_body='수납함도 샀고, 선반에 라벨도 붙였습니다. 그런데 반년 뒤, 겨울 이불이 어디 갔는지는 아무도 모릅니다. 문제는 정리가 아니었습니다. <em>기억</em>이었습니다.',
    p1_statement='넣어 둔 모든 것은 검색 한 번으로 <em>찾을</em> 수 있습니다.',
    how_h='이렇게 씁니다', how_p='정리 시스템이 늘 빠뜨리는 한 가지, "실제로 어디 들어갔는지"를 어디뒀지가 대신 기억합니다. 세 동작, 각각 10초.',
    steps=[('넣으면서 사진 한 장', '사진 찍고, 이름 적고, 장소와 박스를 고르면 끝. 그게 전부입니다.', 2, '물건 상세: 사진, 위치 경로, 수량'),
           ('필요할 때 이름만 검색', '이름 일부만 쳐도 됩니다. 초성도 됩니다. 사진과 방, 박스가 바로 나옵니다.', 1, '검색 결과: 물건마다 방과 박스 표시'),
           ('박스는 열지 말고 스캔', 'QR 라벨을 A4 한 장에 21개 인쇄해 붙이세요. 스캔하면 그 박스가 폰에서 열립니다.', 3, '박스 상세: 안에 든 물건 목록')],
    ben_eyebrow='작은 기억, 집 안 어디에나', ben_h='언젠가는 꼭 필요한 <em>그 물건들</em>을 위해.', ben_p='여분 케이블부터 잘 드는 가위까지.',
    tiles=[('우리 집 구조 그대로', '장소 안에 박스, 박스 안에 물건. 박스 없이 두는 물건도 됩니다.'),
           ('소비기한 전에 알림', '식품이나 약에 날짜를 적어 두면 기한 전에 먼저 알려줍니다.'),
           ('다 떨어지면 살 것 목록으로', '수량이 0이 되는 순간 살 것 목록에 자동으로 올라갑니다.'),
           ('30일 안에 복구', '실수로 지웠나요? 휴지통에 한 달 동안 남아 있습니다.')],
    instead_h='이제까지는', instead=['같은 모양 수납함을 더 사고', '라벨을 두 번씩 붙이고', '가족 단톡방에 물어보고', '옷장 박스를 전부 열어 보고', '아무도 안 고치는 스프레드시트'],
    gives_h='어디뒀지는', gives=['<em>어디</em>라고 답해 주는 검색 한 번', '10초 만에 찍어 둔 사진 한 장', '가족이 같이 보는 집, 남는 이동 기록', '박스를 열어 주는 QR 라벨', '스스로 유지되는 기억'],
    fam_eyebrow='함께 사는 집, 함께 쓰는 기억', fam_h='내가 집안의 <em>검색 엔진</em>일 필요는 없잖아요.',
    fam_p='초대 코드 하나면 모두가 같은 집에 들어옵니다. 같은 박스를 보고, 누가 뭘 옮겼는지 기록이 남고, 사무실이나 창고는 별도 공간으로 나눌 수 있습니다.',
    inv_title='우리 집', av=['김', '이', '박'], inv_label='코드 하나로 모두 초대', inv_note='초대 코드 예시 · 같은 집, 같은 답',
    faq_h='알아 두면 <em>좋은 것들</em>',
    faq=[('정말 무료인가요?', '네. 광고도, 구독도, 분석 추적기도 없습니다. 사진과 목록은 같은 공간의 구성원에게만 보입니다.'),
         ('집 안 물건을 전부 등록해야 하나요?', '아니요. 실제로 자주 잃어버리는 것부터 시작하세요. 계절 옷, 케이블, 서류, 약. 넣을 때마다 하나씩 더하면 됩니다.'),
         ('가족과 같이 쓸 수 있나요?', '네. 초대 코드 하나면 가족이 같은 집에 들어옵니다. 누가 무엇을 옮겼는지 기록이 남습니다.'),
         ('QR 라벨이 꼭 필요한가요?', '아니요. 검색만으로도 충분합니다. 라벨은 선택입니다. A4 한 장에 21개를 인쇄해 박스에 붙이면, 스캔하는 순간 그 박스의 내용물이 열립니다.'),
         ('아이폰 버전은요?', '아직 없습니다. 지금은 Android만 있고, iOS는 준비 중입니다.')],
    final_h='이제 <span class="serif">기억</span>은 집에 맡기세요.', final_p='Google Play 무료. 광고도, 추적기도, 구독도 없습니다. 어디 뒀는지 기억하는 집, 그것뿐입니다.',
    foot_tag='집의 기억.', foot_product='제품', foot_legal='약관', foot_lang='언어',
    privacy='개인정보처리방침', privacy_href='../privacy/', delete='계정 삭제', delete_href='../delete-account/', contact='문의',
    copy='"어디 있지?"는 줄이고, "찾았다!"는 늘리고.',
)

open(os.path.join(ROOT, 'docs/index.html'), 'w').write(page(EN, 'en', './'))
os.makedirs(os.path.join(ROOT, 'docs/ko'), exist_ok=True)
open(os.path.join(ROOT, 'docs/ko/index.html'), 'w').write(page(KO, 'ko', '../'))
print('written')
