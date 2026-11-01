function run(hz, vScroll, dur, span, vh, glide = 150, capVH = 1.8) {
  const dt = 1000 / hz, s = { cur: 0, vel: 0, glide }; let target = 0, maxStepPx = 0, overshoot = 0, lagAtEnd = 0, t = 0, lagSteady = 0;
  const w = 1700 / glide;
  for (let i = 0; i < hz * (dur + 6); i++) {
    t += dt; if (t <= dur * 1000) target = Math.min(1, vScroll * t / 1000 / span);
    const h = Math.min(dt, 50) / 1000, x0 = s.cur - target, v0 = s.vel, c = v0 + w * x0, e = Math.exp(-w * h), x1 = (x0 + c * h) * e; let v1 = (v0 - w * c * h) * e;
    const lim = capVH * vh / span; let step = target + x1 - s.cur; if (Math.abs(step) > lim * h) { step = Math.sign(step) * lim * h; v1 = Math.max(-lim, Math.min(lim, v1)); }
    s.cur += step; s.vel = v1; maxStepPx = Math.max(maxStepPx, Math.abs(step) * span); if (s.cur > target) overshoot = Math.max(overshoot, (s.cur - target) * span);
    if (t > dur * 500 && t < dur * 600) lagSteady = (target - s.cur) * span;
  }
  return { hz, v: vScroll, maxStepPxPerFrame: +maxStepPx.toFixed(1), overshootPx: +overshoot.toFixed(2), steadyLagPx: +lagSteady.toFixed(0), finalErr: +((target - s.cur) * span).toFixed(2) };
}
for (const hz of [60, 120]) for (const v of [400, 800, 1500, 4000, 12000]) console.log(JSON.stringify(run(hz, v, v > 3000 ? 0.4 : 3, 17000, 900)));
