# Bringing in a new GitHub skill or repo

For an agent doing it. Follow the steps in order; the same pull request carries the code, the credit and the register row. Register: `SOURCES.md`. Open work: `BACKLOG.md`.

## 1. The licence decides what you may do

Read the root `LICENSE` first, then check **per file and per asset** (a `NOTICE`, headers, `assets/`, `fonts/`, `samples/`, `CREDITS`, demo folders, the README's "Licence" section). A permissive root does not cover a file with its own licence.

| Licence found | What we may do | What we must do |
|---|---|---|
| MIT, BSD, ISC | copy or adapt code and text | copy `LICENSE` exactly into `third_party/<name>/`, add `NOTICE`, mark adapted files "Adapted from <name>" in a header comment, list every adaptation in the folder README |
| Apache-2.0 | same | same, plus: state changes ("Modified by RasanAI") in `NOTICE` and the adapted files; keep the source's own `NOTICE` text |
| CC BY (3.0 / 4.0) | text and media with attribution only | attribution line with author, title, link, licence; no code (CC licences are not for code); note "ShareAlike" (SA) means the result must be CC BY-SA: treat SA as ideas only |
| CC0, public domain | anything | still record the source in `SOURCES.md` |
| AGPL, GPL, LGPL | **ideas only**: our own code and our own words. Copying would put our code under the same licence | cite in `SOURCES.md`; no credit folder; name the idea in the code comment ("idea from X; our code") |
| PolyForm Noncommercial, other non-commercial or "source available" | **ideas only** (RasanAI may be used commercially) | same as above |
| No licence, "NOASSERTION", or unreadable | **ideas only** (no licence = all rights reserved) | same as above; if the idea is worth a lot, ask the author for a licence in an issue |
| Mixed (code MIT, assets CC BY, fonts OFL, "demo assets keep their own licences") | per file: the strictest rule that applies to the thing you take | record which part you took and its licence |
| A paper, article, talk or person's craft rule | ideas, cited | cite the person or work; never quote at length |

Always out, whatever the licence: other people's fonts, music, voices, photos, logos and brand marks (strip them; `library` entries must not carry real film names, characters or credit lines), API keys, anything that needs a login to read.

Cannot tell? Treat it as ideas only and write "unverified" in the register.

## 2. The steps

1. **Survey.** Read the README, the licence, the folder tree, the star count and last commit date. One paragraph: what it does, what it is for, the licence verdict above. Stop here if it is ideas only and nothing is new.
2. **Deep read.** Read `references/`, `scripts/`, evals and tests, and the recent commits, not only `SKILL.md`. The valuable part is usually a measured number, a check, a failure the author fixed. Copy the source to `/tmp` (never into the repo) while reading.
3. **Check what RasanAI already has.** `grep -ri` the idea in `skills/rasanai/` (references, scripts, library, agents, runtime) and in `SOURCES.md`. Most ideas are already here; take only the gap.
4. **Findings file.** Write `.context/reaudit/<name>.md` (local, not in git): numbered items, each `file/section in the source -> where it would live here`, with a size (S under 1 h of agent work, M a few hours, L a day or more) and the licence mode.
5. **TODO item.** Add the chosen items to `BACKLOG.md` (id, source, what, why, spec text copied in, files, done-when, size). Anything not built stays in BACKLOG, with its source.
6. **Build in a wave.** Disjoint files per builder. Measurement beats rules: a new check starts as a warning and becomes an error only after it passes the reference films and fails weak ones. No new test files unless the owner asks (owner rule on this repo, 2026-10-15: implementation only).
7. **Credit in the same PR.** For adapt/copy licences: the `third_party/<name>/` folder. For every source: a `SOURCES.md` section and a summary-table row. Add the pointer in the README "Third-party" paragraph when the source is permissive and substantial.
8. **CHANGELOG names the source** in the version section that ships the feature ("a port of thinking-orbs, MIT, credited in `third_party/thinking-orbs/`", or "idea from onetake").

## 3. Template: a `SOURCES.md` section

```
## <name>

- URL: https://github.com/<owner>/<repo>  (version or commit read: <sha or tag>)
- Licence: <SPDX>, <copyright holder>. Lets us: <copy or adapt with credit | ideas only>. Per-file exceptions: <none | list>.
- Credit location: third_party/<name>/ (LICENSE, NOTICE, README) | none (ideas only)
- TOOK: each feature -> exact RasanAI files. HOW MUCH per line: verbatim | adapted code | data | rewritten | idea only.
- DECLINED: <what and why>
- PLANNED: <BACKLOG id(s)>
- Unverified: <anything you could not confirm>
```

Add the row to the summary table at the top: source, licence, mode, main features, status.

## 4. Template: `third_party/<name>/` (permissive licences only)

- `LICENSE`: an **exact copy** of the source's licence file (byte for byte; confirm with `diff`).
- `NOTICE`: `<name>, by <author> (<url>)`; what RasanAI uses and from which source paths; the licence and copyright line; "modified by RasanAI" statement for Apache/BSD; what was not taken. Include the source's own NOTICE text for Apache-2.0.
- `README.md`: "<name>, in RasanAI". One table: `Here | From | Used by`, **one row for every file or feature adapted** (our path, the source path or section, the consumer). A "Not taken" line. A sentence per mode (verbatim, adapted, rewritten, idea only).
- Data files that were copied or trimmed (for example `moments.jsonl`, `golden-subset.json`) live in this folder, unchanged unless the README says how.

## 5. Rules

- **Never copy from an ideas-only source**: no code, no prompt text, no sentence, no table, no file names that give the source away. Write the idea in your own words and your own code; a different structure, not a paraphrase.
- Strip third-party names and marks from anything we ship: library entries carry no film titles, characters, studios or credit lines (the opuscar-prompts digest did this).
- Record "how much" for every item: verbatim, adapted code, data, rewritten or idea only.
- Mark adapted files in their header comment ("Adapted from <name>, <licence>; modified"). Ideas-only files may say "idea from <name>; our code".
- Rows or data decoded by a model are hints, never rules (see `third_party/motionmaxxing/README.md`).
- Do not let a source change the product: RasanAI is product-first for launch films, native for Studio, Node and ffmpeg for audio (no Python audio libraries). Take craft, not a different product.
- One PR for the credit and the code. Do not merge a copied file without its `third_party/` entry.

## 6. Re-auditing a source for new commits

1. Read the `SOURCES.md` section: note the commit or tag you last read ("version or commit read").
2. `git log --since=<date> --stat` in a fresh clone (or `gh api repos/<owner>/<repo>/commits?since=<date>`). Also check the licence file did not change (`git log -- LICENSE`): a source that goes AGPL or non-commercial moves to ideas-only from that commit on; code already taken under the earlier licence stays under it, with the old commit recorded.
3. Read only the changed references, scripts and evals. Run steps 3 to 5 of section 2 on what is new.
4. Update the section: new commit read, new items in TOOK or PLANNED, and the date. Keep `.context/reaudit/<name>.md` current.
