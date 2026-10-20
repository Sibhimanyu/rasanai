import { makeOutline, type BodyShape } from '../../geometry/revolve';
import { BODY_PROFILE, RASAN } from './proportions';

let cached: BodyShape | null = null;

/** Rasan's body shape (outline + cross-section), built once and shared by geometry and rig. */
export function rasanShape(): BodyShape {
  if (!cached) cached = { outline: makeOutline(BODY_PROFILE), depth: RASAN.depth, belly: RASAN.frontBelly };
  return cached;
}
