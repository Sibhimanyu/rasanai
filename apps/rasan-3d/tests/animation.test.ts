import { describe, expect, it } from 'vitest';
import { evaluateScene, validateScene, sceneFrames } from '../src/scene/evaluate';
import { demoScene } from '../src/scene/scenes/demo';
import { motionShowcase } from '../src/scene/scenes/showcase';
import { MOTIONS, MOTION_NAMES } from '../src/motions';
import { evaluatePose, type ClipInstance } from '../src/core/motion';
import { CHANNEL_NAMES, restPose } from '../src/core/pose';
import { RASAN_RIG, solveRasan } from '../src/characters/rasan/rig';
import { RASAN } from '../src/characters/rasan/proportions';
import { BOARD } from '../src/props/boardLayout';
import { springStep, track } from '../src/core/ease';

describe('determinism', () => {
  it('any frame evaluates the same in any order', () => {
    const n = sceneFrames(demoScene);
    const forward = Array.from({ length: n }, (_, f) => evaluateScene(demoScene, f / demoScene.fps));
    const order = Array.from({ length: n }, (_, f) => f).sort((a, b) => ((a * 7919) % n) - ((b * 7919) % n));
    for (const f of order) {
      const again = evaluateScene(demoScene, f / demoScene.fps);
      expect(again.characters[0].pose).toEqual(forward[f].characters[0].pose);
      expect(again.camera).toEqual(forward[f].camera);
    }
  });

  it('poses contain only finite numbers', () => {
    for (let f = 0; f < sceneFrames(demoScene); f++) {
      const p = evaluateScene(demoScene, f / demoScene.fps).characters[0].pose;
      for (const c of CHANNEL_NAMES) expect(Number.isFinite(p[c])).toBe(true);
    }
  });

  it('every library motion is finite and repeatable', () => {
    for (const name of MOTION_NAMES) {
      const s = motionShowcase(name);
      for (const t of [0, 0.31, 0.77, 1.4, s.duration - 0.01]) {
        const a = evaluateScene(s, t).characters[0].pose;
        const b = evaluateScene(s, t).characters[0].pose;
        expect(a).toEqual(b);
        for (const c of CHANNEL_NAMES) expect(Number.isFinite(a[c]), `${name} ${c} @${t}`).toBe(true);
      }
    }
  });
});

describe('scene configuration', () => {
  it('the demo scene validates', () => {
    expect(validateScene(demoScene)).toEqual([]);
    expect(sceneFrames(demoScene)).toBe(240);
  });

  it('validation catches mistakes', () => {
    const bad = structuredClone(demoScene);
    bad.characters[0].clips.push({ motion: 'moonwalk', start: 1 });
    bad.characters.push({ ...bad.characters[0] });
    expect(validateScene(bad).join('\n')).toMatch(/unknown motion "moonwalk"[\s\S]*duplicate character id/);
  });

  it('Rasan hops in from off-frame and ends at rest in the middle', () => {
    const start = evaluateScene(demoScene, 0).characters[0].pose;
    const end = evaluateScene(demoScene, 7.99).characters[0].pose;
    expect(start['root.x']).toBeLessThan(-3);
    expect(Math.abs(end['root.x'])).toBeLessThan(1e-6);
    expect(end['root.y']).toBe(0);
    expect(Math.abs(end['root.yaw'])).toBeLessThan(1e-6);
  });

  it('the clapper is open before the snap and shut right after it', () => {
    const before = evaluateScene(demoScene, 4.1).characters[0].pose['prop.clap'];
    const after = evaluateScene(demoScene, 4.24).characters[0].pose['prop.clap'];
    expect(before).toBeGreaterThan(0.5);
    expect(after).toBeLessThan(0.08);
  });

  it('portrait keeps the camera target and uses the portrait lens', () => {
    const l = evaluateScene(demoScene, 3).camera, p = evaluateScene(demoScene, 3, { portrait: true }).camera;
    expect(p.target).toEqual(l.target);
    expect(p.fov).toBe(demoScene.camera.portraitFov);
  });
});

describe('blending', () => {
  const rig = RASAN_RIG;
  it('set clips fade between the base and the target', () => {
    const clips: ClipInstance[] = [{ motion: 'look', start: 0, duration: 2, fadeIn: 1, params: { x: 1, y: 0, speed: 0.01 } }];
    const mid = evaluatePose(clips, 0.5, MOTIONS, rig)['eyes.lookX'];
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
    expect(evaluatePose(clips, 1.5, MOTIONS, rig)['eyes.lookX']).toBeCloseTo(1, 5);
    expect(evaluatePose(clips, 2.5, MOTIONS, rig)['eyes.lookX']).toBe(0);
  });

  it('additive clips stack and limits clamp the result', () => {
    const clips: ClipInstance[] = [
      { motion: 'squash', start: 0, params: { amount: 0.3 } },
      { motion: 'squash', start: 0, params: { amount: 0.3 } },
    ];
    expect(evaluatePose(clips, 0.06, MOTIONS, rig)['body.stretch']).toBe(-0.35);
  });

  it('easing helpers hold their ends', () => {
    expect(track([[0, 1], [1, 3]], -1)).toBe(1);
    expect(track([[0, 1], [1, 3]], 2)).toBe(3);
    expect(springStep(0)).toBe(0);
    expect(springStep(5)).toBeCloseTo(1, 3);
  });
});

describe('rig controls', () => {
  it('squash preserves volume', () => {
    const s = solveRasan(restPose({ 'body.stretch': -0.2 })).bodyScale;
    expect(s.x * s.y * s.z).toBeCloseTo(1, 6);
    expect(s.y).toBeCloseTo(0.8);
  });

  it('closing the eyes flattens them; happy eyes swap to arcs', () => {
    const open = solveRasan(restPose()).eyes.L;
    const shut = solveRasan(restPose({ 'eyeL.blink': 1 })).eyes.L;
    const happy = solveRasan(restPose({ 'eyeR.happy': 1 })).eyes.R;
    expect(shut.scale.y).toBeLessThan(open.scale.y * 0.1);
    expect(happy.happy).toBe(1);
  });

  it('brows move independently', () => {
    const base = solveRasan(restPose());
    const up = solveRasan(restPose({ 'browL.raise': 0.05 }));
    expect(up.brows.L[8].y - base.brows.L[8].y).toBeCloseTo(0.05, 2);
    expect(up.brows.R[8].y).toBeCloseTo(base.brows.R[8].y, 6);
  });

  it('gripping hands sit on the board; hands never exceed arm reach', () => {
    const s = solveRasan(restPose(RASAN_RIG.rest));
    for (const side of ['L', 'R'] as const) {
      const a = s.arms[side];
      expect(a.hand.distanceTo(a.shoulder)).toBeLessThanOrEqual(RASAN.arm.reach + 1e-6);
    }
    const boardPos = s.prop.matrix.elements.slice(12, 15);
    expect(Math.abs(s.arms.L.hand.x - boardPos[0])).toBeLessThan(BOARD.W / 2 + 0.06);
    const far = solveRasan(restPose({ 'armR.grip': 0, 'armR.y': 9 }));
    expect(far.arms.R.hand.distanceTo(far.arms.R.shoulder)).toBeCloseTo(RASAN.arm.reach, 6);
  });

  it('the clapper hinge opens to the configured angle and the hand follows the tip', () => {
    const shut = solveRasan(restPose({ 'prop.clap': 0, 'armL.toClapper': 1 }));
    const open = solveRasan(restPose({ 'prop.clap': 1, 'armL.toClapper': 1 }));
    expect(shut.prop.clapAngle).toBe(0);
    expect(open.prop.clapAngle).toBeCloseTo(RASAN.board.openAngle);
    expect(open.arms.L.hand.y).toBeGreaterThan(shut.arms.L.hand.y + 0.2);
  });

  it('feet stay planted while the body squashes', () => {
    const a = solveRasan(restPose()), b = solveRasan(restPose({ 'body.stretch': -0.25 }));
    expect(b.feet.L.elements[13]).toBe(a.feet.L.elements[13]);
  });
});
