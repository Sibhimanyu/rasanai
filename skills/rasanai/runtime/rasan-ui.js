// Adapted in part from motionmaxxing (Apache-2.0, Tejas Makwana), runtime/native-ui. Modified.
/* RasanUI: a native-UI rebuild kit for HyperFrames compositions. Launch films show the REAL product, redrawn for video:
 * this kit draws product primitives (window, sidebar, header, list rows, table, tabs, button, input, toggle, chip, avatar,
 * notification, message) from the film's captured brand tokens, a cursor with press physics on its own top layer, typing
 * that only happens inside a real input field, and readability helpers with a check that warns.
 *
 * One clock: every state (cursor, press, target reaction, typing, caret, toggles, the world pose) is a PURE function of the
 * scene's timeline time T. The kit adds one linear "clock" tween to the paused timeline you pass in (the same device as
 * the camera kit); its setter reads tl.time() and redraws every channel. Seek anywhere, in any order, any number of times: the
 * DOM is the same. No Math.random (jitter is a seeded hash), no wall clock, no rAF, no setTimeout.
 *
 *   <script src="../../assets/rasan-ui/rasan-ui.js"></script>          (after GSAP; relative to the composition)
 *   var tl = gsap.timeline({ paused: true });
 *   var U = RasanUI.kit(tl, { tokens: BRAND, W: 1920, H: 1080, seed: "film/04" });   // BRAND = brand.mjs / design-system tokens
 *   var app = U.mount("#world", { name: "Orders", captured: true, source: "research/screens.json#orders", w: 1180, h: 720, fillW: 0.62 });
 *   U.sidebar(app, { brand: { name: "Kinso" }, items: [{ icon: "inbox", label: "Orders", active: true, count: 12 }, ...] });
 *   var main = U.main(app);
 *   U.header(main, { title: "Orders", sub: "Fulfilment", actions: [{ label: "Export" }] });
 *   var q = U.input(main, { label: "Search orders", placeholder: "Search by name or order number" });
 *   var go = U.button(main, { label: "Create order", kind: "primary" });
 *   var cur = U.cursor({ at: 0.3, from: { x: 1500, y: 900 } });
 *   var a = cur.click(q, { at: 1.2 });                      // moves in, parks, presses (cursor 2 f down, 3 f up; target reacts 0-1 f later)
 *   var t = U.type(q, "Priya Raman", { at: a.end + 0.1 });  // throws unless q is a real input field
 *   cur.click(go, { at: t.end + 0.5 });
 *   U.hero(app); U.read(q);                                  // what the proof is about
 *   U.finish();                                              // LAST: registers the clock
 *   U.check({ at: [1.0, 2.5] })  -> { ok, warnings: [{rule, message}], stats }
 *
 *   // 1.1.0: U.drag(card, target, { at }) the drag-and-drop reaction stack; U.scroll(col, { at, distance }) an accelerating dense scroll;
 *   //        U.shimmer(statusEl, { at }) status words then two shimmer passes; U.terminal(parent, { lines: [{ cmd }, { out }, { pill }] }).
 *
 * Reference: references/ui-rebuild.md (recipes, numbers, the rules the check enforces).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root);
  else root.RasanUI = factory(root);
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";
  var VERSION = "1.1.0";
  var NS = "http://www.w3.org/2000/svg";

  // ------------------------------------------------------------------ helpers
  function need(c, m) { if (!c) throw new Error("RasanUI: " + m); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function opt(o, k, d) { return o && o[k] !== undefined && o[k] !== null ? o[k] : d; }
  function hash(n, seed) { // stateless, seeded: same inputs, same number, any order
    var h = Math.imul((n | 0) + 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((seed | 0) + 1, 0x27D4EB2F);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  function seedOf(s) { var h = 2166136261; s = String(s == null ? "rasan-ui" : s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }
  function el(parent, tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function one(x) {
    if (typeof x === "string") { var e = document.querySelector(x); need(e, 'no element for "' + x + '"'); return e; }
    need(x && x.nodeType === 1, "expected an element or a selector");
    return x;
  }

  // ------------------------------------------------------------------ copy guards (the slop tells)
  var GREETING = /^\s*(good\s+(morning|afternoon|evening|day)|welcome\s+back|hello|hi\s+there|hey\s+there|hi,)/i;
  var PLACEHOLDERY = /lorem ipsum|john doe|jane doe|\bacme\b|your (brand|company|name) here|project alpha|\bfoo bar\b/i;
  function copy(s, where) {
    s = s == null ? "" : String(s);
    need(!GREETING.test(s), where + ': "' + s + '" is a greeting header (a "Good morning" header is a vibe-coded tell). Use the product\'s real title.');
    need(!PLACEHOLDERY.test(s), where + ': "' + s + '" is placeholder copy. Take the words from the capture (research/screens.json).');
    return s;
  }
  function req(v, what, fn) { need(v != null && v !== "", fn + ": " + what + " is required (a UI without identity is the vibe-coded card)"); return v; }

  // ------------------------------------------------------------------ colour (tokens in, derived neutrals out)
  function hex(c) {
    c = String(c || "").trim();
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if (!m) return null;
    var h = m[1]; if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function toHex(rgb) { return "#" + rgb.map(function (v) { v = clamp(Math.round(v), 0, 255); return (v < 16 ? "0" : "") + v.toString(16); }).join(""); }
  function mix(a, b, t) { var A = hex(a), B = hex(b); return toHex([0, 1, 2].map(function (i) { return A[i] + (B[i] - A[i]) * t; })); }
  function lum(c) {
    var v = hex(c).map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

  // ------------------------------------------------------------------ tokens
  // Accepts the shapes RasanAI already produces: { colors: { canvas, ink, accent, surface?, muted?, border? } } (design-system / frame.md),
  // { roles: {...}, fonts: { display: {family}, ... }, radii: {...} } (brand.mjs read), or the same with plain hex strings.
  // canvas, ink and accent are required: there is no zinc fallback. surface / muted / border are DERIVED from canvas and ink when absent.
  function tokens(raw) {
    need(raw && typeof raw === "object", "tokens: pass the film's captured brand tokens (brand.mjs read / design-system), not nothing");
    var c = raw.colors && !Array.isArray(raw.colors) ? raw.colors : raw.roles || {};
    var defaulted = [];
    ["canvas", "ink", "accent"].forEach(function (k) { need(hex(c[k]), "tokens: colors." + k + " must be a hex colour from the film's brand (got " + JSON.stringify(c[k]) + ")"); });
    var T = { colors: { canvas: toHex(hex(c.canvas)), ink: toHex(hex(c.ink)), accent: toHex(hex(c.accent)) } };
    ["surface", "muted", "border"].forEach(function (k) { if (hex(c[k])) T.colors[k] = toHex(hex(c[k])); });
    if (!T.colors.surface) T.colors.surface = mix(T.colors.canvas, T.colors.ink, 0.05);
    if (!T.colors.muted) T.colors.muted = mix(T.colors.canvas, T.colors.ink, 0.55);
    if (!T.colors.border) T.colors.border = mix(T.colors.canvas, T.colors.ink, 0.13);
    T.colors.onAccent = contrast(T.colors.accent, T.colors.canvas) >= contrast(T.colors.accent, T.colors.ink) ? T.colors.canvas : T.colors.ink;
    T.colors.hover = mix(T.colors.surface, T.colors.ink, 0.06);
    T.dark = lum(T.colors.canvas) < 0.35;
    function fam(f) { return typeof f === "string" ? f : f && f.family ? f.family : null; }
    var f = raw.fonts || {};
    var arr = Array.isArray(f) ? f : null;
    T.fonts = {
      display: fam(arr ? arr[0] : f.display) || null,
      body: fam(arr ? arr[1] || arr[0] : f.body || f.display) || null,
      mono: fam(arr ? null : f.mono) || null,
    };
    if (!T.fonts.body) { defaulted.push("fonts"); T.fonts.body = "system-ui"; }
    if (!T.fonts.display) T.fonts.display = T.fonts.body;
    if (!T.fonts.mono) T.fonts.mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
    var r = raw.radii || raw.rounded || {};
    function num(v) { if (typeof v === "string") v = parseFloat(v); return typeof v === "number" && isFinite(v) ? v : null; }
    var md = num(r.md != null ? r.md : r.lg != null ? r.lg : r.sm != null ? r.sm : r.base);
    if (md == null) { defaulted.push("radii"); md = 8; }
    var sm = num(r.sm); if (sm == null) sm = Math.round(md * 0.6);
    var lg = num(r.lg); if (lg == null) lg = Math.round(md * 1.5);
    T.radii = { sm: sm, md: md, lg: lg, pill: 999 };
    var sp = num(raw.spacing && (raw.spacing.base || raw.spacing.unit) || raw.space);
    if (sp == null) { if (!raw.spacing) defaulted.push("spacing"); sp = 4; }
    T.space = sp;
    T.shadow = typeof raw.shadow === "string" ? raw.shadow : raw.shadows && raw.shadows[0] ? (raw.shadows[0].value || raw.shadows[0]) : "none";
    T.defaulted = defaulted;
    return T;
  }

  // ------------------------------------------------------------------ eases (pure, no GSAP needed)
  var EASE = {
    linear: function (p) { return p; },
    // front-loaded: ~85% of a travel is done in the first ~55% of its time, then a long creep onto the target
    snapSettle: function (p) { return 1 - Math.pow(1 - p, 3.4); },
    glide: function (p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; },
    out: function (p) { return 1 - Math.pow(1 - p, 3); },
    inout: function (p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; },
    accel: function (p) { return p * p * p; },
  };
  var RATES = { recognise: 82, read: 22, author: 36, fill: 70 }; // glyphs per second: "a person typed a command" / "read the content" / "watch a human author" / "a field fills fast"
  function ease(n) { return typeof n === "function" ? n : EASE[n] || EASE.glide; }

  // ------------------------------------------------------------------ base CSS (every colour, radius, font and space is a token variable)
  var CSS = [
    ".ru{position:absolute;left:0;top:0;display:flex;overflow:hidden;box-sizing:border-box;background:var(--ru-canvas);color:var(--ru-ink);font-family:var(--ru-body),system-ui,sans-serif;font-size:15px;line-height:1.35;border-radius:var(--ru-r-lg);transform-origin:0 0;-webkit-font-smoothing:antialiased}",
    ".ru *{box-sizing:border-box}",
    ".ru-side{flex:0 0 230px;display:flex;flex-direction:column;gap:calc(var(--ru-u)*2);padding:calc(var(--ru-u)*5) calc(var(--ru-u)*3);background:var(--ru-surface);border-right:1px solid var(--ru-border)}",
    ".ru-brand{display:flex;align-items:center;gap:calc(var(--ru-u)*2.5);padding:0 calc(var(--ru-u)*2) calc(var(--ru-u)*3);font-family:var(--ru-display),var(--ru-body),sans-serif;font-weight:700;font-size:18px}",
    ".ru-logo{width:28px;height:28px;border-radius:var(--ru-r-sm);background:var(--ru-accent);color:var(--ru-on-accent);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;overflow:hidden}.ru-logo img,.ru-logo svg{width:100%;height:100%;display:block}",
    ".ru-nav{display:flex;align-items:center;gap:calc(var(--ru-u)*3);padding:calc(var(--ru-u)*2.5) calc(var(--ru-u)*3);border-radius:var(--ru-r-md);color:var(--ru-muted);font-weight:500}",
    ".ru-nav svg{width:18px;height:18px;flex:none}.ru-nav .ru-count{margin-left:auto;font-size:12px;color:var(--ru-muted)}",
    ".ru-nav[data-active]{background:var(--ru-hover);color:var(--ru-ink)}",
    ".ru-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:calc(var(--ru-u)*5);padding:calc(var(--ru-u)*7) calc(var(--ru-u)*8)}",
    ".ru-head{display:flex;align-items:flex-end;gap:calc(var(--ru-u)*4)}.ru-head>div:first-child{flex:1;min-width:0}",
    ".ru-title{font-family:var(--ru-display),var(--ru-body),sans-serif;font-weight:700;font-size:30px;line-height:1.1;letter-spacing:-.01em}",
    ".ru-sub{color:var(--ru-muted);font-size:14px;margin-top:3px}.ru-actions{display:flex;gap:calc(var(--ru-u)*2)}",
    ".ru-btn{display:inline-flex;align-items:center;justify-content:center;gap:calc(var(--ru-u)*2);height:40px;padding:0 calc(var(--ru-u)*5);border-radius:var(--ru-r-md);font:600 15px/1 var(--ru-body),system-ui,sans-serif;white-space:nowrap;border:1px solid var(--ru-border);background:var(--ru-surface);color:var(--ru-ink);transform-origin:50% 50%}",
    ".ru-btn[data-kind=primary]{background:var(--ru-accent);border-color:var(--ru-accent);color:var(--ru-on-accent)}",
    ".ru-btn[data-kind=ghost]{background:transparent;border-color:transparent;color:var(--ru-muted)}.ru-btn svg{width:16px;height:16px}",
    ".ru-btn[data-state=pressed]{filter:brightness(.92)}.ru-btn[data-state=done]{background:var(--ru-ink);border-color:var(--ru-ink);color:var(--ru-canvas)}",
    ".ru-field{display:flex;flex-direction:column;gap:6px}.ru-label{font-size:13px;font-weight:600;color:var(--ru-muted)}",
    ".ru-input{position:relative;display:flex;align-items:center;height:46px;padding:0 calc(var(--ru-u)*4);border-radius:var(--ru-r-md);background:var(--ru-canvas);border:1px solid var(--ru-border);font-size:16px;white-space:pre;overflow:hidden;transform-origin:50% 50%}",
    ".ru-input[data-focus]{border-color:var(--ru-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--ru-accent) 22%,transparent)}",
    ".ru-ph{color:var(--ru-muted)}.ru-ph[data-hidden]{display:none}.ru-caret{display:none;width:2px;height:1.2em;margin-left:1px;background:var(--ru-accent)}.ru-input[data-caret] .ru-caret{display:inline-block}",
    ".ru-list{display:flex;flex-direction:column;border:1px solid var(--ru-border);border-radius:var(--ru-r-lg);overflow:hidden}",
    ".ru-row{display:flex;align-items:center;gap:calc(var(--ru-u)*4);padding:calc(var(--ru-u)*3.5) calc(var(--ru-u)*4);border-top:1px solid var(--ru-border);transform-origin:50% 50%}.ru-row:first-child{border-top:0}",
    ".ru-row[data-state=active]{background:var(--ru-hover)}.ru-rmain{flex:1;min-width:0}.ru-rtitle{font-weight:600}.ru-rsub{color:var(--ru-muted);font-size:13px;margin-top:1px}.ru-rval{font-variant-numeric:tabular-nums;font-weight:600}",
    ".ru-av{width:36px;height:36px;border-radius:var(--ru-r-pill);background:var(--ru-av,var(--ru-hover));color:var(--ru-ink);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex:none;overflow:hidden}.ru-av img{width:100%;height:100%;object-fit:cover}",
    ".ru-ico{width:36px;height:36px;border-radius:var(--ru-r-md);background:var(--ru-hover);color:var(--ru-ink);display:flex;align-items:center;justify-content:center;flex:none;overflow:hidden}.ru-ico svg{width:20px;height:20px}",
    ".ru-chip{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:var(--ru-r-pill);background:var(--ru-hover);color:var(--ru-ink);font-size:12px;font-weight:600}.ru-chip[data-tone=accent]{background:color-mix(in srgb,var(--ru-accent) 16%,transparent);color:var(--ru-ink)}",
    ".ru-table{width:100%;border-collapse:collapse;border:1px solid var(--ru-border);border-radius:var(--ru-r-lg);overflow:hidden}.ru-table th{text-align:left;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--ru-muted);padding:10px 16px;background:var(--ru-surface)}.ru-table td{padding:13px 16px;border-top:1px solid var(--ru-border)}.ru-table td[data-num]{text-align:right;font-variant-numeric:tabular-nums}",
    ".ru-tabs{display:flex;gap:calc(var(--ru-u)*6);border-bottom:1px solid var(--ru-border)}.ru-tab{padding:0 0 10px;color:var(--ru-muted);font-weight:600;border-bottom:2px solid transparent;margin-bottom:-1px}.ru-tab[data-active]{color:var(--ru-ink);border-bottom-color:var(--ru-accent)}",
    ".ru-toggle{display:inline-block;width:46px;height:28px;border-radius:var(--ru-r-pill);background:var(--ru-border);position:relative;flex:none;transform-origin:50% 50%}.ru-toggle::after{content:'';position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:var(--ru-canvas)}.ru-toggle[data-on]{background:var(--ru-accent)}.ru-toggle[data-on]::after{left:21px}",
    ".ru-panel{display:flex;flex-direction:column;gap:calc(var(--ru-u)*3)}.ru-ptitle{font-weight:700;font-size:17px}",
    ".ru-notif{display:flex;gap:calc(var(--ru-u)*3.5);align-items:flex-start;padding:calc(var(--ru-u)*3.5);border-radius:var(--ru-r-lg);background:var(--ru-surface);border:1px solid var(--ru-border);box-shadow:var(--ru-shadow)}.ru-ntop{display:flex;gap:8px;align-items:baseline}.ru-ntitle{font-weight:700}.ru-ntime{margin-left:auto;color:var(--ru-muted);font-size:12px}.ru-nbody{margin-top:2px}",
    ".ru-msg{display:flex;flex-direction:column;gap:3px;max-width:78%}.ru-msg[data-mine]{align-self:flex-end;align-items:flex-end}.ru-from{font-size:12px;font-weight:600;color:var(--ru-muted)}.ru-bubble{padding:10px 14px;border-radius:var(--ru-r-lg);background:var(--ru-hover)}.ru-msg[data-mine] .ru-bubble{background:var(--ru-accent);color:var(--ru-on-accent)}",
    ".ru-term{display:flex;flex-direction:column;gap:6px;padding:calc(var(--ru-u)*5) calc(var(--ru-u)*6);border-radius:var(--ru-r-lg);background:var(--ru-ink);color:var(--ru-canvas);font-family:var(--ru-mono);font-size:17px;line-height:1.5;white-space:pre;overflow:hidden;position:relative}",
    ".ru-tline{min-height:1.5em}.ru-tline[data-kind=out]{opacity:.72}.ru-tprompt{color:var(--ru-accent);margin-right:1ch}.ru-tpill{display:inline-block;padding:0 10px;border-radius:var(--ru-r-pill);background:var(--ru-accent);color:var(--ru-on-accent);font-size:14px;font-weight:700;line-height:24px}.ru-tcaret{display:inline-block;width:.6em;height:1.15em;vertical-align:text-bottom;background:var(--ru-accent);margin-left:1px}",
    ".ru-shim{position:absolute;pointer-events:none;white-space:pre}",
    ".ru-cursor-layer{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2147483000;overflow:visible}",
    ".ru-cursor{position:absolute;left:0;top:0;transform-origin:0 0;opacity:0;will-change:transform}.ru-cursor svg{display:block;overflow:visible}",
  ].join("\n");
  function injectCSS() {
    if (typeof document === "undefined" || document.getElementById("rasan-ui-css")) return;
    var s = document.createElement("style"); s.id = "rasan-ui-css"; s.textContent = CSS; (document.head || document.documentElement).appendChild(s);
  }

  // a few drawn glyphs (stroke icons); pass your own <svg> html or a letter for real product icons
  var GLYPH = {
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.2-4.2"/>', plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', bell: '<path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15zM10 20a2 2 0 004 0"/>', inbox: '<path d="M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>', list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>', chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>', send: '<path d="M4 12l16-8-6 16-2-7z"/>',
  };
  function glyph(name) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (GLYPH[name] || GLYPH.list) + "</svg>"; }
  function iconNode(parent, cls, icon, fallback) {
    var d = el(parent, "div", cls);
    if (icon && /^\s*</.test(icon)) d.innerHTML = icon;
    else if (icon && GLYPH[icon]) d.innerHTML = glyph(icon);
    else if (icon && /\.(png|jpe?g|svg|webp)(\?|$)/i.test(icon)) { var i = el(d, "img"); i.src = icon; i.alt = ""; }
    else d.textContent = String(icon || fallback || "?").slice(0, 2);
    return d;
  }

  // ------------------------------------------------------------------ the kit
  function kit(tl, o) {
    o = o || {};
    need(tl && typeof tl.fromTo === "function", "kit(tl, opts): pass the scene's paused GSAP timeline (the clock is a tween on it)");
    injectCSS();
    var T = tokens(o.tokens);
    var stage = o.stage ? one(o.stage) : document.querySelector("[data-composition-id]") || document.body;
    var W = o.W || parseFloat(stage.getAttribute("data-width")) || stage.clientWidth || 1920;
    var H = o.H || parseFloat(stage.getAttribute("data-height")) || stage.clientHeight || 1080;
    var fps = o.fps || 30, F = 1 / fps, seed = seedOf(o.seed);
    var channels = [], endT = 0, finished = false, presses = [], nCursor = 0, heroEl = null, tw = null;
    var cursors = [], worldRef = null;
    function fr(t) { return Math.round(t * fps) / fps; }
    function bump(t) { if (t > endT) endT = t; }
    function chan(fn, end) { channels.push(fn); if (end != null) bump(end); }
    function render(t) { for (var i = 0; i < channels.length; i++) channels[i](t); }

    // ---------------- surfaces
    function mount(parent, m) {
      m = m || {};
      parent = one(parent);
      var d = el(parent, "div", "ru");
      var c = T.colors, pxw = m.w || 1180, pxh = m.h || 720;
      var v = {
        "--ru-canvas": c.canvas, "--ru-ink": c.ink, "--ru-accent": c.accent, "--ru-on-accent": c.onAccent, "--ru-surface": c.surface, "--ru-muted": c.muted, "--ru-border": c.border, "--ru-hover": c.hover,
        "--ru-display": '"' + T.fonts.display + '"', "--ru-body": '"' + T.fonts.body + '"', "--ru-mono": T.fonts.mono,
        "--ru-r-sm": T.radii.sm + "px", "--ru-r-md": T.radii.md + "px", "--ru-r-lg": T.radii.lg + "px", "--ru-r-pill": "999px", "--ru-u": T.space + "px", "--ru-shadow": T.shadow,
      };
      for (var k in v) d.style.setProperty(k, v[k]);
      d.style.width = pxw + "px"; d.style.height = pxh + "px";
      d.style.left = (m.x || 0) + "px"; d.style.top = (m.y || 0) + "px";
      // marker: faithful rebuilds of a captured product screen are exempt from the generic-UI slop lint (slop.mjs keys on data-ui="captured")
      if (m.captured) {
        need(m.source, 'mount: captured:true needs source (where the screen came from, e.g. "research/screens.json#orders"): a rebuild with no capture behind it is invented UI');
        d.setAttribute("data-ui", "captured"); d.setAttribute("data-ui-source", String(m.source));
      } else d.setAttribute("data-ui", "invented");
      if (m.name) d.setAttribute("data-ui-product", copy(m.name, "mount name"));
      var s = m.scale != null ? m.scale : m.fillW != null ? (m.fillW * W) / pxw : 1;
      d.style.transform = "scale(" + r3(s) + ")";
      d.setAttribute("data-ru-scale", String(r3(s)));
      return d;
    }
    function main(app) { return el(one(app), "div", "ru-main"); }
    function sidebar(app, s) {
      s = s || {};
      var d = el(one(app), "div", "ru-side");
      if (s.brand) { var b = el(d, "div", "ru-brand"); iconNode(b, "ru-logo", s.brand.logo, (s.brand.name || "?")[0]); el(b, "span", null, copy(req(s.brand.name, "sidebar brand.name", "sidebar"), "sidebar brand")); }
      req(s.items && s.items.length, "sidebar items", "sidebar");
      s.items.forEach(function (it) {
        var n = el(d, "div", "ru-nav"); n.innerHTML = it.icon ? (/^\s*</.test(it.icon) ? it.icon : glyph(it.icon)) : "";
        el(n, "span", null, copy(req(it.label, "sidebar item label", "sidebar")));
        if (it.count != null) el(n, "span", "ru-count", String(it.count));
        if (it.active) n.setAttribute("data-active", "");
      });
      return d;
    }
    function header(parent, h) {
      h = h || {};
      var d = el(one(parent), "div", "ru-head"), l = el(d, "div");
      var t = el(l, "div", "ru-title", copy(req(h.title, "header title", "header"), "header title")); t.setAttribute("data-ru-read", "");
      if (h.sub) el(l, "div", "ru-sub", copy(h.sub, "header sub"));
      if (h.actions && h.actions.length) { var a = el(d, "div", "ru-actions"); h.actions.forEach(function (x) { button(a, x); }); }
      return d;
    }
    function panel(parent, p) { p = p || {}; var d = el(one(parent), "div", "ru-panel"); el(d, "div", "ru-ptitle", copy(req(p.title, "panel title", "panel"), "panel title")); return d; }
    function button(parent, b) {
      b = b || {};
      var d = el(one(parent), "div", "ru-btn");
      if (b.icon) { var h = document.createElement("span"); h.innerHTML = /^\s*</.test(b.icon) ? b.icon : glyph(b.icon); d.appendChild(h.firstChild); }
      var t = el(d, "span", null, copy(req(b.label, "button label", "button"), "button")); t.setAttribute("data-ru-read", "");
      d.setAttribute("data-kind", b.kind || "secondary");
      return d;
    }
    function input(parent, i) {
      i = i || {};
      var f = el(one(parent), "div", "ru-field");
      if (i.label) el(f, "div", "ru-label", copy(i.label, "input label"));
      var d = el(f, "div", "ru-input");
      var ph = el(d, "span", "ru-ph", i.placeholder == null ? "" : copy(i.placeholder, "input placeholder"));
      var val = el(d, "span", "ru-val", i.value || ""); val.setAttribute("data-ru-read", "");
      el(d, "i", "ru-caret");
      if (i.value) ph.setAttribute("data-hidden", "");
      d.setAttribute("data-ru-field", "1");
      return d;
    }
    function toggle(parent, t) { var d = el(one(parent), "span", "ru-toggle"); if (t && t.on) d.setAttribute("data-on", ""); return d; }
    function chip(parent, c) { c = c || {}; var d = el(one(parent), "span", "ru-chip", copy(req(c.label, "chip label", "chip"), "chip")); if (c.tone) d.setAttribute("data-tone", c.tone); return d; }
    function avatar(parent, a) {
      a = a || {}; var d = el(one(parent), "div", "ru-av");
      if (a.src) { var i = el(d, "img"); i.src = a.src; i.alt = ""; } else d.textContent = String(req(a.name, "avatar name or src", "avatar")).split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
      if (a.color) d.style.setProperty("--ru-av", a.color);
      return d;
    }
    // A row needs identity: a title AND (an icon / avatar / sub line). A bare label . value row, or anything with a status dot, is the tell, and there is no dot option.
    function row(parent, r) {
      r = r || {};
      var d = el(one(parent), "div", "ru-row");
      req(r.title, "row title", "row");
      need(r.icon || r.avatar || r.sub, 'row "' + r.title + '": give it an icon, an avatar or a sub line (a label . value row is the vibe-coded card)');
      if (r.avatar) avatar(d, typeof r.avatar === "string" ? { name: r.avatar } : r.avatar);
      else if (r.icon) iconNode(d, "ru-ico", r.icon);
      var m = el(d, "div", "ru-rmain"), t = el(m, "div", "ru-rtitle", copy(r.title, "row title")); t.setAttribute("data-ru-read", "");
      if (r.sub) el(m, "div", "ru-rsub", copy(r.sub, "row sub"));
      if (r.chip) chip(d, typeof r.chip === "string" ? { label: r.chip } : r.chip);
      if (r.value != null) el(d, "div", "ru-rval", copy(r.value, "row value"));
      return d;
    }
    function list(parent, l) { var d = el(one(parent), "div", "ru-list"); req(l && l.rows && l.rows.length, "list rows", "list"); l.rows.forEach(function (r) { row(d, r); }); return d; }
    function table(parent, t) {
      t = t || {}; req(t.cols && t.cols.length && t.rows && t.rows.length, "table cols and rows", "table");
      var d = el(one(parent), "table", "ru-table"), h = el(el(d, "thead"), "tr");
      t.cols.forEach(function (c) { el(h, "th", null, copy(c, "table col")); });
      var b = el(d, "tbody");
      t.rows.forEach(function (r) { var tr = el(b, "tr"); r.forEach(function (c, i) { var td = el(tr, "td", null, copy(c, "table cell")); if (t.numeric && t.numeric.indexOf(i) >= 0) td.setAttribute("data-num", ""); }); });
      return d;
    }
    function tabs(parent, t) {
      t = t || {}; var d = el(one(parent), "div", "ru-tabs"); req(t.items && t.items.length, "tabs items", "tabs");
      t.items.forEach(function (x, i) { var e = el(d, "div", "ru-tab", copy(x, "tab")); if (i === (t.active || 0)) e.setAttribute("data-active", ""); });
      return d;
    }
    function notification(parent, n) {
      n = n || {};
      var d = el(one(parent), "div", "ru-notif");
      iconNode(d, "ru-ico", req(n.icon || n.app, "notification icon or app", "notification"));
      var m = el(d, "div", "ru-rmain"), top = el(m, "div", "ru-ntop");
      el(top, "span", "ru-ntitle", copy(req(n.title, "notification title (sender or subject)", "notification"), "notification title"));
      el(top, "span", "ru-ntime", n.time || "now");
      var b = el(m, "div", "ru-nbody", copy(req(n.body, "notification body (a real sentence)", "notification"), "notification body")); b.setAttribute("data-ru-read", "");
      return d;
    }
    function message(parent, m) {
      m = m || {}; var d = el(one(parent), "div", "ru-msg");
      if (m.from) el(d, "div", "ru-from", copy(m.from, "message from"));
      var b = el(d, "div", "ru-bubble", copy(req(m.body, "message body", "message"), "message")); b.setAttribute("data-ru-read", "");
      if (m.mine) d.setAttribute("data-mine", "");
      return d;
    }

    // ---------------- proof readability marks
    function hero(e) { heroEl = one(e); heroEl.setAttribute("data-ru-hero", ""); return heroEl; }
    function read(e) { e = one(e); e.setAttribute("data-ru-read", ""); return e; }
    function texture(e) { e = one(e); e.setAttribute("data-ru-texture", ""); e.removeAttribute("data-ru-read"); return e; }

    // ---------------- timed state: a hard step (toggle flips, a colour step, a "sent" state). Holds the last entry at or before T.
    //   U.step(el, "data-on", [[1.2, ""], [3.0, null]])   value null removes the attribute; the state before the first entry is whatever the DOM had at build.
    function step(e, attr, seq) {
      e = one(e); need(seq && seq.length, "step: give [[time, value], ...]");
      var base = e.getAttribute(attr), list = seq.slice().sort(function (a, b) { return a[0] - b[0]; });
      chan(function (t) {
        var v = base;
        for (var i = 0; i < list.length; i++) if (t >= list[i][0] - 1e-9) v = list[i][1];
        if (v === null || v === undefined) e.removeAttribute(attr); else e.setAttribute(attr, v);
      }, list[list.length - 1][0]);
      return e;
    }

    // ---------------- the world: ONE camera group for the whole UI. Poses are keyed in time; a pose says which world point sits at the frame centre and at what zoom.
    //   keys: [{ t, s, fx, fy, ease }]. Pure function of T, so the cursor (which lives outside the world) can follow it exactly.
    function world(target, keys) {
      var w = one(target); need(keys && keys.length, "world: give keys [{ t, s, fx, fy }]");
      var ks = keys.slice().sort(function (a, b) { return a.t - b.t; });
      function pose(t) {
        var a = ks[0], b = null, i;
        for (i = 0; i < ks.length; i++) { if (t >= ks[i].t) a = ks[i]; else { b = ks[i]; break; } }
        var s = a.s, fx = a.fx, fy = a.fy;
        if (b) { var p = clamp((t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1), e = ease(b.ease || "glide")(p); s = a.s + (b.s - a.s) * e; fx = a.fx + (b.fx - a.fx) * e; fy = a.fy + (b.fy - a.fy) * e; }
        return { s: s, tx: W / 2 - fx * s, ty: H / 2 - fy * s };
      }
      function map(t, p) { var q = pose(t); return [p[0] * q.s + q.tx, p[1] * q.s + q.ty]; }
      function unmap(t, p) { var q = pose(t); return [(p[0] - q.tx) / q.s, (p[1] - q.ty) / q.s]; }
      w.style.transformOrigin = "0 0";
      function apply(t) { var q = pose(t); w.style.transform = "translate(" + r3(q.tx) + "px," + r3(q.ty) + "px) scale(" + r3(q.s) + ")"; }
      apply(ks[0].t);
      chan(apply, ks[ks.length - 1].t);
      var api = { el: w, pose: pose, map: map, unmap: unmap, at0: ks[0].t };
      worldRef = api;
      return api;
    }

    // ---------------- the cursor: its own top layer (outside any camera group), exactly one instance, tip-anchored, arcs, no ripple ring
    var layer = null;
    function cursorLayer() {
      if (layer && layer.parentNode === stage) { stage.appendChild(layer); return layer; } // keep it the last child
      layer = el(stage, "div", "ru-cursor-layer"); layer.setAttribute("data-ru-layer", "cursor");
      return layer;
    }
    function arrowSVG(tone, accent) {
      var fill = tone === "light" ? "#ffffff" : "#0b0b0d", edge = tone === "light" ? "#0b0b0d" : "#ffffff";
      return '<svg width="26" height="36" viewBox="0 0 26 36"><path d="M1.5 1.5 L1.5 28 L8.2 22.2 L12.4 32 L17 30 L12.8 20.4 L22 20 Z" fill="' + (accent || fill) + '" stroke="' + edge + '" stroke-width="2.2" stroke-linejoin="round"/></svg>';
    }
    function cursor(c) {
      c = c || {};
      need(!nCursor, "cursor: one instance at a time (a second cursor is a multi-cursor film; pass its jobs to the first)");
      nCursor++;
      var w = c.world || worldRef, size = c.size || 0.045 * W;
      var node = el(cursorLayer(), "div", "ru-cursor");
      node.innerHTML = arrowSVG(opt(c, "tone", T.dark ? "light" : "dark"), c.color);
      var svg = node.firstChild; svg.style.width = size + "px"; svg.style.height = size * 1.385 + "px"; svg.setAttribute("width", size); svg.setAttribute("height", size * 1.385);
      var sc = c.scale || 1; // the cursor's own scale factor (it does not follow the camera's zoom 1:1; 1.5 when the UI zooms 2.3)
      var origin = c.from || { x: W * 0.8, y: H * 0.85 };
      var legs = [];      // move legs: {t0, t1, a:[x,y] (world coords), b:[x,y], bow, ease}
      var pressList = []; // {td, depth}
      var enterAt = opt(c, "at", 0), exitLeg = null;
      function pt(p) { return Array.isArray(p) ? p : [p.x, p.y]; }
      // a target (element or {x,y}) as a point in WORLD coordinates, measured from layout NOW (the world sits at its first pose while you build)
      function aim(target, ax, ay) {
        if (target && target.nodeType !== 1 && typeof target !== "string") return pt(target);
        var e = one(target), r = e.getBoundingClientRect(), sr = stage.getBoundingClientRect();
        var k = sr.width / W || 1;
        var p = [(r.left - sr.left + r.width * (ax == null ? 0.5 : ax)) / k, (r.top - sr.top + r.height * (ay == null ? 0.5 : ay)) / k];
        return w ? w.unmap(w.at0, p) : p;
      }
      var cur = { x: origin.x, y: origin.y }; // last known resting point in WORLD coordinates for chaining
      if (w && !c.fromWorld) cur = (function () { var q = w.unmap(w.at0, [origin.x, origin.y]); return { x: q[0], y: q[1] }; })();
      function legPos(t) {
        var p = [cur0[0], cur0[1]], i, L;
        for (i = 0; i < legs.length; i++) {
          L = legs[i];
          if (t >= L.t1) p = L.b;
          else if (t > L.t0) {
            var u = ease(L.ease)(clamp((t - L.t0) / (L.t1 - L.t0), 0, 1)), dx = L.b[0] - L.a[0], dy = L.b[1] - L.a[1], len = Math.sqrt(dx * dx + dy * dy) || 1;
            var cx = (L.a[0] + L.b[0]) / 2 - (dy / len) * L.bow * len, cy = (L.a[1] + L.b[1]) / 2 + (dx / len) * L.bow * len; // quadratic bow: a curved path, not a macro line
            var iu = 1 - u;
            p = [iu * iu * L.a[0] + 2 * iu * u * cx + u * u * L.b[0], iu * iu * L.a[1] + 2 * iu * u * cy + u * u * L.b[1]];
            return p;
          } else return p;
        }
        return p;
      }
      var cur0 = [cur.x, cur.y];
      function scaleAt(t) { // the cursor's press scale: 2 f down to depth, 3 f back up, never a ring
        var s = 1;
        for (var i = 0; i < pressList.length; i++) {
          var P = pressList[i], d = t - P.td;
          if (d <= 0) continue;
          if (d < 2 * F) s = 1 + (P.depth - 1) * ease("out")(d / (2 * F));
          else if (d < 5 * F) s = P.depth + (1 - P.depth) * ease("inout")((d - 2 * F) / (3 * F));
        }
        return s;
      }
      function draw(t) {
        var p = legPos(t), q = w ? w.map(t, p) : p;
        if (exitLeg && t > exitLeg.t0) { var u = ease("accel")(clamp((t - exitLeg.t0) / (exitLeg.t1 - exitLeg.t0), 0, 1)); q = [q[0] + (exitLeg.to[0] - q[0]) * u, q[1] + (exitLeg.to[1] - q[1]) * u]; }
        var p2 = legPos(t - F), q2 = w ? w.map(t - F, p2) : p2;
        var vx = q[0] - q2[0], vy = q[1] - q2[1], speed = Math.sqrt(vx * vx + vy * vy) / W; // fraction of frame width per frame
        var lean = clamp(speed * 360, 0, 20) * (vx >= 0 ? 1 : -1); // a lean toward the travel, up to 20 degrees at peak speed
        var s = scaleAt(t) * sc, vis = t >= enterAt - 1e-9 && !(exitLeg && t >= exitLeg.t1 - 1e-9);
        node.style.opacity = vis ? "1" : "0";
        node.style.transform = "translate(" + r3(q[0]) + "px," + r3(q[1]) + "px) rotate(" + r3(lean) + "deg) scale(" + r3(s) + ")";
        node.setAttribute("data-ru-scale", String(r3(scaleAt(t))));
        node.setAttribute("data-ru-x", String(r3(q[0]))); node.setAttribute("data-ru-y", String(r3(q[1])));
      }
      chan(draw);
      bump(enterAt + F);
      var n = 0;
      function move(target, m) {
        m = m || {}; n++;
        var b = aim(target, m.ax, m.ay), a = [cur.x, cur.y];
        var dist = Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2)) / W;
        var j = 1 + (hash(legs.length + n * 7, seed) - 0.5) * 0.16; // +-8% seeded, so no two travels share a duration
        var dur = fr(m.dur || clamp(0.32 + dist * 0.85, 0.32, 1.05) * j);
        var prevEnd = legs.length ? legs[legs.length - 1].t1 : enterAt;
        var t0 = m.end != null ? Math.max(prevEnd, fr(m.end) - dur) : fr(opt(m, "at", prevEnd));
        if (m.end != null) { dur = fr(m.end) - t0; need(dur >= 2 * F - 1e-9, "cursor: not enough time to travel there before " + m.end + "s (the previous move ends at " + r3(prevEnd) + "s)"); }
        var bow = m.bow != null ? m.bow : (hash(n * 13, seed) > 0.5 ? 1 : -1) * (0.08 + hash(n * 17, seed) * 0.08);
        legs.push({ t0: t0, t1: t0 + dur, a: a, b: b, bow: bow, ease: m.ease || "snapSettle" });
        cur = { x: b[0], y: b[1] };
        bump(t0 + dur + F);
        return { start: t0, end: t0 + dur, next: t0 + dur * 0.7, dur: dur };
      }
      // click: travel there so the cursor arrives `park` frames (2 to 5) before the press, then press. `at` is the press-down time.
      function click(target, k) {
        k = k || {};
        var te = typeof target === "string" || (target && target.nodeType === 1) ? one(target) : null;
        var td = fr(k.at), park = clamp(Math.round(opt(k, "park", 3)), 2, 15) * F;
        var depth = clamp(opt(k, "depth", 0.81), 0.71, 0.9);
        // the cursor arrives `park` frames before the press (2 for an obvious button, 3-5 for a switch, more when the camera must settle)
        var mv = move(target, k.from != null ? { at: fr(k.from), dur: k.dur, ax: k.ax, ay: k.ay, bow: k.bow, ease: k.ease } : { end: td - park, ax: k.ax, ay: k.ay, bow: k.bow, ease: k.ease });
        need(td >= mv.end - 1e-6, "click: the press (at " + td + ") comes before the cursor arrives (" + r3(mv.end) + "); give it more time");
        pressList.push({ td: td, depth: depth });
        var lag = clamp(Math.round(opt(k, "lag", 1)), 0, 1) * F, tmin = td + 2 * F; // the target's minimum is 0-1 frames after the cursor's
        var tdepth = clamp(opt(k, "targetDepth", 0.8), 0.63, 0.97), downF = opt(k, "heavy", false) ? 6 : 2, upF = opt(k, "heavy", false) ? 10 : 6;
        if (te) {
          var tStart = tmin + lag - downF * F, tEnd = tmin + lag + upF * F; // down 2 f (fast squeeze), up 6 f (slower release, no overshoot)
          chan(function (t) {
            var s = 1;
            if (t > tStart && t < tmin + lag) s = 1 + (tdepth - 1) * ease("out")((t - tStart) / (downF * F));
            else if (t >= tmin + lag && t < tEnd) s = tdepth + (1 - tdepth) * ease("out")((t - tmin - lag) / (upF * F));
            te.style.scale = s === 1 ? "1" : String(r3(s));
            te.setAttribute("data-ru-press", s === 1 ? "0" : "1");
          }, tEnd);
          if (k.react) step(te, "data-state", [[tmin + lag, k.react]]); // a hard step in the UI (colour, state) on the same frame the target bottoms out
        }
        presses.push({ press: td, cursor_min: tmin, cursor_up: td + 5 * F, target_min: te ? tmin + lag : null, cursor_depth: depth, target_depth: te ? tdepth : null, lag_frames: Math.round(lag / F) });
        bump(td + 5 * F + upF * F);
        return { start: mv.start, arrive: mv.end, down: td, min: tmin, up: td + 5 * F, end: td + 5 * F, next: td + 5 * F };
      }
      // leave by accelerating off the frame (never an instant vanish in the middle of the UI)
      function exit(e) {
        e = e || {}; var t0 = fr(e.at), dur = fr(e.dur || 0.28);
        var cur2 = w ? w.map(t0, [cur.x, cur.y]) : [cur.x, cur.y], dir = e.to === "left" ? -1 : 1;
        exitLeg = { t0: t0, t1: t0 + dur, to: [cur2[0] + dir * W * 0.5, cur2[1] + H * 0.35] };
        bump(t0 + dur + F);
        return { start: t0, end: t0 + dur };
      }
      var api = { el: node, move: move, click: click, exit: exit, scaleAt: scaleAt, pos: function (t) { var p = legPos(t); return w ? w.map(t, p) : p; } };
      cursors.push(api);
      return api;
    }

    // ---------------- typing: ONLY inside a real input field (U.input). The caret is solid while typing and blinks only in the hold after.
    function type(field, text, y) {
      y = y || {};
      var f = one(field);
      need(f.getAttribute("data-ru-field") === "1" && f.classList.contains("ru-input"), "type: typing happens only inside a real input field (RasanUI input). Got a bare element: build it with U.input() so it has a field, a placeholder to clear and a caret.");
      var val = f.querySelector(".ru-val"), ph = f.querySelector(".ru-ph");
      text = copy(req(text, "text to type", "type"), "typed text");
      var at = fr(opt(y, "at", 0)), cps = typeof y.rate === "number" ? y.rate : RATES[y.rate || "author"] || RATES.author;
      var base = val.textContent, chars = Array.from(text), times = [], t = at + 2 * F, i = 0; // the placeholder clears 1 f before the caret; the first glyph lands 2 f after it
      val.setAttribute("data-ru-typed", "1");
      while (i < chars.length) {
        // cadence by hand, seeded: bursts of 1 to 3 glyphs on one frame, uneven gaps, a pause of 6+ f after a space (never one glyph per frame on a metronome)
        var g = 1 + Math.floor(hash(i, seed + 3) * 3);
        for (var j = 0; j < g && i < chars.length; j++, i++) times.push(fr(t));
        var gap = (g / cps) * (0.7 + hash(i + 50, seed) * 0.8);
        if (chars[i - 1] === " ") gap = Math.max(gap, 6 * F);
        t += gap;
      }
      var endT2 = times.length ? times[times.length - 1] : at, holdEnd = endT2 + clamp(opt(y, "hold", 1.2), 0, 3);
      var hadPh = !ph.hasAttribute("data-hidden") && !base;
      chan(function (tm) {
        var n = 0; for (var q = 0; q < times.length; q++) if (tm >= times[q] - 1e-9) n = q + 1;
        var typing = tm >= at - 1e-9 && tm <= endT2 + 1e-9, hold = tm > endT2 && tm <= holdEnd;
        if (tm >= at - 1e-9 && tm <= holdEnd + 5 * F) f.setAttribute("data-focus", ""); else f.removeAttribute("data-focus");
        // the caret is SOLID while typing; it blinks only in the hold after, on its own 0.26 s clock
        if (typing || (hold && Math.floor((tm - endT2) / 0.26 + 1e-9) % 2 === 0)) f.setAttribute("data-caret", ""); else f.removeAttribute("data-caret");
        if (hadPh) { if (tm >= at - F - 1e-9) ph.setAttribute("data-hidden", ""); else ph.removeAttribute("data-hidden"); }
        val.textContent = base + chars.slice(0, n).join("");
      }, holdEnd + 5 * F);
      return { start: at, end: endT2, next: endT2 + 0.15, chars: chars.length, times: times };
    }


    // ---------------- drag and drop: the reaction stack, earliest first (references/ui-rebuild.md, "Drag and drop").
    //   U.drag(card, target, { at, lift, hold, travel, tilt, consume, dropScale, hover, grow })
    //   `at` is the grab. The target grows (14 f, ending on the drop) and takes a hover rim (data-hover) 0.4 s before the drop;
    //   the card RISES (11 f, softLand, `lift` px), HOLDS 2 f at the crest, travels slow-fast-slow on a bowed path while
    //   it tilts (`tilt` deg, default -8, over 8 f, back to 0 by the drop); the drop is ONE frame: the card is at the target
    //   centre at `dropScale` (default 0.67), data-state="dropped" is set on the target, and with consume:true the card
    //   instead shrinks to nothing about its own centre in 3 f with a 10 px blur (it was eaten, it does not fly to a slot).
    //   Pair the cursor: cur.click(card, { at: grab }) and cur.move(target, { end: drop }).
    //   Returns { start, crest, drop, end, next, hold: grab..drop }.
    function drag(item, target, d) {
      d = d || {};
      var it = one(item), tg = one(target), t0 = fr(opt(d, "at", 0)), liftF = 11, holdF = 2;
      var ir = it.getBoundingClientRect(), tr = tg.getBoundingClientRect();
      var ratio = it.offsetWidth ? ir.width / it.offsetWidth : 1; ratio = ratio || 1; // the on-screen scale of the card's own coordinates
      var dx = (tr.left + tr.width / 2 - ir.left - ir.width / 2) / ratio, dy = (tr.top + tr.height / 2 - ir.top - ir.height / 2) / ratio;
      var dist = Math.sqrt(dx * dx + dy * dy), lift = opt(d, "lift", Math.round(ir.height / ratio * 0.35));
      var travelDur = fr(opt(d, "travel", clamp(0.35 + (dist * ratio / W) * 0.6, 0.35, 0.9)));
      var tLift = t0 + liftF * F, tCrest = tLift + holdF * F, tDrop = fr(tCrest + travelDur), tilt = opt(d, "tilt", -8), consume = !!opt(d, "consume", false);
      var dropScale = opt(d, "dropScale", 0.67), growTo = opt(d, "grow", 1.04), nx = -dy / (dist || 1), ny = dx / (dist || 1), bow = (hash(dist | 0, seed) > 0.5 ? 1 : -1) * dist * 0.1;
      it.style.transformOrigin = "50% 50%"; tg.style.transformOrigin = tg.style.transformOrigin || "50% 50%";
      var endAt = consume ? tDrop + 3 * F : tDrop;
      chan(function (t) {
        var x = 0, y = 0, r = 0, sc = 1, op = 1, blur = 0;
        if (t > t0) {
          if (t < tLift) { y = -lift * EASE.out(clamp((t - t0) / (liftF * F), 0, 1)); }
          else {
            var q = clamp((t - tCrest) / Math.max(F, tDrop - tCrest), 0, 1), e = t <= tCrest ? 0 : EASE.inout(q);
            y = -lift + (dy + lift) * e; x = dx * e;
            var arc = 4 * e * (1 - e) * bow; x += nx * arc; y += ny * arc;
            r = t < tCrest ? 0 : t < tCrest + 8 * F ? tilt * EASE.out((t - tCrest) / (8 * F)) : tilt * (1 - EASE.inout(clamp((t - tCrest - 8 * F) / Math.max(F, tDrop - tCrest - 8 * F), 0, 1)));
          }
          if (t >= tDrop - 1e-9) {
            x = dx; y = dy; r = 0;
            if (consume) { var k = clamp((t - tDrop) / (3 * F), 0, 1); sc = 1 - k; blur = 10 * k; op = k >= 1 ? 0 : 1; }
            else sc = dropScale;
          }
        }
        it.style.translate = r3(x) + "px " + r3(y) + "px"; it.style.rotate = r3(r) + "deg"; it.style.scale = r3(sc);
        it.style.filter = blur > 0.05 ? "blur(" + r3(blur) + "px)" : ""; it.style.opacity = String(op);
        var gr = t < tDrop - 14 * F ? 0 : t < tDrop ? EASE.out((t - (tDrop - 14 * F)) / (14 * F)) : 1;
        tg.style.scale = r3(1 + (growTo - 1) * (t >= tDrop ? Math.max(0, 1 - (t - tDrop) / (6 * F)) : gr));
        if (t >= tDrop - 0.4 - 1e-9 && t < tDrop - 1e-9 && opt(d, "hover", true)) tg.setAttribute("data-hover", ""); else tg.removeAttribute("data-hover");
        if (t >= tDrop - 1e-9) tg.setAttribute("data-state", "dropped"); else tg.removeAttribute("data-state");
      }, endAt + 6 * F);
      return { start: t0, crest: tCrest, drop: tDrop, end: endAt, next: tDrop + 0.1, hold: tDrop - t0 };
    }

    // ---------------- accelerating scroll: a dense list or log that is already moving on frame `at`, speeds up the whole run
    // and brakes onto a short readable list. `el` is the moving column (one group, no blur); `distance` is px of travel
    // (a positive number moves the content UP, the way scrolling down does). Speed: slow start (the first 0.4 s of 1.84
    // move about 7%), growing continuously to a peak (default 250 px per frame at 30 fps on a 3000+ px distance), then a
    // quadratic brake over `settle` frames (default 9). Pure function of T. Let the viewport run EMPTY after the last block;
    // do not fill it. Hold the landing still 0.8 s. New events step in whole (U.step) and then ride the scroll.
    //   U.scroll(col, { at, dur: 1.84, distance, settle: 9, n: 2.4 }) -> { start, end, peak_px_per_frame, next }
    function scroll(col, s) {
      s = s || {};
      var e = one(col), t0 = fr(opt(s, "at", 0)), dur = fr(opt(s, "dur", 1.84)), dist = s.distance;
      need(typeof dist === "number" && dist, "scroll: distance (px of travel) is required");
      var n = opt(s, "n", 2.4), settle = Math.max(1, opt(s, "settle", 9)) * F, pk = clamp(1 - settle / dur, 0.5, 0.97);
      var S1 = 1 / (1 + n * (1 - pk) / (2 * pk)), vpk = S1 * n / pk; // fraction of the distance, per unit of progress, at the peak
      function frac(p) {
        if (p <= 0) return 0; if (p >= 1) return 1;
        if (p <= pk) return S1 * Math.pow(p / pk, n);
        var q = (p - pk) / (1 - pk); return S1 + vpk * (1 - pk) * (q - q * q / 2);
      }
      chan(function (t) { e.style.translate = "0px " + r3(-dist * frac(clamp((t - t0) / dur, 0, 1))) + "px"; }, t0 + dur);
      return { start: t0, end: t0 + dur, next: t0 + dur, peak_px_per_frame: Math.round(Math.abs(dist) * vpk / (dur * fps)) };
    }

    // ---------------- shimmer: "the machine is thinking". Status words arrive whole (blur 12 px and opacity 0.1 to sharp over 4 to 5 f,
    // back to back, 4 f apart: `words: true`), then TWO passes of a brighter copy of the text under a moving band masked to
    // the glyphs (band ~0.35 of the text width, 13 f each, a 6 f gap), in the accent hue. No spinner, no dots, never per
    // character. `end: "check"` draws nothing itself: finish with a left-to-right wipe + a check of your own (U.step).
    //   U.shimmer(textEl, { at, words: true, passes: 2, band: 0.35, pass: 13, gap: 6, tone }) -> { start, shimmer, end, next }
    function shimmer(textEl, m) {
      m = m || {};
      var e = one(textEl), at0 = fr(opt(m, "at", 0)), wordsIn = opt(m, "words", true), passes = Math.max(1, opt(m, "passes", 2)), passF = opt(m, "pass", 13), gapF = opt(m, "gap", 6), band = opt(m, "band", 0.35);
      var txt = copy(e.textContent, "shimmer text"), wordEls = [], tIn = at0;
      if (wordsIn) {
        e.textContent = "";
        txt.split(/(\s+)/).forEach(function (w) { if (!w) return; if (/^\s+$/.test(w)) e.appendChild(document.createTextNode(w)); else wordEls.push(el(e, "span", null, w)); });
        wordEls.forEach(function (w) { w.style.display = "inline-block"; });
        tIn = at0 + wordEls.length * 4 * F + 1 * F;
      }
      var pos = getComputedStyle(e.parentNode).position; if (pos === "static") e.parentNode.style.position = "relative";
      var cl = el(e.parentNode, "div", "ru-shim", txt); cl.setAttribute("aria-hidden", "true");
      var cs = getComputedStyle(e); cl.style.left = e.offsetLeft + "px"; cl.style.top = e.offsetTop + "px"; cl.style.font = cs.font; cl.style.letterSpacing = cs.letterSpacing; cl.style.width = e.offsetWidth + "px";
      cl.style.color = m.tone || "var(--ru-accent)";
      var wpx = Math.max(24, e.offsetWidth * band), t1 = tIn + 0 * F, endAll = t1 + passes * passF * F + (passes - 1) * gapF * F;
      cl.style.webkitMaskImage = cl.style.maskImage = "linear-gradient(90deg,transparent,#000 50%,transparent)"; cl.style.webkitMaskRepeat = cl.style.maskRepeat = "no-repeat"; cl.style.webkitMaskSize = cl.style.maskSize = wpx + "px 100%";
      chan(function (t) {
        wordEls.forEach(function (w, i) {
          var q = clamp((t - (at0 + i * 4 * F)) / (4.5 * F), 0, 1), k = EASE.out(q);
          w.style.opacity = r3(0.1 + 0.9 * k); w.style.filter = k >= 1 ? "" : "blur(" + r3(12 * (1 - k)) + "px)";
        });
        var on = false, pp = 0;
        for (var i = 0; i < passes; i++) { var a = t1 + i * (passF + gapF) * F; if (t >= a - 1e-9 && t < a + passF * F) { on = true; pp = (t - a) / (passF * F); } }
        cl.style.opacity = on ? "1" : "0";
        var x = -wpx + (e.offsetWidth + wpx) * pp; cl.style.webkitMaskPosition = cl.style.maskPosition = r3(x) + "px 0";
      }, endAll);
      return { start: at0, shimmer: t1, end: endAll, next: endAll };
    }

    // ---------------- code / terminal: a panel of typed commands, printed output and status pills, the way a real session reads.
    //   U.terminal(parent, { title, at, speed: 0.035, lines: [{ cmd: "npm run build" }, { out: "compiled in 1.2 s" }, { pause: 0.6 }, { pill: "done" }] })
    // cmd: types with a "$ " prompt at `speed` s per glyph (seeded +-40% jitter, a pause after a space); out: the whole line (or
    // `outs: [..]` several lines) on ONE frame; pause: seconds of nothing but a blinking caret; pill: a status chip on one frame.
    // Dark panel from the brand (ink ground, canvas text, accent prompt), mono font from the tokens. Everything is `data-ru-read`,
    // so U.check holds it to the text-height floor: magnify with fillW / the world camera, never shrink the proof.
    //   -> { el, start, end, next, lines: [{ start, end }] }
    function terminal(parent, tm) {
      tm = tm || {};
      var pr = one(parent), root = el(pr, "div", "ru-term"), c = T.colors, sp = opt(tm, "speed", 0.035), t = fr(opt(tm, "at", 0)), plan = [], k, lineNo = 0;
      var v = { "--ru-canvas": c.canvas, "--ru-ink": c.ink, "--ru-accent": c.accent, "--ru-on-accent": c.onAccent, "--ru-mono": T.fonts.mono, "--ru-r-lg": T.radii.lg + "px", "--ru-r-pill": "999px", "--ru-u": T.space + "px" };
      for (k in v) if (!getComputedStyle(pr).getPropertyValue(k)) root.style.setProperty(k, v[k]);
      root.setAttribute("data-ru-term", "1");
      if (tm.title) { var ti = el(root, "div", null, copy(tm.title, "terminal title")); ti.style.cssText = "opacity:.55;font-size:13px;letter-spacing:.04em;margin-bottom:4px"; }
      var t00 = t;
      (tm.lines || []).forEach(function (ln) {
        if (ln.pause != null) { t = fr(t + ln.pause); return; }
        var row = el(root, "div", "ru-tline"); row.setAttribute("data-ru-read", ""); lineNo++;
        if (ln.cmd != null) {
          row.setAttribute("data-kind", "cmd"); var pm = el(row, "span", "ru-tprompt", "$"), tx = el(row, "span", null, ""), cr = el(row, "span", "ru-tcaret");
          var chars = Array.from(copy(ln.cmd, "terminal command")), times = [], q = t + 3 * F, i;
          for (i = 0; i < chars.length; i++) { times.push(fr(q)); q += sp * (0.6 + hash(i + lineNo * 31, seed + 5) * 0.8) + (chars[i] === " " ? sp * 1.5 : 0); }
          var tEnd = times.length ? times[times.length - 1] : t, nxtT = fr(tEnd + 0.35);
          plan.push({ row: row, tx: tx, cr: cr, chars: chars, times: times, a: t, b: tEnd, nxt: nxtT, cmd: true });
          plan[plan.length - 1].span = [t, tEnd]; t = nxtT;
        } else if (ln.pill != null) {
          row.setAttribute("data-kind", "pill"); var pl = el(row, "span", "ru-tpill", copy(ln.pill, "terminal pill")); plan.push({ row: row, show: t, span: [t, t] }); t = fr(t + 0.2);
        } else {
          var outs = ln.outs || [ln.out]; row.setAttribute("data-kind", "out"); row.textContent = outs.map(function (o) { return copy(o, "terminal output"); }).join("\n");
          plan.push({ row: row, show: t, span: [t, t] }); t = fr(t + 0.25);
        }
      });
      var tEndAll = t;
      chan(function (tm2) {
        plan.forEach(function (L, idx) {
          if (L.cmd) {
            var n = 0; for (var q2 = 0; q2 < L.times.length; q2++) if (tm2 >= L.times[q2] - 1e-9) n = q2 + 1;
            L.row.style.visibility = tm2 >= L.a - 1e-9 ? "visible" : "hidden";
            L.tx.textContent = L.chars.slice(0, n).join("");
            var typing = tm2 >= L.a && tm2 <= L.b + 1e-9, last = idx === plan.length - 1 || tm2 < plan[idx + 1].span[0], blink = last && tm2 > L.b && Math.floor((tm2 - L.b) / 0.26 + 1e-9) % 2 === 0;
            L.cr.style.display = typing || blink ? "inline-block" : "none";
          } else L.row.style.visibility = tm2 >= L.show - 1e-9 ? "visible" : "hidden";
        });
      }, tEndAll);
      return { el: root, start: t00, end: tEndAll, next: tEndAll, lines: plan.map(function (L) { return { start: L.span[0], end: L.span[1] }; }) };
    }

    // ---------------- readability: the check. Every measure is read from the rendered DOM at the sampled times.
    function warnObj(rule, message, node) { return { rule: rule, message: message, node: node ? (node.className || node.tagName) : null }; }
    function check(c) {
      c = c || {};
      var times = c.at == null ? [tl.time()] : [].concat(c.at), warns = [], stats = { samples: times.length, min_text_h: null, hero_w: null, captured: 0, invented: 0 };
      var minText = c.minText || 0.04, heroW = c.heroW || 0.55, t0 = tl.time();
      var Wp = W, Hp = H, sr = stage.getBoundingClientRect(), k = sr.width / W || 1;
      if (T.defaulted.length) warns.push(warnObj("tokens-defaulted", "brand tokens missing " + T.defaulted.join(", ") + ": those fell back to generic values; pass them from the capture", null));
      if (!finished) warns.push(warnObj("no-finish", "U.finish() was not called: the clock is not on the timeline, so nothing moves", null));
      times.forEach(function (tm) {
        tl.time(tm); render(tm);
        var tag = " (t=" + r3(tm) + "s)";
        Array.prototype.forEach.call(stage.querySelectorAll("[data-ru-read]"), function (e) {
          if (e.closest("[data-ru-texture]")) return;
          var r = e.getBoundingClientRect(), cs = getComputedStyle(e);
          if (!r.width || !r.height || cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0 || !(e.textContent || "").trim()) return;
          if (r.right < sr.left || r.left > sr.right || r.bottom < sr.top || r.top > sr.bottom) return; // off frame
          var ratio = e.offsetWidth ? r.width / (e.offsetWidth * k) : 1;
          var px = parseFloat(cs.fontSize) * ratio, frac = px / Hp;
          if (stats.min_text_h == null || frac < stats.min_text_h) stats.min_text_h = r3(frac);
          if (frac < minText - 1e-6) warns.push(warnObj("text-too-small", 'text that must be read is ' + r3(frac) + " of the frame height (< " + minText + ")" + tag + ': "' + (e.textContent || "").trim().slice(0, 40) + '". Magnify with the camera or mount with fillW; never shrink the proof.', e));
        });
        var h = heroEl || stage.querySelector("[data-ru-hero]");
        if (h) {
          var r = h.getBoundingClientRect(), left = (r.left - sr.left) / k, right = (r.right - sr.left) / k, top = (r.top - sr.top) / k, bottom = (r.bottom - sr.top) / k;
          var wFrac = (right - left) / Wp, cropped = left < -1 || right > Wp + 1 || top < -1 || bottom > Hp + 1;
          if (stats.hero_w == null || wFrac > stats.hero_w) stats.hero_w = r3(wFrac);
          if (wFrac < heroW - 1e-6 && !cropped) warns.push(warnObj("hero-too-small", "the hero fragment is " + r3(wFrac) + " of the frame width (< " + heroW + ") and not cropped by the frame" + tag + ": magnify it (fillW / the world camera)", h));
        } else if (c.requireHero !== false && !stats.noHeroWarned) { stats.noHeroWarned = true; warns.push(warnObj("no-hero", "no hero fragment marked: call U.hero(el) on the one object the proof is about", null)); }
        cursors.forEach(function () {
          var l = stage.querySelector(".ru-cursor-layer");
          if (l && l !== stage.lastElementChild) warns.push(warnObj("cursor-not-top", "the cursor layer is not the last child of the stage: something draws over the cursor" + tag, l));
          for (var a = l && l.parentElement; a && a !== stage; a = a.parentElement) { if (getComputedStyle(a).transform !== "none") warns.push(warnObj("cursor-in-camera", "the cursor layer sits inside a transformed group: it must be on its own top layer outside the camera group" + tag, a)); }
        });
      });
      Array.prototype.forEach.call(stage.querySelectorAll('[class*="ripple"],[class*="pulse-ring"],[class*="click-ring"]'), function (e) { warns.push(warnObj("click-ring", "a ripple ring is the stock click icon: the target's squash already says it", e)); });
      Array.prototype.forEach.call(stage.querySelectorAll("[data-ru-typed]"), function (e) { if (!e.closest(".ru-input")) warns.push(warnObj("typing-outside-field", "text is typed outside an input field", e)); });
      Array.prototype.forEach.call(stage.querySelectorAll("[data-ui]"), function (e) { if (e.getAttribute("data-ui") === "captured") stats.captured++; else stats.invented++; });
      tl.time(t0); render(t0);
      // de-duplicate (the same finding at several sample times keeps its first)
      var seen = {}; warns = warns.filter(function (w) { var key = w.rule + "|" + w.message.replace(/ \(t=[^)]*\)/, ""); if (seen[key]) return false; seen[key] = 1; return true; });
      if (c.log !== false && typeof console !== "undefined") warns.forEach(function (w) { console.warn("RasanUI " + w.rule + ": " + w.message); });
      if (c.strict && warns.length) throw new Error("RasanUI.check: " + warns.map(function (w) { return w.rule; }).join(", "));
      return { ok: !warns.length, warnings: warns, stats: stats };
    }

    // the clock: one linear tween on the timeline; its setter redraws every channel at the timeline's own time. Call LAST.
    function finish() {
      need(!finished, "finish() was already called");
      finished = true;
      var dur = Math.max(endT, o.duration || 0, tl.duration() || 0) + 1;
      var v = 0, proxy = {};
      Object.defineProperty(proxy, "p", { enumerable: true, get: function () { return v; }, set: function (x) { v = x; render(tl.time()); } });
      tw = tl.fromTo(proxy, { p: 0 }, { p: 1, duration: dur, ease: "none", immediateRender: false }, 0);
      render(0);
      return { duration: dur, channels: channels.length };
    }
    function audit() { return { presses: presses.slice(), channels: channels.length, fps: fps, version: VERSION }; }

    return {
      tokens: T, stage: stage, W: W, H: H, fps: fps, mount: mount, main: main, sidebar: sidebar, header: header, panel: panel, button: button, input: input, toggle: toggle, chip: chip,
      avatar: avatar, row: row, list: list, table: table, tabs: tabs, notification: notification, message: message, hero: hero, read: read, texture: texture, step: step, world: world,
      cursor: cursor, type: type, drag: drag, scroll: scroll, shimmer: shimmer, terminal: terminal, check: check, finish: finish, audit: audit, render: render,
    };
  }

  // size helpers: how big to build so the proof reads. text px is the UI's own font size (e.g. 15 for body); returns the scale that lands it at `frac` of the frame height.
  function fitScale(o) { o = o || {}; return ((o.frac || 0.045) * (o.H || 1080)) / (o.textPx || 15); }
  function fillScale(o) { o = o || {}; return ((o.fill || 0.6) * (o.W || 1920)) / (o.w || 1180); }
  function markCaptured(e, source) { need(source, "markCaptured: say where the screen came from"); e.setAttribute("data-ui", "captured"); e.setAttribute("data-ui-source", String(source)); return e; }

  return { version: VERSION, kit: kit, tokens: tokens, fitScale: fitScale, fillScale: fillScale, markCaptured: markCaptured, ease: EASE, glyphs: GLYPH, contrast: contrast, mix: mix, RATES: RATES };
});
