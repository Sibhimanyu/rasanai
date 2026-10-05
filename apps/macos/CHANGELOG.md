# RasanAI Studio for Mac

Desktop releases are separate from RasanAI skill releases.

## Unreleased

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
