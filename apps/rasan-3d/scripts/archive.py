#!/usr/bin/env python3
"""Create and verify a self-contained 3D checkpoint outside the Conductor worktree.

No Git/worktree mutation. Includes ignored artifacts; excludes reinstallable deps.
Run: python3 scripts/archive.py [--destination /path/to/archive-parent]
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import platform
import shutil
import subprocess
import tarfile

PROJECT=Path(__file__).resolve().parents[1]
WORKSPACE=PROJECT.parents[1]

def run(args):
    result=subprocess.run(args,cwd=WORKSPACE,text=True,capture_output=True,check=True)
    return result.stdout.strip()

def digest(file):
    result=hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''): result.update(chunk)
    return result.hexdigest()

def write_json(file,value):
    file.write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n')

def copy(source,target):
    target.parent.mkdir(parents=True,exist_ok=True)
    if source.is_dir():
        shutil.copytree(source,target,symlinks=True,ignore=shutil.ignore_patterns('node_modules','.DS_Store','__pycache__'))
    else: shutil.copy2(source,target)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--destination',type=Path,default=Path.home()/'Documents'/'Rasan-3D-Archive')
    args=parser.parse_args()
    now=datetime.now().astimezone()
    parent=args.destination.expanduser().resolve()
    if parent==WORKSPACE or WORKSPACE in parent.parents:
        raise ValueError('The independent checkpoint must be outside the current workspace')
    target=parent/now.strftime('%Y-%m-%d_%H-%M-%S')
    target.mkdir(parents=True,exist_ok=False)
    archive=target/'rasan-3d-snapshot.tar.gz'
    created=now.isoformat()
    print('CHECKPOINT',target,flush=True)
    # This location note is part of the captured source, written before copying.
    (PROJECT/'BACKUP-LOCATION.md').write_text(
        '# Independent 3D checkpoint\n\n'
        f'Created: {created}\n\n'
        f'- Checkpoint folder: `{target}`\n'
        f'- Start here: [{target.name}/START-HERE.md](<{target}/START-HERE.md>)\n'
        f'- Portable archive: `{archive}`\n'
        '- Read `VERIFICATION.json` in that folder for completion status.\n\n'
        'The complete project and selected 3D context are captured, including ignored\n'
        'renders, frame sequences and native backup files. Reinstallable `node_modules`,\n'
        '`.DS_Store` and Python caches are excluded. The original workspace stays in place.\n\n'
        'Use `RESTORE.md` and `RESUME.md` to continue. A new checkpoint can be created\n'
        'with `python3 scripts/archive.py` from this project. Each run creates a new\n'
        'timestamped directory; `LATEST.json` changes only after verification succeeds.\n')
    selections=[
        Path('apps/rasan-3d'),
        Path('.context/crew'),
        Path('.context/working-crew/assets/stage'),
        Path('.context/working-crew/ref-crew.png'),
        Path('.context/working-crew/ref-kavi.png'),
        Path('.context/rasan-blender'),
        Path('.context/rasan-cap-rebuild'),
        Path('.context/rasan-look-revision'),
        Path('.context/crew-models'),
        Path('.context/attachments/r4ug5P'),
        Path('.context/attachments/nHn4b4'),
    ]
    for relative in selections:
        source=WORKSPACE/relative
        if not source.exists(): raise FileNotFoundError('Required source missing: '+str(relative))
        print('Copying',relative,flush=True)
        copy(source,target/'project'/relative)
    for name in ['AGENTS.md','RELEASING.md']:
        source=WORKSPACE/name
        if source.is_file(): copy(source,target/'project'/name)
    git={
        'createdAt':created,'sourceWorkspace':str(WORKSPACE),
        'branch':run(['git','branch','--show-current']),
        'head':run(['git','rev-parse','HEAD']),
        'target':'origin/master','targetCommit':run(['git','rev-parse','origin/master']),
        'status':run(['git','status','--short']),
        'note':'3D work is untracked. This file is provenance, not a Git stash or commit.',
    }
    write_json(target/'GIT_STATE.json',git)
    (target/'WORKTREE.patch').write_text(run(['git','diff','--binary','HEAD'])+'\n')
    versions={'python':platform.python_version(),'platform':platform.platform(),
              'node':run(['node','--version']),'npm':run(['npm','--version']),
              'blender':run(['/opt/homebrew/bin/blender','--version']).splitlines()[0],
              'ffmpeg':run(['ffmpeg','-version']).splitlines()[0]}
    write_json(target/'ENVIRONMENT.json',versions)
    copy(PROJECT/'RESTORE.md',target/'RESTORE.md')
    copy(PROJECT/'scripts'/'verify_archive.py',target/'verify_backup.py')
    (target/'START-HERE.md').write_text(
        '# Rasan 3D — preserved checkpoint\n\n'
        f'Captured {created} from `{WORKSPACE}`.\n\n'
        '## Resume\n\n'
        '- [Current handoff](project/apps/rasan-3d/HANDOFF.md)\n'
        '- [Continuation prompt](project/apps/rasan-3d/RESUME.md)\n'
        '- [Decisions](project/apps/rasan-3d/DECISIONS.md)\n'
        '- [Remaining work](project/apps/rasan-3d/TODO.md)\n'
        '- [Verify and restore](RESTORE.md)\n\n'
        '## Open the work\n\n'
        '- [All four characters in Blender](project/apps/rasan-3d/crew/Crew.blend)\n'
        '- [Eight-second walk and wave](project/apps/rasan-3d/blender/animations/rasan-walk-and-wave.mp4)\n'
        '- [Family render](project/apps/rasan-3d/crew/crew-lineup.png)\n\n'
        'The complete project, original references, historical outputs and review\n'
        'evidence are under `project/`. Individual Blender/GLB files, source and all\n'
        'Markdown documentation are included. Laya, Rasika and Mala remain unbuilt.\n\n'
        'The source worktree was left in place and its branch was not changed.\n'
        '`node_modules` and machine caches are reinstallable and excluded. This is\n'
        'a local checkpoint outside Conductor, not a cloud upload. Copy to a new\n'
        'working directory before editing the preserved snapshot.\n\n'
        'Check `VERIFICATION.json` for successful verification of the expanded\n'
        'copy, every archived member, and the model/report hashes.\n')
    critical={}
    for name,relative in [('Rasan',Path('blender')),('Tara',Path('crew/Tara')),('Kavi',Path('crew/Kavi')),('Chitra',Path('crew/Chitra'))]:
        folder=target/'project/apps/rasan-3d'/relative
        asset=folder/(name+'.glb')
        report=json.loads((folder/'validation.json').read_text())
        actual=digest(asset)
        if actual!=report['sha256']: raise ValueError('Stale GLB report: '+name)
        critical[name]={'sha256':actual,'bytes':asset.stat().st_size,'reportMatches':True}
    write_json(target/'ASSET_CHECKS.json',critical)
    records={}
    for file in sorted(target.rglob('*')):
        relative=file.relative_to(target).as_posix()
        if file.is_symlink(): records[relative]={'kind':'symlink','target':str(file.readlink())}
        elif file.is_file(): records[relative]={'kind':'file','bytes':file.stat().st_size,'sha256':digest(file)}
    write_json(target/'MANIFEST.json',{
        'schema':1,'createdAt':created,'sourceWorkspace':str(WORKSPACE),
        'exclusions':['node_modules','.DS_Store','__pycache__'],
        'selections':[p.as_posix() for p in selections],'files':records,
    })
    spec=importlib.util.spec_from_file_location('snapshot_verifier',target/'verify_backup.py')
    verifier=importlib.util.module_from_spec(spec); spec.loader.exec_module(verifier)
    print('Verifying expanded copy',flush=True)
    expanded=verifier.verify(target)
    # Check the independent copy against the live source as well as its manifest.
    source_checked=0
    for name,record in records.items():
        if not name.startswith('project/'): continue
        source=WORKSPACE/name.removeprefix('project/')
        if record['kind']=='file' and digest(source)!=record['sha256']:
            raise ValueError('Source changed during copy: '+str(source))
        if record['kind']=='symlink' and str(source.readlink())!=record['target']:
            raise ValueError('Source link changed during copy: '+str(source))
        source_checked+=1
    print('Compressing',len(records),'files',flush=True)
    temporary=target/'snapshot.partial.tar.gz'
    with tarfile.open(temporary,'w:gz',compresslevel=6) as tf:
        for name in [*records,'MANIFEST.json']:
            tf.add(target/name,arcname='rasan-3d-snapshot/'+name,recursive=False)
    print('Verifying every archived member',flush=True)
    compressed=verifier.verify(target,temporary)
    temporary.rename(archive)
    archive_sha=digest(archive)
    (target/'SHA256SUMS').write_text(archive_sha+'  '+archive.name+'\n')
    result={'ok':True,'completedAt':datetime.now(timezone.utc).isoformat(),
            'checkpoint':str(target),'archive':str(archive),'archiveBytes':archive.stat().st_size,
            'archiveSha256':archive_sha,'sourceFilesCompared':source_checked,
            'expanded':expanded,'compressed':compressed,'assets':critical}
    write_json(target/'VERIFICATION.json',result)
    latest=parent/'LATEST.partial.json'; write_json(latest,result); latest.replace(parent/'LATEST.json')
    (parent/'START-HERE.md').write_text(
        '# Rasan 3D archives\n\n'
        f'Latest verified checkpoint: [{target.name}/START-HERE.md](<{target}/START-HERE.md>).\n\n'
        'Read `LATEST.json` for checksums and verification. Each dated folder is\n'
        'independent; older checkpoints are preserved when a new one is made.\n')
    evidence=WORKSPACE/'.context/3d-preservation'; evidence.mkdir(exist_ok=True)
    write_json(evidence/'latest-backup.json',result)
    print(json.dumps(result,indent=2),flush=True)

if __name__=='__main__': main()
