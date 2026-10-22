// benchmark. the technique catalogue and the three-fixture A/B (scripts/benchmark.mjs): list works offline, the 20 rows validate (no copied prompt or media fields,
// pinned licence-clean provenance), a missing render is "not run" and never a win, mismatched length / fps is refused, and a small real A/B on tiny synthetic renders
// makes blinded labels and stills. Tiny renders are made with ffmpeg lavfi sources (synthetic); ffmpeg cases print "not run: <reason>" without it.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export default async function ({ ok, node, tmp }) {
  const L = await import(pathToFileURL(path.join(HERE, "..", "lib", "benchmark.mjs")).href);
  const J = (r) => { try { return JSON.parse(r.stdout); } catch { return null; } };
  const noNet = { RASANAI_OFFLINE: "1" };

  // ---- list and validate: offline, from the files
  const ls = node("benchmark.mjs", ["list", "--json"]);
  const lj = J(ls);
  ok("benchmark list: works offline from the files (20 technique rows, 3 fixtures: 15 s, 30 s, 45 s)", ls.status === 0 && lj && lj.techniques.length === 20 && lj.fixtures.map((f) => f.duration_s).join() === "15,30,45", ls.stdout.slice(0, 200) + ls.stderr.slice(0, 200));
  const v = J(node("benchmark.mjs", ["validate"]));
  ok("benchmark validate: the 20 rows pass (every category covered, ids unique, pinned commits, licence on every row)", v && v.ok === true && v.rows === 20, JSON.stringify(v));
  const cat = L.loadCatalog();
  ok("catalogue: the 20 rows are all link-verified (verified: true, with the recorded check) and none is excluded", cat.rows.every((r) => r.verified === true && r.verified_on && r.verification), cat.rows.filter((r) => r.verified !== true).map((r) => r.id).join());
  ok("catalogue: no row has a prompt / transcript / media field, no original_url is a media file, and every field of the schema is present", cat.rows.every((r) => !Object.keys(r).some((k) => /^(prompt|prompt_text|prompt_partial|text|transcript|poster_url|video_url|still|image)$/i.test(k)) && !/\.(mp4|webp|png|jpe?g|gif|mp3|wav)(\?|$)/i.test(r.original_url) && ["id", "category", "techniques", "original_url", "source_repo", "source_commit", "what_to_learn", "what_not_to_copy", "local_fixture"].every((k) => r[k] !== undefined)));
  ok("catalogue: provenance is licence-clean: every row names a licence, its commit equals the pin in the catalogue, and a GitHub link is pinned to that commit", cat.rows.every((r) => r.license && cat.pins[r.source_repo] === r.source_commit && (!/github\.com/.test(r.original_url) || r.original_url.includes(`/${r.source_repo}/blob/${r.source_commit}/`))));
  const pins = fs.readFileSync(path.join(HERE, "..", "..", "third_party", "SOURCES.md"), "utf8");
  ok("catalogue: the pins equal the Video upgrade pins in SOURCES.md", Object.entries(cat.pins).every(([repo, sha]) => new RegExp(`${repo.replace(/[/.]/g, "\\$&")} \\| ${sha}`).test(pins)));
  const mut = (f) => { const c = JSON.parse(JSON.stringify(cat)); f(c); return L.validateCatalog(c); };
  ok("validate refuses a row with a copied prompt field", mut((c) => { c.rows[0].prompt = "x"; }).problems.some((p) => /prompt/.test(p)));
  ok("validate refuses a missing category, a duplicate id, a media link and an unpinned commit", (() => { const a = mut((c) => { c.rows.pop(); }), b = mut((c) => { c.rows[1].id = c.rows[0].id; }), m = mut((c) => { c.rows[2].original_url = "https://example.test/a.mp4"; }), p = mut((c) => { c.rows[3].source_commit = "deadbee"; }); return !a.ok && !b.ok && !m.ok && !p.ok && p.problems.some((x) => /pin/.test(x)); })());
  ok("validate refuses a row without licence provenance and a local fixture that names no benchmark fixture", !mut((c) => { delete c.rows[4].license; }).ok && !mut((c) => { c.rows[0].local_fixture = { kind: "benchmark-fixture", ref: "nope" }; }).ok);

  // ---- a missing render is "not run", never a win
  const out = path.join(tmp, "bench-out");
  const rep0 = node("benchmark.mjs", ["report", "--out", out]);
  const rj = JSON.parse(fs.readFileSync(path.join(out, "report.json"), "utf8")), md = fs.readFileSync(path.join(out, "BENCHMARK_REPORT.md"), "utf8");
  ok("report: with no renders every fixture is 'not run', no outcome, wins_claimed 0 and the markdown never says win", rep0.status === 0 && rj.fixtures.length === 3 && rj.fixtures.every((f) => f.status === "not run" && f.outcome === "not run") && rj.summary.wins_claimed === 0 && !/\bwin\b|favour/i.test(md.replace(/Nothing here is a win|never claims a win/gi, "")), md.slice(0, 400));
  const r1 = await L.runFixture("product-launch", { outRoot: out, after: path.join(tmp, "no-such.mp4") });
  ok("run: a missing after (and baseline) render is 'not run', not a comparison", r1.status === "not run" && r1.outcome === "not run" && /missing/.test(r1.reason) && r1.losing_cases.length === 0);
  ok("report: the human review status is pending-human-review for a not-run fixture too", rj.fixtures.every((f) => f.human_review.status === "pending-human-review") && /pending-human-review/.test(md));

  // ---- settings and a real small A/B
  const ff = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (ff.error || ff.status !== 0) { console.log("not run: benchmark render cases (ffmpeg is not installed)"); return; }
  const mk = (name, size, fps, dur, src = "testsrc2") => { const f = path.join(tmp, name); const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `${src}=size=${size}:rate=${fps}`, "-t", String(dur), "-c:v", "libx264", "-pix_fmt", "yuv420p", f], { encoding: "utf8" }); return r.status === 0 ? f : null; };
  const A = mk("a.mp4", "320x180", 10, 6), Bf = mk("b.mp4", "320x180", 10, 6, "mandelbrot"), C = mk("c-fps.mp4", "320x180", 12, 6), D = mk("d-len.mp4", "320x180", 10, 8), E = mk("e-size.mp4", "256x144", 10, 6);
  if (![A, Bf, C, D, E].every(Boolean)) { console.log("not run: benchmark render cases (ffmpeg could not make the tiny synthetic renders)"); return; }
  const pa = L.probe(A);
  ok("probe: size, fps and length of a render", pa && pa.width === 320 && pa.height === 180 && pa.fps === 10 && Math.abs(pa.duration_s - 6) < 0.2);
  ok("matching settings: equal renders match; a different fps, length or size is rejected with the reason", L.matchSettings(pa, L.probe(Bf)).ok && L.matchSettings(pa, L.probe(C)).problems.some((p) => /fps/.test(p)) && L.matchSettings(pa, L.probe(D)).problems.some((p) => /length/.test(p)) && L.matchSettings(pa, L.probe(E)).problems.some((p) => /size/.test(p)));
  const rm = await L.runFixture("character-story", { outRoot: out, baseline: A, after: D });
  ok("run: a baseline and an after render of different length are refused (no gates, no A/B, no outcome)", rm.status === "refused" && rm.outcome === "not comparable" && /length differs/.test(rm.reason) && !rm.ab);
  const rf = await L.runFixture("character-story", { outRoot: out, baseline: A, after: C });
  ok("run: a different fps is refused too", rf.status === "refused" && /fps differs/.test(rf.reason));
  const rr = await L.runFixture("character-story", { outRoot: out, baseline: A, after: Bf, seed: "test-seed" });
  ok("run: two matching renders are compared: the existing motion-gate ran on both, stills were captured, blinded X / Y strips exist", rr.status === "compared" && ["baseline", "after"].every((k) => rr.candidates[k].gates.some((g) => g.gate === "motion-gate" && g.status !== "not-applicable")) && rr.stills.after.length >= 2 && rr.stills.baseline.length === rr.stills.after.length && rr.ab.status === "labels-made" && rr.ab.strips.length === 3 && rr.ab.strips.every((s) => fs.existsSync(path.join(out, s))), JSON.stringify(rr.ab));
  const rec = JSON.parse(fs.readFileSync(path.join(out, rr.ab.record), "utf8")), brief = fs.readFileSync(path.join(out, rr.ab.juror_brief), "utf8");
  ok("run: the order of the two renders is in the crew record only, not in the juror's brief, and the seed makes it repeatable", rec.order && ["new", "prev"].includes(rec.order.X) && !/baseline|a\.mp4|b\.mp4|"order"|prev|\bnew version\b/i.test(brief) && rec.seed === "test-seed");
  ok("run: human preference stays pending-human-review; the outcome note says it is gates only; the result records losing cases as a list", rr.human_review.status === "pending-human-review" && /not a preference/.test(rr.outcome_note) && Array.isArray(rr.losing_cases) && rr.baseline_kind.kind === "supplied");
  const rep1 = node("benchmark.mjs", ["report", "--out", out]);
  const rj1 = JSON.parse(fs.readFileSync(path.join(out, "report.json"), "utf8")), cs = rj1.fixtures.find((f) => f.fixture === "character-story");
  ok("report: the compared fixture carries the numeric evidence fields (gates, hero metrics, audio error, render seconds, memory) and links to its stills; the other two stay 'not run'", rep1.status === 0 && cs.status === "compared" && cs.after.gates.length >= 1 && cs.after.hero_metrics && "audio_timing_error_frames" in cs.after && "render_seconds" in cs.after && "peak_memory_mb" in cs.after && cs.stills.after.length >= 2 && rj1.fixtures.filter((f) => f.status === "not run").length === 2 && rj1.summary.wins_claimed === 0);
  ok("report: a baseline supplied for a fixture whose after render is missing is still 'not run' (never a win)", (await L.runFixture("evidence-explainer", { outRoot: out, baseline: A })).status === "not run");

  // ---- the generated fixture films, when `benchmark.mjs build` has been run here (never built by the test: three headless renders take about two minutes)
  const gen = path.join(L.DEFAULT_OUT);
  const built = L.loadFixtures().filter((f) => fs.existsSync(path.join(gen, f.id, "build.json")));
  if (!built.length) console.log("not run: the three generated fixture films are not present (run `node scripts/benchmark.mjs build` first); the cases above did not need them");
  for (const f of built) {
    const p = L.probe(path.join(gen, f.id, "after.mp4")), b = JSON.parse(fs.readFileSync(path.join(gen, f.id, "build.json"), "utf8"));
    ok(`fixture ${f.id}: the generated render matches its declared settings (${f.duration_s} s, ${f.width}x${f.height}, ${f.fps} fps) and its degraded baseline is labelled as such`, p && p.width === f.width && p.height === f.height && p.fps === f.fps && Math.abs(p.duration_s - f.duration_s) < 0.2 && b.baseline_kind === "degraded-variant" && /origin\/master/.test(b.master_baseline));
  }
  void noNet;
}
