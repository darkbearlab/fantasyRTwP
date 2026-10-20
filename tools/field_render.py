"""
野外戰鬥地圖試產的畫圖程式（交接文件 §9）。輸入 tools/fieldPreview.ts 產生的 JSON（格號已換算），輸出 PNG。
拼法移植自 D:\\_遊戲素材\\像素素材\\_場景試拼 的 fbb.py／grade.py（Alan 已驗證）。

用法：python field_render.py <json> <png> <flat|tall> <summer|fallDusk|winterOvercast> <public/assets 路徑>
- tall：石牆往上拉高半格，會蓋到上面一格地磚的下半（Alan：比較像擋視線的牆）
- 單位：腳下陣營色圈＋sprite 外框；最後再把所有外框疊一層在最上面，被樹冠蓋住時也看得到
"""
import json
import os
import sys

import numpy as np
from PIL import Image

src, out, wall_mode, look, assets = sys.argv[1:6]
D = json.load(open(src, encoding='utf-8'))
FBB = os.path.join(assets, 'licensed', 'fbb')
LIC = os.path.join(assets, 'licensed')
SEASON = {'summer': None, 'fallDusk': 'fall', 'winterOvercast': 'winter'}[look]
GRADE = {
    'summer': dict(mul=(0.95, 0.95, 0.95), sat=0.85, fire=False),
    'fallDusk': dict(mul=(0.78, 0.62, 0.62), sat=0.7, fire=True),
    'winterOvercast': dict(mul=(0.72, 0.75, 0.85), sat=0.55, fire=False),
}[look]
T = 16
TEAM = {'hero': (80, 170, 255), 'enemy': (255, 80, 80)}


def sheet(name):
    if SEASON and name in ('tileA2', 'tileA5_outside', 'tileB_outside'):
        return Image.open(os.path.join(FBB, 'seasons', f'{name}_{SEASON}.png')).convert('RGBA')
    return Image.open(os.path.join(FBB, 'hometown', 'tilesets', name + '.png')).convert('RGBA')


A2, A5, B = sheet('tileA2'), sheet('tileA5_outside'), sheet('tileB_outside')
FIRES = Image.open(os.path.join(FBB, 'hometown', 'characters', 'fires.png')).convert('RGBA')


def cell(sh, i):
    cols = sh.width // 16
    x, y = (i % cols) * 16, (i // cols) * 16
    return sh.crop((x, y, x + 16, y + 16))


def floor_auto(idx, n):
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
        t.alpha_composite(A2.crop((bx + qx * 8, by + qy * 8, bx + qx * 8 + 8, by + qy * 8 + 8)), (0 if L else 8, 0 if Tt else 8))
    return t


W, H = D['w'], D['h']
G = D['ground']


def gat(x, y):
    return G[y][x] if 0 <= x < W and 0 <= y < H else None


base = Image.new('RGBA', (W * T, H * T))
rnd = np.random.default_rng(D['seed'])
for y in range(H):
    for x in range(W):
        base.alpha_composite(floor_auto(0, lambda dx, dy: (gat(x + dx, y + dy) or '.') in '.p'), (x * T, y * T))
        if G[y][x] == 'p':
            base.alpha_composite(floor_auto(1, lambda dx, dy: (gat(x + dx, y + dy) or 'p') == 'p'), (x * T, y * T))
        elif rnd.random() < 0.15:
            base.alpha_composite(cell(A5, int(rnd.integers(1, 7))), (x * T, y * T))

# 出口與出生點標示（試產用）
from PIL import ImageDraw  # noqa: E402

mark = ImageDraw.Draw(base)
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
        # 英雄往上推進（背面）；敵人面向據點開口（側面圖朝右，朝左時鏡像）
        face = u.get('facing') or ('up' if u['team'] == 'hero' else 'down')
        block = {'up': 2, 'down': 1, 'left': 0, 'right': 0}[face]
        f = recolor(sh.crop((0, (block * 5) * 32, 32, (block * 5) * 32 + 32)), u.get('recolor'))
        return f.transpose(Image.FLIP_LEFT_RIGHT) if face == 'left' else f
    if u.get('m72'):
        p = os.path.join(assets, '0x72', 'frames', u['m72'] + '_f0.png')
        im = Image.open(p).convert('RGBA')
        c = Image.new('RGBA', (32, 32))
        c.alpha_composite(im, (16 - im.width // 2, 24 - im.height))
        return c
    return Image.new('RGBA', (32, 32))


def outline(img, color):
    a = np.array(img)[..., 3] > 0
    d = np.zeros_like(a)
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        d |= np.roll(np.roll(a, dy, 0), dx, 1)
    ring = d & ~a
    o = np.zeros((*a.shape, 4), np.uint8)
    o[ring] = (*color, 255)
    return Image.fromarray(o)


objs = []  # (排序列, 函式)
units_drawn = []
for w in D['walls']:
    if w['tile'] is None:
        continue
    t = cell(B, w['tile'])
    if wall_mode == 'tall':
        # 往上拉高半格：16 → 24 px，底部對齊原格子
        t = t.resize((16, 24), Image.NEAREST)
        objs.append((w['y'] - 0.1, lambda c, t=t, w=w: c.alpha_composite(t, (w['x'] * T, w['y'] * T - 8))))
    else:
        objs.append((w['y'] - 0.1, lambda c, t=t, w=w: c.alpha_composite(t, (w['x'] * T, w['y'] * T))))
fires = []
for p in D['props']:
    if p.get('anim'):
        k = p['anim']['index']
        x0, y0 = (k % 4) * 48 + 16, (k // 4) * 128
        f = FIRES.crop((x0, y0, x0 + 16, y0 + 32))
        objs.append((p['y'] + 0.5, lambda c, f=f, p=p: c.alpha_composite(f, (p['x'] * T, (p['y'] - 1) * T))))
        fires.append((p['x'] * T + 8, p['y'] * T + 8))
        continue
    tiles = p['tiles']
    th = len(tiles)
    tw = len(tiles[0])
    # 錨點：大樹在最底列中間；直的物件在下格；其他在左上
    ax = 1 if p['prefab'].startswith('tree') else 0
    ay = th - 1

    def put(c, tiles=tiles, p=p, ax=ax, ay=ay):
        for r, row in enumerate(tiles):
            for q, i in enumerate(row):
                if i is not None:
                    c.alpha_composite(cell(B, i), ((p['x'] - ax + q) * T, (p['y'] - ay + r) * T))

    objs.append((p['y'], put))

for u in D['units']:
    im = unit_img(u)
    col = TEAM[u['team']]
    bb = im.getchannel('A').getbbox()
    foot = bb[3] if bb else 24
    px, py = u['x'] * T + 8 - 16, (u['y'] + 1) * T - foot - 1

    def draw_unit(c, im=im, col=col, px=px, py=py, u=u):
        ring = Image.new('RGBA', (20, 8))
        ImageDraw.Draw(ring).ellipse((0, 0, 19, 7), outline=(*col, 230), width=1)
        c.alpha_composite(ring, (u['x'] * T - 2, (u['y'] + 1) * T - 7))
        c.alpha_composite(outline(im, col), (px, py))
        c.alpha_composite(im, (px, py))

    objs.append((u['y'] + 0.2, draw_unit))
    units_drawn.append((im, col, px, py))

canvas = base.copy()
for _, fn in sorted(objs, key=lambda t: t[0]):
    fn(canvas)
# 被樹冠、牆蓋住的單位：外框再疊一層在最上面（半透明）
for im, col, px, py in units_drawn:
    o = outline(im, col)
    o.putalpha(o.getchannel('A').point(lambda v: int(v * 0.7)))
    canvas.alpha_composite(o, (px, py))


def grade(im, mul, sat, lights):
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255
    g = a.mean(axis=2, keepdims=True)
    a = g + (a - g) * sat
    a = a * np.array(mul, np.float32)
    Hh, Ww = a.shape[:2]
    yy, xx = np.mgrid[0:Hh, 0:Ww]
    for (lx, ly, r, s) in lights:
        d = np.sqrt((xx - lx) ** 2 + (yy - ly) ** 2) / r
        k = np.clip(1 - d, 0, 1) ** 1.6 * s
        a = a + k[..., None] * np.array([0.95, 0.45, 0.12], np.float32)
        a = a * (1 + k[..., None] * np.array([0.5, 0.2, 0.0], np.float32))
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


lights = [(x, y, 64, 0.9) for x, y in fires] if GRADE['fire'] else []
img = grade(canvas, GRADE['mul'], GRADE['sat'], lights)
img = img.resize((img.width * 2, img.height * 2), Image.NEAREST)
img.save(out)
