# Ending on the brand's own clip

When a brand supplies an official end clip (a logo sting, an end card), the film's last shot must meet it without a visible seam. The method (adapted in idea from onetake's product-demo notes, PolyForm Noncommercial; our words):

1. Extract the end clip to frames at the film's fps. From its FIRST frame on, the composition draws those frames full screen (a `<video>` or frame sequence layer owned by the framework, not tweened).
2. Before that frame, land the film's subject on the EXACT screen spot of the logo in frame 1: measure the logo's centre and size in frame 1, work the subject's pose backwards from that spot (the world-pose `U.world().unmap` of RasanUI, or the inverse of the camera's own transform), and make the last move of the film arrive there on a decelerating curve.
3. Cross over: in the last 4 to 8 frames, cross-fade the subject to a CROP of the logo from the clip while the ground fades to the clip's background colour (the two must match in size and position, so the cut into the clip is invisible).
4. Hold the clip's own timing; never retime it, never add a tagline over it. The film's CTA beat is this clip, and the 0.6 to 1.4 s hold rule does not apply to a supplied sting (use its length, but count it in the 25% CTA share).
5. Check: the frame before the clip and the clip's first frame, side by side, differ only in the logo's own detail (by eye on two stills now; a `frame-gate --stills` comparison once that exists). The sound handoff follows the same seam (see `references/sound.md`).

Use only when the brand really supplies a clip; otherwise build one of the closes in `library/motion/closes/`.
