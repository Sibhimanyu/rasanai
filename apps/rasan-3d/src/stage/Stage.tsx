// The studio set: environment (softboxes baked into an env map, no network), key/fill/rim,
// a shadow-catching floor and soft contact shadows. Transparent-friendly: the background is
// drawn by the page/composition behind the canvas, so alpha export just works.

import { Environment, Lightformer, ContactShadows } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, type ReactNode } from 'react';
import * as THREE from 'three';
import { LIGHTING, type LightDef } from './lighting';

export interface StageProps {
  lighting?: string | LightDef;
  shadows?: boolean;
  floorY?: number;
  children?: ReactNode;
  /** Re-render the contact shadows every frame (needed when characters move). */
  dynamicShadows?: boolean;
}

export function Stage({ lighting = 'studio', shadows = true, floorY = 0, dynamicShadows = true, children }: StageProps) {
  const L = typeof lighting === 'string' ? LIGHTING[lighting] ?? LIGHTING.studio : lighting;
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMapping = THREE.NeutralToneMapping;
    gl.toneMappingExposure = L.exposure;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.VSMShadowMap;
  }, [gl, L.exposure]);
  return (
    <>
      <Environment resolution={256} frames={1} environmentIntensity={L.envIntensity}>
        <color attach="background" args={['#5a5652']} />
        {L.softboxes.map(([x, y, z, w, h, i, c], k) => (
          <Lightformer key={k} form="rect" intensity={i} color={c} position={[x, y, z]} scale={[w, h, 1]} target={[0, 1, 0]} />
        ))}
      </Environment>
      <ambientLight intensity={L.ambient} />
      <directionalLight
        position={L.key.position}
        intensity={L.key.intensity}
        color={L.key.color}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={8}
        shadow-blurSamples={16}
        shadow-intensity={0.55}
      />
      <directionalLight position={L.fill.position} intensity={L.fill.intensity} color={L.fill.color} />
      <directionalLight position={L.rim.position} intensity={L.rim.intensity} color={L.rim.color} />
      {shadows && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY + 0.001, 0]} receiveShadow>
            <planeGeometry args={[40, 40]} />
            <shadowMaterial transparent opacity={L.shadowOpacity * 0.35} />
          </mesh>
          <ContactShadows
            position={[0, floorY + 0.002, 0]}
            scale={8}
            resolution={1024}
            blur={2.4}
            far={2.2}
            opacity={L.shadowOpacity * 1.6}
            color="#3a2a12"
            frames={dynamicShadows ? Infinity : 1}
          />
          <ContactShadows position={[0, floorY + 0.003, 0]} scale={5} resolution={1024} blur={0.6} far={0.35} opacity={0.55} color="#2a1c08" frames={dynamicShadows ? Infinity : 1} />
        </>
      )}
      {children}
    </>
  );
}
