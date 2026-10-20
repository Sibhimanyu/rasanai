// Frame-seek the exported GLB, then encode the captured frames with ffmpeg.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const frames=path.resolve(root,'../../../.context/rasan-blender/demo-frames');
fs.mkdirSync(frames,{recursive:true});
const cache=path.join(os.homedir(),'Library/Caches/ms-playwright');
const folder=fs.existsSync(cache)?fs.readdirSync(cache).filter(n=>n.startsWith('chromium_headless_shell-')).sort().at(-1):undefined;
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??(folder?path.join(cache,folder,'chrome-headless-shell-mac-arm64/chrome-headless-shell'):undefined);
const browser=await chromium.launch({executablePath,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
const clips=JSON.parse(fs.readFileSync(path.join(root,'animations/clips.json'))).clips;
const labels=['Idle breathing','Blink','Look around','Happy bounce','Wave','Walk','Jump and land','Raise clapperboard','Snap clapperboard'];
try {
  const page=await browser.newPage({viewport:{width:900,height:900},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5199/blender/viewer/?capture=1');
  await page.waitForFunction(()=>window.__rasan?.ready,null,{timeout:120000});
  await page.evaluate(()=>{
    window.__rasan.frame(3.6);window.__rasan.view(-.25);
    const label=document.createElement('div');label.id='action-label';
    label.style.cssText='position:fixed;bottom:30px;left:34px;font:500 20px system-ui;color:#625d54;letter-spacing:.02em';
    document.body.append(label);
  });
  let index=0;
  for(const [name,{seconds}] of Object.entries(clips)){
    const duration=2,count=duration*30,label=labels[index++];
    for(let i=0;i<count;i++){
      const frameIndex=(index-1)*count+i;
      await page.evaluate(({name,time,label})=>{
        window.__rasan.seek(name,time);document.querySelector('#action-label').textContent=label;
      },{name,time:seconds*i/(count-1),label});
      await page.screenshot({path:path.join(frames,`${String(frameIndex).padStart(4,'0')}.png`)});
    }
    console.log('Captured',name);
  }
  if(errors.length) throw new Error(errors.join('\n'));
} finally {await browser.close();}
await new Promise((resolve,reject)=>{
  const child=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','30','-i',path.join(frames,'%04d.png'),
    '-frames:v','540','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',path.join(root,'animations/rasan-demo.mp4')],{stdio:'inherit'});
  child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`ffmpeg exited ${code}`)));
});
console.log('Wrote animations/rasan-demo.mp4 (18 seconds, 900×900, 30 fps)');
