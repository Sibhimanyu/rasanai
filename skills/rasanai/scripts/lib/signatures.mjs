// Tween classification and banned-pattern signatures, shared by obey.mjs (built
// compositions) and board.mjs (approved keyframes), so both judge motion the same way.
// Contract: references/motion-md-contract.md.
import { parseEase } from "./common.mjs";

export const num = (v) => (v === undefined || v === null || v === "" ? null : parseFloat(v));
export const blurOf = (f) => {
  const m = String(f || "").match(/blur\(([\d.]+)px\)/);
  return m ? parseFloat(m[1]) : 0;
};
export const insetMax = (c) => {
  const m = String(c || "").match(/inset\(([^)]*)\)/);
  if (!m) return 0;
  return Math.max(...m[1].split(/\s+/).map((x) => parseFloat(x) || 0));
};

export function classify(t) {
  if (!t.isEl) return "exempt";
  if (t.dur === 0) return "exempt";
  if (t.camera) return "camera";
  if (t.keys.some((k) => ["innerText", "textContent", "innerHTML", "value"].includes(k))) return "exempt";
  const f = t.from, o = t.to;
  const op0 = num(f.opacity ?? f.autoAlpha), op1 = num(o.opacity ?? o.autoAlpha);
  // uniform scale only: a scaleX-only (or scaleY-only) growth is a line draw, not a pop
  const uni = (v) => (v.scale !== undefined ? v.scale : v.scaleX !== undefined && v.scaleY !== undefined ? Math.min(num(v.scaleX), num(v.scaleY)) : undefined);
  const sc0 = num(uni(f)), sc1 = num(uni(o));

  if (op0 !== null && op1 !== null && op0 <= 0.2 && op1 >= 0.8) return "enter";
  if (op0 !== null && op1 !== null && op0 >= 0.8 && op1 <= 0.2) return "exit";
  if (sc0 !== null && sc1 !== null && sc0 <= 0.8 && sc1 >= 0.95) return "enter";
  if (sc0 !== null && sc1 !== null && sc0 >= 0.95 && sc1 <= 0.2) return "exit";
  // single-axis draw (a rule drawing out, letters growing from a baseline)
  for (const k of ["scaleX", "scaleY"]) {
    const a = num(f[k]), b = num(o[k]);
    if (a !== null && b !== null && a <= 0.05 && b >= 0.95) return "enter";
    if (a !== null && b !== null && a >= 0.95 && b <= 0.05) return "exit";
  }
  for (const k of ["yPercent", "xPercent"]) {
    const a = num(f[k]), b = num(o[k]);
    if (a !== null && b !== null && Math.abs(a) >= 80 && Math.abs(b) <= 5) return "enter";
    if (a !== null && b !== null && Math.abs(a) <= 5 && Math.abs(b) >= 80) return "exit";
  }
  if (f.clipPath !== undefined && o.clipPath !== undefined) {
    const a = insetMax(f.clipPath), b = insetMax(o.clipPath);
    if (a >= 45 && b <= 5) return "enter";
    if (a <= 5 && b >= 45) return "exit";
  }
  if (blurOf(f.filter) > 2 && blurOf(o.filter) <= 0.5) return "enter";
  if (blurOf(f.filter) <= 0.5 && blurOf(o.filter) > 2) return "exit";
  return "move";
}

export const SIGNATURES = {
  "fade-up-slide": (t) => {
    const op0 = num(t.from.opacity ?? t.from.autoAlpha), op1 = num(t.to.opacity ?? t.to.autoAlpha);
    const y0 = num(t.from.y), y1 = num(t.to.y), yp0 = num(t.from.yPercent), yp1 = num(t.to.yPercent);
    const rise = op0 !== null && op1 !== null && op0 <= 0.2 && op1 >= 0.8;
    const up = (y0 !== null && y1 !== null && y0 > 4 && Math.abs(y1) <= 2) || (yp0 !== null && yp1 !== null && yp0 > 4 && Math.abs(yp1) <= 2);
    return rise && up;
  },
  "fade-slide": (t) => {
    const op0 = num(t.from.opacity ?? t.from.autoAlpha), op1 = num(t.to.opacity ?? t.to.autoAlpha);
    if (!(op0 !== null && op1 !== null && op0 <= 0.2 && op1 >= 0.8)) return false;
    return ["x", "y", "xPercent", "yPercent"].some((k) => num(t.from[k]) !== null && num(t.to[k]) !== null && Math.abs(num(t.from[k]) - num(t.to[k])) > 4);
  },
  "linear-entrance": (t, cls) => cls === "enter" && parseEase(t.ease).family === "none",
  bounce: (t) => ["bounce", "elastic"].includes(parseEase(t.ease).family),
  overshoot: (t) => parseEase(t.ease).family === "back",
  "blur-in": (t, cls) => cls === "enter" && blurOf(t.from.filter) > 2,
  "scale-pop": (t, cls) => {
    const uni = (v) => (v.scale !== undefined ? v.scale : v.scaleX !== undefined && v.scaleY !== undefined ? Math.min(num(v.scaleX), num(v.scaleY)) : undefined);
    const a = num(uni(t.from)), b = num(uni(t.to));
    return cls === "enter" && a !== null && b !== null && a < 0.8 && b >= 0.95;
  },
  "opacity-only-entrance": (t, cls) => cls === "enter" && t.keys.length > 0 && t.keys.every((k) => ["opacity", "autoAlpha"].includes(k)),
};


// banned names this tween matches (fade-up-slide is the specific case of fade-slide; report it once)
export function bannedHits(t, cls, banned) {
  return banned.filter((b) => {
    if (!SIGNATURES[b]) return false;
    if (b === "fade-slide" && banned.includes("fade-up-slide") && SIGNATURES["fade-up-slide"](t, cls)) return false;
    return SIGNATURES[b](t, cls);
  });
}
