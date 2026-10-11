# Sound: music, SFX, voiceover and the mix

Claude decides the sound craft; the user only picks the track (by ear, in the console) and hears the result. This page is the playbook. Everything measurable is measured by `scripts/sound.mjs` (pure Node + ffmpeg/ffprobe: no Python, no npm).

The one rule behind all of it: **the picture flexes, the music doesn't.** Scene lengths are code, so scenes snap to the track's bars. The music is never chopped to fit arbitrary scene times, and it is never looped.

## Commands

| Step | Command | What it gives |
|---|---|---|
| Find tracks | `music.mjs --run "$RUN" --film <s> [--style "<words>"] [--story "<words>"] [--format launch\|explainer\|reel\|kinetic\|brand\|premium] [--narrated] [--intents "a\|b\|c"]` | 2-4 tracks of different moods, each ≥ film + 4 s, analysed and fitted. `preview` is the fitted bed (play that, not the raw file); licences go to `$RUN/music/LICENSES.json` |
| Analyse | `sound.mjs analyze --track <file>` | BPM, bars, per-bar energy, sections (intro/lift/drop/peak/breakdown/outro), strong sections, start candidates, ending (`ring-out`, `stop`, `decay`, `fade`, `cut`), loudness, `usable` + problems |
| Fit | `sound.mjs fit --track <file> --scenes <scenes.json\|timeline.json> [--film <s>] [--reveal <s>] [--logo <s>] --out plan.json [--write-scenes scenes.snapped.json]` | The edit plan (below), the film-time bar grid, the reveal and logo moved onto the music, scene starts snapped to bars. `needs_longer: true` when the track can't fill the film without a repeat |
| Render | `sound.mjs render --plan plan.json --out <project>/assets/music-bed.wav` | The edited bed, -14 LUFS integrated, true peak ≤ -1.5 dBTP. Mount at volume 1.0 unnarrated, about 0.2 under a voiceover |
| SFX | `sound.mjs sfx-plan --scenes <timeline.json> --plan plan.json --bed <bed.wav> [--events events.json] [--words audio_meta.json] --project <dir>` | Cues for causal events and for the score's seams that move, inside the budget, placed by each sample's measured sync point; pitch variants rendered into `assets/sfx/rasa/`; `audio_meta_sfx` ready for `audio_meta.json`. Runs after the build on EVERY route (narrated or not, direct path included) |
| Check | `sound.mjs check --video renders/<film>.mp4 --film <s> [--vo <stem>] [--music <stem>] [--sfx index.html\|sfx-plan.json] [--plan plan.json\|--events events.json] [--silent-by-choice "<reason>"]` | Exit 2 with fixes when loudness, peaks, head/tail, dropouts, loops, the VO gap or SFX density are off, and `no-sfx` (a film of 15 s or more with zero SFX cues, unless `--silent-by-choice`). Warnings: `flat-dynamics` (the bed's LRA under 2.0 LU) and `ring-out-ending` (music still audible more than 1.0 s after the last logo or cta event; a button ending is preferred) |
| Master | `sound.mjs master --video in.mp4 --out out.mp4` | Post-render loudness fix (static gain + true-peak limiter; the picture is copied untouched) |
| Probe | `sound.mjs probe <sfx files>` | Sync point, lead silence, audible end, harshness (use it on any SFX, e.g. ones HeyGen's catalog returned with `offset_s: 0`) |

## Order in the flow

1. **Music before the storyboard locks.** Otherwise builds land early and reveals late. Run `music.mjs --film <planned length>` at the Music step; the console card shows `mood` (family · BPM · ending · edit shape) and plays `preview`.
2. **After the pick:** `sound.mjs fit --track <picked file> --scenes <scenes.json> --out $RUN/music/plan.json --write-scenes $RUN/scenes.snapped.json`. Use the snapped scene durations for `scenes.mjs`. Record the plan in the decisions: `"music": {"path": "<file>", "title": "…", "plan": "$RUN/music/plan.json"}`.
3. **Before `audio-lock`:** `sound.mjs render --plan plan.json --out videos/<name>/assets/music-bed.wav`, then `video.mjs audio-lock --music videos/<name>/assets/music-bed.wav`. The bed already has the film's length and ending, so assemble-index never loop-extends it (it loops any bed shorter than the film).
4. **After the build, on every route** (the direct path too, and after `fetch-sfx` where the workflow has one): run `sound.mjs sfx-plan` with `--events` from the builder's `## Events` (the real settle and contact times, and every transition with its time) and the score's seams, and mount the cues: replace the frames' SFX cues with its `audio_meta_sfx`. A film with no SFX is flat; `sound.mjs check` errors `no-sfx` on a film of 15 s or more.
5. **After render:** `sound.mjs check --video …`. Problems → fix and re-render (or `master` for loudness alone). Show the result in the render gate.

## The music arc (the music follows the story)

Kinso's music is edited to its story: a soft intro under the pain, a drop after "Meet", a break before the payoff, a riser into it, a hard stop on the logo; its loudness range is 3.0 LU against a flat library loop's 1.6, and every transition has an SFX. The score carries it as `music_arc: { intro_until, drop_at, break: [t0, t1] | null, payoff_at, button_at }` in film seconds (`crew.mjs checkScore` warns `music-arc-missing`):

1. **Intro** (to `intro_until`): soft, under the hook and the agitate, the picture and the viewer's pain carrying it (never a silent start: the first second is at bed level).
2. **Drop** (`drop_at`): the reveal ("Meet <Name>") lands on it. Pass `sound.mjs fit --reveal <the reveal's start>` so `fit` moves the reveal onto the nearest drop or lift.
3. **Break** (`break`): half a beat to a bar of stripped bed before the payoff, so the payoff lands at full level.
4. **Riser into the payoff** (`payoff_at`): a short riser (placed by its measured sync point, see below), then the payoff hit.
5. **Button** (`button_at`): a hard stop on the logo, a final hit and a tail of 2 s or less. Pass `--logo <the logo's start>`. A ring-out under the end card is the tell (`ring-out-ending`).

**SFX on every transition that moves, within the existing budget:** a whoosh on a transition that moves through space (the signature moves only), a hit or thud when an object lands, a click on a UI tap, a tick on a counter, an impact on the reveal. Every seam in the score that moves carries an event with a sound, or has a reason not to (`seam-unsounded` warns when more than 50% of the non-cut seams have no sounded event). The budget below still caps density: sounded is not everything.

**Better music.** The user's own track comes first (`analyze` and `fit` it to the arc). When the `higgsfield` CLI is available, generate a track to the arc rather than searching a library (`seed_audio`): describe the genre, 2 to 3 instruments, the BPM and the arc with its seconds ("118 BPM, soft pads and a muted pluck for the first 9 s, full drop at 9.2 s, a one-bar break at 20.4 s, a riser, a hard stop at 23.4 s, no vocals"), then run `analyze` and `fit` on the result like any track. This is an option, not a requirement: no new tooling, the library search below remains the default.

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

**Sources:** HeyGen's catalog (via media-use, signed in; many tracks are ~30 s, so `music.mjs` asks for 30 results per mood and keeps the ones ≥ film + 4 s), then Openverse (CC0/CC BY only; CC BY needs the attribution string in the video description), then a few verified Mixkit/Incompetech links. The user's own track always works: run `analyze` and `fit` on it.

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
6. **Scene cuts:** to the nearest downbeat when that moves the cut ≤ 0.3 bar, else to beat 3. Not every cut needs to be on the one: aim for 50-70% of structural cuts on downbeats; staggers use 1, ½ or ¼ beat. Never add a music edit to buy 0.4 s: extend a hold instead.
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

- **Let the music hit it.** Where the bed has a strong onset within ±60 ms, no hero hit, whoosh or ping; UI sounds drop 3 dB. The track's own ending hit lands the logo.
- **Place by the sync point, never the file start:** `start = event − sync_point` (+10 ms). Audio must never lead the picture (detectable at 45 ms early; 125 ms late is fine). Hits sync on the transient, swells (risers, whooshes) on the crest.
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
- A flat bed with no arc under a film that has a reveal; a film of 15 s or more with no SFX at all; a ring-out under the logo instead of a button.
- A whoosh on every cut; a sound on every stagger item; the same click at the same level in a row.
- Harsh, bright UI sounds at the default 0.35; SFX louder than the voice.
- A riser placed by file length; any SFX placed by the file start.
- A quiet first second (unless premium on purpose); a fixed duck amount that buries the music.
- Two different tracks in a film under 60 s.
