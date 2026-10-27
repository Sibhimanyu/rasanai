#!/usr/bin/env node
// Rewrites the `recipe` field of a reference-motion.json in place and prints the crew packet.
//   node cli.mjs <reference-motion.json> [--strip]   (--strip prints the normalized cadence array as JSON instead)
// Exit 0 ok, 2 usage error or unreadable/invalid JSON.
import { readFileSync, writeFileSync } from "node:fs";
import { buildRecipe, renderCrewPacket, renderCadenceStrip } from "./index.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: node cli.mjs <reference-motion.json> [--strip]");
  process.exit(2);
}
let json;
try {
  json = JSON.parse(readFileSync(file, "utf8"));
  if (!json || typeof json !== "object" || !json.analysis) throw new Error("no analysis object");
} catch (e) {
  console.error(`cannot read ${file}: ${e.message}`);
  process.exit(2);
}
json.recipe = buildRecipe(json);
writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
if (args.includes("--strip")) process.stdout.write(JSON.stringify(renderCadenceStrip(json)) + "\n");
else process.stdout.write(renderCrewPacket(json));
