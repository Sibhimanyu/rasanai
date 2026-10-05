# RasanAI Studio for Mac

A SwiftUI Mac studio with a WebKit-backed full engine console and Sparkle 2.10.0. [Download the community beta](https://github.com/Sibhimanyu/rasanai/releases/tag/studio-v0.3.0-beta.1). Build 12 (0.3.0 beta 1) adds autosaved drafts, a film queue, source previews, reusable templates, native brand editing, version/revision controls, export options, preflight checks and portable projects. If an old build cannot open (build 7 crashed at launch), manually replace it with the new DMG. Requires macOS 14 or newer; building from source also requires Xcode's Swift toolchain. Community packages target Apple Silicon and are ad-hoc signed, not Apple-notarized. Real-agent generation and complete workflow parity remain unverified.

## Build and launch

From this directory:

```bash
bash scripts/build-app.sh
open "dist/RasanAI Studio.app"
```

Use `bash scripts/build-app.sh release` for an optimized build. Open `Package.swift` in Xcode to develop the package, or run `swift run RasanAIStudio`. The packaging script assembles a local, ad-hoc signed `.app`; it is not a notarized distribution build.

## The app

RasanAI Studio is one window that drills down: **Home** → **New film**, **Film page** or **Brands**, with a back button and no sidebars. The theme is RasanAI indigo and follows the system appearance. Every screen has a `?` help button, and Help menu items mirror it.

- **Home**: a New film tile (⌘N) and a grid of your films, most recent first, each with a one-line status (Draft, Director working, Waiting for you, Finished). Right-click a film to open, rename, duplicate, show in Finder, archive or move to Trash. Archived films sit behind "Show archived". Brands is a toolbar button; Open Run Folder (⌘O) is in the File menu.
- **New film**: one page with a title, "What's it about?", an optional drop zone for footage, images and documents, and Length, Shape, Motion graphics (Maximal by default, Balanced, Minimal) and Brand options. Save draft creates a project without calling a provider; Start film (⌘↩) launches your director. You confirm once per director that RasanAI may use your Claude Code or Codex account; there is no per-film consent. Briefs are stored in `rasanai-brief.json`, and chosen files are copied to `assets/sources` without touching the originals.
- **Film page**: depends on the film's state. A draft shows its brief with Edit and Start film. A running or reviewing film shows the engine console full-bleed, which is the whole workflow (brief, story, look, animatic, final review), with a status pill in the toolbar. A finished film shows a native player with Export…, Show in Finder and Make changes. If no console is running you get Resume and Show log. The ⋯ menu has Pause/Resume director, Show log, Files, Reconnect and Show in Finder; Files adds, reveals or removes managed source copies while the director is idle. Questions from the director appear in the console, with an optional notification and Dock badge.
- **Brands**: a brand is a plain folder, `<library>/Brands/<name>/`, holding a `DESIGN.md` (colours, typography, motion) plus an optional logo. Create one from a blank template or by importing a `DESIGN.md`; cards show swatches, font and logo. Choosing a brand for a film copies its `DESIGN.md` into the project (an existing different one is kept as `DESIGN.previous.md`) and its logo into `assets/brand/`, which the engine already uses as the film's brand.
- **Welcome**: a single first-launch screen that checks for Claude Code and Codex, shows how to install a missing one, and records consent when you press Get started. Reopen it from Help → Show Welcome.
- **Settings** (⌘,) has two tabs. General: library folder (default `~/Documents/RasanAI`), appearance, notifications, and update checks. Director: Claude Code or Codex, executable path, model, sign-in status with guided Terminal setup, and an Advanced section for unrestricted tools, the Node path and a custom executable.
- **Sample film**: Help → Explore a Sample Film opens a silent 45-second animatic with native artwork to try the review screens without a provider. It is never shown on Home.
- **Updates**: Sparkle checks automatically every 5 hours (`SUScheduledCheckInterval` 18000) and once at launch; turn it off in Settings → General. Check for Updates… is in the app menu. Updates apply only to releases built with updates enabled.

### 0.3.0 beta 1 usability improvements

The editor automatically retains the title, brief, options and selected source references when you leave or quit. Home offers **Continue draft**. Source files are copied into the project only on **Save draft**, **Start film** or **Add to queue**; keep the originals available until then. **Discard changes…** clears editor recovery without deleting a saved project or original files. A partially created project is remembered after a failed save or launch so retrying uses the same folder.

Welcome and Director settings offer **Install…** or **Sign in…**, which open setup visibly in Terminal. New CLIs install into `~/.npm-global`, without modifying the signed app bundle or requiring sudo. Right-click a director in Welcome to copy its setup command. Return and press **Recheck** after completing setup. Start becomes available after a successful sign-in check, and the runtime checks again before launch or resume. You can still explore the studio without signing in.

Startup shows the current preparation step and elapsed time. While the director works, a strip above the review console shows its latest activity, elapsed time, log details and Pause. After two minutes without a new activity update, it suggests checking the log; this does not imply a render has failed. Unexpected exits with recognized failure messages show recovery advice and Resume. Unrecognized failures keep the log available instead of guessing a cause.

You can browse and export other films, prepare and save another draft, edit brands and manage inactive projects while a film runs. The active director keeps its own connection and published state. A bar at the bottom returns to the running film or pauses it. Starting a second director and modifying the active project's files remain unavailable until it is paused or finished.

**Edit brand…** opens a native editor with hex colours/color pickers, font names and installed-font selection, logo replacement/removal and a live preview. It preserves other design notes, checks for outside edits, and keeps the previous design as `DESIGN.previous.md`. Films already created from that brand keep their existing copy.

Finished films show published version history, change descriptions and addressed notes. Historical videos can be previewed when their paths are published. Restore requests and written revisions go through the existing director/console workflow; the app does not change live session files itself.

**Export…** offers the original render, MP4 up to 1080p, or MP4 up to 720p. Optional SRT/VTT captions are saved alongside the video, with a separate filename if captions already exist. The export sheet shows progress and the completed destination with **Show in Finder**. Original renders are retained when exporting a resized video.

**Queue** on Home (Command-Shift-Q) shows films waiting for the director. In the editor, **Add to queue** saves the project and source copies, then starts it when the director is free. Films run sequentially and still wait for your reviews. The next item starts only after the director exits successfully and the session publishes a finished video with a `done` status. Errors and stopping a film pause the queue. **Pause queue** lets the current film continue; **Stop film** stops it and retains its saved run. Move waiting films earlier/later or remove them; removing an item keeps its project. Queued briefs and sources are held until you remove the item. Queue entries, selected director/model and permission choices are persisted. Sign-in is checked at launch; unrestricted tools also require the current Settings opt-in. After quitting/relaunching, use **Resume queue** explicitly. Keep the app open for automatic advancement.

Attached files show native thumbnails, file size, media duration and image/video dimensions where readable. Click the thumbnail, filename or eye button to preview. Footage/audio use native playback; images and documents use Quick Look. This is available before saving in the editor and for copied files in **Files…**.

**Templates** on Home stores reusable briefs and film options. Choose **Save as template…** in the editor, then **Use template** for a later film. Rename and delete templates from the library. Applying a template asks before replacing an existing brief/options and keeps the film name and files. Missing brands are reported so you can choose a replacement. Source files and provider sign-in are not part of a template.

**Check readiness…** is available in Home’s More menu, the Film menu, the editor toolbar and the queue. It checks director sign-in, Node.js 20+, bundled tools, FFmpeg/ffprobe, npx, renderer/browser/design resource availability, source readability, writable storage, saved run validity and free space. Missing required tools, unreadable sources/folders, invalid saved state and less than 1 GB of free space block launch. Less than 5 GB is a preparation note; larger films may need substantially more. Renderer/browser/resources that can be installed on demand are preparation notes with copyable setup commands. Checks never install tools or download anything. Availability does not guarantee renderer compatibility or successful generation. Start/resume/queue launches run the local checks again before creating a run or invoking the director.

**Export Project…** is in a Home card’s context menu and the Film menu. Pause the film before packaging its active project. Save a new `.rasanaiproject` Finder package outside the original folder. It includes sources, composition files, exports, frame packets and native run history. Local connection tokens, jobs/logs, action queues, hidden configuration and dependency caches are omitted. External files must be attached into the project first; project-internal links are rejected rather than followed.

Use **File → Import Project…**, Home’s More menu, or open the package from Finder to create a separate film in the current library. Choose a new name; import never merges into an existing film. Local absolute references in JSON and common project/composition text are relocated, source asset bytes are preserved, and the imported project gets a new identity. Imported review actions are cleared so they can be submitted again; provider accounts and running consoles are not transferred. Import does not execute project code or start a director. Review the film, check readiness, then resume with your own account. Project-specific external links, fonts and dependencies may still need setup on the destination Mac.

Transfers show byte progress and support cancellation. Complete content is published by an exclusive rename; failed/cancelled transfers remove only their staging folder, leaving originals and existing destinations intact. Quit cancels and waits for an active transfer before closing.

Navigation uses the native Back chevron once. Command-[ goes back; Command-Shift-H returns Home.

To open a run folder at launch:

```bash
open "dist/RasanAI Studio.app" --args --run /absolute/path/to/workspace/.rasanai/run-name
```

### Snapshot harness

`open "dist/RasanAI Studio.app" --args --snapshot /absolute/output/dir` renders the main screens offscreen at 1120 × 740, in light and dark, to PNGs (`home`, `home-empty`, `new-film`, `film-draft`, `film-finished`, `brands`, `brand`, `welcome`, `settings-general`, `settings-director`, each with a `-dark` variant), then exits. It uses seeded fake data in a temporary folder, never your library, and needs no Screen Recording permission.

Additional snapshots cover `home-recovered-draft`, `editor-recovered-draft`, `film-starting`, `film-progress` and `film-recovery`. Authentication checks use local executable fixtures and never invoke provider CLIs in snapshot mode.

## Engine boundary

The app reads the existing session schema and the run's `address.json`. It connects only to `127.0.0.1`, sends the console's session cookie and token header, reads `/api/state`, and posts to `/api/action`. The console remains the only writer of live `session.json` and `actions.jsonl`, preserving `console.mjs wait`, comment resolution, and the existing agent workflow. Opening a run does not consume any agent actions.

The app can launch or resume your installed director CLI, supervise its process group and display local logs. It uses the bundled engine, the selected project and the exact existing run, without updating the signed bundle. Claude defaults to acceptEdits; Codex defaults to workspace-write. Unrestricted tools require an explicit Settings opt-in and can access files outside the project. Provider charges may apply. Missing dependencies or permissions must be reported, never counted as a successful render. Real-agent film generation has not yet been verified through this app.

The Film page embeds the existing engine console with a nonpersistent WebKit store and authenticated loopback requests. Every specialized workflow remains available there, rather than being mapped to native screens. External links open in the system browser; files use native chooser/save panels. The native review views remain only for the sample film.

The app is not App-Sandboxed. Local asset resolution rejects remote URLs, escaping symlinks and private run files. The console also blocks director logs/job files from asset serving. Credentials remain with the provider CLI. [Community installation](COMMUNITY-INSTALL.md) documents the free-account distribution limitations; the [desktop changelog](CHANGELOG.md) tracks Studio releases separately from skill releases.

## Community packaging and updates

```bash
STUDIO_VERSION=0.3.0 STUDIO_BUILD=12 bash scripts/build-community.sh
STUDIO_TAG=studio-v0.3.0-beta.1 bash scripts/generate-feed.sh
```

Use a new increasing build number each time. The build script downloads a pinned, checksum-verified official Node distribution, bundles engine/Node/Sparkle, verifies bundle integrity, and creates a DMG with an Applications link and installation notice. It refuses to overwrite a DMG. Existing app builds are preserved in `dist/previous-build-*.app`.

The update public key is in Info.plist. The matching private key is stored under the `rasanai-studio` account in the local login Keychain; it is not exported or committed. Back up that key securely yourself: without Developer ID, losing it can prevent future trusted updates. Generating an appcast requires approving Sparkle's Keychain prompt locally. No paid Apple account is needed for EdDSA signing. The feed generator stages only the current matching DMG in `dist/releases/<tag>/`; older archives in `dist` are never advertised under a new tag. Use a new desktop tag for each release.

Updates are disabled in development/candidate builds unless `STUDIO_ENABLE_UPDATES=1` is set during bundling. Published community builds opt in after the isolated install/relaunch smoke test; verify the signed release assets and live feed before announcing downloads. Keep desktop `studio-v…` releases separate from skill releases; publish the verified DMG/checksum assets first, then deploy its appcast to `docs/studio/appcast.xml`. Never point a stable desktop feed at GitHub's generic latest skill release. `studio-release-candidate.yml` produces test artifacts only; it does not publish unvalidated builds or store private signing credentials in CI.

If local endpoint protection prevents packaging disk images from unmounting, leave those images intact and use the GitHub Actions **Studio community release candidate** workflow. It uses the same Swift 6 Apple Silicon runner as native CI. Set version and build; enable the explicit updates input only for a validated public release. The artifact includes the verified DMG, checksum and bundled `release-info.plist`. Confirm the architecture, build number, update flag, HTTPS feed and public key before signing. Do not disable endpoint protection or force-unmount images.

Sign the downloaded archive locally with Sparkle's `sign_update --account rasanai-studio <archive.dmg>`; approve its Keychain prompt on your Mac. The output provides the enclosure's public signature and byte length. Put those exact values, the increasing bundle build, minimum macOS version and immutable release URL in the appcast. This avoids mounting the archive locally just to generate metadata. Verify the signature against the bundled public key before publishing, and verify it again on a fresh public download. The private key stays in Keychain, never in GitHub Actions. See [Sparkle's publishing guide](https://sparkle-project.org/documentation/publishing/).

## Verification

```bash
swift test
bash scripts/smoke-app.sh "dist/RasanAI Studio.app"
```

Core tests cover scene boundaries, numeric scene IDs, final marker durations, partial sessions, notes, address validation, and local asset containment. Resource regression tests cover both CLI SwiftPM's flat bundle and Xcode's macOS bundle. The startup script launches a relocated, signed app for 15 seconds with a disposable library and no provider invocation. Test the actual distributed DMG's copied app too: build 7's generated resource accessor worked in a checkout but crashed after installation. Missing sample resources now show an error instead of a fatal trap. The optional HTTP integration test exercises a real disposable console, including comment → apply → approve and the action queue. From the repository root:

```bash
smoke_run="$(mktemp -d "$PWD/.context/mac-console.XXXXXX")"
cp apps/macos/Sources/RasanAIStudio/Resources/sample-session.json "$smoke_run/session.json"
node skills/rasanai/scripts/console.mjs serve --run "$smoke_run" --root "$PWD"
(cd apps/macos && RASANAI_TEST_RUN="$smoke_run" swift test)
node skills/rasanai/scripts/console.mjs stop --run "$smoke_run"
```

Only point `RASANAI_TEST_RUN` at a disposable run: the test submits real actions.

### Isolated Sparkle installation smoke test

`bash scripts/prepare-update-test.sh` copies a candidate into a disposable `.context/sparkle-upgrade.*` fixture, changes both copies to the separate `com.rasanai.studio.updatetest` identity, and signs a build 5002 DMG for an installed build 5001. Approve the official appcast generator's Keychain prompt locally if requested. This tests full-archive installation, not delta updates or public HTTPS delivery.

Before opening the installed test app, set that test identity's `projectRoot` preference to the fixture's `library` directory. Never use your normal project library for this test. Serve its `feed` directory with `node scripts/test-update-server.mjs /absolute/fixture/feed`, then open `installed/RasanAI Studio.app`, create a test project, change a preference, and select Settings → Runtime → Check for Updates. Install and relaunch; verify build 5002, the project manifest, and preferences. Stop the loopback server afterward. Keep the fixture as evidence until the test is reviewed.

The fixture intentionally uses HTTP on localhost only. Production bundling still requires an HTTPS feed. Never upload this test archive or feed, and do not run multiple fixed-port test fixtures simultaneously.
