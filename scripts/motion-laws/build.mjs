#!/usr/bin/env node
// Builds docs/motion-laws.html and docs/motion-laws/<slug>.html from data.mjs, and keeps docs/sitemap.xml in step.
// Usage: node scripts/motion-laws/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GROUPS, LAWS } from "./data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const docs = join(root, "docs");
const SITE = "https://sibhimanyu.github.io/rasanai/";
const LASTMOD = "2026-11-03";
const STUDIO_NOTES = "https://github.com/Sibhimanyu/rasanai/releases/tag/studio-v0.31.1-beta.1";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rich = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
const group = (id) => GROUPS.find((x) => x.id === id);
const svg = (law, { label }) =>
  `<svg viewBox="0 0 320 200" ${label ? `role="img" aria-label="${esc(law.alt)}"` : 'aria-hidden="true" focusable="false"'} xmlns="http://www.w3.org/2000/svg">${label ? `<title>${esc(law.alt)}</title>` : ""}${law.art()}</svg>`;

const head = ({ title, desc, path, depth }) => {
  const up = depth ? "../" : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<meta name="theme-color" content="#1B1F5E" />
<meta name="author" content="Sibhimanyu" />
<link rel="canonical" href="${SITE}${path}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="RasanAI" />
<meta property="og:url" content="${SITE}${path}" />
<meta property="og:image" content="${SITE}img/social-card.jpg" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${SITE}img/social-card.jpg" />
<link rel="icon" href="${up}assets/mark.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="${up}assets/logo/rasanai-mark-180.png" />
<script>document.documentElement.classList.add("js")</script>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anek+Latin:wdth,wght@75..125,300..800&family=Anek+Tamil:wdth,wght@75..125,500..700&family=JetBrains+Mono:wght@400;500&family=Mukta:wght@400;500;600&display=swap" />
<link rel="stylesheet" href="${up}assets/site.css?v=3" />
<link rel="stylesheet" href="${up}assets/how.css?v=3" />
<link rel="stylesheet" href="${up}assets/laws.css?v=2" />
</head>
<body class="how laws">
<a class="skip" href="#main">Skip to content</a>
`;
};

const header = (up) => `<header class="top">
  <nav class="nav" aria-label="Primary">
    <a class="brand" href="${up || "./"}"><img src="${up}assets/logo/rasanai-lockup.svg" width="214" height="44" alt="RasanAI home" /></a>
    <div class="nav-links" id="laws-nav"><a href="${up}how-it-works.html">How it works</a><a href="${up}motion-laws.html" aria-current="page">Motion laws</a></div>
    <a class="nav-action" href="${up}index.html#download">Download</a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="laws-nav" hidden>Menu <span aria-hidden="true">+</span></button>
  </nav>
</header>
`;

const footer = (up) => `<footer class="foot"><div class="wrap">
  <div class="foot-top">
    <p class="foot-sign"><span lang="ta">ரசனை</span> means taste. The eye, and ear, for what feels right.</p>
    <nav class="foot-links" aria-label="Footer"><a href="${up || "./"}">Home</a><a href="${up}how-it-works.html">How it works</a><a href="${up}motion-laws.html">Motion laws</a><a href="${up}brand/RasanAI-Brand-Guidelines.pdf">Brand guidelines (PDF)</a><a data-studio="notes" href="${STUDIO_NOTES}">Release notes</a><a href="https://github.com/Sibhimanyu/rasanai">GitHub &rarr;</a></nav>
  </div>
  <img class="foot-mark" src="${up}assets/logo/rasanai-lockup-reverse.svg" width="487" height="100" alt="RasanAI" loading="lazy" />
  <p class="foot-by">By <a href="https://github.com/Sibhimanyu">Sibhimanyu</a> &middot; Open source / MIT</p>
  <p class="foot-by heresay-line"><a class="heresay-credit" href="https://sibhimanyu.github.io/heresay/" target="_blank" rel="noopener"><img src="${up}assets/heresay/heresay-mark.svg" width="16" height="16" alt="" /><span>Feedback and reports handled by <b>Heresay</b></span></a></p>
</div></footer>
<script src="${up}assets/laws.js?v=1"></script>
</body>
</html>
`;

// ------------------------------------------------------------------ index
const card = (law) => `<li><a class="ml-card" href="motion-laws/${law.slug}.html">
  <div class="ill" data-ill>${svg(law, { label: false })}</div>
  <div class="ml-body"><h3>${esc(law.title)}</h3><p>${esc(law.law)}</p></div>
</a></li>`;

const index = () => {
  const n = LAWS.length;
  const chips = GROUPS.map((x) => `<a href="#${x.id}">${esc(x.name)} <span>${LAWS.filter((l) => l.group === x.id).length}</span></a>`).join("");
  const sections = GROUPS.map((x) => `<section class="ml-sec" id="${x.id}" aria-labelledby="h-${x.id}">
  <div class="wrap">
    <div class="ml-sec-head"><h2 id="h-${x.id}">${esc(x.name)}</h2><p>${esc(x.blurb)}</p></div>
    <ul class="ml-grid">
${LAWS.filter((l) => l.group === x.id).map(card).join("\n")}
    </ul>
  </div>
</section>`).join("\n");
  return head({
    title: "RasanAI Motion Laws: the rules behind every film",
    desc: `${n} laws and guidelines the RasanAI creative engine follows to make launch films that feel designed: story, motion, rhythm, type, image and accessibility, each with a small demonstration.`,
    path: "motion-laws.html", depth: 0,
  }) + header("") + `
<main id="main">
<section class="ml-hero" aria-labelledby="hero-title">
  <div class="wrap">
    <p class="eyebrow">Motion laws</p>
    <h1 id="hero-title">The laws behind every RasanAI film.</h1>
    <div class="ml-hero-grid">
      <p class="lede">RasanAI's creative engine does not guess at taste. It follows a written set of laws about story, motion, rhythm, type and image, studied from real launch films and checked by gates before a film ships. Here are ${n} of them, each with a small demonstration you can watch.</p>
      <dl class="ml-facts" aria-label="At a glance">
        <div><dt>Laws</dt><dd>${n}</dd></div>
        <div><dt>Groups</dt><dd>${GROUPS.length}</dd></div>
        <div><dt>Checked by</dt><dd>Gates in the engine</dd></div>
      </dl>
    </div>
  </div>
</section>

<nav class="ml-groups" aria-label="Jump to a group"><div class="wrap">${chips}</div></nav>

${sections}

<section class="ml-evidence" aria-labelledby="ev-title">
  <div class="wrap">
    <h2 id="ev-title">What the evidence does not support</h2>
    <p>Research into professional craft turned up many strong habits and no magic numbers. These claims are common, and no source establishes them as general laws. The engine's numbers are defaults to test, and each page says how firmly its law is backed.</p>
    <ul>
      <li>No fixed shot count: no source says all good 30-second films have N shots.</li>
      <li>No fixed number of transition types. Three is a pilot constraint, not a professional standard, and hard cuts are always allowed.</li>
      <li>No minimum font size. Check type at the size the film is watched.</li>
      <li>No sound effects per second, and no rule of one sound for every entrance.</li>
      <li>Neither always nor never cut on the beat.</li>
      <li>No universal blur setting: a 180 degree shutter is a starting point, not a requirement.</li>
      <li>No universal lower boundary of 12 frames a second for animation, and no universal 2 second ceiling on a hold.</li>
    </ul>
  </div>
</section>

<section class="ml-note" aria-labelledby="note-title">
  <div class="wrap">
    <h2 id="note-title">Where these come from</h2>
    <p>Some laws are old and well known: Disney's twelve principles of animation, Richard Mayer's research on multimedia learning, the peak-end rule and the Von Restorff effect from Laws of UX, Apple's Human Interface Guidelines on motion, and WCAG on flashing. Others come from named studios and practitioners, with a link on each page, and some are the engine's own rules, measured from real launch films. Each page says which is which, and community opinions are marked as opinions. None of them is a guarantee of a good film. They are the floor that taste then works above.</p>
    <p>The full text lives in the open-source skill: <a href="https://github.com/Sibhimanyu/rasanai/tree/master/skills/rasanai/references">the launch grammar, launch moves, craft, imagery and score references on GitHub</a>.</p>
    <p class="ml-credit">The format is inspired by <a href="https://lawsofux.com">Laws of UX</a>, which does it for interfaces. Nothing here is copied from it.</p>
  </div>
</section>
</main>

` + footer("");
};

// ------------------------------------------------------------------ detail
const detail = (law, i) => {
  const g = group(law.group);
  const same = LAWS.filter((l) => l.group === law.group && l.slug !== law.slug);
  const prev = LAWS[(i + LAWS.length - 1) % LAWS.length], next = LAWS[(i + 1) % LAWS.length];
  const srcList = (law.srcs || []).map(([t, u]) => `<li><a href="${esc(u)}" rel="noopener">${esc(t)}</a></li>`).join("");
  const src0 = law.srcUrl ? `${esc(law.source)} <a href="${law.srcUrl}" rel="noopener">Read the source</a>.` : esc(law.source);
  const src = `<p>${src0}</p>` + (law.ev ? `<p class="ml-ev"><b>Evidence:</b> ${esc(law.ev)}.</p>` : "") + (srcList ? `<ul class="ml-srcs">${srcList}</ul>` : "");
  const ranked = law.ranked ? `<section class="ml-rank" aria-labelledby="t-rank"><h2 id="t-rank">The ranked list</h2><ol>${law.ranked.map((r) => `<li><p class="ml-tell">${esc(r.tell)}</p><p><b>Fix:</b> ${esc(r.fix)}</p><p class="ml-basis"><b>Basis:</b> ${esc(r.basis)} <a href="${esc(r.url)}" rel="noopener">${esc(r.label)}</a></p></li>`).join("")}</ol></section>` : "";
  return head({
    title: `${law.title} | RasanAI Motion Laws`,
    desc: law.law + " " + law.explain.split(". ")[0] + ".",
    path: `motion-laws/${law.slug}.html`, depth: 1,
  }) + header("../") + `
<main id="main">
<article class="ml-detail">
  <div class="wrap">
    <nav class="ml-crumb" aria-label="Breadcrumb"><a href="../motion-laws.html">Motion laws</a><span aria-hidden="true">/</span><a href="../motion-laws.html#${g.id}">${esc(g.name)}</a></nav>
    <div class="ml-detail-grid">
      <header>
        <p class="eyebrow">${esc(g.name)}</p>
        <h1>${esc(law.title)}</h1>
        <p class="ml-law">${esc(law.law)}</p>
        <button class="ml-replay" type="button" data-replay>Replay the demonstration</button>
      </header>
      <figure class="ill ill-big" data-ill>${svg(law, { label: true })}</figure>
    </div>

    <div class="ml-cols">
      <section aria-labelledby="t-take"><h2 id="t-take">Takeaways</h2><ul class="ml-points">${law.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></section>
      <section aria-labelledby="t-why"><h2 id="t-why">What it means</h2><p>${rich(law.explain)}</p></section>
      <section class="ml-film" aria-labelledby="t-film"><h2 id="t-film">In a RasanAI film</h2><p>${rich(law.film)}</p></section>
      <section aria-labelledby="t-src"><h2 id="t-src">Origins and sources</h2>${src}</section>
    </div>

    ${ranked}
    <nav class="ml-pager" aria-label="More laws">
      <a href="${prev.slug}.html" rel="prev"><span>Previous</span>${esc(prev.title)}</a>
      <a href="${next.slug}.html" rel="next"><span>Next</span>${esc(next.title)}</a>
    </nav>
    ${same.length ? `<section class="ml-more" aria-labelledby="t-more"><h2 id="t-more">More in ${esc(g.name)}</h2><ul>${same.map((l) => `<li><a href="${l.slug}.html">${esc(l.title)}</a></li>`).join("")}</ul></section>` : ""}
  </div>
</article>
</main>

` + footer("../");
};

mkdirSync(join(docs, "motion-laws"), { recursive: true });
writeFileSync(join(docs, "motion-laws.html"), index());
LAWS.forEach((l, i) => writeFileSync(join(docs, "motion-laws", `${l.slug}.html`), detail(l, i)));

// sitemap: replace any motion-laws entries
const smPath = join(docs, "sitemap.xml");
let sm = readFileSync(smPath, "utf8").split("\n").filter((l) => !l.includes("motion-laws")).join("\n");
const entries = [`${SITE}motion-laws.html`, ...LAWS.map((l) => `${SITE}motion-laws/${l.slug}.html`)]
  .map((u) => `  <url><loc>${u}</loc><lastmod>${LASTMOD}</lastmod></url>`).join("\n");
sm = sm.replace("</urlset>", entries + "\n</urlset>");
writeFileSync(smPath, sm);
console.log(`built ${LAWS.length} laws, 1 index`);
