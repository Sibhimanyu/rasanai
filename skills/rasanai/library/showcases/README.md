# Showcases: breakdowns of how motion tells the story

Ten reference films (all made with Claude), broken down line by line. Text only: no frames or files are copied here.
Each JSON is one film: `id, title, kind, duration_s, arc, world, actor, lines[], techniques[], lessons[]`.
Every on-screen line has a row: `t` (seconds, +-0.5 s, read from 4 fps contact sheets), `line` (the words), `show` (what the motion does that means the line, which element, how the words touch the UI/objects), `built_from` (product UI / actor / type / object / photo), `handoff` (what carries into the next line and what changes in place).

Use them to ask, for any new film: what is the one world, what is the one actor, and for each line, what does the motion do that the words alone could not?

| id | kind | s | one-line shape |
|---|---|---|---|
| red-editorial-grid | brand | 21 | single-word ladder on one hairline grid, photos only inside cells |
| tiago-eye-intro | intro | 11 | the 'o' of 'Your' falls and becomes the iris; role word swaps in place |
| claude-motion-reel | reel | 15 | one word (DECISION) pushed through ten motion materials |
| lilium-specimen | specimen | 7 | catalogued flower; crops and flower take letter slots |
| sovra-fm-launch | launch | 52 | pill swaps songs/feeds/loops and swells to rings; one create flow; orb host |
| kinso-launch | launch | 46 | notification stack splits 'somewhere'; UI window grows from the caption |
| pixel-object-manifesto | manifesto | 20 | ring of pixel objects speaks the words; objects spell LOVE |
| google-ask-search-anything | launch | 87 | one stem 'Ask it to ...' with a swapped word per demo |
| openai-refreshed | brand | 110 | one dot becomes caret, circle, type system, logo, palette, photo |
| mexicat-upping-my-pdoom | essay | 157 | lyric video, a literal visual world per line, refrain number climbs |

Timings are approximate. Where a word was unreadable at contact-sheet scale the breakdown says what is visible rather than guessing (for example the exact words of the second LIVING GEOMETRY / STUDIES block in lilium-specimen).

A row marked `"space": "3d"` is a line the reference shows in real 3D (WebGL-type): chrome blobs and particle spheres, wireframe corridors and a black hole, a 3D creature and laptop, tilted glowing UI panels, a rotating sphere of dots. Rows without it are 2D.

## The cross-clip principles

1. **One actor carries the film.** A single persistent element is promoted, reused and spent: OpenAI's dot (caret, circle, logo, swatch, ember), Kinso's coral orb, Sovra's orb and pill, Tiago's orange iris-dot, the pixel ring, Claude reel's red dot, mexicat's ember. Pick it before the script.
2. **The word and the object touch.** The idea is the collision, not the label next to it: the notification stack splits "somewhere" (Kinso), the "o" of "Your" falls and is the eye (Tiago), the caret dot types "What can I help with?" (OpenAI), the pill is the word "Same songs" (Sovra), the camera is the verb "action." (pixel).
3. **Hold the frame, swap the word in place.** One slot, one changing word: "songs -> feeds -> loops" in the pill (Sovra), "Creative [Producer/Director/Designer/Editor/Partner]" (Tiago), "Ask it to [guide / research / shop / get things done]" (Google), "Type it -> Say it -> Snap it -> Film it" (Google), "Type it -> Stream it" (Sovra), "OpenAI -> Chat -> ChatGPT -> Sora" (OpenAI). The still half makes the swap read.
4. **A carrier sentence turns a list into a ladder.** Repetition of a stem with one varying word gives rhythm and lets each demo prove its word (Google "Ask ...", mexicat's refrain "I'm upping my P(DOOM)" with a new number each time, red-grid single nouns on one grid).
5. **Real UI is the scenery; the line is the caption of the UI state.** Sovra (queue, prompt box, progress ring, upload pill), Kinso (inbox that grows out of "for every conversation", draft email), Google (tilted results sheets with edge glow). Type the actual prompt, tick the actual progress, press the actual button with a cursor.
6. **The type rides the thing it describes.** Words follow a path or object: the loss curve carries "sudden drop", the fuse carries "we lit the fuse", the spiral carries "accelerating" (mexicat); the pen scribble writes the question (pixel); the iris reveals "Creative" (Tiago); the karaoke ball reads "busy person" (Kinso); "Artificial general intelligence ..." steps down a staircase over the coastline (OpenAI).
7. **Construction before form: draw it, then fill it.** Hairline guides, handles, crops, selection boxes and spec drawings appear before the solid shape (OpenAI circle and GPT outlines, Lilium handles and Surface_01-04, red grid lines, Claude reel's selection box on FRAME, mexicat's polar grid before the unicorn). The build is the story of craft.
8. **Camera and container morph are the transitions.** No cross-dissolves: dive into the O of NOW and arrive in the black hole (mexicat); bar -> arc -> square -> circle -> pill for Type/Say/Snap/Film (Google); a bar becomes the logo (Kinso); a dot swells into a disc and then a photograph (OpenAI); a cell shrinks to a point (red grid). Each handoff says what carries and what changes.
9. **Spend colour and weight like a budget.** One accent and one word coloured at a time: Google's single coloured word per phrase, red only on grid lines and heavy type until a photo cell opens, orange only on the thing that is "live" in mexicat, light/bold weight pairs for constant/changing words (Tiago). Alternate grounds (paper / black) to reset the eye (Claude reel, Lilium, mexicat).
10. **Escalate, then resolve small.** Density builds (DECISION wall -> dot grid -> particle sphere -> torus; the OpenAI poster wall; P(DOOM) 0.02 -> infinity -> NaN) and the end is a single quiet hold: CLAUDE with a red period, the G, SOVRA.FM with a verb swap, kinso.ai, OpenAI typed in black, the STILLNESS HORIZON lockup, or a loop back to the first frame (mexicat). The ending reuses the actor.

11. **Space is a technique.** The references go 3D when the line is about space, scale or many things at once: a black hole for "singularity", tilted panels for "research", a rotating sphere of dots for "everything you ask" (OpenAI's own "Refreshed."), a wireframe corridor for "trapped". Even a flat brand film can: the style goes flat (matte or unlit, palette colours, even light), not the use.

## How to use

- Before scripting a launch: read `sovra-fm-launch`, `kinso-launch`, `google-ask-search-anything` for how a product line becomes motion; copy the shape (problem -> meet -> features -> cta), not the look.
- Before a brand or manifesto film: read `openai-refreshed`, `red-editorial-grid`, `pixel-object-manifesto`.
- Before an essay or lyric film: read `mexicat-upping-my-pdoom` for the "literal world per line" rule.
- For every film, write the `lines` table (line, show, built_from, handoff) first; a line with no `show` is a slide, not a film.
