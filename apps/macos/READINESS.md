# Native Mac release readiness

Audit date: 2026-10-04. Verdict: **experimental community beta; installed build-7 startup crash reproduced and fixed for build 9**. The user accepted the unverified paths below for an explicitly labeled experimental beta, not a production-ready or full-parity release.

## Build 9 startup regression

The actual GitHub build-7 DMG crashes after copying its app out of the disk image. The fatal error names `resource_bundle_accessor.swift`: native CLI SwiftPM searches `<app>/RasanAIStudio_RasanAIStudio.bundle` and a CI-only `.build` path, while packaging places the resource in `<app>/Contents/Resources/`. A locally compiled Xcode/Swift Build variant searches that packaged location, masking the public-artifact defect. Strict code-signature checks passed on the crashing bundle, demonstrating why signature verification alone is insufficient.

`StudioResources` resolves both flat CLI and macOS/Xcode resource layouts directly without invoking the fatal generated accessor. Missing or malformed sample resources fall back to a safe UI state and an error. Three resource regression tests pass. All 22 Swift tests pass when the disposable HTTP console is enabled, and supervisor exit/stop tests pass with no provider calls. Relocated optimized app startup passes for both build-system layouts; deliberately removing the sample bundle no longer terminates the app. `scripts/smoke-app.sh` fails on the old downloaded bundle with exit 133 and checks a relocated signed app for 15 seconds.

Local checks run on Apple Silicon macOS 26.6.2; they do not establish macOS 14/15 compatibility, complete UI usability or provider generation. A crashing build 7 cannot invoke Sparkle; replace it manually using the fixed download, leaving the external project library intact. The earlier beta-1 delivery checks below are historical evidence, not a claim that its installed app worked.

[Candidate run 37204171462](https://github.com/Sibhimanyu/rasanai/actions/runs/37204171462) built app source `128fcf297dbdc6ddfbe020458d0fb9a1f522571c` as version 0.1.1/build 9 with updates enabled. Its downloaded DMG passed filesystem/SHA-256 checks and deep strict code-signature verification. The app copied from that exact archive passed the relocated 15-second launch check, unlike build 7. The 64,913,350-byte archive's Sparkle Ed25519 signature verified against its embedded public key; one-byte tampering was rejected. The existing Keychain identity signed it without a new approval prompt. No private key was exported.

## Historical beta-1 delivery audit

[RasanAI Studio 0.1.0 beta 1 (build 7)](https://github.com/Sibhimanyu/rasanai/releases/tag/studio-v0.1.0-beta.1) is public. Its immutable Apple Silicon DMG is 64,635,011 bytes, SHA-256 `ce8d8ebb5c1035a1c1fed9e8741e58b6e079e1625694460b92dab3de594dc3ef`. [Candidate CI run 37195469183](https://github.com/Sibhimanyu/rasanai/actions/runs/37195469183) built source `f6625427056723fccd5bdb9ade73548c74b216f4`, passed native/supervisor tests, verified the packaged bundle and disk image, and recorded the bundled configuration. Build 7 enables Sparkle with automatic checks off. The local signing key never left Keychain. A fresh anonymous HTTPS download matched the checksum, byte length and Ed25519 signature; the published appcast asset matched the source XML exactly. A one-byte-tampered in-memory archive was rejected. The stable feed is `https://sibhimanyu.github.io/rasanai/studio/appcast.xml`; it will become available when these docs land on master and the Pages workflow succeeds. This is archive-delivery verification, not a separately compiled public installed-version upgrade test.

## Current implementation after release-preparation work

- SwiftUI Settings, individual Documents projects, agent executable/model selection, CLI sign-in checks, and restricted-by-default agent permissions.
- App-owned Claude/Codex director launch/resume, a process-group supervisor, stop/quit confirmation, private local logs, and latest-run reopening. Custom CLIs still require an adapter.
- Full engine console inside nonpersistent WebKit, with loopback-only in-app navigation, authenticated API actions, native file dialogs and native question/consent sheets. This preserves specialized engine controls but is not a full SwiftUI rewrite of them.
- Sparkle 2.10.0, Check for Updates, update preferences, a stable desktop feed URL and public EdDSA trust key. Development candidates keep update checks disabled until the feed and update path are validated.
- Bundled engine, checksum-verified official Apple Silicon Node, Sparkle framework/helpers and license notices; DMG packaging with Applications link, checksum and a prominent unnotarized-installation notice.
- Separate candidate-build CI and local Keychain-backed appcast generation. No private keys were exported or added to the repository.
- Fixed a reproduced startup freeze by moving project enumeration off the main thread. A slow/unavailable Documents provider still needs user attention; it no longer blocks the sample or Settings.

Verification: 19 Swift tests passed (17 core/bridge + 2 runtime/settings), including a disposable real HTTP console and supervised director exit with a non-provider fixture. Supervisor stop/exit tests passed. The full existing engine self-test suite passed. The community DMG's filesystem checksum and nested bundle signatures verified. These tests do **not** establish real-agent film generation or an installed-version Sparkle upgrade.

Validation results and remaining production-readiness work:

1. **Passed:** Keychain-backed appcast generation signed both local candidate DMGs. Their Ed25519 signatures verified against the public key embedded in the app, archive lengths matched, and one-byte-tampered in-memory copies were rejected. This does not establish installation or notarization.
2. **Local installation smoke test passed:** Sparkle downloaded a Keychain-signed DMG, installed test build 5002 over 5001, and automatically relaunched it. The resulting bundle passed strict signature verification. The native-created project manifest retained its SHA-256; the library location, Light appearance, Codex selection, restricted-tools setting and recent run survived. Both versions use the candidate's compiled code with isolated bundle identity/version metadata, no delta updates, and a loopback HTTP feed. Public HTTPS/GitHub archive delivery is now verified as described above; an upgrade between separately compiled product versions remains unverified. The stable Pages feed deployment is pending.
3. Run a real short film through the app with the user's approved provider account, including dependency/permission handling and final render. The user declined provider usage for this testing round, so only local fixtures are authorized; this gate remains unverified. Broader product, footage/reel, music/lyrics and 3D regression coverage remains necessary before claiming full parity.
4. **Partial UI smoke test passed:** Command-N created an isolated project; Command-comma opened Settings before and after updating. A native question sheet submitted its answer to the real local console; the persisted answer was verified and the embedded full workflow's controls became accessible. A locally generated three-second H.264 test pattern played in the native final-review player. Command-E opened a native save panel and exported a new byte-identical copy (SHA-256 matched). No provider was called. Desktop inspection intermittently timed out or failed screenshot capture; native Settings and the process event loop remained responsive, and inspection recovered. These checks do not establish complete route, accessibility, render, revision or failure-recovery coverage.

Distribution decision: the user explicitly chose a free Apple ID. Developer ID/notarization are therefore **not** a gate for the agreed community route; lack of notarization, first-install Gatekeeper warnings and managed-Mac restrictions must remain disclosed. Update authenticity uses the separate Sparkle EdDSA key. This is not equivalent to Apple notarization.

The public GitHub desktop release contains the verified DMG, checksum, installation notice and signed appcast. The website already links the build-7 archive; updated installation/update instructions and the stable feed are awaiting deployment from master. A published release alone does not prove the Pages feed is live.

Test evidence: `.context/sparkle-upgrade.xUX6xR/` retains the isolated installed bundle, signed test feed, project and playback/export fixture. `.context/sparkle-project-retained.png` and `.context/rasanai-native-playback-fixture.png` record the post-update project and native player. These disposable test archives must never be published as product releases. The update-test preparation/server scripts in `apps/macos/scripts/` document a repeatable local installation check. All 19 Swift tests and the Node supervisor exit/stop tests passed again on 2026-10-04, including the opt-in HTTP bridge against a disposable run.

## Historical first-milestone audit

The sections below record the original audit that motivated the changes above, not the current implementation status.

The existing RasanAI skill and its native review client are different deliverables. Engine tests passing does not establish native feature parity or a working standalone application.

## Workflow parity

| Capability in current RasanAI | Native app status |
| --- | --- |
| New film, route selection, agent dispatch and dependency setup | Missing. New Project Folder creates storage only; an external director still runs the workflow. |
| Local agent configuration | Executable discovery/selection, preferred agent and CLI sign-in checks exist. Browser login is handed to the provider CLI. No app-managed director launch yet. |
| Persistent project storage | Documents/RasanAI by default, per-project manifest and assets/audio/compositions/exports/.rasanai folders. Library location configurable. Imported runs are not moved. |
| Native Settings | SwiftUI Settings scene, standard Command-comma, storage, appearance, agent configuration and development-build information. |
| Brief | Partial: subject, duration, aspect and narration. Not the complete research/source/consent configuration. |
| Story | Basic stories comparison and choice. Not every legacy concept/film payload or workflow control. |
| Look | Static published posters and choice. No animated specimen/HTML/3D preview, advanced knobs or blend workflow. |
| Clarification/consent questions | Missing: session.ask has no native answer UI. This can stall a real director. |
| Animatic | Published stills, timing and attached mixed audio/music. No voice/music selection or replacement. |
| Notes and decisions | Time/scoped notes, apply and director messages exist. No spatial pins; decisions view does not cover all engine substeps. |
| Footage and cut | Missing specialized clip/contact-sheet/transcript UI and editable reel/caption controls. Stage grouping is not equivalent to payload/action compatibility. |
| Build/render supervision | Reads published data only. No process lifecycle, retry/cancel/queue, detailed render state or complete gate findings UI. |
| Final review and export | Published video playback, notes and local copy export work. Full changes/context/revision workflow is incomplete. |
| Versions | Requests a restore through existing console. Full comparison/change history is absent. |
| Brand kits | Placeholder, no complete editor. |
| Finish/3D/quality gates | Existing engine can run these externally. Native app does not orchestrate or demonstrate them end to end. |

## Additional reliability findings

Source inspection identifies follow-up work; these are not claimed as reproduced end-to-end failures:

- `SessionSnapshot.actionStep` and generic review controls do not faithfully handle every legacy/specialized substep. Add protocol fixtures covering every supported payload and action.
- Approval availability is gated by connection/pending actions, not the complete render/working state contract. Verify that stale animatic data cannot offer a premature approval during build.
- Images/media are refreshed primarily by URL identity. Replacing an asset at the same path can leave stale preview content. Test re-pushes and invalidate by revision or modification time.
- Native asset roots are narrower than the console's installed-skill roots. Verify legitimate specimen assets without weakening secret/path containment.
- Offline workspace recovery and reconnect after address/port changes need dedicated coverage.
- Multiple windows share one store; independent project windows are not implemented.

## Distribution audit

- Current bundle: macOS 14+, arm64 only, development bundle ID, ad-hoc signature, no Developer ID team or hardened runtime.
- Gatekeeper assessment of the current development bundle: rejected. This is not a distributable build.
- Only an Apple Development identity was found in the current signing keychain; Developer ID Application signing is not currently available there.
- No Sparkle dependency/framework, updater controller, feed URL, update public key, signed appcast, notarization or DMG/release workflow exists.
- Existing GitHub releases are skill releases. Desktop tags and update metadata must be separate so a later skill release cannot redirect desktop update discovery.

## Verification of this milestone

- Rebuilt the development app successfully; 14 Swift tests passed, including a disposable real-console HTTP integration test (comment → apply → approve).
- UI verification: Command-comma opened the native Settings window; Claude Code and OpenAI Codex status checks both reported signed in on this machine without displaying credential output.
- Command-N created the First Film folder in the default Documents library and showed it in Projects. These are storage and configuration checks, not agent dispatch or end-to-end film generation.
- The GitHub Pages source and repository documentation were updated locally. These edits have not been deployed to the public site.

## Required release gates

1. Implement director/runtime integration and complete the missing native console protocol and workflow controls. Preserve the existing engine's checks and run ownership.
2. Exercise representative product, explainer, footage/reel, music/lyrics and 3D workflows from a clean launch through delivery, including questions, revision, disconnect/reconnect and failure recovery.
3. Integrate Sparkle's programmatic SwiftUI updater, native Check for Updates, preferences, `SUFeedURL`, `SUPublicEDKey`, and correctly embedded framework/helpers.
4. Choose declared Apple Silicon-only or universal support, a stable bundle identifier, and monotonically increasing bundle versions. Sign with Developer ID and hardened runtime; notarize and staple the app/DMG.
5. Package a DMG with an Applications link. Publish immutable assets under separate desktop tags such as `studio-v0.1.0`. Host a stable HTTPS appcast (for example on GitHub Pages) pointing to exact GitHub release assets. Keep the EdDSA private key and notarization credentials outside the repository.
6. Verify a real installed version N → N+1 update through Sparkle, signature rejection, and retention of Documents projects/preferences. Only then publish a public download link.

See [Sparkle setup](https://sparkle-project.org/documentation/) and [publishing updates](https://sparkle-project.org/documentation/publishing/).

No public release or release DMG has been produced by this audit. The website source explicitly labels the native app a development preview.
