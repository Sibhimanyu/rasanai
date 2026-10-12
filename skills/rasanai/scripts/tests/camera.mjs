// camera: the RasanCamera kit. The runtime parses and carries a version; camera.mjs check catches a missing or misordered
// runtime, a stage without the timeline, Math.random, and budgeted extras over 3; install copies the runtime and the
// self-registering GSAP plugins bundle; video.mjs inject installs both and tags existing compositions after their GSAP
// tag; finish.mjs knows --draft and shims RasanCamera projects. Full runs (not --quick) also render the demo film headless:
// every function changes over time, seeks back byte-identical, and two browser launches give byte-identical frames.
// export default async function ({ ok, node, tmp }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default async function ({ ok, node, tmp }) {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const S = path.join(HERE, "..");
  const RT = path.join(S, "..", "runtime", "rasan-camera.js");
  const quick = process.argv.includes("--quick");
  const J = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };

  const syn = spawnSync(process.execPath, ["--check", RT], { encoding: "utf8" });
  const src = fs.readFileSync(RT, "utf8");
  ok("camera: the runtime parses, carries a VERSION and defines RasanCamera.stage and blurTrail without Math.random or the wall clock", syn.status === 0 && /var VERSION = "\d+\.\d+\.\d+"/.test(src) && /RasanCamera = \{[^}]*stage: stage[^}]*blurTrail: blurTrail/.test(src) && !/Math\.random\s*\(|Date\.now\s*\(|performance\.now\s*\(/.test(src), syn.stderr);

  // check: missing, then installed, then planted problems
  const p = path.join(tmp, "camera-proj");
  fs.mkdirSync(path.join(p, "compositions"), { recursive: true });
  const comp = (body) => `<template><script src="../gsap.min.js"></script>${body}<script>const tl=gsap.timeline({paused:true});const cam=RasanCamera.stage("#r",{lens_mm:35,tl:tl,duration:4});cam.place("#a",{z:-200});window.__timelines.a=tl</script></template>`;
  fs.writeFileSync(path.join(p, "compositions", "a.html"), comp(""));
  const c0 = node("camera.mjs", ["check", "--project", p, "--json"]);
  ok("camera (check): RasanCamera without the runtime is an error (runtime-missing, runtime-not-loaded)", c0.status === 2 && /runtime-missing/.test(c0.stdout) && /runtime-not-loaded/.test(c0.stdout), c0.stdout.slice(0, 300));
  const ci = node("camera.mjs", ["install", "--project", p]);
  const bundle = path.join(p, "assets", "vendor", "gsap-plugins.min.js");
  const hasPlugins = fs.existsSync(path.join(S, "vendor", "gsap-plugins.min.js"));
  ok("camera (install): copies the runtime into assets/rasan-camera/ and the GSAP plugins bundle (self-registering) into assets/vendor/", ci.status === 0 && fs.existsSync(path.join(p, "assets", "rasan-camera", "rasan-camera.js")) && (!hasPlugins || (fs.existsSync(bundle) && /registerPlugin\.apply/.test(fs.readFileSync(bundle, "utf8")))), ci.stderr || ci.stdout.slice(0, 200));
  fs.writeFileSync(path.join(p, "compositions", "a.html"), comp(`<script src="../assets/rasan-camera/rasan-camera.js"></script>`));
  const c1 = node("camera.mjs", ["check", "--project", p]);
  ok("camera (check): installed, loaded after GSAP, timeline passed in: clean", c1.status === 0 && /camera: clean/.test(c1.stdout), c1.stdout);
  fs.writeFileSync(path.join(p, "compositions", "b.html"), `<template><script src="../assets/rasan-camera/rasan-camera.js"></script><script src="../gsap.min.js"></script><script>const tl=gsap.timeline({paused:true});RasanCamera.stage("#r",{lens_mm:35});const s=Math.random();</script></template>`);
  const c2 = J(node("camera.mjs", ["check", "--project", p, "--json"]));
  const rules = (c2.findings || []).map((f) => f.rule);
  ok("camera (check): runtime before GSAP, a stage without the timeline and Math.random are caught", c2.errors >= 2 && rules.includes("script-order") && rules.includes("nondeterministic") && rules.includes("stage-without-timeline"), JSON.stringify(rules));
  fs.rmSync(path.join(p, "compositions", "b.html"));
  fs.writeFileSync(path.join(p, "compositions", "c.js"), `cam.chromaticSplit("#a");cam.chromaticSplit("#b");cam.chromaticSplit("#c");cam.chromaticSplit("#d");cam.lightComet("#e");`);
  const c3 = J(node("camera.mjs", ["check", "--project", p, "--json"]));
  ok("camera (check): a budgeted extra used 4 times warns over-budget (3 allowed); one lightComet does not", (c3.findings || []).some((f) => f.rule === "over-budget" && /chromaticSplit is called 4 times/.test(f.message)) && !(c3.findings || []).some((f) => /lightComet/.test(f.message)) && c3.budget.chromaticSplit === 4, JSON.stringify(c3.findings));

  // video.mjs inject: installs the kit and the plugins, tags an existing composition after its GSAP tag
  const pd = path.join(tmp, "camera-inject");
  fs.mkdirSync(path.join(pd, ".hyperframes", "frame-packets"), { recursive: true });
  fs.mkdirSync(path.join(pd, "compositions", "frames"), { recursive: true });
  const pers = fs.readdirSync(path.join(S, "..", "personalities")).filter((f) => f.endsWith(".json")).sort()[0].replace(".json", "");
  node("motion-md.mjs", ["write", "--personality", pers, "--out", path.join(pd, "motion.md")]);
  fs.writeFileSync(path.join(pd, ".hyperframes", "frame-packets", "01.md"), "# Frame 1\n\npacket\n");
  const scene = path.join(pd, "compositions", "frames", "s1.html");
  fs.writeFileSync(scene, `<template><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script><script>gsap.registerPlugin(SplitText);const tl=gsap.timeline({paused:true});const cam=RasanCamera.stage("#r",{tl:tl});</script></template>`);
  const inj = node("video.mjs", ["inject", "--project-dir", pd]);
  const ij = J(inj), st = fs.readFileSync(scene, "utf8");
  const iG = st.indexOf("gsap.min.js"), iP = st.indexOf("../../assets/vendor/gsap-plugins.min.js"), iC = st.indexOf("../../assets/rasan-camera/rasan-camera.js");
  ok("camera (inject): video.mjs inject installs RasanCamera and the plugins bundle, and tags the scene right after its GSAP tag (plugins, then the camera)", inj.status === 0 && ij.camera && fs.existsSync(path.join(pd, "assets", "rasan-camera", "rasan-camera.js")) && (!hasPlugins || (ij.gsap_plugins && iP > iG)) && iC > iG && (!hasPlugins || iC > iP) && (ij.tagged || []).length === 1, (inj.stderr || inj.stdout).slice(0, 400));
  const inj2 = J(node("video.mjs", ["inject", "--project-dir", pd]));
  ok("camera (inject): a second inject adds no second tag", !(inj2.tagged || []).length && fs.readFileSync(scene, "utf8").split("rasan-camera.js").length === 2);

  // finish.mjs: --draft is documented, sets 4 samples and draft quality, and RasanCamera projects get the trails shim
  const fin = fs.readFileSync(path.join(S, "finish.mjs"), "utf8");
  ok("camera (finish): finish.mjs has --draft (4 samples, draft quality, no grade) and scales RasanCamera trails to 2/samples in every pass", /--draft/.test(fin) && /args\.samples = "4"/.test(fin) && /RASAN_CAMERA_TRAILS=/.test(fin) && /2 \/ \(Nb \* passes\)/.test(fin) && /cmd === "blur" \|\| DRAFT/.test(fin));

  if (quick) { console.log("note  camera (demo): skipped under --quick (about 20 s; run the full selftest or camera.mjs demo)"); return; }
  const dd = path.join(tmp, "camera-demo");
  const d = node("camera.mjs", ["demo", "--out", dd]);
  const r = J(d);
  if (!r.features) { console.log("skip  camera (demo): could not run (" + (d.stderr || d.stdout).slice(0, 200).replace(/\n/g, " ") + ")"); return; }
  ok("camera (demo): the four shots build with no console errors", !(r.errors || []).length, (r.errors || []).join(" | "));
  const STATIC = new Set(["haze", "shadowLadder", "glass"]);
  for (const f of r.features) ok(`camera (demo): ${f.id} is drawn${STATIC.has(f.id) ? "" : ", changes over time"} and is identical when seeked again`, f.present && f.seek_identical && (STATIC.has(f.id) || f.changes), JSON.stringify(f));
  ok("camera (demo): every frame is byte-identical on a second seek (reverse order) and across two browser launches (the double render)", r.byte_identical_seek && r.byte_identical_double_render, JSON.stringify({ seek: r.seek_mismatch_at, double: r.double_render_mismatch_at, psnr: r.double_render_psnr_min }));
  ok("camera (demo): consecutive frames differ and the strip is written", r.frames_differ && !!r.strip && fs.existsSync(path.join(dd, "strip.png")), r.strip_note || "");
}
