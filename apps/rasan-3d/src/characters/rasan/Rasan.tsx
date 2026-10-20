// Rasan: geometry + materials + rig solve. Takes a Pose; renders every part where the rig says.
// Hierarchy: Rasan > Root > (LeftFoot, RightFoot, Body frame > (Body, eyes, brows, Hat, arms, Clapperboard))

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Pose } from '../../core/pose';
import { buildBodyGeometry } from '../../geometry/revolve';
import { LiveTube, bezier2 } from '../../geometry/tube';
import { rasanShape } from './shape';
import { RASAN } from './proportions';
import { solveRasan, type ArmSolve, type EyeSolve } from './rig';
import { crownGeometry, bandGeometry, brimGeometry } from './capGeometry';
import { clayMaterial, feltMaterial, glossyBlack, brassMaterial, highlightMaterial, matteDark } from '../../materials/materials';
import { Clapperboard } from '../../props/Clapperboard';

export interface RasanProps {
  pose: Pose;
  wireframe?: boolean;
}

const C = RASAN.color;

function useRasanMaterials(wireframe = false) {
  return useMemo(() => {
    const skinBody = clayMaterial(C.body, '#ffcf6a', { wireframe, vertexColors: true });
    const skin = clayMaterial(C.body, '#ffcf6a', { wireframe });
    const felt = feltMaterial(C.cap, C.capSheen, { wireframe });
    felt.side = THREE.DoubleSide;
    return {
      skin,
      skinBody,
      felt,
      eye: glossyBlack({ wireframe }),
      brow: matteDark(C.brow, { wireframe }),
      brass: brassMaterial(C.brass, { wireframe }),
      highlight: highlightMaterial(),
    };
  }, [wireframe]);
}

/** Tonal variation: warmer and deeper toward the seat and the sides, lighter on the crown. */
function bodyTint(h: number, theta: number) {
  const base = new THREE.Color(1, 1, 1);
  const low = Math.exp(-Math.pow(h / 0.35, 2));
  const crown = THREE.MathUtils.smoothstep(h, 1.1, 1.9);
  const side = Math.pow(Math.abs(Math.sin(theta)), 3);
  const deep = new THREE.Color(0.95, 0.8, 0.66);
  const light = new THREE.Color(1.04, 1.03, 0.98);
  base.lerp(deep, 0.55 * low + 0.12 * side).lerp(light, 0.35 * crown);
  return base;
}

function useBodyGeometry() {
  return useMemo(() => buildBodyGeometry(rasanShape(), 160, (h, th) => bodyTint(h, th)), []);
}

function Arm({ arm, skin }: { arm: ArmSolve; skin: THREE.Material }) {
  const tube = useMemo(() => new LiveTube({ segments: 28, radial: 28, capRings: 8 }), []);
  useEffect(() => () => tube.dispose(), [tube]);
  const R = RASAN.arm.radius, HR = RASAN.arm.handRadius;
  // spine ends inside the hand; the arm swells slightly at the shoulder so it grows out of the body
  const spine = bezier2(arm.shoulder, arm.control, arm.hand);
  tube.update(spine, (s) => R * (1.06 - 0.1 * s));
  return (
    <group>
      <mesh geometry={tube.geometry} material={skin} castShadow receiveShadow />
      <mesh position={arm.hand} quaternion={arm.handQuat} scale={[HR * 1.02, HR * 0.94, HR * 1.06]} material={skin} castShadow receiveShadow>
        <sphereGeometry args={[1, 40, 28]} />
      </mesh>
    </group>
  );
}

function Brow({ points, material }: { points: THREE.Vector3[]; material: THREE.Material }) {
  const tube = useMemo(() => new LiveTube({ segments: 24, radial: 12, capRings: 5 }), []);
  useEffect(() => () => tube.dispose(), [tube]);
  const curve = new THREE.CatmullRomCurve3(points);
  const r = RASAN.brow.radius;
  tube.update((s, out) => out.copy(curve.getPoint(s)), (s) => r * (0.75 + 0.35 * Math.sin(Math.PI * s)));
  return <mesh geometry={tube.geometry} material={material} castShadow />;
}

function Eye({ eye, mats, side }: { eye: EyeSolve; mats: ReturnType<typeof useRasanMaterials>; side: 1 | -1 }) {
  const arc = useMemo(() => {
    // the happy "^" arc: a short bent tube lying on the eye's plane
    const t = new LiveTube({ segments: 20, radial: 10, capRings: 5 });
    const W = RASAN.eye.width * 0.72, Hh = RASAN.eye.tall * 0.3;
    t.update((s, out) => {
      const u = s * 2 - 1;
      return out.set(u * W, Hh * (1 - u * u) - Hh * 0.4, 0);
    }, () => 0.017);
    return t;
  }, []);
  useEffect(() => () => arc.dispose(), [arc]);
  const showOval = eye.scale.y > 0.007 && eye.happy < 0.98;
  const hl = 1 - Math.max(eye.closed, eye.happy);
  return (
    <group position={eye.position} quaternion={eye.quaternion}>
      {showOval && (
        <mesh scale={eye.scale} material={mats.eye} castShadow={false}>
          <sphereGeometry args={[1, 40, 28]} />
        </mesh>
      )}
      {showOval && hl > 0.3 && (
        <mesh
          position={[-eye.scale.x * 0.34, eye.scale.y * 0.42, eye.scale.z * 0.9]}
          rotation={[0, 0, -0.35]}
          scale={[eye.scale.x * 0.2, Math.min(eye.scale.y * 0.2, 0.028), 0.004]}
          material={mats.highlight}
        >
          <sphereGeometry args={[1, 16, 12]} />
        </mesh>
      )}
      {eye.happy > 0.02 && (
        <mesh geometry={arc.geometry} material={mats.eye} position={[0, 0, RASAN.eye.depth * 0.2]} scale={[1, eye.happy, 1]} />
      )}
    </group>
  );
}

function Hat({ felt, brass }: { felt: THREE.Material; brass: THREE.Material }) {
  const geo = useMemo(() => ({ crown: crownGeometry(), band: bandGeometry(), brim: brimGeometry() }), []);
  const [RA, RB] = RASAN.hat.bandRadius;
  const bth = -1.3; // gold snap on the cap's right side
  return (
    <group name="Hat">
      <mesh geometry={geo.crown} material={felt} castShadow receiveShadow />
      <mesh geometry={geo.band} material={felt} castShadow receiveShadow />
      <mesh geometry={geo.brim} material={felt} castShadow receiveShadow />
      <mesh position={[Math.sin(bth) * (RA + 0.025), 0.05, Math.cos(bth) * (RB + 0.025)]} rotation={[0, bth, 0]} scale={[0.032, 0.032, 0.016]} material={brass} castShadow>
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
    </group>
  );
}

export function Rasan({ pose, wireframe = false }: RasanProps) {
  const mats = useRasanMaterials(wireframe);
  const bodyGeo = useBodyGeometry();
  const s = useMemo(() => solveRasan(pose), [pose]);
  const footGeo = useMemo(() => new THREE.SphereGeometry(1, 40, 24), []);
  const rootRef = useRef<THREE.Group>(null);

  const decompose = (m: THREE.Matrix4) => {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    m.decompose(p, q, sc);
    return { position: p, quaternion: q };
  };
  const root = decompose(s.root), body = decompose(s.body), prop = decompose(s.prop.matrix);
  const fl = decompose(s.feet.L), fr = decompose(s.feet.R);
  const fR = RASAN.foot.radii;

  return (
    <group name="Rasan" ref={rootRef}>
      <group name="Root" {...root}>
        <mesh name="LeftFoot" {...fl} scale={fR} geometry={footGeo} material={mats.skin} castShadow receiveShadow />
        <mesh name="RightFoot" {...fr} scale={fR} geometry={footGeo} material={mats.skin} castShadow receiveShadow />
        <group name="BodyFrame" {...body}>
          <mesh name="Body" geometry={bodyGeo} material={mats.skinBody} scale={s.bodyScale} castShadow receiveShadow />
          <group name="LeftEye"><Eye eye={s.eyes.L} mats={mats} side={1} /></group>
          <group name="RightEye"><Eye eye={s.eyes.R} mats={mats} side={-1} /></group>
          <group name="LeftEyebrow"><Brow points={s.brows.L} material={mats.brow} /></group>
          <group name="RightEyebrow"><Brow points={s.brows.R} material={mats.brow} /></group>
          <group position={s.hat.position} quaternion={s.hat.quaternion}>
            <Hat felt={mats.felt} brass={mats.brass} />
          </group>
          <group name="LeftArm"><Arm arm={s.arms.L} skin={mats.skin} /></group>
          <group name="RightArm"><Arm arm={s.arms.R} skin={mats.skin} /></group>
          {s.prop.visible && (
            <group {...prop}>
              <Clapperboard clapAngle={s.prop.clapAngle} wireframe={wireframe} />
            </group>
          )}
        </group>
      </group>
    </group>
  );
}
