"""Original commuter character. Run with Blender --background --python this_file.
All authoring coordinates are metres in the game's +Y-up, +Z-forward convention.
The exported armature is driven by runtime IK, with no baked cycling animation.
"""
import bpy, math, os, json
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'models'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0

def xyz(p): return (p[0], -p[2], p[1])
def linear(c): return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
def material(name, color, rough=.7, metal=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    rgb=[linear(int(color[i:i+2],16)/255) for i in (1,3,5)]
    m.diffuse_color=(*rgb,1)
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    return m

M={
 'jacket':material('Cotton · forest green','#405d51',.88),
 'seam':material('Stitching · sage','#687b68',.93),
 'rib':material('Ribbed cuffs · dark green','#2a443a',.95),
 'pants':material('Twill · charcoal blue','#303f49',.91),
 'pants_seam':material('Twill seams','#4a5660',.95),
 'skin':material('Skin · warm ochre','#bd9277',.71),
 'lip':material('Lips and ears','#996d59',.84),
 'hair':material('Hair and brows','#302f29',.93),
 'eye':material('Eye sclera','#d5cdbb',.5),
 'iris':material('Eyes · umber','#423b30',.35),
 'helmet':material('Helmet · ivory','#c6c9b7',.54),
 'rubber':material('Rubber and helmet vents','#252f2d',.85),
 'shoe':material('Canvas shoes · sand','#b7a98e',.88),
 'sole':material('Soles · warm white','#d1ccbc',.84),
 'lace':material('Laces','#e0d9c4',.9),
 'zip':material('Zipper · brushed metal','#9b9f93',.35,.6),
}

bone_specs={
 'Hips':((0,.965,0),(0,1.055,0),None),
 'Spine':((0,.965,0),(0,1.435,0),'Hips'),
 'Neck':((0,1.435,0),(0,1.555,.025),'Spine'),
 'Head':((0,1.64,.025),(0,1.755,.025),'Neck'),
}
for side,s in [('L',1),('R',-1)]:
    bone_specs.update({
      f'Thigh_{side}':((s*.105,.965,0),(s*.112,.54,.015),'Hips'),
      f'Shin_{side}':((s*.112,.54,.015),(s*.115,.115,.025),f'Thigh_{side}'),
      f'Foot_{side}':((s*.115,.115,.025),(s*.115,.09,.175),f'Shin_{side}'),
      f'UpperArm_{side}':((s*.185,1.415,0),(s*.32,1.155,.04),'Spine'),
      f'Forearm_{side}':((s*.32,1.155,.04),(s*.375,.905,.10),f'UpperArm_{side}'),
      f'Hand_{side}':((s*.375,.905,.10),(s*.375,.905,.20),f'Forearm_{side}'),
    })

arm=bpy.data.armatures.new('RiderSkeleton')
rig=bpy.data.objects.new('CommuterRig',arm);bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
for name,(head,tail,parent) in bone_specs.items():
    b=arm.edit_bones.new(name);b.head=xyz(head);b.tail=xyz(tail)
    if parent:b.parent=arm.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)
rig.show_in_front=True
parts=[]

def weights_at(bone): return {bone:1}
def create(name,verts,faces,mat,weights,group='Body'):
    data=bpy.data.meshes.new(name);data.from_pydata([xyz(v) for v in verts],[],faces);data.update()
    obj=bpy.data.objects.new(group+'_'+name,data);bpy.context.collection.objects.link(obj);obj.data.materials.append(M[mat])
    for p in data.polygons:p.use_smooth=True
    groups={}
    for i,w in enumerate(weights if isinstance(weights,list) else [weights]*len(verts)):
        for b,value in w.items():
            if b not in groups:groups[b]=obj.vertex_groups.new(name=b)
            if value>0:groups[b].add([i],value,'REPLACE')
    obj.parent=rig;mod=obj.modifiers.new('Skinning','ARMATURE');mod.object=rig
    obj['asset_group']=group;parts.append(obj);return obj

def ellipsoid(name,center,scale,mat,bone,group='Body',segments=24,rings=14):
    verts=[];faces=[]
    for j in range(rings+1):
        t=math.pi*j/rings
        for i in range(segments):
            a=2*math.pi*i/segments
            verts.append((center[0]+scale[0]*math.sin(t)*math.cos(a),center[1]+scale[1]*math.cos(t),center[2]+scale[2]*math.sin(t)*math.sin(a)))
    for j in range(rings):
        for i in range(segments):
            a=j*segments+i;b=j*segments+(i+1)%segments
            faces.append((a,b,b+segments,a+segments))
    return create(name,verts,faces,mat,weights_at(bone),group)

def loft(name,rings,mat,bone,group='Body',segments=32):
    # (y, half-width, front depth, back depth, z center)
    verts=[];faces=[]
    for y,w,front,back,z in rings:
        for i in range(segments):
            a=2*math.pi*i/segments;c=math.cos(a);sn=math.sin(a)
            verts.append((w*c,y,z+(front if sn>=0 else back)*sn))
    for j in range(len(rings)-1):
        for i in range(segments):
            a=j*segments+i;b=j*segments+(i+1)%segments
            faces.append((a,a+segments,b+segments,b))
    faces.extend([tuple(range(segments)),tuple((len(rings)-1)*segments+i for i in reversed(range(segments)))])
    return create(name,verts,faces,mat,weights_at(bone),group)

def tube(name,points,radius,mat,bone,group='Body',sides=10):
    points=[Vector(p) for p in points];verts=[];faces=[]
    for j,p in enumerate(points):
        tangent=(points[min(j+1,len(points)-1)]-points[max(j-1,0)]).normalized()
        ref=Vector((1,0,0)) if abs(tangent.x)<.9 else Vector((0,1,0))
        u=tangent.cross(ref).normalized();w=tangent.cross(u).normalized()
        for i in range(sides):
            a=2*math.pi*i/sides;r=radius[j] if isinstance(radius,list) else radius
            verts.append(tuple(p+r*(u*math.cos(a)+w*math.sin(a))))
    for j in range(len(points)-1):
        for i in range(sides):
            a=j*sides+i;b=j*sides+(i+1)%sides;faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple((len(points)-1)*sides+i for i in range(sides))])
    return create(name,verts,faces,mat,weights_at(bone),group)

def limb(name,points,radii,mat,bones,group='Body',sides=24):
    # Smooth continuous sleeve/trouser tube, blended through the actual joint.
    a,b,c=[Vector(p) for p in points];verts=[];weights=[];faces=[]
    ts=[0,.06,.17,.31,.43,.48,.52,.57,.66,.80,.93,1]
    for t in ts:
        p=a.lerp(b,t*2) if t<=.5 else b.lerp(c,(t-.5)*2)
        direction=(b-a).normalized().lerp((c-b).normalized(),max(0,min(1,(t-.4)*5))).normalized()
        u=Vector((1,0,0));u=(u-direction*direction.dot(u)).normalized();w=u.cross(direction).normalized()
        r=radii[0]*(1-t*2)+radii[1]*t*2 if t<.5 else radii[1]*(2-t*2)+radii[2]*(t*2-1)
        blend=max(0,min(1,(t-.43)/.14));blend=blend*blend*(3-2*blend)
        for i in range(sides):
            ang=2*math.pi*i/sides
            wrinkle=1+(.022*math.cos(ang*3+t*50) if .35<t<.66 else .008*math.sin(ang*4))
            verts.append(tuple(p+r*wrinkle*(u*math.cos(ang)+w*math.sin(ang)*1.08)))
            weights.append({bones[0]:1-blend,bones[1]:blend})
    for j in range(len(ts)-1):
        for i in range(sides):
            aidx=j*sides+i;bidx=j*sides+(i+1)%sides;faces.append((aidx,aidx+sides,bidx+sides,bidx))
    faces.extend([tuple(reversed(range(sides))),tuple((len(ts)-1)*sides+i for i in range(sides))])
    return create(name,verts,faces,mat,weights,group)

# A shaped jacket with an actual shoulder/chest/waist silhouette.
loft('Jacket',[(.94,.137,.083,.085,0),(.962,.151,.091,.093,0),(1.00,.156,.093,.100,0),
 (1.08,.148,.09,.106,0),(1.20,.167,.111,.116,0),(1.32,.183,.105,.101,0),
 (1.39,.188,.080,.073,0),(1.425,.165,.058,.055,0),(1.45,.080,.048,.048,0)],'jacket','Spine')
loft('JacketHem',[(.94,.14,.084,.086,0),(.952,.150,.092,.096,0),(.976,.153,.094,.098,0)],'rib','Spine')
loft('StandCollar',[(1.428,.068,.051,.05,0),(1.465,.061,.047,.046,0),(1.474,.06,.045,.044,0)],'rib','Spine')
# Zipper tape, fine teeth, a pull tab, slanted pockets and seams.
tube('ZipperTape',[(0,.968,.094),(0,1.10,.099),(0,1.26,.110),(0,1.38,.084),(0,1.465,.047)],.006,'rib','Spine')
tube('Zipper',[(0,.97,.101),(0,1.10,.106),(0,1.26,.117),(0,1.38,.091),(0,1.465,.054)],.0018,'zip','Spine',sides=6)
for s in [-1,1]:
    tube('PocketWelt',[(s*.085,1.075,.084),(s*.106,1.16,.083)],.004,'rib','Spine')
    tube('ShoulderSeam',[(s*.068,1.434,.040),(s*.125,1.426,.042),(s*.178,1.402,.050)],.0012,'seam','Spine',sides=6)
    tube('SidePanel',[(s*.14,.985,-.04),(s*.146,1.13,-.06),(s*.173,1.31,-.04)],.0012,'seam','Spine',sides=6)
tube('ZipPull',[(.003,1.418,.083),(.006,1.397,.091),(-.005,1.395,.091),(-.004,1.418,.083)],.0025,'zip','Spine',sides=6)

loft('TrouserHips',[(.865,.115,.071,.085,0),(.91,.153,.092,.102,0),(.972,.151,.084,.093,0),(.99,.14,.075,.09,0)],'pants','Hips')
for side,s in [('L',1),('R',-1)]:
    thigh=bone_specs[f'Thigh_{side}'][0];knee=bone_specs[f'Shin_{side}'][0];ankle=bone_specs[f'Foot_{side}'][0]
    limb('Trousers_'+side,[thigh,knee,ankle],[.091,.064,.046],'pants',[f'Thigh_{side}',f'Shin_{side}'])
    ellipsoid('HipTransition_'+side,(s*.105,.947,0),(.093,.096,.103),'pants',f'Thigh_{side}',segments=24,rings=14)
    tube('TrouserSeam_'+side,[(s*.185,.92,0),(s*.180,.74,.01),(s*.176,.56,.015)],.0015,'pants_seam',f'Thigh_{side}',sides=6)
    tube('TrouserSeamLower_'+side,[(s*.174,.53,.018),(s*.172,.37,.02),(s*.159,.16,.025)],.0015,'pants_seam',f'Shin_{side}',sides=6)
    a=bone_specs[f'UpperArm_{side}'][0];b=bone_specs[f'Forearm_{side}'][0];c=bone_specs[f'Hand_{side}'][0]
    limb('Sleeve_'+side,[a,b,c],[.073,.054,.034],'jacket',[f'UpperArm_{side}',f'Forearm_{side}'])
    ellipsoid('ShoulderYoke_'+side,(s*.173,1.408,0),(.086,.083,.078),'jacket',f'UpperArm_{side}',segments=28,rings=16)
    direction=(Vector(c)-Vector(b)).normalized()
    tube('Cuff_'+side,[tuple(Vector(c)-direction*.04),tuple(Vector(c)+direction*.005)],.038,'rib',f'Forearm_{side}',sides=24)
    # Shoes are shaped soles and uppers, not box feet. All detail remains bound to foot bone.
    x,y,z=ankle;bn=f'Foot_{side}'
    ellipsoid('Sole_'+side,(x,y-.071,z+.048),(.058,.021,.141),'sole',bn,'Shoes',32,12)
    ellipsoid('Outsole_'+side,(x,y-.085,z+.048),(.057,.010,.138),'rubber',bn,'Shoes',32,10)
    ellipsoid('CanvasUpper_'+side,(x,y-.043,z+.044),(.054,.048,.129),'shoe',bn,'Shoes',32,14)
    ellipsoid('AnkleOpening_'+side,(x,y-.009,z-.008),(.042,.009,.05),'rubber',bn,'Shoes',24,8)
    ellipsoid('ShoeTongue_'+side,(x,y-.003,z+.026),(.034,.010,.061),'shoe',bn,'Shoes',24,8)
    for j in range(5):
        zz=z+.016+j*.017;yy=y-.003-j*.004
        tube('Lace_'+side,[(x-.027,yy,zz),(x+.027,yy+.003,zz+.013)],.002,'lace',bn,'Shoes',6)
        tube('Lace_'+side,[(x+.027,yy,zz),(x-.027,yy+.003,zz+.013)],.002,'lace',bn,'Shoes',6)
    tube('HeelPull_'+side,[(x-.012,y-.015,z-.067),(x-.012,y+.017,z-.063),(x+.012,y+.017,z-.063),(x+.012,y-.015,z-.067)],.004,'rib',bn,'Shoes',8)
    # Anatomical palms, then four individually curled fingers and an opposing thumb.
    x,y,z=c;bn=f'Hand_{side}'
    ellipsoid('Palm_'+side,(x,y-.002,z+.028),(.041,.020,.052),'skin',bn,'Hands',24,12)
    for j in range(4):
        xx=x+(j-1.5)*.019;length=[.073,.083,.080,.068][j]
        tube('Finger_'+side,[(xx,y+.002,z+.035),(xx,y-.004,z+length),(xx,y-.027,z+length+.005),(xx,y-.044,z+length-.010),(xx,y-.041,z+length-.028)],
             [.010,.0095,.009,.008,.007],'skin',bn,'Hands',10)
    tube('Thumb_'+side,[(x-s*.027,y-.006,z+.007),(x-s*.050,y-.018,z+.025),(x-s*.041,y-.043,z+.037),(x-s*.026,y-.039,z+.048)],
         [.015,.014,.012,.010],'skin',bn,'Hands',12)

# Neck, shaped jaw/cheeks/forehead, small facial features, hairline and ears.
ellipsoid('Neck',(0,1.504,.015),(.047,.08,.046),'skin','Neck','Neck')
loft('Face',[(1.531,.025,.034,.029,.035),(1.545,.048,.057,.036,.027),(1.57,.063,.065,.055,.022),
 (1.60,.075,.069,.071,.019),(1.635,.082,.071,.079,.017),(1.668,.080,.074,.084,.013),
 (1.705,.077,.076,.083,.009),(1.738,.057,.061,.065,.005),(1.754,.021,.025,.029,.003)],'skin','Head','Head',40)
for s in [-1,1]:
    ellipsoid('Ear',(s*.082,1.625,.001),(.016,.032,.020),'skin','Head','Head',20,12)
    ellipsoid('EarInset',(s*.090,1.626,.007),(.008,.020,.014),'lip','Head','Head',16,10)
    ellipsoid('EyeSocket',(s*.030,1.667,.081),(.027,.012,.009),'lip','Head','Head',24,10)
    ellipsoid('Eye',(s*.030,1.668,.086),(.023,.008,.005),'eye','Head','Head',24,10)
    ellipsoid('Iris',(s*.030,1.668,.090),(.0065,.0065,.0023),'iris','Head','Head',16,10)
    tube('UpperLid',[(s*.011,1.670,.087),(s*.029,1.676,.090),(s*.050,1.669,.085)],.002,'skin','Head','Head',8)
    tube('Brow',[(s*.012,1.690,.085),(s*.030,1.694,.088),(s*.051,1.687,.080)],.0034,'hair','Head','Head',8)
    tube('Sideburn',[(s*.074,1.695,.003),(s*.078,1.663,.006),(s*.078,1.648,.006)],.006,'hair','Head','Head',8)
# Nose bridge narrows up the face and finishes in a soft asymmetric-looking plane.
ellipsoid('NoseBridge',(0,1.651,.087),(.012,.028,.012),'skin','Head','Head',20,14)
ellipsoid('NoseTip',(0,1.632,.102),(.016,.011,.016),'skin','Head','Head',20,12)
for s in [-1,1]:ellipsoid('Nostril',(s*.012,1.625,.099),(.005,.0028,.004),'lip','Head','Head',12,8)
tube('Mouth', [(-.022,1.591,.082),(-.010,1.593,.089),(0,1.591,.091),(.010,1.593,.089),(.022,1.591,.082)],.0017,'lip','Head','Head',8)
ellipsoid('LowerLip',(0,1.586,.085),(.020,.004,.005),'lip','Head','Head',20,8)

# A commuter helmet with a distinct edge, crown ribs, vent insets, and chin straps.
loft('HelmetShell',[(1.699,.089,.087,.100,.003),(1.711,.097,.098,.110,.002),
 (1.742,.095,.101,.108,0),(1.775,.079,.087,.092,-.002),(1.792,.051,.058,.063,-.003),(1.802,.01,.013,.015,-.004)],'helmet','Head','Helmet',48)
for i in [-2,-1,0,1,2]:
    x=i*.031
    tube('CrownVent',[(x*.84,1.766,.063),(x*.93,1.789-abs(i)*.007,.033),(x*.92,1.793-abs(i)*.007,-.015),(x*.80,1.773,-.063)],
         .008 if i else .006,'rubber','Head','Helmet',10)
for s in [-1,1]:
    tube('HelmetRim',[(s*.076,1.712,.065),(s*.094,1.710,.01),(s*.081,1.710,-.071)],.0035,'rubber','Head','Helmet',8)
    tube('HelmetStrap',[(s*.083,1.711,.039),(s*.071,1.61,.01),(s*.034,1.532,.043),(0,1.523,.04)],.0042,'rubber','Head','Helmet',8)
    tube('HelmetRearStrap',[(s*.077,1.711,-.074),(s*.071,1.61,.01)],.0034,'rubber','Head','Helmet',8)

# Join related skinned pieces while retaining separate head visibility for the first-person camera.
for group in ['Body','Head','Neck','Helmet','Hands','Shoes']:
    selected=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('asset_group')==group]
    bpy.ops.object.select_all(action='DESELECT')
    for o in selected:o.select_set(True)
    bpy.context.view_layer.objects.active=selected[0];bpy.ops.object.join()
    obj=bpy.context.object;obj.name='Rider_'+group
    obj.parent=None
    # Joining objects preserves their matching named weight groups.
    for mod in list(obj.modifiers):
        if mod.type=='ARMATURE':obj.modifiers.remove(mod)
    mod=obj.modifiers.new('RiderDeformation','ARMATURE');mod.object=rig;mod.use_deform_preserve_volume=True
    obj.data.validate();obj.data.update()

rig['author']='Original project asset, generated in Blender from build_rider.py'
rig['coordinate_system']='metres; glTF +Y up / +Z forward / +X rider left'
rig['runtime_animation']='Runtime two-bone IK and physical ragdoll, no animation clips'
# Select only the export asset. Scene lighting is purely a Blender preview convenience.
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects:
    if o.type in {'MESH','ARMATURE'}:o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(ROOT/'assets/rider/rider.raw.glb'),export_format='GLB',use_selection=True,
    export_animations=False,export_skins=True,export_yup=True,export_extras=True,export_apply=False)
(ROOT/'assets/rider/rest-pose.json').write_text(json.dumps({n:{'head':h,'tail':t,'parent':p} for n,(h,t,p) in bone_specs.items()},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/rider/commuter.blend'))
print('RIDER_EXPORT_COMPLETE',sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH'))
