# cooked., in RasanAI

RasanAI adapts algorithms and constants from **cooked.** by NextWork (https://github.com/nextwork-projects/ai-video-editor-cooked), read at commit `3b236ec8fe32343cdf38375df90f6cd71e0846d7`, under the MIT License (Copyright (c) 2026 NextWork; see `LICENSE` in this folder). The code was ported from Python to Node.js and modified by RasanAI; nothing was copied verbatim except `LICENSE` and `NOTICE`. Each adapted file names its upstream path, function and lines in its header comment. The upstream notice is kept in `NOTICE`.

| Here | From | Used by | Mode |
|---|---|---|---|
| `scripts/lib/cutkinds.mjs` | `creator-teardown/scripts/visual.py` `block_median` L85-90, `hist_jump` L93-96, `best_scale` L99-117, `candidates` L120-130, `analyse` L133-169, `cut_kind` L178-219, `zoom_block` L375-394 | `lib/deconstruct.mjs` part `kinds` | adapted code |
| `scripts/lib/refprofile.mjs` | `format_check.py` `features` L69-97, `diffs` L108-133, `group` L161-206; `match.py` `near` L192-193, `rules` L197-233 | `research.mjs profile`, `profile-compare` | adapted code |
| `scripts/lib/reflook.mjs` | `look.py` `spoken` L169-176, `find_captions` L179-224, caption/face medians L828-890 | `lib/deconstruct.mjs` part `look` | adapted code |
| `scripts/lib/retakes.mjs` | `cut/scripts/retakes.py` constants L56-67, `phrases` L76-84, `clauses` L127-138, `same` L111-114, `similar_openings` L145-154, `restarts` L157-201, `alt_hooks` L207-234, `loose_like` L264-273, `find` L282-335; `textnorm.py` `norm` L35-41, `SPOKEN_SAME` L27-29, `canon_src` L49-87 | `footage.mjs retakes` | adapted code |
| `scripts/lib/cutplan.mjs` | `build_timeline.py` `edge` L141-149, `snap_and_pad` L160-178, `merge` L416-431, `enforce_splice_budget` L457-479, `kept_frames` L498-522, `window_rms_db` L200-210, `derive_noise_db` L312-331, `in_speech` L530-533; `splice_check.py` L27-69 | `footage.mjs cut-plan`, `reel.mjs` `type:"cut"` | adapted code |
| `scripts/lib/heads.mjs` | `style-edit/scripts/face.py` `head_box` L42-48 | `footage.mjs faces`, `reel.mjs` preflight | adapted code |
| `scripts/lib/framecheck.mjs` | `style-edit/scripts/check.py` `face_cover` L563-571 (rule rewritten for Apple Vision; warning only) | `reel.mjs check-frames` | rewritten |

Rows for files not yet merged are planned until the docs package confirms them.

Not taken: the Remotion renderer and templates (`plugins/ai-editor/remotion/`), the HyperFrames-derived material under `remotion/` (Apache-2.0), Robust Video Matting (GPL-3.0), YuNet, RapidOCR, faster-whisper and CrisperWhisper weights, the Gemini, ElevenLabs and Modal integrations, the Python review server and HTML pages, fonts, icons, audio and any measured third-party films.

Modes: **adapted code** = the algorithm and its constants ported to Node, in our structure; **rewritten** = the rule restated in our own code; **idea only** = read, nothing ported (see `SOURCES.md`).
