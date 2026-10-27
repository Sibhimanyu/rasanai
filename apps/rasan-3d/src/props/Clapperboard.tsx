import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BOARD } from './boardLayout';
import { stripeTexture, slateTexture } from '../materials/textures';
import { matteDark } from '../materials/materials';

export interface ClapperboardProps {
  clapAngle: number;
  wireframe?: boolean;
  color?: string;
}

/** Film clapperboard: slate, fixed striped stick, and a clapper hinged at the top-left. */
export function Clapperboard({ clapAngle, wireframe, color = '#1d1d21' }: ClapperboardProps) {
  const { W, H, D, SH } = BOARD;
  const r = useMemo(() => {
    const body = matteDark(color, { wireframe });
    const stripes = new THREE.MeshPhysicalMaterial({ map: stripeTexture(), roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.4, wireframe });
    const face = new THREE.MeshPhysicalMaterial({ map: slateTexture(), roughness: 0.7, wireframe });
    const steel = new THREE.MeshPhysicalMaterial({ color: '#8b8b92', metalness: 0.85, roughness: 0.32, wireframe });
    return {
      body, stripes, face, steel,
      slate: new RoundedBoxGeometry(W, H, D, 4, 0.02),
      stick: new RoundedBoxGeometry(W, SH, D * 0.9, 3, 0.014),
      stripePlane: new THREE.PlaneGeometry(W - 0.012, SH - 0.014),
      facePlane: new THREE.PlaneGeometry(W - 0.03, H - 0.03),
      pin: new THREE.CylinderGeometry(0.017, 0.017, 0.016, 20),
    };
  }, [W, H, D, SH, color, wireframe]);

  const hinge = BOARD.hinge;
  const stick = (
    <>
      <mesh geometry={r.stick} material={r.body} castShadow receiveShadow />
      <mesh geometry={r.stripePlane} material={r.stripes} position={[0, 0, D * 0.45 + 0.0015]} />
      <mesh geometry={r.stripePlane} material={r.stripes} position={[0, 0, -D * 0.45 - 0.0015]} rotation={[0, Math.PI, 0]} />
    </>
  );
  return (
    <group name="Clapperboard">
      <mesh geometry={r.slate} material={r.body} castShadow receiveShadow />
      <mesh geometry={r.facePlane} material={r.face} position={[0, 0, D / 2 + 0.001]} />
      <group name="FixedStick" position={[0, BOARD.stickY, 0]}>{stick}</group>
      <group name="ClapperHinge" position={hinge} rotation={[0, 0, clapAngle]}>
        <group name="Clapper" position={[W / 2 - 0.03, SH / 2, 0]}>{stick}</group>
        <mesh geometry={r.pin} material={r.steel} rotation={[Math.PI / 2, 0, 0]} position={[0.02, -0.005, D * 0.5]} />
      </group>
      <mesh geometry={r.pin} material={r.steel} rotation={[Math.PI / 2, 0, 0]} position={[-W / 2 + 0.05, BOARD.stickY - 0.01, D * 0.5]} />
    </group>
  );
}
