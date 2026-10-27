# Resume this 3D work

Read `HANDOFF.md`, then the relevant component README. For a later agent session,
paste this prompt and point it at the restored project:

> Continue the Rasan 3D character project from `apps/rasan-3d/HANDOFF.md`.
> Inspect the existing `.blend`, `.glb`, references and comparison renders first.
> Rasan, Tara, Kavi and Chitra already exist as rigged Blender assets;
> `crew/Crew.blend` contains all four. Rasan's cap must follow the original
> reference's sloping newsboy shape. Keep the richer gold body and deeper soft
> shadows. Do not substitute the old procedural Three.js model or generated
> character images. Preserve the rigs and named clips. Read `DECISIONS.md` and
> `TODO.md`. Make the change I request next; do not automatically rebuild assets
> or generate remaining characters. Validate changed GLBs using the independent
> viewer and compare actual renders. Save manual variants separately before
> running generators. Preserve this checkpoint before making new changes.

First checks:

1. If restoring an archive, follow `RESTORE.md` and verify its manifest.
2. Open `crew/Crew.blend` or an individual model; watch the eight-second short.
3. Read individual comparisons as well as the family portrait.
4. Clarify the next specific change if the user has not supplied one.
5. Install Node dependencies only if using the browser/code pipeline.

The optional character-choice question was skipped. Tara, Kavi and Chitra are
complete as the first-three set. Laya, Rasika and Mala remain future work.
