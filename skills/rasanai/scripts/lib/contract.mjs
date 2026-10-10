// The motion contract in builder language for entire videos (video.mjs, and the
// selftest): what frame.md, every frame packet and DISPATCH.md tell the frame workers.
// (handoff.mjs writes the single-unit version of the same rules itself.)
export const CONTRACT_MARK = "<!-- rasanai:motion-contract -->";

export function motionLabel(M) {
  return M.personality === "custom" ? `${M.parent} adjusted (${(M.adjustments || []).join(", ")})` : M.personality;
}

// M = motion.md frontmatter fields. opts.video = multi-scene (frame workers).
export function contractText(M, { lengthS, W, H, video = false, feel = "" } = {}) {
  const nonStandard = Object.values(M.easing || {}).filter((e) => /^(steps|none|linear)/i.test(String(e)));
  const lines = [
    CONTRACT_MARK,
    "## Motion contract (binding, from motion.md, decided with RasanAI)",
    "",
    `- Personality: ${motionLabel(M)}${lengthS ? `. Video length ${lengthS}s, ${W}x${H}.` : ""}`,
    `- Durations: every tween's duration is one of ${M.tempo.scale_ms.join(" / ")} ms (±15%). For a staggered tween the per-element duration counts, not the spread.`,
    "- Eases (always write them explicitly; never rely on the GSAP default):",
    `  - enter \`${M.easing.enter}\`: anything becoming visible, including a rule drawing out from 0, a mask or clip opening, letters growing from a baseline`,
    `  - exit \`${M.easing.exit}\`: anything leaving or collapsing back to 0`,
    `  - move / emphasis \`${M.easing.move}\`: changes to an element that stays visible (shift, push, pulse)`,
    `- Stagger ${M.stagger.each_ms} ms between units. Give every element at least ${M.holds.min_ms} ms on screen after it has fully arrived before it leaves (reading time), and keep it moving in that time (its slow carry toward its exit, the camera going somewhere, the next element arriving): nothing parks, and no stretch of 0.8 s goes still.`,
    `- Banned (machine-checked after the build): ${(M.banned || []).join(", ")}.`,
    `- Preferred entrances: ${(M.entrances || []).join(", ")}. Exits: ${(M.exits || []).join(", ")}.`,
    "- GSAP only (no CSS @keyframes, anime.js or WAAPI). Registry blocks you reuse are re-eased and re-timed to these rules.",
    `- Hiding an element until its entrance: a zero-duration \`tl.set(el, { autoAlpha: 0 }, 0)\` then \`tl.set(el, { autoAlpha: 1 }, t)\` right before its entrance (never on a \`.clip\` element), or a \`fromTo({autoAlpha:0}, {autoAlpha:1, ...})\` that also carries the personality's entrance properties. A timed autoAlpha-only fade is an opacity-only entrance and is checked like one.`,
  ];
  if (nonStandard.length) lines.push(`- These eases are deliberate and override any default ease list you were given: ${nonStandard.map((e) => `\`${e}\``).join(", ")}.`);
  if (video) {
    lines.push(
      "- **Precedence.** The frame-worker structural rules still win (caption keep-out, no front-loading, no exits except in the final frame, fromTo, no repeat/yoyo/random). This contract replaces the workflow's default motion doctrine (e.g. motion-language.md's power3 default and its back/elastic ban) wherever they differ.",
      "- **Between frames** the storyboard's `transition_in` carries the handoff; do not animate your own frame's exit unless you are the final frame.",
      "- **Intensity** (`motion_intensity` in your frame block): high = the shorter scale values and the full stagger; medium = the middle values; low = the longer values and fewer moves, never a freeze (something meaningful still changes every 1.5 to 2.5 s). Always the same eases."
    );
  }
  if (feel) lines.push("", "How it should feel:", "", feel.trim());
  return lines.join("\n") + "\n";
}

// replace an existing contract section (from the marker to the next top-level
// section or end of file) or append a new one
export function upsertContract(text, section) {
  const i = text.indexOf(CONTRACT_MARK);
  if (i === -1) return text.replace(/\s*$/, "\n\n") + section;
  const rest = text.slice(i + CONTRACT_MARK.length);
  const next = rest.search(/\n# [^\n]+|\n<!-- (?!rasanai:motion-contract)/);
  return text.slice(0, i) + section + (next === -1 ? "" : rest.slice(next));
}
