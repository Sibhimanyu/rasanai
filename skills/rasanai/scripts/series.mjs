#!/usr/bin/env node
// A series is a saved setup plus memory (library/Series/<slug>/series.json). The Studio makes and lists series; the
// Director reads one, and writes back what the owner teaches on an episode.
//
//   node series.mjs show      --series <dir>                                     the series, with its files resolved (JSON)
//   node series.mjs add-rule  --series <dir> --text "No captions" --film <id>    a rule the owner taught (same text again: deduped)
//   node series.mjs set-pref  --series <dir> --question captions --choice off    a taste answer (library/questions.json; --choice unsure clears it)
//   node series.mjs brief     --series <dir>                                     the rules block for crew briefs (nothing when there are none)
// Paths inside series.json are relative to the series folder. Zero dependencies.
import { parseArgs, die } from "./lib/common.mjs";
import { showSeries, addRule, setPref, seriesRulesBlock } from "./lib/series.mjs";

const args = parseArgs();
const cmd = args._[0];
const dir = args.series && args.series !== true ? String(args.series) : null;
if (!cmd || !["show", "add-rule", "set-pref", "brief"].includes(cmd)) die("usage: series.mjs show|add-rule|set-pref|brief --series <dir> ...");
if (!dir) die("--series <dir> required");
try {
  if (cmd === "show") console.log(JSON.stringify({ ok: true, ...showSeries(dir) }, null, 2));
  else if (cmd === "add-rule") console.log(JSON.stringify({ ok: true, rule: addRule(dir, { text: args.text === true ? "" : args.text, film: args.film }) }));
  else if (cmd === "set-pref") {
    if (!args.question || args.question === true || !args.choice || args.choice === true) die("--question <id> and --choice <id> required");
    console.log(JSON.stringify({ ok: true, ...setPref(dir, String(args.question), String(args.choice)) }));
  } else {
    const b = seriesRulesBlock(dir);
    if (b) process.stdout.write(b);
  }
} catch (e) {
  die(e.message);
}
