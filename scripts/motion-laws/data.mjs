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
  { id: "motion", name: "Motion", blurb: "How things move: weight, curves, timing, blur and the habit of never standing still." },
  { id: "scenes", name: "Scenes and rhythm", blurb: "How scenes follow each other so the film has a pulse." },
  { id: "type", name: "Type and image", blurb: "What the frame is made of: type at scale, real objects, real product." },
  { id: "sound", name: "Sound", blurb: "Who leads each passage, which sounds get to be loud, and how the film is heard before it is finished." },
  { id: "rare", name: "Rare tools and AI clichés", blurb: "The moves everyone reaches for, and the budget each one gets." },
  { id: "access", name: "Accessibility", blurb: "The two limits no style is allowed to break." },
];

const BBC = "https://www.dejavu.org/cgi-bin/get.cgi?url=https%3A%2F%2Fwww.bbc.co.uk%2Faccessibility%2Fforproducts%2Fguides%2Fsubtitles%2F&ver=93";
const SRC_ENGINE = "RasanAI launch grammar, studied from real launch films. An engine rule, not an academic law.";

export const LAWS = [
  // ---------------------------------------------------------------- STORY
  {
    slug: "the-arc", group: "story", title: "The arc, as the default",
    law: "Hook, turn, meet, capabilities, payoff is the default order, not the only one.",
    explain: "The arc is the structure to start from, and the content changes every time. Each beat does one job, so a viewer who has never heard of the product can follow it with the sound off: a problem they feel, a pivot, the reveal, two or three proofs, and a close.",
    film: "The score declares a role for every beat (hook, turn, meet, capability, payoff) and the motion follows the role: tight and urgent in the hook, one sharp move on the turn, the longest and calmest entrance on the meet, the longest holds at the payoff.",
    points: ["One thought per beat, with on-screen type carrying the story.", "The hook is the viewer's problem, with no logo and no product name.", "The meet is small and calm, on an empty ground.", "Two or three capabilities, each proving one thing.", "When the product has a shape of its own, use that instead: see Structures that belong to the product."],
    source: SRC_ENGINE + " Professional work often picks another shape (a sung script, an assembly, a teaser), so the arc is one candidate, not an invariant.",
    ev: "Engine default, with studio practice behind the alternatives",
    srcs: [["Tendril, IBM z17: data, then components, then the assembled machine", "https://tendril.studio/work/ibm-z17/"]],
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
    film: "The engine spends everything on one signature moment (an object splitting the word, an oversized payoff line emerging off the frame) and gives the payoff the longest holds of the film, with an accent curve of its own on the closing hit.",
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
    law: "End on a verb and a destination, and let it settle long enough to read.",
    explain: "The viewer needs to know the next step and have time to take it in. A bare logo end card gives nothing to do. A verb plus a destination does, if it stays on screen.",
    film: "The final beat carries a line such as \"Download for macOS\" or \"Join the waitlist\" and gives it settled time, 2 to 4 seconds as a starting range to test, while ambient motion keeps the frame alive. See A resolved ending.",
    points: ["A verb plus a destination, in plain words.", "On the last beat, with the logo.", "Settled for about 2 to 4 seconds; a URL or a second call to action needs more.", "A familiar logo-only sting may need less."],
    source: SRC_ENGINE + " The final lockup is designed as a shot with readable time. No source supports a universal end-card length; 2 to 4 seconds is a pilot range.",
    ev: "Studio practice, and a RasanAI pilot range",
    srcs: [["School of Motion, 10 Tiny Typography Decisions: design the end lockup as a shot", "https://schoolofmotion.com/blog/tiny-typography-decisions-motion-graphics"]],
    alt: "An end card with a headline bar, a button reading Download for macOS, and a timer bar showing a settled hold of two seconds or more.",
    art: () => `<rect class="fw" x="52" y="22" width="216" height="118" rx="12"/>
<rect class="fi" x="76" y="42" width="110" height="10" rx="5"/><rect class="fg" x="76" y="60" width="80" height="8" rx="4"/>
${g({ d: ".4s", fs: 0.8, t: ".5s" }, `<rect class="ft" x="76" y="88" width="168" height="32" rx="16"/><text class="txb" x="160" y="108" text-anchor="middle">Download for macOS</text>`)}
<rect class="fm" x="52" y="156" width="216" height="8" rx="4"/>
${g({ d: "1s", t: "2s", e: "linear", o: "0% 50%" }, `<rect class="fb" x="52" y="156" width="216" height="8" rx="4"/>`, "grow")}
${tx(52, 184, "settled 2 to 4 s", "start")}`,
  },
  {
    slug: "copy-is-the-spine", group: "story", title: "Copy is the spine",
    law: "One thought per line, a few words, one emphasised word.",
    explain: "People read while the picture moves, so the words have to be quick: second person, plain language, three to seven words on screen at once. One word per line carries the turn, and the eye lands on it.",
    film: "The copy linter flags brochure language and buzzwords. Each line gets exactly one emphasised word (colour, weight, size or italic), and a longer line is split into two beats rather than shown faster.",
    points: ["Second person, plain words.", "Three to seven words on screen at once.", "Exactly one emphasised word per line.", "Break lines at grammatical units, never between an article and its noun.", "Cut words before speeding up the type."],
    source: "Signaling principle, Richard Mayer, Multimedia Learning: cue the one thing that matters. Line breaks follow Netflix's timed-text rules (subtitle rules, borrowed for titles).",
    ev: "Learning research, and studio practice",
    srcs: [["Netflix, Timed Text General Requirements: break at grammatical units", "https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements"]],
    alt: "Two short lines of large type, Your next deal and is in here, with the word here highlighted in yellow.",
    art: () => `${["Your", "next", "deal"].map((w, i) => g({ d: `${i * 0.35}s`, t: ".01s" }, `<text class="big" x="${40 + i * 84}" y="84" text-anchor="start">${w}</text>`)).join("")}
${g({ d: "1.05s", t: ".01s" }, `<text class="big" x="40" y="134" text-anchor="start">is in</text>`)}
${g({ d: "1.4s", t: ".01s" }, `<rect class="ft" x="136" y="106" width="86" height="36" rx="4"/><text class="big" x="144" y="134" text-anchor="start">here</text>`)}
${tx(40, 180, "one emphasised word", "start")}`,
  },
  {
    slug: "benefit-not-feature", group: "story", title: "Benefit, not feature",
    law: "Say what happens for the viewer; let the screen show how.",
    explain: "The viewer buys the outcome, not the mechanism. A feature line describes the machine (\"AI-powered semantic search\"); a benefit line describes the viewer's day (\"Find any message in seconds\"). The mechanism belongs in the UI proof, where it is shown instead of read.",
    film: "Each capability line states the viewer's outcome, and the UI proof beside it shows the mechanism working. Feature words such as \"AI-powered\" are caught by the buzzword list and rewritten as the outcome.",
    points: ["The line is the outcome; the screen is the mechanism.", "Write the viewer's day, not the product's internals.", "If a line needs a diagram to make sense, it is a feature line."],
    source: SRC_ENGINE,
    alt: "A feature line, AI-powered semantic search, is struck through. Below it a benefit line reads Find any message in seconds, with a check mark.",
    art: () => `<text class="muted" x="160" y="68" text-anchor="middle">AI-powered semantic search</text>
${ln("M48 63H272", "sr", { d: ".5s", t: ".5s" })}
${g({ d: "1.1s", fy: "8px", t: ".6s" }, `<text class="strong" x="160" y="132" text-anchor="middle">Find any message in seconds</text>`)}
${g({ d: "1.6s", fs: 0.2, t: ".4s" }, `<circle class="ft" cx="160" cy="164" r="11"/><path class="ln si" d="M154 164l4 4 8-9" style="stroke-width:2.2"/>`)}`,
  },
  {
    slug: "specific-not-vague", group: "story", title: "Specific, not vague",
    law: "Give the viewer something they could check.",
    explain: "\"Faster, better, smarter\" cannot be checked; \"12 follow-ups before lunch\" can. A true number or a concrete detail makes a claim believable; an adjective asks the viewer to take your word for it.",
    film: "A capability line states the outcome and, where one exists, a true number from `research/claims.json`. Words such as \"AI-powered\" are caught by the buzzword list and replaced with the specific thing the product does.",
    points: ["The line is the outcome; the screen is the mechanism.", "A number can be checked, an adjective cannot.", "Never invent a number to sound specific."],
    source: SRC_ENGINE,
    alt: "A vague line, Faster, smarter, better, is struck through. Below it a specific line reads 12 follow-ups before lunch, with a check mark.",
    art: () => `<text class="muted" x="160" y="68" text-anchor="middle">Faster, smarter, better</text>
${ln("M56 63H264", "sr", { d: ".5s", t: ".5s" })}
${g({ d: "1.1s", fy: "8px", t: ".6s" }, `<text class="strong" x="160" y="132" text-anchor="middle">12 follow-ups before lunch</text>`)}
${g({ d: "1.6s", fs: 0.2, t: ".4s" }, `<circle class="ft" cx="160" cy="164" r="11"/><path class="ln si" d="M154 164l4 4 8-9" style="stroke-width:2.2"/>`)}`,
  },

  {
    slug: "structures-that-belong", group: "story", title: "Structures that belong to the product",
    law: "Pick the film's shape from the product and where it will be seen; the arc is one candidate.",
    explain: "A sung radio launch, a systems reveal that assembles a machine, a teaser that points to a later demo, a before and after, a straight demo: each is the right shape for some product. The structure should be something only this product could own, and the essential claims must survive it. A standalone launch film must not defer its only explanation to a demo nobody has seen.",
    film: "The score names its structure and gives the product reason for it. The arc stays the default when nothing fits better. A sung script keeps its claims intact in the performance, an assembly resolves the parts it introduced, and a teaser names the demo it hands off to.",
    points: ["Sung script: when the product is sound or voice.", "Teaser: when a later demo carries the explanation.", "Assembly: data, then parts, then the whole.", "Before and after: when the change is the product.", "Demo: when the operation is the story."],
    source: "Studios choose structure per product and per stage of launch. This is editorial synthesis from the cited production accounts, not a measured ranking.",
    ev: "Studio practice, and one maker account",
    srcs: [["Tendril, IBM z17: a 60 s hero plus five 10 s abstractions, data to components to machine", "https://tendril.studio/work/ibm-z17/"], ["Tendril, Figure F.02: teasers meant to complement later live demos", "https://tendril.studio/work/figure02/"], ["Abdullah .A, Sovra.fm: a script written to be sung", "https://www.linkedin.com/posts/abdullah4204k_one-of-our-best-videos-this-month-most-activity-7464873763453698050-8Ycn"]],
    alt: "Five small pictograms in a row labelled arc, sung, teaser, assembly and then/now: a rising line, a wave with dots, a small block pointing to a large one, three squares merging into one, and two side-by-side blocks.",
    art: () => {
      const c = (i, d, inner) => g({ d: `${i * 0.2}s`, fs: 0.6, t: ".5s" }, inner);
      return [
        c(0, 0, ln("M14 108 L26 88 L34 94 L46 66 L58 54", "si", { d: "0s", t: ".9s" })),
        c(1, 0, `<path class="ln sg" d="M76 82 C82 62 90 62 96 82 S110 102 122 82"/><circle class="ft" cx="84" cy="66" r="5"/><circle class="ft" cx="110" cy="94" r="5"/>`),
        c(2, 0, `<rect class="fm" x="132" y="88" width="14" height="20" rx="3"/><path class="ln si" d="M150 98h8" style="stroke-width:2"/><rect class="fb" x="162" y="66" width="28" height="44" rx="4"/>`),
        c(3, 0, `<rect class="fm" x="196" y="64" width="12" height="12" rx="2"/><rect class="fm" x="196" y="82" width="12" height="12" rx="2"/><rect class="fm" x="196" y="100" width="12" height="12" rx="2"/><path class="ln si" d="M212 88h8" style="stroke-width:2"/><rect class="fb" x="224" y="66" width="26" height="44" rx="4"/>`),
        c(4, 0, `<rect class="fm" x="262" y="68" width="18" height="40" rx="4"/><rect class="ft" x="286" y="68" width="18" height="40" rx="4" ${ring}/>`),
      ].join("")
      + [["arc", 36], ["sung", 98], ["teaser", 160], ["assembly", 222], ["then/now", 284]].map(([s, x]) => tx(x, 140, s)).join("")
      + tx(160, 176, "the arc is one candidate, not the only one");
    },
  },
  {
    slug: "resolved-ending", group: "story", title: "A resolved ending",
    law: "Picture and music end together, and the last frame settles for 2 to 4 seconds.",
    explain: "A film that stops because the track ran out feels cut off. A resolved ending is composed: the music reaches an ending or rings out, the final product or action frame has time to be read, and the two finish together. An unresolved ending is allowed when the story wants a cliffhanger, but it should be a choice.",
    film: "The music is edited to end on a musical resolution, with a controlled ringout when the last note needs more time, not a fade on an arbitrary cut. The final lockup is designed as a shot and given 2 to 4 seconds of settled time as a range to test, longer when a URL or second call to action adds reading.",
    points: ["End the music on an ending, not on a fade.", "Let a ringout decay without truncating it.", "Settled picture time: test 2 to 4 seconds.", "A familiar logo-only sting may need less.", "Picture and music finish on the same beat."],
    source: "Practitioners agree on resolving the music; the length of the settled hold is a RasanAI pilot range, not a published standard.",
    ev: "Single practitioners, and a pilot range",
    srcs: [["Ben Haslup, Frame.io: make any music track fit your video", "https://blog.frame.io/2017/11/08/make-music-fit-your-video/"], ["Chris Salters, Frame.io: stretch out your music tracks, end on a note and add reverb", "https://blog.frame.io/2023/06/07/insider-tips-stretch-music-tracks-in-premiere-pro/"], ["Tendril, Coinbase CB1: connect transformations causally to an ending", "https://tendril.studio/work/coinbase/"]],
    alt: "Two lanes. A picture bar and a row of music bars that shrink to nothing end on the same vertical line, with the last stretch outlined and labelled settled 2 to 4 seconds.",
    art: () => `${tx(30, 32, "picture", "start")}<rect class="fm" x="30" y="40" width="260" height="22" rx="6"/>
${g({ t: "1.4s", o: "0% 50%", e: "linear" }, `<rect class="fb" x="30" y="40" width="260" height="22" rx="6"/>`, "grow")}
${tx(30, 90, "music", "start")}
${[20, 30, 24, 34, 28, 30, 22, 26, 18, 12, 8, 5].map((h, i) => g({ d: `${i * 0.1}s`, t: ".4s", o: "50% 100%" }, `<rect class="${i > 8 ? "fg" : "fb"}" x="${30 + i * 22}" y="${128 - h}" width="12" height="${h}" rx="3"/>`, "growy")).join("")}
${g({ d: "1.4s", t: ".5s" }, `<rect x="214" y="30" width="76" height="106" rx="8" fill="#efb21a" fill-opacity=".22" stroke="#1b1f5e" stroke-width="1.5" stroke-dasharray="4 4"/>`)}
<path class="ln si" d="M290 26V140" style="stroke-width:2"/>
${tx(252, 154, "settled 2 to 4 s")}${tx(30, 182, "picture and music end together", "start")}`,
  },
  {
    slug: "fresh-viewer", group: "story", title: "The fresh viewer decides",
    law: "Ask someone who has never seen it what the film was; their recall overrules the internal score.",
    explain: "By the time a film is finished everyone who made it knows what it means. A person seeing it cold finds out whether the story survived. Their unaided answer to what the product is and why it matters is evidence. A model's or a designer's rating of its own work is not, and the double-read check a designer runs on their own copy is unreliable for the same reason.",
    film: "Before a film ships, an unfamiliar viewer watches once and answers without help: what is the product, what does it do for me, what did I miss. The unaided recall, and the moments they could not follow, can send the film back to the edit even when every internal gate passed.",
    points: ["Show it once, cold, with no explanation first.", "Record what they recall unprompted.", "The moments they could not follow are the edit list.", "A specialist audience still needs a representative reviewer."],
    source: "A practitioner working method: use people unfamiliar with the process for first reactions. The principle, not a metric: no source validates a recall score.",
    ev: "Single practitioner",
    srcs: [["Jorge Canedo Estrada, Creativity & Detail interview", "https://medium.com/creativityand/creativity-detail-jorge-canedo-estrada-60cc605d2098"]],
    alt: "A small card reading internal score 9.1 is struck through. A larger yellow card reads it makes my cuts for me, with a check mark.",
    art: () => `${g({ fx: "-14px", t: ".6s" }, `<rect class="fw" x="22" y="56" width="110" height="68" rx="10"/>${tx(77, 82, "internal score")}<text class="muted" x="77" y="110" text-anchor="middle" style="font-size:22px">9.1</text>`)}
${ln("M34 114L120 66", "sr", { d: ".7s", t: ".4s" })}
${g({ fx: "14px", d: ".4s", t: ".6s" }, `<rect class="ft" x="156" y="36" width="144" height="108" rx="12" ${ring}/>${tx(228, 62, "unaided recall")}<text class="strong" x="228" y="96" text-anchor="middle">&#8220;it makes my</text><text class="strong" x="228" y="116" text-anchor="middle">cuts for me&#8221;</text>`)}
${g({ d: "1.2s", fs: 0.2, t: ".4s" }, `<circle class="fi" cx="288" cy="40" r="11"/><path class="ln" d="M282 40l4 4 8-9" style="stroke:#fff;stroke-width:2.2"/>`)}
${tx(160, 176, "the cold viewer overrules the score")}`,
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
    source: "Parallax, used in animation since the multiplane camera; Disney's secondary action. The speed ratio is measured from real launch films. Layer-relative movement is what makes depth; scaling one flat composition is a graphic push, not parallax.",
    ev: "Studio practice, and an engine ratio",
    srcs: [["Caleb Ward, School of Motion, Working with Cameras in After Effects", "https://schoolofmotion.com/blog/cameras-after-effects"]],
    alt: "Pale dots in the background drift right while a large card travels left over them, with a smaller card following it.",
    art: () => `${g({ fx: "-26px", t: "1.4s", e: "linear" }, [30, 90, 150, 210, 270].map((x, i) => `<circle class="fm" cx="${x + 14}" cy="${34 + (i % 2) * 110}" r="7"/><circle class="fm" cx="${x + 44}" cy="${100 + (i % 3) * 22}" r="5"/>`).join(""))}
${g({ fx: "90px", d: ".1s", t: "1.2s" }, `<rect class="fw" x="62" y="58" width="150" height="76" rx="10" ${ring}/><rect class="fi" x="78" y="78" width="90" height="9" rx="4.5"/><rect class="fg" x="78" y="98" width="60" height="7" rx="3.5"/>`)}
${g({ fx: "90px", d: ".28s", t: "1.2s" }, `<rect class="ft" x="196" y="92" width="72" height="42" rx="8" ${ring}/>`)}
${tx(30, 182, "hero ←", "start")}${tx(290, 182, "ambient →", "end")}`,
  },
  {
    slug: "stepped-is-for-arrivals", group: "motion", title: "Stepped on tracks, fluid for glides",
    law: "Hold frames on discrete pop-ins; never on a smooth single-direction move.",
    explain: "Stepped motion, on twos or threes, gives pieces that assemble or jump a graphic rhythm. Applied to a scroll, pan or camera push it just looks like dropped frames. So the cards pop in stepped while the strip beneath them scrolls fluid. Cadence is chosen per track: at 24 fps twos are 12 updates a second and threes are 8, while the output frame rate never changes.",
    film: "A beat marked stepped is checked against its named moves. If it contains a scroll, pan, push, glide or orbit, the gate warns. The usual fix is to step only the pop-ins and leave the scroll smooth.",
    points: ["Stepped: pop-ins, assembly, hits on the beat.", "Fluid: scrolls, pans, pushes, glides, orbits.", "Name the tracks that are stepped; the camera is never one by accident.", "Mix ones, twos and threes where the action needs different clarity."],
    source: SRC_ENGINE + " Exposure cadence follows animation-school exposure sheets; a fully stepped frame is valid only when designed that way.",
    ev: "Studio practice, and one practitioner",
    srcs: [["D'Source design education, Exposure Sheet conventions", "https://www.dsource.in/course/exposure-sheet/conventions"], ["Danni Fisher-Shin, School of Motion interview: stepped art over a smooth camera", "https://schoolofmotion.com/blog/newer-software-for-2d-character-animation-danni-fisher-shin"]],
    alt: "Three cards appear in held steps on the top row. A long bar glides smoothly across the bottom row.",
    art: () => `${[0, 1, 2].map((i) => g({ d: `${i * 0.35}s`, fs: 0.4, t: ".6s", e: "steps(3,end)" }, `<rect class="${i === 1 ? "ft" : "fb"}" x="${40 + i * 90}" y="26" width="72" height="56" rx="8"/>`)).join("")}
${tx(40, 106, "stepped: pieces arriving", "start")}
${g({ fx: "-150px", d: ".1s", t: "1.8s", e: "cubic-bezier(.4,.14,.3,1)" }, `<rect class="fi" x="40" y="126" width="250" height="26" rx="13"/><circle class="ft" cx="270" cy="139" r="7"/>`)}
${tx(40, 180, "fluid: the glide", "start")}`,
  },
  {
    slug: "always-moving", group: "motion", title: "Always moving, no dead frames",
    law: "Something visibly moves in every moment; a hold is composed, not frozen.",
    explain: "A frame where nothing moves at all feels like the video stalled. Holds still exist, because people need time to read, but they carry a small secondary motion: a slow push, a light sweep, a swap. Constant mechanical drift is the opposite failure. Texture can be everywhere, but attention is still directed: \"everything moves\" is a look one project chose, not a quality requirement.",
    film: "The motion gate fails a film when a still stretch reaches 0.8 seconds. A hold is at most about 1.2 seconds, and an end card holds up to about 3 seconds while ambient light keeps moving.",
    points: ["No still stretch of 0.8 s or more.", "Fill a hold with secondary motion.", "No idle loops, breathing or pulsing on content."],
    source: "Disney's secondary action. The 0.8 second limit is measured from real launch films. Practitioners disagree on the rest: one animates every element subtly for a single concept, another warns that unnecessary secondary action hides the idea.",
    ev: "Engine default, and two practitioner views that differ",
    srcs: [["Jorge Canedo Estrada, Creativity & Detail interview", "https://medium.com/creativityand/creativity-detail-jorge-canedo-estrada-60cc605d2098"], ["Hanson Inc., Easing, Excessiveness, and Pace in Motion Design", "https://hansoninc.com/blog/easing-excessiveness-and-pace-in-motion-design"]],
    alt: "Two timelines. The top has a gap with a cross mark. The bottom is continuous with a playhead moving along it.",
    art: () => `${tx(30, 28, "a dead frame", "start")}
<rect class="fm" x="30" y="38" width="96" height="26" rx="6"/><rect class="fm" x="206" y="38" width="84" height="26" rx="6"/>
<rect x="132" y="38" width="68" height="26" rx="6" fill="none" stroke="#b3165a" stroke-width="2" stroke-dasharray="4 4"/>
<path class="ln sr" d="M154 44l24 14M178 44l-24 14" style="stroke-width:2.5"/>
${tx(30, 112, "always moving", "start")}
${[0, 1, 2].map((i) => `<rect class="fb" x="${30 + i * 88}" y="124" width="84" height="26" rx="6"/>`).join("")}
${g({ fx: "-230px", t: "2s", e: "linear" }, `<rect class="ft" x="275" y="116" width="6" height="42" rx="3" stroke="#1b1f5e" stroke-width="1.5"/>`)}`,
  },

  {
    slug: "real-motion-blur", group: "motion", title: "Real motion blur, not fog",
    law: "Blur follows speed and vanishes at rest; a constant haze is not motion blur.",
    explain: "Real motion blur comes from a shutter open for part of each frame: a fast object smears along its path, and a still object is sharp. A constant spatial blur, or ghost copies that never merge, looks like fog. Start from a half-frame exposure (a 180 degree shutter, 1/48 s at 24 fps) and add samples until the ghosts disappear.",
    film: "Fast moves are rendered from time samples, with the shutter and sample count logged, rather than faked with a CSS blur. Edges are checked for repeated silhouettes. Blur is kept off information the viewer needs to read, and large post-blur is avoided where hidden pixels are missing. Staccato graphic motion may stay sharp on purpose.",
    points: ["Blur depends on speed, shutter and phase.", "A stationary object is never smeared.", "Test around a half-frame exposure.", "More samples when ghosts show.", "Defocus, glow and glass are different effects."],
    source: "Adobe's documentation on temporal blur, shutter angle and sampling. The 180 degree figure is a conventional starting point, not a rule.",
    ev: "Studio practice (software vendor documentation)",
    srcs: [["Adobe Learn, Apply motion blur for smoother playback", "https://www.adobe.com/learn/after-effects/web/aftereffects-pixel-motion-blur-cc"], ["Adobe After Effects documentation, Assorted animation tools", "https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/assorted-animation-tools/assorted-animation-tools.html"], ["Joey Korenman, School of Motion, depth-of-field compositing: large post-blur breaks overlaps", "https://schoolofmotion.com/blog/depth-of-field-cinema-4d-nuke-after-effects"]],
    alt: "Top: a yellow circle slides in with a blue streak behind it that shortens to nothing as it stops. Bottom: a still circle with faint ghost copies, crossed out.",
    art: () => `${tx(30, 24, "streak follows speed, gone at rest", "start")}
<path class="ln sg" d="M30 54H290" style="stroke-width:1.5;stroke-dasharray:2 6"/>
${g({ fx: "-220px", t: "1.2s", e: "cubic-bezier(.05,.7,.1,1)" }, `<g class="shrink" style="${v({ t: "1.2s" })}"><rect class="fb" x="196" y="42" width="52" height="24" rx="12" opacity=".6"/></g><circle class="ft" cx="262" cy="54" r="12" ${ring}/>`)}
${tx(30, 106, "ghosts and fog on a still object", "start")}
<circle class="fg" cx="232" cy="138" r="12" opacity=".35"/><circle class="fg" cx="247" cy="138" r="12" opacity=".5"/><circle class="ft" cx="262" cy="138" r="12" ${ring}/>
${ln("M216 120L280 156", "sr", { d: ".9s", t: ".4s" })}
${tx(30, 182, "start near a half-frame exposure", "start")}`,
  },

  // ---------------------------------------------------------------- SCENES
  {
    slug: "scene-variety", group: "scenes", title: "Scene variety",
    law: "Give each scene its own idea, layout and ground, as a soft default.",
    explain: "The same layout for forty-five seconds reads as a slide deck, however well each slide moves. Variety is the backbone: full-frame type, a UI proof, a collage, an object, a quiet line. Each scene brings its own idea, so no single gimmick carries the film.",
    film: "Beats declare a `scene_type`, and the engine warns, and a person can overrule, when one carrier covers more than 40 percent of beats, a move repeats in more than two, or one transition family covers more than 30 percent of seams. Those numbers are starting points, not laws: a deliberate refrain can repeat a move if the score says why.",
    points: ["Each scene has its own idea.", "Repeat a move on purpose, and say why.", "Vary scale, ground and texture together.", "Contrasting materials work when one art direction holds them."],
    source: "Engine defaults, soft by design. Professional systems vary the surface and keep one grammar: no source supports a fixed shot count or a fixed number of scene types.",
    ev: "Studio practice, with engine defaults on top",
    srcs: [["BUCK, Nothing Playground: sharp vectors with organic textures, one vocabulary", "https://buck.co/work/nothing-playground"], ["Gunner, Dropbox Logo Animation System: a family grammar, varied functions", "https://legacy.gunner.work/dropbox"]],
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
    law: "Follow a crowded moment with an empty one; a long run of one kind needs a reason.",
    explain: "Contrast is what makes each scene read. A collage lands because the single line before it was quiet; the quiet line lands because of the collage. A long run of dense beats, or of sparse ones, flattens into a texture unless the story wants exactly that.",
    film: "Every beat declares its `density`. The engine warns on a long run of one kind and a person decides whether it is deliberate. No dense-to-sparse ratio is fixed; the test is whether the viewer gets a breath and a contrast. See An intensity map.",
    points: ["Alternate on purpose.", "A long uniform run is flagged for review, not rejected.", "A relentless passage is allowed when the story wants it."],
    source: SRC_ENGINE + " No published source gives a dense-to-sparse ratio, so none is claimed.",
    ev: "Single practitioner, with an engine default",
    srcs: [["Paddy Bird, Inside the Edit: pacing", "https://www.insidetheedit.com/blog/pacing-in-video-editing"]],
    alt: "A row of seven bars growing from the baseline, alternating tall and short.",
    art: () => [100, 26, 86, 30, 74, 20, 96].map((h, i) => g({ d: `${i * 0.12}s`, t: ".5s", o: "50% 100%" }, `<rect class="${i % 2 ? "fm" : "fb"}" x="${34 + i * 38}" y="${150 - h}" width="28" height="${h}" rx="5"/>`, "growy")).join("")
      + tx(34, 176, "dense", "start") + tx(286, 176, "sparse, alternating with dense", "end"),
  },
  {
    slug: "motivated-cuts", group: "scenes", title: "Every bridge earns its place",
    law: "A designed transition must carry something a plain cut would lose; otherwise cut.",
    explain: "Continuity is a design option, and a hard cut is a valid choice. A bridge is worth its frames when it carries an object, a shape or a velocity from one shot to the next, or when a spatial change needs explaining. If a plain cut says the same thing, the cut is simpler to make and to revise. Cutting on the beat is a choice too: neither always nor never is a law.",
    film: "Every expensive transition has a hard-cut candidate beside it, and the film keeps the bridge only when it conveys something the cut loses. Hard cuts are welcome. A small vocabulary of two or three bridge families plus cuts is a sensible starting constraint, not an industry rule, and exceptions need a reason. Accents are assigned to particular musical elements, not automatically to every beat.",
    points: ["Compare the designed bridge with a plain cut.", "Carry an object, shape or velocity, or cut.", "A fade or an empty blur is not a transition.", "Cut during meaningful action when the join should vanish.", "Cutting on the beat is optional, never a rule either way."],
    source: "Practitioners endorse both continuity and cuts in the same breath. The small-vocabulary idea is a RasanAI pilot proposal, not a studio standard.",
    ev: "Single practitioner, studio practice, and research on edit blindness",
    srcs: [["Sander van Dijk and Joey Korenman, School of Motion podcast: continuous motion, and cuts", "https://schoolofmotion.com/blog/sander-van-dijk-podcast"], ["Tim J. Smith and John M. Henderson, Edit Blindness (2008): cuts during action are often missed", "https://bop.unibe.ch/JEMR/article/view/2264/0"], ["ManvsMachine, Squarespace: a transition that enacts a product gesture", "https://www.squarespace.com/press-coverage/2017/9/25/manvsmachine-creates-films-for-squarespace-showing-three-creatives-practice-and-personalities"]],
    alt: "Top: two cards joined by a line along which a yellow dot is carried. Bottom: two cards side by side with a cut mark between them. A yellow check says keep what says more.",
    art: () => `${tx(24, 18, "bridge: carries the object", "start")}
<rect class="fm" x="24" y="26" width="60" height="44" rx="8"/><rect class="fm" x="236" y="26" width="60" height="44" rx="8"/>
${ln("M88 48H232", "sg", { d: ".1s", t: ".6s" })}
${g({ fx: "-130px", d: ".3s", t: ".9s", e: "cubic-bezier(.4,0,.2,1)" }, `<circle class="ft" cx="232" cy="48" r="9" ${ring}/>`)}
${tx(24, 108, "plain cut: 0 frames", "start")}
<rect class="fm" x="24" y="118" width="60" height="44" rx="8"/><rect class="fg" x="88" y="118" width="60" height="44" rx="8"/>
${g({ d: "1.3s", t: ".4s", o: "50% 100%" }, `<rect class="fi" x="84" y="110" width="4" height="60" rx="2"/>`, "growy")}
${g({ d: "1.7s", fs: 0.2, t: ".4s" }, `<circle class="ft" cx="262" cy="140" r="11" ${ring}/><path class="ln si" d="M256 140l4 4 8-9" style="stroke-width:2.2"/>`)}
${tx(290, 184, "keep what says more", "end")}`,
  },
  {
    slug: "plan-across-cuts", group: "scenes", title: "Plan across cuts",
    law: "Objects keep their role from scene to scene; nothing resets at a seam.",
    explain: "When every scene starts from a fresh empty frame, the film restarts every few seconds. Planning motion across the whole sequence means an object introduced in one scene has a destination and a job in the next: it carries the eye, keeps its identity and arrives somewhere expected. A chapter break can still interrupt on purpose.",
    film: "The score tracks each carried object's role and destination across scene boundaries, and automatic scene resets are treated as a flaw. Velocity just before and after a seam is compared, and a stop-and-restart pair with no reason is flagged. The next focal point is placed with the previous gaze position in mind.",
    points: ["Plan the whole sequence before connecting pairs of scenes.", "A carried object keeps one identity and one role.", "Place the next focal point near where the eye just was.", "A reset is allowed only as a deliberate chapter break."],
    source: "Practitioners describe a continuous pulse across boards, and film research describes attention-based continuity: viewers follow action across an edit without a fully consistent world map.",
    ev: "Single practitioner, and film cognition research",
    srcs: [["Sander van Dijk and Joey Korenman, School of Motion podcast", "https://schoolofmotion.com/blog/sander-van-dijk-podcast"], ["Tim J. Smith, Attentional Theory of Cinematic Continuity (2012)", "https://doi.org/10.3167/proj.2012.060102"], ["Walter Murch, In the Blink of an Eye: eye-trace in the Rule of Six", "https://bpb-us-w2.wpmucdn.com/portfolio.newschool.edu/dist/2/14941/files/2017/06/Murch-Walter-in-the-blink-of-an-eye-RULEofSIX-1tly3uz.pdf"]],
    alt: "Three scene frames in a row. A yellow dot sits in each one, and a line connects the three positions.",
    art: () => `${[["fw", 20], ["fi", 118], ["fw", 216]].map(([c, x], i) => g({ d: `${i * 0.2}s`, fs: 0.8, t: ".5s" }, `<rect class="${c}" x="${x}" y="48" width="86" height="72" rx="8" stroke="#1b1f5e" stroke-width="1.5"/><rect class="${c === "fi" ? "fm" : "fg"}" x="${x + 12}" y="${i === 1 ? 100 : 60}" width="${i === 2 ? 30 : 44}" height="8" rx="4"/>`)).join("")}
${ln("M54 98 C90 98 112 76 161 76 S226 96 258 98", "si", { d: ".9s", t: ".9s" })}
${[[54, 98, 0.9], [161, 76, 1.35], [258, 98, 1.8]].map(([x, y, d]) => g({ d: `${d}s`, fs: 0.2, t: ".35s" }, `<circle class="ft" cx="${x}" cy="${y}" r="8" ${ring}/>`)).join("")}
${["scene 1", "scene 2", "scene 3"].map((s, i) => tx(63 + i * 98, 140, s)).join("")}
${tx(160, 176, "the same object keeps its role at every seam")}`,
  },
  {
    slug: "intensity-map", group: "scenes", title: "An intensity map",
    law: "Change intensity on purpose, and be able to say why each big change happens.",
    explain: "A film that holds one emotional level for forty seconds reads as flat, even if every moment is lovely. Intensity is more than the cut rate: it is also how much the subject acts, how close it is and how the camera moves. Raise or lower each of those deliberately, and attach a reason to every large change. A deliberately relentless passage is still a legitimate choice.",
    film: "The score keeps an intensity map: cut rate, subject action, subject proximity and camera movement are tracked separately rather than folded into one invented score. Every major change carries an intent tag, long uniform runs are flagged for a person to review rather than rejected, and no dense-to-sparse ratio is imposed.",
    points: ["Track cut rate, action, proximity and camera separately.", "Give every tempo change an emotional destination.", "Flag long uniform runs for review, not rejection.", "A fast feel can come from a close, moving subject without more cuts."],
    source: "Practitioners describe pacing as four factors, and rank emotion first among the things an edit serves. The weights are personal, not measured effects, and no published ratio exists.",
    ev: "Single practitioners",
    srcs: [["Paddy Bird, Inside the Edit: pacing in video editing", "https://www.insidetheedit.com/blog/pacing-in-video-editing"], ["Walter Murch, In the Blink of an Eye: Rule of Six, emotion first", "https://bpb-us-w2.wpmucdn.com/portfolio.newschool.edu/dist/2/14941/files/2017/06/Murch-Walter-in-the-blink-of-an-eye-RULEofSIX-1tly3uz.pdf"]],
    alt: "A line graph of intensity over time that rises and falls in steps, with three yellow points on the changes, each labelled why.",
    art: () => `<path class="ln sg" d="M30 150H290M30 150V28" style="stroke-width:1.5"/>
${tx(36, 24, "intensity", "start")}
${ln("M30 130 C60 130 70 120 90 120 S112 60 140 60 S164 100 190 100 S214 40 240 40 S266 110 290 110", "si", { t: "1.8s", e: "ease-in-out" })}
${[[140, 60, 0.6, 46], [190, 100, 1.0, 120], [240, 40, 1.4, 26]].map(([x, y, d, ty]) => g({ d: `${d}s`, fs: 0.2, t: ".4s" }, `<circle class="ft" cx="${x}" cy="${y}" r="7" ${ring}/>`) + g({ d: `${d + 0.2}s`, t: ".3s" }, tx(x, ty, "why"))).join("")}
${tx(30, 178, "every big change has a reason", "start")}`,
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
    law: "Set the big line at display size; keep ordinary lines quieter, and check at viewing size.",
    explain: "Scale ranks ideas. The line that matters is big enough to fill the frame, and the quiet lines are small and sit in an empty frame. Type at the same size for five seconds flattens the rhythm, because the contrast between big and small is the rhythm.",
    film: "Hero lines usually reach 9 to 20 percent cap height and 40 to 90 percent of the frame width, and ordinary lines sit on sparse beats. Those are starting ranges, not a standard. There is no universal minimum size: if a line crowds, edit the copy or give it its own beat before shrinking it, then check it at the size the film is watched.",
    points: ["Scale contrast sets the reading order.", "Hero lines start around 9 to 20 percent of frame height.", "Quiet lines belong on sparse beats.", "Never shrink type to fit more copy: cut or split first.", "No source supports a universal minimum pixel size."],
    source: SRC_ENGINE + " The scale ranges are measured from real launch films; they are defaults. Practitioners agree on contrast, not on a number.",
    ev: "Single practitioner and studio practice, with engine defaults",
    srcs: [["Mike Frederick, School of Motion: contrast and type", "https://schoolofmotion.com/blog/4-simple-tips-to-design-with-contrast-and-type"], ["School of Motion, 10 Tiny Typography Decisions", "https://schoolofmotion.com/blog/tiny-typography-decisions-motion-graphics"]],
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
    film: "UI is usually a simplified recreation that follows the story rather than a raw screen recording, sized at about 35 to 60 percent of the frame by area as a starting range. The first proof arrives by about 40 percent of the runtime, and at least one beat is marked `core_job_demo`. Training or evidence footage may still need the original capture.",
    points: ["35 to 60 percent of the frame, as a starting range.", "The product doing the job, not just present.", "By about 40 percent of the runtime.", "Rebuild the operation; leave out incidental handling."],
    source: SRC_ENGINE + " Studios rebuild interface work around the narrative rather than filming raw capture.",
    ev: "Studio practice",
    srcs: [["MHF Creative, Awin brand film: rebuilt search, filtering and campaign workflows", "https://mhf-creative.com/work/awin-brand-evolution-film/"], ["Ordinary Folk, Webflow Ecommerce: the real UI stays focal", "https://www.ordinaryfolk.co/project/webflow-ecommerce"]],
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

  {
    slug: "word-decides-motion", group: "type", title: "The word decides the motion",
    law: "Take the animation unit and the behaviour from the word's meaning and shape, not from a preset.",
    explain: "Running the same entrance on every line makes the type feel generated. Ask what the word means and how it is drawn: a rising word can move letter by letter, a final word can land as one block, a spreading word can open outward. The unit, whole block, line or letter, is a design choice, and so is the tone: movement can carry mood as well as meaning.",
    film: "Each hero word has a short meaning-to-motion note and a named animation unit. The same preset across unlike layouts is flagged. Deformation such as a stretch or smear is tied to speed, kept to a brief transit pose, and returns to the true glyph outlines before the readable hold. A word swap is hidden at peak travel, with shared letters as anchors.",
    points: ["Choose block, line or letter from the word.", "The behaviour expresses the proposition.", "Stretch in proportion to speed, then restore the outlines.", "Hide a substitution at peak travel on shared letters.", "Pure branding can put mood first."],
    source: "Studio and practitioner accounts of authored type. A deliberate mismatch can be a joke, and instructional text may need a neutral delivery.",
    ev: "Studio practice, single practitioner, and research",
    srcs: [["Ordinary Folk, Google Gemini: text that carries meaning beside capabilities", "https://www.ordinaryfolk.co/project/gemini"], ["School of Motion, 10 Tiny Typography Decisions: derive the move from the word's shape", "https://schoolofmotion.com/blog/tiny-typography-decisions-motion-graphics"], ["Nol Honig, School of Motion: Stretch and Smear Text", "https://schoolofmotion.com/blog/stretch-and-smear-text-tutorial"], ["Lee, Forlizzi and Hudson, UIST 2002: kinetic text as expressive communication", "https://www.cs.cmu.edu/~johnny/academic/KT_Engine_UIST2002.pdf"]],
    alt: "Three words each moving differently: rise, with letters lifting one after another; stop, landing as a single block; spread, with letters moving outward from the centre.",
    art: () => `${["r", "i", "s", "e"].map((c, i) => g({ fy: "20px", d: `${i * 0.1}s`, t: ".5s" }, `<text class="big" x="${30 + i * 18}" y="58" text-anchor="start">${c}</text>`)).join("")}${tx(150, 54, "per letter, staggered", "start")}
${g({ fs: 1.7, d: ".7s", t: ".35s", o: "0% 50%" }, `<text class="big" x="30" y="108" text-anchor="start">stop</text>`)}${tx(150, 104, "one block, one hit", "start")}
${["s", "p", "r", "e", "a", "d"].map((c, i) => g({ fx: `${(2.5 - i) * 20}px`, d: "1.2s", t: ".6s" }, `<text class="big" x="${30 + i * 18}" y="158" text-anchor="start">${c}</text>`)).join("")}${tx(150, 154, "letters open outward", "start")}`,
  },
  {
    slug: "literal-ui-for-proof", group: "type", title: "Literal UI for proof, abstract UI for feeling",
    law: "Use exact interface states when you claim a capability; use abstraction when you sell a sensation.",
    explain: "Two jobs, two treatments. A proof shot has to be accurate: the real labels, the real figures, the real order of events. A feeling shot can abstract the interface into shape, colour and texture to express what using it is like. The mistake is letting an abstract shot stand in as evidence that a capability exists.",
    film: "Every shot is classed as proof or metaphor. Proof shots use recreated, approved states and stay legible. Metaphor shots are free to abstract and are never counted as the first proof or the core job demo. Explicitly labelled future concepts may depict behaviour that does not exist yet.",
    points: ["Proof: exact labels, figures and order.", "Feeling: shape, colour and texture are enough.", "An abstract shot never counts as evidence.", "Keep the product's truth as the anchor inside a decorative world."],
    source: "Studios split the two on purpose: one case study insists on exact interface text and figures, another abstracts the interface to express a listening benefit.",
    ev: "Studio practice",
    srcs: [["Liandan AI Studio, BGI Genpilot: interface text, clicks and figures built deterministically", "https://liandankeji.com/work/projects/p010/index.en.html"], ["Oddfellows, Spotify Premium: tactile 3D and abstracted UI", "https://oddfellows.tv/work/spotify-premium"], ["Ordinary Folk, Webflow Ecommerce: the actual UI stays focal", "https://www.ordinaryfolk.co/project/webflow-ecommerce"]],
    alt: "Left, a precise interface card with a highlighted row and a check, labelled proof, literal. Right, overlapping soft shapes and a wave, labelled feeling, abstract.",
    art: () => `${g({ fx: "-16px", t: ".6s" }, `<rect class="fw" x="20" y="30" width="134" height="112" rx="10" ${ring}/><rect class="fi" x="34" y="44" width="60" height="8" rx="4"/><rect class="fm" x="34" y="66" width="106" height="12" rx="5" opacity=".5"/><rect class="ft" x="34" y="86" width="106" height="12" rx="5"/><rect class="fm" x="34" y="106" width="80" height="12" rx="5" opacity=".5"/><circle class="fb" cx="132" cy="48" r="8"/><path class="ln" d="M128 48l3 3 5-6" style="stroke:#fff;stroke-width:2"/>`)}
${g({ fx: "16px", d: ".25s", t: ".6s" }, `<circle class="fb" cx="206" cy="72" r="28" opacity=".85"/><circle class="ft" cx="242" cy="90" r="22" opacity=".9"/><rect class="fm" x="196" y="96" width="60" height="26" rx="13" opacity=".8"/><path class="ln si" d="M176 134 C196 114 216 152 238 132 S278 112 296 130" style="stroke-width:2"/>`)}
${tx(87, 164, "proof: literal")}${tx(237, 164, "feeling: abstract")}
${tx(160, 188, "abstract never stands as evidence")}`,
  },
  {
    slug: "product-state-truth", group: "type", title: "Product-state truth",
    law: "Labels and figures match from shot to shot, and an action shows its result.",
    explain: "A viewer who sees 12 contacts in one shot and 14 in the next stops trusting every other number. The same goes for a button that is clicked and then nothing changes. Treat each shot as a state of one product: the figures persist unless something changes them, and every action is followed by the state it causes. Compressed demonstrations are fine when the cause and effect they show is true.",
    film: "UI words and numbers come from approved state data, not from a generative image, and are compared frame to frame. The order action, then state change is validated, and a sped-up wait is disclosed when it matters. Generated imagery may supply backgrounds, never interface text or controls.",
    points: ["Same label, same figure, until something changes it.", "An action is followed by its result.", "Generated imagery supplies backgrounds, never the interface.", "Disclose a sped-up wait when it is material."],
    source: "A production account of building interface text, clicks and highlights deterministically while AI supplied only backgrounds. The idea that a compressed demonstration must keep truthful causality is a RasanAI inference from it.",
    ev: "Studio practice, and a RasanAI inference",
    srcs: [["Liandan AI Studio, BGI Genpilot production case study", "https://liandankeji.com/work/projects/p010/index.en.html"]],
    alt: "Two interface cards. The first shows 12 contacts and a Send button. The second shows the same 12 contacts and a Sent confirmation. A line joins the two matching figures.",
    art: () => `${g({ fx: "-14px", t: ".6s" }, `<rect class="fw" x="24" y="34" width="112" height="94" rx="10" ${ring}/><text class="strong" x="80" y="64" text-anchor="middle">12 contacts</text><rect class="ft" x="42" y="86" width="76" height="26" rx="13"/><text class="txb" x="80" y="103" text-anchor="middle">Send</text>`)}
${ln("M142 104h36m-8-8l8 8-8 8", "si", { d: ".6s", t: ".4s" })}
${g({ fx: "14px", d: ".9s", t: ".6s" }, `<rect class="fw" x="184" y="34" width="112" height="94" rx="10" ${ring}/><text class="strong" x="240" y="64" text-anchor="middle">12 contacts</text><rect class="fb" x="202" y="86" width="76" height="26" rx="13"/><text class="txb" x="240" y="103" text-anchor="middle" style="fill:#fff">Sent</text>`)}
${ln("M136 58H184", "sg", { d: "1.3s", t: ".4s" })}${tx(160, 50, "same")}
${tx(80, 150, "action")}${tx(240, 150, "result")}
${tx(160, 184, "same figures; the action shows its result")}`,
  },
  {
    slug: "brand-motifs", group: "type", title: "Motifs from the brand and the product",
    law: "Take recurring shapes and metaphors from this brand and its verbs; pass the logo-swap test.",
    explain: "Swap the logo for a competitor's: if the film still works, the decoration was generic. Motifs that come from the brand's own vocabulary (its grids, dots, type, transparency) or from what the product actually does give identity without stamping the logo everywhere. Contrasting material languages are welcome inside one art direction, such as sharp vectors against organic texture.",
    film: "Every major motif carries a provenance note: the brand asset or the product verb it comes from. Decoration with no brand or story role is rejected at review. An object transition enacts a product gesture, so the bridge explains something, and a metaphor that obscures the operation is replaced.",
    points: ["Run the logo-swap test on the whole film.", "Derive grids and textures from the brand's own vocabulary.", "Let a physical action stand for a product verb.", "Pair contrasting materials inside one art direction."],
    source: "Studio case studies that build identity from the brand's own materials, and a studio framework that translates digital gestures into physical scenarios. The logo-swap test is an editorial check, not a measurement.",
    ev: "Studio practice",
    srcs: [["BUCK, Nothing Playground: dots, grids, pixels, type and transparency", "https://buck.co/work/nothing-playground"], ["Adam Rowe, ManvsMachine for Squarespace: digital gestures made physical", "https://www.squarespace.com/press-coverage/2017/9/25/manvsmachine-creates-films-for-squarespace-showing-three-creatives-practice-and-personalities"], ["Oddfellows, Spotify Premium: the benefit decides the material behaviour", "https://oddfellows.tv/work/spotify-premium"]],
    alt: "Left, a panel of generic scattered shapes crossed out under the words same either way. Right, a panel of a grid of squares with one yellow, labelled only this product.",
    art: () => `${g({ t: ".5s", fs: 0.8 }, `<rect class="fw" x="20" y="30" width="130" height="100" rx="10"/><circle class="fg" cx="52" cy="62" r="12"/><path class="fm" d="M84 54l16 28H68z"/><circle class="fb" cx="120" cy="64" r="7"/><rect class="fg" x="44" y="94" width="26" height="14" rx="7"/><circle class="fm" cx="108" cy="102" r="10"/>`)}
${ln("M30 40L140 120", "sr", { d: ".8s", t: ".4s" })}
${g({ d: ".3s", t: ".5s", fs: 0.8 }, `<rect class="fw" x="170" y="30" width="130" height="100" rx="10"/>${Array.from({ length: 12 }, (_, i) => `<rect class="${i === 6 ? "ft" : "fm"}" x="${186 + (i % 4) * 28}" y="${46 + Math.floor(i / 4) * 26}" width="20" height="18" rx="3"${i === 6 ? ` ${ring}` : ""}/>`).join("")}`)}
${tx(85, 152, "same either way")}${tx(235, 152, "only this product")}
${tx(160, 184, "swap the logo: does anything change?")}`,
  },
  {
    slug: "viewing-size", group: "type", title: "Check at real viewing size",
    law: "Judge hierarchy, spacing and crop at the size people will actually watch, phone included.",
    explain: "A line that is comfortable on an editing monitor can vanish on a phone. There is no universal minimum pixel size, so the only honest test is to look at the film at the size it will be seen. When type crowds, edit the copy, give the line its own beat or add empty space before shrinking it, and kern large type by eye, because equal gaps look uneven.",
    film: "A viewing-size pass checks the crop, the optical letter spacing, the hierarchy and the empty space at display size and at phone size, and the interface target is checked for visibility there too. Font-size cuts made after copy grows are flagged with the offer of shorter copy or a new beat.",
    points: ["Look at the film on a phone before it ships.", "No universal minimum size exists; test instead.", "Edit or move the copy before shrinking the type.", "Use negative space before reducing the message's scale.", "Kern big type optically."],
    source: "Practitioners on type contrast, optical kerning and negative space. None gives a minimum size, and a research paper on static reading speed (238 words a minute) is not a motion limit.",
    ev: "Studio practice, and single practitioners",
    srcs: [["School of Motion, 10 Tiny Typography Decisions", "https://schoolofmotion.com/blog/tiny-typography-decisions-motion-graphics"], ["Mike Frederick, School of Motion: contrast and type", "https://schoolofmotion.com/blog/4-simple-tips-to-design-with-contrast-and-type"]],
    alt: "Left, a large frame in an editor with a clear heading and a small line. Right, a phone with the same film at small size, where the small line is crossed out as unreadable.",
    art: () => `${g({ fx: "-14px", t: ".6s" }, `<rect class="fw" x="20" y="30" width="170" height="100" rx="10" ${ring}/><rect class="fi" x="36" y="56" width="100" height="14" rx="4"/><rect class="fg" x="36" y="84" width="76" height="6" rx="3"/>`)}${tx(105, 152, "in the editor: fine")}
${g({ fx: "14px", d: ".3s", t: ".6s" }, `<rect class="fk" x="222" y="24" width="64" height="120" rx="12"/><rect class="fw" x="228" y="62" width="52" height="30" rx="3"/><rect class="fi" x="232" y="70" width="28" height="5" rx="2"/><rect class="fg" x="232" y="80" width="20" height="2" rx="1"/>`)}
${ln("M246 76l16 12", "sr", { d: "1.1s", t: ".3s" })}
${tx(254, 162, "phone: too small")}
${tx(160, 188, "judge it at the size it is watched")}`,
  },

  // ---------------------------------------------------------------- SOUND
  {
    slug: "who-leads", group: "sound", title: "Who leads",
    law: "At every passage, decide whether voice, music or sound is leading, and let the others make room.",
    explain: "Words and score take turns. After a key spoken line, the music's important phrase gets room before the next line arrives. An accent can follow a swell or a hi-hat rather than the kick. Sometimes sound deliberately leads, or runs in counterpoint to the picture. What fails is everything speaking at once, or music used as wallpaper that forces a rhythm the pictures cannot hold.",
    film: "The score marks each passage as voiceover-led, music-led or sound-led. Gaps after key lines are compared with the music's phrases, and a truncated flourish is flagged. Each visual accent is tied to a named musical element and its sync error is measured in frames. Counterpoint is allowed when tagged and never against essential instructional cause.",
    points: ["One leader per passage.", "Give the music's phrase room after a key line.", "Assign accents to musical elements, not only the kick.", "Counterpoint when agreement would be predictable.", "A sung or tightly interwoven passage may combine them."],
    source: "Editors on duet-style assignment of picture to music, and sound designers on sound that leads or creates friction.",
    ev: "Single practitioner, and studio practice",
    srcs: [["Paddy Bird, Inside the Edit: Duet Theory and musical element assignment", "https://www.insidetheedit.com/blog/mistake-editors-make-cutting-music"], ["Skillbard, Motionographer: sound that subverts the action", "https://partners.motionographer.com/2024/11/11/unsung-heroes-skillbard/"], ["Stefan Kostaras, pelican sound, Motionographer: anticipation, tension and release", "https://partners.motionographer.com/2025/04/21/unsung-heroes-pelican-sound/"]],
    alt: "Three horizontal lanes labelled voice, music and sound. In each lane a yellow segment marks where it leads, and the three segments follow one another left to right.",
    art: () => [["voice", 44, 62, 84], ["music", 96, 146, 78], ["sound", 148, 224, 72]].map(([s, y, x, w], i) => `${tx(20, y + 16, s, "start")}<rect class="fm" x="62" y="${y}" width="234" height="24" rx="6" opacity=".4"/>${g({ d: `${i * 0.5}s`, t: ".6s", o: "0% 50%" }, `<rect class="ft" x="${x}" y="${y}" width="${w}" height="24" rx="6" ${ring}/>`, "grow")}`).join("")
      + tx(160, 190, "each passage has one leader"),
  },
  {
    slug: "sound-hierarchy", group: "sound", title: "A sound hierarchy",
    law: "Give signature sounds to the few important actions and let the rest stay abstract.",
    explain: "A hit on every entrance flattens the mix: nothing stands out because everything does. Pick a few standout actions to carry a signature sound, and let the other motion be quiet or abstract. Pull sound effects back when the music takes the lead, and edit or move a music stem when it hides a key sound, instead of just turning the effect up. Dense Foley is a choice for a film that wants a realistic texture, not a default.",
    film: "Foreground effects are mapped to hero actions, and one-effect-per-layer automation is flagged. Marked music-led sections are compared with the density of sound transients, and masking at the hero sounds is checked. There is no global sounds-per-second target.",
    points: ["A few signature hits on hero actions.", "No hit on every entrance.", "Fewer effects when the music leads.", "Move or edit a music stem before raising an effect.", "No sounds-per-second target."],
    source: "Sound studios describe choosing a few standout actions and leaving the rest abstract, and making space in the music for the sound designer. Nothing supports a fixed density.",
    ev: "Studio practice",
    srcs: [["Wesley Slover and Trevor, Sono Sanctus, School of Motion podcast", "https://schoolofmotion.com/blog/sono-sanctus-podcast-podcast"], ["Stefan Kostaras, pelican sound, Motionographer", "https://partners.motionographer.com/2025/04/21/unsung-heroes-pelican-sound/"]],
    alt: "A row of twelve bars. Ten are low and pale. Two are tall and yellow, each labelled hero.",
    art: () => Array.from({ length: 12 }, (_, i) => { const hero = i === 4 || i === 8, h = hero ? (i === 4 ? 64 : 72) : [14, 12, 16, 12, 0, 12, 14, 12, 0, 14, 12, 16][i];
      return g({ d: `${i * 0.08}s`, t: ".4s", o: "50% 100%" }, `<rect class="${hero ? "ft" : "fm"}" x="${30 + i * 22}" y="${140 - h}" width="14" height="${h}" rx="4"${hero ? ` ${ring}` : ""}/>`, "growy"); }).join("")
      + tx(30 + 4 * 22 + 7, 64, "hero") + tx(30 + 8 * 22 + 7, 56, "hero")
      + tx(30, 170, "signature hits on the important actions", "start"),
  },
  {
    slug: "sound-planned-early", group: "sound", title: "Plan sound early, test on mute",
    law: "Plan the sound before the animation is final, and make sure the picture reads with the sound off.",
    explain: "When sound is added last, it can only decorate. When it is planned from the start, score, effects and voice shape the animatic and the picture shapes the audio. The matching discipline is a mute pass: music can hide a weak picture rhythm, so review the film silent and see whether each hold still carries information. A music-led montage is the exception, where the silent pass is a diagnostic.",
    film: "Music direction and audio notes exist before animation lock. One representative slice of picture and sound, with a transition, a proof moment and a hold, is approved before the film is finished. The muted review is part of every check, and a person marks holds with nothing new to say.",
    points: ["Music direction before animation lock.", "Approve one slice of picture and sound first.", "Review on mute: do the holds carry information?", "A music-led montage is judged differently.", "Block the whole film as an animatic before polishing."],
    source: "Studios describe considering score, effects and voice from the start; editors warn music can prop up a weak picture edit. They disagree only on how early music leads, so the mode is chosen on purpose.",
    ev: "Studio practice, and single practitioners",
    srcs: [["Ordinary Folk, studio process: sound considered from the start", "https://www.ordinaryfolk.co/process"], ["Wesley Slover and Trevor, Sono Sanctus: a roughly 15 s slice for a sound-design demo", "https://schoolofmotion.com/blog/sono-sanctus-podcast-podcast"], ["Zack Arnold, Frame.io, Art of the Cut: music can conceal a weak edit", "https://blog.frame.io/2021/06/02/art-of-the-cut-cobra-kai-zack-arnold/"], ["Giant Ant, Slack Traffic: block the film as an animatic first", "https://www.giantant.ca/slack-traffic"]],
    alt: "Picture and sound bars start together at the left. A late sound bar is dashed and crossed out. A speaker icon with a slash is labelled picture reads on mute.",
    art: () => `${tx(20, 56, "picture", "start")}<rect class="fm" x="72" y="40" width="224" height="22" rx="6"/>${g({ t: "1.2s", o: "0% 50%", e: "linear" }, `<rect class="fb" x="72" y="40" width="224" height="22" rx="6"/>`, "grow")}
${tx(20, 90, "sound", "start")}<rect class="fm" x="72" y="74" width="224" height="22" rx="6"/>${g({ t: "1.2s", o: "0% 50%", e: "linear" }, `<rect class="ft" x="72" y="74" width="224" height="22" rx="6" ${ring}/>`, "grow")}
${tx(20, 124, "late", "start")}<rect x="206" y="108" width="90" height="22" rx="6" fill="none" stroke="#b3165a" stroke-width="2" stroke-dasharray="4 4"/>${ln("M232 112l38 14M270 112l-38 14", "sr", { d: ".9s", t: ".3s" })}
${g({ d: ".5s", t: ".5s" }, `<path d="M30 160h9l12-9v30l-12-9h-9z" fill="#1b1f5e"/>`)}${ln("M26 186L58 150", "sr", { d: "1s", t: ".3s" })}
${tx(70, 172, "picture reads on mute", "start")}`,
  },

  // ---------------------------------------------------------------- RARE TOOLS
  {
    slug: "cursor-once", group: "rare", title: "One cursor, with a reason",
    law: "Use a travelling cursor once per film, for a real action in the product.",
    explain: "A cursor pointing at words is the standard AI emphasis. A cursor that clicks Create in a real prompt box is a moment of the product itself. Used once, with a reason, it is a tool; used across beats, it is a tic.",
    film: "A film may carry one travelling cursor, with a declared `cursor_reason` such as \"clicks Create in the real prompt box\". It is 3 to 4 percent of the short side, travels on an arc with ease in and out, never linear, and ends in one purposeful action.",
    points: ["Once per film.", "Only for a real product action.", "An arc with ease in and out, never linear.", "State the reason in the score.", "Animate it from its own track: remove jitter and the stop-recording drift, and hide it when it explains nothing."],
    source: "Engine rule from real launch films. Screen-demo tools record the pointer separately from the screen so its travel, size and visibility can be edited on their own.",
    ev: "Studio practice (product team), and an engine rule",
    srcs: [["Screen Studio, Product Demo recording method", "https://screen.studio/create/product-demo-videos"], ["Screen Studio, Cursor guide: shake removal, size, hiding", "https://preview.screen.studio/guide/cursor"]],
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
    source: "Engine invariant, from real launch films. Also a photosensitivity safeguard: see the accessibility laws. Community critics also single out deep shadows and glows that overpower the interface; that is one commenter's opinion, not studio consensus.",
    ev: "Engine invariant, plus a community opinion",
    srcs: [["Community critique of overly dark shadows and glows, r/MotionDesign, 26 April 2026 (opinion)", "https://www.reddit.com/r/MotionDesign/comments/1swdixt/"]],
    alt: "A set of concentric rings and floating dots crossed out on the left. On the right a band of colour light sweeps across a card.",
    art: () => `<g opacity=".75"><circle cx="82" cy="96" r="18" fill="none" stroke="#7c83f5" stroke-width="3"/><circle cx="82" cy="96" r="34" fill="none" stroke="#7c83f5" stroke-width="2"/><circle cx="82" cy="96" r="50" fill="none" stroke="#7c83f5" stroke-width="1.5"/><circle cx="40" cy="50" r="5" fill="#9fa5d4"/><circle cx="128" cy="62" r="7" fill="#9fa5d4"/><circle cx="118" cy="146" r="4" fill="#9fa5d4"/></g>
${ln("M34 150L132 42", "sr", { d: ".3s", t: ".5s" })}
<defs><clipPath id="c-glow"><rect x="178" y="48" width="118" height="96" rx="10"/></clipPath><linearGradient id="gl-glow" x1="0" x2="1"><stop offset="0" stop-color="#efb21a" stop-opacity="0"/><stop offset=".5" stop-color="#efb21a" stop-opacity=".95"/><stop offset="1" stop-color="#efb21a" stop-opacity="0"/></linearGradient></defs>
<rect class="fi" x="178" y="48" width="118" height="96" rx="10"/>
<g clip-path="url(#c-glow)">${g({ fx: "-150px", d: ".5s", t: "1.4s", e: "cubic-bezier(.4,.14,.3,1)" }, `<rect x="210" y="40" width="80" height="120" fill="url(#gl-glow)"/>`)}</g>
${tx(82, 176, "banned")}${tx(237, 176, "colour light that moves")}`,
  },

  {
    slug: "ai-tells", group: "rare", title: "Fourteen AI tells, ranked",
    law: "Fourteen ways a film gives itself away as generated, from most to least damaging, each with its fix.",
    explain: "This is a ranked editorial diagnosis, not an AI detector. Human work can have every one of these problems, and AI-assisted work can avoid them all. The ranking puts comprehension first: a film that people cannot understand is worse than one with a slightly stale entrance. Several entries rest on community critique, which is opinion, not studio consensus, and each is marked.",
    film: "These are the failures RasanAI reviews against, in this order. The top three are checked hardest: the product is understood afterwards, copy becomes comfortably readable, and shots do not repeat one entrance, wait and exit pattern.",
    points: ["Comprehension first, polish second.", "Readable copy before fast copy.", "Sequences of actions, not repeated entrances.", "Glow, fog and wallpaper music come last, but they still give the game away."],
    source: "A ranked editorial synthesis from the cited production accounts and, where marked, community critiques whose authors' professional identities were not verified.",
    ev: "Editorial ranking; community critiques are opinions",
    srcs: [["Hanson Inc., Easing, Excessiveness, and Pace in Motion Design", "https://hansoninc.com/blog/easing-excessiveness-and-pace-in-motion-design"]],
    ranked: [
      { tell: "The product is hard to understand after the film ends.", fix: "Rebuild the proof around an operation and its result; cut decorative competition.", basis: "Studio practice: rebuilt, narrative-led UI and truthful causality.", url: "https://hansoninc.com/blog/easing-excessiveness-and-pace-in-motion-design", label: "Hanson Inc." },
      { tell: "Copy exists on the timeline but never becomes comfortably readable.", fix: "Measure settled exposure, shorten copy and stabilise proof shots.", basis: "Community critique calling fast type unreadable, 3 March 2026 (opinion).", url: "https://www.reddit.com/r/MotionDesign/comments/1rjnolp/how_can_i_improve_it/", label: "r/MotionDesign" },
      { tell: "Every shot uses the same entrance, wait, exit pattern.", fix: "Plan a sequence of actions, carried states and purposeful cuts.", basis: "Community feedback on stale pauses and a redundant double move, 18 June 2026 (opinion).", url: "https://www.reddit.com/r/MotionDesign/comments/1u8w6xi/please_rate_this/", label: "r/MotionDesign" },
      { tell: "The music is wallpaper, or forces a rhythm the pictures do not sustain.", fix: "Restructure musical phrases and allow music-led gaps after words.", basis: "Single practitioner: duet theory for music and picture.", url: "https://www.insidetheedit.com/blog/mistake-editors-make-cutting-music", label: "Paddy Bird" },
      { tell: "Ten seconds pass with no useful information or payoff.", fix: "Trim the loading-like interval or make it a legible demonstration.", basis: "Timestamped community critique of one video, 7 April 2025 (opinion).", url: "https://www.reddit.com/r/MotionDesign/comments/1jthjuo/", label: "r/MotionDesign" },
      { tell: "Easing is so extreme that an important object's action is unreadable.", fix: "Reduce curve steepness or give the action more time.", basis: "Community critique of a wheel arrival, 8 January 2025 (opinion).", url: "https://www.reddit.com/r/MotionDesign/comments/1hwj5w1/", label: "r/MotionDesign" },
      { tell: "Large type has careless gaps, breaks or weak relative scale.", fix: "Art-direct the actual words and their movement together.", basis: "Single practitioner, with a worked demonstration.", url: "https://schoolofmotion.com/blog/4-simple-tips-to-design-with-contrast-and-type", label: "Mike Frederick" },
      { tell: "UI labels, numbers or interaction logic drift between shots.", fix: "Render approved states deterministically and validate their sequence.", basis: "Studio production account of deterministic interface work.", url: "https://liandankeji.com/work/projects/p010/index.en.html", label: "Liandan AI Studio" },
      { tell: "The whole frame is stepped, including a camera that should be fluid.", fix: "Put exposure cadence on selected object tracks.", basis: "Practitioner interview on stepped art over a smooth camera.", url: "https://schoolofmotion.com/blog/newer-software-for-2d-character-animation-danni-fisher-shin", label: "Danni Fisher-Shin" },
      { tell: "Deep shadows and glows overpower the interface.", fix: "Reduce the treatment and check it against the actual UI hierarchy.", basis: "Community critique, 26 April 2026 (opinion).", url: "https://www.reddit.com/r/MotionDesign/comments/1swdixt/", label: "r/MotionDesign" },
      { tell: "Blur creates persistent fog or ghost copies.", fix: "Use velocity-linked temporal blur and enough samples; inspect edges.", basis: "Software documentation on temporal sampling.", url: "https://www.adobe.com/learn/after-effects/web/aftereffects-pixel-motion-blur-cc", label: "Adobe" },
      { tell: "Every visual event has an equally prominent whoosh or click.", fix: "Select sound anchors and give music space to lead.", basis: "Studio practice: a few signature moments, not every object.", url: "https://schoolofmotion.com/blog/sono-sanctus-podcast-podcast", label: "Sono Sanctus" },
      { tell: "The film could advertise any SaaS product after swapping the logo.", fix: "Build motifs and metaphors from the specific brand and product verbs.", basis: "Studio framework: digital gestures made physical.", url: "https://www.squarespace.com/press-coverage/2017/9/25/manvsmachine-creates-films-for-squarespace-showing-three-creatives-practice-and-personalities", label: "ManvsMachine" },
      { tell: "A beautiful middle has no cumulative progression or satisfying ending.", fix: "Connect transformations causally and resolve picture and score together.", basis: "Studio process notes on moving from beauty shots to a causal story.", url: "https://tendril.studio/work/coinbase/", label: "Tendril" },
    ],
    alt: "Fourteen horizontal bars stacked from the longest at the top, marked 1 in yellow, to the shortest at the bottom, marked 14.",
    art: () => Array.from({ length: 14 }, (_, i) => g({ d: `${i * 0.07}s`, t: ".5s", o: "0% 50%" }, `<rect class="${i === 0 ? "ft" : i < 3 ? "fb" : "fm"}" x="44" y="${12 + i * 12.6}" width="${250 - i * 15}" height="8" rx="4"${i === 0 ? ` ${ring.replace("2.5", "1.5")}` : ""}/>`, "grow")).join("")
      + tx(36, 20, "1", "end") + tx(36, 12 + 13 * 12.6 + 8, "14", "end"),
  },

  // ---------------------------------------------------------------- ACCESS
  {
    slug: "three-flashes", group: "access", title: "No more than three flashes a second",
    law: "Never flash full-frame contrast more than three times in any second.",
    explain: "Rapid flashing can trigger seizures in people with photosensitive epilepsy, so this is a hard limit and not a style choice. Avoid alternating full-frame black and white, avoid flashing saturated red, and change one element on a constant ground instead.",
    film: "The render gate measures flashes in the finished film (`photosensitivity-flash`) and fails it above the limit. Flash bursts vary one element on a locked layout and keep the luminance change small.",
    points: ["Three flashes a second at most.", "No alternating full-frame black and white.", "No flashing saturated red.", "Change an element, not the ground.", "Screen striped type and grids for regular-pattern hazards too, and offer a reduced-motion version for big zooms and parallax."],
    source: "WCAG 2.3.1, Three Flashes or Below Threshold (Success Criterion, level A). Ofcom's broadcast guidance sets a similar limit and also covers regular patterns (more than five light and dark stripe pairs, under conditions). WebKit lists zoom, blur, spinning and multi-directional motion as triggers even without flashing. These are conditional tests, not pixel thresholds.",
    ev: "Studio practice and standards",
    srcs: [["Ofcom / ITC guidance on flashing images and regular patterns (PDF)", "https://www.ofcom.org.uk/siteassets/resources/documents/tv-radio-and-on-demand/broadcast-guidance/gn_flash.pdf?v=324195"], ["WebKit, Responsive Design for Motion", "https://webkit.org/blog/7551/responsive-design-for-motion/"]],
    srcUrl: "https://www.w3.org/TR/WCAG22/#three-flashes-or-below-threshold",
    alt: "A one second timeline with three yellow flash marks, and a fourth dashed mark crossed out.",
    art: () => `<rect class="fm" x="30" y="86" width="260" height="28" rx="6"/>
${[62, 126, 190].map((x, i) => g({ d: `${0.2 + i * 0.4}s`, fs: 0.2, t: ".35s" }, `<rect class="ft" x="${x}" y="80" width="14" height="40" rx="3" stroke="#1b1f5e" stroke-width="2"/>`)).join("")}
<rect x="254" y="80" width="14" height="40" rx="3" fill="none" stroke="#b3165a" stroke-width="2" stroke-dasharray="3 3"/>
${ln("M248 74l26 52M274 74l-26 52", "sr", { d: "1.5s", t: ".3s" })}
${tx(30, 150, "0 s", "start")}${tx(290, 150, "1 s", "end")}${tx(160, 178, "3 flashes at most in any second")}`,
  },
  {
    slug: "time-to-read", group: "access", title: "Readable exposure",
    law: "A line counts as readable only once it has settled, at about 2.7 to 3 words a second.",
    explain: "The time a layer exists on the timeline is not the time a viewer can read it: the entrance eats the first part, an exit or a cover-up eats the last. Count exposure from the moment the line is settled and unobstructed, at about 2.7 to 3 words a second, and give unfamiliar names, long figures and busy pictures extra time. If a line does not fit, cut words; speeding up the type breaks reading.",
    film: "Each essential line is measured for effective words a second over its readable exposure, with a character-rate check alongside for long technical words. Four words need roughly 1.5 seconds settled; the engine's older 0.6 s plus 0.3 s a word formula is a conservative form of the same idea. A familiar repeated word can be a graphic accent at 0.25 to 0.75 s, but that range says nothing about reading a sentence.",
    points: ["Count only settled, unoccluded time.", "About 2.7 to 3 words a second, as a reference not a law.", "More time for names, figures and busy pictures.", "Keep essential messages out of fast word streams.", "Cut words rather than speed up."],
    source: "Subtitle practice: the BBC's 160 to 180 words a minute is 2.67 to 3 words a second, with extra time for difficult content. These are adaptations from subtitling, not a kinetic-type standard, and silent-reading averages (about 238 words a minute) are not a limit for film. A \"read it twice\" check by the designer is a practitioner habit, not a timing law.",
    ev: "Studio practice (subtitles), a study, and a practitioner check",
    srcs: [["BBC Subtitle Guidelines (archived mirror)", BBC], ["Netflix, English USA Timed Text Style Guide: character-rate limits", "https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide"], ["Di Nocera, Ricciardi and Juola, 2018: comprehension fell at higher RSVP rates", "https://www.inderscience.com/info/e_inarticle.php?artid=96118"], ["Hanson Inc.: read it twice, a practitioner check (opinion)", "https://hansoninc.com/blog/easing-excessiveness-and-pace-in-motion-design"]],
    alt: "A bar with a short grey entrance segment, then a long settled segment divided into four word boxes, labelled settled, 4 words, about 1.5 seconds.",
    art: () => `${g({ t: ".5s", o: "0% 50%" }, `<rect class="fm" x="30" y="84" width="60" height="32" rx="6"/>`, "grow")}
${[0, 1, 2, 3].map((i) => g({ d: `${0.5 + i * 0.25}s`, t: ".3s", o: "0% 50%" }, `<rect class="fb" x="${94 + i * 50}" y="84" width="46" height="32" rx="6"/>`, "grow")).join("")}
${tx(60, 74, "entrance")}${tx(194, 74, "settled: 4 words")}
<path class="ln si" d="M94 134h196" style="stroke-width:2"/>
${tx(192, 154, "about 1.5 s at 2.7 to 3 words a second")}`,
  },

];
