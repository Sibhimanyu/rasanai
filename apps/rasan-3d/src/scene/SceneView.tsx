// Renders an evaluated scene inside an R3F canvas. Shared by the studio and Remotion.

import { useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Stage } from '../stage/Stage';
import { CHARACTER_COMPONENTS } from '../characters/components';
import { Clapperboard } from '../props/Clapperboard';
import type { SceneDef } from './types';
import { evaluateScene, type CameraState, type EvaluatedScene } from './evaluate';

export interface SceneViewProps {
  scene: SceneDef;
  time: number;
  portrait?: boolean;
  /** When false, the scene camera is not applied (studio orbit mode). */
  driveCamera?: boolean;
  wireframe?: boolean;
  lighting?: string;
  shadows?: boolean;
  /** Called with the evaluated state (studio uses it for overlays/inspection). */
  onEvaluate?: (e: EvaluatedScene) => void;
}

export function CameraRig({ camera }: { camera: CameraState }) {
  const cam = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useLayoutEffect(() => {
    cam.position.set(...camera.position);
    cam.fov = camera.fov;
    cam.lookAt(new THREE.Vector3(...camera.target));
    cam.updateProjectionMatrix();
  }, [cam, camera.position[0], camera.position[1], camera.position[2], camera.target[0], camera.target[1], camera.target[2], camera.fov]);
  return null;
}

export function SceneView({ scene, time, portrait, driveCamera = true, wireframe, lighting, shadows, onEvaluate }: SceneViewProps) {
  const ev = useMemo(() => evaluateScene(scene, time, { portrait }), [scene, time, portrait]);
  onEvaluate?.(ev);
  return (
    <Stage lighting={lighting ?? scene.lighting} shadows={shadows ?? scene.background.shadows ?? true}>
      {driveCamera && <CameraRig camera={ev.camera} />}
      {ev.characters.map((c) => {
        const C = CHARACTER_COMPONENTS[c.character];
        return (
          <group key={c.id} position={c.position} rotation={[0, c.rotationY, 0]} scale={c.scale}>
            <C pose={c.pose} wireframe={wireframe} />
          </group>
        );
      })}
      {(scene.props ?? []).map((p) => (
        <group key={p.id} position={p.position} rotation={p.rotation ?? [0, 0, 0]} scale={p.scale ?? 1}>
          <Clapperboard clapAngle={p.clap ?? 0} wireframe={wireframe} />
        </group>
      ))}
    </Stage>
  );
}
