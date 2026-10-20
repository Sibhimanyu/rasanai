"""Bake captured Blender eye-action samples into glTF weight animation accessors.

Executed by rig.py; all binary chunks remain standard glTF 2.0, float SCALAR.
This is an explicit export compatibility step, not a second animation implementation.
"""
import struct
asset_path=globals().get('asset_path',ROOT/'Rasan.glb')
raw=asset_path.read_bytes()
json_length=struct.unpack_from('<I',raw,12)[0]
document=json.loads(raw[20:20+json_length])
binary=bytearray(raw[28+json_length:])

def floats(values):
    while len(binary)%4: binary.append(0)
    offset=len(binary)
    binary.extend(struct.pack('<'+'f'*len(values),*values))
    view=len(document['bufferViews'])
    document['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':4*len(values)})
    accessor=len(document['accessors'])
    document['accessors'].append({'bufferView':view,'componentType':5126,'count':len(values),
        'type':'SCALAR','min':[min(values)],'max':[max(values)]})
    return accessor

times=floats([i/scene.render.fps for i in range(CLIPS['Blink'])])
outputs={s:floats(values) for s,values in blink_samples.items()}
replaced=0
for animation in document['animations']:
    if animation['name']!='Blink': continue
    for channel in animation['channels']:
        if channel['target']['path']!='weights': continue
        name=document['nodes'][channel['target']['node']]['name']
        side=name.rsplit('.',1)[-1]
        if side not in outputs: raise RuntimeError('Unexpected eye name: '+name)
        animation['samplers'][channel['sampler']]={'input':times,'output':outputs[side],'interpolation':'LINEAR'}
        replaced+=1
if replaced!=2: raise RuntimeError(f'Expected two blink channels, found {replaced}')
document['buffers'][0]['byteLength']=len(binary)
encoded=json.dumps(document,separators=(',',':'),ensure_ascii=True).encode()
encoded+=b' '*((-len(encoded))%4)
binary.extend(b'\0'*((-len(binary))%4))
size=12+8+len(encoded)+8+len(binary)
asset_path.write_bytes(struct.pack('<III',0x46546c67,2,size)+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary)
print('MORPH_BAKE_OK',replaced,'channels',max(blink_samples['R']))
