#!/usr/bin/env node
// A brand's managed assets (references/brand.md "User brand kits"). Every command prints ONE JSON object to stdout; exit 0 on success, 1 on a usage or IO error.
//   node brand-assets.mjs import --brand <dir> [--design <DESIGN.md>] [--offline]   pull in every file DESIGN.md points at (images, links, @font-face, logo:/font-file: keys, bare paths and URLs)
//   node brand-assets.mjs add    --brand <dir> --file <path> [--as logo|font|media] [--kind <kind>] [--colours on-light,on-dark] [--primary]
//   node brand-assets.mjs check  --brand <dir> [--online]     read DESIGN.md + assets -> assets/check.json (colours, fonts, font files, logos, problems, warnings)
//   node brand-assets.mjs apply  --brand <dir> --project <dir>   copy the brand into a film project (DESIGN.md, assets/brand/, assets/fonts/)
//   node brand-assets.mjs inventory      --kit <folder|.zip> --brand <dir> [--name <Name>]   a whole brand-kit folder: copy and classify every file, import its DESIGN.md -> assets/kit-inventory.json (no network except DESIGN.md URLs, no Claude)
//   node brand-assets.mjs compile-prompt --kit <folder> --brand <dir>   print (plain text) the prompt for the headless Claude job (agents/brand-compiler.md, paths filled in)
//   node brand-assets.mjs set    --brand <dir> --file <manifest file> [--kind] [--colours a,b] [--primary] [--family] [--weight] [--style] [--tags a,b] [--note] [--remove]   edit or remove one manifest entry
//   node brand-assets.mjs compile --kit <folder|.zip> --brand <dir> [--name] [--claude <path>] [--model claude-sonnet-5-5]   inventory -> headless Claude -> check, in one go (terminal use)
import path from "node:path";
import { importBrand, addAsset, checkBrand, applyBrand, inventoryKit, compilePrompt, setEntry, compileKit } from "./lib/brand-assets.mjs";
import { parseArgs } from "./lib/common.mjs";

const args = parseArgs();
const cmd = args._[0];
const val = (k) => (args[k] && args[k] !== true ? String(args[k]) : null);
const fail = (error) => { console.log(JSON.stringify({ ok: false, error })); process.exit(1); };
const need = (k) => val(k) || fail(`--${k} <path> required`);
try {
  let r;
  if (cmd === "import") r = await importBrand({ brand: need("brand"), design: val("design"), offline: !!args.offline });
  else if (cmd === "add") r = addAsset({ brand: need("brand"), file: path.resolve(need("file")), as: val("as"), kind: val("kind"), colours: val("colours"), primary: !!args.primary });
  else if (cmd === "check") r = await checkBrand({ brand: need("brand"), online: !!args.online });
  else if (cmd === "apply") r = applyBrand({ brand: need("brand"), project: need("project") });
  else if (cmd === "inventory") r = await inventoryKit({ kit: need("kit"), brand: need("brand"), name: val("name") });
  else if (cmd === "compile-prompt") { process.stdout.write(compilePrompt({ kit: need("kit"), brand: need("brand") }) + "\n"); process.exit(0); }
  else if (cmd === "set") r = setEntry({ brand: need("brand"), file: need("file"), kind: val("kind"), colours: args.colours === true ? "" : val("colours"), primary: !!args.primary, family: val("family"), weight: val("weight"), style: val("style"), tags: args.tags === true ? "" : val("tags"), note: args.note === true ? "" : args.note !== undefined ? String(args.note) : null, remove: !!args.remove });
  else if (cmd === "compile") r = await compileKit({ kit: need("kit"), brand: need("brand"), name: val("name"), claude: val("claude"), model: val("model") || "claude-sonnet-5-5" });
  else fail("usage: brand-assets.mjs import|add|check|apply|inventory|compile-prompt|set|compile (see the header)");
  console.log(JSON.stringify(r, null, 2));
} catch (e) { fail(e.message); }
