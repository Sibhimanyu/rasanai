"""Convert the Cycles procedural wool bump into portable tangent-space normal maps.

Executed after accessory modifiers are baked, before skinning/export.
"""
textures=ROOT/'textures'; textures.mkdir(exist_ok=True)
previous_samples=scene.cycles.samples; scene.cycles.samples=8
for ob,stem in [(crown,'cap-crown'),(band,'cap-band'),(brim,'cap-visor')]:
    material=ob.data.materials[0].copy(); material.name=stem+' • baked PBR wool'
    ob.data.materials[0]=material
    cached=textures/(stem+'-normal.png')
    reuse=cached.exists() and '--rebake' not in ARGS
    image=bpy.data.images.load(str(cached),check_existing=False) if reuse else bpy.data.images.new(stem+'-normal',width=512,height=512,alpha=False)
    image.colorspace_settings.name='Non-Color'
    image.filepath_raw=str(textures/(stem+'-normal.png')); image.file_format='PNG'
    node=material.node_tree.nodes.new('ShaderNodeTexImage'); node.image=image
    material.node_tree.nodes.active=node
    active(ob)
    if not reuse:
        # The visor's dark lining has its own material. Bake it to a disposable
        # target so its overlapping underside UVs cannot overwrite the wool map.
        auxiliary=[]
        for other in ob.data.materials[1:]:
            scratch=bpy.data.images.new(stem+'-lining-bake',width=512,height=512,alpha=False)
            target=other.node_tree.nodes.new('ShaderNodeTexImage'); target.image=scratch
            other.node_tree.nodes.active=target
            auxiliary.append((other,target,scratch))
        bpy.ops.object.bake(type='NORMAL',normal_space='TANGENT',margin=8,use_clear=True)
        image.save()
        for other,target,scratch in auxiliary:
            other.node_tree.nodes.remove(target)
            bpy.data.images.remove(scratch)
    image.pack()
    normal=material.node_tree.nodes.new('ShaderNodeNormalMap')
    material.node_tree.links.new(node.outputs['Color'],normal.inputs['Color'])
    material.node_tree.links.new(normal.outputs['Normal'],material.node_tree.nodes.get('Principled BSDF').inputs['Normal'])
    print('FABRIC_BAKE_OK',stem,flush=True)
scene.cycles.samples=previous_samples
