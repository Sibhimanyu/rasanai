import fs from 'fs';
const P = process.argv[2], W = process.argv[3];
const D = JSON.parse(fs.readFileSync(P + '/maps-desk.json')), M = JSON.parse(fs.readFileSync(P + '/maps-phone.json'));
const jsF = W + '/docs/assets/home.js', cssF = W + '/docs/assets/home.css';
let js = fs.readFileSync(jsF, 'utf8'), css = fs.readFileSync(cssF, 'utf8');
const fmt = (a) => { const parts = []; for (let i = 0; i < a.length; i += 2) parts.push(a[i] + "," + a[i + 1]); const lines = []; for (let i = 0; i < parts.length; i += 8) lines.push('      ' + parts.slice(i, i + 8).join(', ')); return "[\n" + lines.join(",\n") + "\n    ]"; };
const names = ['hero', 'flight', 'crew', 'control', 'projects', 'download'];
let src = 'var MAPS = {\n';
for (const n of names) { src += '    ' + n + ': {\n      d: ' + fmt(D[n].knots).replace(/\n    \]$/, '\n      ]').replace(/^\[\n/, '[\n') + ',\n      m: ' + fmt(M[n].knots).replace(/\n    \]$/, '\n      ]') + '\n    }' + (n === names[names.length - 1] ? '\n' : ',\n'); }
src += '  };';
// replace MAPS block (either the empty one or a previous generation)
const re = /var MAPS = \{\};|var MAPS = \{\n    hero: [\s\S]*?\n    \}\n  \};/;
if (!re.test(js)) throw new Error('no MAPS');
js = js.replace(re, src);
js = js.replace(/var MBEAT_TRACK = [0-9.]+;/, 'var MBEAT_TRACK = ' + M.projects.trackVH + ';');
fs.writeFileSync(jsF, js);
const v = (x) => Math.round(x * 100);
const sub = (re, to) => { if (!re.test(css)) throw new Error('css miss ' + re); css = css.replace(re, to); };
sub(/\.pin \.hero \{ height: \d+vh;/, `.pin .hero { height: ${v(D.hero.heightVH)}vh;`);
sub(/(\.pin \.shot-band \{ position: relative; z-index: 2; )margin-top: -\d+vh; height: \d+vh;/, `$1margin-top: -${v(D.flight.heightVH)}vh; height: ${v(D.flight.heightVH)}vh;`);
sub(/\.pin \.flow\.crew-ready \{ height: \d+vh;/, `.pin .flow.crew-ready { height: ${v(D.crew.heightVH)}vh;`);
sub(/\.pin \.squeak-scene\.host-ready \{ height: \d+vh; \}/, `.pin .squeak-scene.host-ready { height: ${v(D.control.heightVH)}vh; }`);
sub(/\.mpin \.hero \{ height: \d+vh; height: \d+svh;/, `.mpin .hero { height: ${v(M.hero.heightVH)}vh; height: ${v(M.hero.heightVH)}svh;`);
sub(/margin-top: -\d+vh; margin-top: -\d+svh; height: \d+vh; height: \d+svh; padding: 0; \}/, `margin-top: -${v(M.flight.heightVH)}vh; margin-top: -${v(M.flight.heightVH)}svh; height: ${v(M.flight.heightVH)}vh; height: ${v(M.flight.heightVH)}svh; padding: 0; }`);
sub(/\.mpin \.flow\.crew-ready \{ height: \d+vh; height: \d+svh;/, `.mpin .flow.crew-ready { height: ${v(M.crew.heightVH)}vh; height: ${v(M.crew.heightVH)}svh;`);
sub(/\.mpin \.squeak-scene \{ --mh: \d+svh; \}/, `.mpin .squeak-scene { --mh: ${v(M.control.heightVH)}svh; }\n.mpin .endcard { --mh: ${v(M.download.heightVH)}svh; }`.replace('\n.mpin .endcard', '\n.mpin .endcard'));
sub(/\.mpin \.projects\.host-ready \.m-stage \{ position: relative; height: calc\(100vh \* [0-9.]+\); height: calc\(100svh \* [0-9.]+\); \}/, `.mpin .projects.host-ready .m-stage { position: relative; height: calc(100vh * ${+(M.projects.trackVH + 1).toFixed(2)}); height: calc(100svh * ${+(M.projects.trackVH + 1).toFixed(2)}); }`);
// desktop projects / end heights: their own rules after the shared one
const rule = /(  \.pin \.beat-host\.host-ready \{ height: 520vh; padding: 0; overflow: clip; \}[^\n]*\n)/;
if (!rule.test(css)) throw new Error('beat host rule');
if (!/\.pin \.projects\.host-ready \{ height:/.test(css)) css = css.replace(rule, `$1  .pin .projects.host-ready { height: ${v(D.projects.heightVH)}vh; }\n  .pin .endcard.host-ready { height: ${v(D.download.heightVH)}vh; }\n`);
else { css = css.replace(/\.pin \.projects\.host-ready \{ height: \d+vh; \}/, `.pin .projects.host-ready { height: ${v(D.projects.heightVH)}vh; }`).replace(/\.pin \.endcard\.host-ready \{ height: \d+vh; \}/, `.pin .endcard.host-ready { height: ${v(D.download.heightVH)}vh; }`); }
fs.writeFileSync(cssF, css);
console.log('applied', JSON.stringify(Object.fromEntries(names.map((n) => [n, [v(D[n].heightVH), M[n].heightVH != null ? v(M[n].heightVH) : M[n].trackVH]]))));
