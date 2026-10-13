# RasanAI Studio for Mac

Desktop releases are separate from RasanAI skill releases.

## 0.9.0 (build 26) — 2026-10-13

- **Liquid Glass, built for real.** Studio is now built against the current macOS SDK, so macOS Tahoe draws its glass chrome itself instead of an imitation.
- **A native sidebar app.** The window is a system split view with the glass sidebar. It folds and opens with the system's animation, and when it is folded the toggle moves into the top bar beside the window buttons.
- **A proper toolbar.** Back and forward, a glass capsule search and a blue New film button sit in the top bar. The ••• menus are plain white like the other tools, and there is no toolbar band in full screen.
- **A calmer opening.** The window opens frosted and comes into focus as the library loads.
- **The film page is an editor workspace.** One header row, panels on a dark canvas, a filmstrip, and your notes in a right inspector. Every stage publishes its actions to one status bar at the bottom, and its main button has no Return shortcut, so typing a note can never approve a call.
- **New film uses the whole window.** The form takes the full width, and the format tiles are compact, four across. On Home, the format chip opens the format list in a popover.
- **The move viewer fits.** It is as tall as its video, and on Home it covers the window rather than just the Get inspired section.

## 0.8.2 (build 25) — 2026-10-13

- **A calmer, more professional finish.** New film is the one loud action on Home; the Needs you rows use a quiet tinted Review or Open. The Home toolbar is icon-only throughout, with tooltips. Story and Look name Claude's pick once, on the option itself. Welcome keeps the green on the check mark, not the heading, and the Settings note sits left-aligned like System Settings.
- **New film footer is one row:** Discard, "Saved automatically · Directed by Claude Code · Change", and Save draft. Use template, Save as template, Save draft and Discard share one secondary button style that stays visible in light mode.
- **Footage folder copy fixed.** For a launch film the footage well showed the brand-kit prompt ("Your logo, fonts or brand guidelines (optional) It stays where it is…"); it now says "Drop a folder of clips". Brand kits and code folders never speak for the footage well.
- **Reopening at launch** returns to the last film only if you quit while on a film page; otherwise Studio opens on Home.

## 0.8.1 (build 24) — 2026-10-13

- **Move viewer sound fixed.** The expanded viewer could be on screen twice at once, each with its own player, so a clip played twice a few frames apart (an echo) and pausing stopped only one copy. The app now has one player for every viewer: one sound, and pause always stops it.
- **Silent clips say so.** 76 of the 125 reference clips were published without a sound track; the viewer now shows "No sound in this clip" instead of a mute button that does nothing.

## 0.8.0 (build 23) — 2026-10-13

- Bundles RasanAI 1.14.0: reference moves are picked by taste with no fixed roles, placed by Claude on the chosen story's beats, and shown on the style frames with Swap.
- **Moves I like, no fixed roles.** The Hook / Proof / Turn / Call to action slots are gone. The Get inspired tray is "Moves I like": up to four slots, each with an optional place (Opening, Between moments, Big moment, Ending, Anywhere, the default) from a small menu. Briefs carry `moments: [{id, place?}]`; old briefs with a `role` still load (hook becomes Opening, cta becomes Ending, the rest Anywhere). The role stays only as a search hint.
- **Technique filters.** The gallery tabs are now All, New and plain technique groups built from each move's tags (Kinetic type, UI and cursor, Reveals and masks, Transitions, Numbers and counters, Camera and 3D, Collage and photo, Layout and motion, Line and shape, More). Role badges are off the cards.
- **Expanded viewer with sound.** Click a card to watch the move large, with its audio on (cards stay muted). Play and pause, scrub, mute, loop, left and right for the previous or next move, Space, Esc. It shows the name, techniques, why, creator with a link to the original post, length, and Add to or Remove from Moves I like.
- **Moves on the boards.** On the style frames call each frame shows the move placed on it (still, name, why; click to watch), with Swap (one of your moves, any gallery move, or None; sends `swap-moment {frame, id|null}`), and an Unplaced list for moves no frame carries.
- **A calmer prompt box.** The brief's caret and hint now start at the same point and share a font; the box grows with the text (three lines minimum). One toolbar row sits at the bottom: attach and the format chip on the left, compact settings chips (length, shape, motion, brand), a "..." menu with Get inspired, models and pace, and Start film on the right. On a narrow window chips fold into the menu instead of wrapping. Your moves show as a thumbnail row above the toolbar.

- **"What are you making?"** The six-item Kind menu is replaced by a native format picker, in New film (above the prompt) and in the Brief call. Twelve tiles (Launch or promo, Explainer, Brand film, Reel from my clips, Someone talking, and more), each with a one-line description and its options. A pick shows as one chip, "Launch or promo > Feature launch", with the reason it was chosen and a Change button. Options that are not built yet say **Coming soon**, cannot be picked, and offer the closest working option ("Use Product tour"); ones that work with a limit say what the limit is. Feature launch asks "Is this feature for many kinds of uses, or one job?" (or "Not sure"). The pick sets the kind noun, and moves length and shape to the option's defaults unless you already changed them.
- **It guesses, and you can overrule.** In New film the brief's words, a link, or a dropped folder pre-select a format (a folder of clips pre-selects Reel from my clips; green-screen clips pick Presenter), with the reason on the chip; your own pick is never overwritten.
- **Each format asks for the right thing.** The brief box and the footage well use the picked option's own words (a link, a folder of clips, a script, a track).
- The pick is saved as `format {tile, option, scope?}` in `rasanai-brief.json`, sent with the brief submit (with `kind` kept for older directors), and named in the director's request. The catalogue is the installed skill's `library/formats.json`; with no skill found the old kind menu stays.
- **It calls you when it needs you.** A notification (only while Studio is in the background, and only if notifications are on) fires each time a call becomes ready: the brief, the three stories, the three looks, the style frames, the animatic, or any other step that waits on you, with Claude's pick named. The final keeps its own "ready to watch" notice. The Dock badge counts every film that needs you, not just the open one.
- **Home puts Needs you first**, above Get inspired, and each row says what is waiting ("3 stories ready · Claude's pick: Twelve small victories").
- **Next time you are needed.** While Claude works, the status line and the Film progress header say what comes next and about when ("Next: pick a look · in about 8 min"), scaled to the film's pace.
- **One vocabulary.** The stage bar and the progress rail say "Story" (not "Script"); "decide: key frames" and its kin read as plain verbs ("approve the style frames", "pick the music", "choose the clips").
- **Truthful paused and final states.** A paused film reads "Paused at: …" with nothing moving. Before there is a preview the final says "Your turn · render the final", its primary button is "Preview first", and the empty notes list says notes open once the preview exists.
- **Cost is quiet.** The toolbar pill shows tokens; the cost appears on hover, or by itself at 80% of the budget you set.
- **Welcome:** a director you are not using is neutral ("Optional"), not an orange warning, and "Ready" is the Get started button.
- **"Try another angle" is now "Try a different story…"**, with a confirmation that says it costs another pass. Removed the dead pre-native `FilmWorkspace` screen.
- **Folders and reference videos in New film.** Two drop wells under the prompt: **Footage folder** (choose or drop a folder; it is read where it is, never copied, never changed) and **Make it like this** (one reference video, studied and never cut into the film). A folder dropped anywhere on the page becomes a footage folder. Both are saved in the film's brief (`linkedSources`), named in the director's request, and granted read-only to the director (a folder as a readable directory, a video as that one file). Templates do not carry them.
- **Style frames stage.** The Look call's style frames are now a native grid: heroes large, then every beat, each frame with its reference still beside it when the director sent one, its shot (size, angle, hero), the juror's verdict, a Keep or Redo mark and a comment. The primary button reads from the marks: "Approve all 8 frames", or "Redo 2 frames", which sends `redo {ids, note}` with the comments of the redone frames. Commented frames on an approve send their comments as notes first. The older `images` and `captions` payload still renders. Style frames now sit under the Look call on the stage bar.

## 0.7.0 (build 22) — 2026-10-10

- Bundles RasanAI 1.10.0: short films are written by one builder and checked frame by frame before you see them, so they keep moving; one feature and one scenario per launch film; stories that say what they achieve; a faster tempo; real logo files only.
- **Get inspired.** A credited gallery of real launch-film moments on Home and in New film. Filter by role (hook, proof, turn, call to action) and technique, preview on hover, pick up to four, and start a film that moves like them. The finished film lists its references.
- **One status line.** Under the stage bar, one line says whose move it is ("Your turn · confirm the brief", with what Claude does meanwhile, or "Claude is working"). The action bar shows only when you can act; the toolbar pill shows only tokens and cost.
- **The Story step** shows three cards led by what each story achieves, with how it gets there and its tempo.
- Fixes: after you answer, nothing still says it is waiting on you; opening the running film no longer asks you to stop the director; Brand shows the logo file the film will use; "with none" reads "without voiceover".

## 0.6.5 (build 21) — 2026-10-09

- **Updates download behind security proxies.** The update download now waits up to ten minutes for data instead of 60 seconds. On Macs whose security proxy holds a whole download to scan it before sending anything, a fresh update failed with "The request timed out".
- **Update notes are native text.** The update window shows the release notes as plain text from the feed instead of loading the GitHub release page in a web view, so Studio shows no web content at all.

## 0.6.4 (build 20) — 2026-10-09

- **No more flickering text on hover.** Cards, pick cards, look tiles, brand cards and key-frame tiles used to lift, scale or fade their whole content on hover, and shadow it, so text redrew at half-pixel positions and snapped back when the pointer left. Hover now changes only the card's border and shadow behind the content. Pulsing indicators (status dots, building scenes, the stage bar's working ring) animate only their own shape.
- **Scene strip:** in a narrow player (with Decisions open), scene chips no longer overlap; other scenes dim under their labels.
- **Decisions inspector** runs the full window height instead of starting below the stage bar.
- **Cursor:** clicking a highlighted part of the brief no longer leaves the hand cursor stuck; the note crosshair resets the same way.
- **Elapsed time** past an hour reads h:mm:ss (73:10:21), not 4382:34.

## 0.6.3 (build 19) — 2026-10-09

- Bundles RasanAI 1.9.1: branded launch films skip the outside-reference and precedent research and use only the brand's own film, so research is shorter and nothing off-brand reaches the looks.

## 0.6.2 (build 18) — 2026-10-09

- Bundles RasanAI 1.9.0. Launch films for a named brand now study the brand's own films first, or a reference video you attach in New film. Studio shows the brand's measured style in the Brand step, builds every look from that style instead of outside references, keeps launch stories to a simple product-first structure, and checks key frames and drafts against the brand's film before moving on.

## 0.6.1 (build 17) — 2026-10-09

- **Film progress.** While Claude works, the film page is now a live progress view instead of a log. A header names the phase and step ("Plan · step 4 of 8"), the current action in plain words, a running clock and an estimate. An eight-phase rail (Research, Script, Look, Plan, Animatic, Build, Check, Render) shows each phase's time, cost and state, and each phase has its own card: research sources and findings, three scripts and three looks drawn as they arrive, key frames filling in against the number planned, scenes being built with the newest still, critic findings and fixes, and the draft and final render with a progress bar. A timeline below groups what happened by phase, and you can look back at any finished phase. Per-phase tokens and cost add up to the film's reported total. Optional notifications fire once each when the build finishes, when the final is rendered and when research reaches its time box. The five-call stage bar now ticks the decided calls and shows the next call as upcoming with a quiet working ring rather than a misleading current step.
- **Pace: Fast, Standard or Thorough**, in Settings and on each film. **Fast is the default for new films**: about 2 minutes of research and at most 6 sources, one agent per scene with all of them launched at once and no blocking, Sonnet for the hands-on work, and one review round. Standard is about 5 minutes and 15 sources, up to two review rounds. Thorough is the engine's full process. Studio nudges the director if research runs past 1.5 times its budget.
- **No console server.** Studio and the director now talk only through the run folder's files: the app watches `session.json` (the engine rewrites it atomically) and appends each answer to `actions.jsonl` under a lock shared with `console.mjs`. No port, token, `address.json`, event stream or "console down" restart exists in a Studio run, so the "Reconnect" buttons are gone; "Reload film" reads the folder again if its files are ever unreadable. The director launch sets `RASANAI_CONSOLE_HEADLESS=1`, so `console.mjs push/ask/activity/log/reply/resolve/record/wait` work as before and `wait` applies each answer's effects to the session. Films started by 0.6.0 open as before and switch to headless when resumed. The browser console is unchanged for skill-only use.
- Fixes: the newest still is always a real scene frame (never an animator contact sheet), the Plan card knows how many key frames to expect, and "Your film is built" is posted once.

- **Auto-resume.** If the director stops mid-film, Studio resumes it once after about 10 seconds and says so; a second stop within 10 minutes shows the reason and Resume. It never resumes after you press Stop or Pause, a permission or sign-in failure, or while the film is waiting on you. When your Claude plan's limit is reached, the film says when it resets and resumes then if Studio is open.
- **Product-first launch films and a brand lock** come from RasanAI 1.8.0, which Studio bundles: no metaphor concepts for launch and promo films, the real product on screen within 3 seconds, all three looks inside a named brand, and a concept check against your brief before the build.
- Fixes: the header no longer says "Waiting for you" after you answer; the disk image keeps its custom icon; disk images built in CI get the same Finder layout as local ones.

## 0.6.0 beta 1 (build 16) — 2026-10-06

- **The film flow is fully native.** The embedded web console is gone: every stage of a film is now a SwiftUI screen in the film window. Brief, Script (three scripts as tabs and a script table of timed beats), Look (three looks and Browse all styles), Animatic (key frames on a timeline with the music, and timed notes you pin to moments), Build (scene-by-scene progress) and Final (the render with scene markers, notes and versions) all follow the director live. There is no web view in the app.
- Native panels for the rest of the engine's steps: brand, footage, reel (footage and cut), scenes, music, voice, motion, transitions, storyboard, keyframes and plan.
- **The brief you write in New film is carried over.** Studio hands it to the director and the Brief stage opens already filled in, so you are never asked for it again. Your attached files and options come with it.
- **Decisions inspector** (⌥⌘D): every call Claude made and why, in a native side panel, credited to who made it.
- **Tell Claude** (⌘K) is a native bar with conversation threads: ask for a change at any stage and follow Claude's replies.
- **Questions from Claude are native sheets**, with the optional notification and Dock badge. Dismiss one and it stays as a card on the stage.
- **Just make it**: Claude decides every remaining call (script, look, animatic and the minor steps) and stops only at the Final for your review.
- **Director monitor.** The film toolbar pill shows the director's live state (Working, Thinking, Waiting for you, Quiet, Possibly looping, Exited) with live tokens and cost, for example "Working · 182k tokens · $1.42 est.". Click it for the Director panel: tokens breakdown, reported versus estimated cost, turns, tool calls, recent events, Pause, Stop and Tell Claude, and a loop warning. Film Queue rows show each film's state, tokens and cost. An optional per-film budget warning lives in Settings, and finished films show "Made with N tokens · $X est.". Codex on a ChatGPT plan shows tokens with "Included in your ChatGPT plan".
- Studio talks to the director through the run's local, authenticated console API on 127.0.0.1 with live updates. The director stays the only writer of the session, so `console.mjs wait` and the agent workflow are unchanged.
- The download is now named `RasanAI-Studio-<version>.dmg` (for example `RasanAI-Studio-0.6.0.dmg`), with its checksum in `RasanAI-Studio-<version>.dmg.sha256`. Older releases keep their old file names.

## 0.5.0 beta 1 (build 15) — 2026-10-05

- New film is now a single prompt box: the brief, attached files and every option (length, shape, motion, brand) as chips, with Start film inside the box.
- Choose which Claude models direct a film. The default, Opus 5.5 + Sonnet 5.5, has Opus direct, write and animate while Sonnet takes research and routine jobs to save usage. Opus only, Sonnet only, or the Settings model are one click away. Saved with each film and applied to queued and resumed runs.

## 0.4.0 beta 1 (build 14) — 2026-10-05

- See where every film is: a stage bar (Brief, Script, Look, Animatic, Final) on each film, and stage dots with length, shape and last-updated on Home cards. A "Needs you" section lists films waiting on you or needing attention, and the library sorts by Recent, Name or Status.
- Readiness checks now run automatically when you start a film. The sheet appears only when something blocks, with "Recheck and start". Welcome shows rendering tools status with a Set up… shortcut.
- "Start when free" queues a film when the director is busy. Edit waiting queued films and drag to reorder the queue.
- Finished films have one "Request changes" flow with timed notes ("Add note at 0:12"), sent as a single revision. The review console is still available.
- A live director log with a readable Activity view, auto-follow and Copy log.
- Export: Share… (AirDrop, Messages, Mail), and burn captions into the picture (SRT/VTT) for MP4 exports.
- Error alerts show only relevant actions. Film Queue moved from Command-Shift-Q (macOS Log Out) to Command-Shift-K; Templates is Command-Shift-T.
- New app icon on Apple's macOS icon grid, with more room around the mark.
- New branded drag-to-install disk image with a background, laid-out icons and a first-launch tip. The READ ME file is no longer inside the disk image; COMMUNITY-INSTALL.md remains a release asset.

Validation: Swift build and tests (25 run, 1 skipped, 0 failures), runtime driver test, snapshot rendering, a real caption burn-in test, and disk image verification and code signature checks. Manual end-to-end feature tests with a real provider and installed-version Sparkle upgrade testing were not done for this beta.

## 0.3.1 beta 1 (build 13) — 2026-10-05

- Prepare missing FFmpeg/ffprobe, HyperFrames, its render browser and design resources inside the readiness screen. Choose downloads, see live setup activity/logs, cancel safely and recheck readiness automatically after success, cancellation or failure.
- Install rendering tools in a private user-owned Studio folder, keeping the signed app and film folders untouched. Verify executables before publishing their paths, preserve completed installs on cancellation and block director/queue starts while setup runs.
- Open Apple's command line tools installer when Git is needed for design resources. Offer bundled Node when a custom override is broken; require Node 22+ for the current renderer.
- Add rendering setup entry points in Welcome and Help; stop setup before quitting and prevent overlapping installers across Studio instances.

Validation: compilation, JavaScript syntax and local bundle signature checks. Manual feature tests, live tool installations and installed-version upgrade testing were skipped for this beta at the maintainer's request. Existing GitHub checks run separately.

## 0.3.0 beta 1 (build 12) — 2026-10-05

- Check director sign-in, Node, FFmpeg/ffprobe, renderer/browser availability, source access, folder writes, saved review state and free space. Recheck from Home, film/editor menus and the queue; block launches on required failures before starting a director.
- Export and import `.rasanaiproject` Finder packages with sources, compositions, rendered films and review history. Relocate local references, assign imported films a new identity, omit connection tokens/jobs/logs/action queues/caches, and publish completed transfers without overwriting existing projects. Show progress, cancellation and Finder/open controls.

- Queue films to run one at a time with reorder, pause, remove and stop controls. Advance only after successful exit and a published finished video; preserve review gates, paused/failed runs and queue entries across relaunch.
- Preview attached footage, audio, images and documents with native thumbnails, playback, duration, dimensions and file sizes in the editor and Files sheet.
- Save reusable film templates with brief, brand, length, shape and motion level; use, rename or delete them without copying source files. Confirm before replacing an existing brief.

- Browse and export other films, prepare and save drafts, and manage inactive projects while the director keeps working. A persistent control returns to the running film without replacing its session.
- Edit brand colours, fonts, name and logo inside the app with a live preview. Preserve existing design notes and save the previous design as `DESIGN.previous.md`.
- Native final review shows version history, published changes and addressed notes, with historical video previews when available and requests to revise or restore through the director.
- Export the original render or an MP4 up to 1080p/720p, optionally deliver SRT/VTT captions alongside it, and show the saved destination. Existing caption files are preserved under separate names.
- Use the native navigation Back button; remove the duplicate custom chevron. Keep Command-[ and add Command-Shift-H for Home.
- Automatically retain unfinished film briefs, options and selected source references between editor visits and app launches. Home offers Continue draft; saved projects and original files are kept when discarding editor changes.
- Install or sign in to a director visibly in Terminal, recheck readiness, and verify sign-in again before launching or resuming a film.
- Show the actual startup step, elapsed time and latest director activity. Offer log and pause controls when progress is quiet, and specific recovery advice for known sign-in, usage-limit, file-permission and missing-tool failures.
- Add provider-free draft persistence, launch readiness and failed-director recovery tests, plus snapshots for the new states.

Packaging validation: release compilation and bundle/archive integrity checks. Feature tests and installed-app update testing were skipped for this beta at the maintainer’s request; real-provider generation remains unverified.

## 0.2.0 beta 1 (build 11) — 2026-10-04

- Redesigned from the ground up: Home with your films, a one-page New film, and a Film page that shows the right thing for its state (brief, live workflow, or finished video). No sidebars; back button and a help button on every screen.
- Brands: keep colours, fonts and logo as a `DESIGN.md` folder and pick one for any film.
- One-screen Welcome, two-tab Settings, one-time director consent instead of a toggle per film, and a calmer indigo theme in light and dark.
- Automatic update checks every 5 hours.
- `--snapshot <dir>` renders the main screens to PNG for review.

## 0.1.1 beta 2 (build 10) — 2026-10-04

- The director launch prompt now carries a separate creative contract: engine templates, presets and gates are a floor, not a ceiling, and the director writes compositions by hand when a tool's slots are too narrow.
- New Film has a Motion graphics level (Maximal default, Balanced, Minimal). Footage projects get a FOOTAGE REEL brief asking for overlays, framed shots with descriptions, caption boxes and graphic transitions throughout; resumed runs keep the same direction.

## 0.1.1 beta 1 (build 9) — 2026-10-04

- Fix the installed-app launch crash in build 7: CLI SwiftPM's generated resource accessor searched the app root and a CI-only checkout path, while the resource bundle was packaged in Contents/Resources. Resolve installed resources directly for both build layouts; missing sample data now shows an error instead of trapping.
- First-launch setup, a guided New Film wizard with provider-free saved drafts, and explicit director consent.
- Search/sort projects, rename display names, archive, duplicate as a fresh draft, reveal and recoverable Trash actions.
- Import/drop sources into managed project copies, reveal, replace and remove them without changing originals.
- Accurate activity states, optional generic notifications, local-console reconnect, resume and log controls.
- Adaptive windows/panels, Open Recent, keyboard shortcut help and optional last-workspace reopening.
- Add resource-layout regression tests and a provider-free relocated-app startup check. Real-agent generation and broad UI coverage remain unverified.

If build 7 crashes before opening, it cannot reach Sparkle. Download build 9 manually and replace the old app in Applications; project data is outside the app bundle.

## 0.1.0 beta 1 (build 7) — 2026-10-04

- Create individual projects in Documents/RasanAI, or select another library.
- Open native Settings with Command-comma; configure Claude Code and OpenAI Codex, storage, appearance, Node and update preferences.
- Launch/resume local director CLIs with restricted permissions by default, managed stop/quit behavior and private project logs.
- Use the complete existing console in WebKit, or the partial SwiftUI review layout, with native clarification sheets, final-video playback and export.
- Install an Apple Silicon DMG with bundled engine/Node and EdDSA-authenticated Sparkle updates.
- Keep project enumeration off the main thread so slow Documents storage does not freeze the interface.

Community beta limitations: macOS 14+, Apple Silicon only, ad-hoc signed and not Apple-notarized. First installation may require explicit macOS approval; managed Macs may prohibit it. Agent CLIs, FFmpeg and HyperFrames/browser dependencies remain external. Real-agent film generation and full route/revision/failure-recovery parity have not been verified through this app. No provider was called for release testing.
