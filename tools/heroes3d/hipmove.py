import bpy,sys,glob,os
res=[]
for f in sorted(glob.glob(sys.argv[-1])):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=f)
    a=[o for o in bpy.data.objects if o.type=='ARMATURE'][0]; act=a.animation_data.action
    f0,f1=map(int,act.frame_range); sc=bpy.context.scene
    ps=[]
    for fr in range(f0,f1+1):
        sc.frame_set(fr); ps.append((a.matrix_world@a.pose.bones['mixamorig:Hips'].head).copy())
    d=[((p-ps[0]).xy).length for p in ps]
    res.append(f"{os.path.basename(f):22s} 最大位移 {max(d):.2f} m  結束位移 {d[-1]:.2f} m  {f1-f0+1} 影格")
print('\n'.join(res))
