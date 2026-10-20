// Clapperboard layout (board space: origin at the slate centre, +z toward the viewer).
// Pure geometry facts, shared by the renderer and the rig's grip solve.

import * as THREE from 'three';
import { RASAN } from '../characters/rasan/proportions';

const B = RASAN.board;
export const BOARD = {
  W: B.width,
  H: B.height,
  D: B.thick,
  SH: B.stick,
  gap: 0.008,
  get stickY() { return this.H / 2 + this.gap + this.SH / 2; },
  /** Hinge pivot: top-left corner of the fixed stick. */
  get hinge() { return new THREE.Vector3(-this.W / 2 + 0.03, this.H / 2 + this.gap * 2 + this.SH, 0); },
};

/** Where hands hold the board, in board space, for a given clapper opening angle. */
export function boardGrips(clapAngle: number) {
  const { W, H, D, SH } = BOARD;
  const clapper = new THREE.Vector3(0.2, SH * 0.85, D * 0.7)
    .applyAxisAngle(new THREE.Vector3(0, 0, 1), clapAngle)
    .add(BOARD.hinge);
  const clapperTip = new THREE.Vector3(W + 0.03, SH * 0.35, D * 0.5)
    .applyAxisAngle(new THREE.Vector3(0, 0, 1), clapAngle)
    .add(BOARD.hinge);
  return {
    clapperTip,
    slateLeft: new THREE.Vector3(-W / 2 - 0.015, H / 2 - 0.06, D * 0.9),
    slateRight: new THREE.Vector3(W / 2 + 0.015, -0.08, D * 0.9),
    clapper,
  };
}
