#!/usr/bin/env python3
"""PNG を「フィルタを解いてから」測る。生バイト読みは偽の値を返す（罠・2026-07-30）。"""
import zlib, struct, collections, sys

def decode(path):
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n', path
    i, idat, pal = 8, b'', None
    w = h = bd = ct = None
    while i < len(d):
        ln = struct.unpack('>I', d[i:i+4])[0]; typ = d[i+4:i+8]
        data = d[i+8:i+8+ln]; i += 12 + ln
        if typ == b'IHDR': w, h, bd, ct = struct.unpack('>IIBB', data[:10])
        elif typ == b'PLTE': pal = data
        elif typ == b'IDAT': idat += data
    raw = zlib.decompress(idat)
    ch = {0:1, 2:3, 3:1, 4:2, 6:4}[ct]
    bpp = max(1, ch * bd // 8); stride = (w * ch * bd + 7) // 8
    out = bytearray(); prev = bytearray(stride); pos = 0
    for y in range(h):
        f = raw[pos]; pos += 1
        line = bytearray(raw[pos:pos+stride]); pos += stride
        for x in range(stride):
            a = line[x-bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x-bpp] if x >= bpp else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        out += line; prev = line
    return dict(w=w, h=h, ct=ct, bd=bd, ch=ch, px=bytes(out), pal=pal)

def colors(img, top=8, min_alpha=250):
    w, h, ch, ct, px, pal = img['w'], img['h'], img['ch'], img['ct'], img['px'], img['pal']
    cnt = collections.Counter()
    for y in range(h):
        for x in range(w):
            o = (y * w + x) * ch
            if ct == 3:
                k = pal[px[o]*3:px[o]*3+3]; cnt[tuple(k)] += 1
            elif ct == 6:
                if px[o+3] >= min_alpha: cnt[tuple(px[o:o+3])] += 1
            else: cnt[tuple(px[o:o+3])] += 1
    return cnt.most_common(top)

def ico_entries(path):
    d = open(path, 'rb').read()
    n = struct.unpack('<H', d[4:6])[0]
    res = []
    for k in range(n):
        e = d[6+16*k:6+16*(k+1)]
        w = e[0] or 256; bpp = struct.unpack('<H', e[6:8])[0]
        ln, off = struct.unpack('<II', e[8:16])
        hdr_size = struct.unpack('<I', d[off:off+4])[0]
        kind = 'PNG' if d[off:off+8] == b'\x89PNG\r\n\x1a\n' else f'BMP(hdr={hdr_size})'
        size = w
        cnt = collections.Counter()
        if kind.startswith('BMP'):
            base = off + 40
            for y in range(size):
                for x in range(size):
                    i = base + ((size-1-y) * size + x) * 4
                    b, g, r, a = d[i], d[i+1], d[i+2], d[i+3]
                    if a >= 250: cnt[(r, g, b)] += 1
        res.append((w, bpp, kind, ln, cnt.most_common(4)))
    return res

if __name__ == '__main__':
    for p in sys.argv[1:]:
        if p.endswith('.ico'):
            print(f'== {p}')
            for w, bpp, kind, ln, cc in ico_entries(p):
                print(f'   {w}x{w} {bpp}bpp {kind} {ln}B  ' +
                      ' '.join('#%02x%02x%02x:%d' % (c[0], c[1], c[2], n) for c, n in cc))
        else:
            im = decode(p)
            print(f"== {p}  {im['w']}x{im['h']} colortype={im['ct']} bitdepth={im['bd']}")
            for c, n in colors(im):
                print('   #%02x%02x%02x  %d' % (c[0], c[1], c[2], n))
