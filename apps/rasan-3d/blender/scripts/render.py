"""Render saved model: -- --views, --poses, or --demo (Blender workbench preview).

Run blender -b Rasan.blend -P scripts/render.py -- --views
"""
import bpy, math, sys, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
scene=bpy.context.scene; cam=scene.camera
scene.cycles.device='CPU'
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'

def camera(az,elev=.055):
    target=Vector((0,0,1.23)); cam.location=target+Vector((math.sin(az)*8,-math.cos(az)*8,elev*8))
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()

def activate(name):
    rig=bpy.data.objects.get('RasanRig')
    if not rig: raise RuntimeError('Build with --rig first')
    for ob in [rig]+[bpy.data.objects.get('Eye.'+s) for s in ['R','L']]:
        owner=ob if ob==rig else ob.data.shape_keys
        if owner.animation_data:
            owner.animation_data.action=None
            for track in owner.animation_data.nla_tracks: track.mute=track.name!=name
    return rig

single_view=next((arg.split('=',1)[1] for arg in ARGS if arg.startswith('--view=')),None)
if '--views' in ARGS or single_view:
    scene.render.engine='CYCLES'; scene.cycles.samples=64
    scene.render.resolution_percentage=100
    for name,az in [('reference',-.16),('front',0),('left-profile',math.pi/2),('right-profile',-math.pi/2),('three-quarter',-.65),('back',math.pi)]:
        if single_view and name!=single_view: continue
        cam.data.ortho_scale=3.5 if name=='three-quarter' else 2.8
        camera(az); scene.render.filepath=str(ROOT/'renders'/f'{name}.png')
        bpy.ops.render.render(write_still=True)
if '--poses' in ARGS:
    scene.render.engine='CYCLES'; scene.cycles.samples=40
    scene.render.resolution_percentage=60; camera(-.35); cam.data.ortho_scale=3.6
    for name,frame in [('Wave',45),('JumpAndLand',36),('RaiseClapperboard',36),('SnapClapperboard',23),('Blink',13)]:
        activate(name); scene.frame_set(frame)
        scene.render.filepath=str(ROOT/'animations'/f'{name}.png')
        bpy.ops.render.render(write_still=True)
if '--demo' in ARGS:
    # Cycles frame sequence; each named action remains separately reusable in the GLB.
    scene.render.engine='CYCLES'; scene.cycles.samples=20
    scene.render.resolution_percentage=50; camera(-.25)
    sequence=[('IdleBreathing',45),('Blink',24),('LookAround',48),('HappyBounce',45),('Wave',60),('Walk',45),('JumpAndLand',60),('RaiseClapperboard',60),('SnapClapperboard',45)]
    out=ROOT/'animations'/'frames'; out.mkdir(exist_ok=True)
    count=0
    for name,length in sequence:
        activate(name)
        end=json.loads((ROOT/'animations'/'clips.json').read_text())['clips'][name]['frames']
        for f in range(length):
            scene.frame_set(1+round(f*(end-1)/(length-1)))
            scene.render.filepath=str(out/f'{count:04d}.png')
            bpy.ops.render.render(write_still=True); count+=1
        print('DEMO_CLIP',name,count,flush=True)
