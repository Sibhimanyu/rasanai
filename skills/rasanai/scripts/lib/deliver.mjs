// The delivery package: `video.mjs deliver` writes <out>/ with the final mp4, poster.jpg, <name>.srt (narrated), CREDITS.txt,
// build.sh and NOTE.md, from what the run and the project already hold. Nothing is invented: a piece that is not on disk is listed
// under "Missing" in NOTE.md (and the package still ships). Pure Node + ffmpeg/ffprobe. Method: references/deliver.md.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SKILL_DIR } from "./common.mjs";
import { readDowngrades } from "./downgrade.mjs";

const jm = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const tm = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return null; } };
const ls = (d) => { try { return fs.readdirSync(d); } catch { return []; } };
const r2 = (v) => Math.round(v * 100) / 100;
const sh = (bin, argv, o = {}) => spawnSync(bin, argv, { encoding: "utf8", maxBuffer: 1 << 28, ...o });
const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

export function probe(file) {
  const r = sh("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const j = r.status === 0 ? jm_(r.stdout) : null;
  if (!j) return null;
  const v = (j.streams || []).find((s) => s.codec_type === "video");
  if (!v) return null;
  return { duration: Number(j.format.duration) || Number(v.duration) || 0, w: v.width, h: v.height, fps: v.r_frame_rate, audio: (j.streams || []).some((s) => s.codec_type === "audio"), size: Number(j.format.size) || 0 };
}
const jm_ = (s) => { try { return JSON.parse(s); } catch { return null; } };

// the newest finished render: not a draft / preview / strip, readable by ffprobe; a draft only when nothing else exists (said in NOTE.md)
const DRAFTY = /draft|preview|strip|test|scratch|sample|-m\.mp4$|\.tmp/i;
export function pickRender(project) {
  const dir = path.join(project, "renders");
  const all = ls(dir).filter((f) => /\.(mp4|mov|webm)$/i.test(f)).map((f) => ({ f, p: path.join(dir, f), m: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.m - a.m);
  for (const draft of [false, true]) for (const c of all) if (DRAFTY.test(c.f) === draft) { const pr = probe(c.p); if (pr && pr.duration > 0) return { ...c, probe: pr, draft, considered: all.map((x) => x.f) }; }
  return null;
}

// --- poster ----------------------------------------------------------------------------------------------------------------------
// the score's hero beat (id "hero", else the highest-energy beat) at its peak_t (seconds into the beat), else the frame with the most
// frame-filling mass (share of pixels far from the frame's median luma: a giant glyph, a colour field, a big object) that is not mid-move
function scenesOf(run, project) {
  const sc = jm(path.join(run, "motion", "score.json"));
  if (sc && Array.isArray(sc.scenes) && sc.scenes.every((s) => Number.isFinite(Number(s.start)))) return { score: sc, scenes: sc.scenes };
  const s2 = jm(path.join(run, "scenes.json"));
  return { score: sc, scenes: s2 && Array.isArray(s2.scenes) ? s2.scenes.filter((s) => Number.isFinite(Number(s.start))) : [] };
}
export function heroTime(scenes, dur) {
  if (!scenes.length) return null;
  const hero = scenes.find((s) => /^hero$/i.test(String(s.id))) || scenes.slice().sort((a, b) => (Number(b.energy) || 0) - (Number(a.energy) || 0))[0];
  const rel = Number.isFinite(Number(hero.peak_t)) ? Number(hero.peak_t) : Number(hero.duration || 2) / 2;
  const t = Math.min(dur - 0.1, Number(hero.start) + rel);
  return t > 0 ? { t: r2(t), scene: hero.id || hero.n, why: `the score's ${/^hero$/i.test(String(hero.id)) ? "hero" : "highest-energy"} beat "${hero.id || hero.n}" at its peak (${r2(rel)} s in)` } : null;
}
export function bigMoment(file, dur) {
  const W = 160, H = 90, FPS = 4;
  const r = sh("ffmpeg", ["-v", "error", "-i", file, "-an", "-vf", `fps=${FPS},scale=${W}:${H}:flags=area,format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { encoding: "buffer" });
  if (r.status !== 0) return null;
  const n = Math.floor(r.stdout.length / (W * H));
  const rows = [];
  for (let i = 0; i < n; i++) {
    const f = r.stdout.subarray(i * W * H, (i + 1) * W * H);
    const hist = new Array(256).fill(0);
    for (const p of f) hist[p]++;
    let acc = 0, med = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= f.length / 2) { med = v; break; } }
    let far = 0;
    for (const p of f) if (Math.abs(p - med) > 48) far++;
    let d = 0;
    if (i) { const g = r.stdout.subarray((i - 1) * W * H, i * W * H); for (let k = 0; k < f.length; k++) d += Math.abs(f[k] - g[k]); d /= f.length; }
    rows.push({ t: i / FPS, big: far / f.length, d });
  }
  const ds = rows.map((x) => x.d).sort((a, b) => a - b), medD = ds[Math.floor(ds.length / 2)] || 0;
  const ok = rows.filter((x) => x.t >= 0.5 && x.t <= dur - 0.5 && x.d <= Math.max(medD * 1.5, 2));
  const best = (ok.length ? ok : rows).sort((a, b) => b.big - a.big)[0];
  return best ? { t: r2(best.t), why: `the frame with the most frame-filling mass (${Math.round(best.big * 100)}% of pixels far from the ground, settled), measured with ffmpeg: the score names no hero beat` } : null;
}
function poster(mp4, dur, scenes, dest) {
  let pick = heroTime(scenes, dur) || bigMoment(mp4, dur) || { t: dur / 2, why: "the middle of the film (no hero beat in the score, and the frames could not be measured)" };
  const r = sh("ffmpeg", ["-v", "error", "-y", "-ss", String(pick.t), "-i", mp4, "-frames:v", "1", "-q:v", "2", dest]);
  return r.status === 0 && fs.existsSync(dest) ? pick : null;
}

// --- srt -------------------------------------------------------------------------------------------------------------------------
const stamp = (t) => { const ms = Math.max(0, Math.round(t * 1000)); const p = (n, l = 2) => String(n).padStart(l, "0"); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
// film-time words: audio_meta voices (their times are seconds into the beat `frame` = scene n), else a film-time transcript.json
export function filmWords(project, scenes) {
  const am = jm(path.join(project, "audio_meta.json"));
  const out = [];
  for (const v of (am && am.voices) || []) {
    const sc = scenes.find((s) => Number(s.n) === Number(v.frame));
    const base = sc ? Number(sc.start) : v.start != null ? Number(v.start) : v.offset_s != null ? Number(v.offset_s) : 0;
    for (const w of v.words || []) if (String(w.text || "").trim() && Number.isFinite(Number(w.start))) out.push({ text: String(w.text).trim(), start: base + Number(w.start), end: base + Number(w.end ?? w.start) });
  }
  if (out.length) return { words: out.sort((a, b) => a.start - b.start), source: "audio_meta.json (the voice's word timings)" };
  for (const f of ["transcript.json", "words.json", path.join("assets", "transcript.json")]) {
    const t = jm(path.join(project, f));
    const a = Array.isArray(t) ? t : t && Array.isArray(t.words) ? t.words : null;
    if (a && a.length && a[0].text !== undefined) return { words: a.map((w) => ({ text: String(w.text).trim(), start: Number(w.start), end: Number(w.end) })).filter((w) => w.text && Number.isFinite(w.start)), source: f };
  }
  return { words: [], source: null };
}
// cues: break at sentence ends, a long pause, 2 lines x 38 characters or 5 s; each cue held >= max(1.8 s, speech + 0.6 s) up to the next cue
export function srtCues(words) {
  const cues = []; let cur = [];
  const flush = () => { if (cur.length) cues.push({ text: cur.map((w) => w.text).join(" "), start: cur[0].start, speech: cur[cur.length - 1].end - cur[0].start, end: cur[cur.length - 1].end }); cur = []; };
  for (const w of words) {
    const len = cur.map((x) => x.text).join(" ").length + w.text.length + 1;
    if (cur.length && (len > 76 || w.start - cur[cur.length - 1].end > 0.7 || w.end - cur[0].start > 5)) flush();
    cur.push(w);
    if (/[.!?]["')\]]*$/.test(w.text)) flush();
  }
  flush();
  cues.forEach((c, i) => { const next = cues[i + 1] ? cues[i + 1].start - 0.05 : Infinity; c.end = Math.max(c.end, Math.min(c.start + Math.max(1.8, c.speech + 0.6), next)); });
  return cues;
}
export function srtText(cues) {
  const wrap = (t) => { if (t.length <= 38) return t; const w = t.split(" "); let best = 1, bd = 1e9; for (let i = 1; i < w.length; i++) { const d = Math.abs(w.slice(0, i).join(" ").length - w.slice(i).join(" ").length); if (d < bd) { bd = d; best = i; } } return `${w.slice(0, best).join(" ")}\n${w.slice(best).join(" ")}`; };
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${wrap(c.text)}\n`).join("\n");
}

// --- credits ---------------------------------------------------------------------------------------------------------------------
function creditsText({ run, project, missing }) {
  const L = [];
  const mus = ls(path.join(run, "music")).filter((f) => /^CREDITS?.*\.txt$/i.test(f)).sort();
  const plan = jm(path.join(run, "music", "plan.json"));
  const track = plan && plan.track ? path.basename(String(plan.track)).replace(/\.[a-z0-9]+$/i, "") : null;
  const lic = jm(path.join(run, "music", "LICENSES.json"));
  const used = track && Array.isArray(lic) ? lic.filter((e) => e.file && path.basename(String(e.file)).replace(/\.[a-z0-9]+$/i, "") === track || (e.id && track.includes(String(e.id)))) : [];
  if (mus.length) {
    // older runs leave a CREDIT.txt of a track that lost: use the credit that names the track in music/plan.json, else the newest file (and say so)
    const texts = mus.map((f) => ({ f, t: tm(path.join(run, "music", f)).trim(), m: fs.statSync(path.join(run, "music", f)).mtimeMs })).filter((x) => x.t);
    const key = track ? track.split("-").pop().toLowerCase() : null;
    const hit = key && key.length > 3 ? texts.filter((x) => x.t.toLowerCase().includes(key)) : [];
    const pickT = hit.length ? hit : texts.sort((a, b) => b.m - a.m).slice(0, 1);
    if (!hit.length && texts.length) missing.push(`music credit: ${track ? `no music/CREDITS*.txt names the planned track "${track}"` : "music/plan.json names no track"}; the newest credit file (${pickT[0].f}) is used: check it is the track in the film`);
    const seen = new Set();
    for (const x of pickT) if (!seen.has(x.t)) { seen.add(x.t); L.push("MUSIC", x.t, ""); }
  }
  else if (used.length) L.push("MUSIC", ...used.map((e) => `${e.attribution || `"${e.title}" (${e.source}), ${e.license}`}${e.url ? ` ${e.url}` : ""}`), "");
  else missing.push(`music licence: no music/CREDITS*.txt in the run${lic ? " and LICENSES.json does not name the track in music/plan.json" : ""}; check the track's licence before posting`);
  // sfx: the CC0 library packs the project's sfx files come from
  const sfxFiles = []; const walk = (d, depth = 0) => { for (const f of ls(d)) { const p = path.join(d, f); try { if (fs.statSync(p).isDirectory()) { if (depth < 3) walk(p, depth + 1); } else if (/\.(wav|mp3|ogg)$/i.test(f)) sfxFiles.push(f); } catch {} } };
  walk(path.join(project, "assets", "sfx"));
  const fam = new Set(sfxFiles.map((f) => f.split("-")[0]).filter((x) => /^(uisfx|atomcut|kenney)$/.test(x)));
  const cr = tm(path.join(SKILL_DIR, "library", "sfx", "CREDITS.md"));
  if (fam.size && cr) {
    const rows = cr.split("\n").filter((l) => /^\|/.test(l) && [...fam].some((f) => l.split("|")[1].includes(`\`${f}`) || l.split("|")[1].includes(f)));
    if (rows.length) L.push("SOUND EFFECTS", ...rows.map((l) => { const c = l.split("|").map((s) => s.trim()); const f0 = /uisfx/.test(c[1]) ? "uisfx" : /atomcut/.test(c[1]) ? "atomcut" : "kenney"; const packs = [...new Set(sfxFiles.filter((f) => f.startsWith(f0 + "-")).map((f) => (f0 === "uisfx" ? f.split("-").slice(0, 2).join("-") : null)).filter(Boolean))]; return `${c[1].replace(/`/g, "")}: ${c[2]} (${c[3].replace(/\s*\(.*$/, "")})${packs.length ? ` [used: ${packs.join(", ")}]` : ""}`; }), "");
  } else if (sfxFiles.length) missing.push(`sound-effect credit: ${sfxFiles.length} sfx files in assets/sfx but none from the CC0 library packs (uisfx, atomcut, kenney): their source is not recorded`);
  // reference moments (technique only)
  const mc = jm(path.join(run, "references", "moments", "credits.json"));
  if (mc && Array.isArray(mc.moments) && mc.moments.length) L.push("MOTION REFERENCES", `Technique only, nothing shipped: ${mc.moments.map((c) => `${c.handle || c.name || "unknown"}${c.film ? ` ("${c.film}")` : ""}${c.source_url ? ` ${c.source_url}` : ""}`).join("; ")}.`, "");
  // fonts
  const fonts = ls(path.join(project, "assets", "fonts")).filter((f) => /\.(woff2?|ttf|otf)$/i.test(f));
  if (fonts.length) { const fams = [...new Set(fonts.map((f) => f.replace(/\.[a-z0-9]+$/i, "").replace(/-(Thin|Light|Regular|Medium|SemiBold|Bold|ExtraBold|Black|Italic|\d+).*$/i, "")))]; L.push("FONTS", `${fams.join(", ")} (files: ${fonts.join(", ")}). Their licences are the foundries': not recorded here.`, ""); missing.push("font licences: the fonts are listed by file, but the run does not record where each came from or its licence"); }
  // third-party material the skill itself carries
  const tp = path.join(SKILL_DIR, "third_party");
  const tpl = ls(tp).filter((d) => fs.existsSync(path.join(tp, d, "NOTICE"))).map((d) => `${d}: ${tm(path.join(tp, d, "NOTICE")).split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 2).join(" ")} (${path.relative(path.dirname(SKILL_DIR), path.join(tp, d))})`);
  if (tpl.length) L.push("THIRD-PARTY (RasanAI)", ...tpl, "");
  return L.join("\n").trim() + "\n";
}

// --- build.sh --------------------------------------------------------------------------------------------------------------------
function buildSh({ project, name, usedFinish, hfVersion, ffArgs }) {
  const hf = hfVersion ? `hyperframes@${hfVersion}` : "hyperframes";
  const cmd = usedFinish
    ? `node ${q(path.join(SKILL_DIR, "scripts", "finish.mjs"))} all --project "$PROJECT" --out "$OUT/${name}.mp4" ${ffArgs}`
    : `npx --yes ${hf} render "$PROJECT" -o "$OUT/${name}.mp4" --quality delivery`;
  return `#!/usr/bin/env bash
# Rebuilds "${name}" from its project: ${usedFinish ? "finish.mjs all (the oversampled hyperframes render, real motion blur, one grade)" : "the hyperframes render"}.
# Generated by video.mjs deliver. ${usedFinish ? "The finish flags are RasanAI's defaults (references/finish.md): the run does not record the flags it used." : "The render flags are not recorded by the run; quality delivery is the default for a delivery render."}
set -euo pipefail
PROJECT="\${PROJECT:-${project}}"
OUT="\${OUT:-$(cd "$(dirname "$0")" && pwd)}"
cd "$PROJECT"
${cmd}
echo "wrote $OUT/${name}.mp4"
`;
}

// --- NOTE.md ---------------------------------------------------------------------------------------------------------------------
const scal = (o, keys) => Object.entries(o || {}).filter(([k, v]) => (keys ? keys.includes(k) : true) && (typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length < 40))).map(([k, v]) => `${k} ${typeof v === "number" ? r2(v) : v}`);
const fmtF = (f) => `${f.severity || "finding"}${f.check || f.rule || f.id ? ` ${f.check || f.rule || f.id}` : ""}${f.at != null ? ` @${f.at}s` : ""}: ${String(f.message || f.problem || f.msg || (f.where ? `${f.where}${f.why ? `: ${f.why}` : ""}` : JSON.stringify(f))).slice(0, 220)}${f.fix ? ` (fix: ${String(f.fix).slice(0, 140)})` : ""}`;
function findingsOf(j) {
  const out = [];
  for (const k of ["findings", "problems", "warnings", "errors", "issues"]) if (Array.isArray(j[k])) for (const f of j[k]) out.push(typeof f === "string" ? `${k === "findings" ? "" : k.replace(/s$/, "") + ": "}${f.slice(0, 220)}` : fmtF(f));
  return out;
}
function gateBlock(title, file, rel, keyNums) {
  const j = jm(file);
  if (!j) return null;
  const nums = keyNums ? [] : scal(j).filter((x) => !/^(ok|verdict|status|kind|dur) /.test(x));
  for (const k of ["measured", "measures", "film"]) if (j[k] && typeof j[k] === "object") nums.push(...scal(j[k], keyNums && keyNums[k]));
  const bold = j.film && j.film.boldness && typeof j.film.boldness === "object" ? `boldness: ${scal(j.film.boldness).join(", ")}` : null;
  const lines = [`### ${title}`, `Source: \`${rel}\` (${new Date(fs.statSync(file).mtimeMs).toISOString().slice(0, 16)}Z)`, `- verdict: ${j.verdict ?? j.status ?? (j.ok === false ? "not ok" : j.ok === true ? "ok" : "none recorded")}${j.could_not_run && (j.could_not_run.length || j.could_not_run === true) ? " (part of it could not run)" : ""}`];
  if (nums.length) lines.push(`- numbers: ${nums.slice(0, 30).join(", ")}`);
  if (bold) lines.push(`- ${bold}`);
  const f = findingsOf(j);
  if (f.length) lines.push(`- findings (${f.length}):`, ...f.slice(0, 15).map((x) => `  - ${x}`));
  return lines.join("\n");
}
function latestBy(dir, re) {
  const best = {};
  for (const f of ls(dir)) { const m = f.match(re); if (m) { const k = m[1], n = Number(m[2]); if (!best[k] || n > best[k].n) best[k] = { n, f }; } }
  return best;
}

function noteMd({ run, project, name, render, posterPick, srt, extra, missing, rerun }) {
  const out = [`# ${name}: delivery note`, "", `Every number below is read from the run's own gate files; none is re-derived or rounded up. What is not on disk is under Missing.`, ""];
  const pr = render.probe;
  out.push("## The film", `- file: \`${name}.mp4\`, copied from \`${path.relative(project, render.p)}\` (${new Date(render.m).toISOString().slice(0, 16)}Z)`, `- ${r2(pr.duration)} s, ${pr.w}x${pr.h}, ${pr.fps} fps, audio ${pr.audio ? "yes" : "none"}, ${r2(pr.size / 1048576)} MB`);
  if (render.draft) out.push("- WARNING: the only render found is a draft; run the full finish (build.sh) before posting");
  out.push(`- poster: ${posterPick ? `\`poster.jpg\` at ${posterPick.t} s, ${posterPick.why}` : "none (ffmpeg could not cut a frame)"}`, `- subtitles: ${srt}`, "");
  out.push("## Gates (latest numbers)");
  const crew = path.join(run, "crew");
  const GATES = [["Motion gate", "motion-gate.json", { measured: ["coverage", "fluency", "carry", "longest_still_s", "end_card_hold_s", "empty_share", "ending_share", "carried_seams", "declared_carried_seams", "frames", "duration_s", "stillness"] }], ["Slop gate", null, null], ["Obey (motion contract)", null, null], ["Sound check", null, null]];
  const found = [];
  const crewFiles = ls(crew).filter((f) => f.endsWith(".json"));
  const pickFile = (re) => crewFiles.filter((f) => re.test(f)).map((f) => ({ f, m: fs.statSync(path.join(crew, f)).mtimeMs })).sort((a, b) => b.m - a.m)[0];
  for (const [title, file, keys] of GATES) {
    const hit = file ? (fs.existsSync(path.join(crew, file)) ? { f: file } : null) : pickFile(title.startsWith("Slop") ? /slop/i : title.startsWith("Obey") ? /obey/i : /sound/i);
    const b = hit && gateBlock(title, path.join(crew, hit.f), path.relative(run, path.join(crew, hit.f)), keys);
    if (b) out.push(b, ""); else missing.push(`${title.toLowerCase()}: no ${file || "crew/<gate>.json"} result in the run (those gates print to the console; deliver --rerun records them)`);
  }
  const fg = path.join(run, "frames", "gate.json");
  const fb = gateBlock("Frame gate (incl. boldness)", fg, "frames/gate.json", { film: ["frames", "emptyShare", "competingShare", "biggestMedian", "biggestRatio", "peak35", "objectRatio", "share10", "share20", "groundRange", "softShotsShare"] });
  if (fb) out.push(fb, ""); else missing.push("frame gate: no frames/gate.json");
  if (fb && !/boldness/.test(fb)) missing.push("boldness: frames/gate.json was written before the boldness check; run frame-gate.mjs on the render for the film's boldness share");
  const bf = pickFile(/frame-gate|boldness/i);
  if (bf) { const b = gateBlock("Frame gate on the film (latest)", path.join(crew, bf.f), `crew/${bf.f}`); if (b) out.push(b, ""); }
  for (const [title, f] of extra) { const b = gateBlock(title, f, path.relative(run, f)); if (b) out.push(b, ""); }
  if (rerun.length) out.push("### Re-run at delivery", ...rerun.map((r) => `- ${r}`), "");

  out.push("## Critics");
  const crit = latestBy(crew, /^(critic-[a-z-]+?)-(\d+)\.json$/);
  const keys = Object.keys(crit).sort();
  if (!keys.length) missing.push("critic scores: no crew/critic-*.json");
  for (const k of keys) {
    const j = jm(path.join(crew, crit[k].f)) || {};
    const high = (j.findings || []).filter((f) => /high|error|fail/i.test(String(f.severity))).length;
    out.push(`- ${k} round ${j.round ?? crit[k].n}: verdict ${j.verdict ?? "none"}; scores ${j.scores ? Object.entries(j.scores).map(([a, b]) => `${a} ${b}`).join(", ") : "none recorded"}; ${(j.findings || []).length} findings, ${high} high${j.needs_from_user && (Array.isArray(j.needs_from_user) ? j.needs_from_user.length : j.needs_from_user) ? "; asks the user for something (see the file)" : ""}`);
  }
  out.push("");
  out.push("## A/B verdicts");
  const abs = ls(crew).filter((f) => /^ab-\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(3)) - parseInt(b.slice(3)));
  if (!abs.length) out.push("- no A/B was run");
  for (const f of abs) { const j = jm(path.join(crew, f)) || {}; out.push(`- ${f.replace(/\.json$/, "")}: ${j.a ? `\`${path.basename(j.a)}\` vs \`${path.basename(j.b || "")}\`` : "two renders"}; verdict ${j.verdict == null ? "none recorded (blind, not judged)" : typeof j.verdict === "object" ? JSON.stringify(j.verdict) : j.verdict}${j.decision ? `, decision ${j.decision}` : ""}${j.note && !/^order:/.test(j.note) ? `; ${String(j.note).slice(0, 160)}` : ""}`); }
  out.push("");

  out.push("## Waivers and deviations");
  const mdTxt = tm(path.join(project, "motion.md")) || "";
  const wm = mdTxt.match(/^waivers:\s*(.*)$/m);
  let waivers = []; try { waivers = wm ? JSON.parse(wm[1] || "[]") : []; } catch {}
  const score = jm(path.join(run, "motion", "score.json")) || {};
  const wv = waivers.map((w) => typeof w === "string" ? `- motion contract rule \`${w}\` waived` : `- motion contract rule \`${w.rule}\`${w.target ? ` on ${w.target}` : ""} waived${w.reason ? `: ${w.reason}` : " (no reason recorded)"}`);
  if (typeof score.shape_waiver === "string" && score.shape_waiver.trim()) wv.push(`- shape waiver: ${score.shape_waiver.trim()}`);
  for (const d of Array.isArray(score.deviations) ? score.deviations : []) wv.push(`- deviation from the board, beat ${d.beat}${d.field ? ` (${d.field})` : ""}: ${String(d.why || "no reason recorded").slice(0, 260)}`);
  out.push(...(wv.length ? wv : ["- none recorded"]), "");

  out.push("## Downgrades (what ran weaker than planned)");
  const dg = readDowngrades(run);
  out.push(...(dg.length ? dg.map((d) => `- ${d.t ? d.t.slice(0, 10) + " " : ""}${d.what}: used ${d.instead}${d.why ? `, because ${d.why}` : ""}${d.impact ? ` (${d.impact})` : ""}`) : ["- none recorded"]), "");

  out.push("## Decision history (calls that were replaced)");
  const sess = jm(path.join(run, "session.json")) || {};
  const hist = Object.entries(sess.steps || {}).flatMap(([step, s]) => (s.decisions_history || []).map((h) => `- ${step}: "${String(h.decision).slice(0, 140)}" was replaced by "${String(h.replaced_by).slice(0, 140)}" because ${h.because}`));
  out.push(...(hist.length ? hist : ["- none: no call was swapped after it was closed"]), "");

  out.push("## Missing (not on disk, so not claimed)");
  out.push(...(missing.length ? [...new Set(missing)].map((m) => `- ${m}`) : ["- nothing"]), "");
  return out.join("\n");
}

// --- the command -----------------------------------------------------------------------------------------------------------------
function rerunGates({ run, project, mp4, dur }) {
  const notes = [];
  const S = (s) => path.join(SKILL_DIR, "scripts", s);
  const jobs = [["obey", "obey.mjs", ["--project", project, "--run", run, "--json"]], ["slop", "slop.mjs", ["--project", project, "--run", run, "--video", mp4, "--json"]], ["sound", "sound.mjs", ["check", "--video", mp4, "--film", String(r2(dur)), "--score", path.join(run, "motion", "score.json")]]];
  for (const [k, script, argv] of jobs) {
    const r = sh("node", [S(script), ...argv], { timeout: 600000 });
    let j = null; try { j = JSON.parse(r.stdout); } catch {}
    if (j) { fs.mkdirSync(path.join(run, "crew"), { recursive: true }); fs.writeFileSync(path.join(run, "crew", `${k}-deliver.json`), JSON.stringify(j, null, 2)); notes.push(`${k}: exit ${r.status}, recorded as crew/${k}-deliver.json`); }
    else notes.push(`${k}: exit ${r.status}, no JSON to record (${String(r.stderr || r.stdout).trim().split("\n").pop() || "no output"})`);
  }
  return notes;
}

export function deliver({ run, project, out, rerun = false }) {
  run = path.resolve(run); project = path.resolve(project);
  if (!fs.existsSync(path.join(run, "session.json")) && !fs.existsSync(path.join(run, "motion"))) throw new Error(`${run} does not look like a run (no session.json)`);
  if (!fs.existsSync(path.join(project, "hyperframes.json")) && !fs.existsSync(path.join(project, "index.html"))) throw new Error(`${project} does not look like a HyperFrames project`);
  const name = path.basename(project).replace(/[^A-Za-z0-9._-]/g, "-");
  const dest = path.resolve(out || path.join(project, "deliver"));
  const render = pickRender(project);
  if (!render) throw new Error(`no readable render in ${path.join(project, "renders")}: render the film first (finish.mjs all)`);
  fs.mkdirSync(dest, { recursive: true });
  const missing = [];
  const files = {};
  const mp4 = path.join(dest, `${name}${path.extname(render.f) || ".mp4"}`);
  fs.copyFileSync(render.p, mp4); files.film = path.basename(mp4);
  const { score, scenes } = scenesOf(run, project);
  const dur = render.probe.duration;

  const posterPick = poster(render.p, dur, scenes, path.join(dest, "poster.jpg"));
  if (posterPick) files.poster = "poster.jpg"; else missing.push("poster: ffmpeg could not cut a frame");

  const brief = jm(path.join(run, "brief.json")) || {};
  const narrated = !!(score && score.narration) || ((jm(path.join(project, "audio_meta.json")) || {}).voices || []).length > 0 || (!!brief.narration && !/^(none|no\b)/i.test(String(brief.narration)));
  const fw = filmWords(project, scenes);
  let srt;
  if (fw.words.length) { const cues = srtCues(fw.words); fs.writeFileSync(path.join(dest, `${name}.srt`), srtText(cues)); files.srt = `${name}.srt`; srt = `\`${name}.srt\`, ${cues.length} cues from ${fw.source}, each held at least max(1.8 s, speech + 0.6 s)`; }
  else if (narrated) { srt = "none: the film is narrated but no word timings were found (audio_meta.json voices are empty)"; missing.push(".srt: narrated film with no voice word timings in audio_meta.json or a transcript.json"); }
  else srt = "none: an unnarrated film has no speech to subtitle";

  fs.writeFileSync(path.join(dest, "CREDITS.txt"), creditsText({ run, project, missing })); files.credits = "CREDITS.txt";

  const pkg = jm(path.join(project, "package.json")) || {};
  const hfVersion = ((pkg.scripts || {}).render || "").match(/hyperframes@([\w.-]+)/)?.[1] || null;
  if (!hfVersion) missing.push("hyperframes version: package.json has no pinned render script; build.sh uses the latest");
  const usedFinish = /finish/i.test(render.f) || /finish/i.test(render.considered.join(" "));
  fs.writeFileSync(path.join(dest, "build.sh"), buildSh({ project, name, usedFinish, hfVersion, ffArgs: "--samples 8 --grain 0.03 --halation 0.2 --vignette 0.2" }), { mode: 0o755 });
  files.build = "build.sh";

  const rr = rerun ? rerunGates({ run, project, mp4: render.p, dur }) : [];
  fs.writeFileSync(path.join(dest, "NOTE.md"), noteMd({ run, project, name, render, posterPick, srt, extra: [], missing, rerun: rr })); files.note = "NOTE.md";
  return { ok: true, out: dest, files, poster: posterPick, render: path.relative(project, render.p), draft: render.draft, missing: [...new Set(missing)] };
}
