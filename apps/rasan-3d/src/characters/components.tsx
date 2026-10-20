// Character components by key. Each takes { pose, wireframe }.

import type { ComponentType } from 'react';
import type { Pose } from '../core/pose';
import { Rasan } from './rasan/Rasan';

export interface CharacterComponentProps {
  pose: Pose;
  wireframe?: boolean;
}

export const CHARACTER_COMPONENTS: Record<string, ComponentType<CharacterComponentProps>> = {
  rasan: Rasan,
};
