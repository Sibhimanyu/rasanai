// The footage desk's data and checks (references/sources.md): the files under $RUN/footage, and the rules a log, a set of selects and a
// paper edit must meet. footage.mjs and crew.mjs (check --role footage-logger | selects-producer | footage-writer) share these.
import fs from "node:fs";
import path from "node:path";

export const r3 = (v) => Math.round(v * 1000) / 1000;
export const jsonMaybe = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
export const FD = (run, ...p) => path.join(path.resolve(String(run)), "footage", ...p);

export const SIZES = ["ECU", "CU", "MCU", "MS", "MWS", "WS", "EWS", "insert", "screen"];
export const MOVES = ["static", "pan", "tilt", "push-in", "pull-out", "handheld", "gimbal", "drone", "rack-focus", "slider", "zoom"];
export const ROLES = ["a-roll", "broll", "hero", "establishing", "cutaway", "reaction", "texture", "screen", "logo", "crowd", "stage"];
export const JOBS = ["hook", "context", "turn", "proof", "emotion", "button", "cta", "breathe", "illustrate", "cover"];
export const QUALITY = ["good", "ok", "poor"];

// words of a clip: footage/transcripts/<clip>.words.json (footage.mjs transcribe) or footage/<clip>.words.json (reel.mjs scan)
export function wordsOf(run, clip) {
  for (const f of [FD(run, "transcripts", `${clip}.words.json`), FD(run, `${clip}.words.json`)]) {
    const j = jsonMaybe(f);
    if (Array.isArray(j)) return j;
  }
  return null;
}
const norm = (t) => String(t || "").toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, " ").split(/\s+/).filter(Boolean);
export const wordsText = (ws) => ws.map((w) => w.text).join(" ");

// is a cut time inside a spoken word (a clipped word)? gap tolerance 20 ms
export function insideWord(words, t) {
  return words.find((w) => w.start + 0.02 < t && t < w.end - 0.02) || null;
}

// the words between in and out minus cleanup ranges: what a bite will actually say
export function spokenIn(words, a, b, cleanups = []) {
  const cut = cleanups.map((c) => (Array.isArray(c.remove) ? c.remove : String(c).split("-").map(Number))).filter((c) => c.length === 2 && c.every(Number.isFinite));
  return words.filter((w) => w.start >= a - 0.05 && w.end <= b + 0.05 && !cut.some(([x, y]) => w.start >= x - 0.02 && w.end <= y + 0.02));
}

// ---- log (footage-logger): footage/log-<bin>.json -> log.json
export function checkLog(run, bin = null) {
  const P = [], W = [];
  const shots = jsonMaybe(FD(run, "shots.json"));
  if (!shots) return { P: ["footage/shots.json is missing (footage.mjs shots)"], W };
  const all = (shots.clips || []).filter((c) => !bin || c.bin === bin).flatMap((c) => c.shots.map((s) => ({ ...s, clip: c.clip })));
  if (bin && !all.length) return { P: [`no shots in bin "${bin}" (bins: ${[...new Set((shots.clips || []).map((c) => c.bin))].join(", ")})`], W };
  const logs = fs.existsSync(FD(run)) ? fs.readdirSync(FD(run)).filter((f) => (bin ? f === `log-${bin}.json` : /^log-.+\.json$/.test(f))) : [];
  const rows = logs.flatMap((f) => { const j = jsonMaybe(FD(run, f)); return Array.isArray(j) ? j : Array.isArray(j && j.shots) ? j.shots : []; });
  const merged = jsonMaybe(FD(run, "log.json"));
  const log = rows.length ? rows : !bin && Array.isArray(merged) ? merged : [];
  if (!log.length) return { P: ["no footage/log-<bin>.json (or log.json) with rows"], W };
  const byId = new Map(log.map((r) => [r.shot, r]));
  const missing = all.filter((s) => !byId.has(s.id));
  if (missing.length) P.push(`${missing.length} shot(s) not logged (first: ${missing.slice(0, 3).map((s) => s.id).join(", ")})`);
  const sensitive = all.filter((s) => (s.vision && s.vision.sensitive && s.vision.sensitive.length));
  for (const r of log) {
    const s = all.find((x) => x.id === r.shot);
    if (!s) { P.push(`log row "${r.shot}" is not a shot in shots.json`); continue; }
    if (r.size && !SIZES.includes(r.size)) P.push(`${r.shot}: size "${r.size}" is not one of ${SIZES.join("|")}`);
    if (r.move && !MOVES.includes(r.move)) P.push(`${r.shot}: move "${r.move}" is not one of ${MOVES.join("|")}`);
    for (const x of [].concat(r.role || [])) if (!ROLES.includes(x)) P.push(`${r.shot}: role "${x}" is not one of ${ROLES.join("|")}`);
    if (r.quality && !QUALITY.includes(r.quality)) P.push(`${r.shot}: quality "${r.quality}" is not good|ok|poor`);
    if (Array.isArray(r.usable)) {
      if (r.usable.length !== 2 || !(r.usable[0] >= s.in - 0.01 && r.usable[1] <= s.out + 0.01 && r.usable[0] < r.usable[1])) P.push(`${r.shot}: usable ${JSON.stringify(r.usable)} is not inside the shot [${s.in}, ${s.out}]`);
    } else P.push(`${r.shot}: usable [in, out] missing`);
    if (!String(r.subject || "").trim()) P.push(`${r.shot}: subject missing`);
    if (r.gold && !String(r.gold_why || "").trim()) P.push(`${r.shot}: gold with no gold_why`);
  }
  if (!log.some((r) => r.gold)) W.push("no shot is marked gold: say in the notes why the material has no standout moment");
  for (const s of sensitive) {
    const r = byId.get(s.id);
    if (r && !(Array.isArray(r.sensitive) && r.sensitive.length)) P.push(`${s.id}: Vision found sensitive on-screen text (${s.vision.sensitive.join(", ")}) and the log does not handle it (sensitive: [...] with what to do)`);
  }
  return { P, W };
}
export function mergeLogs(run) {
  const logs = fs.readdirSync(FD(run)).filter((f) => /^log-.+\.json$/.test(f)).sort();
  const rows = logs.flatMap((f) => { const j = jsonMaybe(FD(run, f)); return Array.isArray(j) ? j : Array.isArray(j && j.shots) ? j.shots : []; });
  fs.writeFileSync(FD(run, "log.json"), JSON.stringify(rows, null, 2) + "\n");
  return rows.length;
}

// ---- selects (selects-producer): footage/selects.json
export function checkSelects(run, { minGood = 8 } = {}) {
  const P = [], W = [];
  const sel = jsonMaybe(FD(run, "selects.json"));
  if (!sel) return { P: ["footage/selects.json is missing"], W };
  const ing = jsonMaybe(FD(run, "ingest.json"));
  const clipDur = new Map(((ing && ing.clips) || []).map((c) => [c.id, c.duration]));
  const shots = jsonMaybe(FD(run, "shots.json"));
  const shotIds = new Set(((shots && shots.clips) || []).flatMap((c) => c.shots.map((s) => s.id)));
  const ids = new Set();
  const bites = Array.isArray(sel.bites) ? sel.bites : [];
  const moments = Array.isArray(sel.moments) ? sel.moments : [];
  for (const b of bites) {
    const at = `bite ${b.id}`;
    if (!b.id || ids.has(b.id)) P.push(`${at}: id missing or repeated`);
    ids.add(b.id);
    const words = wordsOf(run, b.clip);
    if (!(Number.isFinite(b.in) && Number.isFinite(b.out) && b.out > b.in)) { P.push(`${at}: in/out missing`); continue; }
    if (clipDur.has(b.clip) && (b.in < 0 || b.out > clipDur.get(b.clip) + 0.05)) P.push(`${at}: ${b.in}-${b.out} is outside clip ${b.clip} (${clipDur.get(b.clip)} s)`);
    if (!words) { W.push(`${at}: no transcript for ${b.clip}, boundaries unchecked`); continue; }
    for (const [k, t] of [["in", b.in], ["out", b.out]]) { const w = insideWord(words, t); if (w) P.push(`${at}: ${k} ${t} lands inside the word "${w.text}" (${w.start}-${w.end}): cut on a word boundary (first start - 0.08, last end + 0.12)`); }
    const said = norm(wordsText(spokenIn(words, b.in, b.out, b.cleanups)));
    const want = norm(b.text);
    if (!want.length) P.push(`${at}: text missing`);
    else {
      const have = new Set(said);
      const miss = want.filter((w) => !have.has(w)).length;
      if (miss / want.length > 0.12) P.push(`${at}: its text does not match the transcript in ${b.in}-${b.out} (${miss} of ${want.length} words differ)`);
    }
    if (!(Number(b.rating) >= 1 && Number(b.rating) <= 5)) P.push(`${at}: rating 1-5 missing`);
    for (const j of b.jobs || []) if (!JOBS.includes(j)) P.push(`${at}: job "${j}" is not one of ${JOBS.join("|")}`);
  }
  for (const m of moments) {
    if (!m.id || ids.has(m.id)) P.push(`moment ${m.id}: id missing or repeated`);
    ids.add(m.id);
    if (shotIds.size && !shotIds.has(m.shot)) P.push(`moment ${m.id}: shot "${m.shot}" is not in shots.json`);
    if (!(Number(m.rating) >= 1 && Number(m.rating) <= 5)) P.push(`moment ${m.id}: rating 1-5 missing`);
  }
  const good = [...bites, ...moments].filter((x) => Number(x.rating) >= 4).length;
  if (good < minGood) P.push(`${good} bites/moments rated 4+ (at least ${minGood} in a body of material; if the material truly has fewer, set a lower --min-good and say why in SELECTS.md)`);
  if (!Array.isArray(sel.gaps)) P.push("gaps: [] missing (what the story needs that the footage lacks; empty is fine)");
  for (const c of sel.story_candidates || []) for (const id of c.spine || []) if (!ids.has(id)) P.push(`story candidate "${c.shape}" cites ${id}, which is not a bite or moment`);
  if (!fs.existsSync(FD(run, "SELECTS.md"))) P.push("footage/SELECTS.md is missing");
  return { P, W };
}

// ---- paper edit (footage-writer): story/paper-<L>.json
// a spine item: { bite, cleanups?, job, j_cut? } | { card: {text, duration}, job } | { moment, duration, job }
export function checkPaper(run, paperFile, { length = 0, aspectSafe = true } = {}) {
  const P = [], W = [];
  const paper = jsonMaybe(path.resolve(paperFile));
  if (!paper) return { P: [`${paperFile} is missing or not JSON`], W, stats: null };
  const sel = jsonMaybe(FD(run, "selects.json")) || {};
  const bites = new Map((sel.bites || []).map((b) => [b.id, b]));
  const moments = new Map((sel.moments || []).map((m) => [m.id, m]));
  const shots = jsonMaybe(FD(run, "shots.json"));
  const shotMap = new Map(((shots && shots.clips) || []).flatMap((c) => c.shots.map((s) => [s.id, { ...s, clip: c.clip }])));
  const log = new Map((jsonMaybe(FD(run, "log.json")) || []).map((r) => [r.shot, r]));
  const claims = jsonMaybe(path.resolve(String(run), "research", "claims.json"));
  const claimIds = new Set((Array.isArray(claims) ? claims : (claims && claims.claims) || []).map((c, i) => String(c.id || `c${i + 1}`)));
  const approvals = jsonMaybe(FD(run, "approvals.json")) || {};
  const blocked = new Set((approvals.people || []).filter((p) => p && p.ok === false).map((p) => String(p.name)));
  const spine = Array.isArray(paper.spine) ? paper.spine : [];
  if (!spine.length) return { P: ["spine: [] is empty (the radio edit, in order)"], W, stats: null };
  const target = Number(length) || Number(paper.length_s) || 0;
  let t = 0;
  const at = []; // start time of each spine item
  const joinsOf = new Map(); // bite id -> [{rem:[a,b], t0}]
  spine.forEach((it, i) => {
    at.push(t);
    const nm = `spine[${i}]`;
    if (it.bite) {
      const b = bites.get(it.bite);
      if (!b) { P.push(`${nm}: bite "${it.bite}" is not in footage/selects.json`); return; }
      const cl = (it.cleanups || b.cleanups || []).map((c) => (Array.isArray(c.remove) ? c.remove : String(c).split("-").map(Number)));
      const removed = cl.reduce((a, c) => a + Math.max(0, (c[1] || 0) - (c[0] || 0)), 0);
      const dur = b.out - b.in - removed;
      cl.forEach((c) => { if (!joinsOf.has(it.bite)) joinsOf.set(it.bite, []); joinsOf.get(it.bite).push({ rem: c, id: `${c[0]}-${c[1]}` }); });
      t += dur;
      if (b.speaker && blocked.has(String(b.speaker))) P.push(`${nm}: ${b.speaker} was unticked in approvals.json (people), so ${it.bite} cannot be used`);
    } else if (it.card) {
      const d = Number(it.card.duration);
      if (!(d > 0)) P.push(`${nm}: card needs a duration`); else t += d;
      if (!String(it.card.text || "").trim()) P.push(`${nm}: card has no text`);
    } else if (it.moment) {
      const m = moments.get(it.moment);
      if (!m) P.push(`${nm}: moment "${it.moment}" is not in footage/selects.json`);
      const d = Number(it.duration);
      if (!(d > 0)) P.push(`${nm}: moment needs a duration`); else t += d;
    } else P.push(`${nm}: needs bite, card or moment`);
    if (!it.job) W.push(`${nm}: no job (hook|context|turn|proof|emotion|button|breathe)`);
  });
  const total = t;
  if (target && Math.abs(total - target) > target * 0.08) P.push(`the spine runs ${r3(total)} s for a ${target} s film (within 8%: ${r3(target * 0.92)}-${r3(target * 1.08)} s)`);
  // the hook: a rated 4+ bite or a gold moment plays first
  const first = spine[0] || {};
  if (first.card) {
    if (!(paper.cold_open && String(paper.cold_open.why || "").trim() && Number(first.card.duration) <= 2)) P.push("the film opens on a card: the hook is a rated 4+ bite or a gold moment, at once (a cold-open title needs paper.cold_open { why } and 2 s at most)");
  } else if (first.bite) {
    const b = bites.get(first.bite);
    if (b && !(Number(b.rating) >= 4)) P.push(`the hook ${first.bite} is rated ${b.rating}: open on a rated 4+ bite`);
  } else if (first.moment) {
    const m = moments.get(first.moment);
    const lg = m && log.get(m.shot);
    if (m && !(Number(m.rating) >= 4 || (lg && lg.gold))) P.push(`the hook ${first.moment} is rated ${m.rating} and not gold: open on the strongest real moment`);
  }
  // joins: every cleanup is a join; frankenbites declare a meaning note; each join is covered by b-roll or marked as an intended jump
  const franks = new Map((paper.frankenbites || []).map((f) => [f.bite, f]));
  const broll = Array.isArray(paper.broll_map) ? paper.broll_map : [];
  for (const [id, js] of joinsOf) {
    const f = franks.get(id);
    if (!f || !String(f.meaning_note || "").trim()) P.push(`bite ${id} has ${js.length} join(s) (cleanups) and no frankenbites entry with a meaning_note (say the meaning is unchanged, and why)`);
    for (const j of js) {
      const covered = broll.some((x) => x.over === id && (String(x.covers_join || "") === j.id || x.job === "cover"));
      const intended = (spine.find((s) => s.bite === id) || {}).jump === "intended" || (paper.jump_cuts || []).includes(id);
      if (!covered && !intended) P.push(`bite ${id}: the join at ${j.id} is not covered (a broll_map entry with covers_join "${j.id}") and not marked jump: "intended"`);
    }
  }
  // b-roll: a real shot, at least 1.2 s, reused at most twice, not poor unless accepted
  const use = new Map();
  broll.forEach((x, i) => {
    const nm = `broll_map[${i}]`;
    const s = shotMap.get(x.shot);
    if (!s) { P.push(`${nm}: shot "${x.shot}" is not in shots.json`); return; }
    const span = Array.isArray(x.at) ? x.at[1] - x.at[0] : Array.isArray(x.range) ? x.range[1] - x.range[0] : null;
    if (span != null && span < 1.2) P.push(`${nm}: ${x.shot} is on screen for ${r3(span)} s (1.2 s at least; 2 to 4 s is typical)`);
    if (Array.isArray(x.range) && (x.range[0] < s.in - 0.01 || x.range[1] > s.out + 0.01)) P.push(`${nm}: range ${JSON.stringify(x.range)} is outside shot ${x.shot} [${s.in}, ${s.out}]`);
    use.set(x.shot, (use.get(x.shot) || 0) + 1);
    const lg = log.get(x.shot);
    if (lg && lg.quality === "poor" && !(x.accept_poor && String(x.accept_poor).trim().length > 3)) P.push(`${nm}: ${x.shot} is logged poor; use accept_poor with the reason, or pick another shot`);
    if (!x.job) W.push(`${nm}: no job (illustrate|cover|breathe)`);
  });
  for (const [id, n] of use) if (n > 2) P.push(`shot ${id} is used ${n} times (twice at most)`);
  for (const m of spine.filter((x) => x.moment)) { const mm = moments.get(m.moment); const lg = mm && log.get(mm.shot); if (lg && lg.quality === "poor" && !m.accept_poor) P.push(`moment ${m.moment}: its shot is logged poor; add accept_poor with the reason`); }
  // graphics: claims in the ledger, lower-thirds name a person known to the glossary
  const names = jsonMaybe(FD(run, "names.json")) || {};
  for (const [i, g] of (paper.graphics || []).entries()) {
    if (g.claim && claimIds.size && !claimIds.has(String(g.claim))) P.push(`graphics[${i}]: claim "${g.claim}" is not in research/claims.json`);
    if (g.claim && !claimIds.size) W.push(`graphics[${i}]: claim "${g.claim}" cannot be checked (no research/claims.json)`);
    if (g.type === "lower-third" && g.for && Object.keys(names).length && !names[g.for]) W.push(`graphics[${i}]: lower-third for "${g.for}", who is not in footage/names.json (confirm the spelling)`);
  }
  // cards: at most one per 12 s on average in a brand film
  const cards = spine.filter((x) => x.card).length;
  if (total && cards > Math.max(1, Math.ceil(total / 12))) P.push(`${cards} cards in ${r3(total)} s (one per 12 s at most: the footage carries the film)`);
  if (!Array.isArray(paper.gaps_used)) W.push("gaps_used: [] missing (how each gap in selects.json is covered; empty is fine)");
  return { P, W, stats: { spine: spine.length, total_s: r3(total), target_s: target || null, cards, broll: broll.length, joins: [...joinsOf.values()].reduce((a, j) => a + j.length, 0), hook: first.bite || first.moment || (first.card ? "card" : null) } };
}
