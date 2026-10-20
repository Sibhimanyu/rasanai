"""Append the four real character rigs into one editable family scene."""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
for name,x in [('Tara',-2.60),('Kavi',-1.10),('Chitra',.40),('Rasan',2.25)]:
    file=ROOT/name/(name+'.blend') if name!='Rasan' else ROOT.parent/'blender'/'Rasan.blend'
    with bpy.data.libraries.load(str(file),link=False) as (available,loaded):
        loaded.collections=[name+' • export']
    col=loaded.collections[0]; scene.collection.children.link(col)
    rig=next(ob for ob in col.objects if ob.type=='ARMATURE')
    rig.location.x=x
    for ob in col.objects:
        if ob.type=='MESH' and ob.data.shape_keys and ob.data.shape_keys.animation_data:
            ob.data.shape_keys.animation_data.action=None
            for track in ob.data.shape_keys.animation_data.nla_tracks: track.mute=True
    if rig.animation_data:
        rig.animation_data.action=None
        for track in rig.animation_data.nla_tracks: track.mute=True
scene.frame_set(1)
for ob in bpy.data.objects:
    if ob.type=='ARMATURE':
        assert all(abs(v)<1e-6 for bone in ob.pose.bones if bone.name.startswith('Foot.') for v in bone.location),ob.name+' has an unplanted reference foot'
stage=bpy.data.collections.new('Stage • family portrait'); scene.collection.children.link(stage)
def move(ob):
    for col in list(ob.users_collection): col.objects.unlink(ob)
    stage.objects.link(ob)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,0))
floor=bpy.context.object; floor.name='Rice studio floor'; move(floor)
mat=bpy.data.materials.new('Rice studio background'); mat.use_nodes=True
p=mat.node_tree.nodes.get('Principled BSDF')
p.inputs['Base Color'].default_value=(.85,.82,.76,1); p.inputs['Roughness'].default_value=.85
p.inputs['Emission Color'].default_value=(.85,.82,.76,1); p.inputs['Emission Strength'].default_value=.15
floor.data.materials.append(mat)
scene.world=bpy.data.worlds.new('Soft neutral studio'); scene.world.use_nodes=True
scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.8,.8,.8,1)
scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.24
for name,pos,energy,size,color in [
    ('Key',(-4,-5,7),700,6,(1,.97,.92)),('Fill',(5,-4,4),100,5,(.94,.97,1)),('Rim',(1,3,5),220,5,(1,1,.97))]:
    data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=size; data.color=color
    ob=bpy.data.objects.new(name,data); stage.objects.link(ob); ob.location=pos
    ob.rotation_euler=(Vector((0,0,1))-ob.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('Crew camera'); camera=bpy.data.objects.new('Crew camera',data); stage.objects.link(camera)
target=Vector((.05,0,1.16)); camera.location=target+Vector((0,-14,1.65))
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
data.type='ORTHO'; data.ortho_scale=7.3; scene.camera=camera
scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=64; scene.cycles.use_denoising=True
scene.view_settings.view_transform='Standard'; scene.view_settings.look='None'; scene.view_settings.exposure=-.15
scene.render.resolution_x=1920; scene.render.resolution_y=1080; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGB'
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D': area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Crew.blend'))
scene.render.filepath=str(ROOT/'crew-lineup.png'); bpy.ops.render.render(write_still=True)
print('CREW_LINEUP_OK',flush=True)
