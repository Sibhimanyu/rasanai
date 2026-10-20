// Alpha-bound alignment: both subjects get the same height, without background margins.
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidence=path.resolve(root,'../../../.context/rasan-blender');
function load(file){return PNG.sync.read(fs.readFileSync(file));}
function crop(im,x,y,width,height){
  const out=new PNG({width,height});
  for(let yy=0;yy<height;yy++) for(let xx=0;xx<width;xx++){
    const a=((y+yy)*im.width+x+xx)*4,b=(yy*width+xx)*4;
    out.data.set(im.data.subarray(a,a+4),b);
  }
  return out;
}
function canvas(width,height){
  const im=new PNG({width,height});
  for(let i=0;i<im.data.length;i+=4) im.data.set([238,234,225,255],i);
  return im;
}
function bounds(im){
  let x0=im.width,y0=im.height,x1=0,y1=0;
  for(let y=0;y<im.height;y++) for(let x=0;x<im.width;x++) if(im.data[(y*im.width+x)*4+3]>250){
    x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
  }
  return [x0,y0,x1-x0+1,y1-y0+1];
}
function place(out,im,x,y,w,h,wholeFrame=false){
  const [bx,by,bw,bh]=wholeFrame?[0,0,im.width,im.height]:bounds(im), scale=Math.min(w/bw,h/bh);
  const dw=Math.round(bw*scale),dh=Math.round(bh*scale);
  const ox=x+Math.round((w-dw)/2),oy=y+Math.round((h-dh)/2);
  for(let yy=0;yy<dh;yy++) for(let xx=0;xx<dw;xx++){
    const sx=Math.min(im.width-1,bx+xx/scale),sy=Math.min(im.height-1,by+yy/scale);
    const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
    let alpha=0;const rgb=[0,0,0];
    for(const [dx,dy,weight] of [[0,0,(1-fx)*(1-fy)],[1,0,fx*(1-fy)],[0,1,(1-fx)*fy],[1,1,fx*fy]]){
      const a=(Math.min(im.height-1,iy+dy)*im.width+Math.min(im.width-1,ix+dx))*4;
      const aw=im.data[a+3]/255*weight;alpha+=aw;
      for(let c=0;c<3;c++) rgb[c]+=im.data[a+c]*aw;
    }
    const dest=((yy+oy)*out.width+xx+ox)*4;
    for(let c=0;c<3;c++) out.data[dest+c]=Math.round(rgb[c]+out.data[dest+c]*(1-alpha));
  }
}
function pair(a,b,name,wholeFrame=false){
  const out=canvas(1800,1000);place(out,load(a),30,30,840,940,wholeFrame);place(out,load(b),930,30,840,940,wholeFrame);
  fs.writeFileSync(path.join(root,'comparisons',name),PNG.sync.write(out));
}
const ref=path.join(root,'renders/reference.png');
pair(path.resolve(root,'../public/reference/rasan.png'),ref,'reference-vs-blender.png');
{
  const original=load(path.resolve(root,'../public/reference/rasan.png')), rebuilt=load(ref);
  const pixelsPerUnit=rebuilt.height/2.8,scale=pixelsPerUnit/380;
  const x=Math.round(rebuilt.width/2+(120-380)*scale);
  const y=Math.round(rebuilt.height/2-(843/380+.16-1.23*Math.cos(.055))*pixelsPerUnit);
  const out=canvas(1200,350);
  place(out,crop(original,120,0,510,245),30,25,540,300,true);
  place(out,crop(rebuilt,x,y,Math.round(510*scale),Math.round(245*scale)),630,25,540,300,true);
  fs.writeFileSync(path.join(root,'comparisons/cap-reference-detail.png'),PNG.sync.write(out));
  const reviewDir=path.resolve(root,'../../../.context/rasan-cap-rebuild');
  if(fs.existsSync(reviewDir))fs.copyFileSync(path.join(root,'comparisons/cap-reference-detail.png'),path.join(reviewDir,'reference-vs-rebuild.png'));
}
const previousLook=path.resolve(root,'../../../.context/rasan-look-revision/before.png');
if(fs.existsSync(previousLook)){
  pair(previousLook,ref,'look-before-after.png',true);
  fs.copyFileSync(path.join(root,'comparisons/look-before-after.png'),path.resolve(root,'../../../.context/rasan-look-revision/before-after.png'));
}
const previousCap=path.resolve(root,'../../../.context/rasan-cap-rebuild/before.png');
if(fs.existsSync(previousCap)){
  pair(previousCap,ref,'cap-before-after.png',true);
  fs.copyFileSync(path.join(root,'comparisons/cap-before-after.png'),path.resolve(root,'../../../.context/rasan-cap-rebuild/before-after.png'));
}
if(fs.existsSync(path.join(evidence,'glb-reference.png'))) pair(ref,path.join(evidence,'glb-reference.png'),'cycles-vs-three.png');
const views=['reference','front','left-profile','right-profile','three-quarter','back'];
if(views.every(name=>fs.existsSync(path.join(root,`renders/${name}.png`)))){
  const out=canvas(1620,1200);
  views.forEach((name,i)=>place(out,load(path.join(root,`renders/${name}.png`)),i%3*540+20,Math.floor(i/3)*600+20,500,560));
  fs.writeFileSync(path.join(root,'comparisons/multiview.png'),PNG.sync.write(out));
}
const poses=['Wave','JumpAndLand','RaiseClapperboard','SnapClapperboard','Blink'];
if(poses.every(name=>fs.existsSync(path.join(root,`animations/${name}.png`)))){
  const out=canvas(2000,500);
  poses.forEach((name,i)=>place(out,load(path.join(root,`animations/${name}.png`)),i*400+10,20,380,460));
  fs.writeFileSync(path.join(root,'comparisons/pose-sheet.png'),PNG.sync.write(out));
}
const beauty=canvas(900,1000);place(beauty,load(ref),30,30,840,940);
fs.writeFileSync(path.join(root,'renders/reference-on-cream.png'),PNG.sync.write(beauty));
fs.copyFileSync(path.join(root,'comparisons/reference-vs-blender.png'),path.join(evidence,'final-comparison.png'));
console.log('Review sheets updated (comparison pairs read left → right).');
