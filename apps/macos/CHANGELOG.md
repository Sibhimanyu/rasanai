# RasanAI Studio for Mac

Desktop releases are separate from RasanAI skill releases.

## Unreleased

- Rasan no longer skips your Look call when the film planner has trouble: it always asks you, even at Fast pace.
- If a look or story was ever chosen without you, Studio tells you and lets you review it.

## 0.24.0 (build 62) — 2026-10-26

- Quitting while a film is working now offers a third choice, "Keep the film running": Studio closes and the director carries on, and the next Studio picks it up (also when a phone resumed it while Studio was closed). Stop and Quit stays the default.
- A director started from outside Studio (`director.mjs resume`) is found by a relaunched Studio from the process list.
- **Bundles RasanAI 1.28.0.**

## 0.23.0 (build 61) — 2026-10-26

- The Brief page is tidier: two columns that line up at the top and stay a comfortable width on big screens, a smaller header, an idea sentence that wraps instead of being cut off, and a quieter Details panel that no longer hides behind the bottom bar.
- The crew talks in speech cards near their head instead of cloud thought bubbles: the newest one, plus one faded older one.
- Decisions is now a timeline grouped by stage, with headers that stay in view and fold away, marks for what you decided, what Rasan decided and what is still open, a filter and search, Show more, and Jump to now.
- The working screen fits its window: the character and their speech cards shrink to fit a smaller window instead of making you scroll, and the latest picture sizes itself to match.
- **Bundles RasanAI 1.27.0.**

## 0.22.9 (build 60) — 2026-10-26

- When Rasan is blocked, the banner now says what happened and what to do, with one main button: Fix it. Ask Rasan why, Retry step, Restart Rasan, View activity, Copy details and Report a problem are under More.
- Ask "what happened?" and Studio answers right away from what it already knows (why Rasan stopped, the current step, the last error, the last few events), without waiting for Rasan.
- Messages to Rasan are sent once, not twice, and Studio's own instructions show as a short line like "You pressed Fix it" instead of a long message.
- "Rasan is thinking" can no longer get stuck: if Rasan is stopped, blocked or silent for 3 minutes it says "Not answered" and offers Ask again, Ask for a short answer, or Stop waiting.
- **Bundles RasanAI 1.27.0.**

## 0.22.8 (build 59) — 2026-10-26

- Updating restarts RasanAI by itself: the app now closes and reopens in the new version without you pressing anything, and if it ever needs a hand, the window says what it is waiting for.
- The update window now says it can take up to a minute on Macs with security software, and keeps counting so you can see it is not stuck.
- **Bundles RasanAI 1.27.0.**

## 0.22.7 (build 58) — 2026-10-26

- The strip above each step ('Call 5 of 5 · Final…') is gone. What it said now lives in the bottom bar: a small Preview/Final tag, and hovering the main button tells you what it will do. The page gets that row of space back.
- **Bundles RasanAI 1.27.0.**

## 0.22.6 (build 57) — 2026-10-26

- A fresh last step for setting up a film: one calm page with everything visible and editable in place, instead of a pop-up. Speed, quality, motion, Brand, footage and a reference video all live on it.
- Ask Rasan: type right in the bottom bar. The chat opens above it and older messages fade away as you look up. Scroll up, or open the side panel, to see more.
- The sidebar no longer has a coloured block behind it, and the character header at the top of each step takes less space.
- **Bundles RasanAI 1.27.0.**

## 0.22.5 (build 56) — 2026-10-26

- Setting up a film is one screen: click any answer to open a single set-up sheet with every option in view. Speed, quality, motion and Brand are no longer hidden under More settings.
- The Ask Rasan chat tucks back into the bar when you close it, so there is never a second Ask Rasan box on screen.
- **Bundles RasanAI 1.27.0.**

## 0.22.4 (build 55) — 2026-10-26

- The sidebar and floating panels no longer show a ghostly reflection of what is behind them; they just pick up a soft tint, like glare.
- Fixed the "You're now on…" card that came back after pressing Got it.
- The update screen always shows where it is: four steps, a progress bar, and a time estimate. If installing stalls it tells you why and offers Restart now, Try again or a manual download.
- **Bundles RasanAI 1.27.0.**

## 0.22.3 (build 54) — 2026-10-26

- Fixed the "You're now on…" card that came back after pressing Got it.
- The update screen always shows where it is: four steps, a progress bar, and a time estimate. If installing stalls it tells you why and offers Restart now, Try again or a manual download.
- **Bundles RasanAI 1.27.0.**


## 0.22.2 (build 53) — 2026-10-26

- Ask Rasan now lives in the bottom bar. Click it to open a floating chat that you can collapse, or open the full side panel with ⌥⌘I.
- Report a Problem (Heresay) now opens reliably, even when another window or sheet is open.
- The sidebar no longer shows a reflection of the page behind it.
- **Bundles RasanAI 1.27.0.**

## 0.22.1 (build 52) — 2026-10-26

- Updates now show what changed: a native update screen with a "What's new" list while it downloads and installs, plus a one-time "You're now on X" card after you restart.
- Fixed a flat colour strip behind the floating sidebar in full screen.
- **Bundles RasanAI 1.27.0.**

## 0.22.0 (build 51) — 2026-10-26

- **One player everywhere.** Every video preview now has the same controls (play, skip 5 seconds, speed, loop, volume, full screen), including the final film page, source files, drafts, the library and progress cards. Full screen now also works when the app is already full screen.
- **New "Ask Rasan" bar** at the bottom of every film screen, with a one-time hint, so the chat with Rasan is easy to find. The toolbar button is now labelled Ask Rasan.
- **The Note button works on finished films** and says why when it is off.
- **History button on the film page.** Watch or restore any earlier version from the review screen, with dates and what changed.
- **The ? button opens a menu** with help and Report a Problem; Heresay can be opened from it.
- **Plainer words.** Proxy is now Preview, Styleframe is Still, Animatic is Rough cut; the ... menu has icons and friendlier names.
- **The character in the Final header** is centred between top and bottom.
- **The stepper works on the Final page.** From the finished film, click Brief, Story, Look or Storyboard to go back to that step, and Final to come back.
- **Redesigned Settings page.** Side navigation, cards, a Rasan section, show tips again, open the guide and send feedback.
- **Ask Rasan panel shortcut.** The right-hand Ask Rasan panel opens with ⌥⌘I (Apple's inspector key) and is in the View menu.
- **The film page ... menu** has icons and friendlier names.
- **Source-file preview** uses the same player from the first frame.
- **Bundles RasanAI 1.27.0.**

## 0.21.0 (build 50) — 2026-10-25

- **Ask Rasan how long it will take.** In the chat, "how long will it take?" and "what is happening?" are answered on the spot from the film's real progress, without interrupting the work.
- **Notes become real change requests.** A message like "don't use this font" is read as a revision request the engine acts on and answers (an unclear one asks you to confirm first), and the answer shows in the chat.
- **Edit elements on the final film.** Click an element in the final picture to move or resize it; the engine applies the edit and says if it could not. Early foundation, not tested end to end.
- **Delivery details are collapsed** in the export sheet until you open them.
- **Behind the scenes:** the groundwork for undo and revisions, and for safer recovery when a step fails, is in. Not yet tested end to end.
- **Bundles RasanAI 1.27.0.**

## 0.20.1 (build 49) — 2026-10-25

- **The film status says what Rasan is doing.** After you send something, the bar shows what Rasan is working on, how long it has been, and a time estimate when there is one. If nothing has happened after two minutes it says so and offers Show log.
- **Decisions newest first.** The Decisions panel lists the newest decision first and shows the current step while Rasan works or waits for you.
- **Installs are explained.** When Rasan needs a tool installed, Studio asks you directly, installs it for you without a password or Homebrew, and shows what is happening. If a command is blocked, or Rasan goes quiet for five minutes, you see exactly what happened, with Retry step and Restart Rasan.
- **Bundles RasanAI 1.26.0.**

## 0.20.0 (build 48) — 2026-10-24

- **Reference chip.** A film with a linked reference video shows a reference chip and, on Look, a Motion inspiration summary (cuts, rhythm, uncertainties) with a way to send the director a note on how much it should influence the film. Shown only when the film has `reference-motion.json`.
- **Motion library on Look.** A collapsed Motion library lists the motion kit catalog; asking for an item sends a note to the director with the item, its annotation and parameters. Shown only when a catalog exists.
- **Final element inspector.** When the film has an element index, clicking the video also resolves the element under the point, and a change request is sent to the director as a `motion-edit` action with an edit status chip (requested, accepted, applied, rendered, failed). Studio never edits scene files itself.
- These screens are new and have not yet been opened in a window for review.
- **Bundles RasanAI 1.26.0.**

## 0.19.9 (build 47) — 2026-10-23

- **Help opens the new How it works page**, which follows one film through the app, the crew, the engine and the files on your disk.
- **Bundles RasanAI 1.25.0.**

## 0.19.8 (build 46) — 2026-10-23

- **Hover a note on the timeline and see that note.** Each pin answered for the whole timeline, so one note's card showed wherever the pointer was; each pin now shows its own. The card and the time under the pointer sit just above the timeline, where the video no longer covers them.
- **A smoother timeline.** Only the playhead follows the clock now, so the video and the scene thumbnails stop redrawing thirty times a second, and dragging the playhead seeks to the nearest frame it can reach quickly, then lands exactly when you let go.
- **Studio's own full screen.** Full screen (F) shows the film edge to edge with its pins and captions, and the timeline, notes and controls in a bar that fades while it plays. Esc or F comes back; C or a pin takes you to the chat with that moment.
- **Your call wakes the director.** A call made on a film whose director had stopped used to sit unread, and the page never moved. Studio now starts the director to apply it, so the crew member comes to the centre and gets to work. Pin notes still wait for Apply, and a plan-limit wait keeps its own resume.
- **Rasika has both eyebrows when she asks.** Her asking pose (Final, and checks) drew only the right brow; the left one is back.
- **The sample film shows the crew at work.** Make a call in the sample and the crew member for the next step comes to the centre with the work in bubbles around them, then steps aside to ask before the sample returns.
- **Bundles RasanAI 1.25.0.**

## 0.19.7 (build 45) — 2026-10-23

- **Chat with Rasan.** The right sidebar is a chat with Rasan, the director: tell him what you want or what to avoid, with suggestions to start from. Open it with ⌥⌘B (⌥⌘I and ⌘K work too).
- **Point at the film.** Click the video to mark a spot, drag a box, or circle an area: the chat opens with that frame, your mark and the time attached.
- **A real player on Final.** Speed, loop, volume, full screen, ±5 s and frame steps, J/K/L, and a filmstrip timeline with your notes pinned on it.
- **Preview is now Storyboard.** It was always key frames timed to the music, so it now looks like a storyboard: numbered panels with time, line and voice, and Play with music.
- **Describe and Setup are one step.** The stepper reads Describe · Brief · Story · Look · Storyboard · Final.
- **Calmer, even layout.** Equal 20 pt gutters on every page, panels that stay put while their content scrolls, a slimmer bottom bar with Pause and an honest "the director is stopped" with Resume, look options above the preview, and Preview and Final laid out like Look.
- **The crew, drawn better.** A new speech bubble tinted per character that hugs its words and points at the speaker's mouth, readable highlight colours, Kavi's papers no longer see-through, and Rasan never cropped into a circle.
- **Clearer buttons.** "Apply notes" is now "Revise with N notes"; "Preview again" is gone.
- **Bundles RasanAI 1.25.0.**

## 0.19.6 (build 44) — 2026-10-22

- **The crew asks, properly.** Every stage opens with the crew member at full size asking the question in a new speech bubble: one smooth outline with a curved tail toward the speaker, sized to the words, soft depth, and a small pop as it appears.
- **Story and Look use the whole window.** On wide windows the character, question and your choices sit on the left; the script, or the look preview, runs top to bottom on the right. The selected look's details now sit beside the tiles instead of under the preview.
- **One floating bar at the bottom.** The status and actions live in a full-width glass bar that content scrolls under, like the sidebar. Looking back at a step keeps "Back to now" and "Change this…" there; the separate green "Decided" strip is gone, since the stepper and the highlighted choice already show it.
- **Bundles RasanAI 1.25.0.**

## 0.19.5 (build 43) — 2026-10-22

- **Story and Look stay in view.** The review workspace keeps your choices and key context visible while detailed scripts and look guidance scroll in their own panels. The existing action bar remains available, including when looking back at an earlier decision.
- **Bundles RasanAI 1.25.0.**

## 0.19.4 (build 42) — 2026-10-21

- **Pause holds after a relaunch.** Pausing a film that Studio picked back up after a restart (by you, or by its own stuck or budget check) now really pauses it; before, the director was stopped and had to start over from its saved state.
- **Bundles RasanAI 1.24.0.**

## 0.19.3 (build 41) — 2026-10-21

- **A stuck director pauses itself.** When Claude repeats the same step, or burns tokens without showing you anything new, for two minutes, Studio pauses it so a loop stops spending tokens. A red banner says why, with Resume, Message Claude and Show log; nothing is lost and Resume carries on mid-step. Turn it off in Settings → "Pause the director when it looks stuck".
- **Your budget is a limit, not just a warning.** When a film passes your spend per film, the director pauses. Keep going resumes it; Raise by $10 lifts the limit.
- **Loops are caught even with Studio closed.** If Studio crashes or is force-quit mid-film, the director's supervisor stops it after the same call five times in a row instead of letting it run on unwatched.
- **Bundles RasanAI 1.24.0.**

## 0.19.2 (build 40) — 2026-10-21

- **Decisions say where you made them.** A call answered from another app (Squeak on your iPhone) shows "You · iPhone" in the Decisions drawer.
- **Bundles RasanAI 1.24.0.**

## 0.19.1 (build 39) — 2026-10-21

- **Honest time estimates.** Elapsed time and "time left" leave out the hours nothing ran (a Claude plan limit, a pause, the app closed) and stop while it is your call. Estimates start from how long real films take (about 1 h 45 min of work for a 30 s film, not 2.5 h), and no longer count down while you decide.
- **Films pick themselves back up.** Quitting or updating Studio mid-film no longer strands it: a director still working is picked back up (never a second one on the same film), a plan limit still resumes by itself when it resets, and an unexpected stop resumes once.
- **A stopped film says so.** When nothing is working on a film, it says "Claude stopped working on this film" with a Resume button, instead of a working screen stuck on "18 min left".
- **Bundles RasanAI 1.23.0.**

## 0.19.0 (build 38) — 2026-10-20

- **Edit a talking-head cut by its words.** The Cut step shows the transcript with Claude's suggested cuts (retakes, false starts, "wait, let me start again", fillers) marked. Cut or restore any phrase, accept or keep a suggestion, fix a misspelled name, and undo or redo with ⌘Z / ⇧⌘Z. Your decisions are kept if you quit and reopen.
- **Notes can point at a word,** so Claude fixes the exact moment, even when the same word is said more than once.
- **Updated Heresay** (the Report button) to 0.2.34.
- **Bundles RasanAI 1.23.0.**

## 0.18.0 (build 37) — 2026-10-20

- **The crew on the working screen.** Film progress puts the phase's crew member big in the centre with live eyes, and the newest real activity as thought bubbles. Paused, they snooze; when a call waits on you, they step aside and ask.
- **Setup in three buttons: Claude, Codex, Tools.** One click does the next step: install, sign in, or make it your director. Tools installs the missing rendering tools right there.
- **Sign in without Terminal.** Claude and Codex sign in from inside Studio: your browser opens, and there is a box for the code Claude shows. Use Terminal instead is still there.
- **Codex is found when it is signed in.** A Codex that Studio installed now passes its sign-in check, and one installed after launch is picked up in Settings.
- **Notifications are on.** Studio asks macOS once, after setup, and Settings says when macOS has them turned off, with a button to fix it.
- **Bundles RasanAI 1.22.0.**

## 0.17.1 (build 36) — 2026-10-19

- **⌘K jumps to search,** everywhere but a film page, where ⌘K still writes to the agent.
- **A yes to the transcriber installs it.** Studio installs the speech transcriber itself, checks it works, and shows the real reason if it can't. The film no longer carries on without transcripts after you said yes.
- **The old activity page is gone.** View activity shows what happened, newest first; a warning's View details shows that warning. Wrap up research sits right on the research budget warning.
- **Brand in the + menu.** Pick a brand or add a brand kit folder or .zip from the prompt box. A folder that looks like a brand kit asks before it goes in as footage, and a film waits for its brand to finish compiling.
- **The full storyline on the Story call,** beat by beat: what you see, what it proves, why it's there, the turn and the ending.
- **Better time estimates.** They fit the film (length, scenes, pace), leave out phases it skips, learn from your past films, stay steady, and show a range until they're sure.
- **Bundles RasanAI 1.22.0.**

## 0.17.0 (build 35) — 2026-10-19

- **Upload a brand kit folder.** New Brand takes a folder or .zip. RasanAI copies every usable file, then Claude compiles the brand in the background: DESIGN.md, logo roles, fonts, media tags and the guidelines' rules. A progress card shows where it is, with Cancel.
- **What Claude found, on the brand page.** A short summary, its questions in Needs attention, the files it couldn't use and why, and a Brand rules section. Recompile from kit runs it again and keeps your fixes.
- **Bundles RasanAI 1.21.0.**

## 0.16.0 (build 34) — 2026-10-19

- **Brands get an Assets section.** Logos with a kind (mark, wordmark, lockup, app icon), colour versions and a primary star; font files with their family, weight and style; screenshots, images, icons, video and guideline PDFs with tags. Drop files on a group or use its + button.
- **Importing a DESIGN.md brings its files.** Logos, fonts and images the file points to are copied into the brand. A Needs attention strip lists anything missing, with Locate…, and warns when a font has no file and would become Inter.
- **Your brand is the one in the film.** A film made with a brand now uses its logos and fonts, and RasanAI no longer researches the brand on the web. Switching brands clears the old brand's files, and older DESIGN.md backups are kept.
- **The mascot is called Rasan everywhere.**
- **Bundles RasanAI 1.20.0.**

## 0.15.1 (build 33) — 2026-10-16

- **Fixes a crash at launch in 0.15.0.** Home now finds the crew artwork inside the installed app instead of stopping the app when it looks in the wrong place.
- **Updates arrive sooner.** Studio checks for a new version every hour instead of every 5 hours.
- **Bundles RasanAI 1.19.0.**

## 0.15.0 (build 32) — 2026-10-16

- **The crew on Home.** Rasan and the six crew members stand on the prompt box's rim over a soft mesh wash, and each one has a role in making the film. Scrolling down carries the prompt into your workspace, with your films as cards.
- **Pages load calmly.** A page that is still reading shows a quiet loading state instead of a blank or a jump, and film posters come from a thumbnail cache, so the library and Inspiration scroll smoothly.
- **Calmer working screens.** The sidebar rows and the window chrome are shared by every page, with keyboard focus on the sidebar. The status bar floats as glass at the bottom, and the working screen keeps to the film, with the phase rail one toggle away.
- **Settings is a page in the window,** reached from the sidebar like any other place.
- **The brief as named fields.** Each part of the brief is its own editable field, with the evidence it came from beside it.
- **The inspector starts closed.** Cmd-K opens Notes.
- **A Finished page with an export panel.** The delivered film sits beside one panel for its title, files, export and series look.
- **Columns that adapt** to the window's width on the library and stage pages.
- **Bundles RasanAI 1.19.0.**

## 0.14.0 (build 31) — 2026-10-15

- **New film is a step-by-step setup.** One question per screen with big tiles: series, what you're making, material, brief, length and shape (read from the clip for footage), an example edit, the taste questions, then Review. The Home box keeps a one-click Start next to a new "Set it up".
- **Review says where each answer came from:** You, From your clip, From your series, From your example, or RasanAI decides. Pace, Models, Motion, Brand, Director and Inspiration sit in a collapsed "More settings".
- **Series.** Each series has its own page and lives in `<library>/Series/<slug>/series.json`. Existing templates become series on first launch, with the old data kept. On the film page, "Make this the <series> look" locks the look.
- **Learn from an example edit.** Dropping an edit you like runs a short background job that reads it and pre-fills the answers.
- **Bundles RasanAI 1.19.0:** taste questions, series and learning from an edit.

## 0.13.0 (build 30) — 2026-10-15

- **A render is never "Quiet".** While a render or encode runs on your Mac (finish, render, ffmpeg, HyperFrames or Remotion), the film reads "Rendering" with the time so far, for up to 90 minutes, and says that tokens and cost hold still until it finishes. The status bar and the director monitor no longer call it "No activity".
- **One tracker while Claude works.** The five-call step capsule steps aside while the progress view is up; its phase list marks the phases that end in your call. The capsule returns for each call.
- **Film cards keep their shape.** A portrait or square poster is cropped to fill the 16:9 card instead of making it taller.
- **Heresay SDK 0.2.20.**
- **Bundles RasanAI 1.18.0.**

## 0.12.0 (build 29) — 2026-10-15

- **The Studio shows the wave 8 data.** The decisions drawer keeps a history of the calls made, and shows what the film is "Working without" and the crew budget. Lessons can be dropped. The Final page has a Checks popover with the A/B verdicts and the gate numbers, and the film shows its real title.
- **Bundles RasanAI 1.17.0:** one argument per film, motion from meaning.

## 0.11.0 (build 28) — 2026-10-14

- **Liquid Glass chrome.** The inspector, the film action bar and the five-call step capsule use the sidebar's own Liquid Glass, with its rounder corners. The stage no longer lights the glass, which replaces the stage-lit glass of 0.10.0.
- **Pause freezes the film in place.** Nothing runs and no tokens are used. Resume carries on in the middle of the step, with nothing redone. Answering a question while paused carries it on, and quitting while paused stops the film cleanly.
- **The Mac stays awake while a film is being made.** This is a setting, on by default. The screen can still sleep, and the Mac may sleep while the film is only waiting on you.
- **Carries on after sleep.** Time spent asleep no longer reads as "Quiet", and an automatic resume that came due during sleep runs when the Mac wakes.
- **A brief box that scrolls.** On Home and New film it grows to 12 lines, or 30% of the screen, and then scrolls instead of spilling over the page.

## 0.10.0 (build 27) — 2026-10-14

- **Glass that takes its light from the stage.** The inspector and the action bar glow with the edge colour and brightness of the frame beside them, live while the film plays. The glass is solid and has no tint of its own, so the desktop stays out of the text.
- **The inspector is one sheet of glass.** Header, Notes and Decisions share one frosted surface, lit from above.
- **Install Claude Code or Codex inside Studio.** Progress shows in the window, and Terminal opens only for sign-in. The Git notice is also on Welcome and rechecks by itself when Apple's tools arrive.
- **A sidebar that shows where you are.** Icons say what each place holds, Queue sits in the one group after Needs review, and recent films are listed with a mark for their state. Navigation never bounces you Home.
- **Suggested titles follow the brief.** The title is cleared with the brief and made again when it changes, and never replaces a name you typed.
- **A steadier opening.** The splash frosts the whole window, leaves after its hold even if the library loaded during it, and never stays past 6 seconds.
- **The film page says what is running.** It names the running agent, Resume is the main button when paused, and review notes can be skipped before Apply. Building, rendering or restoring without them asks first.
- **Plainer words and smaller fixes.** New film puts the prompt first and says why Start is grey. Pace, Models and the story, look and build steps use plain words. Clicking a film card opens it again, and the help popover and step bar sit properly.


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
