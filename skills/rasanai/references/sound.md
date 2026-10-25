# Sound: music, SFX, voiceover and the mix

Claude decides the sound craft; the user only picks the track (by ear, in the console) and hears the result. This page is the playbook. Everything measurable is measured by `scripts/sound.mjs` (pure Node + ffmpeg/ffprobe: no Python, no npm).

The one rule behind all of it: **the picture flexes, the music doesn't.** Scene lengths are code, so scenes snap to the track's bars. The music is never chopped to fit arbitrary scene times, and it is never looped.

## Commands

| Step | Command | What it gives |
|---|---|---|
| Find tracks | `music.mjs --run "$RUN" --film <s> [--style "<words>"] [--story "<words>"] [--format launch\|explainer\|reel\|kinetic\|brand\|premium] [--narrated] [--intents "a\|b\|c"]` | 2-4 options of different moods, each ≥ film + 4 s, analysed, quality-gated and fitted (add `--track <file or folder> --library <name>` for the user's own, `--arc <score.json>` for the brief). `preview` is the fitted bed (play that, not the raw file); `suggestions` are Mixkit cards fetched only on `--pick <id>`. Licences go to `$RUN/music/LICENSES.json`, the credit to `$RUN/music/CREDITS.txt` and `description.txt` (`music.mjs credits --run "$RUN" --pick <id>` for the one picked) |
| Analyse | `sound.mjs analyze --track <file>` | BPM, bars, per-bar energy, sections (intro/lift/drop/peak/breakdown/outro), strong sections, start candidates, ending (`ring-out`, `stop`, `decay`, `fade`, `cut`), loudness, `usable` + problems |
| Fit | `sound.mjs fit --track <file> --scenes <scenes.json\|timeline.json> [--film <s>] [--reveal <s>] [--logo <s>] --out plan.json [--write-scenes scenes.snapped.json]` | The edit plan (below), the film-time bar grid, the reveal and logo moved onto the music, scene starts snapped to bars. `needs_longer: true` when the track can't fill the film without a repeat |
| Render | `sound.mjs render --plan plan.json --out <project>/assets/music-bed.wav` | The edited bed, -14 LUFS integrated, true peak ≤ -1.5 dBTP. Mount at volume 1.0 unnarrated, about 0.2 under a voiceover |
| SFX | `sound.mjs sfx-plan --scenes <timeline.json> --plan plan.json --bed <bed.wav> [--events events.json] [--words audio_meta.json] --project <dir>` | Cues for causal events and for the score's seams that move, inside the budget, placed by each sample's measured sync point; pitch variants rendered into `assets/sfx/rasa/`; `audio_meta_sfx` ready for `audio_meta.json`. Runs after the build on EVERY route (narrated or not, direct path included) |
| Check | `sound.mjs check --video renders/<film>.mp4 --film <s> [--vo <stem>] [--music <stem>] [--sfx index.html\|sfx-plan.json] [--plan plan.json\|--events events.json] [--silent-by-choice "<reason>"]` | Exit 2 with fixes when loudness, peaks, head/tail, dropouts, loops, the VO gap or SFX density are off, and `no-sfx` (a film of 15 s or more with zero SFX cues, unless `--silent-by-choice`). Warnings: `flat-dynamics` (the bed's LRA under 2.0 LU) and `ring-out-ending` (music still audible more than 1.0 s after the last logo or cta event; a button ending is preferred), `flat-payoff` and `loudest-not-payoff` (below; pass `--payoff <s>` or a plan / events with the reveal), `no-breath` and `no-split-edits` (the film's shape, below; the second needs `--vo` or `--narrated` and cut times from `--scenes`, `--plan` or `--events`) |
| Master | `sound.mjs master --video in.mp4 --out out.mp4` | Post-render loudness fix (static gain + true-peak limiter; the picture is copied untouched) |
| Probe | `sound.mjs probe <sfx files>` | Sync point, lead silence, audible end, harshness (use it on any SFX, e.g. ones HeyGen's catalog returned with `offset_s: 0`) |

**The payoff lands.** Silence before the payoff, loudest on the payoff. `check` finds the payoff (`--payoff <s>`, else a reveal event or the plan's reveal, else the logo, else the score's `music_arc.payoff_at` from `--score score.json` or the plan); when the score's `payoff_at` differs from the one checked, both are measured (`measures.payoff.arc`, warnings tagged "arc payoff") and measures the music stem (`--music`) or the mix in 100 ms windows. `flat-payoff`: the second from the payoff is not 2 dB (`sound.payoff_lift_db`: a lesson with `--gate sound.payoff_lift_db=<dB>` raises it, and the report names the lesson) louder than the 1.5 s before it and nothing in the 2 s before dips 6 dB under the film's median. Pull the bed out (a stop or a filter dip) 0.3-0.8 s before the reveal and land the reveal on a hit. `loudest-not-payoff`: the loudest second of the film is 3 dB above the payoff and not within it (0.5 s before to 2 s after). The busiest moment is not the loudest; the payoff is. Both are warnings; the numbers are in `measures.payoff`. With no payoff time the check says so and skips.

**The film has a shape.** Two warnings from the lemo-opuscar reference ("at least two real silences; at least two J-cuts or L-cuts"), both only warnings, with the numbers in `measures.shape`. `no-breath`: a film of 20 s or more needs 2 designed breaks, a shorter one 1 (6 s and up); a break is a stretch of 0.25 s or more at least 10 dB under the median momentary level (100 ms windows, so two whole windows), not in the first 0.5 s, not in the last second and not after the last sound; measured on the music stem (`--music`) or the mix, so with a mix under narration the pauses between phrases can count: pass the stem for the real answer. Stop or dip the bed before the reveal and before the story's turn. `no-split-edits` (narrated films, 4+ cuts): a J-cut is a phrase that starts 0.15-1.5 s before a cut and runs past it, an L-cut a phrase that began before a cut and ends 0.15-1.5 s after it; fewer than 2 cuts of either kind and the warning lists the cuts where a phrase boundary sits within 1.5 s and a split edit would fit. Phrases come from word timings (`--words audio_meta.json` with `--scenes`) or, failing that, from the `--vo` stem's speech energy (a pause of 0.25 s or more ends a phrase). Cuts come from `--scenes` (timeline.json), else the plan's `scenes`, else transition / cut / seam events. With no VO stem, no word timings or fewer than 4 cuts the check says so and skips.

## Order in the flow

1. **Music before the storyboard locks.** Otherwise builds land early and reveals late. Run `music.mjs --film <planned length>` at the Music step; the console card shows `mood` (family · BPM · ending · edit shape) and plays `preview`.
2. **After the pick:** `sound.mjs fit --track <picked file> --scenes <scenes.json> --out $RUN/music/plan.json --write-scenes $RUN/scenes.snapped.json`. Use the snapped scene durations for `scenes.mjs`. Record the plan in the decisions: `"music": {"path": "<file>", "title": "…", "plan": "$RUN/music/plan.json"}`.
3. **Before `audio-lock`:** `sound.mjs render --plan plan.json --out videos/<name>/assets/music-bed.wav`, then `video.mjs audio-lock --music videos/<name>/assets/music-bed.wav`. The bed already has the film's length and ending, so assemble-index never loop-extends it (it loops any bed shorter than the film).
4. **After the build, on every route** (the direct path too, and after `fetch-sfx` where the workflow has one): run `sound.mjs sfx-plan` with `--events` from the builder's `## Events` (the real settle and contact times, and every transition with its time) and the score's seams, and mount the cues: replace the frames' SFX cues with its `audio_meta_sfx`. A film with no SFX is usually flat; `sound.mjs check` errors `no-sfx` on a film of 15 s or more unless `audio/direction.json` gives effects no role, the film is silent by choice, or `--silent-by-choice "<reason>"` says so.
5. **After render:** `sound.mjs check --video …`. Problems → fix and re-render (or `master` for loudness alone). Show the result in the render gate.

## The music arc (the music follows the story)

Kinso's music is edited to its story: a soft intro under the pain, a drop after "Meet", a break before the payoff, a riser into it, a hard stop on the logo; its loudness range is 3.0 LU against a flat library loop's 1.6, and every transition that moves has a considered sound or a stated reason for none (a style choice, not a law). The score carries it as `music_arc: { intro_until, drop_at, break: [t0, t1] | null, payoff_at, button_at }` in film seconds (`crew.mjs checkScore` warns `music-arc-missing`):

1. **Intro** (to `intro_until`): soft, under the hook and the agitate, the picture and the viewer's pain carrying it (never a silent start: the first second is at bed level).
2. **Drop** (`drop_at`): the reveal ("Meet <Name>") lands on it. Pass `sound.mjs fit --reveal <the reveal's start>` so `fit` moves the reveal onto the nearest drop or lift.
3. **Break** (`break`): half a beat to a bar of stripped bed before the payoff, so the payoff lands at full level.
4. **Riser into the payoff** (`payoff_at`), when the film's sound direction wants one: a short riser (placed by its measured sync point, see below), then the payoff hit. One payoff earns this; a riser and an impact before every change is a formula (`soundplan.mjs cues` reports it as `riser-impact-formula`).
5. **Button** (`button_at`): a hard stop on the logo, a final hit and a tail of 2 s or less. Pass `--logo <the logo's start>`. A ring-out under the end card is the tell (`ring-out-ending`).

**SFX where a transition that moves earns one, within the existing budget:** a whoosh on a transition that moves through space (the signature moves only), a hit or thud when an object lands, a click on a UI tap, a tick on a counter, an impact on the reveal. A moving seam is offered a sound, not owed one: a hard cut, a hold, `editorial.silent`, and any film whose `audio/direction.json` gives effects no role (or is silent by choice) skip `seam-unsounded`; otherwise it still warns when more than 50% of the non-cut seams have no sounded event. The budget below still caps density: sounded is not everything.

**Better music.** The user's own track comes first (`analyze` and `fit` it to the arc; see "Sources" below for the licence of the library it came from). With a key of the user's own (`RASANAI_ELEVENLABS_API_KEY`, then `RASANAI_STABILITY_API_KEY`), `music.mjs` generates takes to the film's arc instead of searching: one take per mood, the brief written from `music_arc` (genre, 2 to 3 instruments, the BPM, and the structure in seconds and bars: intro, build, drop on the reveal, break, payoff, a hard ending, no vocals), each take analysed, stretched onto the asked BPM when it is within 3%, gated and fitted like any track. Never trust a generator's timing; `analyze` it. Higgsfield's `seed_audio` is a speech model, not for beds.

## Sound direction (Plan 07: sound is planned with the picture)

One small brief per film, `audio/direction.json` (`soundplan.mjs direction --compile`): the role of voice, music, sound effects, ambience and intentional silence; a limited sonic palette (6 ingredients at most) and, when it helps, one motif that returns (named by event id); protected silence windows (each says why: emotional silence is a choice, dead air is an accident); and the deliverable: **silent by choice** (recorded with a reason, complete) is a different state from **audio generation failed** (reported, retried). A film with no voiceover and no music is complete. Not every visual hit gets an effect.

**One cue source.** Authored cues live in `motion/score.json` as `audio_cues` next to `events`, `seams`, `hits` and `music_arc` (older scores' `events[].sound` and `seams[].sound` still read as legacy cues). A cue names a stable event id; film time is derived by `lib/timing.mjs` (`motion/cues.json` is derived like `events.json`), so a retimed scene moves its cues. Each cue keeps SEPARATE: `picture_onset_s`, `speech_word_s`, `intended_offset_s`, `sfx_onset_s` (file start), `acoustic_peak_s` (measured sync point of the file; a clip's loudest sample is not automatically its sync point). Intent is `on_picture`, `anticipate`, `trail` or `synchronous`; a lead or lag is recorded, not rejected. Silence windows are never auto-filled (`sfx-plan` drops candidates inside them and says so).

**Music.** `analyze` and `fit` now label what they know: tempo `detected`, `uncertain` or `undetected` (a failed detection has no BPM, never a made-up 120; edits then land on analysed section starts or by ear), meter assumed, sections estimated. A short track is not looped to fill a film (`fit` guard: `track-too-short`, `endless-loop`); a music-led film is not trimmed without authorization; the user's own track is preferred. The track's rights, edits, gain automation and version go in `audio/music-track.json`; a track swap is a bounded timing impact (`soundplan.mjs track --change`), never a story regeneration; procedural or generated music is not copyright-free until its provenance is recorded.

**Voice.** Narration is the approved copy (`soundplan.mjs voice` binds each line and flags new wording), with a pronunciation glossary of names and terms the user CONFIRMED (an unconfirmed respelling is only a proposal). `voice.mjs speak` keeps a per-line cache (`audio/voice-cache.json`) keyed by text, voice id/provider/model/version, locale, settings and glossary; a local wording change regenerates that line only and reports the genuine timing dependents (the shot's duration goes through `commitTiming`). A replacement keeps its neighbours' pauses (sample rate, channels, lead/trail silence and handles are stored), and a different voice or model invalidates the neighbours' level and pace assumptions. Transcript-vs-script checks say "may" (a transcript is an estimate). Voices are never cloned by default.

**Mix and delivery.** Destination profiles (`soundplan.mjs mix --profiles`): `rasanai-house` (the old -14 LUFS / -1.5 dBTP limit, the default), `ebu-r128`, `atsc-a85`, or a custom one; pick per destination, no number is universal. Ducking is a few dB, merged across short gaps, with a slow release (`duckEnvelope` flags pumping). Silence-only audio has explicit handling (loudness undefined, not a pass). Mono compatibility and phone-speaker readability are listened to in final validation, never claimed from metadata. A mix has a receipt (`audio/mix-receipt-<preview|delivery>.json`) naming its score, cue, direction, contract, stem and automation digests, and a cached mix file is reused only when every digest matches (`soundplan.mjs mix --reuse`); an unchanged filename proves nothing.

**Studio.** `soundplan.mjs controls` is the payload for audition, mute/solo (audition only), permitted music/voice swaps and a one-line sound note; a note becomes a versioned targeted revision with its timing effect (`soundplan.mjs note`, or a Studio `sound-note` action through `console.mjs`). There is no approve-every-cue step.

## Choosing music

Motion drives tempo and articulation; the visual style drives timbre. Describe music the way a music supervisor does: genre + 2-3 instruments + production + BPM + structure + "no vocals". `music.mjs` writes intents this way from `--style`/`--story`/`--format`; write your own with `--intents` when the story asks for something specific.

| Visual family | Timbre / genre | Tempo | Avoid |
|---|---|---|---|
| Swiss / editorial / minimal UI | dry minimal electronic, clean kick, sine bass, one arpeggio | 105-120, tight | piano ballads, choirs |
| Dark tech / neon / terminal | dark synth, analog bass, glitch percussion | 110-128 | orchestral hits |
| Playful flat / pastel | indie electronic, mallets, plucks, marimba, soft drums | 105-120 | ukulele + whistle + glockenspiel + claps |
| Luxury / cinematic / premium | sparse pads, low strings, sub pulse, one piano motif at most | 70-90 | four-on-the-floor builds |
| Brutalist / zine | breakbeat, distorted drums, bitcrushed textures | 130-170 (half-time) | polished corporate pop |
| Retro / Y2K | house, UK garage, FM synths | 120-135 | trailer braams |
| Organic / wellness | acoustic textures, warm pads, light percussion | 80-100 | EDM drops |

| Format | Music's job | Tempo | Arc |
|---|---|---|---|
| Launch 30-60 s | momentum; land the reveal and the logo | 100-124 | hook at 0, lift at the problem→solution turn, drop on the reveal (20-40% in), button on the logo |
| Premium launch | restraint | 80-100 | pad already playing at frame 0, one lift, resolved final chord |
| Explainer with VO | a carpet under speech | 85-110 | flat-ish, small lifts at chapters, nothing melodic at 1-4 kHz while the voice talks |
| Social reel 15-30 s | hook in the first second | 118-140 | starts at a peak, one drop, hard button |
| Kinetic type | a rhythm grid for word hits | 110-130 | steady, builds into the last line |

Pick a tempo so an average scene is 1 or 2 bars: `BPM = 240 × bars_per_scene / avg_scene_s`. Accept ±8% or double/half.

**Never in a query:** corporate, inspirational, uplifting, motivational, positive, happy, success, business, presentation, ukulele, whistle, glockenspiel, "epic trailer", "background music". `music.mjs` strips them and rejects tracks whose title or description carries them.

**A usable track** (analyze's `usable` + fit): steady tempo (beat-interval variation < 4%, or a rigid grid), a strong section of ≥ 8 bars, a real ending or enough length for a head+tail edit, instrumental under VO, licence recorded. Kevin MacLeod tracks are legally easy and instantly recognisable: fine only when that's acceptable.

**Sources, in order** (`music.mjs chain` prints the chain for this environment; each stage runs only while fewer than three usable options exist; a stage with no key or sign-in drops out without a word):

1. **The user's own track** (`--track <file|folder with stems> --library <artlist|epidemic|epidemic-connect|musicbed|soundstripe|envato|uppbeat|pixabay|bensound|own|other> --declared "<licence id or where>"`). Ask where it is licensed; the answer is recorded, never verified, and the licence must be in the video owner's name. **Artlist** allows its assets as inputs to AI services (Pro for paid ads; the Social plan excludes paid media). **Epidemic Sound files are refused**: their licences forbid use "in any third party AI tool"; send the user to Epidemic Connect (their official API / MCP on their own paid plan; set `RASANAI_EPIDEMIC_TOKEN` and pass the downloaded file with `--library epidemic-connect`). **Musicbed** is a grey area (its terms bar operators of generative-AI systems): warn, record, let the user decide. **Bensound** is refused (bans video-generating tools). Soundstripe Personal, Uppbeat Free, Epidemic Creator and Artlist Social do not cover paid ads: say so. A folder with `drums`, `bass`, `melody`, `fx` or `vocals` files is read as stems beside the full mix. The track is only gated for a warning, never rejected.
2. **AI generation to the arc** (ElevenLabs Music, then Stable Audio; the user's own `RASANAI_*` keys only, never a shared or borrowed one). The vendor's plan at generation time decides the licence: LICENSES.json records vendor, model, prompt, request and date.
3. **The curated catalog** (`library/music/catalog.json`, 64 gated tracks, `library/music/README.md` for licences and refresh): 27 CC0 / CC BY files (HoliznaCC0, Loyalty Freak Music, Ketsa, Broke For Free, Tours) fetched on demand and SHA-256 checked, and 37 Mixkit tracks that are never prefetched, bulk-fetched or mirrored (Mixkit's terms forbid it): they appear as `suggestions` and are fetched once, from Mixkit's own URL, when the user picks one (`--pick mixkit-<id>`). Nobody has auditioned the catalog yet: listen before committing.
4. **HeyGen's catalog** (signed in; many tracks are ~30 s, so `music.mjs` asks for 30 results per mood and keeps the ones ≥ film + 4 s).
5. **ccMixter** (query API, rank-sorted, CC BY, instrumental, BPM within 8% of the target; sent with an honest user agent and the track page as Referer).
6. **Openverse**, last and strictest (score ≥ 75; two or more tags, never a title word; medium and long tracks; no "remix", "mix", "DJ", "feat.").

Never: Jamendo's API (its terms allow non-commercial use only and forbid caching), Freesound's API at runtime, Bensound, scraping Pixabay, Uppbeat, YouTube Audio Library, Artlist, Epidemic, Envato, Musicbed or Soundstripe, NC / ND tracks, and SA by default.

**The quality gate** (`music.mjs gate --track <file>`; part of every option's `quality` and `score`). One ffmpeg pass at 44.1 kHz over the track's strong section, every band relative to the track's own level: **sub** (<60 Hz) at -24 dB or louder (references -4 to -11; thin tracks -25 to -40), **presence** (2-6 kHz) at -9 dB or quieter (references -12.5 to -18; harsh above), **air** (>10 kHz) at -42 dB or louder, **bandwidth** (the >16.5 kHz band no more than 25 dB under air: a low-bitrate lowpass), **stereo** side minus mid at -4.5 dB or lower (phasey above; under -20 with a flat loudness range is a near-mono carpet), **punch** crest factor at 8.5 dB or more (references 10-19), **loudness range** at 1.5 LU or more when the track is narrow. Any one trips a reject (a user's own track only warns). The 0-100 soft score then weighs sub, presence, air, width, crest, loudness range, structure (a strong 8-bar section early, a real ending) and the fit's edit shape; shown thresholds are 60 for the catalog, 65 for AI and HeyGen, 70 for ccMixter, 75 for Openverse; options rank by score times the source's prior (user and AI 1.0, catalog 0.9, Mixkit 0.8, HeyGen 0.7, ccMixter 0.5, Openverse 0.3). Calibrated on 9 reference films, 36 Mixkit tracks and the old run6 picks; it hears defects, not taste or amateur composition, which the source order covers.

**Three options, three moods** (warm minimal, driving, airy…): never three takes of one mood; the console shows each as a fitted preview with its licence badge (No credit / Credit needed / Your licence / AI) and lets the user A/B them on the animatic. **Credits:** CC BY needs the credit wherever the video is posted: `$RUN/music/description.txt` holds the paste-ready line (Title, Author, Source, Licence) and `music.mjs credits --pick <id> --description <file>` appends it to the final's description text; offer an end-card credit for ads without a description. Ketsa's line names "Ketsa.uk" (that is what keeps a video claim-free).

## Editing music to picture (what `fit` does)

1. **Analyse:** onset envelope → tempo (autocorrelation) → beats (dynamic programming), locked to a rigid grid when the track is quantised (exact BPM, sub-frame precision) → downbeats (kick + chord changes; a final hit decides when the kick can't) → per-bar energy → sections (novelty on the bar self-similarity plus energy jumps, snapped to 4-bar phrases) → the ending.
2. **Start on a strong phrase bar,** within 6 dB of the loudest section (12 dB for premium/ambient films: `--soft-start`). A slow intro under the hook is the most common tell. Starting mid-track needs only a 10 ms de-click: the music is "already playing".
3. **Choose the edit shape,** most preferred first:
   - **backtimed:** play from a phrase bar straight into the track's own ending. No edits.
   - **head+tail:** play from a phrase bar, jump **forward** once on a bar line into the stretch that holds the real ending. The jump is scored on harmony (chroma), timbre and energy across the splice (the new bar must sound like a plausible successor) and prefers phrase-aligned bars. 25 ms equal-power crossfade starting 15 ms before the incoming downbeat (measured: keeps 85-90% of the attack; 30 ms started 10 ms early kept 60-65%).
   - **own-fade:** backtimed onto the track's mastered fade.
   - **button:** hard stop on a strong downbeat 1.2-2.2 s before the end; the stopped beat rings on as a darkened diffuse tail and a low hit (`button_sfx`) carries the end card.
   - **fade:** 1.5-3 s fade ending on a bar line (last resort).
   - **repeat:** only when the track is shorter than the film: one whole block of ≥ 8 bars plays twice. Always reported as `needs_longer: true`; get a longer track instead.
4. **The film may flex by up to ±1 s** so the music ends on its own ending (the end card absorbs it).
5. **Key moments move to the music:** the reveal to the nearest section start (a drop or lift) within one bar, else the nearest downbeat; the logo lands on the ending hit (or the button downbeat), and its scene opens one bar earlier.
6. **Scene cuts:** to the nearest downbeat when that moves the cut ≤ 0.3 bar, else to beat 3. Not every cut needs to be on the one: 50-70% of structural cuts on downbeats is the usual look of a music-led cut, not a target (`soundplan.mjs music-fit --cuts` only REPORTS where cuts sit, and says nothing when the tempo is undetected); staggers use 1, ½ or ¼ beat. Never add a music edit to buy 0.4 s: extend a hold instead.
7. **Once per film (twice in 60-90 s):** ½ beat to 1 bar of near-silence or a stripped bed right before the reveal downbeat (a volume lane down to 0.05-0.15), so the drop lands at full level.

## Sound effects (what `sfx-plan` enforces)

**Only causal events get a sound:** something that starts, stops, touches or changes state on screen: click/tap/toggle, type (one texture per burst), land/settle (on the settle frame, not the motion start), snap/lock-in, toast/badge, count-up completing, the reveal, the logo lock-up, a signature spatial move (whoosh). **No sound** for fades, dissolves, colour changes, text fading in, parallax, each item of a stagger (first and last only), ordinary cuts, idle loops.

| Budget | VO film | Unnarrated | Reel |
|---|---|---|---|
| Average | ≤ 1 per 2 s | ≤ 1 per 1.2 s | ≤ 1 per s |
| Any 1 s window | ≤ 3 | ≤ 3 | ≤ 4 |
| Hero hits | ≤ 1 per 15 s, ≤ 3 per film | ≤ 1 per 10 s | ≤ 1 per 8 s |
| Whooshes (signature moves only) | ≤ 1 per 20 s | ≤ 1 per 10 s | ≤ 1 per 8 s |
| Share of visual events with a sound | ≤ ⅓ | ≤ ½ | ≤ ½ |

One table (`SFX_BUDGET` in `lib/audio.mjs`) feeds `sfx-plan`, `sound.mjs check` and `slop.mjs` (`sfx-overload`: SFX = every audio source that is not the music bed or a voice, tested on the whole src; add `--format reel` for a reel). `sfx-plan` ranks before it spends: the best remaining cue goes first, discounted for each cue of its own class within 3 s, so the budget spreads over the whole film instead of filling its first seconds; a typing burst (keys under 0.8 s apart) is one cue per line; a declared signature move's whoosh (`"signature": true` on the event) is kept even where the music hits.

**The sample library (`library/sfx/`, CC0, 190 files, about 1.9 MB):** `sfx-plan` picks from it first and falls back to media-use's bundled files only for a kind it has no category for (or with `--no-library` / `--library <dir>`). `index.json` lists every file with `category` (click, press, select, land, drop, snap, whoosh, riser, impact, stinger, tick, notification, swipe, type, plus glitch and error), pack, licence, source URL and the measured sync point; `CREDITS.md` and `LICENSES/` hold the provenance. Packs: six uisfx packs (glass, minimal, studio, soft, cinematic, scifi: one per film, chosen from the scenes file or forced with `--pack glass`, so all the UI sounds of a film share one voice), atomcut motion-essentials and impacts-risers (whooshes, risers, impacts, stingers: synthesised, so `sfx-plan` layers nothing under them and you can add a Kenney impact for body), Kenney Interface and Impact Sounds (recorded foley). Cue kind to category: click/tap/toggle to click, press, select; type to type, tick; land to drop, land; snap to snap; toast to notification; count to tick; reveal to impact; logo to impact, stinger; whoosh to whoosh, swipe; riser to riser. The film's UI pack serves the UI kinds; hits, whooshes and risers come from the atomcut and Kenney packs. Variety: never the file used in the last 3 cues. Every file is mp3, 44.1 kHz, mono, peak-normalised to about -3 dBFS, so the levels below apply across packs; harsh, clipped and silent files were dropped when the library was built (`probe` it again on anything you add). Use the CC0 files freely; never take anything from uisfx `.generated`.

- **Let the music hit it.** Where the bed has a strong onset within ±60 ms, no hero hit, whoosh or ping; UI sounds drop 3 dB. The track's own ending hit lands the logo.
- **Place by the sync point, never the file start:** `start = event − sync_point` (+10 ms). By default the accent lands on the picture (10 ms after) and audio does not lead it (a lead is detectable at 45 ms; 125 ms late is fine). That is the DEFAULT for a transient on a picture event: a cue may carry an intended offset (`anticipate`, `trail`) and is then judged against that target, never against zero; only cues marked `synchronous`, spoken-word highlights and lip movement are held to a hard sync (`lib/cues.mjs`). Hits sync on the transient, swells (risers, whooshes) on the crest.
- **The bundled riser bug:** HyperFrames' manifest says start `riser.mp3` at "climax − 10.03 s"; it actually crests at 3.02 s and is silent after 4.35 s, so the crest would land about 7 s early. Always place risers by the measured sync point (`sfx-plan` does; `probe` any other file).
- **Levels** (clip gain for a file peaking near 0 dBFS): UI micro 0.10-0.20, mid (pop, land, snap, toast) 0.20-0.35, signature whoosh 0.30-0.45, hero 0.40-0.60, never above the voice. The media-use default of 0.35 for everything is too loud for repeated UI ticks.
- **No machine-gun:** rotate 3 variants (pitch 1.0 / +3.5% / -3.5%, gain 0 / -1.5 / -0.8 dB); never the same file and pitch twice within 2 s. HyperFrames' `data-playback-rate` preserves pitch, so variants are pre-rendered (`--project`).
- **Harshness:** > 35% of energy above 5 kHz or > 60% at 2-5 kHz on a > 0.5 s sound means lowpass (9 kHz) or another sample. The bundled `key-press`, `glitch-3`, `sparkle` and `chime` fail this. All UI sounds are lowpassed at 11 kHz and high-passed at 100 Hz; only hero hits own the sub.
- **Tonal SFX** (pings, chimes) belong in the music's key or should be swapped for atonal ones; ≤ 1 per scene.
- **Voiceover:** no SFX transient within ±150 ms of a stressed word (`--words audio_meta.json` moves it 1-2 frames later or drops it).

## Voiceover

- 2.0-2.7 words/s (keynote 2.0-2.3, conversational 2.3-2.7; ≤ 3.0 only in bursts). Words ≤ 2.5 × VO seconds, and VO ≤ 70-80% of the film: leave the hook, the reveal and the last 2-3 s to the music. A 30 s launch film takes ≤ 50 words.
- Sentences of 6-10 words (max 14), one idea each, ending on a full stop. One TTS clip per sentence; gaps of 0.3-0.5 s between sentences, 0.8-1.2 s at turns and before the reveal.
- Spell out numbers, currencies and URLs; respell brand names. Transcribe each clip back and re-roll any line that doesn't match the script word for word.
- Skip VO for reels ≤ 30 s that autoplay muted, kinetic type (the text is the voice), mood reels and beat-synced cuts.

## Sound that follows the picture (spotting)

**Tempo from the picture.** When the film's hit times are known (the score's hits / events / seams, `--hits`, `--events`, or a real `music_arc`'s drop, payoff and button), `music.mjs` scans 70-140 BPM and keeps the tempo whose worst hit sits closest to a beat, measured as a fraction of the beat so a fast tempo cannot win by having more beats; ties go to the style's own range. It writes `<run>/music/hits.json`: the grid, the error per hit and a treatment per hit. A hit more than 60 ms off the grid carries `nudge_ms`: move the picture hit that much, or let the music's own hit lead and give the picture hit an aftermath. `--no-hit-tempo` turns it off.

| Treatment | What the music and the sound do | For |
|---|---|---|
| direct | a music accent and the SFX land on the frame (offset under 40 ms) | landings, the logo, the button, impacts |
| anticipation | the bed pulls back (a rest, a filter dip, a riser) half a beat to a beat before, then the hit lands at full level | the reveal, the payoff, a turn in the story |
| aftermath | the hit speaks alone on the frame; the music answers on the next beat (a swell, a tail, a low hit) | slams, crashes, glitches, shocks |
| no-hit | the picture moves and nothing sounds | fades, dissolves, parallax, text easing in |

Give each hit in the score one of these (`treatment` on the event; the kind picks one when it is missing). Four direct hits in a row is a drum machine; mix the treatments.

**Cuts land on sound.** About 35% of a professional film's cuts fall within 80 ms of a sound onset. `check` warns `cut-onset-share` under 20% (4 or more cuts) and lists the near misses (80-300 ms) with the slide that fixes each: move the cut onto the onset, or the sound onto the cut.

**Text lands before the word.** On-screen text lands 0 to 2 frames before the spoken word (up to 5 for a name reveal): the eye reads faster than the ear, so the word arrives as confirmation. Use `voice.mjs refine` first (below): TTS and whisper word times run 50-200 ms early or late, and the text must be placed against the audible onset. Events that carry a `word` are checked (`text-lands-before-word`): a text that lands after the voice reads late, one more than 2 frames early reads as a different beat.

**SFX around speech and silence.** Foley that sounds inside a spoken phrase (through its word gaps too, not only on a word) is ducked 5 dB by `sfx-plan --words`; an event marked `on_word: true` snaps to the nearest word onset and keeps its level, and any other cue within 150 ms of a word's onset is `sfx-on-word-onset`. A designed break (a 0.25 s stretch 10 dB under the median) is the best place for one dry sound: `sfx-in-break` warns when a film has breaks and no sound in any, and `sfx-plan --bed` notes the cues that fall inside one.

**Audible and clean.** `sfx-buried`: an SFX 26 dB or more under the music in its 0.3 s window (cue file level plus its volume against the music stem) is not heard; raise it 6-12 dB or dip the bed under it. `low-mud`: 0.5 s windows that are 80% or more energy under 300 Hz in 30% of the film, or for 3 s running, mean the voice and the sounds sit in the mud: high-pass the SFX at 100 Hz, cut the bed 2-3 dB at 200-300 Hz under speech. Both are uncalibrated warnings; pass `--music <stem>` for a true reading.

**Sound from continuous curves.** A moving camera has air: its level follows the speed of the move, |d ln zoom / dt|^1.3 (a dive is loud at its fastest, silent when still), and a brush or a drawn line has noise that follows stroke speed. The score exports `curves.json` (`{"curves":[{"id":"zoom","kind":"zoom|pan|brush|shake","points":[[t,v],...]}]}`, film seconds; or `{t0, dt, v:[...]}`) and `sfx-plan --curves` (or `<project>/curves.json`) renders one texture bed per curve into `assets/sfx/rasa/texture-<id>.wav` and lists it in `texture_beds` and `audio_meta_sfx`: volume 0.05-0.12, silent when the picture is still, not a cue (outside the SFX budget). Mount it with a stable id that does not start with `el-sfx-`.

**Pan to the picture.** HyperFrames' effects registry (hyperframes-audio, `fx-registry.md`) has no pan or stereo node, and `data-automation` lanes can only move `volume` and an effect's own params, so a pan cannot be set or automated in the composition. `sfx-plan --pan` therefore bakes it into the rendered cue file instead: an event's `x` (0 left .. 1 right, or px with `--width`) becomes an equal-power stereo file at up to 70% to one side (`<sample>-p<N>.wav`). Opt-in because it is unverified that the render keeps a stereo cue stereo: render one clip and `ffprobe` it before relying on it; a fast move across the screen is a pan the file cannot follow (use it for landings and taps at a fixed x).

**Generated samples and ambience.** When a cue has no library category and no media-use file, and the user's own `RASANAI_ELEVENLABS_API_KEY` is set, `sfx-plan --project` generates one (ElevenLabs sound generation, cached under `assets/sfx/gen/`, `--no-generate` to skip); otherwise the cue has no file and a downgrade is logged. Never a shared key.

**Lock the approved mix.** After the user approves the sound, `sound.mjs lock --video renders/<film>.mp4 --run $RUN` hashes the decoded audio (and a 100 ms level envelope). After every fix round, `sound.mjs check --video <new render> --locked` (warning `audio-changed`, with the windows that moved) proves the fix did not touch the sound; `--note-asked "<the note>"` when a note asked for it (then lock again).

## Voice: take, listen, retake

`voice.mjs speak --run $RUN --script lines.json --voice <id>` records each line, transcribes it back and keeps the best of up to 4 takes: a line passes at 92% of its words matched, no run of 3 dropped or added words, and no non-speech tag ("(laughs)") heard. From the second retake `--respell '{"Name":"phonetic"}'` is applied to the TTS text (the caption keeps the right spelling). A lone-word line has its vowel tail cut 120 ms after the word. Engines: HeyGen (media-use) first; then, only if installed, **Kokoro** (`kokoro-tts` with `kokoro-v1.0.onnx` and `voices-v1.0.bin` already on disk: Apache-2.0 weights, never downloaded silently) and **edge-tts** (Microsoft's online voices, no key, needs the network); the swap is logged as a downgrade because the voice differs from the one the options offered. For a model that takes a description, describe the voice (age, pace, warmth), put IPA in quotes for a hard name, never SSML.

`voice.mjs verify --mix <final.mp4> --script lines.json --meta audio_meta.json --scenes scenes.json` runs the same check on the **final mix**, one transcription per line window: music, a shallow duck or an SFX can bury a word the clean stem passes (`mix-line-wer`, a warning). A window under 2 s is padded with 0.6 s of silence, or whisper skips it.

`voice.mjs refine --audio vo.wav --words words.json` snaps word times to the audible speech (ffmpeg silencedetect): a word that starts in silence moves to the next onset, one that starts just after an onset snaps back to it. Run it before placing text or SFX against a word.

**Speech in the user's footage** gets the cleanup chain: `footage.mjs clean-speech --in <clip>` (high-pass 80 Hz, denoise, gate, mud cut at 250 Hz, presence at 3.2 kHz, 3:1 compression, -16 LUFS), written beside the rushes, the original untouched, the picture copied as is. Speech only, never a music or room-tone track.

## Mix targets (what `check` measures)

| Item | Target |
|---|---|
| Integrated loudness | **-14 LUFS ±1** (-16 for calm VO-led explainers) |
| True peak | **≤ -1.0 dBTP** on the encoded MP4 (limit at -1.5 before AAC) |
| Loudness range | 4-9 LU (VO films 4-7); under 2.0 LU is a flat bed (`flat-dynamics`): a launch with a real arc measures about 3 LU or more |
| Music under VO | **12 LU under the voice** (9-15), measured over the VO spans, not a fixed duck. A -12 dB duck on a quiet bed left music 17 LU under, which is inaudible |
| Music without VO | 2-4 LU under where a voice would sit; the drop may reach it |
| Head | sound by 0.3 s; the first second within 8 dB of the body (unless a premium soft open is intended) |
| Tail | the ending (or the button's tail) reaches the last frame; ≤ 1.5 s of silence; the last 30 ms faded below -40 dBFS |
| Inside | no silence ≥ 0.4 s unless it's a designed music stop |
| Loops | no restart of the track's opening, no verbatim repeat ≥ 12 s at a lag ≥ 16 s |

Ducking: prefer HyperFrames' Voiceover carve (`data-fx-carve`, 0.35-0.8, against a group of VO clips) plus a gentle 3-6 dB lane over a 12-18 dB blanket duck. For a lane: merge VO phrases with gaps < 1.2 s, go down 0.25 s before the first word over 0.3 s, come back 0.4 s after the last word over 0.8 s, and start the lane with an explicit `{t:0, v:1}`.

## Never

- A loop of the bed (HyperFrames' assemble-index loops any bed shorter than the film: render the fitted bed so it never has to).
- A slow intro under the hook; a hard stop mid-bar; a fade that starts mid-phrase; a silent tail.
- A flat bed with no arc under a film that has a reveal; a film of 15 s or more with no SFX at all and no stated reason (silence recorded in the audio direction is a reason); a ring-out under the logo instead of a button.
- A whoosh on every cut; a riser and an impact before every change; a sound on every stagger item; the same click at the same level in a row.
- Harsh, bright UI sounds at the default 0.35; SFX louder than the voice.
- A riser placed by file length; any SFX placed by the file start.
- A quiet first second (unless premium on purpose); a fixed duck amount that buries the music.
- Two different tracks in a film under 60 s.
