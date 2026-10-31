/* RasanFX: a seek-safe WebGL post-process pack for HyperFrames films (style-world finishes).
 *
 * What it is: a stack of fragment-shader passes run over ONE source picture (an <img>, a <canvas>, an
 * OffscreenCanvas / ImageBitmap, or a pre-captured snapshot of a DOM layer), drawn into its own <canvas>.
 * Every frame is a pure function of (time t, params, seed): no delta time, no timers, no Math.random, no
 * Date.now, no hidden accumulation buffers. Noise is hashed from (cell, floor(t * rate), seed) with sine-free
 * hashes, so seeking to 4.2 s first and 1.0 s second gives the same pixels as playing through.
 *
 * Passes (kind ids): glitch (block / tear / RGB split / VHS bar / datamosh-style smear), crt (curvature,
 * scanlines, shadow mask, bloom), halftone (mono or CMYK screens), ledmatrix (round / square lit dots),
 * riso (two inks, misregistration, grain, paper), dither (ordered Bayer), pixelate (snap + palette quantise),
 * aberration (chromatic), grain (film), posterise (posterise or gradient-map).
 *
 *   var fx = RasanFX.create({ source: imgOrCanvas, width: 1920, height: 1080, seed: "film-7",
 *                             passes: ["pixelate", { kind: "crt", curve: 0.1 }, "grain"], mount: el });
 *   fx.render(t);                                   // draw the frame at t seconds (scene-local)
 *   // with GSAP (paused master timeline, seeked by HyperFrames):
 *   fx.fromTo(tl, 0.0, "glitch", { amount: 0 }, { amount: 1, duration: 0.4, ease: "power2.in" });
 *   fx.drive(tl);                                   // re-render on every tl update (seek included)
 *   // presets: RasanFX.preset("vhs") -> a pass list for create({ passes })
 *
 * THE DOM CONSTRAINT (read this before pointing it at a DOM layer): WebGL cannot read live DOM. The browser
 * gives a page no synchronous "draw this element into a texture" call, and HyperFrames renders by seeking a
 * paused timeline and screenshotting, so an async rasteriser inside a seek would race the capture. Therefore
 * the source is always a canvas or an image, in one of three honest ways:
 *   1. IMAGE path: a Codex still, or a PNG captured from the real app, as an <img> (loaded before the
 *      timeline is registered). Best path; fully deterministic.
 *   2. CANVAS path: the scene draws its layer into a 2D <canvas> (text via fillText, shapes, drawImage of the
 *      UI plate) inside its own setTime(t), then calls fx.render(t). The canvas is re-uploaded every render.
 *   3. SNAPSHOT path: RasanFX.snapshot(el) rasterises a DOM subtree ONCE, before the timeline starts (SVG
 *      foreignObject, computed styles inlined), and returns a canvas that is STATIC afterwards. It is
 *      best-effort: web fonts must already be loaded and same-origin or data: URLs; external <img>/@font-face
 *      inside the subtree may render blank. Animated DOM (GSAP-moved nodes) is NOT live through it. For
 *      animated DOM, animate the canvas (path 2) or capture a PNG sequence of the layer and step through
 *      it with setSource() (state-by-time, pure).
 * Video elements are not seek-synchronous in a headless render; feed extracted frames through path 2 instead.
 * If WebGL is unavailable the instance sets fx.ok = false and draws the source straight through a 2D canvas,
 * so a film never goes blank; the film gates should read fx.ok / fx.info().
 *
 * Importing this file has no side effects. Malformed input throws.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root);
  else root.RasanFX = factory(root);
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";
  var VERSION = "1.0.0";
  var MAXPAL = 16;

  function need(c, m) { if (!c) throw new Error("RasanFX: " + m); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hashStr(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function hex3(h) {
    if (Array.isArray(h)) return [h[0], h[1], h[2]];
    var s = String(h).replace("#", "");
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    need(/^[0-9a-fA-F]{6}$/.test(s), "bad colour " + h);
    return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
  }

  var PALETTES = {
    pico8: ["#000000", "#1d2b53", "#7e2553", "#008751", "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8", "#ff004d", "#ffa300", "#ffec27", "#00e436", "#29adff", "#83769c", "#ff77a8", "#ffccaa"],
    sweetie16: ["#1a1c2c", "#5d275d", "#b13e53", "#ef7d57", "#ffcd75", "#a7f070", "#38b764", "#257179", "#29366f", "#3b5dc9", "#41a6f6", "#73eff7", "#f4f4f4", "#94b0c2", "#566c86", "#333c57"],
    gameboy: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"],
    cga: ["#000000", "#55ffff", "#ff55ff", "#ffffff"],
    mono: ["#0b0b0b", "#f3f0e6"],
    amber: ["#120800", "#5a2a00", "#b85c00", "#ffb000"]
  };

  // ---- shader sources ------------------------------------------------------------------------------------------
  var VERT = "attribute vec2 a_pos;varying vec2 v_uv;uniform vec4 u_xf;" +
    "void main(){v_uv=a_pos*.5+.5;v_uv=v_uv*u_xf.xy+u_xf.zw;gl_Position=vec4(a_pos,0.,1.);}";

  var PRE = "precision highp float;varying vec2 v_uv;uniform sampler2D u_tex;uniform sampler2D u_prev;" +
    "uniform vec2 u_res;uniform float u_time;uniform float u_seed;uniform float u_amount;uniform float u_rate;" +
    "float h11(float p){p=fract(p*.1031);p*=p+33.33;p*=p+p;return fract(p);}" +
    "float h12(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}" +
    "vec3 T(vec2 p){return texture2D(u_tex,clamp(p,0.,1.)).rgb;}" +
    "float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}" +
    "float bayer2(vec2 a){a=floor(a);return fract(a.x/2.+a.y*a.y*.75);}" +
    "float bayer4(vec2 a){return bayer2(.5*a)*.25+bayer2(a);}" +
    "float bayer8(vec2 a){return bayer4(.5*a)*.25+bayer2(a);}" +
    "float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);" +
    "return mix(mix(h12(i),h12(i+vec2(1,0)),f.x),mix(h12(i+vec2(0,1)),h12(i+vec2(1,1)),f.x),f.y);}";

  // each pass: params {name: [type, default]} (f float, v2 vec2, c colour, p palette), own = it applies u_amount itself
  var PASSES = {
    glitch: {
      own: true,
      params: { blocks: ["f", 0.7], blockW: ["f", 0.12], blockH: ["f", 0.04], tear: ["f", 0.6], split: ["f", 0.6], bar: ["f", 0.5], flicker: ["f", 0.4], smear: ["f", 0], smearDir: ["v2", [0, -1]], mosh: ["f", 0] },
      src: "vec3 effect(vec2 uv,vec2 px,float a){float PX=u_res.y/1080.;float f=floor(u_time*u_rate)+u_seed*13.;" +
        "vec2 cell=floor(uv/vec2(u_blockW,u_blockH));float hb=h12(cell+f*1.7);" +
        "float on=step(1.-.4*a*u_blocks,hb);" +
        "vec2 off=(vec2(h12(cell+f+3.1),h12(cell+f+7.7))-.5)*vec2(.25,.03)*on*u_blocks*a*2.;" +
        "float row=floor(uv.y*u_res.y/((4.+h11(f)*12.)*PX));float tearOn=step(1.-.14*a*u_tear,h11(row+f*3.3));" +
        "off.x+=(h11(row*1.3+f)-.5)*.2*tearOn*u_tear*a;" +
        "float barY=fract(-u_time*.35+u_seed*.37);float bar=smoothstep(.06,0.,abs(uv.y-barY))*u_bar*a;" +
        "off.x+=bar*.03*sin(uv.y*400.+f);vec2 suv=uv+off;" +
        "float sp=u_split*a*.02*(1.+on*2.)+bar*.01;" +
        "vec3 col=vec3(T(suv+vec2(sp,0.)).r,T(suv).g,T(suv-vec2(sp,0.)).b);" +
        "if(u_smear>0.){vec2 d=normalize(u_smearDir+vec2(.0001));vec3 s=col;float n=1.;" +
        "for(int i=1;i<9;i++){float k=float(i);s+=T(suv-d*k*.014*u_smear*a*(.5+h12(cell+k))).rgb;n+=1.;}" +
        "col=mix(col,s/n,on*clamp(u_smear*a*1.5,0.,1.));}" +
        "if(u_mosh>0.){col=mix(col,texture2D(u_prev,clamp(suv,0.,1.)).rgb,on*u_mosh*clamp(a*2.,0.,1.));}" +
        "col*=1.-u_flicker*a*.18*step(.85,h11(f*2.1+.5))*h11(f+.5);" +
        "col+=bar*.12*h12(vec2(floor(px.x/(2.*PX)),f));return col;}"
    },
    crt: {
      own: true,
      params: { curve: ["f", 0.12], scan: ["f", 0.5], lines: ["f", 270], mask: ["f", 0.3], bloom: ["f", 0.6], bloomPx: ["f", 4], vignette: ["f", 0.5], flicker: ["f", 0.04], chroma: ["f", 0.4] },
      src: "vec3 effect(vec2 uv,vec2 px,float a){float PX=u_res.y/1080.;float f=floor(u_time*u_rate)+u_seed*5.;" +
        "vec2 c=uv*2.-1.;float k=u_curve*a;c*=vec2(1.+c.y*c.y*k*.25,1.+c.x*c.x*k*.25);vec2 u2=c*.5+.5;" +
        "if(u2.x<0.||u2.x>1.||u2.y<0.||u2.y>1.)return vec3(0.);" +
        "float ca=u_chroma*a*.0016;vec3 col=vec3(T(u2+vec2(ca,0.)).r,T(u2).g,T(u2-vec2(ca,0.)).b);" +
        "vec3 b=vec3(0.);vec2 r=vec2(u_bloomPx*PX)/u_res;" +
        "for(int i=-2;i<=2;i++){for(int j=-2;j<=2;j++){vec3 s=T(u2+vec2(float(i),float(j))*r);b+=max(s-.55,0.);}}" +
        "col+=b/25.*u_bloom*a*2.2;" +
        "float s=.5+.5*sin(u2.y*u_lines*6.28318);col*=1.-u_scan*a*(1.-s)*.55;" +
        "float m=mod(floor(px.x/PX),3.);vec3 mk=vec3(m<1.?1.:.7,m>=1.&&m<2.?1.:.7,m>=2.?1.:.7);col*=mix(vec3(1.),mk,u_mask*a);" +
        "float v=1.-dot(c*.7,c*.7)*u_vignette*a;col*=clamp(v,0.,1.);" +
        "col*=1.+u_flicker*a*(h11(f)-.5);return col;}"
    },
    halftone: {
      params: { size: ["f", 9], angle: ["f", 45], mode: ["f", 0], ink: ["c", "#14110f"], paper: ["c", "#f1e9d6"], soft: ["f", 0.7], contrast: ["f", 1.1] },
      src: "vec3 cellInfo(vec2 px,float ang,float cell,out vec2 cuv){float s=sin(ang),c=cos(ang);" +
        "vec2 r=mat2(c,-s,s,c)*px;vec2 g=r/cell;vec2 id=floor(g)+.5;vec2 d=g-id;" +
        "vec2 ctr=mat2(c,s,-s,c)*(id*cell);cuv=ctr/u_res;return vec3(length(d),0.,0.);}" +
        "float dotMask(float dist,float cov,float cell){float rad=sqrt(clamp(cov,0.,1.))*.7071;float aa=u_soft*.9/cell+.02;return 1.-smoothstep(rad-aa,rad+aa,dist);}" +
        "vec3 effect(vec2 uv,vec2 px,float a){float PX=u_res.y/1080.;float cell=u_size*PX;float A=radians(u_angle);vec2 cuv;" +
        "if(u_mode<.5){vec3 inf=cellInfo(px,A,cell,cuv);vec3 sc=T(cuv);float L=clamp((lum(sc)-.5)*u_contrast+.5,0.,1.);" +
        "float m=dotMask(inf.x,1.-L,cell);return mix(u_paper,u_ink,m);}" +
        "vec2 u1,u2,u3,u4;vec3 i1=cellInfo(px,A+.2618,cell,u1);vec3 i2=cellInfo(px,A+1.309,cell,u2);vec3 i3=cellInfo(px,A,cell,u3);vec3 i4=cellInfo(px,A-.7854,cell,u4);" +
        "vec3 c1=clamp((T(u1)-.5)*u_contrast+.5,0.,1.),c2=clamp((T(u2)-.5)*u_contrast+.5,0.,1.),c3=clamp((T(u3)-.5)*u_contrast+.5,0.,1.),c4=clamp((T(u4)-.5)*u_contrast+.5,0.,1.);" +
        "float C=dotMask(i1.x,1.-c1.r,cell),M=dotMask(i2.x,1.-c2.g,cell),Y=dotMask(i3.x,1.-c3.b,cell);" +
        "float K=dotMask(i4.x,(1.-max(c4.r,max(c4.g,c4.b)))*.9,cell);" +
        "vec3 o=u_paper;o*=mix(vec3(1.),vec3(.0,.62,.9),C);o*=mix(vec3(1.),vec3(.93,.0,.55),M);o*=mix(vec3(1.),vec3(1.,.9,.0),Y);o=mix(o,u_ink,K);return o;}"
    },
    ledmatrix: {
      params: { cell: ["f", 12], dot: ["f", 0.42], shape: ["f", 0], color: ["c", "#ffb000"], colorMode: ["f", 0], off: ["c", "#0b0705"], glow: ["f", 0.6], levels: ["f", 0], gain: ["f", 1.15] },
      src: "vec3 effect(vec2 uv,vec2 px,float a){float PX=u_res.y/1080.;float cell=u_cell*PX;vec2 id=floor(px/cell)+.5;vec2 d=px/cell-id;" +
        "vec3 sc=T(id*cell/u_res);float L=clamp(lum(sc)*u_gain,0.,1.);if(u_levels>1.)L=floor(L*u_levels+.5)/u_levels;" +
        "vec3 tint=u_colorMode>.5?normalize(sc+.001)*1.1:u_color;" +
        "float dist=u_shape<.5?length(d):max(abs(d.x),abs(d.y))*1.05;float aa=.06+.5/cell;" +
        "float m=1.-smoothstep(u_dot*(.4+.6*L)-aa,u_dot*(.4+.6*L)+aa,dist);" +
        "vec3 col=u_off+tint*L*m;col+=tint*L*exp(-dist*dist*5.)*u_glow*.4;return col;}"
    },
    riso: {
      params: { inkA: ["c", "#ff48b0"], inkB: ["c", "#0078bf"], paper: ["c", "#f4ecd8"], misreg: ["f", 5], jitter: ["f", 1.5], grain: ["f", 0.5], grainPx: ["f", 1.6], opacity: ["f", 0.92], contrast: ["f", 1.1] },
      src: "float plate(vec2 px,vec2 off,float lo,float hi,float seed){vec2 p=(px-off*u_res.y/1080.)/u_res;float d=1.-clamp((lum(T(p))-.5)*u_contrast+.5,0.,1.);" +
        "float cov=smoothstep(lo,hi,d);float PX=u_res.y/1080.;float n=vnoise(px/(u_grainPx*PX)+seed)*.6+h12(floor(px/(u_grainPx*PX))+seed)*.4;" +
        "return smoothstep(n-.18*u_grain-.04,n+.18*u_grain+.04,cov);}" +
        "vec3 effect(vec2 uv,vec2 px,float a){float f=floor(u_time*u_rate)+u_seed*7.;" +
        "vec2 jA=(vec2(h11(f),h11(f+9.))-.5)*u_jitter,jB=(vec2(h11(f+3.),h11(f+5.))-.5)*u_jitter;" +
        "vec2 oA=jA-vec2(u_misreg*.5,-u_misreg*.3),oB=jB+vec2(u_misreg*.5,-u_misreg*.4);" +
        "float cA=plate(px,oA,.12,.8,1.3)*u_opacity,cB=plate(px,oB,.5,.95,8.1)*u_opacity;" +
        "vec3 o=u_paper*(1.-.05*vnoise(px*.7));o*=mix(vec3(1.),u_inkA,cA);o*=mix(vec3(1.),u_inkB,cB);return o;}"
    },
    dither: {
      params: { levels: ["f", 3], size: ["f", 2], mono: ["f", 0], dark: ["c", "#0f0f12"], light: ["c", "#efeadb"], bayer: ["f", 8], snap: ["f", 1] },
      src: "vec3 effect(vec2 uv,vec2 px,float a){float PX=u_res.y/1080.;float sz=max(1.,floor(u_size*PX+.5));vec2 g=floor(px/sz);" +
        "vec3 sc=T(u_snap>.5?(g+.5)*sz/u_res:uv);float th=u_bayer<6.?bayer4(g):bayer8(g);float L=max(u_levels,2.)-1.;" +
        "if(u_mono>.5){float l=floor(lum(sc)*L+th)/L;return mix(u_dark,u_light,clamp(l,0.,1.));}" +
        "return clamp(floor(sc*L+th)/L,0.,1.);}"
    },
    pixelate: {
      params: { size: ["f", 6], palette: ["p", null], dither: ["f", 0.35], snap: ["f", 1], paletteMix: ["f", 1] },
      src: "vec3 effect(vec2 uv,vec2 px,float a){float PX=u_res.y/1080.;float sz=max(1.,floor(u_size*PX+.5));vec2 g=floor(px/sz);" +
        "vec3 c=T((g+.5)*sz/u_res);float th=bayer4(g)-.5;vec3 q=c+th*u_dither*.28;" +
        "vec3 best=c;float bd=1e9;for(int i=0;i<16;i++){if(float(i)>=u_paletteN)break;vec3 p=u_palette[i];vec3 d=q-p;float dd=dot(d,d);if(dd<bd){bd=dd;best=p;}}" +
        "return mix(c,best,u_paletteMix);}"
    },
    aberration: {
      own: true,
      params: { shift: ["f", 0.008], mode: ["f", 0], angle: ["f", 0], falloff: ["f", 1.4] },
      src: "vec3 effect(vec2 uv,vec2 px,float a){vec2 c=uv-.5;vec2 dir=u_mode<.5?normalize(c+.00001)*pow(length(c)*1.6,u_falloff):vec2(cos(radians(u_angle)),sin(radians(u_angle)));" +
        "vec2 o=dir*u_shift*a;vec3 col=vec3(T(uv+o).r,T(uv).g,T(uv-o).b);col.g=mix(col.g,.5*(T(uv+o*.5).g+T(uv-o*.5).g),.5);return col;}"
    },
    grain: {
      own: true,
      params: { size: ["f", 1.6], strength: ["f", 0.22], luma: ["f", 0.6], mono: ["f", 1] },
      src: "vec3 effect(vec2 uv,vec2 px,float a){float PX=u_res.y/1080.;float f=floor(u_time*u_rate)+u_seed*3.;vec2 g=floor(px/(u_size*PX));" +
        "vec3 col=T(uv);vec3 n=vec3(h12(g+f*vec2(37.,17.)),h12(g+f*vec2(41.,13.)+5.),h12(g+f*vec2(23.,29.)+9.));" +
        "n=(n+vec3(h12(g*1.7+f*3.1),h12(g*1.3+f*2.3),h12(g*.9+f*1.9)))*.5-.5;if(u_mono>.5)n=vec3(n.g);" +
        "float L=lum(col);float w=mix(1.,1.-abs(L*2.-1.)*.8,u_luma);return col+n*u_strength*a*w*1.6;}"
    },
    posterise: {
      params: { steps: ["f", 4], mode: ["f", 0], palette: ["p", null], contrast: ["f", 1.0] },
      src: "vec3 effect(vec2 uv,vec2 px,float a){vec3 c=T(uv);float s=max(u_steps,2.);" +
        "if(u_mode<.5)return floor(clamp((c-.5)*u_contrast+.5,0.,1.)*s+.5)/s;" +
        "float L=clamp((lum(c)-.5)*u_contrast+.5,0.,1.);if(u_steps>=2.)L=floor(L*s+.5)/s;float n=max(u_paletteN-1.,1.);float t=L*n;float idx=floor(min(t,n-.0001));float fr=t-idx;" +
        "vec3 A=u_palette[0],B=u_palette[1];for(int i=0;i<16;i++){if(float(i)==idx)A=u_palette[i];if(float(i)==idx+1.)B=u_palette[i];}" +
        "return mix(A,B,smoothstep(0.,1.,fr));}"
    }
  };

  var PRESETS = {
    vhs: [{ kind: "aberration", shift: 0.006 }, { kind: "glitch", amount: 0.5, rate: 12 }, { kind: "crt", curve: 0, scan: 0.35, mask: 0, bloom: 0.3 }, { kind: "grain", strength: 0.18 }],
    arcade: [{ kind: "pixelate", size: 4, palette: "pico8" }, { kind: "crt", curve: 0.14, scan: 0.55, mask: 0.35 }, { kind: "grain", strength: 0.08 }],
    gameboy: [{ kind: "pixelate", size: 5, palette: "gameboy", dither: 0.5 }],
    "riso-print": [{ kind: "riso" }, { kind: "grain", strength: 0.1, size: 2.2 }],
    newsprint: [{ kind: "halftone", mode: 0, size: 8 }, { kind: "grain", strength: 0.08 }],
    cmyk: [{ kind: "halftone", mode: 1, size: 9 }],
    "led-board": [{ kind: "ledmatrix", cell: 12 }],
    "dither-1bit": [{ kind: "dither", levels: 2, mono: 1, size: 2 }],
    datamosh: [{ kind: "glitch", amount: 0.8, smear: 0.8, mosh: 0.7, rate: 12 }, { kind: "aberration", shift: 0.004 }],
    "gradient-map": [{ kind: "posterise", mode: 1, steps: 0, palette: ["#0b1020", "#5b2a86", "#e8473f", "#ffd37a"] }],
    "crt-terminal": [{ kind: "posterise", mode: 1, steps: 0, palette: ["#020a04", "#0b5a1c", "#6cff8c"] }, { kind: "crt" }, { kind: "grain", strength: 0.1 }]
  };

  // ---- program building -----------------------------------------------------------------------------------------
  function uniformDecl(def) {
    var s = "";
    Object.keys(def.params).forEach(function (k) {
      var t = def.params[k][0];
      if (t === "f") s += "uniform float u_" + k + ";";
      else if (t === "v2") s += "uniform vec2 u_" + k + ";";
      else if (t === "c") s += "uniform vec3 u_" + k + ";";
      else if (t === "p") s += "uniform vec3 u_" + k + "[" + MAXPAL + "];uniform float u_" + k + "N;";
    });
    return s;
  }
  function fragFor(def) {
    var body = def.own
      ? "void main(){vec3 o=effect(v_uv,v_uv*u_res,u_amount);gl_FragColor=vec4(o,1.);}"
      : "void main(){vec3 s=T(v_uv);vec3 o=effect(v_uv,v_uv*u_res,u_amount);gl_FragColor=vec4(mix(s,o,clamp(u_amount,0.,1.)),1.);}";
    return PRE + uniformDecl(def) + def.src + body;
  }
  var COPY_FRAG = "precision highp float;varying vec2 v_uv;uniform sampler2D u_tex;void main(){gl_FragColor=vec4(texture2D(u_tex,v_uv).rgb,1.);}";

  function compile(gl, type, src) {
    var sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { var m = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error("RasanFX shader: " + m); }
    return sh;
  }
  function program(gl, frag) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(p, 0, "a_pos"); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("RasanFX link: " + gl.getProgramInfoLog(p));
    return { p: p, loc: {} };
  }
  function uloc(gl, prog, name) { if (!(name in prog.loc)) prog.loc[name] = gl.getUniformLocation(prog.p, name); return prog.loc[name]; }

  // ---- the instance ---------------------------------------------------------------------------------------------
  function normPass(spec, i, seedBase) {
    if (typeof spec === "string") spec = { kind: spec };
    need(spec && PASSES[spec.kind], "unknown pass kind " + (spec && spec.kind) + " (have " + Object.keys(PASSES).join(", ") + ")");
    var def = PASSES[spec.kind], p = { amount: spec.amount != null ? spec.amount : 1, rate: spec.rate != null ? spec.rate : 24 };
    Object.keys(def.params).forEach(function (k) {
      var v = spec[k] != null ? spec[k] : def.params[k][1];
      if (def.params[k][0] === "p") {
        if (typeof v === "string") { need(PALETTES[v], "unknown palette " + v); v = PALETTES[v]; }
        if (v == null) v = PALETTES.pico8;
        need(Array.isArray(v) && v.length >= 2 && v.length <= MAXPAL, "palette needs 2.." + MAXPAL + " colours");
      }
      p[k] = v;
    });
    return { id: spec.id || spec.kind, kind: spec.kind, def: def, p: p, prog: null };
  }

  function create(o) {
    o = o || {};
    need(o.source, "create({ source }) needs an <img>, <canvas>, ImageBitmap or snapshot canvas");
    var W = Math.round(o.width || o.source.naturalWidth || o.source.width || 1920), H = Math.round(o.height || o.source.naturalHeight || o.source.height || 1080);
    need(W > 0 && H > 0, "width and height must be positive");
    var fx = { version: VERSION, ok: true, width: W, height: H, seed: o.seed != null ? o.seed : "rasan", fit: o.fit || "cover" };
    var seedN = (hashStr(fx.seed) % 997) / 997 * 3 + 0.5;
    var canvas = o.canvas || (typeof document !== "undefined" ? document.createElement("canvas") : null);
    need(canvas, "no canvas available");
    canvas.width = W; canvas.height = H;
    if (canvas.style) { canvas.style.width = "100%"; canvas.style.height = "100%"; canvas.style.display = "block"; }
    fx.canvas = canvas;
    if (o.mount && !canvas.parentNode) o.mount.appendChild(canvas);
    var passes = (o.passes || []).map(function (s, i) { return normPass(s, i); });
    var source = o.source, prev = o.prev || null, lastT = 0, sourceDirty = true, prevDirty = true;
    var staticSource = !!(source && (source.tagName === "IMG" || (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap)));
    var gl = null;
    try { gl = canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true }) || canvas.getContext("experimental-webgl", { alpha: false, preserveDrawingBuffer: true }); } catch (e) { gl = null; }

    if (!gl) {
      fx.ok = false;
      var c2 = canvas.getContext("2d");
      fx.render = function (t) { lastT = t == null ? lastT : t; if (c2 && source) c2.drawImage(source, 0, 0, W, H); return fx; };
      fx.setSource = function (s) { source = s; return fx; }; fx.setPrev = function () { return fx; };
      addApi(fx, passes, function () { return lastT; }, function () { fx.render(lastT); });
      register(fx); return fx;
    }

    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var copy = program(gl, COPY_FRAG);
    function mkTex() { var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
    function mkFbo() { var t = mkTex(); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); var f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { f: f, t: t }; }
    var srcTex = mkTex(), prevTex = mkTex(), A = mkFbo(), B = mkFbo();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    function upload(tex, src) { gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); }
    function srcSize() { return [source.naturalWidth || source.videoWidth || source.width || W, source.naturalHeight || source.videoHeight || source.height || H]; }
    function fitXf() { // uv = a_uv * scale + offset: cover crops, contain letterboxes via clamp, stretch is identity
      var s = srcSize(), ra = (W / H) / (s[0] / s[1]);
      if (fx.fit === "stretch") return [1, 1, 0, 0];
      if (fx.fit === "contain") return ra > 1 ? [ra, 1, (1 - ra) / 2, 0] : [1, 1 / ra, 0, (1 - 1 / ra) / 2];
      return ra > 1 ? [1, 1 / ra, 0, (1 - 1 / ra) / 2] : [ra, 1, (1 - ra) / 2, 0];
    }
    function draw(prog, target, texIn, vars) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null); gl.viewport(0, 0, W, H);
      gl.useProgram(prog.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texIn); gl.uniform1i(uloc(gl, prog, "u_tex"), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, prevTex); gl.uniform1i(uloc(gl, prog, "u_prev"), 1);
      var xf = vars && vars.xf ? vars.xf : [1, 1, 0, 0]; gl.uniform4f(uloc(gl, prog, "u_xf"), xf[0], xf[1], xf[2], xf[3]);
      if (vars && vars.set) vars.set(prog);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function setPassUniforms(ps, prog, t) {
      gl.uniform2f(uloc(gl, prog, "u_res"), W, H); gl.uniform1f(uloc(gl, prog, "u_time"), t); gl.uniform1f(uloc(gl, prog, "u_seed"), seedN);
      gl.uniform1f(uloc(gl, prog, "u_amount"), ps.p.amount); gl.uniform1f(uloc(gl, prog, "u_rate"), ps.p.rate);
      Object.keys(ps.def.params).forEach(function (k) {
        var ty = ps.def.params[k][0], v = ps.p[k], L = uloc(gl, prog, "u_" + k);
        if (ty === "f") gl.uniform1f(L, +v);
        else if (ty === "v2") gl.uniform2f(L, v[0], v[1]);
        else if (ty === "c") { var c = hex3(v); gl.uniform3f(L, c[0], c[1], c[2]); }
        else if (ty === "p") {
          var flat = new Float32Array(MAXPAL * 3), n = Math.min(v.length, MAXPAL);
          for (var i = 0; i < n; i++) { var c3 = hex3(v[i]); flat[i * 3] = c3[0]; flat[i * 3 + 1] = c3[1]; flat[i * 3 + 2] = c3[2]; }
          gl.uniform3fv(uloc(gl, prog, "u_" + k), flat); gl.uniform1f(uloc(gl, prog, "u_" + k + "N"), n);
        }
      });
    }

    fx.render = function (t) {
      if (t != null) { need(typeof t === "number" && isFinite(t), "render(t) needs a finite number of seconds"); lastT = t; }
      if (!source) return fx;
      if (sourceDirty || !staticSource) { upload(srcTex, source); sourceDirty = false; }
      if (prev && prevDirty) { upload(prevTex, prev); prevDirty = false; }
      draw(copy, A, srcTex, { xf: fitXf() }); // fit the source into the working size
      var cur = A, other = B, active = passes.filter(function (p) { return p.p.amount > 0.0005; });
      active.forEach(function (ps, i) {
        if (!ps.prog) ps.prog = program(gl, fragFor(ps.def));
        var last = i === active.length - 1;
        draw(ps.prog, last ? null : other, cur.t, { set: function (prog) { setPassUniforms(ps, prog, lastT); } });
        if (!last) { var tmp = cur; cur = other; other = tmp; }
      });
      if (!active.length) draw(copy, null, cur.t, {});
      return fx;
    };
    fx.setSource = function (s) { need(s, "setSource needs a source"); source = s; staticSource = !!(s.tagName === "IMG"); sourceDirty = true; return fx; };
    fx.setPrev = function (s) { prev = s || null; prevDirty = true; return fx; }; // the OUTGOING picture, for the glitch pass's `mosh` (datamosh-style swap)
    fx.markDirty = function () { sourceDirty = true; return fx; };
    addApi(fx, passes, function () { return lastT; }, function () { fx.render(lastT); });
    register(fx);
    return fx;
  }

  function addApi(fx, passes, getT, redraw) {
    function find(id) { for (var i = 0; i < passes.length; i++) if (passes[i].id === id || passes[i].kind === id) return passes[i]; need(false, "no pass " + id + " (have " + passes.map(function (p) { return p.id; }).join(", ") + ")"); }
    fx.passes = passes;
    fx.p = function (id) { return find(id).p; }; // the live params object of a pass: tween it with gsap
    fx.set = function (id, vars) { var p = find(id).p; for (var k in vars) p[k] = vars[k]; return fx; };
    fx.info = function () { return { ok: fx.ok, version: VERSION, width: fx.width, height: fx.height, passes: passes.map(function (p) { return p.id; }) }; };
    // GSAP helpers: tl.to / tl.fromTo on the pass's params; the picture itself is redrawn by drive(tl)
    fx.to = function (tl, pos, id, vars) { tl.to(find(id).p, vars, pos); return fx; };
    fx.fromTo = function (tl, pos, id, from, to) { tl.fromTo(find(id).p, from, to, pos); return fx; };
    fx.keyframes = function (tl, id, frames) { // frames: [[seconds, {amount: 0}], ...] -> a set at each time (hard steps), or use to() for eases
      frames.forEach(function (f) { tl.set(find(id).p, f[1], f[0]); }); return fx;
    };
    // drive(tl, { offset }): redraw whenever the timeline updates, seeks included. t = tl.time() + offset.
    fx.drive = function (tl, opts) {
      var off = (opts && opts.offset) || 0;
      var fn = function () { fx.render(tl.time() + off); };
      tl.eventCallback("onUpdate", fn); fn(); return fx;
    };
    fx.dispose = function () { var i = REG.indexOf(fx); if (i >= 0) REG.splice(i, 1); if (fx.canvas && fx.canvas.parentNode) fx.canvas.parentNode.removeChild(fx.canvas); };
  }

  var REG = [];
  function register(fx) { REG.push(fx); }

  // ---- DOM snapshot (static, best effort; see the header) ---------------------------------------------------------
  function inlineStyles(src, dst) {
    var cs = root.getComputedStyle(src), txt = "";
    for (var i = 0; i < cs.length; i++) txt += cs[i] + ":" + cs.getPropertyValue(cs[i]) + ";";
    dst.setAttribute("style", txt);
    for (var c = 0; c < src.children.length; c++) inlineStyles(src.children[c], dst.children[c]);
  }
  function snapshot(el, opts) {
    opts = opts || {};
    need(el && el.getBoundingClientRect, "snapshot(el) needs a DOM element");
    var r = el.getBoundingClientRect(), w = Math.round(opts.width || r.width), h = Math.round(opts.height || r.height), sc = opts.scale || 1;
    var clone = el.cloneNode(true); inlineStyles(el, clone);
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    var xml = new root.XMLSerializer().serializeToString(clone);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w * sc + '" height="' + h * sc + '"><foreignObject width="100%" height="100%" style="transform:scale(' + sc + ');transform-origin:0 0">' + xml + "</foreignObject></svg>";
    return new Promise(function (res, rej) {
      var img = new root.Image();
      img.onload = function () { var c = root.document.createElement("canvas"); c.width = w * sc; c.height = h * sc; c.getContext("2d").drawImage(img, 0, 0); res(c); };
      img.onerror = function () { rej(new Error("RasanFX.snapshot: the browser could not rasterise this subtree (external fonts or images block it); use the image or canvas path")); };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
  }

  // Host seek hook: redraw every instance at scene time t (a film clock may call this instead of drive()).
  function renderAll(t) { REG.forEach(function (f) { f.render(t); }); }
  function preset(name) { need(PRESETS[name], "unknown preset " + name + " (have " + Object.keys(PRESETS).join(", ") + ")"); return JSON.parse(JSON.stringify(PRESETS[name])); }

  return { VERSION: VERSION, create: create, snapshot: snapshot, renderAll: renderAll, preset: preset, presets: Object.keys(PRESETS), kinds: Object.keys(PASSES), palettes: PALETTES, params: function (kind) { need(PASSES[kind], "unknown pass " + kind); return JSON.parse(JSON.stringify(PASSES[kind].params)); } };
});
