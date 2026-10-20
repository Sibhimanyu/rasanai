"""Blender-native crew models, measured against the approved isolated references.

blender -b -P scripts/build.py -- Tara --render
Each asset has its own silhouette, welded skin, editable source construction,
ten-bone rig, eye morphs and five clips. Props are real, closed 3D meshes.
"""
import bpy, bmesh, math, sys, json
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion

ROOT=Path(__file__).resolve().parents[1]
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
NAME=next((a for a in ARGS if a in ['Tara','Kavi','Chitra']), 'Tara')
OUT=ROOT/NAME; OUT.mkdir(exist_ok=True)
(OUT/'renders').mkdir(exist_ok=True)
PI=math.pi
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
char=bpy.data.collections.new(NAME+' • export'); scene.collection.children.link(char)
source=bpy.data.collections.new('Construction • editable source'); scene.collection.children.link(source)
stage=bpy.data.collections.new('Stage • render only'); scene.collection.children.link(stage)
assignments={}

def collection(ob,col=char):
    for current in list(ob.users_collection): current.objects.unlink(ob)
    col.objects.link(ob)

def active(ob):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.context.view_layer.objects.active=ob

def apply(ob,mod):
    active(ob); bpy.ops.object.modifier_apply(modifier=mod.name)

def srgb(value):
    values=[int(value[i:i+2],16)/255 for i in [0,2,4]]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values)

def material(name,color,rough=.55,metal=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    m.diffuse_color=(*srgb(color),1)
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=m.diffuse_color
    p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
    p.inputs['Specular IOR Level'].default_value=.28
    return m

skin=material(NAME+' • soft matte clay',{'Tara':'203BD3','Kavi':'49377E','Chitra':'B82061'}[NAME],.57)
p=skin.node_tree.nodes.get('Principled BSDF')
p.inputs['Subsurface Weight'].default_value=.025
p.inputs['Subsurface Scale'].default_value=.025
eye_mat=material('Obsidian • glossy oval eyes','080B10',.20)
brow_mat=material('Deep indigo • brows and lashes','24223B',.63)
gold=material('Warm brushed brass','BE963F',.30,.72)
gold_dark=material('Antique brass edges','80602A',.40,.65)
ivory=material('Warm ivory','F3EEE2',.68)
dark=material('Charcoal strap and hair','29263E',.65)
silver=material('Pencil • brushed ferrule','B4B7BB',.34,.8)

def mesh(name,verts,faces,mat=None):
    data=bpy.data.meshes.new(name); data.from_pydata(verts,[],faces); data.update()
    ob=bpy.data.objects.new(name,data); char.objects.link(ob)
    if mat: data.materials.append(mat)
    for face in data.polygons: face.use_smooth=True
    return ob

def recalc(ob,close=False):
    bm=bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000005)
    if close: bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=0)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(ob.data); bm.free()

def grid(name,nu,nv,fn,mat,wrap=True,close=False):
    cols=nu if wrap else nu+1
    verts=[fn(i/nu,j/nv) for j in range(nv+1) for i in range(cols)]
    faces=[]
    for j in range(nv):
        for i in range(nu):
            a=j*cols+i; b=j*cols+(i+1)%cols
            faces.append((a,b,b+cols,a+cols))
    ob=mesh(name,verts,faces,mat); recalc(ob,close)
    return ob

def subdiv(ob,level=1):
    mod=ob.modifiers.new('Smooth silhouette','SUBSURF'); mod.levels=level
    return mod

def ellipsoid(name,center,radii,mat,bone='Body'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=28,location=center)
    ob=bpy.context.object; ob.name=name; ob.scale=radii
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    collection(ob); ob.data.materials.append(mat)
    for poly in ob.data.polygons: poly.use_smooth=True
    assignments[ob]=bone
    return ob

def box(name,center,size,mat,bevel=.025,bone='Body'):
    bpy.ops.mesh.primitive_cube_add(size=1,location=center)
    ob=bpy.context.object; ob.name=name; ob.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    collection(ob); ob.data.materials.append(mat)
    if bevel:
        mod=ob.modifiers.new('Soft machined corners','BEVEL'); mod.width=bevel; mod.segments=4
        mod=ob.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    assignments[ob]=bone
    return ob

def catmull(points,t):
    t=max(0,min(1,t)); q=t*(len(points)-1); i=min(int(q),len(points)-2); f=q-i
    a,b,c,d=[Vector(points[k]) for k in [max(0,i-1),i,i+1,min(i+2,len(points)-1)]]
    return .5*(2*b+(-a+c)*f+(2*a-5*b+4*c-d)*f*f+(-a+3*b-3*c+d)*f*f*f)

def curve(name,points,radius,mat,bone='Body'):
    data=bpy.data.curves.new(name,'CURVE'); data.dimensions='3D'
    data.bevel_depth=radius; data.bevel_resolution=3
    s=data.splines.new('POLY'); s.points.add(len(points)-1)
    for p,co in zip(s.points,points): p.co=(*co,1)
    ob=bpy.data.objects.new(name,data); char.objects.link(ob); data.materials.append(mat)
    assignments[ob]=bone
    return ob

def ring(name,center,rx,rz,radius,mat,bone='Body'):
    return curve(name,[(center[0]+rx*math.cos(i*2*PI/96),center[1],center[2]+rz*math.sin(i*2*PI/96)) for i in range(97)],radius,mat,bone)

def tube(name,points,radii,mat,bone='Body'):
    def point(u,v):
        center=catmull(points,v)
        tangent=(catmull(points,min(1,v+.002))-catmull(points,max(0,v-.002))).normalized()
        seed=Vector((0,1,0))
        if abs(tangent.dot(seed))>.95: seed=Vector((1,0,0))
        n=tangent.cross(seed).normalized(); b=tangent.cross(n).normalized()
        r=max(.0001,catmull([(r,0) for r in radii],v).x)
        return center+r*(math.cos(u*2*PI)*n+math.sin(u*2*PI)*b)
    ob=grid(name,32,40,point,mat,close=True); assignments[ob]=bone
    return ob

def copy_source(ob):
    new=ob.copy(); new.data=ob.data.copy(); source.objects.link(new)
    new.name='Source '+ob.name; new.hide_render=True

def signpow(x,p): return math.copysign(abs(x)**p,x)

CHITRA_PROFILE=[(0,.14),(.29,.17),(.48,.27),(.60,.44),(.64,.68),(.60,.94),(.50,1.18),(.35,1.43),(.17,1.64),(0,1.78)]
def body_point(u,v):
    a=2*PI*u
    if NAME=='Tara':
        r=.55*math.sqrt(max(0,4*v*(1-v))); z=.13+1.10*v
        return (r*math.sin(a),-.86*r*math.cos(a),z)
    if NAME=='Kavi':
        lat=(v-.5)*PI; r=abs(math.cos(lat))**.34
        z=1.11+.95*signpow(math.sin(lat),.34)
        return (.49*r*signpow(math.sin(a),.36),-.33*r*signpow(math.cos(a),.36),z)
    r,z=catmull(CHITRA_PROFILE,v); r=max(0,r)
    shift=.06*(max(0,(z-1.0)/.78))**2
    return (r*math.sin(a)+shift,-.72*r*math.cos(a),z)

def face_y(x,z):
    if NAME=='Tara':
        return -.473*math.sqrt(max(.02,1-(x/.55)**2-((z-.68)/.55)**2))-.015
    if NAME=='Kavi':
        return -.33*max(.02,1-(abs(x)/.49)**(2/.36))**(.36/2)-.014
    closest=min((catmull(CHITRA_PROFILE,i/500) for i in range(501)),key=lambda p:abs(p.y-z))
    r=max(.03,closest.x)
    return -.72*math.sqrt(max(.002,r*r-x*x))-.015

ARM_PATHS={
 'Tara':{'R':[(-.46,-.06,.64),(-.56,-.12,.56),(-.62,-.18,.44),(-.60,-.21,.46)],
         'L':[(.46,-.06,.64),(.56,-.12,.56),(.62,-.18,.44),(.60,-.21,.46)]},
 'Kavi':{'R':[(-.44,-.02,.69),(-.56,-.17,.56),(-.53,-.40,.61),(-.39,-.49,.65)],
         'L':[(.44,-.02,.68),(.58,-.15,.59),(.57,-.35,.59),(.53,-.41,.64)]},
 'Chitra':{'R':[(-.48,-.08,.72),(-.63,-.36,.48),(-.45,-.64,.48),(-.29,-.65,.54)],
           'L':[(.54,-.06,.65),(.65,-.18,.66),(.68,-.28,.71),(.64,-.32,.76)]},
}[NAME]
body=grid('Skin • custom silhouette and welded shoulders',96,100,body_point,skin)
parts=[body]
arm_radius={'Tara':.085,'Kavi':.105,'Chitra':.115}[NAME]
for side,points in ARM_PATHS.items():
    parts.append(tube('Construction arm.'+side,points,[arm_radius]*4,skin))
    parts.append(ellipsoid('Construction hand.'+side,points[-1],(arm_radius*1.24,arm_radius*1.08,arm_radius*1.12),skin))
for ob in parts:
    copy_source(ob); assignments.pop(ob,None)
active(body)
for ob in parts: ob.select_set(True)
bpy.ops.object.join()
mod=body.modifiers.new('Continuous organic shoulder union','REMESH'); mod.mode='VOXEL'
mod.voxel_size=.012; mod.use_smooth_shade=True; apply(body,mod)
mod=body.modifiers.new('Relax welded skin','SMOOTH'); mod.factor=1; mod.iterations=5; apply(body,mod)
recalc(body)
bm=bmesh.new(); bm.from_mesh(body.data)
assert all(e.is_manifold for e in bm.edges),'Open skin surface'
seen=set(); count=0
for vert in bm.verts:
    if vert in seen: continue
    count+=1; stack=[vert]; seen.add(vert)
    while stack:
        current=stack.pop()
        for edge in current.link_edges:
            other=edge.other_vert(current)
            if other not in seen: seen.add(other); stack.append(other)
assert count==1,f'Disconnected skin: {count}'
bm.free()
subdiv(body)
foot_x={'Tara':.23,'Kavi':.23,'Chitra':.25}[NAME]
for side,sgn in [('R',-1),('L',1)]:
    ellipsoid('Foot.'+side,(sgn*foot_x,-.035,.095 if NAME!='Tara' else .075),(.13,.18,.095) if NAME!='Tara' else (.125,.15,.075),skin,'Foot.'+side)

eye_z={'Tara':.84,'Kavi':1.47,'Chitra':1.26}[NAME]
eye_x={'Tara':.18,'Kavi':.205,'Chitra':.18}[NAME]
eyes={}; brows={}
for side,sgn in [('R',-1),('L',1)]:
    x=sgn*eye_x; y=face_y(x,eye_z)
    eyes[side]=ellipsoid('Eye.'+side,(x,y-.020-(.055 if NAME=='Tara' and side=='R' else 0),eye_z),(.044,.034,.098),eye_mat,'Eye.'+side)
    z=eye_z+(.26 if NAME=='Kavi' else .17)
    points=[]
    for j in range(33):
        t=j/32; xx=x+(t-.5)*.12
        zz=z+.025*math.sin(PI*t)+sgn*.012*(t-.5)
        points.append((xx,face_y(xx,zz)-.016,zz))
    radius=.010 if NAME=='Tara' else .011 if NAME=='Chitra' else .014
    brows[side]=curve('Brow.'+side,points,radius,brow_mat,'Brow.'+side)
    for t in [0,1]: ellipsoid('Brow rounded end.'+side+str(t),points[int(t*32)],(radius,)*3,brow_mat,'Brow.'+side)
    eye=eyes[side]; eye.shape_key_add(name='Basis'); blink=eye.shape_key_add(name='Blink')
    for vert in blink.data: vert.co.z*=.055
    if NAME=='Chitra':
        start=(x+sgn*.024,y-.025,eye_z+.067)
        end=(x+sgn*.084,y+.004,eye_z+.112)
        tube('Lash.'+side,[start,(x+sgn*.055,y-.025,eye_z+.062),(x+sgn*.079,y-.012,eye_z+.077),end],[.010,.011,.007,.001],brow_mat,'Eye.'+side)

if NAME=='Tara':
    strap=grid('Eyepiece • fitted continuous head strap',160,8,
        lambda u,v:(.538*math.sin(-.05+u*(2*PI-.60)),-.462*math.cos(-.05+u*(2*PI-.60)),.835+.025*math.sin(-.05+u*(2*PI-.60))+(v-.5)*.045),dark,wrap=False)
    m=strap.modifiers.new('Leather thickness','SOLIDIFY'); m.thickness=.012
    assignments[strap]='Body'
    cx=-eye_x; cz=eye_z
    def housing(name,back,front,outer,inner,mat):
        points=[(outer,back),(outer,front),(inner,front),(inner,back),(outer,back)]
        ob=grid(name,96,20,lambda u,v:(cx+catmull(points,v).x*math.cos(2*PI*u),catmull(points,v).y,cz+catmull(points,v).x*math.sin(2*PI*u)),mat)
        assignments[ob]='Body'; subdiv(ob); return ob
    housing('Eyepiece • charcoal eye cup',-.432,-.49,.159,.112,dark)
    housing('Eyepiece • solid hollow brass barrel',-.48,-.615,.144,.111,gold_dark)
    ring('Eyepiece • rounded front rim',(cx,-.626,cz),.129,.129,.016,gold)
    ring('Eyepiece • rear brass trim',(cx,-.486,cz),.145,.145,.010,gold)
    lens=material('Eyepiece • blue optical glass','98C5E3',.08,0)
    lp=lens.node_tree.nodes.get('Principled BSDF')
    # A lightly tinted protective window keeps the eye readable in both Cycles
    # and glTF. Alpha supplies thin-window coverage; the lens remains real volume.
    lp.inputs['Transmission Weight'].default_value=0; lp.inputs['IOR'].default_value=1.45
    lp.inputs['Alpha'].default_value=.025
    ellipsoid('Eyepiece • convex lens',(cx,-.619,cz),(.109,.012,.109),lens)
    for x in [cx-.162,cx+.162]:
        box('Eyepiece • strap buckle',(x,-.46,cz),(.032,.055,.10),gold,.012)
    box('Eyepiece • left hinge connection',(cx-.162,-.408,cz),(.033,.115,.052),gold_dark,.010)

if NAME=='Kavi':
    for side,sgn in [('R',-1),('L',1)]:
        x=sgn*eye_x
        ring('Glasses • round brass frame.'+side,(x,-.379,eye_z+.015),.155,.178,.014,gold)
        pts=[(x+sgn*.15,-.376,eye_z+.055),(sgn*.43,-.30,eye_z+.08),(sgn*.47,-.02,eye_z+.065),(sgn*.43,.15,eye_z+.025)]
        curve('Glasses • temple.'+side,[catmull(pts,j/64) for j in range(65)],.010,gold)
    curve('Glasses • arched bridge',[(-.04+j/48*.08,-.382,eye_z+.024+.024*math.sin(j/48*PI)) for j in range(49)],.012,gold)
    # A continuous U-shaped beard with fine overlapping locks and two moustache
    # sweeps. No upper ring of upright locks that could read as teeth or a mouth.
    tube('Beard • continuous curved base',[(-.14,-.35,1.16),(-.17,-.365,1.04),(0,-.37,.96),(.17,-.365,1.04),(.14,-.35,1.16)],[.026,.039,.041,.039,.026],dark)
    for i in range(23):
        a=PI+PI*i/22
        x=.145*math.cos(a); z=1.12+.105*math.sin(a)
        length=.045+.025*(-math.sin(a))
        points=[(x,-.353,z+.025),(x*1.08,-.384,z),(x*.96,-.393,z-length),(x*.86,-.370,z-length-.012)]
        tube('Beard • sculpted lock %02d'%i,points,[.021,.025,.017,.001],dark)
    for sgn in [-1,1]:
        tube('Beard • swept moustache',[(0,-.373,1.22),(sgn*.055,-.399,1.22),(sgn*.12,-.392,1.18),(sgn*.16,-.36,1.15)],[.012,.031,.026,.002],dark)
    # A single pointed, six-sided pencil; all pieces share its exact axis.
    yellow=material('Pencil • yellow lacquer','F2BC22',.42)
    wood=material('Pencil • sharpened cedar','D7B477',.72)
    graphite=material('Pencil • graphite point','272A30',.45)
    pink=material('Pencil • pink eraser','E98089',.70)
    bottom=Vector((-.52,-.48,.27)); top=Vector((-.69,-.39,1.65))
    axis=(top-bottom).normalized(); length=(top-bottom).length
    n=axis.cross(Vector((0,1,0))).normalized(); b=axis.cross(n)
    def pencil_section(name,stations,mat):
        verts=[]
        for h,r in stations:
            for i in range(6): verts.append(bottom+axis*h+r*(math.cos(i*PI/3)*n+math.sin(i*PI/3)*b))
        faces=[]
        for j in range(len(stations)-1):
            for i in range(6): faces.append((j*6+i,j*6+(i+1)%6,(j+1)*6+(i+1)%6,(j+1)*6+i))
        faces.extend([tuple(reversed(range(6))),tuple((len(stations)-1)*6+i for i in range(6))])
        ob=mesh(name,verts,faces,mat); recalc(ob); assignments[ob]='Arm.R'
        for poly in ob.data.polygons: poly.use_smooth=False
        bevel=ob.modifiers.new('Fine pencil edges','BEVEL'); bevel.width=.002; bevel.segments=2
        return ob
    pencil_section('Pencil • one graphite tip',[(0,.001),(.055,.018)],graphite)
    pencil_section('Pencil • sharpened wood',[(.045,.015),(.18,.049)],wood)
    pencil_section('Pencil • hexagonal lacquer shaft',[(.18,.049),(length-.18,.049)],yellow)
    pencil_section('Pencil • metal ferrule',[(length-.18,.051),(length-.08,.051)],silver)
    pencil_section('Pencil • pink eraser',[(length-.08,.048),(length-.012,.048),(length,.039)],pink)
    for h in [length-.163,length-.14,length-.112]:
        center=bottom+axis*h
        curve('Pencil • ferrule crimp',[center+.052*(math.cos(i/64*2*PI)*n+math.sin(i/64*2*PI)*b) for i in range(65)],.0025,silver,'Arm.R')

if NAME=='Chitra':
    hair=material('Crest • magenta clay','BF2865',.52)
    hair_high=material('Crest • raised brush ridges','D73D7B',.54)
    hair_dark=material('Crest • recessed strands','A91E5B',.61)
    orange=material('Crest • warm orange sweep','F29A4F',.55)
    stations=[(-.43,1.27,.018,.035),(-.18,1.58,.15,.10),(.13,1.88,.18,.12),(.17,2.10,.14,.105),(-.01,2.25,.085,.065),(-.19,2.25,.025,.028),(-.25,2.21,.001,.001)]
    def crest_point(u,v,offset=0,depth=0,width=1):
        x,z,w,d=catmull(stations,v)
        previous=catmull(stations,max(0,v-.002)); following=catmull(stations,min(1,v+.002))
        tangent=Vector((following.x-previous.x,0,following.y-previous.y)).normalized()
        side=Vector((tangent.z,0,-tangent.x))
        center=Vector((x+offset,-.11+depth,z))
        return center+side*(max(.0005,w)*width*math.cos(2*PI*u))+Vector((0,max(.0005,d)*math.sin(2*PI*u),0))
    for label,offset,depth,width,mat in [('orange under-sweep',.105,.065,.84,orange),('main swept volume',0,0,1,hair),('left raised lock',-.045,-.045,.69,hair_high)]:
        ob=grid('Crest • '+label,64,80,lambda u,v,o=offset,d=depth,w=width:crest_point(u,v,o,d,w),mat,close=True)
        subdiv(ob); assignments[ob]='Body'
    for k in range(4):
        pts=[crest_point(.64+k*.052,.08+j/80*.82,-.045,-.048,.69) for j in range(81)]
        curve('Crest • sculpted groove %02d'%k,pts,.0035,hair_dark)
    # Three separate crafted swatch cards, with inset paint panels and a pivot.
    pivot=Vector((-.24,-.62,.68))
    palettes=[('F0BE82','D89470'),('FFAE70','F18E5B'),('BA2B67','8D164E')]
    for i,angle in enumerate([-.42,-.04,.36]):
        q=Quaternion((0,1,0),angle)
        layer=pivot+Vector((0,-.028*i,0))
        card=box('Swatch • ivory card %d'%i,layer+q@Vector((0,0,.20)),(.17,.022,.42),ivory,.014,'Arm.R')
        card.rotation_mode='QUATERNION'; card.rotation_quaternion=q
        for j,color in enumerate(palettes[i]):
            panel=box('Swatch • paint %d.%d'%(i,j),layer+q@Vector((0,-.015,.18+j*.16)),(.142,.006,.138),material('Paint '+color,color,.72),.008,'Arm.R')
            panel.rotation_mode='QUATERNION'; panel.rotation_quaternion=q
    ellipsoid('Swatches • brass pivot',pivot+Vector((0,-.084,.028)),(.016,.008,.016),gold,'Arm.R')

# Retain the actual accessory construction and modifiers before rig/export baking.
for ob in list(char.objects):
    if ob!=body and not ob.name.startswith('Foot.') and not ob.name.startswith('Eye.'):
        copy_source(ob)
source.hide_viewport=True; source.hide_render=True

# A common small rig, with separate controls for face, feet and arm gestures.
data=bpy.data.armatures.new(NAME+' • deformation skeleton')
rig=bpy.data.objects.new(NAME+'Rig',data); char.objects.link(rig)
active(rig); bpy.ops.object.mode_set(mode='EDIT')
def bone(name,head,tail,parent=None):
    b=data.edit_bones.new(name); b.head=head; b.tail=tail
    if parent: b.parent=data.edit_bones[parent]
bone('Root',(0,0,0),(0,0,.10))
bone('Body',(0,0,.13),(0,0,eye_z),'Root')
for side in ['R','L']:
    start=Vector(ARM_PATHS[side][0]); end=Vector(ARM_PATHS[side][-1])
    bone('Arm.'+side,start,end,'Body')
    foot=bpy.data.objects['Foot.'+side].location.copy()
    bone('Foot.'+side,foot,foot+Vector((0,-.12,0)),'Root')
    origin=eyes[side].location.copy()
    bone('Eye.'+side,origin,origin+Vector((0,0,.09)),'Body')
    origin=Vector(((-1 if side=='R' else 1)*eye_x,face_y(eye_x,eye_z+.17),eye_z+.17))
    bone('Brow.'+side,origin,origin+Vector((0,0,.08)),'Body')
bpy.ops.object.mode_set(mode='OBJECT')
rig.show_in_front=True
for pb in rig.pose.bones: pb.rotation_mode='QUATERNION'

groups={name:body.vertex_groups.new(name=name) for name in ['Body','Arm.R','Arm.L']}
limit={'Tara':.43,'Kavi':.42,'Chitra':.50}[NAME]
for vert in body.data.vertices:
    side='R' if vert.co.x<0 else 'L'
    path=[catmull(ARM_PATHS[side],i/32) for i in range(33)]
    distance=min((vert.co-point).length for point in path)
    w=max(0,min(1,(abs(vert.co.x)-limit)/.13))
    w*=1-max(0,min(1,(distance-arm_radius*.9)/.14))
    groups['Body'].add([vert.index],1-w,'REPLACE')
    if w>0: groups['Arm.'+side].add([vert.index],w,'REPLACE')
active(body)
for v in body.data.vertices: v.select=True
bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
bpy.ops.object.vertex_group_smooth(group_select_mode='ALL',factor=.7,repeat=5)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
bpy.ops.object.mode_set(mode='OBJECT')

def bind(ob):
    mod=ob.modifiers.new('Crew skeleton','ARMATURE'); mod.object=rig; ob.parent=rig
    if ob==body and len(ob.modifiers)>1:
        active(ob); bpy.ops.object.modifier_move_up(modifier=mod.name)
bind(body)
for ob,name in list(assignments.items()):
    if ob.name not in char.objects: continue
    world=ob.matrix_world.copy()
    if ob not in eyes.values():
        active(ob); bpy.ops.object.convert(target='MESH')
    ob.data.transform(world,shape_keys=True); ob.matrix_world=Matrix.Identity(4)
    group=ob.vertex_groups.new(name=name); group.add(list(range(len(ob.data.vertices))),1,'REPLACE')
    bind(ob)

def smooth(a,b,x):
    u=max(0,min(1,(x-a)/(b-a))); return u*u*(3-2*u)
def reset():
    for pb in rig.pose.bones:
        pb.location=(0,0,0); pb.rotation_quaternion=(1,0,0,0); pb.scale=(1,1,1)
    for ob in eyes.values(): ob.data.shape_keys.key_blocks['Blink'].value=0
    bpy.context.view_layer.update()
def translate(name,delta):
    pb=rig.pose.bones[name]; pb.location=pb.bone.matrix_local.to_3x3().inverted()@Vector(delta)
def rotate(name,axis,angle):
    pb=rig.pose.bones[name]
    pb.rotation_quaternion=Quaternion(pb.bone.matrix_local.to_3x3().inverted()@Vector(axis),angle)
def strip(owner,action,name,end):
    ad=owner.animation_data_create(); ad.action=None
    track=ad.nla_tracks.new(); track.name=name
    st=track.strips.new(name,1,action); st.action_frame_end=end; st.extrapolation='NOTHING'; track.mute=True

scene.render.fps=30
CLIPS={'IdleBreathing':90,'Blink':24,'LookAround':90,'Wave':90,'Walk':60}
blink_samples={s:[] for s in eyes}
for name,end in CLIPS.items():
    reset(); action=bpy.data.actions.new(name); rig.animation_data_create().action=action
    morph_actions={}
    if name=='Blink':
        for side,ob in eyes.items():
            a=bpy.data.actions.new('Blink.morph.'+side); ob.data.shape_keys.animation_data_create().action=a
            morph_actions[side]=a
    for frame in range(1,end+1):
        scene.frame_set(frame); reset(); u=(frame-1)/(end-1)
        if name=='IdleBreathing':
            amount=1+.009*math.sin(u*2*PI)
            rig.pose.bones['Body'].scale=(1/math.sqrt(amount),amount,1/math.sqrt(amount))
        if name=='Blink':
            for ob in eyes.values(): ob.data.shape_keys.key_blocks['Blink'].value=1-smooth(.05,.17,abs(u-.5))
        if name=='LookAround':
            value=.025*math.sin(u*2*PI)*math.sin(PI*u)
            for side in eyes: translate('Eye.'+side,(value,0,0))
        if name=='Wave':
            weight=smooth(0,.22,u)*(1-smooth(.78,1,u))
            rotate('Arm.L',(0,1,0),-(.68+.09*math.sin(u*8*PI))*weight)
            rotate('Brow.L',(0,1,0),.07*weight)
        if name=='Walk':
            for side,sgn in [('L',1),('R',-1)]:
                translate('Foot.'+side,(0,sgn*.065*math.sin(u*4*PI),.032*max(0,sgn*math.cos(u*4*PI))))
            translate('Root',(0,0,.015*(1-math.cos(u*8*PI))))
        for pb in rig.pose.bones:
            for prop in ['location','rotation_quaternion','scale']: pb.keyframe_insert(prop,frame=frame,group=pb.name)
        for side,a in morph_actions.items():
            key=eyes[side].data.shape_keys.key_blocks['Blink']
            blink_samples[side].append(float(key.value)); key.keyframe_insert('value',frame=frame)
    strip(rig,action,name,end)
    for side,a in morph_actions.items(): strip(eyes[side].data.shape_keys,a,name,end)
rig.animation_data.action=None; scene.frame_set(1); reset(); scene.frame_end=90

# Matching cream studio, independent of the exported character.
scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=48
scene.cycles.use_denoising=True; scene.cycles.max_bounces=6
scene.world=bpy.data.worlds.new('Soft studio ambient'); scene.world.use_nodes=True
scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.72,.72,.72,1)
scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.23
scene.view_settings.view_transform='Standard'; scene.view_settings.look='None'; scene.view_settings.exposure=-.15
floor=box('Ground',(0,0,-.03),(200,200,.04),ivory,0); assignments.pop(floor,None); collection(floor,stage); floor.is_shadow_catcher=True
for label,pos,power,size,color in [
    ('Key',(-3,-4,5),420,3.5,(1,.97,.91)),('Fill',(3,-3,2.6),85,3,(.93,.96,1)),('Rim',(1,2,4),150,3,(1,1,.97))]:
    data=bpy.data.lights.new(label,'AREA'); data.energy=power; data.shape='DISK'; data.size=size; data.color=color
    ob=bpy.data.objects.new(label,data); stage.objects.link(ob); ob.location=pos
    ob.rotation_euler=(Vector((0,0,1))-ob.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('Reference camera'); camera=bpy.data.objects.new('Reference camera',data); stage.objects.link(camera); scene.camera=camera
data.type='ORTHO'; data.ortho_scale={'Tara':1.65,'Kavi':2.65,'Chitra':2.95}[NAME]
target=Vector((0,0,{'Tara':.62,'Kavi':1.10,'Chitra':1.20}[NAME]))
def camera_view(az):
    camera.location=target+Vector((math.sin(az)*8,-math.cos(az)*8,.07*8))
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera_view(-.20)
scene.render.resolution_x=800; scene.render.resolution_y=900; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'; scene.render.film_transparent=True
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D': area.spaces.active.region_3d.view_perspective='CAMERA'
rig['controls']='Root travel, Body squash/tilt, Arm.L/R gestures, Foot.L/R steps, Eye.L/R gaze + Blink morphs, Brow.L/R expression'
rig['reference']='../reference/'+NAME+'.png; approved isolated crew design'
scene['asset_notes']='Source imagery guides the geometry; no billboards or image planes. Hidden/back shapes are interpretations.'

bpy.ops.object.select_all(action='DESELECT')
for ob in char.objects: ob.select_set(True)
bpy.context.view_layer.objects.active=rig
asset_path=OUT/(NAME+'.glb')
bpy.ops.export_scene.gltf(filepath=str(asset_path),export_format='GLB',use_selection=True,export_apply=True,
    export_animations=True,export_animation_mode='NLA_TRACKS',export_skins=True,export_morph=True,
    export_morph_animation=True,export_rest_position_armature=True,export_force_sampling=True,
    export_frame_range=False,export_extras=True,export_yup=True)
exec(compile((ROOT.parent/'blender'/'scripts'/'write_morphs.py').read_text(),'write_morphs.py','exec'))
# Export evaluates animation tracks internally. Restore the explicit reference
# pose after its sampling pass, before saving the native project and rendering.
scene.frame_set(1); reset()
assert all(abs(value)<1e-6 for side in ['L','R'] for value in rig.pose.bones['Foot.'+side].location),'Reference feet must be planted'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(NAME+'.blend')))
(OUT/'clips.json').write_text(json.dumps({'fps':30,'clips':{k:{'frames':v,'seconds':(v-1)/30} for k,v in CLIPS.items()}},indent=2)+'\n')
if '--render' in ARGS:
    for label,az in [('reference',-.20),('three-quarter',-.70),('back',PI)]:
        camera_view(az); scene.render.filepath=str(OUT/'renders'/(label+'.png'))
        bpy.ops.render.render(write_still=True)
    camera_view(-.20)
print('CREW_BUILD_OK',NAME,len(body.data.vertices),'skin vertices',len(char.objects),'objects',flush=True)
