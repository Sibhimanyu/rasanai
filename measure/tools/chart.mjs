// usage: node chart.mjs <before.json> <after.json|-> <out.png> <title> [madBudget] [dispBudget]
import { chromium } from '/tmp/mshot/node_modules/playwright/index.mjs';
import { load, series, sceneOf } from './analyze.mjs';
import fs from 'fs';
const [bf, af, out, title, mb = '0', db = '0'] = process.argv.slice(2);
const mk = (f) => { const d = load(f), ser = series(d); const secs = d.geo.secs.map((s) => ({ n: s.n, a: s.top, b: s.top + s.h })); return { vh: d.geo.vh, total: d.geo.total, ser: ser.map((o) => [o.y, o.mad, o.disp, o.crew, o.plane, o.device, o.letters]), secs, sc: ser.map((o) => sceneOf(d, o.y)) }; };
const sets = [{ label: 'BEFORE', d: mk(bf) }];
if (af !== '-') sets.push({ label: 'AFTER', d: mk(af) });
const html = `<body style="margin:0;background:#fff"><canvas id=c></canvas><script>
const sets=${JSON.stringify(sets)}, title=${JSON.stringify(title)}, MB=${+mb}, DB=${+db};
const W=1900, PH=230, GAP=34, L=70, R=20, T0=70;
const panels=[]; for (const k of ['mad','disp']) for (const s of sets) panels.push({k,s});
const c=document.getElementById('c'); c.width=W; c.height=T0+panels.length*(PH+GAP)+20; const g=c.getContext('2d');
g.fillStyle='#fff'; g.fillRect(0,0,c.width,c.height); g.font='bold 22px system-ui'; g.fillStyle='#111'; g.fillText(title,L,34);
g.font='13px system-ui'; g.fillStyle='#555'; g.fillText('x: page position in viewport heights.  smoothing window = 0.1 vh.  red dashed = ceiling.  axes are clipped: plain page scrolling between scenes (sections sliding past) is far taller than any scene and runs off the top.',L,54);
const maxVH=Math.max(...sets.map(s=>s.d.total/s.d.vh));
const maxY={mad:0,disp:0};
for(const s of sets){ for(const r of s.d.ser){ maxY.mad=Math.max(maxY.mad,r[1]); maxY.disp=Math.max(maxY.disp,r[2]); } }
// shared y scale per metric, clipped so one spike doesn't flatten the rest
const cap={mad:Math.max(MB*2.2,1),disp:Math.max(DB*2.5,2)};
const ymax={mad:MB*4,disp:DB*3.2};   // clipped: ordinary page scroll between scenes (the tall narrow spikes) runs off the top
const colors={ crew:'#7b3fe4', plane:'#e4572e', device:'#0a9396', letters:'#c9a227'};
panels.forEach((p,i)=>{
  const y0=T0+i*(PH+GAP), d=p.s.d, ym=ymax[p.k];
  g.strokeStyle='#ddd'; g.strokeRect(L,y0,W-L-R,PH);
  const X=v=>L+(v/d.vh/maxVH)*(W-L-R), Y=v=>y0+PH-Math.min(1,v/ym)*PH;
  // scene bands
  d.secs.forEach((s,j)=>{ g.fillStyle=j%2?'rgba(0,0,0,.035)':'rgba(0,0,0,.0)'; g.fillRect(X(s.a),y0,X(Math.min(s.b,d.total))-X(s.a),PH); g.fillStyle='#777'; g.font='11px system-ui'; if(i<2||true) g.fillText(s.n,X(s.a)+3,y0+12); });
  // y ticks
  g.fillStyle='#777'; g.font='11px system-ui'; for(let t=0;t<=4;t++){ const v=ym*t/4; g.fillText(v.toFixed(p.k==='mad'?2:1),8,Y(v)+4); g.strokeStyle='#eee'; g.beginPath(); g.moveTo(L,Y(v)); g.lineTo(W-R,Y(v)); g.stroke(); }
  // budget line
  const B=p.k==='mad'?MB:DB; if(B>0){ g.setLineDash([6,4]); g.strokeStyle='#c00'; g.beginPath(); g.moveTo(L,Y(B)); g.lineTo(W-R,Y(B)); g.stroke(); g.setLineDash([]); g.fillStyle='#c00'; g.fillText('ceiling '+B,W-R-90,Y(B)-4); }
  if(p.k==='mad'){ g.strokeStyle=p.s.label==='BEFORE'?'#444':'#1565c0'; g.lineWidth=1.2; g.beginPath(); d.ser.forEach((r,j)=>{ const x=X(r[0]),y=Y(r[1]); j?g.lineTo(x,y):g.moveTo(x,y); }); g.stroke(); }
  else { ['crew','plane','device','letters'].forEach((nm,ci)=>{ g.strokeStyle=colors[nm]; g.lineWidth=1.1; g.beginPath(); let st=false; d.ser.forEach((r)=>{ const x=X(r[0]),y=Y(r[3+ci]); st?g.lineTo(x,y):g.moveTo(x,y); st=true; }); g.stroke(); }); }
  g.lineWidth=1; g.fillStyle='#111'; g.font='bold 14px system-ui';
  g.fillText((p.k==='mad'?'image change per 100 scroll px':'key element speed, px per scroll px (crew purple, plane orange, device teal, letters gold)')+'  ('+p.s.label+')',L+4,y0+PH-8);
});
</script></body>`;
const b = await chromium.launch({ headless: false }); const pg = await b.newPage({ viewport: { width: 1900, height: 1000 } });
await pg.setContent(html); await pg.waitForTimeout(300);
await pg.locator('#c').screenshot({ path: out }); await b.close();
