// Measure the reference silhouette: per-row left/right alpha extents, normalized.
import fs from 'fs'; import { PNG } from 'pngjs';
const png = PNG.sync.read(fs.readFileSync(process.argv[2]));
const { width: W, height: H, data } = png;
const rows = [];
for (let y = 0; y < H; y += Number(process.argv[3] || 10)) {
  let l = -1, r = -1, dark = 0;
  for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (data[i + 3] > 128) { if (l < 0) l = x; r = x; } }
  // yellow test at center column
  const i = (y * W + (W >> 1)) * 4;
  rows.push([y, l, r, r - l, data[i], data[i + 1], data[i + 2], data[i + 3]].join('\t'));
}
console.log(W, H); console.log(rows.join('\n'));
