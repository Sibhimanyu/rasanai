// RasanAI brand guidelines: builds a multi-artboard Illustrator document with global swatches and character styles.
// Run with #include (see docs/brand/README.md) so $.fileName is this file; the repo root is three folders up.
var ROOT = new File($.fileName).parent.parent.parent.parent.fsName + "/";
var LOGO = ROOT + "docs/assets/logo/";
var OUT = ROOT + "docs/brand/";
var W = 1920, H = 1080, GAP = 200, COLS = 5, M = 120, CW = W - 2 * M;
var TOTAL = 19;

app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
// close.jsx closes earlier copies in a separate call; closing and re-creating swatches in one call fails intermittently
var doc = app.documents.add(DocumentColorSpace.RGB, W, H);
app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
var R0 = doc.artboards[0].artboardRect, ROWS = Math.ceil(TOTAL / COLS);
// centre the artboard grid on the canvas so the far columns stay inside Illustrator's canvas bounds
var X0 = R0[0] + W / 2 - (COLS * W + (COLS - 1) * GAP) / 2, Y0 = R0[1] - H / 2 + (ROWS * H + (ROWS - 1) * GAP) / 2;
var CUR = null, PAGE = 0;

// ---------- colour ----------
function hexRGB(hex) { hex = hex.replace("#", ""); return [parseInt(hex.substr(0, 2), 16), parseInt(hex.substr(2, 2), 16), parseInt(hex.substr(4, 2), 16)]; }
function rgbc(hex) { var a = hexRGB(hex), c = new RGBColor(); c.red = a[0]; c.green = a[1]; c.blue = a[2]; return c; }
function cmyk(hex) {
    var a = hexRGB(hex);
    try { var r = app.convertSampleColor(ImageColorSpace.RGB, a, ImageColorSpace.CMYK, ColorConvertPurpose.defaultpurpose); return [Math.round(r[0]), Math.round(r[1]), Math.round(r[2]), Math.round(r[3])]; }
    catch (e) { var r1 = a[0] / 255, g1 = a[1] / 255, b1 = a[2] / 255, k = 1 - Math.max(r1, g1, b1); if (k == 1) return [0, 0, 0, 100]; return [Math.round((1 - r1 - k) / (1 - k) * 100), Math.round((1 - g1 - k) / (1 - k) * 100), Math.round((1 - b1 - k) / (1 - k) * 100), Math.round(k * 100)]; }
}
function lum(hex) { var a = hexRGB(hex), o = []; for (var i = 0; i < 3; i++) { var v = a[i] / 255; o.push(v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); } return 0.2126 * o[0] + 0.7152 * o[1] + 0.0722 * o[2]; }
function contrast(a, b) { var l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }

var PALETTE = [
    // key, name, hex, group, role
    ["indigo", "Indigo", "#1B1F5E", "Primary", "The mark's ink. Logo, headlines and deep grounds."],
    ["rice", "Rice", "#F1F0EC", "Primary", "The paper. Default ground for print, site and slides."],
    ["turmeric", "Turmeric", "#EFB21A", "Primary", "The warm spark. One accent per view: the play, a highlight, a note."],
    ["blue", "RasanAI Blue", "#2A31A8", "Primary", "Action. The one primary button, links and selection."],
    ["silk", "Silk", "#B3165A", "Supporting", "Rare emphasis in films and editorial. Never for UI errors."],
    ["leaf", "Leaf", "#1E5A3C", "Supporting", "Growth and calm; natural looks and success moments."],
    ["mist", "Mist", "#DFE3EE", "Supporting", "Cool surfaces and quiet panels on rice."],
    ["paper", "Paper", "#F7F6F2", "Supporting", "Raised surface on rice: cards, sheets, tables."],
    ["indigoInk", "Indigo Ink", "#0C1030", "Neutral", "Darkest ground"],
    ["indigoDeep", "Indigo Deep", "#11163F", "Neutral", "Dark sections"],
    ["ink", "Ink", "#15151C", "Neutral", "Body text"],
    ["ink2", "Ink 2", "#3F4368", "Neutral", "Secondary text"],
    ["rice2", "Rice 2", "#E4E5EA", "Neutral", "Hairlines"],
    ["onIndigo", "On Indigo", "#EEF0FF", "Neutral", "Text on indigo"],
    ["onIndigo2", "On Indigo 2", "#C3C7EC", "Neutral", "Quiet text on indigo"],
    ["blueLift", "Blue Lift", "#7C83F5", "Neutral", "Blue text, dark mode"],
    ["charcoal", "Charcoal", "#1E1E1E", "Neutral", "App window, dark mode"],
    ["white", "White", "#FFFFFF", "Neutral", "Surfaces, app light mode"]
];
var SW = {}, HEX = {}, INFO = {};
var groups = {};
for (var i = 0; i < PALETTE.length; i++) {
    var p = PALETTE[i];
    if (!groups[p[3]]) { groups[p[3]] = doc.swatchGroups.add(); groups[p[3]].name = "RasanAI " + p[3]; }
    // Illustrator sometimes refuses a new swatch right after a document opens (error MRAP); a short wait and a retry gets it through.
    var sp = null;
    for (var attempt = 0; attempt < 5 && !sp; attempt++) {
        try { sp = doc.spots.add(); sp.name = "RasanAI " + p[1]; sp.colorType = ColorModel.PROCESS; sp.color = rgbc(p[2]); }
        catch (e) { try { if (sp) sp.remove(); } catch (e2) {} sp = null; $.sleep(300); if (attempt == 4) throw e; }
    }
    groups[p[3]].addSpot(sp);
    var sc = new SpotColor(); sc.spot = sp; sc.tint = 100;
    SW[p[0]] = sc; HEX[p[0]] = p[2]; INFO[p[0]] = p;
}
var BLACK = rgbc("#000000"), GOOD = rgbc("#34C759"), WARN = rgbc("#FF9500"), BAD = rgbc("#FF3B30"), QUIET = rgbc("#C7C7CC");

// ---------- type ----------
function fnt(name) { return app.textFonts.getByName(name); }
function cstyle(name, font, size, leading, tracking, caps) {
    var cs = doc.characterStyles.add(name), a = cs.characterAttributes;
    a.textFont = fnt(font); a.size = size; a.autoLeading = false; a.leading = leading || size * 1.2; a.tracking = tracking || 0;
    if (caps) a.capitalization = FontCapsOption.ALLCAPS;
    return cs;
}
var ST = {
    hero: cstyle("RasanAI Hero", "AnekLatin-SemiBold", 168, 150, -20),
    display: cstyle("RasanAI Display", "AnekLatin-SemiBold", 96, 92, -15),
    h1: cstyle("RasanAI H1", "AnekLatin-SemiBold", 64, 64, -10),
    h2: cstyle("RasanAI H2", "AnekLatin-Medium", 40, 44, -5),
    h3: cstyle("RasanAI H3", "AnekLatin-SemiBold", 28, 32, 0),
    bodyL: cstyle("RasanAI Body L", "Mukta-Regular", 22, 32, 0),
    body: cstyle("RasanAI Body", "Mukta-Regular", 17, 26, 0),
    small: cstyle("RasanAI Small", "Mukta-Regular", 15, 21, 0),
    label: cstyle("RasanAI Label", "JetBrainsMono-Medium", 13, 18, 120, true),
    mono: cstyle("RasanAI Mono", "JetBrainsMono-Regular", 14, 21, 0),
    tamil: cstyle("RasanAI Tamil", "AnekTamil-Bold", 40, 48, 0)
};
function applyST(range, st, color) {
    st.applyTo(range, true);
    if (color) range.characterAttributes.fillColor = color;
    try { range.paragraphAttributes.composerEngine = ComposerEngineType.adornmentComposer; } catch (e) {}
}

// ---------- geometry ----------
function X(x) { return CUR.l + x; }
function Y(y) { return CUR.t - y; }
function lay() { return CUR.lay; }
function paint(p, fill, stroke, sw) {
    if (fill) { p.filled = true; p.fillColor = fill; } else p.filled = false;
    if (stroke) { p.stroked = true; p.strokeColor = stroke; p.strokeWidth = sw || 1; } else p.stroked = false;
    return p;
}
function rect(x, y, w, h, fill, r, stroke, sw) {
    var p = r ? lay().pathItems.roundedRectangle(Y(y), X(x), w, h, r, r) : lay().pathItems.rectangle(Y(y), X(x), w, h);
    return paint(p, fill, stroke, sw);
}
function circle(cx, cy, r, fill, stroke, sw) { return paint(lay().pathItems.ellipse(Y(cy - r), X(cx - r), 2 * r, 2 * r), fill, stroke, sw); }
function poly(pts, fill, stroke, sw, closed) {
    var p = lay().pathItems.add(), a = [];
    for (var i = 0; i < pts.length; i++) a.push([X(pts[i][0]), Y(pts[i][1])]);
    p.setEntirePath(a); p.closed = closed !== false && !!fill; paint(p, fill, stroke, sw); return p;
}
function line(x1, y1, x2, y2, stroke, sw, dash) { var p = poly([[x1, y1], [x2, y2]], null, stroke, sw || 1, false); if (dash) p.strokeDashes = dash; return p; }

// ---------- text ----------
function T(s, x, y, st, color) { var t = lay().textFrames.add(); t.contents = s; applyST(t.textRange, st, color); t.position = [X(x), Y(y)]; return t; }
function TR(s, xr, y, st, color) { var t = T(s, 0, y, st, color); t.position = [X(xr) - t.width, Y(y)]; return t; }
function resized(t, size, leading, x, y) { var a = t.textRange.characterAttributes; a.size = size; a.leading = leading || size * 1.1; t.position = [X(x), Y(y)]; return t; }
// Tamil is shaped with HarfBuzz into outlined SVGs (source/tamil/shape.py): scripting cannot switch on the World-Ready composer Tamil needs.
function tamil(name, x, y, h, color, align) {
    doc.activeLayer = lay();
    var g = doc.groupItems.createFromFile(new File(OUT + "source/tamil/" + name + ".svg"));
    g.move(lay(), ElementPlacement.PLACEATBEGINNING);
    var s = h / g.height * 100; g.resize(s, s, true, true, true, true, s, Transformation.TOPLEFT);
    var ox = align == "center" ? -g.width / 2 : (align == "right" ? -g.width : 0);
    g.position = [X(x + ox), Y(y)]; recolor(g, color); g.name = "Tamil " + name; return g;
}
function TC(s, xc, y, st, color) { var t = T(s, 0, y, st, color); t.position = [X(xc) - t.width / 2, Y(y)]; return t; }
function A(s, x, y, w, h, st, color) {
    var r = lay().pathItems.rectangle(Y(y), X(x), w, h), t = lay().textFrames.areaText(r);
    t.contents = s; applyST(t.textRange, st, color); return t;
}

// ---------- the mark, drawn natively ----------
var LETTER = [[0, 0], [102, 0], [102, 62], [38, 126], [23.858, 111.858], [82, 53.716], [82, 20], [20, 20], [20, 82], [0, 82]];
var PLAY = [[36, 31], [60, 46], [36, 61]];
function glyph(x, y, s, ink, play) {
    var g = lay().groupItems.add(), i, a = [], b = [];
    for (i = 0; i < LETTER.length; i++) a.push([X(x + LETTER[i][0] * s), Y(y + LETTER[i][1] * s)]);
    for (i = 0; i < PLAY.length; i++) b.push([X(x + PLAY[i][0] * s), Y(y + PLAY[i][1] * s)]);
    var p = g.pathItems.add(); p.setEntirePath(a); p.closed = true; paint(p, ink);
    var q = g.pathItems.add(); q.setEntirePath(b); q.closed = true; paint(q, play || ink, play || ink, 3 * s); q.strokeJoin = StrokeJoin.ROUNDENDJOIN;
    g.name = "RasanAI glyph"; return g;
}
function clip(items, x, y, w, h) {
    var g = lay().groupItems.add();
    for (var i = 0; i < items.length; i++) items[i].move(g, ElementPlacement.PLACEATEND);
    var r = g.pathItems.rectangle(Y(y), X(x), w, h); r.move(g, ElementPlacement.PLACEATBEGINNING);
    g.clipped = true; return g;
}

// ---------- SVG logos ----------
function walk(item, fn) {
    if (item.typename == "GroupItem") { for (var i = 0; i < item.pageItems.length; i++) walk(item.pageItems[i], fn); }
    else if (item.typename == "CompoundPathItem") { for (var j = 0; j < item.pathItems.length; j++) fn(item.pathItems[j]); }
    else if (item.typename == "PathItem") fn(item);
}
function rgbHex(c) {
    if (c.typename != "RGBColor") return "";
    function h(v) { var s = Math.round(v).toString(16).toUpperCase(); return s.length < 2 ? "0" + s : s; }
    return "#" + h(c.red) + h(c.green) + h(c.blue);
}
function bindSwatches(g) {
    walk(g, function (p) {
        for (var k in HEX) {
            if (p.filled && rgbHex(p.fillColor) == HEX[k].toUpperCase()) p.fillColor = SW[k];
            if (p.stroked && rgbHex(p.strokeColor) == HEX[k].toUpperCase()) p.strokeColor = SW[k];
        }
    });
}
function recolor(g, c) { walk(g, function (p) { if (p.filled) p.fillColor = c; if (p.stroked) p.strokeColor = c; }); }
function logo(file, x, y, bw, bh, align) {
    doc.activeLayer = lay();
    var g = doc.groupItems.createFromFile(new File(LOGO + "rasanai-" + file + ".svg"));
    g.move(lay(), ElementPlacement.PLACEATBEGINNING);
    var s = Math.min(bw / g.width, bh / g.height) * 100;
    g.resize(s, s, true, true, true, true, s, Transformation.TOPLEFT);
    var ox = align == "left" ? 0 : (bw - g.width) / 2;
    g.position = [X(x + ox), Y(y + (bh - g.height) / 2)];
    bindSwatches(g); g.name = "RasanAI " + file; return g;
}

// ---------- pages ----------
function page(name, bg) {
    var col = PAGE % COLS, row = Math.floor(PAGE / COLS);
    var l = X0 + col * (W + GAP), t = Y0 - row * (H + GAP);
    var ab = PAGE == 0 ? doc.artboards[0] : doc.artboards.add([l, t, l + W, t - H]);
    ab.artboardRect = [l, t, l + W, t - H];
    var num = (PAGE + 1 < 10 ? "0" : "") + (PAGE + 1);
    ab.name = num + " " + name;
    var ly = PAGE == 0 ? doc.layers[0] : doc.layers.add();
    ly.name = num + " " + name;
    CUR = { l: l, t: t, lay: ly, num: num, dark: false };
    if (bg) { var b = rect(0, 0, W, H, SW[bg]); b.name = "Background"; CUR.dark = (bg == "indigo" || bg == "indigoDeep" || bg == "indigoInk"); }
    PAGE++;
}
function chrome(section) {
    var c1 = CUR.dark ? SW.turmeric : SW.blue, c2 = CUR.dark ? SW.onIndigo2 : SW.ink2;
    if (section) T(section, M, 84, ST.label, c1);
    T("RasanAI \u2014 Brand Guidelines", M, 1000, ST.label, c2);
    TR(CUR.num + " / " + TOTAL, W - M, 1000, ST.label, c2);
}
function title(s, y) { return T(s, M, y || 120, ST.h1, CUR.dark ? SW.rice : SW.indigo); }
function card(x, y, w, h, fill) { return rect(x, y, w, h, fill || SW.white, 12, SW.rice2, 1); }

// ===== 01 Cover =====
page("Cover", "indigo");
var big = glyph(1060, 40, 9.2, SW.indigoDeep, SW.indigoDeep);
clip([big], 0, 0, W, H);
logo("stacked-reverse", M, 120, 520, 344, "left");
T("Brand\rGuidelines", M, 600, ST.hero, SW.rice);
T("Identity  \u00B7  Colour  \u00B7  Type  \u00B7  Interface  \u00B7  Motion", M, 930, ST.label, SW.onIndigo2);
T("Version 1.0  \u00B7  October 2026", M, 960, ST.label, SW.turmeric);

// ===== 02 Contents =====
page("Contents", "rice");
chrome("");
T("Contents", M, 120, ST.display, SW.indigo);
A("Everything you need to make RasanAI look, read and move like itself: in a film, on the site, in the Mac app and in print.", M, 300, 640, 140, ST.bodyL, SW.ink2);
var TOC = [["01", "Brand", "Essence, principles, voice", "03"], ["02", "Logo", "Mark, construction, suite, clear space, colour, misuse", "05"],
    ["03", "Colour", "Primary, supporting, neutrals, proportion, contrast", "11"], ["04", "Typography", "Families and the type scale", "14"],
    ["05", "Interface", "Buttons, controls, cards, radii, spacing", "16"], ["06", "Motion", "How RasanAI moves", "17"], ["07", "Applications", "The system at work", "18"]];
for (i = 0; i < TOC.length; i++) {
    var ty = 130 + i * 112;
    line(900, ty, W - M, ty, SW.rice2, 1);
    T(TOC[i][0], 900, ty + 30, ST.label, SW.blue);
    T(TOC[i][1], 980, ty + 22, ST.h2, SW.indigo);
    T(TOC[i][2], 980, ty + 70, ST.small, SW.ink2);
    TR(TOC[i][3], W - M, ty + 30, ST.label, SW.ink2);
}
line(900, 130 + 7 * 112, W - M, 130 + 7 * 112, SW.rice2, 1);

// ===== 03 Brand essence =====
page("Brand", "rice");
chrome("01 \u2014 Brand");
T("Taste, set\rin motion.", M, 120, ST.display, SW.indigo);
tamil("rasanai-anek", W - M, 140, 130, SW.indigo, "right");
TR("Rasanai  \u00B7  Tamil for taste, the art of appreciating", W - M, 300, ST.label, SW.ink2);
A("RasanAI is creative direction for whole films, made with Claude. You make five calls, from the brief to the final cut. RasanAI directs the craft in between and shows every decision it makes. The name is Tamil: rasanai, the taste that knows why something is good.", M, 360, 860, 200, ST.bodyL, SW.ink);
var PR = [["Taste over templates", "Every film gets its own look, researched and blended for that film. Nothing should read as a preset."],
    ["The product is the hero", "Real screens, real uses, a plain true story. No clever metaphor standing in for the thing itself."],
    ["Show the decisions", "Every craft call is visible and explainable. Confidence comes from showing the work."],
    ["Calm tools, bold films", "The interface stays quiet so the film can be loud. One loud action per screen."]];
var cw4 = (CW - 3 * 24) / 4;
for (i = 0; i < 4; i++) {
    var cx = M + i * (cw4 + 24);
    card(cx, 640, cw4, 280, SW.paper);
    T("0" + (i + 1), cx + 32, 676, ST.label, SW.blue);
    A(PR[i][0], cx + 32, 716, cw4 - 64, 40, ST.h3, SW.indigo);
    A(PR[i][1], cx + 32, 770, cw4 - 64, 130, ST.body, SW.ink2);
}

// ===== 04 Voice =====
page("Voice", "rice");
chrome("01 \u2014 Brand");
title("Voice & tone");
A("RasanAI talks like a calm, senior member of the crew: it tells you what it decided, why, and what you can change.", M, 210, 900, 80, ST.bodyL, SW.ink2);
var VO = [["Plain", "Short words, one idea per sentence."], ["Specific", "Numbers, names and real examples over adjectives."], ["Warm", "Speak to one person, as a collaborator."], ["Confident", "Say what was decided and why. No hedging."]];
var NO = [["Hype", "\u201CRevolutionary\u201D, \u201Cmagic\u201D, \u201Cunleash\u201D."], ["Jargon", "Model names and internals the user never chose."], ["Exclamation marks", "Excitement belongs in the film, not the copy."], ["Blame", "Errors say what happened and the next step."]];
T("We are", M, 340, ST.label, SW.blue); T("We avoid", 560, 340, ST.label, SW.silk);
for (i = 0; i < 4; i++) {
    var vy = 380 + i * 100;
    line(M, vy, 500, vy, SW.rice2); line(560, vy, 940, vy, SW.rice2);
    T(VO[i][0], M, vy + 16, ST.h3, SW.indigo); T(VO[i][1], M, vy + 56, ST.small, SW.ink2);
    T(NO[i][0], 560, vy + 16, ST.h3, SW.indigo); T(NO[i][1], 560, vy + 56, ST.small, SW.ink2);
}
var EX = [["Unleash the magic of AI-powered video!", "Pick a script. Pick a look. RasanAI directs the rest."],
    ["Oops! Something went wrong :(", "The render stopped at scene 4: the font file is missing. Add it and resume."],
    ["Our cutting-edge engine optimises your content.", "Three scripts, each built from what your product really does."]];
T("Rewrites", 1040, 340, ST.label, SW.blue);
for (i = 0; i < 3; i++) {
    var ey = 380 + i * 190;
    card(1040, ey, 760, 170, SW.white);
    T("\u2715", 1072, ey + 30, ST.label, SW.silk); A(EX[i][0], 1110, ey + 26, 660, 40, ST.body, SW.ink2);
    line(1072, ey + 82, 1768, ey + 82, SW.rice2);
    T("\u2713", 1072, ey + 104, ST.label, SW.leaf); A(EX[i][1], 1110, ey + 98, 660, 60, ST.body, SW.indigo);
}

// ===== 05 The mark =====
page("The mark", "indigo");
chrome("02 \u2014 Logo");
glyph(200, 190, 5.6, SW.rice, SW.turmeric);
T("The mark", 1000, 190, ST.display, SW.rice);
A("The mark is the Tamil letter ra, the first letter of rasanai, drawn as one heavy stroke. A play triangle sits in its counter: taste, set in motion. It stands alone wherever the name is already present: app icon, favicon, avatar, end card.", 1000, 320, 760, 220, ST.bodyL, SW.onIndigo);
var eqY = 610;
tamil("ra-anek", 1010, eqY, 150, SW.rice);
T("+", 1170, eqY + 50, ST.h1, SW.onIndigo2);
poly([[1260, eqY + 30], [1340, eqY + 80], [1260, eqY + 130]], SW.turmeric);
T("=", 1390, eqY + 50, ST.h1, SW.onIndigo2);
glyph(1490, eqY + 10, 1.25, SW.rice, SW.turmeric);
T("Tamil ra", 1000, eqY + 200, ST.label, SW.onIndigo2); T("Play", 1260, eqY + 200, ST.label, SW.onIndigo2); T("RasanAI", 1490, eqY + 200, ST.label, SW.onIndigo2);

// ===== 06 Construction =====
page("Construction", "paper");
chrome("02 \u2014 Logo");
title("Construction");
var gs = 5, gx = 240, gy = 250;
for (var u = -20; u <= 120; u += 10) line(gx + u * gs, gy - 10 * gs, gx + u * gs, gy + 136 * gs, (u % 20 == 0) ? SW.rice2 : SW.mist, u == 0 ? 1.5 : 0.75);
for (var v = -10; v <= 136; v += 10) line(gx - 20 * gs, gy + v * gs, gx + 120 * gs, gy + v * gs, (v % 20 == 0) ? SW.rice2 : SW.mist, v == 0 ? 1.5 : 0.75);
var cg = glyph(gx, gy, gs, SW.indigo, SW.turmeric); cg.opacity = 92;
for (i = 0; i < LETTER.length; i++) circle(gx + LETTER[i][0] * gs, gy + LETTER[i][1] * gs, 5, SW.white, SW.blue, 2);
for (i = 0; i < PLAY.length; i++) circle(gx + PLAY[i][0] * gs, gy + PLAY[i][1] * gs, 5, SW.white, SW.blue, 2);
// dimensions
line(gx, gy - 30, gx + 102 * gs, gy - 30, SW.blue, 1); TC("102", gx + 51 * gs, gy - 60, ST.label, SW.blue);
line(gx + 102 * gs + 30, gy, gx + 102 * gs + 30, gy + 62 * gs, SW.blue, 1); T("62", gx + 102 * gs + 42, gy + 31 * gs - 8, ST.label, SW.blue);
line(gx - 30, gy, gx - 30, gy + 126 * gs, SW.blue, 1); TR("126", gx - 42, gy + 63 * gs - 8, ST.label, SW.blue);
line(gx + 20 * gs + 14, gy, gx + 20 * gs + 14, gy + 20 * gs, SW.silk, 1.5); T("T = 20", gx + 20 * gs + 24, gy + 4 * gs, ST.label, SW.silk);
T("45\u00B0", gx + 70 * gs, gy + 100 * gs, ST.label, SW.silk);
T("Stem 82", gx - 120, gy + 86 * gs, ST.label, SW.ink2);
var SPEC = [["Bounding box", "102 \u00D7 126 units"], ["Stroke  T", "20 units, every stroke"], ["Stem", "82 units, also the wordmark's cap height"],
    ["Kick", "45\u00B0, squared off at (38, 126)"], ["Counter", "62 \u00D7 62, from (20, 20) to (82, 82)"], ["Play", "(36, 31) (60, 46) (36, 61), 3-unit round join"],
    ["Lockup gap", "T, between mark and wordmark"]];
A("The mark is built on a 102 \u00D7 126 unit grid from one stroke weight, T. Every measure in the logo system is a multiple of T, so clear space and spacing scale with it.", 1060, 250, 740, 140, ST.bodyL, SW.ink);
for (i = 0; i < SPEC.length; i++) {
    var sy = 420 + i * 70;
    line(1060, sy, 1800, sy, SW.rice2);
    T(SPEC[i][0], 1060, sy + 22, ST.label, SW.blue);
    T(SPEC[i][1], 1300, sy + 18, ST.body, SW.indigo);
}

// ===== 07 Logo suite =====
page("Logo suite", "rice");
chrome("02 \u2014 Logo");
title("Logo suite");
card(M, 230, 1100, 390); logo("lockup", M + 150, 230 + 125, 800, 130); T("Primary lockup  \u00B7  default everywhere", M + 28, 230 + 350, ST.label, SW.ink2);
card(1250, 230, 550, 390); logo("stacked", 1250 + 115, 230 + 50, 320, 230); T("Stacked  \u00B7  square and tall spaces", 1278, 230 + 350, ST.label, SW.ink2);
var c3 = (CW - 2 * 30) / 3;
card(M, 650, c3, 310); logo("glyph", M, 650 + 50, c3, 170); T("Glyph  \u00B7  favicon, watermark", M + 28, 650 + 270, ST.label, SW.ink2);
card(M + c3 + 30, 650, c3, 310); logo("mark", M + c3 + 30, 650 + 45, c3, 180); T("App mark  \u00B7  icon, avatar", M + c3 + 58, 650 + 270, ST.label, SW.ink2);
card(M + 2 * (c3 + 30), 650, c3, 310); logo("tamil", M + 2 * (c3 + 30) + 60, 650 + 80, c3 - 120, 110); T("Tamil wordmark", M + 2 * (c3 + 30) + 28, 650 + 270, ST.label, SW.ink2);

// ===== 08 Clear space & minimum size =====
page("Clear space", "rice");
chrome("02 \u2014 Logo");
title("Clear space & minimum size");
card(M, 230, 1000, 700, SW.white);
var LH = 150, LW = LH * 486.95 / 100, lx = M + (1000 - LW) / 2, lyy = 230 + (700 - LH) / 2;
var Xu = 20 * (LH / 126), pad = 2 * Xu;
rect(lx - pad, lyy - pad, LW + 2 * pad, LH + 2 * pad, null, 0, SW.blue, 1).strokeDashes = [6, 6];
var tint = rect(lx - pad, lyy - pad, LW + 2 * pad, LH + 2 * pad, SW.mist); tint.opacity = 60;
logo("lockup", lx, lyy, LW, LH);
for (var q = 0; q < 2; q++) { rect(lx - pad + q * Xu, lyy + LH / 2 - Xu / 2, Xu, Xu, SW.turmeric); }
T("2T", lx - pad + 4, lyy + LH / 2 + Xu, ST.label, SW.ink2);
A("Keep a margin of 2T (twice the mark's stroke) clear on every side. In a line with other content, centre the wordmark's cap height on the line: the kick hangs below like a descender.", M + 40, 230 + 580, 920, 90, ST.body, SW.ink2);
T("Minimum size", 1180, 240, ST.h3, SW.indigo);
var MIN = [["lockup", "Primary lockup", "120 px  \u00B7  30 mm wide", 120, 25], ["stacked", "Stacked", "72 px  \u00B7  18 mm wide", 72, 48], ["glyph", "Glyph", "16 px  \u00B7  5 mm tall", 13, 16], ["mark", "App mark", "16 px  \u00B7  favicon", 16, 16]];
for (i = 0; i < MIN.length; i++) {
    var my = 300 + i * 160;
    line(1180, my, 1800, my, SW.rice2);
    logo(MIN[i][0], 1180, my + 30, MIN[i][3], MIN[i][4] * 2, "left");
    T(MIN[i][1], 1400, my + 30, ST.h3, SW.indigo);
    T(MIN[i][2], 1400, my + 76, ST.label, SW.ink2);
}

// ===== 09 Colour versions =====
page("Logo colour", "rice");
chrome("02 \u2014 Logo");
title("Logo on colour");
var VERS = [["rice", "lockup", null, "Indigo on Rice  \u00B7  primary", "ink2"], ["indigo", "lockup-reverse", null, "Rice on Indigo  \u00B7  reverse", "onIndigo2"],
    ["turmeric", "lockup", null, "Indigo on Turmeric", "indigo"], ["blue", "lockup-reverse", null, "Rice on RasanAI Blue", "onIndigo"],
    ["white", "lockup", "black", "One colour  \u00B7  black", "ink2"], ["ink", "lockup-reverse", "white", "One colour  \u00B7  white", "onIndigo2"]];
var vw = (CW - 2 * 30) / 3, vh = 340;
for (i = 0; i < VERS.length; i++) {
    var vx = M + (i % 3) * (vw + 30), vyy = 230 + Math.floor(i / 3) * (vh + 30);
    rect(vx, vyy, vw, vh, SW[VERS[i][0]], 12, (VERS[i][0] == "rice" || VERS[i][0] == "white") ? SW.rice2 : null, 1);
    var lg = logo(VERS[i][1], vx + 70, vyy + 100, vw - 140, 80);
    if (VERS[i][2] == "black") recolor(lg, BLACK); else if (VERS[i][2] == "white") recolor(lg, SW.white);
    T(VERS[i][3], vx + 28, vyy + vh - 46, ST.label, SW[VERS[i][4]]);
}

// ===== 10 Misuse =====
page("Logo misuse", "rice");
chrome("02 \u2014 Logo");
title("Don't");
var mw = (CW - 3 * 24) / 4, mh = 330;
var MIS = ["Stretch or squash it", "Rotate it", "Recolour it", "Outline it", "Rearrange the parts", "Retype the wordmark", "Place it on low contrast", "Add gradients or effects"];
for (i = 0; i < 8; i++) {
    var mx = M + (i % 4) * (mw + 24), my2 = 230 + Math.floor(i / 4) * (mh + 24);
    var bgc = i == 6 ? SW.blue : SW.white;
    rect(mx, my2, mw, mh, bgc, 12, SW.rice2, 1);
    var bx = mx + 50, by = my2 + 100, bw2 = mw - 100, bh2 = 70;
    var g2;
    if (i == 0) { g2 = logo("lockup", bx, by, bw2, bh2); g2.resize(72, 170, true, true, true, true, 100, Transformation.CENTER); }
    else if (i == 1) { g2 = logo("lockup", bx, by, bw2, bh2); g2.rotate(-14); }
    else if (i == 2) { g2 = logo("lockup", bx, by, bw2, bh2); recolor(g2, SW.silk); }
    else if (i == 3) { g2 = logo("lockup", bx, by, bw2, bh2); walk(g2, function (p) { p.filled = false; p.stroked = true; p.strokeColor = SW.indigo; p.strokeWidth = 1; }); }
    else if (i == 4) { var wm = logo("wordmark", bx, by + 8, bw2 - 70, 52, "left"); glyph(bx + wm.width + 16, by, 0.55, SW.indigo); }
    else if (i == 5) { glyph(bx, by, 0.55, SW.indigo); var rt = T("RasanAI", bx + 70, by - 4, ST.h1, SW.indigo); rt.textRange.characterAttributes.textFont = fnt("Mukta-Bold"); }
    else if (i == 6) { g2 = logo("lockup", bx, by, bw2, bh2); }
    else if (i == 7) {
        g2 = logo("lockup", bx, by, bw2, bh2);
        var gr = doc.gradients.add(); gr.type = GradientType.LINEAR; gr.gradientStops[0].color = SW.turmeric; gr.gradientStops[1].color = SW.silk;
        var gc = new GradientColor(); gc.gradient = gr; walk(g2, function (p) { if (p.filled) p.fillColor = gc; if (p.stroked) p.strokeColor = gc; });
    }
    circle(mx + mw - 40, my2 + 40, 16, SW.silk);
    line(mx + mw - 46, my2 + 34, mx + mw - 34, my2 + 46, SW.white, 2.5); line(mx + mw - 34, my2 + 34, mx + mw - 46, my2 + 46, SW.white, 2.5);
    T(MIS[i], mx + 28, my2 + mh - 50, ST.label, i == 6 ? SW.onIndigo : SW.ink2);
}

// ===== 11 Primary colour =====
function values(k) { var a = hexRGB(HEX[k]), c = cmyk(HEX[k]); return "HEX  " + HEX[k] + "\rRGB  " + a.join(" ") + "\rCMYK " + c.join(" "); }
page("Primary colour", "rice");
chrome("03 \u2014 Colour");
title("Primary colour");
var PK = ["indigo", "rice", "turmeric", "blue"];
for (i = 0; i < 4; i++) {
    var px = M + i * (cw4 + 24);
    rect(px, 230, cw4, 440, SW[PK[i]], 12, PK[i] == "rice" ? SW.ink2 : null, 0.75);
    T(INFO[PK[i]][1], px + 28, 260, ST.h2, (PK[i] == "rice" || PK[i] == "turmeric") ? SW.indigo : SW.rice);
    T(INFO[PK[i]][1], px, 700, ST.h3, SW.indigo);
    A(INFO[PK[i]][4], px, 744, cw4 - 20, 60, ST.small, SW.ink2);
    A(values(PK[i]), px, 830, cw4, 80, ST.mono, SW.ink);
}

// ===== 12 Supporting & neutrals =====
page("Supporting colour", "rice");
chrome("03 \u2014 Colour");
title("Supporting & neutrals");
var SK = ["silk", "leaf", "mist", "paper"];
for (i = 0; i < 4; i++) {
    var sx = M + i * (cw4 + 24);
    rect(sx, 230, cw4, 180, SW[SK[i]], 12, (SK[i] == "paper" || SK[i] == "mist") ? SW.rice2 : null, 1);
    T(INFO[SK[i]][1], sx, 430, ST.h3, SW.indigo);
    T(HEX[SK[i]], sx + cw4 - 0, 436, ST.label, SW.ink2).position = [X(sx + cw4) - 90, Y(436)];
    A(INFO[SK[i]][4], sx, 470, cw4 - 20, 50, ST.small, SW.ink2);
}
var NK = ["indigoInk", "indigoDeep", "ink", "ink2", "rice2", "onIndigo", "onIndigo2", "blueLift", "charcoal"];
var nw = (CW - 8 * 18) / 9;
T("Neutrals & app", M, 560, ST.label, SW.blue);
for (i = 0; i < NK.length; i++) {
    var nx = M + i * (nw + 18);
    rect(nx, 600, nw, 170, SW[NK[i]], 10, (NK[i] == "rice2" || NK[i] == "onIndigo") ? SW.ink2 : null, 0.5);
    T(INFO[NK[i]][1], nx, 790, ST.small, SW.indigo);
    T(HEX[NK[i]], nx, 816, ST.label, SW.ink2);
    A(INFO[NK[i]][4], nx, 846, nw - 4, 60, ST.small, SW.ink2);
}

// ===== 13 Proportion & contrast =====
page("Proportion & contrast", "rice");
chrome("03 \u2014 Colour");
title("Proportion & contrast");
var PROP = [["rice", 50], ["indigo", 30], ["paper", 10], ["blue", 6], ["turmeric", 4]];
var ppx = M;
for (i = 0; i < PROP.length; i++) {
    var pw = CW * PROP[i][1] / 100;
    rect(ppx, 230, pw, 130, SW[PROP[i][0]], 0, (PROP[i][0] == "rice" || PROP[i][0] == "paper") ? SW.rice2 : null, 1);
    if (i < PROP.length - 1) T(PROP[i][1] + "%", ppx + 16, 380, ST.h3, SW.indigo); else TR(PROP[i][1] + "%", W - M, 380, ST.h3, SW.indigo);
    if (i < PROP.length - 1) T(INFO[PROP[i][0]][1], ppx + 16, 418, ST.label, SW.ink2); else TR(INFO[PROP[i][0]][1], W - M, 418, ST.label, SW.ink2);
    ppx += pw;
}
var PAIRS = [["indigo", "rice"], ["rice", "indigo"], ["turmeric", "indigo"], ["indigo", "turmeric"], ["blue", "rice"], ["white", "blue"], ["ink2", "rice"], ["turmeric", "rice"]];
for (i = 0; i < 8; i++) {
    var fx = M + (i % 4) * (cw4 + 24), fy = 500 + Math.floor(i / 4) * 230;
    var fg = PAIRS[i][0], bgk = PAIRS[i][1], cr = contrast(HEX[fg], HEX[bgk]);
    var grade = "Decor only"; if (cr >= 7) grade = "AAA"; else if (cr >= 4.5) grade = "AA"; else if (cr >= 3) grade = "AA large";
    rect(fx, fy, cw4, 206, SW[bgk], 12, bgk == "rice" ? SW.rice2 : null, 1);
    T("Aa", fx + 28, fy + 24, ST.display, SW[fg]);
    TR(Math.round(cr * 10) / 10 + " : 1", fx + cw4 - 28, fy + 40, ST.h3, SW[fg]);
    TR(grade, fx + cw4 - 28, fy + 84, ST.label, SW[fg]);
    T(INFO[fg][1] + " on " + INFO[bgk][1], fx + 28, fy + 164, ST.label, SW[fg]);
}

// ===== 14 Typefaces =====
page("Typefaces", "rice");
chrome("04 \u2014 Typography");
title("Typefaces");
resized(T("Aa", M, 220, ST.display, SW.indigo), 280, 280, M - 8, 210);
T("Anek Latin", M, 510, ST.h2, SW.indigo);
T("Display & headlines  \u00B7  Medium  SemiBold  Bold", M, 562, ST.label, SW.ink2);
var set = A("ABCDEFGHIJKLMNOPQRSTUVWXYZ\rabcdefghijklmnopqrstuvwxyz\r0123456789  &  \u2018\u2019 \u201C\u201D  !?  @  #  %", 820, 250, 980, 260, ST.h2, SW.indigo);
set.textRange.characterAttributes.size = 52; set.textRange.characterAttributes.leading = 70;
var FAM = [["Mukta", "Mukta-Regular", "Aa", "Body copy  \u00B7  Regular  Medium  SemiBold"], ["JetBrains Mono", "JetBrainsMono-Medium", "{ }", "Labels, timecodes, data"],
    ["Anek Tamil", "AnekTamil-Bold", "\u0B85\u0B86", "Tamil  \u00B7  Medium  Bold"], ["Montserrat", "Montserrat-ExtraBold", "Ra", "Wordmark only  \u00B7  outlined, never typeset"]];
for (i = 0; i < 4; i++) {
    var tx = M + i * (cw4 + 24);
    card(tx, 640, cw4, 300, i == 3 ? SW.mist : SW.white);
    if (i == 2) tamil("a-anek", tx + 28, 684, 74, SW.indigo); else { var sp2 = T(FAM[i][2], tx + 28, 664, ST.display, SW.indigo); sp2.textRange.characterAttributes.textFont = fnt(FAM[i][1]); }
    T(FAM[i][0], tx + 28, 810, ST.h3, SW.indigo);
    A(FAM[i][3], tx + 28, 852, cw4 - 56, 60, ST.label, SW.ink2);
}
T("In the Mac app, interface text uses SF Pro, the system font; brand type is for films, the site and print.", 820, 560, ST.small, SW.ink2);

// ===== 15 Type scale =====
page("Type scale", "paper");
chrome("04 \u2014 Typography");
title("Type scale");
var SCALE = [[ST.display, "Display", "Anek Latin SemiBold  96 / 92  \u221215", "Direct your film.", 130],
    [ST.h1, "H1", "Anek Latin SemiBold  64 / 64  \u221210", "Pick a look for this story", 96],
    [ST.h2, "H2", "Anek Latin Medium  40 / 44  \u22125", "Three scripts, one true story", 74],
    [ST.h3, "H3", "Anek Latin SemiBold  28 / 32", "Leave notes on the animatic", 62],
    [ST.bodyL, "Body L", "Mukta Regular  22 / 32", "RasanAI researches your product, writes three scripts and designs three looks.", 62],
    [ST.body, "Body", "Mukta Regular  17 / 26", "Every decision is in the drawer, with the reason it was made.", 54],
    [ST.label, "Label", "JetBrains Mono Medium  13  +120  caps", "Scene 04  \u00B7  00:12.4  \u00B7  Look B", 48],
    [ST.tamil, "Tamil", "Anek Tamil Bold  40 / 48", "\u0BB0\u0B9A\u0BA9\u0BC8", 70]];
var sy2 = 220;
for (i = 0; i < SCALE.length; i++) {
    line(M, sy2, W - M, sy2, SW.rice2);
    T(SCALE[i][1], M, sy2 + 22, ST.label, SW.blue);
    T(SCALE[i][2], M, sy2 + 46, ST.label, SW.ink2);
    if (SCALE[i][1] == "Tamil") tamil("rasanai-anek", 620, sy2 + 20, 32, SW.indigo); else T(SCALE[i][3], 620, sy2 + 18, SCALE[i][0], SW.indigo);
    sy2 += SCALE[i][4] + 18;
}

// ===== 16 Interface =====
page("Interface", "rice");
chrome("05 \u2014 Interface");
title("Interface");
function button(x, y, label, kind, h) {
    h = h || 38; var tc = SW.ink; if (kind == "primary") tc = SW.white; else if (kind == "danger") tc = BAD;
    var t = T(label, 0, 0, ST.body, tc);
    t.textRange.characterAttributes.textFont = fnt(kind == "primary" ? "Mukta-SemiBold" : "Mukta-Medium");
    var fs = 15, padx = 32; if (h == 26) { fs = 12; padx = 20; } else if (h == 32) { fs = 13; padx = 26; }
    t.textRange.characterAttributes.size = fs;
    var w = t.width + padx;
    var b = rect(x, y, w, h, kind == "primary" ? SW.blue : null, 8, kind == "primary" ? null : SW.ink2, kind == "primary" ? 0 : 0.75);
    if (kind != "primary") b.strokeOpacity = 40;
    t.move(b, ElementPlacement.PLACEBEFORE);
    t.position = [X(x + (w - t.width) / 2), Y(y + (h - t.height) / 2)];
    return w;
}
T("Buttons", M, 230, ST.label, SW.blue);
var bxp = M; bxp += button(bxp, 270, "Make the film", "primary") + 16; bxp += button(bxp, 270, "Preview", "secondary") + 16; bxp += button(bxp, 270, "Delete", "danger") + 16;
var dis = rect(bxp, 270, 120, 38, SW.blue, 8); dis.opacity = 45; var dt = T("Disabled", bxp + 28, 278, ST.body, SW.white); dt.opacity = 70;
var bx3 = M; bx3 += button(bx3, 340, "Small 26", "primary", 26) + 16; bx3 += button(bx3, 334, "Regular 32", "primary", 32) + 16; button(bx3, 328, "Large 38", "primary", 38);
A("One primary button per screen, in RasanAI Blue. Everything else is a quiet outline. Flat: no gradient, bevel or inner shadow.", M, 390, 760, 60, ST.small, SW.ink2);
T("Switch", M, 480, ST.label, SW.blue);
rect(M, 516, 190, 32, SW.rice2, 8); rect(M + 3, 519, 92, 26, SW.white, 6, SW.rice2, 0.5);
T("Grid", M + 32, 522, ST.small, SW.ink); T("List", M + 128, 522, ST.small, SW.ink2);
T("Status", M + 300, 480, ST.label, SW.blue);
var STS = [[GOOD, "Ready"], [WARN, "Waiting"], [BAD, "Stopped"], [QUIET, "Quiet"]];
for (i = 0; i < 4; i++) { circle(M + 304 + i * 120, 532, 4, STS[i][0]); T(STS[i][1], M + 316 + i * 120, 522, ST.small, SW.ink); }
T("Radii", M, 600, ST.label, SW.blue);
var RAD = [[6, "6  pills"], [8, "8  buttons"], [12, "12  cards"], [22, "22%  app mark"]];
for (i = 0; i < 4; i++) { rect(M + i * 190, 640, 150, 110, SW.white, RAD[i][0] == 22 ? 33 : RAD[i][0], SW.indigo, 1.5); T(RAD[i][1], M + i * 190, 766, ST.label, SW.ink2); }
T("Cards", 1000, 230, ST.label, SW.blue);
var CST = [["Rest", SW.rice2, 1], ["Hover", SW.ink2, 1], ["Selected", SW.ink, 2]];
for (i = 0; i < 3; i++) {
    var kx = 1000 + i * 275;
    if (i == 1) { var sh = rect(kx, 275, 250, 220, SW.ink, 12); sh.opacity = 10; }
    rect(kx, 270 - (i == 1 ? 3 : 0), 250, 220, SW.white, 12, CST[i][1], CST[i][2]).strokeOpacity = i == 1 ? 40 : 100;
    rect(kx + 12, 282 - (i == 1 ? 3 : 0), 226, 127, SW.mist, 6);
    glyph(kx + 112, 322 - (i == 1 ? 3 : 0), 0.3, SW.indigo, SW.turmeric);
    T("Launch film", kx + 16, 424 - (i == 1 ? 3 : 0), ST.small, SW.ink);
    T(CST[i][0], kx, 506, ST.label, SW.ink2);
}
T("Spacing", 1000, 600, ST.label, SW.blue);
var SPC = [4, 8, 12, 16, 24, 32, 48, 72];
for (i = 0; i < SPC.length; i++) { var spx = 1000 + i * 100; rect(spx, 760 - SPC[i] * 1.6, 60, SPC[i] * 1.6, SW.blue, 0); T("" + SPC[i], spx, 776, ST.label, SW.ink2); }
A("A 4-point base. Card padding 16, section gaps 24 to 32, page margins 72 on the site.", 1000, 820, 780, 60, ST.small, SW.ink2);

// ===== 17 Motion =====
page("Motion", "indigo");
chrome("06 \u2014 Motion");
title("Motion");
A("RasanAI makes films, so its own motion is restrained and exact: every move has a reason, and the interface never competes with the work.", M, 210, 900, 80, ST.bodyL, SW.onIndigo2);
function plot(fn, x, y, w, h, color) { var pts = []; for (var k = 0; k <= 80; k++) { var t0 = k / 80; pts.push([x + t0 * w, y + h - fn(t0) * h]); } return poly(pts, null, color, 3, false); }
var MO = [["One move per beat", "Each beat gets one primary motion. Secondary motion supports it, never competes.", function (t) { return Math.floor(t * 4) / 3 > 1 ? 1 : Math.floor(t * 4) / 3; }],
    ["Springs, not timers", "UI springs: response 0.30 s, damping 0.86. Interruptible and physical.", function (t) { return 1 - Math.exp(-6 * t) * Math.cos(11 * t); }],
    ["Fast feedback", "Hover and press: 120 ms ease-out. Cards raise in 180 ms. Never animate text.", function (t) { return 1 - Math.pow(1 - t, 3); }],
    ["Respect Reduce Motion", "With Reduce Motion on, cross-fade or cut. Nothing pulses, nothing slides.", function (t) { return t < 0.5 ? 0 : 1; }]];
for (i = 0; i < 4; i++) {
    var ox2 = M + i * (cw4 + 24);
    rect(ox2, 330, cw4, 560, SW.indigoInk, 12);
    line(ox2 + 32, 380, ox2 + 32, 600, SW.indigoDeep, 1); line(ox2 + 32, 600, ox2 + cw4 - 32, 600, SW.indigoDeep, 1);
    line(ox2 + 32, 420, ox2 + cw4 - 32, 420, SW.indigoDeep, 1).strokeDashes = [4, 4];
    plot(MO[i][2], ox2 + 32, 420, cw4 - 64, 180, SW.turmeric);
    T("0" + (i + 1), ox2 + 32, 650, ST.label, SW.turmeric);
    A(MO[i][0], ox2 + 32, 690, cw4 - 64, 80, ST.h3, SW.rice);
    A(MO[i][1], ox2 + 32, 770, cw4 - 64, 110, ST.small, SW.onIndigo2);
}
T("Logo sting  \u00B7  the stroke of ra draws in, the play triangle springs into the counter, hold one beat.", M, 930, ST.label, SW.onIndigo2);

// ===== 18 Applications =====
page("Applications", "rice");
chrome("07 \u2014 Applications");
title("Applications");
// title card
rect(M, 230, 800, 450, SW.indigo, 12);
glyph(M + 40, 270, 0.4, SW.rice, SW.turmeric);
T("A film by RasanAI", M + 40, 520, ST.label, SW.turmeric);
T("Launch day", M + 40, 550, ST.display, SW.rice);
rect(M, 670, 800, 10, SW.turmeric);
T("Title card  \u00B7  16:9", M, 700, ST.label, SW.ink2);
// social square
rect(960, 230, 450, 450, SW.turmeric, 12);
A("Describe a film.\rDirect it from there.", 1000, 270, 380, 260, ST.h1, SW.indigo);
glyph(1340, 600, 0.4, SW.indigo);
T("Social  \u00B7  1:1", 960, 700, ST.label, SW.ink2);
// app icons
var IC = [128, 64, 32, 16];
var icx = 1450;
for (i = 0; i < IC.length; i++) { logo("mark", icx, 230 + (128 - IC[i]), IC[i], IC[i], "left"); icx += IC[i] + 24; }
T("App mark  \u00B7  128 to 16", 1450, 380, ST.label, SW.ink2);
// business card
rect(1450, 430, 350, 200, SW.indigo, 10);
logo("lockup-reverse", 1490, 500, 270, 56);
T("Business card  \u00B7  85 \u00D7 55", 1450, 650, ST.label, SW.ink2);
// site header
rect(M, 760, CW, 96, SW.indigo, 12);
logo("lockup-reverse", M + 32, 760 + 30, 180, 36, "left");
var NAV = ["Guide", "Films", "Looks", "Studio"];
for (i = 0; i < NAV.length; i++) T(NAV[i], 980 + i * 140, 798, ST.body, SW.onIndigo2);
rect(W - M - 210, 760 + 28, 178, 40, SW.blue, 8);
var gt = T("Get RasanAI", W - M - 186, 760 + 34, ST.body, SW.white);
gt.textRange.characterAttributes.textFont = fnt("Mukta-SemiBold");
T("Website header  \u00B7  indigo hero, rice body", M, 876, ST.label, SW.ink2);

// ===== 19 Back cover =====
page("Back cover", "indigo");
var bg2 = glyph(W / 2 - 153, 260, 3, SW.rice, SW.turmeric);
tamil("rasanai-anek", W / 2, 690, 56, SW.rice, "center");
TC("sibhimanyu.github.io/rasanai", W / 2, 800, ST.label, SW.onIndigo2);
TC("\u00A9 2026 RasanAI  \u00B7  Brand Guidelines v1.0", W / 2, 1000, ST.label, SW.onIndigo2);

// ---------- output ----------
doc.layers[doc.layers.length - 1].name = "01 Cover";
var pngDir = new Folder(Folder.temp.fsName + "/rasanai-brand-pages"); if (!pngDir.exists) pngDir.create();
for (i = 0; i < doc.artboards.length; i++) {
    doc.artboards.setActiveArtboardIndex(i);
    var o = new ExportOptionsPNG24(); o.artBoardClipping = true; o.horizontalScale = 50; o.verticalScale = 50; o.antiAliasing = true; o.transparency = false;
    doc.exportFile(new File(pngDir.fsName + "/" + (i < 9 ? "0" : "") + (i + 1) + ".png"), ExportType.PNG24, o);
}
var po = new PDFSaveOptions(); po.preserveEditability = false; po.viewAfterSaving = false;
doc.saveAs(new File(OUT + "RasanAI-Brand-Guidelines.pdf"), po);
var ao = new IllustratorSaveOptions(); ao.pdfCompatible = true; ao.embedICCProfile = true;
doc.saveAs(new File(OUT + "RasanAI-Brand-Guidelines.ai"), ao);
doc.artboards.setActiveArtboardIndex(0);
"done " + doc.artboards.length;
