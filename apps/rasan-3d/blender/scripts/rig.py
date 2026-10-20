"""Executed in build.py's namespace AFTER reference-angle geometry review.

One armature, normalized skin weights, rigid accessories, separate eye morphs.
All actions use the same frame origin, with armature/morph tracks sharing NLA names.
"""
from mathutils import Quaternion

bpy.context.view_layer.update()
hat_origin=hat.matrix_world.translation.copy()
board_origin=board.matrix_world.translation.copy()
hinge_origin=hinge.matrix_world.translation.copy()
hinge_axis=board.matrix_world.to_3x3()@Vector((0,1,0))
eye_origins={s:o.matrix_world.translation.copy() for s,o in eyes.items()}
brow_origins={s:Vector(surface(-.21 if s=='R' else .21,1.81,.02)) for s in brows}

# Bake rigid construction modifiers and transforms, keeping eye shape-key data intact.
rigid_assignment={}
for ob in list(char.objects):
    if ob==body or ob.type=='EMPTY': continue
    is_hat=ob==hat or ob.parent==hat or (ob.parent and ob.parent.parent==hat)
    is_upper=ob==upper or ob.parent==hinge
    is_board=ob.parent==board or is_upper
    bone_name='Hat' if is_hat else 'Clapper' if is_upper else 'Board' if is_board else 'Body'
    for side in ['L','R']:
        if ob==eyes[side]: bone_name='Eye.'+side
        if ob==brows[side]: bone_name='Brow.'+side
        if ob==feet[side]: bone_name='Foot.'+side
    world=ob.matrix_world.copy()
    if ob not in eyes.values():
        active(ob)
        bpy.ops.object.convert(target='MESH')
    ob.parent=None
    ob.data.transform(world,shape_keys=True)
    ob.matrix_world=Matrix.Identity(4)
    rigid_assignment[ob]=bone_name
for ob in [hat,hinge,board]: bpy.data.objects.remove(ob,do_unlink=True)
exec(compile((ROOT/'scripts'/'bake_fabric.py').read_text(),str(ROOT/'scripts'/'bake_fabric.py'),'exec'))

data=bpy.data.armatures.new('Rasan • deformation skeleton')
rig=bpy.data.objects.new('RasanRig',data); char.objects.link(rig)
rig.show_in_front=True; data.display_type='OCTAHEDRAL'
active(rig); bpy.ops.object.mode_set(mode='EDIT')
def bone(name,head,tail,parent=None):
    b=data.edit_bones.new(name); b.head=head; b.tail=tail
    if parent: b.parent=data.edit_bones[parent]
    return b
bone('Root',(0,0,0),(0,0,.12))
bone('Body',(0,0,.16),(0,0,1.55),'Root')
bone('Hat',hat_origin,hat_origin+Vector((0,0,.22)),'Body')
bone('Board',board_origin,board_origin+Vector((0,0,.25)),'Body')
bone('Clapper',hinge_origin,hinge_origin+Vector((.32,0,0)),'Board')
for side,path in ARM_PATHS.items():
    shoulder=Vector(path[0]); elbow=bezier(path,.50); hand=Vector(path[-1])
    bone('UpperArm.'+side,shoulder,elbow,'Body')
    bone('Forearm.'+side,elbow,hand,'UpperArm.'+side)
    bone('Hand.'+side,hand,hand+Vector((0,-.12,0)),'Forearm.'+side)
    x=-.46 if side=='R' else .46
    bone('Foot.'+side,(x,-.06,.105),(x,-.24,.105),'Root')
    bone('Eye.'+side,eye_origins[side],eye_origins[side]+Vector((0,0,.10)),'Body')
    bone('Brow.'+side,brow_origins[side],brow_origins[side]+Vector((0,0,.08)),'Body')
bpy.ops.object.mode_set(mode='OBJECT')

def armature_modifier(ob):
    mod=ob.modifiers.new('Rasan deformation','ARMATURE'); mod.object=rig
    ob.parent=rig
    # Deform before the final render subdivision.
    if len(ob.modifiers)>1:
        active(ob)
        bpy.ops.object.modifier_move_up(modifier=mod.name)

for ob,bone_name in rigid_assignment.items():
    group=ob.vertex_groups.new(name=bone_name)
    group.add(list(range(len(ob.data.vertices))),1,'REPLACE')
    armature_modifier(ob)

def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a))); return t*t*(3-2*t)

# Weights follow each swept spine; shoulders blend into the body instead of detaching.
# Nearest-spine sampling is deterministic, independent of Blender heat-weight solver.
groups={n:body.vertex_groups.new(name=n) for n in ['Body','UpperArm.R','Forearm.R','Hand.R','UpperArm.L','Forearm.L','Hand.L']}
spines={s:[bezier(p,i/32) for i in range(33)] for s,p in ARM_PATHS.items()}
for v in body.data.vertices:
    co=v.co; side='R' if co.x<0 else 'L'
    distances=[(co-p).length_squared for p in spines[side]]
    j=min(range(33),key=distances.__getitem__); t=j/32; d=math.sqrt(distances[j])
    body_radius=radius_at(max(0,min(1.9,co.z-.16)))
    outside=math.sqrt(co.x*co.x+(co.y/.80)**2)-body_radius
    # The implicit body surface separates the belly from the protruding arm volume.
    # Nearest-spine weighting alone would drag the entire belly into a waving arm.
    influence=smooth(.015,.12,outside)*smooth(.03,.50,t)*(1-smooth(.33,.43,d))
    fore=smooth(.20,.70,t); hand=smooth(.78,.96,t)
    weights={'Body':1-influence,'UpperArm.'+side:influence*(1-fore),
             'Forearm.'+side:influence*fore*(1-hand),'Hand.'+side:influence*fore*hand}
    for n,w in weights.items():
        if w>1e-6: groups[n].add([v.index],w,'REPLACE')
active(body)
for v in body.data.vertices: v.select=True
bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
bpy.ops.object.vertex_group_smooth(group_select_mode='ALL',factor=.75,repeat=8)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
bpy.ops.object.mode_set(mode='OBJECT')
armature_modifier(body)

for pbone in rig.pose.bones: pbone.rotation_mode='QUATERNION'
rig['controls']='Root: travel/jump; Body: tilt and local-Y squash; UpperArm/Forearm/Hand: FK; Eye: gaze; Brow: expression; Hat; Board; Clapper: global Y hinge.'
rig['hinge_reference_open_radians']=.34

def reset_pose():
    for pb in rig.pose.bones:
        pb.location=(0,0,0); pb.rotation_quaternion=(1,0,0,0); pb.scale=(1,1,1)
    for eye in eyes.values(): eye.data.shape_keys.key_blocks['Blink'].value=0
    bpy.context.view_layer.update()

def translate(name,delta):
    pb=rig.pose.bones[name]
    pb.location=pb.bone.matrix_local.to_3x3().inverted()@Vector(delta)

def rotate(name,world_axis,angle):
    pb=rig.pose.bones[name]
    axis=pb.bone.matrix_local.to_3x3().inverted()@Vector(world_axis)
    pb.rotation_quaternion=Quaternion(axis,angle)

def squash(amount):
    # Bone local Y corresponds to world Z; preserve approximate body volume.
    rig.pose.bones['Body'].scale=(1/math.sqrt(amount),amount,1/math.sqrt(amount))

def solve_arm(side,target):
    path=ARM_PATHS[side]; shoulder=Vector(path[0]); rest_elbow=bezier(path,.50); rest_hand=Vector(path[-1])
    l1=(rest_elbow-shoulder).length; l2=(rest_hand-rest_elbow).length
    direction=Vector(target)-shoulder; dist=max(.02,min(l1+l2-.0001,direction.length)); direction.normalize()
    along=(l1*l1-l2*l2+dist*dist)/(2*dist)
    height=math.sqrt(max(0,l1*l1-along*along))
    bend=rest_elbow-shoulder; bend=(bend-direction*bend.dot(direction)).normalized()
    elbow=shoulder+direction*along+bend*height
    hand=shoulder+direction*dist
    for name,start,end in [('UpperArm.'+side,shoulder,elbow),('Forearm.'+side,elbow,hand)]:
        pb=rig.pose.bones[name]; rest=pb.bone.matrix_local.copy()
        q=(pb.bone.tail_local-pb.bone.head_local).rotation_difference(end-start)
        m=q.to_matrix().to_4x4()@rest; m.translation=start
        pb.matrix=m
        bpy.context.view_layer.update()

def keyed_pose(frame):
    for pb in rig.pose.bones:
        for prop in ['location','rotation_quaternion','scale']: pb.keyframe_insert(prop,frame=frame,group=pb.name)

def strip(owner,action,name,start,end):
    ad=owner.animation_data_create(); ad.action=None
    track=ad.nla_tracks.new(); track.name=name
    st=track.strips.new(name,1,action); st.action_frame_start=start; st.action_frame_end=end
    st.extrapolation='NOTHING'; track.mute=True

CLIPS={
    'IdleBreathing':90,'Blink':24,'LookAround':96,'HappyBounce':60,
    'Wave':90,'Walk':60,'JumpAndLand':72,'RaiseClapperboard':72,'SnapClapperboard':45,
}
def animate(name,t,u):
    if name=='IdleBreathing': squash(1+.011*math.sin(t*2*PI/3))
    if name=='Blink':
        amount=1-smooth(.06,.16,abs(u-.5))
        for eye in eyes.values(): eye.data.shape_keys.key_blocks['Blink'].value=amount
    if name=='LookAround':
        look=math.sin(2*PI*u)*math.sin(PI*u)**.4
        for s in eyes:
            translate('Eye.'+s,(look*.055,0,.015*math.sin(4*PI*u)))
            rotate('Brow.'+s,(0,1,0),look*.08)
    if name=='HappyBounce':
        bounce=max(0,math.sin(u*4*PI))
        translate('Root',(0,0,.13*bounce)); squash(1+.045*math.sin(u*4*PI))
        for s in brows: translate('Brow.'+s,(0,0,.025*bounce))
    if name=='Wave':
        weight=smooth(0,.22,u)*(1-smooth(.78,1,u))
        rest=Vector(ARM_PATHS['L'][-1]); raised=Vector((.98,-1.0,1.37))
        target=rest.lerp(raised,weight); target.z+=.035*math.sin(u*10*PI)*weight
        solve_arm('L',target)
        rotate('Hand.L',(0,1,0),.08*math.sin(u*10*PI)*weight)
    if name=='Walk':
        phase=u*4*PI
        for s,sign in [('L',1),('R',-1)]:
            translate('Foot.'+s,(0,sign*.10*math.sin(phase),.055*max(0,sign*math.cos(phase))))
        translate('Root',(0,0,.025*(1-math.cos(2*phase))))
        rotate('Body',(0,1,0),.025*math.sin(phase))
    if name=='JumpAndLand':
        if u<.20: squash(1-.16*math.sin(u/.20*PI/2))
        elif u<.72:
            f=(u-.20)/.52; translate('Root',(0,0,.46*math.sin(PI*f)))
            squash(1+.10*math.sin(PI*f))
        else: squash(1-.15*math.sin((u-.72)/.28*PI)*math.exp(-(u-.72)*5))
    if name=='RaiseClapperboard':
        lift=.16*math.sin(PI*u)**2
        translate('Board',(0,0,lift))
        for s in ARM_PATHS: solve_arm(s,Vector(ARM_PATHS[s][-1])+Vector((0,0,lift)))
    if name=='SnapClapperboard':
        # Mesh bind/rest is the reference 0.34-rad opening. A +Y rotation closes it.
        close=smooth(.16,.36,u)*(1-smooth(.65,1,u))
        rotate('Clapper',hinge_axis,.34*close)
        recoil=.012*math.sin((u-.36)*70)*math.exp(-max(0,u-.36)*16) if u>.36 else 0
        rotate('Board',(1,0,0),recoil)

blink_samples={s:[] for s in eyes}
for name,end in CLIPS.items():
    reset_pose()
    action=bpy.data.actions.new(name); rig.animation_data_create().action=action
    morph_actions={}
    if name=='Blink':
        for s,eye in eyes.items():
            keys=eye.data.shape_keys
            a=bpy.data.actions.new(name+'.morph.'+s); keys.animation_data_create().action=a
            morph_actions[s]=a
    for f in range(1,end+1):
        scene.frame_set(f); reset_pose(); animate(name,(f-1)/30,(f-1)/(end-1))
        keyed_pose(f)
        for s,a in morph_actions.items():
            key=eyes[s].data.shape_keys.key_blocks['Blink']
            blink_samples[s].append(float(key.value))
            key.keyframe_insert('value',frame=f)
    strip(rig,action,name,1,end)
    for s,a in morph_actions.items(): strip(eyes[s].data.shape_keys,a,name,1,end)

reset_pose(); scene.frame_set(1); scene.frame_end=90
rig.animation_data.action=None
active(rig)

# Export the actual glTF result, not a separate Three.js geometry recreation.
if '--export' in ARGS:
    asset_path=ROOT/'Rasan.glb'
    bpy.ops.object.select_all(action='DESELECT')
    for ob in char.objects: ob.select_set(True)
    bpy.context.view_layer.objects.active=rig
    # NLA tracks are exported individually; prevent their evaluation from stacking.
    bpy.ops.export_scene.gltf(filepath=str(asset_path),export_format='GLB',
        use_selection=True,export_apply=True,export_animations=True,
        export_animation_mode='NLA_TRACKS',export_skins=True,export_morph=True,
        export_morph_animation=True,export_rest_position_armature=True,
        export_force_sampling=True,export_frame_range=False,
        export_extras=True,export_yup=True)
    # Blender 5.2's NLA exporter samples this mesh/armature combination's key tracks
    # as zero. Bake the values recorded from our source actions into standard glTF
    # weight channels. Geometry, targets, joints and all other channels are untouched.
    exec(compile((ROOT/'scripts'/'write_morphs.py').read_text(),str(ROOT/'scripts'/'write_morphs.py'),'exec'))
    print('RASAN_EXPORT_OK')

(ROOT/'animations'/'clips.json').write_text(json.dumps({
    'fps':30,'clips':{name:{'frames':end,'seconds':(end-1)/30} for name,end in CLIPS.items()},
    'rest':'Reference pose with clapper open 0.34 radians',
    'coordinates':'Blender X right, -Y front, Z up; glTF X right, Y up, Z front',
},indent=2)+'\n')
