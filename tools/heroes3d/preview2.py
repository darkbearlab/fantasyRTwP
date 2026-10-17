# 用法: python3 preview2.py <frames_dir> <輸出前綴> <標題>
import sys,os,glob
from PIL import Image,ImageDraw,ImageFont
F,OUT,T=sys.argv[1],sys.argv[2],sys.argv[3]
f=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc',18)
R=192
def fr(a,d,t):
    n=len(glob.glob(f'{F}/{a}/0_*.png')); loop=a in('idle','run','walk','block_idle')
    i=t%n if loop else min(t%(n+4),n-1); return Image.open(f'{F}/{a}/{d}_{i:02d}.png')
names=['西','西北','北','東北','東','東南','南','西南']; pos={0:(0,1),1:(0,0),2:(1,0),3:(2,0),4:(2,1),5:(2,2),6:(1,2),7:(0,2)}
for anim in ['walk','idle']:
    out=[]
    for t in range(16):
        im=Image.new('RGBA',(R*3,R*3),(55,53,60,255)); d=ImageDraw.Draw(im)
        for fd in range(8):
            od=(8-fd)%8; x,y=pos[fd]; x*=R; y*=R
            sh=Image.new('RGBA',(70,26)); ImageDraw.Draw(sh).ellipse((0,0,69,25),fill=(0,0,0,80)); im.alpha_composite(sh,(x+61,y+122))
            im.alpha_composite(fr(anim,od,t),(x,y)); d.text((x+6,y+2),f'{fd} {names[fd]}',fill=(255,230,150),font=f)
        d.text((R+30,R+80),f'{T}・{anim}',fill=(200,200,200),font=f); out.append(im.convert('RGB'))
    out[0].save(f'{OUT}_{anim}_8dir.gif',save_all=True,append_images=out[1:],duration=110,loop=0)
anims=sorted(os.listdir(F)); cols=5; rows=(len(anims)+cols-1)//cols; out=[]
for t in range(14):
    im=Image.new('RGBA',(R*cols,R*rows),(40,38,44,255)); d=ImageDraw.Draw(im)
    for i,a in enumerate(anims):
        x,y=(i%cols)*R,(i//cols)*R; im.alpha_composite(fr(a,(8-5)%8,t),(x,y)); d.text((x+6,y+2),a,fill=(220,220,220),font=f)
    out.append(im.convert('RGB'))
out[0].save(f'{OUT}_anims.gif',save_all=True,append_images=out[1:],duration=110,loop=0)
print('ok')
