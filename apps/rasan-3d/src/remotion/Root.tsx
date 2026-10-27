import { Composition } from 'remotion';
import { SceneComposition } from './SceneComposition';
import { demoScene } from '../scene/scenes/demo';

const frames = Math.round(demoScene.duration * demoScene.fps);

export function RemotionRoot() {
  return (
    <>
      <Composition id="RasanDemo" component={SceneComposition} durationInFrames={frames} fps={demoScene.fps} width={1920} height={1080} defaultProps={{ sceneId: demoScene.id }} />
      <Composition id="RasanDemoPortrait" component={SceneComposition} durationInFrames={frames} fps={demoScene.fps} width={1080} height={1920} defaultProps={{ sceneId: demoScene.id, portrait: true }} />
      <Composition id="RasanDemoAlpha" component={SceneComposition} durationInFrames={frames} fps={demoScene.fps} width={1920} height={1080} defaultProps={{ sceneId: demoScene.id, transparent: true, audio: false }} />
    </>
  );
}
