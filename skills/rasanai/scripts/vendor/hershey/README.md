# Hershey fonts (single-stroke vector fonts)

`simplex.json` (Hershey Simplex, "futural") and `script.json` (Hershey Script 1-stroke, "scripts"): `{glyphs: {"<char>": {d: "M x,y L x,y ...", o: advance}}, height, space}`, y pointing down, cap height about 21 units.

Source: the `hersheytext` npm package 2.0.0 (JSON port, wrapper MIT, (c) 2014 James T), whose data is the Hershey Text Inkscape extension's copy of the original Hershey fonts (via emergent.unpythonic.net/software/hershey).

Licence, found by reading the notice shipped with the font data: NOT strictly "public domain" but a liberal, attribution-only licence that allows any use, commercial or otherwise:

> The Hershey Fonts were originally created by Dr. A. V. Hershey while working at the U. S. National Bureau of Standards. The format of the font data in this distribution was originally created by James Hurt, Cognition, Inc., 900 Technology Park Drive, Billerica, MA 01821 (mit-eddie!ci-dandelion!hurt).
> This distribution of the Hershey Fonts may be used by anyone for any purpose, commercial or otherwise, providing that (1) the acknowledgements above are distributed with the font data, and (2) the font data may be converted into any other format EXCEPT the format distributed by the U.S. NTIS where each point is described in eight bytes as "xxx yyy:".

This directory is that acknowledgement. The JSON here is a different format from the NTIS one.
