// Safe zones and the phone viewing model: one table of where each destination's platform UI sits over the frame.
// uncalibrated: from public platform guidance (TikTok, Instagram Reels/Stories, YouTube Shorts, LinkedIn/X feed) and the
// EBU title-safe idea; idea from Paldom/storytelling-animation (MIT); our numbers and code; verify against the platforms
// before any check becomes an error.
// Consumers: slop.mjs and lib/textfit.mjs (text, caption and face warnings, cooked plan) and crew.mjs and frame-gate.mjs
// (research plan) import zonesFor, boxInZones and phonePt from here. Nothing else keeps a second copy of these numbers.
// Fractions are of the frame: x and y from the top-left, w and h as sizes. Overlays are rectangles where the platform UI sits.

export const DESTINATIONS = {
  tiktok: {
    aspect: "9:16",
    overlays: [
      { name: "top bar", x: 0, y: 0, w: 1, h: 0.08 },
      { name: "action rail", x: 0.86, y: 0.34, w: 0.14, h: 0.48 },
      { name: "caption", x: 0, y: 0.79, w: 0.86, h: 0.21 },
    ],
    margin: { top: 0.08, right: 0.06, bottom: 0.21, left: 0.06 },
    view: { pt_h: 693, how: "full screen on a 390 x 844 pt phone" },
  },
  "instagram-reels": {
    aspect: "9:16",
    overlays: [
      { name: "top bar", x: 0, y: 0, w: 1, h: 0.11 },
      { name: "action rail", x: 0.87, y: 0.4, w: 0.13, h: 0.42 },
      { name: "caption", x: 0, y: 0.78, w: 0.87, h: 0.22 },
    ],
    margin: { top: 0.11, right: 0.06, bottom: 0.22, left: 0.06 },
    view: { pt_h: 693, how: "full screen on a 390 x 844 pt phone" },
  },
  "youtube-shorts": {
    aspect: "9:16",
    overlays: [
      { name: "top bar", x: 0, y: 0, w: 1, h: 0.09 },
      { name: "action rail", x: 0.85, y: 0.38, w: 0.15, h: 0.44 },
      { name: "caption", x: 0, y: 0.8, w: 0.85, h: 0.2 },
    ],
    margin: { top: 0.09, right: 0.06, bottom: 0.2, left: 0.06 },
    view: { pt_h: 693, how: "full screen on a 390 x 844 pt phone" },
  },
  "instagram-story": {
    aspect: "9:16",
    overlays: [
      { name: "top bar", x: 0, y: 0, w: 1, h: 0.13 },
      { name: "reply bar", x: 0, y: 0.87, w: 1, h: 0.13 },
    ],
    margin: { top: 0.13, right: 0.06, bottom: 0.13, left: 0.06 },
    view: { pt_h: 693, how: "full screen on a 390 x 844 pt phone" },
  },
  feed: {
    aspect: "4:5",
    overlays: [{ name: "caption strip", x: 0, y: 0.88, w: 1, h: 0.12 }],
    margin: { top: 0.05, right: 0.05, bottom: 0.12, left: 0.05 },
    view: { pt_h: 488, how: "in a portrait feed, 390 pt wide" },
  },
  youtube: {
    aspect: "16:9",
    overlays: [{ name: "progress and controls", x: 0, y: 0.86, w: 1, h: 0.14 }],
    margin: { top: 0.06, right: 0.06, bottom: 0.14, left: 0.06 },
    view: { pt_h: 219, how: "in a portrait phone, 390 pt wide" },
  },
  web: {
    aspect: "16:9",
    overlays: [],
    margin: { top: 0.06, right: 0.06, bottom: 0.06, left: 0.06 }, // matches today's text-fit safe area
    view: { pt_h: 390, how: "landscape full screen on a phone" },
  },
};

// vertical = the union of the four 9:16 destinations, computed at load (not typed twice).
{
  const verts = ["tiktok", "instagram-reels", "youtube-shorts", "instagram-story"].map((k) => DESTINATIONS[k]);
  const overlays = [];
  for (const d of verts) for (const o of d.overlays) {
    if (!overlays.some((p) => p.name === o.name && p.x === o.x && p.y === o.y && p.w === o.w && p.h === o.h)) overlays.push({ ...o });
  }
  const margin = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const d of verts) for (const side of Object.keys(margin)) margin[side] = Math.max(margin[side], d.margin[side]);
  DESTINATIONS.vertical = { aspect: "9:16", overlays, margin, view: { pt_h: 693, how: "full screen on a 390 x 844 pt phone" } };
}

export const ALIASES = {
  reels: "instagram-reels", ig: "instagram-reels", story: "instagram-story", stories: "instagram-story", tiktok: "tiktok",
  shorts: "youtube-shorts", youtube: "youtube", website: "web", desktop: "web", linkedin: "feed", x: "feed", twitter: "feed",
  instagram: "feed", feed: "feed", vertical: "vertical", portrait: "vertical", landscape: "web", square: "feed",
};

// The smallest comfortable text on a phone (Apple HIG minimum text size).
export const PHONE_MIN_PT = 11;

// Resolve a destination name (id or alias, any case) or, failing that, an aspect ("9:16", "4:5", "1:1", "16:9").
// An unknown destination falls back by aspect: 9:16 -> "vertical", 4:5 or 1:1 -> "feed", anything else -> "web".
export function destinationOf({ destination = null, aspect = null } = {}) {
  const key = destination == null ? "" : String(destination).trim().toLowerCase();
  if (DESTINATIONS[key]) return key;
  if (ALIASES[key]) return ALIASES[key];
  const a = aspect == null ? "" : String(aspect).trim();
  if (a === "9:16") return "vertical";
  if (a === "4:5" || a === "1:1") return "feed";
  return "web";
}

// -> a copy of the destination's zones: { id, aspect, overlays[], margin, view }. Never null.
// The optional aspect lets feed return its 1:1 view (390 pt) instead of the 4:5 one (488 pt).
export function zonesFor(dest, aspect = null) {
  const id = DESTINATIONS[dest] ? dest : destinationOf({ destination: dest, aspect });
  const d = DESTINATIONS[id];
  const copy = {
    id,
    aspect: d.aspect,
    overlays: d.overlays.map((o) => ({ ...o })),
    margin: { ...d.margin },
    view: { ...d.view },
  };
  if (id === "feed" && String(aspect).trim() === "1:1") {
    copy.aspect = "1:1";
    copy.view = { pt_h: 390, how: "in a portrait feed, 390 pt wide" };
  }
  return copy;
}

// box = {x, y, w, h} fractions of the frame. -> [{zone, share}] for each overlay covering >= minShare of the box's area,
// then {zone: "margin", share} when any part of the box lies in the margin. share = covered part of the box's area (0..1).
export function boxInZones(box, zones, { minShare = 0.2 } = {}) {
  const area = box && box.w > 0 && box.h > 0 ? box.w * box.h : 0;
  if (!area || !zones) return [];
  const bx2 = box.x + box.w;
  const by2 = box.y + box.h;
  const cover = (x, y, w, h) => {
    const iw = Math.max(0, Math.min(bx2, x + w) - Math.max(box.x, x));
    const ih = Math.max(0, Math.min(by2, y + h) - Math.max(box.y, y));
    return (iw * ih) / area;
  };
  const out = [];
  for (const o of zones.overlays || []) {
    const share = cover(o.x, o.y, o.w, o.h);
    if (share >= minShare) out.push({ zone: o.name, share: Math.round(share * 1000) / 1000 });
  }
  const m = zones.margin || { top: 0, right: 0, bottom: 0, left: 0 };
  const inner = cover(m.left, m.top, 1 - m.left - m.right, 1 - m.top - m.bottom);
  const inMargin = 1 - inner;
  if (inMargin > 0) out.push({ zone: "margin", share: Math.round(inMargin * 1000) / 1000 });
  return out;
}

// A height given as a fraction of the frame height -> points on the phone: frac * the destination's view.pt_h.
export function phonePt(fracOfFrameH, dest, aspect = null) {
  return fracOfFrameH * zonesFor(dest, aspect).view.pt_h;
}
