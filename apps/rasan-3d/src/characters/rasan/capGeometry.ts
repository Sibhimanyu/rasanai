// Newsboy cap, cap space: origin at the band centre, +y up, brim toward +z.
// Crown: eight soft panels puffed out over the band and pulled forward over the brim.
// Brim: a single closed surface whose cross-section is a rounded lip.

import * as THREE from 'three';
import { RASAN } from './proportions';

const TAU = Math.PI * 2;

function grid(
  nu: number,
  nv: number,
  f: (u: number, v: number, out: THREE.Vector3) => THREE.Vector3,
  closedU = true,
) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const p = new THREE.Vector3();
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      f(i / nu, j / nv, p);
      pos.push(p.x, p.y, p.z);
      uv.push((i / nu) * 4, (j / nv) * 2);
    }
  const row = nu + 1;
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (closedU) weldSeam(g, nu, nv);
  return g;
}

function weldSeam(g: THREE.BufferGeometry, nu: number, nv: number) {
  const n = g.attributes.normal as THREE.BufferAttribute;
  const row = nu + 1, a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) {
    a.fromBufferAttribute(n, j * row); b.fromBufferAttribute(n, j * row + nu);
    a.add(b).normalize();
    n.setXYZ(j * row, a.x, a.y, a.z); n.setXYZ(j * row + nu, a.x, a.y, a.z);
  }
}

const [RA, RB] = RASAN.hat.bandRadius;
const CROWN = RASAN.hat.crownHeight;

/** Crown profile: (radius factor, height) from the band (v=0) to the top (v=1). */
const crownCurve = new THREE.CatmullRomCurve3(
  [
    [1.0, 0.0], [1.05, 0.06], [1.1, 0.14], [1.11, 0.22], [1.07, 0.3], [0.96, 0.38],
    [0.76, 0.45], [0.5, 0.5], [0.25, 0.525], [0.0, 0.53],
  ].map(([r, h]) => new THREE.Vector3(r, h * (CROWN / 0.51), 0)),
  false,
  'centripetal',
);

export function crownGeometry() {
  const pts = crownCurve.getSpacedPoints(64);
  return grid(160, 64, (u, v, out) => {
    const th = u * TAU;
    const c = pts[Math.round(v * 64)];
    const front = Math.cos(th); // +1 at the brim
    // panel seams every 45°: shallow valleys between puffs
    const seam = Math.pow(Math.abs(Math.cos(th * 4)), 6);
    const puff = 1 - 0.012 * (1 - seam) * Math.sin(Math.PI * Math.min(1, v * 1.25));
    const lift = c.y / CROWN; // 0 band .. 1 top
    let r = c.x * puff;
    // the crown is pulled forward over the brim and sits a touch lower at the front
    const pull = 0.16 * Math.pow(lift, 1.2);
    const droop = 0.07 * lift * Math.max(0, front) - 0.025 * lift * Math.max(0, -front);
    // the back fullness tucks in a little
    if (front < 0) r *= 1 - 0.05 * lift * -front;
    return out.set(Math.sin(th) * r * RA, c.y - droop, Math.cos(th) * r * RB + pull);
  });
}

/** The band: a slim ring that gives the cap its lower edge. */
export function bandGeometry() {
  return grid(160, 8, (u, v, out) => {
    const th = u * TAU;
    const a = v * Math.PI; // half-round cross-section on the outside
    const bulge = 0.018 * Math.sin(a);
    const y = -0.008 + 0.075 * v;
    return out.set(Math.sin(th) * (RA + bulge), y, Math.cos(th) * (RB + bulge));
  });
}

/** The brim: front arc of the band reaching forward and curving down, with a rounded lip. */
export function brimGeometry() {
  const span = 1.32; // half-angle of the brim around the band
  const reach = 0.3;
  const thick = 0.05;
  return grid(
    96,
    48,
    (u, w, out) => {
      const th = (u * 2 - 1) * span;
      const s = w < 0.5 ? w * 2 : (1 - w) * 2; // 0 at the band, 1 at the lip
      const side = w < 0.5 ? 1 : -1;
      const along = Math.cos((th / span) * (Math.PI / 2));
      const len = reach * Math.pow(Math.max(0, along), 0.55);
      const bx = Math.sin(th) * RA * 0.985, bz = Math.cos(th) * RB * 0.985;
      const ox = Math.sin(th), oz = Math.cos(th) * (RA / RB);
      const ol = Math.hypot(ox, oz);
      const d = s * len;
      const drop = -0.12 * Math.pow(s * (len / reach), 1.6) - 0.01;
      const t = thick * Math.sqrt(Math.max(0, 1 - Math.pow(s, 4))) * (0.35 + 0.65 * along);
      // curve across the width too: the edges bend down more than the centre
      const curl = -0.05 * Math.pow(Math.abs(th / span), 2) * s;
      return out.set(bx + (ox / ol) * d, drop + curl + side * t * 0.5, bz + (oz / ol) * d);
    },
    false,
  );
}
