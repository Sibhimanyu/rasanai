// The motion contract in builder language for entire videos (video.mjs, and the
// selftest): what frame.md, every frame packet and DISPATCH.md tell the frame workers.
// (handoff.mjs writes the single-unit version of the same rules itself.)
export const CONTRACT_MARK = "<!-- rasanai:motion-contract -->";

export function motionLabel(M) {
  return M.personality === "custom" ? `${M.parent} adjusted (${(M.adjustments || []).join(", ")})` : M.personality;
}

// The fluent rules in builder language, from motion.md's fields (old files without the new keys get the defaults).
// One list, used by motion.md's body, frame packets, DISPATCH.md and the single-unit handoff, so they never disagree.
export function fluentRules(M) {
  const D = M.durations || { base_ms: 280, travel_ms: 550, area_ms: 150, min_ms: 350, max_ms: 1400, exit_k: 0.65 };
  const C = M.curves || {};
  const mix = M.mix || { min_families: 4, max_share: 0.4, max_duration_share: 0.4 };
  const os = M.overshoot || { share: 0.15, max_pct: 8 };
  const st = M.stagger || {};
  const roles = Object.entries(C).map(([k, v]) => `${k} \`${v}\``).join(", ");
  return [
    `- **Curves by role, never one ease for all.** ${roles ? roles + "." : ""} The language's signature: enter \`${(M.easing || {}).enter}\`, exit \`${(M.easing || {}).exit}\`, move \`${(M.easing || {}).move}\`. At least ${mix.min_families} curve families in the film and no single curve on more than ${Math.round(mix.max_share * 100)}% of its gestures. Write every ease explicitly (GSAP's default power1.out is the generic look); \`RasanMotion.ease("<role>")\` gives any of these as a function, cubic-bezier() and spring() included.`,
    `- **Durations from travel and size, not a scale.** ${D.base_ms} ms + ${D.travel_ms} ms x sqrt(travel / frame diagonal) + ${D.area_ms} ms x sqrt(area / frame area), clamped to ${D.min_ms}-${D.max_ms} ms, jittered +-8%; exits x${D.exit_k}. A travel over 10% of the frame takes 0.7 s or more. No single duration on more than ${Math.round((mix.max_duration_share || 0.4) * 100)}% of gestures. (\`tempo.scale_ms\` ${(M.tempo && M.tempo.scale_ms || []).join(" / ")} is the language's pace, for reference only.)`,
    "- **Overlap, never sequence.** The next gesture starts at 55-75% of the last one; every primary move carries a secondary (a child trailing 2-4 frames, a shadow, a parallax layer, the camera). Two or more things move at once in about half the active frames.",
    `- **Irregular cascades.** About ${st.each_ms || 80} ms apart on average, offsets on a curve plus +-1 frame, durations +-10%, the whole spread under ${st.amount_max_ms || 500} ms. A constant \`stagger: 0.08\` or four identical tweens at even spacing is the metronome tell.`,
    os.share > 0 ? `- **Settles on a budget.** About 1 landing in 8 (at most ${Math.round(os.share * 100)}% of gestures) overshoots and returns, by at most ${os.max_pct}% of its travel: hero landings, never body text.` : "- **No overshoot** in this language: landings are exact.",
    M.arcs && M.arcs.min_travel_pct >= 100 ? "- Paths are straight in this language (rails, steps)." : "- **Arcs.** Any travel over 3% of the frame bends by 4-12% of its length, away from the frame centre.",
    "- **A living frame.** Each shot has a camera layer on a world wrapper (a 1.5-4% push or a 0.5-1.5%/s drift) or a quiet ambient on the ground; fast moves (over ~40% of the frame width a second) soften with speed. A composed hold is fine; a dead frame is not.",
    `- Holds: every element stays at least ${(M.holds || {}).min_ms || 900} ms between arriving and leaving (reading time).`,
    `- Banned (machine-checked): ${(M.banned || []).join(", ") || "nothing"}.`,
    M.stillness ? "- **Stillness style declared:** long composed holds are the style; the shape of each move is still checked." : "",
  ].filter(Boolean).join("\n");
}

// M = motion.md frontmatter fields. opts.video = multi-scene (frame workers).
export function contractText(M, { lengthS, W, H, video = false, feel = "" } = {}) {
  const nonStandard = Object.values(M.easing || {}).filter((e) => /^(steps|none|linear)/i.test(String(e)));
  const lines = [
    CONTRACT_MARK,
    "## Motion contract (binding, from motion.md, decided with RasanAI)",
    "",
    `- Personality: ${motionLabel(M)}${lengthS ? `. Video length ${lengthS}s, ${W}x${H}.` : ""}`,
    fluentRules(M),
    "- The motion vocabulary `RasanMotion` (assets/rasan-motion/, references/motion-md-contract.md) writes all of this for you: travel, land, enter, exit, cascade, follow, camera, ambient.",
    `- Preferred entrances: ${(M.entrances || []).join(", ")}. Exits: ${(M.exits || []).join(", ")}.`,
    "- GSAP only (no CSS @keyframes, anime.js or WAAPI). Registry blocks you reuse are re-eased and re-timed to these rules.",
    `- Hiding an element until its entrance: a zero-duration \`tl.set(el, { autoAlpha: 0 }, 0)\` then \`tl.set(el, { autoAlpha: 1 }, t)\` right before its entrance (never on a \`.clip\` element), or a \`fromTo({autoAlpha:0}, {autoAlpha:1, ...})\` that also carries the personality's entrance properties. A timed autoAlpha-only fade is an opacity-only entrance and is checked like one.`,
  ];
  if (nonStandard.length) lines.push(`- These eases are deliberate and override any default ease list you were given: ${nonStandard.map((e) => `\`${e}\``).join(", ")}.`);
  if (video) {
    lines.push(
      "- **Precedence.** The frame-worker structural rules still win (caption keep-out, no front-loading, no exits except in the final frame, fromTo, no repeat/yoyo/random). This contract replaces the workflow's default motion doctrine (e.g. motion-language.md's power3 default and its back/elastic ban) wherever they differ.",
      "- **Between frames** the storyboard's `transition_in` carries the handoff; do not animate your own frame's exit unless you are the final frame.",
      "- **Intensity** (`motion_intensity` in your frame block): high = more gestures overlapping and harder launches; medium = the default; low = fewer, longer gestures and composed holds with a living layer. The curve mix and the rules above hold at every intensity."
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
