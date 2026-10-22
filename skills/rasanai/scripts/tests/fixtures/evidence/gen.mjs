// SYNTHETIC fixture builders for the evidence tests and offline renders (see README.md): invented data, never shipped as fact. Deterministic: no clock, no random.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
export function encodePng(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
function canvas(w, h, bg) { const b = Buffer.alloc(w * h * 3); for (let i = 0; i < w * h; i++) { b[i * 3] = bg[0]; b[i * 3 + 1] = bg[1]; b[i * 3 + 2] = bg[2]; } return { w, h, b, px(x, y, c, a = 1) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 3; for (let k = 0; k < 3; k++) b[i + k] = Math.round(b[i + k] * (1 - a) + c[k] * a); }, rect(x, y, rw, rh, c, a = 1) { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) this.px(x + i, y + j, c, a); }, disc(cx, cy, r, c, a = 1) { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r) this.px(cx + i, cy + j, c, a); } }; }

// a mock "overhead" background: land, water and a road grid. A mock only: it stands for imagery, it does not show any place.
export function mockOverhead(file) {
  const c = canvas(640, 400, [38, 70, 52]);
  for (let y = 0; y < 400; y++) for (let x = 0; x < 640; x++) { const k = Math.sin(x / 41) * 18 + Math.cos(y / 29) * 14 + Math.sin((x + y) / 63) * 10; c.px(x, y, [60 + k, 98 + k, 66 + k]); }
  for (let y = 0; y < 400; y++) for (let x = 0; x < 640; x++) { const d = x - (430 + Math.sin(y / 38) * 46); if (d > 0) c.px(x, y, [30, 78, 118], 0.92); }
  for (let i = 40; i < 400; i += 70) c.rect(0, i, 420, 3, [188, 184, 170]);
  for (let i = 60; i < 420; i += 90) c.rect(i, 0, 3, 400, [188, 184, 170]);
  for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) c.rect(70 + i * 62 + (j % 2) * 14, 55 + j * 66, 34, 24, [176, 156, 140]);
  fs.writeFileSync(file, encodePng(640, 400, c.b));
}
// a mock "stained cells" field with a calibration bar of 160 px: stands for a slide, shows no real tissue
export function mockSlide(file) {
  const c = canvas(600, 600, [232, 214, 226]);
  for (let n = 0; n < 70; n++) { const x = (n * 137) % 560 + 20, y = (n * 241) % 560 + 20, r = 14 + (n * 7) % 14; c.disc(x, y, r, [150 + (n * 5) % 50, 80, 150], 0.85); c.disc(x + 3, y + 2, Math.max(4, r / 3), [70, 30, 90], 0.9); }
  c.rect(420, 560, 160, 6, [20, 20, 20]);
  fs.writeFileSync(file, encodePng(600, 600, c.b));
}
// a mock "paper page": ruled lines of grey bars. Stands for a scan, contains no text.
export function mockPage(file) {
  const c = canvas(480, 640, [236, 226, 200]);
  c.rect(20, 20, 440, 600, [243, 235, 214]);
  for (let l = 0; l < 22; l++) { const w = 300 + ((l * 53) % 120); c.rect(48, 70 + l * 24, w, 8, [88, 80, 66], 0.7); }
  c.rect(48, 40, 220, 14, [60, 52, 44], 0.85);
  fs.writeFileSync(file, encodePng(480, 640, c.b));
}

export const crates = `# SYNTHETIC FIXTURE: invented numbers, not real data
crate,load (kg),height (mm)
Alpha,120.5,340
Bravo,96,280
Charlie,148,410
Delta,72.25,220
Echo,110,305
Foxtrot,133,390
`;
export const alternatives = `# SYNTHETIC FIXTURE: invented numbers, not real data
option,span (mm),mass (kg),cost index (count)
Truss,4200,86,14
Beam,3600,142,9
Arch,5100,64,21
`;

// a deterministic synthetic "survey": a rolling ground, a low hill, three boxy buildings and a tree line; unit m, classes 2 ground, 5 vegetation, 6 building
export function pointCloud(n = 3600) {
  const pts = []; let s = 12345; const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gz = (x, y) => 2 + Math.sin(x / 9) * 1.4 + Math.cos(y / 7) * 1.1 + 5 * Math.exp(-((x - 40) ** 2 + (y - 14) ** 2) / 90);
  for (let i = 0; i < n * 0.6; i++) { const x = rnd() * 80, y = rnd() * 50; pts.push([x, y, gz(x, y), 2]); }
  const bld = [[12, 30, 14, 10, 7], [34, 36, 10, 8, 11], [58, 24, 12, 12, 5]];
  for (const [bx, by, bw, bd, bh] of bld) for (let i = 0; i < n * 0.1; i++) { const x = bx + rnd() * bw, y = by + rnd() * bd, top = rnd() < 0.5; pts.push([x, y, top ? gz(bx, by) + bh : gz(bx, by) + rnd() * bh, 6]); }
  for (let i = 0; i < n * 0.1; i++) { const x = 4 + rnd() * 72, y = 4 + rnd() * 3; pts.push([x, y, gz(x, y) + rnd() * 6, 5]); }
  return { synthetic: true, unit: "m", note: "SYNTHETIC FIXTURE: a generated terrain, not a survey of any place", points: pts.map((p) => p.map((v, i) => (i < 3 ? Math.round(v * 1000) / 1000 : v))) };
}
export const parts = { synthetic: true, unit: "mm", note: "SYNTHETIC FIXTURE: an invented hinge assembly", parts: [
  { name: "Base plate", size: [60, 40, 6], position: [0, 0, 0] },
  { name: "Hinge barrel", size: [12, 12, 44], position: [24, 14, 6] },
  { name: "Cover", size: [60, 40, 4], position: [0, 0, 56] },
  { name: "Pin", size: [4, 4, 52], position: [28, 18, 4] },
] };
// a real (tiny) GLB with three box meshes: POSITION accessors with min / max, nodes with translation; extras.synthetic marks it a fixture
export function glb(file) {
  const boxes = [["Housing", [0, 0, 0], [0.08, 0.05, 0.03]], ["Lid", [0, 0, 0.05], [0.08, 0.05, 0.01]], ["Latch", [0.09, 0.02, 0.01], [0.012, 0.012, 0.02]]];
  const pos = []; const accessors = [], views = [], meshes = [], nodes = [];
  boxes.forEach(([name, t, sz], i) => { const mn = [0, 0, 0], mx = sz; for (let v = 0; v < 8; v++) pos.push(v & 1 ? mx[0] : mn[0], v & 2 ? mx[1] : mn[1], v & 4 ? mx[2] : mn[2]); views.push({ buffer: 0, byteOffset: i * 96, byteLength: 96 }); accessors.push({ bufferView: i, componentType: 5126, count: 8, type: "VEC3", min: mn, max: mx }); meshes.push({ name, primitives: [{ attributes: { POSITION: i } }] }); nodes.push({ name, mesh: i, translation: t }); });
  const bin = Buffer.alloc(pos.length * 4); pos.forEach((v, i) => bin.writeFloatLE(v, i * 4));
  let json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, extras: { synthetic: true }, scene: 0, scenes: [{ nodes: [0, 1, 2] }], nodes, meshes, accessors, bufferViews: views, buffers: [{ byteLength: bin.length }] }));
  while (json.length % 4) json = Buffer.concat([json, Buffer.from(" ")]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  const c1 = Buffer.alloc(8); c1.writeUInt32LE(json.length, 0); c1.writeUInt32LE(0x4e4f534a, 4);
  const c2 = Buffer.alloc(8); c2.writeUInt32LE(bin.length, 0); c2.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat([head, c1, json, c2, bin]));
}

// writes every fixture into dir; returns the paths
export function writeAll(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const f = (n) => path.join(dir, n);
  fs.writeFileSync(f("crates.csv"), crates); fs.writeFileSync(f("alternatives.csv"), alternatives);
  fs.writeFileSync(f("cloud.json"), JSON.stringify(pointCloud()));
  fs.writeFileSync(f("parts.json"), JSON.stringify(parts, null, 1));
  glb(f("assembly.glb")); mockOverhead(f("overhead.png")); mockSlide(f("slide.png")); mockPage(f("page.png"));
  return Object.fromEntries(["crates.csv", "alternatives.csv", "cloud.json", "parts.json", "assembly.glb", "overhead.png", "slide.png", "page.png"].map((n) => [n, f(n)]));
}
