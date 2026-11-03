// The Motion Laws: content and illustrations for docs/motion-laws.html and docs/motion-laws/<slug>.html.
// Run `node scripts/motion-laws/build.mjs` to regenerate the pages. Illustrations are inline SVG; the
// animation is plain CSS in docs/assets/laws.css, played once when a card scrolls into view (and again on
// hover or focus). With reduced motion nothing animates and the static frame is the lesson.

const v = (o) => Object.entries(o).map(([k, x]) => `--${k}:${x}`).join(";");
// an element that animates in: opts = delay d, duration t, ease e, from-offset fx/fy, from-scale fs, origin o
const g = (o, inner, cls = "in") => `<g class="${cls}" style="${v(o)}">${inner}</g>`;
const tx = (x, y, s, a = "middle", c = "tx") => `<text class="${c}" x="${x}" y="${y}" text-anchor="${a}">${s}</text>`;
const ln = (d, c, o = {}) => `<path class="ln ${c} draw" pathLength="1" style="${v(o)}" d="${d}"/>`;
const ring = 'stroke="#1b1f5e" stroke-width="2.5"';

export const GROUPS = [
  { id: "story", name: "Story", blurb: "What a film says, in what order, and how it asks for the next step." },
  { id: "motion", name: "Motion", blurb: "How things move: weight, curves, timing and the habit of never standing still." },
  { id: "scenes", name: "Scenes and rhythm", blurb: "How scenes follow each other so the film has a pulse." },
  { id: "type", name: "Type and image", blurb: "What the frame is made of: type at scale, real objects, real product." },
  { id: "rare", name: "Rare tools and AI clichés", blurb: "The moves everyone reaches for, and the budget each one gets." },
  { id: "access", name: "Accessibility", blurb: "The two limits no style is allowed to break." },
];

const SRC_ENGINE = "RasanAI launch grammar, studied from real launch films. An engine rule, not an academic law.";

export const LAWS = [
  // ---------------------------------------------------------------- STORY
  {
    slug: "the-arc", group: "story", title: "The arc",
    law: "Every launch film runs hook, turn, meet, capabilities, payoff.",
    explain: "The order is fixed and the content changes every time. Each beat does one job, so a viewer who has never heard of the product can follow it with the sound off: a problem they feel, a pivot, the reveal, two or three proofs, and a close.",
    film: "The score declares a role for every beat (hook, turn, meet, capability, payoff) and the motion follows the role: tight and urgent in the hook, one sharp move on the turn, the longest and calmest entrance on the meet, the longest holds at the payoff.",
    points: ["One thought per beat, with on-screen type carrying the story.", "The hook is the viewer's problem, with no logo and no product name.", "The meet is small and calm, on an empty ground.", "Two or three capabilities, each proving one thing."],
    source: SRC_ENGINE,
    alt: "A curved path with five labelled points: Hook, Turn, Meet, Proof, Payoff.",
    art: () => `${ln("M30 140 C60 140 65 80 95 80 C125 80 130 120 160 120 C190 120 195 70 225 70 C255 70 260 40 290 40", "si", { t: "1.6s", e: "ease-in-out" })}
${[[30, 140], [95, 80], [160, 120], [225, 70]].map(([x, y], i) => g({ d: `${0.3 + i * 0.35}s`, fs: 0.2, t: ".4s" }, `<circle class="fi" cx="${x}" cy="${y}" r="7"/>`)).join("")}
${g({ d: "1.6s", fs: 0.2, t: ".4s" }, `<circle class="ft" cx="290" cy="40" r="9" ${ring}/>`)}
${[["Hook", 30], ["Turn", 95], ["Meet", 160], ["Proof", 225], ["Payoff", 290]].map(([s, x]) => tx(x, 176, s)).join("")}`,
  },
  {
    slug: "what-and-for-whom", group: "story", title: "Say what it is, and for whom, early",
    law: "Name the category and the audience before the logo, within the first quarter.",
    explain: "A viewer who cannot say what the product is and who it is for after the first quarter of the film stops watching. Clarity comes before the brand: the hook or the turn does it in plain words, and the product name waits for the meet.",
    film: "The concept check flags a score that reaches the logo without a line that makes the category and the audience clear. A hook such as \"Your next deal is in here somewhere\" does both at once: a deal, and a person who closes deals.",
    points: ["By the end of the turn, about 20 to 25 percent of the runtime.", "In plain words, not a tagline.", "Before the logo, never after it.", "A five-second cold read is the test: can a stranger name the category and the audience?"],
    source: SRC_ENGINE,
    alt: "A timeline bar. The first quarter is filled and marked what and for whom. The logo dot comes later.",
    art: () => `<rect class="fm" x="30" y="96" width="260" height="14" rx="7"/>
${g({ t: "1.2s", e: "cubic-bezier(.4,.14,.3,1)", o: "0% 50%" }, `<rect class="ft" x="30" y="96" width="68" height="14" rx="7"/>`, "grow")}
<path class="ln si" d="M30 80v-12h68v12"/>${tx(64, 56, "what + for whom")}
${g({ d: "1.1s", fs: 0.2, t: ".4s" }, `<circle class="fi" cx="124" cy="103" r="8"/>`)}
<path class="ln si" d="M124 120v14"/>${tx(124, 150, "logo")}
${tx(30, 182, "0", "start")}${tx(290, 182, "end of film", "end")}`,
  },
  {
    slug: "one-message", group: "story", title: "One message",
    law: "Say one thing; every beat serves it.",
    explain: "A film that says three things is remembered as none. The concept is written as a single sentence, and each beat has to be a reason to believe it, not a new topic.",
    film: "The concept declares `one_message`. The critic reads each beat against it, and a beat that serves something else is cut or reworded. It follows the coherence principle in multimedia learning: leave out what does not support the point.",
    points: ["One sentence, written before any beat.", "Capabilities are proofs of the message, not a feature tour.", "Anything that does not serve it goes, however nice it looks."],
    source: "Coherence principle, Richard Mayer, Multimedia Learning. Applied here to film structure.",
    alt: "Five thin lines from five small beats converge on one large circle.",
    art: () => `${[30, 66, 102, 138, 174].map((y, i) => `${ln(`M36 ${y} C120 ${y} 180 100 240 100`, "sg", { d: `${i * 0.12}s`, t: ".7s" })}${g({ d: `${i * 0.12}s`, t: ".3s", fs: 0.3 }, `<circle class="fb" cx="36" cy="${y}" r="6"/>`)}`).join("")}
${g({ d: "0.9s", fs: 0.2, t: ".5s" }, `<circle class="ft" cx="262" cy="100" r="22" ${ring}/>`)}`,
  },
  {
    slug: "claim-then-proof", group: "story", title: "Claim, then proof",
    law: "Every claim is followed by the product doing it.",
    explain: "A line is a promise; the product doing the job is the evidence. A capability beat pairs one short line with one simplified screen that proves it, so the viewer does not have to take our word for it.",
    film: "The first UI proof lands by about 40 percent of the runtime, and at least one beat shows the core job being done. Numbers and claims come from `research/claims.json`, so an invented claim cannot reach the screen.",
    points: ["One line, one proof, side by side or back to back.", "The proof is the product doing the job, not decoration.", "Social proof is real or absent."],
    source: SRC_ENGINE,
    alt: "A text card on the left, an arrow, and a chart card on the right with a check mark.",
    art: () => `${g({ fx: "-24px", t: ".6s" }, `<rect class="fw" x="22" y="64" width="112" height="72" rx="10"/><rect class="fi" x="36" y="82" width="74" height="9" rx="4.5"/><rect class="fg" x="36" y="100" width="52" height="7" rx="3.5"/>`)}
${tx(78, 158, "claim")}
${ln("M144 100h28m-9-8l9 8-9 8", "si", { d: ".6s", t: ".4s" })}
${g({ fx: "24px", d: ".9s", t: ".6s" }, `<rect class="fw" x="186" y="52" width="112" height="96" rx="10"/><rect class="fm" x="202" y="108" width="14" height="28" rx="3"/><rect class="fb" x="224" y="90" width="14" height="46" rx="3"/><rect class="fi" x="246" y="72" width="14" height="64" rx="3"/>`)}
${g({ d: "1.5s", fs: 0.2, t: ".4s" }, `<circle class="ft" cx="282" cy="64" r="11"/><path class="ln si" d="M276 64l4 4 7-8" style="stroke-width:2.2"/>`)}
${tx(242, 170, "proof")}`,
  },
  {
    slug: "peak-end", group: "story", title: "Peak and end",
    law: "People judge an experience by its peak and how it ends, so build both.",
    explain: "We remember the most intense moment and the last one, not the average. A film is short enough that both can be designed: one moment the viewer would rewind, and an ending that holds long enough to land.",
    film: "The engine spends everything on one signature moment (the object splitting the word, the count-up landing) and gives the payoff the longest holds of the film, with an accent curve of its own on the closing hit.",
    points: ["Pick the one moment you want rewound and protect it.", "Make the ending the calmest, longest hold.", "Do not spread effort evenly; the average is not what is remembered."],
    source: "Peak-end rule: Kahneman and colleagues. See Laws of UX, Peak-End Rule.",
    srcUrl: "https://lawsofux.com/peak-end-rule/",
    alt: "A rising and falling curve with a marked peak near the middle and a marked end on the right.",
    art: () => `<path class="ln sg" d="M20 160H300" style="stroke-width:1.5"/>
${ln("M20 140 C48 126 66 150 96 112 S146 40 170 38 S214 126 242 112 S274 84 300 76", "si", { t: "2s", e: "ease-in-out" })}
${g({ d: "1.15s", fs: 0.2, t: ".4s" }, `<circle class="ft" cx="170" cy="38" r="9" ${ring}/>`)}
${g({ d: "2s", fs: 0.2, t: ".4s" }, `<circle class="ft" cx="300" cy="76" r="9" ${ring}/>`)}
${tx(170, 22, "peak")}${tx(286, 104, "end", "end")}${tx(20, 180, "time", "start")}`,
  },
  {
    slug: "clear-call-to-action", group: "story", title: "A clear call to action",
    law: "End on a verb and a destination, and hold it long enough to read.",
    explain: "The viewer needs to know the next step and have time to take it in. A bare logo end card gives nothing to do. A verb plus a destination does, if it stays on screen.",
    film: "The final beat carries a line such as \"Download for macOS\" or \"Join the waitlist\" and holds it for at least 2 seconds, while ambient motion keeps the frame alive.",
    points: ["A verb plus a destination, in plain words.", "On the last beat, with the logo.", "Held at least 2 seconds."],
    source: SRC_ENGINE,
    alt: "An end card with a headline bar, a button reading Download for macOS, and a timer bar showing a hold of two seconds or more.",
    art: () => `<rect class="fw" x="52" y="22" width="216" height="118" rx="12"/>
<rect class="fi" x="76" y="42" width="110" height="10" rx="5"/><rect class="fg" x="76" y="60" width="80" height="8" rx="4"/>
${g({ d: ".4s", fs: 0.8, t: ".5s" }, `<rect class="ft" x="76" y="88" width="168" height="32" rx="16"/><text class="txb" x="160" y="108" text-anchor="middle">Download for macOS</text>`)}
<rect class="fm" x="52" y="156" width="216" height="8" rx="4"/>
${g({ d: "1s", t: "2s", e: "linear", o: "0% 50%" }, `<rect class="fb" x="52" y="156" width="216" height="8" rx="4"/>`, "grow")}
${tx(52, 184, "held 2 s or more", "start")}`,
  },
  {
    slug: "copy-is-the-spine", group: "story", title: "Copy is the spine",
    law: "One thought per line, a few words, one emphasised word.",
    explain: "People read while the picture moves, so the words have to be quick: second person, plain language, three to seven words on screen at once. One word per line carries the turn, and the eye lands on it.",
    film: "The copy linter flags brochure language and buzzwords. Each line gets exactly one emphasised word (colour, weight, size or italic), and a longer line is split into two beats rather than shown faster.",
    points: ["Second person, plain words.", "Three to seven words on screen at once.", "Exactly one emphasised word per line.", "Cut words before speeding up the type."],
    source: "Signaling principle, Richard Mayer, Multimedia Learning: cue the one thing that matters.",
    alt: "Two short lines of large type, Your next deal and is in here, with the word here highlighted in yellow.",
    art: () => `${["Your", "next", "deal"].map((w, i) => g({ d: `${i * 0.35}s`, t: ".01s" }, `<text class="big" x="${40 + i * 84}" y="84" text-anchor="start">${w}</text>`)).join("")}
${g({ d: "1.05s", t: ".01s" }, `<text class="big" x="40" y="134" text-anchor="start">is in</text>`)}
${g({ d: "1.4s", t: ".01s" }, `<rect class="ft" x="136" y="106" width="86" height="36" rx="4"/><text class="big" x="144" y="134" text-anchor="start">here</text>`)}
${tx(40, 180, "one emphasised word", "start")}`,
  },
  {
    slug: "benefit-not-feature", group: "story", title: "Benefit, not feature; specific, not vague",
    law: "Say what happens for the viewer, with something they could check.",
    explain: "The viewer buys the outcome, not the mechanism. \"Faster, better, smarter\" cannot be checked; \"12 follow-ups before lunch\" can. The mechanism belongs in the UI proof, where it is shown instead of read.",
    film: "A capability line states the outcome and, where one exists, a true number from `research/claims.json`. Words such as \"AI-powered\" are caught by the buzzword list and replaced with the specific thing the product does.",
    points: ["The line is the outcome; the screen is the mechanism.", "A number can be checked, an adjective cannot.", "Never invent a number to sound specific."],
    source: SRC_ENGINE,
    alt: "A vague line, Faster, smarter, better, is struck through. Below it a specific line reads 12 follow-ups before lunch, with a check mark.",
    art: () => `<text class="muted" x="160" y="68" text-anchor="middle">Faster, smarter, better</text>
${ln("M56 63H264", "sr", { d: ".5s", t: ".5s" })}
${g({ d: "1.1s", fy: "8px", t: ".6s" }, `<text class="strong" x="160" y="132" text-anchor="middle">12 follow-ups before lunch</text>`)}
${g({ d: "1.6s", fs: 0.2, t: ".4s" }, `<circle class="ft" cx="160" cy="164" r="11"/><path class="ln si" d="M154 164l4 4 8-9" style="stroke-width:2.2"/>`)}`,
  },

  // ---------------------------------------------------------------- MOTION
  {
    slug: "purpose-and-one-hero", group: "motion", title: "Purpose, and one hero",
    law: "Every move has a job, and each beat has one hero motion.",
    explain: "Motion that does not direct the eye, show cause and effect or carry a thought is noise. In each shot one thing is the hero, a second supports it a few frames behind, and everything else stays quiet.",
    film: "Every tween is scored with a layer (hero, support or ambient). The hero travels the furthest and fastest; support moves less and arrives later. Decorative loops on content are rejected.",
    points: ["Ask what each move tells the viewer.", "One hero per shot; the rest support it.", "Quiet things stay quiet, so the hero reads."],
    source: "Apple Human Interface Guidelines, Motion: use motion purposefully and avoid gratuitous animation. Disney's staging principle: one idea at a time.",
    srcUrl: "https://developer.apple.com/design/human-interface-guidelines/motion",
    alt: "One large yellow circle travels far from the left. Three small circles behind it barely move.",
    art: () => `${[[110, 46], [180, 156], [270, 52]].map(([x, y], i) => g({ fx: "10px", d: `${0.1 + i * 0.1}s`, t: "1s", e: "ease-out" }, `<circle class="fg" cx="${x}" cy="${y}" r="9"/>`)).join("")}
${g({ fx: "-190px", t: "1s" }, `<circle class="ft" cx="210" cy="104" r="30" ${ring}/>`)}
${tx(210, 156, "hero")}${tx(110, 78, "support")}`,
  },
  {
    slug: "natural-physics", group: "motion", title: "Natural physics",
    law: "Things ease, travel in arcs, and only overshoot when they arrive with momentum.",
    explain: "Real objects do not start and stop instantly or travel in straight lines. They ease in and out, follow curved paths, and a heavy thing barely bounces while a light thrown thing may. Overshoot without travel just looks like a wobble.",
    film: "Heavy panels get no overshoot and a longer duration; medium things 3 to 5 percent; light chips up to 15 percent, and only when thrown. Moves ease at both ends, and bodies are never linear.",
    points: ["Slow in, slow out on every body.", "Arcs, not straight lines.", "Weight classes set duration and overshoot.", "A bounce needs momentum."],
    source: "Disney's twelve principles of animation (Johnston and Thomas, The Illusion of Life): slow in and slow out, arcs, squash and stretch, follow-through.",
    alt: "A ball travels left to right in an arc and lands, with a faint dotted trail of the arc behind it.",
    art: () => `<path d="M40 150 C 90 10, 230 10, 280 150" class="ln sg" style="stroke-dasharray:3 7;stroke-width:2"/>
<ellipse class="fk" cx="160" cy="160" rx="124" ry="5" opacity=".12"/>
${g({ fx: "-240px", t: "1.5s", e: "linear" }, `<g class="hop" style="${v({ t: "1.5s" })}"><circle class="ft" cx="280" cy="146" r="11" ${ring}/></g>`)}
${tx(160, 184, "ease out going up, ease in coming down")}`,
  },
  {
    slug: "signature-curve", group: "motion", title: "One signature curve",
    law: "Put most smooth moves on one easing curve so the film has a voice.",
    explain: "A single curve used on most moves is what makes a continuous take feel designed. A few other curves are kept for contrast: a whip, a transition, the closing hit.",
    film: "A launch score declares one `signature_ease`, a hard launch with a long glide. The gate expects 70 to 85 percent of smooth moves on it and warns below 60 percent. Stepped beats set their own timing.",
    points: ["Declare it once, in the score.", "70 to 85 percent of smooth moves.", "Other curves are accents, not a menu."],
    source: "Brand motion systems commonly use one easing for most moves; the exact curve and share here are measured from real launch films.",
    alt: "A smooth fast-then-slow easing curve, above a row of ten dots of which eight are blue and two are yellow.",
    art: () => `<path class="ln sg" d="M40 100V20M40 100H290" style="stroke-width:1.5"/>
${ln("M40 100 C56 24 90 20 290 20", "si", { t: "1.2s" })}
${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => g({ d: `${1 + i * 0.08}s`, fs: 0.3, t: ".3s" }, `<circle class="${i === 3 || i === 7 ? "ft" : "fb"}" cx="${52 + i * 26}" cy="146" r="9"/>`)).join("")}
${tx(40, 182, "8 of 10 moves on the signature curve", "start")}`,
  },
  {
    slug: "exits-quicker-than-entrances", group: "motion", title: "Exits are quicker than entrances",
    law: "Leave in about two thirds of the time it took to arrive.",
    explain: "An arrival needs to be seen and understood; a departure only needs to get out of the way. A fast exit reads as intent, a slow one as lag. Better still, let the cut or the transition be the exit.",
    film: "Exit durations are scaled to about 65 percent of the matching entrance and use an accelerating curve. Entrances ease out only; an ease-in on an entrance is flagged as lag.",
    points: ["60 to 70 percent of the entrance duration.", "Entrances decelerate; exits accelerate.", "Prefer no exit at all: let the next shot replace it."],
    source: "Apple Human Interface Guidelines, Motion; and Disney's slow in and slow out. The 65 percent figure is measured from real launch films.",
    srcUrl: "https://developer.apple.com/design/human-interface-guidelines/motion",
    alt: "Two lanes. In the top lane a square arrives over a long bar. In the bottom lane a square leaves over a bar about two thirds as long.",
    art: () => `<rect class="fm" x="30" y="66" width="260" height="6" rx="3"/><rect class="fm" x="30" y="140" width="260" height="6" rx="3"/>
${g({ t: ".9s", o: "0% 50%", e: "linear" }, `<rect class="fb" x="30" y="66" width="260" height="6" rx="3"/>`, "grow")}
${g({ t: ".585s", o: "0% 50%", e: "linear" }, `<rect class="ft" x="30" y="140" width="169" height="6" rx="3"/>`, "grow")}
${g({ fx: "-200px", t: ".9s" }, `<rect class="fb" x="236" y="46" width="40" height="40" rx="8"/>`)}
${g({ tx: "200px", t: ".585s", e: "cubic-bezier(.3,0,.8,.15)" }, `<rect class="ft" x="36" y="120" width="40" height="40" rx="8" ${ring}/>`, "out")}
${tx(30, 30, "enter: 0.9 s", "start")}${tx(30, 184, "exit: 0.585 s (65%)", "start")}`,
  },
  {
    slug: "cascade-span", group: "motion", title: "Short, uneven cascades",
    law: "Stagger three to seven items inside half a second, on an irregular beat.",
    explain: "A cascade ties items together as a group. Too long and it becomes a slow queue; too regular and it reads as a metronome. Offsets that fall on a curve, a few frames apart, feel assembled rather than generated.",
    film: "Cascades span 0.5 seconds for three to seven items; a set piece may run 1.2 seconds. Offsets fall on a curve with a frame of jitter, and durations vary by about 10 percent. A visible cascade of five or more is a once-per-film set piece.",
    points: ["3 to 7 items, about 0.5 s in total.", "Offsets on a curve, never an even stagger.", "A big visible cascade is a set piece, once."],
    source: "Disney's overlapping action and follow-through. The span and offsets are measured from real launch films.",
    alt: "Five bars slide in one after another with growing gaps between them, beside a bracket labelled half a second.",
    art: () => `${[0, 0.07, 0.17, 0.3, 0.46].map((d, i) => g({ fx: "-36px", d: `${d + 0.1}s`, t: ".5s" }, `<rect class="${i === 4 ? "ft" : "fb"}" x="${40 + i * 4}" y="${26 + i * 24}" width="${190 - i * 20}" height="16" rx="8"/>`)).join("")}
<path class="ln si" d="M256 26v100" style="stroke-width:2"/>${tx(266, 80, "0.5 s", "start")}
${tx(40, 164, "offsets fall on a curve", "start")}`,
  },
  {
    slug: "counter-motion", group: "motion", title: "Counter-motion layers",
    law: "Let the background drift against the hero, at about a quarter of its speed.",
    explain: "A frame with a hero, support and an ambient layer feels deep. The ambient layer moves slowly in the opposite direction, so the hero seems to travel through space instead of sliding on a flat sheet.",
    film: "Every showcase shot has a primary, a secondary a few frames behind, and an ambient layer drifting at 20 to 30 percent of the hero speed and against its direction. The gate warns above 40 percent, and when the ambient drifts the hero's way.",
    points: ["Hero left, ambient right.", "Ambient at 20 to 30 percent of hero speed.", "Support arrives two to four frames behind."],
    source: "Parallax, used in animation since the multiplane camera; Disney's secondary action. The speed ratio is measured from real launch films.",
    alt: "Pale dots in the background drift right while a large card travels left over them, with a smaller card following it.",
    art: () => `${g({ fx: "-26px", t: "1.4s", e: "linear" }, [30, 90, 150, 210, 270].map((x, i) => `<circle class="fm" cx="${x + 14}" cy="${34 + (i % 2) * 110}" r="7"/><circle class="fm" cx="${x + 44}" cy="${100 + (i % 3) * 22}" r="5"/>`).join(""))}
${g({ fx: "90px", d: ".1s", t: "1.2s" }, `<rect class="fw" x="62" y="58" width="150" height="76" rx="10" ${ring}/><rect class="fi" x="78" y="78" width="90" height="9" rx="4.5"/><rect class="fg" x="78" y="98" width="60" height="7" rx="3.5"/>`)}
${g({ fx: "90px", d: ".28s", t: "1.2s" }, `<rect class="ft" x="196" y="92" width="72" height="42" rx="8" ${ring}/>`)}
${tx(30, 182, "hero ←", "start")}${tx(290, 182, "ambient →", "end")}`,
  },
  {
    slug: "stepped-is-for-arrivals", group: "motion", title: "Stepped for arrivals, fluid for glides",
    law: "Hold frames on discrete pop-ins; never on a smooth single-direction move.",
    explain: "Stepped motion, on twos or threes, gives pieces that assemble or jump a graphic rhythm. Applied to a scroll, pan or camera push it just looks like dropped frames. So the cards pop in stepped while the strip beneath them scrolls fluid.",
    film: "A beat marked stepped is checked against its named moves. If it contains a scroll, pan, push, glide or orbit, the gate warns. The usual fix is to step only the pop-ins and leave the scroll smooth.",
    points: ["Stepped: pop-ins, assembly, hits on the beat.", "Fluid: scrolls, pans, pushes, glides, orbits.", "Mix them inside one beat if you like; just not on one object."],
    source: SRC_ENGINE,
    alt: "Three cards appear in held steps on the top row. A long bar glides smoothly across the bottom row.",
    art: () => `${[0, 1, 2].map((i) => g({ d: `${i * 0.35}s`, fs: 0.4, t: ".6s", e: "steps(3,end)" }, `<rect class="${i === 1 ? "ft" : "fb"}" x="${40 + i * 90}" y="26" width="72" height="56" rx="8"/>`)).join("")}
${tx(40, 106, "stepped: pieces arriving", "start")}
${g({ fx: "-150px", d: ".1s", t: "1.8s", e: "cubic-bezier(.4,.14,.3,1)" }, `<rect class="fi" x="40" y="126" width="250" height="26" rx="13"/><circle class="ft" cx="270" cy="139" r="7"/>`)}
${tx(40, 180, "fluid: the glide", "start")}`,
  },
  {
    slug: "always-moving", group: "motion", title: "Always moving, no dead frames",
    law: "Something visibly moves in every moment; a hold is composed, not frozen.",
    explain: "A frame where nothing moves at all feels like the video stalled. Holds still exist, because people need time to read, but they carry a small secondary motion: a slow push, a light sweep, a swap. Constant mechanical drift is the opposite failure.",
    film: "The motion gate fails a film when a still stretch reaches 0.8 seconds. A hold is at most about 1.2 seconds, and an end card holds up to about 3 seconds while ambient light keeps moving.",
    points: ["No still stretch of 0.8 s or more.", "Fill a hold with secondary motion.", "No idle loops, breathing or pulsing on content."],
    source: "Disney's secondary action. The 0.8 second limit is measured from real launch films.",
    alt: "Two timelines. The top has a gap with a cross mark. The bottom is continuous with a playhead moving along it.",
    art: () => `${tx(30, 28, "a dead frame", "start")}
<rect class="fm" x="30" y="38" width="96" height="26" rx="6"/><rect class="fm" x="206" y="38" width="84" height="26" rx="6"/>
<rect x="132" y="38" width="68" height="26" rx="6" fill="none" stroke="#b3165a" stroke-width="2" stroke-dasharray="4 4"/>
<path class="ln sr" d="M154 44l24 14M178 44l-24 14" style="stroke-width:2.5"/>
${tx(30, 112, "always moving", "start")}
${[0, 1, 2].map((i) => `<rect class="fb" x="${30 + i * 88}" y="124" width="84" height="26" rx="6"/>`).join("")}
${g({ fx: "-230px", t: "2s", e: "linear" }, `<rect class="ft" x="275" y="116" width="6" height="42" rx="3" stroke="#1b1f5e" stroke-width="1.5"/>`)}`,
  },

  // ---------------------------------------------------------------- SCENES
  {
    slug: "scene-variety", group: "scenes", title: "Scene variety",
    law: "Give every scene its own idea, layout and ground.",
    explain: "The same layout for forty-five seconds reads as a slide deck, however well each slide moves. Variety is the backbone: full-frame type, a UI proof, a collage, an object, a quiet line. Each scene brings its own idea, so no single gimmick carries the film.",
    film: "Beats declare a `scene_type`, and the gates warn when one carrier covers more than 40 percent of beats, a move repeats in more than two, or one transition family covers more than 30 percent of seams.",
    points: ["Each scene has its own idea.", "No move in more than two beats.", "Vary scale, ground and texture together."],
    source: SRC_ENGINE,
    alt: "Six small frames, each with a different layout: big type, a card, dark slate, a circle on yellow, a collage of squares and one line.",
    art: () => {
      const f = (i, bg, inner) => { const x = 20 + (i % 3) * 98, y = 22 + Math.floor(i / 3) * 76; return g({ d: `${i * 0.15}s`, fs: 0.7, t: ".45s" }, `<rect x="${x}" y="${y}" width="86" height="62" rx="8" class="${bg}"/>${inner(x, y)}`); };
      return [
        f(0, "fw", (x, y) => `<rect class="fi" x="${x + 8}" y="${y + 16}" width="70" height="28" rx="3"/>`),
        f(1, "fi", (x, y) => `<rect class="fw" x="${x + 24}" y="${y + 26}" width="38" height="10" rx="5"/>`),
        f(2, "fm", (x, y) => `<rect class="fw" x="${x + 14}" y="${y + 10}" width="58" height="42" rx="6"/><rect class="fb" x="${x + 20}" y="${y + 18}" width="30" height="5" rx="2.5"/>`),
        f(3, "ft", (x, y) => `<circle class="fi" cx="${x + 43}" cy="${y + 31}" r="17"/>`),
        f(4, "fw", (x, y) => [0, 1, 2, 3].map((k) => `<rect class="${k === 2 ? "ft" : "fb"}" x="${x + 10 + (k % 2) * 34}" y="${y + 9 + Math.floor(k / 2) * 24}" width="28" height="20" rx="3"/>`).join("")),
        f(5, "fk", (x, y) => `<rect class="fm" x="${x + 12}" y="${y + 28}" width="62" height="5" rx="2.5"/>`),
      ].join("");
    },
  },
  {
    slug: "dense-and-sparse", group: "scenes", title: "Dense, then sparse",
    law: "Follow a crowded moment with an empty one, and never run more than two alike.",
    explain: "Contrast is what makes each scene read. A collage lands because the single line before it was quiet; the quiet line lands because of the collage. Three dense beats in a row, or three sparse, flatten into a texture.",
    film: "Every beat declares its `density`. The gate warns on a run of more than two dense beats, and the biggest element in a dense beat should be at least 2.5 times different in height from the sparse one beside it.",
    points: ["Alternate on purpose.", "No more than two dense or two sparse in a row.", "Scale contrast of at least 2.5 times."],
    source: SRC_ENGINE,
    alt: "A row of seven bars growing from the baseline, alternating tall and short.",
    art: () => [100, 26, 86, 30, 74, 20, 96].map((h, i) => g({ d: `${i * 0.12}s`, t: ".5s", o: "50% 100%" }, `<rect class="${i % 2 ? "fm" : "fb"}" x="${34 + i * 38}" y="${150 - h}" width="28" height="${h}" rx="5"/>`, "growy")).join("")
      + tx(34, 176, "dense", "start") + tx(286, 176, "sparse, alternating with dense", "end"),
  },
  {
    slug: "motivated-cuts", group: "scenes", title: "Motivated transitions, cuts on the beat",
    law: "Every transition has a reason, and hard cuts land on the music.",
    explain: "A transition that is only decoration is a gimmick. A good one carries something across the seam: an object, a shape, a velocity. Picture on the beat feels intentional, so seams, hard cuts and the turn are aligned to the music's hits and drops.",
    film: "Seams come from a varied vocabulary (whip, push, mask wipe, scale-as-transition, carrier handoff), and the turn is placed on the drop in the music map. A plain fade, or blur with nothing travelling, does not count as choreography.",
    points: ["Carry velocity or an object across the seam.", "Cut on a hit, a drop or a break edge.", "A fade is not a transition."],
    source: SRC_ENGINE,
    alt: "A waveform of vertical bars with three yellow beat lines, and a cut marker sitting on each one.",
    art: () => [10, 24, 36, 18, 44, 30, 14, 40, 26, 48, 20, 34, 12, 38, 22, 46, 16, 28, 36, 12].map((h, i) => `<rect class="fm" x="${28 + i * 13.6}" y="${100 - h / 2}" width="7" height="${h}" rx="3.5"/>`).join("")
      + [80, 158, 236].map((x, i) => `${g({ d: `${0.2 + i * 0.5}s`, t: ".5s", o: "50% 100%" }, `<rect class="ft" x="${x}" y="36" width="4" height="128" rx="2"/>`, "growy")}${g({ d: `${0.5 + i * 0.5}s`, fs: 0.2, t: ".3s" }, `<path class="fi" d="M${x - 8} 24h20l-10 14z"/>`)}`).join("")
      + tx(160, 188, "cuts land on the beat"),
  },
  {
    slug: "flash-bursts-land", group: "scenes", title: "Flash bursts land on a readable frame",
    law: "Flash one varying element, then land on a held frame that says something.",
    explain: "A flash-frame burst builds anticipation before a reveal or a drop, or conveys speed and overload. Nobody can read information at two frames each, so the burst carries no message. The message waits on the frame it lands on.",
    film: "Vary one element in a locked layout, hold each flash for two or three frames, run the whole burst for 8 to 24 frames, then land on a frame held for at least 12 on the downbeat. One or two bursts per film, never back to back.",
    points: ["One varying element, locked layout.", "2 to 3 frames each; 8 to 24 frames in all.", "Land on a held frame, 12 or more.", "No information inside the burst."],
    source: "Engine rule from real launch films, bounded by WCAG 2.3.1 (three flashes or below threshold).",
    srcUrl: "https://www.w3.org/TR/WCAG22/#three-flashes-or-below-threshold",
    alt: "Five small frames each showing one different number, followed by one large held frame that carries the message.",
    art: () => [3, 5, 6, 8, 9].map((n, i) => g({ d: `${i * 0.12}s`, t: ".01s" }, `<rect class="fw" x="${26 + i * 56}" y="20" width="48" height="48" rx="6"/><text class="strong" x="${50 + i * 56}" y="52" text-anchor="middle">${n}</text>`)).join("")
      + g({ d: "0.9s", fs: 0.9, t: ".5s" }, `<rect class="ft" x="26" y="88" width="268" height="68" rx="10" ${ring}/><text class="strong" x="160" y="128" text-anchor="middle" style="font-size:19px">12 follow-ups, done</text>`)
      + tx(26, 182, "2 to 3 frames each", "start") + tx(294, 182, "held 12 or more", "end"),
  },
  {
    slug: "ground-follows-story", group: "scenes", title: "The ground follows the story",
    law: "Change the ground on the turn, the meet and at least one capability.",
    explain: "A background that changes at the same moment as the story gives the viewer a sense of progress. One flat grey ground for forty-five seconds is a defect even when everything else passes. The change is carried by a wipe or the carrier, not a plain fade to a new colour.",
    film: "Beats declare a `ground` (brand gradient, dark, white or brand slate), with at least two families in the film, and the brand colour present for at least 30 percent of it. The change is placed on a music hit.",
    points: ["At least two ground families.", "Change on the turn, the meet and a capability.", "Brand colour on screen for 30 percent or more."],
    source: SRC_ENGINE,
    alt: "A row of five film beats in different grounds: indigo, near black, white, blue and yellow.",
    art: () => [["fi", "Hook"], ["fk", "Turn"], ["fw", "Meet"], ["fb", "Proof"], ["ft", "Payoff"]].map(([c, s], i) => g({ d: `${i * 0.25}s`, t: ".5s", o: "0% 50%" }, `<rect class="${c}" x="${24 + i * 55}" y="52" width="52" height="88" rx="6" stroke="#1b1f5e" stroke-width="1.5"/>`, "grow")
      + tx(50 + i * 55, 164, s)).join(""),
  },
  {
    slug: "distinct-reveal", group: "scenes", title: "A distinct reveal",
    law: "The one thing you want noticed should be the one thing that differs.",
    explain: "When several similar things appear together, the one that is different is the one remembered. So the reveal is made distinct on purpose, and nothing else around it competes by being distinct too.",
    film: "The meet and the signature moment are staged as the odd one out: a different scale, ground or texture from the beats around them. Emphasis is a single word per line, for the same reason.",
    points: ["Make the key moment the exception.", "Do not make anything else an exception.", "One emphasised word per line."],
    source: "Von Restorff effect (isolation effect), Hedwig von Restorff, 1933. See Laws of UX, Von Restorff Effect.",
    srcUrl: "https://lawsofux.com/von-restorff-effect/",
    alt: "A grid of fifteen identical pale squares with one yellow square that stands out.",
    art: () => Array.from({ length: 15 }, (_, i) => { const x = 36 + (i % 5) * 52, y = 32 + Math.floor(i / 5) * 48, odd = i === 7;
      return g(odd ? { d: "1.2s", fs: 0.2, t: ".5s" } : { d: `${i * 0.05}s`, fs: 0.4, t: ".4s" }, `<rect class="${odd ? "ft" : "fg"}" x="${x}" y="${y}" width="40" height="36" rx="6"${odd ? ` ${ring}` : ""}/>`); }).join(""),
  },

  // ---------------------------------------------------------------- TYPE AND IMAGE
  {
    slug: "objects-act-on-type", group: "type", title: "Objects act on type",
    law: "Show emphasis by something physical happening to the word.",
    explain: "A pointer aimed at a word, or a word that scales up and wobbles, is the default way to emphasise. Having an object act on the word instead (split it, slash it, carry it, iris out of it) gives the emphasis a cause the viewer can see.",
    film: "The emphasis vocabulary names the moves, such as an object splitting a word and a redaction slash. Each beat names one move, and no move is used in more than two beats, so it does not become a signature gimmick.",
    points: ["A cause, not a decoration.", "One named move per beat.", "Use a move in two beats at most."],
    source: SRC_ENGINE,
    alt: "The word here split in the middle, with a tall yellow pill pushing the two halves apart.",
    art: () => `${g({ fx: "20px", t: ".9s" }, `<text class="huge" x="138" y="118" text-anchor="end">he</text>`)}
${g({ fx: "-20px", t: ".9s" }, `<text class="huge" x="182" y="118" text-anchor="start">re</text>`)}
${g({ t: ".7s", o: "50% 50%", fs: 0.05 }, `<rect class="ft" x="144" y="50" width="32" height="84" rx="16" ${ring}/>`)}
${tx(160, 170, "the object splits the word")}`,
  },
  {
    slug: "display-scale", group: "type", title: "Display scale, with restraint",
    law: "Set the big line at display size; keep ordinary lines small.",
    explain: "Scale ranks ideas. The line that matters is big enough to fill the frame, and the quiet lines are small and sit in an empty frame. Type at the same size for five seconds is wrong, because the contrast between big and small is the rhythm.",
    film: "Hero lines reach 9 to 20 percent cap height at least once per beat and span 40 to 90 percent of the frame width; ordinary lines stay at 4 to 6 percent, and only on beats declared sparse.",
    points: ["Hero lines: 9 to 20 percent of frame height.", "Quiet lines: 4 to 6 percent, on sparse beats only.", "At least 2.5 times between the largest in dense and sparse beats."],
    source: SRC_ENGINE,
    alt: "Two film frames side by side. The left holds one very large word. The right holds a small line on a mostly empty frame.",
    art: () => `${g({ fs: 0.7, t: ".7s" }, `<rect class="fi" x="20" y="40" width="136" height="76" rx="8"/><text class="giant" x="88" y="96" text-anchor="middle">One</text>`)}
${g({ d: ".3s", t: ".5s" }, `<rect class="fw" x="164" y="40" width="136" height="76" rx="8"/><rect class="fi" x="204" y="76" width="56" height="5" rx="2.5"/><rect class="fg" x="214" y="88" width="36" height="4" rx="2"/>`)}
${tx(88, 144, "9 to 20% tall")}${tx(232, 144, "4 to 6% tall")}`,
  },
  {
    slug: "still-life-not-people", group: "type", title: "Editorial still life, no generated people",
    law: "Use real-looking objects in natural light, and keep generated people out.",
    explain: "Generated faces and figures read as AI at a glance, and a blue-glow tech look reads as a template. Props, places, paper and print in natural light feel editorial and tactile, and they work well as content inside cards and collages.",
    film: "Image prompts ask for still-life objects in natural light, with no text and no people. The check `imagery-people-or-glow` flags a brief that asks for faces, hands or a neon look; people appear only when the brief asks for them.",
    points: ["Objects, props, printed matter, materials.", "Natural light, a photographic or print feel.", "People only when the brief asks.", "Review every image before it is used."],
    source: SRC_ENGINE,
    alt: "A flat still life on kraft paper: a brass compass, a folded map and a leaf, with soft shadows.",
    art: () => `<rect x="22" y="22" width="276" height="156" rx="8" fill="#e6d9bd"/>
${g({ fy: "-14px", t: ".7s" }, `<ellipse cx="116" cy="140" rx="52" ry="8" fill="#1b1f5e" opacity=".1"/><circle cx="110" cy="96" r="42" fill="#f4ead2" stroke="#8a6a1e" stroke-width="5"/><path d="M110 62l8 34-8 34-8-34z" fill="#b3165a"/><path d="M110 62l8 34h-16z" fill="#1b1f5e"/><circle cx="110" cy="96" r="4" fill="#8a6a1e"/>`)}
${g({ fy: "-14px", d: ".25s", t: ".7s" }, `<path d="M184 56l36 10 36-10v76l-36 10-36-10z" fill="#f7f1df" stroke="#8a6a1e" stroke-width="2.5"/><path d="M220 66v76" stroke="#8a6a1e" stroke-width="2.5"/><path d="M192 84c10 8 14 0 24 8s12-4 0 14" fill="none" stroke="#2a31a8" stroke-width="2.5" stroke-linecap="round"/>`)}
${g({ fy: "-14px", d: ".5s", t: ".7s" }, `<path d="M258 162c-24-4-38-18-40-34 22 0 38 12 40 34z" fill="#1e5a3c"/><path d="M258 162c-8-10-16-18-30-28" stroke="#f4ead2" stroke-width="1.5" fill="none"/>`)}`,
  },
  {
    slug: "real-ui-as-proof", group: "type", title: "Real UI as proof",
    law: "Show the product doing its job, big enough to read.",
    explain: "A film that shows the product late, or never doing the job, is a mood piece. A proof card should take a real share of the frame, cropped or tilted if you like. Under about a quarter of the frame it is a chip or an accent, not a proof.",
    film: "UI is shown as a simplified recreated mockup, never a screen recording, and sized at 35 to 60 percent of the frame by area. The first proof arrives by about 40 percent of the runtime, and at least one beat is marked `core_job_demo`.",
    points: ["35 to 60 percent of the frame.", "The product doing the job, not just present.", "By about 40 percent of the runtime."],
    source: SRC_ENGINE,
    alt: "A film frame outline with a large interface card filling about half of it, with one highlighted row.",
    art: () => `<rect class="fw" x="30" y="20" width="260" height="146" rx="10" ${ring}/>
${g({ fs: 0.8, t: ".7s" }, `<rect class="fi" x="76" y="42" width="170" height="104" rx="10"/><rect class="fw" x="92" y="58" width="70" height="8" rx="4"/><rect class="fm" x="92" y="78" width="138" height="14" rx="5" opacity=".35"/>`)}
${g({ d: ".8s", t: ".6s", o: "0% 50%" }, `<rect class="ft" x="92" y="100" width="138" height="14" rx="5"/>`, "grow")}
${g({ d: "1.1s", t: ".4s", o: "0% 50%" }, `<rect class="fm" x="92" y="122" width="100" height="12" rx="5" opacity=".35"/>`, "grow")}
${tx(160, 188, "35 to 60% of the frame")}`,
  },
  {
    slug: "light-brand", group: "type", title: "Light brand",
    law: "Brand colour is everywhere; the logo is small and rare.",
    explain: "A brand is felt through colour and type, not stamped on every frame. The film takes the brand's palette as atmosphere, and shows the logo at most three times: at the meet, once tied to a capability, and on the end card.",
    film: "The logo appears at most three times, always small, never as a watermark and never larger than the claim line. Brand colour covers at least 30 percent of the film as ground, accent or light.",
    points: ["Logo: three times at most, small.", "Colour: on screen 30 percent or more.", "Take the palette and the type, not the website layout."],
    source: SRC_ENGINE,
    alt: "A film timeline filled with brand colour, with three tiny logo marks placed along it.",
    art: () => `<rect class="fm" x="26" y="70" width="268" height="60" rx="10"/>
${g({ t: "1.4s", o: "0% 50%", e: "cubic-bezier(.4,.14,.3,1)" }, `<rect class="fb" x="26" y="70" width="268" height="60" rx="10"/>`, "grow")}
${[84, 170, 266].map((x, i) => g({ d: `${0.9 + i * 0.3}s`, fs: 0.2, t: ".35s" }, `<circle class="ft" cx="${x}" cy="100" r="7" stroke="#1b1f5e" stroke-width="1.5"/>`)).join("")}
${tx(26, 160, "colour everywhere", "start")}${tx(294, 160, "logo: 3 times at most", "end")}`,
  },

  // ---------------------------------------------------------------- RARE TOOLS
  {
    slug: "cursor-once", group: "rare", title: "One cursor, with a reason",
    law: "Use a travelling cursor once per film, for a real action in the product.",
    explain: "A cursor pointing at words is the standard AI emphasis. A cursor that clicks Create in a real prompt box is a moment of the product itself. Used once, with a reason, it is a tool; used across beats, it is a tic.",
    film: "A film may carry one travelling cursor, with a declared `cursor_reason` such as \"clicks Create in the real prompt box\". It is 3 to 4 percent of the short side, travels on an arc with ease in and out, never linear, and ends in one purposeful action.",
    points: ["Once per film.", "Only for a real product action.", "An arc with ease in and out, never linear.", "State the reason in the score."],
    source: "Engine rule from real launch films.",
    alt: "A cursor arrow travels along an arc to a Create button, and the button presses.",
    art: () => `<g class="press" style="${v({ d: "1.35s" })}"><rect class="fb" x="196" y="116" width="92" height="34" rx="17"/><text class="txb" x="242" y="137" text-anchor="middle" style="fill:#fff">Create</text></g>
${g({ fx: "-150px", t: "1.3s", e: "cubic-bezier(.4,0,.2,1)" }, g({ fy: "-50px", t: "1.3s", e: "cubic-bezier(.2,0,.4,1)" }, `<path d="M236 124v24l6-6 5 12 5-2-5-12h9z" fill="#1b1f5e" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>`))}
${tx(30, 176, "once per film, for a real action", "start")}`,
  },
  {
    slug: "standard-entrances-once", group: "rare", title: "Standard entrances, once",
    law: "Word-rise, count-up and zoom-fade each get one use per film.",
    explain: "These are the moves everyone reaches for. Each is fine once, in the place it earns its keep, and a tell when it is everywhere. So each gets a budget of one, and the rest of the film uses swaps, masks, splits and cuts on the beat.",
    film: "The `cliche-*` checks count them: one word-rise line, one zoom-fade entrance, one count-up for a real hero number such as social proof. Everything else is a swap in place, a mask wipe, an object splitting a word, a stepped pop or a hard cut.",
    points: ["One word-rise line per film.", "One zoom-fade.", "One count-up, for a number that matters.", "Replace the rest with a swap, a mask or a cut."],
    source: "Engine rule from real launch films.",
    alt: "Three rows of eight beat slots, labelled word rise, count-up and zoom-fade. Each row has exactly one yellow slot.",
    art: () => [["word rise", 1], ["count-up", 4], ["zoom-fade", 6]].map(([s, on], r) => tx(24, 54 + r * 46 + 4, s, "start")
      + Array.from({ length: 8 }, (_, i) => i === on
        ? g({ d: `${0.3 + r * 0.4}s`, fs: 0.3, t: ".35s" }, `<rect fill="#efb21a" ${ring} x="${116 + i * 23}" y="${42 + r * 46}" width="19" height="24" rx="4"/>`)
        : `<rect class="fg" x="${116 + i * 23}" y="${42 + r * 46}" width="19" height="24" rx="4"/>`).join("")).join("")
      + tx(116, 184, "beats, in order", "start"),
  },
  {
    slug: "no-glow-no-bokeh", group: "rare", title: "No glow pulses, no bokeh",
    law: "Never pulse a glow or float particles as atmosphere. Use real material or moving colour light.",
    explain: "Pulsing rings, breathing glows, bokeh dots and floating particles are the clearest sign of a generated film. They are banned with no allowed use. A bloom tied to a word's meaning, real material, or colour light that actually moves does the same job honestly.",
    film: "This is one of two true invariants. `cliche-glow-particles` and `cliche-banned-move` flag it, and idle loops on content such as breathing, bobbing or an infinite yoyo are rejected, which also keeps every frame seek-safe for rendering.",
    points: ["No pulsing glow rings. No bokeh or particles.", "Use real material, or colour light that moves.", "No idle loops on content."],
    source: "Engine invariant, from real launch films. Also a photosensitivity safeguard: see the accessibility laws.",
    alt: "A set of concentric rings and floating dots crossed out on the left. On the right a band of colour light sweeps across a card.",
    art: () => `<g opacity=".75"><circle cx="82" cy="96" r="18" fill="none" stroke="#7c83f5" stroke-width="3"/><circle cx="82" cy="96" r="34" fill="none" stroke="#7c83f5" stroke-width="2"/><circle cx="82" cy="96" r="50" fill="none" stroke="#7c83f5" stroke-width="1.5"/><circle cx="40" cy="50" r="5" fill="#9fa5d4"/><circle cx="128" cy="62" r="7" fill="#9fa5d4"/><circle cx="118" cy="146" r="4" fill="#9fa5d4"/></g>
${ln("M34 150L132 42", "sr", { d: ".3s", t: ".5s" })}
<defs><clipPath id="c-glow"><rect x="178" y="48" width="118" height="96" rx="10"/></clipPath><linearGradient id="gl-glow" x1="0" x2="1"><stop offset="0" stop-color="#efb21a" stop-opacity="0"/><stop offset=".5" stop-color="#efb21a" stop-opacity=".95"/><stop offset="1" stop-color="#efb21a" stop-opacity="0"/></linearGradient></defs>
<rect class="fi" x="178" y="48" width="118" height="96" rx="10"/>
<g clip-path="url(#c-glow)">${g({ fx: "-150px", d: ".5s", t: "1.4s", e: "cubic-bezier(.4,.14,.3,1)" }, `<rect x="210" y="40" width="80" height="120" fill="url(#gl-glow)"/>`)}</g>
${tx(82, 176, "banned")}${tx(237, 176, "colour light that moves")}`,
  },

  // ---------------------------------------------------------------- ACCESS
  {
    slug: "three-flashes", group: "access", title: "No more than three flashes a second",
    law: "Never flash full-frame contrast more than three times in any second.",
    explain: "Rapid flashing can trigger seizures in people with photosensitive epilepsy, so this is a hard limit and not a style choice. Avoid alternating full-frame black and white, avoid flashing saturated red, and change one element on a constant ground instead.",
    film: "The render gate measures flashes in the finished film (`photosensitivity-flash`) and fails it above the limit. Flash bursts vary one element on a locked layout and keep the luminance change small.",
    points: ["Three flashes a second at most.", "No alternating full-frame black and white.", "No flashing saturated red.", "Change an element, not the ground."],
    source: "WCAG 2.3.1, Three Flashes or Below Threshold (Success Criterion, level A). Ofcom's broadcast guidance sets a similar limit.",
    srcUrl: "https://www.w3.org/TR/WCAG22/#three-flashes-or-below-threshold",
    alt: "A one second timeline with three yellow flash marks, and a fourth dashed mark crossed out.",
    art: () => `<rect class="fm" x="30" y="86" width="260" height="28" rx="6"/>
${[62, 126, 190].map((x, i) => g({ d: `${0.2 + i * 0.4}s`, fs: 0.2, t: ".35s" }, `<rect class="ft" x="${x}" y="80" width="14" height="40" rx="3" stroke="#1b1f5e" stroke-width="2"/>`)).join("")}
<rect x="254" y="80" width="14" height="40" rx="3" fill="none" stroke="#b3165a" stroke-width="2" stroke-dasharray="3 3"/>
${ln("M248 74l26 52M274 74l-26 52", "sr", { d: "1.5s", t: ".3s" })}
${tx(30, 150, "0 s", "start")}${tx(290, 150, "1 s", "end")}${tx(160, 178, "3 flashes at most in any second")}`,
  },
  {
    slug: "time-to-read", group: "access", title: "Time to read",
    law: "Hold each line for 0.6 s plus 0.3 s a word, with a minimum of 1.2 s.",
    explain: "People read at about three words a second, and text that goes too fast is lost to everyone who reads more slowly or in a second language. If a line does not fit, cut words; speeding up the type breaks reading.",
    film: "Each line stays fully on screen for the formula time, rounded up. Four words hold for 1.8 s, so 2.0 s; six words 2.4 s. The motion gate measures this, and a launch hook never asks for more than three words a second.",
    points: ["0.6 s + 0.3 s per word, 1.2 s minimum.", "At most three words a second.", "Cut words rather than speed up."],
    source: "Reading speed of about three words a second is the engine's measured working figure. Related guidance: WCAG 2.2.1, Timing Adjustable.",
    srcUrl: "https://www.w3.org/TR/WCAG22/#timing-adjustable",
    alt: "A bar made of a long segment of 0.6 seconds and four short segments of 0.3 seconds each, labelled four words, 1.8 seconds.",
    art: () => `${g({ t: ".6s", o: "0% 50%" }, `<rect class="fi" x="30" y="84" width="104" height="32" rx="6"/>`, "grow")}
${[0, 1, 2, 3].map((i) => g({ d: `${0.6 + i * 0.3}s`, t: ".3s", o: "0% 50%" }, `<rect class="fb" x="${138 + i * 38}" y="84" width="34" height="32" rx="6"/>`, "grow")).join("")}
${tx(82, 74, "0.6 s")}${tx(214, 74, "4 words × 0.3 s")}
${tx(160, 150, "held 1.8 s, set to 2.0 s")}`,
  },
];
