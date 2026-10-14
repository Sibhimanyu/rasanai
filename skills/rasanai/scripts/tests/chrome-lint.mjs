// The page-chrome lint (lib/chrome-lint.mjs, run by slop.mjs --project) on tiny planted films: every rule has a planted positive and a
// negative (a clean film; the same device inside a UI surface, inside data-ui="captured", inside data-chrome="allow", allowed by a
// brand film's measured.chrome, or in a shape the rule must not take: a headline with no media, an underline that draws in mid-frame,
// a pinned text that moves, a pinned text in only two shots). Skipped with a note when no Chrome is available.
// export default async function ({ ok, node, tmp }).
import fs from "node:fs";
import path from "node:path";
import { chromePath } from "../lib/common.mjs";

export default async function ({ ok, node, tmp }) {
  { const realExit = process.exit; process.exit = () => { throw new Error("no chrome"); };
    try { chromePath(); } catch { console.log("note  chrome-lint: no Chrome, skipped"); return; } finally { process.exit = realExit; } }
  const { chromeLint } = await import("../lib/chrome-lint.mjs");
  const root = path.join(tmp, "chrome-lint");
  // a film of 3 s scenes, one sub-composition per body (white ground, Helvetica); the scene root is a plain white page
  const mk = (name, scenes) => {
    const d = path.join(root, name);
    fs.mkdirSync(path.join(d, "compositions"), { recursive: true });
    scenes.forEach((body, i) => fs.writeFileSync(path.join(d, "compositions", `s${i + 1}.html`), `<template><div data-composition-id="s${i + 1}" data-width="1920" data-height="1080" data-start="0" data-duration="3" style="position:absolute;inset:0;background:#fff;font-family:Helvetica">${body}</div></template>`));
    fs.writeFileSync(path.join(d, "index.html"), `<html><body><div data-composition-id="main" data-width="1920" data-height="1080" data-duration="${3 * scenes.length}" style="position:relative;width:1920px;height:1080px;background:#fff">${scenes.map((_, i) => `<div data-composition-src="compositions/s${i + 1}.html" data-start="${i * 3}" data-duration="3"></div>`).join("")}</div></body></html>`);
    return d;
  };
  const abs = (css, inner = "", extra = "") => `<div ${extra} style="position:absolute;${css}">${inner}</div>`;
  const head = (txt) => abs("left:0;right:0;top:440px;text-align:center;font:700 140px Helvetica;color:#111", txt);
  const typeJs = (id, s) => `<script>var s=${JSON.stringify(s)},el=document.getElementById("${id}"),o={n:0},tl=gsap.timeline({paused:true});tl.to(o,{n:s.length,duration:2.5,ease:"none",onUpdate:function(){el.textContent=s.slice(0,Math.round(o.n))}});window.__timelines=window.__timelines||{};window.__timelines.s1=tl;</script>`;
  const card = (inner, extra = "") => abs("left:300px;top:200px;width:700px;height:400px;background:#fff;border-radius:24px;border:1px solid #ddd", inner, extra);
  const vibeInner = abs("left:40px;top:30px;font:700 40px Helvetica;color:#111", "Good morning, Alex") + abs("left:40px;top:120px;font:28px Helvetica;color:#222", "Revenue · $12,400") + abs("left:40px;top:200px;width:10px;height:10px;border-radius:50%;background:#2c2") + abs("left:62px;top:190px;font:24px Helvetica;color:#222", "All systems");
  const pinTxt = (top) => abs(`left:100px;top:${top}px;font:22px Helvetica;color:#999`, "tally.app");
  const caps = (left, txt) => abs(`left:${left}px;top:900px;font:22px Helvetica;letter-spacing:.2em;text-transform:uppercase`, txt);
  const hair = (css) => abs(`${css};background:#000`, "", 'id="pg"');
  const growJs = '<script>var tl=gsap.timeline({paused:true});tl.to("#pg",{width:1800,duration:3,ease:"none"});window.__timelines=window.__timelines||{};window.__timelines.s1=tl;</script>';

  const run = async (name, scenes, opts) => {
    const r = await chromeLint(mk(name, scenes), opts);
    return { r, rules: new Set(r.findings.map((f) => f.rule)), sev: (rule) => (r.findings.find((f) => f.rule === rule) || {}).severity };
  };
  const clean = (x) => x.r.findings.length === 0 && !x.r.could_not_run.length;
  const note = (x) => JSON.stringify(x.r.findings.map((f) => `${f.severity} ${f.rule}`)) + x.r.could_not_run.join(";");

  // the clean film: centred one-liners, a plain UI card with real-looking labels
  const good = await run("good", [head("Paper forgets."), card(abs("left:40px;top:120px;font:28px Helvetica;color:#222", "Inbox")), head("One tap.")]);
  ok("chrome-lint: a clean film (centred lines, a plain card) has no findings", clean(good), note(good));

  const kick = await run("kicker", [abs("left:140px;top:300px;font:600 22px Helvetica;color:#333", "Introducing the thing") + abs("left:140px;top:340px;font:700 120px Helvetica;color:#111", "Ship faster")]);
  ok("chrome-lint: a small kicker line over a headline is kicker-over-headline (error)", kick.sev("kicker-over-headline") === "error", note(kick));
  const stat = await run("kicker-stat", [abs("left:140px;top:300px;font:600 22px Helvetica;color:#333", "Monthly payment") + abs("left:140px;top:340px;font:700 120px Helvetica;color:#111", "$2,217")]);
  ok("chrome-lint: a label over a big figure is a stat caption, not a kicker", !stat.rules.has("kicker-over-headline"), note(stat));

  const deck = await run("deck", [abs("left:140px;top:300px;font:700 120px Helvetica;color:#111", "Ship faster") + abs("left:1100px;top:250px;width:640px;height:520px;background:#cde url(x.png)")]);
  ok("chrome-lint: a left-aligned headline beside right-side media is deck-layout (error)", deck.sev("deck-layout") === "error", note(deck));
  const deckSub = await run("deck-sub", [abs("left:140px;top:300px;font:700 120px Helvetica;color:#111", "Ship faster") + abs("left:140px;top:450px;font:40px Helvetica;color:#333", "The sub-line under it")]);
  ok("chrome-lint: a left headline with a sub-line and no media is only a warning", deckSub.sev("deck-layout") === "warn", note(deckSub));
  const deckAlone = await run("deck-alone", [abs("left:140px;top:300px;font:700 120px Helvetica;color:#111", "Ship faster")]);
  ok("chrome-lint: a lone left-aligned headline is not flagged", clean(deckAlone), note(deckAlone));

  const typed = await run("typed", [abs("left:300px;top:400px;font:700 100px Helvetica", "", 'id="typed"') + typeJs("typed", "Typed line")]);
  ok("chrome-lint: a headline typed letter by letter is typed-headline (error)", typed.sev("typed-headline") === "error", note(typed));
  const caret = await run("caret", [abs("left:300px;top:400px;font:700 100px Helvetica", "Hello world|")]);
  ok("chrome-lint: a caret beside a headline with no typing is a warning", caret.sev("typed-headline") === "warn", note(caret));
  const typedUi = await run("typed-ui", [card(abs("left:40px;top:150px;font:700 80px Helvetica", "", 'id="typed"'), 'data-ui="field"') + typeJs("typed", "Ask anything")]);
  ok("chrome-lint: typing inside the product's own field (a UI surface) is allowed", !typedUi.rules.has("typed-headline"), note(typedUi));

  const vibe = await run("vibe", [card(vibeInner)]);
  ok("chrome-lint: a greeting, a label · value line and a status dot on one card are vibe-ui-card (error)", vibe.sev("vibe-ui-card") === "error" && vibe.sev("vibe-greeting") === "error", note(vibe));
  const greet = await run("greeting", [head("Good morning, Alex")]);
  ok("chrome-lint: a \"Good morning\" header alone is vibe-greeting (error)", greet.sev("vibe-greeting") === "error", note(greet));
  const lv = await run("label-value", [card(abs("left:40px;top:120px;font:28px Helvetica;color:#222", "Revenue · $12,400"))]);
  ok("chrome-lint: one label · value line is a warning (vibe-ui-tell), not an error", lv.sev("vibe-ui-tell") === "warn" && !lv.rules.has("vibe-ui-card"), note(lv));
  const cap = await run("captured", [card(vibeInner, 'data-ui="captured"')]);
  ok("chrome-lint: the same card marked data-ui=\"captured\" (the product's real screen) is exempt, and says so", clean(cap) && cap.r.exempt.some((e) => /captured/.test(e)), note(cap));

  const cnt = await run("counter", [abs("left:140px;top:60px;font:24px Helvetica;color:#555", "02 / SPEAK") + head("Paper forgets.")]);
  ok("chrome-lint: a chapter counter (\"02 / SPEAK\") is chapter-counter (error)", cnt.sev("chapter-counter") === "error", note(cnt));
  const cnt2 = await run("counter-ui", [card(abs("left:40px;top:150px;font:24px Helvetica;color:#555", "2 / 5"))]);
  ok("chrome-lint: a step count inside a UI card is not page chrome", !cnt2.rules.has("chapter-counter"), note(cnt2));

  const caps2 = await run("caps2", [caps(140, "Motion designer") + caps(1300, "A new model") + head("Paper forgets.")]);
  ok("chrome-lint: two tracked-caps labels are tracked-caps-label (error)", caps2.sev("tracked-caps-label") === "error", note(caps2));
  const caps1 = await run("caps1", [caps(140, "Motion designer") + head("Paper forgets.")]);
  ok("chrome-lint: one tracked-caps label is a warning", caps1.sev("tracked-caps-label") === "warn", note(caps1));
  const capsLogo = await run("caps-logo", [abs("left:140px;top:900px;font:22px Helvetica;letter-spacing:.2em;text-transform:uppercase", "Tally", 'class="wordmark"') + head("Paper forgets.")]);
  ok("chrome-lint: a wordmark set in tracked caps is the logo, not a label", !capsLogo.rules.has("tracked-caps-label"), note(capsLogo));

  const chrome = await run("chrome", [abs("left:0;top:0;width:1920px;height:70px;background:#eee") + abs("left:40px;top:40px;width:60px;height:60px;border-top:3px solid #000;border-left:3px solid #000") + abs("right:40px;bottom:40px;width:60px;height:60px;border-bottom:3px solid #000;border-right:3px solid #000") + head("Paper forgets.")]);
  ok("chrome-lint: a header bar is header-footer-bar and two corner brackets are corner-brackets (errors)", chrome.sev("header-footer-bar") === "error" && chrome.sev("corner-brackets") === "error", note(chrome));
  const row = await run("row", [abs("left:100px;top:40px;font:24px Helvetica;color:#333", "TALLY") + abs("right:100px;top:40px;font:24px Helvetica;color:#333", "Launch film") + head("Paper forgets.")]);
  ok("chrome-lint: a left and a right label on one header line is a header-footer-bar row", row.sev("header-footer-bar") === "error", note(row));
  const corner = await run("corner", [abs("left:60px;top:40px;font:24px Helvetica;color:#333", "tally.app") + head("Paper forgets.")]);
  ok("chrome-lint: small held text in a corner is a corner-micro-label warning", corner.sev("corner-micro-label") === "warn", note(corner));

  const prog = await run("progress", [hair("left:0;top:50px;height:6px;width:100px") + growJs + head("Paper forgets.")]);
  ok("chrome-lint: a thin bar growing across the top is progress-hairline (error)", prog.sev("progress-hairline") === "error", note(prog));
  const under = await run("underline", [head("Paper forgets.") + hair("left:560px;top:620px;height:6px;width:100px") + growJs.replace("1800", "700")]);
  ok("chrome-lint: an underline drawing in under a headline is not a progress bar", !under.rules.has("progress-hairline"), note(under));

  const pinned = await run("pinned", [pinTxt(960) + head("One."), pinTxt(960) + head("Two."), pinTxt(960) + head("Three.")]);
  ok("chrome-lint: the same text at the same coordinates through 3 shots is pinned-element (error)", pinned.sev("pinned-element") === "error", note(pinned));
  const twoOnly = await run("pinned-two", [pinTxt(960) + head("One."), pinTxt(960) + head("Two."), head("Three.")]);
  ok("chrome-lint: the same text in only 2 of 3 shots is not pinned", !twoOnly.rules.has("pinned-element"), note(twoOnly));
  const moving = await run("pinned-moving", [pinTxt(960) + head("One."), pinTxt(700) + head("Two."), pinTxt(400) + head("Three.")]);
  ok("chrome-lint: the same text that moves to a new place each shot is a carrier, not pinned", !moving.rules.has("pinned-element"), note(moving));

  // exemptions and brand allowances
  const allowAttr = await run("allow-attr", [abs("left:140px;top:60px;font:24px Helvetica;color:#555", "02 / SPEAK", 'data-chrome="allow"') + head("Paper forgets.")]);
  ok("chrome-lint: an element marked data-chrome=\"allow\" is exempt", !allowAttr.rules.has("chapter-counter"), note(allowAttr));
  const brandAllow = await run("allow-brand", [caps(140, "Motion designer") + caps(1300, "A new model") + head("Paper forgets.")], { allow: ["tracked-caps-label"] });
  ok("chrome-lint: a rule the brand film's own films carry (allow) is not reported, and the exemption is listed", !brandAllow.rules.has("tracked-caps-label") && brandAllow.r.exempt.some((e) => /tracked-caps-label/.test(e)), note(brandAllow));

  // through slop.mjs: the findings carry a fix, errors exit 2, grammar.json's measured.chrome and --no-chrome are honoured
  const sl = (d, extra = []) => { const r = node("slop.mjs", ["--project", d, "--json", "--no-text-fit", ...extra]); let j = { findings: [] }; try { j = JSON.parse(r.stdout); } catch {} return { r, j, has: (rule) => j.findings.some((f) => f.rule === rule) }; };
  const s1 = sl(path.join(root, "caps2"));
  ok("slop: page-chrome findings come through slop.mjs --project with a why and a fix (exit 2 on an error)", s1.r.status === 2 && s1.j.findings.some((f) => f.rule === "tracked-caps-label" && f.severity === "error" && f.why && f.fix), s1.r.stdout.slice(0, 300) + s1.r.stderr.slice(0, 200));
  const s2 = sl(path.join(root, "caps2"), ["--no-chrome"]);
  ok("slop: --no-chrome skips the page-chrome check", !s2.has("tracked-caps-label"), s2.r.stdout.slice(0, 300));
  const s3 = sl(path.join(root, "caps2"), ["--chrome-allow", "tracked-caps-label"]);
  ok("slop: --chrome-allow lists rules to allow", !s3.has("tracked-caps-label"), s3.r.stdout.slice(0, 300));
  const run1 = path.join(tmp, "chrome-lint-run");
  fs.mkdirSync(path.join(run1, "brand-film"), { recursive: true });
  fs.writeFileSync(path.join(run1, "brand-film", "grammar.json"), JSON.stringify({ measured: { chrome: ["tracked-caps-label"] } }));
  const s4 = sl(path.join(root, "caps2"), ["--run", run1]);
  ok("slop: a brand film's grammar.json measured.chrome allows the rule it names (the brand's own measurement wins)", !s4.has("tracked-caps-label"), s4.r.stdout.slice(0, 300));
  const s5 = sl(path.join(root, "good"));
  ok("slop: a clean film passes the page-chrome check (exit 0)", s5.r.status === 0 && !s5.j.findings.some((f) => /^(kicker|deck|typed|vibe|chapter|progress|tracked|corner|header|pinned)/.test(f.rule)), s5.r.stdout.slice(0, 300));
}
