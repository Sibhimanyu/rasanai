// Decide the sound mode with the story: vo-kinetic | instrumental-arc | sfx-led | song-lyric.
// Pure function, no I/O. Rules come from .context/creative-research/R3-sound.md section 2 (reference films: four narrated, one hook-VO, two
// instrumental-arc; R6 favourites add a beat bed, a VO film and a sung song) and references/sound.md "Sound mode".
//   decideSoundMode({ product, lengthS, platform, claims, needsExplanation, picture, kineticType, brand, userAnswer, hasTrack, lyricTrack, captions })
//   -> { mode, reason, recommend_vo: { yes, style: "full"|"hook"|"none", why }, loudness: "web"|"keynote"|"broadcast", words_budget, alternatives:[{mode,why}], ask, flags }
// platform: "muted-social" (X, LinkedIn, Instagram feed, muted site hero) | "social" (sound on) | "site" | "youtube" | "keynote" | "broadcast"
// userAnswer: the person's own words or a mode id ("voiceover", "no voice", "just music", "sfx only", "song"). It always wins, except that
//   song-lyric needs a lyricTrack (supplied) or lyricText (a lyric written in the story stage), and a conflict is reported instead of hidden.
// song-lyric is a FIRST-CLASS mode (R6: the owner's favourite SOVRA.FM is a sung song that is the pitch): a supplied song wins by default, and a
// brand/consumer launch of 45-60 s where tone matters gets it suggested (`suggest_song`) with the reason.

export const MODES = ["vo-kinetic", "instrumental-arc", "sfx-led", "song-lyric"];
export const WORDS_PER_SEC = 2.4; // the reference films run about 2.5; leave air

const MUTED = new Set(["muted-social", "muted", "autoplay"]);
const num = (x, d) => (Number.isFinite(Number(x)) && x !== null && x !== "" ? Number(x) : d);

// a free-text or id answer -> a mode, or null when it says nothing about sound
export function parseUserAnswer(a) {
  if (!a) return null;
  const s = String(a).toLowerCase();
  if (MODES.includes(s.trim())) return { mode: s.trim(), explicit: true };
  if (/\b(song|lyric|lyrics|sung|singing|music video|anthem)\b/.test(s)) return { mode: "song-lyric" };
  if (/\b(sfx[- ]?(only|led)|sound effects only|no music|foley|silent with)\b/.test(s)) return { mode: "sfx-led" };
  if (/\b(no (voice|vo|narration|narrator)|without (a )?(voice|vo|narration)|just music|music only|instrumental)\b/.test(s)) return { mode: "instrumental-arc" };
  if (/\b(voice ?over|vo|narrat\w*|voice|narrator|someone (talking|speaking))\b/.test(s)) return { mode: "vo-kinetic" };
  return null;
}

export function decideSoundMode(o = {}) {
  const len = num(o.lengthS, 30);
  const platform = String(o.platform || "site").toLowerCase();
  const muted = MUTED.has(platform) && !o.captions;
  const mutedCaptioned = MUTED.has(platform) && !!o.captions;
  const claims = num(o.claims, o.needsExplanation === true ? 3 : o.needsExplanation === false ? 1 : 2);
  const explains = o.needsExplanation === true || claims > 2;
  const loudness = platform === "keynote" ? "keynote" : platform === "broadcast" ? "broadcast" : "web";
  const flags = { muted_first: muted || mutedCaptioned, captions: !!o.captions, claims, explains };
  const alternatives = [];
  const answer = parseUserAnswer(o.userAnswer);

  // 1. the user's own track decides before anything: a song they supply is the lyric mode only if they asked for it
  let mode, reason;
  let conflict = null;
  if (answer) {
    mode = answer.mode;
    reason = `the person asked for it ("${String(o.userAnswer).slice(0, 80)}")`;
    if (mode === "song-lyric" && !o.lyricTrack && !o.lyricText) {
      conflict = "song-lyric needs a song (supplied with --track and a declared licence) or a lyric written in the story stage and set to music; without either, fall back to instrumental-arc";
      mode = "instrumental-arc";
      reason += `, but ${conflict}`;
    }
  } else if ((o.lyricTrack || o.lyricText) && o.songOptIn !== false) {
    mode = "song-lyric";
    reason = "a song with lyrics is in hand; the song is the pitch (five acts ending on the tagline), the on-screen type runs its own short script beside it";
  } else if (o.kineticType && !explains && len <= 20) {
    mode = "vo-kinetic";
    reason = "type is the voice: short kinetic film; use a VO hook or let the type speak";
  } else if (len < 15) {
    mode = o.interface || o.product === "app" ? "sfx-led" : "instrumental-arc";
    reason = `under 15 s: no room for a spoken story; ${mode === "sfx-led" ? "the interface is the star" : "one arc of music carries it"}`;
  } else if (explains && len >= 30 && !muted) {
    mode = "vo-kinetic";
    reason = `${claims} claims over ${len} s for a ${platform} placement: words must be heard, on-screen type follows the voice`;
  } else if (muted) {
    mode = o.interface ? "sfx-led" : "instrumental-arc";
    reason = "muted-autoplay placement without burned-in captions: picture first, sound is a bonus; open with an immediate hit for the unmute";
  } else if (explains && len >= 15) {
    mode = "vo-kinetic";
    reason = mutedCaptioned ? "story needs explaining; captions burned in carry it when muted" : "story needs explaining and sound is on";
  } else if (o.interface && len <= 25) {
    mode = "sfx-led";
    reason = "the interface is the star and the film is short: UI sound, one riser into one impact, room tone";
  } else {
    mode = "instrumental-arc";
    reason = "the picture carries the argument: a designed arc (sparse intro, lift, drop, held peak, clean ending) with SFX tied to the hits";
  }
  if (mode === "sfx-led" && len > 25) alternatives.push({ mode: "instrumental-arc", why: "SFX-only thins out past about 25 s; add a bed" });

  // 2. VO recommendation (coded from the rules in R3 section 2)
  let yes, style, why;
  if (mode === "song-lyric") { yes = false; style = "none"; why = "no VO over a sung lyric: sung words compete with spoken ones; the lyric is the voice"; }
  else if (mode === "sfx-led") { yes = false; style = "none"; why = "SFX-led films stay wordless; on-screen type carries any claim"; }
  else if (len < 15) { yes = false; style = "none"; why = "under 15 s: not enough time to say a claim and land a picture"; }
  else if (muted) { yes = false; style = "none"; why = "muted-first placement without burned-in captions: a voice would not be heard; add captions first if a voice is wanted"; }
  else if (o.kineticType && !explains) { yes = len >= 15; style = yes ? "hook" : "none"; why = "kinetic type is the voice; at most a one-line VO hook"; }
  else if (explains && len >= 30) { yes = true; style = "full"; why = `${claims} claims over ${len} s for a ${loudness === "keynote" ? "keynote" : platform} placement; budget about ${Math.floor(len * WORDS_PER_SEC * 0.85)} words`; }
  else if (len >= 15 && len < 30 && (o.thesis !== false) && mode !== "instrumental-arc") { yes = true; style = "hook"; why = "15-30 s with a one-sentence thesis: a VO hook line, then picture and music carry it"; }
  else if (len >= 15 && len < 30 && o.brand) { yes = true; style = "hook"; why = "a brand or manifesto film of 15-30 s: one thesis line as a hook"; }
  else { yes = false; style = "none"; why = "the picture is self-explaining; a voice would repeat what is on screen"; }
  if (conflict === null && answer && answer.mode === "vo-kinetic") { yes = true; if (style === "none") style = len < 30 ? "hook" : "full"; why = `the person asked for a voice; ${style === "hook" ? "keep it to a hook line" : "full narration"}`; }
  if (answer && answer.mode === "instrumental-arc" && /\b(no|without) (voice|vo|narration)/i.test(String(o.userAnswer))) { yes = false; style = "none"; why = "the person said no voice"; }
  if (mode === "vo-kinetic" && !yes) { yes = true; style = style === "none" ? "hook" : style; }
  const words_budget = yes ? (style === "hook" ? Math.min(22, Math.floor(len * 0.5)) : Math.floor(len * WORDS_PER_SEC * 0.85)) : 0;

  if (mode !== "vo-kinetic") alternatives.push({ mode: "vo-kinetic", why: yes ? why : "a voice would lengthen the story; only if the claims must be heard" });
  if (mode !== "instrumental-arc" && mode !== "song-lyric") alternatives.push({ mode: "instrumental-arc", why: "picture-led with a designed music arc" });
  // a song fits a brand or consumer launch of 45-60 s where tone matters and the claims are few (R6: SOVRA.FM): suggest it, say why
  const songFits = !!(o.brand || o.consumer || o.songFits) && len >= 40 && len <= 70 && !explains && !muted;
  if (mode !== "song-lyric") alternatives.push({ mode: "song-lyric", why: songFits ? "suggested: a brand/consumer launch of 40-70 s where tone matters; a five-act song (complaint, turn, mechanism, benefits, tagline) is the pitch and the picture carries its own script" : "a song as the pitch: needs a supplied licensed song or a lyric written and set to music" });
  const suggest_song = songFits && mode !== "song-lyric";

  const ask = [];
  if (yes) ask.push("Voice identity: pick a stock voice, or supply a brand voice. Never clone a voice without the owner's say.");
  if (mode === "song-lyric") ask.push("Which song, and where is it licensed (saved in LICENSES.json)? Or write the lyric first (five acts, rhymed, ending on the tagline) and set it to music. Force-align the lyric text to the audio (lib/lyrics.mjs alignLyrics; vo.mjs lyrics), never trust a raw whisper transcript.");
  if (suggest_song) ask.push("A song fits this film (brand/consumer launch, tone matters): offer it as the sound mode.");
  if (o.userAnswer == null) ask.push(`Sound: ${mode === "vo-kinetic" ? "voiceover with type that follows it" : mode === "instrumental-arc" ? "music with a designed arc" : mode === "sfx-led" ? "effects only" : "sung lyrics"} is the plan. Change it?`);

  return { mode, reason, recommend_vo: { yes, style, why }, loudness, words_budget, alternatives, ask, flags, suggest_song, ...(conflict ? { conflict } : {}) };
}

// what each mode asks of the stems; the mix and the sources read this
export const MODE_STEMS = {
  "vo-kinetic": { music: "instrumental bed, carved under the voice", vo: true, sfx: "sparse: hits and whooshes at cuts", duck_db: 0, lra: [2.5, 5] },
  "instrumental-arc": { music: "carries a 12-20 LU arc", vo: false, sfx: "layered to the drop, the payoff and the button", duck_db: 0, lra: [8, 15] },
  "sfx-led": { music: "none, or a quiet drone", vo: false, sfx: "the whole film: UI, riser into one impact, room tone", duck_db: 0, lra: [4, 10] },
  "song-lyric": { music: "the song (supplied, or written lyric first and set to music), force-aligned to its lyric text, mastered flat and loud", vo: false, sfx: "risers into section changes and hits on picture changes; none over a sung line", duck_db: 0, lra: [4, 10] },
};
