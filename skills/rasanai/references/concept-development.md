# Concept development: different films, not differently decorated outlines

Read by the script writer (treatments mode) and the script editor. Applies when a treatment carries `extensions.creative_thinking` (the v3 concept layer, `lib/treatment.mjs`); a legacy treatment or a revision-1 film is judged by `references/story.md` as before. Nothing here adds an approval stage, a card key or a question: Brief > Story > Look > Storyboard > Build > Final is unchanged, and the user still picks one of the existing Story cards.

## The development pass (three writers, a pool of 12+, a jury)

1. **Read the brief** (audience, purpose, emotional movement, factual constraints, the claim and its scope). Name the obvious category film and say whether it is the right film (it often is; it is also the one every competitor makes).
2. **Three independent concept writers** run in parallel, each at **high effort** on the strongest model, each told to think hard and to overgenerate (12+ raw seeds, then 4+ developed ideas): `concept-writer-story` (a human moment), `concept-writer-style` (a visual world first), `concept-writer-wild` (a game, a myth, a format hijack, a world, a character, a type poem). They do not see each other's files. The pool is **12 or more developed-or-sketched ideas**; an explicit user count wins. They write `story/ideas-<lane>.json`; each idea is a **visual plan** (`style_world`, `carrier`, `signature_moment`, `sound_mode`, `product_truth`, `first_watch`, `shots[]`), not an outline of headlines.
3. **The jury picks three** (the script editor, with the concept critic's questions in mind): the three must differ in **organizing idea AND style world** (and not in pace). Reject an idea whose shots are mostly UI cards and headlines, whose claim or real product is not unmistakable by 60%, or that needs a capability the product does not have. Prefer one idea from each lane when the pool allows, but never a weaker idea to fill a lane; two from one lane is fine if they are the strongest and differ. Record the choice and the reasons (including why the obvious film lost) in `story/jury.json`: `{ picks: [{id, lane, why}], dropped: [{id, why}], obvious_film, distinctness: "<how the three differ in idea and in style>" }`.
4. **The script writer develops the three** into full treatments or pitches (it does not replace them). Each keeps its visual plan.
5. The editor challenges the set once (below). Revise only named weaknesses, once. An infeasible idea is replaced from the pool (the cut ideas are the bench) before the user is asked to choose.

## The concept record

`extensions.creative_thinking = { version: 1, development: { concept: {...} }, direction, commitments, continuity, review_requirements }`. You write `development.concept`; leave the other sections to their owners and never delete them. Existing treatment fields stay where they are.

| Field | Meaning |
|---|---|
| `concept_kind` | open label: product-documentary, character, material, typographic, formal-system, editorial-rhythm, explanatory-model, atmospheric, hybrid... |
| `organizing_mechanism` (alias `organizing_idea`) | the one thing that organizes the film: its causal mechanism, perspective, temporal structure or picture-to-proof relation |
| `visual_mechanism` | what a viewer sees happen (observable), or the formal relationship that develops |
| `visual_reasoning_mode` | narrative, demonstrative, formal, editorial, atmospheric or hybrid. Internal; not a communication kind, a question or a route. A formal film (geometry, type, an evolving system) needs no character or product-causal event in every passage, but it does need a subject, an invariant the viewer can follow, operations, contrast and an intended effect |
| `emotional_arc` | `{opening, development, ending}` or `{movement: "from X to Y"}` |
| `opening_question`, `ending_answer` | what the opening raises and how the last frame answers it |
| `product_connection` | why this idea belongs to this product, audience or brief ("it is a demonstration" is honest) |
| `evidence_plan` | which proof carries which beat |
| `feasibility` | `{state: supported / supported-with-risk / needs-direction / capability-blocked / unknown, needs, risks, supported_alternative, basis}`. Say what the capability sources show; unknown is honest. Never present a blocked idea as buildable: offer a supported direction |
| `provisional_medium_options`, `continuity_scope`, `creative_risks` | provisional; Look and continuity lanes decide |
| `explanation_model` | tutorials and demos: how it teaches (by example, by contrast, by walk-through, by question) |
| `mechanism_status` | `exploratory`, `writer-chosen`, `brief-fixed`, `user-fixed` |
| `distinct_from` | `{from: [candidate ids], why}` or `[{id, how}]`: how this differs in causal mechanism, perspective, temporal structure, emotional movement or picture-to-proof relation. Not every axis must differ; a shared brand and proposition are expected |

## Contrast: the editor decides, the helper only structures

The gate `story.mjs check` also errors `shared-style-world` when two pitches use the same `style_world`, and warns on the same shape or carrier. `validateConceptContrast(set, ctx)` checks structure only: every candidate has a record, `distinct_from` cites real sibling ids and says how, and in proposal mode the brief's mechanism is not adopted by every candidate. It also reports hints (identical organizing mechanism text, the `compareCandidates` similarity numbers). It never measures token distance as a verdict: different wording does not prove a different idea and a repeated noun does not prove duplication.

The script editor, in its existing bounded pass:
- reads the hints, then judges whether two candidates are the same film reordered or re-skinned (three card tours that only reorder the same headline/card feature walk are one organizing mechanism: name the substantive alternative that is missing, by its mechanism);
- does not reject three faithful explanatory alternatives for a narrow tutorial because they share the product's UI; for those it asks whether the explanation model, point of view or evidence structure differs;
- flags a candidate that only has mood adjectives (`concept-no-observable-occurrence`) and names the missing action or argument;
- flags a candidate that conflicts with a format the brief fixed (an unrelated character comedy for a genre-fixed brief) as a mismatch, not a diversity failure;
- stops at the revision limit and reports the remaining tradeoffs within the current choices and budget.

## Proposal mode

When the brief is a proposal that already contains a mechanism (a single carried-word rail, a card walk), that mechanism stays **exploratory**: at most one candidate may develop it, the others find genuinely different mechanisms, and none is marked `brief-fixed` unless the owner said it must be.

## Selected treatment and later stages

The winning treatment becomes selected intent only after the existing Story action is consumed. A Story that changes after Look development goes through the existing revision mechanism (a current Story decision, dependent Look and boards invalidated); a Look preference never rewrites an approved Story. The development trace records rejected directions and reasons compactly, never raw model reasoning.

## Per communication kind: what the concept must still carry

The concept serves the kind's proof; it never replaces it, and no kind demands a surprise turn.

| Kind | The concept must keep |
|---|---|
| whole-product-introduction | a product-specific organizing idea and truthful proof of the main job; not a feature census |
| single-feature-announcement | the real changed behavior and availability/version; the visual idea explains the feature |
| workflow-demo | a reproducible ordered task and its result; creativity in explanation, no invented steps |
| instructional-explainer | a sourced relationship made understandable; analogy limits stay clear |
| brand-manifesto | a coherent stance and emotional movement in the permitted identity; no compulsory interface demo |
| identity-reveal | the exact approved identity recognizable; no mandatory largest CTA type |
| performance-ad | offer and qualifiers legible in context; the idea serves the action |
| teaser | anticipation and only confirmed facts; no whole-product tutorial |
| event-opener | audience orientation, venue-appropriate readability; no mobile-only assumption |
| evidence-case-study | attributed, permitted results with their qualifiers; no invented improvement graph |
| character-short | readable acting and emotional consequence; no mandatory product card |
| music-lyric-film | supplied lyrics, rights and sync; expressive picture-to-music relationship; no launch grammar spillover |
| footage-led-story | the speakers' meaning and editorial causality; generated events never presented as recorded |

## Not banned, not required

Cards, tutorials, transformation, stillness, montage, a metaphor, a world, a character, a game, a myth, an illustration, a joke, clean typography, a typographic essay: examples, never quotas or bans. Product truth (the claim and the real product unmistakable by 60%) is the only fixed rule on a launch. Cover-the-logo and competitor-swap are diagnostics for generic thinking, not hard tests: some factual demonstrations are inherently category-like and still right. A quiet authoritative tutorial is not rejected for lacking a surprise.

## Deferred acceptance cases (specs only, not run)

CON-01..08 and KND-01..13 live in `.context/creative-mega-v3-handoff-20261027/rasanai-creative-overhaul-v3/24_DEFERRED_CASE_MATRIX.md`. Expected observations: CON-01 shared mechanism named plus an alternative proposed; CON-02 no rejection for common UI; CON-03 brief mechanism kept exploratory (`concept-mechanism-preselected` only when every candidate adopts it); CON-04 `concept-no-observable-occurrence`; CON-05 `concept-infeasible` (or `-disclosed` with a supported direction); CON-06 `concept-kind-mismatch`; CON-07 stop at the limit, tradeoffs disclosed; CON-08 existing revision path, no silent rewrite. KND rows: the table above.
