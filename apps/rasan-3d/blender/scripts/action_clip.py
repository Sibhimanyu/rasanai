"""Make an eight-second walk → settle → wave from Rasan's existing actions.

Run on Rasan.blend. Saves a separate shot project; the reusable asset is unchanged.
--build makes the shot, --render renders frames, --test renders a few review frames.
Optional: --engine=eevee, --start=N, --step=N for independent render workers.
"""
import bpy, math, sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
scene=bpy.context.scene
rig=bpy.data.objects['RasanRig']
FPS=30; COUNT=240
out=ROOT/'animations'/'walk-and-wave'
out.mkdir(parents=True,exist_ok=True)

def smooth(a,b,x):
    u=max(0,min(1,(x-a)/(b-a)))
    return u*u*(3-2*u)

def pose(name,frame):
    rig.animation_data.action=None
    for track in rig.animation_data.nla_tracks: track.mute=track.name!=name
    for pb in rig.pose.bones:
        pb.location=(0,0,0); pb.rotation_quaternion=(1,0,0,0); pb.scale=(1,1,1)
    base=math.floor(frame)
    scene.frame_set(base,subframe=frame-base)
    bpy.context.view_layer.update()
    return {pb.name:(pb.location.copy(),pb.rotation_quaternion.copy(),pb.scale.copy()) for pb in rig.pose.bones}

if '--build' in ARGS:
    for side in ['L','R']:
        keys=bpy.data.objects['Eye.'+side].data.shape_keys
        if keys.animation_data:
            keys.animation_data.action=None
            for track in keys.animation_data.nla_tracks: track.mute=True
        keys.key_blocks['Blink'].value=0
    rest=pose(None,1)
    samples=[]
    for i in range(COUNT):
        t=i/FPS
        if t<4:
            # Two full walk cycles, eased in and out without resetting the stride.
            current=pose('Walk',1+(t%2)*59/2)
            weight=smooth(0,.35,t)*(1-smooth(3.65,4,t))
        elif t<4.65:
            current=pose('IdleBreathing',1+(t-4)*30)
            weight=1
        elif t<7.65:
            current=pose('Wave',1+(t-4.65)*89/3)
            weight=1
        else:
            current=pose('IdleBreathing',1+(t-7.65)*30)
            weight=smooth(7.65,8,t)
        values={}
        for name,(loc,rot,scale) in current.items():
            a,b,c=rest[name]
            values[name]=(a.lerp(loc,weight),b.slerp(rot,weight),c.lerp(scale,weight))
        samples.append(values)
    for track in rig.animation_data.nla_tracks: track.mute=True
    action=bpy.data.actions.new('WalkAndWave • eight-second shot')
    rig.animation_data.action=action
    for i,values in enumerate(samples):
        t=i/FPS; frame=i+1
        scene.frame_set(frame)
        for pb in rig.pose.bones:
            pb.location,pb.rotation_quaternion,pb.scale=values[pb.name]
            for prop in ['location','rotation_quaternion','scale']:
                pb.keyframe_insert(prop,frame=frame,group=pb.name)
        # Translate the entire rig in world space; feet, prop and cap stay together.
        travel=(t-.25)/3.5
        travel=max(0,min(1,travel))
        # Constant stride speed with short acceleration and braking ramps.
        ramp=.12
        if travel<ramp: distance=travel*travel/(2*ramp)
        elif travel>1-ramp: distance=1-ramp-(1-travel)**2/(2*ramp)
        else: distance=travel-ramp/2
        distance/=1-ramp
        rig.location=Vector((-.70,.38,0)).lerp(Vector((.36,-.46,0)),distance)
        yaw=.90*(1-smooth(3.8,4.65,t))
        rig.rotation_mode='XYZ'; rig.rotation_euler=(0,0,yaw)
        rig.keyframe_insert('location',frame=frame,group='Shot travel')
        rig.keyframe_insert('rotation_euler',frame=frame,group='Shot turn')
    # Two short natural blinks after the character stops.
    for side in ['L','R']:
        keys=bpy.data.objects['Eye.'+side].data.shape_keys
        for i in range(COUNT):
            t=i/FPS
            value=max(0,1-abs(t-4.35)/.11,1-abs(t-7.7)/.11)
            keys.key_blocks['Blink'].value=value
            keys.key_blocks['Blink'].keyframe_insert('value',frame=i+1)
    # A neutral opaque stage for the finished clip.
    scene.render.film_transparent=False
    floor=bpy.data.objects['Ground']
    floor.is_shadow_catcher=False
    material=bpy.data.materials.new('Shot • warm ivory floor'); material.use_nodes=True
    bsdf=material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(.79,.76,.69,1)
    bsdf.inputs['Roughness'].default_value=.85
    floor.data.materials.clear(); floor.data.materials.append(material)
    camera=scene.camera
    target=Vector((.05,0,1.19))
    # Orthographic rays at the lower edge must start above the floor plane.
    camera.location=target+Vector((-.25,-1,.09)).normalized()*14
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=4.35
    scene.render.resolution_x=900; scene.render.resolution_y=900
    scene.render.resolution_percentage=100
    scene.render.fps=FPS; scene.frame_start=1; scene.frame_end=COUNT
    scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGB'
    scene.render.engine='CYCLES'; scene.cycles.device='CPU'
    scene.cycles.samples=24; scene.cycles.use_denoising=True
    scene.cycles.adaptive_threshold=.06
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'animations'/'Rasan-walk-and-wave.blend'))
    print('SHOT_BUILD_OK',len(samples),'frames',flush=True)

if '--engine=eevee' in ARGS:
    scene.render.engine='BLENDER_EEVEE'
    scene.eevee.taa_render_samples=32
if '--test' in ARGS:
    for frame in [30,110,175]:
        scene.frame_set(frame)
        scene.render.filepath=str(out/f'review-{frame:03d}.png')
        bpy.ops.render.render(write_still=True)
if '--render' in ARGS:
    start=int(next((a.split('=')[1] for a in ARGS if a.startswith('--start=')),1))
    step=int(next((a.split('=')[1] for a in ARGS if a.startswith('--step=')),1))
    scene.frame_start=start; scene.frame_end=COUNT; scene.frame_step=step
    scene.render.use_persistent_data=True
    scene.render.filepath=str(out/'frame-')
    bpy.ops.render.render(animation=True)
