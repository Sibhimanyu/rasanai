"""Reference-led tailored flat/newsboy cap: lofted cloth crown and curled visor.

The measured profile is lifted into a real 3D roof, not an image plane. Each crown
station has an elliptical cross-section spanning up to 0.96 units in depth.
The visor is a separate curved shell anchored to the fitted band, with a rolled
edge and a dark underside. No primitive ellipsoids or discs are used.
Executed in build.py's namespace.
"""
hat=bpy.data.objects.new('Cap • attachment',None); char.objects.link(hat)
hat.location=(0,0,2.0)
hat['construction']='Measured longitudinal crown loft, fitted band and curled shell visor'

# Coordinates of the source photograph, in body-radius units after projection.
# x, crown top y, fitted band y, half-depth in world units.
CAP_STATIONS=[
    (147,174,174,0), (150,157,193,.09), (160,139,206,.20),
    (180,116,204,.30), (225,76,180,.40), (285,37,149,.47),
    (345,12,125,.48), (405,4,105,.45), (445,9,91,.39),
    (490,29,83,.30), (520,59,83,.18), (535,83,83,0),
]
az=-.16; elevation=.055
right=Vector((math.cos(az),math.sin(az),0))
up=Vector((-math.sin(az)*math.sin(elevation),math.cos(az)*math.sin(elevation),math.cos(elevation)))
normal=right.cross(up).normalized()

def cap_space(px,py,depth):
    sx=(px-380)/380
    sz=(843-py)/380+.16
    # Optional level-worn variant keeps the tailored profile instead of rotating a puck.
    if '--cap-level' in ARGS:
        sz-=.30*sx
    return right*sx+up*sz+normal*depth-Vector(hat.location)

def cap_station(t):
    p=catmull(CAP_STATIONS,t)
    # mathutils.Vector supports 4D station interpolation.
    return (p.x,p.y,max(p.y,p.z),max(0,p.w))

def crown_point(u,v):
    px,top,bottom,depth=cap_station(u)
    phi=v*PI
    height=bottom-top
    # A roof arch across the real front/back depth; the apex is a single smooth ridge.
    # Tiny panel fullness stays inside the measured silhouette.
    arch=math.sin(phi)**.88
    py=bottom-height*arch
    d=depth*math.cos(phi)
    return cap_space(px,py,d)

crown=grid('Cap • tailored longitudinal crown',100,48,crown_point,felt,False)
crown.parent=hat; sub(crown,1)
solid=crown.modifiers.new('Cloth shell thickness','SOLIDIFY'); solid.thickness=.016; solid.offset=-1

def band_point(u,v):
    # One perimeter: front left→right, then back right→left.
    front=u<.5
    t=u*2 if front else 2-u*2
    px,top,bottom,depth=cap_station(t)
    # Small, fitted strip under the crown, not a broad circular saucer.
    py=bottom+1+10*v
    d=(depth+.006*math.sin(PI*v))*(1 if front else -1)
    return cap_space(px,py,d)

band=grid('Cap • fitted band',160,6,band_point,felt)
band.parent=hat
solid=band.modifiers.new('Band thickness','SOLIDIFY'); solid.thickness=.014

def station_for_x(px):
    lo=0.; hi=1.
    for _ in range(22):
        mid=(lo+hi)/2
        if cap_station(mid)[0]<px: lo=mid
        else: hi=mid
    return cap_station((lo+hi)/2)

# Measured front lip, from the side snap around the curled outer end.
VISOR_LIP=[(242,173),(300,154),(380,120),(460,91),(520,86),
           (566,99),(591,121),(598,146),(583,175),
           (550,169),(510,132),(465,89)]
# The bill projects forward around the crown. Keeping its lip on the band's
# depth folds the far corner backward into an ear-like flap in profile.
VISOR_DEPTH=[.43,.55,.64,.69,.70,.68,.63,.55,.43,.24,-.03,-.35]
def brim_point(u,v):
    # The attachment follows the actual near-side → nose → far-side cap band.
    # A projected straight attachment leaves an unsupported, folded sheet in profile.
    theta=2.30-3.20*u
    attach_x=350+185*math.cos(theta)
    _,_,band_y,depth=station_for_x(attach_x)
    depth*=1 if math.sin(theta)>=0 else -1
    root=cap_space(attach_x,band_y+2,depth)
    lipx,lipy=catmull(VISOR_LIP,u)
    lip_depth=catmull([(value,0) for value in VISOR_DEPTH],u)[0]
    lip=cap_space(lipx,lipy,lip_depth)
    if u>=.999999: lip=root.copy()
    point=root.lerp(lip,v)
    point+=up*(.020*math.sin(PI*v)*math.sin(PI*u))
    return point

brim=grid('Cap • curved stiffened visor',96,20,brim_point,felt,False)
brim.parent=hat; sub(brim,1)
inside=mat('Cap • warm dark visor underside','241D16',.86)
brim.data.materials.append(inside)
solid=brim.modifiers.new('Visor rolled thickness','SOLIDIFY')
solid.thickness=.033; solid.offset=0; solid.material_offset=1; solid.material_offset_rim=0
bevel=brim.modifiers.new('Rounded visor lip','BEVEL'); bevel.width=.009; bevel.segments=3

def inside_head(point):
    h=point.z-.16
    for _ in range(8): h=point.z-.16-head_lift(h)
    if h<0 or h>1.9: return False
    r=radius_at(h)
    return (point.x-head_shift(h))**2+(point.y/.80)**2<r*r

def seat_point(u,v):
    outer=band_point(u,.95)+Vector(hat.location)
    target=Vector((.08,0,1.74))
    lo=0.; hi=1.
    if inside_head(outer): hi=.02
    else:
        for _ in range(22):
            mid=(lo+hi)/2
            if inside_head(outer.lerp(target,mid)): hi=mid
            else: lo=mid
    inner=outer.lerp(target,min(1,hi+.012))
    return outer.lerp(inner,v)-Vector(hat.location)

# Fitted inner cloth ends just inside the actual head surface. It closes air gaps
# without a flat brow panel or a deep hanging extension of the visor.
seat=grid('Cap • fitted inner seat',160,8,seat_point,inside)
seat.parent=hat
solid=seat.modifiers.new('Inner cloth thickness','SOLIDIFY'); solid.thickness=.006

def curve(name,pts,rad,material,parent=None):
    cu=bpy.data.curves.new(name,'CURVE'); cu.dimensions='3D'; cu.resolution_u=2
    cu.bevel_depth=rad; cu.bevel_resolution=3
    spline=cu.splines.new('POLY'); spline.points.add(len(pts)-1)
    for p,co in zip(spline.points,pts): p.co=(*co,1)
    ob=bpy.data.objects.new(name,cu); char.objects.link(ob); cu.materials.append(material)
    ob.parent=parent
    return ob

# Tailoring seams follow the roof arch and stop at the band, with no pole dent.
for index,px in enumerate([225,325,425]):
    lo=0.; hi=1.
    for _ in range(22):
        mid=(lo+hi)/2
        if cap_station(mid)[0]<px: lo=mid
        else: hi=mid
    t=(lo+hi)/2
    pts=[]
    for j in range(65):
        v=j/64
        du=crown_point(min(1,t+.001),v)-crown_point(max(0,t-.001),v)
        dv=crown_point(t,min(1,v+.001))-crown_point(t,max(0,v-.001))
        outward=du.cross(dv).normalized()
        pts.append(crown_point(t,v)+outward*.0022)
    curve('Cap • tailored seam %02d'%index,pts,.0019,seam_mat,hat)
curve('Cap • visor edge stitching',[brim_point(j/120,.94)+up*.017 for j in range(121)],.0014,seam_mat,hat)

# The snap faces the viewer on the band at the left visor attachment.
_,_,bottom,depth=station_for_x(225)
snap=ellipsoid('Cap • gold side snap',cap_space(225,bottom-10,depth+.025),(.029,.013,.034),brass)
snap.parent=hat
snap.rotation_euler=Vector((0,-1,0)).rotation_difference(normal).to_euler()
curve('Cap • snap rim',[(.026*math.cos(j/48*2*PI),-.015,.030*math.sin(j/48*2*PI)) for j in range(49)],.002,brass,snap)

# Keep native lofts and their shell/subdivision modifiers available for hand editing.
cap_parts=[]
for ob in list(char.objects):
    parent=ob
    while parent is not None and parent!=hat: parent=parent.parent
    if parent==hat: cap_parts.append(ob)
copies={}
for ob in cap_parts:
    duplicate=ob.copy()
    if ob.data is not None: duplicate.data=ob.data.copy()
    duplicate.name='Source '+ob.name; duplicate.hide_render=True
    source.objects.link(duplicate); copies[ob]=duplicate
for ob,duplicate in copies.items(): duplicate.parent=copies.get(ob.parent)
