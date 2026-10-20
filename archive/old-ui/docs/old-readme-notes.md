# OLD README paragraphs (OLD UI)

OLD UI — not used by RasanAI Studio or the website. Kept only for reference. Do not import, link or ship anything from here.

Archived 2026-10-20. These paragraphs described the previous Studio UI (drill-down window with no sidebar, five-call stage bar, phase rail, snapshot harness, two-tab Settings panel). They were replaced in the live READMEs by the sidebar / seven-step rail / crew-stage description.

## apps/macos/README.md: intro paragraph (release history, old UI mentions)

A fully native SwiftUI Mac studio with Sparkle 2.10.0. [Download the community beta](https://github.com/Sibhimanyu/rasanai/releases/tag/studio-v0.6.0-beta.1). Build 17 (0.6.1) adds a native Film progress view (a phase rail, per-phase cards, a timeline, time, cost and estimates), a Pace setting (Fast by default, Standard, Thorough) and a file-based connection to the director with no console server. Build 16 (0.6.0 beta 1) replaces the embedded web console with native screens for every stage of a film (Brief, Script, Look, Animatic with timed notes, Build, Final, and panels for brand, footage, reel, scenes, music, voice, motion, transitions, storyboard, keyframes and plan), carries your New film brief over so you are never asked for it again, and adds a Decisions inspector (⌥⌘D), Tell Claude (⌘K) with conversation threads, native question sheets and Just make it (Claude decides every remaining call and stops only at the Final). It also adds a Director monitor: a live state, token and cost pill in the film toolbar that opens a Director panel. Build 15 (0.5.0 beta 1) turns New film into a single prompt box with a model selector: Opus 5.5 + Sonnet 5.5 by default, or Opus only, Sonnet only or your Settings model. Build 14 (0.4.0 beta 1) added a stage bar on every film, a "Needs you" section on Home, automatic readiness checks, "Start when free" queueing, one "Request changes" flow with timed notes, a live Activity log, Share and burned-in captions, a new icon and a branded installer. Includes guided rendering setup, draft recovery, a film queue, source previews, templates, native brand editing, revision/export controls and portable projects from build 12. If an old build cannot open (build 7 crashed at launch), manually replace it with the new DMG. Requires macOS 14 or newer; building from source also requires Xcode's Swift toolchain. Community packages target Apple Silicon and are ad-hoc signed, not Apple-notarized. Real-agent generation and complete workflow parity remain unverified.

## apps/macos/README.md: window description

RasanAI Studio is one window that drills down: **Home** → **New film**, **Film page** or **Brands**, with a back button and no sidebars. The theme is RasanAI indigo and follows the system appearance. Every screen has a `?` help button, and Help menu items mirror it.

## apps/macos/README.md: Home bullet (Brands as a toolbar button)

- **Home**: a New film tile (⌘N) and a grid of your films, most recent first, each with a one-line status (Draft, Director working, Waiting for you, Finished). Right-click a film to open, rename, duplicate, show in Finder, archive or move to Trash. Archived films sit behind "Show archived". Brands is a toolbar button; Open Run Folder (⌘O) is in the File menu.

## apps/macos/README.md: Settings bullet (two tabs)

- **Settings** (⌘,) has two tabs. General: library folder (default `~/Documents/RasanAI`), appearance, notifications, and update checks. Director: Claude Code or Codex, executable path, model, sign-in status with guided Terminal setup, and an Advanced section for unrestricted tools, the Node path and a custom executable.

## apps/macos/README.md: 0.4.0 stage bar paragraph

Every film shows a stage bar (Brief, Script, Look, Animatic, Final); Home cards show stage dots with length, shape and last-updated. **Needs you** on Home lists films waiting on you or needing attention, and the library sorts by Recent, Name or Status.

## apps/macos/README.md: Film progress paragraph (phase rail, five-call stage bar)

The Film page is fully native; there is no web view. Studio follows the run through its files: it watches `session.json` for live updates and appends your choices, notes, answers and Tell Claude messages to `actions.jsonl`. While Claude works, the **Film progress** view replaces the activity feed: a header (phase, step, current action, clock, estimate), an eight-phase rail (Research, Script, Look, Plan, Animatic, Build, Check, Render) with per-phase time, tokens and cost, a card for each phase, and a timeline. It reads the director's log, the session and the project folder, so it also works for a finished film. The five-call stage bar above it ticks the calls already decided and marks the next as being worked on. Each stage is drawn from that state, the director's own `screenFor` routing is mirrored so Studio shows the stage the director is on, and the brief from New film is seeded into the run so it is not asked again. Files use native chooser/save panels and external links open in the system browser. The sample film uses the same native views.

## apps/macos/README.md: Snapshot harness section

### Snapshot harness

`open "dist/RasanAI Studio.app" --args --snapshot /absolute/output/dir` renders the main screens offscreen at 1120 × 740, in light and dark, to PNGs (`home`, `home-empty`, `new-film`, `film-draft`, `film-finished`, `brands`, `brand`, `welcome`, `settings-general`, `settings-director`, each with a `-dark` variant), then exits. It uses seeded fake data in a temporary folder, never your library, and needs no Screen Recording permission.

`RasanAIStudio --snapshot-stages <dir> [--only story,look]` renders every native film stage from fixture sessions (`SnapshotFixtures.swift`), light and dark.

Additional snapshots cover `home-recovered-draft`, `editor-recovered-draft`, `film-starting`, `film-progress` and `film-recovery`. Authentication checks use local executable fixtures and never invoke provider CLIs in snapshot mode.

## README.md (root): Native Mac studio paragraph

A SwiftUI studio is available as an [Apple Silicon community beta](https://github.com/Sibhimanyu/rasanai/releases/tag/studio-v0.2.0-beta.1): a simple drill-down app with Home, a one-page New film (⌘N), Brands kept as `DESIGN.md` folders, a fully native Film page that follows the director through every stage, with a finished-video player, two-tab Settings (⌘,), local Claude Code/OpenAI Codex setup, and update checks every 5 hours. Build 11 is a full redesign. Requires macOS 14+. The DMG is ad-hoc signed and **not Apple-notarized**; first installation is subject to Gatekeeper approval. Provider-free tests and relocated-app startup checks pass; real-agent generation and complete workflow parity remain unverified. See the [Mac guide](apps/macos/README.md), [community installation notes](apps/macos/COMMUNITY-INSTALL.md), and [readiness audit](apps/macos/READINESS.md).

## docs/guide.html (line ~549): Your director, in the studio

Every stage is a native SwiftUI screen, from Brief and Script through Look, the Animatic with timed notes, Build and Final, with native panels for footage, cuts, brand, music and more.
