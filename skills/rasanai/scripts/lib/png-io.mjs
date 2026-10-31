// Pixels in and out for the imagery tools: ffmpeg decodes anything to RGBA, our own PNG writer encodes (RGBA 8-bit, grey 8 or 16-bit).
// Zero dependencies (Node >= 20, ffmpeg + ffprobe). Errors are thrown, never process.exit (callers decide).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";

export function dims(p) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", p], { encoding: "utf8" });
  const m = String(r.stdout).trim().match(/^(\d+)x(\d+)/);
  return m ? { width: +m[1], height: +m[2] } : { width: 0, height: 0 };
}
// -> {w, h, data: Uint8ClampedArray RGBA}; w/h scaled to fit maxW x maxH when given (aspect kept), or exactly to {w, h} when `exact`
export function readImage(p, { maxW = 0, maxH = 0, exact = null } = {}) {
  if (!fs.existsSync(p)) throw new Error(`not found: ${p}`);
  const d = dims(p);
  if (!d.width) throw new Error(`cannot read ${p} as a picture (ffprobe found no video stream)`);
  let w = d.width, h = d.height;
  const vf = [];
  if (exact) { w = exact.w; h = exact.h; vf.push(`scale=${w}:${h}:flags=lanczos`); }
  else if ((maxW && w > maxW) || (maxH && h > maxH)) {
    const k = Math.min(maxW ? maxW / w : 1e9, maxH ? maxH / h : 1e9);
    w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k)); vf.push(`scale=${w}:${h}:flags=lanczos`);
  }
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", p, ...(vf.length ? ["-vf", vf.join(",")] : []), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 1 << 30 });
  if (r.status !== 0 || r.stdout.length !== w * h * 4) throw new Error(`ffmpeg could not decode ${p}: ${String(r.stderr).slice(0, 200)}`);
  return { w, h, data: new Uint8ClampedArray(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length) };
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0); b.write(type, 4, "latin1"); Buffer.from(data).copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
}
function encode(p, w, h, colorType, bitDepth, raw) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = bitDepth; ihdr[9] = colorType;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]));
}
export function writePng(p, { w, h, data }) {
  const stride = w * 4 + 1, raw = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) Buffer.from(data.buffer, data.byteOffset + y * w * 4, w * 4).copy(raw, y * stride + 1);
  encode(p, w, h, 6, 8, raw);
}
// a single-channel PNG from floats in 0..1 (bits 8 or 16)
export function writeGrey(p, w, h, values, bits = 8) {
  const bps = bits === 16 ? 2 : 1, stride = w * bps + 1, raw = Buffer.alloc(h * stride);
  const max = bits === 16 ? 65535 : 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = Math.max(0, Math.min(1, values[y * w + x])), q = Math.round(v * max), o = y * stride + 1 + x * bps;
    if (bps === 2) { raw[o] = q >> 8; raw[o + 1] = q & 255; } else raw[o] = q;
  }
  encode(p, w, h, 0, bits, raw);
}
// bilinear resize of a float plane
export function resizePlane(src, sw, sh, dw, dh) {
  const o = new Float32Array(dw * dh), fx = sw / dw, fy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const yy = Math.max(0, Math.min(sh - 1, (y + 0.5) * fy - 0.5)), y0 = Math.floor(yy), y1 = Math.min(sh - 1, y0 + 1), ty = yy - y0;
    for (let x = 0; x < dw; x++) {
      const xx = Math.max(0, Math.min(sw - 1, (x + 0.5) * fx - 0.5)), x0 = Math.floor(xx), x1 = Math.min(sw - 1, x0 + 1), tx = xx - x0;
      o[y * dw + x] = (src[y0 * sw + x0] * (1 - tx) + src[y0 * sw + x1] * tx) * (1 - ty) + (src[y1 * sw + x0] * (1 - tx) + src[y1 * sw + x1] * tx) * ty;
    }
  }
  return o;
}
// the grey of a PNG as floats 0..1 (any decodable picture; uses the red channel)
export function readPlane(p, exact = null) {
  const im = readImage(p, exact ? { exact } : {});
  const o = new Float32Array(im.w * im.h);
  for (let i = 0; i < o.length; i++) o[i] = im.data[i * 4] / 255;
  return { w: im.w, h: im.h, v: o };
}
