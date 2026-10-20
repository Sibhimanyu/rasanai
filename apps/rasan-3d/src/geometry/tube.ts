// A fixed-topology tube whose spine and radius can be rewritten every frame (arms, brows).
// Rounded caps at both ends so it never shows an open edge.

import * as THREE from 'three';

export interface TubeSpec {
  segments: number; // along the spine
  radial: number;
  capRings: number; // rings per hemispherical cap
}

export class LiveTube {
  readonly geometry = new THREE.BufferGeometry();
  private spec: TubeSpec;
  private pos: Float32Array;

  constructor(spec: TubeSpec) {
    this.spec = spec;
    const rows = spec.segments + 1 + spec.capRings * 2;
    const row = spec.radial + 1;
    this.pos = new Float32Array(rows * row * 3);
    const uv = new Float32Array(rows * row * 2);
    const index: number[] = [];
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < row; j++) {
        uv[(i * row + j) * 2] = j / spec.radial;
        uv[(i * row + j) * 2 + 1] = i / (rows - 1);
      }
    for (let i = 0; i < rows - 1; i++)
      for (let j = 0; j < spec.radial; j++) {
        const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
        index.push(a, b, d, a, d, c);
      }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geometry.setIndex(index);
  }

  /**
   * spine(s) for s in [0,1] gives the centre line, radius(s) its radius.
   * Uses parallel-transport frames so the tube never twists.
   */
  update(spine: (s: number, out: THREE.Vector3) => THREE.Vector3, radius: (s: number) => number) {
    const { segments, radial, capRings } = this.spec;
    const row = radial + 1;
    const P: THREE.Vector3[] = [], T: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) P.push(spine(i / segments, new THREE.Vector3()));
    for (let i = 0; i <= segments; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(segments, i + 1)];
      T.push(new THREE.Vector3().subVectors(b, a).normalize());
    }
    // initial normal: any vector not parallel to the first tangent
    const N: THREE.Vector3[] = [];
    const ref = Math.abs(T[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    N.push(new THREE.Vector3().crossVectors(T[0], ref).normalize());
    for (let i = 1; i <= segments; i++) {
      const axis = new THREE.Vector3().crossVectors(T[i - 1], T[i]);
      const n = N[i - 1].clone();
      if (axis.lengthSq() > 1e-10) {
        axis.normalize();
        const ang = Math.acos(THREE.MathUtils.clamp(T[i - 1].dot(T[i]), -1, 1));
        n.applyAxisAngle(axis, ang);
      }
      N.push(n);
    }
    let k = 0;
    const tmp = new THREE.Vector3(), B = new THREE.Vector3();
    const ring = (c: THREE.Vector3, t: THREE.Vector3, n: THREE.Vector3, r: number) => {
      B.crossVectors(t, n);
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        tmp.copy(c).addScaledVector(n, Math.cos(a) * r).addScaledVector(B, Math.sin(a) * r);
        this.pos[k++] = tmp.x; this.pos[k++] = tmp.y; this.pos[k++] = tmp.z;
      }
    };
    const r0 = radius(0), r1 = radius(1);
    // start cap
    for (let c = 0; c < capRings; c++) {
      const phi = (Math.PI / 2) * (1 - c / capRings);
      const ctr = P[0].clone().addScaledVector(T[0], -Math.sin(phi) * r0);
      ring(ctr, T[0], N[0], Math.max(1e-4, Math.cos(phi) * r0));
    }
    for (let i = 0; i <= segments; i++) ring(P[i], T[i], N[i], radius(i / segments));
    for (let c = 1; c <= capRings; c++) {
      const phi = (Math.PI / 2) * (c / capRings);
      const ctr = P[segments].clone().addScaledVector(T[segments], Math.sin(phi) * r1);
      ring(ctr, T[segments], N[segments], Math.max(1e-4, Math.cos(phi) * r1));
    }
    void row;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }

  dispose() {
    this.geometry.dispose();
  }
}

/** Quadratic Bézier helper for spines. */
export function bezier2(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
  return (s: number, out: THREE.Vector3) => {
    const u = 1 - s;
    return out.set(
      u * u * a.x + 2 * u * s * b.x + s * s * c.x,
      u * u * a.y + 2 * u * s * b.y + s * s * c.y,
      u * u * a.z + 2 * u * s * b.z + s * s * c.z,
    );
  };
}
