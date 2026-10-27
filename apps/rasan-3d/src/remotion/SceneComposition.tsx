// A scene rendered by Remotion. Time comes only from useCurrentFrame(), so every frame is
// independent and matches the studio exactly (same evaluateScene, same SceneView).

import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { SceneView } from '../scene/SceneView';
import { SCENES } from '../scene/scenes/showcase';
import { evaluateScene } from '../scene/evaluate';

export interface SceneCompositionProps {
  sceneId: string;
  portrait?: boolean;
  transparent?: boolean;
  lighting?: string;
  audio?: boolean;
  [key: string]: unknown;
}

export function SceneComposition({ sceneId, portrait, transparent, lighting, audio = true }: SceneCompositionProps) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const scene = SCENES[sceneId];
  const t = frame / fps;
  const overlay = evaluateScene(scene, t, { portrait }).overlay;
  return (
    <AbsoluteFill style={{ background: transparent ? 'transparent' : scene.background.css }}>
      <ThreeCanvas
        width={width}
        height={height}
        shadows
        dpr={1}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        camera={{ fov: scene.camera.fov, near: 0.1, far: 100, position: [0, 1.4, 9] }}
      >
        <SceneView scene={scene} time={t} portrait={portrait} lighting={lighting} />
      </ThreeCanvas>
      {!transparent && overlay.opacity > 0 && (
        <AbsoluteFill style={{ background: overlay.color, opacity: overlay.opacity }} />
      )}
      {audio && !transparent &&
        (scene.audio ?? []).map((a, i) => (
          <Sequence key={i} from={Math.round(a.start * fps)} layout="none">
            <Audio src={staticFile(a.src)} volume={a.volume ?? 1} />
          </Sequence>
        ))}
    </AbsoluteFill>
  );
}
