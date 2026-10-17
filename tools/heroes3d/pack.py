# 打包：每個動作一張 sheet（列=Flare 方向順序 0西 1西北 2北 3東北 4東 5東南 6南 7西南；欄=影格），另輸出 json 中繼資料
import os,glob,json
from PIL import Image
M='/tmp/claude-0/-home-claude/b1eaca21-4d49-5728-9ba6-a80e5d69cacd/scratchpad/mh'; import sys
CH=sys.argv[1] if len(sys.argv)>1 else 'warrior'
F=M+('/frames' if CH=='warrior' else f'/frames_{CH}'); O=M+('/pack' if CH=='warrior' else f'/pack_{CH}'); os.makedirs(O,exist_ok=True)
R=192; meta={'cell':R,'origin':[96,135],'px_per_meter':53.3,'dirs':['W','NW','N','NE','E','SE','S','SW'],'anims':{}}
for a in sorted(os.listdir(F)):
    n=len(glob.glob(f'{F}/{a}/0_*.png'))
    sh=Image.new('RGBA',(R*n,R*8))
    for f in range(8):
        d=(8-f)%8
        for i in range(n): sh.alpha_composite(Image.open(f'{F}/{a}/{d}_{i:02d}.png'),(i*R,f*R))
    sh.save(f'{O}/{CH}_{a}.png',optimize=True)
    meta['anims'][a]={'frames':n,'loop':a in('idle','run','walk','block_idle','aim','block')}
json.dump(meta,open(f'{O}/{CH}_sprites.json','w'),ensure_ascii=False,indent=1)
print(meta['anims'])
