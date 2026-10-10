// brandfilm.mjs: measure, frames, card and compare on synthetic films (white canvas with black text cuts vs dark green).
// find/fetch need the network and yt-dlp: only a note here. export default async function ({ ok, node, tmp }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export default async function ({ ok, node, tmp }) {
  const root = path.join(tmp, "brandfilm-test");
  fs.mkdirSync(root, { recursive: true });
  const ff = (argv) => spawnSync("ffmpeg", ["-y", "-v", "error", ...argv], { encoding: "utf8" });
  const json = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const bf = (a) => node("brandfilm.mjs", a);
  if (ff(["-version"]).error) { console.log("note  brandfilm: ffmpeg is not installed, tests skipped"); return; }

  // 12 s, 4 shots of 3 s (3 known cuts at 3, 6, 9): a canvas with a block of a different brightness each shot
  const film = (name, bg, blocks) => {
    const f = path.join(root, name);
    const parts = blocks.map((c, i) => `color=c=${bg}:s=640x360:r=10:d=3,drawbox=x=${i % 2 ? 330 : 30}:y=${i < 2 ? 40 : 180}:w=280:h=140:color=${c}:t=fill[v${i}]`);
    const graph = parts.join(";") + ";" + blocks.map((_, i) => `[v${i}]`).join("") + `concat=n=${blocks.length}:v=1:a=0[o]`;
    const r = ff(["-filter_complex", graph, "-map", "[o]", "-c:v", "libx264", "-pix_fmt", "yuv420p", f]);
    return r.status === 0 ? f : (console.log(r.stderr.slice(0, 300)), null);
  };
  const white = film("white.mp4", "white", ["black", "black", "black", "black"]);
  const white2 = film("white2.mp4", "0xfafafa", ["0x101010", "0x101010", "0x101010", "0x101010"]);
  const green = film("green.mp4", "0x0d4a2f", ["0xe8d9a0", "0x9fd9b3", "0xf0f0f0", "0xd8c070"]);
  ok("brandfilm: synthesised the test films", !!(white && white2 && green));
  if (!(white && white2 && green)) return;

  const m = json(bf(["measure", "--in", white, "--out", path.join(root, "white", "grammar.json")])).measured;
  ok("brandfilm: measure reads a white canvas (mean luminance > 195, near-white share 0.7+)", m && m.luminance.mean > 195 && m.shares.nearWhite > 0.7, JSON.stringify(m && m.luminance));
  ok("brandfilm: measure sees the black blocks (near-black 5-30%)", m && m.shares.nearBlack > 0.05 && m.shares.nearBlack < 0.3, JSON.stringify(m && m.shares));
  ok("brandfilm: measure puts white first in the palette and as the background", m && m.palette[0].hex > "#f0f0f0" && m.background.overall > "#f0f0f0", JSON.stringify(m && m.palette.slice(0, 2)));
  ok("brandfilm: measure finds no colour moments on a greyscale film", m && m.saturation.colourMoments === 0);
  const mg = json(bf(["measure", "--in", green, "--out", path.join(root, "green", "grammar.json")])).measured;
  ok("brandfilm: measure reads dark green (mean luminance 60-150, near-white < 0.2)", mg && mg.luminance.mean > 60 && mg.luminance.mean < 150 && mg.shares.nearWhite < 0.2, JSON.stringify(mg && mg.luminance));
  ok("brandfilm: measure counts colour moments on the green film", mg && mg.saturation.colourMoments > 0);

  // frames: 3 known cuts (at 3, 6, 9 s)
  const fr = json(bf(["frames", "--in", white, "--out", path.join(root, "frames")]));
  ok("brandfilm: frames detects the 3 known cuts", fr.cutCount === 3, `cutCount ${fr.cutCount}`);
  ok("brandfilm: frames reports cut rate 2.5 per 10 s and a 3 s shot", fr.cutsPer10s === 2.5 && fr.avgShotLength === 3, `${fr.cutsPer10s} ${fr.avgShotLength}`);
  ok("brandfilm: frames writes JPGs (640 px wide) and a contact sheet", fr.frames && fr.frames.length >= 4 && fs.existsSync(path.join(root, "frames", "sheet-1.jpg")) && fs.existsSync(path.join(root, "frames", "frame-001.jpg")));
  const cutsOk = fr.cutTimes && [3, 6, 9].every((t, i) => Math.abs(fr.cutTimes[i] - t) < 0.5);
  ok("brandfilm: frames cut times are 3, 6, 9 s", cutsOk, JSON.stringify(fr.cutTimes));

  // card
  fs.copyFileSync(path.join(root, "white", "grammar.json"), path.join(root, "frames", "grammar.json"));
  const card = json(bf(["card", "--dir", path.join(root, "frames"), "--brand", "Test"]));
  const md = card.md && fs.existsSync(card.md) ? fs.readFileSync(card.md, "utf8") : "";
  ok("brandfilm: card writes FILM-STYLE.json and .md with the measured numbers", card.ok && /Mean luminance 2/.test(md) && /Typefaces/.test(md) && JSON.parse(fs.readFileSync(card.json, "utf8")).slots, md.slice(0, 200));

  // compare
  const gw = path.join(root, "white", "grammar.json");
  const same = bf(["compare", "--ref", gw, "--ours", white2]);
  // the look matches; these 3 s shots are slower than the house tempo (a change every 2.5 s), so only the tempo check objects
  ok("brandfilm: compare passes a white film against a white reference on every look check; only tempo objects to its 3 s shots", json(same).failed?.join() === "tempoRatio", same.stdout.slice(0, 300));
  const diff = bf(["compare", "--ref", gw, "--ours", green]);
  const dj = json(diff);
  ok("brandfilm: compare fails a dark green film against a white reference (exit 1, 3+ checks fail)", diff.status === 1 && dj.verdict === "FAIL" && dj.failed.length >= 3, JSON.stringify(dj.failed));
  ok("brandfilm: compare fails the green film on the hue-aware chroma check and on neutral share too", dj.checks && ["offBrandChromaShare", "neutralShare"].every((n) => dj.checks.find((c) => c.name === n && !c.pass)), JSON.stringify(dj.checks && dj.checks.filter((c) => /Chroma|neutral/.test(c.name))));
  ok("brandfilm: the white film passes the chroma and neutral checks against itself", json(same).checks.filter((c) => /Chroma|neutral/.test(c.name)).every((c) => c.pass));
  const viaDir = bf(["compare", "--ref", gw, "--ours", path.join(root, "frames")]);
  ok("brandfilm: compare takes a frames dir for ours", viaDir.status === 0, viaDir.stdout.slice(0, 200));

  // tempo: in-shot change rate and the longest hold, and the compare gate on it (house: a change at least every 2.5 s)
  const paced = (name, every, total) => {
    const n = Math.round(total / every), f = path.join(root, name);
    const parts = Array.from({ length: n }, (_, i) => `color=c=white:s=640x360:r=10:d=${every},drawbox=x=${40 + (i % 3) * 190}:y=${60 + (i % 2) * 120}:w=200:h=140:color=${i % 2 ? "black" : "0x404040"}:t=fill[v${i}]`);
    const graph = parts.join(";") + ";" + parts.map((_, i) => `[v${i}]`).join("") + `concat=n=${n}:v=1:a=0[o]`;
    return ff(["-filter_complex", graph, "-map", "[o]", "-c:v", "libx264", "-pix_fmt", "yuv420p", f]).status === 0 ? f : null;
  };
  const fast = paced("fast.mp4", 1.5, 12), slow = paced("slow.mp4", 4, 12);
  if (fast && slow) {
    const mf = json(bf(["measure", "--in", fast, "--out", path.join(root, "fast", "grammar.json")])).measured;
    const ms = json(bf(["measure", "--in", slow, "--out", path.join(root, "slow", "grammar.json")])).measured;
    ok("brandfilm: measure reports tempo (a change about every 1.5 s, longest hold under 2.5 s) for a fast film", mf && mf.tempo && mf.tempo.changeEveryS <= 2 && mf.tempo.longestHoldS <= 2.5, JSON.stringify(mf && mf.tempo));
    ok("brandfilm: measure reports a slow film's tempo (a change every 4 s or so, a hold of about 4 s)", ms && ms.tempo && ms.tempo.changeEveryS >= 3 && ms.tempo.longestHoldS >= 3.5, JSON.stringify(ms && ms.tempo));
    const gf = path.join(root, "fast", "grammar.json");
    const okT = bf(["compare", "--ref", gf, "--ours", fast]);
    ok("brandfilm: compare passes the tempo check against its own brand tempo", (json(okT).checks || []).find((c) => c.name === "tempoRatio")?.pass === true, okT.stdout.slice(0, 300));
    const slowT = bf(["compare", "--ref", gf, "--ours", slow]);
    ok("brandfilm: compare fails a slower draft on tempo (a brand that changes every 1.5 s, ours every 4 s)", (json(slowT).checks || []).find((c) => c.name === "tempoRatio")?.pass === false, slowT.stdout.slice(0, 300));
    const slowRef = bf(["compare", "--ref", path.join(root, "slow", "grammar.json"), "--ours", slow]);
    ok("brandfilm: compare never lets a draft be slower than the house tempo, even for a slow brand", (json(slowRef).checks || []).find((c) => c.name === "tempoRatio")?.pass === false, slowRef.stdout.slice(0, 300));
  }

  console.log("note  brandfilm: find/fetch need the network and yt-dlp, not exercised here");
}
