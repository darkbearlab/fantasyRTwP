"""
第 3～5 章室內地圖試產的畫圖程式（交接文件 §9）。輸入 tools/indoorPreview.ts 產生的 JSON，輸出 PNG。

用法：python indoor_render.py <json> <png> <public/assets 路徑>

拼法（先用單格物件與佔位矩形；多格物件之後由 Alan 用拼圖台做成預製件）：
- 地面：A2 地面 autotile（試煉地城、魔王城用 Castle and Catacombs 的 tileA2_cc；密道用 Caves and Mines 的 tileA2_caves）。
- 牆：牆頂純黑；緊鄰地面的那一格畫牆面（tileA5；洞穴畫兩格高的樹根洞壁）。
- 門、樓梯、書架、石像、王座、光柱、魔像封印：佔位矩形（顏色＋字）。
- 高台（'^'）：另一種地面，邊緣畫一圈亮線。
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

src, out, assets = sys.argv[1:4]
D = json.load(open(src, encoding='utf-8'))
LIC = os.path.join(assets, 'licensed')
FBB = os.path.join(LIC, 'fbb')
T = 16
W, H = D['w'], D['h']
G = D['grid']
THEME = D['theme']
TEAM = {'hero': (80, 170, 255), 'enemy': (255, 80, 80)}

# 各主題的格號（Alan 看過後再定案；之後搬進 src/game/render 給遊戲用）
STYLE = {
    'temple': dict(a2='castle/tilesets/tileA2_cc', floor=1, high=4, top=8, a5='castle/tilesets/tileA5_castle_int', face=[57, 58, 59], dark=False,
                   grade=dict(mul=(0.92, 0.94, 1.0), sat=0.85)),
    'castle': dict(a2='castle/tilesets/tileA2_cc', floor=0, high=4, top=8, a5='castle/tilesets/tileA5_castle_int', face=[57, 58, 59], dark=False,
                   grade=dict(mul=(0.62, 0.58, 0.72), sat=0.6)),
    'cave': dict(a2='caves/tilesets/tileA2_caves', floor=0, high=2, top=None, a5='caves/tilesets/tileA5_cave1', face=None, dark=True,
                 grade=dict(mul=(0.55, 0.5, 0.55), sat=0.75)),
}[THEME]

A2 = Image.open(os.path.join(FBB, STYLE['a2'] + '.png')).convert('RGBA')
A5 = Image.open(os.path.join(FBB, STYLE['a5'] + '.png')).convert('RGBA')
BCC = Image.open(os.path.join(FBB, 'castle/tilesets/tileB_cc1.png')).convert('RGBA')
BCV = Image.open(os.path.join(FBB, 'caves/tilesets/tileB_cave1.png')).convert('RGBA')


def cell(sh, i):
    cols = sh.width // 16
    x, y = (i % cols) * 16, (i // cols) * 16
    return sh.crop((x, y, x + 16, y + 16))


def auto(sheet, idx, n):
    """RPG Maker A2 autotile（同 field_render.py 的 floor_auto）"""
    bx, by = (idx % 8) * 32, (idx // 8) * 48
    t = Image.new('RGBA', (16, 16))
    for (sx, sy) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        h, v, d = n(sx, 0), n(0, sy), n(sx, sy)
        L = sx < 0
        Tt = sy < 0
        if h and v and not d:
            qx, qy = (2 if L else 3), (0 if Tt else 1)
        else:
            qx = (0 if L else 3) if not h else (2 if L else 1)
            qy = (2 if Tt else 5) if not v else (4 if Tt else 3)
        t.alpha_composite(sheet.crop((bx + qx * 8, by + qy * 8, bx + qx * 8 + 8, by + qy * 8 + 8)), (0 if L else 8, 0 if Tt else 8))
    return t


def g(x, y):
    return G[y][x] if 0 <= x < W and 0 <= y < H else '#'


def is_wall(x, y):
    return g(x, y) == '#'


rnd = np.random.default_rng(D['seed'])
base = Image.new('RGBA', (W * T, H * T), (0, 0, 0, 255))
for y in range(H):
    for x in range(W):
        c = G[y][x]
        if c != '#':
            base.alpha_composite(auto(A2, STYLE['floor'], lambda dx, dy: g(x + dx, y + dy) != '#'), (x * T, y * T))
            if c == '^':
                base.alpha_composite(auto(A2, STYLE['high'], lambda dx, dy: g(x + dx, y + dy) == '^'), (x * T, y * T))
            continue
        below = g(x, y + 1) != '#'
        below2 = g(x, y + 2) != '#'
        if STYLE['dark']:
            # 洞穴：牆頂純黑，靠地面的兩格畫樹根洞壁（上 80＋、下 88＋）
            if below:
                base.alpha_composite(cell(A5, 88 + (x % 8)), (x * T, y * T))
            elif below2:
                base.alpha_composite(cell(A5, 80 + (x % 8)), (x * T, y * T))
        else:
            # 牆頂純黑（試產版：比 A2 的牆頂 autotile 好分辨），靠地面的那一格畫牆面
            if below:
                base.alpha_composite(cell(A5, STYLE['face'][int(rnd.integers(0, len(STYLE['face'])))]), (x * T, y * T))

mark = ImageDraw.Draw(base)
# 高台邊緣
for y in range(H):
    for x in range(W):
        if G[y][x] == '^':
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if g(x + dx, y + dy) != '^':
                    x0, y0 = x * T + (15 if dx > 0 else 0), y * T + (15 if dy > 0 else 0)
                    x1, y1 = x0 + (0 if dx else 15), y0 + (0 if dy else 15)
                    mark.line((x0, y0, x1, y1), fill=(230, 220, 160, 255), width=1)
# 門（佔位）
for y in range(H):
    for x in range(W):
        if G[y][x] == 'D':
            mark.rectangle((x * T + 1, y * T + 1, x * T + 14, y * T + 14), fill=(120, 72, 36, 255), outline=(40, 20, 10, 255))

PLACE = {  # 佔位矩形：顏色、字
    'stairs': ((210, 190, 120), 'EXIT'),
    'bookshelf': ((110, 70, 40), 'B'),
    'statue': ((200, 200, 210), 'S'),
    'throne': ((170, 30, 40), 'T'),
    'lightBeam': ((255, 240, 150), ''),
    'golemSeal': ((150, 140, 120), 'G'),
}
fires = []
for p in D['props']:
    k = p['kind']
    x, y = p['x'], p['y']
    w, h = p.get('w', 1), p.get('h', 1)
    if k == 'candle':
        base.alpha_composite(cell(BCC, 112), (x * T, y * T))
        fires.append((x * T + 8, y * T + 8, 40))
    elif k == 'brazier':
        base.alpha_composite(cell(BCC, 133), (x * T, (y - 1) * T))
        base.alpha_composite(cell(BCC, 149), (x * T, y * T))
        fires.append((x * T + 8, y * T, 64))
    elif k == 'armorStand':
        base.alpha_composite(cell(BCC, 166), (x * T, (y - 1) * T))
        base.alpha_composite(cell(BCC, 182), (x * T, y * T))
    elif k == 'mushroom':
        base.alpha_composite(cell(BCV, int(rnd.integers(116, 120))), (x * T, y * T))
    elif k == 'rubble':
        base.alpha_composite(cell(BCV, int(rnd.choice([120, 121, 124, 125]))), (x * T, y * T))
    elif k == 'torch':
        mark.rectangle((x * T + 6, y * T + 4, x * T + 9, y * T + 14), fill=(90, 60, 30, 255))
        mark.ellipse((x * T + 4, y * T + 1, x * T + 11, y * T + 7), fill=(255, 170, 50, 255))
        fires.append((x * T + 8, y * T + 12, 72))
    elif k in PLACE:
        col, ch = PLACE[k]
        ov = Image.new('RGBA', (w * T, h * T), (*col, 120 if k == 'lightBeam' else 220))
        d = ImageDraw.Draw(ov)
        d.rectangle((0, 0, w * T - 1, h * T - 1), outline=(20, 20, 20, 255))
        if ch:
            d.text((w * T // 2 - 3 * len(ch), h * T // 2 - 6), ch, fill=(0, 0, 0, 255))
        base.alpha_composite(ov, (x * T, y * T))
# 出口
for e in D['exits']:
    mark.rectangle((e['x'] * T, e['y'] * T, (e['x'] + e['w']) * T - 1, (e['y'] + e['h']) * T - 1), outline=(255, 210, 60, 255), width=2)


def recolor(img, rc):
    if not rc:
        return img
    a = np.array(img)
    for src_c, dst in ((0x0000C0, rc[0]), (0x7D7DEA, rc[1])):
        s = ((src_c >> 16) & 255, (src_c >> 8) & 255, src_c & 255)
        d = ((dst >> 16) & 255, (dst >> 8) & 255, dst & 255)
        m = (a[..., 0] == s[0]) & (a[..., 1] == s[1]) & (a[..., 2] == s[2]) & (a[..., 3] > 0)
        a[m, 0], a[m, 1], a[m, 2] = d
    return Image.fromarray(a)


def unit_img(u):
    if u.get('sheet'):
        sh = Image.open(os.path.join(LIC, u['sheet'])).convert('RGBA')
        face = u.get('facing') or ('top' if u['team'] == 'hero' else 'bottom')
        block = {'top': 2, 'bottom': 1, 'left': 0, 'right': 0}.get(face, 1)
        f = recolor(sh.crop((0, (block * 5) * 32, 32, (block * 5) * 32 + 32)), u.get('recolor'))
        f = f.transpose(Image.FLIP_LEFT_RIGHT) if face == 'left' else f
    elif u.get('m72'):
        im = Image.open(os.path.join(assets, '0x72', 'frames', u['m72'] + '_f0.png')).convert('RGBA')
        f = Image.new('RGBA', (32, 32))
        f.alpha_composite(im, (16 - im.width // 2, 24 - im.height))
    else:
        f = Image.new('RGBA', (32, 32))
    s = u.get('scale', 1)
    if s != 1:
        f = f.resize((int(32 * s), int(32 * s)), Image.NEAREST)
    return f


def outline(img, color):
    a = np.array(img)[..., 3] > 0
    d = np.zeros_like(a)
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        d |= np.roll(np.roll(a, dy, 0), dx, 1)
    o = np.zeros((*a.shape, 4), np.uint8)
    o[d & ~a] = (*color, 255)
    return Image.fromarray(o)


canvas = base.copy()
for u in sorted(D['units'], key=lambda u: u['y']):
    im = unit_img(u)
    if u.get('hidden'):
        im.putalpha(im.getchannel('A').point(lambda v: int(v * 0.45)))
    col = TEAM[u['team']]
    bb = im.getchannel('A').getbbox()
    foot = bb[3] if bb else 24
    px, py = u['x'] * T + 8 - im.width // 2, (u['y'] + 1) * T - foot - 1
    ring = Image.new('RGBA', (20, 8))
    ImageDraw.Draw(ring).ellipse((0, 0, 19, 7), outline=(*col, 230), width=1)
    canvas.alpha_composite(ring, (u['x'] * T - 2, (u['y'] + 1) * T - 7))
    canvas.alpha_composite(outline(im, col), (px, py))
    canvas.alpha_composite(im, (px, py))


def grade(im, mul, sat, lights):
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255
    gg = a.mean(axis=2, keepdims=True)
    a = gg + (a - gg) * sat
    a = a * np.array(mul, np.float32)
    Hh, Ww = a.shape[:2]
    yy, xx = np.mgrid[0:Hh, 0:Ww]
    for (lx, ly, r) in lights:
        d = np.sqrt((xx - lx) ** 2 + (yy - ly) ** 2) / r
        k = np.clip(1 - d, 0, 1) ** 1.6 * 0.8
        a = a + k[..., None] * np.array([0.95, 0.45, 0.12], np.float32)
        a = a * (1 + k[..., None] * np.array([0.5, 0.2, 0.0], np.float32))
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


img = grade(canvas, STYLE['grade']['mul'], STYLE['grade']['sat'], fires)
img = img.resize((img.width * 2, img.height * 2), Image.NEAREST)
img.save(out)
