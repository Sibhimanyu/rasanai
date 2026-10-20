// The shared mascot rig: a flat set of named numeric channels. Every mascot in the series
// uses the same channel names, so motions are reusable; each character supplies its own
// proportions (RigSpec) and rest values. A Pose is just numbers, which makes blending,
// testing and determinism trivial.

export const CHANNELS = {
  // root (world)
  'root.x': 0, 'root.y': 0, 'root.z': 0, 'root.yaw': 0,
  // body, pivoting at the seat on top of the feet
  'body.stretch': 0, // 0 neutral, +0.2 = 20% taller (volume preserved), -0.2 = squash
  'body.lift': 0, // body rises off the feet (takeoff stretch), world units
  'body.pitch': 0, // + leans forward
  'body.roll': 0, // + leans to the character's left
  'body.twist': 0, // yaw of body relative to root
  // feet (offsets from rest, world units / radians)
  'footL.x': 0, 'footL.y': 0, 'footL.z': 0, 'footL.pitch': 0,
  'footR.x': 0, 'footR.y': 0, 'footR.z': 0, 'footR.pitch': 0,
  // eyes: gaze slides the eyes over the surface; -1..1
  'eyes.lookX': 0, 'eyes.lookY': 0,
  'eyeL.blink': 0, 'eyeR.blink': 0, // 0 open .. 1 closed
  'eyeL.squint': 0, 'eyeR.squint': 0, // 0 .. 1 narrows from below
  'eyeL.happy': 0, 'eyeR.happy': 0, // 0 .. 1 morphs to a ^ arc
  'eyes.wide': 0, // -1 .. 1 scales the eyes
  // brows
  'browL.raise': 0, 'browR.raise': 0, // world units (≈ ±0.08)
  'browL.tilt': 0, 'browR.tilt': 0, // radians, + lifts the inner end
  'browL.curve': 0, 'browR.curve': 0, // + more arched, - flatter/sad
  // hat secondary motion
  'hat.lift': 0, 'hat.pitch': 0, 'hat.roll': 0,
  // arms: hand targets in body space, offsets from the character's rest hand position
  'armL.x': 0, 'armL.y': 0, 'armL.z': 0, 'armL.grip': 1, 'armL.bend': 0, 'armL.spread': 0,
  'armR.x': 0, 'armR.y': 0, 'armR.z': 0, 'armR.grip': 1, 'armR.bend': 0, 'armR.spread': 0,
  'armR.toClapper': 0, // 0 = grips the slate, 1 = grips the clapper near the hinge
  'armL.toClapper': 0, // 0 = grips the slate, 1 = lifts the clapper by its free end
  // held prop (body space offsets from rest)
  'prop.x': 0, 'prop.y': 0, 'prop.z': 0,
  'prop.pitch': 0, 'prop.yaw': 0, 'prop.roll': 0,
  'prop.clap': 0, // 0 shut .. 1 fully open (≈ 38°)
  'prop.visible': 1,
} as const;

export type Channel = keyof typeof CHANNELS;
export type Pose = Record<Channel, number>;
export type PartialPose = Partial<Record<Channel, number>>;

export const CHANNEL_NAMES = Object.keys(CHANNELS) as Channel[];

export function restPose(overrides: PartialPose = {}): Pose {
  return { ...CHANNELS, ...overrides } as Pose;
}

/** Additive: pose += delta * weight. */
export function addPose(pose: Pose, delta: PartialPose, weight = 1): Pose {
  for (const k in delta) {
    const c = k as Channel;
    pose[c] += (delta[c] as number) * weight;
  }
  return pose;
}

/** Override: pose = lerp(pose, value, weight) per channel present in `value`. */
export function setPose(pose: Pose, value: PartialPose, weight = 1): Pose {
  for (const k in value) {
    const c = k as Channel;
    pose[c] += ((value[c] as number) - pose[c]) * weight;
  }
  return pose;
}

/** Hard limits that keep any blend of motions from breaking the character. */
export const LIMITS: PartialRecord<Channel, [number, number]> = {
  'body.stretch': [-0.35, 0.35],
  'eyeL.blink': [0, 1], 'eyeR.blink': [0, 1],
  'eyeL.squint': [0, 1], 'eyeR.squint': [0, 1],
  'eyeL.happy': [0, 1], 'eyeR.happy': [0, 1],
  'eyes.lookX': [-1, 1], 'eyes.lookY': [-1, 1],
  'eyes.wide': [-0.6, 0.6],
  'browL.raise': [-0.06, 0.1], 'browR.raise': [-0.06, 0.1],
  'armL.grip': [0, 1], 'armR.grip': [0, 1], 'armR.toClapper': [0, 1], 'armL.toClapper': [0, 1],
  'prop.clap': [0, 1], 'prop.visible': [0, 1],
  'root.y': [0, 10],
};
type PartialRecord<K extends string, V> = { [P in K]?: V };

export function clampPose(pose: Pose): Pose {
  for (const k in LIMITS) {
    const c = k as Channel;
    const [lo, hi] = LIMITS[c]!;
    pose[c] = Math.min(hi, Math.max(lo, pose[c]));
  }
  return pose;
}
