// Ra, the RasanAI mascot: a plump turmeric gumdrop in a black flat cap, holding a clapperboard.
import { THREE, Character, PALETTE, clay, brass, ease } from './crew-kit.js';
import { RoundedBoxGeometry } from '../../../../skills/rasanai/stage3d/addons/geometries/RoundedBoxGeometry.js';

/** Gumdrop: wider at the bottom, a rounded crown, a slightly flattened seat, a little shallower front to back. */
function raShape(v) {
    const w = 1 + 0.22 * -v.y;
    v.x *= w * 0.92; v.z *= w * 0.82;
    if (v.y < -0.72) v.y = -0.72 + (v.y + 0.72) * 0.3;
    v.y *= 1.12;
    return v;
}

function stripes() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 32;
    const g = c.getContext('2d'); g.fillStyle = '#1c1c21'; g.fillRect(0, 0, 256, 32);
    g.fillStyle = '#f2f0ea';
    for (let x = -32; x < 288; x += 48) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 22, 0); g.lineTo(x + 44, 0); g.lineTo(x + 22, 32); g.closePath(); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

function buildClapperboard() {
    const black = clay(PALETTE.board, { roughness: 0.6, bump: 0.08 });
    const striped = new THREE.MeshPhysicalMaterial({ map: stripes(), roughness: 0.6 });
    const W = 0.8, H = 0.5, D = 0.055, SH = 0.1;
    const board = new THREE.Group(); board.name = 'clapperboard';
    const slate = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 4, 0.022), black); slate.castShadow = true;
    board.add(slate);
    // two faint engraved lines, like the canon render
    const lineMat = new THREE.MeshBasicMaterial({ color: '#34343b' });
    for (const y of [0.03, -0.09]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.74, 0.006), lineMat); l.position.set(0.02, y, D / 2 + 0.001); board.add(l); }
    const stick = (name) => {
        const s = new THREE.Group(); s.name = name;
        const bar = new THREE.Mesh(new RoundedBoxGeometry(W, SH, D, 3, 0.014), black); bar.position.x = W / 2; bar.castShadow = true;
        const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.02, SH - 0.016), striped); face.position.set(W / 2, 0, D / 2 + 0.001);
        s.add(bar, face); return s;
    };
    // the fixed stick on the slate, and the clapper hinged at its left end
    const fixed = stick('stick'); fixed.position.set(-W / 2, H / 2 + SH / 2 + 0.004, 0); board.add(fixed);
    const hinge = new THREE.Group(); hinge.name = 'clapperHinge'; hinge.position.set(-W / 2 + 0.02, H / 2 + SH + 0.008, 0);
    const top = stick('clapper'); top.position.set(-0.02, SH / 2, 0); hinge.add(top); board.add(hinge);
    const pin = brass();
    for (const [x, y] of [[-W / 2 + 0.045, H / 2 + SH / 2], [-W / 2 + 0.045, H / 2 + SH + 0.05], [-W / 2 + 0.1, H / 2 + SH / 2]]) {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 16), pin); r.rotation.x = Math.PI / 2; r.position.set(x, y, D / 2 + 0.005); board.add(r);
    }
    board.userData = { hinge, W, H };
    return board;
}

function buildCap() {
    // a soft newsboy cap: a puffy crown that slopes forward over a curved brim, in matte felt
    const felt = clay('#2a2a30', { roughness: 0.95, bump: 0.35 });
    felt.sheen = 1; felt.sheenRoughness = 0.4; felt.sheenColor = new THREE.Color('#6a6a74');
    const cap = new THREE.Group(); cap.name = 'cap';
    const crownGeo = new THREE.SphereGeometry(1, 96, 48, 0, Math.PI * 2, 0, Math.PI * 0.56);
    const p = crownGeo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const h = Math.max(0, v.y);
        v.x *= 0.63; v.z *= 0.6; v.y = v.y * 0.3;
        v.z += 0.16 * h * h;                     // the crown is pulled forward, like cloth over a snap
        v.y += 0.03 * Math.sin(v.x * 9) * h;      // a hint of panel seams
        p.setXYZ(i, v.x, v.y, v.z);
    }
    crownGeo.computeVertexNormals();
    const crown = new THREE.Mesh(crownGeo, felt); crown.castShadow = true;
    // the brim: a thick half-disc reaching forward, bent down toward its front edge
    const brimGeo = new THREE.CylinderGeometry(1, 1, 0.05, 64, 1, false, -Math.PI / 2, Math.PI);
    brimGeo.scale(0.5, 1, 0.4);
    const bp = brimGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) { const z = Math.max(0, bp.getZ(i)); bp.setY(i, bp.getY(i) - 0.4 * z * z); }
    brimGeo.computeVertexNormals();
    const brim = new THREE.Mesh(brimGeo, felt); brim.position.set(0, 0.0, 0.26); brim.rotation.x = 0.12; brim.castShadow = true;
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 12), brass()); stud.position.set(0, 0.085, 0.5);
    cap.add(crown, brim, stud);
    cap.position.set(0, 0.8, -0.04); cap.rotation.set(-0.08, 0, -0.12);
    return cap;
}

export function createRa() {
    return new Character({
        name: 'Ra',
        color: PALETTE.turmeric,
        shape: raShape,
        bodyY: 1.0,
        seed: 11,
        eyes: { dir: [0.27, 0.3, 0.9], radii: [0.06, 0.105, 0.04], travel: [0.13, 0.1] },
        brows: { dir: [0.29, 0.5, 0.8], width: 0.15, sag: 0.03, radius: 0.016 },
        mouth: { dir: [0, 0.14, 1], width: 0.15, sag: 0.035, radius: 0.016 },
        feet: { x: 0.4, z: 0.12, radii: [0.2, 0.12, 0.25] },
        arms: { shoulder: [0.82, -0.34, 0.5], radius: 0.115, bow: 0.12 },
        build(ra) {
            ra.cap = buildCap(); ra.body.add(ra.cap);
            ra.board = buildClapperboard(); ra.body.add(ra.board);
            ra.boardRest = new THREE.Vector3(0.02, -0.5, 0.86);
        },
        pose(ra, ch) {
            // the board rides with the hands; "raise" lifts it, "swing" tips it, "clap" opens the clapper
            const b = ra.board;
            b.position.copy(ra.boardRest); b.position.y += ch.raise; b.position.z += ch.raise * 0.25;
            b.rotation.set(-0.04 - ch.raise * 0.25, 0.06, -0.04 + ch.swing);
            b.userData.hinge.rotation.z = ch.clap * 0.62;
            // hands grip the slate's sides, in body space
            b.updateMatrix();
            const W = b.userData.W;
            ra.handTargets[0].set(-W / 2 - 0.02, -0.04, 0.02).applyMatrix4(b.matrix);
            ra.handTargets[1].set(W / 2 + 0.02, -0.06, 0.02).applyMatrix4(b.matrix);
        },
        clips: {
            // "Action!": lift the board, open the clapper, hold a beat, snap it shut with a squash, then settle
            action: {
                dur: 1.5, fn: (p, ch, ra) => {
                    const up = ease.out(Math.min(1, p / 0.22)), down = p > 0.7 ? ease.inOut(Math.min(1, (p - 0.7) / 0.3)) : 0;
                    ch.raise += 0.16 * up * (1 - down);
                    ch.swing += 0.08 * up * (1 - down);
                    const open = p < 0.42 ? ease.backOut(Math.min(1, p / 0.28)) : p < 0.5 ? 1 - ease.in((p - 0.42) / 0.08) : 0;
                    ch.clap += Math.max(0, open);
                    const snap = p >= 0.5 ? Math.exp(-9 * (p - 0.5)) * Math.cos(28 * (p - 0.5)) : 0;
                    ch.squash += 0.07 * snap;
                    ch.brow += 0.05 * up * (1 - down) - 0.03 * Math.max(0, snap);
                    if (p >= 0.5 && p < 0.58) ch.blink = Math.max(ch.blink, 0.6);
                }
            },
            wiggle: { dur: 1.0, fn: (p, ch) => { ch.tilt += 0.09 * Math.sin(2 * Math.PI * 2.5 * p) * (1 - p); } }
        }
    });
}
