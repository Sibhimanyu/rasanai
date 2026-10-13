// sound.mjs check, the payoff warnings, on synthetic audio made with ffmpeg lavfi: a flat bed is `flat-payoff`; a bed that
// drops 1 s before the payoff and rises on it passes; a loud burst early with the payoff later is `loudest-not-payoff`;
// no payoff time is a skip, never a pass. export default async function ({ ok, node, tmp }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export default async function ({ ok, node, tmp }) {
  const ff = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (ff.status !== 0) { console.log("note  sound-payoff: ffmpeg is not available, skipped"); return; }
  const dir = fs.mkdtempSync(path.join(tmp, "payoff-"));
  const mk = (name, expr) => {
    const f = path.join(dir, name + ".wav");
    // amplitude envelope over 8 s of a 220 Hz + 330 Hz tone
    spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `aevalsrc='(${expr})*(sin(2*PI*220*t)+0.6*sin(2*PI*330*t))*0.3':s=44100:d=8`, f]);
    return f;
  };
  const check = (f, extra = []) => {
    const r = node("sound.mjs", ["check", "--audio", f, ...extra]);
    let j = {}; try { j = JSON.parse(r.stdout); } catch {}
    return { j, w: (j.warnings || []).join(" | ") };
  };
  const flat = check(mk("flat", "0.5"), ["--payoff", "5"]);
  ok("sound: a flat bed through the payoff is flat-payoff, with numbers", /flat-payoff/.test(flat.w) && flat.j.measures?.payoff?.lift_db != null, flat.w);
  const good = check(mk("good", "0.5*lt(t,3.9)+0.1*between(t,3.9,4.99)+1.0*gte(t,5)"), ["--payoff", "5"]);
  // 0.5 until 3.9, 0.1 from 3.9 to 5 (a 1.1 s dip), 1.0 on the payoff
  ok("sound: a dip before the payoff and a hit on it passes the payoff checks", !/flat-payoff|loudest-not-payoff/.test(good.w) && good.j.measures?.payoff?.lift_db > 2, good.w + JSON.stringify(good.j.measures?.payoff));
  const busy = check(mk("busy", "0.3+0.7*between(t,1.8,2.8)"), ["--payoff", "6"]);
  ok("sound: a loud burst at 2 s with the payoff at 6 s is loudest-not-payoff", /loudest-not-payoff/.test(busy.w), busy.w);
  const none = check(mk("none", "0.5"));
  ok("sound: no payoff time skips the check with a note (no payoff warning)", none.j.measures?.payoff?.skipped && !/flat-payoff|loudest-not-payoff/.test(none.w), JSON.stringify(none.j.measures?.payoff));
  const ev = path.join(dir, "events.json");
  fs.writeFileSync(ev, JSON.stringify([{ kind: "reveal", t: 5 }]));
  const viaEv = check(path.join(dir, "flat.wav"), ["--events", ev]);
  ok("sound: a reveal event gives the payoff time", viaEv.j.measures?.payoff?.at === 5 && /flat-payoff/.test(viaEv.w), JSON.stringify(viaEv.j.measures?.payoff));
}
