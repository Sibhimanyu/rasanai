// Validate the exported GLBs and seek every action in the independent Three.js loader.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidence=path.resolve(root,'../../../.context/crew-models');
const names=process.argv.length>2?process.argv.slice(2):['Tara','Kavi','Chitra'];
const expected=['IdleBreathing','Blink','LookAround','Wave','Walk'].sort();
const cache=path.join(os.homedir(),'Library/Caches/ms-playwright');
const folder=fs.readdirSync(cache).filter(n=>n.startsWith('chromium_headless_shell-')).sort().at(-1);
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??path.join(cache,folder,'chrome-headless-shell-mac-arm64/chrome-headless-shell');
const browser=await chromium.launch({executablePath,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
try {
  for(const name of names){
    const raw=fs.readFileSync(path.join(root,name,`${name}.glb`));
    assert.equal(raw.readUInt32LE(0),0x46546c67);assert.equal(raw.readUInt32LE(8),raw.length);
    const length=raw.readUInt32LE(12),gltf=JSON.parse(raw.subarray(20,20+length)),bin=raw.subarray(28+length);
    assert.equal(gltf.skins.length,1);assert.equal(gltf.skins[0].joints.length,10);
    assert.deepEqual(gltf.animations.map(a=>a.name).sort(),expected);
    let vertices=0,maxWeightError=0,morphMeshes=0;
    for(const mesh of gltf.meshes) for(const p of mesh.primitives){
      assert.notEqual(p.attributes.NORMAL,undefined);
      if(p.targets) morphMeshes++;
      const a=gltf.accessors[p.attributes.WEIGHTS_0];
      assert.ok(a,`${mesh.name}: missing skin weights`);assert.equal(a.componentType,5126);
      const v=gltf.bufferViews[a.bufferView],offset=(a.byteOffset??0)+(v.byteOffset??0);
      for(let i=0;i<a.count;i++){
        let sum=0;
        for(let j=0;j<4;j++){
          const value=bin.readFloatLE(offset+i*(v.byteStride??16)+j*4);
          assert.ok(Number.isFinite(value)&&value>=0&&value<=1.00001);sum+=value;
        }
        maxWeightError=Math.max(maxWeightError,Math.abs(1-sum));vertices++;
      }
    }
    assert.equal(morphMeshes,2);assert.ok(maxWeightError<1e-5);
    const page=await browser.newPage({viewport:{width:800,height:900},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const height={Tara:1.75,Kavi:2.75,Chitra:3.0}[name],center={Tara:.62,Kavi:1.1,Chitra:1.2}[name];
    await page.goto(`http://127.0.0.1:5199/blender/viewer/?capture=1&asset=/crew/${name}/${name}.glb&height=${height}&center=${center}`);
    await page.waitForFunction(()=>window.__rasan?.ready||window.__rasan?.error,null,{timeout:120000});
    assert.equal(await page.evaluate(()=>window.__rasan.error),undefined);
    const rest=await page.evaluate(()=>window.__rasan.metrics());
    const samples=[];
    for(const clip of rest.clips){
      const result=await page.evaluate(({name,duration})=>{
        const p=window.__rasan,t=duration*.5;
        p.seek(name,t); const a=p.metrics();
        p.seek(name,duration*.85);p.seek(name,t); const b=p.metrics();
        return {name,metrics:a,deformation:p.deformation(),deterministic:JSON.stringify(a)===JSON.stringify(b)};
      },clip);
      assert.ok(result.deterministic);assert.ok(result.deformation.maxEdgeStretch<6);
      assert.ok(result.metrics.skin.every(s=>s.positions.flat().every(Number.isFinite)));
      assert.ok(result.metrics.bounds.flat().every(Number.isFinite));
      if(clip.name==='Blink')assert.ok(result.metrics.morphs.every(m=>m.weights[0]>.85));
      if(clip.name==='Wave'||clip.name==='Blink')await page.screenshot({path:path.join(evidence,`${name}-${clip.name}.png`)});
      samples.push(result);
    }
    await page.evaluate(()=>{window.__rasan.seek('Reference',0);window.__rasan.transparent(true);});
    await page.screenshot({path:path.join(evidence,`${name}-GLB.png`),omitBackground:true});
    assert.deepEqual(errors,[]);
    const report={name,date:new Date().toISOString(),sha256:createHash('sha256').update(raw).digest('hex'),bytes:raw.length,
      meshes:gltf.meshes.length,vertices,maxWeightError,morphMeshes,rest,samples,browserErrors:errors};
    fs.writeFileSync(path.join(root,name,'validation.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({name,ok:true,bytes:raw.length,vertices,clips:samples.length,maxWeightError,browserErrors:errors}));
    await page.close();
  }
}finally{await browser.close();}
