// Adapted from cooked. (MIT, Copyright (c) 2026 NextWork), plugins/ai-editor/skills/cut/scripts/retakes.py restarts/clauses/phrases/similar_openings/alt_hooks/loose_like/find L56-L335, textnorm.py norm/canon/words L27-L87 @3b236ec; ported to Node and modified by RasanAI. Credit: third_party/cooked/.
//
// Retake / false-start / meta / filler / alternate-hook CANDIDATES. Code finds the places a cut
// might go; it never decides. Output is the `candidates` array of `rasanai.cut.v1`.
// Upstream SHA 3b236ec8fe32343cdf38375df90f6cd71e0846d7. Edge cases checked against upstream
// test_retakes.py L38-L220 (not ported). Words in: [{text,start,end,conf?,speaker?}], index = position.
// Not ported (not candidates): audio_event tokens, text_view/say-with-unheard marks, hook_line,
// taste.keep_fillers loading (passed in as `keepFillers`), CLI, captions, fix, remap.
// Ours: stable word ids, long_pause kind, speaker-change guard on restarts, per-kind confidence/reason.

export const RETAKES_VERSION = "retakes@1";

// retakes.py L56-L67
export const PHRASE_GAP_S = 0.5;
export const WINDOW_S = 40.0;
export const WINDOW_WORDS = 80;
export const NEAR_WORDS = 8;
export const ALT_HOOK_MAX_WORDS = 30;
export const HARD_FILLERS = new Set(["um", "uh", "umm", "uhh", "erm", "er", "hmm", "mm", "ah", "eh"]);
export const SOFT_FILLERS = ["you know", "i mean", "like"];
export const STOP = new Set(["a", "an", "the", "and", "or", "but", "so", "of", "to", "in", "on", "at", "it", "is",
  "i", "you", "we", "that", "this", "for", "with", "be", "was", "are", "my", "me", "if",
  "it's", "it'll", "i'm", "they", "he", "she", "do", "not", "there", "then", "just"]);
export const META = /\b(wait|sorry|hold on|shoot|oops|start (?:again|over)|one more time|let me (?:start|do (?:that|this|it)|try|say (?:that|it))(?: (?:again|over))?|take two|again)\b/g;
// retakes.py L246 (LIKE_BEFORE)
export const LIKE_BEFORE = new Set(["and", "so", "but", "or", "um", "uh", "was", "were"]);
// textnorm.py L27-L29
export const SPOKEN_SAME = { wanna: "want to", gonna: "going to", gotta: "got to", kinda: "kind of",
  sorta: "sort of", til: "till", cuz: "because", yall: "you all" };
// textnorm.py L20-L32
const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES = { hundred: 100, thousand: 1000, million: 1000000, billion: 1000000000 };
const BARE_FOLD_MIN = 13;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// --- textnorm.py L35-L41, L147-L148 ---
export function norm(s) {
  let t = String(s).toLowerCase().replace(/%/g, " percent ");
  t = t.replace(/(?<=\d),(?=\d)/g, "");
  return t.replace(/[^a-z0-9' ]+/g, " ").trim();
}
const nwords = (s) => norm(s).split(/\s+/).filter(Boolean);

// textnorm.py L44-L87 (canon / canon_src)
function canonSrc(toks) {
  const out = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (has(SPOKEN_SAME, t)) { for (const x of SPOKEN_SAME[t].split(" ")) out.push([x, i]); i++; continue; }
    if (has(UNITS, t) || has(TENS, t)) {
      let total = 0, cur = 0, j = i;
      while (j < toks.length) {
        const w = toks[j];
        if (has(UNITS, w)) cur += UNITS[w];
        else if (has(TENS, w)) cur += TENS[w];
        else if (has(SCALES, w)) {
          if (SCALES[w] === 100) cur = (cur || 1) * 100;
          else { total += (cur || 1) * SCALES[w]; cur = 0; }
        } else break;
        j++;
      }
      const value = total + cur;
      if (j - i === 1 && value < BARE_FOLD_MIN && has(UNITS, t)) { out.push([t, i]); i++; }
      else { out.push([String(value), i]); i = j; }
      continue;
    }
    out.push([t, i]); i++;
  }
  return out;
}
export const canon = (toks) => canonSrc(toks).map(([t]) => t);
// textnorm.py L90-L91
export function words(text) { return canon(norm(text).split(/\s+/).filter(Boolean)); }

// --- difflib.SequenceMatcher (autojunk=False, no junk) ---
export function matchingBlocks(a, b) {
  const b2j = new Map();
  b.forEach((v, j) => { if (!b2j.has(v)) b2j.set(v, []); b2j.get(v).push(j); });
  const longest = (alo, ahi, blo, bhi) => {
    let besti = alo, bestj = blo, bestsize = 0, j2len = new Map();
    for (let i = alo; i < ahi; i++) {
      const nj = new Map();
      for (const j of b2j.get(a[i]) || []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) || 0) + 1;
        nj.set(j, k);
        if (k > bestsize) { besti = i - k + 1; bestj = j - k + 1; bestsize = k; }
      }
      j2len = nj;
    }
    return [besti, bestj, bestsize];
  };
  const queue = [[0, a.length, 0, b.length]], found = [];
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop();
    const [i, j, k] = longest(alo, ahi, blo, bhi);
    if (k) {
      found.push([i, j, k]);
      if (alo < i && blo < j) queue.push([alo, i, blo, j]);
      if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
    }
  }
  found.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
  const out = [];
  let [i1, j1, k1] = [0, 0, 0];
  for (const [i2, j2, k2] of found) {
    if (i1 + k1 === i2 && j1 + k1 === j2) k1 += k2;
    else { if (k1) out.push({ a: i1, b: j1, size: k1 }); [i1, j1, k1] = [i2, j2, k2]; }
  }
  if (k1) out.push({ a: i1, b: j1, size: k1 });
  return out;
}
export function ratio(a, b) {
  const t = a.length + b.length;
  if (!t) return 1;
  return (2 * matchingBlocks(a, b).reduce((s, m) => s + m.size, 0)) / t;
}

// retakes.py L111-L116 (same): spelling drift on names (jev / jv)
const sameCache = new Map();
function same(x, y) {
  if (x === y) return true;
  const key = x + "\u0000" + y;
  if (!sameCache.has(key)) sameCache.set(key, x.length >= 3 && y.length >= 2 && ratio([...x], [...y]) >= 0.75);
  return sameCache.get(key);
}

const txt = (t) => String(t.text ?? "").trim();
const endsWith = (s, chars) => chars.some((c) => s.endsWith(c));

// retakes.py L73-L84 (phrases): [[first,last]] split at silences and sentence ends
export function phrases(toks) {
  const out = [];
  let a = 0;
  for (let i = 1; i <= toks.length; i++) {
    if (i === toks.length || toks[i].start - toks[i - 1].end >= PHRASE_GAP_S || endsWith(txt(toks[i - 1]), [".", "?", "!"])) {
      out.push([a, i - 1]);
      a = i;
    }
  }
  return toks.length ? out : [];
}

// retakes.py L119-L127 (norm_seq): [[word, token index]], hard fillers dropped
function normSeq(toks) {
  const out = [];
  toks.forEach((t, i) => { for (const w of nwords(t.text)) if (!HARD_FILLERS.has(w)) out.push([w, i]); });
  return out;
}

// retakes.py L130-L141 (clauses): phrases split again after , ; : - and after um/uh
export function clauses(toks) {
  const out = [];
  for (const [a, b] of phrases(toks)) {
    let start = a;
    for (let i = a; i < b; i++) {
      const t = txt(toks[i]);
      const nw = nwords(t);
      if (endsWith(t, [",", ";", ":", "-"]) || (nw.length && nw.every((w) => HARD_FILLERS.has(w)))) {
        out.push([start, i]);
        start = i + 1;
      }
    }
    out.push([start, b]);
  }
  return out;
}

// retakes.py L144-L145 (opening)
function opening(toks, a, b, n = 6) {
  const r = [];
  for (let i = a; i <= b && i < toks.length; i++) for (const w of nwords(toks[i].text)) if (!HARD_FILLERS.has(w)) r.push(w);
  return r.slice(0, n);
}

// retakes.py L148-L158 (similar_openings): fuzzy on spelling; both args are opening word lists
export function similarOpenings(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return false;
  x = x.slice(0, n);
  y = y.slice(0, n).map((v) => x.find((w) => same(w, v)) ?? v);
  const hit = matchingBlocks(x, y).flatMap((bl) => x.slice(bl.a, bl.a + bl.size));
  return hit.length >= 2 && hit.length / n >= 0.6 && (hit.length >= 3 || hit.some((w) => !STOP.has(w)));
}

const spk = (toks, i) => toks[i]?.speaker ?? null;
const sameSpeaker = (toks, i, j) => spk(toks, i) === spk(toks, j);

// retakes.py L161-L206 (restarts): [[i, j]] attempt from token i is abandoned, restarted at j.
// Ours: never pairs across different `speaker` values.
export function restarts(toks) {
  const out = [], cl = clauses(toks);
  for (let bi = 1; bi < cl.length; bi++) {
    const b0 = cl[bi][0];
    const ob = opening(toks, ...cl[bi]);
    for (let ai = bi - 1; ai >= 0; ai--) {
      const a0 = cl[ai][0];
      if (toks[b0].start - toks[a0].start > WINDOW_S) break;
      if (!sameSpeaker(toks, a0, b0)) continue;
      if (similarOpenings(opening(toks, ...cl[ai]), ob)) { out.push([a0, b0]); break; }
    }
  }
  const taken = (x) => out.some(([i, j]) => i <= x && x < j);
  const seq = normSeq(toks);
  let n = 0;
  while (n < seq.length) {
    let best = null;
    for (let m = n - 1; m > Math.max(-1, n - 30); m--) {
      let k = 0;
      while (n + k < seq.length && m + k < n && seq[m + k][0] === seq[n + k][0]) k++;
      const content = seq.slice(n, n + k).some(([w]) => !STOP.has(w));
      // "a lot of tokens and a lot of money": a list, not a retry (retakes.py L190-L194)
      const rest = seq.slice(m + k, n).map(([w]) => w);
      let c = null;
      rest.forEach((w, x) => { if (w === "and" || w === "or") c = x; });
      const listed = c !== null && rest.slice(0, c).some((w) => !STOP.has(w)) && rest.slice(c).every((w) => STOP.has(w));
      if (k >= (n - m <= NEAR_WORDS ? 2 : 3) && (content || k >= 4) && !listed) { best = [m, k]; break; }
    }
    const i = best ? seq[best[0]][1] : null, j = best ? seq[n][1] : null;
    if (best && i < j && !taken(i) && !taken(j - 1) && sameSpeaker(toks, i, j)) { out.push([i, j]); n += best[1]; }
    else n += 1;
  }
  return out.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
}

// retakes.py L209-L240 (alt_hooks): takes of the opening line recorded after the body, tail only.
export function altHooks(toks) {
  const phr = phrases(toks);
  if (!phr.length) return [];
  const first = opening(toks, ...phr[0]), t0 = toks[phr[0][0]].start;
  const hits = [];
  for (const [a, b] of clauses(toks)) {
    if (toks[a].start - t0 <= WINDOW_S) continue;
    if (similarOpenings(first, opening(toks, a, b))) hits.push(a);
    else if (a > 0 && !endsWith(txt(toks[a - 1]), [".", "?", "!", ",", ";", ":"]) && similarOpenings(first, opening(toks, a - 1, b))) hits.push(a - 1);
  }
  const takes = [];
  let e = toks.length;
  for (let h = hits.length - 1; h >= 0; h--) {
    const a = hits[h];
    let cnt = 0;
    for (let i = a; i < e; i++) cnt += nwords(toks[i].text).length;
    if (cnt > ALT_HOOK_MAX_WORDS) break;
    takes.unshift([a, e - 1]);
    e = a;
  }
  return takes;
}

// retakes.py L249-L260 (loose_like): "like" set off as a hesitation; "models like Claude" is not
export function looseLike(toks, i) {
  const prev = i ? toks[i - 1] : null, nxt = i + 1 < toks.length ? toks[i + 1] : null;
  if (!prev || endsWith(txt(prev), [".", "?", "!", ","]) || txt(toks[i]).endsWith(",")) return true;
  if (toks[i].start - prev.end >= 0.3 || (nxt && nxt.start - toks[i].end >= 0.3)) return true;
  return nwords(prev.text).some((w) => LIKE_BEFORE.has(w));
}

export const wordId = (clip, i) => `${clip}:${String(i).padStart(5, "0")}`;

const KIND = {
  retake: { c: 0.7, r: "These words were said again within 40 s: the later take is kept." },
  false_start: { c: 0.8, r: "An unfinished start that is said again or abandoned: the later attempt is kept." },
  meta: { c: 0.85, r: "The speaker is talking to themselves (a restart cue), not to the viewer." },
  hard_filler: { c: 0.9, r: "A hesitation sound (um, uh) that adds nothing." },
  filler: { c: 0.5, r: "A soft filler set off from the sentence; keep it if it is the speaker's voice." },
  alt_hook: { c: 0.6, r: "A later take of the opening line, recorded after the body: set aside as an alternate hook." },
  long_pause: { c: 0.9, r: "A long silence between two words that could be tightened." },
};

// retakes.py L282-L335 (find) -> rasanai.cut.v1 candidates. Candidates only; never decides.
export function findCandidates(wordsIn, { clip = "clip", keepFillers = false, longPauseS = 1.0 } = {}) {
  const toks = wordsIn;
  const phr = phrases(toks);
  const endOf = new Map();
  for (const [a, b] of phr) for (let i = a; i <= b; i++) endOf.set(i, b);
  const raw = [];
  const alts = altHooks(toks);
  const tail = alts.length ? alts[0][0] : toks.length;
  const say = (a, b) => toks.slice(a, b + 1).map(txt).join(" ");
  const add = (kind, a, b, check, extra = {}) => {
    if (kind !== "alt_hook") b = Math.min(b, tail - 1);
    raw.push({ kind, a, b, check, ...extra });
  };

  for (const [i, j] of restarts(toks)) {
    if (j >= tail) continue;
    const gap = toks[j].start - toks[j - 1].end;
    add(j - i <= 4 && gap < 1.0 ? "false_start" : "retake", i, j - 1, true,
      { second: say(j, Math.min(endOf.get(j), j + 25)), keeper: j });
  }
  const restarted = new Set(raw.map((c) => c.a));
  phr.forEach(([a, b], pi) => {
    let cnt = 0;
    for (let i = a; i <= b; i++) cnt += nwords(toks[i].text).length;
    if (restarted.has(a) || pi + 1 >= phr.length || cnt > 8 || a >= tail) return;
    if (endsWith(txt(toks[b]), [".", "?", "!"])) return;
    add("false_start", a, b, true);
  });

  const seq = [];
  toks.forEach((t, i) => { for (const w of nwords(t.text)) seq.push([w, i]); });
  const flat = seq.map(([w]) => w).join(" ");
  const rxs = [[new RegExp(META.source, "g"), "meta"], ...SOFT_FILLERS.map((f) => [new RegExp(`\\b${f}\\b`, "g"), "filler"])];
  for (const [rx, kind] of rxs) {
    for (const m of flat.matchAll(rx)) {
      const w0 = (flat.slice(0, m.index).match(/ /g) || []).length;
      const w1 = w0 + (m[0].match(/ /g) || []).length;
      const a = seq[w0][1], b = seq[w1][1];
      if (a >= tail || (kind === "filler" && (keepFillers || (m[0] === "like" && !looseLike(toks, a))))) continue;
      add(kind, a, b, true);
    }
  }
  alts.forEach(([a, b], n) => add("alt_hook", a, b, false, { hook: n + 1 }));
  for (let i = 0; i < Math.min(tail, toks.length); i++) {
    const ws = nwords(toks[i].text);
    if (ws.length && ws.every((w) => HARD_FILLERS.has(w)) && !keepFillers) add("hard_filler", i, i, false);
  }
  // ours: long_pause between consecutive words
  for (let i = 0; i + 1 < Math.min(tail, toks.length); i++) {
    if (toks[i + 1].start - toks[i].end >= longPauseS) {
      raw.push({ kind: "long_pause", a: i, b: i + 1, check: false, gap: true });
    }
  }

  raw.sort((p, q) => p.a - q.a || p.b - q.b);
  return raw.map((c, n) => {
    const k = KIND[c.kind];
    const o = {
      id: `k${String(n + 1).padStart(3, "0")}`, kind: c.kind,
      from: wordId(clip, c.a), to: wordId(clip, c.b),
      start: c.gap ? toks[c.a].end : toks[c.a].start,
      end: c.gap ? toks[c.b].start : toks[c.b].end,
      text: c.gap ? "" : say(c.a, c.b),
    };
    if (c.second !== undefined) o.second = c.second;
    o.keeper = c.keeper !== undefined ? wordId(clip, c.keeper) : null;
    if (c.hook !== undefined) o.hook = c.hook;
    o.check = c.check;
    o.proposed_action = c.kind === "alt_hook" ? "keep-aside" : c.kind === "long_pause" ? "tighten" : "remove";
    o.confidence = k.c;
    o.reason = k.r;
    return o;
  });
}
