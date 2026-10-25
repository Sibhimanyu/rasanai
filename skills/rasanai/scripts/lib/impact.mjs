// Impact preview: what a change would make stale. A PREVIEW only: it never applies, moves or rewrites anything.
// Ids are stable ids (beat/shot/panel), never array indexes.
import { descendants, logicalStage, STAGES } from "./stages.mjs";

const uniq = (a) => [...new Set(a)];
const rest = (stale) => STAGES.filter((s) => !stale.includes(s));
const out = (stale, reason, extra = {}) => { const st = STAGES.filter((s) => stale.includes(s)); return { stale: st, keep: rest(st), reason, preview: true, ...extra }; };

// kind: what changed inside the stage.
//   story:      options.proposition (claims/proposition changed) | text-only (default)
//   storyboard: options.timing (beat durations or order changed) | copy-only (default)
//   final:      options.encoding (export settings only)
// ids: stable ids touched; echoed back so the UI can show "beats b2, b5".
export function impact(changedStage, ids = [], options = {}) {
  const st = logicalStage(changedStage);
  const touched = uniq((Array.isArray(ids) ? ids : []).filter((i) => typeof i === "string" && i));
  if (!st) return { stale: [], keep: [...STAGES], reason: `unknown stage ${JSON.stringify(changedStage)}`, preview: true, ids: touched };
  const o = options || {};
  const extra = { ids: touched, audio_alignment: false, transitions: false };
  switch (st) {
    case "brief":
      return out(descendants("brief"), "the brief changed: everything built from it is stale", extra);
    case "story":
      if (o.proposition) return out(descendants("story"), "the proposition or claims changed: look, storyboard, build and final are stale", extra);
      return out(["storyboard", "build", "final"].filter((s) => s !== "look"), "text-only fix: the look holds; only storyboard copy and what is built from it is stale", { ...extra, copy_only: true });
    case "look":
      // Plan 04 L6: a bounded look revision ("same typography, less glossy") names what stays fixed and always keeps the story.
      // options.downstream_started === false (the Look is still being chosen): nothing downstream exists yet, so nothing is stale.
      if (o.bounded || (Array.isArray(o.fixed) && o.fixed.length)) {
        const fixed = uniq(["story", ...(Array.isArray(o.fixed) ? o.fixed.filter((f) => typeof f === "string" && f) : [])]);
        const lx = { ...extra, bounded: true, fixed, story_preserved: true };
        if (o.downstream_started === false) return out([], "bounded look revision before the storyboard started: only the look's own frames are redrawn; story and everything else holds", lx);
        return out(["storyboard", "build", "final"], "bounded look revision: only the frames and build outputs drawn from the changed look parts are stale; brief and story hold", lx);
      }
      return out(["storyboard", "build", "final"], "the look changed: storyboard, build and final are stale; brief and story hold", extra);
    case "storyboard":
      if (o.timing) return out(["build", "final"], "timing changed: build and final are stale, and audio alignment and transitions must be redone", { ...extra, audio_alignment: true, transitions: true });
      return out(["build", "final"], "storyboard copy changed: build and final are stale", { ...extra, copy_only: true });
    case "build":
      return out(["final"], "the build changed: the final is stale", extra);
    case "final":
      return out(o.encoding ? ["final"] : ["final"], o.encoding ? "export encoding only: re-encode the final, nothing upstream is touched" : "the final changed", extra);
  }
  return out([], "no impact", extra);
}
