// openfilm adapter: DISABLED, experimental interchange (P2). No renderer is wired; nothing is probed beyond the flag.
import { gate, rejectDisabled } from "../common.mjs";
const WHY = "experimental interchange adapter (P2), not implemented yet";
export default {
  id: "openfilm",
  async available() {
    const g = gate("openfilm", false);
    return { available: false, reason: WHY, license_status: "not applicable until implemented; check the format's license before use", enable_hint: g.why, limits: { priority: "P2", scope: "project interchange only, no rendering" } };
  },
  async analyze() { throw new Error("adapter openfilm is disabled: " + WHY); },
  renderPreview: rejectDisabled("openfilm", WHY),
  renderFinal: rejectDisabled("openfilm", WHY),
};
