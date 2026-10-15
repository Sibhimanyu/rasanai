# RasanAI brand guidelines

`RasanAI-Brand-Guidelines.ai` (editable) and `.pdf` (for sharing): 19 artboards covering brand, voice, the mark and its construction, the logo suite, clear space, logo colour and misuse, colour, contrast, typography, interface, motion and applications. `overview.png` shows every page. The written rules and tokens are in `/DESIGN.md`; keep the two in step.

The `.ai` has the palette as global swatches (groups "RasanAI Primary / Supporting / Neutral") and the type scale as character styles, so edit a swatch or style rather than individual objects.

## Rebuilding

`source/build.jsx` draws the whole document from the logo SVGs in `docs/assets/logo/` and saves both files here. It needs Adobe Illustrator and these fonts installed (all free on Google Fonts): Anek Latin, Anek Tamil, Mukta, Mukta Malar, Montserrat, JetBrains Mono.

```bash
osascript -e "tell application id \"com.adobe.illustrator\" to do javascript \"#include '$PWD/docs/brand/source/build.jsx'\""
```

Close any open copy first. Tamil text is placed as outlines from `source/tamil/*.svg`, because Illustrator's scripting cannot switch on the World-Ready composer that Tamil needs. To regenerate them, run `source/tamil/shape.py` with `uharfbuzz` and `fonttools` installed.
