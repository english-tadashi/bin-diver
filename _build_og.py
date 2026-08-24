#!/usr/bin/env python3
"""og.png のもとになる HTML を書き出す。旧 og.png の実測レイアウトを保ち、色だけ移す。

■ 使い方（この3手で og.png ができる）
  1) python3 _build_og.py og_draft.html
  2) '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --headless=new \\
       --disable-gpu --hide-scrollbars --virtual-time-budget=20000 \\
       --window-size=1200,630 --screenshot=og_raw.png og_draft.html
  3) python3 _build_og.py --reencode og_raw.png og.png    # 画素は不変・容量だけ落とす

  ★2) は Chrome 一本。この環境には rsvg-convert / ImageMagick / inkscape / cairosvg が
    無く、Pillow も arm64 非互換で使えない。Google Fonts は Chrome から読める。
  ★3) を省くと Chrome の素の PNG（327,873B）がそのまま出る。再エンコードで 238,870B。

旧 -> 新 の対応（役割で移す。見た目の似た色で移さない）
  ロゴ前面   #ff37c7 -> #f8b820  --logo-gold   （index.html .kb-on-pink と同じ）
  ロゴ背面   #22d3ee -> #e840a8  --logo-pink   （index.html .kb-on-cyan と同じ）
  副アクセント #22d3ee -> #11eeff  --tag        （型番左上・catch2・枠の上側）
  主アクセント #ff37c7 -> #b337ff  --accent     （型番右下・枠の下側・中央グロー）
  白文字     #e9e5f5 は据え置き（パレット置換の対象外）
  地        #07040f 不変。グラデは index.html の body::before と同値にする。
"""
import sys

GOLD, PINK = '#f8b820', '#e840a8'      # ロゴ 前面 / 背面
TAG, ACCENT = '#11eeff', '#b337ff'     # 副 / 主アクセント
WHITE = '#e9e5f5'
OFF = 3                                # ゴーストのずれ(px)。旧 og.png 実測 +3/+3
CELL = 12                              # K アイコンのセル(px)。旧実測 63x87 = 5*12+3 / 7*12+3

K = ["10001", "10010", "10100", "11000", "10100", "10010", "10001"]  # index.html の FONT と同一

def grid(color, glow):
    """5x7 の K。index.html と同じ「1セル=1要素」方式。"""
    out = []
    for r, row in enumerate(K):
        for c, b in enumerate(row):
            if b == '1':
                # 発光は付けない。旧 og.png の K は実測 63x87 = セル実寸ちょうどで、
                # box-shadow を足すと bbox が 71x93 に膨らみ「色だけの差し替え」でなくなる。
                out.append(f'<i style="left:{c*CELL}px;top:{r*CELL}px;background:{color}"></i>')
    return ''.join(out)

# 旧 og.png の実測位置（ink の bbox）から逆算した配置。較正値は calib.png で実測:
#   PS2P    100px -> ink 幅689 / 上オフセット -1
#   SG700   100px -> ink 上オフセット +26
#   SG400   100px -> ink 上オフセット +27
#   PlexMono100px -> ink 上オフセット +30（大文字のみ）/ +27（小文字含む）
HTML = f"""<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&family=IBM+Plex+Mono:wght@400;500&family=Press+Start+2P&display=swap" rel="stylesheet">
<style>
  html,body{{margin:0;padding:0;background:#07040f}}
  .card{{position:relative;width:1200px;height:630px;overflow:hidden;
    background:
      radial-gradient(46% 42% at 50% 41%, rgba(179,55,255,.30) 0%, rgba(179,55,255,.10) 55%, rgba(179,55,255,0) 100%),
      radial-gradient(120% 90% at 50% -10%, #1e0d38 0%, #0a0619 45%, #07040f 100%);
    }}
  /* 枠: 旧実測 inset 4px / 2px / 不透明度 .56 / 上=副アクセント 下=主アクセント */
  .frame{{position:absolute;inset:4px;border:2px solid transparent;
    border-image:linear-gradient(180deg,{TAG},{ACCENT}) 1;opacity:.56;}}
  .code{{position:absolute;font:400 21.5px 'IBM Plex Mono',monospace;white-space:nowrap;}}
  .code.tl{{left:52px;top:46.6px;color:{TAG};}}
  .code.br{{right:52px;top:564.6px;color:{ACCENT};text-align:right;}}
  /* K アイコン: 前面ゴールド / 背面ピンクを右下 +3px。favicon と同じ重なり順 */
  .icon{{position:absolute;left:0;right:0;top:118px;height:{7*CELL+OFF}px;}}
  .icon .g{{position:absolute;left:50%;margin-left:-{(5*CELL+OFF)//2}px;
    width:{5*CELL}px;height:{7*CELL}px;}}
  .icon .ghost{{transform:translate({OFF}px,{OFF}px);z-index:0;}}
  .icon .front{{z-index:1;}}
  .icon i{{position:absolute;width:{CELL}px;height:{CELL}px;}}
  /* KATABAN: 旧版と同じ Press Start 2P。前面ゴールド + 背面ピンクを右下 +3px */
  .word{{position:absolute;left:0;right:0;top:246.8px;text-align:center;
    font:400 82px 'Press Start 2P',monospace;line-height:1;}}
  .word span{{position:relative;display:inline-block;}}
  .word .ghost{{position:absolute;left:{OFF}px;top:{OFF}px;color:{PINK};z-index:0;}}
  .word .front{{position:relative;color:{GOLD};z-index:1;}}
  .catch1{{position:absolute;left:0;right:0;top:357.4px;text-align:center;
    font:700 32.7px 'Space Grotesk',sans-serif;color:{WHITE};}}
  .catch2{{position:absolute;left:0;right:0;top:406.5px;text-align:center;
    font:400 24px 'Space Grotesk',sans-serif;color:{TAG};}}
  .domain{{position:absolute;left:0;right:0;top:540px;text-align:center;
    font:400 26px 'IBM Plex Mono',monospace;color:{WHITE};}}
  /* 走査線: 旧実測 周期4px・4行のうち3行を暗く。★地の上だけ（文字より下）*/
  .scan{{position:absolute;inset:0;pointer-events:none;
    background:repeating-linear-gradient(to bottom,
      rgba(0,0,0,0) 0 1px, rgba(0,0,0,.30) 1px 4px);}}
</style></head><body>
<div class="card">
  <div class="scan"></div>
  <div class="code tl">SLPS-00533 &rarr; AUBIRDFORCE</div>
  <div class="code br">SLPM-86500 &rarr; BIOHAZARD</div>
  <div class="icon">
    <div class="g ghost">{grid(PINK, 0)}</div>
    <div class="g front">{grid(GOLD, 0)}</div>
  </div>
  <div class="word"><span><span class="ghost" aria-hidden="true">KATABAN</span><span class="front">KATABAN</span></span></div>
  <div class="catch1">Find &amp; buy Japanese retro games</div>
  <div class="catch2">in-store or online &middot; no Japanese required</div>
  <div class="domain">gamekataban.com</div>
  <div class="frame"></div>
</div>
</body></html>
"""

def reencode(src, dst):
    """Chrome が吐いた PNG を、画素を変えずに小さく詰め直す。

    Chrome はフィルタ選択が素朴で、グラデーションのディザと相まって重くなる。
    行フィルタを 0..4 で総当たりし、zlib の戦略も 3種類試して最小を採る。
    実測では「Sub 固定 + 既定戦略」が最小（327,873B -> 238,870B）。
    旧 og.png（93,747B）より大きいままなのは Chrome がグラデにディザをかけるため
    （色数 旧3,624 / 新6,157）。減らすなら中央グローの層を外すのが効く。
    """
    import zlib, struct
    from _measure import decode
    im = decode(src)
    w, h, ch, px = im['w'], im['h'], im['ch'], im['px']
    assert ch == 3, 'RGB(colortype 2) を前提にしている'
    stride = w * 3

    def filt(line, prev, f):
        out = bytearray(stride)
        for i in range(stride):
            a = line[i-3] if i >= 3 else 0
            b = prev[i]
            c = prev[i-3] if i >= 3 else 0
            x = line[i]
            if f == 0: out[i] = x
            elif f == 1: out[i] = (x - a) & 255
            elif f == 2: out[i] = (x - b) & 255
            elif f == 3: out[i] = (x - (a + b) // 2) & 255
            else:
                p = a + b - c
                pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                out[i] = (x - pr) & 255
        return out

    lines = [px[y*stride:(y+1)*stride] for y in range(h)]
    cands = {}
    for f in range(5):                       # 全行同じフィルタ
        raw = bytearray(); prev = bytes(stride)
        for L in lines:
            raw.append(f); raw += filt(L, prev, f); prev = L
        cands[f'fixed{f}'] = bytes(raw)
    raw = bytearray(); prev = bytes(stride)  # 行ごとに最小絶対差和で選ぶ
    for L in lines:
        best = None
        for f in range(5):
            c = filt(L, prev, f)
            s = sum(v if v < 128 else 256 - v for v in c)
            if best is None or s < best[0]: best = (s, f, c)
        raw.append(best[1]); raw += best[2]; prev = L
    cands['adaptive'] = bytes(raw)

    best = None
    for name, r in cands.items():
        for st in (zlib.Z_DEFAULT_STRATEGY, zlib.Z_FILTERED, zlib.Z_RLE):
            co = zlib.compressobj(9, zlib.DEFLATED, 15, 9, st)
            d = co.compress(r) + co.flush()
            if best is None or len(d) < best[0]: best = (len(d), name, d)
    _, name, data = best

    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', data) + chunk(b'IEND', b''))
    open(dst, 'wb').write(png)
    assert decode(dst)['px'] == px, '再エンコードで画素が変わった'   # 可逆であることを毎回確かめる
    print(f'{src} -> {dst}  {len(png)} B  (filter={name}, 画素は完全一致)')


if len(sys.argv) > 1 and sys.argv[1] == '--reencode':
    reencode(sys.argv[2], sys.argv[3])
else:
    out = sys.argv[1] if len(sys.argv) > 1 else 'og_draft.html'
    open(out, 'w').write(HTML)
    print('wrote', out)
