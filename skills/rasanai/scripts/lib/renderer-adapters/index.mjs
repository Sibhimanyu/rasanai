// Adapter registry (Contract E). Each adapter: {id, available(), analyze(project), renderPreview(project, opts), renderFinal(project, opts)}.
import hyperframes from "./adapters/hyperframes.mjs";
import remotion from "./adapters/remotion.mjs";
import openfilm from "./adapters/openfilm.mjs";
import rive from "./adapters/rive.mjs";
import { gate } from "./common.mjs";

export const ADAPTERS = [hyperframes, remotion, openfilm, rive];
export const get = (id) => ADAPTERS.find((a) => a.id === id);
const LICENSED = new Set(["remotion", "rive"]);

export async function describe(a) {
  let p;
  try { p = await a.available(); } catch (e) { p = { available: false, reason: `probe failed: ${e.message}`, limits: {} }; }
  const isDefault = a.id === "hyperframes";
  const g = gate(a.id, LICENSED.has(a.id));
  const enabled = isDefault ? true : g.enabled;
  const { available, reason, license_status, limits, ...rest } = p;
  return { id: a.id, default: isDefault, available: !!available, enabled, reason: isDefault || enabled ? reason : `${reason}; disabled: ${g.why}`, license_status, limits: limits || {}, ...rest };
}
