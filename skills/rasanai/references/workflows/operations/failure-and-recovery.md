# Failure handling and recovery

> Moved verbatim from the former single `SKILL.md`. References such as "§3d", "rule 18", "below" and "above" point into the sibling guides: the five-call contract and the hard rules are in [shared-contract](../shared-contract.md); the phase guides are listed in `SKILL.md`.

## Failure handling

- A script exits non-zero → show its stderr, fix the input, re-run. Never hand-write an artifact a script owns.
- The console won't start → `serve` again; still failing → show the error (a port in use: `--port 0`). Only if it cannot run at all (no browser on a remote machine), ask in chat, one question per message, in plain text.
- Offline: previews and the motion check use the vendored GSAP; fonts, capture, voice samples, music and the workflows' TTS need the network. No music source reachable → `ask` for the user's track or go without music (say so).
- A preview script exits 1 with "did not render" → the page hit a script error; open it in a browser and report the console error.
