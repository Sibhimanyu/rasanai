// One call for every Final writer that is not console/delivery: what does this render truly count as? (V3 W09 bypass closure; references/temporal-review.md)
//   finalCompletion(run, file) -> null (no run, revision 1, legacy run) | { state, label, allowed_labels, status_line, output_file } | { error }
// Wraps creative-run.completionFor (assessCompletion over the real output digest and the latest Final review). Revision 2 only: revision 1 returns null and
// callers add nothing. `draft` is always allowed and is the label unless the assessment is `ready`. Never throws: a failure is returned as { error } and the
// caller records it in its own output (no silent swallow, no refusal).
import fs from "node:fs";
import path from "node:path";
import { planRevision, completionFor } from "./creative-run.mjs";
import { completionStatusLine } from "./creative-completion.mjs";

export function finalCompletion(run, file) {
  if (!run || run === true) return null;
  const r = path.resolve(String(run));
  try {
    if (!fs.existsSync(path.join(r, "crew", "plan.json"))) return null;
    if (planRevision(r) < 2) return null;
    const a = completionFor(r, { outputFile: file && fs.existsSync(String(file)) ? path.resolve(String(file)) : null });
    if (!a) return null;
    return { state: a.state, label: a.state === "ready" ? "ready" : "draft", allowed_labels: a.allowedLabels || ["draft"], status_line: a.status_line || completionStatusLine(a), output_file: a.output_file || null };
  } catch (e) { return { error: `completion assessment failed: ${e && e.message ? e.message : e}`, label: "draft", allowed_labels: ["draft"] }; }
}
