// Ra from the approved render: the painted body (eyes and brows removed) moves as one piece, and only the eyes and
// brows are drawn live on top. Few moving parts, so it keeps the render's realism.
// mountRaRender(el) returns the puppet: lookAt(x, y), blink(), setExpression(name), play(clip), update(t).
const BASE = new URL('./ra-base.png', import.meta.url).href;
const FEET = { x: 631, y: 1073 };                 // where the body squashes from and the floor shadow sits
const EYES = [{ cx: 612.5, cy: 466, rx: 21.5, ry: 45 }, { cx: 776.5, cy: 466, rx: 19.5, ry: 45 }];
const BROWS = [{ d: 'M568 391 Q596 335 625 388', pivot: [596, 376] }, { d: 'M750 386 Q778 337 806 388', pivot: [778, 374] }];

const svgMarkup = (n) => `
<svg viewBox="170 90 920 1040" role="img" aria-label="Ra, the RasanAI mascot" style="overflow:visible">
  <defs>
    <radialGradient id="g-${n}" cx="0.38" cy="0.28" r="0.85"><stop offset="0" stop-color="#34343C"/><stop offset="0.55" stop-color="#121216"/><stop offset="1" stop-color="#050507"/></radialGradient>
    <filter id="soft-${n}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="floor-${n}" x="-30%" y="-200%" width="160%" height="500%"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>
  <ellipse class="floor" cx="${FEET.x}" cy="${FEET.y + 4}" rx="330" ry="26" fill="#3c2d14" opacity="0.22" filter="url(#floor-${n})"/>
  <g class="rig">
    <image href="${BASE}" x="0" y="0" width="1254" height="1254"/>
    <g class="face">
      ${EYES.map((e, i) => `
      <g class="eye" data-i="${i}">
        <ellipse cx="${e.cx}" cy="${e.cy + 2}" rx="${e.rx + 5}" ry="${e.ry + 5}" fill="#9a6200" opacity="0.28" filter="url(#soft-${n})"/>
        <ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" fill="url(#g-${n})"/>
        <ellipse cx="${e.cx - e.rx * 0.32}" cy="${e.cy - e.ry * 0.5}" rx="${e.rx * 0.28}" ry="${e.ry * 0.2}" fill="#fff" opacity="0.92"/>
        <ellipse cx="${e.cx + e.rx * 0.3}" cy="${e.cy + e.ry * 0.45}" rx="${e.rx * 0.18}" ry="${e.ry * 0.08}" fill="#fff" opacity="0.18"/>
      </g>`).join('')}
      ${BROWS.map((b, i) => `<path class="brow" data-i="${i}" d="${b.d}" fill="none" stroke="#141416" stroke-width="11" stroke-linecap="round"/>`).join('')}
      <path class="smile" d="M672 552 Q694 570 716 552" fill="none" stroke="#141416" stroke-width="9" stroke-linecap="round" opacity="0"/>
      <ellipse class="mouthO" cx="694" cy="562" rx="10" ry="13" fill="url(#g-${n})" opacity="0"/>
    </g>
  </g>
</svg>`;

const ease = { inOut: (p) => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2, out: (p) => 1 - Math.pow(1 - p, 3), in: (p) => p * p * p };
const clamp01 = (x) => Math.min(1, Math.max(0, x)), seg = (p, a, b) => clamp01((p - a) / (b - a));
const settle = (p, f = 3, d = 5) => Math.exp(-d * p) * Math.cos(f * 2 * Math.PI * p);

export const EXPRESSIONS = {
  neutral:   { browY: 0,   browTilt: 0,   eyeY: 1,    eyeS: 1,    smile: 0,   mouthO: 0 },
  happy:     { browY: -8,  browTilt: -5,  eyeY: 0.62, eyeS: 1,    smile: 1,   mouthO: 0 },
  surprised: { browY: -22, browTilt: 0,   eyeY: 1.1,  eyeS: 1.1,  smile: 0,   mouthO: 1 },
  focused:   { browY: 8,   browTilt: 13,  eyeY: 0.74, eyeS: 0.97, smile: 0,   mouthO: 0 },
  sleepy:    { browY: 6,   browTilt: -4,  eyeY: 0.22, eyeS: 1,    smile: 0.35, mouthO: 0 }
};
export const CLIPS = {
  blink: { dur: 0.17, fn: (p, ch) => { ch.blink = Math.max(ch.blink, p < 0.4 ? ease.in(p / 0.4) : 1 - ease.out((p - 0.4) / 0.6)); } },
  hop: { dur: 0.95, fn: (p, ch) => {
    ch.squash += 0.11 * Math.sin(Math.PI * seg(p, 0, 0.2));
    const air = seg(p, 0.18, 0.62);
    if (air > 0 && air < 1) { ch.lift += 170 * Math.sin(Math.PI * air); ch.squash -= 0.06 * Math.sin(Math.PI * air); }
    const land = seg(p, 0.62, 1); if (land > 0) ch.squash += 0.12 * settle(land, 2.2, 4.5);
    ch.brow -= 10 * Math.sin(Math.PI * air);
  } },
  // "Action!": a quick crouch, a pop up with a happy squint, and a springy landing
  action: { dur: 1.0, fn: (p, ch) => {
    ch.squash += 0.08 * Math.sin(Math.PI * seg(p, 0, 0.16));
    const pop = seg(p, 0.14, 0.42); if (pop > 0 && pop < 1) { ch.lift += 46 * Math.sin(Math.PI * pop); ch.squash -= 0.05 * Math.sin(Math.PI * pop); }
    const land = seg(p, 0.42, 1); if (land > 0) ch.squash += 0.07 * settle(land, 2.6, 5);
    ch.happy = Math.max(ch.happy, Math.sin(Math.PI * seg(p, 0.1, 0.95)));
  } },
  nod: { dur: 0.8, fn: (p, ch) => { ch.nod += 2.2 * Math.sin(2 * Math.PI * 2 * p) * (1 - p); ch.eyeDrop += 6 * Math.max(0, Math.sin(2 * Math.PI * 2 * p)) * (1 - p); } },
  wiggle: { dur: 1.0, fn: (p, ch) => { ch.tilt += 3.2 * Math.sin(2 * Math.PI * 2.5 * p) * (1 - p); } },
  lookAround: { dur: 2.8, fn: (p, ch) => {
    const k = [[0, 0, 0], [0.18, -1, 0.1], [0.42, -1, 0.1], [0.55, 1, -0.1], [0.78, 1, 0.5], [1, 0, 0]];
    for (let i = 0; i < k.length - 1; i++) { const [a, x0, y0] = k[i], [b, x1, y1] = k[i + 1];
      if (p >= a && p <= b) { const q = ease.inOut((p - a) / (b - a)); ch.lookX += x0 + (x1 - x0) * q; ch.lookY += y0 + (y1 - y0) * q; break; } }
  } }
};

class RenderPuppet {
  constructor(svg) {
    this.svg = svg;
    const q = (s) => svg.querySelector(s), qa = (s) => [...svg.querySelectorAll(s)];
    this.P = { rig: q('.rig'), face: q('.face'), floor: q('.floor'), eyes: qa('.eye'), brows: qa('.brow'), smile: q('.smile'), mouthO: q('.mouthO') };
    this.look = { x: 0, y: 0 }; this.lookTarget = { x: 0, y: 0 };
    this.ex = { ...EXPRESSIONS.neutral }; this.exTarget = { ...EXPRESSIONS.neutral };
    this.active = []; this.autoBlink = true; this.idle = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.now = 0; this._last = null; this._seed = 11; this._next = 1.2;
  }
  lookAt(x, y) { this.lookTarget.x = Math.max(-1, Math.min(1, x)); this.lookTarget.y = Math.max(-1, Math.min(1, y)); }
  blink() { this.play('blink'); }
  setExpression(n) { if (EXPRESSIONS[n]) Object.assign(this.exTarget, EXPRESSIONS[n]); }
  play(name, at = this.now) { const c = CLIPS[name]; if (!c) return; this.active = this.active.filter((a) => a.name !== name); this.active.push({ name, start: at, dur: c.dur, fn: c.fn }); }
  _rand() { this._seed = (this._seed * 16807) % 2147483647; return this._seed / 2147483647; }
  update(t) {
    const dt = this._last == null ? 0 : Math.min(0.1, Math.max(0, t - this._last)); this._last = t; this.now = t;
    const k = (r) => 1 - Math.exp(-r * dt);
    this.look.x += (this.lookTarget.x - this.look.x) * k(12); this.look.y += (this.lookTarget.y - this.look.y) * k(12);
    for (const key in this.ex) this.ex[key] += (this.exTarget[key] - this.ex[key]) * k(9);
    const ch = { squash: 0, lift: 0, tilt: 0, nod: 0, blink: 0, brow: 0, lookX: 0, lookY: 0, happy: 0, eyeDrop: 0 };
    if (this.idle) { ch.squash += 0.011 * Math.sin(t * 2 * Math.PI / 3.4); ch.tilt += 0.5 * Math.sin(t * 2 * Math.PI / 5.3); }
    if (this.autoBlink && t >= this._next) { this.play('blink', t); if (this._rand() < 0.18) this.play('blink', t + 0.24); this._next = t + 2.4 + this._rand() * 3.2; }
    this.active = this.active.filter((a) => t < a.start + a.dur + 1e-6);
    for (const a of this.active) if (t >= a.start) a.fn(Math.min(1, (t - a.start) / a.dur), ch);
    this.draw(ch);
  }
  draw(ch) {
    const P = this.P, ex = this.ex, set = (el, tr) => el.setAttribute('transform', tr);
    const lx = Math.max(-1.3, Math.min(1.3, this.look.x + ch.lookX)), ly = Math.max(-1.3, Math.min(1.3, this.look.y + ch.lookY));
    // the whole body: squash from the feet, hop, a small lean toward where Ra looks, the nod
    const sq = ch.squash;
    set(P.rig, `translate(${lx * 5} ${-ch.lift}) translate(${FEET.x} ${FEET.y}) rotate(${ch.tilt + lx * 1.3 + ch.nod}) scale(${1 + sq * 0.5} ${1 - sq}) translate(${-FEET.x} ${-FEET.y})`);
    // eyes slide over the face with the gaze; blink and expressions squash them about their centres
    const fx = lx * 24, fy = -ly * 15 + ch.eyeDrop;
    set(P.face, `translate(${fx} ${fy})`);
    const happy = ch.happy, eyeY = ex.eyeY * (1 - 0.38 * happy), open = eyeY * (1 - 0.94 * ch.blink);
    P.eyes.forEach((g, i) => { const e = EYES[i]; set(g, `translate(${e.cx} ${e.cy}) scale(${ex.eyeS} ${ex.eyeS * Math.max(0.06, open)}) translate(${-e.cx} ${-e.cy})`); });
    const by = ex.browY + ch.brow - 6 * happy + ch.blink * 5 - ly * 5;
    P.brows.forEach((b, i) => { const [px, py] = BROWS[i].pivot, s = i === 0 ? 1 : -1; set(b, `translate(${-fx * 0.35} ${by - fy * 0.3}) rotate(${s * ex.browTilt} ${px} ${py})`); });
    P.smile.setAttribute('opacity', Math.max(ex.smile, happy).toFixed(3));
    P.mouthO.setAttribute('opacity', ex.mouthO.toFixed(3));
    set(P.mouthO, `translate(694 562) scale(${0.4 + 0.6 * ex.mouthO}) translate(-694 -562)`);
    // the floor shadow stays on the ground: smaller and fainter the higher Ra goes
    const f = Math.min(1, ch.lift / 200);
    set(P.floor, `translate(${FEET.x} ${FEET.y}) scale(${(1 - f * 0.45) * (1 + sq * 0.4)} 1) translate(${-FEET.x} ${-FEET.y})`);
    P.floor.setAttribute('opacity', (0.22 * (1 - f * 0.6)).toFixed(3));
  }
}

let uid = 0;
export function mountRaRender(el) {
  const n = ++uid; el.innerHTML = svgMarkup(n);
  return new RenderPuppet(el.querySelector('svg'));
}
