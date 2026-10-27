// Smooth surfaces of revolution from a measured outline, plus a surface lookup so face parts,
// the cap and the arms can sit exactly on the body.

import * as THREE from 'three';

export interface Outline {
  /** Samples evenly spaced along the outline's arc length, bottom pole to top pole. */
  points: THREE.Vector2[]; // (radius, height)
  radiusAt: (h: number) => number;
  top: number;
}

/** Centripetal Catmull-Rom through (r, h) points, resampled by arc length. */
export function makeOutline(pts: [number, number][], samples = 160): Outline {
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([r, h]) => new THREE.Vector3(r, h, 0)),
    false,
    'centripetal',
  );
  const points = curve.getSpacedPoints(samples).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
  points[0].x = 0;
  points[points.length - 1].x = 0;
  // dense table for r(h); the outline's height is monotonic
  const dense = curve.getSpacedPoints(1200).map((p) => [p.y, Math.max(0, p.x)] as const);
  const top = pts[pts.length - 1][1];
  const radiusAt = (h: number) => {
    if (h <= dense[0][0]) return dense[0][1];
    if (h >= top) return 0;
    let lo = 0, hi = dense.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (dense[mid][0] < h) lo = mid; else hi = mid;
    }
    const [h0, r0] = dense[lo], [h1, r1] = dense[hi];
    return h1 === h0 ? r0 : r0 + ((r1 - r0) * (h - h0)) / (h1 - h0);
  };
  return { points, radiusAt, top };
}

export interface BodyShape {
  outline: Outline;
  depth: number;
  belly: number;
}

/** Cross-section warp: elliptical (depth) plus a little extra fullness on the low front. */
function warp(shape: BodyShape, r: number, h: number, theta: number, out: THREE.Vector3) {
  const front = Math.max(0, Math.cos(theta));
  const bellyH = Math.exp(-Math.pow((h - 0.55) / 0.45, 2));
  const z = r * Math.cos(theta) * shape.depth * (1 + shape.belly * bellyH * front);
  return out.set(r * Math.sin(theta), h, z);
}

/** Point on the body surface at azimuth theta (0 = front, + toward his left) and height h. */
export function surfacePoint(shape: BodyShape, theta: number, h: number, out = new THREE.Vector3()) {
  return warp(shape, shape.outline.radiusAt(h), h, theta, out);
}

/** Outward unit normal at (theta, h), by finite differences. */
export function surfaceNormal(shape: BodyShape, theta: number, h: number, out = new THREE.Vector3()) {
  const e = 1e-3;
  const a = surfacePoint(shape, theta - e, h), b = surfacePoint(shape, theta + e, h);
  const c = surfacePoint(shape, theta, h - e), d = surfacePoint(shape, theta, h + e);
  // d/dtheta points toward +x at the front, d/dh points up: their cross product points outward
  return out.crossVectors(b.sub(a), d.sub(c)).normalize();
}

/** A frame (position + orientation) sitting on the surface, z = outward normal, y = up along it. */
export function surfaceFrame(shape: BodyShape, theta: number, h: number, offset = 0) {
  const p = surfacePoint(shape, theta, h);
  const n = surfaceNormal(shape, theta, h);
  const up = new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(up, n).normalize();
  const y = new THREE.Vector3().crossVectors(n, x).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, n);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  p.addScaledVector(n, offset);
  return { position: p, quaternion: q, normal: n };
}

/** Build the body mesh: rings follow the outline by arc length so the silhouette stays smooth. */
export function buildBodyGeometry(
  shape: BodyShape,
  radial = 128,
  tint?: (h: number, theta: number, n: THREE.Vector3) => THREE.Color,
) {
  const rings = shape.outline.points;
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [], index: number[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < rings.length; i++) {
    const { x: r, y: h } = rings[i];
    for (let j = 0; j <= radial; j++) {
      const theta = (j / radial) * Math.PI * 2 - Math.PI;
      warp(shape, r, h, theta, v);
      positions.push(v.x, v.y, v.z);
      uvs.push(j / radial, i / (rings.length - 1));
      const c = tint ? tint(h, theta, v) : new THREE.Color(1, 1, 1);
      colors.push(c.r, c.g, c.b);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      index.push(a, b, d, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  fixSeamNormals(g, rings.length, row);
  return g;
}

/** Average normals across the theta seam so it never shows. */
function fixSeamNormals(g: THREE.BufferGeometry, rows: number, row: number) {
  const n = g.attributes.normal as THREE.BufferAttribute;
  const t = new THREE.Vector3(), u = new THREE.Vector3();
  for (let i = 0; i < rows; i++) {
    const a = i * row, b = a + row - 1;
    t.fromBufferAttribute(n, a); u.fromBufferAttribute(n, b);
    t.add(u).normalize();
    n.setXYZ(a, t.x, t.y, t.z); n.setXYZ(b, t.x, t.y, t.z);
  }
  // poles: straight up/down
  for (let j = 0; j < row; j++) {
    n.setXYZ(j, 0, -1, 0);
    n.setXYZ((rows - 1) * row + j, 0, 1, 0);
  }
  n.needsUpdate = true;
}
