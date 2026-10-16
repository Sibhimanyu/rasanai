// Rasan as a 2D puppet: layered vector art (clay shading, soft shadows) whose parts are moved by code.
// mountRa(el) draws Rasan into `el` and returns the puppet: lookAt(x, y), blink(), setExpression(name), play(clip), update(t).
const SVG = `<svg class="ra-puppet" viewBox="0 0 600 660" role="img" aria-label="Rasan, the RasanAI mascot">
  <defs>
    <!-- clay shading: warm light from the upper left, a deeper turmeric where the form turns away -->
    <radialGradient id="raBody" cx="0.36" cy="0.3" r="0.78">
      <stop offset="0" stop-color="#FFD866"/><stop offset="0.42" stop-color="#F4B71E"/><stop offset="0.82" stop-color="#E29E0E"/><stop offset="1" stop-color="#C98208"/>
    </radialGradient>
    <radialGradient id="raLimb" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#FFD25A"/><stop offset="0.55" stop-color="#F0B01A"/><stop offset="1" stop-color="#D38E0A"/>
    </radialGradient>
    <radialGradient id="raFoot" cx="0.4" cy="0.25" r="0.9">
      <stop offset="0" stop-color="#F8C23A"/><stop offset="1" stop-color="#C98208"/>
    </radialGradient>
    <radialGradient id="eyeGloss" cx="0.4" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#3B3B46"/><stop offset="0.6" stop-color="#16161C"/><stop offset="1" stop-color="#0A0A0E"/>
    </radialGradient>
    <linearGradient id="felt" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="#4A4A52"/><stop offset="0.45" stop-color="#2C2C33"/><stop offset="1" stop-color="#18181D"/>
    </linearGradient>
    <linearGradient id="brimGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3A3A42"/><stop offset="1" stop-color="#141418"/>
    </linearGradient>
    <linearGradient id="slate" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0" stop-color="#2E2E35"/><stop offset="1" stop-color="#16161B"/>
    </linearGradient>
    <pattern id="stripes" width="34" height="24" patternUnits="userSpaceOnUse" patternTransform="skewX(-35)">
      <rect width="34" height="24" fill="#1D1D22"/><rect x="0" width="16" height="24" fill="#F2EFE7"/>
    </pattern>
    <!-- soft blurs for shadows and light -->
    <filter id="blur4" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="blur10" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="10"/></filter>
    <filter id="blur18" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="18"/></filter>
    <!-- a faint clay grain over everything turmeric -->
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.4  0 0 0 0 0.2  0 0 0 0.09 0"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <path id="bodyShape" d="M300 150 C 402 150 466 258 497 376 C 522 478 488 560 300 563 C 112 560 78 478 103 376 C 134 258 198 150 300 150 Z"/>
    <clipPath id="bodyClip"><use href="#bodyShape"/></clipPath>
  </defs>

  <!-- contact shadow on the floor; it shrinks and fades when Rasan leaves the ground -->
  <ellipse id="contact" cx="300" cy="592" rx="215" ry="24" fill="#3c2d14" opacity="0.2" filter="url(#blur10)"/>

  <g id="rig">
    <!-- feet -->
    <g id="feet">
      <ellipse cx="214" cy="566" rx="50" ry="27" fill="url(#raFoot)"/>
      <ellipse cx="386" cy="566" rx="50" ry="27" fill="url(#raFoot)"/>
      <ellipse cx="200" cy="556" rx="22" ry="8" fill="#FFE08A" opacity="0.35" filter="url(#blur4)"/>
      <ellipse cx="372" cy="556" rx="22" ry="8" fill="#FFE08A" opacity="0.35" filter="url(#blur4)"/>
    </g>

    <!-- body: base colour, form shadow, bounce light, rim, highlight, grain; all clipped to the body -->
    <g id="body">
      <use href="#bodyShape" fill="url(#raBody)"/>
      <g clip-path="url(#bodyClip)">
        <use href="#bodyShape" fill="none" stroke="#A86A04" stroke-width="70" opacity="0.32" transform="translate(26 30)" filter="url(#blur18)"/>
        <ellipse cx="300" cy="590" rx="230" ry="60" fill="#FFCF4A" opacity="0.28" filter="url(#blur18)"/>
        <use href="#bodyShape" fill="none" stroke="#FFF1C2" stroke-width="16" opacity="0.38" transform="translate(-10 -12)" filter="url(#blur10)"/>
        <ellipse id="spec" cx="222" cy="226" rx="52" ry="34" fill="#FFF6D8" opacity="0.42" filter="url(#blur18)"/>
        <use href="#bodyShape" filter="url(#grain)" fill="#000"/>
        <!-- the board's soft shadow on the belly -->
        <rect id="boardShadow" x="214" y="428" width="190" height="140" rx="14" fill="#8A5600" opacity="0.28" filter="url(#blur18)"/>
      </g>
    </g>

    <!-- face: everything that moves with the gaze -->
    <g id="face">
      <g id="mouth">
        <path id="smile" d="M284 338 Q300 351 316 338" fill="none" stroke="#141418" stroke-width="7" stroke-linecap="round" opacity="0"/>
        <ellipse id="mouthO" cx="300" cy="343" rx="7" ry="9" fill="url(#eyeGloss)" opacity="0"/>
      </g>
      <g id="eyeL"><ellipse cx="258" cy="298" rx="13.5" ry="23" fill="url(#eyeGloss)"/><ellipse cx="253" cy="287" rx="4" ry="6" fill="#fff" opacity="0.85"/></g>
      <g id="eyeR"><ellipse cx="342" cy="298" rx="13.5" ry="23" fill="url(#eyeGloss)"/><ellipse cx="337" cy="287" rx="4" ry="6" fill="#fff" opacity="0.85"/></g>
      <path id="browL" d="M238 260 Q257 247 276 258" fill="none" stroke="#17171C" stroke-width="7" stroke-linecap="round"/>
      <path id="browR" d="M324 258 Q343 247 362 260" fill="none" stroke="#17171C" stroke-width="7" stroke-linecap="round"/>
    </g>

    <!-- cap: a soft felt newsboy, tilted a little -->
    <g id="cap">
      <ellipse cx="306" cy="214" rx="132" ry="18" fill="#3c2a06" opacity="0.35" filter="url(#blur10)"/>
      <path d="M176 210 C 182 150 252 116 320 120 C 398 124 448 160 442 210 C 404 196 232 196 176 210 Z" fill="url(#felt)"/>
      <path d="M200 176 C 240 140 330 128 396 150" fill="none" stroke="#6A6A74" stroke-width="5" opacity="0.45" filter="url(#blur4)"/>
      <path d="M190 212 C 250 194 368 194 432 212 C 440 222 434 236 420 238 C 352 224 266 224 204 236 C 188 234 184 220 190 212 Z" fill="url(#brimGrad)"/>
      <path d="M210 214 C 266 202 360 202 418 216" fill="none" stroke="#6E6E78" stroke-width="3" opacity="0.5"/>
      <circle cx="256" cy="160" r="5.5" fill="#C9973A"/><circle cx="254.5" cy="158.5" r="2" fill="#F3D79A"/>
    </g>

    <!-- clapperboard: slate, fixed stick and the clapper hinged at its left end -->
    <g id="board"><g transform="translate(0 26)">
      <rect x="204" y="408" width="194" height="126" rx="9" fill="url(#slate)"/>
      <rect x="216" y="452" width="170" height="2" fill="#3C3C45"/><rect x="216" y="490" width="170" height="2" fill="#3C3C45"/>
      <rect x="204" y="384" width="194" height="24" rx="5" fill="url(#stripes)" stroke="#16161B" stroke-width="3"/>
      <g id="clapper">
        <rect x="204" y="358" width="194" height="24" rx="5" fill="url(#stripes)" stroke="#16161B" stroke-width="3"/>
      </g>
      <circle cx="214" cy="396" r="3.5" fill="#9A9AA4"/><circle cx="214" cy="370" r="3.5" fill="#9A9AA4"/>
    </g></g>

    <!-- arms: soft clay coils from the sides, round mitten hands gripping the slate -->
    <g id="arms">
      <path id="armL" d="M110 384 C 128 448 176 474 214 474" fill="none" stroke="url(#raLimb)" stroke-width="56" stroke-linecap="round"/>
      <path id="armR" d="M490 384 C 472 448 424 474 388 474" fill="none" stroke="url(#raLimb)" stroke-width="56" stroke-linecap="round"/>
      <circle id="handL" cx="212" cy="474" r="33" fill="url(#raLimb)"/>
      <circle id="handR" cx="390" cy="474" r="33" fill="url(#raLimb)"/>
      <ellipse id="handLhi" cx="202" cy="462" rx="12" ry="8" fill="#FFE59A" opacity="0.5" filter="url(#blur4)"/>
      <ellipse id="handRhi" cx="380" cy="462" rx="12" ry="8" fill="#FFE59A" opacity="0.5" filter="url(#blur4)"/>
    </g>
  </g>
</svg>`;

// ---------- Rasan's 2D puppet ----------
 const ease = { inOut: (p) => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2, out: (p) => 1 - Math.pow(1 - p, 3), in: (p) => p * p * p,
  backOut: (p) => { const c = 1.9; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); } };
const clamp01 = (x) => Math.min(1, Math.max(0, x)), seg = (p, a, b) => clamp01((p - a) / (b - a));
const settle = (p, f = 3, d = 5) => Math.exp(-d * p) * Math.cos(f * 2 * Math.PI * p);

const EXPRESSIONS = {
  neutral:   { browY: 0,  browTilt: 0,   eyeY: 1,    eyeS: 1,    smile: 0,   mouthO: 0 },
  happy:     { browY: -4, browTilt: -6,  eyeY: 0.6,  eyeS: 1,    smile: 1,   mouthO: 0 },
  surprised: { browY: -12, browTilt: 0,  eyeY: 1.12, eyeS: 1.12, smile: 0,   mouthO: 1 },
  focused:   { browY: 4,  browTilt: 14,  eyeY: 0.75, eyeS: 0.96, smile: 0,   mouthO: 0 },
  sleepy:    { browY: 3,  browTilt: -3,  eyeY: 0.28, eyeS: 1,    smile: 0.4, mouthO: 0 }
};
const CLIPS = {
  blink: { dur: 0.17, fn: (p, ch) => { ch.blink = Math.max(ch.blink, p < 0.4 ? ease.in(p / 0.4) : 1 - ease.out((p - 0.4) / 0.6)); } },
  hop: { dur: 0.95, fn: (p, ch) => {
    ch.squash += 0.12 * Math.sin(Math.PI * seg(p, 0, 0.2));
    const air = seg(p, 0.18, 0.62);
    if (air > 0 && air < 1) { ch.lift += 120 * Math.sin(Math.PI * air); ch.squash -= 0.07 * Math.sin(Math.PI * air); }
    const land = seg(p, 0.62, 1); if (land > 0) ch.squash += 0.14 * settle(land, 2.2, 4.5);
    ch.brow -= 6 * Math.sin(Math.PI * air);
  } },
  nod: { dur: 0.8, fn: (p, ch) => { ch.nod += 10 * Math.sin(2 * Math.PI * 2 * p) * (1 - p); } },
  wiggle: { dur: 1.0, fn: (p, ch) => { ch.tilt += 6 * Math.sin(2 * Math.PI * 2.5 * p) * (1 - p); } },
  lookAround: { dur: 2.8, fn: (p, ch) => {
    const k = [[0, 0, 0], [0.18, -1, 0.1], [0.42, -1, 0.1], [0.55, 1, -0.1], [0.78, 1, 0.5], [1, 0, 0]];
    for (let i = 0; i < k.length - 1; i++) { const [a, x0, y0] = k[i], [b, x1, y1] = k[i + 1];
      if (p >= a && p <= b) { const q = ease.inOut((p - a) / (b - a)); ch.lookX += x0 + (x1 - x0) * q; ch.lookY += y0 + (y1 - y0) * q; break; } }
  } },
  // "Action!": lift the board, open the clapper, hold, snap it shut with a squash, settle
  action: { dur: 1.5, fn: (p, ch) => {
    const up = ease.out(Math.min(1, p / 0.22)), down = p > 0.7 ? ease.inOut(Math.min(1, (p - 0.7) / 0.3)) : 0;
    ch.raise += 26 * up * (1 - down); ch.swing += 4 * up * (1 - down);
    const open = p < 0.42 ? ease.backOut(Math.min(1, p / 0.28)) : p < 0.5 ? 1 - ease.in((p - 0.42) / 0.08) : 0;
    ch.clap += Math.max(0, open);
    const snap = p >= 0.5 ? Math.exp(-9 * (p - 0.5)) * Math.cos(28 * (p - 0.5)) : 0;
    ch.squash += 0.06 * snap; ch.brow -= 6 * up * (1 - down);
    if (p >= 0.5 && p < 0.58) ch.blink = Math.max(ch.blink, 0.6);
  } }
};

class Puppet {
  constructor(P) {
    this.P = P;
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
    const ch = { squash: 0, lift: 0, tilt: 0, nod: 0, blink: 0, brow: 0, lookX: 0, lookY: 0, clap: 0, raise: 0, swing: 0 };
    if (this.idle) { ch.squash += 0.013 * Math.sin(t * 2 * Math.PI / 3.4); ch.tilt += 1.1 * Math.sin(t * 2 * Math.PI / 5.3); }
    if (this.autoBlink && t >= this._next) { this.play('blink', t); if (this._rand() < 0.18) this.play('blink', t + 0.24); this._next = t + 2.4 + this._rand() * 3.2; }
    this.active = this.active.filter((a) => t < a.start + a.dur + 1e-6);
    for (const a of this.active) if (t >= a.start) a.fn(Math.min(1, (t - a.start) / a.dur), ch);
    this.draw(ch);
  }
  draw(ch) {
    const P = this.P;
    const ex = this.ex, lx = Math.max(-1.3, Math.min(1.3, this.look.x + ch.lookX)), ly = Math.max(-1.3, Math.min(1.3, this.look.y + ch.lookY));
    const set = (el, tr) => el.setAttribute('transform', tr);
    // body: squash and stretch from the feet (300, 590), hop, sway, nod
    const sq = ch.squash;
    set(P.rig, `translate(0 ${-ch.lift}) translate(300 590) rotate(${ch.tilt + ch.nod * 0.4}) scale(${1 + sq * 0.55} ${1 - sq}) translate(-300 -590)`);
    // 2.5D turn: the face slides with the gaze, the cap a little less, the highlight the other way
    const fx = lx * 26, fy = -ly * 16 + ch.nod * 1.2;
    set(P.face, `translate(${fx} ${fy})`);
    set(P.cap, `translate(${lx * 9} ${-ly * 4 + ch.nod * 0.5}) rotate(${-4 + lx * 1.5} 306 190)`);
    set(P.spec, `translate(${-lx * 14} ${ly * 8})`);
    // eyes: blink squashes them toward their centre; expressions narrow or widen them
    const open = ex.eyeY * (1 - 0.94 * ch.blink);
    for (const [el, cx] of [[P.eyeL, 258], [P.eyeR, 342]]) set(el, `translate(${cx} 298) scale(${ex.eyeS} ${ex.eyeS * Math.max(0.06, open)}) translate(${-cx} -298)`);
    // brows: lift with surprise, angle in when focused, dip with a blink
    const by = ex.browY + ch.brow + ch.blink * 3 - ly * 3;
    set(P.browL, `translate(0 ${by}) rotate(${ex.browTilt} 257 254)`);
    set(P.browR, `translate(0 ${by}) rotate(${-ex.browTilt} 343 254)`);
    P.smile.setAttribute('opacity', ex.smile.toFixed(3));
    P.mouthO.setAttribute('opacity', ex.mouthO.toFixed(3));
    set(P.mouthO, `translate(300 356) scale(${0.4 + 0.6 * ex.mouthO}) translate(-300 -356)`);
    // board, clapper, hands and arms move together
    const bx = lx * 6, byy = 26 - ch.raise;
    set(P.board, `translate(${bx} ${-ch.raise}) rotate(${ch.swing} 300 496)`);
    set(P.clapper, `rotate(${-ch.clap * 34} 206 382)`);
    set(P.boardShadow, `translate(${bx * 0.6} ${-ch.raise * 0.6})`);
    const hL = { x: 212 + bx, y: 474 + byy }, hR = { x: 390 + bx, y: 474 + byy };
    P.handL.setAttribute('cx', hL.x); P.handL.setAttribute('cy', hL.y); P.handR.setAttribute('cx', hR.x); P.handR.setAttribute('cy', hR.y);
    set(P.handLhi, `translate(${bx} ${byy})`); set(P.handRhi, `translate(${bx} ${byy})`);
    P.armL.setAttribute('d', `M110 384 C 128 ${448 + byy * 0.4} ${176 + bx} ${hL.y} ${hL.x + 2} ${hL.y}`);
    P.armR.setAttribute('d', `M490 384 C 472 ${448 + byy * 0.4} ${424 + bx} ${hR.y} ${hR.x - 2} ${hR.y}`);
    // the floor shadow shrinks and fades as Rasan rises
    const f = Math.min(1, ch.lift / 140);
    set(P.contact, `translate(300 592) scale(${1 - f * 0.45}) translate(-300 -592)`); P.contact.setAttribute('opacity', (0.2 * (1 - f * 0.6)).toFixed(3));
  }
}


let uid = 0;
export function mountRa(el) {
  // ids inside the SVG are made unique so several puppets can share a page
  const n = ++uid;
  el.innerHTML = SVG.replace(/id="([^"]+)"/g, `id="$1-${n}"`).replace(/url\(#([^)]+)\)/g, `url(#$1-${n})`).replace(/href="#([^"]+)"/g, `href="#$1-${n}"`);
  const q = (id) => el.querySelector(`#${id}-${n}`);
  const P = {};
  for (const k of ['rig', 'face', 'eyeL', 'eyeR', 'browL', 'browR', 'smile', 'mouthO', 'cap', 'board', 'clapper', 'spec', 'contact', 'boardShadow', 'armL', 'armR', 'handL', 'handR', 'handLhi', 'handRhi']) P[k] = q(k);
  return new Puppet(P);
}
export { EXPRESSIONS, CLIPS };
