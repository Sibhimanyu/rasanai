/*
 * Rasan3D: real-time 3D for HyperFrames scenes, built for film quality.
 *
 *   <canvas id="gl-04" class="r3-canvas"></canvas>
 *   <script src="assets/three/rasan3d.js"></script>
 *   <script>
 *     const tl = gsap.timeline({ paused: true });            // the scene's clock (and its 2D tweens)
 *     window.__timelines["frame-04"] = tl;
 *     Rasan3D.stage({ id: "frame-04", canvas: "#gl-04", timeline: tl, duration: 6, camera: {...},
 *       async build(k) { ...make meshes, return them... }, pose(t, k) { ...place them at time t... } });
 *   </script>
 *
 * Every frame is a pure function of the scene's local time: the GSAP timeline is the clock (so 3D stays
 * locked to the 2D tweens and to HyperFrames' seeks), nothing reads the wall clock, randomness is seeded.
 * Each output frame averages sub-frames across a shutter (true motion blur), jittered across the pixel
 * (anti-aliasing) and across a lens aperture (true depth of field). All stages share one WebGL renderer,
 * and each copies its frame into its own 2D canvas, so a film with ten 3D scenes holds one GL context.
 *
 * Paths: load this file project-root relative (assets/three/rasan3d.js); three.js sits next to it.
 * API reference: references/3d.md in the RasanAI skill.
 */
(function () {
  "use strict";
  if (window.Rasan3D) return;

  var VERSION = "1.0.0";
  var THREE_VERSION = "0.181.2";
  var script = document.currentScript;
  var BASE = (function () {
    var src = script && script.src ? script.src : new URL("assets/three/rasan3d.js", document.baseURI).href;
    return src.replace(/[^/]*$/, "");
  })();
  var QUALITY = { final: { maxSamples: 24, dofSamples: 16 }, draft: { maxSamples: 4, dofSamples: 4 }, check: { maxSamples: 2, dofSamples: 2 } };
  function quality() {
    var q = window.__rasan3dQuality || "final";
    return QUALITY[q] ? q : "final";
  }

  // ------------------------------------------------------------------ three.js, loaded once
  var threeP = null;
  function loadThree() {
    if (!threeP) {
      threeP = import(BASE + "three.module.min.js").then(function (T) {
        // HyperFrames' three adapter waits on THREE.DefaultLoadingManager before it calls a frame ready
        if (!window.THREE) window.THREE = T;
        if (window.Rasan3DLib) window.Rasan3DLib.THREE = T;
        return T;
      });
    }
    return threeP;
  }
  var addonCache = {};
  function addon(rel) {
    if (!addonCache[rel]) addonCache[rel] = import(BASE + "addons/" + rel);
    return addonCache[rel];
  }

  // ------------------------------------------------------------------ the GLSL library (glsl.js, next to this file)
  // glsl.js sets window.Rasan3DLib = { glsl, tube, instanceField }. It is read synchronously (so Rasan3D.glsl is
  // there for top-level scene code), with an async script tag as the fallback where sync XHR is unavailable.
  function mergeLib() {
    var lib = window.Rasan3DLib;
    if (!lib || !window.Rasan3D) return !!lib;
    var R = window.Rasan3D;
    if (window.THREE && !lib.THREE) lib.THREE = window.THREE;
    Object.keys(lib).forEach(function (k) { if (R[k] === undefined) R[k] = lib[k]; });
    return true;
  }
  function loadLibSync() {
    if (window.Rasan3DLib) return true;
    try {
      var x = new XMLHttpRequest();
      x.open("GET", BASE + "glsl.js", false);
      x.send();
      if ((x.status === 200 || (x.status === 0 && x.responseText)) && x.responseText) {
        var s = document.createElement("script");
        s.text = x.responseText + "\n//# sourceURL=" + BASE + "glsl.js";
        (document.head || document.documentElement).appendChild(s);
        s.parentNode && s.parentNode.removeChild(s);
      }
    } catch (e) { /* async fallback below */ }
    return !!window.Rasan3DLib;
  }
  var libP = null;
  function loadLib() {
    if (!libP) {
      libP = loadLibSync() ? Promise.resolve(true) : new Promise(function (res) {
        var s = document.createElement("script");
        s.src = BASE + "glsl.js";
        s.onload = function () { res(true); };
        s.onerror = function () { res(false); };
        (document.head || document.documentElement).appendChild(s);
      });
    }
    return libP.then(function () { return mergeLib(); });
  }
  // `#include <r3/noise>` anywhere in a shader string pulls in Rasan3D.glsl.noise (each chunk once, nested chunks too)
  function glslInclude(src, seen) {
    seen = seen || {};
    return String(src).replace(/#include\s*<r3\/(\w+)>/g, function (m, n) {
      if (seen[n]) return "";
      seen[n] = 1;
      var lib = (window.Rasan3D && window.Rasan3D.glsl) || {};
      if (lib[n] == null) throw new Error("#include <r3/" + n + ">: no such chunk in Rasan3D.glsl (have: " + Object.keys(lib).join(", ") + ")");
      return glslInclude(lib[n], seen);
    });
  }

  // ------------------------------------------------------------------ time, eases, keys
  var EASES = {
    none: function (x) { return x; }, linear: function (x) { return x; },
  };
  function ease(name) {
    if (typeof name === "function") return name;
    var n = name || "power2.inOut";
    if (window.gsap && gsap.parseEase) {
      var f = gsap.parseEase(n);
      if (f) return f;
    }
    if (EASES[n]) return EASES[n];
    // fallback without GSAP: the power family
    var m = /^power(\d)\.(in|out|inOut)$/.exec(n) || /^(cubic|quad|quart|quint)\.?(in|out|inOut)?/.exec(n);
    var p = m ? ({ cubic: 3, quad: 2, quart: 4, quint: 5 }[m[1]] || Number(m[1]) + 1) : 3;
    var dir = m && m[2] ? m[2] : "inOut";
    return dir === "in" ? function (x) { return Math.pow(x, p); } : dir === "out" ? function (x) { return 1 - Math.pow(1 - x, p); } : function (x) { return x < 0.5 ? Math.pow(2 * x, p) / 2 : 1 - Math.pow(2 - 2 * x, p) / 2; };
  }
  function lerpV(a, b, u) {
    if (typeof a === "number") return a + (b - a) * u;
    var o = new Array(a.length);
    for (var i = 0; i < a.length; i++) o[i] = a[i] + (b[i] - a[i]) * u;
    return o;
  }
  // keys: [[t, value, ease?], ...] sorted by t; the ease on a key is the ease arriving AT that key (like a
  // GSAP .to). Before the first key it holds the first value; after the last, the last.
  function at(t, keys) {
    if (typeof keys === "function") return keys(t);
    if (!Array.isArray(keys) || !keys.length) return undefined;
    if (!Array.isArray(keys[0]) || typeof keys[0][0] !== "number") return keys; // a constant
    if (t <= keys[0][0]) return keys[0][1];
    for (var i = 1; i < keys.length; i++) {
      var k = keys[i];
      if (t < k[0]) {
        var p = keys[i - 1];
        var span = k[0] - p[0];
        var u = span > 0 ? (t - p[0]) / span : 1;
        return lerpV(p[1], k[1], ease(k[2])(u));
      }
    }
    return keys[keys.length - 1][1];
  }
  // 0..1 progress of [a, b] with an ease (a window: before a = 0, after b = 1)
  function prog(t, a, b, e) {
    if (t <= a) return 0;
    if (t >= b) return 1;
    return ease(e)((t - a) / (b - a));
  }
  function frameIdx(t, fps) { return Math.floor(t * (fps || 30) + 1e-6); }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function halton(i, b) {
    var f = 1, r = 0;
    while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); }
    return r;
  }
  // full-frame lens: focal length (mm) → vertical field of view (degrees) for this frame's aspect;
  // the 36 mm sensor width maps to the frame's long side
  function lens(mm, aspect) {
    var a = aspect || 16 / 9;
    var vert = a >= 1 ? 36 / a : 36;
    return (2 * Math.atan(vert / (2 * mm)) * 180) / Math.PI;
  }
  function orbit(o) {
    // o: {center:[x,y,z], radius, height, from (deg), to (deg), t0, t1, ease}; returns t → [x,y,z]
    var c = o.center || [0, 0, 0];
    return function (t) {
      var u = prog(t, o.t0 || 0, o.t1 == null ? 1 : o.t1, o.ease || "power2.inOut");
      var a = (((o.from || 0) + ((o.to || 0) - (o.from || 0)) * u) * Math.PI) / 180;
      var r = typeof o.radius === "number" ? o.radius : at(t, o.radius);
      var h = typeof o.height === "number" ? o.height : o.height ? at(t, o.height) : 0;
      return [c[0] + Math.sin(a) * r, c[1] + h, c[2] + Math.cos(a) * r];
    };
  }

  // ------------------------------------------------------------------ the shared renderer
  var shared = null; // { T, renderer, canvas, size, rts, post, envs }
  function getShared(T) {
    if (shared) return shared;
    var canvas = document.createElement("canvas");
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = T.LinearSRGBColorSpace;
    renderer.toneMapping = T.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.setPixelRatio(1);
    renderer.autoClear = false;
    // a pass whose shader fails to link must say why (the info log), not render black
    renderer.debug.onShaderError = function (gl, program, vs, fs) {
      var log = (gl.getProgramInfoLog(program) || "") + " " + (gl.getShaderInfoLog(fs) || "") + " " + (gl.getShaderInfoLog(vs) || "");
      throw new Error("shader failed to compile: " + log.replace(/\s+/g, " ").trim().slice(0, 900));
    };
    shared = { T: T, renderer: renderer, canvas: canvas, w: 0, h: 0, rts: null, post: makePost(T), envs: {} };
    return shared;
  }
  function ensureSize(S, w, h) {
    if (S.w === w && S.h === h && S.rts) return S.rts;
    var T = S.T;
    // (the bloom chain is an array of pairs: dispose recursively, so a second stage of another size does not throw "x.dispose is not a function")
    var disposeRt = function (r) { if (Array.isArray(r)) r.forEach(disposeRt); else r.dispose(); };
    if (S.rts) Object.keys(S.rts).forEach(function (k) { disposeRt(S.rts[k]); });
    S.renderer.setSize(w, h, false);
    var opt = { type: T.HalfFloatType, format: T.RGBAFormat, colorSpace: T.LinearSRGBColorSpace, depthBuffer: true };
    var sample = new T.WebGLRenderTarget(w, h, Object.assign({}, opt, { samples: 4 }));
    var sample1 = new T.WebGLRenderTarget(w, h, opt);
    var accum = new T.WebGLRenderTarget(w, h, Object.assign({}, opt, { depthBuffer: false }));
    var chain = [];
    var cw = w, ch = h;
    for (var i = 0; i < 4; i++) {
      cw = Math.max(1, Math.round(cw / 2)); ch = Math.max(1, Math.round(ch / 2));
      chain.push([new T.WebGLRenderTarget(cw, ch, Object.assign({}, opt, { depthBuffer: false })), new T.WebGLRenderTarget(cw, ch, Object.assign({}, opt, { depthBuffer: false }))]);
    }
    S.w = w; S.h = h;
    S.rts = { sample: sample, sample1: sample1, accum: accum, chain: chain };
    return S.rts;
  }

  // fullscreen passes: copy-with-weight, bright extract, blur, the final grade
  function makePost(T) {
    var cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var geo = new T.PlaneGeometry(2, 2);
    var quad = new T.Mesh(geo);
    var scene = new T.Scene();
    scene.add(quad);
    var V = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
    function mat(frag, uniforms, extra) {
      return new T.ShaderMaterial(Object.assign({ vertexShader: V, fragmentShader: frag, uniforms: uniforms, depthTest: false, depthWrite: false, toneMapped: false }, extra || {}));
    }
    var weigh = mat("uniform sampler2D tSrc; uniform float weight; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tSrc, vUv) * weight; }", { tSrc: { value: null }, weight: { value: 1 } }, { blending: T.CustomBlending, blendEquation: T.AddEquation, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneFactor, transparent: true });
    // the sample's colour times its ambient occlusion (GTAO, opt-in: Stage option `ao`), added into the accumulation
    var weighAO = mat("uniform sampler2D tSrc; uniform sampler2D tAO; uniform float weight; uniform float strength; varying vec2 vUv; void main(){ vec4 c = texture2D(tSrc, vUv);" +
      " float ao = texture2D(tAO, vUv).r; gl_FragColor = vec4(c.rgb * mix(1.0, ao, strength), c.a) * weight; }", { tSrc: { value: null }, tAO: { value: null }, weight: { value: 1 }, strength: { value: 1 } }, { blending: T.CustomBlending, blendEquation: T.AddEquation, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneFactor, transparent: true });
    var copy = mat("uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tSrc, vUv); }", { tSrc: { value: null } });
    // depth texture (0..1) -> view-space distance along the camera axis (1e6 where nothing was drawn)
    var lin = mat("uniform sampler2D tDepth; uniform float near; uniform float far; varying vec2 vUv; void main(){ float d = texture2D(tDepth, vUv).r;" +
      " float z = d >= 1.0 ? 1.0e6 : 2.0 * near * far / (far + near - (d * 2.0 - 1.0) * (far - near)); gl_FragColor = vec4(z, 0.0, 0.0, 1.0); }", { tDepth: { value: null }, near: { value: 0.05 }, far: { value: 400 } });
    var bright = mat(
      "uniform sampler2D tSrc; uniform float threshold; uniform float knee; varying vec2 vUv;" +
        "void main(){ vec4 c = texture2D(tSrc, vUv); vec3 rgb = c.a > 0.0 ? c.rgb : vec3(0.0); float l = max(rgb.r, max(rgb.g, rgb.b));" +
        " float w = smoothstep(threshold - knee, threshold + knee, l); gl_FragColor = vec4(rgb * w, 1.0); }",
      { tSrc: { value: null }, threshold: { value: 1 }, knee: { value: 0.25 } }
    );
    var blur = mat(
      "uniform sampler2D tSrc; uniform vec2 dir; varying vec2 vUv;" +
        "void main(){ vec3 s = texture2D(tSrc, vUv).rgb * 0.2270270270;" +
        " s += texture2D(tSrc, vUv + dir * 1.3846153846).rgb * 0.3162162162; s += texture2D(tSrc, vUv - dir * 1.3846153846).rgb * 0.3162162162;" +
        " s += texture2D(tSrc, vUv + dir * 3.2307692308).rgb * 0.0702702703; s += texture2D(tSrc, vUv - dir * 3.2307692308).rgb * 0.0702702703;" +
        " gl_FragColor = vec4(s, 1.0); }",
      { tSrc: { value: null }, dir: { value: new T.Vector2() } }
    );
    var finalFrag =
      "uniform sampler2D tSrc; uniform sampler2D tB0; uniform sampler2D tB1; uniform sampler2D tB2; uniform sampler2D tB3;" +
      "uniform float bloom; uniform float bloomRadius; uniform float halation; uniform float grain; uniform float vignette; uniform float ca;" +
      "uniform float seed; uniform vec2 res; uniform float saturation; uniform vec3 lift; uniform vec3 gain; varying vec2 vUv;\n" +
      "float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }" +
      "vec3 toSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }" +
      "void main(){" +
      " vec2 uv = vUv; vec4 c = texture2D(tSrc, uv);" +
      " if (ca > 0.0) { vec2 d = (uv - 0.5) * ca / res * 2.0; c.r = texture2D(tSrc, uv + d).r; c.b = texture2D(tSrc, uv - d).b; }" +
      " float a = c.a; vec3 col = a > 0.0001 ? c.rgb / a : vec3(0.0);" +
      " vec3 b = vec3(0.0);" +
      " if (bloom > 0.0 || halation > 0.0) { float w0 = 1.0 - bloomRadius * 0.5, w2 = 0.5 + bloomRadius, w3 = bloomRadius * 1.5; b = (texture2D(tB0, uv).rgb * w0 + texture2D(tB1, uv).rgb + texture2D(tB2, uv).rgb * w2 + texture2D(tB3, uv).rgb * w3) / (w0 + 1.0 + w2 + w3); }" +
      " vec3 add = b * bloom + vec3(1.0, 0.32, 0.12) * dot(b, vec3(0.299, 0.587, 0.114)) * halation;" +
      " float addA = clamp(max(add.r, max(add.g, add.b)), 0.0, 1.0);" +
      " col = col * a + add; a = max(a, addA); col = a > 0.0001 ? col / a : col;" +
      " float l = dot(col, vec3(0.2126, 0.7152, 0.0722)); col = mix(vec3(l), col, saturation);" +
      " col = lift + col * (gain - lift);" +
      " if (vignette > 0.0) { vec2 q = uv - 0.5; q.x *= res.x / res.y; col *= 1.0 - vignette * smoothstep(0.35, 1.05, length(q)); }" +
      " vec3 s = toSRGB(col);" +
      " if (grain > 0.0) { float g = h12(floor(uv * res) + seed * 37.0) - 0.5; float g2 = h12(floor(uv * res * 0.5) + seed * 91.0) - 0.5; float lm = dot(s, vec3(0.333)); s += (g * 0.7 + g2 * 0.5) * grain * (0.5 + 1.4 * lm * (1.0 - lm)); }" +
      " if (grain > 0.0) s += (h12(floor(uv * res) + 0.5 * seed) - 0.5) / 255.0;" + // dither: no banding in dark gradients
      " gl_FragColor = vec4(clamp(s, 0.0, 1.0) * a, a); }";
    var fin = mat(finalFrag, {
      tSrc: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null },
      bloom: { value: 0 }, bloomRadius: { value: 0.5 }, halation: { value: 0 }, grain: { value: 0 }, vignette: { value: 0 }, ca: { value: 0 },
      seed: { value: 0 }, res: { value: new T.Vector2(1, 1) }, saturation: { value: 1 }, lift: { value: new T.Vector3(0, 0, 0) }, gain: { value: new T.Vector3(1, 1, 1) },
    });
    return { cam: cam, scene: scene, quad: quad, weigh: weigh, weighAO: weighAO, copy: copy, lin: lin, bright: bright, blur: blur, fin: fin };
  }
  function pass(S, material, target, clear) {
    var r = S.renderer;
    S.post.quad.material = material;
    r.setRenderTarget(target);
    if (clear) { r.setClearColor(0x000000, 0); r.clear(true, false, false); }
    r.render(S.post.scene, S.post.cam);
  }

  // Tone mapping happens inside each lit material (as three.js does on screen), not over the finished frame:
  // unlit UI faces and screenshots (toneMapped: false) keep their exact colours, so a flat 3D frame can match the
  // 2D scene it continues, and emissive accents keep their HDR value, which is what lets only them bloom.
  function toneGlsl(T, tone, exposure) {
    var fn = TONE_FN[tone] == null ? TONE_FN.neutral : TONE_FN[tone];
    var pars = T.ShaderChunk.tonemapping_pars_fragment.replace(/#ifndef saturate[\s\S]*?#endif/, "").replace(/uniform float toneMappingExposure;/, "const float toneMappingExposure = 1.0;");
    return pars + "\nvec3 r3Tone(vec3 c){ c *= " + Number(exposure).toFixed(4) + "; " + (fn ? "return " + fn + "(c);" : "return c;") + " }\n";
  }
  var TONE_FN = { neutral: "NeutralToneMapping", agx: "AgXToneMapping", aces: "ACESFilmicToneMapping", none: "" };
  function toneMapMaterials(T, scene, tone, exposure) {
    var fn = TONE_FN[tone] == null ? TONE_FN.neutral : TONE_FN[tone];
    var key = tone + ":" + exposure;
    var pars = T.ShaderChunk.tonemapping_pars_fragment.replace(/#ifndef saturate[\s\S]*?#endif/, "").replace(/uniform float toneMappingExposure;/, "const float toneMappingExposure = 1.0;");
    scene.traverse(function (o) {
      var ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      ms.forEach(function (m) {
        if (m.toneMapped === false || m.isShaderMaterial || m.isRawShaderMaterial || m.isShadowMaterial) return;
        if (m.userData.r3tone === key) return;
        m.userData.r3tone = key;
        var prev = m.userData.r3prevCompile || m.onBeforeCompile;
        m.userData.r3prevCompile = prev;
        m.onBeforeCompile = function (sh, r) {
          if (prev && prev !== m.onBeforeCompile) prev.call(m, sh, r);
          sh.fragmentShader = sh.fragmentShader
            .replace("#include <common>", "#include <common>\n" + pars + "\nvec3 r3Tone(vec3 c){ c *= " + Number(exposure).toFixed(4) + "; " + (fn ? "return " + fn + "(c);" : "return c;") + " }")
            .replace("#include <tonemapping_fragment>", "gl_FragColor.rgb = r3Tone(gl_FragColor.rgb);");
        };
        m.customProgramCacheKey = function () { return "r3tone:" + key; };
        m.needsUpdate = true;
      });
    });
  }

  // ------------------------------------------------------------------ helpers for building scenes
  function color(T, c) { return c instanceof T.Color ? c : new T.Color(c); }
  // material presets named after the 3D styles in the library; every one takes {color, ...overrides}
  function material(T, kind, o) {
    o = o || {};
    var c = o.color != null ? color(T, o.color) : new T.Color(0xffffff);
    var base = { color: c };
    var M;
    switch (kind) {
      case "glass":
        M = new T.MeshPhysicalMaterial(Object.assign(base, { metalness: 0, roughness: 0.04, transmission: 1, thickness: 0.6, ior: 1.5, envMapIntensity: 1.2, specularIntensity: 1, attenuationColor: c.clone(), attenuationDistance: 2.5 }));
        break;
      case "frosted-glass":
        M = new T.MeshPhysicalMaterial(Object.assign(base, { metalness: 0, roughness: 0.42, transmission: 1, thickness: 0.8, ior: 1.45, envMapIntensity: 1 }));
        break;
      case "chrome":
        M = new T.MeshPhysicalMaterial(Object.assign(base, { metalness: 1, roughness: 0.06, envMapIntensity: 1.4, clearcoat: 0.3 }));
        break;
      case "brushed-metal":
        M = new T.MeshPhysicalMaterial(Object.assign(base, { metalness: 1, roughness: 0.32, anisotropy: 0.8, envMapIntensity: 1.1 }));
        break;
      case "clay":
        M = new T.MeshPhysicalMaterial(Object.assign(base, { metalness: 0, roughness: 0.82, sheen: 0.35, sheenRoughness: 0.8, sheenColor: new T.Color(0xffffff) }));
        break;
      case "ceramic":
        M = new T.MeshPhysicalMaterial(Object.assign(base, { metalness: 0, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.08 }));
        break;
      case "gummy":
        M = new T.MeshPhysicalMaterial(Object.assign(base, { metalness: 0, roughness: 0.18, transmission: 0.75, thickness: 1.4, ior: 1.38, attenuationColor: c.clone(), attenuationDistance: 0.5, clearcoat: 1, clearcoatRoughness: 0.05 }));
        break;
      case "plastic":
        M = new T.MeshPhysicalMaterial(Object.assign(base, { metalness: 0, roughness: 0.34, clearcoat: 0.4, clearcoatRoughness: 0.2 }));
        break;
      case "concrete":
        M = new T.MeshStandardMaterial(Object.assign(base, { metalness: 0, roughness: 0.96, roughnessMap: noiseTexture(T, o.seed || 7, 512, 0.55, 1), bumpMap: noiseTexture(T, (o.seed || 7) + 1, 512, 0.5, 0.9), bumpScale: o.bumpScale || 0.6 }));
        break;
      case "paper":
        M = new T.MeshStandardMaterial(Object.assign(base, { metalness: 0, roughness: 1, bumpMap: noiseTexture(T, o.seed || 3, 512, 0.5, 0.25), bumpScale: o.bumpScale || 0.15, side: T.DoubleSide }));
        break;
      case "emissive":
        // the one thing allowed to bloom: intensity > 1 pushes it past the bloom threshold
        M = new T.MeshStandardMaterial({ color: new T.Color(0x000000), emissive: c, emissiveIntensity: o.intensity == null ? 2.5 : o.intensity, roughness: 1, toneMapped: false });
        break;
      case "unlit":
        M = new T.MeshBasicMaterial(Object.assign(base, { toneMapped: false }));
        break;
      case "matte":
      default:
        M = new T.MeshStandardMaterial(Object.assign(base, { metalness: 0, roughness: 0.9 }));
    }
    for (var k in o) if (k !== "color" && k !== "seed" && k !== "bumpScale" && k !== "intensity" && k in M) M[k] = o[k];
    return M;
  }
  var noiseCache = {};
  function noiseTexture(T, seed, size, mid, amp) {
    var key = [seed, size, mid, amp].join(",");
    if (noiseCache[key]) return noiseCache[key];
    var cv = document.createElement("canvas");
    cv.width = cv.height = size;
    var x = cv.getContext("2d");
    var img = x.createImageData(size, size);
    var rnd = mulberry32(seed);
    // value noise, 4 octaves, tileable by wrapping the lattice
    function lattice(n) { var a = new Float32Array(n * n); for (var i = 0; i < a.length; i++) a[i] = rnd(); return a; }
    var oct = [8, 16, 48, 128].map(function (n) { return { n: n, v: lattice(n) }; });
    for (var py = 0; py < size; py++) for (var px = 0; px < size; px++) {
      var s = 0, wsum = 0, w = 1;
      for (var o = 0; o < oct.length; o++) {
        var n = oct[o].n, v = oct[o].v, fx = (px / size) * n, fy = (py / size) * n, ix = Math.floor(fx), iy = Math.floor(fy), ux = fx - ix, uy = fy - iy;
        ux = ux * ux * (3 - 2 * ux); uy = uy * uy * (3 - 2 * uy);
        var a = v[(iy % n) * n + (ix % n)], b = v[(iy % n) * n + ((ix + 1) % n)], c = v[((iy + 1) % n) * n + (ix % n)], d = v[((iy + 1) % n) * n + ((ix + 1) % n)];
        s += w * (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy); wsum += w; w *= 0.55;
      }
      var val = Math.max(0, Math.min(255, Math.round((mid + (s / wsum - 0.5) * amp) * 255)));
      var i4 = (py * size + px) * 4;
      img.data[i4] = img.data[i4 + 1] = img.data[i4 + 2] = val; img.data[i4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    var t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.colorSpace = T.NoColorSpace;
    noiseCache[key] = t;
    return t;
  }
  function environment(S, preset) {
    var T = S.T;
    if (S.envs[preset]) return Promise.resolve(S.envs[preset]);
    return addon("environments/RoomEnvironment.js").then(function (m) {
      var pm = new T.PMREMGenerator(S.renderer);
      var room = new m.RoomEnvironment();
      if (preset === "soft") room.traverse(function (o) { if (o.material && o.material.color) o.material.color.multiplyScalar(0.85); });
      var tex = pm.fromScene(room, preset === "soft" ? 0.045 : 0.035).texture; // blur radius in radians; three.js warns above ~0.05
      pm.dispose();
      S.envs[preset] = tex;
      return tex;
    });
  }
  // lighting rigs: one motivated key, everything agrees with it
  function rig(T, scene, kind, o) {
    o = o || {};
    var g = new T.Group();
    g.name = "rig:" + kind;
    var key = color(T, o.key || "#fff4e6"), fill = color(T, o.fill || "#dfe8ff"), rimC = color(T, o.rim || "#ffffff");
    var dir = o.dir || [-0.6, 0.9, 0.7];
    var k = (o.intensity == null ? 1 : o.intensity) * 0.75;
    function dl(c, i, p, shadow) {
      var l = new T.DirectionalLight(c, i * k);
      l.position.set(p[0] * 10, p[1] * 10, p[2] * 10);
      if (shadow) {
        l.castShadow = true;
        l.shadow.mapSize.set(2048, 2048);
        var s = o.shadowSize || 6;
        l.shadow.camera.left = -s; l.shadow.camera.right = s; l.shadow.camera.top = s; l.shadow.camera.bottom = -s;
        l.shadow.camera.near = 0.5; l.shadow.camera.far = 40;
        l.shadow.bias = -0.0004; l.shadow.normalBias = 0.02; l.shadow.radius = o.shadowSoftness || 6;
      }
      g.add(l);
      return l;
    }
    switch (kind) {
      case "rim": // dark, sculpted: a strong back rim and a dim key
        dl(key, 0.6, dir, o.shadows !== false); dl(rimC, 3.2, [-dir[0] * 0.8, 0.4, -1]); dl(rimC, 2.2, [dir[0] * 1.1, 0.3, -0.9]);
        g.add(new T.HemisphereLight(fill, 0x000000, 0.08 * k));
        break;
      case "top-soft": // product on a sweep: big soft top light, gentle fill
        dl(key, 2.2, [0.1, 1, 0.25], o.shadows !== false); dl(fill, 0.5, [0.8, 0.3, 0.8]);
        g.add(new T.HemisphereLight(0xffffff, 0x444444, 0.45 * k));
        break;
      case "low-key": // one hard key, deep shadows
        dl(key, 3, dir, o.shadows !== false);
        g.add(new T.HemisphereLight(fill, 0x000000, 0.04 * k));
        break;
      case "window": // a broad side source, a soft wrap
        dl(key, 2.6, [-1, 0.5, 0.35], o.shadows !== false); dl(fill, 0.35, [1, 0.2, 0.6]);
        g.add(new T.HemisphereLight(0xffffff, 0x222222, 0.25 * k));
        break;
      case "three-point":
      default:
        dl(key, 2.4, dir, o.shadows !== false); dl(fill, 0.7, [-dir[0], 0.35, 0.8]); dl(rimC, 1.8, [dir[0] * 0.5, 0.6, -1]);
        g.add(new T.HemisphereLight(0xffffff, 0x303030, 0.2 * k));
    }
    scene.add(g);
    return g;
  }
  function ground(T, scene, o) {
    o = o || {};
    var size = o.size || 60;
    var mesh;
    if (o.color) {
      mesh = new T.Mesh(new T.PlaneGeometry(size, size), material(T, o.material || "matte", { color: o.color, roughness: o.roughness == null ? 0.85 : o.roughness }));
    } else {
      mesh = new T.Mesh(new T.PlaneGeometry(size, size), new T.ShadowMaterial({ opacity: o.shadowOpacity == null ? 0.28 : o.shadowOpacity }));
    }
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = o.y || 0;
    mesh.receiveShadow = true;
    mesh.name = "ground";
    scene.add(mesh);
    return mesh;
  }
  // a texture of type set with the document's own fonts (load them with @font-face first)
  function textTexture(T, o) {
    var scale = o.scale || 2;
    var font = (o.style || "") + " " + (o.weight || 700) + " " + o.size + "px " + (o.font || "sans-serif");
    var lines = String(o.text).split("\n");
    var lh = (o.lineHeight || 1.1) * o.size;
    var probe = document.createElement("canvas").getContext("2d");
    probe.font = font;
    if (o.letterSpacing != null) probe.letterSpacing = o.letterSpacing + "px";
    var w = o.width || Math.ceil(Math.max.apply(null, lines.map(function (l) { return probe.measureText(l).width; })) + o.size * 0.2);
    var h = o.height || Math.ceil(lh * lines.length + o.size * 0.3);
    var cv = document.createElement("canvas");
    cv.width = Math.ceil(w * scale); cv.height = Math.ceil(h * scale);
    var x = cv.getContext("2d");
    x.scale(scale, scale);
    if (o.background) { x.fillStyle = o.background; x.fillRect(0, 0, w, h); }
    x.font = font;
    if (o.letterSpacing != null) x.letterSpacing = o.letterSpacing + "px";
    x.fillStyle = o.color || "#ffffff";
    x.textBaseline = "alphabetic";
    x.textAlign = o.align || "left";
    var ax = o.align === "center" ? w / 2 : o.align === "right" ? w : 0;
    var block = lh * (lines.length - 1) + o.size;
    var top = o.valign === "middle" ? (h - block) / 2 : o.valign === "bottom" ? h - block - o.size * 0.15 : o.size * 0.05;
    lines.forEach(function (l, i) { x.fillText(l, ax, top + o.size * 0.9 + i * lh); });
    var t = new T.CanvasTexture(cv);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 8;
    t.userData = { w: w, h: h };
    return t;
  }
  function imageTexture(T, url) {
    return new Promise(function (res, rej) {
      new T.TextureLoader().load(url, function (t) { t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; t.userData = { w: t.image.width, h: t.image.height }; res(t); }, undefined, function () { rej(new Error("could not load " + url)); });
    });
  }
  function roundedRectShape(T, w, h, r) {
    var s = new T.Shape(), x = -w / 2, y = -h / 2;
    r = Math.min(r, w / 2, h / 2);
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  // a product screen as a physical slab: rounded, with depth, the real screenshot on its face
  function panel(T, o) {
    var w = o.width, h = o.height, d = o.depth == null ? w * 0.02 : o.depth, r = o.radius == null ? w * 0.03 : o.radius;
    var g = new T.Group();
    var body = new T.Mesh(new T.ExtrudeGeometry(roundedRectShape(T, w, h, r), { depth: d, bevelEnabled: true, bevelThickness: d * 0.25, bevelSize: Math.min(r * 0.3, d * 0.4), bevelSegments: 4, curveSegments: 12 }), o.body || material(T, "plastic", { color: o.bodyColor || "#16181d" }));
    body.position.z = -d;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    if (o.texture) {
      var faceGeo = new T.ShapeGeometry(roundedRectShape(T, w * (1 - (o.inset || 0)), h - w * (o.inset || 0), Math.max(0, r - w * (o.inset || 0) * 0.5)), 12);
      // ShapeGeometry UVs are in shape units: map them to 0..1
      var pos = faceGeo.attributes.position, uv = faceGeo.attributes.uv, fw = w * (1 - (o.inset || 0)), fh = h - w * (o.inset || 0);
      for (var i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / fw + 0.5, pos.getY(i) / fh + 0.5);
      var face = new T.Mesh(faceGeo, o.face || new T.MeshBasicMaterial({ map: o.texture, toneMapped: false }));
      face.position.z = d * 0.26;
      face.name = "face";
      g.add(face);
    }
    return g;
  }
  function svgExtrude(T, svgText, o) {
    o = o || {};
    return addon("loaders/SVGLoader.js").then(function (m) {
      var data = new m.SVGLoader().parse(svgText);
      var g = new T.Group();
      var box = new T.Box3();
      data.paths.forEach(function (p) {
        var fill = p.userData && p.userData.style ? p.userData.style.fill : null;
        if (fill === "none") return;
        m.SVGLoader.createShapes(p).forEach(function (shape) {
          var geo = new T.ExtrudeGeometry(shape, { depth: o.depth == null ? 20 : o.depth, bevelEnabled: o.bevel !== false, bevelThickness: o.bevelThickness || 2, bevelSize: o.bevelSize || 1.2, bevelSegments: 5, curveSegments: 24 });
          var mat = o.material ? (typeof o.material === "function" ? o.material(p.color) : o.material) : material(T, "matte", { color: p.color });
          var mesh = new T.Mesh(geo, mat);
          mesh.castShadow = true; mesh.receiveShadow = true;
          g.add(mesh);
        });
      });
      // SVG y runs down: flip, centre, scale to the requested width (world units)
      g.scale.y = -1;
      box.setFromObject(g);
      var size = new T.Vector3(), c = new T.Vector3();
      box.getSize(size); box.getCenter(c);
      var k = o.width ? o.width / size.x : 1;
      var outer = new T.Group();
      g.position.set(-c.x, -c.y, -c.z);
      outer.add(g);
      outer.scale.setScalar(k);
      return outer;
    });
  }
  function extrudeText(T, text, o) {
    o = o || {};
    return Promise.all([addon("loaders/TTFLoader.js"), addon("loaders/FontLoader.js"), addon("geometries/TextGeometry.js")]).then(function (ms) {
      return new Promise(function (res, rej) {
        new ms[0].TTFLoader().load(o.font, function (json) {
          var font = new ms[1].Font(json);
          var geo = new ms[2].TextGeometry(text, { font: font, size: o.size || 1, depth: o.depth == null ? (o.size || 1) * 0.25 : o.depth, curveSegments: 10, bevelEnabled: o.bevel !== false, bevelThickness: (o.size || 1) * 0.03, bevelSize: (o.size || 1) * 0.018, bevelSegments: 4 });
          geo.computeBoundingBox();
          var bb = geo.boundingBox;
          var ax = o.align === "left" ? -bb.min.x : o.align === "right" ? -bb.max.x : -(bb.min.x + bb.max.x) / 2;
          geo.translate(ax, -(bb.min.y + bb.max.y) / 2 * (o.middle === false ? 0 : 1), -(bb.max.z - bb.min.z) / 2);
          var mesh = new T.Mesh(geo, o.material || material(T, "matte", { color: o.color || "#ffffff" }));
          mesh.castShadow = true; mesh.receiveShadow = true;
          res(mesh);
        }, undefined, function () { rej(new Error("could not load font " + o.font + " (TTF or OTF; not WOFF2)")); });
      });
    });
  }
  // seeded points sampled on a mesh's surface (point clouds, assembly from particles)
  function surfacePoints(T, mesh, count, seed) {
    return addon("math/MeshSurfaceSampler.js").then(function (m) {
      var s = new m.MeshSurfaceSampler(mesh).setRandomGenerator(mulberry32(seed || 1)).build();
      var out = new Float32Array(count * 3), v = new T.Vector3();
      for (var i = 0; i < count; i++) { s.sample(v); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
      return out;
    });
  }

  // ------------------------------------------------------------------ the stage
  var registry = (window.__rasan3d = window.__rasan3d || { version: VERSION, stages: {}, errors: [] });
  function resolveEl(c) { return typeof c === "string" ? document.querySelector(c) : c; }

  function Stage(opts) {
    var self = this;
    if (!opts || !opts.id) throw new Error("Rasan3D.stage needs an id (the composition id)");
    if (!opts.timeline) throw new Error("Rasan3D.stage needs the scene's paused GSAP timeline as its clock");
    this.opts = opts;
    this.id = opts.id;
    this.tl = opts.timeline;
    this.duration = opts.duration || (opts.timeline.duration ? opts.timeline.duration() : 0);
    this.fps = opts.fps || 30;
    this.width = opts.width || 1920;
    this.height = opts.height || 1080;
    this.aspect = this.width / this.height;
    this.tracks = [];
    this.lastT = null;
    this.ready = false;
    this.error = null;
    this.stats = { draws: 0, lastMs: 0, lastSamples: 0, maxSamples: 0 };
    this.pendingT = null;
    this.k = null; // the build kit, handed to build() and pose()
    registry.stages[this.id] = this;

    // the clock: one tween that spans the scene and draws on every seek; it targets a plain object
    // (no element), so the motion contract treats it as exempt
    var clock = { t: 0 };
    if (this.duration > 0) {
      this.tl.to(clock, { t: this.duration, duration: this.duration, ease: "none", onUpdate: function () { self.draw(this.time()); } }, 0);
    }
    // HyperFrames' three adapter dispatches hf-seek with the root time; a scene's own clock is its
    // timeline's local time, so the event only triggers a redraw of whatever the timeline says
    window.addEventListener("hf-seek", function () { self.draw(self.tl.time()); });

    // hold the render until the scene is drawable (the runtime waits on this)
    window.__hf = window.__hf || {};
    window.__hf.buildReady = window.__hf.buildReady || {};
    this.readyPromise = this._init().then(
      function () { self.ready = true; self.draw(self.pendingT != null ? self.pendingT : self.tl.time(), true); },
      function (e) { self.error = String((e && e.message) || e); registry.errors.push(self.id + ": " + self.error); console.error("[Rasan3D] " + self.id + ": " + self.error); }
    );
    window.__hf.buildReady["rasan3d:" + this.id] = this.readyPromise;
  }

  Stage.prototype._init = function () {
    var self = this, o = this.opts;
    return Promise.all([loadThree(), loadLib()]).then(function (res) {
      var T = res[0];
      var S = getShared(T);
      self.T = T;
      self.S = S;
      self.canvas = resolveEl(o.canvas);
      if (!self.canvas) throw new Error("canvas " + o.canvas + " not found");
      self.ctx2d = self.canvas.getContext("2d");
      // pixelRatio: small previews (a gallery tile) render below the composition's size; films never set it
      self.dpr = o.pixelRatio || Math.min(2, window.__rasan3dScale || window.devicePixelRatio || 1);
      if (quality() === "check") self.dpr = Math.min(self.dpr, 1);
      self.canvas.width = Math.round(self.width * self.dpr);
      self.canvas.height = Math.round(self.height * self.dpr);
      self.scene = new T.Scene();
      self.camera = new T.PerspectiveCamera(lens(50, self.aspect), self.aspect, o.near || 0.05, o.far || 400);
      self.scene.add(self.camera);
      if (o.background) self.scene.background = color(T, o.background);
      if (o.fog) self.scene.fog = new T.Fog(color(T, o.fog.color || o.background || "#000000"), o.fog.near || 10, o.fog.far || 60);
      self._graphInit();
      var kit = (self.k = {
        THREE: T, T: T, stage: self, scene: self.scene, camera: self.camera, R3: api,
        material: function (kind, mo) { return material(T, kind, mo); },
        rig: function (kind, ro) { return rig(T, self.scene, kind, ro); },
        ground: function (go) { return ground(T, self.scene, go); },
        text: function (to) { return textTexture(T, to); },
        image: function (url) { return imageTexture(T, url); },
        panel: function (po) { return panel(T, po); },
        svg: function (svg, so) { return svgExtrude(T, svg, so); },
        svgUrl: function (url, so) { return fetch(url).then(function (r) { return r.text(); }).then(function (t) { return svgExtrude(T, t, so); }); },
        extrudeText: function (text, eo) { return extrudeText(T, text, eo); },
        surfacePoints: function (mesh, n, seed) { return surfacePoints(T, mesh, n, seed); },
        addon: addon, rng: mulberry32, ease: ease, orbit: orbit, lens: function (mm) { return lens(mm, self.aspect); },
        // at/prog record the keys and eases pose() uses, so the gate checks them against motion.md too
        at: function (t, keys) { self._seen(keys, "pose.at"); return at(t, keys); },
        prog: function (t, a, b, e) { self._seenEase(e, "pose.prog"); return prog(t, a, b, e); },
        layout: function (lo) { return self.layout(lo); },
        pxPlane: function (group, po) { return self.pxPlane(group, po); },
        toScreen: function (v) { return self.toScreen(v); },
        track: function (name, keys) { return self.track(name, keys); },
        // the open kit: render graph, simulation, DOM in 3D, the GLSL library
        pass: function (name, po) { return self.pass(name, po); },
        target: function (name, to) { return self.target(name, to); },
        targetTexture: function (name) { return self.targetTexture(name); },
        view: function (name, vo) { return self.view(name, vo); },
        simulate: function (name, so) { var sim = makeSim(kit, name, so); self.G.sims.push(sim); return sim; },
        gpuSimulate: function (name, so) {
          var sim = makeGpuSim(self, name, so);
          self.G.sims.push(sim);
          self._pending.push(addon("misc/GPUComputationRenderer.js").then(function (m) { sim.build(m); }));
          return sim;
        },
        pinDom: function (el, po) { return self.pinDom(el, po); },
        include: glslInclude,
        hash: function (i, seed) { var h = Math.imul((i | 0) ^ Math.imul((seed || 0) | 0, 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; },
        glsl: api.glsl, tube: api.tube, instanceField: api.instanceField,
        objects: null,
      });
      // ambient occlusion (opt-in): the vendored GTAOPass, wired into the sample loop (draw)
      if (o.ao) self._pending.push(addon("postprocessing/GTAOPass.js").then(function (m) { self._aoMod = m; }));
      var envP = o.environment === false || o.environment === "none" ? Promise.resolve(null) : environment(S, (o.environment && o.environment.preset) || o.environment || "studio");
      return envP.then(function (env) {
        if (env) {
          self.scene.environment = env;
          // the studio room is bright: half strength leaves the key light in charge
          self.scene.environmentIntensity = o.environment && o.environment.intensity != null ? o.environment.intensity : 0.5;
        }
        self._readCamera();
        return Promise.resolve(o.build ? o.build(kit) : null);
      }).then(function (objects) {
        kit.objects = objects || {};
        // the render graph: registered after build (and after the objects exist), in build order
        return o.graph ? o.graph(kit) : null;
      }).then(function () {
        // GPU simulations wait for their compute module; their state is created before the first pose
        return Promise.all(self._pending);
      }).then(function () {
        return document.fonts && document.fonts.ready ? document.fonts.ready : null;
      }).then(function () {
        // textures queued through three's loaders must finish before the first frame
        return new Promise(function (res) {
          var m = T.DefaultLoadingManager;
          if (!m || m.itemsTotal === undefined) return res();
          (function wait(n) { if (m.itemsLoaded >= m.itemsTotal || n > 400) res(); else setTimeout(function () { wait(n + 1); }, 10); })(0);
        });
      }).then(function () {
        self._pose(0);
        toneMapMaterials(T, self.scene, o.toneMapping || "neutral", o.exposure == null ? 1 : o.exposure);
        S.renderer.compile(self.scene, self.camera);
      });
    });
  };

  // declarative camera: {pos, target, lens (mm), roll (deg), focus (distance | "target"), fstop, aperture}
  Stage.prototype._readCamera = function () {
    var c = this.opts.camera || {};
    this.camKeys = c;
    var self = this;
    ["pos", "target", "lens", "roll", "focus", "fstop", "aperture", "shift"].forEach(function (k) { if (c[k] != null) self.track("camera." + k, c[k]); });
  };
  Stage.prototype._applyCamera = function (t) {
    var T = this.T, c = this.camKeys || {}, cam = this.camera;
    var p = at(t, c.pos) || [0, 0, 10];
    var q = at(t, c.target) || [0, 0, 0];
    cam.position.set(p[0], p[1], p[2]);
    cam.up.set(0, 1, 0);
    cam.lookAt(q[0], q[1], q[2]);
    var roll = at(t, c.roll);
    if (roll) cam.rotateZ((roll * Math.PI) / 180);
    var mm = at(t, c.lens);
    cam.fov = lens(mm || 50, this.aspect);
    cam.updateProjectionMatrix();
    // lens shift (a tilt-shift / view-camera rise): [x, y] in fractions of the frame, keyable; verticals stay vertical
    var sh = at(t, c.shift);
    if (sh && (sh[0] || sh[1])) {
      var PE = cam.projectionMatrix.elements;
      PE[8] += 2 * (sh[0] || 0); PE[9] += 2 * (sh[1] || 0); // + raises the frame (content moves down), like a view camera's rise
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    }
    cam.updateMatrixWorld(true);
    // focus keys may mix "target" and numbers: "target" is this sample's distance to the target, resolved before interpolating
    var dT = cam.position.distanceTo(new T.Vector3(q[0], q[1], q[2]));
    var fk = c.focus;
    if (Array.isArray(fk) && Array.isArray(fk[0])) fk = fk.map(function (k) { return k[1] === "target" ? [k[0], dT, k[2]] : k; });
    var f = at(t, fk);
    this._focus = f === "target" || f == null ? dT : Number(f);
    this._fstop = typeof c.fstop === "number" ? c.fstop : at(t, c.fstop);
    this._aperture = typeof c.aperture === "number" ? c.aperture : at(t, c.aperture);
    this._mm = mm || 50;
  };
  Stage.prototype._pose = function (t) {
    this._applyCamera(t);
    if (this.opts.pose) this.opts.pose(t, this.k);
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
  };
  Stage.prototype.track = function (name, keys) {
    var eases = [];
    var same = function (a, b) { return JSON.stringify(a) === JSON.stringify(b); };
    // a key that holds the previous value is a hold, not a move: its ease doesn't matter
    if (Array.isArray(keys) && Array.isArray(keys[0])) keys.forEach(function (k, i) { if (i > 0 && !same(k[1], keys[i - 1][1])) eases.push(k[2] == null ? "(implicit)" : typeof k[2] === "function" ? "(function)" : String(k[2])); });
    var times = Array.isArray(keys) && Array.isArray(keys[0]) ? keys.map(function (k) { return k[0]; }) : null;
    this.tracks.push({ name: name, eases: eases, times: times, fn: typeof keys === "function" });
    return function (t) { return at(t, keys); };
  };
  Stage.prototype._seen = function (keys, name) {
    if (!Array.isArray(keys) || !Array.isArray(keys[0])) return;
    // pose() builds its key arrays inline (a new array every call): dedupe by what they say, not identity
    this._seenSet = this._seenSet || new WeakSet();
    if (this._seenSet.has(keys)) return;
    this._seenSet.add(keys);
    var sig = JSON.stringify(keys.map(function (k) { return [k[0], k[1], typeof k[2] === "function" ? "(f)" : k[2]]; }));
    this._seenSigs = this._seenSigs || {};
    if (this._seenSigs[sig] || this.tracks.length > 120) return;
    this._seenSigs[sig] = 1;
    this.track(name + "#" + this.tracks.length, keys);
  };
  Stage.prototype._seenEase = function (e, name) {
    this._seenEases = this._seenEases || {};
    var k = e == null ? "(implicit)" : typeof e === "function" ? "(function)" : String(e);
    if (this._seenEases[k]) return;
    this._seenEases[k] = 1;
    this.tracks.push({ name: name + "#" + this.tracks.length, eases: [k], times: null, fn: false });
  };
  // a group whose units are composition pixels (x right from the left edge, y down from the top) on the
  // plane `distance` in front of the camera as it stands at time `at`: content laid out here lands on
  // exactly those pixels when the camera is at that pose. This is the 2D ↔ 3D seam.
  Stage.prototype.layout = function (o) {
    o = o || {};
    var T = this.T;
    var tt = o.at || 0;
    this._applyCamera(tt);
    var d = o.distance || this._focus || 10;
    var k = (2 * d * Math.tan(((this.camera.fov / 2) * Math.PI) / 180)) / this.height;
    var g = new T.Group();
    var m = new T.Matrix4().copy(this.camera.matrixWorld);
    m.multiply(new T.Matrix4().makeTranslation(0, 0, -d));
    m.multiply(new T.Matrix4().makeScale(k, -k, k));
    m.multiply(new T.Matrix4().makeTranslation(-this.width / 2, -this.height / 2, 0));
    m.decompose(g.position, g.quaternion, g.scale);
    g.userData.pxPerUnit = 1 / k;
    g.userData.distance = d;
    this.scene.add(g);
    return g;
  };
  // a plane w×h px at (x, y) inside a layout() group, carrying a texture (a screenshot, a text texture)
  Stage.prototype.pxPlane = function (group, o) {
    var T = this.T;
    var geo = new T.PlaneGeometry(o.w, o.h);
    var mat = o.material || new T.MeshBasicMaterial({ map: o.texture || null, color: o.color != null ? color(T, o.color) : 0xffffff, transparent: o.transparent !== false, toneMapped: false, side: T.DoubleSide });
    var mesh = new T.Mesh(geo, mat);
    // the group's y axis points down: flip the plane so its texture reads upright
    mesh.scale.y = -1;
    mesh.position.set(o.x + o.w / 2, o.y + o.h / 2, o.z || 0);
    group.add(mesh);
    return mesh;
  };
  // world point → composition pixels, at the current pose (pin DOM labels and leader lines to 3D)
  Stage.prototype.toScreen = function (v) {
    var T = this.T;
    var p = (v instanceof T.Vector3 ? v.clone() : new T.Vector3(v[0], v[1], v[2])).project(this.camera);
    return { x: ((p.x + 1) / 2) * this.width, y: ((1 - p.y) / 2) * this.height, z: p.z, visible: p.z > -1 && p.z < 1 };
  };

  // ------------------------------------------------------------------ the render graph
  // passes (scene: inside the sample loop; post: on the accumulated frame), named render targets, views of other
  // scenes, function-valued uniforms. Nothing here runs for a stage that registers none: its frames are unchanged.
  function lazyRT(S, key, make) {
    if (!S.rts[key]) S.rts[key] = make();
    return S.rts[key];
  }
  function colorRT(T, w, h, extra) {
    return new T.WebGLRenderTarget(w, h, Object.assign({ type: T.HalfFloatType, format: T.RGBAFormat, colorSpace: T.LinearSRGBColorSpace, depthBuffer: false }, extra || {}));
  }
  var PASS_VERT = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
  function passPrelude(kind, tone) {
    var s = "#define saturate(a) clamp( a, 0.0, 1.0 )\n" + (tone || "") + "uniform float uTime; uniform float uFrame; uniform vec2 uRes; uniform vec3 uCamPos; uniform mat4 uCamMatrixWorld; uniform mat4 uViewInv; uniform mat4 uView; uniform mat4 uProjInv; uniform mat4 uProj; uniform mat4 uViewProj; uniform float uNear; uniform float uFar;\n";
    s += kind === "scene" ? "uniform sampler2D uSceneColor; uniform sampler2D uSceneDepth;\n" : "uniform sampler2D uSrc; uniform sampler2D uDepth;\n";
    s += "varying vec2 vUv;\n" +
      "vec3 r3Fwd(){ return -normalize(uCamMatrixWorld[2].xyz); }\n" +
      "vec3 rayDir(vec2 uv){ vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0); return normalize((uCamMatrixWorld * vec4(v.xyz / v.w, 0.0)).xyz); }\n" +
      "float r3Depth(vec3 p){ vec4 c = uProj * uView * vec4(p, 1.0); return clamp(c.z / c.w * 0.5 + 0.5, 0.0, 1.0); }\n" +
      "float r3Z(vec3 p){ return -(uView * vec4(p, 1.0)).z; }\n";
    s += kind === "scene"
      ? "vec4 r3Scene(vec2 uv){ return texture2D(uSceneColor, uv); }\n" +
        "float r3SceneZ(vec2 uv){ return texture2D(uSceneDepth, uv).r; }\n" +
        "float r3SceneT(vec2 uv, vec3 rd){ return texture2D(uSceneDepth, uv).r / max(dot(rd, r3Fwd()), 1e-4); }\n"
      : "vec4 r3Src(vec2 uv){ return texture2D(uSrc, uv); }\n" +
        "float r3SceneZ(vec2 uv){ return texture2D(uDepth, uv).r; }\n";
    return s;
  }
  // a uniform value: numbers, 2-4 element arrays (vectors), colours ("#rrggbb"), textures and three objects as they are
  function setUniform(T, u, v) {
    if (v == null) return;
    if (Array.isArray(v) && v.length >= 2 && v.length <= 4 && typeof v[0] === "number") {
      var C = [null, null, T.Vector2, T.Vector3, T.Vector4][v.length];
      if (!(u.value instanceof C)) u.value = new C();
      u.value.fromArray(v);
    } else if (typeof v === "string") {
      if (!(u.value instanceof T.Color)) u.value = new T.Color();
      u.value.set(v);
    } else u.value = v;
  }
  var HASH_GLSL = "float r3Hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }\n";

  Stage.prototype._graphInit = function () {
    this.G = { passes: [], scene: [], post: [], targets: {}, views: [], sims: [], pins: [], useDepth: false };
    this._pending = [];
    this._sid = 0;
  };
  // k.target(name, { w, h, scale, type: "half" | "float" | "byte", depth, samples, filter })
  Stage.prototype.target = function (name, o) {
    o = o || {};
    var T = this.T, G = this.G;
    if (G.targets[name]) return G.targets[name].rt;
    var sc = o.scale == null ? 1 : o.scale;
    var w = Math.max(1, Math.round(o.w != null ? o.w : this.width * this.dpr * sc)), h = Math.max(1, Math.round(o.h != null ? o.h : this.height * this.dpr * sc));
    var type = o.type === "float" ? T.FloatType : o.type === "byte" ? T.UnsignedByteType : T.HalfFloatType;
    var f = o.filter === "nearest" ? T.NearestFilter : T.LinearFilter;
    var rt = colorRT(T, w, h, { type: type, depthBuffer: !!o.depth, samples: o.samples || 0, minFilter: f, magFilter: f });
    rt.texture.name = "r3target:" + name;
    G.targets[name] = { name: name, rt: rt, w: w, h: h, cleared: -1 };
    return rt;
  };
  Stage.prototype.targetTexture = function (name) {
    var t = this.G.targets[name];
    if (!t) throw new Error('k.targetTexture("' + name + '"): no such target (create it with k.target first)');
    return t.rt.texture;
  };
  Stage.prototype._tgt = function (name) {
    var t = this.G.targets[name];
    if (!t) throw new Error('no render target "' + name + '" (k.target("' + name + '", { w, h }) first)');
    return t;
  };
  // k.pass(name, { frag, uniforms, at: "scene" | "post", depth, blend: "replace" | "over" | "add" | "min-depth", target })
  Stage.prototype.pass = function (name, o) {
    o = o || {};
    var T = this.T, G = this.G;
    var at = o.at || "scene";
    if (at !== "scene" && at !== "post") throw new Error('k.pass("' + name + '"): at must be "scene" or "post"');
    if (!o.frag) throw new Error('k.pass("' + name + '"): frag (GLSL3 fragment source) required');
    var blend = o.blend || (at === "post" ? "replace" : o.depth ? "min-depth" : "over");
    if (["replace", "over", "add", "min-depth"].indexOf(blend) < 0) throw new Error('k.pass("' + name + '"): blend must be replace | over | add | min-depth');
    var frag = glslInclude(o.frag);
    var depth = blend === "min-depth" || !!o.depth;
    // depth compositing needs the pass to write gl_FragDepth (r3Depth(worldPos) gives the value)
    var writesDepth = /gl_FragDepth/.test(frag);
    var p = {
      name: name, at: at, blend: blend, depth: depth && writesDepth, wantsDepth: depth, writesDepth: writesDepth, frag: frag, user: o.uniforms || {}, target: o.target || null,
      usesColor: /uSceneColor|r3Scene\b/.test(frag), usesDepth: /uSceneDepth|r3SceneT|r3SceneZ/.test(frag), usesPostDepth: /\buDepth\b|r3SceneZ/.test(frag),
      tnames: [], mat: null,
    };
    var re = /uTarget_(\w+)/g, m;
    while ((m = re.exec(frag))) if (p.tnames.indexOf(m[1]) < 0) p.tnames.push(m[1]);
    var uniforms = {
      uTime: { value: 0 }, uFrame: { value: 0 }, uRes: { value: new T.Vector2(1, 1) }, uCamPos: { value: new T.Vector3() }, uCamMatrixWorld: { value: new T.Matrix4() }, uViewInv: { value: new T.Matrix4() },
      uView: { value: new T.Matrix4() }, uViewProj: { value: new T.Matrix4() }, uProjInv: { value: new T.Matrix4() }, uProj: { value: new T.Matrix4() }, uNear: { value: 0.05 }, uFar: { value: 400 },
      uSceneColor: { value: null }, uSceneDepth: { value: null }, uSrc: { value: null }, uDepth: { value: null },
    };
    var decl = "";
    p.tnames.forEach(function (n) { uniforms["uTarget_" + n] = { value: null }; decl += "uniform sampler2D uTarget_" + n + ";\n"; });
    Object.keys(p.user).forEach(function (k) { var v = p.user[k]; if (v && typeof v === "object" && !Array.isArray(v) && "value" in v && !v.isTexture && !v.isVector3 && !v.isColor) uniforms[k] = v; else if (!(k in uniforms)) uniforms[k] = { value: null }; });
    var blendOpts = blend === "replace" ? { blending: T.NoBlending }
      : blend === "add" ? { blending: T.CustomBlending, blendEquation: T.AddEquation, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneFactor }
      : { blending: T.CustomBlending, blendEquation: T.AddEquation, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor, blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneMinusSrcAlphaFactor };
    p.mat = new T.ShaderMaterial(Object.assign({
      name: "r3pass:" + name, vertexShader: PASS_VERT, fragmentShader: passPrelude(at, toneGlsl(T, this.opts.toneMapping || "neutral", this.opts.exposure == null ? 1 : this.opts.exposure)) + decl + "#line 1\n" + frag, uniforms: uniforms,
      depthTest: p.depth, depthWrite: p.depth, transparent: true, toneMapped: false,
    }, blendOpts));
    G.passes.push(p);
    (at === "scene" ? G.scene : G.post).push(p);
    if (at === "scene" || p.usesPostDepth) G.useDepth = true;
    return p;
  };
  Stage.prototype._passBuiltins = function (p, t, cam, W, H) {
    var u = p.mat.uniforms;
    u.uTime.value = t;
    u.uFrame.value = frameIdx(t, this.fps);
    u.uRes.value.set(W, H);
    u.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
    u.uCamMatrixWorld.value.copy(cam.matrixWorld);
    u.uViewInv.value.copy(cam.matrixWorld);
    u.uView.value.copy(cam.matrixWorldInverse);
    u.uProjInv.value.copy(cam.projectionMatrixInverse);
    u.uProj.value.copy(cam.projectionMatrix);
    u.uViewProj.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    u.uNear.value = cam.near; u.uFar.value = cam.far;
    var self = this, T = this.T;
    p.tnames.forEach(function (n) { u["uTarget_" + n].value = self._tgt(n).rt.texture; });
    var user = p.user;
    for (var k in user) {
      var v = user[k];
      if (v && typeof v === "object" && !Array.isArray(v) && "value" in v && !v.isTexture && !v.isVector3 && !v.isColor) {
        if (typeof v.value === "function") setUniform(T, u[k], v.value(t, self.k));
        continue;
      }
      setUniform(T, u[k], typeof v === "function" ? v(t, self.k) : v);
    }
  };
  Stage.prototype._linearDepth = function (srt, dst, cam) {
    var S = this.S, L = S.post.lin;
    L.uniforms.tDepth.value = srt.depthTexture;
    L.uniforms.near.value = cam.near; L.uniforms.far.value = cam.far;
    pass(S, L, dst, false);
  };
  Stage.prototype._depthRTs = function (W, H) {
    var T = this.T, S = this.S;
    var sampleD = lazyRT(S, "sampleD", function () {
      var rt = colorRT(T, W, H, { depthBuffer: true });
      var dt = new T.DepthTexture(W, H, T.FloatType);
      dt.format = T.DepthFormat;
      rt.depthTexture = dt;
      return rt;
    });
    var depthLin = lazyRT(S, "depthLin", function () { return colorRT(T, W, H, { type: T.FloatType, minFilter: T.NearestFilter, magFilter: T.NearestFilter }); });
    var sceneColor = lazyRT(S, "sceneColor", function () { return colorRT(T, W, H); });
    return { sampleD: sampleD, depthLin: depthLin, sceneColor: sceneColor };
  };
  Stage.prototype._runScenePass = function (p, srt, ti, cam, W, H) {
    var S = this.S, r = S.renderer, rts = S.rts;
    if (p.usesColor) { S.post.copy.uniforms.tSrc.value = srt.texture; pass(S, S.post.copy, rts.sceneColor, false); }
    if (p.usesDepth) this._linearDepth(srt, rts.depthLin, cam);
    var u = p.mat.uniforms;
    u.uSceneColor.value = rts.sceneColor.texture;
    u.uSceneDepth.value = rts.depthLin.texture;
    this._passBuiltins(p, ti, cam, W, H);
    if (p.target) {
      var tg = this._tgt(p.target);
      if (tg.cleared !== this._sid) { tg.cleared = this._sid; r.setRenderTarget(tg.rt); r.setClearColor(0x000000, 0); r.clear(true, true, true); }
      pass(S, p.mat, tg.rt, false);
    } else pass(S, p.mat, srt, false);
  };
  // post passes chain on the accumulated frame; returns the texture the final grade should read
  Stage.prototype._runPost = function (accumTex, t, cam, W, H, lastSrt) {
    var S = this.S, rts = S.rts, T = this.T, G = this.G;
    if (G.post.length === 0) return accumTex;
    if (lastSrt && lastSrt.depthTexture && G.post.some(function (p) { return p.usesPostDepth; })) this._linearDepth(lastSrt, rts.depthLin, cam);
    var cur = accumTex, flip = 0;
    for (var i = 0; i < G.post.length; i++) {
      var p = G.post[i], u = p.mat.uniforms;
      u.uSrc.value = cur;
      u.uDepth.value = rts.depthLin ? rts.depthLin.texture : null;
      this._passBuiltins(p, t, cam, W, H);
      var dst;
      if (p.target) dst = this._tgt(p.target).rt;
      else dst = flip ? lazyRT(S, "ppB", function () { return colorRT(T, W, H); }) : lazyRT(S, "ppA", function () { return colorRT(T, W, H); });
      pass(S, p.mat, dst, false);
      if (!p.target) { cur = dst.texture; flip ^= 1; }
    }
    return cur;
  };
  // k.view(name, { scene, camera, target, hide, pose(t, k), environment }): a second world rendered into a target every sample
  Stage.prototype.view = function (name, o) {
    o = o || {};
    if (!o.scene || !o.camera) throw new Error('k.view("' + name + '"): scene and camera required');
    var tn = o.target || name;
    if (!this.G.targets[tn]) this.target(tn, { depth: true, samples: 4 });
    var tg = this._tgt(tn);
    if (!tg.rt.depthBuffer) tg.rt.depthBuffer = true;
    var v = { name: name, scene: o.scene, camera: o.camera, target: tg, hide: o.hide ? [].concat(o.hide) : [], pose: o.pose || null, environment: o.environment !== false, tone: false };
    this.G.views.push(v);
    return v;
  };
  Stage.prototype._runViews = function (ti) {
    var S = this.S, r = S.renderer, G = this.G, o = this.opts, self = this;
    for (var i = 0; i < G.views.length; i++) {
      var v = G.views[i];
      if (v.environment && !v.scene.environment && this.scene.environment) { v.scene.environment = this.scene.environment; v.scene.environmentIntensity = this.scene.environmentIntensity; }
      toneMapMaterials(this.T, v.scene, o.toneMapping || "neutral", o.exposure == null ? 1 : o.exposure);
      if (v.pose) v.pose(ti, this.k);
      v.scene.updateMatrixWorld(true);
      var prev = v.hide.map(function (h) { var p = h.visible; h.visible = false; return p; });
      var bg = v.scene.background;
      r.setRenderTarget(v.target.rt);
      r.setClearColor(bg && bg.isColor ? bg : 0x000000, bg && bg.isColor ? 1 : 0);
      r.clear(true, true, true);
      r.render(v.scene, v.camera);
      v.hide.forEach(function (h, j) { h.visible = prev[j]; });
    }
  };

  // ------------------------------------------------------------------ deterministic simulation
  // k.simulate(name, { init(state, k), step(state, dt, t, k), dt, checkpointEvery }) -> { at(t) }
  // The state at time t is the fixed-step integration from 0: step N runs at t = N*dt. Checkpoints (a clone of the
  // state every checkpointEvery seconds) are written as the integration passes them, so a seek restarts from the
  // nearest one at or before t, never from 0 twice; a cursor continues forward for the common sequential reads.
  // The fraction of a step between N*dt and t is integrated on a throwaway clone, so any t gives a smooth state.
  function cloneState(s) { return typeof structuredClone === "function" ? structuredClone(s) : JSON.parse(JSON.stringify(s)); }
  function makeSim(kit, name, o) {
    if (!o || typeof o.step !== "function") throw new Error('k.simulate("' + name + '"): step(state, dt, t, k) required');
    var dt = o.dt || 1 / 120;
    var K = Math.max(1, Math.round((o.checkpointEvery == null ? 0.5 : o.checkpointEvery) / dt));
    var cps = {}, cursor = null, cn = -1, stats = { steps: 0, restores: 0 };
    function adv(s, n, h) { var r = o.step(s, h == null ? dt : h, n * dt, kit); return r !== undefined ? r : s; }
    function fresh() { var s = {}; var r = o.init ? o.init(s, kit) : undefined; return r !== undefined ? r : s; }
    function stateAt(N) {
      var base = Math.floor(N / K) * K;
      if (!cursor || cn > N || cn < base) {
        if (!(base in cps)) {
          var hi = -1;
          for (var key in cps) { var kn = Number(key); if (kn < base && kn > hi) hi = kn; }
          var s = hi < 0 ? fresh() : cloneState(cps[hi]), n = hi < 0 ? 0 : hi;
          if (hi < 0) cps[0] = cloneState(s);
          while (n < base) { s = adv(s, n); n++; stats.steps++; if (n % K === 0) cps[n] = cloneState(s); }
          if (!(base in cps)) cps[base] = cloneState(s);
        }
        cursor = cloneState(cps[base]); cn = base; stats.restores++;
      }
      while (cn < N) { cursor = adv(cursor, cn); cn++; stats.steps++; if (cn % K === 0 && !(cn in cps)) cps[cn] = cloneState(cursor); }
      return cursor;
    }
    return {
      name: name, dt: dt, stats: stats,
      // the state at time t: treat it as read-only
      at: function (t) {
        t = Math.max(0, t || 0);
        var N = Math.floor(t / dt + 1e-9), rem = t - N * dt;
        var s = stateAt(N);
        if (rem > 1e-9 && o.partial !== false) { var c = cloneState(s); return adv(c, N, rem) || c; }
        return s;
      },
      reset: function () { cps = {}; cursor = null; cn = -1; },
    };
  }
  // k.gpuSimulate(name, { size, fields, init, step, dt, checkpointEvery, uniforms, seed }) -> { at(t) }
  // State lives in float textures, one per field (default one field "state", sampler tState; "pos" -> tPos).
  // init/step are GLSL fragment sources (GPUComputationRenderer conventions: vec2 uv = gl_FragCoord.xy / resolution.xy;
  // gl_FragColor = new state). Available: uDt, uTime (= step*dt), uStep, uSeed, r3Hash(vec2), every field's sampler.
  // For several fields give init and step as objects keyed by field. State is quantised to dt (use a small dt).
  // Seeking back restores the nearest checkpoint (a stored texture copy per field every checkpointEvery seconds).
  function makeGpuSim(stage, name, o) {
    var T = stage.T, S = stage.S, kit = stage.k;
    var size = o.size || 64, sx = Array.isArray(size) ? size[0] : size, sy = Array.isArray(size) ? size[1] : size;
    var fields = o.fields || ["state"];
    var dt = o.dt || 1 / 240, K = Math.max(1, Math.round((o.checkpointEvery == null ? 0.5 : o.checkpointEvery) / dt));
    var cap = function (f) { return f.charAt(0).toUpperCase() + f.slice(1); };
    var src = function (spec, f) { var v = typeof spec === "string" ? spec : spec && spec[f]; if (v == null) throw new Error('k.gpuSimulate("' + name + '"): no ' + 'shader for field "' + f + '"'); return glslInclude(v); };
    var PRE = "uniform float uDt; uniform float uTime; uniform float uStep; uniform float uSeed;\n" + HASH_GLSL;
    var sim = { name: name, size: [sx, sy], fields: fields, dt: dt, ready: false, stats: { steps: 0, restores: 0 } };
    var gpu, vars = {}, cps = {}, cn = -1;
    function evalUser(v, t) {
      var us = o.uniforms || {};
      for (var k in us) { var val = typeof us[k] === "function" ? us[k](t, kit) : us[k]; setUniform(T, v.material.uniforms[k], val); }
    }
    function stepOnce(n) {
      fields.forEach(function (f) {
        var u = vars[f].material.uniforms;
        u.uDt.value = dt; u.uTime.value = n * dt; u.uStep.value = n; u.uSeed.value = o.seed || 1;
        evalUser(vars[f], n * dt);
      });
      gpu.compute();
      sim.stats.steps++;
    }
    function save(n) {
      var c = {};
      fields.forEach(function (f) { c[f] = gpu.createRenderTarget(sx, sy); gpu.renderTexture(gpu.getCurrentRenderTarget(vars[f]).texture, c[f]); });
      cps[n] = c;
    }
    function restore(n) {
      fields.forEach(function (f) { gpu.renderTexture(cps[n][f].texture, gpu.getCurrentRenderTarget(vars[f])); });
      sim.stats.restores++;
    }
    sim.build = function (mod) {
      gpu = new mod.GPUComputationRenderer(sx, sy, S.renderer);
      gpu.setDataType(T.FloatType);
      var all = [];
      fields.forEach(function (f) {
        var v = gpu.addVariable("t" + cap(f), PRE + src(o.step, f), gpu.createTexture());
        ["uDt", "uTime", "uStep", "uSeed"].forEach(function (k) { v.material.uniforms[k] = { value: 0 }; });
        Object.keys(o.uniforms || {}).forEach(function (k) { v.material.uniforms[k] = { value: null }; });
        vars[f] = v; all.push(v);
      });
      fields.forEach(function (f) { gpu.setVariableDependencies(vars[f], all); });
      var err = gpu.init();
      if (err) throw new Error('k.gpuSimulate("' + name + '"): ' + err);
      fields.forEach(function (f) {
        var m = gpu.createShaderMaterial(PRE + src(o.init, f), { uDt: { value: dt }, uTime: { value: 0 }, uStep: { value: 0 }, uSeed: { value: o.seed || 1 } });
        all.forEach(function (v) { m.uniforms[v.name] = { value: null }; });
        gpu.doRenderTarget(m, vars[f].renderTargets[0]);
        gpu.doRenderTarget(m, vars[f].renderTargets[1]);
        m.dispose();
      });
      gpu.currentTextureIndex = 0;
      save(0); cn = 0;
      sim.ready = true;
    };
    sim.at = function (t) {
      if (!sim.ready) throw new Error('k.gpuSimulate("' + name + '").at() before the scene finished building (call it from pose(), not build())');
      t = Math.max(0, t || 0);
      var N = Math.floor(t / dt + 1e-9);
      if (N < cn) { var base = Math.floor(N / K) * K; restore(base); cn = base; }
      while (cn < N) { stepOnce(cn); cn++; if (cn % K === 0 && !(cn in cps)) save(cn); }
      var textures = {};
      fields.forEach(function (f) { textures[f] = gpu.getCurrentRenderTarget(vars[f]).texture; });
      return { texture: textures[fields[0]], textures: textures, size: sim.size, step: N, time: N * dt };
    };
    return sim;
  }

  // ------------------------------------------------------------------ DOM in 3D
  // k.pinDom(el, { at: Object3D | [x,y,z], width, height (world units), face: "camera" | "object", px: [w, h], offset, backface })
  // The element keeps its own CSS size (px); every draw sets transform: matrix3d(...) so that rectangle lands exactly on the
  // width x height rectangle in the 3D view (a true perspective map). Hidden while any corner is behind the camera.
  Stage.prototype.pinDom = function (el, o) {
    el = resolveEl(el);
    if (!el) throw new Error("k.pinDom: element not found");
    o = o || {};
    if (o.at == null || !o.width) throw new Error("k.pinDom needs { at, width } (world units)");
    var st = el.style;
    st.position = "absolute"; st.left = "0px"; st.top = "0px"; st.margin = "0"; st.transformOrigin = "0 0"; st.willChange = "transform"; st.pointerEvents = "none";
    if (o.px) { st.width = o.px[0] + "px"; st.height = o.px[1] + "px"; }
    var pin = { el: el, o: o };
    this.G.pins.push(pin);
    if (this.ready) this._syncPins();
    return pin;
  };
  Stage.prototype._syncPins = function () {
    var G = this.G;
    if (!G || !G.pins.length) return;
    var T = this.T, cam = this.camera, W = this.width, H = this.height;
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    var vp = new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    for (var i = 0; i < G.pins.length; i++) {
      var pin = G.pins[i], o = pin.o, el = pin.el, at = o.at;
      var C = new T.Vector3(), R = new T.Vector3(1, 0, 0), U = new T.Vector3(0, 1, 0), N = new T.Vector3();
      var obj = at && at.isObject3D ? at : null;
      if (obj) { obj.updateWorldMatrix(true, false); C.setFromMatrixPosition(obj.matrixWorld); } else C.set(at[0], at[1], at[2]);
      if (o.face === "object") {
        if (obj) { var m = obj.matrixWorld; R.setFromMatrixColumn(m, 0).normalize(); U.setFromMatrixColumn(m, 1).normalize(); }
        else if (o.rotation) { var q = new T.Quaternion().setFromEuler(new T.Euler(o.rotation[0], o.rotation[1], o.rotation[2])); R.applyQuaternion(q); U.applyQuaternion(q); }
      } else { R.setFromMatrixColumn(cam.matrixWorld, 0).normalize(); U.setFromMatrixColumn(cam.matrixWorld, 1).normalize(); }
      N.crossVectors(R, U);
      if (o.offset) C.addScaledVector(R, o.offset[0] || 0).addScaledVector(U, o.offset[1] || 0).addScaledVector(N, o.offset[2] || 0);
      var pw = (o.px && o.px[0]) || el.offsetWidth || 100, ph = (o.px && o.px[1]) || el.offsetHeight || 100;
      var wv = o.width, hv = o.height || (wv * ph) / pw;
      var corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]], P = [], ok = true;
      for (var c = 0; c < 4; c++) {
        var v = new T.Vector4().copy(C.clone().addScaledVector(R, (corners[c][0] * wv) / 2).addScaledVector(U, (corners[c][1] * hv) / 2)).setW(1);
        v.applyMatrix4(vp);
        if (v.w <= cam.near * 0.5) { ok = false; break; }
        P.push([(v.x / v.w * 0.5 + 0.5) * W, (0.5 - (v.y / v.w) * 0.5) * H]);
      }
      var signed = 0;
      if (ok) { for (var j = 0; j < 4; j++) { var a = P[j], b = P[(j + 1) % 4]; signed += a[0] * b[1] - b[0] * a[1]; } }
      if (!ok || (o.backface === "hide" && signed < 0) || o.visible === false) { el.style.visibility = "hidden"; continue; }
      // the unit square -> the projected quad (Heckbert), then scaled to the element's px box
      var x0 = P[0][0], y0 = P[0][1], x1 = P[1][0], y1 = P[1][1], x2 = P[2][0], y2 = P[2][1], x3 = P[3][0], y3 = P[3][1];
      var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
      var g = 0, h = 0, det = dx1 * dy2 - dx2 * dy1;
      if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) { g = (dx3 * dy2 - dx2 * dy3) / det; h = (dx1 * dy3 - dx3 * dy1) / det; }
      var A = x1 - x0 + g * x1, B = x3 - x0 + h * x3, D = y1 - y0 + g * y1, E = y3 - y0 + h * y3;
      var f = function (n) { return Number(n.toPrecision(12)); };
      el.style.transform = "matrix3d(" + [A / pw, D / pw, 0, g / pw, B / ph, E / ph, 0, h / ph, 0, 0, 1, 0, x0, y0, 0, 1].map(f).join(",") + ")";
      el.style.visibility = "";
    }
  };

  // screen-space travel of the scene across the shutter, from bounding-box corners of what's visible
  Stage.prototype._travel = function (t, half) {
    var T = this.T, self = this;
    var meshes = [], skipped = false;
    this.scene.traverseVisible(function (o) { if (o.isMesh && o.geometry && meshes.length < 64 && o.name !== "ground" ) { if (o.field || (o.userData && o.userData.r3NoTravel)) skipped = true; else meshes.push(o); } });
    var probes = [];
    if (skipped || (this.G && this.G.scene.length)) {
      // a raymarched world has no meshes to measure: probe fixed points around where the camera looks
      var tg = at(t, (this.camKeys || {}).target) || [0, 0, 0], rad = Math.max(1, this._focus || 10) * 0.35;
      for (var pi = 0; pi < 8; pi++) probes.push(new T.Vector3(tg[0] + (pi & 1 ? rad : -rad), tg[1] + (pi & 2 ? rad : -rad), tg[2] + (pi & 4 ? rad : -rad)));
    }
    var corners = function () {
      var out = [];
      probes.forEach(function (v) { out.push(v.clone().project(self.camera)); });
      meshes.forEach(function (m) {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        var b = m.geometry.boundingBox;
        // an InstancedMesh: a few real instance transforms (its base box says nothing about where the instances are)
        var mats = [m.matrixWorld];
        if (m.isInstancedMesh && m.count > 0) {
          mats = [];
          for (var q = 0; q < Math.min(4, m.count); q++) {
            var im = new T.Matrix4();
            m.getMatrixAt(Math.floor((q * m.count) / Math.min(4, m.count)), im);
            mats.push(new T.Matrix4().multiplyMatrices(m.matrixWorld, im));
          }
        }
        mats.forEach(function (mw) {
          for (var i = 0; i < 8; i++) {
            out.push(new T.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(mw).project(self.camera));
          }
        });
      });
      return out;
    };
    this._pose(t - half);
    var a = corners();
    this._pose(t + half);
    var b = corners();
    var d = 0;
    for (var i = 0; i < a.length; i++) {
      if (Math.abs(a[i].z) > 1 || Math.abs(b[i].z) > 1) continue;
      var dx = ((b[i].x - a[i].x) / 2) * this.width, dy = ((b[i].y - a[i].y) / 2) * this.height;
      d = Math.max(d, Math.sqrt(dx * dx + dy * dy));
    }
    return d;
  };

  // ------------------------------------------------------------------ ambient occlusion (GTAO), opt-in
  // Stage option ao: true | { radius, thickness, scale, distanceExponent, samples, strength, every, resolution, denoise }
  //   radius (world units, default 0.25 x the focus distance / 10), thickness (1), scale (1), distanceExponent (1), samples (GTAO taps, 16),
  //   strength 0..1 of the multiply (0.85), resolution (AO size as a fraction of the frame: 1 final, 0.5 draft and check), denoise (Poisson
  //   taps, 16; 0 skips the filter), every (the AO is recomputed on every Nth sub-frame and reused between: default 1 up to 4 samples, then
  //   about a quarter of them; each sub-frame is multiplied by the latest AO, and the sub-pixel / aperture / shutter jitter plus the
  //   accumulation average its noise like everything else). Meshes with userData.noAO = true (glass, glows, decals) do not occlude.
  // The AO is computed from the SAMPLE's own camera (jitter and aperture shear included), so it blurs with the image, never over it.
  Stage.prototype._aoPass = function (W, H) {
    var o = this.opts.ao, M = this._aoMod;
    if (!o || !M) return null;
    var res = typeof o.resolution === "number" ? o.resolution : quality() === "final" ? 1 : 0.5;
    var w = Math.max(16, Math.round(W * res)), h = Math.max(16, Math.round(H * res));
    var opt = typeof o === "object" ? o : {};
    if (!this._ao) {
      var focus = this._focus || 10;
      this._ao = new M.GTAOPass(this.scene, this.camera, w, h, undefined,
        { radius: opt.radius != null ? opt.radius : focus * 0.025, thickness: opt.thickness != null ? opt.thickness : 1, scale: opt.scale != null ? opt.scale : 1, distanceExponent: opt.distanceExponent != null ? opt.distanceExponent : 1, samples: opt.samples || 16 },
        { samples: opt.denoise == null ? 16 : Math.max(4, opt.denoise), radius: 8 });
      this._ao.output = M.GTAOPass.OUTPUT.Off;
      this._aoKey = w + "x" + h;
    } else if (this._aoKey !== w + "x" + h) { this._ao.setSize(w, h); this._aoKey = w + "x" + h; }
    return this._ao;
  };
  Stage.prototype._runAO = function (cam, W, H) {
    var ao = this._aoPass(W, H);
    if (!ao) return null;
    ao.camera = cam;
    // the AO "gbuffer" sees what occludes: hide what must not
    var hid = [];
    this.scene.traverse(function (ob) { if (ob.userData && ob.userData.noAO && ob.visible) { ob.visible = false; hid.push(ob); } });
    ao.render(this.S.renderer, null, null);
    hid.forEach(function (ob) { ob.visible = true; });
    return ao.gtaoMap;
  };

  Stage.prototype.samplesFor = function (t) {
    var q = QUALITY[quality()];
    var mb = this.opts.motionBlur === false ? null : this.opts.motionBlur || { shutter: 0.5 };
    var dof = this.camKeys && (this.camKeys.fstop || this.camKeys.aperture);
    var n = 1;
    if (mb) {
      var half = (mb.shutter == null ? 0.5 : mb.shutter) / this.fps / 2;
      var travel = this._travel(t, half);
      n = typeof mb.samples === "number" ? mb.samples : Math.ceil(travel / 1.5);
    }
    if (dof) n = Math.max(n, q.dofSamples);
    if (this.opts.antialias !== false) n = Math.max(n, quality() === "final" ? 4 : 1);
    if (this.G && this.G.useDepth) n = Math.max(n, 2);
    var cap = this.opts.maxSamples ? Math.min(q.maxSamples, this.opts.maxSamples) : q.maxSamples;
    return Math.max(1, Math.min(cap, n));
  };

  // draw the frame at local time t into this stage's canvas
  Stage.prototype.draw = function (t, force) {
    if (!this.ready) { this.pendingT = t; return; }
    if (!force && this.lastT === t) return;
    if (this.error) return;
    var self = this, T = this.T, S = this.S, r = S.renderer, o = this.opts;
    var clock = window["perf" + "ormance"]; // timing only, for the frame budget report; never drives motion
    var t0 = clock ? clock.now() : 0;
    try {
      var W = Math.round(this.width * this.dpr), H = Math.round(this.height * this.dpr);
      var rts = ensureSize(S, W, H);
      toneMapMaterials(T, this.scene, o.toneMapping || "neutral", o.exposure == null ? 1 : o.exposure);
      var n = this.samplesFor(t);
      var mb = o.motionBlur === false ? null : o.motionBlur || { shutter: 0.5 };
      var shutter = mb ? (mb.shutter == null ? 0.5 : mb.shutter) / this.fps : 0;
      var c = this.camKeys || {};
      
      r.setRenderTarget(rts.accum);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, true);
      var bg = this.scene.background;
      var G = this.G, useD = !!(G && G.useDepth), D = useD ? this._depthRTs(W, H) : null, lastSrt = null;
      var aoOn = !!(o.ao && this._aoMod), aoTex = null;
      var aoEvery = aoOn ? Math.max(1, Math.round(typeof o.ao === "object" && o.ao.every ? o.ao.every : n <= 4 ? 1 : n / 4)) : 1;
      var aoStrength = aoOn && typeof o.ao === "object" && o.ao.strength != null ? o.ao.strength : 0.85;
      for (var i = 0; i < n; i++) {
        var ti = n > 1 && shutter > 0 ? t + shutter * ((i + 0.5) / n - 0.5) : t;
        this._pose(ti);
        var cam = this.camera;
        if (n > 1) {
          // aperture: shift the eye on a disc and shear the frustum so the focus plane stays put
          var ndcX = 0, ndcY = 0;
          var fstop = this._fstop, apertureR = this._aperture;
          if (fstop || apertureR) {
            var R = apertureR != null ? apertureR : ((this._mm / 1000) / (2 * fstop)) * (o.unitsPerMeter || 1);
            var u1 = halton(i + 1, 5), u2 = halton(i + 1, 7);
            var rr = Math.sqrt(u1) * R, th = u2 * Math.PI * 2;
            var dx = Math.cos(th) * rr, dy = Math.sin(th) * rr;
            // iris blades (camera.blades >= 3): a regular polygon of the same area as the disc, turned by bokehRotation (deg);
            // camera.squeeze stretches it sideways (an anamorphic oval). The disc stays the default.
            var nb = this.camKeys && this.camKeys.blades;
            if (nb >= 3) {
              var nbl = Math.round(nb), sec = Math.floor(u2 * nbl), wf = u2 * nbl - sec, rot = ((this.camKeys.bokehRotation || 0) * Math.PI) / 180;
              var rv = R * Math.sqrt(Math.PI / (0.5 * nbl * Math.sin((2 * Math.PI) / nbl))), sq = Math.sqrt(u1);
              var a0 = rot + (sec * 2 * Math.PI) / nbl, a1 = rot + ((sec + 1) * 2 * Math.PI) / nbl;
              dx = sq * rv * ((1 - wf) * Math.cos(a0) + wf * Math.cos(a1)); dy = sq * rv * ((1 - wf) * Math.sin(a0) + wf * Math.sin(a1));
            }
            if (this.camKeys && this.camKeys.squeeze > 0 && this.camKeys.squeeze !== 1) dx *= this.camKeys.squeeze;
            cam.translateX(dx); cam.translateY(dy);
            cam.updateMatrixWorld(true);
            var P0 = cam.projectionMatrix.elements;
            ndcX += (P0[0] * dx) / this._focus;
            ndcY += (P0[5] * dy) / this._focus;
          }
          // sub-pixel jitter: anti-aliasing for free across the samples
          ndcX += ((halton(i + 1, 2) - 0.5) * 2) / W;
          ndcY += ((halton(i + 1, 3) - 0.5) * 2) / H;
          var P = cam.projectionMatrix.elements;
          P[8] -= ndcX; P[9] -= ndcY;
          cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
        }
        var srt = useD ? D.sampleD : n > 1 ? rts.sample1 : rts.sample;
        if (G) { this._sid++; if (G.views.length) this._runViews(ti); }
        r.setRenderTarget(srt);
        var bgc = bg && bg.isColor ? bg : null;
        r.setClearColor(bgc || 0x000000, bgc ? 1 : 0);
        r.clear(true, true, true);
        r.render(this.scene, cam);
        if (G && G.scene.length) for (var pi = 0; pi < G.scene.length; pi++) this._runScenePass(G.scene[pi], srt, ti, cam, W, H);
        lastSrt = srt;
        if (aoOn && (!aoTex || i % aoEvery === 0)) aoTex = this._runAO(cam, W, H);
        var wm = aoTex ? S.post.weighAO : S.post.weigh;
        wm.uniforms.tSrc.value = srt.texture;
        wm.uniforms.weight.value = 1 / n;
        if (aoTex) { wm.uniforms.tAO.value = aoTex; wm.uniforms.strength.value = aoStrength; }
        pass(S, wm, rts.accum, false);
      }
      // restore the exact pose at t (DOM sync and toScreen read it)
      this._pose(t);
      this.camera.updateProjectionMatrix();
      // post
      var finalTex = G && G.post.length ? this._runPost(rts.accum.texture, t, this.camera, W, H, lastSrt) : rts.accum.texture;
      var P2 = o.post || {};
      var bloom = P2.bloom ? (typeof P2.bloom === "number" ? { strength: P2.bloom } : P2.bloom) : null;
      var halation = P2.halation || 0;
      var fin = S.post.fin.uniforms;
      if (bloom || halation) {
        S.post.bright.uniforms.tSrc.value = finalTex;
        S.post.bright.uniforms.threshold.value = bloom && bloom.threshold != null ? bloom.threshold : 1.15;
        S.post.bright.uniforms.knee.value = bloom && bloom.knee != null ? bloom.knee : 0.1;
        var src = finalTex;
        for (var lv = 0; lv < rts.chain.length; lv++) {
          var pair = rts.chain[lv];
          if (lv === 0) pass(S, S.post.bright, pair[0], true);
          else { S.post.weigh.uniforms.tSrc.value = src; S.post.weigh.uniforms.weight.value = 1; pass(S, S.post.weigh, pair[0], true); }
          S.post.blur.uniforms.tSrc.value = pair[0].texture; S.post.blur.uniforms.dir.value.set(1 / pair[0].width, 0); pass(S, S.post.blur, pair[1], true);
          S.post.blur.uniforms.tSrc.value = pair[1].texture; S.post.blur.uniforms.dir.value.set(0, 1 / pair[0].height); pass(S, S.post.blur, pair[0], true);
          src = pair[0].texture;
        }
      }
      fin.tSrc.value = finalTex;
      fin.tB0.value = rts.chain[0][0].texture; fin.tB1.value = rts.chain[1][0].texture; fin.tB2.value = rts.chain[2][0].texture; fin.tB3.value = rts.chain[3][0].texture;
      fin.bloom.value = bloom ? (bloom.strength == null ? 0.6 : bloom.strength) : 0;
      fin.bloomRadius.value = bloom && bloom.radius != null ? bloom.radius : 0.5;
      fin.halation.value = halation;
      fin.grain.value = P2.grain || 0;
      fin.vignette.value = P2.vignette || 0;
      fin.ca.value = P2.ca || 0;
      fin.seed.value = frameIdx(t, this.fps) % 997; // grain re-rolls per frame, constant across a frame's samples
      fin.res.value.set(W, H);
      fin.saturation.value = P2.saturation == null ? 1 : P2.saturation;
      var lift = P2.lift || [0, 0, 0], gain = P2.gain || [1, 1, 1];
      fin.lift.value.set(lift[0], lift[1], lift[2]);
      fin.gain.value.set(gain[0], gain[1], gain[2]);
      pass(S, S.post.fin, null, true);
      // into this scene's own canvas
      var x = this.ctx2d;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, this.canvas.width, this.canvas.height);
      x.drawImage(S.canvas, 0, 0, W, H, 0, 0, this.canvas.width, this.canvas.height);
      if (G && G.pins.length) this._syncPins();
      if (o.onDraw) o.onDraw(t, this.k);
      this.lastT = t;
      this.stats.draws++;
      this.stats.lastSamples = n;
      this.stats.maxSamples = Math.max(this.stats.maxSamples, n);
      this.stats.lastMs = clock ? clock.now() - t0 : 0;
    } catch (e) {
      this.error = String((e && e.message) || e);
      registry.errors.push(this.id + ": " + this.error);
      console.error("[Rasan3D] " + this.id + ": " + this.error);
    }
  };
  Stage.prototype.manifest = function () {
    var o = this.opts;
    return {
      id: this.id, duration: this.duration, fps: this.fps, width: this.width, height: this.height,
      tracks: this.tracks, camera: !!o.camera, motionBlur: o.motionBlur === false ? false : o.motionBlur || { shutter: 0.5 },
      dof: !!(o.camera && (o.camera.fstop || o.camera.aperture)), bokeh: o.camera && o.camera.blades ? { blades: o.camera.blades, rotation: o.camera.bokehRotation || 0, squeeze: o.camera.squeeze || 1 } : "disc", ao: o.ao ? (typeof o.ao === "object" ? o.ao : true) : false, post: o.post || {}, toneMapping: o.toneMapping || "neutral",
      environment: o.environment === false ? "none" : (o.environment && o.environment.preset) || o.environment || "studio",
      background: o.background || "transparent",
      graph: this.G ? { passes: this.G.passes.map(function (p) { return { name: p.name, at: p.at, blend: p.blend, depth: p.depth }; }), targets: Object.keys(this.G.targets), views: this.G.views.map(function (v) { return v.name; }), sims: this.G.sims.map(function (v) { return v.name; }), pins: this.G.pins.length } : null,
      stats: this.stats, error: this.error, declared: o.declare || null,
    };
  };

  var api = {
    version: VERSION, three: THREE_VERSION, base: BASE,
    stage: function (opts) { return new Stage(opts); },
    loadThree: loadThree, addon: addon, include: glslInclude,
    at: at, keys: at, prog: prog, ease: ease, lens: lens, orbit: orbit, rng: mulberry32, frameIdx: frameIdx, halton: halton,
  };
  window.Rasan3D = api;
  loadLib(); // glsl.js next to this file: Rasan3D.glsl, Rasan3D.tube, Rasan3D.instanceField
})();
