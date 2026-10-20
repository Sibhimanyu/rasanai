// Rasan's proportions, measured from the reference (public/reference/rasan.png).
// Unit: the body's widest half-width = 1. Body space: origin at the seat (bottom of the body,
// top of the feet), +y up, +z toward the viewer, +x = Rasan's left (screen right).
// The reference camera looks from ~9° to Rasan's left, which is why his face sits right of centre.

import type { V3 } from '../../core/rig';

/** Body outline (radius, height) from the bottom pole to the top pole. Measured per row from the
 * alpha mask: widest (r=1) at 0.62, a rounded seat, a tapering dome closing at h=1.9. */
export const BODY_PROFILE: [number, number][] = [
  [0.0, 0.0], [0.3, 0.0], [0.47, 0.004], [0.58, 0.014], [0.65, 0.03], [0.73, 0.066],
  [0.79, 0.106], [0.835, 0.146], [0.87, 0.185], [0.92, 0.265], [0.954, 0.344],
  [0.975, 0.423], [0.991, 0.503], [1.0, 0.62], [0.992, 0.7], [0.981, 0.78],
  [0.964, 0.86], [0.944, 0.94], [0.921, 1.02], [0.89, 1.1], [0.858, 1.18], [0.821, 1.26],
  [0.78, 1.34], [0.735, 1.415], [0.683, 1.495], [0.623, 1.574], [0.5, 1.7], [0.363, 1.8],
  [0.228, 1.86], [0.1, 1.892], [0.0, 1.9],
];

export const RASAN = {
  bodyHeight: 1.9,
  bodyRadius: 1,
  depth: 0.86, // front-to-back scale of the body cross-section
  frontBelly: 0.035, // extra forward fullness low on the front
  seatHeight: 0.16,

  color: {
    body: '#ffc536',
    bodyDeep: '#e08d12',
    bodyLight: '#ffd35a',
    eye: '#0b0b0d',
    brow: '#17130f',
    cap: '#26262a',
    capSheen: '#77767d',
    brass: '#c99a3c',
    board: '#1d1d21',
    stripe: '#f3f1ea',
  },

  eye: {
    azimuth: 0.3, // radians from the face centre
    height: 1.42,
    width: 0.122,
    tall: 0.25,
    depth: 0.075,
    inset: 0.004,
    lookRangeAz: 0.16, // how far gaze slides the eyes over the surface
    lookRangeH: 0.09,
  },

  brow: {
    azimuth: 0.36,
    height: 1.63,
    span: 0.27, // radians of arc along the surface
    arch: 0.022,
    radius: 0.02,
    lift: 0.014,
  },

  hat: {
    position: [-0.02, 1.82, -0.02] as V3,
    rotation: [-0.16, 0.95, 0.12] as V3, // pitch, yaw (brim swings to his left), roll
    bandRadius: [0.55, 0.51] as [number, number],
    crownHeight: 0.42,
  },

  arm: {
    shoulderL: [0.56, 0.8, 0.44] as V3,
    shoulderR: [-0.56, 0.84, 0.44] as V3,
    radius: 0.135,
    handRadius: 0.17,
    reach: 1.25,
  },

  foot: {
    restL: [0.44, 0.1, 0.1] as V3,
    restR: [-0.44, 0.1, 0.1] as V3,
    radii: [0.215, 0.13, 0.26] as V3,
  },

  board: {
    rest: [0.04, 0.64, 0.935] as V3,
    restRot: [-0.06, -0.06, 0.02] as V3,
    width: 0.64,
    height: 0.36,
    thick: 0.055,
    stick: 0.09,
    openAngle: 0.62, // radians when prop.clap = 1
  },
};
