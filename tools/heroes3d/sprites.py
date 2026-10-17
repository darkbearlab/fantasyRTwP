# 用法: python3 -I sprites.py anim_name fbx_path nframes [dirs=all] [preview]
import bpy,addon_utils,sys,math,os,json,time
from mathutils import Vector,Matrix,Quaternion
addon_utils.enable('bl_ext.user_default.mpfb', default_set=True)
S='/tmp/claude-0/-home-claude/b1eaca21-4d49-5728-9ba6-a80e5d69cacd/scratchpad/mh'
name,fbx,nf=sys.argv[1],sys.argv[2],int(sys.argv[3])
dirs=[int(x) for x in sys.argv[4].split(',')] if len(sys.argv)>4 and sys.argv[4]!='all' else list(range(8))
bpy.ops.wm.open_mainfile(filepath=os.environ.get('BLEND',S+'/w3.blend'))
sc=bpy.context.scene; rig=bpy.data.objects['Human.rig']
for pb in rig.pose.bones: pb.rotation_mode='QUATERNION'; pb.rotation_quaternion=(1,0,0,0); pb.location=(0,0,0)
before=set(bpy.data.objects); bpy.ops.import_scene.fbx(filepath=fbx)
src=[o for o in bpy.data.objects if o not in before and o.type=='ARMATURE'][0]
for o in bpy.data.objects:
    if o not in before and o!=src: o.hide_render=True
src.hide_render=True
act=src.animation_data.action; f0,f1=map(int,act.frame_range)
# 依階層排序骨頭
order=[]; 
def walk(b): order.append(b.name); [walk(c) for c in b.children]
for b in rig.data.bones:
    if b.parent is None: walk(b)
names=[n for n in order if n in src.data.bones]
SR={n:(src.matrix_world@src.data.bones[n].matrix_local) for n in names}
DR={n:(rig.matrix_world@rig.data.bones[n].matrix_local) for n in names}
hip='mixamorig:Hips'
# 靜止姿勢校正：A-pose(我們) vs T-pose(Mixamo) → 把我們骨頭的方向轉到來源靜止方向
QC={}
for n in names:
    ds=(SR[n].to_3x3()@Vector((0,1,0))).normalized(); dd=(DR[n].to_3x3()@Vector((0,1,0))).normalized()
    QC[n]=dd.rotation_difference(ds)@DR[n].to_quaternion()
sc.frame_set(f0); H0=(src.matrix_world@src.pose.bones[hip].matrix).translation-SR[hip].translation
H0=Vector((H0.x,H0.y,0))
def pose_at(f):
    sc.frame_set(f)
    W={}
    for n in names:
        sw=src.matrix_world@src.pose.bones[n].matrix
        rot=(sw.to_quaternion()@SR[n].to_quaternion().inverted())@QC[n]
        if n==hip:
            dl=(sw.translation-SR[n].translation)*(DR[hip].translation.z/SR[hip].translation.z)   # 依腿長比例縮放位移
            if os.environ.get('LOCKROOT'): dl=Vector((H0.x,H0.y,dl.z))
            loc=DR[n].translation+dl
        else: loc=None
        W[n]=(rot,loc)
    for n in names:
        pb=rig.pose.bones[n]; rot,loc=W[n]
        if loc is None:
            # 位置跟隨父骨（保持骨長）
            par=rig.matrix_world@pb.parent.matrix
            rest_rel=(rig.matrix_world@rig.data.bones[n].parent.matrix_local).inverted()@DR[n]
            loc=(par@rest_rel).translation
        M=Matrix.LocRotScale(loc,rot,None)
        pb.matrix=rig.matrix_world.inverted()@M
        bpy.context.view_layer.update()
bpy.data.objects['sun'].data.energy=5.5; bpy.data.objects['fill'].data.energy=2.0
sc.world.node_tree.nodes['Background'].inputs[1].default_value=1.0
FIST=json.load(open(os.environ.get('FISTFILE',S+'/fist.json'))) if os.environ.get('FIST') else None
if FIST and os.environ.get('FISTSIDE'): FIST={k:v for k,v in FIST.items() if os.environ['FISTSIDE'] in k}   # 只握一手（另一手保留施法手勢）
_pose=pose_at
def pose_at(f):
    _pose(f)
    if FIST:
        for n,e in FIST.items():
            pb=rig.pose.bones[n]; pb.matrix_basis=Matrix.Identity(4); pb.rotation_mode='XYZ'; pb.rotation_euler=e
        bpy.context.view_layer.update()
# ---- 長杖直立（UPRIGHT=物件名:權重）：手握處不變，杖身往垂直方向偏，避免像長矛一樣平舉 ----
UP=os.environ.get('UPRIGHT')
if UP:
    upn,upw=UP.split(':'); upw=float(upw); UPO=bpy.data.objects[upn]
    _pose3=pose_at
    def pose_at(f):
        _pose3(f)
        P_=rig.pose.bones; W_=rig.matrix_world
        side='Right' if 'Right' in UPO.parent_bone else 'Left'
        acr=((W_@P_[f'mixamorig:{side}HandIndex1'].head)-(W_@P_[f'mixamorig:{side}HandPinky1'].head)).normalized()
        z=(acr*(1-upw)+Vector((0,0,1))*upw).normalized()
        g=UPO.matrix_world.translation.copy(); x=(acr-z*acr.dot(z)); x=x.normalized() if x.length>1e-4 else Vector((1,0,0)); y=z.cross(x)
        M=Matrix((x,y,z)).transposed().to_4x4(); M.translation=g; UPO.matrix_world=M
        bpy.context.view_layer.update()
# ---- 拉弓：弦跟著右手、拉滿時顯示箭（BOWDRAW=1；NOARROW=1 則只拉直弦）----
BOW=bpy.data.objects.get('Bow') if os.environ.get('BOWDRAW') else None
if BOW:
    strobj=[c for c in BOW.children if c.type=='MESH' and c.data.materials and c.data.materials[0].name.startswith('bowstring')][0]
    smat=strobj.data.materials[0]
    def unitcyl(name,r,m):
        bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=r,depth=1,location=(0,0,0.5)); o=bpy.context.object; o.name=name
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR'); o.data.materials.append(m); return o
    segA=unitcyl('strA',0.0025,smat); segB=unitcyl('strB',0.0025,smat)
    am=bpy.data.materials.new('arrowm'); am.use_nodes=True; am.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(0.55,0.42,0.25,1)
    fm=bpy.data.materials.new('fletchm'); fm.use_nodes=True; fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(0.85,0.82,0.75,1)
    hm=bpy.data.materials.new('headm'); hm.use_nodes=True; b_=hm.node_tree.nodes['Principled BSDF']; b_.inputs['Base Color'].default_value=(0.5,0.5,0.52,1); b_.inputs['Metallic'].default_value=0.9
    arrow=bpy.data.objects.new('Arrow',None); sc.collection.objects.link(arrow)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.0045,depth=0.72,location=(0,0,0.36)); a_=bpy.context.object; a_.data.materials.append(am); a_.parent=arrow
    bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=0.011,depth=0.045,location=(0,0,0.74)); a_=bpy.context.object; a_.data.materials.append(hm); a_.parent=arrow
    for r_ in (0,120,240):
        bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.06),rotation=(0,0,math.radians(r_))); a_=bpy.context.object; a_.scale=(0.022,0.002,0.08); a_.data.materials.append(fm); a_.parent=arrow
    def place(o,p0,p1):
        d=p1-p0; L=d.length; q=Vector((0,0,1)).rotation_difference(d.normalized())
        o.matrix_world=Matrix.LocRotScale(p0,q,Vector((1,1,L)))
    _pose2=pose_at
    def pose_at(f):
        _pose2(f)
        mw=BOW.matrix_world; tipT=mw@Vector((0.16,0,0.75)); tipB=mw@Vector((0.16,0,-0.75)); grip=mw.translation
        P_=rig.pose.bones; W_=rig.matrix_world
        nock=sum([W_@P_['mixamorig:RightHand'+n].head for n in ('Index2','Middle2','Ring2')],Vector())/3
        # 弦拉開的距離 = 右手到原本弦線的距離
        ab=tipB-tipT; t_=max(0,min(1,(nock-tipT).dot(ab)/ab.length_squared)); off=(nock-(tipT+ab*t_)).length
        bn=(mw.to_3x3()@Vector((0,1,0))).normalized(); plane_d=abs((nock-grip).dot(bn))
        if os.environ.get('DBGBOW'): print('BOWDBG',f,round(off,3),round(plane_d,3),round((nock-grip).length,3))
        drawn=off>0.07 and plane_d<0.25 and (nock-grip).length<0.95 and not os.environ.get('NOARROW')
        strobj.hide_render=drawn; segA.hide_render=not drawn; segB.hide_render=not drawn; arrow.hide_render=not drawn
        for ch in arrow.children: ch.hide_render=not drawn
        rt=bpy.data.objects.get('root')
        for o_ in (segA,segB,arrow):
            if rt and o_.parent is None: o_.parent=rt   # 跟著角色一起轉方向（擺位時 root 為零旋轉）
        if drawn:
            place(segA,tipT,nock); place(segB,nock,tipB)
            dirv=(grip-nock).normalized(); q=Vector((0,0,1)).rotation_difference(dirv); arrow.matrix_world=Matrix.LocRotScale(nock,q,None)
        bpy.context.view_layer.update()
# ---- 頭部瞄準（HEADAIM=權重）：頭頸轉向「頭→弓把」方向 ----
HA=float(os.environ.get('HEADAIM','0') or 0)
if HA>0 and bpy.data.objects.get('Bow'):
    BOWO=bpy.data.objects['Bow']
    _hb=rig.data.bones['mixamorig:Head']; FWD_L=(_hb.matrix_local.to_3x3().inverted()@(rig.matrix_world.to_3x3().inverted()@Vector((0,-1,0)))).normalized()
    _pose5=pose_at
    def pose_at(f):
        _pose5(f)
        W_=rig.matrix_world
        for bn_,w in (('mixamorig:Neck',0.35*HA),('mixamorig:Head',0.8*HA)):
            hp=rig.pose.bones['mixamorig:Head']; cur=((W_@hp.matrix).to_3x3()@FWD_L).normalized()
            hpos=W_@hp.head; want=(BOWO.matrix_world.translation-hpos); want.z*=0.4; want.normalize()
            q=cur.rotation_difference(want); ang=q.angle
            if ang<1e-4: continue
            q=Quaternion(q.axis,min(ang,math.radians(80))*w)
            pb=rig.pose.bones[bn_]; Mw=W_@pb.matrix
            R=Matrix.Translation(Mw.translation)@q.to_matrix().to_4x4()@Matrix.Translation(-Mw.translation)
            pb.matrix=W_.inverted()@(R@Mw); bpy.context.view_layer.update()
# ---- 不畫弓弦（NOSTRING=1）----
if os.environ.get('NOSTRING'):
    _pose4=pose_at
    def pose_at(f):
        _pose4(f)
        for o_ in bpy.data.objects:
            if o_.type=='MESH' and o_.data.materials and o_.data.materials[0] and o_.data.materials[0].name.startswith('bowstring'): o_.hide_render=True
        bpy.context.view_layer.update()
# 渲染設定
sc.render.engine='CYCLES'; sc.cycles.samples=int(os.environ.get('SAMPLES','16')); sc.cycles.use_denoising=True
R=int(os.environ.get('RES','160'))
sc.render.resolution_x=R; sc.render.resolution_y=R; sc.render.film_transparent=True
cam=bpy.data.objects['cam']; cam.rotation_euler=(math.radians(60),0,math.radians(45)); cam.data.ortho_scale=float(os.environ.get('OSCALE','3.0'))
fwd=cam.rotation_euler.to_matrix()@Vector((0,0,-1)); cam.location=Vector((0,0,0.85))-fwd*20
# 角色+裝備放進一個 empty 旋轉
root=bpy.data.objects.new('root',None); sc.collection.objects.link(root); rig.parent=root
LOOP=name in ('idle','run','walk','block_idle')
frames=[round(f0+(f1-f0)*i/(nf if LOOP else nf-1)) for i in range(nf)] if nf>1 else [f0]
out=f"{os.environ.get('FRAMES',S+'/frames')}/{name}"; os.makedirs(out,exist_ok=True)
t=time.time()
for fi,f in enumerate(frames):
    root.rotation_euler=(0,0,0); bpy.context.view_layer.update(); pose_at(f)
    if name in ('run','walk'):  # 原地：鎖住 hips 水平位移
        pass
    for d in dirs:
        root.rotation_euler=(0,0,math.radians((315+45*d)%360)); bpy.context.view_layer.update()
        sc.render.filepath=f'{out}/{d}_{fi:02d}.png'; bpy.ops.render.render(write_still=True)
print('DONE',name,len(frames),'frames',round(time.time()-t,1),'s')
