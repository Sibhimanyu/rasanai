import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PNG} from 'pngjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidence=path.resolve(root,'../../../.context/crew-models');
function load(file){return PNG.sync.read(fs.readFileSync(file));}
function canvas(w,h){
  const out=new PNG({width:w,height:h});for(let i=0;i<out.data.length;i+=4)out.data.set([239,236,229,255],i);return out;
}
function place(out,im,x,y,w,h){
  let x0=im.width,x1=0,y0=im.height,y1=0;
  for(let yy=0;yy<im.height;yy++)for(let xx=0;xx<im.width;xx++)if(im.data[(yy*im.width+xx)*4+3]>250){x0=Math.min(x0,xx);x1=Math.max(x1,xx);y0=Math.min(y0,yy);y1=Math.max(y1,yy);}
  const bw=x1-x0+1,bh=y1-y0+1,s=Math.min(w/bw,h/bh),dw=Math.round(bw*s),dh=Math.round(bh*s);
  const ox=x+(w-dw)/2,oy=y+(h-dh)/2;
  for(let yy=0;yy<dh;yy++)for(let xx=0;xx<dw;xx++){
    const a=((y0+Math.min(bh-1,Math.floor(yy/s)))*im.width+x0+Math.min(bw-1,Math.floor(xx/s)))*4;
    const b=((Math.round(oy)+yy)*out.width+Math.round(ox)+xx)*4,alpha=im.data[a+3]/255;
    for(let c=0;c<3;c++)out.data[b+c]=Math.round(im.data[a+c]*alpha+out.data[b+c]*(1-alpha));
  }
}
const family=canvas(1800,1000);
for(const [i,name] of ['Tara','Kavi','Chitra'].entries()){
  const ref=load(path.join(root,'reference',name+'.png')),render=load(path.join(root,name,'renders/reference.png'));
  const pair=canvas(1200,900);place(pair,ref,20,30,560,840);place(pair,render,620,30,560,840);
  fs.writeFileSync(path.join(root,name,'comparison.png'),PNG.sync.write(pair));
  fs.writeFileSync(path.join(evidence,name+'-comparison.png'),PNG.sync.write(pair));
  const views=canvas(1500,900);
  for(const [j,view] of ['reference','three-quarter','back'].entries())place(views,load(path.join(root,name,`renders/${view}.png`)),j*500+15,30,470,840);
  fs.writeFileSync(path.join(root,name,'multiview.png'),PNG.sync.write(views));
  place(family,render,i*600+30,30,540,920);
}
fs.writeFileSync(path.join(evidence,'three-models.png'),PNG.sync.write(family));
console.log('Reference comparisons and model review sheets updated.');
