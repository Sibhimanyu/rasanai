# RasanAI Studio for Mac

A SwiftUI Mac studio with a WebKit-backed full engine console and Sparkle 2.10.0. [Download the community beta](https://github.com/Sibhimanyu/rasanai/releases/tag/studio-v0.1.1-beta.2). Build 10 adds the director creative contract and a Motion graphics level; build 9 fixed the installed build-7 startup crash; manually replace the old app if it cannot open its updater. Requires macOS 14 or newer; building from source also requires Xcode's Swift toolchain. Community packages target Apple Silicon and are ad-hoc signed, not Apple-notarized. Real-agent generation and complete workflow parity remain unverified.

## Build and launch

From this directory:

```bash
bash scripts/build-app.sh
open "dist/RasanAI Studio.app"
```

Use `bash scripts/build-app.sh release` for an optimized build. Open `Package.swift` in Xcode to develop the package, or run `swift run RasanAIStudio`. The packaging script assembles a local, ad-hoc signed `.app`; it is not a notarized distribution build.

## First milestone

- Native project sidebar, five review stages, Director's desk, and a scene timeline with scrubbing and playback.
- A clearly labelled 45-second sample animatic with native artwork. It is silent; music and voice labels illustrate a brief and do not claim to be attached audio. Sample notes persist in `~/Library/Application Support/RasanAIStudio/sample-session.json`.
- Story and Look comparison views, brief editing for connected runs, time-specific notes, director messages, choices, approvals, and version requests using the existing console API.
- Open a run folder (or its `session.json`) with Command-O. Recent folders are remembered. Published stills, the animatic's music/mixed audio, and finished local videos are loaded from the run's declared workspace. A finished video can be played and copied through the native export panel.
- Read-only offline review when a console is unavailable. Reconnect after starting the console. Updates poll every two seconds and follow the director when its current step changes.

To open a specific run at launch:

```bash
open "dist/RasanAI Studio.app" --args --run /absolute/path/to/workspace/.rasanai/run-name
```

## Native settings and local projects

### Usability additions (0.1.1 beta)

The current source adds a first-launch Welcome/Setup guide (also in Help and Settings), and a three-step **New Film** flow: brief, source files, then director consent. The first step sets a **Motion graphics** level (Maximal by default); the director is told that engine defaults are a floor, not a ceiling, and footage projects are briefed to use overlays, framed shots and caption boxes throughout unless you choose less. Save Draft does not launch a provider. Briefs are stored in `rasanai-brief.json`; explicitly selected sources are copied to `assets/sources` without moving or overwriting originals. Custom agent executables remain configurable but cannot start a film without a compatible adapter.

Projects supports search, recent/name/creation sorting, thumbnails, display-name rename, archive/unarchive, duplication as a fresh draft with assets/audio/brief, and confirmed Move to Trash. Display-name rename leaves the folder unchanged. Duplicate drafts exclude run history, credentials, generated compositions and exports. Library modifications are disabled during an active director; imported external runs are not managed or moved.

Drop source files onto a project card, the Assets source area, or the New Film wizard. Assets supports reveal, replacement and confirmed removal of managed copies; previous copies go to Trash. New references added to an existing run must be mentioned in the director's next message. File replacement/removal is disabled while the director may be using them.

The activity banner distinguishes working, awaiting an answer/review, stopped, offline, finished and errors without inventing percentage estimates. Settings → General can enable generic, opt-in macOS notifications for questions and director exit; no brief or source content is included. Error dialogs offer Settings, local-console reconnect, resume and logs when applicable. Reconnect starts only the loopback console, not a provider agent.

Smaller windows (minimum 820 × 560), adaptive/collapsible panels, File → Open Recent, Help → Keyboard Shortcuts, and optional last-project/run reopening are included. Sidebar: Control-Command-S; inspector: Option-Command-0. On compact windows, panel buttons open sheets. Automated local tests and relocated-bundle startup checks pass; broad UI/provider testing remains incomplete.

Settings opens through the standard macOS app menu and **Command-comma**. General contains project storage and System/Light/Dark appearance. Agents discovers Claude Code/OpenAI Codex, configures model and executable, and checks CLI sign-in without collecting credential output. Copy Sign-in Command hands browser login to the provider CLI. Other local executables can be checked, but need an adapter before they can direct a film. Runtime contains Node selection, dependency instructions and Sparkle preferences. Changes apply to the next director launch.

The app creates `~/Documents/RasanAI` on first launch. **Command-N** opens New Film and creates a named project with `assets/`, `audio/`, `compositions/`, `exports/`, `.rasanai/`, and a manifest when you save/start. Existing folders are not merged or overwritten. Settings can select another library without moving existing files. Start Film launches a director after account/tool-use confirmation; Open returns to the project's latest app-managed run, or its draft brief if none exists. Imported runs stay in place. Project enumeration and opening run session data happen off the main thread.

## Engine boundary

The app reads the existing session schema and the run's `address.json`. It connects only to `127.0.0.1`, sends the console's session cookie and token header, reads `/api/state`, and posts to `/api/action`. The console remains the only writer of live `session.json` and `actions.jsonl`, preserving `console.mjs wait`, comment resolution, and the existing agent workflow. Opening a run does not consume any agent actions.

The app can launch or resume your installed director CLI, supervise its process group and display local logs. It uses the bundled engine, the selected project and the exact existing run, without updating the signed bundle. Claude defaults to acceptEdits; Codex defaults to workspace-write. Unrestricted tools require an explicit Settings opt-in and can access files outside the project. Provider charges may apply. Missing dependencies or permissions must be reported, never counted as a successful render. Real-agent film generation has not yet been verified through this app.

Full Workflow embeds the existing engine console with a nonpersistent WebKit store and authenticated loopback requests. Every specialized workflow remains available there, rather than being incorrectly mapped to one of five native screens. Questions also appear as native sheets. External links open in the system browser; files use native chooser/save panels. The optional SwiftUI review layout remains partial: Look posters rather than HTML playback, mixed-audio playback, and a brand-kit placeholder. Use Full Workflow for complete engine controls.

The app is not App-Sandboxed. Local asset resolution rejects remote URLs, escaping symlinks and private run files. The console also blocks director logs/job files from asset serving. Credentials remain with the provider CLI. [Community installation](COMMUNITY-INSTALL.md) documents the free-account distribution limitations; the [desktop changelog](CHANGELOG.md) tracks Studio releases separately from skill releases.

## Community packaging and updates

```bash
STUDIO_BUILD=11 bash scripts/build-community.sh
STUDIO_TAG=studio-v0.1.1-beta.2 bash scripts/generate-feed.sh
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
