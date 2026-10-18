# 用法: python3 -I props.py <gltf> <輸出png> [yaw_deg] [scale]
import bpy,sys,math,os
from mathutils import Vector
gl,out=sys.argv[1],sys.argv[2]; yaw=float(sys.argv[3]) if len(sys.argv)>3 else 0; scl=float(sys.argv[4]) if len(sys.argv)>4 else 1.0
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=gl)
objs=[o for o in bpy.data.objects if o.type=='MESH']
root=bpy.data.objects.new('root',None); bpy.context.scene.collection.objects.link(root)
for o in bpy.data.objects:
    if o.parent is None and o!=root: o.parent=root
root.scale=(scl,scl,scl); root.rotation_euler=(0,0,math.radians(yaw)); bpy.context.view_layer.update()
import numpy as np
pts=np.array([(o.matrix_world@Vector(c))[:] for o in objs for c in o.bound_box])
mn,mx=pts.min(0),pts.max(0); root.location=(-(mn[0]+mx[0])/2,-(mn[1]+mx[1])/2,-mn[2]); bpy.context.view_layer.update()
pts=np.array([(o.matrix_world@Vector(c))[:] for o in objs for c in o.bound_box]); mn,mx=pts.min(0),pts.max(0)
sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.samples=32; sc.cycles.use_denoising=True; sc.render.film_transparent=True; sc.view_settings.view_transform='Standard'
w=bpy.data.worlds.new('w'); w.use_nodes=True; w.node_tree.nodes['Background'].inputs[1].default_value=1.0; sc.world=w
for n,e,rot in [('sun',5.5,(45,0,-30)),('fill',2.0,(60,0,150))]:
    l=bpy.data.objects.new(n,bpy.data.lights.new(n,'SUN')); l.data.energy=e; l.rotation_euler=[math.radians(a) for a in rot]; sc.collection.objects.link(l)
# 影子承接面
bpy.ops.mesh.primitive_plane_add(size=40); pl=bpy.context.object; pl.is_shadow_catcher=True
PXM=53.3
size=max(mx[0]-mn[0],mx[1]-mn[1]); h=mx[2]
W=int(max(64,(size*1.15+0.6)*PXM)); H=int(max(64,(size*0.62+h*0.9+0.6)*PXM))
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam
cam.data.type='ORTHO'; cam.rotation_euler=(math.radians(60),0,math.radians(45))
sc.render.resolution_x=W; sc.render.resolution_y=H; cam.data.ortho_scale=max(W,H)/PXM
fwd=cam.rotation_euler.to_matrix()@Vector((0,0,-1)); up=cam.rotation_euler.to_matrix()@Vector((0,1,0))
# 地面原點 (0,0,0) 放在畫面下方：底部留 0.3 m 給影子
ctr=Vector((0,0,0))+up*((H/PXM)/2-(size*0.31+0.3)) /1.0
cam.location=ctr-fwd*30
sc.render.filepath=out; bpy.ops.render.render(write_still=True)
# 記錄地面原點在圖中的像素位置
import json
from bpy_extras.object_utils import world_to_camera_view
p=world_to_camera_view(sc,cam,Vector((0,0,0))); json.dump({'w':W,'h':H,'origin':[round(p.x*W),round((1-p.y)*H)],'size_m':[float(mx[0]-mn[0]),float(mx[1]-mn[1]),float(h)]},open(out.replace('.png','.json'),'w'))
print('DONE',out,W,H)
