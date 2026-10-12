// Effect budgets: the hero effects AI video overuses are allowed a few times per film, on the hero, with a reason.
// A ban taught the pipeline that "not on everything" meant "never"; every reference film uses at least one of these
// once, with intent (Kinso: defocus, a halftone burst, an overshooting landing; Sovra: glow, a light comet, blur-in
// words). The tell is UNIFORM use: the same effect on every element or every line. That stays an error.
//
// The score (motion/score.json) carries the budget:
//   "budget": [{ "effect": "glow", "scene": 3, "target": "#send-button", "reason": "the one moment the answer lands" }]
// references/craft.md "Finish and budgets" is the reader-facing version of these rules.
import fs from "node:fs";
import path from "node:path";

// effect id -> words that name it in a score, a card or a selector
export const BUDGET_EFFECTS = {
  glow: /\bglow|bloom|halo\b/i,
  overshoot: /\bovershoot|back\.out|elastic|bounce/i,
  "blur-in": /\bblur[- ]?in\b/i,
  particles: /\bparticles?|sparkle|bokeh|confetti/i,
  "scale-pop": /\bscale[- ]?pop/i,
  "chromatic-split": /\bchromatic|rgb[- ]?split/i,
  "halftone-burst": /\bhalftone/i,
  "light-comet": /\blight[- ]?comet|border[- ]?light/i,
};

// at most this many budgeted uses of one effect per film: 2 under 30 s, 3 from 30 s
export const budgetLimit = (filmSeconds) => (Number(filmSeconds) > 0 && Number(filmSeconds) < 30 ? 2 : 3);

export function effectOf(s) {
  const t = String(s || "");
  if (BUDGET_EFFECTS[t]) return t;
  return Object.keys(BUDGET_EFFECTS).find((k) => BUDGET_EFFECTS[k].test(t)) || null;
}

// read the score's budget entries for a run (or a score object); unknown shapes give []
export function readBudget(runOrScore) {
  let sc = runOrScore;
  if (typeof runOrScore === "string") {
    const f = path.join(runOrScore, "motion", "score.json");
    try { sc = JSON.parse(fs.readFileSync(f, "utf8")); } catch { return []; }
  }
  const b = sc && Array.isArray(sc.budget) ? sc.budget : [];
  return b.filter((e) => e && typeof e === "object").map((e) => ({ ...e, effect: effectOf(e.effect) || String(e.effect || "") }));
}

// problems in the budget itself: unknown effect, no reason, no hero target, over the per-film limit
export function checkBudget(entries, filmSeconds) {
  const P = [], W = [], lim = budgetLimit(filmSeconds), per = {};
  for (const e of entries) {
    if (!BUDGET_EFFECTS[e.effect]) { W.push(`budget: "${e.effect}" is not a budgeted effect (${Object.keys(BUDGET_EFFECTS).join(", ")}); anything else needs no entry`); continue; }
    if (String(e.reason || "").trim().length < 12) P.push(`budget: ${e.effect}${e.scene ? ` in scene ${e.scene}` : ""} needs a reason (12+ characters: why this moment, on this hero)`);
    if (!String(e.target || e.hero || "").trim()) P.push(`budget: ${e.effect}${e.scene ? ` in scene ${e.scene}` : ""} needs a target (the hero element it is on; never "all" or a whole scene)`);
    else if (/^(all|every|\*|body|\.scene|scene)$/i.test(String(e.target || e.hero).trim())) P.push(`budget: ${e.effect} targets "${e.target || e.hero}": a budget is for the hero only, never every element`);
    per[e.effect] = (per[e.effect] || 0) + 1;
  }
  for (const [k, n] of Object.entries(per)) if (n > lim) P.push(`budget: ${k} is used ${n} times; at most ${lim} in a ${Math.round(filmSeconds) || "?"} s film (hero moments only)`);
  return { P, W, limit: lim, per };
}

export const budgetFor = (entries, effect) => entries.filter((e) => e.effect === effect);
