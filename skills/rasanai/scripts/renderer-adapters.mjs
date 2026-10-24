#!/usr/bin/env node
// Renderer adapters (Motion Studio, contract E). hyperframes is the only default; remotion, openfilm and rive are off unless
// RASANAI_ADAPTER_<ID>=1 (remotion and rive also need RASANAI_ADAPTER_<ID>_LICENSE_ACK=1). Probes never render, install or download.
//   node renderer-adapters.mjs doctor            JSON {adapters:[{id, available, reason, license_status, enabled, limits, ...}]}
//   node renderer-adapters.mjs list              every adapter with default/enabled/available flags
//   node renderer-adapters.mjs enabled           adapters that may render now (always includes hyperframes)
//   node renderer-adapters.mjs describe <id>     one adapter's full record
// Exit: 0 ok (optional adapters never fail doctor), 1 hyperframes itself unavailable (JSON still printed), 2 usage error.
import { ADAPTERS, get, describe } from "./lib/renderer-adapters/index.mjs";

const out = (o) => console.log(JSON.stringify(o, null, 2));
const [cmd, arg] = process.argv.slice(2);

if (cmd === "doctor") {
  const adapters = await Promise.all(ADAPTERS.map(describe));
  const hf = adapters.find((a) => a.id === "hyperframes");
  out({ ok: hf.available, default: "hyperframes", adapters });
  process.exit(hf.available ? 0 : 1);
} else if (cmd === "list" || cmd === "enabled") {
  const all = await Promise.all(ADAPTERS.map(describe));
  const rows = cmd === "enabled" ? all.filter((a) => a.enabled) : all;
  out({ adapters: rows.map((a) => ({ id: a.id, default: a.default, enabled: a.enabled, available: a.available })) });
} else if (cmd === "describe" && arg) {
  const a = get(arg);
  if (!a) { out({ ok: false, error: `unknown adapter: ${arg}`, known: ADAPTERS.map((x) => x.id) }); process.exit(2); }
  out(await describe(a));
} else {
  console.error("usage: renderer-adapters.mjs doctor | list | enabled | describe <hyperframes|remotion|openfilm|rive>");
  process.exit(2);
}
