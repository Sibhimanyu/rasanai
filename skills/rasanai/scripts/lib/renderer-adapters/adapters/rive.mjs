// rive adapter: DISABLED (P2). Only user-supplied, legally exported .riv files; RasanAI never fetches or authors them.
import { gate, rejectDisabled } from "../common.mjs";
const WHY = "P2; accepts only user-supplied, legally exported .riv files; no runtime is bundled";
export default {
  id: "rive",
  async available() {
    const g = gate("rive", true);
    return { available: false, reason: WHY, license_status: "each .riv carries its author's license; the user must confirm they may use it; explicit opt-in required", enable_hint: g.why, limits: { priority: "P2", input: "user-supplied .riv only" } };
  },
  async analyze() { throw new Error("adapter rive is disabled: " + WHY); },
  renderPreview: rejectDisabled("rive", WHY),
  renderFinal: rejectDisabled("rive", WHY),
};
