// Story board: a concept's shots[] as one thumbnail image, one tile per shot with its words and move, so the user picks a story by looking at it.
// Called from board.mjs (--concept). HTML rendered to PNG by headless Chrome (chromeScreenshot), like the keyframe board and the style frames.
import fs from "node:fs";
import path from "node:path";
import { die, readJSON, writeFile, esc, chromeScreenshot } from "./common.mjs";
import { styleOf, composition, moveName, COMP_CSS } from "./story-visuals.mjs";
import { lintConcept, ensureShotIds, moveIdOf, carrierOf } from "./concept-schema.mjs";

const s = (v) => (v == null ? "" : String(v));

export function loadConcept(file, pick) {
  let j = readJSON(path.resolve(file));
  if (Array.isArray(j)) j = j[Number(pick) || 0] || j[0];
  if (j && Array.isArray(j.concepts)) j = j.concepts.find((c) => c.id === pick || c.label === pick) || j.concepts[Number(pick) || 0];
  if (!j || !Array.isArray(j.shots) || !j.shots.length) die(`${file}: a concept needs shots[] (t, see, style, carrier_state, move, transition, words)`);
  ensureShotIds(j);
  for (const w of lintConcept(j).warnings) console.error(`board: ${w}`);
  return j;
}

export function boardHtml(concept, o = {}) {
  const st = styleOf(concept);
  const shots = concept.shots;
  const cols = Number(o.cols) || 4, W = 1600, pad = 28, gap = 22;
  const tileW = Math.floor((W - pad * 2 - gap * (cols - 1)) / cols), thumbH = Math.round((tileW * 9) / 16);
  const sig = concept.signature_moment;
  const sigId = sig && typeof sig === "object" ? s(sig.shot || sig.id) : "";
  const carrier = carrierOf(concept).what;
  const tiles = shots.map((sh, i) => {
    const isSig = sh.signature === true || (sigId && (s(sh.id) === sigId || s(sh.t) === sigId));
    const mv = moveIdOf(sh), nm = moveName(mv);
    return `<figure class="tile${isSig ? " sig" : ""}">
  <div class="box th" style="height:${thumbH}px">${composition(sh, st, { carrier: !!carrier })}<span class="n">${i + 1}</span><span class="t">${esc(s(sh.t))}</span>${isSig ? `<span class="star">signature</span>` : ""}</div>
  <figcaption>
    ${s(sh.words) ? `<div class="w">${esc(s(sh.words))}</div>` : `<div class="w none">no words</div>`}
    <div class="see">${esc(s(sh.see))}</div>
    <div class="row"><span class="chip mv">${esc(nm || mv || "no move")}</span>${sh.style ? `<span class="chip">${esc(s(sh.style))}</span>` : ""}</div>
    ${sh.carrier_state ? `<div class="meta">carrier: ${esc(s(sh.carrier_state))}</div>` : ""}
    ${sh.transition ? `<div class="meta tr">&rarr; ${esc(s(sh.transition))}</div>` : ""}
  </figcaption></figure>`;
  }).join("\n");
  const rows = Math.ceil(shots.length / cols);
  const rowH = thumbH + 168;
  const headH = 118;
  const height = headH + rows * (rowH + gap) + pad;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#101114;color:#e9e9ec;font:500 13px/1.35 -apple-system,'Helvetica Neue',Arial,sans-serif}
.wrap{width:${W}px;padding:0 ${pad}px;box-sizing:border-box}
header{height:${headH}px;display:flex;flex-direction:column;justify-content:center;gap:6px}
h1{margin:0;font-size:26px;letter-spacing:-.02em}
.sub{display:flex;gap:18px;flex-wrap:wrap;color:#9a9ca6;font-size:13px}.sub b{color:#e9e9ec;font-weight:600}
.sw{display:inline-flex;gap:4px;vertical-align:middle;margin-left:6px}.sw i{width:12px;height:12px;border-radius:3px;display:inline-block;border:1px solid #ffffff22}
.grid2{display:grid;grid-template-columns:repeat(${cols},${tileW}px);gap:${gap}px}
.tile{margin:0;width:${tileW}px}
.th{width:${tileW}px;border-radius:8px;border:1px solid #ffffff1a}
.sig .th{outline:2px solid #ffb547;outline-offset:2px}
.n{position:absolute;left:8px;top:8px;background:#000a;color:#fff;border-radius:99px;padding:2px 8px;font-size:11px;font-weight:700;z-index:3}
.t{position:absolute;right:8px;top:8px;background:#000a;color:#fff;border-radius:6px;padding:2px 6px;font-size:11px;z-index:3;font-variant-numeric:tabular-nums}
.star{position:absolute;left:8px;bottom:8px;background:#ffb547;color:#1b1200;border-radius:6px;padding:2px 7px;font-size:11px;font-weight:700;z-index:3}
figcaption{padding:8px 2px 0}.w{font-size:16px;font-weight:700;letter-spacing:-.01em}.w.none{color:#6d6f78;font-weight:500}
.see{color:#b6b8c0;margin:3px 0 6px;max-height:3.9em;overflow:hidden}
.row{display:flex;gap:5px;flex-wrap:wrap}.chip{border:1px solid #ffffff26;border-radius:99px;padding:1px 8px;font-size:11px;color:#c9cbd2}.chip.mv{background:#ffffff14;color:#fff;font-weight:600}
.meta{color:#80828c;font-size:11.5px;margin-top:4px}.tr{color:#a0a2ac}
${COMP_CSS}
</style></head><body><div class="wrap">
<header><h1>${esc(s(concept.title || concept.id || "Story board"))}</h1>
<div class="sub"><span>style world <b>${esc(st.name)}</b><span class="sw"><i style="background:${st.bg}"></i><i style="background:${st.ink}"></i><i style="background:${st.accent}"></i></span></span>
${carrier ? `<span>carrier <b>${esc(carrier)}</b></span>` : ""}
${sig ? `<span>signature moment <b>${esc(s(typeof sig === "object" ? sig.what || sig.name || sig.shot : sig))}</b></span>` : ""}
<span>${shots.length} shots${concept.duration_s ? `, ${esc(s(concept.duration_s))} s` : ""}</span></div></header>
<div class="grid2">${tiles}</div></div></body></html>`;
  return { html, width: W, height };
}

export async function runStoryBoard(args) {
  const concept = loadConcept(s(args.concept), args.pick);
  const out = path.resolve(s(args.out) || ".");
  const { html, width, height } = boardHtml(concept, { cols: args.cols });
  fs.mkdirSync(out, { recursive: true });
  const htmlFile = path.join(out, "story-board.html"), png = path.join(out, "story-board.png");
  writeFile(htmlFile, html);
  chromeScreenshot(`file://${htmlFile}`, png, width, height, 4000);
  if (!fs.existsSync(png)) die("the story board did not render (is Chrome installed?)");
  const moves = [...new Set(concept.shots.map((x) => s(x.move)).filter(Boolean))];
  const meta = { ok: true, png, html: htmlFile, shots: concept.shots.length, size: `${width}x${height}`, moves, moves_missing: concept.shots.filter((x) => !s(x.move)).length };
  writeFile(path.join(out, "story-board.json"), JSON.stringify(meta, null, 2) + "\n");
  console.log(JSON.stringify(meta, null, 2));
}
