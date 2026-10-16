# Shape Tamil strings with HarfBuzz and write outlined SVGs (fill #1B1F5E) for Illustrator to import.
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
import os
FONTS = {"anek": os.path.expanduser("~/Library/Fonts/AnekTamil-700.ttf"), "anekm": os.path.expanduser("~/Library/Fonts/AnekTamil-500.ttf")}
JOBS = [("rasanai-anek", "anek", "ரசனை"), ("ra-anek", "anek", "ர"), ("a-anek", "anek", "அஆ"), ("rasanai-anekm", "anekm", "ரசனை")]
for name, fk, text in JOBS:
    path = FONTS[fk]; blob = hb.Blob.from_file_path(path); face = hb.Face(blob); font = hb.Font(face)
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties(); hb.shape(font, buf, {})
    tt = TTFont(path); gs = tt.getGlyphSet(); order = tt.getGlyphOrder(); upm = tt["head"].unitsPerEm
    pen = SVGPathPen(gs); bp = BoundsPen(gs); x = 0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        g = order[info.codepoint]
        t = (1, 0, 0, -1, x + pos.x_offset, -pos.y_offset)
        gs[g].draw(TransformPen(pen, t)); gs[g].draw(TransformPen(bp, t)); x += pos.x_advance
    xmin, ymin, xmax, ymax = bp.bounds
    asc = tt["hhea"].ascent; desc = tt["hhea"].descent
    # keep the font's full ascent/descent box so sizes stay comparable across strings; units = font units
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{xmin:.1f} {ymin:.1f} {xmax-xmin:.1f} {ymax-ymin:.1f}" width="{(xmax-xmin)/upm*100:.2f}" height="{(ymax-ymin)/upm*100:.2f}"><path d="{pen.getCommands()}" fill="#1B1F5E"/></svg>'
    open(name + ".svg", "w").write(svg); print(name, round(xmax-xmin), round(ymax-ymin), upm)
