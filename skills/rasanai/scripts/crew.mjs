#!/usr/bin/env node
// The crew: RasanAI's agents. The Director (the main session) plans who works on a film, hands each member a
// self-contained brief (its role file + a Dispatch context naming every input and output on disk), and accepts
// the work only when its artifact checks out. Roles: agents/*.md. The system: references/crew.md.
//
//   node crew.mjs plan --run <run> --route <route> --subject "<name>" [--mode product|topic] [--url <url>] [--public]
//        [--local "<dir>,<dir>"] [--may-run] [--scenes N] [--length s] [--project videos/<name>] [--lean] [--model <id>]
//        [--sources <sources.json>]   (research.mjs sources: what the film is made FROM. The researchers are chosen by source kind, not by route; a footage spine adds the footage desk
//                                      (footage-audit, footage-log, selects) and the footage writers (paper edits) in place of the script writers, and turns product-first off)
//        [--brand "<name>"] [--kind launch|promo|brand] [--brand-film | --no-brand-film] [--pace fast] [--deep | --direct]
//        (films of 45 s or less and single-feature launches take the direct path: ONE film builder writes the whole film;
//         --deep, when the user asks for it or for looks, keeps the long path with parallel scene animators)
//        (every scene route but a song designs its film as pictures before the score, references/styleframes.md: the phases styleframes
//         (styleframe-designer key frames on a direct film; key heroes + frame-designer boards on a long one), style-match-boards (branded),
//         frames-jury (frame-juror frames-1) and styleframes-call (a branded direct film: the Look call) or styleframes-show; three-system
//         looks add look-heroes (styleframe-designer heroes-<Label>); --lean: the Director draws them, same files and checks)
//        (a branded launch / promo / brand film adds the brand-film phase: brandfilm.mjs + the brand film analyst, and the style-match gates;
//        a scripted film, on the direct path too, adds the Moves pass between the story and the editor: the phases moves (a move-inventor per script), moves-jury
//        (the move-juror) and moves-roughs (a move-sketcher per script), run with scripts/moves.mjs; check holds the score to story/moves.json;
//        the film builder (direct) or the scene animators (long) get the hero cards and roughs as their motion target)
//        -> <run>/crew/plan.json: every phase, who's dispatched in it (role, key, model tier, description)
//   node crew.mjs brief --run <run> --role <role> [--key <k>] [--project <dir>] [--set k=v,...] [--model <id>]
//   node crew.mjs model [--model <id>] [--kv]   -> the model and harness, its profile, strengths and pitfalls (--kv: MODEL= / HARNESS= lines)
//        -> <run>/crew/prompts/<role>[-<key>].md, the whole prompt (dispatch it as "Read <file> and do the job")
//   node crew.mjs check --run <run> --role <role> [--key <k>] [--project <dir>]
//        -> exit 0 accepted · 2 problems (listed) · 1 could not check
//        (the score role also warns: music-arc-missing / music-arc-order (score.music_arc), seam-unsounded, mechanics-thin (a one-trick film: 2 or fewer mechanics over 4+ lines),
//         flat-type (score.type_scale { small_px, large_px }), no-punctuation (a hard cut on the pain-to-meet or payoff seam); flat-3d-style honours the card's `Depth blur:` line)
//        layers-thin (a showcase-grammar film whose median shots[].layers is under 4); the film-builder role warns no-pose-board / hero-not-stripped (hero moves in score.moves);
//        the art-director role runs art.mjs check (the assets, one style, the shows mapped to assets) and wants art/ART.md)
//   node crew.mjs ab --run <run> --a <previous.mp4> --b <new.mp4> [--plan <score.json>] [--seed <s>] [--n <k>]
//        -> the blind A/B: shuffles the two renders into X / Y (seeded; the order is recorded in crew/ab-<k>.json and is NOT in the juror's
//           brief), draws crew/ab-<k>/strips/ (rows.png: X left, Y right, the same seconds, the endings last; phone-X.png, phone-Y.png) and writes
//           the brief for the ab-juror (crew/prompts/ab-juror-<k>.md). crew.mjs check --role ab-juror [--key <k>] reads the verdict, maps it back and
//           prints "result": "keep" (the new version won) or "revert" (it lost: go back to the previous version's state; keep only fixes that do not lose).
//           The retrospective role (after delivery) proposes at most 2 craft rules; check prints the lessons.mjs add --source self lines to record
//   node crew.mjs thumbs --run <run> [--out <sheet.png>] [--cols 4]
//        -> the thumbnail board (story/thumbs/sheet.png + thumbs.json): ONE rough thumbnail per beat of story/intent.json, laid out as one sheet with each beat's
//           `buys` (relation, importance, seconds, the peak and the rests) under it. A thumbnail is what already exists, cheapest first: the beat's styleframe board
//           (frames/<id>.png), a hand-dropped story/thumbs/<NN>.png, else a grey box with the thing to read. Runs after the script editor, BEFORE the music fit and
//           the score; the structure-critic (agents/structure-critic.md) reads only this sheet + intent.json and may cut, merge, move, add a rest or rewrite a buys:
//           crew.mjs check --role structure-critic applies those edits to story/intent.json, story/chosen.json (and scenes.json when it exists)
//   node crew.mjs status --run <run>          -> every planned dispatch and where it stands (resume after compaction)
//   node crew.mjs pitches --run <run>         -> merges story/pitch-*.json into story/pitches.json (Sure, Bold, Wild)
//   node crew.mjs storyboard --run <run> --project <dir> [--score <score.json>]
//        -> writes the Motion Director's score into the project's STORYBOARD.md as the workflow's visual design
//           (## Video direction, per frame: shot sequence, blueprint, focal, roles, sfx, handoffs, transition_in)
//   node crew.mjs strip (--file <composition.html | video.mp4> | --project <dir>) (--at t1,t2 | --from a --to b --fps n)
//        --out <sheet.png> [--cols 6] [--phone]
//        -> a labelled contact strip of the motion at those times (+ the frames in <sheet>/), to look at;
//           --phone draws each frame 360 px wide (the film on a phone held upright: can every line be read?)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { parseArgs, die, readJSON, writeFile, chromeScreenshot, esc, GSAP_PATH, SKILL_DIR } from "./lib/common.mjs";
import { lessonsBlock } from "./lessons.mjs";
import { readLessons, AREAS as LESSON_AREAS, KINDS as LESSON_KINDS } from "./lessons.mjs";
import { recentFilms } from "./memory.mjs";
import { shapeProblems, tooClose, shapeLine, SHAPE_VOCAB, ASPECTS, MIN_DIFFER, RECENT } from "./lib/film-shape.mjs";
import { readBudget, checkBudget } from "./lib/budget.mjs";
import { readDesignMd } from "./lib/design-md.mjs";
import { findSkill } from "./lib/hyperframes.mjs";
import { upsertMarked } from "./lib/install.mjs";
import { track } from "./lib/report.mjs";
import { detectModel, profileFor, adapt, tierFor, dispatchFor } from "./lib/models.mjs";
import { libraryIds } from "./library.mjs";
import { readLogos } from "./lib/logos.mjs";
import { readSources, isFootageLed, desksFor } from "./lib/sources.mjs";
import { checkLog, checkSelects, checkPaper } from "./lib/footage-lib.mjs";
import { checkSystemFull, checkSystems, firstLine } from "./lib/system.mjs";
import { readRunGrammar, hasGrammarLibrary, checkScoreGrammar, techniquesNamed } from "./lib/grammar-lib.mjs";
import { pitchShape, validateMoves, validateVerdict, validateSet, isLabelOnly, MOVE_LABELS } from "./lib/moves-lib.mjs";
import { readShots, checkShots, boardFiles, checkVerdict, collectRefs, boardFor, heroesAgree } from "./lib/frames-lib.mjs";
import { loadIntent, validateIntent, applyEdits, applyToScript, readSeconds } from "./lib/intent.mjs";
import { budgetChecks, intentBeats } from "./lib/emphasis.mjs";
import { cameraKind } from "./lib/camera-moves.mjs";

const args = parseArgs();
const cmd = args._[0];
track(
  { plan: "Planning the crew for this film", strip: "Rendering a motion strip to look at", storyboard: "Writing the motion score into the storyboard" }[cmd],
  { plan: "Crew planned", strip: "Motion strip ready", storyboard: "Score written into the storyboard" }[cmd]
);
const AGENTS = path.join(SKILL_DIR, "agents");
// the model that runs the members: --model, else what plan recorded, else what the harness reports. The prompts adapt to it.
const modelOf = (plan) => { const d = detectModel(); const id = (args.model && args.model !== true ? String(args.model) : null) || (plan && plan.model) || d.model; return profileFor(id, d.harness); };
const WS = process.cwd();
// paths are shown relative to the workspace; real paths, so /var and /private/var (or any symlink) agree
const real = (p) => {
  let q = path.resolve(p), tail = [];
  while (!fs.existsSync(q) && path.dirname(q) !== q) { tail.unshift(path.basename(q)); q = path.dirname(q); }
  try { q = fs.realpathSync(q); } catch {}
  return path.join(q, ...tail);
};
const str = (v) => (v == null || v === true ? "" : String(v));
const out = (o, code = 0) => {
  console.log(JSON.stringify(o, null, 2));
  process.exit(code);
};
const rel = (p) => path.relative(real(WS), real(p)) || ".";
const exists = (p) => !!p && fs.existsSync(p);
const readMaybe = (p) => (exists(p) ? fs.readFileSync(p, "utf8") : "");
const jsonMaybe = (p) => {
  try {
    return exists(p) ? readJSON(p) : null;
  } catch {
    return undefined; // present but malformed
  }
};

function runDir() {
  if (!args.run || args.run === true) die("--run <run dir> required");
  const d = path.resolve(String(args.run));
  if (!fs.existsSync(d)) die(`run dir not found: ${d}`);
  return d;
}
const R = (run, ...p) => path.join(run, ...p);

// ---------------------------------------------------------------- roles
// tier: "inherit" = the session's own model (creative and judging work: never downgrade);
//       "fast" = a faster model is fine (gathering), when the harness lets you choose.
const ROLES = {
  "product-researcher": { desk: "research", tier: "fast", desc: (p) => `Researching ${p.subject || "the product"}: features, releases, real numbers` },
  "brand-researcher": { desk: "research", tier: "fast", desc: (p) => `Finding ${p.subject || "the brand"}'s real logo, colours, type and motion` },
  "screens-researcher": { desk: "research", tier: "fast", desc: (p) => `Collecting real screens of ${p.subject || "the product"}` },
  "precedent-researcher": { desk: "research", tier: "inherit", desc: (p) => `Studying ${p.subject || "the brand"}'s past launch films shot by shot` },
  "local-scout": { desk: "research", tier: "fast", desc: (p, k) => `Reading the local project${k ? ` ${k}` : ""} you approved` },
  "design-researcher": { desk: "design", tier: "inherit", desc: (p) => `Researching ${p.subject || "the subject"}'s visual world and the library references that fit` },
  "design-system-designer": { desk: "design", tier: "inherit", desc: (p, k) => `Designing the ${k || ""} design system for this story`.replace("  ", " ") },
  "research-lead": { desk: "research", tier: "inherit", desc: () => "Merging the research into one truth sheet" },
  "script-writer": { desk: "story", tier: "inherit", desc: (p, k) => `Writing the ${k || ""} script`.replace("  ", " ") },
  "treatment-writer": { desk: "story", tier: "inherit", desc: (p, k) => `Writing the ${k || ""} treatment for the song`.replace("  ", " ") },
  "visual-writer": { desk: "story", tier: "inherit", desc: (p, k) => `Writing the ${k || ""} visual treatment of the talk`.replace("  ", " ") },
  "move-inventor": { desk: "story", tier: "inherit", desc: (p, k) => `Inventing the hero moves for the ${k || ""} script`.replace("  ", " ") },
  "move-juror": { desk: "story", tier: "fast", desc: () => "Judging every move idea blind and ranking the best" },
  "move-sketcher": { desk: "story", tier: "fast", desc: (p, k) => `Sketching the ${k || ""} script's hero move as a rough`.replace("  ", " ") },
  "script-editor": { desk: "story", tier: "inherit", desc: () => "Editing the three scripts like a hostile reader" },
  "structure-critic": { desk: "story", tier: "inherit", desc: () => "Reading the thumbnail sheet and the intent, and cutting what buys nothing" },
  "motion-director": { desk: "motion", tier: "inherit", desc: (p, k) => (k === "seams" ? "Checking every cut and building the signature transition" : "Scoring how the whole film moves") },
  "art-director": { desk: "art", tier: "inherit", desc: () => "Making the film's pictures: one consistent world of illustrations, icons, cut-outs, line art and handwriting" },
  "frame-designer": { desk: "art", tier: "inherit", desc: (p, k) => `Designing the boards ${k || ""}, bound to the hero styleframes`.replace("  ", " ") },
  "styleframe-designer": { desk: "art", tier: "inherit", desc: (p, k) => (String(k || "").startsWith("heroes-") ? `Drawing the ${String(k).slice(7)} look's three hero styleframes on this story` : k === "heroes" ? "Designing the shot list and the three hero styleframes" : "Designing the film as pictures: a shot list, three hero styleframes and a board per beat") },
  "ab-juror": { desk: "review", tier: "inherit", desc: (p, k) => `Judging two films blind (X or Y) and picking the one to show${k ? ` (A/B ${k})` : ""}` },
  retrospective: { desk: "review", tier: "inherit", desc: () => "Reading how the film was made and keeping at most two craft rules for the next one" },
  "frame-juror": { desk: "review", tier: "inherit", desc: () => "Judging every styleframe next to reference stills of the same kind" },
  "scene-animator": { desk: "animation", tier: "inherit", desc: (p, k) => `Animating scene ${k}` },
  "film-builder": { desk: "animation", tier: "inherit", desc: (p, k) => (k === "lead" ? "Building the root and every object that crosses a cut" : "Building the whole film in one pass, root and every beat") },
  "footage-logger": { desk: "research", tier: "fast", desc: (p, k) => `Logging ${k ? "bin " + k : "the footage"}: every shot described, rated and trimmed` },
  "selects-producer": { desk: "research", tier: "inherit", desc: () => "Finding the bites, the moments and the story in the footage" },
  "footage-writer": { desk: "story", tier: "inherit", desc: (p, k) => `Writing the ${k || ""} paper edit from the footage`.replace("  ", " ") },
  "brand-kit-builder": { desk: "research", tier: "fast", desc: (p) => `Reading ${p.subject || "the brand"}'s own guidelines, fonts and logos into a design system` },
  "brand-film-analyst": { desk: "research", tier: "fast", desc: (p) => `Reading ${p.subject || p.brand || "the brand"}'s own films and writing down its film style` },
  "concept-critic": { desk: "story", tier: "fast", desc: () => "Scoring the chosen script and look against the literal brief, before any expensive work" },
  critic: { desk: "review", tier: "inherit", desc: (p, k) => `Reviewing the ${String(k || "film").split("-")[0]} with fresh eyes` },
};

// ---------------------------------------------------------------- plan
const STORY_ROUTES = new Set(["product-launch-video", "faceless-explainer", "pr-to-video", "general-video", "reel", "music-to-video"]);
const SCENE_ROUTES = new Set(["product-launch-video", "faceless-explainer", "pr-to-video", "general-video", "music-to-video"]);

// The direct path: ONE builder writes the whole film (root and every beat) in one pass. It applies to films of 45 s or less
// and to every single-feature launch or promo (a launch film is about one feature: references/product-first.md); lyric
// videos, presenter films and reels keep their own shapes. --deep (the user asked for "deep" or "show me looks") forces the
// long path; --direct forces this one.
const DIRECT_ROUTES = new Set(["product-launch-video", "faceless-explainer", "pr-to-video", "general-video"]);
function directFilm(p, prev = {}, run = null) {
  if (args.deep) return false;
  if (args.direct) return true;
  if (!DIRECT_ROUTES.has(p.route)) return false;
  if (prev.direct != null && !args.length && !args.kind) return !!prev.direct;
  const len = p.length || (run ? Number(brief(run).length_s) || null : null);
  if (len) return len <= 45;
  return p.route === "product-launch-video" || /launch|promo|feature/i.test(String(p.kind || (run ? brief(run).kind : "") || ""));
}

// Who researches, by what the film is made FROM (references/sources.md), not by route. Local scouts are dispatched per approved folder (p.local), never here.
function sourceResearch(p, d, lean) {
  const src = p.sources;
  const out = [];
  const kinds = new Set((src.sources || []).map((s) => s.kind));
  for (const dk of desksFor(src)) for (const r of dk.roles) {
    if (r === "product-researcher") { out.push(d("product-researcher", null, p.direct ? { screens: true } : {})); if (!p.direct) { out.push(d("screens-researcher")); if (p.public && !lean && !p.brand_film) out.push(d("precedent-researcher")); } }
    else if (r === "product-researcher:topic") out.push(d("product-researcher", null, { mode: "topic" }));
    else if (r === "product-researcher:document") out.push(d("product-researcher", null, { mode: "document", documents: (src.sources || []).filter((s) => s.kind === "document").map((s) => s.path) }));
    else if (r === "brand-kit-builder") { out.push(d("brand-kit-builder", null, { kit_paths: (src.sources || []).filter((s) => s.kind === "assets").map((s) => s.path), ...(kinds.has("web") ? { verify_url: ((src.sources || []).find((s) => s.kind === "web") || {}).url, note: "the user's kit wins: report drift from the live site as needs_from_user, never override it" } : {}) })); }
    else if (r === "brand-researcher") out.push(d("brand-researcher"));
  }
  return out;
}

function planCrew(p) {
  const d = (role, key = null, extra = {}) => ({ role, key, tier: ROLES[role].tier, background: true, description: ROLES[role].desc(p, key), ...extra });
  const phases = [];
  const lean = !!p.lean;
  const N = p.scenes || null;
  const research = [];
  const footageSp = !!(p.sources && isFootageLed(p.sources));
  if (p.sources) research.push(...sourceResearch(p, d, lean));
  else if (["product-launch-video", "general-video", "motion-graphics"].includes(p.route) && p.mode !== "topic") {
    // a direct film (45 s or less, a single-feature launch) researches only the product (and its one feature's real
    // screens) and the brand, plus the brand's own film when it has one: nothing a one-builder film doesn't use
    if (p.direct) research.push(d("product-researcher", null, { screens: true }), d("brand-researcher"));
    else {
      research.push(d("product-researcher"), d("brand-researcher"), d("screens-researcher"));
      // a branded launch film studies the brand's own films in the brand-film phase instead (faster, and it is the look)
      if (p.public && !lean && !p.brand_film) research.push(d("precedent-researcher"));
    }
  } else if (p.route === "faceless-explainer" || p.mode === "topic") {
    research.push(d("product-researcher", null, { mode: "topic" }));
    if (!lean) research.push(d("precedent-researcher"));
  } else if (p.route === "pr-to-video") {
    research.push(d("product-researcher"));
  } else if (p.route === "music-to-video") {
    // a song: precedent (the artist's and genre's visual conventions) only when the artist/brand has a public face
    if (p.public && !lean) research.push(d("precedent-researcher", null, { mode: "music" }));
  } else if (p.route === "presenter") {
    // the speech is the source; research only when it names a product or company worth getting right
    if (p.subject && p.public) research.push(d("product-researcher", null, { mode: "topic" }), d("brand-researcher"));
  } else if (p.subject && ["reel", "talking-head-recut", "embedded-captions"].includes(p.route) && p.public) {
    research.push(d("brand-researcher"));
  }
  for (const dir of p.local) research.push(d("local-scout", path.basename(dir), { approved_paths: [dir], may_run: !!p.may_run }));
  const bf = !!p.brand_film;
  // the design desk: the subject's visual world is researched during the Brief, in parallel with the research desk
  // A branded launch / promo / brand film takes its look from the brand's own film (the brand-film phase), so the
  // outside-reference design researcher would only spend time: skip it there.
  // a direct film with a brand takes the brand's own look (no Look desk), so it needs no design research either
  const brandLook = !!(p.direct && (p.branded || bf) && DIRECT_ROUTES.has(p.route));
  if (!bf && !brandLook) phases.push({ phase: "design-research", when: "right after the brief is pushed, in parallel with the research members (it needs only the subject)", dispatch: [d("design-researcher")], then: "design.mjs / crew.mjs check; the design-system designers wait for it and for the chosen story" });
  if (footageSp) {
    // the footage desk (references/sources.md): the Director runs the scripts, loggers log each bin in parallel, one selects producer finds the story in what exists
    phases.push({ phase: "footage-audit", when: "right after the brief is pushed, in parallel with the research desk (the source is the user's rushes: the script is written last, from what was shot)", dispatch: [],
      director_steps: ["footage.mjs ingest --footage <dirs> --run <run> [--proxy 720]", "footage.mjs shots --run <run>   (look at the strips)", "footage.mjs vision --run <run>   (optional: macOS Apple Vision; skipped with a note elsewhere)", "footage.mjs transcribe --run <run> [--lang <iso>] [--names names.txt]   (the language is detected, never defaulted: a missing multilingual model is reported, ask before downloading it)", "footage.mjs bites --run <run>", "console ask: names and titles, people on camera, what must not be shown (footage/approvals.json)"],
      then: "re-run crew.mjs plan --sources so the loggers get their bins" });
    phases.push({ phase: "footage-log", when: "after the footage audit: one logger per bin, in parallel", dispatch: (p.bins && p.bins.length ? p.bins : ["<bin>"]).map((b) => d("footage-logger", b)), then: "crew.mjs check on each, then footage.mjs merge-log and footage.mjs check-log" });
    phases.push({ phase: "selects", when: "after every bin is logged", dispatch: [d("selects-producer")], then: "crew.mjs check, then the research lead" });
  }
  if (research.length) phases.push({ phase: "research", when: "right after the brief is pushed, while the user reads it", dispatch: research, then: footageSp ? "research-lead once every member above and the selects are accepted" : "research-lead once every member above is accepted" });
  if (research.length || footageSp) phases.push({ phase: "research-lead", when: footageSp ? "after the research desk and the selects" : "after the research desk", dispatch: [d("research-lead")], then: footageSp ? "the footage writers (a Material section in the truth sheet: gold moments, the strongest bites, the people, the gaps)" : "story.mjs pick on the truth sheet" });
  if (bf) {
    phases.push({
      phase: "brand-film", when: "right after the brief is pushed, in parallel with the research desk (a branded launch / promo / brand film: references/launch-film.md section 3). The Director first runs brandfilm.mjs: find (the brand's official films; the user's attached video is the PRIMARY source and skips find), fetch (at most 2 films, 720p), frames, measure, card, all into <run>/brand-film/; no film found: fall back to the brand's website and product screenshots as the frames and say so. At most ~3 minutes on Fast pace",
      director_steps: ["brandfilm.mjs find --brand <b> --product <p> --out <run>/brand-film/find", "brandfilm.mjs fetch --url <u> | --file <attached> --out <run>/brand-film/<n>   (top 1-2; the attached file first)", "brandfilm.mjs frames --in <video> --out <run>/brand-film/<n>", "brandfilm.mjs measure --in <video> --out <run>/brand-film/grammar.json", "brandfilm.mjs card --dir <run>/brand-film --brand <b>"],
      dispatch: [d("brand-film-analyst")], then: "crew.mjs check, set decisions.film_style, push the `brand` step with the card (what the brand's film looks like, in the user's words); the design systems and the script wait for it",
    });
  }
  if (p.route === "music-to-video") {
    // lyrics.mjs align + audio come first (music/lyrics.json, music/audio.json); three treatments replace three scripts
    phases.push({ phase: "treatments", when: "after lyrics.mjs align + audio have written music/lyrics.json and music/audio.json (and the precedent, when it ran)", dispatch: ["Sure", "Bold", "Wild"].map((k) => d("treatment-writer", k)), then: "treatment.mjs check on each (crew.mjs check --role treatment-writer), then push story from the three TREATMENT-<label>.md; the chosen one is copied to story/chosen-treatment.json" });
  } else if (p.route === "presenter") {
    phases.push({ phase: "visual-writers", when: "after the clip is keyed (presenter.mjs key) and transcribed (reel.mjs scan), beats.json is written (presenter.mjs beats) and the research, when it ran, is accepted", dispatch: ["Sure", "Bold", "Wild"].map((k) => d("visual-writer", k)), then: "presenter.mjs check on each (crew.mjs check --role visual-writer), then push story from the three plans; the chosen one is copied to presenter/plan.json" });
  } else if (footageSp) {
    // a film cut from footage: the writers are editors. Three paper edits (Sure, Bold, Wild) from the same selects; no Moves pass (a lighter "joins" idea lives in the builders' briefs)
    phases.push({ phase: "story", when: "after the research lead and the selects are accepted", dispatch: ["Sure", "Bold", "Wild"].map((k) => d("footage-writer", k)), then: "footage.mjs check-paper on each (crew.mjs check --role footage-writer), then render each radio edit if you can and push story from the three paper edits" });
    phases.push({ phase: "story-edit", when: "after the three paper edits pass check-paper", dispatch: [d("script-editor")], then: "the editor reads each paper edit with a footage lens (does this bite really say that? is this the strongest hook in the material?); one round back to the writers, then push story" });
  } else if (STORY_ROUTES.has(p.route) && !lean) {
    phases.push({ phase: "story", when: "after story.mjs pick", dispatch: ["Sure", "Bold", "Wild"].map((k) => d("script-writer", k)), then: "crew.mjs pitches, story.mjs check, then the editor" });
    // the Moves pass (references/moves.md): ideas for how the film moves, invented and judged before the user reads the scripts
    if (!["reel", "music-to-video"].includes(p.route)) {
      phases.push({ phase: "moves", when: "after the three pitches pass story.mjs check", director_steps: ["moves.mjs pack --run <run> --label <Sure|Bold|Wild> [--product-first]   (once per script, before its inventor is briefed)"], dispatch: ["Sure", "Bold", "Wild"].map((k) => d("move-inventor", k)), then: "moves.mjs check on each (crew.mjs check --role move-inventor), then the move-juror, then a move-sketcher per script (moves.mjs rough + check-rough), then the editor" });
      phases.push({ phase: "moves-jury", when: "after the three moves files pass moves.mjs check", dispatch: [d("move-juror")], then: "moves.mjs check-verdict; a script with fewer than 3 passing cards gets one denial round (re-dispatch its inventor once with the failures added to its banned list)" });
      phases.push({ phase: "moves-roughs", when: "after the verdict is accepted", director_steps: ["moves.mjs rough --dir <run>/story/moves/<label>-<hero id> --aspect <the film's aspect>   (after each sketcher writes rough.html)", "moves.mjs check-rough --dir <run>/story/moves/<label>-<hero id>"], dispatch: ["Sure", "Bold", "Wild"].map((k) => d("move-sketcher", k)), then: "moves.mjs payload puts each script's carrier and hero moves on the Story screen; after the pick, moves.mjs choose --label <L> writes story/moves.json and moves.mjs record keeps the heroes for the next film" });
    }
    phases.push({ phase: "story-edit", when: STORY_ROUTES.has(p.route) && !["reel", "music-to-video"].includes(p.route) ? "after the moves pass (the three moves files, the verdict and the roughs are accepted)" : "after the three pitches pass story.mjs check", dispatch: [d("script-editor")], then: "route its notes back to the writers (one round), then push story" });
  }
  // The script editor is never skipped: a lean film has no writers to dispatch (the Director writes the three scripts), but its scripts are still read by the editor.
  const scripted = STORY_ROUTES.has(p.route) && !["reel", "music-to-video"].includes(p.route) && !footageSp;
  if (scripted && lean) {
    phases.push({ phase: "story", when: "after story.mjs pick: the Director writes the three scripts (lean: no script writers), each with story/intent-<Label>.json", dispatch: [], director_steps: ["write story/pitch-<Sure|Bold|Wild>.json and story/intent-<Sure|Bold|Wild>.json yourself (agents/script-writer.md, references/intent.md)", "crew.mjs pitches, story.mjs check, story.mjs intent --intent story/intent-<Label>.json"], then: "then the script editor: it is never skipped" });
    phases.push({ phase: "story-edit", when: "after the three pitches pass story.mjs check: the script editor runs on every scripted route, lean or not", dispatch: [d("script-editor")], then: "route its notes back (one round), then push story" });
  }
  // three bespoke design systems for the chosen story (a lyric video: one, from the chosen treatment's style bible)
  if (p.route === "music-to-video") {
    phases.push({ phase: "design-system", when: "after the treatment is chosen (the Look step is the treatment's style bible, built out by the desk)", dispatch: [d("design-system-designer", "<chosen label>", { mode: "bible" })], then: "design.mjs check-system, then design.mjs choose-system for that label; no Look picker" });
  } else if (brandLook) {
    phases.push({ phase: "look-auto", when: "after the story is chosen: a direct film with a brand has no three-system desk", dispatch: [], director_steps: ["the look is the brand's own: research/brand/DESIGN.md (or the workspace DESIGN.md)" + (bf ? " and brand-film/FILM-STYLE.md" : ""), "push look --status done with the reason (\"The brand's own look: <type, colours>; the motion comes from the picked moments\"): the Look call is decided, like any craft call", "motion-md.mjs write from the brand's motion, direction.mjs compile, and video-decisions look = {design_md, mode: \"brand\"}", "the user can still ask for looks (\"show me looks\"): re-plan with --deep"], then: "the concept gate" });
  } else {
    phases.push({ phase: "design-systems", when: p.route === "reel" || ["talking-head-recut", "embedded-captions"].includes(p.route) ? "after the story is chosen (a reel is Story -> Look -> Cut: the cards, overlays and captions are drawn before the cut is built) or after the brief (talking-head-recut, embedded-captions): three card / overlay / caption identities" : (bf ? "after the story is chosen (story/chosen.json) and the brand film card (brand-film/FILM-STYLE.md) is accepted" : "after the story is chosen (story/chosen.json) and design-research is accepted"), dispatch: ["Sure", "Bold", "Wild"].map((k) => d("design-system-designer", k)), then: "design.mjs check-systems (each valid and the three distinct" + (bf ? "; a branded look cites FILM-STYLE.md, uses the card's palette and type, and carries no outside references" : "") + "), then design.mjs look-payload and push the Look" });
    // picture-first (references/styleframes.md): on a scene route each system is shown by its 3 hero styleframes of this story
    if (DIRECT_ROUTES.has(p.route)) phases.push({ phase: "look-heroes", when: "after the three systems pass design.mjs check-systems, BEFORE the Look push: the user picks a look from its open, peak and end frames, not only from the specimen", dispatch: lean ? [] : ["Sure", "Bold", "Wild"].map((k) => d("styleframe-designer", `heroes-${k}`)), ...(lean ? { director_steps: ["draw the story's open, peak and end frames in each system yourself (agents/styleframe-designer.md, key heroes-<Label>): design/<Label>/frames/{open,peak,end}.html, design.mjs stills --dir design/<Label>/frames"] } : {}), then: "design.mjs look-payload (each style carries frames: its three hero PNGs), push the Look" });
  }
  if (p.route === "presenter") {
    phases.push({ phase: "animate-graphics", when: "after presenter.mjs build wrote the project and briefs/graphics/*.md (the plates are generated and approved)", dispatch: [d("scene-animator", "<beat>-<n>")], then: "one scene-animator per graphic brief (key b3-1 = beat b3, graphic 1) and per designed plate (key plate-p2), in parallel; then obey, slop and a draft render" });
    phases.push({ phase: "review", when: "after the graphics are in and the draft is rendered", dispatch: [d("critic", "motion-1"), d("critic", "film-1")], then: "route each finding to its graphic's animator or to the plate's prompt (2 rounds at most)" });
  }
  if (STORY_ROUTES.has(p.route) && !["music-to-video"].includes(p.route) && (p.route !== "reel" || footageSp)) {
    phases.push({ phase: "concept-gate", when: footageSp ? "after the paper edit and the look are chosen, BEFORE the cut is built: a quick Sonnet critic scores them against the literal brief with the footage questions (is the hook the strongest real moment? does every claim come from the material or the ledger? does the cut keep each speaker's meaning? is the brand kit obeyed?)" : "after the story and the look are chosen, BEFORE motion planning (the expensive work): a quick Sonnet critic scores the chosen script and look against the literal brief", dispatch: [d("concept-critic", "concept-1")], then: "ship: record it in decisions (console push --step concept) and go on; fix: rewrite the script (or the look) from its findings, re-run it once, then go on. Never start the score on a failing concept" });
  }
  // The thumbnail board (REBUILD 3): one rough thumbnail per beat on one sheet, with each beat's buys under it, judged BEFORE any timing locks and before the art,
  // the music fit and the score cost anything. The structure critic reads only the sheet and intent.json and is the one critic who may cut a beat.
  if (scripted && SCENE_ROUTES.has(p.route)) {
    phases.push({ phase: "thumbs", when: "after the story and the look are chosen, the script editor has passed and story/intent.json is the chosen script's: BEFORE the art, the music fit and the score (timings lock only after this)", director_steps: ["node scripts/story.mjs intent --intent <run>/story/intent.json --length <s>   (errors first)", "node scripts/crew.mjs thumbs --run <run>   (one thumbnail per beat + its buys, one sheet: story/thumbs/sheet.png)"], dispatch: [d("structure-critic", "structure-1")], then: "crew.mjs check --role structure-critic applies its cut / merge / move / rest / rewrite edits to intent.json, chosen.json and scenes.json (one round; a second only when it changed the peak); then re-run thumbs, fit the music from the durations (scenes.mjs --intent <intent.json> --retime), and go on to the art and the score" });
  }
  if (SCENE_ROUTES.has(p.route) && !lean) {
    phases.push({
      phase: "art", when: "after the story and the look are chosen and the concept gate passed, BEFORE the score (the pictures decide what the score can move): the art director reads the script's shows (built_from object or photo, and any show naming a drawn thing), the grammar and the look",
      dispatch: [d("art-director", "art")],
      then: "node scripts/art.mjs plan --run <run> (the agent edits art/plan.json: one prompt per picture, ONE style for all), art.mjs make (the first generated picture is the style anchor), cutout, treat, trace and hand as the plan says, a contact sheet of every asset, then art/ART.md. The Motion Director, film builder and scene animators get art/assets.json and ART.md as inputs. Image generation unavailable: the todo list is the answer (say so in ART.md), never stock images",
    });
  }
  // picture-first (references/styleframes.md): every scene route but a song designs its film as pictures before the score:
  // a shot list, 3 hero styleframes and a board per beat, judged next to reference stills, then animated between
  const boardGroups = () => {
    if (!N) return ["1-N"];
    const per = lean ? N : Math.max(2, Math.ceil(N / 5)), g = [];
    for (let i = 1; i <= N; i += per) g.push(`${i}-${Math.min(N, i + per - 1)}`);
    return g;
  };
  if (DIRECT_ROUTES.has(p.route)) {
    const sfWhen = lean ? "after the concept gate, BEFORE the music and the score" : "after the art department, BEFORE the music and the score (the score animates between the boards)";
    const sfSteps = ["node scripts/frames.mjs init --run <run>   (the frame kit, RasanCamera when the skill has it, a shots.json skeleton from the chosen script)", "node scripts/frames.mjs refs --run <run> --sheet   (the reference stills the run has)", "node scripts/frames.mjs shots-check --run <run>", "node scripts/design.mjs stills --dir <run>/frames --aspect <aspect>"];
    if (lean) phases.push({ phase: "styleframes", when: sfWhen, dispatch: [], director_steps: ["you design the styleframes yourself, the same files and checks (agents/styleframe-designer.md): frames/shots.json, 3 hero frames, a board per beat, frames/FRAMES.md", ...sfSteps, "frames.mjs sheet --ours <run>/frames --refs <stills of the same kind> --out <run>/frames/sheet.png: look at it and revise the weakest frame once"], then: "crew.mjs check --role styleframe-designer --key frames, then the music and the score" });
    else if (p.direct) phases.push({ phase: "styleframes", when: sfWhen, dispatch: [d("styleframe-designer", "frames")], director_steps: sfSteps.slice(0, 1), then: "crew.mjs check --role styleframe-designer --key frames, then the frame juror" });
    else {
      phases.push({ phase: "styleframes", when: sfWhen, dispatch: [d("styleframe-designer", "heroes")], director_steps: sfSteps.slice(0, 1), then: "crew.mjs check --role styleframe-designer --key heroes, then the boards" });
      phases.push({ phase: "boards", when: "after the shot list and the 3 hero styleframes are accepted: one board per beat, bound to the heroes", dispatch: boardGroups().map((g) => d("frame-designer", g)), then: "crew.mjs check each, then the frame juror" });
    }
    if (bf) phases.push({ phase: "style-match-boards", when: "after every board is rendered, BEFORE the frame juror and before any animation", dispatch: [], gate: "node scripts/brandfilm.mjs compare --ref <run>/brand-film/grammar.json --ours <run>/frames", then: "on FAIL fix the boards (re-dispatch the designer with the failed checks) and re-run; record the numbers in decisions (decisions.style_match.keyframes) and push a short note" });
    if (!lean) phases.push({ phase: "frames-jury", when: "after every board is rendered" + (bf ? " and the style-match gate passed" : ""), dispatch: [d("frame-juror", "frames-1")], then: "crew.mjs check --role frame-juror --key frames-1; below frames go back to their designer with the fixes once (frame-juror frames-2 judges them again; twice at most)" });
    if (brandLook) phases.push({ phase: "styleframes-call", when: "after the jury: on a branded direct film the Look call IS the styleframes call", dispatch: [], director_steps: ["node scripts/frames.mjs payload --run <run>", "console.mjs push --step styleframes --file <run>/styleframes.json, then wait", "approve -> close the step and go on; comment -> collect (scene = the frame id); redo {ids, note} -> the designer redoes those frames, the juror judges them again, re-push"], then: "the music, then the score from the approved boards" });
    else phases.push({ phase: "styleframes-show", when: "while the boards are designed and judged (not a call: the user watches them land)", dispatch: [], director_steps: ["node scripts/frames.mjs payload --run <run> after each board lands; console.mjs push --step styleframes --status working --file <run>/styleframes.json", "after the jury: push it --status done with the decision (how many at par, what was redone)"], then: "the music, then the score from the boards" });
  }
  if (SCENE_ROUTES.has(p.route) || p.route === "motion-graphics") {
    if (DIRECT_ROUTES.has(p.route)) phases.push({
      phase: "moments", when: "after the concept gate, before the score: the reference motion for each beat (references/craft.md, The take rule)", dispatch: [],
      director_steps: ["the user's picked moves win: rasanai-brief.json moments [{id, place?}] (up to 4; place is opening|between|peak|ending|anywhere, a legacy role maps to it)", "otherwise, once the story is chosen, pick 2 to 4 by mechanic fit to its beats (not one per role): node scripts/moments.mjs search --mechanic <tag> [--place <place>] [--query \"<words>\"]", "node scripts/moments.mjs fetch <id> --run <run> [--place <place>]   (each picked moment: sha256-checked, read-only under <run>/references/moments/<id>/, credited in credits.json)", "place each moment on the beat whose mechanic fits best (respecting its place): each beat's moment and one-sentence take, and moments_placed [{id, beat, take, why}] in motion/score.json (a move that fits no beat goes in moments_dropped with a reason)", "offline or nothing fits: --no-network uses the cache; with none, the library's own motion styles (library.mjs search --type motion), and say so in decisions"],
      then: "the Motion Director scores with the moments' takes (moment, take per beat); name each placement and its creator in the motion decision (\"Your 'Cursor clicks' move opens beat 1: its click-to-zoom builds the first ask\")",
    });
    phases.push({ phase: "score", when: p.route === "music-to-video" ? "after treatment.mjs scenes wrote scenes.json (plates against the real track; durations are the plate windows)" : "after the boards are approved and the music is fitted (scenes.json has final durations): the score animates between the boards", dispatch: [d("motion-director", "score")], then: p.direct ? "crew.mjs check (the plan, each beat bound to its board), then video.mjs write, crew.mjs storyboard and the film builder" : "crew.mjs check (each beat bound to its board), then video.mjs write, crew.mjs storyboard, the lead builder and the scene animators" });
    // a lyric video keeps its key frames after the score (its plates are fixed by the treatment; scene routes drew boards before the score)
    if (!DIRECT_ROUTES.has(p.route) && !p.direct) {
      phases.push({ phase: "keyframes", when: "after the score is accepted", dispatch: boardGroups().map((g) => d("frame-designer", g)), then: lean ? "push the animatic" : "the frames critic, then push the animatic" });
      if (!lean) phases.push({ phase: "keyframes-review", when: "after every key frame is rendered", dispatch: [d("critic", "frames-1")], then: "fix the high findings (re-dispatch the designer), then push the animatic" });
    }
    const scenes = N ? Array.from({ length: N }, (_, i) => String(i + 1)) : ["<n>"];
    if (p.direct) {
      // ONE author for a short film (45 s or less, or a single-feature launch): the film builder writes the root and every
      // beat in one pass, so objects carry across beats by construction. No parallel animators, no seam pass.
      phases.push({ phase: "build", when: "after the workflow's frame-packets.mjs and video.mjs inject (the plan is accepted)", dispatch: [d("film-builder", "film")], then: "motion-gate.mjs on the project, the draft render, motion-gate.mjs on the draft, then the animatic call on the draft" });
      phases.push({ phase: "animatic-draft", when: "after the first draft render passes the motion gate: the Animatic call shows the built film (the boards were approved before the score)", dispatch: [], director_steps: ["stills of the draft at each beat's midpoint (crew.mjs strip --file <draft.mp4> --at <midpoints>) as the scenes' thumbs", "push animatic with scenes [{id, title, line, visual, duration, thumb}], audio = the draft's own mix (or music.file = the bed) and video = <draft.mp4>", "notes come back by beat: route them to the film builder, re-render, re-run the gate; approve -> the critics and the Final"], then: "the critics on the approved draft" });
      const review = lean ? [d("critic", "film-1")] : [d("critic", "motion-1"), d("critic", "grounding-1")];
      phases.push({ phase: "review", when: "after the build and the draft render; motion-gate.mjs has run on the draft (a critic never judges without a render and the gate's report)", dispatch: review, then: "route each finding back to the film builder (2 rounds at most); film critic on the draft" });
    } else {
      // a longer film keeps parallel animators, but every object that crosses a seam belongs to the lead builder (one object
      // on one tween in the root), and the seam contract hands over a moving state (velocity, direction), never a pose at rest
      phases.push({ phase: "lead", when: "after the workflow's frame-packets.mjs and video.mjs inject, before the scene animators: the root, the ground and every carrier (an object that crosses a cut; story/moves.json's `carrier` is the one it builds first) on its own track", dispatch: [d("film-builder", "lead")], then: "the scene animators, who build around the carriers' landing rects" });
      phases.push({ phase: "animate", when: "after the lead builder's carriers are in", dispatch: scenes.map((k) => d("scene-animator", k)), then: "assemble, then the seam pass" });
      phases.push({ phase: "seams", when: "after every scene is accepted and the index is assembled", dispatch: [d("motion-director", "seams")], then: lean ? "the film critic" : "the motion critic" });
      const review = lean ? [d("critic", "film-1")] : [d("critic", "motion-1"), d("critic", "grounding-1")];
      phases.push({ phase: "review", when: "after the seam pass (motion, grounding) and the draft render (film); motion-gate.mjs has run on the draft", dispatch: review, then: "route each finding to its scene's animator (2 rounds at most); film critic on the draft" });
    }
    if (bf) phases.push({ phase: "style-match-draft", when: "after the first draft render, before the film critic", dispatch: [], gate: "node scripts/brandfilm.mjs compare --ref <run>/brand-film/grammar.json --ours <draft.mp4>", then: "on FAIL fix the failing scenes (colour, canvas, cut rate) and re-render; record the numbers in decisions (decisions.style_match.draft) and push the short note" });
    if (!lean) phases.push({ phase: "review-film", when: "after the draft render", dispatch: [d("critic", "film-1")], then: "fix or waive at the Final" });
  }
  if (footageSp && p.route === "reel") {
    // the reel's own build, after Story -> Look: the Director cuts from the chosen paper edit; cards and overlays are drawn by scene animators from reel.mjs briefs
    phases.push({ phase: "cut", when: "after the paper edit and the look are chosen and the concept gate passed", dispatch: [], director_steps: ["write reel.json from story/paper-<L>.json: the spine becomes segments on word boundaries, broll_map becomes the covering clips, graphics become cards and overlays, captions.on for speech, the music bed", "footage.mjs check-paper --run <run> --paper story/paper-<L>.json --length <s>", "reel.mjs briefs --reel <run>/reel.json --project-dir videos/<name>", "push reel (the Animatic: the rough cut, editable in/out points)"], then: "animate-graphics" });
    phases.push({ phase: "animate-graphics", when: "after reel.mjs briefs wrote compositions/cards/*.brief.md", dispatch: [d("scene-animator", "<card>")], then: "one scene-animator per card or overlay brief, in parallel; then reel.mjs build --render --quality draft (lint + obey)" });
    phases.push({ phase: "review", when: "after the draft render", dispatch: lean ? [d("critic", "film-1")] : [d("critic", "motion-1"), d("critic", "film-1")], then: "route each finding back (2 rounds at most); check by eye that every cut lands on a word boundary, every join is covered, every name is spelled as in footage/names.json" });
  }
  // every fix round after the first draft is accepted only after a blind A/B against the round before it; after delivery the film teaches the next
  if (SCENE_ROUTES.has(p.route) || p.route === "motion-graphics") phases.push({ phase: "stage3d-font", when: "before a beat sets BRAND TYPE in 3D (extruded text): only then", dispatch: [], director_steps: ["node scripts/stage3d.mjs font --project <dir> --family \"<Brand Font>\" --weight 700 (prints the staged font path)", "k.extrudeText(text, { font: \"<printed path>\" }) in the scene"], then: "the 3D type is the brand's own face, never a stand-in" });
  phases.push({ phase: "ab-review", when: "every fix round after the first draft, before the round is accepted", dispatch: [], director_steps: ["node scripts/fixcheck.mjs --before <the previous render> --after <this round's render> --touched <the notes' windows> (read regression_runs and diff_pngs: a leak into frames the round did not touch is fixed or explained)", "crew.mjs ab --run <run> --a <the previous render> --b <this round's render> --plan motion/score.json", "crew.mjs brief --role ab-juror --key <k> (dispatch it; it sees X and Y, never which is newer)", "crew.mjs check --role ab-juror --key <k> prints keep or revert; revert = back to the previous version's project state (git, or the .superseded copy), keep only fixes that do not lose, and log the lost round with --because"], then: "a lost round is reverted, never accepted" });
  phases.push({ phase: "retrospective", when: "at delivery, after the Final", dispatch: [d("retrospective")], then: "crew.mjs check --role retrospective prints the lessons.mjs add --source self lines (at most 2); run them" });
  return phases;
}

// ---------------------------------------------------------------- ledger
function ledger(run, row) {
  fs.mkdirSync(R(run, "crew"), { recursive: true });
  fs.appendFileSync(R(run, "crew", "ledger.jsonl"), JSON.stringify({ t: new Date().toISOString(), ...row }) + "\n");
}
function readLedger(run) {
  const f = R(run, "crew", "ledger.jsonl");
  if (!exists(f)) return [];
  return fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

// The brand's logo files travel into the build: research/brand/assets/* is copied (same bytes) to <project>/assets/brand/
// and named in DISPATCH.md, DIRECTION.md and BRIEF.md so every animator sees the exact path; "none" is said there too.
function stageLogos(run, pj) {
  const src = R(run, "research", "brand", "assets");
  if (!pj || !exists(path.join(src, "logos.json"))) return null;
  const lg = readLogos(src);
  const dest = path.join(pj, "assets", "brand");
  let lines;
  if (lg.state === "files" && !lg.problems.length) {
    fs.mkdirSync(dest, { recursive: true });
    fs.copyFileSync(path.join(src, "logos.json"), path.join(dest, "logos.json"));
    for (const e of lg.entries) fs.copyFileSync(e.abs, path.join(dest, path.basename(e.file)));
    lines = lg.entries.map((e) => `- \`${rel(path.join(dest, path.basename(e.file)))}\` (${e.kind}${e.colour_versions ? `; colour versions: ${[].concat(e.colour_versions).join(", ")}` : ""}; from ${e.source_url})`);
    lines.unshift("The brand's logo is **these files and nothing else**. Place one with an `<img>` (or `<image>`), unchanged; keep the brand's clear space and the right colour version for the background. Never draw, trace, approximate, recolour or generate a logo.");
  } else if (lg.state === "none" && !lg.problems.length) {
    lines = [`**No official logo file could be downloaded for this brand** (${lg.why.replace(/\s+/g, " ").trim()}). Set the brand name in the brand font and show **no symbol**: never draw, trace, approximate or generate a logo. Delete anything labelled logo, mark or symbol that is not type.`];
  } else return null;
  const mark = "<!-- rasanai:logos -->";
  const block = `${mark}\n## Logo files\n\n${lines.join("\n")}\n`;
  for (const f of [path.join(pj, "DISPATCH.md"), path.join(pj, "DIRECTION.md"), path.join(pj, "BRIEF.md")]) if (exists(f)) fs.writeFileSync(f, upsertMarked(fs.readFileSync(f, "utf8"), mark, block));
  return { state: lg.state, staged: lg.state === "files" ? lg.entries.map((e) => rel(path.join(dest, path.basename(e.file)))) : [], none: lg.state === "none" || undefined };
}

// ---------------------------------------------------------------- dispatch contexts
function projectDir(run) {
  if (args.project && args.project !== true) return path.resolve(String(args.project));
  const plan = jsonMaybe(R(run, "crew", "plan.json"));
  if (plan && plan.project) return path.resolve(plan.project);
  const vd = jsonMaybe(R(run, "video-decisions.json"));
  if (vd && vd.project) return path.resolve(vd.project);
  return null;
}
function lookFrame(run) {
  const dec = jsonMaybe(R(run, "decisions.json")) || {};
  const lk = dec.look || {};
  for (const c of [lk.frame, R(run, "preset", "frame.md"), R(run, "look", "frame.md")]) if (c && exists(path.resolve(c))) return path.resolve(c);
  return null;
}
function brief(run) {
  const b = jsonMaybe(R(run, "brief.json")) || {};
  const f = b.fields || b;
  return { length_s: f.length_s, kind: f.kind, aspect: f.aspect, narrated: !(f.narration === false || /^(none|no|off|false|silent|music only|no voiceover)$/i.test(String(f.narration ?? "").trim())), destination: f.destination, subject: f.subject, brand_name: f.brand_name, use_brand: f.use_brand, text: f.sentence || f.brief || f.text };
}
// A launch, promo or product film is PRODUCT-FIRST (references/product-first.md): the product UI from the first
// seconds, one hero moment, real uses, no conceit. The route product-launch-video is always one.
const PRODUCT_FIRST_KIND = /launch|promo|product|demo|reveal|feature|ad\b|advert|announce/i;
function productFirst(run, P) {
  // a film cut from footage has no "product UI within 3 s" to promise: the footage-first gate (story.mjs GF) takes its place (references/sources.md)
  { const pl = P && P.sources ? P : jsonMaybe(R(run, "crew", "plan.json")) || {}; if (pl.sources && isFootageLed(pl.sources)) return false; }
  if (P && P.route === "product-launch-video") return true;
  const dec = jsonMaybe(R(run, "decisions.json")) || {};
  if (dec.route === "product-launch-video") return true;
  const b = brief(run);
  return PRODUCT_FIRST_KIND.test(String(b.kind || "")) && !LYR(run, P) && !isPresenter(run, P);
}
// the brand lock: a named brand (brand_name / use_brand, or a brand DESIGN.md already chosen) means the brand step runs and every look stays inside it
function brandLocked(run) {
  const b = brief(run), dec = jsonMaybe(R(run, "decisions.json")) || {};
  if (b.use_brand === false || dec.use_brand === false) return false;
  return !!(b.brand_name || b.use_brand === true || dec.use_brand === true || dec.brand || exists(R(run, "research", "brand", "DESIGN.md")));
}
// a branded launch / promo / brand film: the brand's own film grammar (brandfilm.mjs card, <run>/brand-film/FILM-STYLE.md) is the look
function brandFilm(run, P) {
  if (LYR(run, P) || isPresenter(run, P)) return false;
  const pl = jsonMaybe(R(run, "crew", "plan.json")) || {};
  return !!((P && P.brand_film) || pl.brand_film || exists(R(run, "brand-film", "FILM-STYLE.json")));
}
// a lyric video: the music-to-video route, or a run that has word timings
const LYR = (run, P) => (P && P.route === "music-to-video") || exists(R(run, "music", "lyrics.json"));
// a presenter film: a keyed talking-head clip put into generated image worlds (references/presenter.md)
const isPresenter = (run, P) => (P && P.route === "presenter") || ((jsonMaybe(R(run, "crew", "plan.json")) || {}).route === "presenter") || ((jsonMaybe(R(run, "decisions.json")) || {}).route === "presenter") || exists(R(run, "presenter", "plan.json"));
const PRES_KEY = /^(b\d+-\d+|plate-[A-Za-z0-9_-]+)$/; // a presenter film's graphic (beat-n) or designed plate (plate-<id>)
const imagegenState = () => {
  if (process.env.RASANAI_IMAGEGEN === "off") return "off";
  try {
    const r = spawnSync(process.execPath, [path.join(SKILL_DIR, "scripts", "imagegen.mjs"), "status"], { encoding: "utf8", timeout: 8000, env: { ...process.env, RASANAI_QUIET: "1" } });
    return JSON.parse(r.stdout || "{}").state || "unknown";
  } catch {
    return "unknown";
  }
};
const chosenTreatment = (run) => jsonMaybe(R(run, "story", "chosen-treatment.json"));
const scenesOf = (run) => {
  const s = jsonMaybe(R(run, "scenes.json"));
  return s && Array.isArray(s.scenes) ? s.scenes : [];
};

// inputs: [label, path]; a missing input is listed as missing (the member works without it), never silently dropped
// the shows (library/showcases): a writer, a move inventor and the motion director read the README and two reference films chosen by film kind
function showcaseInputs(run, P, B) {
  const dir = path.join(SKILL_DIR, "library", "showcases");
  const kind = String(B.kind || "").toLowerCase();
  const pick = productFirst(run, P) || /launch|promo|product|ad\b/.test(kind) ? ["sovra-fm-launch", "kinso-launch"]
    : /brand/.test(kind) ? ["openai-refreshed", "google-ask-search-anything"]
    : /explain|essay|talk|topic/.test(kind) ? ["mexicat-upping-my-pdoom", "pixel-object-manifesto"]
    : ["sovra-fm-launch", "google-ask-search-anything"];
  return [["showcases: ten reference films line by line, with the ten principles (read first: every on-screen line needs a motion that means it)", path.join(dir, "README.md")], ...pick.map((id, i) => [`showcase ${i + 1} (a reference film, line by line)`, path.join(dir, `${id}.json`)])];
}
function contextFor(run, role, key, plan) {
  const pj = projectDir(run);
  const P = plan || {};
  const ctx = { RUN: rel(run), SKILL_DIR, WORKSPACE: WS, node: process.execPath, role, key, scratch: rel(R(run, "crew", "scratch", key ? `${role}-${key}` : role)) };
  const inputs = [];
  const outputs = [];
  const I = (label, p) => inputs.push([label, p]);
  const O = (p) => outputs.push(p);
  const research = (f) => R(run, "research", f);
  const capture = pj ? path.join(pj, "capture") : null;
  const B = brief(run);
  if (productFirst(run, P)) {
    ctx.product_first = "yes: a launch, promo or product film. Read references/product-first.md (the rules and the concept gate). The product UI is on screen within 3 s, one hero product moment, 2 to 4 real uses, short plain kinetic lines, the end line the largest type; no museums, allegories, invented worlds, extended metaphors or cover versions; show off through craft (motion, UI choreography, rhythm), never through concept.";
    if (role !== "film-builder") I("product-first rules (read all of it)", path.join(SKILL_DIR, "references", "product-first.md")); // the builder's BUILD.md carries what it needs
  }
  if (role !== "brand-film-analyst" && brandFilm(run, P)) {
    ctx.brand_film = "yes: a branded launch / promo / brand film. READ <run>/brand-film/FILM-STYLE.md FIRST: the brand's own film grammar (canvas, palette and shares, typefaces and type scale, layout, motif, motion vocabulary, photography, cut rate, transitions, end card) is the look. Sure = the card exactly; Bold and Wild = the same palette, type, motif and motion vocabulary, varying only composition, pacing and emphasis. No outside designers, directors, museum grammar or library references. The card locks palette, type, logo, UI fidelity and tone; never finish, depth, camera, shot size or colour content. Its \"Not seen\" effects are budgets, not bans (glow, overshoot, blur-in, particles...: 2 to 3 per film on the hero, each a score budget entry with a reason; uniform use is the error). The finish layer (tinted living ground, soft shadows, glass rims, a key light, grain, vignette, motion blur on fast moves) stays on unless the card's measured Finish line says Route: graphic; 3D takes the brand's palette and tone, the flat style (references/brand-film.md section 4, references/3d.md \"Brand-flat 3D\"). The story is simple and to the point: references/launch-film.md section 1 (hook with the product or brand in 1 to 3 s, reveal, 2 to 4 real demos, payoff line, end card; one idea and plain words per beat). The style-match gate (brandfilm.mjs compare) runs on the boards (frames/) and on the first draft.";
    if (role !== "film-builder") inputs.unshift(["launch-film rules: structure templates with timings, the grammar checklist, red flags (references/launch-film.md)", path.join(SKILL_DIR, "references", "launch-film.md")]);
    inputs.unshift(["measured grammar (numbers the style-match gate compares against)", R(run, "brand-film", "grammar.json")]);
    inputs.unshift(["FILM-STYLE.md: the brand film's own style card (READ FIRST; its palette, type, motif and motion vocabulary are law)", R(run, "brand-film", "FILM-STYLE.md")]);
  }
  if (brandLocked(run)) ctx.brand_lock = "yes: the brief names a brand. The brand's own type, colours, UI language and logo usage (research/brand/DESIGN.md, or the workspace DESIGN.md) are law in every look and every frame; variations are composition, motion and density only.";
  const dsn = (() => {
    try {
      const r = spawnSync(process.execPath, [path.join(SKILL_DIR, "scripts", "brand.mjs"), "detect"], { encoding: "utf8", env: { ...process.env, RASANAI_QUIET: "1" } });
      const j = JSON.parse(r.stdout || "{}");
      return j.found ? j.source || j.file || null : null;
    } catch {
      return null;
    }
  })();
  switch (role) {
    case "product-researcher":
      Object.assign(ctx, { subject: P.subject, url: P.url || null, kind: B.kind, focus: P.focus || null, mode: P.mode === "topic" || str(args.set).includes("mode=topic") ? "topic" : "product" });
      I("capture", capture);
      O(research("product.md")); O(research("product.claims.json"));
      if (P.direct && ctx.mode !== "topic") {
        // a direct film has no separate screens researcher: the product researcher also brings the ONE feature's real screens
        ctx.screens = "this is a direct film (one feature, one builder): there is no separate screens researcher. Find the ONE feature (the user's named one, else the newest launch, else the core surface), capture its own page, and save 4 to 8 real screens of that feature in use into research/screens/ with research/screens.json ([{path, source, what}]) and a short research/screens.md with a ## UI kit section (3 or more measured components) and ## Flows (the task, step by step, as cause and effect)";
        O(research("screens") + "/"); O(research("screens.json")); O(research("screens.md"));
      }
      break;
    case "brand-researcher":
      Object.assign(ctx, { subject: P.subject, url: P.url || null });
      I("capture", capture); I("workspace_design_md", dsn ? path.resolve(dsn) : null); I("local_notes", research("local.md"));
      O(research("brand", "DESIGN.md")); O(research("brand", "assets") + "/"); O(research("brand", "assets", "logos.json")); O(research("brand.md"));
      break;
    case "screens-researcher":
      Object.assign(ctx, { subject: P.subject, url: P.url || null, features: P.features || null });
      I("capture", capture); I("local_screens", research("local", "assets"));
      O(research("screens") + "/"); O(research("screens.json")); O(research("screens.md"));
      break;
    case "precedent-researcher":
      Object.assign(ctx, { subject: P.subject, kind: B.kind, brand_known: !!P.public, length_s: B.length_s });
      if (P.route === "music-to-video") ctx.focus = "the artist's and the genre's music and lyric videos: their visual conventions, shot by shot, to honour or break on purpose (not launch films)";
      O(research("films") + "/"); O(research("precedent.md"));
      break;
    case "local-scout": {
      const entry = ((P.phases || []).flatMap((ph) => ph.dispatch).find((x) => x.role === "local-scout" && x.key === key)) || {};
      const approved = entry.approved_paths || str(args.set).split(",").filter((s) => s.startsWith("path=")).map((s) => s.slice(5));
      Object.assign(ctx, { subject: P.subject, approved_paths: approved, may_run: !!entry.may_run });
      if (!approved.length) die("local-scout needs approved_paths (plan --local, after the user said yes in the console)");
      O(research("local.md")); O(research("local.claims.json")); O(research("local", "assets") + "/");
      break;
    }
    case "brand-film-analyst": {
      const bfd = R(run, "brand-film");
      Object.assign(ctx, { subject: P.subject || P.brand, brand: P.brand || P.subject, url: P.url || null, pace: P.pace || "normal", time_box: P.pace === "fast" ? "about 3 minutes in all; read at most 2 films" : "keep it brisk; at most 2 films", checklist: "canvas, palette and shares, typefaces and the type scale, layout and grid, signature motif, motion vocabulary (Seen / Not seen, allowed on a budget; never a ban list), the measured finish, photography or illustration, cut rate, transitions, end card (references/launch-film.md sections 3 and 4)" });
      I("the brand film folder (frames, contact sheets sheet-*.jpg/png, find.json, frames.json)", bfd);
      I("measured grammar", R(run, "brand-film", "grammar.json")); I("the card to fill (JSON slots + Markdown)", R(run, "brand-film", "FILM-STYLE.md"));
      I("launch-film rules (section 3 the grammar checklist, section 4 a worked card)", path.join(SKILL_DIR, "references", "launch-film.md"));
      I("brand notes (text research, if done)", research("brand.md")); I("workspace_design_md", dsn ? path.resolve(dsn) : null); I("capture (the fallback: website and product screenshots)", capture);
      O(R(run, "brand-film", "FILM-STYLE.md")); O(R(run, "brand-film", "FILM-STYLE.json"));
      break;
    }
    case "design-researcher":
      Object.assign(ctx, { subject: P.subject, url: P.url || null, kind: B.kind, mode: P.mode || "product", length_s: B.length_s, route: P.route });
      I("capture", capture); I("workspace_design_md", dsn ? path.resolve(dsn) : null); I("brand notes (if the brand researcher is done)", research("brand.md")); I("product notes (if done)", research("product.md"));
      I("library index (library.mjs search / show)", path.join(SKILL_DIR, "library", "index.json")); I("the desk's guide", path.join(SKILL_DIR, "references", "design-desk.md"));
      ctx.library = `node "${path.join(SKILL_DIR, "scripts", "library.mjs")}" search --q "<words>" [--space 3d] [--kind <kind>] | show <id> | index`;
      O(research("design.md")); O(research("design-refs.json"));
      break;
    case "design-system-designer": {
      if (!key) die("design-system-designer needs --key Sure|Bold|Wild (a lyric video: the chosen treatment's label)");
      const lyr = LYR(run, P);
      const stance = { sure: "Sure: the system that is most faithful to the subject's own visual world and the story, polished to a studio's standard. With a brand DESIGN.md, Sure IS the brand extended for motion (its colours, its type; you add the motion contract, the camera and the film's components).", bold: "Bold: push it. Keep the subject's world but break its category's conventions in palette, type and layout; a different display face and a different layout from the obvious. With a brand, keep the brand recognisable (its accent or its type) and push everything around it.", wild: "Wild: the system a top studio would put on its reel. One idea that no template has (an unexpected material, an era, a medium, a vernacular), still legible and on-brief for this story. With a brand, the brand's most distinctive trait carried into an unexpected world." }[String(key).toLowerCase()];
      Object.assign(ctx, { label: key, stance: lyr ? "the chosen treatment's style bible, built out as a complete design system (palette, type roles, signal motif, tone and bans are fixed by the treatment; you add everything a build needs)" : stance || "(Sure, Bold or Wild)", subject: P.subject, brief: B, depth: "decide from the story's visuals: where a beat wants real space (a reveal, the product as an object, a flat-to-depth seam) write a 3D camera grammar and a recipe.three hint" });
      if (lyr) ctx.lyric_video = true;
      const treat = key && jsonMaybe(R(run, "story", `treatment-${key}.json`));
      for (const [l, p] of [["design research", research("design.md")], ["design references (ids)", research("design-refs.json")], ["chosen story", R(run, "story", "chosen.json")], ["chosen treatment", R(run, "story", "chosen-treatment.json")], ["treatment in words", R(run, "story", `TREATMENT-${key}.md`)], ["truth", R(run, "story", "truth.md")], ["briefing", research("BRIEFING.md")], ["brand notes", research("brand.md")], ["brand DESIGN.md (research)", research("brand", "DESIGN.md")], ["workspace DESIGN.md", dsn ? path.resolve(dsn) : null], ["screens", research("screens.md")], ["precedent", research("precedent.md")], ["the desk's guide (formats, example)", path.join(SKILL_DIR, "references", "design-desk.md")], ["motion vocabulary", path.join(SKILL_DIR, "references", "vocabulary.md")], ["3D playbook (camera and light grammar)", path.join(SKILL_DIR, "references", "3d.md")], ["craft", path.join(SKILL_DIR, "references", "craft.md")], ["library", path.join(SKILL_DIR, "library")], ["the specimen renderer's vocabulary", path.join(SKILL_DIR, "scripts", "lib", "vocab.mjs")]]) I(l, p);
      if (treat) ctx.treatment_label = key;
      ctx.library = `node "${path.join(SKILL_DIR, "scripts", "library.mjs")}" search --q "<words>" [--space 3d] | show <id> --full`;
      ctx.gate = `node "${path.join(SKILL_DIR, "scripts", "design.mjs")}" check-system --dir ${rel(R(run, "design", key))}`;
      O(R(run, "design", key, "DESIGN.md")); O(R(run, "design", key, "recipe.json")); O(R(run, "design", key, "blend.json"));
      if (hasGrammarLibrary()) {
        // each look = a design system + ONE motion grammar; the three looks use three different grammars
        const gm = `node "${path.join(SKILL_DIR, "scripts", "grammar.mjs")}"`;
        ctx.grammar = `each look binds ONE motion grammar (library/grammars/<id>.json, or a bespoke one in the same schema) as design/${key}/grammar.json; the three looks use three different grammars. Pick with \`${gm} pick --run ${rel(run)} [--flat] [--exclude <the other looks' ids>]\`, then \`${gm} write --run ${rel(run)} --id <id> --label ${key}\` (a brand's palette overrides the grammar's; the devices stay). specimen.html becomes a 4 to 5 s moving sketch of the chosen story's open and first rung in that grammar (the frame device moving, a technique of it), a paused GSAP timeline at window.__specimen.`;
        I("motion grammars (library: pick one per look)", path.join(SKILL_DIR, "library", "grammars"));
        O(R(run, "design", key, "grammar.json"));
      }
      if (ctx.brand_film) {
        const sl = String(key).toLowerCase();
        ctx.stance = sl === "sure" ? "Sure: the brand film's grammar EXACTLY (FILM-STYLE.md): its canvas, palette, type, motif, layout, motion vocabulary and end card, built out as a complete design system. Nothing from outside the card." : `${key}: the same palette, type, motif and motion vocabulary as the brand film (FILM-STYLE.md), varying only composition, pacing and emphasis (${sl === "bold" ? "bigger scale, tighter cuts, more of the motif per scene" : "the motif carries more of the story, more contrast between calm holds and bursts, a more unexpected arrangement of the SAME elements"}). Never a new colour, face, illustration style or move.`;
        ctx.library = "NONE: a branded film does not blend library, designer or director references (Paula Scher, Spielberg, Wes Anderson, museum grammar...). blend.json carries references: [], film_style: \"<path to brand-film/FILM-STYLE.md>\" and film_style_takes: [what you took from the card: palette, type, motif, motion, layout, end card]";
      }
      break;
    }
    case "research-lead":
      Object.assign(ctx, { subject: P.subject, brief: B });
      for (const f of ["product.md", "product.claims.json", "brand.md", "brand/DESIGN.md", "screens.md", "screens.json", "precedent.md", "local.md", "local.claims.json"]) I(f, research(f));
      I("capture", capture); I("truth_template", R(run, "story", "truth.md")); I("workspace_design_md", dsn ? path.resolve(dsn) : null);
      O(R(run, "story", "truth.md")); O(research("claims.json")); O(research("assets.json")); O(research("BRIEFING.md"));
      break;
    case "script-writer": {
      const picks = jsonMaybe(R(run, "story", "picks.json"));
      const list = picks ? picks.picks || picks.devices || picks : [];
      const dev = Array.isArray(list) ? list.find((x) => String(x.label || x.angle || "").toLowerCase() === String(key).toLowerCase()) : null;
      Object.assign(ctx, { label: key, device: dev || "(see story/picks.json for this label)", device_menu: "story/picks.json `menu`: CHOOSE one device from it with a one-line reason (pitch.device_reason); no seeded draw chose for you. Your slot's `engine` and the turn_rule say what your script's turn must do (pitch.turn { line, reverses, payoff })", brief: B });
      for (const [l, p] of [["intent sheet format (story/intent-" + key + ".json: the argument, written first)", path.join(SKILL_DIR, "references", "intent.md")], ["truth", R(run, "story", "truth.md")], ["claims", research("claims.json")], ["briefing", research("BRIEFING.md")], ["screens", research("screens.md")], ["precedent", research("precedent.md")], ["picks", R(run, "story", "picks.json")], ["writer's brief", path.join(SKILL_DIR, "references", "script.md")], ["pitch format", path.join(SKILL_DIR, "references", "story.md")]]) I(l, p);
      for (const [l, p] of showcaseInputs(run, P, B)) I(l, p);
      O(R(run, "story", `pitch-${key}.json`)); O(R(run, "story", `intent-${key}.json`));
      break;
    }
    case "treatment-writer": {
      if (!key) die("treatment-writer needs --key Sure|Bold|Wild");
      const conceit = { sure: "the film as an obvious-in-hindsight format for this song", bold: "a strong formal conceit (a document, an instrument, a place) with a signal running through it", wild: "the treatment a studio would put on its reel: the form itself is the joke" }[String(key).toLowerCase()];
      Object.assign(ctx, { label: key, conceit: conceit || "(Sure, Bold or Wild)", brief: B });
      const skel = R(run, "story", `treatment-${key}.json`);
      for (const [l, p] of [["lyrics (word timings)", R(run, "music", "lyrics.json")], ["audio (beats, downbeats, sections, onsets)", R(run, "music", "audio.json")], ["briefing", research("BRIEFING.md")], ["precedent", research("precedent.md")], ["writer's brief", path.join(SKILL_DIR, "references", "lyric-video.md")], ["lyrics and the music runtime", path.join(SKILL_DIR, "references", "lyrics.md")], ["2D, 3D or hybrid", path.join(SKILL_DIR, "references", "3d.md")], ["vocabulary", path.join(SKILL_DIR, "references", "vocabulary.md")]]) I(l, p);
      ctx.skeleton = `node "${path.join(SKILL_DIR, "scripts", "treatment.mjs")}" skeleton --lyrics ${rel(R(run, "music", "lyrics.json"))} --audio ${rel(R(run, "music", "audio.json"))} --label ${key} --out ${rel(skel)}`;
      O(skel); O(R(run, "story", `TREATMENT-${key}.md`));
      break;
    }
    case "visual-writer": {
      if (!key) die("visual-writer needs --key Sure|Bold|Wild");
      const conceit = { sure: "the literal, well-made version: each beat gets an image that illustrates what is said, in one consistent world", bold: "one running world or metaphor that the whole talk happens inside, changing as the argument changes", wild: "a conceit a studio would put on its reel: the talk is staged inside something unexpected, and the person interacts with it" }[String(key).toLowerCase()];
      const ig = imagegenState();
      Object.assign(ctx, { label: key, conceit: conceit || "(Sure, Bold or Wild)", brief: B, imagegen: ig, imagegen_note: ig === "ready" ? "plates of kind generated are real images (each costs about 1.5 minutes of a Codex run on the user's ChatGPT plan, so spend them where the picture argues)" : "image generation is not available: write plates as kind generated anyway only if you accept they become designed backdrops; prefer kind designed with a prompt-like description, and say so in why" });
      const pjson = R(run, "presenter", `plan-${key}.json`);
      for (const [l, p] of [["transcript (words with times)", R(run, "presenter", "transcript.json")], ["beats (the speech cut at its natural joints)", R(run, "presenter", "beats.json")], ["key facts (where the person stands, the frame, the duration)", R(run, "presenter", "key.json")], ["key check (the keyed edge)", R(run, "presenter", "key-check.png")], ["contact sheet of the clip", R(run, "presenter", "sheet.jpg")], ["briefing", research("BRIEFING.md")], ["truth", R(run, "story", "truth.md")], ["presenter playbook (read all of it)", path.join(SKILL_DIR, "references", "presenter.md")], ["imagery (prompt craft)", path.join(SKILL_DIR, "references", "imagery.md")], ["vocabulary", path.join(SKILL_DIR, "references", "vocabulary.md")]]) I(l, p);
      ctx.check_cmd = `node "${path.join(SKILL_DIR, "scripts", "presenter.mjs")}" check --plan ${rel(pjson)} --beats ${rel(R(run, "presenter", "beats.json"))} --key ${rel(R(run, "presenter", "key.json"))} --imagegen ${ig === "ready" ? "ready" : "off"}`;
      O(pjson);
      break;
    }
    case "concept-critic":
      Object.assign(ctx, { brief: B, length_s: B.length_s, round: Number(String(key || "1").split("-").pop()) || 1 });
      for (const [l, p] of [["the brief (literal words)", R(run, "brief.json")], ["chosen script", R(run, "story", "chosen.json")], ["the intent sheet (the proposition, each beat's buys, relation and importance: does the chosen script's turn reverse something and does its payoff answer the setup?)", R(run, "story", "intent.json")], ["chosen look (design system)", R(run, "look", "DESIGN.md")], ["decisions", R(run, "decisions.json")], ["truth", R(run, "story", "truth.md")], ["claims", research("claims.json")], ["briefing", research("BRIEFING.md")], ["screens", research("screens.md")], ["brand", research("brand/DESIGN.md")], ["workspace brand", dsn ? path.resolve(dsn) : null], ["product-first rules", path.join(SKILL_DIR, "references", "product-first.md")]]) I(l, p);
      O(R(run, "story", "concept-check.json"));
      break;
    case "move-inventor": {
      if (!key || !MOVE_LABELS.includes(key)) die("move-inventor needs --key Sure|Bold|Wild");
      const pf = !!ctx.product_first;
      const mjs = path.join(SKILL_DIR, "scripts", "moves.mjs");
      ctx.label = key;
      ctx.aspect = B.aspect;
      ctx.pack_cmd = `node "${mjs}" pack --run ${rel(run)} --label ${key}${pf ? " --product-first" : ""}`;
      ctx.pack_note = "the Director runs pack_cmd BEFORE briefing you (the pack is your exemplars, the 20 generators, one stimulus and the banned list); read the pack, never re-roll it";
      ctx.check_cmd = `node "${mjs}" check --file ${rel(R(run, "story", `moves-${key}.json`))} --pitch ${rel(R(run, "story", `pitch-${key}.json`))}${pf ? " --product-first" : ""}`;
      const vd = jsonMaybe(R(run, "story", "moves-verdict.json"));
      const den = vd && vd.pitches && vd.pitches[key] && vd.pitches[key].denial;
      if (Array.isArray(den) && den.includes(key)) ctx.denial_round = `yes: the juror failed too many of your cards. Read story/moves-verdict.json (pitches.${key}.cards[].fails and evidence), add those failures to your banned list, and write story/moves-${key}.json again`;
      for (const [l, p] of [["the pitch (beats, on_screen, visual, ui_labels)", R(run, "story", `pitch-${key}.json`)], ["truth", R(run, "story", "truth.md")], ["claims", research("claims.json")], ["screens (UI labels and surfaces)", research("screens.md")], ["briefing", research("BRIEFING.md")], ["precedent", research("precedent.md")], ["brand DESIGN.md (research)", research("brand", "DESIGN.md")], ["workspace DESIGN.md", dsn ? path.resolve(dsn) : null], ["the method (read all of it)", path.join(SKILL_DIR, "references", "moves.md")], ["your pack (exemplars, generators, stimulus, banned)", R(run, "story", `moves-pack-${key}.json`)], ["reference moves from the user's clip (if any)", research("reference-moves.json")]]) I(l, p);
      if (readRunGrammar(run) !== null) I("motion grammar (the film's one grammar: restate carriers and joins in its devices)", R(run, "look", "grammar.json"));
      for (const [l, p] of showcaseInputs(run, P, B)) I(l, p);
      O(R(run, "story", `moves-${key}.json`));
      break;
    }
    case "move-juror": {
      ctx.aspect = B.aspect;
      ctx.check_cmd = `node "${path.join(SKILL_DIR, "scripts", "moves.mjs")}" check-verdict --run ${rel(run)}`;
      for (const l of MOVE_LABELS) I(`${l} moves`, R(run, "story", `moves-${l}.json`));
      for (const l of MOVE_LABELS) I(`${l} pitch`, R(run, "story", `pitch-${l}.json`));
      I("the method (gates, product-first and brand-film variants)", path.join(SKILL_DIR, "references", "moves.md"));
      O(R(run, "story", "moves-verdict.json"));
      break;
    }
    case "move-sketcher": {
      if (!key || !MOVE_LABELS.includes(key)) die("move-sketcher needs --key Sure|Bold|Wild");
      const vd = jsonMaybe(R(run, "story", "moves-verdict.json")), mv = jsonMaybe(R(run, "story", `moves-${key}.json`));
      const hero = (vd && vd.pitches && vd.pitches[key] && vd.pitches[key].hero) || (mv && Array.isArray(mv.heroes) && mv.heroes[0]) || "<hero id>";
      const dir = R(run, "story", "moves", `${key}-${hero}`);
      const mjs = path.join(SKILL_DIR, "scripts", "moves.mjs");
      Object.assign(ctx, { label: key, hero, aspect: B.aspect, render_cmd: `node "${mjs}" rough --dir ${rel(dir)}${B.aspect ? ` --aspect ${B.aspect}` : ""}`, check_cmd: `node "${mjs}" check-rough --dir ${rel(dir)}` });
      for (const [l, p] of [[`your moves file (the card ${hero} is your brief)`, R(run, "story", `moves-${key}.json`)], ["the verdict", R(run, "story", "moves-verdict.json")], ["the pitch (the real words)", R(run, "story", `pitch-${key}.json`)], ["how roughs are built (read section 8)", path.join(SKILL_DIR, "references", "moves.md")]]) I(l, p);
      O(rel(path.join(dir, "rough.html")));
      for (const n of ["rough.mp4", "strip.png", "poster.png"]) O(rel(path.join(dir, n)) + " (written by render_cmd)");
      break;
    }
    case "script-editor":
      for (const [l, p] of [["the beat lists for the BLIND RETELL (read these first and retell each film in one sentence before anything else: on_screen, voice and picture only)", R(run, "story", "beats-Sure.md")], ["", R(run, "story", "beats-Bold.md")], ["", R(run, "story", "beats-Wild.md")], ["the intent sheets (the argument each script rests on: story/intent-<Label>.json, or intent.json once chosen)", R(run, "story")], ["pitches", R(run, "story", "pitches.json")], ["check", R(run, "story", "check.json")], ["truth", R(run, "story", "truth.md")], ["claims", research("claims.json")], ["briefing", research("BRIEFING.md")], ["precedent", research("precedent.md")], ["rubric", path.join(SKILL_DIR, "references", "script.md")], ["story rules", path.join(SKILL_DIR, "references", "story.md")], ["craft", path.join(SKILL_DIR, "references", "craft.md")]]) I(l, p);
      O(R(run, "story", "edit-notes.json"));
      break;
    case "art-director": {
      const ag = readRunGrammar(run);
      Object.assign(ctx, { imagegen: imagegenState(), art_dir: rel(R(run, "art")), plan_cmd: `node "${path.join(SKILL_DIR, "scripts", "art.mjs")}" plan --run ${rel(run)}`, check_cmd: `node "${path.join(SKILL_DIR, "scripts", "art.mjs")}" check --run ${rel(run)}` });
      for (const [l, p] of [["the brief (literal words)", R(run, "brief.json")], ["chosen script (its shows: built_from object and photo, and any drawn thing)", R(run, "story", "chosen.json")], ["chosen look (design system; its Imagery section names the picture world)", R(run, "look", "DESIGN.md")], ["frame.md", lookFrame(run)], ["art plan (art.mjs plan wrote it: fill and edit it)", R(run, "art", "plan.json")], ["showcases of the art in the reference films", path.join(SKILL_DIR, "library", "showcases")], ["craft", path.join(SKILL_DIR, "references", "craft.md")], ["the shape kit (what the art feeds: morphs, draw-on, dissolves)", path.join(SKILL_DIR, "references", "shape.md")], ["truth sheet", R(run, "story", "truth.md")]]) I(l, p);
      if (ag !== null) I("motion grammar (the film's ONE grammar: what its techniques need drawn)", R(run, "look", "grammar.json"));
      I("logo files (the only logo you may place)", research("brand", "assets"));
      O(R(run, "art", "plan.json")); O(R(run, "art", "assets.json")); O(R(run, "art", "ART.md")); O(`${rel(R(run, "art", "assets"))}/<id>.png|svg`); O(R(run, "art", "sheet.png"));
      break;
    }
    case "motion-director":
      Object.assign(ctx, { pass: key === "seams" ? "seams" : "score", length_s: B.length_s, aspect: B.aspect });
      for (const [l, p] of [["THE INTENT (read first: story/intent.json. Per beat: what it buys, its relation to the beat before, its importance 1-3, the one thing to read; the peak. Choose each beat's hero, verb and transition FROM it, and spend your big moments on the importance-3 beats and the peak)", R(run, "story", "intent.json")], ["the score's fields, format, seam pass and shape vocabulary", path.join(SKILL_DIR, "references", "score.md")], ["script", R(run, "story", "chosen.json")], ["scenes", R(run, "scenes.json")], ["frame.md", lookFrame(run)], ["design system (its Motion and camera section binds the motion)", R(run, "look", "DESIGN.md")], ["direction", R(run, "direction", "DIRECTION.md")], ["motion.md", R(run, "motion.md")], ["music plan", R(run, "music", "plan.json")], ["screens", research("screens.md")], ["assets", research("assets.json")], ["brand", research("brand.md")], ["precedent", research("precedent.md")], ["reference moments (read-only: dense.md and code/REMIX.md per moment; one mechanic each, written as the beat's take)", R(run, "references", "moments")], ["craft", path.join(SKILL_DIR, "references", "craft.md")], ["vocabulary", path.join(SKILL_DIR, "references", "vocabulary.md")], ["3d playbook", path.join(SKILL_DIR, "references", "3d.md")]]) I(l, p);
      if (readRunGrammar(run) !== null) {
        ctx.grammar = "yes: the film's ONE motion grammar is look/grammar.json. Set score.grammar to its id; every beat (scene) names the technique of it that expresses the beat's verb and a frame_device (what the grammar's frame device does in that beat). A refrain may repeat a technique; the check refuses grammar-missing, technique-unknown and frame-device-missing, and warns technique-thin when the whole film spends 2 or fewer.";
        I("motion grammar (THE film's one motion language: frame device, type and image behaviour, techniques with build routes)", R(run, "look", "grammar.json"));
      }
      if (LYR(run, P)) {
        ctx.lyric_video = true;
        for (const [l, p] of [["chosen treatment (spine, motifs, plates: space, energy, idiom)", R(run, "story", "chosen-treatment.json")], ["treatment in words", R(run, "story", "chosen-treatment.md")], ["lyrics (word timings)", R(run, "music", "lyrics.json")], ["audio (downbeats, onsets)", R(run, "music", "audio.json")], ["lyric-video playbook", path.join(SKILL_DIR, "references", "lyric-video.md")], ["lyrics and the music runtime", path.join(SKILL_DIR, "references", "lyrics.md")]]) I(l, p);
      }
      if (key !== "seams") for (const [l, p] of showcaseInputs(run, P, B)) I(l, p);
      if (key === "seams") {
        if (!pj) die("the seam pass needs --project <videos/name>");
        Object.assign(ctx, { project: rel(pj) });
        I("score", R(run, "motion", "score.json")); I("storyboard", path.join(pj, "STORYBOARD.md"));
        O(R(run, "crew", "seams-report.md")); O(rel(path.join(pj, "compositions", "frames")) + "/ (seam regions only)");
      } else {
        O(R(run, "motion", "score.json")); O(R(run, "motion", "score.md"));
      }
      break;
    case "styleframe-designer": {
      // the film as pictures (references/styleframes.md): key frames (a direct film: shot list, 3 heroes, every board),
      // heroes (a long film: the shot list and the 3 heroes), heroes-<Label> (the Look call: one system's open, peak, end)
      const k = String(key || "frames");
      const look = k.startsWith("heroes-") ? k.slice(7) : null;
      if (look && !MOVE_LABELS.includes(look)) die("styleframe-designer key heroes-<Sure|Bold|Wild>");
      const dir = look ? R(run, "design", look, "frames") : R(run, "frames");
      const fjs = path.join(SKILL_DIR, "scripts", "frames.mjs");
      Object.assign(ctx, { pass: look ? `the ${look} look's 3 hero styleframes (open, peak, end) of the chosen story, in design/${look}/frames/` : k === "heroes" ? "the shot list and the 3 hero styleframes (frame designers draw the other boards, bound to yours)" : "the whole set: the shot list, the 3 hero styleframes and one board per beat", aspect: B.aspect, length_s: B.length_s, frames_dir: rel(dir) });
      ctx.init_cmd = `node "${fjs}" init --run ${rel(run)}${look ? ` --dir ${rel(dir)} --heroes` : ""}`;
      ctx.refs_cmd = `node "${fjs}" refs --run ${rel(run)} --sheet`;
      ctx.shots_check = `node "${fjs}" shots-check --run ${rel(run)}${look ? ` --dir ${rel(dir)}` : ""}`;
      ctx.render_cmd = `node "${path.join(SKILL_DIR, "scripts", "design.mjs")}" stills --dir ${rel(dir)} --aspect ${B.aspect || "16:9"}`;
      ctx.sheet_cmd = `node "${fjs}" sheet --ours ${rel(dir)} --refs <stills of the same kind> --out ${rel(path.join(dir, "sheet.png"))}`;
      if (exists(path.join(SKILL_DIR, "scripts", "frame-gate.mjs"))) ctx.gate_cmd = `node "${fjs}" gate --run ${rel(run)}${look ? ` --dir ${rel(dir)}` : ""}`;
      ctx.camera = exists(path.join(SKILL_DIR, "scripts", "camera.mjs")) ? "RasanCamera is in this skill: init_cmd installs it into the frames folder (assets/rasan-camera/); read references/cinematography.md and use it" : "RasanCamera is not in this skill yet: use the frame kit init_cmd writes (kit/frame-kit.css, kit/frame-kit.js) and CSS 3D";
      for (const [l, p] of [["THE BAR: the pipeline (left) vs one picture-first designer (right), same script and brand (look at it first)", path.join(SKILL_DIR, "references", "styleframes", "x1-compare.jpg")], ["the x1 set (8 frames, 3 at the reference level)", path.join(SKILL_DIR, "references", "styleframes", "x1-contact.jpg")], ["the stage (formats, rules, the console)", path.join(SKILL_DIR, "references", "styleframes.md")], ["reference stills of this run (refs_cmd writes it)", R(run, "frames", "refs.json")], ["chosen script (beats, on-screen lines, shows)", R(run, "story", "chosen.json")], ["the moves (carrier and hero moves: the device and the peaks)", R(run, "story", "moves.json")], ["scenes (when the music fit already ran)", R(run, "scenes.json")], ["design system (palette, type, components)", look ? R(run, "design", look, "DESIGN.md") : R(run, "look", "DESIGN.md")], ["frame.md (font loading)", look ? null : lookFrame(run)], ["motion grammar (the frame device)", look ? R(run, "design", look, "grammar.json") : R(run, "look", "grammar.json")], ["direction", R(run, "direction", "DIRECTION.md")], ["real screens", research("screens.json")], ["ui kit (measured components)", research("screens.md")], ["asset kit", research("assets.json")], ["art assets (the film's own pictures)", R(run, "art", "assets.json")], ["art sheet", R(run, "art", "sheet.png")], ["logo files (the only logo you may place)", research("brand/assets")], ["brand DESIGN.md", research("brand/DESIGN.md")], ["the brand's film frames", R(run, "brand-film")], ["the user's reference clip", research(path.join("films", "reference"))], ["reference moments", R(run, "references", "moments")], ["cinematography recipes (RasanCamera calls with numbers)", path.join(SKILL_DIR, "references", "cinematography.md")], ["3D playbook (beats in real 3D)", path.join(SKILL_DIR, "references", "3d.md")], ["craft", path.join(SKILL_DIR, "references", "craft.md")]]) I(l, p);
      if (look) { O(path.join(dir, "shots.json")); for (const n of ["open", "peak", "end"]) { O(path.join(dir, `${n}.html`)); O(path.join(dir, `${n}.png`)); } }
      else { O(R(run, "frames", "shots.json")); O(`${rel(R(run, "frames"))}/<id>.html + <id>.png (${k === "heroes" ? "the 3 heroes" : "every shot"})`); O(R(run, "frames", "FRAMES.md")); }
      break;
    }
    case "frame-juror": {
      const fjs = path.join(SKILL_DIR, "scripts", "frames.mjs");
      Object.assign(ctx, { round: Number(String(key || "frames-1").split("-").pop()) || 1, aspect: B.aspect, refs_cmd: `node "${fjs}" refs --run ${rel(run)} --sheet`, sheet_cmd: `node "${fjs}" sheet --ours ${rel(R(run, "frames"))}/<id>.png --refs <1 to 3 stills of its kind> --out ${rel(R(run, "frames", "sheets"))}/<id>.png --title "<id> · <beat>"`, set_cmd: `node "${fjs}" sheet --ours ${rel(R(run, "frames"))} --out ${rel(R(run, "frames", "sheet.png"))} --title "the set"` });
      if (exists(path.join(SKILL_DIR, "scripts", "frame-gate.mjs"))) ctx.gate_cmd = `node "${fjs}" gate --run ${rel(run)}`;
      if (ctx.round > 1) ctx.rejudge = "judge only the frames the designer redid since frames/verdict.json; keep the earlier verdicts for the rest (bump round)";
      for (const [l, p] of [["the boards (frames/<id>.png) and the shot list", R(run, "frames")], ["shot list", R(run, "frames", "shots.json")], ["the designer's notes and revisions", R(run, "frames", "FRAMES.md")], ["reference stills (refs_cmd writes it)", R(run, "frames", "refs.json")], ["the previous verdict (round 2)", R(run, "frames", "verdict.json")], ["the brand's film frames", R(run, "brand-film")], ["the user's reference clip", research(path.join("films", "reference"))], ["reference moments", R(run, "references", "moments")], ["the showcase films in words (no stills: judge against these)", path.join(SKILL_DIR, "library", "showcases")], ["the bar", path.join(SKILL_DIR, "references", "styleframes", "x1-compare.jpg")], ["the stage (verdict format)", path.join(SKILL_DIR, "references", "styleframes.md")]]) I(l, p);
      O(R(run, "frames", "verdict.json")); O(`${rel(R(run, "frames", "sheets"))}/<id>.png`); O(R(run, "frames", "sheet.png"));
      break;
    }
    case "frame-designer": {
      // the boards of a long film, bound to the hero styleframes (key = a range of shot numbers, 1-based: 4-6 -> frames/04..06)
      const [a, b] = String(key || "").split("-").map(Number);
      Object.assign(ctx, { scenes: a && b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : key, aspect: B.aspect, render_cmd: `node "${path.join(SKILL_DIR, "scripts", "design.mjs")}" stills --dir ${rel(R(run, "frames"))} --aspect ${B.aspect || "16:9"}`, shots_check: `node "${path.join(SKILL_DIR, "scripts", "frames.mjs")}" shots-check --run ${rel(run)}` });
      const doc = readShots(R(run, "frames", "shots.json"));
      if (doc && Array.isArray(doc.film.heroes)) ctx.heroes = doc.film.heroes.map((h) => `frames/${h}.png`).join(", ");
      for (const [l, p] of [["the shot list (your boards' size, hero, angle, focus, light, ground, type, crop, device)", R(run, "frames", "shots.json")], ["the hero styleframes and the other boards (match their light, ground, device and type ladder)", R(run, "frames")], ["the stage", path.join(SKILL_DIR, "references", "styleframes.md")], ["the styleframe designer's brief (the craft: read sections 'What made the right column win' and 3)", path.join(AGENTS, "styleframe-designer.md")], ["the bar", path.join(SKILL_DIR, "references", "styleframes", "x1-compare.jpg")], ["chosen script", R(run, "story", "chosen.json")], ["score (when it exists)", R(run, "motion", "score.json")], ["frame.md", lookFrame(run)], ["design system (its Motion and camera section binds the motion)", R(run, "look", "DESIGN.md")], ["direction", R(run, "direction", "DIRECTION.md")], ["scenes", R(run, "scenes.json")], ["screens", research("screens.json")], ["ui kit", research("screens.md")], ["assets", research("assets.json")], ["art assets", R(run, "art", "assets.json")], ["logo", research("brand", "assets")], ["cinematography recipes", path.join(SKILL_DIR, "references", "cinematography.md")], ["craft", path.join(SKILL_DIR, "references", "craft.md")], ["3d playbook (for beats in real 3D)", path.join(SKILL_DIR, "references", "3d.md")]]) I(l, p);
      if (LYR(run, P)) I("chosen treatment (the style bible is the look)", R(run, "story", "chosen-treatment.json"));
      for (const n of ctx.scenes || []) { const id = String(n).padStart(2, "0"); O(R(run, "frames", `${id}.html`)); O(R(run, "frames", `${id}.png`)); O(R(run, "frames", `${id}.md`)); }
      break;
    }
    case "scene-animator": {
      if (!pj) die("scene-animator needs --project <videos/name>");
      if (PRES_KEY.test(String(key))) {
        // a presenter film's motion graphic (b3-1) or designed plate (plate-p2): one sub-composition over/behind the keyed person
        const pl = key.startsWith("plate-"), sub = pl ? "plates" : "graphics", nm = pl ? key.slice(6) : key;
        Object.assign(ctx, { [pl ? "designed_plate" : "graphic"]: nm, project: rel(pj), space: "2d", presenter_film: true });
        for (const [l, p] of [[pl ? "plate brief (what it must be, where the person stands)" : "graphic brief (what, when, where, the beat's words, the layout, what the person occupies)", path.join(pj, "briefs", sub, `${nm}.md`)], ["the scaffold to replace", path.join(pj, "compositions", sub, `${nm}.html`)], ["presenter playbook", path.join(SKILL_DIR, "references", "presenter.md")], ["the plan", R(run, "presenter", "plan.json")], ["DISPATCH.md", path.join(pj, "DISPATCH.md")], ["frame.md", path.join(pj, "frame.md")], ["design system (its Motion and camera section binds the motion)", R(run, "look", "DESIGN.md")], ["motion.md", path.join(pj, "motion.md")], ["craft", path.join(SKILL_DIR, "references", "craft.md")], ["vocabulary", path.join(SKILL_DIR, "references", "vocabulary.md")]]) I(l, p);
        O(`${rel(path.join(pj, "compositions", sub))}/${nm}.html`); O(R(run, "crew", "animators", `${key}.md`)); O(R(run, "crew", "animators", `${key}-overview.png`)); O(R(run, "crew", "animators", `${key}-move.png`));
        break;
      }
      const n = Number(key);
      const packets = path.join(pj, ".hyperframes", "frame-packets");
      const packet = exists(packets) ? fs.readdirSync(packets).find((f) => new RegExp(`^0*${n}[-_.]`).test(f) && f.endsWith(".md")) : null;
      const sc3 = ((jsonMaybe(R(run, "motion", "score.json")) || {}).scenes || []).find((x) => Number(x.n) === n) || {};
      Object.assign(ctx, { scene: n, project: rel(pj), space: sc3.space || "2d" });
      I("the argument (story/intent.json: each beat's buys, importance, relation, the peak)", R(run, "story", "intent.json"));
      if (is3d(sc3)) I("3d playbook", path.join(SKILL_DIR, "references", "3d.md"));
      if (readRunGrammar(run) !== null) I("motion grammar (the film's one grammar: your beat's technique and frame_device come from it)", R(run, "look", "grammar.json"));
      if (LYR(run, P)) {
        ctx.lyric_video = true;
        ctx.sync = "sync every word of this scene's lines to its sung start with RasanMusic.gsapWords / RasanMusic.wordProgress (references/lyrics.md); never ahead of the voice";
        for (const [l, p] of [["lyrics (word timings)", R(run, "music", "lyrics.json")], ["audio (beats, onsets, envelopes)", R(run, "music", "audio.json")], ["lyrics and the music runtime", path.join(SKILL_DIR, "references", "lyrics.md")], ["lyric-video playbook (karaoke rules)", path.join(SKILL_DIR, "references", "lyric-video.md")], ["chosen treatment (style bible, motifs, this plate)", R(run, "story", "chosen-treatment.json")]]) I(l, p);
      }
      for (const [l, p] of [["technical role", path.join(packets, "_role.md")], ["frame packet", packet ? path.join(packets, packet) : null], ["DISPATCH.md", path.join(pj, "DISPATCH.md")], ["frame.md", path.join(pj, "frame.md")], ["design system (its Motion and camera section binds the motion)", R(run, "look", "DESIGN.md")], ["motion.md", path.join(pj, "motion.md")], ["key frame", path.join(pj, "assets", "keyframes", `${n}.png`)], ["key frame note", R(run, "frames", `${n}.md`)], ["score", R(run, "motion", "score.json")], ["ui kit", research("screens.md")], ["brand motion", research("brand.md")], ["logo files (the only logo you may place: the staged copy is in the project at assets/brand/; if logos.json says none, set the name in type, no symbol)", research("brand", "assets")], ["assets", research("assets.json")]]) I(l, p);
      O(`${rel(path.join(pj, "compositions", "frames"))}/${packet ? packet.replace(/\.md$/, ".html") : `${String(n).padStart(2, "0")}-*.html`}`);
      O(R(run, "crew", "animators", `${n}.md`)); O(R(run, "crew", "animators", `${n}-overview.png`)); O(R(run, "crew", "animators", `${n}-move.png`));
      break;
    }
    case "film-builder": {
      if (!pj) die("film-builder needs --project <videos/name>");
      const lead = key === "lead";
      const score = jsonMaybe(R(run, "motion", "score.json")) || {};
      const S = Array.isArray(score.scenes) ? score.scenes : [];
      Object.assign(ctx, { pass: lead ? "lead (the root and the carriers only; scene animators build the beats around them)" : "film (the whole film: the root, every beat and every carrier, in one pass)", project: rel(pj), length_s: B.length_s, aspect: B.aspect, beats: S.length || undefined });
      I("the argument (story/intent.json: each beat's buys, importance, relation, the peak)", R(run, "story", "intent.json"));
      if (S.some(is3d)) I("3d playbook (the plan puts a beat in 3D)", path.join(SKILL_DIR, "references", "3d.md"));
      if (readRunGrammar(run) !== null) I("motion grammar (the film's ONE grammar: every beat spends the technique the plan names, in the frame device the plan names)", R(run, "look", "grammar.json"));
      for (const [l, p] of [["the plan (motion/score.json): THE contract", R(run, "motion", "score.json")], ["the plan in words", R(run, "motion", "score.md")], ["build brief (short: what to build, the momentum rules, the gate)", path.join(pj, "BUILD.md")], ["technical role (the workflow's frame-worker contract)", path.join(pj, ".hyperframes", "frame-packets", "_role.md")], ["frame packets (one per beat: the file each beat goes in)", path.join(pj, ".hyperframes", "frame-packets")], ["DISPATCH.md", path.join(pj, "DISPATCH.md")], ["frame.md (the look: fonts, colours)", path.join(pj, "frame.md")], ["motion.md", path.join(pj, "motion.md")], ["reference moments (read-only: one mechanic per beat, never copied)", R(run, "references", "moments")], ["the chosen moves (the Moves pass: the carrier you build and the hero cards with their roughs: your motion target; each is a move to beat, the reference moments are mechanics to execute it with)", R(run, "story", "moves.json")], ["the move roughs (grey-box loops of the hero moves)", R(run, "story", "moves")], ["ui kit", research("screens.md")], ["real screens", research("screens.json")], ["logo files (the only logo you may place: the staged copy is in the project at assets/brand/; if logos.json says none, set the name in type, no symbol)", research("brand", "assets")], ["assets", research("assets.json")]]) I(l, p);
      if (LYR(run, P)) { ctx.lyric_video = true; for (const [l, p] of [["lyrics (word timings)", R(run, "music", "lyrics.json")], ["audio (beats, onsets)", R(run, "music", "audio.json")], ["lyrics and the music runtime", path.join(SKILL_DIR, "references", "lyrics.md")]]) I(l, p); }
      ctx.gate = `node "${path.join(SKILL_DIR, "scripts", "motion-gate.mjs")}" --project ${rel(pj)} --plan ${rel(R(run, "motion", "score.json"))}`;
      if (lead) O(`${rel(path.join(pj, "index.html"))} (the root: ground and carrier tracks)`), O(`${rel(path.join(pj, "compositions", "carriers"))}/*.html`);
      else O(`${rel(path.join(pj, "compositions", "frames"))}/NN-*.html (every beat, the file its packet names)`), O(`${rel(path.join(pj, "compositions", "carriers"))}/*.html (every object that crosses a cut)`);
      O(R(run, "crew", "builder", `${key || "film"}.md`)); O(R(run, "crew", "builder", `${key || "film"}-overview.png`)); O(R(run, "crew", "builder", `${key || "film"}-seams.png`));
      break;
    }
    case "structure-critic": {
      Object.assign(ctx, { brief: B, length_s: B.length_s, round: Number(String(key || "1").split("-").pop()) || 1, thumbs_cmd: `node "${path.join(SKILL_DIR, "scripts", "crew.mjs")}" thumbs --run ${rel(run)}`, edits: "story/structure-notes.json { verdict: ship | edit, retell, edits: [{ op: cut | merge | move | peak | rest | rewrite, beat | beats, to, buys, why }] }; beats are numbered as on the sheet, 1-based; crew.mjs check applies them" });
      for (const [l, p] of [["the thumbnail sheet (one rough per beat, each beat's buys under it: your ONLY picture of the film; look at it)", R(run, "story", "thumbs", "sheet.png")], ["the sheet's index (thumbs.json: source per beat, seconds, relation, importance)", R(run, "story", "thumbs", "thumbs.json")], ["THE INTENT (the argument: proposition, ending_first, beats)", R(run, "story", "intent.json")], ["the intent sheet format", path.join(SKILL_DIR, "references", "intent.md")], ["the brief (literal words)", R(run, "brief.json")]]) I(l, p);
      O(R(run, "story", "structure-notes.json"));
      break;
    }
    case "critic": {
      const [lens, round] = String(key || "film-1").split("-");
      Object.assign(ctx, { lens, round: Number(round) || 1 });
      if (pj) ctx.project = rel(pj);
      const common = [["the intent sheet (what each beat was meant to buy and where the peak is: judge the film against it; a finding may name a beat that fails its buys)", R(run, "story", "intent.json")], ["craft", path.join(SKILL_DIR, "references", "craft.md")], ["3d playbook", path.join(SKILL_DIR, "references", "3d.md")], ["precedent", research("precedent.md")], ["direction", R(run, "direction", "DIRECTION.md")]];
      const byLens = {
        frames: [["key frames", R(run, "frames")], ["scenes", R(run, "scenes.json")], ["score", R(run, "motion", "score.md")], ["screens", research("screens.json")]],
        motion: [["the motion gate's report on the draft (motion-gate.mjs --json: freezes, coverage, seams, carriers, fluency and its per-beat one-curve findings; READ FIRST)", R(run, "crew", "motion-gate.json")], ["score", R(run, "motion", "score.json")], ["project", pj], ["renders (the draft render: judge the moving film, never stills alone)", pj && path.join(pj, "renders")], ["motion.md", pj && path.join(pj, "motion.md")]],
        film: [["the phone sheet (crew/phone.png): the retell is written from this, before anything else", R(run, "crew", "phone.png")], ["the motion gate's report on the draft (motion-gate.mjs --json; READ FIRST)", R(run, "crew", "motion-gate.json")], ["project", pj], ["renders", pj && path.join(pj, "renders")], ["snapshots", pj && path.join(pj, "snapshots")], ["decisions", R(run, "video-decisions.json")]],
        grounding: [["project", pj], ["claims", research("claims.json")], ["truth", R(run, "story", "truth.md")], ["screens", research("screens.json")]],
      }[lens];
      if (!byLens) die(`unknown critic lens "${lens}" (frames, motion, film, grounding)`);
      if (LYR(run, P)) { ctx.lyric_video = true; common.push(["lyrics (word timings)", R(run, "music", "lyrics.json")], ["audio (downbeats)", R(run, "music", "audio.json")], ["chosen treatment", R(run, "story", "chosen-treatment.json")], ["lyric-video playbook", path.join(SKILL_DIR, "references", "lyric-video.md")]); }
      // picture-first: the draft at each board's peak next to the approved board (frames.mjs match), judged by eye
      if (["motion", "film"].includes(lens) && exists(R(run, "frames", "shots.json"))) byLens.push(["the boards vs the draft at each board's peak (frames.mjs match --run <run> --video <draft.mp4>: does the built film look like the approved pictures? hero, crop, ground, focus, type sizes)", R(run, "frames", "match.png")], ["the match numbers (SSIM on a 160x90 grey downscale, for the record)", R(run, "frames", "match.json")]);
      for (const [l, p] of [...byLens, ...common]) I(l, p);
      O(R(run, "crew", `critic-${lens}-${Number(round) || 1}.json`));
      break;
    }
    case "footage-logger": {
      if (!key) die("footage-logger needs --key <bin id> (footage/ingest.json lists the bins)");
      const sj = jsonMaybe(R(run, "footage", "shots.json")) || { clips: [] };
      const mine = (sj.clips || []).filter((c) => c.bin === key);
      Object.assign(ctx, { bin: key, clips: mine.map((c) => c.clip), shots: mine.reduce((a, c) => a + c.shots.length, 0), subject: P.subject, kind: B.kind, length_s: B.length_s });
      I("shots: keyframes, strips, quality flags and Apple Vision results for every shot", R(run, "footage", "shots.json")); I("ingest (clips, bins, colour, sync)", R(run, "footage", "ingest.json"));
      I("transcripts (words with confidence and speaker)", R(run, "footage", "transcripts")); I("transcript.md (readable)", R(run, "footage", "transcript.md")); I("names glossary", R(run, "footage", "names.json"));
      I("keyframes and strips (look at every one)", R(run, "footage", "keyframes")); I("the footage desk's guide", path.join(SKILL_DIR, "references", "sources.md"));
      O(R(run, "footage", `log-${key}.json`)); O(R(run, "footage", `LOG-${key}.md`));
      break;
    }
    case "selects-producer":
      Object.assign(ctx, { subject: P.subject, kind: B.kind, length_s: B.length_s, case: P.sources ? P.sources.case : null });
      I("the log (every shot, rated)", R(run, "footage", "log.json")); I("LOG notes per bin", R(run, "footage")); I("transcripts", R(run, "footage", "transcripts")); I("transcript.md", R(run, "footage", "transcript.md"));
      I("sentence candidates with word-aligned in/out (a draft)", R(run, "footage", "bites-candidates.json")); I("shots", R(run, "footage", "shots.json")); I("names glossary", R(run, "footage", "names.json")); I("approvals (who may appear)", R(run, "footage", "approvals.json"));
      I("claims ledger (when the research ran)", research("claims.json")); I("the footage desk's guide", path.join(SKILL_DIR, "references", "sources.md"));
      O(R(run, "footage", "selects.json")); O(R(run, "footage", "SELECTS.md"));
      break;
    case "footage-writer": {
      if (!key) die("footage-writer needs --key Sure|Bold|Wild");
      const stance = { sure: "Sure: the clearest chronological or problem-to-result paper edit from the top-rated bites.", bold: "Bold: a stronger structure: a cold open on the turn, a refrain bite, a J/L-cut rhythm, or a montage that lands on a line.", wild: "Wild: a formal idea the footage can really carry (one continuous moment intercut with the whole story, a countdown, a film built from the gold moments with one line of voice)." }[String(key).toLowerCase()];
      Object.assign(ctx, { label: key, stance: stance || "(Sure, Bold or Wild)", subject: P.subject, kind: B.kind, length_s: B.length_s, aspect: B.aspect, case: P.sources ? P.sources.case : null, footage_first: "yes: a film cut from footage. The hook is a rated 4+ bite or a gold moment and plays at once; no product-first rules, no conceit devices the footage cannot carry. Check with footage.mjs check-paper." });
      for (const [l, p] of [["selects (bites, moments, themes, people, gaps, story candidates)", R(run, "footage", "selects.json")], ["SELECTS.md", R(run, "footage", "SELECTS.md")], ["the log", R(run, "footage", "log.json")], ["transcripts", R(run, "footage", "transcripts")], ["names glossary", R(run, "footage", "names.json")], ["approvals", R(run, "footage", "approvals.json")], ["truth sheet (a ## Material section)", R(run, "story", "truth.md")], ["claims ledger", research("claims.json")], ["briefing", research("BRIEFING.md")], ["brand kit rules", research("brand/KIT.md")], ["brand DESIGN.md", research("brand/DESIGN.md")], ["the footage desk's guide (shapes, radio edit, b-roll, joins, lower thirds, gaps)", path.join(SKILL_DIR, "references", "sources.md")]]) I(l, p);
      ctx.gate = `node "${path.join(SKILL_DIR, "scripts", "footage.mjs")}" check-paper --run ${rel(run)} --paper story/paper-${key}.json --length ${B.length_s || ""}`;
      O(R(run, "story", `paper-${key}.json`)); O(R(run, "story", `PAPER-${key}.md`));
      break;
    }
    case "ab-juror": {
      // the blind A/B (crew.mjs ab): only the X / Y strips go in; the order (which is the new version) stays in crew/ab-<k>.json, out of the brief
      const k = key || String(abLatest(run) || "");
      const rec = jsonMaybe(R(run, "crew", `ab-${k}.json`));
      if (!rec) die(`no crew/ab-${k}.json: run crew.mjs ab first`);
      ctx.key = k;
      ctx.films = "two, called X and Y; their order is not known to you or to anyone who briefed you";
      for (const [l, p] of [["rows of moments, X on the left and Y on the right, the same seconds (the endings last); read at 100%", rec.strips.rows[0]], ...rec.strips.rows.slice(1).map((r, i) => [`more rows (${i + 2})`, r]), ["X on a phone (every second at 360 px)", rec.strips.phone_X], ["Y on a phone (every second at 360 px)", rec.strips.phone_Y]]) I(l, path.resolve(WS, p));
      if (rec.plan) I("the score (what each beat means to say; never an excuse for what the frames do not show)", path.resolve(WS, rec.plan));
      O(R(run, "crew", `ab-${k}-verdict.json`));
      break;
    }
    case "retrospective": {
      ctx.lessons_cmd = `node "${path.join(SKILL_DIR, "scripts", "lessons.mjs")}" list --json`;
      ctx.repeated_notes_cmd = `node "${path.join(SKILL_DIR, "scripts", "lessons.mjs")}" suggest --json`; // notes the user repeated that are not rules yet (the raw ledger behind the one store)
      for (const [l, p] of [["the crew ledger (briefs, accepted and refused checks)", R(run, "crew", "ledger.jsonl")], ["the motion gate's report on the last draft", R(run, "crew", "motion-gate.json")], ["the critics' rounds (crew/critic-<lens>-<round>.json)", R(run, "crew")], ["every blind A/B and its verdict (crew/ab-<k>.json, ab-<k>-verdict.json)", R(run, "crew")], ["the Director's decisions and the reasons the old calls lost", R(run, "decisions.json")], ["the console session: the user's notes and what was applied", R(run, "session.json")], ["the frame gate's report", R(run, "frames", "gate.json")]]) I(l, p);
      O(R(run, "crew", "retrospective.json"));
      break;
    }
    case "brand-kit-builder": {
      const kit = ((P.sources && P.sources.sources) || []).filter((x) => x.kind === "assets").map((x) => x.path);
      const entry = ((P.phases || []).flatMap((ph) => ph.dispatch).find((x) => x.role === "brand-kit-builder") || {}).kit_paths || [];
      const ent = (P.phases || []).flatMap((ph) => ph.dispatch).find((x) => x.role === "brand-kit-builder") || {};
      Object.assign(ctx, { subject: P.subject, kit_paths: entry.length ? entry : kit, public: !!P.public, verify_url: ent.verify_url || null });
      I("local notes", research("local.md")); I("workspace_design_md", dsn ? path.resolve(dsn) : null); I("footage shots (the rushes' own grade, when there is no earlier film)", R(run, "footage", "shots.json"));
      O(research("brand/DESIGN.md")); O(research("brand/assets") + "/"); O(research("brand/assets/logos.json")); O(research("brand/fonts") + "/"); O(research("brand/KIT.md")); O(research("brand.md"));
      break;
    }
    default:
      die(`unknown role "${role}". Roles: ${Object.keys(ROLES).join(", ")}`);
  }
  if (["motion-director", "film-builder", "scene-animator"].includes(role) && exists(R(run, "art"))) {
    I("art assets (the film's own pictures, with their paths and treatments: use them, never stock images or a re-draw)", R(run, "art", "assets.json"));
    I("ART.md (the picture world in a paragraph, and the asset sheet)", R(run, "art", "ART.md"));
  }
  // picture-first: the approved boards are the visual target of the score and the build (references/styleframes.md)
  if (["motion-director", "film-builder", "scene-animator"].includes(role) && key !== "seams" && exists(R(run, "frames", "shots.json"))) {
    const doc = readShots(R(run, "frames", "shots.json"));
    if (role === "motion-director") {
      ctx.boards = "yes: the film was designed as pictures first. READ frames/shots.json, LOOK at every frames/<id>.png and read frames/verdict.json BEFORE you score: each beat names its `board` (frames/<id>.png) and copies its `size` and `hero`; your job is to animate between approved boards (what moves to get from board N to N+1, the entrances, the camera legs, the seams). Changing a board's size, hero, crop, ground or type sizes needs an entry in score.deviations [{beat, field, why}]";
      inputs.unshift(["the approved boards (frames/<id>.png: READ FIRST, the picture of every beat)", R(run, "frames")], ["the shot list (size, hero, angle, focus, light, ground, type sizes, crop, device per beat)", R(run, "frames", "shots.json")], ["the juror's verdict and the reference stills each board was judged against", R(run, "frames", "verdict.json")]);
    } else if (role === "film-builder") {
      ctx.boards = "yes: frames/<id>.png are the approved boards, your visual target. At each beat's peak the film looks like its board: the same hero, size, crop, ground, light, focus planes and type sizes (frames.mjs match puts the draft next to them for the critics)";
      inputs.unshift(["the approved boards (frames/<id>.png): your visual target, one per beat", R(run, "frames")], ["the shot list (size, hero, angle, focus, light, ground, type sizes, crop per beat)", R(run, "frames", "shots.json")]);
    } else {
      const n = Number(key), sc = ((jsonMaybe(R(run, "motion", "score.json")) || {}).scenes || [])[n - 1];
      const shot = doc && boardFor(sc, n - 1, doc);
      if (shot) { ctx.board = `frames/${shot.id}.png (${String(shot.size || "").toUpperCase()} · ${shot.hero || ""}): your visual target at the scene's peak`; inputs.unshift([`your board (the approved picture of this scene)`, R(run, "frames", `${shot.id}.png`)]); }
      I("the shot list (your board's size, hero, angle, focus, light, ground, type sizes, crop)", R(run, "frames", "shots.json"));
    }
  }
  for (const kv of str(args.set).split(",").filter(Boolean)) {
    const i = kv.indexOf("=");
    if (i > 0 && !kv.startsWith("path=")) ctx[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return { ctx, inputs: inputs.map(([l, p]) => ({ label: l, path: p ? rel(p) : null, exists: exists(p) })), outputs: outputs.map((p) => (path.isAbsolute(p) ? rel(p) : p)) };
}

// the vocabulary rows a scene's score names, plus the animation principles, inlined for the animator
function vocabularyFor(terms) {
  const v = readMaybe(path.join(SKILL_DIR, "references", "vocabulary.md"));
  if (!v) return "";
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z]/g, "");
  // "cut", "cut-in", "push" and "slide" are baselines, not techniques: they'd match half the vocabulary
  const want = [...new Set(terms.map(norm).filter((t) => t.length >= 4 && !["cutin", "push", "slide"].includes(t)))];
  const rows = [];
  for (const line of v.split("\n")) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|/);
    if (!m || /^-+$/.test(m[1].replace(/\s/g, "")) || m[1] === "Term") continue;
    const t = norm(m[1].split("(")[0]);
    if (t.length >= 4 && want.some((w) => t === w || (Math.min(t.length, w.length) >= 5 && (t.startsWith(w) || w.startsWith(t))))) rows.push(line);
  }
  const principles = (v.match(/## 6\. Animation principles[\s\S]*?(?=\n## 7\.)/) || [""])[0].trim();
  return [rows.length ? `### The techniques your score names\n\n| Term | What it is | Recipe |\n|---|---|---|\n${[...new Set(rows)].join("\n")}` : "", principles ? `### ${principles.replace(/^## /, "")}` : ""].filter(Boolean).join("\n\n");
}

// the film's grammar, inlined for the builders: its frame device, type and image behaviour, signature, and the techniques
// (with their build routes) the score's beats name, like the vocabulary recipes. "" when the run has no grammar file.
function grammarBlock(run, scenes) {
  const g = readRunGrammar(run);
  if (!g || typeof g !== "object") return "";
  const named = techniquesNamed(g, scenes.map((s) => s && s.technique));
  const beats = scenes.filter((s) => s && (s.technique || s.frame_device)).map((s) => ({ scene: s.n, technique: s.technique, frame_device: s.frame_device }));
  const core = { id: g.id, name: g.name, frame_device: g.frame_device, type: g.type, image: g.image, transitions: g.transitions, signature: g.signature, density: g.density, palette: g.palette, do: g.do, dont: g.dont };
  return `\n\n## The film's motion grammar (look/grammar.json): ONE grammar, each beat's technique from what it means\n\n\`\`\`json\n${JSON.stringify(core, null, 2)}\n\`\`\`\n\n${beats.length ? `The score's beats:\n\n\`\`\`json\n${JSON.stringify(beats, null, 2)}\n\`\`\`\n\n` : ""}${named.length ? `### The techniques the score names (build each by its route)\n\n\`\`\`json\n${JSON.stringify(named, null, 2)}\n\`\`\`` : ""}`;
}

// Claude does its best motion work when it's told to show off. Every creative prompt ends on that ask: the last
// thing a member reads, after the inputs, so it isn't lost under them.
const DARES = {
  "art-director": "Make art a studio would sign. One consistent world: every picture drawn by the same hand, with the same line weight, palette and light, so the film looks art-directed, not assembled. No stock-looking images (a smiling person at a laptop, a glowing 3D orb, a gradient blob), and none of the AI-slop tells (waxy skin, melted text, extra fingers, a plastic sheen, rainbow gradients). Look at every picture on the contact sheet and throw out the weak ones: regenerate until each one is a picture you would keep on the wall. Treat the photos (cut out, gradient-mapped, duotone) so they belong to the world, and trace the line art so the shape kit can draw it on.",
  "motion-director": "Show off where the intent spends, and prove it in the score. For the peak and each importance-3 beat, write three candidate moves from the beat's verb that differ in kind (a carried object; a camera or space move, real 3D included: Rasan3D is an open engine, so invent the technique the shot needs; a type or shape transformation), pick one and say why in `take`. Land 2 to 4 showreel moments there, and make the peak the one a motion designer rewinds. Keep the importance-1 beats calm: restraint there is what makes the peak land. If a taste rule is the one thing between you and the shot, override it in score.intent with a reason of 12+ characters. The critics reject a competent score nobody would remember, and they also reject a film whose biggest moment is on the wrong beat.",
  seams: "Show off at the seams. A cut that merely doesn't pop is the minimum. Make the signature transition the best two seconds of the film, and make the continuity seams so clean the viewer only notices them on the second watch. Where 2D meets 3D, the frames on both sides must match to the pixel and the colour: that exact match is the trick people rewind to see.",
  "scene-animator": "Show off. This scene is going on your reel. Your first version will be the safe one (things fade and slide in, the UI appears, the text types; in 3D, an object turning in a void under a flat light): throw that instinct out and build the shot another motion designer would freeze-frame to work out how you did it, inside motion.md and the anti-slop rules: a curve per role, durations from travel, gestures that overlap, secondaries that trail, a settle on the hero landing, a living camera. You are the inventor, not a picker: if the shot needs a technique no preset gives (a raymarched world, an engraved or stippled shading, a simulation, a custom post pass, a portal, a card pinned in 3D), write it yourself in GLSL or raw three.js (references/3d.md); the design system is the only bound on the look. If the gate warns on something you did on purpose, declare it (declare.intent, a rule id and your reason of 12+ characters). If your scene has depth, brag with it: a lens chosen for a reason, light that agrees with itself, a camera move that lands, motion blur on the fast frames, a seam that matches the 2D scene to the pixel. Then look at your strips and ask whether it's reel-worthy. If it's only fine, it isn't done.",
  "film-builder": "Show off. You hold the whole film in one mind, which no team of parallel animators can: use it. The boards are approved; make them move the way a senior motion designer would. Your first version will be the machine one: every move on the same curve and the same 0.45 s, one thing at a time, nothing settling, straight lines. Throw that out. Give each move its role's curve and a duration from its travel, let the next gesture start before the last one lands, trail secondaries a few frames behind, bend the paths, land the hero with a settle, keep the camera alive, carry objects across the cuts and make the product's UI answer each action like the real product. Build every hero move as a 4-6 pose board first, then look at it in a 24 fps strip next to its board and fix the frame that does not read. Land the plan's showreel moments to the frame. If a motion designer would not rewind it, it isn't done.",
  "frame-designer": "Show off. Your boards sit between the hero styleframes, and the user sees them side by side with reference stills: a board that looks like a screenshot next to a Kinso frame is the failure. Copy the heroes' light, ground, device and type ladder exactly; change the shot size from your neighbours; isolate one hero at 3 to 6x with real labels; put a camera on it (a lens, a yaw under 35 degrees, a contact shadow), real depth of field and a giant-against-tiny type moment where the beat allows. Each board should be good enough to be the film's poster. For beats the score or the shot list puts in 3D, draw them in real 3D (Rasan3D, references/3d.md).",
  "styleframe-designer": "Show off. x1 already beat the pipeline on 6 of 8 frames with one rule set: a different shot size every frame (macro, object, giant type, wide); real depth of field (a sharp copy and a blurred copy of the same plane, layers blurred by distance) so the blur says where to look; ONE hero per frame, the product rebuilt as DOM at 3 to 6x with real labels; a camera angle (one lens, a yaw of 15 to 35 degrees on two axes at most) with a contact shadow on the ground; words and UI touching at very different sizes (a 210 px line inside a 14 px-labelled component); a lit, tinted ground a few percent darker than the UI. That is the floor, not the bar. Then the poster test on every frame: squint for one brightest and one darkest region, 3 to 4 hues, one focal mass; would it hang next to the reference still you picked for it? Beat x1 where it fell short: light with colour (a rim in the product's own functional colours on the hero moment), a real material (glass, thickness, a specular edge), a type-UI collision only motion can finish. Name your three rewind frames, draw two compositions for each hero and keep the stronger, and revise every frame that would look weaker next to its reference.",
  "ab-juror": "Be the motion designer who has two films in front of you and one slot on the reel. Pick the one you would rewind, by quoted seconds, and take the riskier film that is still sound over the tidier one. You are never told which came first: a guess about that is not a reason.",
  retrospective: "Be a coach with two minutes: keep only a rule that repeated or cost a round, in one imperative line another film could use. Zero rules is a good answer; a wise-sounding rule the files do not support is not.",
  "frame-juror": "Be the creative director who has just watched Kinso, Sovra and Google's launch films and is shown these boards next to them. A board that is clean, centred and correct but would look weaker in that reel is below, and you say exactly what would lift it (size, crop, focus, light, type scale, with numbers). Find the weakest frame first. Never pass a frame because it follows the shot list.",
  "treatment-writer": "Show off. Two other writers pitch against you. Do the method at the end of your role in full: ban the three obvious treatments, overgenerate the concept and the peak plate, pick by the swap test, rewrite bolder and say what changed. If a plate's idea is just the lyric restated, you are not done.",
  "visual-writer": "Show off. Two other writers are staging this same talk against you, and the user will pick one. Write the one that wins the room, not the one that merely passes presenter.mjs check: one running visual idea the whole talk happens inside, images that argue with the sentence instead of illustrating it, at least one cutaway that lands on a word, and one moment where the person interacts with the world (points at it, steps into it, is framed by it). If a plate is just the sentence drawn as a picture, you are not done.",
  "move-inventor": "Read the pack's bar before anything and match its density and scale (the bar, never its content). Show off. This is the strongest version of the job: you are the designer whose move gets rewound, not the one who labels a transition. Do every step of the method even if you think you do not need to: the three obvious ideas come first and are banned, then 20 candidates, then rewrite them bolder and different and show what you changed. Give the film one carrier that travels through every beat, and a bridge frame at every boundary where both scenes are true at once. A card that names a technique instead of an object crossing the cut is a fail; a card a juror would call competent is a fail.",
  "move-juror": "Be the client burned by generic work. Judge each card blind, by the binary gates, quoting the card; when two survivors are close choose the riskier one that is still sound. A competent, tidy move that you have seen in ten launch films does not pass.",
  "move-sketcher": "The rough must make the idea legible in one loop. Timing is the idea: follow the card's move exactly, in its seconds and eases. Grey-box, no styling, one accent for the carrier. If the idea only works with a trick the rough cannot show, build the simplest version that keeps it and say so.",
  "footage-writer": "Show off. Two other editors are cutting the same material against you, and the user will pick one. First list five candidate hooks from the selects (rated 4+ bites and gold moments) and choose the one that makes a stranger stay by feeling, not by information. Then cut the radio edit so it works as audio alone, and let picture and sound cross at different times at least twice (a J-cut that lands the next face as its first word arrives, an L-cut that lets a line finish over the next shot). Cover every join with a shot that adds meaning. Write the paper edit an editor would be proud to hand over: the film a viewer feels, not a tidy transcript. If it is only correct, it is not done.",
  "selects-producer": "Show off. Find what the Director would have missed: the line a viewer would repeat to a friend, the two seconds nobody planned, the shot where the light or a face does the telling. Rate on the feeling first. Overgenerate: pull at least twice as many candidates as you keep, then drop the ones that only inform. A selects list of competent bites is the failure: the film is in the five you would fight for.",
  "script-writer": "Show off with the argument, not the adjectives. Two other writers pitch against you. Do the method at the end of your role in full: the three obvious films first, banned; eight turns and five endings; pick by the retell and the swap; then rewrite it bolder and write down what changed. A script that is only correct loses the room.",
  "script-editor": "Be the hardest reader in the room. Retell blind first; a script whose retell misses its proposition is a rewrite whatever its polish. Recommend the clearest true argument, not the safest script.",
  "concept-critic": "Be the last cheap chance. A script with no reversing turn, or a payoff that doesn't answer its opening, fails now, before hours are spent on it.",
  "structure-critic": "Be the editor with scissors. You are the only critic allowed to cut a beat: use it. A film with every beat kept and the peak where the writer put it needs a reason in the summary.",
  "design-researcher": "Show off. The generic version of this job returns the category's own look and a list of famous styles. Return the subject's visual world as only someone who went looking would know it: the real materials, places, eras and printed things around this product or topic, the clichés a lazy design pass would reach for (named, so the desk avoids them), and a shortlist of library references chosen because they are surprising and right for THIS subject, not because they are famous. If two of your references would make an obvious blend, replace one.",
  "design-system-designer": "Show off. This is the pitch: the user sees three systems for their story, and yours is drawn live on their own first line. Don't hand in the tasteful default (a neutral ground, one accent, a grotesk, a rounded card): build the system a top studio would present, one a motion designer could animate for a year and never repeat. Blend 2 to 4 references so the result is something no single reference is, put the subject's own visual world in it (its materials, its places, its printed things), choose a display face with a point of view, and write the motion and camera language as precisely as a director's note (durations, holds, eases by name, the camera's lens and moves). The gate rejects a generic or near-duplicate system; the user rejects a forgettable one.",
  critic: "Be the push. Competent is a fail: Claude's unpushed default is clean, tidy and forgettable, and you are the reason it doesn't ship. Score ambition honestly and, wherever the work played it safe, say exactly how it could have shown off: in 2D, and in space (a scene that should have had depth, a 3D shot that looks like the three.js demo or a preset where the shot called for an invented technique, a 2D-to-3D seam that pops). Read the gate's declared intents: an intent is a claim, so check it holds on screen.",
};

function promptFor(run, role, key, plan) {
  const { ctx, inputs, outputs } = contextFor(run, role, key, plan);
  const shared = fs.readFileSync(path.join(AGENTS, "_crew.md"), "utf8").trim();
  const roleText = fs.readFileSync(path.join(AGENTS, `${role}.md`), "utf8").trim();
  const checkCmd = `node "${path.join(SKILL_DIR, "scripts", "crew.mjs")}" check --run "${ctx.RUN}" --role ${role}${key ? ` --key ${key}` : ""}${ctx.project ? ` --project "${ctx.project}"` : ""}`;
  const fmtVal = (v) => (typeof v === "object" ? "`" + JSON.stringify(v) + "`" : String(v));
  const lines = [
    "## Dispatch context",
    "",
    "Paths are relative to WORKSPACE (run every command from there). `$RUN` and `$SKILL_DIR` below mean these exact values; shell variables do not carry over between your commands, so write them out.",
    "",
    ...Object.entries(ctx).filter(([, v]) => v != null && v !== "").map(([k, v]) => `- **${k}**: ${fmtVal(v)}`),
    "",
    "**Inputs**",
    "",
    ...inputs.map((i) => `- ${i.label}: ${i.path ? "`" + i.path + "`" : "(none)"}${i.exists ? "" : " (not there: work without it)"}`),
    "",
    "**Your outputs** (write only these)",
    "",
    ...outputs.map((o) => `- \`${o}\``),
    "",
    `**Check** (must exit 0 before you finish): \`${checkCmd}\``,
  ];
  let extra = "";
  if (role === "scene-animator") {
    const score = jsonMaybe(R(run, "motion", "score.json"));
    const n = Number(key);
    if (score && Array.isArray(score.scenes)) {
      const sc = score.scenes.find((s) => Number(s.n) === n);
      const seams = (score.seams || []).filter((s) => Number(s.from) === n || Number(s.to) === n);
      if (sc) extra += `\n\n## Your scene in the score\n\n\`\`\`json\n${JSON.stringify({ scene: sc, seams, spine: score.spine, motif: score.motif, signature: score.signature, video_direction: score.video_direction }, null, 2)}\n\`\`\``;
      const terms = [...(sc ? sc.techniques || [] : []), ...seams.map((s) => s.kind), ...((sc && sc.entrances) || []).map((e) => e.type), sc && sc.camera ? String(sc.camera).replace(/^T\d\s*/, "") : ""].filter(Boolean);
      const vocab = vocabularyFor(terms);
      if (vocab) extra += `\n\n## Technique recipes (from references/vocabulary.md)\n\n${vocab}`;
      extra += grammarBlock(run, [sc]);
      if (is3d(sc)) {
        const pj2 = projectDir(run);
        const pk = pj2 && exists(path.join(pj2, ".hyperframes", "frame-packets")) ? fs.readdirSync(path.join(pj2, ".hyperframes", "frame-packets")).find((f) => new RegExp(`^0*${n}[-_.]`).test(f) && f.endsWith(".md")) : null;
        const fid = pk ? pk.replace(/\.md$/, "") : `<frame_id>`;
        const S3 = `node "${path.join(SKILL_DIR, "scripts", "stage3d.mjs")}"`;
        extra += `\n\n## Your scene is ${sc.space === "3d" ? "3D" : "hybrid 2D + 3D"}\n\nRead \`references/3d.md\` in full before you write a line: it is the API, the camera and light language, the 2D ↔ 3D seams and the gate. Build it with Rasan3D, from the template, never from a blank file:\n\n\`\`\`bash\n${S3} install --project "${ctx.project}"\n${S3} scaffold --project "${ctx.project}" --frame ${fid} --duration ${sc.duration} --canvas "<frame.md canvas>" --ink "<ink>" --accent "<accent>"\n${S3} stills --file ${ctx.project}/compositions/frames/${fid}.html --at <the peak and each landing> --out ${rel(R(run, "crew", "animators", `${n}-3d`))}\n${S3} check --project "${ctx.project}" --file ${ctx.project}/compositions/frames/${fid}.html\n\`\`\`\n\nThe score's \`camera3d\` (lens and legs), \`light\` and \`materials\` are your brief. Your seams with 2D neighbours are pixel contracts (flat-to-depth / depth-to-flat: \`k.layout\` at the handoff numbers). Strips (\`crew.mjs strip\`) of this file wait for the 3D build and show the real motion blur. Report a \`## 3D\` section: the lens and why, the light and why, what each object is made of, how the seams match, and the frame cost the gate measured.`;
      }
    }
  }
  if (role === "scene-animator" || role === "film-builder") {
    // the Moves pass: the hero moves the Motion Director placed are the builder's motion target. A scene animator gets the
    // cards of its own scene; the film builder (direct path: the whole film; long path, key "lead": the carriers) gets every
    // used card, and builds story/moves.json's carrier as the film's one carrier object.
    const mvj = jsonMaybe(R(run, "story", "moves.json")), sco = jsonMaybe(R(run, "motion", "score.json"));
    const n = Number(key);
    const own = role === "film-builder";
    if (mvj && sco && Array.isArray(sco.moves) && Array.isArray(mvj.cards)) {
      const mine = sco.moves.filter((e) => {
        if (!e || e.status !== "used") return false;
        if (own) return true;
        const sm = String(e.seam || "").match(/(\d+)\s*>\s*(\d+)/);
        return Number(e.scene) === n || (sm && (Number(sm[1]) === n || Number(sm[2]) === n));
      });
      const blocks = mine.map((e) => {
        const card = mvj.cards.find((c) => c && c.id === e.id);
        if (!card) return "";
        const d = R(run, "story", "moves", `${mvj.label}-${e.id}`);
        const files = ["rough.mp4", "strip.png", "rough.html"].filter((f) => exists(path.join(d, f))).map((f) => `\`${rel(path.join(d, f))}\``);
        return `### Move ${e.id}: ${card.title}${e.scene ? ` (scene ${e.scene})` : ""}${e.seam ? ` (seam ${e.seam})` : ""}\n\n\`\`\`json\n${JSON.stringify(card, null, 2)}\n\`\`\`\n\nThe rough (a grey-box of the timing; look at its strip, play the mp4): ${files.length ? files.join(", ") : "(none rendered)"}`;
      }).filter(Boolean);
      const car = mvj.carrier && mvj.carrier.what ? `**${mvj.carrier.what}**` : "set in story/moves.json";
      if (blocks.length) extra += own
        ? `\n\n## Your motion target (the Moves pass)\n\nThe film's carrier (story/moves.json \`carrier\`) is ${car}: it is the carrier object you build, one object on one tween through every beat it crosses${key === "lead" ? " (as the lead builder you build it, and every other object that crosses a cut, before the scene animators start)" : ""}. The hero move card(s) below are your motion target: the card and its rough are the target, not a ceiling. Beat the rough, don't copy its grey-box look (the look comes from DESIGN.md and frame.md). Keep each bridge frame (the one frame where both states are true) exact, and the hand-off to the next beat as the card states it. If a card cannot be built as written, build its \`build.simplest\`, say why in your report, and never replace the move with a label.\n\n${blocks.join("\n\n")}`
        : `\n\n## Your motion target (the Moves pass)\n\nThe film's carrier is ${car}. This scene carries the move card(s) below: the card and its rough are your motion target. Beat it, don't copy its grey-box look: the look comes from DESIGN.md and frame.md. Keep the bridge frame (the one frame where both states are true) exact, and the hand-off to the next beat as the card states it.\n\n${blocks.join("\n\n")}`;
    }
  }
  if (role === "film-builder") {
    const sc0 = jsonMaybe(R(run, "motion", "score.json"));
    extra += grammarBlock(run, sc0 && Array.isArray(sc0.scenes) ? sc0.scenes : []);
  }
  if (role === "scene-animator" && LYR(run, plan)) {
    const sc = scenesOf(run)[Number(key) - 1];
    const L = jsonMaybe(R(run, "music", "lyrics.json"));
    if (sc && L && Array.isArray(L.lines) && Array.isArray(sc.lines)) {
      const rows = sc.lines.map((i) => L.lines[i]).filter(Boolean).map((l) => ({ text: l.text, start: l.start, end: l.end, words: (l.words || []).map((w) => [w.w, w.start, w.end]) }));
      extra += `\n\n## Your plate's words (absolute song seconds; the scene starts at ${sc.start}s)\n\n\`\`\`json\n${JSON.stringify({ plate: sc.plate, start: sc.start, end: sc.end, idiom: sc.idiom, space: sc.space, energy: sc.energy, lines: rows }, null, 2)}\n\`\`\`\n\nKaraoke rules: every word appears or lights on its sung \`start\` and completes by its \`end\`; nothing ahead of the voice (a dim anticipation up to 0.4 s is fine); look words up through RasanMusic (\`gsapWords\`, \`wordProgress\`), never hard-coded times; words are part of the image, not a subtitle; safe area 96 px. Read references/lyrics.md for the calls and references/lyric-video.md section 5.`;
    }
  }
  if (role === "treatment-writer") extra += `\n\n## Start from the skeleton\n\nRun this first (it lays out the plates, starts snapped to downbeats), then fill it in:\n\n\`${ctx.skeleton}\``;
  if (role === "motion-director" && key !== "seams") {
    const vocab = readMaybe(path.join(SKILL_DIR, "references", "vocabulary.md"));
    if (vocab) extra += "\n\n(Read `references/vocabulary.md` in full: it is the motion vocabulary your score names techniques from.)";
  }
  if (role === "motion-director" && key !== "seams") {
    const rf = recentFilms(RECENT);
    extra += `\n\n## Your film's shape (score.shape)\n\nName it in motion/score.json: ${ASPECTS.map((k) => `${k} (${SHAPE_VOCAB[k].join("|")})`).join("; ")}. It must differ from each of the last ${RECENT} films in at least ${MIN_DIFFER} of the 6 aspects (crew.mjs check refuses \`same-shape\`; a series or an explicit ask for the same is a \`shape_waiver\` with a reason).\n${rf.length ? rf.map((f) => `- ${f.title}${f.date ? ` (${f.date})` : ""}: ${shapeLine(f.shape)}`).join("\n") : "- (no film recorded yet: nothing to move away from)"}`;
  }
  { const lb = lessonsBlock(role).trim(); if (lb) extra += `\n\n${lb}`; } // the ONE past-films block: standing notes from lessons.mjs plus its short "Recent verdicts" line (from the raw taste ledger); only the roles it lists get any
  let dare = DARES[role === "motion-director" && key === "seams" ? "seams" : role];
  if (dare && ctx.product_first) dare += " On this product-first film, showing off is craft only (motion, UI choreography, rhythm, the real product moving like nothing else): a letter or shape transformation that lands on the real product (its UI, its mark) is craft and is wanted, full frame and fast; never a conceit, a metaphor, an invented world or a prop standing in for the product. A show-off idea that never resolves to the product fails.";
  const base = `${shared}\n\n---\n\n${roleText}\n\n---\n\n${lines.join("\n")}${extra}\n`;
  // the prompt adapts to the model that runs the member (same goal and bar; different wording and scaffolding)
  return { text: adapt({ role, text: base, dare, profile: modelOf(plan) }), ctx, inputs, outputs };
}

// ---------------------------------------------------------------- checks
const URL_RE = /https?:\/\/[^\s)>\]"']+/g;
function sections(md, names) {
  const missing = [];
  for (const n of names) if (!new RegExp(`^##\\s+${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "mi").test(md)) missing.push(`missing section "## ${n}"`);
  return missing;
}
function claimsProblems(file, min, label) {
  const p = [];
  const c = jsonMaybe(file);
  if (c === null) return [`${rel(file)} is missing`];
  if (c === undefined) return [`${rel(file)} is not valid JSON`];
  const list = Array.isArray(c) ? c : c.claims || [];
  if (list.length < min) p.push(`${label}: ${list.length} claims, need at least ${min}`);
  const unsourced = list.filter((x) => !x || !String(x.source || "").trim());
  if (unsourced.length) p.push(`${label}: ${unsourced.length} claims without a source (first: ${JSON.stringify((unsourced[0] || {}).claim || unsourced[0]).slice(0, 80)})`);
  const noText = list.filter((x) => x && !String(x.claim || "").trim());
  if (noText.length) p.push(`${label}: ${noText.length} claims with no "claim" text`);
  return p;
}
const ENTRANCES = ["mask-rise", "scale-from-origin", "draw-on", "clip-reveal", "cut-in", "type-on", "count-up", "morph", "stream", "slide", "push"];
const SEAM_KINDS = ["cut", "match-cut", "shared-element", "carried-object", "flood", "iris", "mask", "push-through", "mask-line", "flat-to-depth", "depth-to-flat", "camera-through", "signature", "whip", "zoom-through", "smash-cut", "dissolve"];
const CONTINUITY = new Set(["match-cut", "shared-element", "carried-object", "flood", "iris", "mask", "push-through", "mask-line", "flat-to-depth", "depth-to-flat", "camera-through"]);
// 2D <-> 3D: every scene has a space; 3D and hybrid scenes are built with Rasan3D (references/3d.md)
const SPACES = ["2d", "3d", "hybrid"];
const is3d = (s) => s && (s.space === "3d" || s.space === "hybrid");
const HANDOFF = ["x", "y", "scale", "opacity", "direction", "speed"];

// Taste rules in the score are overridable: a reason of 12+ characters in score.intent["<rule>"] (film-wide) or
// scene.intent["<rule>"] (one scene) turns the rule into a note. Structural rules (missing fields, durations,
// seam handoffs, the numbers that make a seam renderable) are not overridable.
const MIN_INTENT = 12;
function checkScore(run) {
  const P = [], W = [];
  const score = jsonMaybe(R(run, "motion", "score.json"));
  if (score === null) return { P: ["motion/score.json is missing"], W };
  if (score === undefined) return { P: ["motion/score.json is not valid JSON"], W };
  // score.md is generated from score.json (renderScoreMd) on every check: the JSON is the one contract
  const scenes = scenesOf(run);
  const N = scenes.length || (score.scenes || []).length;
  const S = Array.isArray(score.scenes) ? score.scenes : [];
  const why = (rule, sc) => { const r = (sc && sc.intent && sc.intent[rule]) || (score.intent && score.intent[rule]); return typeof r === "string" && r.trim().length >= MIN_INTENT ? r.trim() : null; };
  // a taste rule: an error unless the score states its intent; the message says how to override it
  const T = (rule, msg, sc) => { const r = why(rule, sc); if (r) W.push(`intent "${rule}" (${sc ? "scene " + sc.n : "film"}): ${r}`); else P.push(`${msg} [override: ${sc ? `scenes[${sc.n - 1}]` : "score"}.intent["${rule}"] = "<why this is the shot, 12+ characters>"]`); };
  // a lyric video: the chosen treatment fixes each plate's space, energy and window; the score may not contradict them
  const tr = chosenTreatment(run);
  if (tr && Array.isArray(tr.plates)) {
    const plates = tr.plates.slice().sort((a, b) => a.start - b.start);
    const sig = (tr.style_bible || {}).signal;
    const sigId = sig && typeof sig === "object" ? sig.id || sig.name : sig;
    const sigMotif = (tr.motifs || []).find((m) => m && m.id === sigId) || {};
    const words = `${sigId || ""} ${sigMotif.name || ""}`.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4);
    if (words.length && String(score.spine || "").trim() && !words.some((w) => String(score.spine).toLowerCase().includes(w))) W.push(`the spine doesn't name the treatment's signal ("${sigId}"): in a lyric video the spine is the signal that runs through every plate`);
    if (plates.length && plates.length !== S.length) W.push(`the treatment has ${plates.length} plates and the score ${S.length} scenes (one scene per plate)`);
    plates.forEach((pl, i) => {
      const sc = S[i];
      if (!sc) return;
      if (pl.space && sc.space && pl.space !== sc.space) W.push(`scene ${i + 1} (plate ${pl.id}): the treatment says space "${pl.space}" and the score says "${sc.space}" (the plate's space is fixed)`);
      if (pl.energy != null && sc.energy != null && Math.abs(Number(pl.energy) - Number(sc.energy)) > 1) W.push(`scene ${i + 1} (plate ${pl.id}): the treatment's energy is ${pl.energy} and the score says ${sc.energy} (the plate's energy is fixed; score inside it)`);
    });
  }
  // picked moves are placed on beats (moments_placed: [{id, beat, take, why}]) or dropped with a reason (moments_dropped: [{id, why}])
  {
    const cr = jsonMaybe(R(run, "references", "moments", "credits.json"));
    const picked = cr && Array.isArray(cr.moments) ? cr.moments.map((c) => c && c.id).filter(Boolean) : [];
    const used = new Set([...(Array.isArray(score.moments_placed) ? score.moments_placed : []).map((m) => m && m.id), ...S.map((x) => x && x.moment)].filter(Boolean).map(String));
    const dropped = new Map((Array.isArray(score.moments_dropped) ? score.moments_dropped : []).map((m) => [String(m && m.id), String((m && (m.why || m.reason)) || "").trim()]));
    for (const id of picked) if (!used.has(id) && !dropped.get(id)) W.push(`moment-unplaced: the picked moment ${id} is on no beat (score.moments_placed [{id, beat, take, why}], or score.moments_dropped [{id, why}] with the reason)`);
  }
  if (!String(score.spine || "").trim()) P.push("no spine: name the one device that threads the film");
  // the film's shape: six slugs; it must differ from each of the last 3 recorded films in 4 of 6 aspects (lib/film-shape.mjs)
  {
    const rf = recentFilms(RECENT);
    if (score.shape == null) (rf.length ? P : W).push(`no shape: set score.shape {${ASPECTS.map((k) => `${k}: ${SHAPE_VOCAB[k].slice(0, 3).join("|")}|...`).join(", ")}} (references/score.md section 5 lists each vocabulary)${rf.length ? "" : " (a warning only while no film is recorded; the first film still needs it to be recorded)"}`);
    else {
      const bad = shapeProblems(score.shape);
      if (bad.length) P.push(...bad);
      else {
        const waiver = typeof score.shape_waiver === "string" && score.shape_waiver.trim().length >= MIN_INTENT ? score.shape_waiver.trim() : null;
        for (const c of tooClose(score.shape, rf)) {
          const msg = `same-shape: too close to "${c.title}"${c.date ? ` (${c.date})` : ""}: it differs in ${c.differ} of 6 aspects (needs ${MIN_DIFFER}); shared: ${c.shared.map((k) => `${k} ${score.shape[k]}`).join(", ")}. Change ${MIN_DIFFER - c.differ} more (a series, or the user asked for the same: score.shape_waiver = "<reason, 12+ characters>")`;
          if (waiver) W.push(`${msg} [waived: ${waiver}]`); else P.push(msg);
        }
      }
    }
  }
  const reel = Array.isArray(score.showreel) ? score.showreel.filter((m) => m && String(m.what || "").trim() && Number(m.scene) >= 1) : [];
  if (reel.length < Math.min(2, N || 2)) P.push(`showreel names ${reel.length} moments: name 2 to 4 a motion designer would cut into their reel (if you can't, the score isn't ambitious enough yet)`);
  if (!score.video_direction || ["palette", "motion_grammar", "holds", "negative"].some((k) => !score.video_direction[k])) P.push("video_direction needs palette, motion_grammar, holds and negative");
  if (S.length !== N) P.push(`the score has ${S.length} scenes; scenes.json has ${N}`);
  const length = S.reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const entr = [];
  let t3 = 0;
  for (let i = 0; i < S.length; i++) {
    const s = S[i];
    const n = i + 1;
    if (Number(s.n) !== n) P.push(`scene at position ${n} has n=${s.n} (number scenes 1..${N} in order)`);
    const want = scenes[i] ? Number(scenes[i].duration) : null;
    const dur = Number(s.duration);
    if (!(dur > 0)) P.push(`scene ${n}: no duration`);
    else if (want && Math.abs(dur - want) > Math.max(0.15, want * 0.03)) P.push(`scene ${n}: duration ${dur}s but scenes.json says ${want}s (durations are approved: score inside them)`);
    const shots = Array.isArray(s.shots) ? s.shots : [];
    if (!shots.length) P.push(`scene ${n}: no shots (a time-coded sequence across the whole scene)`);
    else {
      if (Math.abs(Number(shots[0].t0)) > 0.05) P.push(`scene ${n}: the first shot starts at ${shots[0].t0}s, not 0`);
      const last = Number(shots[shots.length - 1].t1);
      if (dur > 0 && Math.abs(last - dur) > 0.15) P.push(`scene ${n}: the last shot ends at ${last}s; the scene is ${dur}s`);
      for (let j = 1; j < shots.length; j++) if (Math.abs(Number(shots[j].t0) - Number(shots[j - 1].t1)) > 0.05) P.push(`scene ${n}: a gap or overlap between shots ${j} and ${j + 1}`);
      shots.forEach((sh, j) => {
        if (!String(sh.on_screen || "").trim() || !String(sh.moves || "").trim()) P.push(`scene ${n} shot ${j + 1}: needs on_screen and moves`);
        if (!String(sh.primary || "").trim()) W.push(`scene ${n} shot ${j + 1}: no primary mover named`);
      });
    }
    if (!SPACES.includes(s.space)) P.push(`scene ${n}: space must be "2d", "3d" or "hybrid" (where does this scene live: flat, in depth, or both?)`);
    if (is3d(s)) {
      const c = s.camera3d || {};
      if (!(Number(c.lens_mm) > 0)) P.push(`scene ${n} (${s.space}): camera3d.lens_mm (the focal length, full frame) is missing`);
      const legs = Array.isArray(c.moves) ? c.moves : [];
      if (!legs.length) P.push(`scene ${n} (${s.space}): camera3d.moves needs the camera's legs [{t0, t1, move, ease}] (a locked camera is one leg: move "locked")`);
      legs.forEach((l, j) => {
        if (!(Number(l.t1) > Number(l.t0)) || !String(l.move || "").trim()) P.push(`scene ${n} camera leg ${j + 1}: needs t0 < t1 and a move`);
        if (String(l.move || "") !== "locked" && !String(l.ease || "").trim()) P.push(`scene ${n} camera leg ${j + 1}: needs a named ease (motion.md's)`);
        if (/^(none|linear)$/i.test(String(l.ease || ""))) T("linear-drift", `scene ${n} camera leg ${j + 1}: a constant-speed camera is the screensaver look: ease it and land it`, s);
      });
      if (!String(s.light || "").trim()) P.push(`scene ${n} (${s.space}): light is missing (the rig, the key's direction and colour: "rim, key upper-left #fff1e2, warm rim from behind right")`);
      if (!String(s.materials || "").trim()) P.push(`scene ${n} (${s.space}): materials is missing (what each object is made of, from the look's 3D family)`);
    }
    if (!String(s.layout || "").trim()) P.push(`scene ${n}: no layout`);
    if (!String(s.camera || "").trim()) P.push(`scene ${n}: no camera tier`);
    if (/^\s*T3/i.test(String(s.camera || ""))) t3++;
    if (!(Number(s.energy) >= 1 && Number(s.energy) <= 5)) P.push(`scene ${n}: energy must be 1-5`);
    for (const e of s.entrances || []) {
      if (!ENTRANCES.includes(e.type)) P.push(`scene ${n}: entrance type "${e.type}" (use one of ${ENTRANCES.join(", ")})`);
      entr.push(e.type);
    }
    for (const ev of s.events || []) if (!(Number(ev.t) >= 0 && (!(dur > 0) || Number(ev.t) <= dur + 0.05))) P.push(`scene ${n}: event "${ev.what}" at ${ev.t}s is outside the scene`);
  }
  if (t3 > 1) T("crash-zooms", `${t3} crash zooms (T3): at most one per film`);
  // the depth plan: where 3D goes and why (or why not)
  const deep = S.filter(is3d);
  const dp = score.depth || {};
  if (!String(dp.plan || "").trim() && !String(dp.none_because || "").trim()) P.push('depth: say where 3D goes in this film and why (depth.plan), or why it stays flat (depth.none_because)');
  // W4: hero effects are budgets (lib/budget.mjs): each entry names a hero and a reason, at most 2-3 of one effect per film
  if (Array.isArray(score.budget)) { const bl = checkBudget(readBudget(score), length); P.push(...bl.P); W.push(...bl.W); }
  // a flat brand sets the palette and tone of 3D, not its use or its craft: depth of field, motion blur and the camera are
  // never refused; bloom / glow / chromatic in a 3D scene need a budget entry for that scene; chrome or glass is a tone warning
  if (deep.length && brandFilm(run)) {
    const card = jsonMaybe(R(run, "brand-film", "FILM-STYLE.json")) || {};
    let mdText = "";
    try { mdText = fs.readFileSync(R(run, "brand-film", "FILM-STYLE.md"), "utf8"); } catch {}
    const ct = `${(card.slots || {}).motionVocabulary || ""} ${(card.slots || {}).notes || ""} ${mdText}`;
    // the card's `Depth blur:` line records what the brand's films show; it no longer switches depth of field or motion blur off
    if (/\b(flat|no 3d|no motion blur|no blur|no grain|never 3d|3d style)\b/i.test(ct)) {
      const budget = readBudget(score);
      for (const s of deep) {
        const bad = [], tone = [], m = String(s.materials || ""), lt = `${m} ${s.light || ""}`;
        const hero = budget.filter((e) => e.effect === "glow" || e.effect === "chromatic-split").some((e) => Number(e.scene) === Number(s.n));
        if (/\b(bloom|glow|chromatic|lens flare)/i.test(lt) && !hero) bad.push("bloom, glow, chromatic aberration or lens flare with no budget entry for this scene (a hero effect: score.budget {effect, scene, target, reason})");
        if (m.trim() && !/\b(basic|toon|flat|matte|unlit|lambert)\b/i.test(m)) tone.push(`materials "${m.slice(0, 60)}" are not from the matte set (basic, toon, flat, matte, unlit, lambert)`);
        if (/\b(chrome|glass|iridescen)/i.test(lt)) tone.push("chrome, glass or iridescent surfaces");
        if (bad.length) P.push(`scene ${s.n} (${s.space}): flat-3d-style: ${bad.join("; ")} (references/3d.md "Brand-flat 3D")`);
        if (tone.length) W.push(`scene ${s.n} (${s.space}): flat-3d-style: ${tone.join("; ")}: the brand's films are matte, so keep its 3D in the palette's hexes and its tone (depth of field, motion blur and camera moves stay available)`);
      }
    }
  }
  if (length >= 20 && !deep.length) {
    const nb = String(dp.none_because || "").trim();
    if (!(nb.length >= 20 && /["“”'‘’「」«»][^"“”'‘’「」«»]{3,}["“”'‘’「」«»]/.test(nb))) P.push(`no-3d-moment: a ${Math.round(length)} s film needs at least one 3d or hybrid scene (or a 3D shot inside a hybrid scene): give a line real space (references/3d.md), or set depth.none_because (20+ characters, quoting the script line(s) 3D would hurt)`);
  }
  if (N >= 4 && !deep.length && !String(dp.none_because || "").trim()) T("no-3d", `no 3D or hybrid scene in a ${N}-scene film: give the reveal or the signature seam real space (references/3d.md §1), or say in depth.none_because why this look must stay flat`);
  if (deep.length && !reel.some((m) => is3d(S[Number(m.scene) - 1]))) T("depth-not-in-reel", "the film has 3D but none of its showreel moments is in a 3D or hybrid scene: the depth should be one of the moments people rewind");
  const animated = entr.filter((e) => e !== "cut-in");
  if (animated.length >= 6) {
    const counts = {};
    for (const e of animated) counts[e] = (counts[e] || 0) + 1;
    for (const [e, c] of Object.entries(counts)) if (c / animated.length > 0.5) W.push(`entrance-share: "${e}" is ${Math.round((c / animated.length) * 100)}% of the animated entrances: entrances by the object's nature (a warning above half)`);
  }
  if (entr.length >= 6 && entr.filter((e) => e === "cut-in").length / entr.length < 0.15) W.push("under 15% of elements are simply there on the cut (aim for 30%)");
  if (N >= 4) {
    const en = S.map((s) => Number(s.energy));
    if (!en.some((e) => e >= 5)) T("no-peak", "no peak: one scene at energy 5");
    if (!en.some((e) => e <= 2)) T("no-calm", "no calm stretch: one scene at energy 2 or less");
  }
  const lay = S.map((s) => String(s.layout || "").toLowerCase().split(/[,;(]/)[0].trim());
  const refrain = (sc) => ["example", "escalation"].includes(String((sc && sc.relation) || "").toLowerCase());
  for (let i = 2; i < lay.length; i++) if (lay[i] && lay[i] === lay[i - 1] && lay[i] === lay[i - 2] && !(refrain(S[i]) && refrain(S[i - 1]))) T("layout-repeat", `scenes ${i - 1}-${i + 1} share the layout "${lay[i]}" (no layout in more than 2 consecutive scenes, unless the beats are a refrain: relation example or escalation)`);
  if (N >= 5 && new Set(lay.filter(Boolean)).size < 2) W.push("layouts-thin: one layout for the whole film");
  if (N >= 5 && (!score.motif || (score.motif.scenes || []).length < 3)) T("motif-spread", "the motif must appear in at least 3 scenes (motif.scenes)");
  const seams = Array.isArray(score.seams) ? score.seams : [];
  if (seams.length !== Math.max(0, N - 1)) P.push(`${seams.length} seams for ${N} scenes (need ${Math.max(0, N - 1)}: one per cut)`);
  let sig = 0, plain = 0;
  seams.forEach((s, i) => {
    const id = `seam ${s.from}>${s.to}`;
    if (Number(s.from) !== i + 1 || Number(s.to) !== i + 2) P.push(`${id}: seams go in order, ${i + 1}>${i + 2}`);
    if (!SEAM_KINDS.includes(s.kind)) P.push(`${id}: kind "${s.kind}" (use one of ${SEAM_KINDS.join(", ")})`);
    if (s.kind === "signature") sig++;
    if (s.kind === "cut" || CONTINUITY.has(s.kind)) plain++;
    if (CONTINUITY.has(s.kind) || s.element) {
      for (const side of ["out", "in"]) {
        const h = s[side];
        if (!h) { P.push(`${id}: a continuing element needs "${side}" handoff numbers`); continue; }
        const miss = HANDOFF.filter((k) => h[k] == null || h[k] === "");
        if (miss.length) P.push(`${id} ${side}: missing ${miss.join(", ")} (state every field, even unchanged ones)`);
        // a seam hands over a moving state, never a pose at rest: the outgoing side is still moving when the cut lands and
        // the incoming side arrives already moving, same axis, same direction, same speed
        else if (!(Number(h.speed) > 0) || /^(none|still|static|rest)$/i.test(String(h.direction).trim())) P.push(`${id} ${side}: speed ${h.speed}, direction "${h.direction}" is a pose at rest; a carried object crosses the cut moving (give it a direction and a speed in px/s, the same on both sides)`);
      }
      if (s.out && s.in && Number(s.out.speed) > 0 && Number(s.in.speed) > 0) {
        const r = Number(s.out.speed) / Number(s.in.speed);
        if (r > 1.5 || r < 0.67) W.push(`${id}: the speed changes from ${s.out.speed} to ${s.in.speed} px/s across the cut (match it, within a third)`);
        if (String(s.out.direction).trim() && String(s.in.direction).trim() && String(s.out.direction).trim().toLowerCase() !== String(s.in.direction).trim().toLowerCase()) W.push(`${id}: the direction changes across the cut (${s.out.direction} to ${s.in.direction}); keep one axis and one direction unless a visible cause turns it`);
      }
    }
    if (!String(s.why || "").trim()) W.push(`${id}: no reason given`);
    const A = S[Number(s.from) - 1], B = S[Number(s.to) - 1];
    if (A && B && (is3d(A) !== is3d(B)) && s.kind === "cut") W.push(`${id}: a hard cut between a 2D and a 3D scene; flat-to-depth, depth-to-flat or a shared element would carry the viewer across (references/3d.md §6)`);
    if (["flat-to-depth", "depth-to-flat", "camera-through"].includes(s.kind) && A && B && !is3d(A) && !is3d(B)) P.push(`${id}: ${s.kind} needs a 3D or hybrid scene on at least one side`);
  });
  // direction from meaning (story/intent.json; references/score.md section 1): the score copies each beat's purchase and spends its budget there
  {
    const intent = jsonMaybe(R(run, "story", "intent.json"));
    if (!intent || !Array.isArray(intent.beats)) W.push("no-intent: story/intent.json is missing, so the score is planned without the film's argument (buys, importance, relation, the peak)");
    else {
      const IB = intent.beats;
      const ib = (sc, i) => { const k = Number(sc.beat); return k >= 1 && k <= IB.length ? IB[k - 1] : IB.length === S.length ? IB[i] : null; };
      const unread = S.filter((sc, i) => !ib(sc, i) || !String(sc.buys || "").trim() || ![1, 2, 3].includes(Number(sc.importance))).map((sc) => sc.id || sc.n);
      if (unread.length) W.push(`intent-unread: scene${unread.length > 1 ? "s" : ""} ${unread.slice(0, 8).join(", ")} do${unread.length > 1 ? "" : "es"} not copy the intent beat (scene.beat = its 1-based position in intent.beats, plus buys, importance, relation, peak)`);
      S.forEach((sc, i) => {
        const b = ib(sc, i); if (!b) return;
        if (sc.importance != null && Number(sc.importance) !== Number(b.importance)) W.push(`importance-mismatch: scene ${sc.id || sc.n} is importance ${sc.importance}, its intent beat ${b.importance} (the intent decides importance; the structure critic changes it, not the score)`);
        if (!String(sc.hero || "").trim()) W.push(`hero-missing: scene ${sc.id || sc.n} names no hero (what the viewer must notice to get "${String(b.buys || "").slice(0, 60)}")`);
        if (!String(sc.verb || "").trim()) W.push(`verb-missing: scene ${sc.id || sc.n} names no verb (what the hero does, from the meaning of its buys)`);
        // calm importance-1 beats: no budgeted hero effect, no moving camera
        if (Number(b.importance) === 1) {
          const kind = cameraKind(sc.camera);
          if (kind && kind !== "locked") W.push(`camera-on-minor: scene ${sc.id || sc.n} (importance 1) moves the camera (${kind}): camera moves are spent on the peak and the importance-3 beats`);
          if ((Array.isArray(score.budget) ? score.budget : []).some((e) => e && Number(e.scene) === Number(sc.n))) W.push(`budget-effect-minor: a budgeted hero effect sits on scene ${sc.id || sc.n}, an importance-1 beat`);
        }
      });
      // big moments: the budget (lib/emphasis.mjs, S4): about 4 per 30 s, on the peak and importance-3 beats
      const planBeats = S.map((sc, i) => ({ i, n: sc.n, id: String(sc.id ?? sc.n), beat: sc.beat, start: Number(sc.start), end: Number(sc.end) }));
      const bc = budgetChecks(score, intentBeats(intent, planBeats), length);
      for (const f of bc.findings) W.push(`${f.check}: ${f.message}${f.fix ? ` (${f.fix})` : ""}`);
      if (!Array.isArray(score.big_moments)) W.push("budget-none: score.big_moments is missing: spend 2 to 4 big moments per 30 s on the peak and the importance-3 beats");
      // the showreel and the peak
      const peakIdx = IB.findIndex((b) => b && b.peak === true);
      const peakScene = S.find((sc, i) => ib(sc, i) === IB[peakIdx]);
      if (peakScene && Number(peakScene.energy) !== 5) W.push(`peak-energy: the peak beat (scene ${peakScene.id || peakScene.n}) is energy ${peakScene.energy}, not 5: the peak is the film's biggest moment`);
      for (const m of reel) { const sc = S[Number(m.scene) - 1], b = sc && ib(sc, Number(m.scene) - 1); if (b && Number(b.importance) === 1) W.push(`showreel-off-peak: the showreel moment "${String(m.what).slice(0, 50)}" is on scene ${sc.id || sc.n}, an importance-1 beat: land the reel moments on the peak and the importance-3 beats`); }
      // seams from relations
      const CONTRAST = new Set(["cut", "smash-cut", "iris", "whip"]);
      seams.forEach((sm) => {
        const B = S[Number(sm.to) - 1], b = B && ib(B, Number(sm.to) - 1); if (!b) return;
        const rel = String(sm.relation || b.relation || "").toLowerCase();
        if (!String(sm.relation || "").trim()) W.push(`seam-relation-missing: seam ${sm.from}>${sm.to} names no relation (copy the incoming beat's: ${rel || "?"})`);
        if (rel === "but" && !CONTRAST.has(sm.kind)) W.push(`relation-seam: seam ${sm.from}>${sm.to} is a "but" carried by ${sm.kind}: a contrast wants a hard cut (cut, smash-cut, iris) onto a changed ground or scale`);
        if (rel === "because" && sm.kind === "cut" && !sm.element) W.push(`relation-seam: seam ${sm.from}>${sm.to} is a "because" with a plain cut: the cause's object should carry into its effect (carried-object, shared-element, match-cut)`);
      });
    }
  }
  // sound and motion variety (warnings): the music arc, a sound for every moving seam, a one-trick film (mechanics-thin), huge-vs-tiny type, punctuation cuts
  {
    const arc = score.music_arc && typeof score.music_arc === "object" ? score.music_arc : null;
    const num = (x) => x != null && x !== "" && Number.isFinite(Number(x));
    if (length >= 15) {
      const miss = arc ? ["intro_until", "drop_at", "payoff_at", "button_at"].filter((k) => !num(arc[k])) : [];
      const brk = arc ? arc.break : undefined;
      const brkOk = arc && (brk === null || (Array.isArray(brk) && brk.length === 2 && brk.every(num) && Number(brk[0]) < Number(brk[1])));
      if (!arc || miss.length || !brkOk) W.push(`music-arc-missing: score.music_arc { intro_until, drop_at, break: [t0, t1] | null, payoff_at, button_at } (seconds) ${!arc ? "is missing" : `is incomplete (${[...miss, ...(brkOk ? [] : ["break"])].join(", ")})`}: the music is edited to the story (a soft intro under the hook, a drop on the reveal, a break before the payoff, a button on the logo; references/sound.md)`);
      else if (!(Number(arc.intro_until) <= Number(arc.drop_at) && Number(arc.drop_at) < Number(arc.payoff_at) && Number(arc.payoff_at) <= Number(arc.button_at) && Number(arc.button_at) <= length + 0.5)) W.push(`music-arc-order: music_arc must run intro_until <= drop_at < payoff_at <= button_at <= ${r2(length)} s (got ${arc.intro_until}, ${arc.drop_at}, ${arc.payoff_at}, ${arc.button_at})`);
    }
    // every seam with motion gets a sound event: seam.sound / seam.sfx, or an event with a sound in the scene on either side of it
    const sounded = (sm, i) => {
      if (String(sm.sound || sm.sfx || "").trim()) return true;
      const hit = (sc, lo, hi) => sc && (sc.events || []).some((ev) => (ev.sound || ev.sfx || ev.kind) && Number(ev.t) >= lo - 1e-6 && Number(ev.t) <= hi + 1e-6);
      const A = S[i], B = S[i + 1];
      return hit(A, (Number(A && A.duration) || 0) - 0.5, (Number(A && A.duration) || 0) + 0.05) || hit(B, -0.05, 0.5);
    };
    const moving = seams.map((sm, i) => ({ sm, i })).filter(({ sm }) => sm.kind !== "cut");
    const quiet = moving.filter(({ sm, i }) => !sounded(sm, i));
    if (moving.length && quiet.length / moving.length > 0.5) W.push(`seam-unsounded: ${quiet.length} of ${moving.length} seams with motion have no sound event (seam.sound, or an event with a sound at the seam: whoosh on a move through space, hit on a landing, impact on the reveal): ${quiet.slice(0, 4).map(({ sm }) => `${sm.from}>${sm.to}`).join(", ")}`);
    // mechanics: variety comes from meaning, so only a one-trick film warns (a refrain may repeat a mechanic on purpose)
    const lineShots = S.flatMap((x) => (Array.isArray(x.shots) ? x.shots : [])).filter((sh) => String(sh.on_screen || "").trim());
    const mech = lineShots.map((sh) => String(sh.mechanic || "").toLowerCase().replace(/\s+/g, " ").trim()).filter(Boolean);
    const distinctM = new Set(mech).size;
    if (mech.length >= 4 && distinctM <= 2) W.push(`mechanics-thin: ${distinctM} distinct mechanic(s) over ${mech.length} lines: the film runs on one trick. Beats that mean different things move differently (agents/motion-director.md step 2b); a refrain repeating one on purpose is fine`);
    // huge-vs-tiny type
    const ts = score.type_scale && typeof score.type_scale === "object" ? score.type_scale : null;
    if (length >= 15) {
      if (!ts || !(Number(ts.small_px) > 0) || !(Number(ts.large_px) > 0)) W.push("flat-type: score.type_scale { small_px, large_px } is missing (the smallest and largest type in the film: aim at least 3x between them)");
      else if (Number(ts.large_px) / Number(ts.small_px) < 3) W.push(`flat-type: the largest type is ${r2(Number(ts.large_px) / Number(ts.small_px))}x the smallest (${ts.large_px} / ${ts.small_px} px): one type size reads as a template; aim at least 3x (a huge word against tiny labels)`);
    }
    // punctuation: a hard cut (cut, smash-cut, iris) on an emotional turn (the pain to the meet, the payoff)
    if (seams.length >= 2) {
      const TURN = /^(meet|reveal|turn|payoff)\b/i;
      const turnSeams = seams.filter((sm) => { const B = S[Number(sm.to) - 1] || {}; return sm.turn === true || TURN.test(String(B.id || B.role || "")) || (score.brandReveal != null && String(B.id) === String(score.brandReveal)); });
      const pool = turnSeams.length ? turnSeams : seams;
      if (!pool.some((sm) => ["cut", "smash-cut", "iris"].includes(sm.kind))) W.push(`no-punctuation: ${turnSeams.length ? `the emotional turn${turnSeams.length > 1 ? "s" : ""} (${turnSeams.map((sm) => `${sm.from}>${sm.to}`).join(", ")}) ${turnSeams.length > 1 ? "are" : "is"} not a hard cut` : "no seam is a hard cut"}: put a cut, smash-cut or iris on the pain to meet seam and the payoff (a hard stop is the punctuation; flow everywhere else reads as a screensaver)`);
    }
  }
  // layer density: a showcase-grammar film stacks independently timed elements (shots[].layers): 5 to 10 at the peak of a showcase shot
  {
    const SHOWCASE = ["specimen-sheet", "pixel-collage", "glyph-chain", "viewfinder-reel", "editorial-grid"];
    if (SHOWCASE.includes(String(score.grammar || ""))) {
      const counts = S.flatMap((x) => (Array.isArray(x.shots) ? x.shots : [])).map((sh) => Number(sh.layers)).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
      const all = S.flatMap((x) => (Array.isArray(x.shots) ? x.shots : [])).length;
      if (all && !counts.length) W.push(`layers-thin: no shot declares layers (shots[].layers: the count of independently timed elements; a showcase shot of the "${score.grammar}" grammar peaks at 5 to 10)`);
      else if (counts.length) {
        const med = counts.length % 2 ? counts[counts.length >> 1] : (counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2;
        if (med < 4) W.push(`layers-thin: the median shot has ${med} independently timed layer(s) (${counts.length} shots count them; the "${score.grammar}" grammar wants 4 and more, 5 to 10 at the peak of a showcase shot): add layers (ground motion, secondary type, icons, a second image, a drawn line, a texture) before the score ships`);
      }
    }
  }
  // the Moves pass: when a move set was chosen (story/moves.json), the score is held to it
  const mvf = jsonMaybe(R(run, "story", "moves.json"));
  if (mvf === undefined) P.push("story/moves.json is not valid JSON");
  else if (mvf && typeof mvf === "object") {
    const accounted = Array.isArray(score.moves) ? score.moves : [];
    const heroes = Array.isArray(mvf.heroes) ? mvf.heroes : [];
    for (const id of heroes) {
      const card = (mvf.cards || []).find((c) => c && c.id === id) || {};
      const e = accounted.find((x) => x && x.id === id);
      if (!e) { P.push(`moves-unaccounted: hero move ${id}${card.title ? ` ("${card.title}")` : ""} is not in score.moves (every hero is {id, status: "used"|"dropped", scene, seam?, why?}: build it, or drop it with a reason)`); continue; }
      if (e.status === "dropped") { if (String(e.why || "").trim().length < 12) P.push(`moves-unaccounted: hero move ${id} is dropped without a why (12+ characters)`); }
      else if (e.status === "used") { if (!(Number(e.scene) >= 1 && (!N || Number(e.scene) <= N))) P.push(`moves-no-scene: hero move ${id} is used but its scene "${e.scene}" is not a scene of the film (1-${N})`); }
      else P.push(`moves-unaccounted: hero move ${id} has status "${e.status}" (used or dropped)`);
    }
    for (const e of accounted) if (e && !heroes.includes(e.id) && !(mvf.cards || []).some((c) => c && c.id === e.id)) W.push(`score.moves names "${e.id}", which is not a card of story/moves.json`);
    seams.forEach((s) => {
      if (!(CONTINUITY.has(s.kind) || s.kind === "signature")) return;
      const bridge = String(s.bridge || "").trim();
      if (!bridge) W.push(`seam-no-bridge: seam ${s.from}>${s.to} (${s.kind}) has no "bridge" (one sentence: the single frame where both scenes are true, naming the element)`);
      else if (isLabelOnly(bridge)) P.push(`seam-label-bridge: seam ${s.from}>${s.to} bridge "${bridge}" is only a label: name the element that is in both scenes at once and what it looks like in that frame`);
    });
  }
  // the grammar: when the run has one (look/grammar.json), the score names it and every beat spends a technique of it
  const gram = readRunGrammar(run);
  if (gram !== null) { const gr = checkScoreGrammar(gram, score, S, N); P.push(...gr.P); W.push(...gr.W); }
  if (score.signature && score.signature.seam && !seams.some((s) => `${s.from}>${s.to}` === String(score.signature.seam))) P.push(`signature.seam "${score.signature.seam}" is not one of the seams`);
  // the plan: the film-level fields and each beat's line, picture, moment and take, UI, exit and carrier. Required on a
  // direct film (one builder reads only this) and on a product-first film; elsewhere missing fields are warnings.
  const plan = jsonMaybe(R(run, "crew", "plan.json")) || {};
  const must = !!plan.direct || productFirst(run, plan);
  const need = (cond, msg) => { if (!cond) (must ? P : W).push(`plan: ${msg}`); };
  need(Number(score.duration) > 0, "duration missing (the film's length in seconds)");
  need(String(score.brand || "").trim(), "brand missing (the brand or product name)");
  // continuity, a living frame, video UI, type rhythm, signal colour (warnings, SPEC 8)
  {
    const txt = (...v) => v.map((x) => (x == null ? "" : typeof x === "string" ? x : JSON.stringify(x))).join(" ").toLowerCase();
    const brandName = String(score.brand || "").trim().toLowerCase();
    const launch = brandFilm(run) || productFirst(run, plan);
    // breaths: each at most 1 s, at most 2
    if (Array.isArray(score.breaths)) {
      const bad = score.breaths.filter((b) => !(Array.isArray(b) && b.length === 2 && Number(b[1]) > Number(b[0]) && Number(b[1]) - Number(b[0]) <= 1.0 + 1e-6));
      if (bad.length || score.breaths.length > 2) W.push(`breaths-invalid: score.breaths is [[t0, t1]], each 1 s at most and two at most (${bad.length ? `${bad.length} invalid` : `${score.breaths.length} declared`}): a breath is a held beat at the emotional turn, not a gap`);
    }
    // no-overlap: a seam whose incoming element starts after the outgoing one has fully left
    const OVERLAP = /overlap|before (?:the |it |that )?\w*\s*(?:leaves|exits|has left|is gone|clears)|while (?:the |it |that )?[\w\s]{0,24}(?:leaves|exits|leaving|exiting)|as (?:the |it |that )?[\w\s]{0,24}(?:leaves|exits|leaving|exiting)|still (?:on screen|moving out|leaving)|already (?:arriving|entering|in)/;
    const lonely = [];
    seams.forEach((sm) => {
      const A = S[Number(sm.from) - 1], B = S[Number(sm.to) - 1];
      if (!A || !B) return;
      const o = sm.out && typeof sm.out === "object" ? sm.out : {}, i2 = sm.in && typeof sm.in === "object" ? sm.in : {};
      const left = Number(sm.out_leaves ?? o.leaves_at ?? o.t1 ?? o.t), arrive = Number(sm.in_arrives ?? i2.arrives_at ?? i2.t0 ?? i2.t);
      if (sm.overlap_s != null && sm.overlap_s !== "") { if (!(Number(sm.overlap_s) > 0)) lonely.push(`${sm.from}>${sm.to}`); return; }
      if (Number.isFinite(left) && Number.isFinite(arrive)) { if (arrive > left + 1e-6) lonely.push(`${sm.from}>${sm.to}`); return; }
      if (CONTINUITY.has(sm.kind) || sm.kind === "signature" || sm.element) return; // an object present on both sides overlaps by nature
      const lastA = (A.shots || []).slice(-1)[0] || {}, firstB = (B.shots || [])[0] || {};
      const t = txt(sm.why, sm.bridge, sm.overlap, lastA.moves, firstB.moves, firstB.on_screen);
      if (!OVERLAP.test(t)) lonely.push(`${sm.from}>${sm.to}`);
    });
    if (lonely.length) W.push(`no-overlap: seam${lonely.length > 1 ? "s" : ""} ${lonely.slice(0, 6).join(", ")}: the incoming element starts after the outgoing one has fully left (the frame clears between beats): give each seam out/in timing (seam.out_leaves / seam.in_arrives in seconds around the cut, the incoming one first) or an overlap_s above 0, so the next element arrives before the last leaves`);
    if (length >= 15 && String(score.ground_motion || "").trim().length < 8) W.push("no-living-ground: score.ground_motion is missing: say how the ground lives all the time (a gradient that drifts, a slow parallax, a noise field, rules that breathe), so a hold is never a dead flat ground");
    if (launch && length >= 25 && brandName) {
      const withBrand = S.filter((sc) => txt(sc.line, sc.on_screen, sc.mark, (sc.shots || []).map((sh) => [sh.on_screen, sh.mark])).includes(brandName)).length;
      if (withBrand < 2) W.push(`brand-once: the brand "${score.brand}" appears in ${withBrand} beat${withBrand === 1 ? "" : "s"} of a ${Math.round(length)} s launch film (2 at least): at the reveal and once mid-film tied to a benefit ("${score.brand} finds it"), and at the end`);
    }
    // video UI: beats whose picture shows product UI
    const uiBeats = S.filter((sc) => (Array.isArray(sc.ui) && sc.ui.length) || /\b(ui|screen|dashboard|interface|inbox|panel|window)\b/i.test(String(sc.picture || "")));
    const STAGED = /\b(build|builds|built|rows?|highlights?|steps?|stepped|simplif\w*|cards?)\b/i;
    const unstaged = uiBeats.filter((sc) => !(sc.shots || []).some((sh) => STAGED.test(txt(sh.on_screen, sh.moves, sh.mechanic, sh.primary))));
    if (unstaged.length) W.push(`ui-unstaged: beat${unstaged.length > 1 ? "s" : ""} ${unstaged.slice(0, 6).map((sc) => sc.id || sc.n).join(", ")} show${unstaged.length > 1 ? "" : "s"} product UI but no shot stages it: simplify the real UI for video and build it in stages (card, frame, rows, highlight; no shot mentions build / rows / highlight / step / simplify / card)`);
    const CURSOR = /\b(cursor|drag|drags|dragging|click|clicks|clicking)\b/i, ACTS = /\b(highlight\w*|step\w*|appears?|reorder\w*|slides? in|builds?)\b/i;
    const cursorLed = uiBeats.filter((sc) => { const t = txt((sc.shots || []).map((sh) => [sh.moves, sh.primary, sh.mechanic]), sc.ui); return CURSOR.test(t) && !ACTS.test(t) || (CURSOR.test(t) && (t.match(/cursor|drag|click/g) || []).length > (t.match(/highlight|step|appear|reorder/g) || []).length); });
    if (uiBeats.length >= 2 && cursorLed.length / uiBeats.length > 0.5) W.push(`cursor-led: ${cursorLed.length} of ${uiBeats.length} UI beats are driven by a cursor drag or click: let the product act (highlights step, rows reorder, cards appear on their own); a cursor only where the user's action is the point`);
    // type rhythm: lines_type sizes
    if (Array.isArray(score.lines_type) && score.lines_type.length >= 3) {
      const nums = score.lines_type.map((x) => Number(typeof x === "object" && x ? x.size_px ?? x.px ?? x.size : x)).filter((n) => Number.isFinite(n) && n > 0);
      const classes = score.lines_type.map((x) => String(typeof x === "object" && x ? x.size || x.class || "" : x).toLowerCase().trim());
      let flat = false;
      if (nums.length === score.lines_type.length) { const mean = nums.reduce((a, b) => a + b, 0) / nums.length; flat = nums.every((n) => Math.abs(n - mean) <= 0.15 * mean); }
      else flat = new Set(classes).size <= 1;
      if (flat) W.push("type-rhythm-flat: score.lines_type puts every line within 15% of the same size: alternate small, bigger, giant, small so the key line lands (references/craft.md, Type rhythm)");
    }
    const ac = score.accent;
    if (!(ac && typeof ac === "object" && String(ac.colour || ac.color || "").trim() && String(ac.marks || "").trim())) W.push("no-accent-signal: score.accent { colour, marks } is missing: one accent colour marks the key word or dot every time (a key word may take the ground's gradient)");
  }
  // a single-feature scenario film carries its feature block; a ladder film (several real uses) carries a refrain instead
  const chosenPitch = jsonMaybe(R(run, "story", "chosen.json"));
  const ladderFilm = !!(chosenPitch && ["ladder", "pas"].includes(pitchShape(chosenPitch)));
  if (productFirst(run, plan) && !ladderFilm) {
    const f = score.feature || {};
    need(["name", "url", "viewer", "task", "before", "after"].every((k) => String(f[k] || "").trim()), "feature { name, url, viewer, task, before, after } missing or incomplete (copy it from the chosen script)");
  }
  need(/^#[0-9a-f]{3,8}$/i.test(String(score.ground || "")), 'ground missing: the ONE background colour of the whole film (a hex), painted only by the root');
  need(/^#[0-9a-f]{3,8}$/i.test(String(score.ink || "")), "ink missing (the text colour, a hex)");
  need(/^(left|right|up|down|in|out)$/i.test(String(score.current || "")), 'current missing: the film\'s one direction ("left" by default; right, up, down, in, out)');
  const ids = S.map((x) => String(x.id || ""));
  if (S.length) {
    need(ids.every(Boolean) && new Set(ids).size === ids.length, "every beat needs a unique id (hook, proof, turn, cta ...)");
    need(score.brandReveal != null && !Array.isArray(score.brandReveal) && ids.includes(String(score.brandReveal)), "brandReveal must name exactly one beat id (the mark is revealed once)");
    let t = 0, off = [];
    S.forEach((x, i) => {
      const st = Number(x.start), en = Number(x.end), d = Number(x.duration);
      if (!(Number.isFinite(st) && Number.isFinite(en))) off.push(`${x.id || i + 1}: no start/end`);
      else if (Math.abs(st - t) > 0.06 || (d > 0 && Math.abs(en - st - d) > 0.06)) off.push(`${x.id || i + 1}: ${st}-${en} s, expected ${r2(t)}-${r2(t + (d || 0))} s`);
      t += d || (en - st) || 0;
    });
    need(!off.length, `beat start/end in film seconds must follow the durations (${off.slice(0, 3).join("; ")})`);
    if (Number(score.duration) > 0 && t > 0) need(Math.abs(Number(score.duration) - t) <= 0.1, `duration ${score.duration} s but the beats add up to ${r2(t)} s`);
    const thin = S.filter((x) => x.line == null || !String(x.picture || "").trim()).map((x) => x.id || x.n);
    need(!thin.length, `beat(s) ${thin.join(", ")} need line (the on-screen line, "" for none) and picture (what the viewer sees happen)`);
    const untaken = S.filter((x) => x.moment && !String(x.take || "").trim()).map((x) => x.id || x.n);
    need(!untaken.length, `beat(s) ${untaken.join(", ")} name a moment but no take (one sentence: what moves, on which axis, how long, what never stops)`);
    const carried = S.slice(0, -1).filter((x) => x.exit === "carrier" && String(x.carrier || "").trim()).length;
    const needC = Math.min(2, Math.max(0, S.length - 1));
    need(carried >= needC, `${carried} beat(s) exit on a carrier: carry at least ${needC} seams (exit: "carrier", carrier: "<the object that crosses the cut>")`);
    if (productFirst(run, plan)) {
      const pr = S.filter((x) => /proof/i.test(String(x.id || x.role || "")));
      need(!pr.length || pr.some((x) => Array.isArray(x.ui) && x.ui.length >= 2), "the proof beat needs ui[]: the literal cause and effect on screen, at least two steps");
    }
  }
  // the shows: every show row of the chosen script is realised in a shot (the shot's on_screen holds the line, its moves describe the show)
  {
    const nz = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    const rows = (chosenPitch && Array.isArray(chosenPitch.beats) ? chosenPitch.beats : []).flatMap((b) => (Array.isArray(b.shows) ? b.shows : [])).filter((r) => r && nz(r.line));
    if (rows.length && S.length) {
      const shots = S.flatMap((x) => (Array.isArray(x.shots) ? x.shots : []));
      const missing = rows.filter((r) => { const l = nz(r.line); return !shots.some((sh) => nz(sh.on_screen).includes(l) && String(sh.moves || "").trim()); });
      for (const r of missing) W.push(`show-unscored: the line "${String(r.line).trim()}" has a show in the chosen script but no shot carries it (a shot whose on_screen holds the line and whose moves describe the show)`);
      if (missing.length / rows.length > 0.3) P.push(`show-unscored: ${missing.length} of ${rows.length} show rows are not realised in any shot (30% at most): every line's show is built in a shot`);
    }
  }
  // picture-first (references/styleframes.md): on a scene route every beat is bound to its approved board; a beat that
  // changes its board's size or hero says why in score.deviations [{beat, field, why}] (or the scene's own `deviation`)
  {
    const route = plan.route || (jsonMaybe(R(run, "decisions.json")) || {}).route;
    const sceneRoute = DIRECT_ROUTES.has(route) && !LYR(run, plan) && !isPresenter(run, plan);
    const doc = readShots(R(run, "frames", "shots.json"));
    const devs = Array.isArray(score.deviations) ? score.deviations : [];
    const devFor = (sc, field) => (String(sc.deviation || "").trim().length >= 12) || devs.some((d) => d && (String(d.beat) === String(sc.id) || Number(d.beat) === Number(sc.n) || Number(d.scene) === Number(sc.n)) && (!d.field || String(d.field).toLowerCase() === field) && String(d.why || "").trim().length >= 12);
    if (sceneRoute || doc) {
      const unbound = [];
      S.forEach((sc, i) => {
        const shot = doc ? boardFor(sc, i, doc) : null;
        const hasBoard = sc.board ? exists(path.resolve(run, String(sc.board))) || exists(path.resolve(String(sc.board))) || !!(shot && exists(R(run, "frames", `${shot.id}.png`))) : false;
        if (!hasBoard) unbound.push(sc.id || sc.n);
        if (!doc || !shot) return;
        const id = sc.id || sc.n;
        if (sc.size && shot.size && String(sc.size).toUpperCase() !== String(shot.size).toUpperCase() && !devFor(sc, "size")) P.push(`board-contradiction: beat ${id} is ${String(sc.size).toUpperCase()} but its board frames/${shot.id}.png is ${String(shot.size).toUpperCase()} (keep the approved board, or add score.deviations {beat: "${id}", field: "size", why})`);
        if (sc.hero && shot.hero && !heroesAgree(sc.hero, shot.hero) && !devFor(sc, "hero")) P.push(`board-contradiction: beat ${id}'s hero "${sc.hero}" is not its board's hero "${shot.hero}" (frames/${shot.id}.png; or add score.deviations {beat: "${id}", field: "hero", why})`);
        if (!sc.size || !sc.hero) W.push(`board-unbound: beat ${id} does not copy its board's size and hero (frames/${shot.id}.png: ${String(shot.size || "").toUpperCase()}, ${shot.hero || "?"})`);
      });
      if (unbound.length) W.push(`board-missing: beat${unbound.length > 1 ? "s" : ""} ${unbound.slice(0, 8).join(", ")} name${unbound.length > 1 ? "" : "s"} no board (scene.board = "frames/<id>.png"): the score animates between approved boards (references/styleframes.md)`);
    }
  }
  const sigs = sig || (score.signature && score.signature.seam ? 1 : 0);
  const maxSig = length > 60 ? 2 : 1;
  if (N >= 3 && sigs === 0) W.push("no signature transition named");
  if (sig > maxSig) T("signature-count", `${sig} signature seams (${maxSig} at most for a ${Math.round(length)} s film)`);
  if (seams.length && plain / seams.length < 0.5) T("seam-mix", `only ${Math.round((plain / seams.length) * 100)}% of seams are cuts or scene-born continuity (at least 50%)`);
  return { P, W };
}

function dsnPath(run) {
  try {
    const r = spawnSync(process.execPath, [path.join(SKILL_DIR, "scripts", "brand.mjs"), "detect"], { encoding: "utf8", env: { ...process.env, RASANAI_QUIET: "1" } });
    const j = JSON.parse(r.stdout || "{}");
    return j.found ? j.source || j.file || null : null;
  } catch { return null; }
}

let CHECK_EXTRA = null; // extra fields a role's check hands the Director (the A/B's keep/revert, the retrospective's record lines)
function abLatest(run) {
  const d = R(run, "crew");
  const ns = exists(d) ? fs.readdirSync(d).map((x) => (x.match(/^ab-(\d+)\.json$/) || [])[1]).filter(Boolean).map(Number) : [];
  return ns.length ? Math.max(...ns) : 0;
}
async function checkRole(run, role, key) {
  const P = [], W = [];
  const research = (f) => R(run, "research", f);
  const pj = projectDir(run);
  switch (role) {
    case "product-researcher": {
      const plan = jsonMaybe(R(run, "crew", "plan.json")) || {};
      const topic = plan.mode === "topic" || !!(plan.sources && isFootageLed(plan.sources)); // a footage film's web check is light: the footage is the source
      const md = readMaybe(research("product.md"));
      if (!md) { P.push("research/product.md is missing"); break; }
      P.push(...sections(md, topic ? ["In one paragraph", "Numbers", "Sources"] : ["In one paragraph", "What's new", "Features", "Numbers", "In users' words", "No longer true", "Sources"]));
      const urls = new Set(md.match(URL_RE) || []);
      if (urls.size < 3) P.push(`only ${urls.size} source URLs in product.md (at least 3)`);
      P.push(...claimsProblems(research("product.claims.json"), topic ? 8 : 12, "product.claims.json"));
      break;
    }
    case "brand-researcher": {
      const f = research("brand/DESIGN.md");
      if (!exists(f)) { P.push("research/brand/DESIGN.md is missing"); break; }
      let B;
      try {
        B = readDesignMd(f);
      } catch (e) {
        P.push(`brand.mjs can't read research/brand/DESIGN.md: ${e.message}`);
        break;
      }
      const roles = B.roles || {};
      for (const r of ["canvas", "ink", "accent"]) if (!roles[r]) P.push(`DESIGN.md has no ${r} colour`);
      if (!(B.fonts && B.fonts.display && B.fonts.display.family)) P.push("DESIGN.md has no display font");
      for (const w of B.warnings || []) W.push(`brand.mjs: ${w}`);
      const notes = readMaybe(research("brand.md"));
      if (!notes) P.push("research/brand.md (where each token came from) is missing");
      else if ((notes.match(URL_RE) || []).length < 2) P.push("research/brand.md cites fewer than 2 sources");
      // the logo is a downloaded file listed in logos.json (or logos.json says none, with why and where it looked); prose is not a logo
      const lg = readLogos(research("brand/assets"));
      P.push(...lg.problems);
      W.push(...lg.warnings);
      if (lg.state === "none" && !lg.problems.length) W.push("no official logo file: the Director tells the user once, and the end card sets the name in type with no symbol");
      if (!/^##\s+Motion/mi.test(readMaybe(f))) W.push("DESIGN.md has no ## Motion section (the brand's own motion signature)");
      break;
    }
    case "screens-researcher": {
      const list = jsonMaybe(research("screens.json"));
      if (!Array.isArray(list)) { P.push(list === undefined ? "research/screens.json is not valid JSON" : "research/screens.json is missing"); break; }
      const real = list.filter((s) => s && s.path && exists(path.resolve(WS, s.path)));
      if (real.length < 4) P.push(`${real.length} screens on disk (at least 4; 6 for a big product)`);
      else if (real.length < 6) W.push(`${real.length} screens: fine for a small product, thin for a big one`);
      const missing = list.filter((s) => s && s.path && !exists(path.resolve(WS, s.path)));
      if (missing.length) P.push(`${missing.length} screens listed but not on disk (first: ${missing[0].path})`);
      const unsourced = list.filter((s) => s && !String(s.source || "").trim());
      if (unsourced.length) P.push(`${unsourced.length} screens without a source`);
      const md = readMaybe(research("screens.md"));
      if (!md) P.push("research/screens.md is missing");
      else {
        if (!/^##\s+UI kit/mi.test(md)) P.push('screens.md needs a "## UI kit" section (measured components)');
        else {
          const kit = (md.split(/^##\s+UI kit/mi)[1] || "").split(/^##\s/m)[0];
          const comps = (kit.match(/^###\s+/gm) || []).length;
          if (comps < 3) P.push(`the UI kit measures ${comps} components (at least 3, one ### heading each)`);
        }
        if (!/^##\s+Flows/mi.test(md)) W.push('screens.md has no "## Flows" section');
      }
      break;
    }
    case "precedent-researcher": {
      const md = readMaybe(research("precedent.md"));
      if (!md) { P.push("research/precedent.md is missing"); break; }
      P.push(...sections(md, ["Films", "House grammar", "Category clichés", "Moves worth stealing"]));
      const films = exists(research("films")) ? fs.readdirSync(research("films")).filter((d) => exists(research(path.join("films", d, "film.json")))) : [];
      if (films.length < 2 && !/(could ?n.t|could not|unable|no yt-dlp|blocked|private|unavailable)/i.test(md)) P.push(`${films.length} films analysed (at least 2, or say why not)`);
      break;
    }
    case "local-scout": {
      const md = readMaybe(research("local.md"));
      if (!md) { P.push("research/local.md is missing"); break; }
      P.push(...sections(md, ["What it is", "What's new", "UI words", "Design tokens"]));
      const c = jsonMaybe(research("local.claims.json"));
      if (c === null) P.push("research/local.claims.json is missing");
      else if (c === undefined) P.push("research/local.claims.json is not valid JSON");
      const assets = research("local/assets");
      if (exists(assets)) {
        const bad = [];
        const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/^\.env|\.(pem|key|p12)$|secret|credential/i.test(e.name)) bad.push(rel(p)); } };
        walk(assets);
        if (bad.length) P.push(`secrets copied into local/assets (delete them): ${bad.slice(0, 3).join(", ")}`);
      }
      break;
    }
    case "design-researcher": {
      const md = readMaybe(research("design.md"));
      if (!md) { P.push("research/design.md is missing"); break; }
      P.push(...sections(md, ["The subject's visual world", "Clichés to avoid", "Audience", "Materials, places, eras", "Library references", "Sources"]));
      const urls = new Set(md.match(URL_RE) || []);
      if (urls.size < 3) P.push(`only ${urls.size} source URLs in design.md (at least 3: the subject's own visual culture, not the library)`);
      const rf = jsonMaybe(research("design-refs.json"));
      if (rf === null) { P.push("research/design-refs.json is missing"); break; }
      if (rf === undefined) { P.push("research/design-refs.json is not valid JSON"); break; }
      const ids = libraryIds();
      const refs = Array.isArray(rf) ? rf : rf.references || [];
      if (refs.length < 8 && !brandFilm(run)) P.push(`design-refs.json shortlists ${refs.length} library references (8 to 12)`);
      if (refs.length > 12) W.push(`design-refs.json shortlists ${refs.length} references (8 to 12: a shortlist, not the shelf)`);
      for (const r of refs) {
        if (!r || !r.id) { P.push("a reference has no id"); continue; }
        if (!ids.has(r.id)) P.push(`reference "${r.id}" is not in the library (library.mjs search --q ...)`);
        if (!String(r.why || "").trim()) P.push(`reference "${r.id}" needs a why (what in it fits THIS subject)`);
      }
      if (new Set(refs.map((r) => r && r.id)).size !== refs.length) P.push("design-refs.json repeats a reference");
      const w = !Array.isArray(rf) && rf.world;
      if (!w || !Array.isArray(w.cliches_to_avoid) || w.cliches_to_avoid.length < 3) P.push("design-refs.json needs world.cliches_to_avoid (at least 3 of the category's clichés)");
      if (w && (!Array.isArray(w.materials) || !w.materials.length)) P.push("design-refs.json world.materials is empty");
      const idx = (() => { try { return JSON.parse(fs.readFileSync(path.join(SKILL_DIR, "library", "index.json"), "utf8")); } catch { return null; } })();
      if (idx && idx.motion && idx.motion.length && !refs.some((r) => r && idx.motion.some((m) => m.id === r.id))) W.push("no library/motion reference in the shortlist (the designers need a motion and camera language too)");
      break;
    }
    case "design-system-designer": {
      if (!key) { P.push("design-system-designer needs --key"); break; }
      const dir = R(run, "design", key);
      const dec = jsonMaybe(R(run, "decisions.json")) || {};
      const brandPath = dec.use_brand !== false && dec.brand && exists(path.resolve(String(dec.brand))) ? path.resolve(String(dec.brand)) : null;
      const r = await checkSystemFull(dir, { hook: firstLine(run), libraryIds: libraryIds(), brand: brandPath, label: key, offline: !!process.env.RASANAI_OFFLINE });
      P.push(...r.P); W.push(...r.W);
      if (isPresenter(run)) {
        const md = readMaybe(R(run, "design", key, "DESIGN.md"));
        const im = (md.match(/^##\s+Imagery[^\n]*\n([\s\S]*?)(?=\n##\s|(?![\s\S]))/mi) || [])[1];
        if (im === undefined) P.push('DESIGN.md has no "## Imagery" section (a presenter film generates images: the art direction every image obeys)');
        else if (im.trim().split(/\s+/).filter(Boolean).length < 25) P.push('the "## Imagery" section is thin (25 words at least: medium, lens, light, palette mapping, texture, room for the person, what never)');
      }
      // against the siblings that already exist: three systems that are one system fail the later one
      for (const other of ["Sure", "Bold", "Wild"].filter((l) => l !== key && exists(R(run, "design", l, "DESIGN.md")))) {
        const pr = await checkSystems([dir, R(run, "design", other)], { libraryIds: libraryIds(), offline: true, hook: firstLine(run), brand: brandPath });
        for (const m of pr.P) if (/too alike|exactly the same|same layout recoloured/.test(m)) P.push(m);
      }
      break;
    }
    case "research-lead": { const truth = R(run, "story", "truth.md");
      if (!readMaybe(truth)) { P.push("story/truth.md is missing"); break; }
      if (/<[a-z][^>]{3,}>/i.test(readMaybe(truth).replace(/<!--[\s\S]*?-->/g, ""))) P.push("story/truth.md still has <placeholders>");
      const r = spawnSync(process.execPath, [path.join(SKILL_DIR, "scripts", "story.mjs"), "pick", "--truth", truth, "--count", "3"], { encoding: "utf8", env: { ...process.env, RASANAI_QUIET: "1" } });
      if (r.status !== 0) P.push(`story.mjs pick refused the truth sheet: ${(r.stderr || "").trim().split("\n").slice(0, 3).join(" ")}`);
      else {
        try {
          const j = JSON.parse(r.stdout);
          if (j.truth_gaps && j.truth_gaps.length) P.push(`truth sheet gaps: ${j.truth_gaps.join("; ")}`);
          const brf = readMaybe(research("BRIEFING.md")) || "";
          if (j.claim_scope === "universal" && /\bone (viewer|person|user)\b|\bone (real )?task\b/i.test(brf)) P.push("the truth sheet says Claim scope: universal but research/BRIEFING.md frames the film as one viewer / one task: a breadth claim is told as the range of its uses (rewrite the angle, never a single scenario)");
        } catch {}
      }
      P.push(...claimsProblems(research("claims.json"), 8, "claims.json"));
      const assets = jsonMaybe(research("assets.json"));
      if (!Array.isArray(assets)) P.push("research/assets.json is missing or not a JSON array");
      else {
        const gone = assets.filter((a) => a && a.path && !exists(path.resolve(WS, a.path)));
        if (gone.length) P.push(`${gone.length} assets in assets.json are not on disk (first: ${gone[0].path})`);
        if (!assets.length) W.push("the asset kit is empty");
      }
      if (brandLocked(run) && !exists(research("brand", "DESIGN.md")) && !(dsnPath(run))) P.push("the brief names a brand (brand_name / use_brand) but there is no brand step: research/brand/DESIGN.md (from the brand researcher) or a workspace DESIGN.md is required; run the brand researcher first");
      const br = readMaybe(research("BRIEFING.md"));
      if (!br) P.push("research/BRIEFING.md is missing");
      else {
        if (br.split("\n").length > 90) P.push(`BRIEFING.md is ${br.split("\n").length} lines (one page: 70 or so)`);
        P.push(...sections(br, ["The product today", "Angles", "Brand verdict", "Asset kit", "Ask the user"]));
      }
      break;
    }
    case "script-writer": {
      const f = R(run, "story", `pitch-${key}.json`);
      const p = jsonMaybe(f);
      if (p === null) { P.push(`story/pitch-${key}.json is missing`); break; }
      if (p === undefined) { P.push(`story/pitch-${key}.json is not valid JSON`); break; }
      const beats = Array.isArray(p.beats) ? p.beats : [];
      if (beats.length < 3) P.push(`${beats.length} beats`);
      beats.forEach((b, i) => {
        for (const k of ["name", "duration_s", "visual"]) if (b[k] == null || b[k] === "") P.push(`beat ${i + 1}: no ${k}`);
        if (b.on_screen == null && b.vo == null) P.push(`beat ${i + 1}: needs on_screen or vo`);
      });
      const B = brief(run);
      const ca = ["check", "--pitch", f, "--truth", R(run, "story", "truth.md")];
      if (B.length_s) ca.push("--length", String(B.length_s));
      if (B.narrated) ca.push("--narrated");
      const r = spawnSync(process.execPath, [path.join(SKILL_DIR, "scripts", "story.mjs"), ...ca], { encoding: "utf8", env: { ...process.env, RASANAI_QUIET: "1" } });
      if (r.status === 2) P.push("story.mjs check says rewrite (run it and fix what it names)");
      else if (r.status !== 0) P.push(`story.mjs check could not read the pitch: ${(r.stderr || "").trim().split("\n")[0]}`);
      // the argument is written first: story/intent-<Label>.json (lib/intent.mjs). Errors block; the uncalibrated ones are warnings.
      {
        const fi = R(run, "story", `intent-${key}.json`);
        let it = null; try { it = loadIntent(fi); } catch (e) { P.push(`story/intent-${key}.json: ${e.message}`); }
        if (!it && !exists(fi)) P.push(`story/intent-${key}.json is missing: write the argument (proposition, ending_first, beats with buys / relation / importance / read) before the script (references/intent.md)`);
        else if (it) {
          const v = validateIntent(it, { lengthS: Number(B.length_s) || 0, durations: beats.map((b) => Number(b.duration_s)) });
          P.push(...v.errors.map((e) => `intent-${key}.json: ${e}`)); W.push(...v.warnings.map((e) => `intent-${key}.json: ${e}`));
          if (Array.isArray(it.beats) && it.beats.length !== beats.length) P.push(`intent-${key}.json has ${it.beats.length} beats and the pitch ${beats.length}: they are the same list (beat N of the pitch is beat N of the intent)`);
        }
      }
      break;
    }
    case "treatment-writer": {
      const f = R(run, "story", `treatment-${key}.json`);
      const t = jsonMaybe(f);
      if (t === null) { P.push(`story/treatment-${key}.json is missing`); break; }
      if (t === undefined) { P.push(`story/treatment-${key}.json is not valid JSON`); break; }
      for (const [l, pp] of [["lyrics", R(run, "music", "lyrics.json")], ["audio", R(run, "music", "audio.json")]]) if (!exists(pp)) P.push(`music/${path.basename(pp)} is missing (lyrics.mjs align / audio first)`);
      if (P.length) break;
      const md = readMaybe(R(run, "story", `TREATMENT-${key}.md`));
      if (md.trim().length < 400) P.push(`story/TREATMENT-${key}.md is ${md.trim() ? "too thin" : "missing"} (the treatment in words for the user: concept, style bible, motifs, each plate, the energy curve, the dare)`);
      const r = spawnSync(process.execPath, [path.join(SKILL_DIR, "scripts", "treatment.mjs"), "check", "--treatment", f, "--lyrics", R(run, "music", "lyrics.json"), "--audio", R(run, "music", "audio.json")], { encoding: "utf8", env: { ...process.env, RASANAI_QUIET: "1" } });
      let j = null;
      try { j = JSON.parse(r.stdout); } catch {}
      if (r.status === 2) {
        const probs = j && Array.isArray(j.problems) ? j.problems : [];
        P.push(`treatment.mjs check says rewrite${probs.length ? `: ${probs.length} problem(s), first: ${typeof probs[0] === "string" ? probs[0] : JSON.stringify(probs[0])}` : " (run it and fix what it names)"}`);
      } else if (r.status !== 0) P.push(`treatment.mjs check could not read the treatment: ${(r.stderr || r.stdout || "").trim().split("\n")[0]}`);
      else if (j && Array.isArray(j.warnings)) for (const w of j.warnings.slice(0, 5)) W.push(typeof w === "string" ? w : JSON.stringify(w));
      break;
    }
    case "visual-writer": {
      const f = R(run, "presenter", `plan-${key}.json`);
      const t = jsonMaybe(f);
      if (t === null) { P.push(`presenter/plan-${key}.json is missing`); break; }
      if (t === undefined) { P.push(`presenter/plan-${key}.json is not valid JSON`); break; }
      if (!Array.isArray(t.beats) || !t.beats.length) { P.push("the plan has no beats[]"); break; }
      for (const k of ["title", "idea"]) if (!String(t[k] || "").trim()) P.push(`the plan needs a ${k} (the user reads it on the Story card)`);
      const ca = ["check", "--plan", f, "--json"];
      for (const [flag, file] of [["--beats", R(run, "presenter", "beats.json")], ["--key", R(run, "presenter", "key.json")]]) if (exists(file)) ca.push(flag, file);
      ca.push("--imagegen", imagegenState() === "ready" ? "ready" : "off");
      const r = spawnSync(process.execPath, [path.join(SKILL_DIR, "scripts", "presenter.mjs"), ...ca], { encoding: "utf8", env: { ...process.env, RASANAI_QUIET: "1" }, timeout: 60000 });
      let j = null;
      try { j = JSON.parse(r.stdout); } catch {}
      if (r.status === 2) {
        const errs = j && Array.isArray(j.findings) ? j.findings.filter((x) => x.level === "error") : [];
        P.push(`presenter.mjs check says rewrite${errs.length ? `: ${errs.length} error(s), first: ${errs[0].beat ? errs[0].beat + " " : ""}${errs[0].code}: ${errs[0].message}${errs[0].fix ? " (fix: " + errs[0].fix + ")" : ""}` : " (run it and fix what it names)"}`);
      } else if (r.status !== 0) P.push(`presenter.mjs check could not read the plan: ${(r.stderr || r.stdout || "").trim().split("\n")[0]}`);
      else if (j && Array.isArray(j.findings)) for (const w of j.findings.filter((x) => x.level !== "error").slice(0, 5)) W.push(`${w.beat ? w.beat + " " : ""}${w.code}: ${w.message}`);
      break;
    }
    case "move-inventor": {
      if (!key || !MOVE_LABELS.includes(key)) { P.push("move-inventor needs --key Sure|Bold|Wild"); break; }
      const f = R(run, "story", `moves-${key}.json`), m = jsonMaybe(f);
      if (m === null) { P.push(`story/moves-${key}.json is missing`); break; }
      if (m === undefined) { P.push(`story/moves-${key}.json is not valid JSON`); break; }
      const pitch = jsonMaybe(R(run, "story", `pitch-${key}.json`));
      if (!pitch) { P.push(`story/pitch-${key}.json is ${pitch === undefined ? "not valid JSON" : "missing"}: the moves are checked against its beats`); break; }
      const pf = productFirst(run, jsonMaybe(R(run, "crew", "plan.json")) || {});
      const r = validateMoves(m, { beats: pitch.beats, productFirst: pf, shape: pitchShape(pitch), uiLabels: pitch.ui_labels, productName: pitch.product || pitch.product_name, pack: jsonMaybe(R(run, "story", `moves-pack-${key}.json`)) || null });
      P.push(...r.errors); W.push(...r.warnings);
      break;
    }
    case "move-juror": {
      const f = R(run, "story", "moves-verdict.json"), v = jsonMaybe(f);
      if (v === null) { P.push("story/moves-verdict.json is missing"); break; }
      if (v === undefined) { P.push("story/moves-verdict.json is not valid JSON"); break; }
      const by = {};
      for (const l of MOVE_LABELS) {
        const m = jsonMaybe(R(run, "story", `moves-${l}.json`));
        if (m && typeof m === "object") by[l] = m; else P.push(`story/moves-${l}.json is ${m === undefined ? "not valid JSON" : "missing"}`);
      }
      const r = validateVerdict(v, by), st = validateSet(by);
      P.push(...st.errors, ...r.errors); W.push(...st.warnings, ...r.warnings);
      break;
    }
    case "move-sketcher": {
      if (!key || !MOVE_LABELS.includes(key)) { P.push("move-sketcher needs --key Sure|Bold|Wild"); break; }
      const vd = jsonMaybe(R(run, "story", "moves-verdict.json")), mv = jsonMaybe(R(run, "story", `moves-${key}.json`));
      const hero = (vd && vd.pitches && vd.pitches[key] && vd.pitches[key].hero) || (mv && Array.isArray(mv.heroes) && mv.heroes[0]);
      if (!hero) { P.push("no hero move for this script: story/moves-verdict.json (or the moves file's heroes) names none"); break; }
      const dir = R(run, "story", "moves", `${key}-${hero}`);
      const r = spawnSync(process.execPath, [path.join(SKILL_DIR, "scripts", "moves.mjs"), "check-rough", "--dir", dir], { encoding: "utf8", env: { ...process.env, RASANAI_QUIET: "1" } });
      let j = null;
      try { j = JSON.parse(r.stdout); } catch {}
      if (r.status === 2 && j) P.push(...(j.errors || []).map((e) => `${key}-${hero}: ${e}`));
      else if (r.status !== 0 || !j) P.push(`moves.mjs check-rough could not run: ${(r.stderr || r.stdout || "").trim().split("\n")[0]}`);
      else W.push(...(j.warnings || []));
      break;
    }
    case "script-editor": {
      const n = jsonMaybe(R(run, "story", "edit-notes.json"));
      if (!n || !Array.isArray(n.pitches)) { P.push("story/edit-notes.json is missing or has no pitches[]"); break; }
      for (const p of n.pitches) {
        if (!["ship", "rewrite", "replace"].includes(p.verdict)) P.push(`${p.id || p.label}: verdict must be ship, rewrite or replace`);
        if (p.verdict !== "ship" && !(p.notes || []).length) P.push(`${p.id || p.label}: a ${p.verdict} verdict needs line notes with fixes`);
        for (const x of p.notes || []) if (!String(x.fix || "").trim()) P.push(`${p.id || p.label} beat ${x.beat}: a note without a fix`);
      }
      // the meaning tests (warnings first): a blind retell from the beat list, the muted hook, the turn, the payoff (agents/script-editor.md)
      for (const p of n.pitches) {
        const miss = ["retell", "retell_matches", "muted_hook_ok", "turn", "payoff_answers"].filter((k) => p[k] == null || p[k] === "");
        if (miss.length) W.push(`${p.id || p.label}: edit notes lack ${miss.join(", ")} (the blind retell, the muted hook, the turn, the payoff)`);
        if (p.verdict === "ship" && p.retell_matches === false) P.push(`${p.id || p.label}: ship, but the blind retell does not match the proposition: that is a rewrite`);
        if (p.verdict === "ship" && /^none\b/i.test(String(p.turn || "").trim())) P.push(`${p.id || p.label}: ship, but the script has no turn (turn: "none"): nothing reverses, so it is a list`);
        if (p.verdict === "ship" && p.payoff_answers === false) W.push(`${p.id || p.label}: ship, but its payoff does not answer the setup`);
      }
      if (!n.recommended) P.push("no recommended pitch");
      else if (productFirst(run, jsonMaybe(R(run, "crew", "plan.json")) || {})) {
        if (String(n.first_watch || "").trim().split(/\s+/).length < 8) P.push('a product-first film: the recommendation needs "first_watch": why a first-time viewer gets this film in one watch with no explanation (8 words at least)');
        const rp = (n.pitches || []).find((x) => x.id === n.recommended);
        if (rp && rp.verdict !== "ship" && !(n.pitches || []).some((x) => x.verdict === "ship")) W.push("no pitch is at verdict ship: the recommendation is the clearest product story, still to be rewritten");
        editorScopeProblems(run, n, P, W);
      }
      break;
    }
    case "structure-critic": {
      // reads story/structure-notes.json and APPLIES its edits (once) to intent.json, chosen.json and scenes.json (cut / merge / move / peak / rest / rewrite)
      const fn = R(run, "story", "structure-notes.json");
      const n = jsonMaybe(fn);
      if (!n) { P.push(`${rel(fn)} is ${n === undefined ? "not valid JSON" : "missing"}`); break; }
      // two spellings of one thing: { verdict: pass | restructure, findings: [{ type: cut | merge | move | peak | rest | buys, beats: [..], to, why, change }] } (agents/structure-critic.md)
      // and { verdict: ship | edit, edits: [{ op, beat | beats, to, buys, why }] }
      const verdict = n.verdict === "pass" ? "ship" : n.verdict === "restructure" ? "edit" : n.verdict;
      if (!["ship", "edit"].includes(verdict)) { P.push('verdict must be "pass" or "restructure"'); break; }
      const FT = { cut: "cut", merge: "merge", move: "move", peak: "peak", rest: "rest", buys: "rewrite" };
      const findings = Array.isArray(n.findings) ? n.findings : [];
      findings.forEach((f, i) => {
        if (!FT[f.type]) P.push(`findings[${i}]: type must be one of ${Object.keys(FT).join(", ")}`);
        if (!(Array.isArray(f.beats) && f.beats.length && f.beats.every((b) => Number.isInteger(b) && b >= 1))) P.push(`findings[${i}]: beats needs the beat numbers as on the sheet`);
        if (!String(f.change || "").trim()) P.push(`findings[${i}]: no change (the exact change, or the new buys sentence)`);
        if (f.type === "merge" && !(Array.isArray(f.beats) && f.beats.length === 2)) P.push(`findings[${i}]: merge needs 2 beats`);
      });
      if (findings.length && !String(n.retell || "").trim()) P.push("retell is empty: write the one-sentence retell from the sheet alone first");
      const edits = Array.isArray(n.edits) && n.edits.length ? n.edits : findings.filter((f) => FT[f.type] && Array.isArray(f.beats) && f.beats.length).map((f) => ({
        op: FT[f.type], why: f.why, ...(f.type === "merge" ? { beats: f.beats, buys: f.change } : f.type === "peak" ? { beat: Number(f.to != null ? f.to : f.beats[0]) } : f.type === "move" ? { beat: f.beats[0], to: f.to } : f.type === "buys" ? { beat: f.beats[0], buys: f.change } : { beat: f.beats[0] }),
      }));
      const OPS = ["cut", "merge", "move", "peak", "rest", "rewrite"];
      if (verdict === "ship" && edits.length) P.push("verdict pass with findings: say restructure, or drop the findings");
      if (verdict === "edit" && !edits.length) P.push("verdict restructure needs at least one finding");
      edits.forEach((e, i) => {
        if (!OPS.includes(String(e.op))) P.push(`edits[${i}]: op must be one of ${OPS.join(", ")}`);
        if (!String(e.why || "").trim()) P.push(`edits[${i}] (${e.op}): no why (name the beat's buys and why it fails it)`);
        if (e.op === "merge" && !(Array.isArray(e.beats) && e.beats.length === 2)) P.push(`edits[${i}]: merge needs beats: [A, B]`);
        else if (e.op !== "merge" && !(Number(e.beat) >= 1)) P.push(`edits[${i}] (${e.op}): needs beat: N (1-based, as numbered on the sheet)`);
        if (e.op === "move" && !(Number(e.to) >= 1)) P.push(`edits[${i}]: move needs to: M`);
        if (e.op === "rewrite" && !["buys", "relation", "importance", "viewer_before", "viewer_after"].some((k) => e[k] != null && String(e[k]).trim() !== "")) P.push(`edits[${i}]: rewrite needs the new buys (or relation / importance / viewer_before / viewer_after)`);
      });
      const fi = R(run, "story", "intent.json"), it = (() => { try { return loadIntent(fi); } catch { return null; } })();
      if (!it) { P.push("story/intent.json is missing or not valid JSON"); break; }
      if (n.retell && it.proposition) {
        const w = (x) => new Set(String(x).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 3));
        const a = w(n.retell), b = w(it.proposition);
        if (![...b].some((t) => a.has(t))) W.push(`the retell ("${String(n.retell).slice(0, 80)}") shares no word with the proposition ("${it.proposition}"): the beats may not carry the argument`);
      }
      if (P.length) break;
      const length = Number(brief(run).length_s) || Number(it.length_s) || 0;
      const chosenB = (jsonMaybe(R(run, "story", "chosen.json")) || {}).beats;
      const durs = Array.isArray(chosenB) && chosenB.length === it.beats.length ? chosenB.map((b) => Number(b.duration_s)) : null;
      if (verdict === "edit" && !n.applied) {
        const res = applyEdits(it, edits);
        for (const k of res.skipped) P.push(`edit ${JSON.stringify(k)} could not be applied: ${k.why}`);
        const resChosen = Array.isArray(chosenB) && chosenB.length === it.beats.length ? applyToScript({ beats: chosenB }, res).beats.map((b) => Number(b.duration_s)) : null;
        const v = validateIntent(res.intent, { lengthS: length, durations: resChosen });
        for (const e of v.errors) P.push(`after the edits, intent.json: ${e}`);
        if (P.length) break; // nothing is written when the edited sheet would be invalid: fix the edits and re-run
        const chosenF = R(run, "story", "chosen.json"), chosen = jsonMaybe(chosenF);
        if (chosen && Array.isArray(chosen.beats) && chosen.beats.length === it.beats.length) {
          fs.copyFileSync(chosenF, R(run, "story", "chosen.pre-structure.json"));
          writeFile(chosenF, JSON.stringify(applyToScript(chosen, res), null, 2) + "\n");
        } else W.push("story/chosen.json has a different number of beats than intent.json (or is missing): edit its beats by hand to match the sheet");
        const scF = R(run, "scenes.json"), sc = jsonMaybe(scF);
        if (sc && Array.isArray(sc.scenes) && sc.scenes.length === it.beats.length) {
          fs.copyFileSync(scF, R(run, "scenes.pre-structure.json"));
          const keep = res.order.map((o) => ({ ...sc.scenes[o - 1] }));
          for (const [o, gone] of Object.entries(res.merged)) for (const m of gone) { const k = res.order.indexOf(Number(o)); if (k >= 0 && Number(sc.scenes[m - 1].duration) > 0) keep[k].duration = +((Number(keep[k].duration) || 0) + Number(sc.scenes[m - 1].duration)).toFixed(2); }
          writeFile(scF, JSON.stringify({ ...sc, scenes: keep }, null, 2) + "\n");
        }
        fs.copyFileSync(fi, R(run, "story", "intent.pre-structure.json"));
        writeFile(fi, JSON.stringify(res.intent, null, 2) + "\n");
        writeFile(fn, JSON.stringify({ ...n, applied: true, applied_at: new Date().toISOString(), removed_beats: res.removed }, null, 2) + "\n");
        CHECK_EXTRA = { result: "applied", beats_before: it.beats.length, beats_after: res.intent.beats.length, removed_beats: res.removed, next: "re-run crew.mjs thumbs (the sheet changed), then fit the music and the durations from the intent: scenes.mjs --intent story/intent.json --retime" };
        W.push(...v.warnings);
      } else {
        const v = validateIntent(it, { lengthS: length, durations: durs });
        for (const e of v.errors) P.push(`intent.json: ${e}`);
        W.push(...v.warnings);
        CHECK_EXTRA = { result: verdict === "ship" ? "ship" : "applied (earlier)" };
      }
      break;
    }
    case "motion-director": {
      if (key !== "seams" && brandFilm(run)) {
        const sj = readMaybe(R(run, "motion", "score.json")) || "";
        if (!/FILM-STYLE|film_style/i.test(sj)) P.push('score.json must cite the brand film card: set "film_style": "brand-film/FILM-STYLE.md" and keep every scene inside its motion vocabulary');
        // a flat card sets the palette and tone of 3D (checkScore's flat-3d-style: matte materials, budgeted bloom), never its use or its depth
      }
      if (key === "seams") {
        const md = readMaybe(R(run, "crew", "seams-report.md"));
        if (!md) { P.push("crew/seams-report.md is missing"); break; }
        const score = jsonMaybe(R(run, "motion", "score.json")) || {};
        const missing = (score.seams || []).filter((s) => !md.includes(`${s.from}>${s.to}`)).map((s) => `${s.from}>${s.to}`);
        if (missing.length) P.push(`seams-report.md doesn't cover seams ${missing.join(", ")} (name each as "N>N+1")`);
        if (pj) {
          const r = spawnSync(process.execPath, [path.join(SKILL_DIR, "scripts", "obey.mjs"), "--project", pj], { encoding: "utf8", env: { ...process.env, RASANAI_QUIET: "1" } });
          if (r.status === 2) P.push("obey.mjs reports violations after the seam fixes");
          else if (r.status !== 0) W.push("obey.mjs could not run");
        }
        break;
      }
      const s = checkScore(run);
      const sj = jsonMaybe(R(run, "motion", "score.json"));
      if (sj) writeFile(R(run, "motion", "score.md"), renderScoreMd(sj));
      P.push(...s.P);
      W.push(...s.W);
      break;
    }
    case "styleframe-designer": {
      const k = String(key || "frames");
      const look = k.startsWith("heroes-") ? k.slice(7) : null;
      const dir = look ? R(run, "design", look, "frames") : R(run, "frames");
      const doc = readShots(path.join(dir, "shots.json"));
      if (doc === null) { P.push(`${rel(path.join(dir, "shots.json"))} is missing (frames.mjs init writes a skeleton)`); break; }
      if (doc === undefined) { P.push(`${rel(path.join(dir, "shots.json"))} is not valid JSON`); break; }
      const want = look ? ["open", "peak", "end"] : null;
      if (look) {
        for (const n of want) for (const ext of ["html", "png"]) if (!exists(path.join(dir, `${n}.${ext}`))) P.push(`design/${look}/frames/${n}.${ext} is missing`);
        const sc = checkShots(doc, { duration: Number(brief(run).length_s) || null });
        // three heroes only: the film-level rules (sizes across the film, heroes list) are for the full set
        for (const e of sc.errors) if (/^(shot-fields|shot-size|light|hero-small|size-repeat|text-heavy)/.test(e)) P.push(e);
        W.push(...sc.warnings.filter((w) => /tilt-steep/.test(w)));
      } else {
        const sc = checkShots(doc, { duration: Number(brief(run).length_s) || Number((jsonMaybe(R(run, "motion", "score.json")) || {}).duration) || null });
        P.push(...sc.errors); W.push(...sc.warnings);
        const heroes = Array.isArray(doc.film.heroes) ? doc.film.heroes.map(String) : [];
        const need = k === "heroes" ? heroes : doc.shots.map((s) => String(s.id));
        for (const b of boardFiles(dir, doc)) if (need.includes(b.id)) { if (!b.has_html) P.push(`frames/${b.id}.html is missing`); if (!b.has_png) P.push(`frames/${b.id}.png is missing (render it: design.mjs stills --dir ${rel(dir)})`); }
        const md = readMaybe(R(run, "frames", "FRAMES.md"));
        if (!md) P.push("frames/FRAMES.md is missing (one line per frame, then ## Revisions)");
        else {
          const rv = (md.split(/^##\s+Revisions/mi)[1] || "").split(/^##\s/m)[0].trim();
          if (rv.length < 60) P.push("frames/FRAMES.md needs \"## Revisions\": what you changed after looking at each PNG, and why (x1's revision passes moved 3 frames up a level)");
        }
        // the frame gate on the rendered boards, when this skill has it: its findings are evidence for the juror, warnings here
        const fg = path.join(SKILL_DIR, "scripts", "frame-gate.mjs");
        if (exists(fg) && boardFiles(dir, doc).some((b) => b.has_png)) {
          const a = [fg, "--stills", dir, "--json"];
          if (fs.readdirSync(dir).some((x) => /^\d+\.html$/.test(x))) a.push("--html", dir);
          if (exists(R(run, "brand-film", "grammar.json"))) a.push("--brand-film", R(run, "brand-film", "grammar.json"));
          const g = spawnSync(process.execPath, a, { encoding: "utf8", env: { ...process.env, RASANAI_QUIET: "1" }, timeout: 300000, maxBuffer: 1 << 26 });
          let gj = null;
          try { gj = JSON.parse(g.stdout); } catch { /* none */ }
          if (gj) { writeFile(path.join(dir, "gate.json"), JSON.stringify(gj, null, 2)); for (const f of (gj.findings || []).slice(0, 8)) W.push(`frame-gate ${f.severity} ${f.check}: ${f.message}${f.fix ? ` (fix: ${f.fix})` : ""}`); }
          else W.push("frame-gate.mjs could not run on the boards");
        }
      }
      for (const f of (exists(dir) ? fs.readdirSync(dir) : []).filter((x) => /\.html$/.test(x))) {
        const html = readMaybe(path.join(dir, f));
        if (!/data-width/.test(html)) P.push(`${rel(path.join(dir, f))}: the root needs data-width / data-height`);
        if (/lorem ipsum|john doe|acme corp|placeholder text/i.test(html)) P.push(`${rel(path.join(dir, f))} has placeholder content`);
      }
      break;
    }
    case "frame-juror": {
      const doc = readShots(R(run, "frames", "shots.json"));
      if (!doc) { P.push("frames/shots.json is missing or invalid (the designer's work comes first)"); break; }
      const v = jsonMaybe(R(run, "frames", "verdict.json"));
      const refsDoc = jsonMaybe(R(run, "frames", "refs.json"));
      const nRefs = refsDoc && Array.isArray(refsDoc.stills) ? refsDoc.stills.length : collectRefs(run, { extract: false }).stills.length;
      if (!refsDoc) W.push("frames/refs.json is missing: run frames.mjs refs --run <run> --sheet and judge against what it lists");
      const r = checkVerdict(v === undefined ? null : v, doc, { refsAvailable: nRefs });
      P.push(...r.errors); W.push(...r.warnings);
      const sheets = R(run, "frames", "sheets");
      const drawn = exists(sheets) ? fs.readdirSync(sheets).filter((f) => /\.png$/.test(f)).length : 0;
      if (!drawn && !exists(R(run, "frames", "sheet.png"))) P.push("no side-by-side sheet (frames/sheets/<id>.png or frames/sheet.png): judge the boards next to the references, never from the code");
      if (exists(R(run, "frames", "gate.json")) && v && !String(v.gate || "").trim()) W.push("frames/gate.json exists: say in verdict.gate what the frame gate measured and how it weighed");
      break;
    }
    case "frame-designer": {
      const [a, b] = String(key || "").split("-").map(Number);
      if (!(a && b)) { P.push("--key must be a range of shot numbers like 4-6"); break; }
      for (let n = a; n <= b; n++) {
        const id = String(n).padStart(2, "0");
        const pick = (ext) => [R(run, "frames", `${id}.${ext}`), R(run, "frames", `${n}.${ext}`)].find(exists);
        for (const ext of ["html", "png", "md"]) if (!pick(ext)) P.push(`frames/${id}.${ext} is missing`);
        const html = readMaybe(pick("html"));
        if (html && !/data-width/.test(html)) P.push(`frames/${id}.html: the root needs data-width / data-height`);
        if (html && /lorem ipsum|john doe|acme/i.test(html)) P.push(`frames/${id}.html has placeholder content`);
      }
      const doc = readShots(R(run, "frames", "shots.json"));
      if (doc) { const sc = checkShots(doc, { duration: Number(brief(run).length_s) || null }); for (const e of sc.errors) if (new RegExp(`\\b(${Array.from({ length: b - a + 1 }, (_, i) => String(a + i).padStart(2, "0")).join("|")})\\b`).test(e)) P.push(e); }
      break;
    }
    case "art-director": {
      const gate = path.join(SKILL_DIR, "scripts", "art.mjs");
      if (!exists(R(run, "art", "plan.json"))) { P.push("art/plan.json is missing (art.mjs plan --run <run>, then edit it)"); break; }
      const r = spawnSync(process.execPath, [gate, "check", "--run", run], { encoding: "utf8", timeout: 120000 });
      let j = null;
      try { j = JSON.parse(r.stdout); } catch { /* none */ }
      if (!j) P.push(`art.mjs check could not run: ${String(r.stderr).trim().split("\n").pop()}`);
      else { for (const x of j.problems || []) P.push(`art: ${x}`); for (const x of j.warnings || []) W.push(`art: ${x}`); }
      const md = readMaybe(R(run, "art", "ART.md"));
      if (!md) P.push("art/ART.md is missing (the world in a paragraph, then the asset sheet)");
      else if (md.trim().split(/\s+/).length < 40) P.push("art/ART.md is thin (the world in a paragraph of 40 words at least: medium, line, palette, light, what never)");
      if (!exists(R(run, "art", "sheet.png"))) W.push("art/sheet.png is missing: make a contact sheet of every asset and look at it (imagegen.mjs sheet, or an ffmpeg tile)");
      break;
    }
    case "scene-animator": {
      if (!pj) { P.push("--project <videos/name> required"); break; }
      if (PRES_KEY.test(String(key))) {
        const pl = key.startsWith("plate-"), sub = pl ? "plates" : "graphics", nm = pl ? key.slice(6) : key;
        const gf = path.join(pj, "compositions", sub, `${nm}.html`);
        if (!exists(gf)) { P.push(`compositions/${sub}/${nm}.html is missing`); break; }
        const rep = readMaybe(R(run, "crew", "animators", `${key}.md`));
        if (!rep) P.push(`crew/animators/${key}.md is missing`);
        else {
          if (!/^##\s+Events/mi.test(rep)) P.push(`crew/animators/${key}.md needs a "## Events" section`);
          const so = (rep.split(/^##\s+Showing off/mi)[1] || "").split(/^##\s/m)[0].trim();
          if (so.length < 40) P.push(`crew/animators/${key}.md needs "## Showing off": what in this graphic would make a reel, and what you did to earn it`);
        }
        for (const sfx of ["overview", "move"]) if (!exists(R(run, "crew", "animators", `${key}-${sfx}.png`))) P.push(`no ${sfx} strip (crew/animators/${key}-${sfx}.png): look at your motion`);
        if (/data-scaffold|rasanai:scaffold/i.test(readMaybe(gf))) P.push(`compositions/${sub}/${nm}.html is still the scaffold: replace it with the designed ${pl ? "plate" : "graphic"}`);
        const r2 = spawnSync(process.execPath, [path.join(SKILL_DIR, "scripts", "obey.mjs"), "--project", pj, "--run", run, "--json"], { encoding: "utf8", env: { ...process.env, RASANAI_QUIET: "1" } });
        let j2 = null;
        try { j2 = JSON.parse(r2.stdout); } catch {}
        if (!j2) W.push("obey.mjs could not run");
        else {
          const rf = path.join("compositions", sub, `${nm}.html`);
          const e2 = (j2.findings || []).filter((x) => x.file === rf && x.severity === "error");
          if (e2.length) P.push(`obey.mjs: ${e2.length} violations in ${rf} (first: ${e2[0].rule}${e2[0].target ? " on " + e2[0].target : ""})`);
        }
        break;
      }
      const n = Number(key);
      const dir = path.join(pj, "compositions", "frames");
      const file = exists(dir) ? fs.readdirSync(dir).find((f) => new RegExp(`^0*${n}[-_.]`).test(f) && f.endsWith(".html")) : null;
      if (!file) { P.push(`no compositions/frames/${String(n).padStart(2, "0")}-*.html`); break; }
      const report = readMaybe(R(run, "crew", "animators", `${n}.md`));
      if (!report) P.push(`crew/animators/${n}.md is missing`);
      else {
        if (!/^##\s+Events/mi.test(report)) P.push(`crew/animators/${n}.md needs a "## Events" section`);
        const so = (report.split(/^##\s+Showing off/mi)[1] || "").split(/^##\s/m)[0].trim();
        if (so.length < 40) P.push(`crew/animators/${n}.md needs "## Showing off": the moment in this scene that would make your reel, and what you did to earn it`);
      }
      for (const s of ["overview", "move"]) if (!exists(R(run, "crew", "animators", `${n}-${s}.png`))) P.push(`no ${s} strip (crew/animators/${n}-${s}.png): look at your motion`);
      const sc3 = ((jsonMaybe(R(run, "motion", "score.json")) || {}).scenes || []).find((x) => Number(x.n) === n);
      if (is3d(sc3)) {
        const html = readMaybe(path.join(dir, file));
        if (!/Rasan3D\.stage\s*\(/.test(html)) P.push(`the score puts scene ${n} in ${sc3.space}, but ${file} has no Rasan3D stage (build it from stage3d.mjs scaffold; references/3d.md)`);
        else {
          const g = spawnSync(process.execPath, [path.join(SKILL_DIR, "scripts", "stage3d.mjs"), "check", "--project", pj, "--file", path.join(dir, file), "--json"], { encoding: "utf8", env: { ...process.env, RASANAI_QUIET: "1" }, timeout: 300000 });
          let gj = null;
          try { gj = JSON.parse(g.stdout); } catch {}
          if (!gj) P.push("stage3d.mjs check could not run on the scene");
          else {
            const ge = (gj.findings || []).filter((x) => x.severity === "error");
            if (ge.length) P.push(`stage3d.mjs check: ${ge.length} error(s) in ${file} (first: ${ge[0].rule}${ge[0].track ? " on " + ge[0].track : ""}: ${ge[0].message})`);
            if ((gj.could_not_run || []).length) P.push(`stage3d.mjs check could not run: ${gj.could_not_run[0]}`);
          }
        }
        const d3 = report ? (report.split(/^##\s+3D\b/mi)[1] || "").split(/^##\s/m)[0].trim() : "";
        if (d3.length < 60) P.push(`crew/animators/${n}.md needs a "## 3D" section: the lens and why, the light and why, the materials, how the seams match, the frame cost`);
      }
      const r = spawnSync(process.execPath, [path.join(SKILL_DIR, "scripts", "obey.mjs"), "--project", pj, "--run", run, "--json"], { encoding: "utf8", env: { ...process.env, RASANAI_QUIET: "1" } });
      let j = null;
      try { j = JSON.parse(r.stdout); } catch {}
      if (!j) { W.push("obey.mjs could not run"); break; }
      const relFile = path.join("compositions", "frames", file);
      const errs = (j.findings || []).filter((x) => x.file === relFile && x.severity === "error");
      if (errs.length) P.push(`obey.mjs: ${errs.length} violations in ${file} (first: ${errs[0].rule}${errs[0].target ? " on " + errs[0].target : ""})`);
      if ((j.could_not_run || []).some((x) => String(x).includes(file))) P.push(`obey.mjs could not check ${file} (a script error, or the timeline isn't registered on window.__timelines)`);
      break;
    }
    case "film-builder": {
      if (!pj) { P.push("--project <videos/name> required"); break; }
      const k = key || "film", lead = k === "lead";
      const report = readMaybe(R(run, "crew", "builder", `${k}.md`));
      if (!report) P.push(`crew/builder/${k}.md is missing`);
      else {
        if (!/^##\s+Events/mi.test(report)) P.push(`crew/builder/${k}.md needs a "## Events" section (t=<s> <what>, film seconds)`);
        if (!/^##\s+Carriers/mi.test(report)) P.push(`crew/builder/${k}.md needs a "## Carriers" section: each object that crosses a cut, the seam it carries and how it keeps moving through it`);
        const so = (report.split(/^##\s+Showing off/mi)[1] || "").split(/^##\s/m)[0].trim();
        if (!lead && so.length < 40) P.push(`crew/builder/${k}.md needs "## Showing off": the moments in this film that would make your reel, and what you did to earn them`);
      }
      if (!lead) {
        // hero moves: a key-pose board before the build (boards/<id>.png), and a 24 fps strip of the built move under crew/
        const sc = jsonMaybe(R(run, "motion", "score.json")) || {};
        const heroes = (Array.isArray(sc.moves) ? sc.moves : []).filter((e) => e && e.id && e.status === "used").map((e) => String(e.id));
        const walk = (d, acc = []) => { try { for (const f of fs.readdirSync(d, { withFileTypes: true })) f.isDirectory() ? walk(path.join(d, f.name), acc) : acc.push(f.name); } catch { /* none */ } return acc; };
        const crewFiles = heroes.length ? walk(R(run, "crew")) : [];
        for (const id of heroes) {
          if (!exists(R(run, "boards", `${id}.png`))) W.push(`no-pose-board: hero move ${id} has no boards/${id}.png (4 to 6 key poses first: start, anticipation, smear or bridge, settle, end; design.mjs stills)`);
          if (!crewFiles.some((f) => f.includes(id) && /strip/i.test(f) && /\.(png|jpe?g)$/i.test(f))) W.push(`hero-not-stripped: no 24 fps strip of hero move ${id} under crew/ (crew.mjs strip --fps 24 --from --to, named with the move id: a 2 fps sheet cannot show a smear or a settle)`);
        }
      }
      for (const s of ["overview", "seams"]) if (!exists(R(run, "crew", "builder", `${k}-${s}.png`))) P.push(`no ${s} strip (crew/builder/${k}-${s}.png): look at your motion`);
      const carriers = path.join(pj, "compositions", "carriers");
      const frames = path.join(pj, "compositions", "frames");
      if (lead && !(exists(carriers) && fs.readdirSync(carriers).some((f) => f.endsWith(".html")))) W.push("no compositions/carriers/*.html: a film with no object crossing a cut (say why in the report)");
      if (!lead) {
        const S = ((jsonMaybe(R(run, "motion", "score.json")) || {}).scenes || []);
        const built = exists(frames) ? fs.readdirSync(frames).filter((f) => /^\d+[-_.].*\.html$/.test(f)) : [];
        if (S.length && built.length < S.length) P.push(`${built.length} beat files in compositions/frames/ for ${S.length} beats in the plan (one author writes every beat)`);
      }
      const r = spawnSync(process.execPath, [path.join(SKILL_DIR, "scripts", "obey.mjs"), "--project", pj, "--run", run, "--json"], { encoding: "utf8", env: { ...process.env, RASANAI_QUIET: "1" } });
      let j = null;
      try { j = JSON.parse(r.stdout); } catch {}
      if (!j) W.push("obey.mjs could not run");
      else {
        const errs = (j.findings || []).filter((x) => x.severity === "error");
        if (errs.length) P.push(`obey.mjs: ${errs.length} violations (first: ${errs[0].file} ${errs[0].rule}${errs[0].target ? " on " + errs[0].target : ""})`);
      }
      const gateScript = path.join(SKILL_DIR, "scripts", "motion-gate.mjs");
      if (exists(gateScript) && exists(R(run, "motion", "score.json"))) {
        const g = spawnSync(process.execPath, [gateScript, "--project", pj, "--plan", R(run, "motion", "score.json"), "--json"], { encoding: "utf8", env: { ...process.env, RASANAI_QUIET: "1" }, timeout: 300000 });
        let gj = null;
        try { gj = JSON.parse(g.stdout); } catch {}
        if (!gj) W.push("motion-gate.mjs could not run on the project");
        else { const ge = (gj.findings || []).filter((x) => x.severity === "error"); if (ge.length) P.push(`motion-gate.mjs: ${ge.length} finding(s) in the code (first: ${ge[0].check}${ge[0].at != null ? " at " + ge[0].at + " s" : ""}: ${ge[0].message})`); }
      }
      break;
    }
    case "brand-film-analyst": {
      const dir = R(run, "brand-film");
      const jf = R(dir, "FILM-STYLE.json"), mf = R(dir, "FILM-STYLE.md");
      const j = jsonMaybe(jf), md = readMaybe(mf);
      if (!j) { P.push(`${rel(jf)} is ${j === undefined ? "not valid JSON" : "missing (run brandfilm.mjs card first)"}`); break; }
      if (!md) { P.push(`${rel(mf)} is missing`); break; }
      if (j.filled !== true) P.push('FILM-STYLE.json "filled" must be true once every slot is written');
      const sl = j.slots || {};
      for (const k of ["typefaces", "motif", "layout", "motionVocabulary", "photographyStyle", "endCard", "tempo"]) if (String(sl[k] || "").trim().length < 12) P.push(`FILM-STYLE.json slots.${k} is empty or thin: read the contact sheets and write it (or "none: <what the film uses instead>")`);
      const need = [["canvas", /canvas|background/i], ["palette and shares", /palette/i], ["typefaces", /typeface|type\b/i], ["type scale", /scale|statement|label|size/i], ["layout", /layout|grid/i], ["motif", /motif/i], ["motion vocabulary", /motion/i], ["photography or illustration", /photograph|illustration|imagery/i], ["cut rate", /cut rate|cuts|shot length/i], ["tempo (ideas, seconds per idea, change rate, longest hold)", /tempo/i], ["transitions", /transition/i], ["end card", /end card/i]];
      for (const [n, re] of need) if (!re.test(md)) P.push(`FILM-STYLE.md says nothing about ${n} (the grammar checklist, references/launch-film.md section 3)`);
      if (/^-\s+[^:\n]+:\s*$/m.test(md.split(/^##\s+Slots/mi)[1] || "")) P.push("FILM-STYLE.md still has an empty slot (a bullet ending in a colon): fill every one");
      if (!/^(#+\s*)?sources?\b/mi.test(md)) P.push("FILM-STYLE.md names no source: list the film(s) read (url or file), or say it is a website fallback");
      if (!/\bsubstitute\b/i.test(md)) W.push("if a typeface is proprietary, name a loadable \"Substitute: <family>\" so the design systems can load it");
      // W4: seen / not seen (allowed on a budget), never a ban list; the finish line comes from the measured numbers
      const mv = String(sl.motionVocabulary || "");
      if (!/\bseen\b/i.test(mv) || !/\bnot seen\b/i.test(mv)) W.push('motionVocabulary should read "Seen: ..." and "Not seen (allowed on a budget): ...": effects the films do not show are budgets, not bans (references/brand-film.md section 4)');
      if (/\b(never used|banned)\b/i.test(`${mv} ${md}`)) W.push('FILM-STYLE writes a "never used" / "banned" list: rewrite it as "Not seen (allowed on a budget)"; the card locks palette, type, logo, UI and tone, never finish, depth or camera');
      if (!/^[\s>*_-]*\**Finish\b[^:\n]*:/im.test(md)) W.push('FILM-STYLE.md has no "Finish:" line: copy the measured finish (grain, ground tint and falloff, vignette, soft shadow, route) and what the eye confirms');
      break;
    }
    case "concept-critic": {
      { const why = editorGate(run, jsonMaybe(R(run, "crew", "plan.json")) || {}); if (why) P.push(why); }
      const f = R(run, "story", "concept-check.json");
      const c = jsonMaybe(f);
      if (!c) { P.push(`${rel(f)} is ${c === undefined ? "not valid JSON" : "missing"}`); break; }
      if (!["pass", "fix"].includes(c.verdict)) P.push('verdict must be "pass" or "fix"');
      const Q = ["product_on_screen_by_3s", "hero_moment", "tone_matches_brief", "end_line_large", "on_brand", "first_watch_clear", ...(exists(R(run, "story", "intent.json")) ? ["turn_reverses", "payoff_answers_setup"] : []), ...(productFirst(run, jsonMaybe(R(run, "crew", "plan.json")) || {}) ? ["one_feature_one_scenario", "scope_matches_claim"] : [])];
      { const sm = c.answers && c.answers.scope_matches_claim; if (sm && typeof sm.ok === "boolean" && !/\d/.test(String(sm.evidence || ""))) P.push("answers.scope_matches_claim must carry the numbers (S_max with its beats, D, the 8-word retell), never a judgement without them"); }
      for (const q of Q) {
        const a = c.answers && c.answers[q];
        if (!a || typeof a.ok !== "boolean" || !String(a.evidence || "").trim()) P.push(`answers.${q} needs {ok: true|false, evidence: "<the beat or line it rests on>"}`);
        else if (!a.ok && c.verdict === "pass") P.push(`answers.${q} is not ok but the verdict is pass`);
        else if (!a.ok && !String(a.fix || "").trim()) P.push(`answers.${q} fails with no exact fix`);
      }
      if (c.verdict === "fix" && !Q.some((q) => c.answers && c.answers[q] && c.answers[q].ok === false)) P.push("a fix verdict needs at least one failed answer");
      break;
    }
    case "critic": {
      const [lens, round] = String(key || "").split("-");
      const f = R(run, "crew", `critic-${lens}-${Number(round) || 1}.json`);
      const c = jsonMaybe(f);
      if (!c) { P.push(`${rel(f)} is ${c === undefined ? "not valid JSON" : "missing"}`); break; }
      if (!["ship", "fix"].includes(c.verdict)) P.push('verdict must be "ship" or "fix"');
      if (!c.scores || !Object.keys(c.scores).length) P.push("no scores");
      else if (["frames", "motion", "film"].includes(lens) && !(Number(c.scores.ambition) >= 1)) P.push('scores need "ambition" (1-10): competent-but-safe is a fail, say so');
      const fs_ = Array.isArray(c.findings) ? c.findings : [];
      if (c.verdict === "fix" && !fs_.length) P.push("a fix verdict needs findings");
      // the motion and film critics never judge without a render AND the motion gate's report on it
      if (["motion", "film"].includes(lens)) {
        const gr = jsonMaybe(R(run, "crew", "motion-gate.json"));
        if (!gr) P.push(`no motion gate report (crew/motion-gate.json): the ${lens} critic judges a draft render with the gate's numbers, never stills alone. The Director runs motion-gate.mjs --video <draft.mp4> --plan <run>/motion/score.json --project <dir> --json > <run>/crew/motion-gate.json first`);
        else if (gr.verdict === "fail" && c.verdict === "ship") P.push(`ship while the motion gate fails (${(gr.findings || []).filter((x) => x.severity === "error").length} finding(s)): fix those first`);
      }
      fs_.forEach((x, i) => {
        if (!String(x.fix || "").trim()) P.push(`finding ${i + 1}: no exact fix`);
        if (lens !== "grounding" && x.scene == null) W.push(`finding ${i + 1}: no scene`);
      });
      // the blind retell (film lens) and structure findings (round 1 of frames / film only): agents/critic.md
      if (lens === "film" && exists(R(run, "story", "intent.json"))) {
        if (!String(c.retell || "").trim()) P.push('film lens: "retell" is missing (one sentence from the draft, written before reading story/intent.json)');
        const rm = String(c.retell_match || "").trim().toLowerCase();
        if (!/^(yes|partly|no)\b/.test(rm)) P.push('film lens: "retell_match" must start with yes, partly or no (then what the film said instead)');
        else if (rm.startsWith("no") && !fs_.some((x) => x.severity === "high")) P.push("the retell does not match the proposition: that is a high finding");
      }
      const OPS = ["cut", "merge", "move", "peak", "rest", "rewrite"];
      fs_.forEach((x, i) => {
        if (x.type !== "structure") return;
        if (!["frames", "film"].includes(lens) || (Number(round) || 1) > 1) P.push(`finding ${i + 1}: a structure finding is allowed only in round 1 of the frames and film lenses (structure is locked after the first draft: report it as a high execution finding)`);
        const e = x.edit || {};
        if (!OPS.includes(e.op)) P.push(`finding ${i + 1}: a structure finding needs edit.op (${OPS.join(" | ")}), in the form lib/intent.mjs applyEdits takes`);
        else if (e.op === "merge" ? !(Array.isArray(e.beats) && e.beats.length === 2) : !(Number(e.beat) >= 1)) P.push(`finding ${i + 1}: edit ${e.op} needs ${e.op === "merge" ? "beats: [a, b]" : "beat (1-based)"}`);
        else if (e.op === "move" && !(Number(e.to) >= 1)) P.push(`finding ${i + 1}: edit move needs "to" (1-based)`);
        else if (e.op === "rewrite" && !String(e.buys || "").trim()) P.push(`finding ${i + 1}: edit rewrite needs the new "buys"`);
      });
      const edits = fs_.filter((x) => x.type === "structure" && x.edit).map((x) => x.edit);
      if (edits.length) CHECK_EXTRA = { ...(CHECK_EXTRA || {}), structure_edits: edits }; // the Director applies them with lib/intent.mjs applyEdits (+ applyToScript), then re-times with scenes.mjs --intent --retime
      if (brandFilm(run) && ["frames", "film"].includes(lens)) {
        const sm = c.style_match;
        if (!sm || !["pass", "fail"].includes(String(sm.verdict || "").toLowerCase()) || !String(sm.numbers || "").trim()) P.push('a branded film needs style_match: {verdict: "pass|fail", numbers: "<the brandfilm.mjs compare numbers>", note} (run brandfilm.mjs compare first)');
        else if (String(sm.verdict).toLowerCase() === "fail" && c.verdict === "ship") P.push("ship with a failed style match: fix the frames until brandfilm.mjs compare passes");
      }
      const low = Object.entries(c.scores || {}).filter(([, v]) => Number(v) < 8);
      if (c.verdict === "ship" && (low.length || fs_.some((x) => x.severity === "high"))) P.push("ship needs every score ≥ 8 and no high finding");
      break;
    }
    case "footage-logger": {
      if (!key) { P.push("footage-logger needs --key <bin id>"); break; }
      const r = checkLog(run, key);
      P.push(...r.P); W.push(...r.W);
      const md = readMaybe(R(run, "footage", `LOG-${key}.md`));
      if (!md) P.push(`footage/LOG-${key}.md is missing`);
      else if (!/^##\s+Looked at/mi.test(md)) P.push(`LOG-${key}.md needs "## Looked at": every strip or keyframe you opened`);
      break;
    }
    case "selects-producer": {
      const r = checkSelects(run);
      P.push(...r.P); W.push(...r.W);
      const md = readMaybe(R(run, "footage", "SELECTS.md"));
      if (md && !/^##\s+Looked at/mi.test(md)) P.push('SELECTS.md needs "## Looked at": the candidates and strips you opened');
      break;
    }
    case "footage-writer": {
      if (!key) { P.push("footage-writer needs --key Sure|Bold|Wild"); break; }
      const pf = R(run, "story", `paper-${key}.json`);
      const r = checkPaper(run, pf, { length: Number(brief(run).length_s) || 0 });
      P.push(...r.P); W.push(...r.W);
      const j = jsonMaybe(pf) || {};
      const a = j.aim || {};
      for (const k of ["takeaway", "feel", "action", "audience"]) if (!String(a[k] || "").trim()) P.push(`aim.${k} missing`);
      if (!["journey", "before-after", "portrait", "list-of-moments", "day-in-the-life", "problem-result-proof", "countdown", "montage-to-line"].includes(j.shape)) P.push('shape must be one of journey|before-after|portrait|list-of-moments|day-in-the-life|problem-result-proof|countdown|montage-to-line');
      if (!String(j.title || "").trim() || !String(j.logline || "").trim()) P.push("title and logline are required");
      if (!exists(R(run, "story", `PAPER-${key}.md`))) P.push(`story/PAPER-${key}.md is missing`);
      break;
    }
    case "brand-kit-builder": {
      const f = research("brand/DESIGN.md");
      if (!exists(f)) { P.push("research/brand/DESIGN.md is missing"); break; }
      let B;
      try { B = readDesignMd(f); } catch (e) { P.push(`brand.mjs can't read research/brand/DESIGN.md: ${e.message}`); break; }
      for (const r of ["canvas", "ink", "accent"]) if (!(B.roles || {})[r]) P.push(`DESIGN.md has no ${r} colour`);
      if (!(B.fonts && B.fonts.display && B.fonts.display.family)) P.push("DESIGN.md has no display font");
      for (const w of B.warnings || []) W.push(`brand.mjs: ${w}`);
      const md = readMaybe(f);
      const colLines = ((md.split(/^colors:\s*$/m)[1] || "").split(/^\S/m)[0] || "").split("\n").filter((l) => /#[0-9a-f]{3,8}/i.test(l));
      const cited = colLines.filter((l) => /(source|measured|\.pdf|\.svg|\.png|\bp\.?\s?\d+|page\s+\d+)/i.test(l.split(/#[0-9a-f]{3,8}"?/i).slice(1).join(" ")));
      if (colLines.length && !cited.length) P.push("no colour cites its source: put the file and page in each colour's comment (# source: Brand Guidelines.pdf p.14) or say it was measured from an asset");
      else if (colLines.length > cited.length) W.push(`${colLines.length - cited.length} colour(s) cite no source`);
      const lg = readLogos(research("brand/assets"));
      P.push(...lg.problems); W.push(...lg.warnings);
      const fdir = research("brand/fonts");
      const staged = exists(fdir) ? fs.readdirSync(fdir).filter((x) => /\.(otf|ttf|woff2?|ttc)$/i.test(x)) : [];
      if (!staged.length && !/substitut/i.test(md)) P.push("research/brand/fonts/ has no font file and DESIGN.md names no substitute: stage the kit's font files, or declare the web substitute and why");
      const kit = readMaybe(research("brand/KIT.md"));
      if (!kit) P.push("research/brand/KIT.md is missing (the rules from the guidelines in plain words)");
      else if (!/forbidden|never|must not|don'?t/i.test(kit)) P.push("KIT.md lists no forbidden uses: write them from the guidelines (or say the guidelines name none)");
      if (!readMaybe(research("brand.md"))) P.push("research/brand.md (where every token came from) is missing");
      break;
    }
    case "ab-juror": {
      const k = key || String(abLatest(run) || "");
      const rf = R(run, "crew", `ab-${k}.json`), vf = R(run, "crew", `ab-${k}-verdict.json`);
      const rec = jsonMaybe(rf), v = jsonMaybe(vf);
      if (!rec) { P.push(`crew/ab-${k}.json is missing (crew.mjs ab writes it)`); break; }
      if (v === null) { P.push(`crew/ab-${k}-verdict.json is missing`); break; }
      if (v === undefined || typeof v !== "object") { P.push(`crew/ab-${k}-verdict.json is not valid JSON`); break; }
      if (v.pick !== "X" && v.pick !== "Y") P.push('"pick" must be "X" or "Y" (no tie: take the one you would show)');
      const rs = Array.isArray(v.reasons) ? v.reasons.filter((x) => String(x || "").trim().length > 15) : [];
      if (rs.length < 2) P.push(`"reasons" needs 2 to 6 lines, each naming a second and a film (found ${rs.length})`);
      if (rs.length > 6) W.push("more than 6 reasons: keep the ones that decided it");
      const dims = ["boldness", "readability", "ending", "rhythm"];
      for (const x of ["X", "Y"]) for (const dm of dims) { const n = Number(v.scores && v.scores[x] && v.scores[x][dm]); if (!(n >= 1 && n <= 10)) P.push(`scores.${x}.${dm} must be 1 to 10`); }
      if (!String(v.loses_on || "").trim()) W.push('"loses_on" is empty: say what the film not picked does better (a fix can borrow it)');
      // the juror was never told the order: a reason that guesses it is a breach, and the verdict is asked again
      const leak = JSON.stringify([v.reasons, v.loses_on]).match(/\b(newer|newest|older|oldest|revised|revision|draft|version|improved|regress(?:ed|ion)?|reworked|fix round|after the fix)\b/i);
      if (leak) P.push(`a reason says "${leak[0]}": you were not told which film came first, so judge the two finished films only; rewrite the reasons without it`);
      if (!P.length) {
        const winnerRole = rec.order[v.pick]; // "new" | "prev"
        const result = winnerRole === "new" ? "keep" : "revert";
        rec.verdict = { pick: v.pick, winner: winnerRole, result, at: new Date().toISOString(), scores: v.scores, loses_on: v.loses_on || null };
        fs.writeFileSync(rf, JSON.stringify(rec, null, 2));
        CHECK_EXTRA = { result, winner: winnerRole, picked: v.pick, next: result === "keep" ? "the new version won the blind A/B: accept the round" : "the new version LOST the blind A/B: go back to the previous version's project state (git checkout of the project, or its .superseded copy), keep only fixes that do not lose (re-apply each on the old state and A/B again if in doubt), and log it: console.mjs push ... --because \"round N lost the blind A/B: <loses_on>\"", loses_on: v.loses_on || null };
      }
      break;
    }
    case "retrospective": {
      const f = R(run, "crew", "retrospective.json"), v = jsonMaybe(f);
      if (v === null) { P.push("crew/retrospective.json is missing"); break; }
      if (v === undefined || typeof v !== "object" || !Array.isArray(v.lessons)) { P.push("crew/retrospective.json is not valid JSON with a lessons array"); break; }
      if (v.lessons.length > 2) P.push(`${v.lessons.length} lessons: at most 2`);
      if (!v.lessons.length && !String(v.none_because || "").trim()) P.push('no lessons and no "none_because": say what you read and why nothing was worth carrying');
      const known = new Set(readLessons().map((r) => String(r.rule).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()));
      const cmds = [];
      v.lessons.forEach((l, i) => {
        const w = `lessons[${i}]`, rule = String((l && l.rule) || "").trim();
        if (!rule || /\n/.test(rule) || rule.length > 200) P.push(`${w}.rule must be one line of at most 200 characters`);
        if (!LESSON_AREAS.includes(l && l.area)) P.push(`${w}.area must be one of ${LESSON_AREAS.join(", ")}`);
        if (!LESSON_KINDS.includes(l && l.kind)) P.push(`${w}.kind must be ${LESSON_KINDS.join(" or ")}`);
        if (!String((l && l.quote) || "").trim()) P.push(`${w}.quote is empty: the finding, verdict reason or note that earned the rule, verbatim`);
        if (known.has(rule.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())) P.push(`${w} is already in lessons.mjs list`);
        if (rule && LESSON_AREAS.includes(l.area) && LESSON_KINDS.includes(l.kind)) cmds.push(`node "${path.join(SKILL_DIR, "scripts", "lessons.mjs")}" add --source self --rule ${JSON.stringify(rule)} --quote ${JSON.stringify(String(l.quote || ""))} --kind ${l.kind} --area ${l.area} --run "${rel(run)}"`);
      });
      if (!P.length) CHECK_EXTRA = { record: cmds, next: cmds.length ? "run each record line (they are Claude's own notes: ranked below the user's, never a gate)" : "nothing to record" };
      break;
    }
    default:
      die(`unknown role "${role}"`);
  }
  return { P, W };
}

// ---------------------------------------------------------------- the plan in words, and the builder's brief
const r2 = (x) => Math.round(Number(x) * 100) / 100;
export function renderScoreMd(score) {
  const S = score.scenes || [], f = score.feature || {};
  const L = ["<!-- generated from motion/score.json by crew.mjs: edit the JSON, never this file -->", `# The plan: ${score.brand || "the film"}${score.duration ? `, ${score.duration} s` : ""}`, ""];
  if (f.name) L.push(`**Feature:** ${f.name}${f.url ? ` (${f.url})` : ""}. **Viewer:** ${f.viewer || "?"}. **Task:** ${f.task || "?"}.`, `**Before:** ${f.before || "?"} **After:** ${f.after || "?"}`, "");
  L.push(`**World:** ground ${score.ground || "?"}, ink ${score.ink || "?"}, current ${score.current || "left"}. **Brand reveal:** ${score.brandReveal || "?"}${score.end_hold_s ? `. **End card still for at most:** ${score.end_hold_s} s` : ""}.`);
  if (score.spine) L.push(`**Spine:** ${score.spine}`);
  if (score.motif) L.push(`**Motif:** ${score.motif.what || ""} (beats ${(score.motif.scenes || []).join(", ")})`);
  if (score.rhythm) L.push(`**Rhythm:** ${score.rhythm}`);
  if ((score.showreel || []).length) L.push(`**Showreel moments:** ${score.showreel.map((m) => `beat ${m.scene}${m.t != null ? ` at ${m.t} s` : ""}: ${m.what}`).join("; ")}`);
  L.push("", "## Beats", "");
  for (const x of S) {
    L.push(`### ${x.id || x.n} · ${x.start != null ? `${r2(x.start)}-${r2(x.end)} s` : `${x.duration} s`}${x.title ? ` · ${x.title}` : ""}`);
    if (x.line != null) L.push(`- **Line:** ${x.line === "" ? "(none)" : x.line}`);
    if (x.picture) L.push(`- **Picture:** ${x.picture}`);
    if (x.moment || x.take) L.push(`- **Take${x.moment ? ` (from ${x.moment})` : ""}:** ${x.take || ""}`);
    for (const u of x.ui || []) L.push(`- **UI:** ${u}`);
    for (const sh of x.shots || []) L.push(`- ${r2(sh.t0)}-${r2(sh.t1)} s: ${sh.on_screen}. ${sh.moves}${sh.primary ? ` (primary: ${sh.primary})` : ""}`);
    if (x.camera) L.push(`- **Camera:** ${x.camera}${x.space && x.space !== "2d" ? ` · ${x.space}` : ""}`);
    if (x.exit) L.push(`- **Exit:** ${x.exit}${x.carrier ? `: ${x.carrier}` : ""}`);
    L.push("");
  }
  if ((score.seams || []).length) {
    L.push("## Seams (both sides moving)", "");
    for (const sm of score.seams) L.push(`- ${sm.from}>${sm.to}: ${sm.kind}${sm.element ? ` (${sm.element})` : ""}${sm.out ? `, out ${sm.out.direction} at ${sm.out.speed} px/s` : ""}${sm.in ? `, in ${sm.in.direction} at ${sm.in.speed} px/s` : ""}${sm.why ? `: ${sm.why}` : ""}`);
  }
  return L.join("\n") + "\n";
}
// BUILD.md: the builder's short brief, generated from the plan. With the plan it is all the builder must read (about 20 KB).
export function renderBuildMd(score, { direct = true, gateCmd = "", carriersCmd = "" } = {}) {
  const S = score.scenes || [];
  return [
    "<!-- generated from motion/score.json by crew.mjs storyboard: edit the plan, never this file -->",
    `# Build brief: ${score.brand || "the film"}`,
    "",
    `The plan is \`motion/score.json\` (in words: MOTION-SCORE.md). It is the one contract: where DIRECTION.md, STORYBOARD.md, frame.md, a style card or a moment's own notes say otherwise about timing, holds, motion or seams, the plan and this brief win.`,
    "",
    "## What to build",
    "",
    direct ? "- ONE author builds the whole film: every beat and every carrier, in one pass." : "- The lead builder builds the root and the carriers; scene animators build the beats around the carriers' landing rects.",
    `- ${S.length} beats, back to back, each at the path its frame packet names (\`compositions/frames/NN-*.html\`), times exactly the plan's: ${S.map((x) => `${x.id || x.n} ${r2(x.start)}-${r2(x.end)} s`).join(", ")}.`,
    `- One ground (${score.ground || "the plan's ground"}), painted only by the root; beats are transparent. Ink ${score.ink || "?"}. The film's direction: ${score.current || "left"}.`,
    "- Every object that crosses a cut is a carrier: `compositions/carriers/<name>.html`, its root timed in film seconds (`data-start`, `data-duration`) across the beats it joins, mounted on its own track with " + (carriersCmd ? `\`${carriersCmd}\`` : "`video.mjs carriers`") + " after the index is assembled. At least two seams are carried.",
    `- The brand mark is revealed once, in beat \`${score.brandReveal || "?"}\`, and every logo element is tagged \`data-brand-mark\`. The logo is the downloaded file in \`assets/brand/\`, never drawn.`,
    "- The product's UI behaves like the product: animate each beat's `ui` list, cause then effect. No invented output screens.",
    "- Each beat's `take` is one mechanic from a reference moment (`$RUN/references/moments/<id>/`, read-only): build it fresh with this film's content; never copy its code, copy, brand, bookends or frame tables.",
    "",
    "## Motion (obey checks the code, the motion gate measures the draft)",
    "",
    "- The boards (`$RUN/frames/<NN>.png`, `frames/shots.json`) are the picture: at each beat's peak the frame matches its board.",
    "- Move like a person animated it: a curve per role (launch, glide, settle, exit, drift; none on more than 40% of moves), durations from travel and size (0.7 to 1.2 s past 10% of the frame), the next gesture at 55 to 75% of the last, secondaries 2 to 4 frames behind, travels on arcs, about 1 landing in 8 settling. `RasanMotion` (`motionkit.mjs install`) writes all of it; `motion.md` has the numbers.",
    "- A living frame: a camera push or drift per shot, composed holds. No dead stretch of 0.8 s outside the end card; the end card lands in sequence, then holds at most " + (score.end_hold_s || 1.4) + " s still.",
    "- Every seam: the outgoing beat still moving when the cut lands, the incoming beat arriving already moving, same axis, direction and roughly speed. Never settle and then cut.",
    "- Cursors travel on arcs and rest before they click; many similar things move as one ordered rig, on irregular offsets.",
    ...(score.stillness === true || score.motion_style === "stillness" ? ["- The plan declares a stillness style: long composed holds are the style; the shape of each move is still checked."] : []),
    "",
    "## Finish and hero effects",
    "",
    `- The finish layer is ${String((score.finish && score.finish.route) || score.finish_route || "") === "graphic" ? "off: the brand film measured no finish (Route: graphic), so the film wins on giant type and photography" : "on: a tinted living ground, soft shadows, a key light, glass on the hero, grain and vignette (RasanCamera), motion blur on fast moves"}. The brand locks palette, type, logo, UI and tone, never craft.`,
    ...(Array.isArray(score.budget) && score.budget.length ? ["- Budgeted hero effects (only these, only there; never the same effect on every element):", ...score.budget.map((e) => `  - ${e.effect} in beat ${e.scene ?? "?"} on \`${e.target || e.hero || "?"}\`: ${e.reason || ""}`)] : ["- No hero effects are budgeted: no glow, blur-in, scale-pop, big overshoot, particles or light comet (a settle on the hero landing is part of the motion contract, not an effect)."]),
    "",
    "## Check before you hand back",
    "",
    gateCmd ? `- \`${gateCmd}\` (the code half: carriers, the one brand reveal, text fit)` : "- `motion-gate.mjs --project <dir> --plan <run>/motion/score.json`",
    "- `obey.mjs --project <dir>` (the curve mix, durations, staggers, cascades, settles); the Director then renders the draft and runs the motion gate on its frames (freezes, seams, fluency).",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------- storyboard (the score → the workflow's visual design)
const MARK = "<!-- rasanai:score -->", END = "<!-- /rasanai:score -->";
const VD = "<!-- rasanai:video-direction -->", VDEND = "<!-- /rasanai:video-direction -->";
function scoreIntoStoryboard(sbText, score) {
  const fmt = (h) => (h ? `${h.element ? h.element + " · " : ""}x ${h.x} · y ${h.y} · scale ${h.scale} · opacity ${h.opacity} · direction ${h.direction} · speed ${h.speed} px/s` : null);
  const vd = score.video_direction || {};
  const vdBlock = `${VD}\n## Video direction\n\n- palette system: ${vd.palette || ""}\n- motion grammar + reveal model: ${vd.motion_grammar || ""}\n- rhythm / held-frame allocation: ${score.rhythm ? score.rhythm + "; " : ""}${vd.holds || ""}\n- spine: ${score.spine || ""}${score.depth && (score.depth.plan || score.depth.none_because) ? `\n- depth (2D / 3D): ${score.depth.plan || `flat: ${score.depth.none_because}`}` : ""}${score.motif ? `\n- motif: ${score.motif.what} (frames ${(score.motif.scenes || []).join(", ")})` : ""}${score.signature ? `\n- signature: ${score.signature.technique} at ${score.signature.seam} (${score.signature.why || ""})` : ""}${(score.showreel || []).length ? `\n- showreel moments (land these; they are why the film exists): ${score.showreel.map((m) => `frame ${m.scene}${m.t != null ? ` at ${m.t}s` : ""}: ${m.what}`).join("; ")}` : ""}\n- negative list: ${(vd.negative || []).join("; ")}; no slideshow (front-load then freeze), no screensaver (everything floating)\n\nScored by RasanAI's Motion Director (motion/score.json): the shot sequences, handoffs and transitions below are the approved visual design. Do not rewrite them.\n${VDEND}\n`;
  let t = sbText.replace(new RegExp(`${VD}[\\s\\S]*?${VDEND}\\n*`, "g"), "").replace(new RegExp(`\\n?${MARK}[\\s\\S]*?${END}\\n?`, "g"), "\n");
  // the video direction goes right before the first frame
  const first = t.search(/^## Frame 1 — /m);
  if (first < 0) throw new Error("no '## Frame 1 — ' heading in STORYBOARD.md");
  t = t.slice(0, first) + vdBlock + "\n" + t.slice(first);
  const seams = score.seams || [];
  for (const s of score.scenes || []) {
    const n = Number(s.n);
    const re = new RegExp(`(^## Frame ${n} — [^\\n]*\\n)([\\s\\S]*?)(?=^## Frame ${n + 1} — |(?![\\s\\S]))`, "m");
    const m = t.match(re);
    if (!m) throw new Error(`no '## Frame ${n} — ' block in STORYBOARD.md`);
    let body = m[2];
    const sin = seams.find((x) => Number(x.to) === n);
    const sout = seams.find((x) => Number(x.from) === n);
    // transition_in on the incoming frame: the assembler builds only registry seams; cuts and continuity live in the frames
    if (n > 1) {
      const tin = sin && sin.registry ? String(sin.registry) : "cut";
      body = /^- transition_in: .*$/m.test(body) ? body.replace(/^- transition_in: .*$/m, `- transition_in: ${tin}`) : body.replace(/^(- duration: .*)$/m, `$1\n- transition_in: ${tin}`);
    }
    const sfx = (s.events || []).filter((e) => e.sound).map((e) => e.sound);
    const lines = [
      MARK,
      `- blueprint: ${s.blueprint || "compose"}`,
      s.focal ? `- focal: ${s.focal}` : null,
      s.roles ? `- roles: ${s.roles}` : null,
      sfx.length ? `- sfx: ${[...new Set(sfx)].join(", ")}` : null,
      sin && (sin.element || CONTINUITY.has(sin.kind)) ? `- handoff_in: ${fmt({ element: sin.element, ...(sin.in || {}) })} (${sin.kind} from frame ${n - 1})` : null,
      sout && (sout.element || CONTINUITY.has(sout.kind)) ? `- handoff_out: ${fmt({ element: sout.element, ...(sout.out || {}) })} (${sout.kind} into frame ${n + 1})` : null,
      `- camera: ${s.camera}`,
      `- space: ${s.space || "2d"}${is3d(s) ? " (build with Rasan3D: references/3d.md)" : ""}`,
      is3d(s) && s.camera3d ? `- camera3d: ${s.camera3d.lens_mm} mm${s.camera3d.fstop ? ` f/${s.camera3d.fstop}` : ""}; ${(s.camera3d.moves || []).map((l) => `${Number(l.t0).toFixed(1)}–${Number(l.t1).toFixed(1)}s ${l.move}${l.ease ? ` (${l.ease})` : ""}`).join("; ")}` : null,
      is3d(s) && s.light ? `- light: ${s.light}` : null,
      is3d(s) && s.materials ? `- materials: ${s.materials}` : null,
      `- energy: ${s.energy}/5`,
      s.line != null && s.line !== "" ? `- line: ${s.line}` : null,
      s.picture ? `- picture: ${s.picture}` : null,
      s.moment || s.take ? `- take${s.moment ? ` (moment ${s.moment})` : ""}: ${s.take || ""}` : null,
      ...(s.ui || []).map((u) => `- ui: ${u}`),
      s.exit ? `- exit: ${s.exit}${s.carrier ? ` (carrier: ${s.carrier})` : ""}` : null,
      "",
      ...(s.shots || []).map((sh, j) => `Scene ${j + 1} (${Number(sh.t0).toFixed(1)}–${Number(sh.t1).toFixed(1)}s): ${sh.on_screen}. ${sh.moves}${sh.primary ? ` (primary: ${sh.primary})` : ""}${j === 0 ? ` — ${s.layout}` : ""}`),
      s.techniques && s.techniques.length ? `\nTechniques: ${s.techniques.join(", ")}` : null,
      sin ? `Seam in (${n - 1}>${n}): ${sin.kind}${sin.why ? `: ${sin.why}` : ""}` : null,
      sout ? `Seam out (${n}>${n + 1}): ${sout.kind}${sout.why ? `: ${sout.why}` : ""}` : null,
      s.notes ? `Note: ${s.notes}` : null,
      END,
    ].filter((x) => x != null);
    body = body.replace(/\s*$/, "") + "\n\n" + lines.join("\n") + "\n\n";
    t = t.replace(re, `$1${body}`);
  }
  return t;
}

// ---------------------------------------------------------------- strip (see the motion)
function times() {
  if (args.at && args.at !== true) return String(args.at).split(",").map(Number).filter((x) => x >= 0);
  const a = Number(args.from || 0), b = Number(args.to), fps = Number(args.fps || 10);
  if (!(b > a)) die("--at t1,t2,… or --from a --to b [--fps n]");
  const n = Math.min(60, Math.floor((b - a) * fps) + 1);
  return Array.from({ length: n }, (_, i) => Math.round((a + i / fps) * 1000) / 1000).filter((t) => t <= b + 1e-6);
}
function projectRootOf(file) {
  let d = path.dirname(path.resolve(file));
  for (let i = 0; i < 6; i++) {
    if (exists(path.join(d, "hyperframes.json")) || exists(path.join(d, "index.html")) && exists(path.join(d, "compositions"))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return path.dirname(path.resolve(file));
}
function renderCompositionAt(file, T, dir) {
  let html = fs.readFileSync(file, "utf8").replace(/<template[^>]*>/gi, "").replace(/<\/template>/gi, "");
  html = html.replace(/<script[^>]+src=["'][^"']*gsap(?:\.min)?\.js["'][^>]*><\/script>/gi, `<script src="file://${GSAP_PATH}"></script>`);
  const W = Number((html.match(/data-width="(\d+)"/) || [])[1] || 1920), H = Number((html.match(/data-height="(\d+)"/) || [])[1] || 1080);
  const root = projectRootOf(file);
  const gsapTag = /gsap(\.min)?\.js/.test(html) ? "" : `<script src="file://${GSAP_PATH}"></script>`;
  const head = `<base href="file://${root}/">${gsapTag}<script>window.__timelines=window.__timelines||{};</script><style>html,body{margin:0;padding:0;background:#000;overflow:hidden;width:${W}px;height:${H}px}</style>`;
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + head) : head + html;
  const files = [];
  for (const t of T) {
    const seek = `<script>(function(){var T=${t};function go(){var L=window.__timelines||{};if(window.__specimen&&window.__specimen.tl){try{window.__specimen.tl.pause();window.__specimen.tl.seek(T,false);}catch(e){}}Object.keys(L).forEach(function(k){try{L[k].pause();L[k].seek(T,false);}catch(e){}});document.querySelectorAll('[data-start][data-duration]').forEach(function(el){if(el.hasAttribute('data-composition-id'))return;var s=parseFloat(el.getAttribute('data-start')),d=parseFloat(el.getAttribute('data-duration'));if(isFinite(s)&&isFinite(d))el.style.visibility=(T>=s&&T<s+d)?'':'hidden';});}window.addEventListener('load',function(){(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(function(){go();setTimeout(go,30);});});})();</script>`;
    const page = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, seek + "</body>") : html + seek;
    // the temp page sits in the project root so project-relative asset paths resolve
    const tmp = path.join(root, `.rasanai-strip-${process.pid}-${files.length}.html`);
    fs.writeFileSync(tmp, page);
    const png = path.join(dir, `t${t.toFixed(3)}.png`);
    try {
      chromeScreenshot(`file://${tmp}`, png, W, H, 4000);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
    if (!exists(png)) die(`could not render ${path.basename(file)} at ${t}s (a script error before the timeline registered?)`);
    files.push({ t, png });
  }
  return { files, W, H };
}
function videoAt(file, T, dir) {
  const files = [];
  for (const t of T) {
    const png = path.join(dir, `t${t.toFixed(3)}.png`);
    const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(t), "-i", file, "-frames:v", "1", png], { encoding: "utf8" });
    if (r.status !== 0 || !exists(png)) die(`ffmpeg could not read ${path.basename(file)} at ${t}s: ${(r.stderr || "").trim().split("\n").pop()}`);
    files.push({ t, png });
  }
  let W = 1920, H = 1080;
  try {
    const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", file], { encoding: "utf8" }));
    W = j.streams[0].width; H = j.streams[0].height;
  } catch {}
  return { files, W, H };
}
function projectAt(dir0, T, dir) {
  const r = spawnSync("npx", ["--yes", "hyperframes", "snapshot", dir0, "--at", T.join(","), "--no-end", "-o", dir, "--describe", "false"], { encoding: "utf8", timeout: 600000 });
  if (r.status !== 0) die(`hyperframes snapshot failed: ${(r.stderr || r.stdout || "").trim().split("\n").slice(-3).join(" ")}`);
  const pngs = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f) && !/contact/.test(f)).sort();
  const files = pngs.map((f, i) => ({ t: T[i] != null ? T[i] : i, png: path.join(dir, f) }));
  const hf = jsonMaybe(path.join(dir0, "hyperframes.json")) || {};
  return { files, W: hf.width || 1920, H: hf.height || 1080 };
}
function sheet(files, W, H, outPng, cols, tw = 420) {
  const th = Math.round((tw * H) / W);
  const c = Math.min(cols, files.length);
  const rows = Math.ceil(files.length / c);
  const html = `<!doctype html><html><head><style>html,body{margin:0;background:#141414;font:500 14px/1 -apple-system,Helvetica,Arial,sans-serif;color:#ddd}.g{display:grid;grid-template-columns:repeat(${c},${tw}px);gap:8px;padding:8px}figure{margin:0}img{width:${tw}px;height:${th}px;object-fit:contain;background:#000;display:block}figcaption{padding:5px 2px 0}</style></head><body><div class="g">${files.map((f) => `<figure><img src="file://${f.png}"><figcaption>${esc(`${f.label || ""}t = ${Number(f.t).toFixed(2)} s`)}</figcaption></figure>`).join("")}</div></body></html>`;
  const tmp = path.join(os.tmpdir(), `rasanai-sheet-${process.pid}.html`);
  fs.writeFileSync(tmp, html);
  try {
    chromeScreenshot(`file://${tmp}`, outPng, c * tw + (c + 1) * 8, rows * (th + 27) + (rows + 1) * 8, 3000);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// ---------------------------------------------------------------- commands
if (cmd === "plan") {
  const run = runDir();
  if (!args.route || args.route === true) die("--route required");
  const p = {
    route: String(args.route), subject: str(args.subject), mode: str(args.mode) || (args.route === "faceless-explainer" ? "topic" : "product"),
    url: str(args.url) || null, public: !!args.public, local: str(args.local).split(",").map((s) => s.trim()).filter(Boolean).map((s) => path.resolve(s.replace(/^~(?=\/|$)/, os.homedir()))),
    may_run: !!args["may-run"], scenes: Number(args.scenes) || null, length: Number(args.length) || null, project: args.project && args.project !== true ? rel(String(args.project)) : null, lean: !!args.lean,
    focus: str(args.focus) || null, features: str(args.features) || null,
    brand: str(args.brand) || null, kind: str(args.kind) || null, pace: str(args.pace) || null,
    model: args.model && args.model !== true ? String(args.model) : null,
  };
  for (const d of p.local) if (!exists(d)) die(`approved folder not found: ${d}`);
  const prev = jsonMaybe(R(run, "crew", "plan.json")) || {};
  // re-planning later (scene count known, the project made) keeps what was planned before
  for (const k of ["subject", "url", "project", "focus", "features", "model", "brand", "kind", "pace"]) if (!p[k] && prev[k]) p[k] = prev[k];
  if (!p.model) p.model = detectModel().model;
  if (!p.local.length && prev.local && prev.local.length) { p.local = prev.local; p.may_run = prev.may_run; }
  if (!args.public && prev.public) p.public = true;
  // source mode (research.mjs sources): what the film is made FROM chooses the researchers and the gates; a re-plan keeps the previous plan's
  {
    const sf = args.sources && args.sources !== true ? path.resolve(String(args.sources)) : null;
    const src = sf ? readSources(sf) : prev.sources || null;
    if (sf && !src) die(`--sources is not readable JSON: ${sf}`);
    if (src) { p.sources = src; p.sources_file = sf ? rel(sf) : prev.sources_file || null; if (src.public) p.public = true; }
    const ing = jsonMaybe(R(run, "footage", "ingest.json"));
    if (ing && Array.isArray(ing.bins)) p.bins = ing.bins.map((b) => b.id);
  }
  // a branded launch / promo / brand film gets the brand-film phase (the brand's own films are researched and measured) and the style-match gates
  p.brand_film = args["no-brand-film"] ? false : !!args["brand-film"] || !!prev.brand_film || (["product-launch-video", "general-video"].includes(p.route) && !!(p.brand || p.public || brandLocked(run)) && (p.route === "product-launch-video" || /launch|promo|brand|reveal/i.test(String(p.kind || brief(run).kind || ""))));
  // the user's own brand kit (assets) replaces the brand-film web search: the kit builder reads the kit and any earlier films on disk (references/sources.md)
  if (p.sources && (p.sources.sources || []).some((x) => x.kind === "assets") && !args["brand-film"]) p.brand_film = false;
  p.direct = directFilm(p, prev, run);
  p.branded = !!(p.brand || brandLocked(run));
  p.phases = planCrew(p);
  writeFile(R(run, "crew", "plan.json"), JSON.stringify(p, null, 2));
  const count = p.phases.reduce((a, ph) => a + ph.dispatch.length, 0);
  const prof = modelOf(p);
  out({ ok: true, plan: rel(R(run, "crew", "plan.json")), model: p.model, harness: prof.harness, dispatches: count, phases: p.phases.map((ph) => ({ phase: ph.phase, when: ph.when, members: ph.dispatch.map((x) => `${x.role}${x.key ? ":" + x.key : ""} (${x.tier})`), then: ph.then })), next: "For each member: crew.mjs brief, then dispatch it in the background with the prompt file; accept it with crew.mjs check." });
} else if (cmd === "brief") {
  const run = runDir();
  const role = str(args.role);
  if (!ROLES[role]) die(`--role must be one of ${Object.keys(ROLES).join(", ")}`);
  const key = args.key && args.key !== true ? String(args.key) : null;
  const plan = jsonMaybe(R(run, "crew", "plan.json")) || {};
  if (role === "concept-critic") { const why = editorGate(run, plan); if (why) die(why); }
  const { text, ctx, inputs, outputs } = promptFor(run, role, key, plan);
  const f = R(run, "crew", "prompts", `${role}${key ? "-" + key : ""}.md`);
  writeFile(f, text);
  fs.mkdirSync(path.resolve(WS, ctx.scratch), { recursive: true });
  ledger(run, { event: "brief", role, key });
  const prof = modelOf(plan), T = tierFor(role, prof);
  out({
    ok: true, role, key, prompt: rel(f), bytes: Buffer.byteLength(text),
    description: ROLES[role].desc(plan, key), model: T.fast && T.model ? `a faster model is fine (${T.model})` : "the session's model (don't downgrade)", profile: prof.key, tier_ok: T.ok,
    ...(T.ok ? {} : { warning: T.note }),
    missing_inputs: inputs.filter((i) => i.path && !i.exists).map((i) => i.label), outputs,
    dispatch: dispatchFor(prof, { desc: ROLES[role].desc(plan, key), file: rel(f), role }),
  });
} else if (cmd === "model") {
  const d = detectModel(), prof = modelOf(null);
  if (args.kv) { console.log(`MODEL=${prof.id}\nHARNESS=${prof.harness}`); process.exit(0); }
  out({ ok: true, model: prof.id, harness: prof.harness, source: args.model && args.model !== true ? "--model" : d.source, profile: prof.key, family: prof.family, tier: prof.tier, strengths: prof.strengths, pitfalls: prof.pitfalls });
} else if (cmd === "check") {
  const run = runDir();
  const role = str(args.role);
  if (!ROLES[role]) die(`--role must be one of ${Object.keys(ROLES).join(", ")}`);
  const key = args.key && args.key !== true ? String(args.key) : null;
  const { P, W } = await checkRole(run, role, key);
  ledger(run, { event: P.length ? "fail" : "ok", role, key, problems: P.length ? P.slice(0, 20) : undefined, ...(CHECK_EXTRA && CHECK_EXTRA.result ? { result: CHECK_EXTRA.result } : {}) });
  out({ ok: !P.length, role, key, problems: P, warnings: W, ...(CHECK_EXTRA || {}) }, P.length ? 2 : 0);
} else if (cmd === "status") {
  const run = runDir();
  const plan = jsonMaybe(R(run, "crew", "plan.json"));
  const L = readLedger(run);
  const last = new Map();
  for (const r of L) last.set(`${r.role}|${r.key || ""}`, r);
  const state = (r) => (!r ? "planned" : r.event === "brief" ? "dispatched" : r.event === "ok" ? "accepted" : "needs work");
  const phases = plan ? plan.phases.map((ph) => ({ phase: ph.phase, members: ph.dispatch.map((x) => { const r = last.get(`${x.role}|${x.key || ""}`); return { role: x.role, key: x.key, state: state(r), problems: r && r.problems }; }) })) : [];
  const extra = [...last.values()].filter((r) => !plan || !plan.phases.some((ph) => ph.dispatch.some((x) => x.role === r.role && String(x.key || "") === String(r.key || "")))).map((r) => ({ role: r.role, key: r.key, state: state(r) }));
  const next = phases.find((ph) => ph.members.some((m) => m.state !== "accepted"));
  out({ ok: true, plan: !!plan, phases, unplanned: extra.length ? extra : undefined, next: next ? next.phase : null });
} else if (cmd === "pitches") {
  const run = runDir();
  const dir = R(run, "story");
  const order = ["sure", "bold", "wild"];
  const files = exists(dir) ? fs.readdirSync(dir).filter((f) => /^pitch-.+\.json$/.test(f)) : [];
  if (!files.length) die("no story/pitch-*.json yet");
  const pitches = files.map((f) => ({ f, p: jsonMaybe(path.join(dir, f)) })).filter((x) => x.p && typeof x.p === "object");
  pitches.sort((a, b) => order.indexOf(a.f.slice(6, -5).toLowerCase()) - order.indexOf(b.f.slice(6, -5).toLowerCase()));
  const merged = pitches.map(({ f, p }) => ({ ...p, label: p.label || f.slice(6, -5) }));
  writeFile(path.join(dir, "pitches.json"), JSON.stringify({ pitches: merged }, null, 2));
  out({ ok: true, pitches: rel(path.join(dir, "pitches.json")), labels: merged.map((p) => p.label), skipped: files.length - merged.length || undefined });
} else if (cmd === "storyboard") {
  const run = runDir();
  const pj = projectDir(run);
  if (!pj) die("--project <videos/name> required");
  const sbf = path.join(pj, "STORYBOARD.md");
  if (!exists(sbf)) die(`no STORYBOARD.md in ${rel(pj)} (run video.mjs write first)`);
  const scoreFile = args.score && args.score !== true ? path.resolve(String(args.score)) : R(run, "motion", "score.json");
  const score = jsonMaybe(scoreFile);
  if (!score) die(`score not found or invalid: ${rel(scoreFile)}`);
  const { P } = checkScore(run);
  if (P.length) out({ ok: false, problems: P, hint: "the score must pass crew.mjs check --role motion-director first" }, 2);
  let text;
  try {
    text = scoreIntoStoryboard(fs.readFileSync(sbf, "utf8"), score);
  } catch (e) {
    die(e.message);
  }
  // the workflow's own parser must still read every frame
  const route = (jsonMaybe(R(run, "video-decisions.json")) || {}).route || "product-launch-video";
  const reg = [route, "product-launch-video", "faceless-explainer", "pr-to-video"].map(findSkill).find((d) => d && exists(path.join(d, "scripts", "lib", "storyboard.mjs")));
  let parsed = null;
  if (reg) {
    const { parseStoryboard } = await import(path.join(reg, "scripts", "lib", "storyboard.mjs"));
    parsed = parseStoryboard(text);
    const want = (score.scenes || []).length;
    if ((parsed.frames || []).length !== want) die(`after writing the score the workflow parser reads ${(parsed.frames || []).length} frames, expected ${want}`);
  }
  fs.writeFileSync(sbf, text);
  const scoreMd = renderScoreMd(score);
  writeFile(R(run, "motion", "score.md"), scoreMd);
  writeFile(path.join(pj, "MOTION-SCORE.md"), scoreMd);
  const planInfo = jsonMaybe(R(run, "crew", "plan.json")) || {};
  const direct = !!planInfo.direct;
  writeFile(path.join(pj, "BUILD.md"), renderBuildMd(score, { direct, gateCmd: `node "${path.join(SKILL_DIR, "scripts", "motion-gate.mjs")}" --project ${rel(pj)} --plan ${rel(scoreFile)}`, carriersCmd: `node "${path.join(SKILL_DIR, "scripts", "video.mjs")}" carriers --project-dir ${rel(pj)}` }));
  // the other project files point at the plan instead of restating it: DIRECTION.md and STORYBOARD.md lose any say over
  // timing, holds and seams; a direct film's DISPATCH.md drops the craft rules it duplicated (the look's contract stays in frame.md)
  const pm = "<!-- rasanai:plan-wins -->";
  const pointer = `${pm}\n> **The plan wins.** \`motion/score.json\` (MOTION-SCORE.md in words) and BUILD.md are the film's one contract. Where this file says otherwise about timing, holds, motion or seams, follow the plan.\n`;
  for (const f of [path.join(pj, "DIRECTION.md")]) if (exists(f)) fs.writeFileSync(f, upsertMarked(fs.readFileSync(f, "utf8"), pm, pointer));
  const dispF0 = path.join(pj, "DISPATCH.md");
  if (direct && exists(dispF0)) {
    const old = fs.readFileSync(dispF0, "utf8");
    const keep = (old.match(/<!-- rasanai:logos -->[\s\S]*?(?=\n<!-- |$)/) || [""])[0];
    fs.writeFileSync(dispF0, `# RasanAI dispatch (a direct film: one builder)\n\n${pointer.replace(pm + "\n", "")}\nRead, in order: BUILD.md (short), \`$RUN/motion/score.json\` (the plan), your frame packets and \`_role.md\` (structure and seek-safety), frame.md (the look and the motion contract). Nothing else is required.\n\n## Check\n\n- \`node "${path.join(SKILL_DIR, "scripts", "motion-gate.mjs")}" --project "${pj}" --plan "${scoreFile}"\`\n- \`node "${path.join(SKILL_DIR, "scripts", "obey.mjs")}" --project "${pj}"\` and \`node "${path.join(SKILL_DIR, "scripts", "slop.mjs")}" --project "${pj}"\`\n${keep ? "\n" + keep : ""}`);
  }
  // tell the workflow its visual-design step is done, and every frame worker where the whole score lives
  const bm = "<!-- rasanai:score-note -->";
  const briefF = path.join(pj, "BRIEF.md");
  if (exists(briefF)) fs.writeFileSync(briefF, upsertMarked(fs.readFileSync(briefF, "utf8"), bm, `${bm}\n## Visual design (done)\n\n- **The visual-design step is done.** RasanAI's Motion Director scored the whole film: STORYBOARD.md carries every frame's time-coded shot sequence, blueprint, focal, roles, sfx, handoffs and \`transition_in\`, under one \`## Video direction\`. Do not rewrite them; run \`stage-assets.mjs\` and continue with the frames. MOTION-SCORE.md is the score in words.\n`));
  const dispF = path.join(pj, "DISPATCH.md");
  if (exists(dispF)) fs.writeFileSync(dispF, upsertMarked(fs.readFileSync(dispF, "utf8"), bm, `${bm}\n## The motion score\n\nYour frame block in the packet holds your part of the Motion Director's score (shots, primary movers, camera, handoffs); MOTION-SCORE.md is the whole film. Seams are contracts: start and end continuing elements at the exact handoff numbers.\n`));
  const logos = stageLogos(run, pj);
  out({ ok: true, storyboard: rel(sbf), frames: (score.scenes || []).length, parsed: !!parsed, logos: logos || undefined, score_md: rel(path.join(pj, "MOTION-SCORE.md")), build_md: rel(path.join(pj, "BUILD.md")), dispatch: direct ? "reduced to a pointer to the plan (direct film)" : "kept", next: "The workflow's visual-design step is done: stage assets, then frame-packets.mjs, video.mjs inject, and " + (direct ? "dispatch the ONE film builder (crew.mjs brief --role film-builder --key film)." : "dispatch the lead builder, then the scene animators (crew.mjs brief --role scene-animator --key <n>).") });
} else if (cmd === "ab") {
  const run = runDir();
  const need = (k) => (args[k] && args[k] !== true ? path.resolve(String(args[k])) : die(`--${k} <video> required (--a the previous version's render, --b the new one)`));
  const fa = need("a"), fb = need("b");
  for (const f of [fa, fb]) if (!exists(f)) die(`not found: ${f}`);
  const n = Number(args.n) || abLatest(run) + 1;
  const seed = args.seed && args.seed !== true ? String(args.seed) : crypto.randomBytes(6).toString("hex");
  // seeded shuffle: the first bit of sha1(seed) decides which render is called X
  const flip = (crypto.createHash("sha1").update(seed).digest()[0] & 1) === 1;
  const order = flip ? { X: "new", Y: "prev" } : { X: "prev", Y: "new" };
  const file = { prev: fa, new: fb };
  const dur = (f) => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", f], { encoding: "utf8" }).stdout.trim()) || die(`ffprobe could not read the length of ${path.basename(f)}`);
  const D = { X: dur(file[order.X]), Y: dur(file[order.Y]) };
  const common = Math.min(D.X, D.Y);
  const plan = args.plan && args.plan !== true ? path.resolve(String(args.plan)) : null;
  const sc = plan ? jsonMaybe(plan) : null;
  const beats = sc && Array.isArray(sc.scenes || sc.beats) ? (sc.scenes || sc.beats) : [];
  // the same seconds in both: each beat's peak (60% in) when a plan is given, else even spacing; then each film's own last 2.5 s, 1.2 s and 0.15 s
  let T = [];
  { let t = 0;
    for (const b of beats) { const st = Number.isFinite(Number(b.start)) && b.start != null && b.start !== "" ? Number(b.start) : t; const en = Number.isFinite(Number(b.end)) && b.end != null ? Number(b.end) : st + (Number(b.duration) || Number(b.duration_s) || 0); t = en; if (en > st) T.push(Math.round((st + 0.6 * (en - st)) * 100) / 100); } }
  if (T.length < 4) T = Array.from({ length: 12 }, (_, i) => Math.round((0.4 + (i * (common - 0.8)) / 11) * 100) / 100);
  if (T.length > 14) T = Array.from({ length: 14 }, (_, i) => T[Math.round((i * (T.length - 1)) / 13)]);
  T = [...new Set(T)].filter((t) => t > 0 && t < common - 0.3);
  const END = [2.5, 1.2, 0.15];
  const base = R(run, "crew", `ab-${n}`), sdir = path.join(base, "strips");
  fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync(sdir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rasanai-ab-"));
  try {
    const pair = {};
    for (const x of ["X", "Y"]) {
      const times = [...T, ...END.map((e) => Math.round(Math.max(0, D[x] - e) * 100) / 100)];
      const dir = path.join(tmp, x); fs.mkdirSync(dir);
      pair[x] = videoAt(file[order[x]], times, dir);
    }
    const rowsPng = [];
    const per = 6, nrows = T.length + END.length;
    for (let r0 = 0, page = 1; r0 < nrows; r0 += per, page++) {
      const files = [];
      for (let r = r0; r < Math.min(nrows, r0 + per); r++) for (const x of ["X", "Y"]) files.push({ ...pair[x].files[r], label: `${x} · ${r >= T.length ? "end " : ""}` });
      const png = path.join(sdir, page === 1 ? "rows.png" : `rows-${page}.png`);
      sheet(files, pair.X.W, pair.X.H, png, 2, 560);
      rowsPng.push(png);
    }
    const phone = {};
    for (const x of ["X", "Y"]) {
      const step = Math.max(1, Math.ceil(D[x] / 36));
      const times = []; for (let t = 0; t < D[x] - 0.05; t += step) times.push(t);
      const dir = path.join(tmp, `phone-${x}`); fs.mkdirSync(dir);
      const res = videoAt(file[order[x]], times, dir);
      phone[x] = path.join(sdir, `phone-${x}.png`);
      sheet(res.files.map((fl) => ({ ...fl, label: `${x} · ` })), res.W, res.H, phone[x], 3, 360);
    }
    for (const p of [...rowsPng, phone.X, phone.Y]) if (!exists(p)) die("a strip did not render: " + p);
    const rec = { n, seed, order, files: { X: rel(file[order.X]), Y: rel(file[order.Y]) }, a: rel(fa), b: rel(fb), plan: plan ? rel(plan) : null, times: T, strips: { rows: rowsPng.map(rel), phone_X: rel(phone.X), phone_Y: rel(phone.Y) }, created: new Date().toISOString(), verdict: null, note: "order: which of X / Y is the new version (b). Never show this file to the juror." };
    writeFile(path.join(R(run, "crew"), `ab-${n}.json`), JSON.stringify(rec, null, 2));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  const plan0 = jsonMaybe(R(run, "crew", "plan.json")) || {};
  const { text, ctx, outputs } = promptFor(run, "ab-juror", String(n), plan0);
  const pf = R(run, "crew", "prompts", `ab-juror-${n}.md`);
  writeFile(pf, text);
  fs.mkdirSync(path.resolve(WS, ctx.scratch), { recursive: true });
  ledger(run, { event: "brief", role: "ab-juror", key: String(n) });
  const prof = modelOf(plan0);
  out({ ok: true, n, record: rel(path.join(R(run, "crew"), `ab-${n}.json`)), prompt: rel(pf), strips: rel(sdir), outputs,
    note: "The order (which of X / Y is the new version) is in the record, not in the brief. Dispatch the juror with the prompt; do not tell it anything about the two films.",
    dispatch: dispatchFor(prof, { desc: ROLES["ab-juror"].desc(plan0, String(n)), file: rel(pf), role: "ab-juror" }),
    then: `node crew.mjs check --run ${rel(run)} --role ab-juror --key ${n}   (prints keep or revert)` });
} else if (cmd === "strip") {
  const outPng = args.out && args.out !== true ? path.resolve(String(args.out)) : die("--out <sheet.png> required");
  const T = times();
  if (!T.length) die("no times to render");
  const dir = outPng.replace(/\.png$/i, "");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let res;
  if (args.project && args.project !== true) res = projectAt(path.resolve(String(args.project)), T, dir);
  else if (args.file && args.file !== true) {
    const f = path.resolve(String(args.file));
    if (!exists(f)) die(`not found: ${f}`);
    if (/\.(mp4|mov|webm|m4v|mkv)$/i.test(f)) res = videoAt(f, T, dir);
    else if (/Rasan3D\.stage\s*\(|assets\/three\/rasan3d\.js/.test(fs.readFileSync(f, "utf8"))) {
      // a 3D scene builds asynchronously: render it in one browser that waits for the build, with its real motion blur
      const { stills } = await import("./lib/stage3d.mjs");
      const r = await stills(f, T, dir, str(args.quality) || "final");
      const bad = (r.ready.stages || []).filter((x) => x.error);
      if (bad.length) die(`the 3D scene failed to build: ${bad.map((x) => `${x.id}: ${x.error}`).join("; ")}`);
      res = { files: r.files, W: r.W, H: r.H };
    } else res = renderCompositionAt(f, T, dir);
  } else die("--file <composition.html | video> or --project <dir>");
  // --phone: every frame at 360 px wide, the size the film plays at on a phone held upright (animate's phone check)
  sheet(res.files, res.W, res.H, outPng, Number(args.cols) || (args.phone ? 3 : 6), args.phone ? 360 : 420); // 3 across keeps the sheet small enough to be read unscaled
  if (!exists(outPng)) die("the sheet did not render");
  out({ ok: true, sheet: rel(outPng), frames: res.files.length, dir: rel(dir), times: T, look: args.phone ? "Read the sheet at 100%: this is the film at phone size. Every line meant to be read must read here; one that doesn't is a readability finding" : "Read the sheet image: spacing between frames shows the ease (wide gaps = fast, tight = slowing into a landing)" });
} else if (cmd === "thumbs") {
  const run = runDir();
  const fi = R(run, "story", "intent.json");
  // the chosen script's sheet becomes story/intent.json (the Director just wrote story/chosen.json; its label names the writer's file)
  if (!exists(fi)) { const lab = (jsonMaybe(R(run, "story", "chosen.json")) || {}).label, src = lab && R(run, "story", `intent-${lab}.json`); if (src && exists(src)) fs.copyFileSync(src, fi); }
  let it; try { it = loadIntent(fi); } catch (e) { die(e.message); }
  if (!it) die(`${rel(fi)} is missing: the thumbnail board is drawn from the intent sheet (the chosen script's story/intent-<Label>.json, copied to story/intent.json)`);
  const B = brief(run);
  const chosen = jsonMaybe(R(run, "story", "chosen.json")) || {};
  const sbeats = Array.isArray(chosen.beats) ? chosen.beats : [];
  const v = validateIntent(it, { lengthS: Number(B.length_s) || 0, durations: sbeats.length === it.beats.length ? sbeats.map((b) => Number(b.duration_s)) : null });
  const fdir = R(run, "frames"), doc = readShots(path.join(fdir, "shots.json"));
  const boards = doc ? boardFiles(fdir, doc) : [];
  const thumbDir = R(run, "story", "thumbs");
  fs.mkdirSync(thumbDir, { recursive: true });
  const [aw, ah] = (String(B.aspect || "16:9").match(/(\d+)\D+(\d+)/) || [0, 16, 9]).slice(1).map(Number);
  const tw = 360, th = Math.round((tw * ah) / aw), cols = Math.max(1, Math.min(Number(args.cols) || 4, it.beats.length));
  const rows = [];
  const cells = it.beats.map((b, i) => {
    const n = i + 1, sb = sbeats[i] || {};
    // what already exists, cheapest first: a thumbnail dropped by hand, the beat's styleframe board, else a grey box with the thing to read
    const nn = String(n).padStart(2, "0");
    const hand = ["png", "jpg"].map((e) => path.join(thumbDir, `${nn}.${e}`)).find(exists);
    const bd = boards.find((x) => x.has_png && x.beat != null && String(x.beat).toLowerCase() === String(sb.name || sb.id || "").toLowerCase()) || (boards[i] && boards[i].has_png ? boards[i] : null);
    const img = hand || (bd && bd.png) || null;
    const read = typeof b.read === "object" ? b.read.text : b.read;
    const t0 = v.timing ? v.timing.starts_s[i] : 0, secs = v.timing ? v.timing.seconds[i] : 0;
    rows.push({ beat: n, source: hand ? "hand" : bd ? "board" : "grey-box", image: img ? rel(img) : null, relation: b.relation || (i ? null : "open"), importance: b.importance, peak: !!b.peak, rest_after: !!b.rest_after, start_s: t0, seconds: secs, read_s: +readSeconds(b).toFixed(2), buys: b.buys, read: read || null });
    const box = img ? `<img src="file://${img}">` : `<div class="gb"><b>${esc(read || sb.on_screen || sb.name || "")}</b><i>${esc(sb.visual || "")}</i></div>`;
    const imp = Math.max(1, Math.min(3, Number(b.importance) || 1));
    const dots = "\u25CF".repeat(imp) + "\u25CB".repeat(3 - imp);
    return `<figure class="${b.peak ? "peak" : ""}">${box}<figcaption><span class="m">${n} \u00B7 ${esc(b.relation || (i ? "?" : "open"))} \u00B7 ${t0.toFixed(1)}-${(t0 + secs).toFixed(1)}s \u00B7 ${dots}${b.peak ? " \u00B7 PEAK" : ""}${b.rest_after ? " \u00B7 rest after" : ""}</span><span class="b">${esc(b.buys || "(no buys)")}</span></figcaption></figure>`;
  });
  const css = `html,body{margin:0;background:#141414;font:500 13px/1.3 -apple-system,Helvetica,Arial,sans-serif;color:#ddd}h1{font-size:15px;margin:0;padding:10px 8px 0;color:#fff}h2{font-size:12px;margin:0;padding:2px 8px 6px;color:#9a9a9a;font-weight:500}.g{display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:10px;padding:8px}figure{margin:0}img,.gb{width:${tw}px;height:${th}px;object-fit:contain;background:#000;display:block;box-sizing:border-box}.gb{background:#3a3a3a;border:1px solid #555;padding:14px;display:flex;flex-direction:column;justify-content:center;gap:8px}.gb b{font-size:20px;color:#eee;font-weight:600}.gb i{font-size:11px;color:#9a9a9a;font-style:normal}figcaption{padding:5px 2px 0;height:78px;overflow:hidden}.m{display:block;color:#8fb4ff;font-size:11px}.b{display:block;color:#eee;margin-top:2px}.peak img,.peak .gb{outline:3px solid #ffb020}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><h1>${esc(it.proposition || "")}</h1><h2>ending: ${esc((it.ending_first && it.ending_first.line) || "")}</h2><div class="g">${cells.join("")}</div></body></html>`;
  const outPng = args.out && args.out !== true ? path.resolve(String(args.out)) : path.join(thumbDir, "sheet.png");
  const tmp = path.join(os.tmpdir(), `rasanai-thumbs-${process.pid}.html`);
  fs.writeFileSync(tmp, html);
  const nrows = Math.ceil(cells.length / cols);
  try { chromeScreenshot(`file://${tmp}`, outPng, cols * tw + (cols + 1) * 10, 70 + nrows * (th + 78 + 22) + 10, 3000); } finally { fs.rmSync(tmp, { force: true }); }
  if (!exists(outPng)) die("the thumbnail sheet did not render");
  writeFile(path.join(thumbDir, "thumbs.json"), JSON.stringify({ sheet: rel(outPng), proposition: it.proposition, ending_first: it.ending_first, total_s: v.timing && v.timing.total_s, planned_timing: v.timing && v.timing.planned, errors: v.errors, warnings: v.warnings, beats: rows }, null, 2) + "\n");
  out({ ok: v.ok, sheet: rel(outPng), beats: rows.length, sources: rows.reduce((a, r) => ((a[r.source] = (a[r.source] || 0) + 1), a), {}), intent_errors: v.errors, intent_warnings: v.warnings, next: "brief the structure-critic (crew.mjs brief --role structure-critic --key structure-1), then crew.mjs check --role structure-critic --key structure-1" }, v.ok ? 0 : 2);
} else {
  die("usage: crew.mjs plan|brief|check|ab|status|pitches|thumbs|storyboard|strip … (see the header)");
}

// The script editor cannot be skipped on a scripted route: the concept critic is never briefed (or accepted) until the editor
// has passed (S3 niche diagnosis 5d: run6 went straight from the juror to the concept critic with no editor).
function editorGate(run, plan) {
  const planned = (plan && Array.isArray(plan.phases) ? plan.phases : []).some((ph) => (ph.dispatch || []).some((x) => x && x.role === "script-editor"));
  const scripted = !!plan && STORY_ROUTES.has(plan.route) && !["reel", "music-to-video"].includes(plan.route) && !(plan.sources && isFootageLed(plan.sources));
  if (!planned && !scripted) return null;
  const last = readLedger(run).filter((r) => r.role === "script-editor").pop();
  if (last && last.event === "ok") return null;
  return "the script editor has not passed: brief it (crew.mjs brief --role script-editor), let it write story/edit-notes.json, accept it (crew.mjs check --role script-editor), and only then the concept critic. The editor cannot be skipped on a scripted route";
}

// product-first: the recommender ranks scope match first (G13 pass, then the lowest S_max, then the most areas of life), runs the
// recognition panel (6 varied audience members) on every pitch, and has a script that collapses onto another's scenario replaced.
function editorScopeProblems(run, n, P, W) {
  const ps = n.pitches || [];
  const seen = new Map();
  for (const p of ps) {
    const panel = Array.isArray(p.recognition) ? p.recognition.filter((m) => m && String(m.who || "").trim()) : [];
    if (panel.length < 6) P.push(`${p.id || p.label}: recognition panel has ${panel.length} members (6 varied audience members: { who, sees_self, wants_to_be, beat }): the niche-drift judge, agents/script-editor.md`);
    seen.set(p, { sees: panel.filter((m) => m.sees_self === true).length, wants: panel.every((m) => m.wants_to_be !== false) });
  }
  const rp = ps.find((x) => x.id === n.recommended);
  const passing = ps.filter((x) => seen.get(x).sees >= 5 && seen.get(x).wants);
  if (rp && passing.length && !passing.includes(rp)) P.push(`recommended "${n.recommended}" fails the recognition panel (${seen.get(rp).sees}/6 see themselves) while ${passing.map((x) => x.id).join(", ")} pass: recommend a script most of the audience recognises themselves in`);
  const pitches = R(run, "story", "pitches.json"), truth = R(run, "story", "truth.md");
  if (!exists(pitches) || !exists(truth)) return;
  const r = spawnSync(process.execPath, [path.join(SKILL_DIR, "scripts", "story.mjs"), "check", "--pitch", pitches, "--truth", truth], { encoding: "utf8", env: { ...process.env, RASANAI_QUIET: "1" }, maxBuffer: 64 * 1024 * 1024 });
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { return; }
  const res = (j.pitches || [j]).map((x) => ({ id: x.pitch, label: x.label, g: (x.gates || []).find((g) => g.id === "G13") || null })).filter((x) => x.g);
  if (!res.length) return;
  const ok13 = res.filter((x) => x.g.pass);
  const recP = rp || {};
  const rec = res.find((x) => [n.recommended, recP.label, recP.title].includes(x.id) || (recP.label && x.label === recP.label));
  if (rec && !rec.g.pass && ok13.length) P.push(`recommended "${n.recommended}" fails G13 (the story's scope does not match the claim: ${(rec.g.reasons || [])[0] || ""}) while ${ok13.map((x) => x.id).join(", ")} pass: scope match ranks first, ambition never overrides it`);
  else if (rec && ok13.length > 1) {
    const best = ok13.slice().sort((a, b) => a.g.S_max - b.g.S_max || b.g.D - a.g.D)[0];
    if (best !== rec) W.push(`scope ranking: "${best.id}" has the lowest S_max (${best.g.S_max}) and ${best.g.D} areas of life; say in "why" why the recommendation beats it`);
  }
  for (const c of ((j.portfolio || {}).reasons || []).filter((x) => /^collapse:/.test(x))) {
    const later = (c.match(/re-roll "([^"]+)"/) || [])[1];
    const lp = ps.find((p) => [p.id, p.title, p.label].includes(later));
    if (!lp || lp.verdict === "ship") P.push(`${c} (story.mjs check portfolio): the editor marks that script replace or rewrite`);
  }
}
