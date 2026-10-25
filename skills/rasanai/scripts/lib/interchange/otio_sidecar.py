#!/usr/bin/env python3
"""Optional OpenTimelineIO sidecar for RasanAI (Plan 12 D6).

Isolated on purpose: RasanAI's Node code never imports Python, and ordinary video production never needs this file.
It uses the OFFICIAL OpenTimelineIO API only; no OTIO JSON is written by hand anywhere in RasanAI.

  python3 otio_sidecar.py doctor [--pin otio-pin.json]
  python3 otio_sidecar.py write  --model timeline.interchange.json --out film.otio [--pin otio-pin.json]
  python3 otio_sidecar.py verify --model timeline.interchange.json --otio film.otio

It prints ONE JSON object on stdout and exits 0 (ok), 2 (ran, but a check failed) or 3 (OpenTimelineIO is not importable).
Nothing here installs a package, opens the network or reads outside the files named on the command line.
"""
import json
import sys


def out(obj, code=0):
    sys.stdout.write(json.dumps(obj, indent=2, sort_keys=True) + "\n")
    sys.exit(code)


def arg(name, default=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return default


def version_tuple(v):
    parts = []
    for p in str(v).split("."):
        digits = "".join(ch for ch in p if ch.isdigit())
        parts.append(int(digits) if digits else 0)
    return tuple(parts)


def load_otio():
    try:
        import opentimelineio as otio  # noqa: WPS433 (deliberately lazy: the module is optional)
        return otio
    except Exception as e:  # ImportError or a broken native build
        out({"ok": False, "available": False, "reason": "opentimelineio_not_importable", "detail": str(e)[:200]}, 3)


def installed_version():
    try:
        from importlib.metadata import version
        return version("OpenTimelineIO")
    except Exception:
        return None


def pin_state(pin_file):
    pin = {}
    if pin_file:
        try:
            with open(pin_file, "r", encoding="utf8") as f:
                pin = json.load(f)
        except Exception:
            pin = {}
    v = installed_version()
    state = {"installed": v, "pin_file": bool(pin), "exact_version": pin.get("exact_version"), "verified_at": pin.get("verified_at")}
    if not v:
        state["status"] = "version_unknown"
    elif pin.get("exact_version"):
        state["status"] = "pinned_match" if v == pin["exact_version"] else "pinned_mismatch"
    else:
        lo, hi = pin.get("min_version"), pin.get("max_version_exclusive")
        inside = (not lo or version_tuple(v) >= version_tuple(lo)) and (not hi or version_tuple(v) < version_tuple(hi))
        state["status"] = "in_compatible_range_unverified" if inside else "outside_compatible_range"
    return state


def rt(otio, node):
    return otio.opentime.RationalTime(node["value"], node["rate"])


def tr(otio, node):
    return otio.opentime.TimeRange(start_time=rt(otio, node["start"]), duration=rt(otio, node["duration"]))


def build(otio, model):
    tl = otio.schema.Timeline(name=model.get("name") or "RasanAI timeline")
    tl.metadata["rasanai"] = {"schema": model.get("schema"), "rate": model.get("rate"), "loss_report": model.get("loss_report", []), "note": model.get("note")}
    for t in model.get("tracks", []):
        kind = otio.schema.TrackKind.Audio if t.get("kind") == "audio" else otio.schema.TrackKind.Video
        track = otio.schema.Track(name=t.get("name") or t.get("id"), kind=kind)
        for it in t.get("items", []):
            typ = it.get("type")
            if typ == "gap":
                item = otio.schema.Gap(source_range=tr(otio, it["source_range"]))
            elif typ == "transition":
                item = otio.schema.Transition(
                    name=it.get("name") or "transition",
                    transition_type=it.get("otio_type") or otio.schema.TransitionTypes.SMPTE_Dissolve,
                    in_offset=rt(otio, it["in_offset"]),
                    out_offset=rt(otio, it["out_offset"]),
                )
            else:
                media = it.get("media") or {}
                ref = otio.schema.ExternalReference(target_url=media.get("relative_path"), available_range=tr(otio, media["available_range"]) if media.get("available_range") else None)
                item = otio.schema.Clip(name=it.get("name") or it.get("id"), media_reference=ref, source_range=tr(otio, it["source_range"]))
            item.metadata["rasanai"] = it.get("metadata", {})
            track.append(item)
        tl.tracks.append(track)
    return tl


def summarize(otio, tl):
    rows = []
    for track in tl.tracks:
        items = []
        for ch in track:
            kind = type(ch).__name__
            if kind == "Transition":
                items.append({"type": "transition", "in": ch.in_offset.value, "out": ch.out_offset.value})
            else:
                items.append({"type": "gap" if kind == "Gap" else "clip", "duration": ch.source_range.duration.value if ch.source_range else None, "rate": ch.source_range.duration.rate if ch.source_range else None})
        rows.append({"name": track.name, "kind": str(track.kind), "items": items})
    return rows


def expected(model):
    rows = []
    for t in model.get("tracks", []):
        items = []
        for it in t.get("items", []):
            if it.get("type") == "transition":
                items.append({"type": "transition", "in": it["in_offset"]["value"], "out": it["out_offset"]["value"]})
            else:
                items.append({"type": "gap" if it.get("type") == "gap" else "clip", "duration": it["source_range"]["duration"]["value"], "rate": it["source_range"]["duration"]["rate"]})
        rows.append({"name": t.get("name") or t.get("id"), "items": items})
    return rows


def compare(model, got):
    problems = []
    exp = expected(model)
    if len(exp) != len(got):
        problems.append("track count differs: expected %d, read back %d" % (len(exp), len(got)))
    for e, g in zip(exp, got):
        if e["name"] != g["name"]:
            problems.append("track order or name differs: %s vs %s" % (e["name"], g["name"]))
        if len(e["items"]) != len(g["items"]):
            problems.append("track %s: item count differs (%d vs %d)" % (e["name"], len(e["items"]), len(g["items"])))
            continue
        for i, (a, b) in enumerate(zip(e["items"], g["items"])):
            if a["type"] != b["type"]:
                problems.append("track %s item %d: type %s vs %s" % (e["name"], i, a["type"], b["type"]))
            elif a["type"] == "transition":
                if a["in"] != b["in"] or a["out"] != b["out"]:
                    problems.append("track %s item %d: transition offsets differ" % (e["name"], i))
            elif a["duration"] != b["duration"] or a["rate"] != b["rate"]:
                problems.append("track %s item %d: duration or rate differs" % (e["name"], i))
    return problems


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "doctor"
    pin_file = arg("--pin")
    if cmd == "doctor":
        otio = load_otio()
        out({"ok": True, "available": True, "pin": pin_state(pin_file), "note": "importable is not verified: a real write, re-read and an editor import are recorded by Plan 14"})
    if cmd == "write":
        otio = load_otio()
        with open(arg("--model"), "r", encoding="utf8") as f:
            model = json.load(f)
        tl = build(otio, model)
        dest = arg("--out")
        otio.adapters.write_to_file(tl, dest)
        back = otio.adapters.read_from_file(dest)
        problems = compare(model, summarize(otio, back))
        out({"ok": not problems, "written": dest, "pin": pin_state(pin_file), "read_back_problems": problems, "verified_editor_import": False}, 0 if not problems else 2)
    if cmd == "verify":
        otio = load_otio()
        with open(arg("--model"), "r", encoding="utf8") as f:
            model = json.load(f)
        back = otio.adapters.read_from_file(arg("--otio"))
        problems = compare(model, summarize(otio, back))
        out({"ok": not problems, "problems": problems, "verified_editor_import": False}, 0 if not problems else 2)
    out({"ok": False, "reason": "unknown_command", "usage": "doctor | write | verify"}, 2)


if __name__ == "__main__":
    main()
