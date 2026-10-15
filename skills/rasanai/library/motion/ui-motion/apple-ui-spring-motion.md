---
id: "apple-ui-spring-motion"
name: "Apple UI spring motion (fluid interfaces)"
space: "both"
family: "ui-motion"
references: ["Apple WWDC18 Designing Fluid Interfaces", "Apple WWDC23 Animate with springs", "SwiftUI .snappy / .smooth / .bouncy springs", "Apple HIG Motion principles"]
timing: {"frame_rate":"60 fps preferred for UI recordings; 30 fps acceptable","holds_ms":[400,1200],"durations_ms":{"critically_damped_response":[300,400],"momentum_spring_response":[300,400],"press_scale":[100,160],"sheet_present":[400,550],"settle_tail":"about 0.93 x response to 2 percent for damping 1.0 (derived)"}}
eases: {"key":"spring(response, dampingFraction): 1.0 for no-momentum taps, about 0.8 for gestures with momentum","notes":"in GSAP use a closed-form spring registered with CustomEase or an ease function; approximations: damping 1.0 ~ power3.out; damping 0.8 ~ back.out(0.4) (derived, check on a strip). Bounce 0 smooth, 0.15 small, 0.3 medium, avoid above 0.4 (WWDC23 summary)."}
camera: {"lens_mm":[50],"moves":["locked-off UI frame","slow 2 to 4 percent lean-in on the focused element"],"rules":["the UI is the subject; camera motion must not fight element springs","3D is only a flat slab with exact screenshot (panel), never a mocked device unless asked"]}
recipe_2d: "GSAP paused timeline at 1920x1080. Define springEase(zeta, response) as a closed-form function ease (formula in the body) and register it with CustomEase from 48 samples, e.g. CustomEase.create('ios100', pathFromSamples(spring(1.0,0.35))) and 'ios80' for (0.8, 0.35). Taps and reveals use ios100 with duration = response (350 ms); swipe/dismiss gestures with momentum use ios80 with duration 1.1 x response. Press feedback: scale 1 to 0.96 in 120 ms power2.out, release to 1 on ios80 over 300 ms. Sheets: y from 100 percent to 0 in 450 ms on ios100. Interruption: the second tween starts from the first's current value (compute from the closed form) and carries its velocity. Layers settle 2 to 4 frames after the lead element (secondary 80-120 ms behind)."
recipe_3d: "Rasan3D: UI as one k.panel with the real screenshot (k.image), unlit face, rig 'three-point', lens 50 mm, fstop 4-5.6. pose(t,k) evaluates the same closed-form spring: x = spring(t - t0, zeta, response) for position, rotation and scale; panel layers (shell, sidebar, content) at z 0.05-0.3 m settle 2-4 frames after each other. The camera has a T1 lean-in (2-5 percent, 'power3.inOut'). k.pinDom pins the real DOM cursor to the click point."
pitfalls: ["bouncing everything: Apple's own guidance is to start at 100 percent damping, because a spring does not need to overshoot", "no overshoot on a gesture with momentum: WWDC18 says to reward that momentum with a little overshoot (80 percent damping for swipe-to-dismiss)", "using duration thinking for springs: tune response and damping; duration is a consequence", "springs that never settle in a rendered clip: cap at about 2 percent residual and snap", "exits with the same bounce as entrances", "fade-in only transitions with no spatial origin", "ignoring reduce motion in product UI: for video this does not apply, but a spring-free alternative is a good fallback to offer"]
instruct: {"all":"Provide damping fraction, response in seconds, and for each element the lead/follow offsets in ms. State whether the interaction has momentum (gesture) or not (tap) because that decides damping 0.8 or 1.0. Provide the closed-form so the model does not guess an ease.","claude":"Claude tends to default to bouncy overshoot for 'delight' and to put a different spring on each element. Say 'damping 1.0 for taps, 0.8 only for flicks and dismissals, one spring family for the whole UI', and give the numbers. It also forgets that rendered clips need a settle cut-off.","gpt":"GPT models tend to use CSS cubic-bezier(0.4,0,0.2,1) with 300 ms and call it iOS, or elastic.out(1,0.3). Forbid elastic and 'ease-in-out' for springs; require the closed-form spring function and a stated damping per interaction. It often animates width/height instead of transform; require transforms."}
verified: {"sources_fetched":3,"non_wikipedia":3,"colours":"n/a","colour_images":[],"grid":"n/a","timings":"partial","recipes":"aligned","edited":"2026-10-03"}
sources: ["https://developer.apple.com/videos/play/wwdc2018/803/", "https://developer.apple.com/videos/play/wwdc2023/10158/", "https://developer.apple.com/design/human-interface-guidelines/motion"]
---

## What it is

Apple's interface motion is built on springs described with two designer-facing parameters rather than duration and easing curve. The WWDC18 session "Designing Fluid Interfaces" defines damping (the amount of overshoot, from 100 percent with none to 0 percent which oscillates forever) and response (how quickly the value tries to reach its target). It explicitly avoids "duration" for elastic behaviour because duration reinforces constant dynamic change, and it advises: start with 100 percent damping, "a spring doesn't need to overshoot"; use about 80 percent for gestures with momentum: "if the gesture that's driving the motion itself has momentum, then you should reward that momentum with a little bit of overshoot" (the Music app uses 100 percent for taps and 80 percent for swipe to dismiss). Interactions are redirectable and interruptible, with momentum projected to find the intended endpoint, and objects enter and exit along symmetric paths.

WWDC23 "Animate with springs" re-expresses the same model as duration plus bounce (range -1.0 to 1.0): smooth at 0, about 0.15 small, about 0.3 medium, avoid above 0.4, with presets `.snappy`, `.smooth`, `.bouncy`, and the conversion `stiffness = (2 pi / duration)^2`, `damping = 1 - 4 pi bounce / duration` for bounce at or above 0, mass 1. The HIG motion page lists the principles: purposeful, brief and precise, feedback, reduce motion.

## The defining traits (numbers)

- Default spring: damping 1.0, response 0.3 to 0.4 s (summary of Apple guidance in a search result; WWDC18 itself states the 100 percent rule without numbers).
- Momentum spring: damping about 0.8, response 0.3 to 0.4 s. Theoretical overshoot for damping ratio 0.8 is exp(-pi x 0.8 / sqrt(1 - 0.64)) = 1.5 percent (derived), which is why the effect is "a small bounce and squish".
- SwiftUI `.spring(response: 0.5, dampingFraction: 0.7, blendDuration: 0.25)` appears in the docs as a usage example; response typically 0.3 to 1.0 s.
- Momentum projection: the session code, as summarised by the fetch, is `projectedPosition = position + velocity^2 / (2 * decelerationRate)`, used to choose which corner a thrown element lands in. An earlier draft had `velocity / (1 - decelerationRate)`; re-check against the transcript before relying on either.
- Press feedback: scale to about 0.96 in 100 to 160 ms (derived; not stated in sources).
- Layering rule from the session list: one-to-one tracking during gestures, continuous feedback, spatial consistency (what enters from the right leaves to the right).
- Reduce Motion alternative: crossfade in place. For video, show the spring version.

Conversion for GSAP (derived): the undamped period equals response, so wn = 2 pi / response. For damping zeta below 1, wd = wn sqrt(1 - zeta^2) and x(t) = 1 - e^(-zeta wn t) (cos wd t + (zeta wn / wd) sin wd t). For zeta = 1, x(t) = 1 - (1 + wn t) e^(-wn t).

## How to build it

### 2D (HyperFrames, GSAP, 1920x1080, 30 or 60 fps)

```js
function spring(zeta, response, settle) {                   // returns an ease f(p), p in [0,1] over `settle` seconds
  const wn = 2*Math.PI/response, wd = wn*Math.sqrt(Math.max(1e-6, 1 - zeta*zeta));
  return p => { if (p >= 1) return 1; const t = p*settle;
    return zeta >= 1 ? 1 - (1 + wn*t)*Math.exp(-wn*t)
                     : 1 - Math.exp(-zeta*wn*t)*(Math.cos(wd*t) + (zeta*wn/wd)*Math.sin(wd*t)); };
}
function curveFromEase(f, n = 48) {                         // CustomEase wants a path; sample the function
  let d = "M0,0"; for (let i = 1; i <= n; i++) d += " L" + (i/n).toFixed(4) + "," + f(i/n).toFixed(4); return d;
}
gsap.registerPlugin(CustomEase);
CustomEase.create("ios100", curveFromEase(spring(1.0, 0.35, 0.40)));
CustomEase.create("ios80",  curveFromEase(spring(0.8, 0.35, 0.50)));
const tl = gsap.timeline({ paused: true });
window.__timelines["06-ui-spring"] = tl;
tl.to("#sheet", { yPercent: 0, duration: 0.45, ease: "ios100" }, 0.3)           // no momentum: damping 1.0
  .to("#card",  { scale: 1,   duration: 0.40, ease: "ios80"  }, 1.2)            // momentum: 80 percent
  .to("#card-body", { y: 0, duration: 0.40, ease: "ios100" }, 1.2 + 0.09);      // follower 90 ms behind
```

Steps:
1. Pick damping per interaction: tap or button reveal 1.0; flick, throw, swipe-to-dismiss 0.8.
2. Entrances travel from where the thing came from (a popover scales from the button: `transformOrigin` at the button centre), exits reverse the path.
3. Interruption (retargeting): at time `ti` the first spring is at `v = A + (B - A) * f((ti - t0)/dur)`. Start the second tween at `ti` with `from: v` to a new target; the velocity discontinuity is acceptable because the second spring starts at v with its own response; for a smoother hand-off, shorten the second response by 15 percent.
4. Animate only `transform` and `opacity`. Width, height and top cause layout and jitter in rendering.
5. Hold 400 to 1200 ms after the last settle before the next beat.

### 3D (Rasan3D)

```js
function spring(p, zeta, response) {                         // closed form, p = seconds since the move began; 0 before it starts, 1 after 0.5 s
  if (p <= 0) return 0; if (p >= 0.5) return 1;
  const wn = 2*Math.PI/response, wd = wn*Math.sqrt(Math.max(1e-6, 1 - zeta*zeta));
  return zeta >= 1 ? 1 - (1 + wn*p)*Math.exp(-wn*p) : 1 - Math.exp(-zeta*wn*p)*(Math.cos(wd*p) + (zeta*wn/wd)*Math.sin(wd*p)); }
camera: { pos:[[0,[0,0,3.2]],[2.4,[0.05,0.02,3.05],"power3.inOut"]], target:[[0,[0,0,0]]], lens:[[0,50]], fstop: 4.5 },
pose(t, k){
  const { shell, sidebar, content } = k.objects;
  const s = (t0, off) => spring(t - t0 - off, 0.8, 0.35);      // follower offsets 0, 0.09, 0.18 s
  shell.position.y = -0.5*(1 - s(0.4, 0));                     // enters
  sidebar.position.z = 0.05 + 0.15*s(1.2, 0.09);               // layers separate in depth, 2-4 frames apart
  content.position.z = 0.05 + 0.25*s(1.2, 0.18);
}
// panel faces from k.image("assets/screens/home.png") on k.panel(...), unlit; cursor stays DOM via k.pinDom/onDraw + k.toScreen.
```
`pose` is a pure function of `t` because the spring is evaluated in closed form, not integrated.

### Retargets and two-edge indicators (runtime)

- A value that gets a new target mid-flight (a highlight following a moving cursor, a count handed a new number) uses `RasanMotion.springTrack(keys, { z, w })`: the responses of successive targets add, so velocity carries through the retarget and the result is still a pure function of `t`. `.velocity(t)` is there for matching a loop seam.
- A tab underline, selection pill or toggle knob uses `RasanMotion.edges(keys, { lead, trail })`: the leading edge on a stiffer spring (about w 28) than the trailing one (about w 16), so it stretches toward the target and the tail catches up. Use it on the indicator that is the beat; elsewhere one damping-1.0 spring is enough.

## What makes a cheap imitation

- `elastic.out(1, 0.3)` on everything: wobbly, toy-like, not Apple.
- A 300 ms `ease-in-out` bezier presented as iOS: no momentum, no redirection.
- Springs on exits.
- Layout properties animated (width, height, margin) so edges shimmer.
- All layers moving in lock-step: no secondary delay, so nothing feels physical.
- A phone mock-up bezel added by default.

## Sources

- https://developer.apple.com/videos/play/wwdc2018/803/ — Nathan de Vries: damping (100 percent no overshoot, 0 percent oscillates forever) and response; "A spring doesn't need to overshoot... we recommend starting with 100% damping"; reward gesture momentum with a little overshoot, 100 percent for taps and 80 percent for swipe-to-dismiss in the Music app; projection code; redirection; symmetric enter and exit paths (fetched 2026-10-03, as a summary of the transcript).
- https://developer.apple.com/videos/play/wwdc2023/10158/ — duration and bounce (-1.0 to 1.0), presets `.snappy`, `.smooth`, `.bouncy`, conversion `stiffness = (2 pi / duration)^2` and `damping = 1 - 4 pi bounce / duration` for bounce at or above 0, bounce guidance 0, about 0.15, about 0.30, avoid above 0.40 (fetched 2026-10-03).
- https://developer.apple.com/design/human-interface-guidelines/motion — purposeful, responsive feedback, continuity, reduced motion alternatives (fetched 2026-10-03). The fetch summary also gave generic duration bands (300 to 500 ms standard, 150 to 300 ms quick) that the page itself may not state; they are not used as numbers here.

Derived or unverified: ease approximations to GSAP names, press scale 0.96, all ms values other than the response range, the 1.5 percent overshoot (exp(-pi * 0.8 / sqrt(1 - 0.64)), my arithmetic) and the 0.93 x response settle time (solving (1 + x) e^-x = 0.02, my arithmetic). The SwiftUI `.spring(response:dampingFraction:)` page was not re-fetched this session.
