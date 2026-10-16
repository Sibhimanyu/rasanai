// RasanAI crew kit: the shared parts and motion every crew character is built from.
// A character is a soft clay body (a deformed sphere) with separate, animatable parts on its surface:
// eyes, brows, mouth, arms, feet and one prop. All motion is a pure function of time, so a film renders the same every time.
import * as THREE from '../../../../skills/rasanai/stage3d/three.module.min.js';
import { RoomEnvironment } from '../../../../skills/rasanai/stage3d/addons/environments/RoomEnvironment.js';

export { THREE };

export const PALETTE = {
    turmeric: '#EFB21A', blue: '#2A31A8', indigo: '#1B1F5E', silk: '#B3165A', leaf: '#1E5A3C',
    mist: '#DFE3EE', graphite: '#3F4368', rice: '#F1F0EC', ink: '#121216', board: '#1C1C21', brass: '#C9973A'
};

// ---------- materials ----------
let grainTex = null;
function grain() {
    if (grainTex) return grainTex;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), img = g.createImageData(256, 256);
    let s = 1234567; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < img.data.length; i += 4) { const v = 120 + rnd() * 16; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    grainTex = new THREE.CanvasTexture(c); grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping; grainTex.repeat.set(5, 5);
    return grainTex;
}
/** Smooth matte clay: a soft sheen at grazing angles and a faint grain, never glossy. */
export function clay(hex, { roughness = 0.86, bump = 0.14 } = {}) {
    const color = new THREE.Color(hex);
    return new THREE.MeshPhysicalMaterial({
        color, roughness, metalness: 0, sheen: 0.5, sheenRoughness: 0.55,
        sheenColor: color.clone().lerp(new THREE.Color('#ffffff'), 0.2), bumpMap: grain(), bumpScale: bump,
        envMapIntensity: 0.35
    });
}
/** The glossy black of the eyes: a clear coat gives the catchlight. */
export function gloss(hex = PALETTE.ink) {
    return new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06 });
}
export function brass() { return new THREE.MeshPhysicalMaterial({ color: PALETTE.brass, metalness: 1, roughness: 0.34 }); }

// ---------- bodies ----------
/** A body is a unit sphere pushed into shape by `shape(v)`, which turns a unit direction into a surface point. */
export function softBody(shape, segs = 160) {
    const geo = new THREE.SphereGeometry(1, segs, Math.round(segs / 2));
    const p = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); shape(v); p.setXYZ(i, v.x, v.y, v.z); }
    geo.computeVertexNormals();
    return geo;
}
const UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0);
/** The surface point and its outward normal in the direction `dir`. */
export function surfaceFrame(shape, dir) {
    const d = dir.clone().normalize(), p = shape(d.clone());
    const t1 = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.98 ? UP : RIGHT).normalize();
    const t2 = new THREE.Vector3().crossVectors(d, t1).normalize(), e = 0.003;
    const a = shape(d.clone().addScaledVector(t1, e).normalize()).sub(p);
    const b = shape(d.clone().addScaledVector(t2, e).normalize()).sub(p);
    const n = new THREE.Vector3().crossVectors(a, b).normalize();
    if (n.dot(d) < 0) n.negate();
    return { p, n };
}
const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3();
/** Sits `obj` on the surface: local +Z along the normal, local +Y as close to world up as the surface allows. */
export function stick(obj, { p, n }, lift = 0, spin = 0) {
    _x.crossVectors(UP, n); if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0); _x.normalize();
    _y.crossVectors(n, _x).normalize();
    obj.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, n));
    if (spin) obj.rotateZ(spin);
    obj.position.copy(p).addScaledVector(n, lift);
}

// ---------- face parts ----------
function arcTube(width, sag, radius, mat) {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-width / 2, 0, 0), new THREE.Vector3(0, sag * 2, 0), new THREE.Vector3(width / 2, 0, 0));
    const geo = new THREE.TubeGeometry(curve, 24, radius, 10, false);
    // round the ends so the stroke reads as one clay coil
    const g = new THREE.Group(); g.add(new THREE.Mesh(geo, mat));
    for (const x of [-width / 2, width / 2]) { const cap = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), mat); cap.position.x = x; g.add(cap); }
    return g;
}

// ---------- easing ----------
export const ease = {
    inOut: (p) => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2,
    out: (p) => 1 - Math.pow(1 - p, 3),
    in: (p) => p * p * p,
    backOut: (p) => { const c = 1.9; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); }
};
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (p, a, b) => clamp01((p - a) / (b - a));
/** A damped spring settling from 1 to 0 over p in [0, 1]: the wobble after a landing or a snap. */
const settle = (p, freq = 3, damp = 5) => Math.exp(-damp * p) * Math.cos(freq * 2 * Math.PI * p);

export const EXPRESSIONS = {
    neutral:   { browY: 0,     browTilt: 0,     eyeY: 1,    eyeS: 1,    smile: 0,   mouthO: 0 },
    happy:     { browY: 0.035, browTilt: -0.12, eyeY: 0.68, eyeS: 1,    smile: 1,   mouthO: 0 },
    surprised: { browY: 0.055, browTilt: 0,     eyeY: 1.12, eyeS: 1.12, smile: 0,   mouthO: 1 },
    focused:   { browY: -0.03, browTilt: 0.28,  eyeY: 0.78, eyeS: 0.96, smile: 0,   mouthO: 0 },
    sleepy:    { browY: -0.02, browTilt: -0.05, eyeY: 0.32, eyeS: 1,    smile: 0.3, mouthO: 0 }
};

/** The clips every character shares. Each writes into the channel bag `ch` for its progress `p` in [0, 1]. */
export const CLIPS = {
    blink: { dur: 0.18, fn: (p, ch) => { ch.blink = Math.max(ch.blink, p < 0.4 ? ease.in(p / 0.4) : 1 - ease.out((p - 0.4) / 0.6)); } },
    hop: {
        dur: 0.95, fn: (p, ch) => {
            ch.squash += 0.13 * Math.sin(Math.PI * seg(p, 0, 0.2));                 // anticipation
            const air = seg(p, 0.18, 0.62);
            if (air > 0 && air < 1) { ch.lift += 0.42 * Math.sin(Math.PI * air); ch.squash -= 0.07 * Math.sin(Math.PI * air); }
            const land = seg(p, 0.62, 1);
            if (land > 0) ch.squash += 0.15 * settle(land, 2.2, 4.5);              // landing and wobble
            ch.brow += 0.04 * Math.sin(Math.PI * air);
        }
    },
    nod: { dur: 0.8, fn: (p, ch) => { ch.nod += 0.13 * Math.sin(2 * Math.PI * 2 * p) * (1 - p); } },
    lookAround: {
        dur: 2.8, fn: (p, ch) => {
            const keys = [[0, 0, 0], [0.18, -1, 0.1], [0.42, -1, 0.1], [0.55, 1, -0.1], [0.78, 1, 0.5], [1, 0, 0]];
            for (let i = 0; i < keys.length - 1; i++) {
                const [a, x0, y0] = keys[i], [b, x1, y1] = keys[i + 1];
                if (p >= a && p <= b) { const q = ease.inOut((p - a) / (b - a)); ch.lookX += x0 + (x1 - x0) * q; ch.lookY += y0 + (y1 - y0) * q; break; }
            }
        }
    }
};

// ---------- limbs ----------
const LIMB_SEG = 28, LIMB_RAD = 18;
function limbGeometry() {
    const geo = new THREE.BufferGeometry(), n = (LIMB_SEG + 1) * (LIMB_RAD + 1), idx = [];
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const uv = new Float32Array(n * 2);
    for (let i = 0; i <= LIMB_SEG; i++) for (let j = 0; j <= LIMB_RAD; j++) { const k = i * (LIMB_RAD + 1) + j; uv[k * 2] = i / LIMB_SEG; uv[k * 2 + 1] = j / LIMB_RAD; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    for (let i = 0; i < LIMB_SEG; i++) for (let j = 0; j < LIMB_RAD; j++) {
        const a = i * (LIMB_RAD + 1) + j, b = a + LIMB_RAD + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    geo.setIndex(idx); return geo;
}
const _P = new THREE.Vector3(), _T = new THREE.Vector3(), _N = new THREE.Vector3(), _B = new THREE.Vector3(), _R = new THREE.Vector3(0.3, 1, 0.2).normalize();
/** Rewrites a limb's vertices along `curve` with radius `radius(u)`, so arms can move every frame without new geometry. */
function updateLimb(geo, curve, radius) {
    const pos = geo.attributes.position;
    for (let i = 0; i <= LIMB_SEG; i++) {
        const u = i / LIMB_SEG; curve.getPoint(u, _P); curve.getTangent(u, _T);
        _N.crossVectors(_T, _R).normalize(); _B.crossVectors(_T, _N).normalize();
        const r = radius(u);
        for (let j = 0; j <= LIMB_RAD; j++) {
            const a = (j / LIMB_RAD) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
            pos.setXYZ(i * (LIMB_RAD + 1) + j, _P.x + r * (c * _N.x + s * _B.x), _P.y + r * (c * _N.y + s * _B.y), _P.z + r * (c * _N.z + s * _B.z));
        }
    }
    pos.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
}

/**
 * A crew character. `def` gives the body shape and colour, where the features sit, and an optional `build(char)` for
 * props and per-character clips. Drive it with `update(t)` (seconds); control it with lookAt, blink, setExpression, play.
 */
export class Character {
    constructor(def) {
        this.def = def;
        this.name = def.name;
        this.root = new THREE.Group(); this.root.name = def.name;
        this.rig = new THREE.Group(); this.rig.name = 'rig'; this.root.add(this.rig);
        this.clips = { ...CLIPS, ...(def.clips || {}) };
        this.active = [];
        this.look = new THREE.Vector2(); this.lookTarget = new THREE.Vector2();
        this.ex = { ...EXPRESSIONS.neutral }; this.exTarget = { ...EXPRESSIONS.neutral };
        this.autoBlink = true; this.idle = true; this.now = 0; this._last = null;
        this._seed = def.seed || 7; this._nextBlink = 1.2;

        const skin = clay(def.color), dark = gloss();
        this.mats = { skin, dark };
        // body
        this.body = new THREE.Mesh(softBody(def.shape), skin); this.body.name = 'body';
        this.body.position.y = def.bodyY; this.body.castShadow = true; this.body.receiveShadow = true;
        this.rig.add(this.body);
        // eyes: glossy vertical ovals sunk a little into the clay
        const [ex, ey, ez] = def.eyes.radii;
        this.eyes = [-1, 1].map((side) => {
            const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), dark); m.name = side < 0 ? 'eyeL' : 'eyeR';
            m.userData.base = new THREE.Vector3(side * def.eyes.dir[0], def.eyes.dir[1], def.eyes.dir[2]);
            m.userData.radii = new THREE.Vector3(ex, ey, ez); m.castShadow = true;
            this.body.add(m); return m;
        });
        // brows: small dark clay strokes
        const b = def.brows;
        this.brows = [-1, 1].map((side) => {
            const g = arcTube(b.width, b.sag, b.radius, dark); g.name = side < 0 ? 'browL' : 'browR';
            g.userData.base = new THREE.Vector3(side * b.dir[0], b.dir[1], b.dir[2]); g.userData.side = side;
            this.body.add(g); return g;
        });
        // mouth: a smile coil and an "o", both hidden at neutral
        const mo = def.mouth;
        this.smile = arcTube(mo.width, -mo.sag, mo.radius, dark); this.smile.name = 'smile';
        this.mouthO = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), dark); this.mouthO.name = 'mouthO';
        this.body.add(this.smile, this.mouthO);
        // feet
        const f = def.feet;
        this.feet = [-1, 1].map((side) => {
            const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), skin); m.name = side < 0 ? 'footL' : 'footR';
            m.scale.set(...f.radii); m.position.set(side * f.x, f.radii[1], f.z); m.castShadow = true;
            this.rig.add(m); return m;
        });
        // arms: one tapered clay limb that curves out from the shoulder and ends in a round mitten
        this.arms = [-1, 1].map((side) => {
            const g = new THREE.Group(); g.name = side < 0 ? 'armL' : 'armR';
            const limb = new THREE.Mesh(limbGeometry(), skin); limb.name = 'limb'; limb.castShadow = true; limb.frustumCulled = false;
            const hand = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), skin); hand.name = 'hand'; hand.castShadow = true;
            g.add(limb, hand);
            g.userData = { side, limb, hand, base: new THREE.Vector3(side * def.arms.shoulder[0], def.arms.shoulder[1], def.arms.shoulder[2]) };
            this.body.add(g); return g;
        });
        this.handTargets = [new THREE.Vector3(), new THREE.Vector3()];
        if (def.build) def.build(this);
        this.setExpression('neutral', true);
        this.update(0);
    }

    // ---------- controls ----------
    /** Where the eyes look: x and y in [-1, 1] (left/right, down/up). */
    lookAt(x, y) { this.lookTarget.set(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))); }
    blink() { this.play('blink'); }
    setExpression(name, instant = false) {
        const e = EXPRESSIONS[name]; if (!e) return;
        this.expression = name; Object.assign(this.exTarget, e);
        if (instant) Object.assign(this.ex, e);
    }
    play(name, at = this.now) {
        const c = this.clips[name]; if (!c) return;
        this.active = this.active.filter((a) => a.name !== name);
        this.active.push({ name, start: at, dur: c.dur, fn: c.fn });
    }
    _rand() { this._seed = (this._seed * 16807) % 2147483647; return this._seed / 2147483647; }

    // ---------- per frame ----------
    update(t) {
        const dt = this._last == null ? 0 : Math.min(0.1, Math.max(0, t - this._last));
        this._last = t; this.now = t;
        const k = (rate) => 1 - Math.exp(-rate * dt);
        this.look.x += (this.lookTarget.x - this.look.x) * k(12);
        this.look.y += (this.lookTarget.y - this.look.y) * k(12);
        for (const key in this.ex) this.ex[key] += (this.exTarget[key] - this.ex[key]) * k(9);

        const ch = { squash: 0, lift: 0, tilt: 0, nod: 0, blink: 0, brow: 0, lookX: 0, lookY: 0, clap: 0, raise: 0, swing: 0 };
        if (this.idle) {
            ch.squash += 0.014 * Math.sin(t * 2 * Math.PI / 3.4);
            ch.tilt += 0.018 * Math.sin(t * 2 * Math.PI / 5.3);
        }
        if (this.autoBlink && t >= this._nextBlink) {
            this.play('blink', t);
            if (this._rand() < 0.18) this.play('blink', t + 0.24);   // now and then a double blink
            this._nextBlink = t + 2.4 + this._rand() * 3.2;
        }
        this.active = this.active.filter((a) => t < a.start + a.dur + 1e-6);
        for (const a of this.active) { if (t >= a.start) a.fn(Math.min(1, (t - a.start) / a.dur), ch, this); }
        this.ch = ch;
        this._apply(ch);
    }

    _apply(ch) {
        const def = this.def, shape = def.shape;
        // body: squash and stretch around the feet, hop, sway, nod
        const sq = ch.squash;
        this.rig.scale.set(1 + sq * 0.55, 1 - sq, 1 + sq * 0.55);
        this.rig.position.y = ch.lift;
        this.rig.rotation.set(ch.nod, 0, ch.tilt);
        // eyes
        const lx = Math.max(-1.3, Math.min(1.3, this.look.x + ch.lookX)), ly = Math.max(-1.3, Math.min(1.3, this.look.y + ch.lookY));
        const ex = this.ex, eye = def.eyes;
        for (const m of this.eyes) {
            const d = m.userData.base.clone(); d.x += lx * eye.travel[0]; d.y += ly * eye.travel[1];
            stick(m, surfaceFrame(shape, d), -m.userData.radii.z * 0.35);
            const open = ex.eyeY * (1 - 0.94 * ch.blink);
            m.scale.set(m.userData.radii.x * ex.eyeS, m.userData.radii.y * ex.eyeS * Math.max(0.06, open), m.userData.radii.z);
        }
        // brows follow the eyes a little, lift with surprise, dip with a blink
        for (const g of this.brows) {
            const d = g.userData.base.clone(); d.x += lx * eye.travel[0] * 0.5;
            d.y += ex.browY + ch.brow + ly * eye.travel[1] * 0.35 - ch.blink * 0.02;
            stick(g, surfaceFrame(shape, d), def.brows.radius * 0.4, g.userData.side * -ex.browTilt);
        }
        // mouth
        const md = new THREE.Vector3(...def.mouth.dir); md.x += lx * eye.travel[0] * 0.4;
        const mf = surfaceFrame(shape, md);
        stick(this.smile, mf, def.mouth.radius * 0.3); this.smile.scale.setScalar(Math.max(1e-3, ex.smile));
        stick(this.mouthO, mf, -0.01); const o = Math.max(1e-3, ex.mouthO);
        this.mouthO.scale.set(def.mouth.width * 0.22 * o, def.mouth.width * 0.3 * o, 0.03 * o);
        // props and hands
        if (this.def.pose) this.def.pose(this, ch);
        // arms reach from inside the shoulder to their hand target, bowing outward like a soft clay coil
        for (let i = 0; i < 2; i++) {
            const g = this.arms[i], u = g.userData, r = def.arms.radius;
            const s = surfaceFrame(shape, u.base);
            const from = s.p.clone().addScaledVector(s.n, -r * 0.9), to = this.handTargets[i];
            const mid = from.clone().lerp(to, 0.5).addScaledVector(s.n, (def.arms.bow ?? 0.1)).add(new THREE.Vector3(0, -0.04, 0));
            updateLimb(u.limb.geometry, new THREE.QuadraticBezierCurve3(from, mid, to), (q) => r * (1.08 - 0.16 * q));
            u.hand.position.copy(to); u.hand.scale.setScalar(r * 1.16);
        }
    }
}

/** The stage: rice ground, soft key light, a contact shadow, and a camera framed on the character. */
export function stage(canvas, { width, height } = {}) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(PALETTE.rice);
    // a soft studio environment wraps the clay in gentle bounce light and gives the eyes their catchlight
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.6;
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
    camera.position.set(0, 1.35, 7.2);
    // light: a big soft key from the upper left, a cool fill, a rim from behind
    scene.add(new THREE.HemisphereLight('#fffaf0', '#d8d0c0', 0.8));
    const key = new THREE.DirectionalLight('#fff6e8', 1.9); key.position.set(-3.5, 6, 5); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 9; key.shadow.blurSamples = 20; key.shadow.bias = -0.0004;
    Object.assign(key.shadow.camera, { left: -3, right: 3, top: 4, bottom: -1, near: 1, far: 20 });
    scene.add(key);
    const fill = new THREE.DirectionalLight('#e6ecff', 0.55); fill.position.set(4, 2.5, 3); scene.add(fill);
    const rim = new THREE.DirectionalLight('#ffffff', 0.9); rim.position.set(1.5, 4, -5); scene.add(rim);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.13 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    // a soft contact shadow that shrinks when the character leaves the ground
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(60,45,20,0.42)'); grd.addColorStop(0.55, 'rgba(60,45,20,0.16)'); grd.addColorStop(1, 'rgba(60,45,20,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    contact.rotation.x = -Math.PI / 2; contact.position.y = 0.002; scene.add(contact);
    const resize = (w, h) => { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    if (width) resize(width, height);
    return { renderer, scene, camera, contact, resize, target: new THREE.Vector3(0, 1.05, 0) };
}
