// selftest section "formats" (W11): the "What are you making?" picker. library/formats.json's schema and routes
// (formats.mjs check), match on words, links and dropped files, resolve (route, inputs, shapes, scope rows, soon),
// the brief payload a console push carries (formats + a pre-selected format), the console page's picker, and the
// story.mjs pick hook (format_shapes). export default async function ({ ok, node, tmp, quick }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const json = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };

export default async function ({ ok, node, tmp }) {
  const T = path.join(tmp, "formats-w11");
  fs.mkdirSync(T, { recursive: true });
  const doc = JSON.parse(fs.readFileSync(path.join(HERE, "..", "library", "formats.json"), "utf8"));

  // ---- schema and routes
  const ck = node("formats.mjs", ["check"]), cj = json(ck);
  ok("formats: formats.json passes its check (schema, every ready or partial option on a real route in SKILL.md, cases in sources.mjs, shapes declared)", ck.status === 0 && cj.ok === true && !cj.errors.length, (cj.errors || []).slice(0, 5).join(" | ") + ck.stderr);
  ok("formats: 12 tiles (5 motion, 6 footage, something else), every tile has a default option and plain one-line copy", doc.tiles.length === 12 && doc.tiles.every((t) => t.options.includes(t.default) && t.description.split(/\s+/).length <= 16) && doc.tiles.filter((t) => t.group === "footage").length === 6, doc.tiles.map((t) => t.id).join(","));
  ok("formats: every option has story_shapes (a list), scope_default, a status and a required input; soon options say what's missing and the nearest that works", doc.options.every((o) => Array.isArray(o.story_shapes) && "scope_default" in o && ["ready", "partial", "soon"].includes(o.status) && o.inputs.some((i) => i.required)) && doc.options.filter((o) => o.status === "soon").every((o) => o.soon && o.soon.missing && (!o.soon.nearest || doc.options.find((x) => x.id === o.soon.nearest).status !== "soon")));
  // a planted bad file is refused
  const bad = JSON.parse(JSON.stringify(doc));
  bad.options.find((o) => o.id === "launch-film").route = "slideshow";
  bad.options.find((o) => o.id === "explainer").story_shapes.push("no-such-shape");
  bad.options.find((o) => o.id === "graphics-package").soon = null;
  const badF = path.join(T, "bad.json");
  fs.writeFileSync(badF, JSON.stringify(bad));
  const bk = spawnSync(process.execPath, [path.join(HERE, "formats.mjs"), "check"], { encoding: "utf8", env: { ...process.env, RASANAI_FORMATS_FILE: badF } }), bj = json(bk);
  ok("formats: check refuses an unknown route, an undeclared shape and a soon option that doesn't say what's missing (exit 2)", bk.status === 2 && (bj.errors || []).some((e) => /launch-film: route "slideshow"/.test(e)) && (bj.errors || []).some((e) => /no-such-shape/.test(e)) && (bj.errors || []).some((e) => /graphics-package: a soon option says what's missing/.test(e)), (bj.errors || []).join(" | "));

  // ---- match: words, links, dropped files
  const M = (req, paths) => json(node("formats.mjs", ["match", ...(req ? ["--request", req] : []), ...(paths ? ["--paths", paths.join(",")] : [])]));
  const cases = [
    ["Make a launch film for https://tally.so", null, "launch-film"],
    ["Turn https://github.com/acme/app/pull/42 into a video", null, "whats-new"],
    ["a customer story from our interview with Maya", null, "customer-story"],
    ["a lyric video for my new single", null, "lyric-video"],
    ["animate my logo", null, "logo-sting"],
    ["announce our new feature", null, "feature-reveal"],
    ["a recap of our conference", null, "event-recap"],
    ["we're hiring: a culture video", null, "team-hiring"],
    ["explain how vaccines work", null, "explainer"],
  ];
  const miss = cases.map(([r, p, want]) => [r, M(r, p).option, want]).filter(([, got, want]) => got !== want);
  ok(`formats: match pre-selects the option from the user's words and links (${cases.length} cases)`, !miss.length, JSON.stringify(miss));
  const clips = path.join(T, "lisbon"), tk = path.join(T, "interviews-customer");
  fs.mkdirSync(clips, { recursive: true }); fs.mkdirSync(tk, { recursive: true });
  for (const f of ["a.mp4", "b.mov", "c.MP4"]) fs.writeFileSync(path.join(clips, f), "");
  for (const f of ["maya-1.mov", "maya-2.mov"]) fs.writeFileSync(path.join(tk, f), "");
  const app = path.join(T, "app"); fs.mkdirSync(app); fs.writeFileSync(path.join(app, "package.json"), "{}");
  for (const f of ["me.mp4", "song.mp3", "greenscreen-take.mov", "q3.csv", "logo.svg"]) fs.writeFileSync(path.join(T, f), "");
  const pcases = [[clips, "social-reel"], [path.join(T, "me.mp4"), "talking-graphics"], [path.join(T, "song.mp3"), "lyric-video"], [app, "launch-film"], [path.join(T, "greenscreen-take.mov"), "presenter"], [path.join(T, "q3.csv"), "data-story"], [path.join(T, "logo.svg"), "logo-sting"], [tk, "customer-story"]];
  const pmiss = pcases.map(([p, want]) => [path.basename(p), M(null, [p]).option, want]).filter(([, got, want]) => got !== want);
  ok("formats: a dropped folder or file pre-selects (clips folder -> social reel, one clip -> someone talking, a song -> lyric video, code -> launch, green screen -> presenter, a spreadsheet -> data story, a logo -> sting)", !pmiss.length, JSON.stringify(pmiss));
  const both = M("a customer story", [clips]);
  ok("formats: the user's words win over a file hint (\"a customer story\" + a clips folder -> customer story, its why names the words)", both.option === "customer-story" && /customer story/.test(both.why), JSON.stringify(both));
  const pod = M("cut my podcast into clips");
  ok("formats: a format that isn't built is pre-selected honestly (status soon, a say line, the nearest that works), never swapped quietly", pod.option === "podcast-clips" && pod.status === "soon" && /coming soon/i.test(pod.say || "") && pod.nearest === "talking-graphics", JSON.stringify(pod));
  const none = M("make me a video");
  ok("formats: a request that names nothing selects nothing (the picker opens)", none.option === null && none.tile === null && none.confidence === "none", JSON.stringify(none));

  // ---- resolve
  const R = (id, scope) => json(node("formats.mjs", ["resolve", "--id", id, ...(scope ? ["--scope", scope] : [])]));
  const lf = R("launch-film");
  ok("formats: resolve launch-film -> product-launch-video, web source, public-launch case, the URL prompt, script-writers, ladder first, universal scope, 45 s 16:9", lf.ok && lf.route === "product-launch-video" && lf.source_mode === "web" && lf.case === "public-launch" && lf.inputs[0].id === "url" && /website or app link/.test(lf.inputs[0].prompt) && lf.story.pass === "script-writers" && lf.story_shapes[0] === "ladder" && lf.scope === "universal" && lf.length_s === 45 && lf.aspect === "16:9" && lf.args.crew_plan.join(" ") === "--route product-launch-video --kind launch", JSON.stringify(lf).slice(0, 400));
  const fu = R("feature-reveal", "universal"), fs1 = R("feature-reveal", "single-task"), f0 = R("feature-reveal");
  ok("formats: a feature launch's shapes follow its scope: many uses never offers a lone scenario, one job leads with it; unanswered -> the safe middle row", !fu.story_shapes.includes("scenario") && fu.forbidden_shapes.includes("scenario") && fs1.story_shapes[0] === "scenario" && f0.scope === null && f0.story_shapes[0] === "hero-strip" && !!f0.scope_question, JSON.stringify([fu.story_shapes, fs1.story_shapes, f0.story_shapes]));
  const cs = R("customer-story");
  ok("formats: resolve customer-story -> reel, footage source, customer-testimonial case, footage writers, testimony shape", cs.route === "reel" && cs.source_mode === "footage" && cs.case === "customer-testimonial" && cs.story.pass === "footage-writers" && cs.story_shapes[0] === "testimony" && cs.args.sources.join(" ") === "--kind customer story --case customer-testimonial");
  const sr = R("screen-demo");
  ok("formats: resolve a soon option -> no route, a say line that it's coming soon and never to be routed quietly, the nearest ready option", sr.status === "soon" && sr.route === null && sr.nearest === "product-tour" && /coming soon/.test(sr.say) && /Never route it quietly/.test(sr.say) && sr.args === null, JSON.stringify(sr).slice(0, 300));
  const nx = node("formats.mjs", ["resolve", "--id", "nope"]);
  ok("formats: resolve an unknown id exits 2", nx.status === 2);

  // ---- the brief payload: a headless push carries the picker and a pre-selected format
  const run = path.join(T, "run");
  const envH = { ...process.env, RASANAI_CONSOLE_HEADLESS: "1" };
  const push = (data) => spawnSync(process.execPath, [path.join(HERE, "console.mjs"), "push", "--run", run, "--step", "brief", "--data", JSON.stringify(data)], { encoding: "utf8", env: envH });
  const brief = () => JSON.parse(fs.readFileSync(path.join(run, "session.json"), "utf8")).steps.brief;
  push({ fields: { kind: "customer story", subject: "Maya at Northwind", length_s: 60 } });
  const b1 = brief();
  ok("formats: a brief push carries `formats` (12 tiles with options, status and input slots) and pre-selects the format from the kind's own words", (b1.formats || {}).tiles?.length === 12 && b1.formats.tiles.every((t) => t.options.every((o) => o.id && o.title && o.status && o.input && o.input.prompt)) && b1.format && b1.format.option === "customer-story" && b1.format.tile === "people", JSON.stringify(b1.format));
  push({ fields: { kind: "launch film", subject: "Tally" }, format: { tile: "launch", option: "feature-reveal", why: "You said \"new feature\"", scope: "universal" } });
  const b2 = brief();
  ok("formats: Claude's own pick wins (format {tile, option, why, scope} kept as pushed)", b2.format.option === "feature-reveal" && b2.format.why === "You said \"new feature\"" && b2.format.scope === "universal");
  push({ fields: { kind: "something nobody named", subject: "x" } });
  ok("formats: a kind that names no format leaves the pick empty (no guessing)", !brief().format && (brief().formats || {}).tiles?.length === 12);
  const soonOpt = b1.formats.tiles.find((t) => t.id === "screen").options[0];
  ok("formats: the list marks soon options with what's missing and the nearest ready option (for the Coming soon badge)", soonOpt.status === "soon" && /isn't built yet/.test(soonOpt.soon) && soonOpt.nearest && soonOpt.nearest.id === "product-tour");

  // ---- the console page: the picker replaces the six-item kind menu (kept only as a fallback without formats)
  const page = fs.readFileSync(path.join(HERE, "..", "console", "index.html"), "utf8");
  ok("formats: the console's brief panel renders the picker (tiles, options, Coming soon, the pre-selected chip, the scope question) and sends format with the submit", /What are you making\?/.test(page) && /fmt-tiles/.test(page) && /Coming soon/.test(page) && /fmt-chip/.test(page) && /scope_question/.test(page) && /f\.format = \{ tile: t, option: o\.id \}/.test(page) && /f\.kind = o\.kind/.test(page));

  // ---- story.mjs pick reports the format's shapes (the hook W10's shape map can read)
  const sd = path.join(T, "story-run", "story");
  fs.mkdirSync(sd, { recursive: true });
  const truth = path.join(sd, "truth.json");
  fs.writeFileSync(truth, JSON.stringify({ product: { name: "Lintel" }, tags: ["ai", "devtool"], format: { format: "brand", length: "36" }, claim_scope: { scope: "category", why: "reviews every pull request" }, use_domains: [{ domain: "review", prompt: "review a small diff" }, { domain: "threads", prompt: "resolve a review thread" }, { domain: "repos", prompt: "review across repos" }], tone: ["deadpan"], transformation: "from PRs that wait to PRs already reviewed", emotional_truth: "the guilty LGTM", enemy: ["the review queue"], objects: ["the diff", "the LGTM comment", "the pager alert", "the review badge", "conflict markers", "the CI checkmark"], forms: ["pull request", "review thread", "commit log", "changelog"], words: ["Lintel", "LGTM"], proof: ["Reviews a 400-line PR in under 90 seconds (brief)"], competitors: ["Rival"], cliche: ["hook", "montage", "introducing", "f1", "f2", "f3"] }));
  fs.writeFileSync(path.join(T, "story-run", "decisions.json"), JSON.stringify({ format: { tile: "launch", option: "feature-reveal", scope: "universal" } }));
  const sp = json(node("story.mjs", ["pick", "--truth", truth, "--seed", "w11"]));
  ok("formats: story.mjs pick reads the run's format pick and reports its ranked shapes (format_shapes: feature launch, universal, no lone scenario)", sp.format_shapes && sp.format_shapes.format === "feature-reveal" && sp.format_shapes.scope === "universal" && sp.format_shapes.shapes[0] === "ladder" && sp.format_shapes.forbidden.includes("scenario"), JSON.stringify(sp.format_shapes || sp).slice(0, 300));
  const sp2 = json(node("story.mjs", ["pick", "--truth", truth, "--seed", "w11", "--format-id", "brand-film"]));
  ok("formats: --format-id overrides the run's pick; a run with no format pick has no format_shapes", sp2.format_shapes && sp2.format_shapes.format === "brand-film" && sp2.format_shapes.shapes[0] === "manifesto" && (() => { fs.rmSync(path.join(T, "story-run", "decisions.json")); return !json(node("story.mjs", ["pick", "--truth", truth, "--seed", "w11"])).format_shapes; })(), JSON.stringify(sp2.format_shapes || {}).slice(0, 200));
}
