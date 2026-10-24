// Textual helpers for editing one data-el element in a scene HTML file. No DOM, no deps: find the open tag, its matching
// close tag, and replace exactly one thing. Every function throws Error(message) when the match is not unique or not simple.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

// -> [{start, openEnd, tag, open}] for every element whose data-el equals id
export function findOpenTags(src, id) {
  const re = new RegExp(`<([A-Za-z][\\w:-]*)\\b([^<>]*?\\sdata-el\\s*=\\s*(?:"${esc(id)}"|'${esc(id)}')[^<>]*?)(/?)>`, "g");
  const out = [];
  let m;
  while ((m = re.exec(src))) out.push({ start: m.index, openEnd: m.index + m[0].length, tag: m[1].toLowerCase(), open: m[0], selfClosing: !!m[3] });
  return out;
}
export function locate(src, id) {
  const hits = findOpenTags(src, id);
  if (hits.length !== 1) throw new Error(`expected exactly one data-el="${id}", found ${hits.length}`);
  const h = hits[0];
  if (VOID.has(h.tag) || h.selfClosing) return { ...h, innerStart: h.openEnd, innerEnd: h.openEnd, end: h.openEnd };
  const re = new RegExp(`<(/?)${esc(h.tag)}\\b[^<>]*?(/?)>`, "gi");
  re.lastIndex = h.openEnd;
  let depth = 1, m;
  while ((m = re.exec(src))) {
    if (m[2]) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return { ...h, innerStart: h.openEnd, innerEnd: m.index, end: m.index + m[0].length };
  }
  throw new Error(`no closing </${h.tag}> for data-el="${id}"`);
}
export const innerOf = (src, loc) => src.slice(loc.innerStart, loc.innerEnd);
const escText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function setText(src, id, text) {
  const loc = locate(src, id);
  const inner = innerOf(src, loc);
  if (/<[A-Za-z!/]/.test(inner)) throw new Error(`data-el="${id}" has child elements: not a simple text change`);
  return src.slice(0, loc.innerStart) + escText(String(text)) + src.slice(loc.innerEnd);
}

// set a token already present on the open tag: data-x="1" or style="--x: 1" (css custom property). Never adds one.
export function setToken(src, id, name, value) {
  const loc = locate(src, id);
  if (/[<>"'`;]/.test(String(value)) || /url\s*\(|javascript:|expression\s*\(/i.test(String(value))) throw new Error(`unsafe value for ${name}`);
  let open = loc.open, n = 0;
  if (name.startsWith("--")) {
    open = open.replace(new RegExp(`(${esc(name)}\\s*:\\s*)([^;"']*)`, "g"), (_m, a) => (n++, `${a}${value}`));
  } else {
    open = open.replace(new RegExp(`(\\s${esc(name)}\\s*=\\s*)(["'])([^"']*)\\2`, "g"), (_m, a, q) => (n++, `${a}${q}${value}${q}`));
  }
  if (n !== 1) throw new Error(`token ${name} must appear exactly once on data-el="${id}" (found ${n})`);
  return src.slice(0, loc.start) + open + src.slice(loc.openEnd);
}
export function getAttr(open, name) {
  const m = new RegExp(`\\s${esc(name)}\\s*=\\s*(["'])([^"']*)\\1`).exec(open);
  return m ? m[2] : null;
}
// the first element carrying data-start and data-duration: the scene's own clip root
export function sceneRoot(src) {
  const re = /<([A-Za-z][\w:-]*)\b[^<>]*>/g;
  let m;
  while ((m = re.exec(src))) {
    const s = getAttr(m[0], "data-start"), d = getAttr(m[0], "data-duration");
    if (s !== null && d !== null) return { start: Number(s), duration: Number(d), index: m.index };
  }
  return null;
}
export function visibleText(src) {
  return src.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
