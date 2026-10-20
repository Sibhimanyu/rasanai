// Validate the exported asset, its actual skin buffers, and independent Three.js playback.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(root,'../../..');
const evidence=path.join(repo,'.context/rasan-blender'); fs.mkdirSync(evidence,{recursive:true});
const data=fs.readFileSync(path.join(root,'Rasan.glb'));
assert.equal(data.readUInt32LE(0),0x46546c67); assert.equal(data.readUInt32LE(4),2);
assert.equal(data.readUInt32LE(8),data.length);
const jsonLength=data.readUInt32LE(12);
const gltf=JSON.parse(data.subarray(20,20+jsonLength).toString());
const binary=data.subarray(28+jsonLength);
const expected=JSON.parse(fs.readFileSync(path.join(root,'animations/clips.json'))).clips;
assert.deepEqual(gltf.animations.map(a=>a.name).sort(),Object.keys(expected).sort());
assert.equal(gltf.skins.length,1);
assert.equal(gltf.materials.filter(m=>m.normalTexture).length,3,'Expected three baked fabric materials');
assert.ok(gltf.images.every(im=>im.bufferView!==undefined&&im.mimeType==='image/png'),'Texture images must be embedded');
let weightVertices=0,maxWeightError=0,morphMeshes=0;
function accessor(id){
  const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView];
  return {a,v,offset:(v.byteOffset??0)+(a.byteOffset??0)};
}
for(const mesh of gltf.meshes) for(const p of mesh.primitives){
  if(p.targets?.length) morphMeshes++;
  assert.ok(p.attributes.NORMAL!==undefined,`${mesh.name} missing normals`);
  if(p.attributes.WEIGHTS_0===undefined) continue;
  const {a,v,offset}=accessor(p.attributes.WEIGHTS_0);
  assert.equal(a.componentType,5126,'Expected float skin weights');
  for(let i=0;i<a.count;i++){
    let sum=0;
    for(let c=0;c<4;c++){
      const w=binary.readFloatLE(offset+i*(v.byteStride??16)+4*c);
      assert.ok(Number.isFinite(w)&&w>=0&&w<=1.00001); sum+=w;
    }
    maxWeightError=Math.max(maxWeightError,Math.abs(sum-1)); weightVertices++;
  }
}
assert.ok(maxWeightError<1e-5); assert.equal(morphMeshes,2);
const cache=path.join(os.homedir(),'Library/Caches/ms-playwright');
const folder=fs.existsSync(cache)?fs.readdirSync(cache).filter(n=>n.startsWith('chromium_headless_shell-')).sort().at(-1):undefined;
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??(folder?path.join(cache,folder,'chrome-headless-shell-mac-arm64/chrome-headless-shell'):undefined);
const browser=await chromium.launch({executablePath,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
try {
  const page=await browser.newPage({viewport:{width:900,height:1000},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  await page.goto('http://127.0.0.1:5199/blender/viewer/?capture=1');
  await page.waitForFunction(()=>window.__rasan?.ready||window.__rasan?.error,null,{timeout:120000});
  const status=await page.evaluate(()=>({ready:window.__rasan.ready,error:window.__rasan.error}));
  assert.ok(status.ready,status.error);
  await page.evaluate(()=>window.__rasan.frame(3.6));
  const rest=await page.evaluate(()=>window.__rasan.metrics());
  assert.equal(rest.clips.length,9);
  const samples=[];
  for(const clip of rest.clips){
    const result=await page.evaluate(({name,duration})=>{
      const player=window.__rasan;
      const t=duration*(name==='SnapClapperboard'?.5:name==='Blink'?.5:.45);
      player.seek(name,t); const first=player.metrics();
      player.seek(name,duration*.8); player.seek(name,t); const second=player.metrics();
      return {name,first,deformation:player.deformation(),seekIsDeterministic:JSON.stringify(first)===JSON.stringify(second)};
    },clip);
    assert.ok(result.seekIsDeterministic,`${clip.name}: seeking changed result`);
    assert.ok(result.first.skin.every(s=>s.positions.flat().every(Number.isFinite)));
    assert.ok(result.first.bounds.flat().every(Number.isFinite));
    samples.push(result);
    await page.screenshot({path:path.join(evidence,`glb-${clip.name}.png`)});
  }
  const blink=samples.find(s=>s.name==='Blink').first.morphs;
  console.log('DEFORMATION',samples.map(s=>({name:s.name,...s.deformation})));
  assert.ok(samples.every(s=>s.deformation.maxEdgeStretch<6),'Excessive sampled edge stretching');
  assert.ok(blink.length===2&&blink.every(m=>m.weights.some(w=>w>.85)),'Blink did not survive export');
  await page.evaluate(()=>{window.__rasan.seek('Reference',0);window.__rasan.frame(2.8);window.__rasan.transparent(true);});
  await page.screenshot({path:path.join(evidence,'glb-reference.png'),omitBackground:true});
  await page.evaluate(()=>window.__rasan.view(-Math.PI/2));
  await page.screenshot({path:path.join(evidence,'glb-profile.png'),omitBackground:true});
  assert.deepEqual(errors,[]);
  const report={date:new Date().toISOString(),sha256:createHash('sha256').update(data).digest('hex'),fileBytes:data.length,meshCount:gltf.meshes.length,
    skinCount:gltf.skins.length,weightVertices,maxWeightError,morphMeshes,rest,samples,browserErrors:errors};
  fs.writeFileSync(path.join(root,'validation.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({ok:true,fileBytes:data.length,meshCount:gltf.meshes.length,weightVertices,maxWeightError,
    clips:rest.clips.map(c=>c.name),deterministicSeeks:samples.length,blinkMorphs:blink.length,browserErrors:errors},null,2));
} finally {await browser.close();}
