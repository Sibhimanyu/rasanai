// frames: styleframes and design boards (references/styleframes.md), fixture-based and headless.
// The shot-list rules (lib/frames-lib.mjs checkShots) on a good and a bad list; frames.mjs init (kit, skeleton, --heroes),
// shots-check, refs (a brand-film still, frames pulled from a reference clip, the showcases in words), sheet (the ffmpeg
// path, no browser), match (SSIM of the draft at each board's peak), payload (frames, refs, verdicts, heroes, the older
// images/captions); the crew's styleframes phases, the styleframe-designer and frame-juror prompts and checks, the score
// bound to the boards (board-contradiction, board-missing, deviations); the console's redo action, headless.
// export default async function ({ ok, node, tmp, env }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export default async function ({ ok, node, tmp, env }) {
  const lib = await import(path.join(HERE, "lib", "frames-lib.mjs"));
  const J = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const wj = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); };
  const hasFF = spawnSync("ffmpeg", ["-version"]).status === 0;
  const png = (f, color, size = "320x180") => { fs.mkdirSync(path.dirname(f), { recursive: true }); spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=${color}:s=${size}`, "-frames:v", "1", f]); };

  // ---------------------------------------------------------------- the shot-list rules
  const shot = (id, size, hero, extra = {}) => ({ id, beat: `b${id}`, line: "x", kind: "ui-demo", size, hero, hero_pct: 40, angle: { ry: -20, rx: 6 }, focus: { sharp: hero, soft: "the rest" }, light: { key: "upper-left", color: "#fff4e6" }, ground: { tint: "#efece6", falloff: "6 L*" }, type: [{ text: "Ask anything", pct: 6 }], crop: "right edge", device: "the composer", anchor: "composer", ...extra });
  const good = { film: { duration: 30, device: "the composer", heroes: ["01", "03", "05"] }, shots: [shot("01", "CU", "the composer", { type: [{ text: "One inbox", pct: 38 }], kind: "type", size: "TYPE", hero_pct: 38 }), shot("02", "ECU", "the send button", { anchor: "send" }), shot("03", "MS", "three rows of the inbox", { anchor: "inbox" }), shot("04", "CU", "the ranked row", { anchor: "row", angle: "frontal", type: [{ text: "ranked", pct: 22 }] }), shot("05", "TYPE", "the end line", { kind: "end", anchor: "logo", type: [{ text: "Try it today.", pct: 11 }], hero_pct: 12 })] };
  const g = lib.checkShots(good);
  ok("frames: a varied shot list passes the rules (sizes, hero scale, text load, a giant moment, light, heroes)", g.errors.length === 0, g.errors.join(" | "));
  const badList = { film: { duration: 30, heroes: ["01"] }, shots: [shot("01", "MS", "the composer", { hero_pct: 30 }), shot("02", "MS", "the composer", { hero_pct: 30 }), shot("03", "MS", "a card", { hero_pct: 12, light: { key: "left" } }), shot("04", "MS", "the composer", { hero_pct: 30, type: [{ text: "Bill splitter for a party of five based on what we ate", pct: 3 }, { text: "Instant", pct: 1.2 }, { text: "Margherita 14.00", pct: 1.2 }] })] };
  const b = lib.checkShots(badList);
  const has = (code) => b.errors.some((e) => e.startsWith(code));
  ok("frames: the median film fails the shot list: size-repeat, sizes-few, hero-small, text-heavy, no-giant, anchor-monotony, light, heroes", ["size-repeat", "sizes-few", "hero-small", "text-heavy", "no-giant", "anchor-monotony", "light", "heroes"].every(has), b.errors.join(" | "));
  const tilt = lib.checkShots({ ...good, shots: good.shots.map((s, i) => (i === 2 ? { ...s, angle: { rx: 50, ry: 10, rz: 8 } } : s)) });
  ok("frames: a steep or three-axis tilt is a warning (type shears)", tilt.warnings.some((w) => /tilt-steep: 03/.test(w)), tilt.warnings.join(" | "));
  const dens = lib.checkShots({ ...good, film: { ...good.film, density_shot: "04" }, shots: good.shots.map((s, i) => (i === 3 ? { ...s, type: [{ text: "a".repeat(80), pct: 2 }] } : s)) });
  ok("frames: one declared density shot may carry more text", !dens.errors.some((e) => /text-heavy/.test(e)), dens.errors.join(" | "));
  const A = Buffer.alloc(160 * 90, 128); for (let i = 0; i < A.length; i++) A[i] = (i * 7) % 255;
  ok("frames: ssim of an image with itself is 1, with a flat grey it is low", lib.ssim(A, A) === 1 && lib.ssim(A, Buffer.alloc(160 * 90, 128)) < 0.2);

  // ---------------------------------------------------------------- the run fixture
  const ws = path.join(tmp, "frames-ws"), run = path.join(ws, ".rasanai", "r1");
  fs.mkdirSync(run, { recursive: true });
  wj(path.join(run, "brief.json"), { fields: { length_s: 30, kind: "launch", aspect: "16:9", subject: "Inbox" } });
  wj(path.join(run, "story", "chosen.json"), { beats: [{ name: "hook", duration_s: 4, on_screen: "One inbox" }, { name: "send", duration_s: 6, on_screen: "Send it" }, { name: "rank", duration_s: 8, on_screen: "Ranked" }, { name: "proof", duration_s: 6, on_screen: "" }, { name: "cta", duration_s: 6, on_screen: "Try it today." }] });
  const F = (...a) => node("frames.mjs", a, { cwd: ws });
  const C = (...a) => node("crew.mjs", a, { cwd: ws });
  const ini = J(F("init", "--run", run));
  const sk = JSON.parse(fs.readFileSync(path.join(run, "frames", "shots.json"), "utf8"));
  ok("frames init: the frame kit and a skeleton shot list from the chosen script (ids, beats, times, three heroes)", ini.ok && fs.existsSync(path.join(run, "frames", "kit", "frame-kit.js")) && /data-dof/.test(fs.readFileSync(path.join(run, "frames", "kit", "frame-kit.js"), "utf8")) && sk.shots.length === 5 && sk.shots[0].id === "01" && sk.shots[2].beat === "rank" && sk.film.heroes.length === 3, JSON.stringify(ini).slice(0, 300));
  const hdir = path.join(run, "design", "Bold", "frames");
  F("init", "--run", run, "--dir", hdir, "--heroes");
  const hk = JSON.parse(fs.readFileSync(path.join(hdir, "shots.json"), "utf8"));
  ok("frames init --heroes: a Look card's open, peak and end only", hk.shots.map((s) => s.id).join(",") === "open,peak,end" && hk.film.heroes.join(",") === "open,peak,end", JSON.stringify(hk.shots.map((s) => s.id)));
  const sc0 = F("shots-check", "--run", run);
  ok("frames shots-check: the unfilled skeleton exits 2 with what is missing", sc0.status === 2 && /shot-fields/.test(sc0.stdout), sc0.stdout.slice(0, 200));
  wj(path.join(run, "frames", "shots.json"), good);
  const sc1 = F("shots-check", "--run", run);
  ok("frames shots-check: a good list exits 0 and lists the boards still missing", sc1.status === 0 && J(sc1).boards.missing.length === 5, sc1.stdout.slice(0, 300));

  // ---------------------------------------------------------------- crew: phases, prompts, checks
  C("plan", "--run", run, "--route", "product-launch-video", "--subject", "Inbox", "--length", "30");
  const plan = JSON.parse(fs.readFileSync(path.join(run, "crew", "plan.json"), "utf8"));
  const phs = plan.phases.map((p) => p.phase);
  ok("frames crew: a direct unbranded launch plans look-heroes (3 designers), then styleframes (one designer), the frame juror and styleframes-show, all before the score", ["look-heroes", "styleframes", "frames-jury", "styleframes-show"].every((x) => phs.includes(x)) && phs.indexOf("styleframes") < phs.indexOf("score") && phs.indexOf("art") < phs.indexOf("styleframes") && plan.phases.find((p) => p.phase === "look-heroes").dispatch.length === 3 && plan.phases.find((p) => p.phase === "styleframes").dispatch[0].key === "frames", phs.join(","));
  const lean = path.join(ws, ".rasanai", "r-lean");
  fs.mkdirSync(lean, { recursive: true });
  const lp = J(C("plan", "--run", lean, "--route", "faceless-explainer", "--subject", "tides", "--length", "30", "--lean"));
  const lsf = (lp.phases || []).find((p) => p.phase === "styleframes");
  ok("frames crew: --lean keeps the styleframes (the Director draws them) and plans no juror", !!lsf && lsf.members.length === 0 && !(lp.phases || []).some((p) => p.phase === "frames-jury"), JSON.stringify((lp.phases || []).map((p) => p.phase)));
  const lyr = path.join(ws, ".rasanai", "r-song");
  fs.mkdirSync(lyr, { recursive: true });
  const sp = J(C("plan", "--run", lyr, "--route", "music-to-video", "--subject", "song", "--length", "60", "--scenes", "6"));
  ok("frames crew: a lyric video keeps its key frames after the score and gets no styleframes phase", (sp.phases || []).some((p) => p.phase === "keyframes") && !(sp.phases || []).some((p) => /styleframes|frames-jury/.test(p.phase)), JSON.stringify((sp.phases || []).map((p) => p.phase)));
  const br = J(C("brief", "--run", run, "--role", "styleframe-designer", "--key", "frames"));
  const ptxt = br.prompt ? fs.readFileSync(path.join(ws, br.prompt), "utf8") : "";
  ok("frames crew: the styleframe designer's prompt carries the bar (x1-compare.jpg), the commands and the structured show-off ask", /x1-compare\.jpg/.test(ptxt) && /frames\.mjs" init --run/.test(ptxt) && /shots-check/.test(ptxt) && /x1 already beat the pipeline/.test(ptxt) && /Name your three rewind frames/.test(ptxt), ptxt.slice(0, 200));
  const hb = J(C("brief", "--run", run, "--role", "styleframe-designer", "--key", "heroes-Bold"));
  const htxt = hb.prompt ? fs.readFileSync(path.join(ws, hb.prompt), "utf8") : "";
  ok("frames crew: a heroes-<Label> brief points at that system and its frames folder", /design\/Bold\/frames\/open\.png/.test(htxt) && /--heroes/.test(htxt), htxt.slice(-400));
  const jb = J(C("brief", "--run", run, "--role", "frame-juror", "--key", "frames-1"));
  ok("frames crew: the frame juror's prompt carries refs, sheet and its ask", jb.prompt && /frames\.mjs" refs/.test(fs.readFileSync(path.join(ws, jb.prompt), "utf8")) && /Find the weakest frame first/.test(fs.readFileSync(path.join(ws, jb.prompt), "utf8")));
  let chk = C("check", "--run", run, "--role", "styleframe-designer", "--key", "frames");
  ok("frames crew: the designer's check refuses missing boards and a missing FRAMES.md", chk.status === 2 && /frames\/01\.png is missing/.test(chk.stdout) && /FRAMES\.md is missing/.test(chk.stdout), chk.stdout.slice(0, 300));
  if (hasFF) {
    const colors = ["0x223344", "0xddccbb", "0x885533", "0x3366aa", "0xeeeeee"];
    good.shots.forEach((s, i) => { png(path.join(run, "frames", `${s.id}.png`), colors[i]); fs.writeFileSync(path.join(run, "frames", `${s.id}.html`), `<!doctype html><div data-width="1920" data-height="1080" style="width:1920px;height:1080px;background:#${colors[i].slice(2)}"><h1 style="font:600 80px Arial">${s.hero}</h1></div>`); });
    fs.writeFileSync(path.join(run, "frames", "FRAMES.md"), "# Frames\n\n01 the giant line over the composer.\n\n## Revisions\n\n- 03: the tilt was 42 degrees and sheared the labels; dropped to 22 and moved the focus band onto the ticked row.\n");
    chk = C("check", "--run", run, "--role", "styleframe-designer", "--key", "frames");
    ok("frames crew: with every board rendered and the revisions written, the designer is accepted (the frame gate's findings come back as warnings)", chk.status === 0, chk.stdout.slice(0, 400));

    // refs: a brand-film still, a reference clip with no stills (frames are pulled), the showcases in words
    png(path.join(run, "brand-film", "1", "frame-001.jpg"), "0x112233", "640x360");
    png(path.join(run, "brand-film", "1", "sheet-1.jpg"), "0x112233", "640x360");
    fs.mkdirSync(path.join(run, "research", "films", "reference"), { recursive: true });
    spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10:duration=3", "-pix_fmt", "yuv420p", path.join(run, "research", "films", "reference", "clip.mp4")]);
    const rf = J(F("refs", "--run", run));
    ok("frames refs: brand-film stills (not its contact sheets), frames pulled from a reference clip, and the showcases in words", rf.ok && rf.by_origin && rf.by_origin["brand-film"] === 1 && rf.by_origin.reference >= 4 && rf.descriptions >= 3, JSON.stringify(rf).slice(0, 300));

    // the juror
    let jc = C("check", "--run", run, "--role", "frame-juror", "--key", "frames-1");
    ok("frames crew: the juror's check refuses a missing verdict", jc.status === 2 && /verdict/.test(jc.stdout), jc.stdout.slice(0, 200));
    const refImg = path.relative(run, path.join(run, "brand-film", "1", "frame-001.jpg"));
    wj(path.join(run, "frames", "verdict.json"), { round: 1, summary: "s", frames: good.shots.map((s, i) => ({ id: s.id, verdict: i === 2 ? "below" : "at-par", ref: { image: refImg, source: "brand film", why: "same kind" }, fixes: i === 2 ? ["make it better"] : [] })) });
    jc = C("check", "--run", run, "--role", "frame-juror", "--key", "frames-1");
    ok("frames crew: a below frame without a specific fix, and no side-by-side sheet, are refused", jc.status === 2 && /03 is below with no specific fix/.test(jc.stdout) && /side-by-side sheet/.test(jc.stdout), jc.stdout.slice(0, 400));
    const v = JSON.parse(fs.readFileSync(path.join(run, "frames", "verdict.json"), "utf8"));
    v.frames[2].fixes = ["drop the tilt from 38 to 22 degrees so the header stops shearing"];
    wj(path.join(run, "frames", "verdict.json"), v);
    const sh = spawnSync(process.execPath, [path.join(HERE, "frames.mjs"), "sheet", "--ours", path.join(run, "frames", "03.png"), "--refs", path.join(run, "brand-film", "1", "frame-001.jpg"), "--out", path.join(run, "frames", "sheets", "03.png")], { encoding: "utf8", cwd: ws, env: { ...env, RASANAI_FRAMES_NO_CHROME: "1" } });
    ok("frames sheet: ours next to a reference, drawn with ffmpeg when there is no browser", sh.status === 0 && fs.existsSync(path.join(run, "frames", "sheets", "03.png")) && J(sh).labels === false, sh.stdout + sh.stderr);
    jc = C("check", "--run", run, "--role", "frame-juror", "--key", "frames-1");
    ok("frames crew: a complete verdict with a sheet is accepted", jc.status === 0, jc.stdout.slice(0, 400));

    // the payload
    const pl = J(F("payload", "--run", run));
    const P0 = JSON.parse(fs.readFileSync(path.join(run, "styleframes.json"), "utf8"));
    ok("frames payload: frames with image, ref, shot and verdict; heroes; redo recommended when a frame is below; images/captions for older pages", pl.ok && P0.frames.length === 5 && P0.frames[2].verdict === "below" && P0.frames[0].ref && /frame-001\.jpg$/.test(P0.frames[0].ref.image) && P0.frames[1].shot.size === "ECU" && P0.heroes.join(",") === "01,03,05" && P0.recommended === "redo" && P0.images.length === 5, JSON.stringify(P0).slice(0, 400));

    // the score bound to the boards
    const scoreF = path.join(run, "motion", "score.json");
    const scenes = good.shots.map((s, i) => ({ n: i + 1, id: s.beat, start: i * 6, end: i * 6 + 6, duration: 6, board: `frames/${s.id}.png`, size: s.size, hero: s.hero, shots: [{ t0: 0, t1: 6, on_screen: "x", moves: "y" }] }));
    wj(scoreF, { spine: "s", seams: [], scenes });
    let m = J(C("check", "--run", run, "--role", "motion-director", "--key", "score"));
    ok("frames score: beats that copy their boards raise no board finding", !(m.problems || []).some((x) => /board-/.test(x)) && !(m.warnings || []).some((x) => /board-missing|board-unbound/.test(x)), JSON.stringify(m).slice(0, 300));
    scenes[1].size = "WS"; scenes[2].hero = "a giant orb"; delete scenes[3].board;
    wj(scoreF, { spine: "s", seams: [], scenes });
    m = J(C("check", "--run", run, "--role", "motion-director", "--key", "score"));
    ok("frames score: a beat that changes its board's size or hero is board-contradiction; a beat with no board warns board-missing", (m.problems || []).some((x) => /board-contradiction: beat b02 is WS/.test(x)) && (m.problems || []).some((x) => /board-contradiction: beat b03's hero/.test(x)) && (m.warnings || []).some((x) => /board-missing: beat b04/.test(x)), JSON.stringify(m).slice(0, 500));
    wj(scoreF, { spine: "s", seams: [], scenes, deviations: [{ beat: "b02", field: "size", why: "the carried composer needs the wide to land" }, { beat: "b03", field: "hero", why: "the orb is the carrier's state on this beat" }] });
    m = J(C("check", "--run", run, "--role", "motion-director", "--key", "score"));
    ok("frames score: a deviation with a reason accepts the change", !(m.problems || []).some((x) => /board-contradiction/.test(x)), JSON.stringify(m.problems || []).slice(0, 300));

    // match: the draft at each board's peak
    const list = path.join(run, "concat.txt");
    fs.writeFileSync(list, good.shots.map((s) => `file '${path.join(run, "frames", `${s.id}.png`)}'\nduration 6`).join("\n") + `\nfile '${path.join(run, "frames", "05.png")}'\n`);
    const vid = path.join(run, "draft.mp4");
    spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-vf", "fps=10,scale=320:180,format=yuv420p", vid]);
    wj(scoreF, { spine: "s", seams: [], scenes: scenes.map((s, i) => ({ ...s, board: `frames/${good.shots[i].id}.png` })) });
    const mt = spawnSync(process.execPath, [path.join(HERE, "frames.mjs"), "match", "--run", run, "--video", vid], { encoding: "utf8", cwd: ws, env: { ...env, RASANAI_FRAMES_NO_CHROME: "1" } });
    const mj = J(mt);
    ok("frames match: the draft at each board's peak next to the board, with SSIM (a draft that is the boards scores high)", mt.status === 0 && mj.frames && mj.frames.length === 5 && mj.frames.every((f) => f.ssim != null && f.ssim > 0.9) && fs.existsSync(path.join(run, "frames", "match.png")), (mt.stdout + mt.stderr).slice(0, 400));
  } else console.log("note  frames: ffmpeg is not installed, the board, refs, sheet, match and payload cases are skipped");

  // ---------------------------------------------------------------- the console: redo and a note on a frame, headless
  const crun = path.join(tmp, "frames-console");
  fs.mkdirSync(crun, { recursive: true });
  const H = { ...env, RASANAI_CONSOLE_HEADLESS: "1" };
  const cs = (...a) => spawnSync(process.execPath, [path.join(HERE, "console.mjs"), ...a], { encoding: "utf8", env: H, cwd: tmp, timeout: 30000 });
  cs("push", "--run", crun, "--step", "styleframes", "--data", JSON.stringify({ frames: [{ id: "01", title: "One inbox", image: null }, { id: "02", title: "Send", image: null }], heroes: ["01"] }));
  fs.appendFileSync(path.join(crun, "actions.jsonl"), JSON.stringify({ id: "rd1", ts: "2026-10-11T00:00:00.000Z", step: "styleframes", type: "redo", value: { ids: ["02"], note: "bigger type" }, note: "", source: "console" }) + "\n" + JSON.stringify({ id: "cm1", ts: "2026-10-11T00:00:01.000Z", step: "styleframes", type: "comment", value: { scene: "01", t: null, x: null, y: null, scope: "scene" }, note: "warmer light", source: "console" }) + "\n");
  const w1 = J(cs("wait", "--run", crun, "--timeout", "5"));
  const w2 = J(cs("wait", "--run", crun, "--timeout", "5"));
  const st = JSON.parse(fs.readFileSync(path.join(crun, "session.json"), "utf8"));
  ok("frames console: redo {ids, note} and a note on a frame arrive through wait; the feed names the frames, the note lands in the thread and as an open note", w1.type === "redo" && w1.value.ids[0] === "02" && w2.type === "comment" && st.activity.some((a) => /asked to redo the style frames: frame 02/.test(a.msg)) && (st.steps.styleframes.thread || []).some((t) => t.text === "bigger type") && (st.comments || []).some((c) => c.scene === "01" && c.state === "open"), JSON.stringify({ w1, w2, act: st.activity.slice(-3) }).slice(0, 500));
}
