# RasanAI Studio for Mac

Desktop releases are separate from RasanAI skill releases.

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
