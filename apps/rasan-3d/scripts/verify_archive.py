#!/usr/bin/env python3
"""Verify an expanded checkpoint or its tar.gz without extracting it."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import tarfile

def digest(stream):
    result=hashlib.sha256()
    for chunk in iter(lambda:stream.read(1024*1024),b''): result.update(chunk)
    return result.hexdigest()

def verify(root,archive=None):
    root=Path(root)
    expected=json.loads((root/'MANIFEST.json').read_text())['files']
    for name in expected:
        path=PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts: raise ValueError('Unsafe manifest path: '+name)
    checked=set()
    if archive:
        with tarfile.open(archive,'r:gz') as tf:
            for member in tf:
                prefix='rasan-3d-snapshot/'
                if member.isdir(): continue
                if not member.name.startswith(prefix): raise ValueError('Unexpected archive root')
                name=member.name[len(prefix):]
                if name=='MANIFEST.json':
                    stream=tf.extractfile(member)
                    if stream.read()!=(root/'MANIFEST.json').read_bytes(): raise ValueError('Manifest differs inside archive')
                    continue
                if name not in expected: raise ValueError('Unexpected archive member: '+name)
                if name in checked: raise ValueError('Duplicate archive member: '+name)
                record=expected[name]
                if record['kind']=='symlink':
                    if not member.issym() or member.linkname!=record['target']: raise ValueError('Symlink mismatch: '+name)
                else:
                    if not member.isfile() or member.size!=record['bytes']: raise ValueError('Size/type mismatch: '+name)
                    with tf.extractfile(member) as stream:
                        if digest(stream)!=record['sha256']: raise ValueError('Hash mismatch: '+name)
                checked.add(name)
    else:
        for name,record in expected.items():
            file=root/name
            if record['kind']=='symlink':
                if not file.is_symlink() or str(file.readlink())!=record['target']: raise ValueError('Symlink mismatch: '+name)
            else:
                if not file.is_file() or file.stat().st_size!=record['bytes']: raise ValueError('Missing/size mismatch: '+name)
                with file.open('rb') as stream:
                    if digest(stream)!=record['sha256']: raise ValueError('Hash mismatch: '+name)
            checked.add(name)
    if checked!=set(expected): raise ValueError('Missing members: '+str(sorted(set(expected)-checked)))
    return {'ok':True,'files':len(checked),'bytes':sum(v.get('bytes',0) for v in expected.values())}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parent)
    parser.add_argument('--archive',type=Path)
    args=parser.parse_args()
    print(json.dumps(verify(args.root,args.archive),indent=2))
