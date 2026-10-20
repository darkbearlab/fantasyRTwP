"""
城內戰鬥地圖（首都突圍）的試產畫圖程式。輸入 tools/townPreview.ts 產生的 JSON，輸出夜晚燃燒的 PNG。
拼法移植自 D:\\_遊戲素材\\像素素材\\_場景試拼 的 fbb.py／scene_fb_town.py／grade.py（Alan 看過的城內燃燒試拼）。

用法：python town_render.py <json> <png> <public/assets 路徑>
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

src, out, assets = sys.argv[1:4]
D = json.load(open(src, encoding='utf-8'))
LIC = os.path.join(assets, 'licensed')
TS = os.path.join(LIC, 'fbb', 'hometown', 'tilesets')
CH = os.path.join(LIC, 'fbb', 'hometown', 'characters')
T = 16
TEAM = {'hero': (80, 170, 255), 'enemy': (255, 80, 80)}
TL = D['tiles']


def load(p):
    return Image.open(p).convert('RGBA')


A2, BT = load(os.path.join(TS, 'tileA2.png')), load(os.path.join(TS, 'tileB_town.png'))
MASTER = load(os.path.join(LIC, 'fbb', 'hometown', 'master_everything.png'))
PF = D.get('prefabs', {})
FIRES, SMOKE = load(os.path.join(CH, 'fires.png')), load(os.path.join(CH, 'smoke.png'))


def cell(sh, i):
    cols = sh.width // 16
    return sh.crop(((i % cols) * 16, (i // cols) * 16, (i % cols) * 16 + 16, (i // cols) * 16 + 16))


def q(sh, bx, by, qx, qy):
    return sh.crop((bx + qx * 8, by + qy * 8, bx + qx * 8 + 8, by + qy * 8 + 8))


def floor_auto(idx, n):
    bx, by = (idx % 8) * 32, (idx // 8) * 48
    t = Image.new('RGBA', (16, 16))
    for (sx, sy) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        h, v, d = n(sx, 0), n(0, sy), n(sx, sy)
        L, Tt = sx < 0, sy < 0
        if h and v and not d:
            qx, qy = (2 if L else 3), (0 if Tt else 1)
        else:
            qx = (0 if L else 3) if not h else (2 if L else 1)
            qy = (2 if Tt else 5) if not v else (4 if Tt else 3)
        t.alpha_composite(q(A2, bx, by + 0, qx, qy), (0 if L else 8, 0 if Tt else 8))
    return t


def obj_frame(sh, k, f):
    x, y = (k % 4) * 48 + 16, (k // 4) * 128
    return sh.crop((x, y + f * 32, x + 16, y + f * 32 + 32))


def char(im):
    a = np.asarray(im).astype(np.float32)
    a[..., :3] *= np.array([0.35, 0.3, 0.3])
    return Image.fromarray(a.astype('uint8'))


W, H = D['w'], D['h']
G = D['ground']


def gat(x, y):
    return G[y][x] if 0 <= x < W and 0 <= y < H else None


base = Image.new('RGBA', (W * T, H * T))
for y in range(H):
    for x in range(W):
        base.alpha_composite(floor_auto(0, lambda dx, dy: (gat(x + dx, y + dy) or '.') in '.s'), (x * T, y * T))
        if G[y][x] == 's':
            base.alpha_composite(floor_auto(4, lambda dx, dy: (gat(x + dx, y + dy) or 's') == 's'), (x * T, y * T))

lights = []
fires = []  # (排序列, 圖, px, py)
smokes = []
try:
    from PIL import ImageFont
    FONT = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 10)
except Exception:
    FONT = None


def draw_prefab(c, pf, x0, y0, burnt=False):
    # 先畫 ground、再畫 objects（交接文件 §10）
    for layer in ('ground', 'objects'):
        for r, row in enumerate(pf[layer]):
            for q_, i in enumerate(row):
                if i is None:
                    continue
                t = cell(MASTER, i)
                if burnt and layer == 'objects' and (r + q_) % 3 != 0:
                    t = char(t)
                c.alpha_composite(t, ((x0 + q_) * T, (y0 + r) * T))


def placeholder(c, x, y, w, h, burnt):
    # 佔位（交接文件 §10 (a)）：深色矩形加輪廓，寫「房屋」
    d = ImageDraw.Draw(c)
    fill = (70, 40, 34, 255) if burnt else (58, 52, 60, 255)
    d.rectangle((x * T, y * T, (x + w) * T - 1, (y + h) * T - 1), fill=fill, outline=(170, 160, 150, 255), width=1)
    d.rectangle(((x + w // 2 - 1) * T + 4, (y + h) * T - 6, (x + w // 2 + 1) * T - 4, (y + h) * T - 1), fill=(120, 90, 60, 255))
    if FONT:
        d.text(((x + w / 2) * T, (y + h / 2) * T), '房屋', fill=(220, 215, 205, 255), font=FONT, anchor='mm')


for k, h in enumerate(D['houses']):
    if h.get('prefab'):
        draw_prefab(base, PF[h['prefab']], h['x'], h['y'], h['burning'])
    else:
        placeholder(base, h['x'], h['y'], h['w'], h['h'], h['burning'])
    for j, (fx, fy) in enumerate(h['fires']):
        fires.append((fy + 1.5, obj_frame(FIRES, TL['houseFire'], (k + j) % 4), fx * T, (fy - 1) * T))
        smokes.append((obj_frame(SMOKE, TL['smoke'], (k + j) % 4), fx * T, (fy - 3) * T - 8))
        lights.append((fx * T + 8, fy * T + 8, 70, 0.9))

objs = []
for p in D['props']:
    x, y = p['x'], p['y']
    kind = p['kind']
    if kind == 'well' and p.get('prefab'):
        draw_prefab(base, PF[p['prefab']], x, y)
    elif kind == 'well':
        for r, row in enumerate(TL['well']):
            for c, i in enumerate(row):
                base.alpha_composite(cell(BT, i), ((x + c) * T, (y + r) * T))
    elif kind == 'rubble':
        base.alpha_composite(cell(BT, TL['rubble'][p.get('variant') or 0]), (x * T, y * T))
    elif kind in ('lamp', 'crates', 'sack'):
        top, bot = TL['lamp'] if kind == 'lamp' else TL['crates'][p.get('variant') or 0]
        objs.append((y, lambda c, top=top, bot=bot, x=x, y=y: (c.alpha_composite(cell(BT, top), (x * T, (y - 1) * T)), c.alpha_composite(cell(BT, bot), (x * T, y * T)))))
        if kind == 'lamp':
            lights.append((x * T + 8, (y - 1) * T + 8, 40, 0.5))
    elif kind == 'fire':
        fires.append((y + 0.5, obj_frame(FIRES, TL['groundFire'], (x + y) % 4), x * T, (y - 1) * T))
        lights.append((x * T + 8, y * T + 8, 45, 0.7))

for (sy, f, px, py) in fires:
    objs.append((sy, lambda c, f=f, px=px, py=py: c.alpha_composite(f, (px, py))))


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
        sh = load(os.path.join(LIC, u['sheet']))
        face = u.get('facing') or ('up' if u['team'] == 'hero' else 'down')
        block = {'up': 2, 'down': 1, 'left': 0, 'right': 0}[face]
        f = recolor(sh.crop((0, block * 5 * 32, 32, block * 5 * 32 + 32)), u.get('recolor'))
        return f.transpose(Image.FLIP_LEFT_RIGHT) if face == 'left' else f
    if u.get('m72'):
        im = load(os.path.join(assets, '0x72', 'frames', u['m72'] + '_f0.png'))
        c = Image.new('RGBA', (32, 32))
        c.alpha_composite(im, (16 - im.width // 2, 24 - im.height))
        return c
    return Image.new('RGBA', (32, 32))


def outline(img, color):
    a = np.array(img)[..., 3] > 0
    d = np.zeros_like(a)
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        d |= np.roll(np.roll(a, dy, 0), dx, 1)
    o = np.zeros((*a.shape, 4), np.uint8)
    o[d & ~a] = (*color, 255)
    return Image.fromarray(o)


drawn = []
for u in D['units']:
    im = unit_img(u)
    col = TEAM[u['team']]
    bb = im.getchannel('A').getbbox()
    px, py = u['x'] * T + 8 - 16, (u['y'] + 1) * T - (bb[3] if bb else 24) - 1

    def draw_unit(c, im=im, col=col, px=px, py=py, u=u):
        ring = Image.new('RGBA', (20, 8))
        ImageDraw.Draw(ring).ellipse((0, 0, 19, 7), outline=(*col, 230), width=1)
        c.alpha_composite(ring, (u['x'] * T - 2, (u['y'] + 1) * T - 7))
        c.alpha_composite(outline(im, col), (px, py))
        c.alpha_composite(im, (px, py))

    objs.append((u['y'] + 0.2, draw_unit))
    drawn.append((im, col, px, py))

canvas = base.copy()
mark = ImageDraw.Draw(canvas)
for e in D['exits']:
    mark.rectangle((e['x'] * T, e['y'] * T, (e['x'] + e['w']) * T - 1, (e['y'] + e['h']) * T - 1), outline=(255, 210, 60, 255), width=2)
for _, fn in sorted(objs, key=lambda t: t[0]):
    fn(canvas)
for (f, px, py) in smokes:
    canvas.alpha_composite(f, (px, py))
for im, col, px, py in drawn:
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


# townNight（fbbTiles.ts GRADES）
img = grade(canvas, (0.55, 0.5, 0.68), 0.75, lights)
img = img.resize((img.width * 2, img.height * 2), Image.NEAREST)
img.save(out)
