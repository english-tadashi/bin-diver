#!/usr/bin/env python3
"""favicon.svg -> favicon-16.png / favicon-32.png / apple-touch-icon.png / favicon.ico

Pillow は使えない（/Library/Frameworks の PIL が x86_64・arm64 python3 から ImportError）。
stdlib の zlib だけで PNG と ICO を書く。2026-07-30 と同じ方式:
  ・セル(矩形)は「ピクセル正方形との重なり面積」で解析的にAA（近似でなく厳密）
  ・角丸は符号付き距離(SDF)から被覆率を出す
色は SVG から読む。ここに色を直書きすると SVG と二重管理になり、片方だけ直る事故が起きる。
"""
import re, zlib, struct, sys, os

SVG = sys.argv[1] if len(sys.argv) > 1 else "favicon.svg"
OUT = sys.argv[2] if len(sys.argv) > 2 else "."

# ---- SVG を読む（構造は既知の 2レイヤー・角丸チップ）----------------------
src = open(SVG).read()
chip = re.search(r'<rect x="2" y="2" width="44" height="44" rx="(\d+)" '
                 r'fill="(#[0-9a-f]{6})" stroke="(#[0-9a-f]{6})" stroke-width="([\d.]+)"', src)
RX, PAPER, EDGE, SW = int(chip.group(1)), chip.group(2), chip.group(3), float(chip.group(4))
groups = re.findall(r'<g>(.*?)</g>', src, re.S)
assert len(groups) == 2, "期待した2レイヤー構造でない"
def cells(g):
    return [(float(x), float(y), float(w), float(h), c)
            for x, y, w, h, c in re.findall(
                r'<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="(#[0-9a-f]{6})"', g)]
GHOST, FRONT = cells(groups[0]), cells(groups[1])   # 描画順 = 背面, 前面
assert len(GHOST) == len(FRONT) == 14

def rgb(h): return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16))

VB = 48.0   # viewBox 48x48

# ---- 合成 ---------------------------------------------------------------
def over(dst, i, col, a):
    """source-over。dst は [r,g,b,a] を 0..1 で持つ float リスト。"""
    if a <= 0: return
    sr, sg, sb = col[0] / 255.0, col[1] / 255.0, col[2] / 255.0
    da = dst[i + 3]
    na = a + da * (1 - a)
    if na == 0:
        dst[i] = dst[i+1] = dst[i+2] = dst[i+3] = 0.0; return
    dst[i]   = (sr * a + dst[i]   * da * (1 - a)) / na
    dst[i+1] = (sg * a + dst[i+1] * da * (1 - a)) / na
    dst[i+2] = (sb * a + dst[i+2] * da * (1 - a)) / na
    dst[i+3] = na

def rect_cov(px0, py0, u, rx, ry, rw, rh):
    """ピクセル正方形 [px0,px0+u)x[py0,py0+u) と矩形の重なり面積比。厳密。"""
    ox = min(px0 + u, rx + rw) - max(px0, rx)
    oy = min(py0 + u, ry + rh) - max(py0, ry)
    if ox <= 0 or oy <= 0: return 0.0
    return (ox * oy) / (u * u)

def rrect_sdf(px, py, x, y, w, h, r):
    """角丸矩形の符号付き距離。内側が負。"""
    cx, cy = x + w / 2.0, y + h / 2.0
    qx = abs(px - cx) - (w / 2.0 - r)
    qy = abs(py - cy) - (h / 2.0 - r)
    ax, ay = max(qx, 0.0), max(qy, 0.0)
    return (ax * ax + ay * ay) ** 0.5 + min(max(qx, qy), 0.0) - r

def cov_from_sdf(d, u):
    """SDF から被覆率。u = 1ピクセルの viewBox 単位長。"""
    return min(1.0, max(0.0, 0.5 - d / u))

# 枠なし全面版（apple-touch）だけ、ゴースト込みの外接矩形を画面中心へ寄せる。
# 枠あり版は角丸チップが視覚的な中心を決めるので SVG 座標のまま。
# ★旧 apple-touch-icon.png もこの補正が入っていた（前面の実測 bbox が SVG 座標より
#   2.4px＝0.6単位 左上）。色だけ変える指示なので、この寄せも同値で再現する。
_xs = [c[0] for c in GHOST + FRONT] + [c[0] + c[2] for c in GHOST + FRONT]
_ys = [c[1] for c in GHOST + FRONT] + [c[1] + c[3] for c in GHOST + FRONT]
SHIFT = (VB / 2 - (min(_xs) + max(_xs)) / 2, VB / 2 - (min(_ys) + max(_ys)) / 2)

def render(size, chip_frame=True):
    u = VB / size
    dx, dy = (0.0, 0.0) if chip_frame else SHIFT
    buf = [0.0] * (size * size * 4)
    paper, edge = rgb(PAPER), rgb(EDGE)
    for py in range(size):
        for px in range(size):
            i = (py * size + px) * 4
            cx, cy = (px + 0.5) * u, (py + 0.5) * u   # ピクセル中心（viewBox 単位）
            if chip_frame:
                d = rrect_sdf(cx, cy, 2, 2, 44, 44, RX)
                over(buf, i, paper, cov_from_sdf(d, u))          # 地
                over(buf, i, edge, cov_from_sdf(abs(d) - SW / 2.0, u))  # 枠（中心揃え）
            else:
                over(buf, i, paper, 1.0)                          # 全面不透過
            for layer in (GHOST, FRONT):                          # 背面 -> 前面
                for (rx, ry, rw, rh, c) in layer:
                    cov = rect_cov(px * u, py * u, u, rx + dx, ry + dy, rw, rh)
                    if cov > 0: over(buf, i, rgb(c), cov)
    out = bytearray()
    for k in range(size * size):
        i = k * 4
        for ch in range(4):
            out.append(int(round(buf[i + ch] * 255)))
    return bytes(out)

# ---- PNG ----------------------------------------------------------------
def chunk(typ, data):
    return (struct.pack(">I", len(data)) + typ + data
            + struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff))

def write_png(path, size, rgba):
    stride = size * 4
    raw = bytearray()
    for y in range(size):                       # filter 0 (None)
        raw.append(0); raw += rgba[y * stride:(y + 1) * stride]
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    open(path, "wb").write(png)
    return len(png)

# ---- ICO（PNG埋め込みでなく BMP エントリ・最大互換）------------------------
def bmp_entry(size, rgba):
    hdr = struct.pack("<IiiHHIIiiII", 40, size, size * 2, 1, 32, 0, size * size * 4, 0, 0, 0, 0)
    xor = bytearray()
    for y in range(size - 1, -1, -1):           # BMP はボトムアップ
        for x in range(size):
            i = (y * size + x) * 4
            r, g, b, a = rgba[i], rgba[i+1], rgba[i+2], rgba[i+3]
            xor += bytes((b, g, r, a))          # BGRA
    mask_stride = ((size + 31) // 32) * 4       # 1bpp・4バイト境界。alpha を使うので全0
    andmask = bytes(mask_stride * size)
    return hdr + bytes(xor) + andmask

def write_ico(path, imgs):
    n = len(imgs)
    body, entries, off = b"", b"", 6 + 16 * n
    for size, rgba in imgs:
        data = bmp_entry(size, rgba)
        entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(data), off)
        off += len(data); body += data
    open(path, "wb").write(struct.pack("<HHH", 0, 1, n) + entries + body)
    return 6 + 16 * n + len(body)

# ---- 実行 ---------------------------------------------------------------
print(f"paper={PAPER} edge={EDGE} rx={RX} sw={SW}")
print(f"ghost={GHOST[0][4]} front={FRONT[0][4]}")
px = {s: render(s, True) for s in (16, 32, 48)}
for s in (16, 32):
    print(f"favicon-{s}.png  {write_png(os.path.join(OUT, f'favicon-{s}.png'), s, px[s])} B")
apple = render(180, chip_frame=False)   # iOS が自前で角を丸める。枠を焼くと角で線が割れる
print(f"apple-touch-icon.png  {write_png(os.path.join(OUT, 'apple-touch-icon.png'), 180, apple)} B")
print(f"favicon.ico  {write_ico(os.path.join(OUT, 'favicon.ico'), [(s, px[s]) for s in (16, 32, 48)])} B")
