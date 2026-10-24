// Minimal HTML snippet wiring the runtime call (contract B: RasanMotionKit.apply).
export function scaffold(item) {
  const defaults = Object.fromEntries(Object.entries(item.params || {}).map(([k, v]) => [k, v.default]));
  const list = (a) => (a && a.length ? a.join(", ") : "none");
  return `<!-- ${item.label}: ${item.summary} -->
<script src="../../runtime/rasan-motion-kit.js"></script>
<div class="clip scene" id="scene-root" data-start="0" data-duration="4" data-track-index="0"
     data-motion-kit="motion-kit:${item.id}@${item.version}">
  <div id="kit-target"><!-- target content --></div>
</div>
<script>
  (function () {
    var tl = gsap.timeline({ paused: true });
    var res = window.RasanMotionKit.apply({
      id: "${item.id}",
      timeline: tl,
      target: document.getElementById("kit-target"),
      design: window.__design || {},   // brand tokens: ${list(item.brand_inputs)}
      motion: window.__motion || {},   // motion contract: ${list(item.motion_inputs)}
      fps: 30,
      seed: 1,
      cues: [],
      props: ${JSON.stringify(defaults)}
    });
    // res = { id, version, duration, hits: [t_s, ...] }
    window.__timelines = window.__timelines || {};
    window.__timelines["scene-root"] = tl;
  })();
</script>
`;
}
