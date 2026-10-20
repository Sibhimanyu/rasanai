"""Editable Blender-native Rasan. Run with Blender --background --python scripts/build.py.

Coordinates: X screen-right, -Y character-front, Z up. Widest body radius = 1.
Construction surfaces are retained in a hidden collection before voxel welding.
"""
import bpy
import bmesh
import math
import sys
import json
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = '--preview' in ARGS
PI = math.pi
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for dat in list(bpy.data.collections):
    if dat.name != 'Collection':
        bpy.data.collections.remove(dat)
char = bpy.data.collections.get('Collection')
char.name = 'Rasan • export'
source = bpy.data.collections.new('Construction • editable source surfaces')
bpy.context.scene.collection.children.link(source)
stage = bpy.data.collections.new('Stage • Cycles only')
bpy.context.scene.collection.children.link(stage)

def move_collection(ob, col):
    for c in list(ob.users_collection): c.objects.unlink(ob)
    col.objects.link(ob)

def mesh(name, verts, faces, material=None, collection=char):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    if material: me.materials.append(material)
    for p in me.polygons: p.use_smooth = True
    return ob

def active(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob

def apply(ob, mod):
    active(ob)
    bpy.ops.object.modifier_apply(modifier=mod.name)

def sub(ob, n=1):
    m = ob.modifiers.new('Silhouette subdivision', 'SUBSURF')
    m.levels = n
    return m

def srgb(h):
    v = [int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(x/12.92 if x <= .04045 else ((x+.055)/1.055)**2.4 for x in v)

def mat(name, color, rough=.5, metal=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*srgb(color),1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = m.diffuse_color
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    return m

skin = mat('Golden clay • warm soft yellow', 'FFBE20', .54)
p = skin.node_tree.nodes.get('Principled BSDF')
p.inputs['Subsurface Weight'].default_value = .035
p.inputs['Subsurface Radius'].default_value = (1,.48,.18)
p.inputs['Subsurface Scale'].default_value = .035
p.inputs['Specular IOR Level'].default_value = .26
eye_mat = mat('Obsidian eyes', '080909', .22)
brow_mat = mat('Warm charcoal eyebrows', '282623', .62)
felt = mat('Charcoal woven wool', '29282B', .68)
fp = felt.node_tree.nodes.get('Principled BSDF')
fp.inputs['Sheen Weight'].default_value = .07
fp.inputs['Specular IOR Level'].default_value = .22
nodes = felt.node_tree.nodes
links = felt.node_tree.links
tex = nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = 45
tex.inputs['Detail'].default_value = 3
tex.inputs['Roughness'].default_value = .7
tex.inputs['Distortion'].default_value = 1.8
bump = nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .45
bump.inputs['Distance'].default_value = .0042
links.new(tex.outputs['Fac'], bump.inputs['Height']); links.new(bump.outputs['Normal'], fp.inputs['Normal'])
seam_mat = mat('Cap stitched seams', '141415', .85)
brass = mat('Antique gold snap', 'B58B32', .32, .7)
board_mat = mat('Slate • charcoal', '24262A', .61)
white_mat = mat('Ivory clapper markings', 'F4F1E9', .54)
metal_mat = mat('Brushed hinge pins', '858782', .37, .75)
line_mat = mat('Slate engraved rules', '33363A', .7)

def ellipsoid(name, center, radii, material, segments=48, rings=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=center)
    ob = bpy.context.object; ob.name = name; ob.scale = radii
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(material)
    for p in ob.data.polygons: p.use_smooth=True
    return ob

PROFILE = [(0,0),(.3,0),(.47,.004),(.58,.014),(.65,.03),(.73,.066),
(.79,.106),(.835,.146),(.87,.185),(.92,.265),(.954,.344),(.975,.423),
(.991,.503),(1,.62),(.992,.7),(.981,.78),(.964,.86),(.944,.94),(.921,1.02),
(.89,1.1),(.858,1.18),(.821,1.26),(.78,1.34),(.735,1.415),(.683,1.495),
(.623,1.574),(.5,1.7),(.363,1.8),(.228,1.86),(.1,1.892),(0,1.9)]

def catmull(points, t):
    q=t*(len(points)-1); i=min(int(q),len(points)-2); f=q-i
    a=Vector(points[max(0,i-1)]); b=Vector(points[i]); c=Vector(points[i+1]); d=Vector(points[min(i+2,len(points)-1)])
    return .5*((2*b)+(-a+c)*f+(2*a-5*b+4*c-d)*f*f+(-a+3*b-3*c+d)*f*f*f)

def grid(name, nu, nv, fn, material, wrap=True):
    cols=nu if wrap else nu+1
    vs=[fn(i/nu,j/nv) for j in range(nv+1) for i in range(cols)]
    fs=[]
    for j in range(nv):
        for i in range(nu):
            k=(i+1)%cols; a=j*cols+i; b=j*cols+k
            fs.append((a,b,b+cols,a+cols))
    ob=mesh(name,vs,fs,material)
    uv=ob.data.uv_layers.new(name='UVMap')
    for poly in ob.data.polygons:
        j,i=divmod(poly.index,nu)
        corners=[(i/nu,j/nv),((i+1)/nu,j/nv),((i+1)/nu,(j+1)/nv),(i/nu,(j+1)/nv)]
        for loop,co in zip(poly.loop_indices,corners): uv.data[loop].uv=co
    bm=bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(ob.data); bm.free()
    return ob

def head_shift(h):
    t=max(0,min(1,(h-1.0)/.9)); eased=t*t*(3-2*t)
    return .13*eased*eased

def head_lift(h):
    t=max(0,min(1,(h-1.55)/.35)); eased=t*t*(3-2*t)
    return .06*eased*eased

def body_pt(u,v):
    r,h=catmull(PROFILE,v); r=max(0,r)
    a=u*2*PI
    x=r*math.sin(a)+head_shift(h)
    depth=.80*r
    y=-math.cos(a)*(depth+.028*math.exp(-((h-.6)/.7)**2)*max(0,math.cos(a)))
    return (x,y,h+.16+head_lift(h))

body=grid('Skin • continuous body and arms',96,124,body_pt,skin)

# Swept organic limbs: three-dimensional cubic spines with variable girth.
ARM_PATHS={
    'R':[(-.69,-.40,1.06),(-.79,-.80,.95),(-.76,-1.02,.86),(-.56,-1.05,.98)],
    'L':[(.69,-.40,1.02),(.81,-.80,.90),(.76,-1.02,.78),(.52,-1.05,.82)],
}

def bezier(path,t):
    a,b,c,d=map(Vector,path)
    return (1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d

def sweep(name,path,material):
    def point(u,v):
        c=bezier(path,v)
        tangent=(bezier(path,min(1,v+.002))-bezier(path,max(0,v-.002))).normalized()
        n=tangent.cross(Vector((0,1,0))).normalized(); b=tangent.cross(n).normalized()
        radius=.14+.018*math.sin(PI*v)
        if v>.88: radius*=math.sqrt(max(.001,1-((v-.88)/.12)**2))
        return c+radius*(math.cos(u*2*PI)*n+math.sin(u*2*PI)*b)
    ob=grid(name,40,40,point,material)
    # Voxel union requires a closed volume; uncapped swept surfaces disappear and
    # leave disconnected mittens rather than a shoulder-connected limb.
    bm=bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=0)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(ob.data); bm.free()
    return ob

parts=[body]
for side,path in ARM_PATHS.items():
    parts.append(sweep('Construction arm.'+side,path,skin))
    hand=ellipsoid('Construction mitten.'+side,path[-1],(.285,.17,.205) if side=='R' else (.255,.18,.195),skin)
    hand.rotation_euler[1]=-.28 if side=='R' else .22
    parts.append(hand)

for ob in parts:
    duplicate=ob.copy(); duplicate.data=ob.data.copy(); source.objects.link(duplicate)
    duplicate.name='Source '+ob.name
    duplicate.hide_render=True
active(body)
for ob in parts: ob.select_set(True)
bpy.ops.object.join()
weld=body.modifiers.new('Seamless shoulder union • 0.014 units', 'REMESH')
weld.mode='VOXEL'; weld.voxel_size=.014; weld.use_smooth_shade=True
apply(body,weld)
relax=body.modifiers.new('Relax union without shrinking silhouette','SMOOTH')
relax.factor=1.2; relax.iterations=6
apply(body,relax)
# A skin must be one closed connected component before any deformation is added.
bm=bmesh.new(); bm.from_mesh(body.data)
seen=set(); components=[]
for v in bm.verts:
    if v in seen: continue
    todo=[v]; seen.add(v); component=[]
    while todo:
        current=todo.pop(); component.append(current)
        for edge in current.link_edges:
            other=edge.other_vert(current)
            if other not in seen: seen.add(other); todo.append(other)
    components.append(component)
small=[v for component in components if len(component)<100 for v in component]
if small: bmesh.ops.delete(bm,geom=small,context='VERTS')
large=[c for c in components if len(c)>=100]
if len(large)!=1: raise RuntimeError(f'Skin must be connected; found {len(large)} components')
if any(not e.is_manifold for e in bm.edges): raise RuntimeError('Skin has an open/nonmanifold edge')
bm.to_mesh(body.data); bm.free()
body['connected_components']=1
sub(body,1)
source.hide_render=True; source.hide_viewport=True

def radius_at(h):
    # Monotonic upper-body interpolation sufficient for facial surface placement.
    for (ra,ha),(rb,hb) in zip(PROFILE,PROFILE[1:]):
        if ha<=h<=hb and hb>ha: return ra+(rb-ra)*(h-ha)/(hb-ha)
    return .1

def surface(x,z,offset=.0):
    h=z-.16
    for _ in range(6): h=z-.16-head_lift(h)
    r=radius_at(h)
    local_x=x-head_shift(h)
    y=-.80*math.sqrt(max(.001,r*r-local_x*local_x))-.018-offset
    return (x,y,z)

face=[]
eyes={}; brows={}
for side,x in [('R',-.21),('L',.21)]:
    center=surface(x,1.57,.020)
    ob=ellipsoid('Eye.'+side,center,(.058,.042,.120),eye_mat)
    ob.rotation_euler[2]=-.20 if x<0 else .20
    # Blink shape targets remain independent of gaze bones and preserve volume at the lid.
    ob.shape_key_add(name='Basis')
    key=ob.shape_key_add(name='Blink')
    for v in key.data: v.co.z=v.co.z*.055-.025
    key.value=0
    eyes[side]=ob; face.append(ob)
    points=[]
    for k in range(17):
        t=k/16
        xx=x+(t-.5)*.15
        zz=1.795+.028*math.sin(t*PI)+(-.018 if side=='L' else .018)*(t-.5)
        points.append(surface(xx,zz,.020))
    # Capped tube, variable radius: rounded brow tips rather than flat-cut curves.
    def brow_point(u,v,points=points):
        c=catmull(points,v)
        tangent=(catmull(points,min(.999,v+.003))-catmull(points,max(.001,v-.003))).normalized()
        n=Vector((0,-1,0)); b=tangent.cross(n).normalized()
        rad=.014*max(.02,math.sin(PI*v))**.27
        return c+rad*(math.cos(u*2*PI)*n+math.sin(u*2*PI)*b)
    ob=grid('Brow.'+side,16,40,brow_point,brow_mat)
    sub(ob,1); brows[side]=ob; face.append(ob)

feet={}
for side,x in [('R',-.46),('L',.46)]:
    ob=ellipsoid('Foot.'+side,(x,-.06,.105),(.215,.27,.125),skin)
    # Gently flatten the support surface.
    for v in ob.data.vertices:
        if v.co.z<-.092: v.co.z=-.092+(v.co.z+.092)*.15
    feet[side]=ob

# Tailored cap is authored separately from the character body.
exec(compile((ROOT/'scripts'/'cap.py').read_text(),str(ROOT/'scripts'/'cap.py'),'exec'))

# Solid clapperboard. Individual diagonal inlays clipped to the rail boundary.
board=bpy.data.objects.new('Clapperboard • attachment',None); char.objects.link(board)
board.location=(-.055,-.96,.87)
board.rotation_euler=(.025,0,-.025)
def box(name,center,size,material,parent=None,bevel=.012):
    bpy.ops.mesh.primitive_cube_add(size=1,location=center)
    ob=bpy.context.object; ob.name=name; ob.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    ob.data.materials.append(material); ob.parent=parent
    if bevel:
        m=ob.modifiers.new('Rounded manufactured edges','BEVEL'); m.width=bevel; m.segments=3
        m=ob.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    return ob

slate=box('Slate • solid body',(0,0,-.04),(.72,.065,.36),board_mat,board,.022)
fixed=box('Clapper • lower striped rail',(0,-.001,.185),(.735,.075,.102),board_mat,board,.009)
hinge=bpy.data.objects.new('Clapper • actual hinge pivot',None); char.objects.link(hinge)
hinge.parent=board; hinge.location=(-.34,0,.241); hinge.rotation_euler[1]=-.34
upper=box('Clapper • articulated upper rail',(.34,0,.054),(.735,.075,.102),board_mat,hinge,.009)

def clip_poly(poly, axis, value, keep_less):
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        ina=(a[axis]<=value) if keep_less else (a[axis]>=value)
        inb=(b[axis]<=value) if keep_less else (b[axis]>=value)
        if ina: out.append(a)
        if ina!=inb:
            t=(value-a[axis])/(b[axis]-a[axis])
            out.append(tuple(a[i]+t*(b[i]-a[i]) for i in range(2)))
    return out

def stripes(parent,cx,z):
    for k in range(-4,6):
        x=k*.19
        poly=[(x-.055,-.048),(x+.037,-.048),(x+.105,.048),(x+.013,.048)]
        poly=clip_poly(poly,0,-.358,False)
        if poly: poly=clip_poly(poly,0,.358,True)
        if len(poly)<3: continue
        for front in [-1,1]:
            ob=mesh('Clapper • ivory diagonal inlay',[(a+cx,front*.039,b+z) for a,b in poly],[tuple(range(len(poly)))],white_mat)
            ob.parent=parent
stripes(board,0,.185); stripes(hinge,.34,.054)
for z in [-.10,.035]:
    box('Slate • recessed writing guide',(0,-.033,z),(.60,.001,.0015),line_mat,board,0)
# Hinge cheek forms one closed solid plate, with the top pin on the rotation axis.
vs=[(-.369,-.047,.132),(-.292,-.047,.132),(-.277,-.047,.179),(-.331,-.047,.273),(-.382,-.047,.273)]
plate=mesh('Clapper • hinge cheek',vs,[tuple(range(5))],board_mat); plate.parent=board
m=plate.modifiers.new('Hinge plate thickness','SOLIDIFY'); m.thickness=.018
m=plate.modifiers.new('Hinge cheek bevel','BEVEL'); m.width=.006; m.segments=3
for x,z in [(-.34,.241),(-.302,.165)]:
    ob=ellipsoid('Clapper • hinge rivet',(x,-.062,z),(.016,.008,.016),metal_mat,24,16); ob.parent=board

# Cycles studio is deliberately excluded from the character export collection.
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=48 if PREVIEW else 96
scene.cycles.use_denoising=True
scene.cycles.max_bounces=8
scene.world.color=(.25,.25,.25)
scene.world.use_nodes=True
scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.70,.70,.70,1)
scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.18
scene.view_settings.view_transform='Standard'
scene.view_settings.look='None'
scene.view_settings.exposure=-.20
floor_mat=mat('Warm porcelain backdrop','EEEAE1',.86)
floor=box('Ground',(0,0,-.025),(200,200,.02),floor_mat,None,0); move_collection(floor,stage)
floor.is_shadow_catcher=True

def area(name,pos,power,size,color):
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size; data.color=color
    ob=bpy.data.objects.new(name,data); stage.objects.link(ob); ob.location=pos
    ob.rotation_euler=(Vector((0,0,1.1))-ob.location).to_track_quat('-Z','Y').to_euler()
area('Key • large softbox',(-3.5,-4.5,5.5),500,3.5,(1,.97,.90))
area('Fill • broad front',(3,-4,2.8),60,3,(.93,.96,1))
area('Rim • crown separation',(1.5,2,4.5),180,3,(1,1,.96))

cam_data=bpy.data.cameras.new('Reference camera'); camera=bpy.data.objects.new('Reference camera',cam_data); stage.objects.link(camera)
scene.camera=camera
cam_data.type='ORTHO'; cam_data.ortho_scale=2.80
def set_camera(az=-.16,elev=.055):
    target=Vector((0,0,1.23))
    camera.location=target+Vector((math.sin(az)*8,-math.cos(az)*8,elev*8))
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
set_camera()
scene.render.resolution_x=900; scene.render.resolution_y=1000; scene.render.resolution_percentage=70 if PREVIEW else 100
scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
scene.render.film_transparent=True
scene.render.fps=30
scene.render.filepath=str(ROOT/'renders'/'reference.png')
scene['asset_notes']='Original reference: ../public/reference/rasan.png. X right, -Y front, Z up. See README.'

# Leave an inspectable reference camera view when opening the file.
for screen in bpy.data.screens:
    for area_ in screen.areas:
        if area_.type=='VIEW_3D':
            area_.spaces.active.region_3d.view_perspective='CAMERA'

# Later pipeline phases add rig/export/actions here after geometry review.
if '--rig' in ARGS:
    exec(compile((ROOT/'scripts'/'rig.py').read_text(),str(ROOT/'scripts'/'rig.py'),'exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Rasan.blend'))
if '--render' in ARGS:
    bpy.ops.render.render(write_still=True)
print('RASAN_BUILD_OK',len(body.data.vertices),'skin vertices')
