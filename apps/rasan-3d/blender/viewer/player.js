// The asset owns its animation clips. Scene code only selects and seeks them.
import { AnimationMixer, LoopOnce } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { gsap } from 'gsap';

export async function loadRasan(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  const mixer = new AnimationMixer(root);
  const clips = new Map(gltf.animations.map(clip => [clip.name, clip]));
  function seek(name, seconds = 0) {
    mixer.stopAllAction();
    if (name !== 'Reference') {
      const clip = clips.get(name);
      if (!clip) throw new Error(`Unknown Rasan clip: ${name}`);
      const action = mixer.clipAction(clip);
      action.reset().setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      mixer.setTime(Math.max(0, Math.min(clip.duration, seconds)));
    }
    root.updateMatrixWorld(true);
    root.traverse(ob => { if (ob.isSkinnedMesh) ob.skeleton.update(); });
  }
  // Paused GSAP timeline can be sought by a HyperFrames frame callback.
  // Never use accumulated delta time in a render/export path.
  function timeline(name, onUpdate = () => {}) {
    const clip = clips.get(name);
    if (!clip) throw new Error(`Unknown Rasan clip: ${name}`);
    const clock = { seconds: 0 };
    return gsap.timeline({paused:true}).to(clock, {
      seconds:clip.duration, duration:clip.duration, ease:'none',
      onUpdate:() => { seek(name, clock.seconds); onUpdate(clock.seconds); },
    });
  }
  return {root, clips, seek, timeline, mixer};
}
