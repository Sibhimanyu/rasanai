---
id: "generative-procedural-growth"
name: "Generative growth (space colonization branching, L-systems, reaction-diffusion)"
space: "both"
family: "simulation"
references: ["Runions, Lane, Prusinkiewicz: space colonization (Eurographics NPH 2007)", "Lindenmayer systems (1968), The Algorithmic Beauty of Plants", "Gray-Scott reaction-diffusion (Karl Sims)", "Jason Webb's 2D space colonization experiments"]
timing: {"frame_rate":"30 fps comp; reaction-diffusion sim dt 1/240 (8 steps per frame)","holds_ms":[800,2000],"durations_ms":[3000,6000,10000],"growth_s":[4,10],"notes":"growth decelerates (power2.out): the first second does most of the visible work; leave a hold at the end so the finished form can be read"}
eases: {"key":"power2.out","growth":"power2.out","camera":"sine.inOut","notes":"the growth front speed is eased as one uniform; the structure itself is deterministic from a seed"}
camera: {"lens_mm":[50,85],"moves":["slow orbit of 20-40 degrees during growth","push-in on the growing tip","pull-back at the end to show the whole form"],"rules":["lead the front: keep the camera slightly behind the tips so growth moves toward and across frame","rest at the end","macro (100 mm, f/2.8) when the structure is veins or coral"]}
recipe_2d: "SVG: precompute the branch paths in JS with a seeded generator (build time, not live), then draw on with GSAP: each path gets stroke-dasharray = length and stroke-dashoffset tweened to 0 on 'power2.out', staggered by branch depth (stagger = depth * 0.04 s), stroke-width from a pipe-model radius; tip dots as small circles tweened along getPointAtLength with the same ease. Deterministic, no live simulation."
recipe_3d: "Rasan3D: run space colonization once in build() with k.rng(seed) (attractors in a volume, nodes grown by step length D toward the mean direction of attractors in influence radius, attractors killed within kill distance); build each branch with k.tube(points,{radius:fn(u),segments,radial}), merge with BufferGeometryUtils (k.addon('utils/BufferGeometryUtils.js')), give each vertex aStart = path length from the root to the branch start; ShaderMaterial discards where aStart + aLen > uGrow; pose(t): material.uniforms.uGrow.value = k.at(t,[[0,0],[7,18,'power2.out']]); an accent glow at the front where the difference is small. Reaction-diffusion: k.gpuSimulate('rd',{size:256,fields:['state'],dt:1/240,step:gray-scott glsl,init}) shown on a plane or as relief with sim.at(t).texture; post {grain:0.02}."
pitfalls: ["a live simulation in the draw loop (not seek-safe): compute the structure once from a seed, reveal it by time","growth at constant speed with a hard stop: decelerate, then rest","every branch the same thickness: the pipe model (thicker toward the root) is what makes it read as growing","symmetric fractal trees from a bare L-system with no noise: 'procedural oatmeal'","random() for the seed: use k.rng(seed) so the same seed gives the same plant on every render","reaction-diffusion at the wrong parameters: it dies to a flat colour or fills to noise; start at Sims' f 0.055, k 0.062","glow on every branch: only the growth front is emissive"]
instruct: {"all":"Separate structure from time. Generate the structure once in build() from k.rng(seed) with stated parameters (attractor count, influence radius, kill distance, step length). Reveal it by a single eased uniform that is a function of t. Thickness follows the pipe model. Keep one accent: the growing tip. For reaction-diffusion use k.gpuSimulate with the stated feed and kill rates and a small dt.","claude":"You will make it luminous and symmetric. Make it asymmetric: bias the attractor volume, add light tropism toward the key, and keep the structure ink on paper or bone on ink with one accent tip. Write the parameters and the expected node count in a comment, then check the build time is under a second.","gpt":"You tend to grow the structure inside requestAnimationFrame-style updates (push nodes each frame) and use Math.random: both break the render. Precompute everything in build() with k.rng(seed); pose() only sets a uniform. Do not create a second canvas or a free-running loop."}
sources: ["https://github.com/jasonwebb/2d-space-colonization-experiments", "https://en.wikipedia.org/wiki/L-system", "https://www.karlsims.com/rd.html", "https://en.wikipedia.org/wiki/Procedural_generation", "local: skills/rasanai/stage3d/glsl.js (Rasan3DLib.tube: uv.x arc length, aLen attribute)"]
---
## What it is

Form that appears to grow: a branching network that reaches into space, a vein pattern spreading across a leaf, coral-like patterns that bloom out of a seed. It is the visual opposite of a keyed animation: the structure is the result of a rule, and the animation is the order in which it is revealed. In a film it fits a "from one idea to a system" beat, a brand mark built from branches, or an abstract background that reads as alive.

## The defining traits (numbers)

- **Space colonization** (Jason Webb's write-up of Runions et al.): the open-venation variant associates each attractor with the closest node within an attraction distance, grows a new node a preset segment length along the average direction toward its attractors, and removes attractors once a node reaches the kill distance. Parameters: attraction distance, kill distance, segment length. Extras: auxin-flux canalization (thickening from tips toward the root by accumulated child segments), opacity following the same flow, bounding shapes and obstacles. Outputs resemble leaf venation, trees, sea fans, circulatory and root systems.
- **Our starting values (unverified; the original paper could not be fetched, see Sources):** 1,200-2,000 attractors in the target volume, segment length D = 0.12 (scene units), attraction radius about 10 D, kill distance about 2 D, 60-200 iterations until the attractors are exhausted.
- **L-systems** (Wikipedia): Lindenmayer, 1968; a parallel rewriting system (all applicable rules at once); alphabet, productions, axiom; drawn by turtle graphics (forward, turn, push/pop); variants: stochastic, context-sensitive, parametric.
- **Gray-Scott reaction-diffusion** (Karl Sims): DA = 1.0, DB = 0.5, f (feed) = 0.055, k (kill) = 0.062, timestep 1.0; a 3 x 3 Laplacian with centre -1, neighbours 0.2, diagonals 0.05; start A = 1, B = 0 with a small seeded patch of B = 1; "two Bs convert an A into B"; varying f and k yields mitosis, coral and other patterns. Update: `A' = A + (DA lap(A) - A B^2 + f (1 - A))`, `B' = B + (DB lap(B) + A B^2 - (k + f) B)`.
- **Timing (ours):** the first 20 percent of a `power2.out` reveal shows about 36 percent of the growth, which is why it reads as vigorous at the start and calm at the end; a 7 s growth plus a 2 s rest is a good unit.
- **Pipe model radius (ours, from the canalization idea):** `r = r_tip + c sqrt(n_descendants)`, with r_tip 0.006 and c 0.003 in scene units.

## How to build it

### 3D, branches (build once, reveal by time)

```js
async build(k) {
  const { THREE } = k;
  const { mergeGeometries } = await k.addon("utils/BufferGeometryUtils.js");
  const rnd = k.rng(21), D = 0.12, DI = 1.2, DK = 0.25;
  let A = []; while (A.length < 1500) { const p = [(rnd() - 0.5) * 6, rnd() * 4.5 + 0.8, (rnd() - 0.5) * 6]; if (Math.hypot(p[0], p[1] - 3.2, p[2]) < 3) A.push(p); }   // a lopsided crown
  const nodes = [{ p: [0, 0, 0], parent: -1, d: 0, kids: 0 }];
  for (let it = 0; it < 300 && A.length; it++) {
    const pull = new Map();
    for (const a of A) { let bi = -1, bd = DI * DI;
      for (let n = 0; n < nodes.length; n++) { const q = nodes[n].p, d2 = (a[0] - q[0]) ** 2 + (a[1] - q[1]) ** 2 + (a[2] - q[2]) ** 2; if (d2 < bd) { bd = d2; bi = n; } }
      if (bi >= 0) { const q = nodes[bi].p, l = Math.sqrt(bd) || 1, v = pull.get(bi) || [0, 0, 0]; v[0] += (a[0] - q[0]) / l; v[1] += (a[1] - q[1]) / l; v[2] += (a[2] - q[2]) / l; pull.set(bi, v); } }
    if (!pull.size) break;
    for (const [bi, v] of pull) { const l = Math.hypot(...v) || 1, q = nodes[bi].p;
      nodes.push({ p: [q[0] + (v[0] / l) * D, q[1] + (v[1] / l) * D, q[2] + (v[2] / l) * D], parent: bi, d: nodes[bi].d + 1, kids: 0 }); }
    A = A.filter((a) => nodes.every((n) => (a[0] - n.p[0]) ** 2 + (a[1] - n.p[1]) ** 2 + (a[2] - n.p[2]) ** 2 > DK * DK));   // naive O(A x N): use a grid if the build exceeds 1 s
  }
  for (let i = nodes.length - 1; i > 0; i--) nodes[nodes[i].parent].kids += 1 + nodes[i].kids;       // descendants, for the pipe model
  // cut into branches: a branch runs from a branching node (or the root) to the next branching node or tip
  // ... for each branch: pts = chain of node positions; geo = k.tube(pts, { radius: (u) => 0.006 + 0.003 * Math.sqrt(kidsAt(u)), segments: pts.length * 4, radial: 8 });
  //     geo.setAttribute("aStart", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(startNode.d * D), 1));
  const merged = mergeGeometries(branches);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uGrow: { value: 0 } },
    vertexShader: `attribute float aStart, aLen; varying float vF; varying vec2 vUv; varying vec3 vN;
      void main(){ vF = aStart + aLen; vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: Rasan3D.glsl.npr + `uniform float uGrow; varying float vF; varying vec2 vUv; varying vec3 vN;
      void main(){
        if (vF > uGrow) discard;                                              // not grown yet
        float tone = r3Lambert(normalize(vN), normalize(vec3(-0.4, 0.8, 0.5))) * 0.8 + 0.2;
        float ink = r3Hatch(vUv.y * 6.0, r3InkFromTone(tone));               // lines along the branch
        vec3 col = mix(vec3(0.93, 0.91, 0.87), vec3(0.08, 0.09, 0.11), ink);
        float tip = smoothstep(0.35, 0.0, uGrow - vF);                       // the front glows: the one accent
        col = mix(col, vec3(1.0, 0.30, 0.07) * 1.6, tip);
        gl_FragColor = vec4(col, 1.0);
      }` });
  const tree = new THREE.Mesh(merged, mat); k.scene.add(tree);
  return { mat };
},
pose(t, k) { k.objects.mat.uniforms.uGrow.value = k.at(t, [[0, 0], [7, 18, "power2.out"]]); },   // 18 = path length that covers the whole tree: measure it from nodes
```

`aLen` is the arc-length attribute of `Rasan3DLib.tube` (world units along the tube, from the glsl.js header), so the front moves along each branch at the same speed as along the root path. Camera: `pos` an `orbit` of 30 degrees over 9 s on `sine.inOut`, `lens` 70, `fstop 4`; cut while it still moves (no still hold at the end). Declare `never-rests` only if the form keeps growing past the cut.

### 3D, reaction-diffusion on a surface

```js
const rd = k.gpuSimulate("rd", { size: 256, fields: ["state"], dt: 1 / 240, checkpointEvery: 0.5,
  init: `void main(){ vec2 uv = gl_FragCoord.xy / resolution.xy; float seed = step(length(uv - 0.5), 0.03) + step(0.992, r3Hash(floor(uv * 64.0))); gl_FragColor = vec4(1.0, clamp(seed, 0.0, 1.0), 0.0, 1.0); }`,
  step: `void main(){ vec2 uv = gl_FragCoord.xy / resolution.xy, px = 1.0 / resolution.xy;
    vec2 c = texture2D(tState, uv).xy;
    vec2 lap = -c + 0.2 * (texture2D(tState, uv + vec2(px.x, 0.0)).xy + texture2D(tState, uv - vec2(px.x, 0.0)).xy + texture2D(tState, uv + vec2(0.0, px.y)).xy + texture2D(tState, uv - vec2(0.0, px.y)).xy)
                  + 0.05 * (texture2D(tState, uv + px).xy + texture2D(tState, uv - px).xy + texture2D(tState, uv + vec2(px.x, -px.y)).xy + texture2D(tState, uv + vec2(-px.x, px.y)).xy);
    float rxn = c.x * c.y * c.y, f = 0.055, kk = 0.062;
    gl_FragColor = vec4(clamp(c + vec2(1.0 * lap.x - rxn + f * (1.0 - c.x), 0.5 * lap.y + rxn - (kk + f) * c.y), 0.0, 1.0), 0.0, 1.0); }` });
// pose: planeMaterial.uniforms.tState.value = rd.at(t).texture; colour with r3Ramp3(texel.y, ink, mid, accent), relief by the gradient of .y
```

The sim advances one Gray-Scott step per `dt` (240 per second); reaching 8 s is 1,920 passes of 256 x 256. The exact pattern depends on f, k and the seed patch: start from Sims' values and look at stills before committing (we did not run this shader here: unverified).

### 2D fallback

```js
paths.forEach((p) => { const L = p.getTotalLength(); gsap.set(p, { strokeDasharray: L, strokeDashoffset: L }); });
tl.to(paths, { strokeDashoffset: 0, duration: 1.4, ease: "power2.out", stagger: (i) => depth[i] * 0.04 }, 0.2);
```
`depth[i]` and the path data are baked from a seeded generator before the timeline is built.

### Checks before a final render

1. Build time under 1 s with the grid-accelerated nearest-node search (the naive double loop above is for clarity, about 1,500 x 4,000 distance tests per iteration).
2. Determinism: the same seed gives the same node count; log it (a known-good seed is part of the score).
3. Front speed: measure the path length of the deepest branch and set the last `uGrow` key to that length so growth finishes exactly when the ease ends.
4. Rest: the structure is final when the last tip lands; the camera finishes its move to the next subject and the beat cuts within 1 s (never a slow drift to fill time: under 4% a second is a creep).

## What makes a cheap imitation

- A fractal tree drawn symmetric with fixed angles and no thickness variation.
- Growth at constant speed that stops dead; or a reveal that fades opacity instead of extending.
- Random branching on every render: the same shot never repeats.
- Neon glow on the whole structure; only the front should be hot.
- A reaction-diffusion texture used as a wallpaper with no growth from a seed.
- Live simulation recorded as a video: cannot be re-timed, cannot be seeked.

## Sources

- https://github.com/jasonwebb/2d-space-colonization-experiments (fetched): attraction distance, kill distance, segment length, open and closed venation, canalization.
- https://en.wikipedia.org/wiki/L-system (fetched): rewriting, alphabet, axiom, turtle graphics, stochastic and parametric variants.
- https://www.karlsims.com/rd.html (fetched): Gray-Scott parameters, Laplacian weights, initial conditions.
- https://en.wikipedia.org/wiki/Procedural_generation (fetched): seeds, "procedural oatmeal".
- local: `skills/rasanai/stage3d/glsl.js` (`Rasan3DLib.tube` attributes `uv`, `aLen`, `aTangent`).
- Not fetched: the original Runions et al. paper (algorithmicbotany.org did not resolve; diglib.eg.org returned 403), so the numeric starting values above are our own and unverified. Karl Sims' site gives only the equations and one parameter pair; the f/k variation notes are from the page's description of pattern types, not a table of values.
