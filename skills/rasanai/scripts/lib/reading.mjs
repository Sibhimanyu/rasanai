// The ONE reading-time formula (references/craft.md section 2, Reading time): a line needs 0.6 s + 0.3 s per word on screen.
// Plan-level checks (the score, scenes.json, the script's beats) use it as it is; render-level checks (what the frames
// actually show) allow a little slack: SLACK_RENDER = 0.85, so a line a few frames short still reads, one held half its time does not.
// `perWord` / `base` exist only so the user's lesson text.read_per_word_s (a longer reading time, lib/gate-lessons.mjs) keeps working.
export const READ_BASE_S = 0.6;
export const READ_PER_WORD_S = 0.3;
export const SLACK_RENDER = 0.85;

export const wordCount = (text) => String(text || "").split(/\s+/).filter(Boolean).length;

// seconds a line of `words` words (a number, or the text itself) needs; 0 for no words. { slack: SLACK_RENDER } for render-level checks.
export function readTime(words, { slack = 1, perWord = READ_PER_WORD_S, base = READ_BASE_S } = {}) {
  const w = typeof words === "number" ? words : wordCount(words);
  return w > 0 ? (base + perWord * w) * slack : 0;
}
