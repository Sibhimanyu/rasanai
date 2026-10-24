#!/usr/bin/env node
// Hybrid compositor CLI: node composite.mjs --base b.mp4 --content c.(mp4|png) --track track.json [--matte m.mkv] --out out.mp4 [--feather 1] [--crf 14]
import { composite } from "./lib/hybrid-compositor/index.mjs";
const a = process.argv.slice(2), g = (k) => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : undefined; };
const need = ["base", "content", "track", "out"].filter((k) => !g(k));
if (need.length) { console.error("usage: composite.mjs --base F --content F --track track.json [--matte F] --out F [--feather px] [--crf n]\nmissing: " + need.join(", ")); process.exit(2); }
try {
  const r = await composite({ base: g("base"), content: g("content"), track: g("track"), matte: g("matte"), out: g("out"), feather_px: g("feather") ? +g("feather") : undefined, crf: g("crf") ? +g("crf") : undefined });
  console.log(JSON.stringify({ ok: true, ...r }));
} catch (e) { console.log(JSON.stringify({ ok: false, error: String(e.message || e) })); process.exit(1); }
