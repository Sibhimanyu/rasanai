// Rasan's rig solve: Pose (numbers) -> transforms for every part. Pure and Three.js-only (no
// React), so it is shared by the studio, the Remotion renders and the tests.

import * as THREE from 'three';
import type { Pose } from '../../core/pose';
import type { RigSpec } from '../../core/rig';
import { preserveVolume, clamp } from '../../core/ease';
import { surfaceFrame, surfacePoint, surfaceNormal } from '../../geometry/revolve';
import { RASAN } from './proportions';
import { rasanShape } from './shape';
import { boardGrips } from '../../props/boardLayout';

export const RASAN_RIG: RigSpec = {
  name: 'Rasan',
  bodyHeight: RASAN.bodyHeight,
  bodyRadius: RASAN.bodyRadius,
  seatHeight: RASAN.seatHeight,
  shoulderL: RASAN.arm.shoulderL,
  shoulderR: RASAN.arm.shoulderR,
  handRestL: [0.84, 0.6, 0.5],
  handRestR: [-0.84, 0.6, 0.5],
  armReach: RASAN.arm.reach,
  armRadius: RASAN.arm.radius,
  handRadius: RASAN.arm.handRadius,
  footRestL: RASAN.foot.restL,
  footRestR: RASAN.foot.restR,
  rest: { 'prop.clap': 0.45 },
};

export interface EyeSolve {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3; // ellipsoid radii
  happy: number;
  closed: number;
}

export interface ArmSolve {
  shoulder: THREE.Vector3;
  control: THREE.Vector3;
  hand: THREE.Vector3;
  handQuat: THREE.Quaternion;
}

export interface RasanSolve {
  root: THREE.Matrix4;
  body: THREE.Matrix4; // rigid body frame (no squash)
  bodyScale: THREE.Vector3;
  eyes: { L: EyeSolve; R: EyeSolve };
  brows: { L: THREE.Vector3[]; R: THREE.Vector3[] }; // spine samples, body frame
  arms: { L: ArmSolve; R: ArmSolve };
  hat: { position: THREE.Vector3; quaternion: THREE.Quaternion };
  prop: { matrix: THREE.Matrix4; clapAngle: number; visible: boolean };
  feet: { L: THREE.Matrix4; R: THREE.Matrix4 };
}

const v3 = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2]);

export const BROW_SAMPLES = 16;

export function solveRasan(p: Pose): RasanSolve {
  const shape = rasanShape();

  const root = new THREE.Matrix4().compose(
    new THREE.Vector3(p['root.x'], p['root.y'], p['root.z']),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p['root.yaw'], 0)),
    new THREE.Vector3(1, 1, 1),
  );
  const body = new THREE.Matrix4().compose(
    new THREE.Vector3(0, RASAN.seatHeight + p['body.lift'], 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(p['body.pitch'], p['body.twist'], -p['body.roll'], 'YXZ')),
    new THREE.Vector3(1, 1, 1),
  );
  const sy = 1 + p['body.stretch'];
  const sxz = preserveVolume(sy);
  const S = new THREE.Vector3(sxz, sy, sxz);
  const sq = (v: THREE.Vector3) => v.multiply(S);

  // eyes
  const eye = (side: 1 | -1, blink: number, squint: number, happy: number): EyeSolve => {
    const E = RASAN.eye;
    const th = side * E.azimuth + p['eyes.lookX'] * E.lookRangeAz;
    const h = E.height + p['eyes.lookY'] * E.lookRangeH;
    const f = surfaceFrame(shape, th, h, -E.inset);
    const wide = 1 + p['eyes.wide'] * 0.25;
    const open = (1 - clamp(blink)) * (1 - 0.5 * clamp(squint)) * (1 - 0.6 * clamp(happy));
    const ry = Math.max(0.006, (E.tall / 2) * wide * open);
    // lids: a blink closes toward the lower third, a squint pushes up from below
    const shift = -(E.tall / 2) * wide * (1 - open) * 0.35 + (E.tall / 2) * 0.3 * clamp(squint);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(f.quaternion);
    f.position.addScaledVector(up, shift);
    return {
      position: sq(f.position),
      quaternion: f.quaternion,
      scale: new THREE.Vector3((E.width / 2) * wide, ry, E.depth / 2),
      happy: clamp(happy),
      closed: clamp(blink),
    };
  };

  // brows: sampled directly on the surface so they hug the body
  const brow = (side: 1 | -1, raise: number, tilt: number, curve: number) => {
    const B = RASAN.brow;
    const thC = side * B.azimuth + p['eyes.lookX'] * RASAN.eye.lookRangeAz * 0.7;
    const hC = B.height + raise + p['eyes.lookY'] * RASAN.eye.lookRangeH * 0.5;
    const half = (B.span / 2) * shape.outline.radiusAt(hC);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < BROW_SAMPLES; i++) {
      const s = i / (BROW_SAMPLES - 1); // 0 inner .. 1 outer
      const u = s * 2 - 1;
      const th = thC + side * u * (B.span / 2);
      // arch, plus tilt lifting the inner end
      const h = hC + (B.arch + curve * 0.03) * (1 - u * u) - Math.tan(tilt) * half * u;
      const pt = surfacePoint(shape, th, h);
      pt.addScaledVector(surfaceNormal(shape, th, h), B.lift);
      pts.push(sq(pt));
    }
    return pts;
  };

  // prop
  const Bd = RASAN.board;
  const propPos = sq(v3(Bd.rest).add(new THREE.Vector3(p['prop.x'], p['prop.y'], p['prop.z'])));
  const propQ = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(Bd.restRot[0] + p['prop.pitch'], Bd.restRot[1] + p['prop.yaw'], Bd.restRot[2] + p['prop.roll'], 'YXZ'),
  );
  const propM = new THREE.Matrix4().compose(propPos, propQ, new THREE.Vector3(1, 1, 1));
  const clapAngle = clamp(p['prop.clap']) * Bd.openAngle;
  const grips = boardGrips(clapAngle);
  const visible = p['prop.visible'] > 0.5;

  // arms
  const arm = (side: 1 | -1): ArmSolve => {
    const k = side === 1 ? 'armL' : 'armR';
    const shoulder = sq(v3(side === 1 ? RASAN.arm.shoulderL : RASAN.arm.shoulderR));
    const rest = v3(side === 1 ? RASAN_RIG.handRestL : RASAN_RIG.handRestR);
    const free = rest.add(new THREE.Vector3(p[`${k}.x`], p[`${k}.y`], p[`${k}.z`]));
    let gripLocal: THREE.Vector3;
    if (side === 1) gripLocal = grips.slateRight.clone().lerp(grips.clapperTip, clamp(p['armL.toClapper']));
    else gripLocal = grips.slateLeft.clone().lerp(grips.clapper, clamp(p['armR.toClapper']));
    const grip = gripLocal.applyMatrix4(propM);
    const w = visible ? clamp(p[`${k}.grip`]) : 0;
    const hand = free.lerp(grip, w);
    // keep the hand within reach
    const d = new THREE.Vector3().subVectors(hand, shoulder);
    const len = d.length();
    if (len > RASAN.arm.reach) hand.copy(shoulder).addScaledVector(d.normalize(), RASAN.arm.reach);
    const ext = Math.min(1, len / RASAN.arm.reach);
    // elbow: the arm hugs the body — its midpoint is kept just outside the surface — and bows
    // out and down a little more when bent
    const mid = new THREE.Vector3().addVectors(shoulder, hand).multiplyScalar(0.5);
    const hm = Math.min(RASAN.bodyHeight * 0.95, Math.max(0.05, mid.y / S.y));
    const th = Math.atan2(mid.x, mid.z / RASAN.depth);
    const surf = sq(surfacePoint(shape, th, hm));
    const n = surfaceNormal(shape, th, hm);
    const hug = surf.addScaledVector(n, RASAN.arm.radius * 0.3);
    const radial = (v: THREE.Vector3) => Math.hypot(v.x, v.z / RASAN.depth);
    const target = radial(mid) > radial(hug) ? mid.clone() : mid.clone().lerp(hug, 1);
    const out = n.clone();
    out.x += side * p[`${k}.spread`] * 0.5;
    out.y -= 0.4;
    out.normalize();
    target.addScaledVector(out, (0.03 + p[`${k}.bend`] * 0.16) * (1 - ext * ext * 0.6));
    const control = target.multiplyScalar(2).sub(mid);
    const tangent = new THREE.Vector3().subVectors(hand, control).normalize();
    const handQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
    return { shoulder, control, hand, handQuat };
  };

  // hat rides the crown, with a little secondary lag
  const H = RASAN.hat;
  const hatPos = sq(v3(H.position)).add(new THREE.Vector3(0, p['hat.lift'], 0));
  const hatQ = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(H.rotation[0] + p['hat.pitch'], H.rotation[1], H.rotation[2] + p['hat.roll'], 'YXZ'),
  );

  // feet in root space
  const foot = (rest: readonly number[], k: 'footL' | 'footR') =>
    new THREE.Matrix4().compose(
      v3(rest).add(new THREE.Vector3(p[`${k}.x`], p[`${k}.y`], p[`${k}.z`])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(p[`${k}.pitch`], 0, 0)),
      new THREE.Vector3(1, 1, 1),
    );

  return {
    root,
    body,
    bodyScale: S,
    eyes: {
      L: eye(1, p['eyeL.blink'], p['eyeL.squint'], p['eyeL.happy']),
      R: eye(-1, p['eyeR.blink'], p['eyeR.squint'], p['eyeR.happy']),
    },
    brows: {
      L: brow(1, p['browL.raise'], p['browL.tilt'], p['browL.curve']),
      R: brow(-1, p['browR.raise'], p['browR.tilt'], p['browR.curve']),
    },
    arms: { L: arm(1), R: arm(-1) },
    hat: { position: hatPos, quaternion: hatQ },
    prop: { matrix: propM, clapAngle, visible },
    feet: { L: foot(RASAN.foot.restL, 'footL'), R: foot(RASAN.foot.restR, 'footR') },
  };
}
