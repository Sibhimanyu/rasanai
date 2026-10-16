/* RasanAI crew, live lineup. No dependencies.
   Draws each face-less layer as an SVG <image> with its own transform around its feet, and the eyes and
   brows on top, in the same lineup space. Eyes follow the pointer anywhere on the page, blink on their
   own clocks, and look at the input while someone types. Decorative: aria-hidden, no pointer capture.

   Usage: <div data-crew-live data-src="assets/crew/crew-faces.json"></div>
          <script type="module" src="assets/crew/crew-live.js"></script>
   Also exported: mountCrew(el, { src }) returns { destroy }. */

const NS = "http://www.w3.org/2000/svg";
const TAU = Math.PI * 2;

function svg(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export async function mountCrew(host, opts = {}) {
  const src = opts.src || host.getAttribute("data-src") || "crew-faces.json";
  const base = new URL(src, document.baseURI);
  const data = await (await fetch(base)).json();
  const W = data.width, H = data.height;

  host.setAttribute("aria-hidden", "true");
  host.style.aspectRatio = W + " / " + H;
  const root = svg("svg", {
    viewBox: `0 0 ${W} ${H}`, width: W, height: H, preserveAspectRatio: "xMidYMax meet",
    focusable: "false", "aria-hidden": "true",
  });
  root.style.cssText = "display:block;width:100%;height:100%;overflow:visible;pointer-events:none";

  const defs = svg("defs", {}, root);
  const grad = svg("radialGradient", { id: "crew-eye-grad", cx: "0.4", cy: "0.3", r: "0.85" }, defs);
  svg("stop", { offset: "0", "stop-color": "#353540" }, grad);
  svg("stop", { offset: "1", "stop-color": "#050507" }, grad);

  const reduceQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  const members = data.members.map((m, i) => {
    const rand = rng(1000 + i * 7919);
    const g = svg("g", {}, root);
    const [fx, fy, fw, fh] = m.frame;
    const img = svg("image", { x: fx, y: fy, width: fw, height: fh, href: new URL(m.image, base).href, preserveAspectRatio: "none" }, g);
    img.setAttribute("decoding", "async");

    const browEls = m.brows.map((b) => {
      const path = svg("path", {
        d: `M${b.p0[0]} ${b.p0[1]} Q${b.c[0]} ${b.c[1]} ${b.p1[0]} ${b.p1[1]}`,
        fill: "none", stroke: b.color, "stroke-width": b.width, "stroke-linecap": "round",
      }, g);
      return path;
    });

    const mid = m.eyes.reduce((s, e) => [s[0] + e.cx / m.eyes.length, s[1] + e.cy / m.eyes.length], [0, 0]);
    const eyeEls = m.eyes.map((e, k) => {
      const eg = svg("g", {}, g);
      // soft shadow under the eye (a flat, faint ellipse; no filter)
      svg("ellipse", { cx: e.cx, cy: e.cy + e.ry * 0.16, rx: e.rx * 1.12, ry: e.ry * 1.08, fill: "#000", opacity: ".1" }, eg);
      const inner = svg("g", {}, eg); // moves with the gaze
      const sq = svg("g", {}, inner); // squashed by blinks about the eye centre
      svg("ellipse", { cx: e.cx, cy: e.cy, rx: e.rx, ry: e.ry, fill: "url(#crew-eye-grad)" }, sq);
      svg("ellipse", { cx: e.cx - e.rx * 0.3, cy: e.cy - e.ry * 0.38, rx: e.rx * 0.56, ry: e.ry * 0.4, fill: "#fff", opacity: ".9" }, sq);
      if (m.lashes) {
        // a small curved flick at the outer-top of the eye (away from the other eye)
        const side = e.cx < mid[0] ? -1 : e.cx > mid[0] ? 1 : k ? 1 : -1;
        const a = -0.9; // up and out
        const px = e.cx + side * Math.cos(a + 0) * e.rx * 0.95 * 0.8, py = e.cy + Math.sin(a) * e.ry * 0.95;
        const len = e.rx * 0.9;
        svg("path", {
          d: `M${px} ${py} Q${px + side * len * 0.7} ${py - len * 0.5} ${px + side * len * 1.15} ${py - len * 0.15}`,
          fill: "none", stroke: m.brows[0] ? m.brows[0].color : "#2a1020", "stroke-width": Math.max(1.6, e.rx * 0.28), "stroke-linecap": "round",
        }, sq);
      }
      return { e, eg, inner, sq };
    });

    const blink = { next: 1.2 + rand() * 3.6 + i * 0.35, t: -1, double: false, rand };
    return {
      m, g, browEls, eyeEls, mid, blink, i,
      look: { x: 0, y: 0 }, target: { x: 0, y: 0 },
      perkAt: -1, phase: rand() * TAU,
    };
  });
  host.appendChild(root);

  // ---- input ----
  const pointer = { x: null, y: null };
  const typing = { until: 0, x: 0, y: 0, lastKey: -99 };
  const onPointer = (e) => { pointer.x = e.clientX; pointer.y = e.clientY; };
  const isField = (el) => el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !/^(checkbox|radio|button|submit|range|color|file)$/.test(el.type)) || el.isContentEditable);
  const onTyping = (e) => {
    const el = document.activeElement;
    if (!isField(el)) return;
    const now = performance.now() / 1000;
    if (now - typing.lastKey > 2) perk(now);
    typing.lastKey = now;
    typing.until = now + 1.6;
    const r = el.getBoundingClientRect();
    const len = (el.value || el.textContent || "").length;
    typing.x = r.left + clamp(24 + len * 9, 24, Math.max(24, r.width - 24));
    typing.y = r.top + r.height / 2;
  };
  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("pointerdown", onPointer, { passive: true });
  window.addEventListener("input", onTyping, true);
  window.addEventListener("keydown", onTyping, true);

  let perkStart = -99;
  function perk(now) { perkStart = now; }

  // ---- loop ----
  let visible = true, raf = 0, last = performance.now() / 1000;
  const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => {
    visible = es[es.length - 1].isIntersecting;
    kick();
  }, { rootMargin: "80px" }) : null;
  if (io) io.observe(host);
  const onVis = () => kick();
  document.addEventListener("visibilitychange", onVis);

  function kick() {
    if (!raf && visible && !document.hidden) { last = performance.now() / 1000; raf = requestAnimationFrame(frame); }
  }

  function frame(ts) {
    raf = 0;
    if (!visible || document.hidden) return;
    const now = ts / 1000;
    const dt = Math.min(0.1, Math.max(0.001, now - last));
    last = now;
    const reduce = reduceQ.matches;
    const rect = root.getBoundingClientRect();
    const scale = rect.width / W || 1;
    const smooth = 1 - Math.exp(-12 * dt);
    const following = now < typing.until ? typing : pointer.x !== null ? pointer : null;

    for (const s of members) {
      const m = s.m;
      // gaze
      if (following) {
        const ex = rect.left + s.mid[0] * scale, ey = rect.top + s.mid[1] * scale;
        s.target.x = Math.tanh((following.x - ex) / 240);
        s.target.y = Math.tanh((following.y - ey) / 170);
      } else { s.target.x = 0; s.target.y = 0; }
      s.look.x += (s.target.x - s.look.x) * smooth;
      s.look.y += (s.target.y - s.look.y) * smooth;

      // blink
      const b = s.blink;
      if (b.t < 0 && now >= b.next) { b.t = 0; if (!b.second) b.pending = b.rand() < 0.18; }
      let squash = 1, dip = 0;
      if (b.t >= 0) {
        b.t += dt;
        const D = 0.17, p = b.t / D;
        const k = p < 0.4 ? p / 0.4 : 1 - (p - 0.4) / 0.6; // in 40%, out 60%
        const c = clamp(k, 0, 1);
        squash = 1 - 0.94 * c; dip = 3 * c;
        if (p >= 1) {
          b.t = -1;
          if (b.pending) { b.pending = false; b.second = true; b.next = now + 0.1; }
          else { b.second = false; b.next = now + 2.4 + b.rand() * 3.8; }
        }
      }

      for (const ee of s.eyeEls) {
        const { e } = ee;
        const ox = s.look.x * e.rx * m.travel * 1.1, oy = s.look.y * e.ry * m.travel * 0.6;
        ee.inner.setAttribute("transform", `translate(${ox.toFixed(2)} ${oy.toFixed(2)})`);
        ee.sq.setAttribute("transform", `translate(0 ${(e.cy * (1 - squash)).toFixed(2)}) scale(1 ${squash.toFixed(3)})`);
        ee.eg.firstChild.setAttribute("ry", (e.ry * 1.08 * (0.3 + 0.7 * squash)).toFixed(2));
      }
      const bx = s.look.x * 2.5, by = s.look.y * 3 + dip;
      for (const p of s.browEls) p.setAttribute("transform", `translate(${bx.toFixed(2)} ${by.toFixed(2)})`);

      // body
      let rot = 0, sx = 1, sy = 1, lift = 0;
      if (!reduce) {
        rot = s.look.x * 1.8;
        const br = Math.sin((TAU * now) / 3.6 + s.phase);
        sy = 1 + 0.008 * br; sx = 1 - 0.004 * br;
        if (m.floats) lift += Math.sin((TAU * now) / 2.8 + s.phase) * 3;
        const pt = now - perkStart - s.i * 0.06;
        if (pt >= 0 && pt < 0.6) {
          const v = pt < 0.1 ? pt / 0.1 : Math.exp(-8 * (pt - 0.1)) * Math.cos(16 * (pt - 0.1));
          lift += 4 * v; sy *= 1 + 0.02 * v;
        }
      }
      const [fx, fy] = m.feet;
      s.g.setAttribute("transform", `translate(${fx} ${(fy - lift).toFixed(2)}) rotate(${rot.toFixed(3)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-fx} ${-fy})`);
    }
    raf = requestAnimationFrame(frame);
  }
  kick();

  return {
    destroy() {
      cancelAnimationFrame(raf); raf = 0; visible = false;
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("input", onTyping, true);
      window.removeEventListener("keydown", onTyping, true);
      document.removeEventListener("visibilitychange", onVis);
      if (io) io.disconnect();
      root.remove();
    },
  };
}

document.querySelectorAll("[data-crew-live]").forEach((el) => {
  mountCrew(el).catch(() => { /* decorative: fail quietly */ });
});
