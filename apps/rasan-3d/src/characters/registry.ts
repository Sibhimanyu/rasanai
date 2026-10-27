// Character rigs by key (data only; no React). Add a new mascot here and in components.tsx.

import type { RigSpec } from '../core/rig';
import { RASAN_RIG } from './rasan/rig';

export const CHARACTER_RIGS: Record<string, RigSpec> = {
  rasan: RASAN_RIG,
};
