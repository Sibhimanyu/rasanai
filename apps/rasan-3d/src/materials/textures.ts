// Procedural, seeded canvas textures (no network, identical every run).

import * as THREE from 'three';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture) {
  let t = cache.get(key);
  if (!t) { t = make(); cache.set(key, t); }
  return t;
}

/** Soft multi-octave value noise, grey, tileable. Used as bump/roughness for clay and felt. */
export function noiseTexture(size = 512, seed = 7, octaves = 5, contrast = 1): THREE.Texture {
  return cached(`noise:${size}:${seed}:${octaves}:${contrast}`, () => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    const img = g.createImageData(size, size);
    const acc = new Float32Array(size * size);
    const rand = rng(seed);
    let amp = 1, total = 0;
    for (let o = 0; o < octaves; o++) {
      const cells = 4 << o;
      const grid = new Float32Array(cells * cells).map(() => rand());
      const at = (x: number, y: number) => grid[((y % cells) + cells) % cells * cells + (((x % cells) + cells) % cells)];
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const fx = (x / size) * cells, fy = (y / size) * cells;
          const ix = Math.floor(fx), iy = Math.floor(fy);
          const tx = fx - ix, ty = fy - iy;
          const sx = tx * tx * (3 - 2 * tx), syy = ty * ty * (3 - 2 * ty);
          const a = at(ix, iy), b = at(ix + 1, iy), cc = at(ix, iy + 1), d = at(ix + 1, iy + 1);
          acc[y * size + x] += amp * (a + (b - a) * sx + (cc - a + (a - b - cc + d) * sx) * syy);
        }
      total += amp;
      amp *= 0.55;
    }
    for (let i = 0; i < size * size; i++) {
      const v = Math.max(0, Math.min(255, 128 + (acc[i] / total - 0.5) * 255 * contrast));
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.NoColorSpace;
    return t;
  });
}

/** Woven felt: fine noise plus a faint twill so the cap reads as cloth up close. */
export function feltTexture(size = 512): THREE.Texture {
  return cached(`felt:${size}`, () => {
    const base = noiseTexture(size, 21, 6, 1.6).image as HTMLCanvasElement;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    g.drawImage(base, 0, 0);
    g.globalAlpha = 0.18;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1;
    for (let i = -size; i < size * 2; i += 4) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + size, size); g.stroke();
    }
    const rand = rng(5);
    g.globalAlpha = 0.25;
    for (let i = 0; i < 6000; i++) {
      g.fillStyle = rand() > 0.5 ? '#000' : '#fff';
      g.fillRect(rand() * size, rand() * size, 1, 1 + rand() * 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** Black/white diagonal clapper stripes. */
export function stripeTexture(): THREE.Texture {
  return cached('stripes', () => {
    const W = 1024, H = 128;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    g.fillStyle = '#1b1b1f';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#f3f1ea';
    const step = W / 6.5, band = step * 0.5, slant = H * 0.55;
    for (let x = -step; x < W + step; x += step) {
      g.beginPath();
      g.moveTo(x, H); g.lineTo(x + slant, 0); g.lineTo(x + slant + band, 0); g.lineTo(x + band, H);
      g.closePath(); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });
}

/** Slate face: matte black with two faint chalk rules, like the reference. */
export function slateTexture(): THREE.Texture {
  return cached('slate', () => {
    const W = 1024, H = 576;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    g.fillStyle = '#1e1e22';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.13)';
    g.lineWidth = 3;
    for (const y of [H * 0.36, H * 0.72]) {
      g.beginPath(); g.moveTo(W * 0.1, y); g.lineTo(W * 0.9, y); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });
}
