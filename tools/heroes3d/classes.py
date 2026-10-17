# 用法: python3 -I classes.py <職業名>   → <職業名>.blend、<職業名>_sheet.png、<職業名>_fist.json
import sys,os,math,json
import bpy, addon_utils, numpy as np
from mathutils import Vector, Matrix
addon_utils.enable('bl_ext.user_default.mpfb', default_set=True)
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService
S='/tmp/claude-0/-home-claude/b1eaca21-4d49-5728-9ba6-a80e5d69cacd/scratchpad/mh'
D=os.path.expanduser('~/.config/blender/5.2/extensions/.user/user_default/mpfb/data')
CLASSES={
 'ranger':dict(macro={'gender':1.0,'age':0.45,'muscle':0.6,'weight':0.4,'height':0.6},
    skin='skins/young_caucasian_male/young_caucasian_male.mhmat', hair='hair/short04/short04.mhclo',
    clothes=['toigo_fisherman_sweater','toigo_wool_pants','culturalibre_hero_boots_1','toigo_gloves_medium'],
    tint={'gloves':(0.3,0.18,0.09),'wool_pants':(0.3,0.22,0.14),'hero_boots':(0.22,0.13,0.07)}, haircol=((0.32,0.2,0.08),(0.95,0.78,0.45)),
    puff={'fisherman':0.03,'hero_boots':0.014}, cut={'wool_pants':'hero_boots'}, belt=dict(over='fisherman',cinch=None,zfrom='pants',width=0.05),
    quilt={'fisherman':(0.36,0.33,0.22)},
    weapons=[dict(kind='bow',hand='Left'),dict(kind='quiver')]),
 'mage':dict(macro={'gender':1.0,'age':0.85,'muscle':0.3,'weight':0.45,'height':0.6},
    skin='skins/old_caucasian_male/old_caucasian_male.mhmat', hair='none',
    clothes=['donitz_monk_robe','donitz_monk_robe_hood','culturalibre_male_boots','rehmanpolanski_beard_viking'],
    tint={'monk_robe':(0.12,0.14,0.42),'beard_viking':(0.55,0.55,0.55)},
    weapons=[dict(kind='mhclo',name='culturalibre_magic_sceptre',hand='Right',grip=0.42)]),
 'cleric_f':dict(macro={'gender':0.0,'age':0.45,'muscle':0.6,'weight':0.5,'height':0.5,'proportions':0.7},
    skin='skins/young_caucasian_female/young_caucasian_female.mhmat', hair='none',
    clothes=['culturalibre_heroine_suit_2','culturalibre_hero-heroine_hood_1','wdg_mycenaean_tunic','culturalibre_male_boots','toigo_gloves_medium'],
    tint={'male_boots':(0.3,0.2,0.12),'gloves':(0.25,0.15,0.08),'mycenaean':(0.48,0.46,0.4)},
    chain=['heroine_suit','hood_1'], puff=['mycenaean'],
    weapons=[dict(kind='mace',hand='Right'),dict(kind='shield',paint=(0.9,0.85,0.7),face2=(0.75,0.6,0.15))]),
 'cleric':dict(macro={'gender':1.0,'age':0.55,'muscle':0.7,'weight':0.65,'height':0.55},
    skin='skins/middleage_caucasian_male/middleage_caucasian_male.mhmat', hair='hair/short02/short02.mhclo',
    clothes=['rehmanpolanski_viking_tunic','rehmanpolanski_viking_pants','rehmanpolanski_viking_boots','rehmanpolanski_moustache_viking'],
    tint={'viking_tunic':(0.45,0.42,0.36)},
    weapons=[dict(kind='mace',hand='Right'),dict(kind='shield',paint=(0.9,0.85,0.7),face2=(0.75,0.6,0.15))]),
}
import copy
base=CLASSES['cleric_f']; base['macro'].update({'weight':0.3,'muscle':0.45,'proportions':0.85})
heads={'A':(['culturalibre_hero-heroine_hood_1'],['hood_1'],[]),
       'B':(['donitz_monk_robe_hood'],['monk_robe_hood'],[]),
       'C':(['culturalibre_hero-heroine_hood_1','javherre_casco_caballero_templario_templar_knight_helmet'],['hood_1'],['casco']),
       'D':(['donitz_monk_robe_hood','javherre_casco_caballero_templario_templar_knight_helmet'],['monk_robe_hood'],['casco']),
       'E':(['culturalibre_hero-heroine_hood_1','grinsegold_corinthian_helmet'],['hood_1'],[])}
for k,(add_c,ch,st) in heads.items():
    c=copy.deepcopy(base); c['clothes']=[x for x in c['clothes'] if 'hood_1' not in x]+add_c
    c['chain']=['heroine_suit']+ch; c['steel']=st; CLASSES['cleric_f'+k]=c
c=copy.deepcopy(CLASSES['cleric_fB']); c['chain']=c['chain']+['mycenaean']; c['tint']={k:v for k,v in c['tint'].items() if k!='mycenaean'}; c['puff']=[]; c['belt']=True; c['belt_drop']=0.09; CLASSES['cleric_fB2']=c
for k,style in {'A':'knob','B':'crook','C':'fork'}.items():
    CLASSES['mage'+k]=dict(macro={'gender':1.0,'age':0.85,'muscle':0.3,'weight':0.45,'height':0.6},
        skin='skins/old_caucasian_male/old_caucasian_male.mhmat', hair='none',
        clothes=['donitz_monk_robe','donitz_monk_robe_hood','culturalibre_male_boots','rehmanpolanski_beard_viking'],
        tint={'monk_robe':(0.95,0.95,0.92),'beard_viking':(0.62,0.62,0.6),'male_boots':(0.2,0.14,0.09)},
        weapons=[dict(kind='staff',style=style,hand='Right')])
CLASSES['sorceress']=dict(macro={'gender':0.0,'age':0.4,'muscle':0.4,'weight':0.4,'height':0.45,'proportions':0.8},
    skin='skins/middleage_asian_female/middleage_asian_female.mhmat', hair='hair/long01/long01.mhclo',
    clothes=['toigo_halter_dress_with_fluted_skirt','culturalibre_male_boots'],
    tint={'halter_dress':(0.62,0.1,0.12),'male_boots':(0.18,0.1,0.06)}, haircol=((0.03,0.02,0.015),(0.18,0.11,0.06)),
    belt=dict(over='halter_dress',cinch=None,zfrom='waist_body',width=0.07,color=(0.6,0.42,0.08),cloth=True,drop=0.09),
    jewelry=True,
    weapons=[dict(kind='wand',hand='Right')])
cls=sys.argv[1]; C=CLASSES[cls]
m=TargetService.get_default_macro_info_dict()
for k,v in C['macro'].items(): m[k]=v
h=HumanService.create_human(macro_detail_dict=m)
rig=HumanService.add_builtin_rig(h,'mixamo')
HumanService.set_character_skin(os.path.join(D,C['skin']),h,skin_type='MAKESKIN')
def add(p,t):
    try: return HumanService.add_mhclo_asset(os.path.join(D,p),h,asset_type=t,subdiv_levels=0,material_type='MAKESKIN')
    except Exception as e: print('FAIL',p,e)
add('eyes/low-poly/low-poly.mhclo','Eyes'); add('eyebrows/eyebrow001/eyebrow001.mhclo','Eyebrows'); add('eyelashes/eyelashes01/eyelashes01.mhclo','Eyelashes')
if C['hair']!='none': add(C['hair'],'Hair')
for c in C['clothes']: add(f'clothes/{c}/{c}.mhclo','Clothes')
# ---- 染色 ----
def tint(obj,col):
    # 重新上色：取原貼圖亮度 × 指定顏色（保留布料紋理，換掉色相）
    for slot in obj.material_slots:
        mt=slot.material
        if not mt or not mt.use_nodes: continue
        nt=mt.node_tree; bsdf=next((n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'),None)
        if not bsdf: continue
        inp=bsdf.inputs['Base Color']
        bw=nt.nodes.new('ShaderNodeRGBToBW'); mix=nt.nodes.new('ShaderNodeMix'); mix.data_type='RGBA'; mix.blend_type='MULTIPLY'; mix.inputs['Factor'].default_value=1.0
        mix.inputs['B'].default_value=(col[0]*2.2,col[1]*2.2,col[2]*2.2,1)
        if inp.is_linked: nt.links.new(inp.links[0].from_socket,bw.inputs['Color'])
        else: bw.inputs['Color'].default_value=inp.default_value
        nt.links.new(bw.outputs['Val'],mix.inputs['A']); nt.links.new(mix.outputs['Result'],inp)
def chainmail(obj):
    mt=bpy.data.materials.new('chainmail'); mt.use_nodes=True; nt=mt.node_tree; b=nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value=(0.42,0.43,0.46,1); b.inputs['Metallic'].default_value=0.75; b.inputs['Roughness'].default_value=0.5
    tc=nt.nodes.new('ShaderNodeTexCoord'); vor=nt.nodes.new('ShaderNodeTexVoronoi'); vor.feature='DISTANCE_TO_EDGE'; vor.inputs['Scale'].default_value=170
    nt.links.new(tc.outputs['Object'],vor.inputs['Vector'])
    bump=nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=1.0; nt.links.new(vor.outputs['Distance'],bump.inputs['Height']); nt.links.new(bump.outputs['Normal'],b.inputs['Normal'])
    ramp=nt.nodes.new('ShaderNodeMapRange'); ramp.inputs['From Max'].default_value=0.12; nt.links.new(vor.outputs['Distance'],ramp.inputs['Value'])
    mix=nt.nodes.new('ShaderNodeMix'); mix.data_type='RGBA'; mix.inputs['A'].default_value=(0.04,0.04,0.045,1); mix.inputs['B'].default_value=(0.42,0.43,0.46,1)
    nt.links.new(ramp.outputs['Result'],mix.inputs['Factor']); nt.links.new(mix.outputs['Result'],b.inputs['Base Color'])
    obj.data.materials.clear(); obj.data.materials.append(mt)
    import bmesh
    bm=bmesh.new(); bm.from_mesh(obj.data); bmesh.ops.recalc_face_normals(bm,faces=bm.faces); bm.to_mesh(obj.data); bm.free()
for o in bpy.data.objects:
    pf=C.get('puff',[]); pf=pf if isinstance(pf,dict) else {k:0.012 for k in pf}
    for k,amt in pf.items():
        if k in o.name and o.type=='MESH':
            md=o.modifiers.new('puff','DISPLACE'); md.strength=amt; md.mid_level=0.0
            sm=o.modifiers.new('puff_smooth','SMOOTH'); sm.factor=0.6; sm.iterations=4
            # 放到修改器堆疊最後（在骨架變形之後才往外推）
            while o.modifiers.find('puff')>0 and o.modifiers[-1].name!='puff': bpy.ops.object.modifier_move_down({'object':o},modifier='puff') if False else o.modifiers.move(o.modifiers.find('puff'),len(o.modifiers)-1)
def quilted(obj,col):
    mt=bpy.data.materials.new('gambeson'); mt.use_nodes=True; nt=mt.node_tree; b=nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value=0.9
    tc=nt.nodes.new('ShaderNodeTexCoord'); hs=[]
    for ang in (45,-45):
        mp=nt.nodes.new('ShaderNodeMapping'); mp.inputs['Rotation'].default_value=(0,math.radians(ang),0); nt.links.new(tc.outputs['Object'],mp.inputs['Vector'])
        wv=nt.nodes.new('ShaderNodeTexWave'); wv.inputs['Scale'].default_value=9.0; wv.wave_profile='SAW'; nt.links.new(mp.outputs['Vector'],wv.inputs['Vector']); hs.append(wv)
    mn=nt.nodes.new('ShaderNodeMath'); mn.operation='MINIMUM'; nt.links.new(hs[0].outputs['Fac'],mn.inputs[0]); nt.links.new(hs[1].outputs['Fac'],mn.inputs[1])
    sq=nt.nodes.new('ShaderNodeMath'); sq.operation='POWER'; sq.inputs[1].default_value=0.35; nt.links.new(mn.outputs['Value'],sq.inputs[0])
    bump=nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=0.8; nt.links.new(sq.outputs['Value'],bump.inputs['Height']); nt.links.new(bump.outputs['Normal'],b.inputs['Normal'])
    mx=nt.nodes.new('ShaderNodeMix'); mx.data_type='RGBA'; mx.inputs['A'].default_value=(col[0]*0.55,col[1]*0.55,col[2]*0.55,1); mx.inputs['B'].default_value=(*col,1)
    nt.links.new(sq.outputs['Value'],mx.inputs['Factor']); nt.links.new(mx.outputs['Result'],b.inputs['Base Color'])
    obj.data.materials.clear(); obj.data.materials.append(mt)
for o in bpy.data.objects:
    for k,col in C.get('quilt',{}).items():
        if k in o.name and o.type=='MESH': quilted(o,col)
for o in bpy.data.objects:
    for k in C.get('steel',[]):
        if k in o.name and o.type=='MESH':
            mt=bpy.data.materials.new('helmsteel'); mt.use_nodes=True; b=mt.node_tree.nodes['Principled BSDF']
            b.inputs['Base Color'].default_value=(0.55,0.56,0.6,1); b.inputs['Metallic'].default_value=0.9; b.inputs['Roughness'].default_value=0.35
            o.data.materials.clear(); o.data.materials.append(mt)
# 裁切：把被靴子包住的褲管隱藏（遮罩修改器，不改網格本身）
for pk,bk in C.get('cut',{}).items():
    po=next(o for o in bpy.data.objects if pk in o.name and o.type=='MESH'); bo=next(o for o in bpy.data.objects if bk in o.name and o.type=='MESH')
    bz=np.array([(bo.matrix_world@v.co)[:] for v in bo.data.vertices]); top=float(bz[:,2].max())
    vg=po.vertex_groups.new(name='cut'); ids=[v.index for v in po.data.vertices if (po.matrix_world@v.co).z<top-0.03]
    vg.add(ids,1.0,'REPLACE'); mk=po.modifiers.new('cut','MASK'); mk.vertex_group='cut'; mk.invert_vertex_group=True
    print('cut',po.name,len(ids),'verts below',round(top-0.03,3))
for o in bpy.data.objects:
    for k in C.get('chain',[]):
        if k in o.name and o.type=='MESH': chainmail(o); print('chain',o.name)
def recolor_hair(obj,dark,light):
    for slot in obj.material_slots:
        mt=slot.material; nt=mt.node_tree; bsdf=next((n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'),None); inp=bsdf.inputs['Base Color']
        if not inp.is_linked: continue
        src=inp.links[0].from_socket; bw=nt.nodes.new('ShaderNodeRGBToBW'); nt.links.new(src,bw.inputs['Color'])
        mr=nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value=0.0; mr.inputs['From Max'].default_value=0.3; nt.links.new(bw.outputs['Val'],mr.inputs['Value'])
        mx=nt.nodes.new('ShaderNodeMix'); mx.data_type='RGBA'; mx.inputs['A'].default_value=(*dark,1); mx.inputs['B'].default_value=(*light,1)
        nt.links.new(mr.outputs['Result'],mx.inputs['Factor']); nt.links.new(mx.outputs['Result'],inp)
if C.get('haircol') and C['hair']!='none':
    hk=os.path.basename(C['hair']).replace('.mhclo','')
    for o in bpy.data.objects:
        if o.name.endswith(hk): recolor_hair(o,*C['haircol'])
for o in bpy.data.objects:
    for k,col in C['tint'].items():
        if k in o.name: tint(o,col); print('tint',o.name)
def bodyverts():
    # 取套用體型（形態鍵）後的身體頂點；暫時關掉遮罩修改器讓頂點編號不變
    gi=h.vertex_groups['body'].index; idx=[v.index for v in h.data.vertices if any(g.group==gi and g.weight>0.5 for g in v.groups)]
    saved=[(m,m.show_viewport) for m in h.modifiers if m.type=='MASK']
    for m,_ in saved: m.show_viewport=False
    upd(); dg=bpy.context.evaluated_depsgraph_get(); e=h.evaluated_get(dg); me=e.to_mesh()
    arr=np.array([(h.matrix_world@me.vertices[i].co)[:] for i in idx]); e.to_mesh_clear()
    for m,v in saved: m.show_viewport=v
    upd(); return arr
def fitted_band(targets,cx,cy,z,width,offset,name,material,bone,nrings=5,N=64,tilt=0.0,thick=0.004):
    from mathutils.bvhtree import BVHTree
    import bmesh
    upd(); dg=bpy.context.evaluated_depsgraph_get(); trees=[(BVHTree.FromObject(t,dg),t.matrix_world.copy()) for t in targets]
    rows=[]
    for j in range(nrings):
        dz=-width/2+width*j/(nrings-1); row=[]
        for k in range(N):
            a0=2*math.pi*k/N; dirw=Vector((math.cos(a0),math.sin(a0),0))
            zz=z+dz+tilt*(-dirw.y)          # tilt>0：前方（-Y）較高
            o_=Vector((cx,cy,zz)); best=0.0
            for tr,mw in trees:
                mi=mw.inverted(); loc,_,_,_=tr.ray_cast(mi@o_,(mi.to_3x3()@dirw).normalized(),0.4)
                if loc: best=max(best,((mw@loc)-o_).xy.length)
            row.append(best)
        rows.append(row)
    # 平滑半徑（避免鋸齒）並保證帶子不往內凹過多
    R=np.array(rows); R[R==0]=R[R>0].mean() if (R>0).any() else 0.1
    for _ in range(2): R=(np.roll(R,1,1)+2*R+np.roll(R,-1,1))/4
    bm=bmesh.new(); vs=[]
    for j in range(nrings):
        dz=-width/2+width*j/(nrings-1); rv=[]
        for k in range(N):
            a0=2*math.pi*k/N; r=R[j,k]+offset
            rv.append(bm.verts.new((cx+r*math.cos(a0),cy+r*math.sin(a0),z+dz+tilt*(-math.sin(a0)))))
        vs.append(rv)
    for j in range(nrings-1):
        for k in range(N): bm.faces.new((vs[j][k],vs[j][(k+1)%N],vs[j+1][(k+1)%N],vs[j+1][k]))
    me=bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob=bpy.data.objects.new(name,me); sc.collection.objects.link(ob); ob.data.materials.append(material)
    so=ob.modifiers.new('thick','SOLIDIFY'); so.thickness=thick; so.offset=1.0
    for poly in me.polygons: poly.use_smooth=True
    upd(); ob.parent=rig; ob.parent_type='BONE'; ob.parent_bone=bone; upd(); ob.matrix_world=Matrix.Identity(4)
    return ob
# ---- 握拳 ----
P=rig.pose.bones; B=rig.data.bones
def upd(): bpy.context.view_layer.update()
def headw(n): return rig.matrix_world@P[n].head
def tailw(n): return rig.matrix_world@P[n].tail
def palm(side):
    hh=B[f'mixamorig:{side}Hand'].head_local; mm=B[f'mixamorig:{side}HandMiddle1'].head_local
    i=B[f'mixamorig:{side}HandIndex1'].head_local; p=B[f'mixamorig:{side}HandPinky1'].head_local
    fwd=(mm-hh).normalized(); n=fwd.cross((i-p).normalized()).normalized()
    if n.dot(Vector((1 if side=='Left' else -1,0,0.6)))<0: n=-n
    return n,(hh+mm)/2
def rot(pb,axis,deg):
    pb.rotation_mode='XYZ'; e=[0,0,0]; e['XYZ'.index(axis)]=math.radians(deg); pb.rotation_euler=e
FIST={1:80,2:95,3:70}
for side in ['Left','Right']:
    dorsal,center=palm(side); target=center-dorsal*0.05; best=None
    for ax in 'XZ':
        for sg in (1,-1):
            for f in ['Index','Middle','Ring','Pinky']:
                for k,a in FIST.items(): rot(P[f'mixamorig:{side}Hand{f}{k}'],ax,sg*a)
            upd(); d=(tailw(f'mixamorig:{side}HandIndex3')-target).length
            if best is None or d<best[0]: best=(d,ax,sg)
    _,ax,sg=best
    for f in ['Index','Middle','Ring','Pinky']:
        for k,a in FIST.items(): rot(P[f'mixamorig:{side}Hand{f}{k}'],ax,sg*a)
    upd(); goal=headw(f'mixamorig:{side}HandIndex2'); best=None
    for ax1 in 'XYZ':
      for a1 in range(-60,61,15):
        for ax2 in 'XZ':
          for a2 in range(-60,61,15):
            rot(P[f'mixamorig:{side}HandThumb1'],ax1,a1); rot(P[f'mixamorig:{side}HandThumb2'],ax2,a2); rot(P[f'mixamorig:{side}HandThumb3'],ax2,a2)
            upd(); d=(tailw(f'mixamorig:{side}HandThumb3')-goal).length
            if best is None or d<best[0]: best=(d,ax1,a1,ax2,a2)
    _,ax1,a1,ax2,a2=best
    rot(P[f'mixamorig:{side}HandThumb1'],ax1,a1); rot(P[f'mixamorig:{side}HandThumb2'],ax2,a2); rot(P[f'mixamorig:{side}HandThumb3'],ax2,a2); upd()
json.dump({pb.name:list(pb.rotation_euler) for pb in P if 'Hand' in pb.name and pb.name[-1].isdigit()},open(f'{S}/{cls}_fist.json','w'))
# ---- 武器 ----
sc=bpy.context.scene
def mat(name,col,metal=0.0,rough=0.5):
    mt=bpy.data.materials.new(name); mt.use_nodes=True; b=mt.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value=(*col,1); b.inputs['Metallic'].default_value=metal; b.inputs['Roughness'].default_value=rough; return mt
def basis(z,x_hint,origin):
    z=z.normalized(); x=(x_hint-z*x_hint.dot(z)).normalized(); y=z.cross(x)
    M=Matrix((x,y,z)).transposed().to_4x4(); M.translation=origin; return M
def attach(obj,bone,M):
    obj.parent=rig; obj.parent_type='BONE'; obj.parent_bone=bone; upd(); obj.matrix_world=M
def fist_frame(side):
    i=headw(f'mixamorig:{side}HandIndex1'); p=headw(f'mixamorig:{side}HandPinky1'); d,_=palm(side)
    # 握點 = 彎曲手指圍成的圈的中心（食指、中指、無名指各節關節點平均）
    pts=[]
    for f in ['Index','Middle','Ring']:
        for k in (1,2,3): pts.append(headw(f'mixamorig:{side}Hand{f}{k}'))
        pts.append(tailw(f'mixamorig:{side}Hand{f}3'))
    g=sum(pts,Vector())/len(pts)
    return (i-p).normalized(), d, g
for w in C['weapons']:
    if w['kind']=='mhclo':
        o0=add(f"clothes/{w['name']}/{w['name']}.mhclo",'Clothes'); upd()
        # 複製成獨立物件（避免 MPFB 自動重新貼合衣物時把網格改回去）
        me=bpy.data.meshes.new(w['name']+'_rigid'); dg=bpy.context.evaluated_depsgraph_get()
        ev=o0.evaluated_get(dg); me2=bpy.data.meshes.new_from_object(ev); me2.transform(o0.matrix_world)
        o=bpy.data.objects.new(w['name'],me2); sc.collection.objects.link(o); bpy.data.objects.remove(o0)
        co=np.array([v.co[:] for v in o.data.vertices]); ctr=co.mean(0); u,s,vt=np.linalg.svd(co-ctr,full_matrices=False)
        ax=vt[0]; t=(co-ctr)@ax; lo,hi=t.min(),t.max()
        def spread(mask): q=co[mask]-ctr; q=q-np.outer(q@ax,ax); return np.linalg.norm(q,axis=1).max() if len(q) else 0
        if spread(t>hi-0.15*(hi-lo))<spread(t<lo+0.15*(hi-lo)): ax=-ax; t=-t; lo,hi=t.min(),t.max()
        tg=lo+w['grip']*(hi-lo)
        band=co[np.abs(t-tg)<0.02]
        if len(band)>=8:
            # 截面上點夠多：分兩群，取點數較多那群（弓要避開弦）
            c1=band.mean(0); far=band[np.argmax(np.linalg.norm(band-c1,axis=1))]; a1,a2=far,2*c1-far
            for _ in range(8):
                d1=np.linalg.norm(band-a1,axis=1); d2=np.linalg.norm(band-a2,axis=1); g1,g2=band[d1<d2],band[d1>=d2]
                a1=g1.mean(0) if len(g1) else a1; a2=g2.mean(0) if len(g2) else a2
            gp=(g1 if len(g1)>=len(g2) else g2).mean(0) if np.linalg.norm(a1-a2)>0.03 else band.mean(0)
        else:
            # 長桿中段沒有頂點：用上下最近兩圈頂點的中心內插
            tb=t[t<=tg].max(); ta=t[t>=tg].min()
            cb=co[np.abs(t-tb)<0.005].mean(0); ca=co[np.abs(t-ta)<0.005].mean(0)
            gp=cb+(ca-cb)*((tg-tb)/(ta-tb) if ta>tb else 0)
        gp=gp-ax*((gp-ctr)@ax-tg)   # 留在同一截面
        # 物件原點移到握點，本地 +Z = 頭端方向，+X = 第二主軸
        L=basis(Vector(ax),Vector(vt[1]),Vector(gp)); o.data.transform(L.inverted()); o.matrix_world=Matrix.Identity(4)
        across,dors,grip=fist_frame(w['hand'])
        attach(o,f"mixamorig:{w['hand']}Hand",basis(across,dors,grip))
        print('weapon',w['name'],'len',round(hi-lo,2))
    elif w['kind']=='mace':
        steel=mat('steel_m',(0.62,0.63,0.66),0.9,0.35); lea=mat('leather_m',(0.18,0.09,0.04),0,0.7); brass=mat('brass_m',(0.75,0.55,0.2),0.9,0.35)
        mc=bpy.data.objects.new('Mace',None); sc.collection.objects.link(mc)
        bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=0.015,depth=0.62,location=(0,0,0.2)); ob=bpy.context.object; ob.data.materials.append(steel); ob.parent=mc
        bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=0.018,depth=0.14,location=(0,0,0)); ob=bpy.context.object; ob.data.materials.append(lea); ob.parent=mc
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.025,location=(0,0,-0.09)); ob=bpy.context.object; ob.data.materials.append(brass); ob.parent=mc
        bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=0.04,depth=0.12,location=(0,0,0.47)); ob=bpy.context.object; ob.data.materials.append(steel); ob.parent=mc
        for k in range(6):
            a=math.radians(60*k); bpy.ops.mesh.primitive_cube_add(size=1,location=(math.cos(a)*0.055,math.sin(a)*0.055,0.47),rotation=(0,0,a)); ob=bpy.context.object; ob.scale=(0.05,0.008,0.13); ob.data.materials.append(steel); ob.parent=mc
        bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=0.04,depth=0.05,location=(0,0,0.555)); ob=bpy.context.object; ob.data.materials.append(steel); ob.parent=mc
        across,dors,grip=fist_frame(w['hand']); attach(mc,f"mixamorig:{w['hand']}Hand",basis(across,dors,grip))
    elif w['kind']=='bow':
        wood=mat('bowwood',(0.32,0.18,0.08),0,0.6); wrap=mat('bowwrap',(0.12,0.07,0.03),0,0.8); strg=mat('bowstring',(0.75,0.72,0.62),0,0.7)
        L=1.5; depth=0.16; pts=[]
        for k in range(21):
            u=-1+2*k/20; pts.append((depth*(1-u*u)*-1.0, 0, u*L/2))   # 單一弧線（D 形長弓），弓背朝 -X
        cu=bpy.data.curves.new('bowcurve','CURVE'); cu.dimensions='3D'; sp=cu.splines.new('POLY'); sp.points.add(len(pts)-1)
        for k,pt in enumerate(pts): sp.points[k].co=(pt[0]+depth,pt[1],pt[2],1); sp.points[k].radius=0.45+0.55*(1-abs(-1+2*k/20))
        cu.bevel_depth=0.016; cu.bevel_resolution=3
        bw=bpy.data.objects.new('BowLimb',cu); sc.collection.objects.link(bw); bw.data.materials.append(wood)
        # 原點在握把：曲線中點在 (0,0,0)
        bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=0.021,depth=0.12,location=(0,0,0)); gr=bpy.context.object; gr.data.materials.append(wrap)
        bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.0025,depth=L*0.995,location=(depth,0,0)); st=bpy.context.object; st.data.materials.append(strg)
        bo=bpy.data.objects.new('Bow',None); sc.collection.objects.link(bo)
        for ob in (bw,gr,st): ob.parent=bo
        across,dors,grip=fist_frame(w['hand'])
        elb=headw(f"mixamorig:{w['hand']}ForeArm"); hnd=headw(f"mixamorig:{w['hand']}Hand")
        attach(bo,f"mixamorig:{w['hand']}Hand",basis(across,(elb-hnd),grip))   # 弦朝手肘（朝向射手）
    elif w['kind']=='quiver':
        lea=mat('quiverleather',(0.22,0.12,0.05),0,0.7); shaft=mat('arrowshaft',(0.55,0.42,0.25),0,0.6); fl=mat('fletch',(0.85,0.82,0.75),0,0.8)
        q=bpy.data.objects.new('Quiver',None); sc.collection.objects.link(q)
        bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=0.05,depth=0.55,location=(0,0,0)); qb=bpy.context.object; qb.scale=(1,0.75,1); qb.data.materials.append(lea); qb.parent=q
        bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=0.052,depth=0.04,location=(0,0,0.25)); qr=bpy.context.object; qr.scale=(1,0.75,1); qr.data.materials.append(mat('qrim',(0.12,0.06,0.03),0,0.6)); qr.parent=q
        for k,(dx,dy) in enumerate([(-0.02,0.01),(0.0,-0.012),(0.022,0.008),(0.01,0.02),(-0.015,-0.015)]):
            bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.004,depth=0.2,location=(dx,dy,0.33+0.01*k)); a=bpy.context.object; a.data.materials.append(shaft); a.parent=q
            for r in (0,120,240):
                bpy.ops.mesh.primitive_cube_add(size=1,location=(dx,dy,0.39+0.01*k),rotation=(0,0,math.radians(r))); f_=bpy.context.object; f_.scale=(0.022,0.002,0.07); f_.data.materials.append(fl); f_.parent=q
        # 背後：右肩上方開口，斜向左下
        sp2=headw('mixamorig:Spine2'); nk=headw('mixamorig:Neck')
        back=Vector((0,1,0))   # 角色面向 -Y，背後是 +Y
        cen=sp2.lerp(nk,0.15)+back*0.16+Vector((-0.05,0,0))
        axis=Vector((-0.45,0.15,1)).normalized()   # 往右上（角色右手 = -X）
        attach(q,'mixamorig:Spine2',basis(axis,back,cen))
        # 斜背帶：右肩 → 左腰，沿身體前方
        lea2=mat('strap',(0.18,0.09,0.04),0,0.7)
        p0=headw('mixamorig:RightShoulder')+Vector((0,-0.02,0.05)); p1=headw('mixamorig:Hips').lerp(headw('mixamorig:Spine'),0.5)+Vector((0.17,0,0))
        dg=bpy.context.evaluated_depsgraph_get(); from mathutils.bvhtree import BVHTree
        tops=[o for o in bpy.data.objects if 'fisherman' in o.name and o.type=='MESH'][0]; bvh=BVHTree.FromObject(tops,dg); twi=tops.matrix_world.inverted()
        cpts=[]
        for side_v,yy in ((Vector((0,-1,0)),-1),(Vector((0,1,0)),1)):
            seg=[]
            for k in range(13):
                pp=p0.lerp(p1,k/12); far=pp+side_v*0.5
                loc,_,_,_=bvh.ray_cast(twi@far,(twi.to_3x3()@(-side_v)).normalized(),0.6)
                seg.append((tops.matrix_world@loc)+side_v*0.006 if loc else pp+side_v*0.12)
            cpts.append(seg)
        for seg in cpts:
            cu=bpy.data.curves.new('strap','CURVE'); cu.dimensions='3D'; spl=cu.splines.new('POLY'); spl.points.add(len(seg)-1)
            for k,pt in enumerate(seg): spl.points[k].co=(*pt,1)
            cu.extrude=0.018; cu.bevel_depth=0.0025; so=bpy.data.objects.new('Strap',cu); sc.collection.objects.link(so); so.data.materials.append(lea2)
            mw=so.matrix_world.copy(); so.parent=rig; so.parent_type='BONE'; so.parent_bone='mixamorig:Spine1'; upd(); so.matrix_world=mw
    elif w['kind']=='staff':
        wd=mat('staffwood',(0.30,0.19,0.10),0,0.7); ir=mat('staffiron',(0.3,0.3,0.32),0.85,0.4); gem=mat('staffgem',(0.35,0.55,0.95),0,0.15)
        gem.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value=(0.4,0.6,1,1); gem.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=1.5
        st=bpy.data.objects.new('Staff',None); sc.collection.objects.link(st); Lb,Lt=0.72,1.0
        def seg(r0,r1,z0,z1,m,v=10):
            bpy.ops.mesh.primitive_cone_add(vertices=v,radius1=r0,radius2=r1,depth=z1-z0,location=(0,0,(z0+z1)/2)); o_=bpy.context.object; o_.data.materials.append(m); o_.parent=st; return o_
        seg(0.013,0.016,-Lb,-Lb+0.06,ir); seg(0.016,0.019,-Lb+0.06,Lt-0.1,wd)
        seg(0.021,0.021,-0.07,0.07,mat('staffwrap',(0.12,0.08,0.05),0,0.85))
        if w['style']=='knob':
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04,location=(0,0,Lt-0.06)); o_=bpy.context.object; o_.scale=(1,1,1.3); o_.data.materials.append(wd); o_.parent=st
            seg(0.022,0.022,Lt-0.14,Lt-0.11,ir)
        elif w['style']=='crook':
            cu=bpy.data.curves.new('crook','CURVE'); cu.dimensions='3D'; sp=cu.splines.new('BEZIER'); sp.bezier_points.add(2)
            for i_,(co_,h1,h2) in enumerate([((0,0,Lt-0.12),(0,0,Lt-0.2),(0,0,Lt-0.02)),((0.07,0,Lt+0.06),(0.0,0,Lt+0.06),(0.12,0,Lt+0.06)),((0.13,0,Lt-0.04),(0.14,0,Lt+0.02),(0.12,0,Lt-0.08))]):
                bp=sp.bezier_points[i_]; bp.co=co_; bp.handle_left=h1; bp.handle_right=h2
            cu.bevel_depth=0.017; cu.bevel_resolution=3; o_=bpy.data.objects.new('crook',cu); sc.collection.objects.link(o_); o_.data.materials.append(wd); o_.parent=st
        else:
            for a_ in (0,120,240):
                bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.008,depth=0.2,location=(0.03*math.cos(math.radians(a_)),0.03*math.sin(math.radians(a_)),Lt+0.0),rotation=(math.radians(14)*math.sin(math.radians(a_)),-math.radians(14)*math.cos(math.radians(a_)),0))
                o_=bpy.context.object; o_.data.materials.append(wd); o_.parent=st
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=0.04,location=(0,0,Lt+0.03)); o_=bpy.context.object; o_.scale=(1,1,1.4); o_.data.materials.append(gem); o_.parent=st
        across,dors,grip=fist_frame(w['hand']); attach(st,f"mixamorig:{w['hand']}Hand",basis(across,dors,grip))
    elif w['kind']=='wand':
        wd=mat('wandwood',(0.18,0.1,0.06),0,0.6); gold=mat('wandgold',(0.8,0.6,0.2),0.9,0.3); gem=mat('wandgem',(0.6,0.2,0.85),0,0.1)
        gem.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value=(0.7,0.3,1,1); gem.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=2.0
        wn=bpy.data.objects.new('Wand',None); sc.collection.objects.link(wn)
        bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=0.012,radius2=0.007,depth=0.38,location=(0,0,0.12)); o_=bpy.context.object; o_.data.materials.append(wd); o_.parent=wn
        bpy.ops.mesh.primitive_torus_add(major_radius=0.012,minor_radius=0.003,location=(0,0,0.29)); o_=bpy.context.object; o_.data.materials.append(gold); o_.parent=wn
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=0.018,location=(0,0,0.325)); o_=bpy.context.object; o_.scale=(1,1,1.5); o_.data.materials.append(gem); o_.parent=wn
        across,dors,grip=fist_frame(w['hand']); attach(wn,f"mixamorig:{w['hand']}Hand",basis(across,dors,grip))
    elif w['kind']=='shield':
        steel=mat('steel',(0.62,0.63,0.66),0.9,0.35); dark=mat('darksteel',(0.25,0.25,0.27),0.9,0.45)
        wood=mat('wood',(0.42,0.26,0.12),0,0.75); paint=mat('paint',w.get('paint',(0.55,0.08,0.06)),0,0.6)
        sh=bpy.data.objects.new('Shield',None); sc.collection.objects.link(sh)
        def cyl(r,dep,z,mt,v=40):
            bpy.ops.mesh.primitive_cylinder_add(vertices=v,radius=r,depth=dep,location=(0,0,z)); ob=bpy.context.object; ob.data.materials.append(mt); ob.parent=sh
        cyl(0.33,0.022,0.03,wood); cyl(0.28,0.004,0.0425,paint)
        if 'face2' in w:
            m2=mat('paint2',w['face2'],0.6,0.4)
            for ang in (0,90):
                bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.046),rotation=(0,0,math.radians(ang))); cb=bpy.context.object; cb.scale=(0.5,0.07,0.004); cb.data.materials.append(m2); cb.parent=sh
        bpy.ops.mesh.primitive_torus_add(major_radius=0.33,minor_radius=0.012,location=(0,0,0.03),major_segments=48); r=bpy.context.object; r.data.materials.append(dark); r.parent=sh
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.075,location=(0,0,0.04)); bo=bpy.context.object; bo.scale=(1,1,0.6); bo.data.materials.append(steel); bo.parent=sh
        dL,_=palm('Left'); fa0=headw('mixamorig:LeftForeArm'); fa1=headw('mixamorig:LeftHand')
        attach(sh,'mixamorig:LeftForeArm',basis(dL,(fa1-fa0),fa0.lerp(fa1,0.62)+dL*0.05))
if C.get('belt'):
    BC=C['belt'] if isinstance(C['belt'],dict) else dict(over='mycenaean',cinch='heroine_suit',zfrom='waist',width=0.022)
    BC.setdefault('drop',C.get('belt_drop',0.0))
    lea=mat('beltleather',BC.get('color',(0.16,0.08,0.035)),0,0.85 if BC.get('cloth') else 0.65); br=mat('beltbrass',(0.75,0.55,0.2),0.9,0.35)
    from mathutils.bvhtree import BVHTree
    def evco(ob):
        dg=bpy.context.evaluated_depsgraph_get(); e=ob.evaluated_get(dg); me=e.to_mesh(); arr=np.array([(ob.matrix_world@v.co)[:] for v in me.vertices]); e.to_mesh_clear(); return arr
    def find(k): return next(o for o in bpy.data.objects if k in o.name and o.type=='MESH')
    over=find(BC['over'])
    # 腰帶高度
    if BC['zfrom']=='waist':
        ref=evco(find(BC['cinch'])); torso=ref[np.abs(ref[:,0])<0.2]
        z0=headw('mixamorig:Hips').z; z1=headw('mixamorig:Spine2').z; zs=np.linspace(z0,z1,24)
        widths=[np.ptp(torso[np.abs(torso[:,2]-z)<0.006][:,0]) if (np.abs(torso[:,2]-z)<0.006).sum()>4 else 9 for z in zs]
        wz=float(zs[int(np.argmin(widths))])
    elif BC['zfrom']=='waist_body':
        bv=bodyverts(); torso=bv[np.abs(bv[:,0])<0.2]
        z0=headw('mixamorig:Hips').z; z1=headw('mixamorig:Spine2').z; zs=np.linspace(z0,z1,24)
        widths=[np.ptp(torso[np.abs(torso[:,2]-z)<0.006][:,0]) if (np.abs(torso[:,2]-z)<0.006).sum()>4 else 9 for z in zs]
        wz=float(zs[int(np.argmin(widths))])
    else:   # 褲頭高度
        pv=evco(find('pants')); wz=float(pv[np.abs(pv[:,0])<0.2][:,2].max())-0.035
    wz-=BC['drop']; print('belt z',round(wz,3))
    # 收腰（選用）
    if BC.get('cinch'):
        tgt=find(BC['cinch']); vg=over.vertex_groups.new(name='waist'); tco=np.array([(over.matrix_world@v.co)[:] for v in over.data.vertices])
        for i,c in enumerate(tco):
            wgt=max(0.0,1.0-abs(c[2]-wz)/0.09)
            if wgt>0: vg.add([i],wgt**0.7,'REPLACE')
        sw=over.modifiers.new('cinch','SHRINKWRAP'); sw.target=tgt; sw.wrap_method='NEAREST_SURFACEPOINT'; sw.offset=0.006; sw.vertex_group='waist'
        sm=over.modifiers.new('cinch_smooth','CORRECTIVE_SMOOTH'); sm.vertex_group='waist'; sm.iterations=6
        upd()
    # 沿外衣實際輪廓（射線）做腰帶，取腰帶上下緣中較外側的半徑
    dg=bpy.context.evaluated_depsgraph_get(); bvh=BVHTree.FromObject(over,dg); tw=over.matrix_world; twi=tw.inverted()
    hipc=headw('mixamorig:Hips'); cx,cy=hipc.x,hipc.y; Wd=BC['width']
    N=48; pts=[]
    for k in range(N):
        a0=-np.pi+2*np.pi*k/N; dirw=Vector((np.cos(a0),np.sin(a0),0)); rr=[]
        for dz in (-Wd/2,0,Wd/2):
            o_=Vector((cx,cy,wz+dz))
            loc,nor,idx,dist=bvh.ray_cast(twi@o_,(twi.to_3x3()@dirw).normalized(),0.35)
            if loc: rr.append(((tw@loc)-Vector((cx,cy,wz+dz))).xy.length)
        r=(max(rr) if rr else 0.16)+0.006
        pts.append((cx+r*np.cos(a0),cy+r*np.sin(a0),wz))
    if BC.get('cloth'):
        bt=fitted_band([over],cx,cy,wz,Wd,0.003,'Belt',lea,'mixamorig:Hips',nrings=7,thick=0.005)
        bk=None
    else:
        cu=bpy.data.curves.new('belt','CURVE'); cu.dimensions='3D'; sp=cu.splines.new('POLY'); sp.points.add(N-1)
        for k,pt in enumerate(pts): sp.points[k].co=(*pt,1)
        sp.use_cyclic_u=True; cu.extrude=Wd/2; cu.bevel_depth=0.004; cu.bevel_resolution=1
        bt=bpy.data.objects.new('Belt',cu); sc.collection.objects.link(bt); bt.data.materials.append(lea)
    if not BC.get('cloth'):
        fr=pts[int(np.argmin([p_[1] for p_ in pts]))]
        bpy.ops.mesh.primitive_cube_add(size=1,location=(fr[0],fr[1]-0.006,wz)); bk=bpy.context.object; bk.scale=(Wd*0.9,0.01,Wd*1.1); bk.data.materials.append(br)
    upd()
    for ob in ([bt,bk] if not BC.get('cloth') else []):
        mw=ob.matrix_world.copy(); ob.parent=rig; ob.parent_type='BONE'; ob.parent_bone='mixamorig:Hips'; upd(); ob.matrix_world=mw
    wz_t=(0,0,wz)
if C.get('jewelry'):
    gold=mat('gold',(0.85,0.62,0.2),0.95,0.25)
    hb=rig.data.bones['mixamorig:Head']; hd_=headw('mixamorig:Head')
    bv=bodyverts(); top=bv[:,2].max()
    hz=top-0.045; ring=bv[(np.abs(bv[:,2]-hz)<0.006)]; cx_,cy_=ring[:,0].mean(),ring[:,1].mean(); rx_=np.ptp(ring[:,0])/2; ry_=np.ptp(ring[:,1])/2
    def tor(R,r,loc,rot,sc_=(1,1,1),bone='mixamorig:Head'):
        bpy.ops.mesh.primitive_torus_add(major_radius=R,minor_radius=r,location=loc,rotation=rot,major_segments=32,minor_segments=8); o_=bpy.context.object; o_.scale=sc_
        o_.data.materials.append(gold); upd(); mw=o_.matrix_world.copy(); o_.parent=rig; o_.parent_type='BONE'; o_.parent_bone=bone; upd(); o_.matrix_world=mw; return o_
    hairobj=[o for o in bpy.data.objects if o.type=='MESH' and C['hair']!='none' and o.name.endswith(os.path.basename(C['hair']).replace('.mhclo',''))]
    fitted_band([h]+hairobj,cx_,cy_,top-0.045,0.012,0.002,'Circlet',gold,'mixamorig:Head',nrings=3,N=72,tilt=-0.02,thick=0.003)   # 金頭環（前額低、後腦高）
    ez=top-0.135; er=bv[np.abs(bv[:,2]-ez)<0.006]; 
    for sx in (er[:,0].min(),er[:,0].max()):
        tor(0.016,0.0025,(sx+(-0.006 if sx<0 else 0.006),cy_+0.005,ez-0.03),(0,math.radians(90),0))   # 大圈耳環
    for side in ('Left','Right'):
        hh=headw(f'mixamorig:{side}Hand'); fa=headw(f'mixamorig:{side}ForeArm'); dvec=(hh-fa).normalized(); pos=fa.lerp(hh,0.85)
        q=Vector((0,0,1)).rotation_difference(dvec).to_euler()
        for k_ in range(2): tor(0.034,0.004,pos-dvec*0.02*k_,q,bone=f'mixamorig:{side}ForeArm')
upd()
# ---- 燈光相機 ----
sc.render.engine='CYCLES'; sc.cycles.samples=24; sc.render.film_transparent=True; sc.view_settings.view_transform='Standard'
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); cam.data.type='ORTHO'; sc.camera=cam
sun=bpy.data.objects.new('sun',bpy.data.lights.new('sun','SUN')); sun.data.energy=3.5; sun.rotation_euler=(math.radians(45),0,math.radians(-30)); sc.collection.objects.link(sun)
fill=bpy.data.objects.new('fill',bpy.data.lights.new('fill','SUN')); fill.data.energy=1.0; fill.rotation_euler=(math.radians(60),0,math.radians(150)); sc.collection.objects.link(fill)
wd=bpy.data.worlds.new('w'); wd.use_nodes=True; wd.node_tree.nodes['Background'].inputs[1].default_value=0.6; sc.world=wd
# 骨架名稱與戰士一致，方便 sprites.py 共用
rig.name='Human.rig'
bpy.ops.wm.save_as_mainfile(filepath=f'{S}/{cls}.blend')
def shot(name,yaw,pitch,scale=2.6,target=(0,0,0.95),res=(360,480)):
    cam.rotation_euler=(math.radians(pitch),0,math.radians(yaw)); cam.data.ortho_scale=scale; sc.render.resolution_x,sc.render.resolution_y=res
    fwd=cam.rotation_euler.to_matrix()@Vector((0,0,-1)); cam.location=Vector(target)-fwd*20
    sc.render.filepath=f'{S}/{cls}_{name}.png'; bpy.ops.render.render(write_still=True)
shot('front',0,90); shot('side',90,90); shot('iso',45,60); shot('iso_back',225,60)
for side in ('R','L'): shot('hand'+side,-20 if side=='R' else 20,70,0.6,tuple(headw('mixamorig:%sHand'%('Right' if side=='R' else 'Left'))),(300,300))
hd=tuple(headw('mixamorig:Head')+Vector((0,0,0.08)))
shot('headF',0,85,0.55,hd,(300,300)); shot('headI',35,65,0.55,hd,(300,300))
print('DONE',cls)
if C.get('belt'):
    shot('waistF',0,90,0.8,(0,0,wz),(300,300)); shot('waistS',90,90,0.8,(0,0,wz),(300,300))
