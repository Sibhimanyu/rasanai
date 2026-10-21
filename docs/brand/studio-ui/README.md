# RasanAI Studio: the current UI (source of truth)

Any picture of the Studio app (site mockups, launch films, promo frames, docs, brand pages) must show **this** UI.
Match `current-studio-home.png`, or better, screenshot the real app (`apps/macos`) for the screen you need.

`OLD-do-not-use.jpg` is the retired UI. Do not copy it, and do not rebuild mockups from `archive/old-ui/`.

## Current UI (Studio 0.19+)

- **Dark** native macOS window, deep navy/indigo background. Not a light, white web panel.
- **Left sidebar**: RasanAI logo mark + "RasanAI"; Films, All films, Needs review (count badge), Brands, Series,
  Inspiration, Queue; a "Recent" list of films with status icons (green check = done, orange eye = needs review);
  Settings at the bottom.
- **Toolbar**: back/forward arrows; a centered **dot stepper**: Describe · Setup · Brief · Story · Look · Preview · Final;
  "Search films" field on the right.
- **Home**: "What would you like to make?" / "An idea, a link, or a few words is enough." The crew characters
  (smooth-clay lineup, see `docs/brand/crew`) stand on top of a large dark prompt box ("Describe your video, or paste a
  link…", a + button, "Set it up", "Start", round arrow button), with a collapsible "Inspiration · Optional" row under it.
- **Status bar** at the bottom: green dot "Ready for a film" + a pill "Claude Code · Fast pace".

## Retired (never show)

Light window with a checkmark stepper (Brief · Story · Look · Animatic · Final), "Watch the first cut." headline,
scene thumbnail strip, "Your turn · review the animatic" footer, "Apply N notes" button. The old step names
(Animatic, five steps) are retired too: the current flow is Describe, Setup, Brief, Story, Look, Preview, Final.
