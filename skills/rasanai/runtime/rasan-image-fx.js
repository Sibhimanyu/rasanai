/* RasanImageFX: seek-safe image effects for paused GSAP timelines. WebGL with a canvas-2D fallback. Our own code, no dependencies.
 *
 * It makes a STILL move: depth parallax, dot / pixel / halftone dissolves, a displacement morph between two pictures, mask wipes
 * (shape, text, torn paper, your own mask picture), a corner-pin onto a mockup, and a grade with a palette lock. One canvas per surface.
 *
 *   <canvas id="hero" width="1920" height="1080"></canvas>
 *   <script src="assets/rasan-image-fx/rasan-image-fx.js"></script>
 *   var fx = RasanImageFX.create({ canvas: "#hero", src: "assets/plate.png", depth: "assets/plate.depth.png", src2: "assets/b.png",
 *                                  plate: "mock/back.png", over: "mock/over.png", seed: 7 });
 *   // build it on the paused timeline (a GSAP timeline `tl`); every helper takes (tl, at, duration, options)
 *   fx.parallax(tl, 0,   6,   { from: { x: -0.6, y: 0.1, z: 0 }, to: { x: 0.6, y: -0.1, z: 0.18 }, ease: "sine.inOut" });
 *   fx.dissolve(tl, 0,   1.2, { mode: "dot", dir: "in", cell: 28 });              // dot | pixel | halftone, in | out
 *   fx.morph(tl, 3,      1.0, { strength: 0.14 });                                // src -> src2 through displacement
 *   fx.wipe(tl, 4,       0.9, { shape: "torn", angle: 20 });                      // circle | rect | bars | linear | text | torn | mask
 *   fx.pin(tl, 5,        1.0, { from: [[.2,.2],[.8,.2],[.8,.8],[.2,.8]], to: quadFromMockupJson, aspect: 1.78, radius: 0.02 });
 *   fx.grade(tl, 0,      6,   { to: { contrast: 1.12, saturation: 0.9, vignette: 0.25, grain: 0.02 } });
 *   fx.palette(["#14072e", "#c1272d", "#ff9d00", "#fff3c4"], { mode: "map", amount: 1 });   // lock the film's palette
 *
 * Seek-safety (HyperFrames renders by seeking a paused timeline):
 *   * every frame is a PURE FUNCTION of the state in fx.p, and fx.p is written only by timeline tweens (their setters, which run on any seek,
 *     even with events suppressed). The canvas is redrawn synchronously inside each write: no rAF, no clock, no Math.random.
 *   * noise is a seeded hash of the cell and `seed`; grain is a hash of the pixel and the integer `grain.t` (set it from the timeline: fx.grainClock(tl, fps)).
 *   * images are drawn when loaded. Wait for `fx.ready` (a Promise) before capture, or use the `hf-ready` hook: fx.ready.then(function(){ window.__fxReady = true; }).
 *   * cross-origin pictures need CORS (crossOrigin=anonymous); local project assets are fine.
 *
 * State (fx.p, also fx.set({...}) deep-merges):
 *   cam     {x, y, z, rot}      x,y in -1..1 orbit (parallax), z zoom (0 = none, 0.2 = +20%, depth-aware), rot degrees
 *   strength 0.03  focus 0.5   parallax size as a fraction of the width at |x| = 1; the depth that stays still (0 = far, 1 = near)
 *   dis     {mode, t, cell, order, spread, ink}   mode none|dot|pixel|halftone; t 0 = hidden .. 1 = shown; order noise|radial|ltr|ttb|luma
 *   morph   {t, strength, angle}   0 = src, 1 = src2
 *   wipe    {shape, t, feather, angle, cx, cy, bars, text, font, scale, keep, rim, rimColor, roughness, maskUrl, invert}   0 = src, 1 = src2 (or src over bg)
 *   pin     {on, q: [[x,y] x4] in 0..1 of the canvas, aspect, radius}    TL TR BR BL; the picture is cover-fitted to `aspect`
 *   grade   {exposure, contrast, saturation, temp, tint, tintAmt, vignette, grain, t, fade}
 *   pal     {colors: ["#hex" ...up to 8, dark to light], mode: "map"|"snap", amount}
 *   bg      "#rrggbb" or null (transparent) behind a dissolved picture      seed   integer
 * Status: new (smoke-run only). Pure helpers are exposed for tests: RasanImageFX.homography, RasanImageFX.hash.
 */
(function (root) {
  "use strict";
  var VERSION = "1.0.0";
  var MAXPAL = 8;
  function num(x, d) { return typeof x === "number" && isFinite(x) ? x : d; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function mixf(a, b, t) { return a + (b - a) * t; }
  function need(c, m) { if (!c) throw new Error("RasanImageFX: " + m); }
  function hexRGB(h) { if (Array.isArray(h)) return h; var s = String(h || "#000000").replace("#", ""); if (s.length === 3) s = s.replace(/./g, function (x) { return x + x; }); return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255]; }
  function fract(x) { return x - Math.floor(x); }
  // a stateless 2-D hash in [0,1): the same formula in the shader and here
  function hash(x, y, seed) { var px = fract(x * 443.897 + seed * 0.137), py = fract(y * 441.423 + seed * 0.137), d = px * (py + 19.19) + py * (px + 19.19); px += d; py += d; return fract((px + py) * px); }
  function vnoise1(x, seed) { var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return mixf(hash(i, 7.1, seed), hash(i + 1, 7.1, seed), u); }

  // homography from the unit square to a quad [TL,TR,BR,BL] (pixel points), as a row-major 3x3, and its inverse
  function homography(q) {
    var x0 = q[0][0], y0 = q[0][1], x1 = q[1][0], y1 = q[1][1], x2 = q[2][0], y2 = q[2][1], x3 = q[3][0], y3 = q[3][1];
    var dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3, g = 0, h = 0;
    if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) { var den = dx1 * dy2 - dx2 * dy1; g = (sx * dy2 - dx2 * sy) / den; h = (dx1 * sy - sx * dy1) / den; }
    var m = [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
    var a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], gg = m[6], hh = m[7], i = m[8];
    var A = e * i - f * hh, B = -(d * i - f * gg), C = d * hh - e * gg, det = a * A + b * B + c * C;
    var inv = [A / det, -(b * i - c * hh) / det, (b * f - c * e) / det, B / det, (a * i - c * gg) / det, -(a * f - c * d) / det, C / det, -(a * hh - b * gg) / det, (a * e - b * d) / det];
    return { m: m, inv: inv };
  }

  // ------------------------------------------------------------------ the fragment shader (WebGL1 / GLSL ES 1.00)
  var VERT = "attribute vec2 a; varying vec2 vUv; void main(){ vUv = a*0.5+0.5; gl_Position = vec4(a,0.,1.); }";
  var FRAG = [
    "precision highp float;",
    "varying vec2 vUv;",
    "uniform sampler2D uA,uB,uD,uM,uP,uO;",
    "uniform vec4 uFitA,uFitB; uniform vec3 uHas; uniform vec3 uHas2; uniform float uContain;", // uHas: B, depth, mask ; uHas2: plate, over, bg alpha
    "uniform vec2 uRes; uniform float uAspect,uSeed;",
    "uniform vec4 uCam; uniform vec3 uPar;", // cam x y z rot ; strength focus dolly
    "uniform vec4 uDis; uniform vec4 uDis2; uniform vec4 uInk;", // mode t cell order ; spread, , , ; ink rgb+use
    "uniform vec3 uMorph;", // t strength angle(rad)
    "uniform vec4 uWipe; uniform vec4 uWipe2; uniform vec4 uWipe3; uniform vec4 uRimC;", // shape t feather angle ; cx cy bars keep ; rim, , , ; rim colour
    "uniform vec3 uBg; uniform mat3 uPinInv; uniform vec4 uPin;", // pin on, aspect, radius
    "uniform vec4 uG1,uG2,uG3; uniform vec3 uTint;", // exposure contrast saturation temp ; tintAmt vignette grain grainT ; fade
    "uniform vec3 uPal[8]; uniform vec3 uPalMode;", // n mode amount
    "float lum(vec3 c){ return dot(c,vec3(.2126,.7152,.0722)); }",
    "float hash(vec2 p){ vec2 q = fract(p*vec2(443.897,441.423)+uSeed*0.137); float d = q.x*(q.y+19.19)+q.y*(q.x+19.19); q += d; return fract((q.x+q.y)*q.x); }",
    "vec4 tx(sampler2D s, vec4 fit, vec2 uv){ vec2 t = uv*fit.xy+fit.zw; float m = 1.; if(uContain>.5){ m = step(0.,t.x)*step(t.x,1.)*step(0.,t.y)*step(t.y,1.); } return texture2D(s, clamp(t,.0005,.9995))*vec4(1.,1.,1.,m); }",
    "float dep(vec2 uv){ if(uHas.y<.5) return .5; vec2 t = uv*uFitA.xy+uFitA.zw; return texture2D(uD, clamp(t,.0005,.9995)).r; }",
    "vec2 parallax(vec2 uv){",
    "  float asp = uAspect; vec2 p = (uv-.5)*vec2(asp,1.);",
    "  float r = uCam.w; float cs = cos(r), sn = sin(r); p = vec2(p.x*cs - p.y*sn, p.x*sn + p.y*cs); p /= vec2(asp,1.);",
    "  float over = 1. + 2.*uPar.x*max(abs(uCam.x),abs(uCam.y))*(uHas.y>.5?1.:0.);",
    "  vec2 b0 = .5 + p/((1.+uCam.z)*over); vec2 s = b0;",
    "  for(int i=0;i<4;i++){ float d = dep(s)-uPar.y; vec2 off = vec2(uCam.x*uPar.x*d, -uCam.y*uPar.x*d*asp); float zf = 1.+uCam.z*uPar.z*d; s = .5 + (b0 + off - .5)/zf; }",
    "  return s; }",
    "vec4 imgA(vec2 uv){ return tx(uA,uFitA,parallax(uv)); }",
    "vec4 imgB(vec2 uv){ return tx(uB,uFitB,uv); }",
    "float wfield(vec2 uv){",
    "  float sh = uWipe.x; vec2 c = uWipe2.xy; float asp = uAspect; vec2 d = (uv-c)*vec2(asp,1.);",
    "  float ang = uWipe.w; vec2 dir = vec2(cos(ang),sin(ang));",
    "  if(sh<1.5) return length(d)/length(max(abs(vec2(.5)-c)+vec2(.5),vec2(.001))*vec2(asp,1.));", // circle
    "  if(sh<2.5) return max(abs(d.x)/(max(abs(.5-c.x)+.5,.001)*asp), abs(d.y)/max(abs(.5-c.y)+.5,.001));", // rect
    "  if(sh<3.5){ float u = dot((uv-.5)*vec2(asp,1.),dir)/(abs(dir.x)*asp+abs(dir.y))+.5; return fract(u*uWipe2.z); }", // bars: each bar grows
    "  if(sh<4.5){ float u = dot((uv-.5)*vec2(asp,1.),dir)/(abs(dir.x)*asp+abs(dir.y))+.5; return clamp(u,0.,1.); }", // linear
    "  return texture2D(uM,uv).r; }", // mask picture: red = when it is revealed (0 first)
    "vec4 scene(vec2 uv){",
    "  vec4 a = imgA(uv); vec4 col = a;",
    "  if(uHas.x>.5){",
    "    float m = uMorph.x;",
    "    if(m>0.){ vec2 dv = vec2(cos(uMorph.z),sin(uMorph.z))*uMorph.y; float da = lum(imgB(uv).rgb)-.5, db = lum(a.rgb)-.5;",
    "      vec4 a2 = imgA(uv + dv*da*m*(vec2(1.,asp1())));",
    "      vec4 b2 = imgB(uv - dv*db*(1.-m)*vec2(1.,asp1())); col = mix(a2,b2,smoothstep(0.,1.,m)); }",
    "    if(uWipe.x>.5){ float f = wfield(uv); float fe = max(uWipe.z,.0005); float e = uWipe.y*(1.+fe) - f; float vis = clamp(e/fe,0.,1.);",
    "      vec4 b = imgB(uv);",
    "      if(uWipe3.x>0.){ float rim = uWipe3.x; float band = step(0.,e)*(1.-smoothstep(fe*.5,fe+rim,e)); b.rgb = mix(b.rgb,uRimC.rgb,band*uRimC.a); float sd = (1.-smoothstep(-rim*1.6,0.,e))*step(e,0.)*.28; col.rgb *= 1.-sd; }",
    "      col = mix(col,b,vis); }",
    "  } else if(uWipe.x>.5){",
    "    float f = wfield(uv); float fe = max(uWipe.z,.0005); float e = uWipe.y*(1.+fe) - f; float vis = clamp(e/fe,0.,1.); if(uWipe2.w>.5){ vis = texture2D(uM,uv).r*clamp(uWipe.y*2.,0.,1.); }",
    "    if(uWipe3.x>0.){ float band = step(0.,e)*(1.-smoothstep(fe*.5,fe+uWipe3.x,e)); col.rgb = mix(col.rgb,uRimC.rgb,band*uRimC.a); }",
    "    col.a *= vis; }",
    "  return col; }",
    "void main(){",
    "  vec2 frag = vec2(gl_FragCoord.x, uRes.y-gl_FragCoord.y); vec2 uvo = frag/uRes; vec2 uv = uvo; float cover = 1.;",
    "  vec4 base = vec4(uBg, uHas2.z); if(uHas2.x>.5) base = texture2D(uP,uvo);",
    "  if(uPin.x>.5){ vec3 h = uPinInv*vec3(frag,1.); uv = h.xy/h.z; cover = step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);",
    "    if(uPin.z>0.){ vec2 pp = vec2(uv.x*uPin.y, uv.y); float r = uPin.z; vec2 cc = vec2(clamp(pp.x,r,uPin.y-r), clamp(pp.y,r,1.-r)); cover *= step(length(pp-cc), r); } }",
    "  vec2 fpx = uv*uRes; vec4 col = scene(uv); float vis = 1.;",
    "  float mode = uDis.x; float t = uDis.y;",
    "  if(mode>.5 && t<.9999){",
    "    float cell = max(uDis.z,2.); float order = uDis2.w; float sp = uDis2.x;",
    "    if(mode<2.5){",
    "      vec2 g = fpx; if(mode>1.5){ float ca = .7853982; g = vec2(fpx.x*cos(ca)+fpx.y*sin(ca), -fpx.x*sin(ca)+fpx.y*cos(ca)); }",
    "      vec2 ci = floor(g/cell); vec2 cc = (ci+.5)*cell; vec2 cp = cc; if(mode>1.5){ float ca = .7853982; cp = vec2(cc.x*cos(ca)-cc.y*sin(ca), cc.x*sin(ca)+cc.y*cos(ca)); }",
    "      vec4 sc = scene(cp/uRes); float lm = lum(sc.rgb);",
    "      float thr = hash(ci+3.7); if(order>.5&&order<1.5) thr = clamp(length((cp/uRes-.5)*vec2(uAspect,1.))*1.2,0.,1.); else if(order>1.5&&order<2.5) thr = cp.x/uRes.x; else if(order>2.5&&order<3.5) thr = cp.y/uRes.y; else if(order>3.5) thr = 1.-lm;",
    "      float loc = clamp((t - thr*sp)/max(1.-sp,.05),0.,1.);",
    "      float rad = cell*.5*1.18*sqrt(loc)*(mode>1.5 ? (.3+.7*sqrt(1.-lm)) : (.45+.55*lm)); float dd = length(g-cc);",
    "      float dm = smoothstep(rad+.8,rad-.8,dd); vec3 dc = uInk.w>.5 ? uInk.rgb : sc.rgb;",
    "      vec4 dots = vec4(dc, sc.a*dm); float k = smoothstep(.82,1.,t);",
    "      col = mix(dots, col, k); if(uInk.w>.5) col.rgb = mix(uInk.rgb, col.rgb, k);",
    "    } else {",
    "      float lev = floor(clamp(t,0.,.999)*5.); float blk = max(1., cell/exp2(lev));",
    "      vec2 bi = floor(fpx/blk); vec2 bc = (bi+.5)*blk; vec4 sc = scene(bc/uRes);",
    "      vec2 ci = floor(fpx/cell); vec2 cp = (ci+.5)*cell; float thr = hash(ci+5.3); if(order>.5&&order<1.5) thr = clamp(length((cp/uRes-.5)*vec2(uAspect,1.))*1.2,0.,1.); else if(order>1.5&&order<2.5) thr = cp.x/uRes.x; else if(order>2.5&&order<3.5) thr = cp.y/uRes.y; else if(order>3.5) thr = 1.-lum(scene(cp/uRes).rgb);",
    "      float loc = clamp((t - thr*sp)/max(1.-sp,.05),0.,1.); col = vec4(sc.rgb, sc.a*step(.0001,loc));",
    "      col = mix(col, scene(uv), smoothstep(.93,1.,t)); }",
    "  }",
    "  vec3 c = col.rgb; float al = col.a*cover;",
    // grade
    "  c *= exp2(uG1.x); c = (c-.5)*uG1.y+.5; float l = lum(c); c = mix(vec3(l),c,uG1.z); c *= vec3(1.+uG1.w*.12, 1., 1.-uG1.w*.12); c = mix(c, c*uTint, uG2.x); c = mix(c, vec3(lum(c)*.9+.08), uG3.x);",
    "  vec2 vq = (uvo-.5)*vec2(uAspect,1.); c *= 1. - uG2.y*smoothstep(.25,.95,length(vq)*1.1);",
    // palette lock
    "  if(uPalMode.x>1.5 && uPalMode.z>0.){",
    "    float lq = clamp(lum(c),0.,1.); vec3 mapped = c;",
    "    if(uPalMode.y<.5){ float fx = lq*(uPalMode.x-1.); vec3 p0 = uPal[0], p1 = uPal[1]; for(int i=0;i<7;i++){ if(float(i) < uPalMode.x-1.){ if(fx>=float(i)){ p0 = uPal[i]; p1 = uPal[i+1]; } } } float fr = clamp(fx-floor(min(fx,uPalMode.x-1.001)),0.,1.); mapped = mix(p0,p1,fr); }",
    "    else { float best = 1e9; for(int i=0;i<8;i++){ if(float(i)<uPalMode.x){ float dd = dot(c-uPal[i],c-uPal[i]); if(dd<best){ best = dd; mapped = uPal[i]; } } } }",
    "    c = mix(c,mapped,uPalMode.z); }",
    "  c += (hash(frag+uG2.w*1.37) + hash(frag+7.3+uG2.w*2.11) - 1.)*uG2.z*2.;",
    "  vec4 content = vec4(clamp(c,0.,1.), al);",
    "  vec4 o = vec4(mix(base.rgb, content.rgb, content.a), max(base.a, content.a));",
    "  if(uHas2.y>.5){ vec4 ov = texture2D(uO,uvo); o.rgb = mix(o.rgb, ov.rgb, ov.a); o.a = max(o.a, ov.a); }",
    "  gl_FragColor = vec4(o.rgb, o.a); }",
  ].join("\n").replace(/asp1\(\)/g, "uAspect");

  // ------------------------------------------------------------------ loading
  function loadImage(src) {
    if (!src) return Promise.resolve(null);
    if (typeof src !== "string") { if (src.complete && src.naturalWidth) return Promise.resolve(src); return new Promise(function (res, rej) { src.addEventListener("load", function () { res(src); }); src.addEventListener("error", function () { rej(new Error("image failed")); }); }); }
    return new Promise(function (res, rej) { var im = new Image(); im.crossOrigin = "anonymous"; im.onload = function () { res(im); }; im.onerror = function () { rej(new Error("RasanImageFX: cannot load " + src)); }; im.src = src; });
  }
  function fitFor(w, h, target, contain) {
    var a = w / h, su = 1, sv = 1, ou = 0, ov = 0;
    if (!contain) { if (a > target) { su = target / a; ou = (1 - su) / 2; } else { sv = a / target; ov = (1 - sv) / 2; } }
    else { if (a > target) { sv = a / target; ov = (1 - sv) / 2; } else { su = target / a; ou = (1 - su) / 2; } }
    return [su, sv, ou, ov];
  }

  // ------------------------------------------------------------------ create
  function create(o) {
    o = o || {};
    var canvas = typeof o.canvas === "string" ? document.querySelector(o.canvas) : o.canvas;
    if (!canvas) { canvas = document.createElement("canvas"); (o.parent || document.body).appendChild(canvas); }
    var W = o.width || canvas.width || 1920, H = o.height || canvas.height || 1080;
    canvas.width = W; canvas.height = H;
    var P = {
      cam: { x: 0, y: 0, z: 0, rot: 0 }, strength: 0.03, focus: 0.5, dolly: 0.4,
      dis: { mode: "none", t: 1, cell: 24, order: "noise", spread: 0.6, ink: null },
      morph: { t: 0, strength: 0.12, angle: 0 },
      wipe: { shape: "none", t: 0, feather: 0.04, angle: 0, cx: 0.5, cy: 0.5, bars: 8, text: "", font: "900 320px sans-serif", scale: 1, keep: false, rim: 0, rimColor: "#f3ecdc", roughness: 0.1, maskUrl: "", invert: false },
      pin: { on: false, q: [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]], aspect: W / H, radius: 0 },
      grade: { exposure: 0, contrast: 1, saturation: 1, temp: 0, tint: "#ffffff", tintAmt: 0, vignette: 0, grain: 0, t: 0, fade: 0 },
      pal: { colors: [], mode: "map", amount: 1 },
      bg: o.bg === undefined ? null : o.bg, seed: num(o.seed, 1),
    };
    var fx = { version: VERSION, p: P, canvas: canvas, width: W, height: H, mode: "none", ready: null };
    var img = {}, fits = { a: [1, 1, 0, 0], b: [1, 1, 0, 0] }, maskState = { key: "", data: null, w: 0, h: 0, dirty: true, extImg: null };
    var gl = null, prog = null, U = {}, tex = {}, cv2 = null, ctx2 = null, cpu = null;
    var contain = o.fit === "contain";

    function deepSet(dst, src) { for (var k in src) { if (src[k] && typeof src[k] === "object" && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === "object" && !Array.isArray(dst[k])) deepSet(dst[k], src[k]); else dst[k] = src[k]; } return dst; }
    fx.set = function (patch) { deepSet(P, patch || {}); return fx; };

    // ---- masks: text, torn paper and a picture become one grey field (red = when this pixel is revealed, 0 first)
    var SHAPES = { none: 0, circle: 1, iris: 1, rect: 2, bars: 3, linear: 4, diag: 4, text: 5, torn: 5, mask: 5 };
    function buildMask() {
      var w = P.wipe, key = [w.shape, w.text, w.font, w.scale, w.angle, w.roughness, w.maskUrl, w.invert, w.keep, P.seed].join("|");
      if (key === maskState.key) return;
      maskState.key = key; maskState.dirty = true;
      var mw = 960, mh = Math.max(2, Math.round(960 * H / W)), c = document.createElement("canvas"); c.width = mw; c.height = mh;
      var g = c.getContext("2d"), d;
      if (w.shape === "text") {
        g.fillStyle = "#000"; g.fillRect(0, 0, mw, mh); g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
        var fs = (w.font.match(/(\d+(?:\.\d+)?)px/) || [0, 320])[1] * (mw / W) * (w.scale || 1);
        g.font = w.font.replace(/\d+(?:\.\d+)?px/, fs + "px");
        var lines = String(w.text || "").split("\n"), lh = fs * 1.02, y0 = mh / 2 - ((lines.length - 1) * lh) / 2;
        for (var i = 0; i < lines.length; i++) g.fillText(lines[i], mw / 2, y0 + i * lh);
        d = g.getImageData(0, 0, mw, mh); for (var k = 0; k < d.data.length; k += 4) { var f = w.keep ? d.data[k] / 255 : 1 - d.data[k] / 255; d.data[k] = d.data[k + 1] = d.data[k + 2] = Math.round(f * 255); d.data[k + 3] = 255; }
      } else if (w.shape === "torn") {
        d = g.createImageData(mw, mh); var a = (w.angle || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), rough = w.roughness;
        var dirx = ca, diry = sa, norm = Math.abs(dirx) * W + Math.abs(diry) * H;
        for (var y = 0; y < mh; y++) for (var x = 0; x < mw; x++) {
          var px = (x / mw - 0.5) * W, py = (y / mh - 0.5) * H, u = (px * dirx + py * diry) / norm + 0.5, along = (-px * diry + py * dirx) / 60;
          var n = vnoise1(along, P.seed) * 0.55 + vnoise1(along * 3.1, P.seed + 5) * 0.3 + vnoise1(along * 9.7, P.seed + 9) * 0.15, v = clamp(u + (n - 0.5) * rough * 1.0, 0, 1) * 255, i2 = (y * mw + x) * 4;
          d.data[i2] = d.data[i2 + 1] = d.data[i2 + 2] = v; d.data[i2 + 3] = 255;
        }
      } else if (maskState.extImg) {
        g.drawImage(maskState.extImg, 0, 0, mw, mh); d = g.getImageData(0, 0, mw, mh);
        for (var q = 0; q < d.data.length; q += 4) { var l = (d.data[q] * 0.2126 + d.data[q + 1] * 0.7152 + d.data[q + 2] * 0.0722) / 255, ff = w.invert ? l : 1 - l; d.data[q] = d.data[q + 1] = d.data[q + 2] = Math.round(ff * 255); d.data[q + 3] = 255; }
      } else { d = g.createImageData(mw, mh); for (var z = 0; z < d.data.length; z += 4) { d.data[z] = d.data[z + 1] = d.data[z + 2] = 128; d.data[z + 3] = 255; } }
      maskState.data = d; maskState.w = mw; maskState.h = mh;
    }

    // ---- WebGL
    function initGL() {
      if (o.mode === "canvas") return false;
      var g; try { g = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false }) || canvas.getContext("experimental-webgl", { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true }); } catch (e) { g = null; }
      if (!g) return false;
      function sh(type, src) { var s = g.createShader(type); g.shaderSource(s, src); g.compileShader(s); if (!g.getShaderParameter(s, g.COMPILE_STATUS)) { var m = g.getShaderInfoLog(s); g.deleteShader(s); throw new Error("shader: " + m); } return s; }
      try {
        prog = g.createProgram(); g.attachShader(prog, sh(g.VERTEX_SHADER, VERT)); g.attachShader(prog, sh(g.FRAGMENT_SHADER, FRAG)); g.linkProgram(prog);
        if (!g.getProgramParameter(prog, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(prog));
      } catch (e) { if (typeof console !== "undefined") console.warn("RasanImageFX: WebGL shader failed, using the canvas fallback (" + e.message + ")"); return false; }
      g.useProgram(prog);
      var buf = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, buf); g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
      var loc = g.getAttribLocation(prog, "a"); g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
      ["uA", "uB", "uD", "uM", "uP", "uO", "uFitA", "uFitB", "uHas", "uHas2", "uContain", "uRes", "uAspect", "uSeed", "uCam", "uPar", "uDis", "uDis2", "uInk", "uMorph", "uWipe", "uWipe2", "uWipe3", "uRimC", "uBg", "uPinInv", "uPin", "uG1", "uG2", "uG3", "uTint", "uPal", "uPalMode"].forEach(function (n) { U[n] = g.getUniformLocation(prog, n); });
      gl = g; return true;
    }
    function makeTex(unit, source, w, h, isData) {
      var t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
      var pot = false; // WebGL1: non-power-of-two textures need CLAMP and no mipmaps; linear filter is what we want
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (isData) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, source); else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      void pot; return t;
    }
    var BLANK = null;
    function uploadAll() {
      var blank = new Uint8Array([128, 128, 128, 255]);
      tex.a = makeTex(0, img.a || blank, 1, 1, !img.a); tex.b = makeTex(1, img.b || blank, 1, 1, !img.b); tex.d = makeTex(2, img.d || blank, 1, 1, !img.d);
      tex.m = makeTex(3, blank, 1, 1, true); tex.p = makeTex(4, img.p || blank, 1, 1, !img.p); tex.o = makeTex(5, img.o || new Uint8Array([0, 0, 0, 0]), 1, 1, !img.o);
      void BLANK;
    }
    function drawGL() {
      var g = gl, w = P.wipe, d = P.dis, gr = P.grade, cm = P.cam, pn = P.pin;
      g.viewport(0, 0, W, H); g.useProgram(prog);
      var shape = SHAPES[w.shape] || 0;
      if (shape === 5 || (w.keep && w.shape === "text")) { buildMask(); if (maskState.dirty) { g.activeTexture(g.TEXTURE3); g.bindTexture(g.TEXTURE_2D, tex.m); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, maskState.w, maskState.h, 0, g.RGBA, g.UNSIGNED_BYTE, maskState.data.data); maskState.dirty = false; } }
      for (var i = 0; i < 6; i++) { g.activeTexture(g.TEXTURE0 + i); g.bindTexture(g.TEXTURE_2D, [tex.a, tex.b, tex.d, tex.m, tex.p, tex.o][i]); }
      g.uniform1i(U.uA, 0); g.uniform1i(U.uB, 1); g.uniform1i(U.uD, 2); g.uniform1i(U.uM, 3); g.uniform1i(U.uP, 4); g.uniform1i(U.uO, 5);
      g.uniform4fv(U.uFitA, fits.a); g.uniform4fv(U.uFitB, fits.b);
      g.uniform3f(U.uHas, img.b ? 1 : 0, img.d ? 1 : 0, 0); g.uniform3f(U.uHas2, img.p ? 1 : 0, img.o ? 1 : 0, P.bg ? 1 : 0); g.uniform1f(U.uContain, contain ? 1 : 0);
      g.uniform2f(U.uRes, W, H); g.uniform1f(U.uAspect, pn.on ? pn.aspect : W / H); g.uniform1f(U.uSeed, P.seed);
      g.uniform4f(U.uCam, cm.x, cm.y, cm.z, (cm.rot * Math.PI) / 180); g.uniform3f(U.uPar, P.strength, P.focus, P.dolly);
      var MODES = { none: 0, dot: 1, pixel: 3, halftone: 2 }, ORD = { noise: 0, radial: 1, ltr: 2, ttb: 3, luma: 4 };
      g.uniform4f(U.uDis, MODES[d.mode] || 0, clamp(d.t, 0, 1), d.cell, 0); g.uniform4f(U.uDis2, clamp(d.spread, 0, 0.95), 0, 0, ORD[d.order] || 0);
      var ink = d.ink ? hexRGB(d.ink) : [0, 0, 0]; g.uniform4f(U.uInk, ink[0], ink[1], ink[2], d.ink ? 1 : 0);
      g.uniform3f(U.uMorph, clamp(P.morph.t, 0, 1), P.morph.strength, (P.morph.angle * Math.PI) / 180);
      g.uniform4f(U.uWipe, shape, clamp(w.t, 0, 1), w.feather, (w.angle * Math.PI) / 180); g.uniform4f(U.uWipe2, w.cx, w.cy, w.bars, w.keep ? 1 : 0);
      g.uniform4f(U.uWipe3, w.rim, 0, 0, 0); var rc = hexRGB(w.rimColor); g.uniform4f(U.uRimC, rc[0], rc[1], rc[2], w.rim > 0 ? 1 : 0);
      var bg = P.bg ? hexRGB(P.bg) : [0, 0, 0]; g.uniform3f(U.uBg, bg[0], bg[1], bg[2]);
      var inv = pinInv(); g.uniformMatrix3fv(U.uPinInv, false, new Float32Array([inv[0], inv[3], inv[6], inv[1], inv[4], inv[7], inv[2], inv[5], inv[8]]));
      g.uniform4f(U.uPin, pn.on ? 1 : 0, pn.aspect, pn.radius, 0);
      g.uniform4f(U.uG1, gr.exposure, gr.contrast, gr.saturation, gr.temp); var tn = hexRGB(gr.tint); g.uniform3f(U.uTint, tn[0], tn[1], tn[2]);
      g.uniform4f(U.uG2, gr.tintAmt, gr.vignette, gr.grain, Math.floor(gr.t)); g.uniform4f(U.uG3, gr.fade, 0, 0, 0);
      var pc = P.pal.colors || [], flat = new Float32Array(MAXPAL * 3); for (var k = 0; k < Math.min(MAXPAL, pc.length); k++) { var c = hexRGB(pc[k]); flat[k * 3] = c[0]; flat[k * 3 + 1] = c[1]; flat[k * 3 + 2] = c[2]; }
      g.uniform3fv(U.uPal, flat); g.uniform3f(U.uPalMode, Math.min(MAXPAL, pc.length), P.pal.mode === "snap" ? 1 : 0, P.pal.amount);
      g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT); g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    }
    function pinInv() {
      var pn = P.pin; if (!pn.on) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
      var h = homography(pn.q.map(function (p) { return [p[0] * W, p[1] * H]; })), m = h.inv; // frag px -> unit square
      return m;
    }

    // ---- canvas-2D fallback: the same pipeline, per pixel, at a reduced internal size (fallbackScale), CSS-scaled up by the canvas itself
    function initCPU() {
      var sc = clamp(num(o.fallbackScale, 0.5), 0.1, 1), cw = Math.max(2, Math.round(W * sc)), ch = Math.max(2, Math.round(H * sc));
      ctx2 = canvas.getContext("2d"); if (!ctx2) throw new Error("RasanImageFX: no WebGL and no 2D canvas");
      cpu = { sc: sc, w: cw, h: ch, buf: ctx2.createImageData(W, H) };
      function px(im) { if (!im) return null; var c = document.createElement("canvas"), m = Math.min(1, 1920 / Math.max(im.naturalWidth || im.width, 1)); c.width = Math.max(1, Math.round((im.naturalWidth || im.width) * m)); c.height = Math.max(1, Math.round((im.naturalHeight || im.height) * m)); var g = c.getContext("2d"); g.drawImage(im, 0, 0, c.width, c.height); return { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data }; }
      cpu.a = px(img.a); cpu.b = px(img.b); cpu.d = px(img.d); cpu.p = px(img.p); cpu.o = px(img.o);
    }
    function sampleCPU(t, u, v, out) { // bilinear, clamp
      var x = clamp(u, 0.0005, 0.9995) * t.w - 0.5, y = clamp(v, 0.0005, 0.9995) * t.h - 0.5; x = clamp(x, 0, t.w - 1); y = clamp(y, 0, t.h - 1);
      var x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(t.w - 1, x0 + 1), y1 = Math.min(t.h - 1, y0 + 1), fx = x - x0, fy = y - y0, d = t.d;
      for (var k = 0; k < 4; k++) out[k] = ((d[(y0 * t.w + x0) * 4 + k] * (1 - fx) + d[(y0 * t.w + x1) * 4 + k] * fx) * (1 - fy) + (d[(y1 * t.w + x0) * 4 + k] * (1 - fx) + d[(y1 * t.w + x1) * 4 + k] * fx) * fy) / 255;
      return out;
    }
    function drawCPU() {
      var sc = cpu.sc, w = P.wipe, d = P.dis, cm = P.cam, pn = P.pin, gr = P.grade, asp = pn.on ? pn.aspect : W / H;
      var shape = SHAPES[w.shape] || 0; if (shape === 5) buildMask();
      var MODES = { none: 0, dot: 1, pixel: 3, halftone: 2 }, ORD = { noise: 0, radial: 1, ltr: 2, ttb: 3, luma: 4 }, mode = MODES[d.mode] || 0, order = ORD[d.order] || 0;
      var inv = pinInv(), bg = P.bg ? hexRGB(P.bg) : [0, 0, 0], tn = hexRGB(gr.tint), ink = d.ink ? hexRGB(d.ink) : null, rc = hexRGB(w.rimColor);
      var pal = (P.pal.colors || []).slice(0, MAXPAL).map(hexRGB), cr = Math.cos((cm.rot * Math.PI) / 180), sr = Math.sin((cm.rot * Math.PI) / 180);
      var fa = fits.a, fb = fits.b, tmp = [0, 0, 0, 0], tmp2 = [0, 0, 0, 0], wa = (w.angle * Math.PI) / 180, wdx = Math.cos(wa), wdy = Math.sin(wa), over = 1 + 2 * P.strength * Math.max(Math.abs(cm.x), Math.abs(cm.y)) * (cpu.d ? 1 : 0);
      function lum(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
      function tx(t, fit, u, v, out) { var su = u * fit[0] + fit[2], sv = v * fit[1] + fit[3], m = 1; if (contain) m = su >= 0 && su <= 1 && sv >= 0 && sv <= 1 ? 1 : 0; sampleCPU(t, su, sv, out); out[3] *= m; return out; }
      function dep(u, v) { if (!cpu.d) return 0.5; sampleCPU(cpu.d, u * fa[0] + fa[2], v * fa[1] + fa[3], tmp2); return tmp2[0]; }
      function par(u, v) {
        var px0 = (u - 0.5) * asp, py0 = v - 0.5, qx = px0 * cr - py0 * sr, qy = px0 * sr + py0 * cr; qx /= asp;
        var zs = (1 + cm.z) * over, bx = 0.5 + qx / zs, by = 0.5 + qy / zs, sx = bx, sy = by;
        for (var i = 0; i < 4; i++) { var dd = dep(sx, sy) - P.focus, offx = cm.x * P.strength * dd, offy = -cm.y * P.strength * dd * asp, zf = 1 + cm.z * P.dolly * dd; sx = 0.5 + (bx + offx - 0.5) / zf; sy = 0.5 + (by + offy - 0.5) / zf; }
        return [sx, sy];
      }
      function imgA(u, v, out) { var s = par(u, v); return tx(cpu.a, fa, s[0], s[1], out); }
      function imgB(u, v, out) { return tx(cpu.b, fb, u, v, out); }
      function wfield(u, v) {
        var cx = w.cx, cy = w.cy, ddx = (u - cx) * asp, ddy = v - cy;
        if (shape < 1.5) return Math.hypot(ddx, ddy) / Math.hypot(Math.max(Math.abs(0.5 - cx) + 0.5, 0.001) * asp, Math.max(Math.abs(0.5 - cy) + 0.5, 0.001));
        if (shape < 2.5) return Math.max(Math.abs(ddx) / (Math.max(Math.abs(0.5 - cx) + 0.5, 0.001) * asp), Math.abs(ddy) / Math.max(Math.abs(0.5 - cy) + 0.5, 0.001));
        if (shape < 4.5) { var uu = ((u - 0.5) * asp * wdx + (v - 0.5) * wdy) / (Math.abs(wdx) * asp + Math.abs(wdy)) + 0.5; return shape < 3.5 ? fract(uu * w.bars) : clamp(uu, 0, 1); }
        var mx = clamp(Math.floor(u * maskState.w), 0, maskState.w - 1), my = clamp(Math.floor(v * maskState.h), 0, maskState.h - 1); return maskState.data.data[(my * maskState.w + mx) * 4] / 255;
      }
      var A = [0, 0, 0, 0], B = [0, 0, 0, 0], A2 = [0, 0, 0, 0];
      function scene(u, v, out) {
        imgA(u, v, A); out[0] = A[0]; out[1] = A[1]; out[2] = A[2]; out[3] = A[3];
        if (cpu.b) {
          var m = P.morph.t;
          if (m > 0) { var dvx = Math.cos((P.morph.angle * Math.PI) / 180) * P.morph.strength, dvy = Math.sin((P.morph.angle * Math.PI) / 180) * P.morph.strength; imgB(u, v, B); var da = lum(B[0], B[1], B[2]) - 0.5, db = lum(A[0], A[1], A[2]) - 0.5; imgA(u + dvx * da * m, v + dvy * da * m * asp, A2); imgB(u - dvx * db * (1 - m), v - dvy * db * (1 - m) * asp, B); var k = m * m * (3 - 2 * m); for (var c = 0; c < 4; c++) out[c] = A2[c] * (1 - k) + B[c] * k; }
          if (shape > 0.5) { var f = wfield(u, v), fe = Math.max(w.feather, 0.0005), e = w.t * (1 + fe) - f, vis = clamp(e / fe, 0, 1); imgB(u, v, B); if (w.rim > 0) { var band = e >= 0 ? 1 - smooth(fe * 0.5, fe + w.rim, e) : 0; B[0] = mixf(B[0], rc[0], band); B[1] = mixf(B[1], rc[1], band); B[2] = mixf(B[2], rc[2], band); if (e < 0) { var sd = (1 - smooth(-w.rim * 1.6, 0, e)) * 0.28; out[0] *= 1 - sd; out[1] *= 1 - sd; out[2] *= 1 - sd; } } for (var c2 = 0; c2 < 4; c2++) out[c2] = out[c2] * (1 - vis) + B[c2] * vis; }
        } else if (shape > 0.5) { var f2 = wfield(u, v), fe2 = Math.max(w.feather, 0.0005), e2 = w.t * (1 + fe2) - f2, v2 = clamp(e2 / fe2, 0, 1); if (w.keep) v2 = (maskState.data.data[(clamp(Math.floor(v * maskState.h), 0, maskState.h - 1) * maskState.w + clamp(Math.floor(u * maskState.w), 0, maskState.w - 1)) * 4] / 255) * clamp(w.t * 2, 0, 1); out[3] *= v2; }
        return out;
      }
      function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
      var out = cpu.buf.data, SC = [0, 0, 0, 0], SCc = [0, 0, 0, 0], ca45 = 0.7853982, cc45 = Math.cos(ca45), sc45 = Math.sin(ca45), pbase = [0, 0, 0, 0];
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        // the reduced-size render: compute per block of (1/sc) pixels, copy the result to the whole block
        if ((x % Math.round(1 / sc)) || (y % Math.round(1 / sc))) { var ux = x - (x % Math.round(1 / sc)), uy = y - (y % Math.round(1 / sc)), si = (uy * W + ux) * 4, di = (y * W + x) * 4; out[di] = out[si]; out[di + 1] = out[si + 1]; out[di + 2] = out[si + 2]; out[di + 3] = out[si + 3]; continue; }
        var fx2 = x + 0.5, fy2 = y + 0.5, uvx = fx2 / W, uvy = fy2 / H, cover = 1, u = uvx, v = uvy;
        pbase[0] = bg[0]; pbase[1] = bg[1]; pbase[2] = bg[2]; pbase[3] = P.bg ? 1 : 0;
        if (cpu.p) { sampleCPU(cpu.p, uvx, uvy, pbase); }
        if (pn.on) { var ww = inv[6] * fx2 + inv[7] * fy2 + inv[8]; u = (inv[0] * fx2 + inv[1] * fy2 + inv[2]) / ww; v = (inv[3] * fx2 + inv[4] * fy2 + inv[5]) / ww; cover = u >= 0 && u <= 1 && v >= 0 && v <= 1 ? 1 : 0; if (cover && pn.radius > 0) { var ppx = u * pn.aspect, ppy = v, rr = pn.radius, ccx = clamp(ppx, rr, pn.aspect - rr), ccy = clamp(ppy, rr, 1 - rr); if (Math.hypot(ppx - ccx, ppy - ccy) > rr) cover = 0; } }
        var col;
        if (cover || !pn.on) {
          var fpx = u * W, fpy = v * H; scene(u, v, SC); col = [SC[0], SC[1], SC[2], SC[3]];
          if (mode > 0 && d.t < 0.9999) {
            var cell = Math.max(d.cell, 2), sp = clamp(d.spread, 0, 0.95), t = clamp(d.t, 0, 1);
            if (mode !== 3) {
              var gx = fpx, gy = fpy; if (mode === 2) { gx = fpx * cc45 + fpy * sc45; gy = -fpx * sc45 + fpy * cc45; }
              var cix = Math.floor(gx / cell), ciy = Math.floor(gy / cell), ccx2 = (cix + 0.5) * cell, ccy2 = (ciy + 0.5) * cell, cpx = ccx2, cpy = ccy2; if (mode === 2) { cpx = ccx2 * cc45 - ccy2 * sc45; cpy = ccx2 * sc45 + ccy2 * cc45; }
              scene(cpx / W, cpy / H, SCc); var lm = lum(SCc[0], SCc[1], SCc[2]), thr = hash(cix + 3.7, ciy + 3.7, P.seed);
              if (order === 1) thr = clamp(Math.hypot((cpx / W - 0.5) * asp, cpy / H - 0.5) * 1.2, 0, 1); else if (order === 2) thr = cpx / W; else if (order === 3) thr = cpy / H; else if (order === 4) thr = 1 - lm;
              var loc = clamp((t - thr * sp) / Math.max(1 - sp, 0.05), 0, 1), rad = cell * 0.5 * 1.18 * Math.sqrt(loc) * (mode === 2 ? 0.3 + 0.7 * Math.sqrt(1 - lm) : 0.45 + 0.55 * lm), dd = Math.hypot(gx - ccx2, gy - ccy2), dm = 1 - smooth(rad - 0.8, rad + 0.8, dd), dc = ink || SCc, k2 = smooth(0.82, 1, t);
              col = [mixf(dc[0], col[0], k2), mixf(dc[1], col[1], k2), mixf(dc[2], col[2], k2), mixf(SCc[3] * dm, col[3], k2)];
            } else {
              var lev = Math.floor(clamp(t, 0, 0.999) * 5), blk = Math.max(1, cell / Math.pow(2, lev)), bcx = (Math.floor(fpx / blk) + 0.5) * blk, bcy = (Math.floor(fpy / blk) + 0.5) * blk;
              scene(bcx / W, bcy / H, SCc); var cix2 = Math.floor(fpx / cell), ciy2 = Math.floor(fpy / cell), thr2 = hash(cix2 + 5.3, ciy2 + 5.3, P.seed);
              if (order === 1) thr2 = clamp(Math.hypot(((cix2 + 0.5) * cell / W - 0.5) * asp, (ciy2 + 0.5) * cell / H - 0.5) * 1.2, 0, 1); else if (order === 2) thr2 = (cix2 + 0.5) * cell / W; else if (order === 3) thr2 = (ciy2 + 0.5) * cell / H;
              var loc2 = clamp((t - thr2 * sp) / Math.max(1 - sp, 0.05), 0, 1), k3 = smooth(0.93, 1, t);
              col = [mixf(SCc[0], col[0], k3), mixf(SCc[1], col[1], k3), mixf(SCc[2], col[2], k3), mixf(SCc[3] * (loc2 > 0.0001 ? 1 : 0), col[3], k3)];
            }
          }
        } else col = [0, 0, 0, 0];
        var r = col[0], g2 = col[1], b = col[2], al = col[3] * cover;
        var ex = Math.pow(2, gr.exposure); r *= ex; g2 *= ex; b *= ex; r = (r - 0.5) * gr.contrast + 0.5; g2 = (g2 - 0.5) * gr.contrast + 0.5; b = (b - 0.5) * gr.contrast + 0.5;
        var l = lum(r, g2, b); r = l + (r - l) * gr.saturation; g2 = l + (g2 - l) * gr.saturation; b = l + (b - l) * gr.saturation; r *= 1 + gr.temp * 0.12; b *= 1 - gr.temp * 0.12;
        r = mixf(r, r * tn[0], gr.tintAmt); g2 = mixf(g2, g2 * tn[1], gr.tintAmt); b = mixf(b, b * tn[2], gr.tintAmt); var lf = lum(r, g2, b) * 0.9 + 0.08; r = mixf(r, lf, gr.fade); g2 = mixf(g2, lf, gr.fade); b = mixf(b, lf, gr.fade);
        if (gr.vignette) { var vl = Math.hypot((uvx - 0.5) * (W / H), uvy - 0.5) * 1.1, vv = 1 - gr.vignette * smooth(0.25, 0.95, vl); r *= vv; g2 *= vv; b *= vv; }
        if (pal.length > 1 && P.pal.amount > 0) {
          var lq = clamp(lum(r, g2, b), 0, 1), mp;
          if (P.pal.mode !== "snap") { var fxp = lq * (pal.length - 1), i0 = Math.min(pal.length - 2, Math.floor(fxp)), fr = fxp - i0; mp = [mixf(pal[i0][0], pal[i0 + 1][0], fr), mixf(pal[i0][1], pal[i0 + 1][1], fr), mixf(pal[i0][2], pal[i0 + 1][2], fr)]; }
          else { var best = 1e9; mp = pal[0]; for (var pi = 0; pi < pal.length; pi++) { var dr = r - pal[pi][0], dg = g2 - pal[pi][1], db2 = b - pal[pi][2], dsq = dr * dr + dg * dg + db2 * db2; if (dsq < best) { best = dsq; mp = pal[pi]; } } }
          r = mixf(r, mp[0], P.pal.amount); g2 = mixf(g2, mp[1], P.pal.amount); b = mixf(b, mp[2], P.pal.amount);
        }
        if (gr.grain) { var gn = (hash(fx2 + Math.floor(gr.t) * 1.37, fy2 + Math.floor(gr.t) * 1.37, P.seed) + hash(fx2 + 7.3 + Math.floor(gr.t) * 2.11, fy2 + 7.3 + Math.floor(gr.t) * 2.11, P.seed) - 1) * gr.grain * 2; r += gn; g2 += gn; b += gn; }
        r = clamp(r, 0, 1); g2 = clamp(g2, 0, 1); b = clamp(b, 0, 1);
        var oa = Math.max(pbase[3], al), orr = mixf(pbase[0], r, al), og = mixf(pbase[1], g2, al), ob = mixf(pbase[2], b, al);
        if (cpu.o) { sampleCPU(cpu.o, uvx, uvy, tmp); orr = mixf(orr, tmp[0], tmp[3]); og = mixf(og, tmp[1], tmp[3]); ob = mixf(ob, tmp[2], tmp[3]); oa = Math.max(oa, tmp[3]); }
        var di2 = (y * W + x) * 4; out[di2] = orr * 255; out[di2 + 1] = og * 255; out[di2 + 2] = ob * 255; out[di2 + 3] = oa * 255;
      }
      ctx2.putImageData(cpu.buf, 0, 0);
    }

    // ---- render: a pure function of fx.p (call it any time; the timeline helpers call it on every write)
    var loaded = false;
    fx.render = function () { if (!loaded) return fx; if (gl) drawGL(); else if (cpu) drawCPU(); return fx; };

    fx.ready = Promise.all([loadImage(o.src), loadImage(o.src2), loadImage(o.depth), loadImage(o.plate), loadImage(o.over), loadImage(P.wipe.maskUrl || o.mask)]).then(function (r) {
      img.a = r[0]; img.b = r[1]; img.d = r[2]; img.p = r[3]; img.o = r[4]; maskState.extImg = r[5];
      need(img.a, "src is required");
      var target = function () { return P.pin.on ? P.pin.aspect : W / H; };
      fits.a = fitFor(img.a.naturalWidth || img.a.width, img.a.naturalHeight || img.a.height, target(), contain);
      if (img.b) fits.b = fitFor(img.b.naturalWidth || img.b.width, img.b.naturalHeight || img.b.height, target(), contain);
      if (initGL()) { uploadAll(); fx.mode = "webgl"; } else { initCPU(); fx.mode = "canvas"; }
      loaded = true; fx.render();
      return fx;
    });
    // pin.aspect changes the fit: refit before drawing when it changes
    var lastAspect = null; var baseRender = fx.render;
    fx.render = function () { if (loaded && lastAspect !== (P.pin.on ? P.pin.aspect : W / H)) { lastAspect = P.pin.on ? P.pin.aspect : W / H; if (img.a) fits.a = fitFor(img.a.naturalWidth || img.a.width, img.a.naturalHeight || img.a.height, lastAspect, contain); if (img.b) fits.b = fitFor(img.b.naturalWidth || img.b.width, img.b.naturalHeight || img.b.height, lastAspect, contain); } return baseRender(); };

    // ---- timeline helpers. Each adds ONE tween of a local progress whose setter writes fx.p and redraws (seek-safe: setters run on every seek).
    var firstUse = {};
    function track(tl, at, dur, group, ease, write) {
      need(tl && typeof tl.fromTo === "function", "pass a GSAP timeline as the first argument");
      var proxy = {}, v = 0;
      Object.defineProperty(proxy, "p", { get: function () { return v; }, set: function (x) { v = x; write(x); fx.render(); }, enumerable: true });
      var first = !firstUse[group]; firstUse[group] = true;
      tl.fromTo(proxy, { p: 0 }, { p: 1, duration: Math.max(1e-4, dur), ease: ease || "none", immediateRender: first }, at);
      return fx;
    }
    function lerpObj(dst, a, b, k, keys) { keys.forEach(function (n) { if (a[n] !== undefined || b[n] !== undefined) dst[n] = mixf(num(a[n], num(b[n], dst[n])), num(b[n], num(a[n], dst[n])), k); }); }
    fx.parallax = function (tl, at, dur, op) { op = op || {}; var f = op.from || {}, t = op.to || {}; if (op.strength != null) P.strength = op.strength; if (op.focus != null) P.focus = op.focus; if (op.dolly != null) P.dolly = op.dolly;
      return track(tl, at, dur, "cam", op.ease, function (k) { lerpObj(P.cam, f, t, k, ["x", "y", "z", "rot"]); }); };
    fx.dissolve = function (tl, at, dur, op) { op = op || {}; var inn = op.dir !== "out"; P.dis.mode = op.mode || "dot"; ["cell", "order", "spread", "ink"].forEach(function (n) { if (op[n] !== undefined) P.dis[n] = op[n]; });
      return track(tl, at, dur, "dis", op.ease, function (k) { P.dis.mode = op.mode || "dot"; P.dis.t = inn ? k : 1 - k; }); };
    fx.morph = function (tl, at, dur, op) { op = op || {}; ["strength", "angle"].forEach(function (n) { if (op[n] !== undefined) P.morph[n] = op[n]; }); var a = num(op.from, 0), b = num(op.to, 1);
      return track(tl, at, dur, "morph", op.ease, function (k) { P.morph.t = mixf(a, b, k); }); };
    fx.wipe = function (tl, at, dur, op) { op = op || {}; ["shape", "feather", "angle", "cx", "cy", "bars", "text", "font", "scale", "keep", "rim", "rimColor", "roughness", "maskUrl", "invert"].forEach(function (n) { if (op[n] !== undefined) P.wipe[n] = op[n]; });
      if (P.wipe.shape === "torn" && op.rim === undefined && !P.wipe.rim) P.wipe.rim = 0.012; if (P.wipe.shape === "torn" && op.feather === undefined) P.wipe.feather = 0.003;
      var a = num(op.from, 0), b = num(op.to, 1);
      return track(tl, at, dur, "wipe", op.ease, function (k) { P.wipe.t = mixf(a, b, k); }); };
    fx.pin = function (tl, at, dur, op) { op = op || {}; P.pin.on = true; if (op.aspect != null) P.pin.aspect = op.aspect; if (op.radius != null) P.pin.radius = op.radius;
      var f = op.from || P.pin.q, t = op.to || f;
      return track(tl, at, dur, "pin", op.ease, function (k) { for (var i = 0; i < 4; i++) P.pin.q[i] = [mixf(f[i][0], t[i][0], k), mixf(f[i][1], t[i][1], k)]; }); };
    fx.grade = function (tl, at, dur, op) { op = op || {}; var f = op.from || {}, t = op.to || {}, keys = ["exposure", "contrast", "saturation", "temp", "tintAmt", "vignette", "grain", "fade"]; if (t.tint) P.grade.tint = t.tint;
      return track(tl, at, dur, "grade", op.ease, function (k) { lerpObj(P.grade, f, t, k, keys); }); };
    fx.palette = function (colors, op) { op = op || {}; P.pal.colors = colors.slice(0, MAXPAL); if (op.mode) P.pal.mode = op.mode; if (op.amount !== undefined) P.pal.amount = op.amount; return fx.render(); };
    // a palette lock that fades in or out on the timeline
    fx.paletteTo = function (tl, at, dur, op) { op = op || {}; var a = num(op.from, 0), b = num(op.to, 1); if (op.colors) P.pal.colors = op.colors.slice(0, MAXPAL); if (op.mode) P.pal.mode = op.mode; return track(tl, at, dur, "pal", op.ease, function (k) { P.pal.amount = mixf(a, b, k); }); };
    // deterministic animated grain: the integer grain.t follows the timeline (fps steps per second)
    fx.grainClock = function (tl, duration, fps) { var f = fps || 12; return track(tl, 0, duration, "grainclock", "none", function (k) { P.grade.t = Math.floor(k * duration * f); }); };
    // hold a still and let it breathe (T8): a slow, tiny camera drift so a held still is never static
    fx.drift = function (tl, at, dur, op) { op = op || {}; var amt = num(op.amount, 0.35), z = num(op.zoom, 0.04), s = num(op.seed, P.seed); var ax = hash(s, 1, 2) * 2 - 1, ay = hash(s, 2, 2) * 2 - 1;
      return fx.parallax(tl, at, dur, { from: { x: -ax * amt, y: -ay * amt * 0.5, z: 0 }, to: { x: ax * amt, y: ay * amt * 0.5, z: z }, ease: op.ease || "sine.inOut" }); };
    return fx;
  }

  root.RasanImageFX = { version: VERSION, create: create, homography: homography, hash: hash };
})(typeof window !== "undefined" ? window : this);
