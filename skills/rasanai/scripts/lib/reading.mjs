// The ONE reading-time formula (references/craft.md section 2, Reading time): a line needs 0.6 s + 0.3 s per word on screen.
// Plan-level checks (the score, scenes.json, the script's beats) use it as it is; render-level checks (what the frames
// actually show) allow a little slack: SLACK_RENDER = 0.85, so a line a few frames short still reads, one held half its time does not.
// `perWord` / `base` exist only so the user's lesson text.read_per_word_s (a longer reading time, lib/gate-lessons.mjs) keeps working.
export const READ_BASE_S = 0.6;
export const READ_PER_WORD_S = 0.3;
export const SLACK_RENDER = 0.85;

export const wordCount = (text) => String(text || "").split(/\s+/).filter(Boolean).length;

// CJK has no spaces, so "words" means nothing: Han, kana, Hangul and fullwidth forms are counted by character.
// A line with any of them reads at CJK chars / 4.5 per second + the other non-space characters / 15 per second (lemo readcheck's pace) on top of the
// same base. `perWord` still scales the whole line (a lesson's longer reading time), against the default 0.3.
export const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uff00-\uffef]/g;
export const CJK_CPS = 4.5, OTHER_CPS = 15;
export const cjkCount = (text) => (String(text || "").match(CJK_RE) || []).length;
export const hasCjk = (text) => cjkCount(text) > 0;
// the reading-equivalent word count of a line (so a plan can keep one unit): CJK char = 0.74 word, other char = 0.22 word; plain words for any other text
export const equivWords = (text) => {
  const t = String(text || "");
  const c = cjkCount(t);
  if (!c) return wordCount(t);
  const other = t.replace(CJK_RE, "").replace(/\s+/g, "").length;
  return Math.round(((c / CJK_CPS + other / OTHER_CPS) / READ_PER_WORD_S) * 10) / 10;
};

// seconds a line of `words` words (a number, or the text itself) needs; 0 for no words. { slack: SLACK_RENDER } for render-level checks.
// Given the text and it holds CJK characters, the CJK branch above applies; a number is always a word count.
export function readTime(words, { slack = 1, perWord = READ_PER_WORD_S, base = READ_BASE_S } = {}) {
  if (typeof words === "string" && hasCjk(words)) {
    const other = words.replace(CJK_RE, "").replace(/\s+/g, "").length;
    return (base + (cjkCount(words) / CJK_CPS + other / OTHER_CPS) * (perWord / READ_PER_WORD_S)) * slack;
  }
  const w = typeof words === "number" ? words : wordCount(words);
  return w > 0 ? (base + perWord * w) * slack : 0;
}
