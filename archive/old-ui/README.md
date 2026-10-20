OLD UI — not used by RasanAI Studio or the website. Kept only for reference. Do not import, link or ship anything from here.

Everything below was archived on 2026-10-20. Current UI: a sidebar (Home, Brands, films, Settings page), a seven-step rail (Describe, Setup, Brief, Story, Look, Preview, Final), and a working screen that is the live crew stage plus the latest preview. There is no phase rail, no stage bar and no snapshot harness any more.

Swift code is stored as `.swift.txt` so nothing compiles it. Each file starts with `// OLD UI — archived 2026-10-20, from <path>, replaced by <X>. Reference only.`

## studio/ (Swift code, archived 2026-10-20)

Original paths are under `apps/macos/Sources/` unless stated.

| Archived file | Original path | What it was | Replaced by |
|---|---|---|---|
| `studio/StageProgress.swift.txt` (whole file) | `RasanAIStudio/StageProgress.swift` | `ReviewStage.stepTitle`, names for the old 5-call bar | `ProgressPhase` titles / `StudioFlowProgress` |
| `studio/Workspace.swift-FilmStepper.swift.txt` | `RasanAIStudio/Workspace.swift` | `FilmStepper`, the old 5-call toolbar bar | `StudioFlowProgress` (7-step rail) |
| `studio/Workspace.swift-WindowMaterial.swift.txt` | `RasanAIStudio/Workspace.swift` | `WindowMaterial` AppKit material view | system sidebar / glass |
| `studio/Workspace.swift-StageDrawsPanelsKey.swift.txt` | `RasanAIStudio/Workspace.swift` (+ setters in FinalStage, AnimaticStage) | `StageDrawsPanelsKey` preference | stages draw their own panels |
| `studio/StudioSettings.swift-FixedSizeTabbedPanel.swift.txt` | `RasanAIStudio/StudioSettings.swift` | fixed-size tabbed Settings panel (`page: false`, `panelBody`, `initialTab`) | the Settings page |
| `studio/DirectorMonitor.swift-FixtureEntryPoints.swift.txt` | `RasanAIStudio/DirectorMonitor.swift` | `present(run:telemetry:health:live:…)`, `presentSession(_:)` fixture entry points | real runtime data |
| `studio/DirectorViews.swift-NoteSheet.swift.txt` | `RasanAIStudio/DirectorViews.swift` (+ `StudioStore.Sheet.note`, `showNoteSheet`, StudioView case) | `NoteSheet` for timed notes | notes in the inspector / native stages |
| `studio/FilmPage.swift-isWorkingOnNextCall.swift.txt` | `RasanAIStudio/FilmPage.swift` | `FilmPage.isWorkingOnNextCall` | `StudioFlowProgress` |
| `studio/FilmProgressCards.swift-NowCrewAvatar.swift.txt` | `RasanAIStudio/FilmProgressCards.swift` | `NowCrewAvatar` view body and `running` (the static `lead(for:)` stays in the live file as a small enum) | `CrewStage` |
| `studio/FilmProgressCards.swift-aspectRatioBox.swift.txt` | `RasanAIStudio/FilmProgressCards.swift` | `View.aspectRatioBox` | none |
| `studio/HomeCrewArtwork.swift.txt` (whole file) | `RasanAIStudio/HomeCrewArtwork.swift` | loader for `crew-prompt-v3.png` | `HomeCrewLineup`, crew-stage art |
| `studio/ResourceTests.swift-HomeCrewArtwork-test.swift.txt` | `Tests/StudioRuntimeTests/ResourceTests.swift` | test for HomeCrewArtwork | deleted with it |
| `studio/AppShell.swift-NewFilmHeaderButton.swift.txt` | `RasanAIStudio/AppShell.swift` | toolbar "+ New film" button | sidebar New film button |
| `studio/GetInspiredView.swift-MomentChip.swift.txt` | `RasanAIStudio/GetInspiredView.swift` | `MomentChip` | none |
| `studio/StageComponents.swift-ClockLabel.swift.txt` | `RasanAIStudio/StageComponents.swift` | `ClockLabel` | `Text(clockText(_:))` |
| `studio/StageComponents.swift-AudioPreviewButton.swift.txt` | `RasanAIStudio/StageComponents.swift` | `AudioPreviewButton` | native Look stage music preview |
| `studio/MinorPanelsB.swift-mpbSeconds.swift.txt` | `RasanAIStudio/MinorPanelsB.swift` | `mpbSeconds` | `clockText(_:)` |
| `studio/Theme.swift-StudioPalette.swift.txt` | `RasanAIStudio/Theme.swift` | `StudioPalette` (incl. `mint`, `divider`) | `Color.appBackground` and system colours |
| `studio/Theme.swift-HoverCard.swift.txt` | `RasanAIStudio/Theme.swift` | `HoverCard` | `cardSurface(hovering:)` |
| `studio/Theme.swift-StatusDot.swift.txt` | `RasanAIStudio/Theme.swift` | `StatusDot` (`StatusTone` stays, still used) | status text / sidebar badges |
| `studio/Theme.swift-rasanDeep.swift.txt` | `RasanAIStudio/Theme.swift` | `Color.rasanDeep` | `Color.rasanInk` |
| `studio/FilmProgress.swift-endReplay-replayTelemetry.swift.txt` | `RasanAIStudio/FilmProgress.swift` | `endReplay`, `replayTelemetry` | none (snapshot harness gone) |
| `studio/FilmSessionModel.swift-shownPayload.swift.txt` | `RasanAIStudio/FilmSessionModel.swift` | `shownPayload` | `payload(_:)` |
| `studio/RunTransport.swift-consoleURL.swift.txt` | `StudioCore/RunTransport.swift` | `consoleURL` (console.json) | none (no console server) |
| `studio/FilmProgressTypes.swift-activityByPhase.swift.txt` | `StudioCore/FilmProgressTypes.swift` (+ FilmProgressTests assertions) | `FilmProgressSnapshot.activityByPhase` | `activity(for:)` |

Not archived (still tangled with live code): the StudioStore review-player / notes cluster (`playhead`, `isPlaying`, `togglePlayback`, `addNote`, `applyNotes`, `sendDirectorMessage`, …). It has a `// OLD UI` comment above it in `StudioStore.swift`.

## studio-resources/

| Archived | Original path | What it was | Replaced by |
|---|---|---|---|
| `studio-resources/crew-prompt.png`, `crew-prompt-v2.png`, `crew-prompt-v3.png` | `apps/macos/Sources/RasanAIStudio/Resources/` | old Home crew artwork | per-character `crew-*.png` and `crew-stage/` |

## website/ (nothing in docs/, skills/, scripts/ or the READMEs referenced these)

| Archived | Original path | What it was | Replaced by |
|---|---|---|---|
| `website/img/studio-native-preview.png` | `docs/img/studio-native-preview.png` | early native Studio preview | `docs/img/studio/*` |
| `website/img/studio/home-content-*`, `home-films-*`, `home-films-bg.png`, `home-needs-you-*` | `docs/img/studio/` | old Home screenshots | `docs/img/studio/home-*x.jpg` |
| `website/mockups/` (console.html + img/) | `docs/mockups/` | web-console redesign mockup | native Studio |
| `website/img/console-films.jpg`, `console-look.jpg`, `looks.jpg`, `looks-brand.jpg`, `board-9x16.png`, `tasting-9x16.png`, `tasting-enterMid.png`, `3d-seam-lift.jpg` | `docs/img/` | unused web-console and look-board images | none |

## docs/

| Archived | Original path | What it was | Replaced by |
|---|---|---|---|
| `docs/READINESS.md` | `apps/macos/READINESS.md` | readiness audit of the removed console-server transport | none (Studio follows the run folder's files) |
| `docs/old-readme-notes.md` | paragraphs from `apps/macos/README.md`, `README.md`, `docs/guide.html` | the replaced README paragraphs, labelled OLD | current READMEs |

## Still live but showing old UI — replace with real screenshots

These are used by `docs/index.html` and were NOT moved. They show the old 5-step bar and have no sidebar.

- `docs/img/studio/call-brief-1x.jpg`, `call-brief-2x.jpg`
- `docs/img/studio/call-story-1x.jpg`, `call-story-2x.jpg`
- `docs/img/studio/call-look-1x.jpg`, `call-look-2x.jpg`
- `docs/img/studio/call-animatic-1x.jpg`, `call-animatic-2x.jpg`
- `docs/img/studio/call-final-1x.jpg`, `call-final-2x.jpg`
