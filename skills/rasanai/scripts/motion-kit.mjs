#!/usr/bin/env node
// Motion-kit CLI: browse, suggest, check and scaffold the motion-kit catalog. Model-free, cloud-free.
// (Not scripts/motionkit.mjs, which is the older RasanMotion verbs tool.)
//
// usage (JSON on stdout; exit 0 ok, 1 failed check, 2 usage error):
//   node motion-kit.mjs list [--family f] [--role r] [--implemented]      (every row says whether the code behind it exists: `implemented`)
//   node motion-kit.mjs inspect <id>
//   node motion-kit.mjs suggest --scene <file.json> | --role r --family f --duration s --mood m --aspect 9:16
//        [--assets a,b] [--brand <DESIGN.md|motion.md>] [--prev <id>] [--seed n] [--limit 3-5]
//        (scene file: one object {role,family,duration_s,mood,aspect,assets,prev}, or an array / {scenes:[..]};
//         for a list each beat is scored with the previous beat's top pick as --prev. Same inputs => same output.)
//   node motion-kit.mjs check --project <dir>
//   node motion-kit.mjs scaffold <id> [--out <file>]
//   node motion-kit.mjs validate-catalog
//   (suggest only offers implemented rows; --include-unimplemented lists the rest, marked. scaffold refuses an unimplemented row.)
//   (any) --catalog <path>   default: skills/rasanai/motion-kit/catalog.json
import fs from "node:fs";
import path from "node:path";
import { loadCatalog, findItem, validateCatalog, annotate } from "./lib/motion-kit/catalog.mjs";
import { suggest, brandMotion } from "./lib/motion-kit/suggest.mjs";
import { checkProject } from "./lib/motion-kit/check.mjs";
import { scaffold } from "./lib/motion-kit/scaffold.mjs";

function parse(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > -1) o[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) o[a.slice(2)] = argv[++i];
      else o[a.slice(2)] = true;
    } else o._.push(a);
  }
  return o;
}
const out = (obj, code = 0) => { process.stdout.write(JSON.stringify(obj, null, 2) + "\n"); process.exit(code); };
const usage = (msg) => { process.stdout.write(JSON.stringify({ ok: false, error: msg, usage: "motion-kit.mjs list|inspect|suggest|check|scaffold|validate-catalog [--catalog path]" }, null, 2) + "\n"); process.exit(2); };

const args = parse(process.argv.slice(2));
const cmd = args._[0];
if (!cmd || ["help", "-h"].includes(cmd) || args.help) usage("no command");
const flag = (k) => (args[k] === true ? usage(`--${k} needs a value`) : args[k]);

let cat;
try { cat = loadCatalog(flag("catalog")); } catch (e) { out({ ok: false, error: e.message }, e.code === "NOCATALOG" ? 2 : 1); }
const { items: allItems } = cat;
const items = annotate(allItems); // Plan 06 V2: a row is not a capability; `implemented` is checked against the code it names
const brief = (i) => ({ id: i.id, version: i.version, label: i.label, family: i.family, role: i.role, summary: i.summary, supports: i.supports, implemented: i.implemented, ...(i.implemented ? {} : { unavailable_reason: i.implemented_reason }) });

switch (cmd) {
  case "list": {
    const f = flag("family"), r = flag("role");
    const sel = items.filter((i) => (!f || i.family === f) && (!r || i.role === r) && (!args.implemented || i.implemented));
    out({ ok: true, catalog: cat.file, count: sel.length, implemented: sel.filter((i) => i.implemented).length, items: sel.map(brief) });
    break;
  }
  case "inspect": {
    if (!args._[1]) usage("inspect needs an id");
    const it = findItem(items, args._[1]);
    if (!it) out({ ok: false, error: `unknown id ${args._[1]}` }, 1);
    out({ ok: true, item: it, annotation: `motion-kit:${it.id}@${it.version}` });
    break;
  }
  case "suggest": {
    const seed = flag("seed") == null ? 0 : Number(flag("seed"));
    if (!Number.isFinite(seed)) usage("--seed must be a number");
    const limit = flag("limit") == null ? 5 : Number(flag("limit"));
    let brand = null;
    if (flag("brand")) {
      try { brand = brandMotion(path.resolve(flag("brand"))); } catch (e) { usage(`cannot read --brand: ${e.message}`); }
    }
    let scenes;
    if (flag("scene")) {
      let data;
      try { data = JSON.parse(fs.readFileSync(path.resolve(flag("scene")), "utf8")); } catch (e) { usage(`cannot read --scene: ${e.message}`); }
      scenes = Array.isArray(data) ? data : Array.isArray(data.scenes) ? data.scenes : [data];
    } else {
      if (!flag("role") && !flag("family")) usage("suggest needs --scene or at least --role/--family");
      scenes = [{ role: flag("role"), family: flag("family"), duration_s: flag("duration"), mood: flag("mood"), aspect: flag("aspect"),
        assets: flag("assets") ? String(flag("assets")).split(",").filter(Boolean) : [], prev: flag("prev") }];
    }
    const results = [];
    let prevPick = null;
    for (const s of scenes) {
      const scene = { role: s.role, family: s.family, duration_s: s.duration_s ?? s.duration, mood: s.mood, aspect: s.aspect || flag("aspect"),
        assets: s.assets || [], prev: s.prev || prevPick };
      const sug = suggest(args["include-unimplemented"] ? items : items.filter((i) => i.implemented), scene, { brand, seed, limit }).map((x) => ({ ...x, implemented: (items.find((i) => i.id === x.id) || {}).implemented === true }));
      prevPick = sug[0] ? sug[0].id : null;
      results.push({ scene: { ...scene, assets: [...scene.assets] }, suggestions: sug });
    }
    out(scenes.length === 1 && !flag("scene")
      ? { ok: true, seed, brand_words: brand ? brand.words : [], ...results[0] }
      : { ok: true, seed, brand_words: brand ? brand.words : [], beats: results });
    break;
  }
  case "check": {
    if (!flag("project")) usage("check needs --project <dir>");
    try { const r = checkProject(flag("project"), items); out(r, r.ok ? 0 : 1); }
    catch (e) { out({ ok: false, error: e.message }, e.code === "NOPROJECT" ? 2 : 1); }
    break;
  }
  case "scaffold": {
    if (!args._[1]) usage("scaffold needs an id");
    const it = findItem(items, args._[1]);
    if (!it) out({ ok: false, error: `unknown id ${args._[1]}` }, 1);
    if (!it.implemented) out({ ok: false, error: `${it.id} is catalogued but not implemented: ${it.implemented_reason}` }, 1);
    const html = scaffold(it);
    if (flag("out")) {
      const p = path.resolve(flag("out"));
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, html);
      out({ ok: true, id: it.id, wrote: p, bytes: html.length });
    }
    out({ ok: true, id: it.id, html });
    break;
  }
  case "validate-catalog": {
    const r = validateCatalog(cat.data);
    out({ ok: r.errors.length === 0, catalog: cat.file, ...r }, r.errors.length ? 1 : 0);
    break;
  }
  default: usage(`unknown command ${cmd}`);
}
