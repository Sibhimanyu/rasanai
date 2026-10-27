// Adapted from cooked. (MIT, Copyright (c) 2026 NextWork), plugins/ai-editor/skills/style-edit/scripts/face.py head_box L42-L48 @3b236ec; ported to Node and modified by RasanAI. Credit: third_party/cooked/.
// (upstream SHA 3b236ec8fe32343cdf38375df90f6cd71e0846d7; faces come from Apple Vision via scripts/vision/vision.swift, in 0..1 fractions, origin top-left)
//
// Head boxes: a face rectangle grown to cover hair, sides and chin, so overlays keep clear of the whole head.
// A face the detector was unsure of, or no detection at all, is "unknown", never "safe": headsDuring says so.
export const HEAD = { HAIR: 0.35, SIDE: 0.2, CHIN: 0.15, STEP_S: 0.5, MIN_CONF: 0.5 };

const r4 = (v) => Math.round(v * 10000) / 10000;
const num = (v) => Number.isFinite(Number(v));

// face {x,y,w,h,conf?} (fractions) -> expanded head box {x,y,w,h,conf}, clamped to the frame
export function headBox(face) {
  if (!face || !num(face.x) || !num(face.y) || !num(face.w) || !num(face.h)) return null;
  const { x, y, w, h } = face;
  const x0 = Math.max(0, x - HEAD.SIDE * w), x1 = Math.min(1, x + w + HEAD.SIDE * w);
  const y0 = Math.max(0, y - HEAD.HAIR * h), y1 = Math.min(1, y + h + HEAD.CHIN * h);
  return { x: r4(x0), y: r4(y0), w: r4(Math.max(0, x1 - x0)), h: r4(Math.max(0, y1 - y0)), conf: num(face.conf) ? r4(face.conf) : null };
}

const union = (boxes) => {
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: r4(x0), y: r4(y0), w: r4(x1 - x0), h: r4(y1 - y0) };
};

// facesDoc = the footage/faces/<clip>.json document. Heads sampled in [t0 - step, t1] are united.
// Returns { x, y, w, h, conf, samples } when at least one face of conf >= MIN_CONF was seen in the window, else
// { unknown: true, reason, [box] }: reason is "no samples" (the window is not covered), "no faces detected" (covered,
// nothing found: not proof of an empty frame) or "low confidence" (box = union of the doubtful heads).
export function headsDuring(facesDoc, t0, t1) {
  const step = (facesDoc && Number(facesDoc.step_s)) || HEAD.STEP_S;
  const list = facesDoc && Array.isArray(facesDoc.heads) ? facesDoc.heads : [];
  const a = Number(t0) - step, b = Number(t1);
  const win = list.filter((s) => num(s.t) && s.t >= a && s.t <= b);
  if (!win.length) return { unknown: true, reason: "no samples" };
  const all = win.flatMap((s) => (Array.isArray(s.boxes) ? s.boxes : [])).filter((bx) => bx && num(bx.x) && num(bx.w));
  const sure = all.filter((bx) => (num(bx.conf) ? bx.conf : 0) >= HEAD.MIN_CONF);
  if (sure.length) return { ...union(sure), conf: r4(Math.min(...sure.map((bx) => bx.conf))), samples: win.length };
  if (all.length) return { unknown: true, reason: "low confidence", box: union(all), samples: win.length };
  return { unknown: true, reason: "no faces detected", samples: win.length };
}

// share of the head's area covered by the box (both {x,y,w,h} fractions): 0..1
export function overlapShare(box, head) {
  if (!box || !head) return 0;
  const ha = head.w * head.h;
  if (!(ha > 0)) return 0;
  const iw = Math.min(box.x + box.w, head.x + head.w) - Math.max(box.x, head.x);
  const ih = Math.min(box.y + box.h, head.y + head.h) - Math.max(box.y, head.y);
  return iw > 0 && ih > 0 ? (iw * ih) / ha : 0;
}
