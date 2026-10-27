// remotion adapter: DISABLED. Remotion has its own license (eligibility varies by organisation). Probe is passive: never runs it.
import { gate, rejectDisabled, pkgVersion, which } from "../common.mjs";
const LICENSE = "separate license; eligibility varies by organisation; explicit opt-in required";
export default {
  id: "remotion",
  async available() {
    const g = gate("remotion", true);
    const local = pkgVersion("remotion", [process.cwd()]) || pkgVersion("@remotion/renderer", [process.cwd()]);
    const cli = which("remotion");
    return { available: !!(local || cli), reason: local || cli ? "a local install exists (not run)" : "no local install found; RasanAI never installs it", license_status: LICENSE,
      enable_hint: g.why, probe: { local_version: local, cli }, limits: { note: "interchange/preview only if enabled; React compositions are not RasanAI scenes; never default" } };
  },
  async analyze() { throw new Error("adapter remotion is disabled: " + LICENSE); },
  renderPreview: rejectDisabled("remotion", LICENSE),
  renderFinal: rejectDisabled("remotion", LICENSE),
};
