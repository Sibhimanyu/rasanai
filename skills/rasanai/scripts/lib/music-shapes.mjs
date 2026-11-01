// Named music arc shapes: the film's music is not always "sparse intro, drop, break, payoff, button". A concept (its `music_arc`) or the score names ONE shape;
// no name = "drop", the long-standing shape, byte for byte. Each shape says
//   gate:    the arc keys music.mjs insists on before it picks music (the story's event map); drop keeps drop_at, payoff_at, button_at and the break
//   parts:   what lib/audio.mjs arcFit scores (intro | lift | break | peak | rise | steady | hit | tail), `optional` parts count only when the arc gives them
//   plan:    the ACE-Step sections (lib/sound-sources.mjs buildLocalPrompt): [kind, tag, weight, min bars]; `big` are the sections that stretch to fill the bars
//   contrast: the section-by-section energy sentences of the ACE-Step caption
// music_arc in a concept / score.json: a shape name ("slow-burn") or an object { shape, intro_until, drop_at, break, payoff_at, button_at, genre, instruments, meter, bpm } in seconds.
// Not every shape needs every key: arcFit and the brief read the keys the shape has and default the rest (defaultArc).

export const SHAPES = {
  drop: {
    label: "drop", when: "a launch or reveal film: a sparse intro, a lift at the reveal, a break before the end card, a loud payoff, a button on the logo (the default)",
    needs: ["drop_at", "button_at"], gate: ["drop_at", "payoff_at", "button_at", "break"], parts: ["intro", "lift", "break", "peak"], peak: "turn", payoffLift: true,
    defaultStyle: "modern electronic launch film score",
    plan: () => [["intro", "Intro - low energy", 0.12, 2], ["build", "Build - building energy", 0.14, 2], ["drop", "Drop - explosive", 0.26, 4], ["break", "Breakdown - low energy", 0.12, 2], ["payoff", "Final Drop - explosive", 0.26, 4], ["outro", "Outro - one last hit", 0.1, 2]],
    big: ["drop", "payoff"],
    contrast: ["a sparse intro, one soft pad and a quiet pulse, no drums", "a rising build with a riser and filtered drums", "a massive full-band drop, heavy kick, deep bass and a bright lead, much louder than the intro", "a stripped breakdown with only pads and air, drums out, far quieter", "a huge final chorus, even bigger than the first, ending on one clean final hit"],
    defaults: (f) => ({ intro_until: f * 0.25, drop_at: f * 0.35, break: null, payoff_at: f * 0.7, button_at: f - 2.5 }),
  },
  "slow-burn": {
    label: "slow burn", when: "a story that builds patiently: it starts near-silent, keeps adding layers and only opens up at the very end (no drop, no break)",
    needs: ["button_at"], gate: ["payoff_at", "button_at"], parts: ["intro", "rise", "peak"], peak: "late",
    defaultStyle: "slow cinematic build",
    plan: () => [["intro", "Intro - low energy", 0.2, 4], ["build", "Build - building energy", 0.28, 4], ["rise", "Build - building energy", 0.24, 4], ["payoff", "Finale - explosive", 0.18, 4], ["outro", "Outro - one last hit", 0.1, 2]],
    big: ["rise", "payoff"],
    contrast: ["a near-silent intro, one soft pad", "layers added slowly, no drums yet", "drums enter and the energy keeps rising, never dropping back", "the biggest, fullest moment, only at the end, ending on one clean final hit"],
    defaults: (f) => ({ intro_until: f * 0.3, drop_at: f * 0.5, break: null, payoff_at: f * 0.85, button_at: f - 2.5 }),
  },
  "ambient-bed": {
    label: "ambient bed", when: "a calm film where the picture or a voice carries it: one even bed, no drop, no build (needs no event map)",
    needs: [], gate: [], parts: ["steady"],
    defaultStyle: "ambient bed, soft evolving pads",
    plan: () => [["intro", "Intro - low energy", 0.12, 2], ["bed", "Ambient bed - low energy", 0.76, 4], ["outro", "Outro - low energy", 0.12, 2]],
    big: ["bed"],
    contrast: ["a continuous ambient bed, soft evolving pads and air, no drums or only a barely audible pulse", "steady and even from start to end, no drops, no builds, no sudden changes", "quiet enough to sit under type or a voice"],
    defaults: (f) => ({ intro_until: 1, drop_at: 1.5, break: null, payoff_at: f * 0.6, button_at: Math.max(2, f - 1) }),
  },
  "cold-open": {
    label: "cold open", when: "a film that hits from the first frame: the music is already at full energy at 0 s (a break and a payoff are optional)",
    needs: ["button_at"], gate: ["button_at"], parts: ["hit", "break", "peak"], optional: ["break"], peak: "any",
    defaultStyle: "hard-hitting electronic",
    plan: () => [["drop", "Intro - explosive", 0.3, 4], ["break", "Breakdown - low energy", 0.14, 2], ["payoff", "Final - explosive", 0.4, 4], ["outro", "Outro - one last hit", 0.16, 2]],
    big: ["drop", "payoff"],
    contrast: ["a full-band hit from the very first beat, no sparse intro", "the energy never starts quiet", "a short breakdown halfway, drums out", "a huge final section, ending on one clean final hit"],
    defaults: (f) => ({ intro_until: 0.4, drop_at: 0.4, break: null, payoff_at: f * 0.7, button_at: f - 2.5 }),
  },
  stinger: {
    label: "stinger / short", when: "a short film or sting (about 10 s or less): one riser into one big hit with a natural tail",
    needs: ["drop_at", "button_at"], gate: ["drop_at", "button_at"], parts: ["lift", "peak", "tail"], peak: "turn",
    defaultStyle: "cinematic sting",
    plan: () => [["build", "Build - building energy", 0.5, 2], ["payoff", "Hit - explosive", 0.3, 2], ["outro", "Outro - low energy", 0.2, 2]],
    big: ["payoff"],
    contrast: ["a short riser into one big full-band hit", "a single hit with a natural tail, nothing after it"],
    defaults: (f) => ({ intro_until: f * 0.4, drop_at: Math.max(1, f - 2.2), break: null, payoff_at: Math.max(1, f - 2.2), button_at: Math.max(2, f - 0.2) }),
  },
  "pulse-loop": {
    label: "pulse / loop", when: "a loop, a social cut or a UI tour: one steady groove at one energy from start to end (needs no event map)",
    needs: [], gate: [], parts: ["steady"],
    defaultStyle: "steady loopable groove",
    plan: () => [["intro", "Intro - low energy", 0.1, 2], ["groove", "Groove - steady energy", 0.8, 4], ["outro", "Outro - steady energy", 0.1, 2]],
    big: ["groove"],
    contrast: ["a steady repeating groove, the same energy from start to end", "a loopable pulse, no builds, no drops, no breakdown"],
    defaults: (f) => ({ intro_until: 0.5, drop_at: 1, break: null, payoff_at: f * 0.6, button_at: Math.max(2, f - 1) }),
  },
  "lyric-song": {
    label: "lyric song", when: "a sung film (sound_mode song-lyric): verse and chorus, the hook sung twice, a break before the last chorus is optional",
    needs: ["drop_at", "button_at"], gate: ["drop_at", "payoff_at", "button_at"], parts: ["intro", "lift", "break", "peak"], optional: ["break"], peak: "turn", payoffLift: true,
    defaultStyle: "modern pop song",
    plan: (song) => (song
      ? [["intro", "Intro - low energy", 0.08, 2], ["verse", "Verse", 0.14, 4], ["build", "Build - building energy", 0.06, 2], ["drop", "Chorus - explosive", 0.24, 4], ["break", "Breakdown - low energy", 0.1, 2], ["payoff", "Final Chorus - explosive", 0.24, 4], ["outro", "Outro - one last hit", 0.08, 2]]
      : SHAPES.drop.plan()),
    big: ["drop", "payoff"],
    contrast: SHAPES_DROP_CONTRAST(),
    defaults: (f) => ({ intro_until: f * 0.25, drop_at: f * 0.35, break: null, payoff_at: f * 0.7, button_at: f - 2.5 }),
  },
};
function SHAPES_DROP_CONTRAST() { return ["a sparse intro, one soft pad and a quiet pulse, no drums", "a rising build with a riser and filtered drums", "a massive full-band chorus, heavy kick, deep bass and a bright lead, much louder than the intro", "a stripped breakdown with only pads and air, drums out, far quieter", "a huge final chorus, even bigger than the first, ending on one clean final hit"]; }

for (const [k, v] of Object.entries(SHAPES)) v.id = k;
export const SHAPE_IDS = Object.keys(SHAPES);
// "Slow Burn" | "slow_burn" | "slowburn" | { shape } -> a known id, else "drop"
export function shapeId(v) {
  const raw = v && typeof v === "object" ? v.shape ?? v.id ?? v.name : v;
  const k = String(raw || "").toLowerCase().trim().replace(/[\s_/]+/g, "-").replace(/^slowburn$/, "slow-burn").replace(/^ambient$|^bed$/, "ambient-bed").replace(/^short$|^sting$/, "stinger").replace(/^loop$|^pulse$/, "pulse-loop").replace(/^song$|^lyric$/, "lyric-song").replace(/^cold-?open$/, "cold-open");
  return SHAPES[k] ? k : "drop";
}
export const shapeOf = (v) => SHAPES[shapeId(v)];
// was a shape named at all (as opposed to defaulted)?
export const shapeNamed = (v) => { const raw = v && typeof v === "object" ? v.shape ?? v.id ?? v.name : v; return !!String(raw || "").trim(); };
export function defaultShapeArc(film, shape) {
  const f = Number(film) || 30, r = (x) => Math.round(x * 10) / 10;
  const d = shapeOf(shape).defaults(f);
  return { intro_until: r(d.intro_until), drop_at: r(d.drop_at), break: d.break, payoff_at: r(d.payoff_at), button_at: r(d.button_at) };
}
// one line for a writer: the shapes and when to pick each (the doc in references/sound.md says the same)
export const shapeMenu = () => SHAPE_IDS.map((k) => `${k}: ${SHAPES[k].when}`).join("\n");

// the sound a style world implies (instruments, genre): a pixel world is chiptune, a paper world is felt piano and pizzicato. Matched on the world's id or name; null = no opinion.
const WORLD_SOUND = [
  [/pixel|8[- ]?bit|arcade|chiptune|retro-?game|game-?boy/i, { genre: "chiptune", style: "chiptune, 8-bit square and triangle waves, bright arpeggios, noise-channel drums" }],
  [/paper|stop-?motion|craft|felt|clay|collage|cut-?out/i, { genre: "acoustic craft", style: "warm acoustic, felt piano, pizzicato strings, soft hand percussion, close room sound" }],
  [/riso|zine|punk|brutal|xerox|grunge/i, { genre: "lo-fi punk", style: "lo-fi punchy drums, fuzzy bass, bitcrushed texture, raw energy" }],
  [/vapor|synthwave|y2k|chrome|80s|neon-?retro/i, { genre: "synthwave", style: "synthwave, analog pads, gated snare, warm arpeggios" }],
  [/noir|cinematic|luxury|serif|keynote/i, { genre: "cinematic", style: "sparse cinematic, low strings, piano, sub pulse, long tails" }],
  [/blueprint|terminal|hud|technical|code|cyber/i, { genre: "dark electronic", style: "dark minimal electronic, sine bass, glitch percussion, filtered pad" }],
  [/water-?colou?r|storybook|ink|illustrat|hand-?drawn/i, { genre: "gentle acoustic", style: "gentle acoustic, harp, soft strings, light woodwinds, airy" }],
];
export function worldSound(world) {
  const s = world && typeof world === "object" ? [world.id, world.name, world.label].filter(Boolean).join(" ") : String(world || "");
  if (!s.trim()) return null;
  for (const [re, v] of WORLD_SOUND) if (re.test(s)) return v;
  return null;
}
export const isPixelWorld = (world) => { const w = worldSound(world); return !!w && w.genre === "chiptune"; };
// "3/4" | "6/8" | "4" -> beats per bar (2, 3, 4 or 6); anything else 4
export function meterBeats(m) { const n = Number(String(m || "4/4").split("/")[0]); return [2, 3, 4, 6].includes(n) ? n : 4; }
