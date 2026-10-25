# Probe: can HyperFrames render one scene at a local time range?

Run 2026-10-24, hyperframes 0.8.193 (`npx --yes hyperframes`), 3-scene 1920x1080 30 fps fixture (each scene a sub-composition
referenced from `index.html` by `data-composition-src`, 2 s each), macOS.

**Verdict: no time-range render exists, but one scene renders fine as its own project.**

- `hyperframes render --help` has no start/end/frame-range/`--from`/`--to` flag. Only `-c/--composition`, `--fps`, `-q`, `--workers`,
  `--variables`, `--resolution`, `--resume` (segmented capture only; not a range).
- `render . -c compositions/s2.html`: works (60 frames, 2.0 s) but took ~54 s on every run (vs ~9 s for the host approach), so not used.
- **Scene host (used)**: a project dir whose `index.html` is the film's with all other composition hosts (and root `<audio>`) removed and
  the scene's host set to `data-start="0"`, root `data-duration` = scene duration; every other project entry is symlinked.
  `npx --yes hyperframes render <hostdir> -o s2.mp4 --fps 30/1 -q draft --quiet`: 60 frames, exactly 2.000000 s, 8.7 s wall.
  Symlinked `compositions/`, `assets/`, `hyperframes.json` work.
- Fidelity: host frame at 0.5 s vs the full render at 2.5 s (same scene-local moment), PSNR 56 dB at draft quality (compression only).
- Timings: full 6 s film cold 11.0 s; one 2 s scene 8.7 s. Fixed cost (npx + Chrome launch + page ready) is about 6-7 s per render, so
  speedups on tiny fixtures are bounded by that; real gains need scenes that cost far more than the startup.
- Limits: scenes must be sub-compositions (inline scenes in `index.html` are refused with a clear message); scene-local clock only, so a
  transition that samples scene N+1 or a cross-scene carrier is not handled by the host (graph `comp` nodes; assembly is a hard cut at
  exact frame counts); the GSAP CDN `<script>` in the probe fixture needs network (RasanAI films inline GSAP); `-c` on a sub-composition
  is slow; audio is not rendered per scene (the film's mix is muxed at assembly).
- Assembly: clips from the same settings concat with `ffmpeg -f concat -c:v copy`, frame count verified (180 = 3 x 60).
