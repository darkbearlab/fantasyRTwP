#!/usr/bin/env python3
"""
匯入 Flare（flare-game）mods/fantasycore 的等角素材 → public/assets/flare/

用法：
  1. 用 sparse checkout 取得素材（不要提交進本 repo）：
       git clone --depth 1 --filter=blob:none --sparse https://github.com/flareteam/flare-game.git flare
       cd flare && git sparse-checkout set --no-cone /LICENSE.txt /CREDITS.txt \
         /mods/fantasycore/images/avatar/male/ /mods/fantasycore/images/avatar/female/ \
         /mods/fantasycore/images/enemies/ /mods/fantasycore/images/tilesets/ \
         /mods/fantasycore/animations/avatar/male/ /mods/fantasycore/animations/avatar/female/ \
         /mods/fantasycore/animations/enemies/ /mods/fantasycore/animations/hero.txt /mods/fantasycore/tilesetdefs/
  2. python3 tools/importFlare.py <flare 的路徑>

需要 Pillow（pip install pillow）。對應與縮放設定在 src/game/render/flareArt.json。

輸出：
  - 每個圖層／敵人一張縮小後重新打包的圖集（PNG）＋ Phaser JSON Hash（frame 名稱 "skeleton/swing/3/2"
    ＝ 圖集/動作/影格/方向；pivot = 錨點，讓錨點對齊角色腳下）；動作資訊（影格數、時間、播放類型）寫在 JSON 的 anims。
  - tiles.png／tiles.json：地板磚（縮放成 64×32 的菱形）。
  - index.json：所有圖集與實際縮放倍率。
  - LICENSE.txt、CREDITS.txt（CC-BY-SA 3.0；修改後的圖檔同樣以 CC-BY-SA 3.0 釋出）。
"""
import json
import os
import shutil
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(ROOT, 'src', 'game', 'render', 'flareArt.json')
OUT = os.path.join(ROOT, 'public', 'assets', 'flare')
PAGE_W = 1024
PAD = 1


def parse_anim(path):
    """解析 Flare 動畫定義：image= 行與 [段落] 內的 frames/duration/type/frame=。"""
    images = {}
    anims = {}
    cur = None
    with open(path, encoding='utf-8') as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith('#'):
                continue
            if line.startswith('[') and line.endswith(']'):
                cur = line[1:-1]
                anims[cur] = {'frames': 0, 'duration': 0, 'type': 'looped', 'list': []}
                continue
            key, _, val = line.partition('=')
            if cur is None:
                if key == 'image':
                    parts = val.split(',')
                    images[parts[1] if len(parts) > 1 else ''] = parts[0]
                continue
            a = anims[cur]
            if key == 'frames':
                a['frames'] = int(val)
            elif key == 'duration':
                a['duration'] = int(val.replace('ms', '')) if val.endswith('ms') else int(float(val.replace('s', '')) * 1000)
            elif key == 'type':
                a['type'] = val
            elif key == 'frame':
                p = val.split(',')
                a['list'].append({
                    'i': int(p[0]), 'dir': int(p[1]), 'x': int(p[2]), 'y': int(p[3]), 'w': int(p[4]), 'h': int(p[5]),
                    'ax': int(p[6]), 'ay': int(p[7]), 'img': p[8] if len(p) > 8 else '',
                })
    return images, anims


def source_height(anims):
    """角色在來源圖中的身高（px）：stance 面向南的影格中，錨點到圖頂端的距離取最大值。"""
    frames = [f for f in anims.get('stance', {'list': []})['list'] if f['dir'] == 2] or anims.get('stance', {'list': []})['list']
    return max((f['ay'] for f in frames), default=100)


def save_png(im, path):
    """256 色調色盤（含透明度）壓縮：小尺寸的精靈圖肉眼幾乎看不出差異，檔案約小 3 倍。"""
    q = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    q.save(path, optimize=True)


def pack(crops):
    """簡單的 shelf 打包：crops = [(key, image)] → (位置表, 圖集尺寸)"""
    order = sorted(crops, key=lambda kv: -kv[1].size[1])
    pos = {}
    x = y = shelf_h = 0
    for key, im in order:
        w, h = im.size
        if x + w + PAD > PAGE_W:
            x = 0
            y += shelf_h + PAD
            shelf_h = 0
        pos[key] = (x, y)
        x += w + PAD
        shelf_h = max(shelf_h, h)
    return pos, (PAGE_W, y + shelf_h)


def build_sheet(key, base_dir, anim_path, wanted, scale, name_prefix):
    images, anims = parse_anim(anim_path)
    srcs = {code: Image.open(os.path.join(base_dir, rel)).convert('RGBA') for code, rel in images.items()}
    crops = {}
    frames = {}
    meta_anims = {}
    for anim in wanted:
        a = anims.get(anim)
        if not a or not a['list']:
            continue
        meta_anims[anim] = {'frames': a['frames'] or (max(f['i'] for f in a['list']) + 1), 'duration': a['duration'], 'type': a['type']}
        for f in a['list']:
            code = f['img'] if f['img'] in srcs else next(iter(srcs))
            ck = (code, f['x'], f['y'], f['w'], f['h'])
            if ck not in crops:
                im = srcs[code].crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
                w = max(1, round(f['w'] * scale))
                h = max(1, round(f['h'] * scale))
                crops[ck] = im.resize((w, h), Image.LANCZOS)
            frames[f'{name_prefix}/{anim}/{f["i"]}/{f["dir"]}'] = (ck, f['ax'] * scale, f['ay'] * scale)
    pos, (pw, ph) = pack(list(crops.items()))
    atlas = Image.new('RGBA', (pw, max(1, ph)), (0, 0, 0, 0))
    for ck, im in crops.items():
        atlas.paste(im, pos[ck])
    png = f'{key}.png'
    save_png(atlas, os.path.join(OUT, png))
    out_frames = {}
    for name, (ck, ax, ay) in frames.items():
        x, y = pos[ck]
        w, h = crops[ck].size
        out_frames[name] = {
            'frame': {'x': x, 'y': y, 'w': w, 'h': h},
            'rotated': False,
            'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h},
            'sourceSize': {'w': w, 'h': h},
            'pivot': {'x': round(ax / w, 4), 'y': round(ay / h, 4)},
        }
    data = {'frames': out_frames, 'anims': meta_anims, 'meta': {'image': png, 'size': {'w': pw, 'h': ph}, 'scale': round(scale, 4)}}
    with open(os.path.join(OUT, f'{key}.json'), 'w', encoding='utf-8') as fp:
        json.dump(data, fp, separators=(',', ':'))
    return {'png': png, 'json': f'{key}.json', 'scale': round(scale, 4), 'anims': meta_anims}


def build_tiles(fc, cfg):
    t = cfg['tiles']
    defs = {}
    img_rel = None
    with open(os.path.join(fc, 'tilesetdefs', f"{t['tileset']}.txt"), encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line.startswith('img='):
                img_rel = line[4:]
            elif line.startswith('tile='):
                p = [int(v) for v in line[5:].split(',')]
                defs[p[0]] = p[1:]
    src = Image.open(os.path.join(fc, img_rel)).convert('RGBA')
    ids = t['floor'] + t['fancy']
    tw, th = t['tileW'], t['tileH']
    crops = {}
    anchors = {}
    for i in ids:
        x, y, w, h, ax, ay = defs[i]
        sx = tw / 192
        sy = th / 96
        crops[i] = src.crop((x, y, x + w, y + h)).resize((max(1, round(w * sx)), max(1, round(h * sy))), Image.LANCZOS)
        anchors[i] = (ax * sx, ay * sy)
    pos, (pw, ph) = pack([(i, im) for i, im in crops.items()])
    pw = min(pw, max(pos[i][0] + crops[i].size[0] for i in ids) + 1)
    atlas = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))
    frames = {}
    for i, im in crops.items():
        atlas.paste(im, pos[i])
        w, h = im.size
        ax, ay = anchors[i]
        frames[f'tile/{i}'] = {
            'frame': {'x': pos[i][0], 'y': pos[i][1], 'w': w, 'h': h}, 'rotated': False, 'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h}, 'sourceSize': {'w': w, 'h': h},
            'pivot': {'x': round(ax / w, 4), 'y': round(ay / h, 4)},
        }
    save_png(atlas, os.path.join(OUT, 'tiles.png'))
    with open(os.path.join(OUT, 'tiles.json'), 'w', encoding='utf-8') as fp:
        json.dump({'frames': frames, 'meta': {'image': 'tiles.png', 'size': {'w': pw, 'h': ph}}}, fp, separators=(',', ':'))
    return {'png': 'tiles.png', 'json': 'tiles.json'}


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    flare = sys.argv[1]
    fc = os.path.join(flare, 'mods', 'fantasycore')
    with open(CONFIG, encoding='utf-8') as f:
        cfg = json.load(f)
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    target_px = cfg['heightPxPerM']
    index = {'sheets': {}, 'tiles': None}

    # 主角圖層：每套（male／female）用同一個縮放倍率，以頭部圖層的身高換算
    for set_name, s in cfg['heroSets'].items():
        _, anims = parse_anim(os.path.join(fc, 'animations', 'avatar', set_name, f"{s['scaleFrom']}.txt"))
        scale = s.get('scale') or (s['heightM'] * target_px) / source_height(anims)
        layers = sorted({l for h in cfg['heroes'].values() if h['set'] == set_name for l in h['layers']})
        for layer in layers:
            key = f'{set_name}_{layer}'
            index['sheets'][key] = build_sheet(key, fc, os.path.join(fc, 'animations', 'avatar', set_name, f'{layer}.txt'), cfg['anims'], scale, layer)
            print('hero layer', key, round(scale, 3))

    # 敵人：各自縮放，讓顯示身高符合 heightM
    for sheet, s in cfg['enemySheets'].items():
        _, anims = parse_anim(os.path.join(fc, 'animations', 'enemies', f'{sheet}.txt'))
        scale = s.get('scale') or (s['heightM'] * target_px) / source_height(anims)
        key = f'enemy_{sheet}'
        index['sheets'][key] = build_sheet(key, fc, os.path.join(fc, 'animations', 'enemies', f'{sheet}.txt'), cfg['anims'], scale, sheet)
        print('enemy', key, round(scale, 3))

    index['tiles'] = build_tiles(fc, cfg)
    for name in ('LICENSE.txt', 'CREDITS.txt'):
        shutil.copy(os.path.join(flare, name), os.path.join(OUT, name))
    with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as fp:
        json.dump(index, fp, indent=1)
    total = sum(os.path.getsize(os.path.join(OUT, n)) for n in os.listdir(OUT))
    print(f'輸出 {OUT}：{total / 1024 / 1024:.1f} MB')


if __name__ == '__main__':
    main()
