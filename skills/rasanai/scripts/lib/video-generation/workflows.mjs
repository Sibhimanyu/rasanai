// Approved workflow templates (ComfyUI API-format JSON in ./workflows). Templates are data: ids only, no submitted paths or code.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { digest } from "./util.mjs";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "workflows");
export function approved() {
  const idx = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8"));
  return idx.workflows.map((w) => {
    const template = JSON.parse(fs.readFileSync(path.join(DIR, path.basename(w.file)), "utf8"));
    return { ...w, template, workflow_digest: digest(template) };
  });
}
export function getWorkflow(id) {
  const w = approved().find((x) => x.id === id);
  if (!w) throw new Error(`workflow "${id}" is not on the approved list (${approved().map((x) => x.id).join(", ")})`);
  return w;
}
// "{{x}}" (whole string) -> typed value; embedded "{{x}}" -> text. Single pass: values are never re-expanded.
export function fill(template, params) {
  const missing = new Set();
  const walk = (v) => {
    if (typeof v === "string") {
      const whole = v.match(/^\{\{(\w+)\}\}$/);
      if (whole) { if (!(whole[1] in params)) missing.add(whole[1]); return params[whole[1]]; }
      return v.replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in params)) missing.add(k); return String(params[k]); });
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  const g = walk(template);
  if (missing.size) throw new Error("workflow parameters missing: " + [...missing].join(", "));
  return g;
}
export function checkGraph(w, graph) {
  const bad = Object.values(graph).filter((n) => !w.allowed_nodes.includes(n.class_type)).map((n) => n.class_type);
  if (bad.length) throw new Error("workflow uses nodes outside the approved list: " + [...new Set(bad)].join(", "));
}
