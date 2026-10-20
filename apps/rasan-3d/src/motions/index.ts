// The shared motion library. Any mascot using the shared rig channels can play these.

import type { MotionLibrary } from '../core/motion';
import { idle, squash, hops, bounce, jump, walk, turn, lean, proud } from './body';
import { blink, blinkCycle, look, browRaise, expressionMotions } from './face';
import { wave, point, cheer, raiseBoard, clap, taDa, handsFree } from './arms';

export const MOTIONS: MotionLibrary = {
  idle, squash, hops, bounce, jump, walk, turn, lean, proud,
  blink, blinkCycle, look, browRaise,
  wave, point, cheer, raiseBoard, clap, taDa, handsFree,
  ...expressionMotions,
};

export const MOTION_NAMES = Object.keys(MOTIONS);
