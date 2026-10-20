// RigSpec: what a character tells the shared rig about its body. Motions read these so the
// same "wave" or "hop" fits a tall mascot and a short one.

import type { PartialPose } from './pose';

export type V3 = [number, number, number];

export interface RigSpec {
  name: string;
  /** Height of the body (seat to crown), world units. */
  bodyHeight: number;
  /** Widest half-width of the body. */
  bodyRadius: number;
  /** Height of the seat (top of feet) above the ground. */
  seatHeight: number;
  /** Shoulder anchors in body space (inside the surface), left = +x. */
  shoulderL: V3;
  shoulderR: V3;
  /** Rest hand positions in body space when nothing is gripped. */
  handRestL: V3;
  handRestR: V3;
  armReach: number;
  armRadius: number;
  handRadius: number;
  footRestL: V3;
  footRestR: V3;
  /** Rest pose channel values for this character. */
  rest: PartialPose;
}
