import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadRasan } from './player.js';

const params=new URLSearchParams(location.search);
if(params.has('capture')) document.body.classList.add('capture');
const host=document.querySelector('#viewport');
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.NeutralToneMapping;
renderer.toneMappingExposure=.9;
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFShadowMap;
host.append(renderer.domElement);
const scene=new THREE.Scene(); scene.background=new THREE.Color('#eeeae1');
const pmrem=new THREE.PMREMGenerator(renderer);
const environment=pmrem.fromScene(new RoomEnvironment(),.04);
scene.environment=environment.texture; scene.environmentIntensity=.22;
const camera=new THREE.OrthographicCamera(-1.4,1.4,1.4,-1.4,.01,100);
const controls=new OrbitControls(camera,renderer.domElement);
controls.target.set(0,Number(params.get('center')??1.23),0); controls.enableDamping=false;
const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.16}));
floor.rotation.x=-Math.PI/2; floor.position.y=-.018; floor.receiveShadow=true; scene.add(floor);
const key=new THREE.DirectionalLight(0xfff1db,2.1); key.position.set(-3.5,5.5,4.5);
key.castShadow=true; key.shadow.mapSize.set(2048,2048); key.shadow.camera.left=-2; key.shadow.camera.right=2;
key.shadow.camera.top=3; key.shadow.camera.bottom=-1; key.shadow.normalBias=.006; key.shadow.bias=-.0001;
key.shadow.radius=12; scene.add(key); scene.add(key.target);
const fill=new THREE.DirectionalLight(0xe4eeff,.30); fill.position.set(3,2.8,4); scene.add(fill);
const rim=new THREE.DirectionalLight(0xffffee,.65); rim.position.set(1.5,4.5,-2); scene.add(rim);
const clipSelect=document.querySelector('#clip'),slider=document.querySelector('#time'),clock=document.querySelector('#clock');
let player, timeline, frameHeight=Number(params.get('height')??2.8);
function render(){ renderer.render(scene,camera); }
function resize(){
  const {width,height}=host.getBoundingClientRect(); renderer.setSize(width,height,false);
  const aspect=width/height; camera.left=-frameHeight/2*aspect; camera.right=frameHeight/2*aspect;
  camera.top=frameHeight/2; camera.bottom=-frameHeight/2; camera.updateProjectionMatrix(); render();
}
function frame(height){frameHeight=height;resize();}
function view(az=-.16,elev=.055){
  camera.position.set(Math.sin(az)*8,controls.target.y+elev*8,Math.cos(az)*8);
  camera.lookAt(controls.target); controls.update(); render();
}
function seek(name,seconds){
  timeline?.pause(); document.querySelector('#play').textContent='Play';
  player.seek(name,seconds); clipSelect.value=name;
  const duration=player.clips.get(name)?.duration??1;
  slider.max=duration; slider.value=seconds; clock.textContent=`${seconds.toFixed(2)} s`; render();
}
controls.addEventListener('change',render);
new ResizeObserver(resize).observe(host);
document.querySelector('#views').addEventListener('click',e=>{if(e.target.dataset.az) view(+e.target.dataset.az);});
try {
  player=await loadRasan(params.get('asset')??'../Rasan.glb');
  if(params.has('asset')) {
    const name=params.get('asset').split('/').at(-1).replace(/\.glb$/i,'');
    document.querySelector('h1').textContent=name;
    document.title=`${name} · Blender asset inspection`;
  }
  player.root.traverse(ob=>{ if(ob.isMesh){ ob.castShadow=true; ob.receiveShadow=true; } });
  scene.add(player.root);
  for(const name of player.clips.keys()) clipSelect.add(new Option(name,name));
  clipSelect.addEventListener('change',()=>{if(!params.has('asset'))frame(clipSelect.value==='JumpAndLand'?3.6:clipSelect.value==='Wave'?3.2:2.8);seek(clipSelect.value,0);});
  slider.addEventListener('input',()=>seek(clipSelect.value,+slider.value));
  document.querySelector('#play').addEventListener('click',()=>{
    if(timeline?.isActive()){timeline.pause();document.querySelector('#play').textContent='Play';return;}
    if(clipSelect.value==='Reference') seek('IdleBreathing',0);
    timeline?.kill();
    timeline=player.timeline(clipSelect.value,t=>{slider.value=t;clock.textContent=`${t.toFixed(2)} s`;render();});
    timeline.eventCallback('onComplete',()=>document.querySelector('#play').textContent='Play');
    document.querySelector('#play').textContent='Pause'; timeline.play(+slider.value>=timeline.duration()?0:+slider.value);
  });
  function metrics(){
    const skin=[],morphs=[]; let vertices=0,meshes=0;
    player.root.traverse(ob=>{
      if(!ob.isMesh) return; meshes++; vertices+=ob.geometry.attributes.position.count;
      if(ob.morphTargetDictionary) morphs.push({name:ob.name,keys:ob.morphTargetDictionary,weights:ob.morphTargetInfluences});
      if(ob.isSkinnedMesh){
        const indices=[0,Math.floor(ob.geometry.attributes.position.count/2),ob.geometry.attributes.position.count-1];
        const positions=indices.map(i=>{
          const v=new THREE.Vector3().fromBufferAttribute(ob.geometry.attributes.position,i);
          ob.applyBoneTransform(i,v); return v.applyMatrix4(ob.matrixWorld).toArray();
        });
        skin.push({name:ob.name,bones:ob.skeleton.bones.length,positions});
      }
    });
    const bounds=new THREE.Box3().setFromObject(player.root,true);
    return {meshes,vertices,skin,bounds:[bounds.min.toArray(),bounds.max.toArray()],
      clips:[...player.clips.values()].map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length})),
      morphs};
  }
  function deformation(){
    let skin;
    player.root.traverse(ob=>{if(ob.isSkinnedMesh&&(!skin||ob.geometry.attributes.position.count>skin.geometry.attributes.position.count)) skin=ob;});
    const p=skin.geometry.attributes.position,index=skin.geometry.index;
    const a=new THREE.Vector3(),b=new THREE.Vector3(),da=new THREE.Vector3(),db=new THREE.Vector3();
    let maxEdgeStretch=0,samples=0;
    for(let i=0;i<index.count-2;i+=87){
      const ia=index.getX(i),ib=index.getX(i+1);
      a.fromBufferAttribute(p,ia);b.fromBufferAttribute(p,ib);
      const distance=a.distanceTo(b); if(distance<1e-5) continue;
      da.copy(a);db.copy(b);skin.applyBoneTransform(ia,da);skin.applyBoneTransform(ib,db);
      maxEdgeStretch=Math.max(maxEdgeStretch,da.distanceTo(db)/distance);samples++;
    }
    return {maxEdgeStretch,samples};
  }
  function transparent(on){scene.background=on?null:new THREE.Color('#eeeae1');document.body.style.background=on?'transparent':'#eeeae1';floor.visible=!on;render();}
  window.__rasan={ready:true,seek,view,frame,transparent,render,metrics,deformation,player,renderer};
  document.querySelector('#status').textContent=`${player.clips.size} animation clips · GLB loaded in Three.js`;
  view(); resize(); seek('Reference',0);
} catch(e){document.querySelector('#error').textContent=e.stack;window.__rasan={ready:false,error:e.message};throw e;}
