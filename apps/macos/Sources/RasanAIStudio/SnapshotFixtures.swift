import AppKit
import StudioCore
import SwiftUI

/// Fixture sessions for every step type in `skills/rasanai/references/console.md`, with real PNGs on disk, so any stage can be
/// built and reviewed offscreen without a director.
///
/// Add a fixture: put a case in `StageFixtures.names`, build its JSON in `StageFixtures.json(_:)` (start from `base(current:steps:)`,
/// paths are relative to the fixture run folder; use `img("name")` for generated PNGs), and it appears in the harness.
///
/// Render stages offscreen (light + dark, 1120x740, PNGs in <out>):
///   swift build --scratch-path /tmp/rasan-<you>
///   /tmp/rasan-<you>/debug/RasanAIStudio --snapshot-stages <out> [--only story,look,panel-music]
/// (the `debug` symlink exists after a build; otherwise use the product under /tmp/rasan-<you>/out/Products/Debug).
/// Names: see `StageFixtures.names`. In your own previews: `StageFixtures.model("story")` returns a FilmSessionModel over the fixture.
@MainActor
enum StageFixtures {
    static let names = ["working", "brief", "story", "look", "films", "animatic", "build", "final", "final-done", "ask", "ask-sheet", "decisions",
                        "panel-brand", "panel-route", "panel-footage", "panel-reel", "panel-concept", "panel-scenes", "panel-styleframes",
                        "panel-motion", "panel-transitions", "panel-voice", "panel-music", "panel-storyboard", "panel-keyframes", "panel-plan",
                        "panel-direction", "panel-unknown"]

    /// A temporary run folder with the generated images; shared by all fixtures of one process.
    static let run: URL = {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("rasanai-fixture-\(UUID().uuidString.prefix(8))", isDirectory: true)
        let assets = url.appendingPathComponent("assets", isDirectory: true)
        try? FileManager.default.createDirectory(at: assets, withIntermediateDirectories: true)
        for (name, hues, label) in images {
            if let data = labelledPNG(label, hueA: hues.0, hueB: hues.1) { try? data.write(to: assets.appendingPathComponent("\(name).png")) }
        }
        try? Data("<html><body>board</body></html>".utf8).write(to: assets.appendingPathComponent("board.html"))
        // Optional audio/video fixtures (generated outside, e.g. with ffmpeg): copied into assets/ when the folder is given.
        if let media = ProcessInfo.processInfo.environment["RASAN_FIXTURE_MEDIA"],
           let names = try? FileManager.default.contentsOfDirectory(atPath: media) {
            for name in names { try? FileManager.default.copyItem(atPath: media + "/" + name, toPath: assets.appendingPathComponent(name).path) }
        }
        return url
    }()

    static func model(_ name: String) -> FilmSessionModel {
        let snapshot = (try? SessionSnapshot(data: Data(json(name).utf8))) ?? SessionSnapshot()
        return FilmSessionModel(fixture: snapshot, run: run, workspace: run)
    }

    // MARK: Images

    static let images: [(String, (Double, Double), String)] = [
        ("cap1", (0.60, 0.70), "tally.app home"), ("cap2", (0.12, 0.08), "Pricing"), ("cap3", (0.35, 0.45), "Receipt capture"),
        ("scene1", (0.08, 0.02), "1 Tax season"), ("scene2", (0.60, 0.68), "2 One tap"), ("scene3", (0.35, 0.42), "3 Capture"),
        ("scene4", (0.78, 0.86), "4 The ledger"), ("scene5", (0.10, 0.16), "5 Clear picture"), ("scene6", (0.52, 0.58), "6 Balanced"),
        ("look-sure", (0.58, 0.64), "Sure: Ledger"), ("look-bold", (0.02, 0.08), "Bold: Receipt Riot"), ("look-wild", (0.78, 0.9), "Wild: Paper Cosmos"),
        ("film-a", (0.55, 0.65), "Film A"), ("film-b", (0.05, 0.12), "Film B"), ("film-c", (0.3, 0.4), "Film C"),
        ("latest", (0.35, 0.42), "Scene 3 built"), ("brand-board", (0.62, 0.7), "Brand board"),
        ("contact1", (0.5, 0.6), "clip-01 contact sheet"), ("contact2", (0.15, 0.2), "clip-02 contact sheet"), ("poster", (0.58, 0.66), "Final poster"),
        ("style1", (0.1, 0.15), "Key frame 1"), ("style2", (0.6, 0.7), "Key frame 2"), ("style3", (0.4, 0.5), "Key frame 3"),
        ("motion1", (0.7, 0.8), "Tasting: calm"), ("motion2", (0.02, 0.1), "Tasting: snap"),
    ]

    static func labelledPNG(_ label: String, hueA: Double, hueB: Double, size: CGSize = CGSize(width: 960, height: 540)) -> Data? {
        let image = NSImage(size: size)
        image.lockFocus()
        NSGradient(starting: NSColor(hue: hueA, saturation: 0.55, brightness: 0.88, alpha: 1), ending: NSColor(hue: hueB, saturation: 0.7, brightness: 0.42, alpha: 1))?
            .draw(in: NSRect(origin: .zero, size: size), angle: 35)
        NSColor.white.withAlphaComponent(0.16).setFill()
        NSBezierPath(ovalIn: NSRect(x: size.width * 0.55, y: size.height * 0.35, width: size.height * 0.8, height: size.height * 0.8)).fill()
        let style = NSMutableParagraphStyle(); style.alignment = .left
        (label as NSString).draw(in: NSRect(x: 48, y: 48, width: size.width - 96, height: 120), withAttributes: [
            .font: NSFont.systemFont(ofSize: 56, weight: .bold), .foregroundColor: NSColor.white, .paragraphStyle: style])
        image.unlockFocus()
        guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else { return nil }
        return rep.representation(using: .png, properties: [:])
    }

    // MARK: JSON

    private static func img(_ name: String) -> String { "\"assets/\(name).png\"" }
    private static let t0 = "2026-10-06T09:00:00.000Z"
    private static func t(_ minute: Int) -> String { "2026-10-06T09:\(String(format: "%02d", minute)):00.000Z" }

    private static let briefDone = """
    "brief":{"status":"done","decision":"A 45-second launch film for Tally, 16:9, with a calm voiceover.","by":"user","sent":{"type":"submit"},"fields":{"length_s":45,"kind":"Product launch","subject":"Tally, the receipt app that files itself","aspect":"16:9","destination":"Website","narration":"Voiceover","brand_name":"Northwind","use_brand":true}}
    """
    private static let storyPayload = """
    {"question":"Which story should we tell?","context":"Three scripts, each written from what Tally truly does.","recommended":"bold","stories":[
     {"id":"sure","angle":"Sure","title":"The disappearing receipt","logline":"A year's worth of paper becomes one clear picture.","device":"Pile to picture","why":"Makes a familiar tax-season ritual tangible, then turns the pile into relief.","last_line":"Tally. Everything, in balance.","beats":[
       {"name":"Hook","duration_s":6,"on_screen":"Tax season. Again.","vo":"Another year. Another pile of receipts.","visual":"Paper fills the frame."},
       {"name":"Turn","duration_s":20,"on_screen":"One tap. A clearer picture.","vo":"Keep the whole year in view.","visual":"Receipts become an ordered ledger.","turn":true},
       {"name":"Payoff","duration_s":19,"on_screen":"Everything. In balance.","vo":"Every month, already accounted for.","visual":"The ledger resolves to one calm check."}]},
     {"id":"bold","angle":"Bold","title":"Twelve small victories","logline":"A year told through the twelve moments you got back.","device":"Calendar countdown","why":"Builds the promise around time rather than features.","last_line":"Get your evenings back.","beats":[
       {"name":"Hook","duration_s":5,"on_screen":"12 evenings.","vo":"You lose twelve evenings a year to receipts.","visual":"A calendar, month by month."},
       {"name":"Turn","duration_s":22,"on_screen":"Gone.","vo":"Tally takes them back.","visual":"Evenings light up one by one.","turn":true},
       {"name":"Payoff","duration_s":18,"on_screen":"Yours again.","vo":"Tally. File less, live more.","visual":"A table set for dinner."}]},
     {"id":"wild","angle":"Wild","title":"A receipt's last day","logline":"The tax-season story, from the paper's point of view.","device":"Object POV","why":"A surprising voice nobody expects from a finance app.","last_line":"Retire the shoebox.","beats":[
       {"name":"Hook","duration_s":8,"on_screen":"I am a receipt.","vo":"I have been in this shoebox since March.","visual":"Macro on thermal paper."},
       {"name":"Turn","duration_s":20,"on_screen":"Then: a phone.","vo":"And then, a light.","visual":"The camera scans it away.","turn":true},
       {"name":"Payoff","duration_s":17,"on_screen":"Filed.","vo":"I have never felt so organised.","visual":"A single check mark."}]}]}
    """
    private static let lookPayload = """
    {"question":"Which look fits this story?","context":"Three design systems, each drawn on the story's first line.","recommended":"sure","hook":"12 evenings.","styles":[
     {"id":"sure","label":"Sure","name":"Ledger","blend":"Swiss editorial grid with warm paper tones","why":"Calm and exact, like the product.","poster":\(img("look-sure")),"specimen":"design/sure/specimen.html","references":["swiss-grid","paper"],"style":{"id":"ledger","name":"Ledger","recipe":{"palette":{"canvas":"#EFEADF","surface":"#F7F3EA","ink":"#1B1B19","accent":"#C8442B"},"type":{"display":{"family":"Georgia"},"body":{"family":"Inter"},"class":"editorial"}}}},
     {"id":"bold","label":"Bold","name":"Receipt Riot","blend":"Thermal-paper typography, hard cuts, signal red","why":"Turns the receipt into a poster.","poster":\(img("look-bold")),"references":["thermal","riso"]},
     {"id":"wild","label":"Wild","name":"Paper Cosmos","blend":"Real 3D paper sheets drifting in dusk light","why":"The spectacle moment, built in.","references":["3d-paper"],"style":{"id":"cosmos","name":"Paper Cosmos","recipe":{"palette":{"canvas":"#15122B","surface":"#221D45","ink":"#F4EEE0","accent":"#FF8A5B","glow":"#7A5CFF"},"type":{"display":{"family":"Didot"},"body":{"family":"Inter"},"class":"high-contrast serif"}}}}]}
    """
    private static let scenes = """
    [{"id":1,"title":"Tax season","line":"Tax season. Again.","visual":"Paper fills the frame","duration":6,"thumb":\(img("scene1"))},
     {"id":2,"title":"One tap","line":"One tap. A clearer picture.","visual":"Receipts sort into a ledger","duration":8,"thumb":\(img("scene2"))},
     {"id":3,"title":"Capture","line":"Capture it while it's there.","visual":"Phone scans a receipt","duration":8,"thumb":\(img("scene3"))},
     {"id":4,"title":"The ledger","line":"From a pile to a picture.","visual":"Bars rise in a ledger","duration":9,"thumb":\(img("scene4"))},
     {"id":5,"title":"Clear picture","line":"A clearer picture, every month.","visual":"Monthly summary card","duration":8,"thumb":\(img("scene5"))},
     {"id":6,"title":"Balanced","line":"Everything. In balance.","visual":"One calm check mark","duration":6,"thumb":\(img("scene6"))}]
    """
    private static let doneSteps = """
    \(briefDone),
    "research":{"status":"done","decision":"Read tally.app and 14 reviews: the promise is time back, not accounting."},
    "route":{"status":"done","decision":"product-launch-video: it is a product being launched."},
    "story":{"status":"done","by":"user","sent":{"type":"choose"},"decision":"Twelve small victories: built around time, not features.","stories":[{"id":"bold","angle":"Bold","title":"Twelve small victories"}]},
    "look":{"status":"done","decision":"Ledger: calm and exact, like the product.","styles":[{"id":"sure","label":"Sure","name":"Ledger"}]},
    "music":{"status":"done","decision":"Warm piano bed, 92 bpm: the reveal lands on a downbeat."},
    "voice":{"status":"done","decision":"Mara, a low unhurried voice."},
    "motion":{"status":"done","decision":"Eased and unhurried; one spring on the turn."}
    """

    private static func base(current: String, steps: String, extra: String = "") -> String {
        """
        {"title":"Tally launch film","current":"\(current)","updated":"\(t(30))","steps":{\(steps)},"activity":[
         {"t":"\(t(1))","msg":"Reading your brief","level":"info"},{"t":"\(t(3))","msg":"Capturing tally.app","level":"ok"},
         {"t":"\(t(8))","msg":"Writing the truth sheet: what actually changes for Tally's users","level":"info"},
         {"t":"\(t(14))","msg":"Ready for you: the story","level":"ask"},{"t":"\(t(18))","msg":"You: picked the story: Twelve small victories","level":"you"},
         {"t":"\(t(24))","msg":"Drawing three looks on the first line","level":"info"}]\(extra)}
        """
    }

    static func json(_ name: String) -> String {
        switch name {
        case "working":
            return """
            {"title":"Tally launch film","current":"brief","steps":{"brief":{"status":"working","fields":{"subject":"A 45-second launch film for Tally, the receipt app that files itself. Calm, confident, a little playful.","length_s":45,"aspect":"16:9","brand_name":"Northwind","use_brand":true},"captures":[{"image":\(img("cap1")),"caption":"tally.app home"},{"image":\(img("cap2")),"caption":"Pricing"},{"image":\(img("cap3")),"caption":"Receipt capture"}]}},
            "activity":[{"t":"\(t(1))","msg":"Reading your brief","level":"info"},{"t":"\(t(2))","msg":"Capturing tally.app","level":"info"},{"t":"\(t(3))","msg":"Captured 3 pages","level":"ok"}],"working":{"msg":"Reading what Tally actually does…","t":"\(t(4))"}}
            """
        case "brief":
            return base(current: "brief", steps: """
            "brief":{"status":"awaiting","question":"Here's what we're making","fields":{"length_s":45,"kind":"Product launch","subject":"Tally, the receipt app that files itself","aspect":"16:9","destination":"Website","narration":"Voiceover","brand_name":"Northwind","use_brand":true},"choices":{"length_s":[15,30,45,60,90],"aspect":["16:9","9:16","1:1"],"narration":["Voiceover","On-screen text only","Music only"]},"captures":[{"image":\(img("cap1")),"caption":"tally.app home"},{"image":\(img("cap2")),"caption":"Pricing"},{"image":\(img("cap3")),"caption":"Receipt capture"}],"findings":[{"text":"Tally files receipts the moment you photograph them.","source":"tally.app"},{"text":"Customers say they save about twelve evenings a year.","source":"G2 reviews"},{"text":"Pricing starts free, with no card.","source":"tally.app/pricing"}]}
            """)
        case "story": return base(current: "story", steps: "\(briefDone),\"story\":{\"status\":\"awaiting\",\(storyPayload.dropFirst())")
        case "look": return base(current: "look", steps: "\(doneSteps.replacingOccurrences(of: "\"look\":{\"status\":\"done\"", with: "\"lookold\":{\"status\":\"done\"")),\"look\":{\"status\":\"awaiting\",\(lookPayload.dropFirst())")
        case "films":
            return base(current: "films", steps: "\(briefDone),\"films\":{\"status\":\"awaiting\",\"question\":\"Which film do you want?\",\"recommended\":\"b\",\"films\":[{\"id\":\"a\",\"angle\":\"Sure\",\"title\":\"The Disappearing Receipt\",\"logline\":\"A pile becomes a picture.\",\"hook\":\"Tax season. Again.\",\"why\":\"Familiar, then a relief.\",\"preset\":\"swiss\",\"music\":\"Warm piano\",\"frames\":[\(img("film-a")),\(img("scene1")),\(img("scene2"))],\"beats\":[\"Paper\",\"A tap\",\"Balance\"]},{\"id\":\"b\",\"angle\":\"Bold\",\"title\":\"Twelve Small Victories\",\"logline\":\"The evenings you got back.\",\"hook\":\"12 evenings.\",\"why\":\"Time over features.\",\"preset\":\"riso\",\"music\":\"Driving drums\",\"frames\":[\(img("film-b")),\(img("scene3")),\(img("scene4"))],\"beats\":[\"Calendar\",\"Gone\",\"Yours\"]},{\"id\":\"c\",\"angle\":\"Wild\",\"title\":\"A Receipt's Last Day\",\"logline\":\"The paper's point of view.\",\"hook\":\"I am a receipt.\",\"why\":\"A voice nobody expects.\",\"preset\":\"macro\",\"music\":\"Ambient pads\",\"frames\":[\(img("film-c")),\(img("scene5")),\(img("scene6"))],\"beats\":[\"Macro\",\"Light\",\"Filed\"]}]}")
        case "animatic":
            return base(current: "animatic", steps: "\(doneSteps),\"animatic\":{\"status\":\"awaiting\",\"question\":\"Does the rhythm feel right?\",\"scenes\":\(scenes),\"music\":{\"title\":\"Warm piano bed\",\"file\":\"assets/music.m4a\",\"offset\":0,\"alternatives\":[{\"id\":\"m2\",\"title\":\"Soft drums\",\"mood\":\"driving\",\"file\":\"assets/music2.m4a\"},{\"id\":\"m3\",\"title\":\"Ambient pads\",\"mood\":\"calm\",\"file\":\"assets/music3.m4a\"}]},\"voice\":{\"name\":\"Mara\",\"alternatives\":[{\"id\":\"v2\",\"name\":\"Jon\"},{\"id\":\"v3\",\"name\":\"Priya\"}]}}",
                        extra: ",\"comments\":[{\"id\":\"n1\",\"step\":\"animatic\",\"scene\":2,\"t\":9.5,\"x\":0.62,\"y\":0.4,\"scope\":\"scene\",\"quick\":\"Slower\",\"text\":\"Hold this a beat longer.\",\"state\":\"open\"},{\"id\":\"n2\",\"step\":\"animatic\",\"scene\":4,\"t\":27,\"x\":0.3,\"y\":0.7,\"scope\":\"film\",\"text\":\"Music is too loud under the voice.\",\"state\":\"open\"}]")
        case "build":
            return base(current: "build", steps: "\(doneSteps),\"build\":{\"status\":\"working\",\"latest\":\(img("latest")),\"scenes\":[{\"id\":1,\"title\":\"Tax season\",\"duration\":6,\"state\":\"done\",\"frame\":\(img("scene1"))},{\"id\":2,\"title\":\"One tap\",\"duration\":8,\"state\":\"done\",\"frame\":\(img("scene2"))},{\"id\":3,\"title\":\"Capture\",\"duration\":8,\"state\":\"working\",\"frame\":\(img("latest"))},{\"id\":4,\"title\":\"The ledger\",\"duration\":9,\"state\":\"todo\"},{\"id\":5,\"title\":\"Clear picture\",\"duration\":8,\"state\":\"todo\"},{\"id\":6,\"title\":\"Balanced\",\"duration\":6,\"state\":\"todo\"}],\"stages\":{\"handoff\":\"done\",\"plan\":\"done\",\"design\":\"done\",\"build\":\"working\"},\"log\":[{\"t\":\"\(t(40))\",\"level\":\"ok\",\"msg\":\"Handoff written\"},{\"t\":\"\(t(41))\",\"level\":\"info\",\"msg\":\"Scene 3 composition built\"},{\"t\":\"\(t(42))\",\"level\":\"warn\",\"msg\":\"Font fallback for caption plate\"}]}",
                        extra: ",\"working\":{\"msg\":\"Building scene 3 of 6…\",\"t\":\"\(t(42))\"}")
        case "final", "final-done":
            let done = name == "final-done"
            return base(current: "render", steps: "\(doneSteps),\"render\":{\"status\":\"\(done ? "done" : "awaiting")\",\(done ? "\"question\":\"Here's your film\"," : "")\"video\":\"assets/final.mp4\",\"poster\":\(img("poster")),\"duration\":45,\"version\":2,\"versions\":[{\"v\":1,\"when\":\"\(t(50))\"},{\"v\":2,\"when\":\"\(t(58))\"}],\"changes\":[\"Held the ledger scene a beat longer\",\"Lowered the music under the voiceover\"],\"scenes\":[{\"id\":1,\"title\":\"Tax season\",\"start\":0,\"thumb\":\(img("scene1"))},{\"id\":2,\"title\":\"One tap\",\"start\":6,\"thumb\":\(img("scene2"))},{\"id\":3,\"title\":\"Capture\",\"start\":14,\"thumb\":\(img("scene3"))},{\"id\":4,\"title\":\"The ledger\",\"start\":22,\"thumb\":\(img("scene4"))},{\"id\":5,\"title\":\"Clear picture\",\"start\":31,\"thumb\":\(img("scene5"))},{\"id\":6,\"title\":\"Balanced\",\"start\":39,\"thumb\":\(img("scene6"))}]}")
        case "ask", "ask-sheet":
            return base(current: "animatic", steps: "\(doneSteps),\"animatic\":{\"status\":\"awaiting\",\"scenes\":\(scenes)}",
                        extra: ",\"ask\":{\"id\":\"a1b2c3d4\",\"step\":\"animatic\",\"question\":\"Your logo has two versions. Which should close the film?\",\"context\":\"Northwind's DESIGN.md lists a wordmark and a monogram. The wordmark reads better at 16:9; the monogram holds up when the film is cropped square.\",\"options\":[{\"id\":\"wordmark\",\"label\":\"The wordmark\",\"detail\":\"Wide, calm, best on the closing card.\"},{\"id\":\"mono\",\"label\":\"The monogram\",\"detail\":\"Compact, survives square crops.\"}],\"recommended\":\"wordmark\",\"placeholder\":\"Or paste another logo path or link\"}")
        case "decisions":
            return base(current: "animatic", steps: "\(doneSteps),\"animatic\":{\"status\":\"awaiting\",\"scenes\":\(scenes),\"thread\":[{\"who\":\"you\",\"text\":\"Can the ledger scene breathe more?\",\"t\":\"\(t(52))\"},{\"who\":\"claude\",\"text\":\"Yes: I'll hold it two seconds and ease the bars in.\",\"t\":\"\(t(53))\"}]}")
        case "panel-brand":
            return base(current: "brand", steps: "\(briefDone),\"brand\":{\"status\":\"awaiting\",\"question\":\"Use the Northwind brand?\",\"context\":\"Found DESIGN.md in your project. It defines colours, type and light and dark modes.\",\"board\":\"assets/board.html\",\"image\":\(img("brand-board")),\"brand\":{\"name\":\"Northwind\",\"source\":\"DESIGN.md\",\"roles\":{\"canvas\":\"#F4E9CD\",\"ink\":\"#14213D\",\"accent\":\"#EE6C4D\",\"surface\":\"#FFFFFF\",\"muted\":\"#8D99AE\",\"sea\":\"#1F7A8C\"},\"fonts\":{\"display\":{\"family\":\"Georgia\"},\"body\":{\"family\":\"Avenir Next\"},\"mono\":{\"family\":\"Menlo\"}},\"modes\":[\"dark\",\"light\"],\"warnings\":[\"Accent on canvas fails contrast for small text\",\"No motion rules in DESIGN.md: Claude will propose them\"]}}")
        case "panel-route":
            return base(current: "route", steps: "\(briefDone),\"route\":{\"status\":\"awaiting\",\"question\":\"Which workflow builds this?\",\"recommended\":\"product-launch-video\",\"options\":[{\"id\":\"product-launch-video\",\"label\":\"Product launch video\",\"why\":\"A product being launched, built from the site.\"},{\"id\":\"faceless-explainer\",\"label\":\"Faceless explainer\",\"why\":\"Topic told with invented visuals.\"},{\"id\":\"reel\",\"label\":\"Footage reel\",\"why\":\"Cut together raw clips.\"}]}")
        case "panel-footage":
            return base(current: "footage", steps: "\(briefDone),\"footage\":{\"status\":\"awaiting\",\"question\":\"Which clips go in the reel?\",\"context\":\"4 clips found in the footage folder.\",\"clips\":[{\"id\":\"c1\",\"name\":\"interview-raw.mov\",\"duration\":184,\"width\":1920,\"height\":1080,\"fps\":24,\"has_audio\":true,\"words\":412,\"scenes\":[1,2,3,4],\"sheet\":\(img("contact1")),\"text\":\"So the idea started at my kitchen table, with a shoebox of receipts. Every April I would lose a weekend to it. I thought, there has to be a better way than this.\"},{\"id\":\"c2\",\"name\":\"office-broll.mov\",\"duration\":62,\"width\":3840,\"height\":2160,\"fps\":30,\"has_audio\":false,\"scenes\":[1,2],\"sheet\":\(img("contact2"))},{\"id\":\"c3\",\"name\":\"street-ambient.mov\",\"duration\":41,\"width\":1920,\"height\":1080,\"fps\":25,\"has_audio\":true,\"words\":0,\"scenes\":[],\"sheet\":\(img("scene4"))},{\"id\":\"c4\",\"name\":\"broken-export.mov\",\"error\":\"Could not read this file (moov atom not found)\",\"sheet\":null}]}")
        case "panel-reel":
            return base(current: "reel", steps: "\(briefDone),\"reel\":{\"status\":\"awaiting\",\"question\":\"Is this the cut?\",\"context\":\"Draft cut from the ticked clips. Reorder, trim, and edit anything before the build.\",\"clips\":[{\"name\":\"interview-raw.mov\",\"duration\":184},{\"name\":\"office-broll.mov\",\"duration\":62},{\"name\":\"street-ambient.mov\",\"duration\":41}],\"timeline\":[{\"type\":\"card\",\"text\":[\"Tally\",\"The receipt app that files itself\"],\"duration\":3},{\"type\":\"clip\",\"clip\":\"interview-raw.mov\",\"in\":12,\"out\":24.5,\"transition_in\":\"dissolve\",\"label\":\"The shoebox\"},{\"type\":\"clip\",\"clip\":\"office-broll.mov\",\"in\":3,\"out\":9,\"transition_in\":\"cut\",\"mute\":true},{\"type\":\"clip\",\"clip\":\"interview-raw.mov\",\"in\":96,\"out\":110,\"transition_in\":\"auto\"},{\"type\":\"card\",\"text\":\"Twelve evenings a year\",\"duration\":2.5},{\"type\":\"clip\",\"clip\":\"street-ambient.mov\",\"in\":8,\"out\":14,\"transition_in\":\"wipe\"}],\"overlays\":[{\"text\":\"Maya Chen\",\"sub\":\"Founder, Tally\",\"zone\":\"lower-third\",\"start\":5,\"duration\":3.5,\"style\":\"plate\"},{\"text\":\"Filed before you finish your coffee\",\"sub\":\"\",\"zone\":\"center\",\"start\":24,\"duration\":3,\"style\":\"clear\"}],\"captions\":{\"on\":true,\"style\":\"bold\"}}")
        case "panel-concept":
            return base(current: "concept", steps: "\(briefDone),\"concept\":{\"status\":\"awaiting\",\"question\":\"Which concept?\",\"recommended\":\"c2\",\"options\":[{\"id\":\"c1\",\"title\":\"The shoebox\",\"logline\":\"A shoebox of receipts, emptied.\",\"frames\":[\(img("film-a"))],\"beats\":[\"Box\",\"Scan\",\"Calm\"],\"rare\":false},{\"id\":\"c2\",\"title\":\"Twelve evenings\",\"logline\":\"Time given back.\",\"frames\":[\(img("film-b"))],\"beats\":[\"Calendar\",\"Gone\",\"Yours\"],\"rare\":true}]}")
        case "panel-scenes":
            return base(current: "scenes", steps: "\(briefDone),\"scenes\":{\"status\":\"awaiting\",\"question\":\"Do the scenes add up?\",\"context\":\"Six scenes, written from the story you chose. Edit anything before it is built.\",\"target_s\":45,\"transition_default\":\"crossfade\",\"narrated\":true,\"scenes\":[{\"id\":1,\"title\":\"Tax season\",\"on_screen\":\"Every April\",\"visual\":\"A shoebox of curling receipts\",\"voiceover\":\"Every April, the same shoebox.\",\"duration\":6,\"intensity\":\"low\",\"thumb\":\(img("scene1"))},{\"id\":2,\"title\":\"One tap\",\"on_screen\":\"Photograph it\",\"visual\":\"A phone captures a receipt, edges snap\",\"voiceover\":\"Now it takes one tap.\",\"duration\":8,\"transition_in\":\"push-slide UP\",\"intensity\":\"medium\",\"thumb\":\(img("scene2"))},{\"id\":3,\"title\":\"Capture\",\"on_screen\":\"Filed.\",\"visual\":\"Line items slide into a ledger\",\"voiceover\":\"Tally reads it and files it.\",\"duration\":8,\"thumb\":\(img("scene3"))},{\"id\":4,\"title\":\"The ledger\",\"on_screen\":\"12 evenings\",\"visual\":\"Bars grow, a calendar empties\",\"voiceover\":\"Twelve evenings a year, given back.\",\"duration\":9,\"transition_in\":\"zoom-through\",\"intensity\":\"high\",\"thumb\":\(img("scene4"))},{\"id\":5,\"title\":\"Clear picture\",\"on_screen\":\"Everything in view\",\"visual\":\"The pile resolves into one chart\",\"voiceover\":\"One clear picture of the year.\",\"duration\":8,\"thumb\":\(img("scene5"))},{\"id\":6,\"title\":\"Balanced\",\"on_screen\":\"Tally\",\"visual\":\"Wordmark settles on a balanced scale\",\"voiceover\":\"Tally. Everything, in balance.\",\"duration\":6,\"transition_in\":\"crossfade\",\"intensity\":\"low\",\"thumb\":\(img("scene6"))}]}")
        case "panel-styleframes":
            return base(current: "styleframes", steps: "\(briefDone),\"styleframes\":{\"status\":\"awaiting\",\"question\":\"Approve the key frames?\",\"images\":[\(img("style1")),\(img("style2")),\(img("style3"))],\"captions\":[\"Opening: paper\",\"The turn\",\"Payoff\"]}")
        case "panel-motion":
            return base(current: "motion", steps: "\(briefDone),\"motion\":{\"status\":\"awaiting\",\"question\":\"How should it move?\",\"context\":\"Your own line, played in four motion languages. Watch a few loops, then pick one.\",\"recommended\":\"eased\",\"tasting\":\"assets/board.html\",\"cells\":[{\"letter\":\"A\",\"id\":\"eased\",\"name\":\"Eased\",\"oneLiner\":\"Long settles, nothing arrives in a hurry.\",\"video\":\"assets/motion-calm.mp4\"},{\"letter\":\"B\",\"id\":\"snap\",\"name\":\"Snap\",\"oneLiner\":\"Hard starts, hard stops, a beat of silence between.\",\"video\":\"assets/motion-snap.mp4\"},{\"letter\":\"C\",\"id\":\"weighty\",\"name\":\"Weighty\",\"oneLiner\":\"Things have mass: they lean in and settle.\"},{\"letter\":\"D\",\"id\":\"playful\",\"name\":\"Playful\",\"oneLiner\":\"A little overshoot on every landing.\",\"parent\":\"eased\"}],\"adjectives\":[\"warmer\",\"slower\",\"more overshoot\",\"more precise\"]}")
        case "panel-transitions":
            return base(current: "transitions", steps: "\(briefDone),\"transitions\":{\"status\":\"awaiting\",\"question\":\"Pick the transition language\",\"context\":\"Two of your scenes handing off each way.\",\"recommended\":\"wipe\",\"menu\":\"assets/board.html\",\"cells\":[{\"letter\":\"A\",\"id\":\"cut\",\"label\":\"Hard cut\",\"energy\":\"high\",\"duration_s\":0},{\"letter\":\"B\",\"id\":\"crossfade\",\"label\":\"Crossfade\",\"energy\":\"low\",\"duration_s\":0.6},{\"letter\":\"C\",\"id\":\"wipe\",\"label\":\"Paper wipe\",\"energy\":\"medium\",\"duration_s\":0.5},{\"letter\":\"D\",\"id\":\"push-slide LEFT\",\"label\":\"push slide left\",\"energy\":\"medium\",\"duration_s\":0.5},{\"letter\":\"E\",\"id\":\"zoom-through\",\"label\":\"Zoom through\",\"energy\":\"high\",\"duration_s\":0.7},{\"letter\":\"F\",\"id\":\"blur-dissolve\",\"label\":\"Blur dissolve\",\"energy\":\"low\",\"duration_s\":0.8}]}")
        case "panel-voice":
            return base(current: "voice", steps: "\(briefDone),\"voice\":{\"status\":\"awaiting\",\"question\":\"Which voice?\",\"context\":\"Your hook line, spoken three ways.\",\"recommended\":\"mara\",\"options\":[{\"id\":\"mara\",\"title\":\"Mara\",\"mood\":\"low, unhurried\",\"file\":\"assets/voice-mara.mp3\",\"source\":\"ElevenLabs\"},{\"id\":\"jon\",\"title\":\"Jon\",\"mood\":\"bright, friendly\",\"file\":\"assets/voice-jon.mp3\",\"source\":\"ElevenLabs\"},{\"id\":\"ines\",\"title\":\"Ines\",\"mood\":\"warm, a little amused\",\"file\":\"assets/voice-missing.mp3\",\"source\":\"System voices\"}]}")
        case "panel-music":
            return base(current: "music", steps: "\(briefDone),\"music\":{\"status\":\"awaiting\",\"question\":\"Which music bed?\",\"recommended\":\"m1\",\"options\":[{\"id\":\"m1\",\"title\":\"Warm piano\",\"mood\":\"calm, hopeful\",\"duration\":48,\"file\":\"assets/music.m4a\",\"preview\":\"assets/music-fit.m4a\",\"bpm\":92,\"summary\":\"Piano and soft strings\",\"ending\":\"Resolves on the last bar\",\"fit\":\"Reveal lands on a downbeat at 0:22\",\"license\":\"CC0\",\"attribution\":\"\",\"source\":\"Free Music Archive\"},{\"id\":\"m2\",\"title\":\"Soft drums\",\"mood\":\"driving\",\"duration\":52,\"file\":\"assets/music2.m4a\",\"bpm\":118,\"summary\":\"Brushed drums, bass\",\"ending\":\"Fades\",\"fit\":\"Needs a 3s trim\",\"license\":\"CC-BY\",\"attribution\":\"Kevin MacLeod\",\"source\":\"incompetech\"}]}")
        case "panel-storyboard":
            return base(current: "storyboard", steps: "\(briefDone),\"storyboard\":{\"status\":\"awaiting\",\"question\":\"Approve the storyboard?\",\"sheet\":\"assets/board.html\",\"timeline\":{\"total_s\":45,\"narrated\":true,\"music\":\"Warm piano\",\"scenes\":[{\"n\":1,\"title\":\"Tax season\",\"duration_s\":6,\"transition_in\":\"cut\",\"on_screen\":\"A shoebox of receipts, spilling\"},{\"n\":2,\"title\":\"One tap\",\"duration_s\":8,\"transition_in\":\"wipe\",\"on_screen\":\"A thumb, a scan, a tick\"},{\"n\":3,\"title\":\"Capture\",\"duration_s\":9,\"transition_in\":\"crossfade\",\"on_screen\":\"Receipts file themselves\"},{\"n\":4,\"title\":\"The ledger\",\"duration_s\":10,\"transition_in\":\"push\",\"on_screen\":\"Rows align, totals appear\"},{\"n\":5,\"title\":\"Clear picture\",\"duration_s\":7,\"transition_in\":\"crossfade\",\"on_screen\":\"The month at a glance\"},{\"n\":6,\"title\":\"Balanced\",\"duration_s\":5,\"transition_in\":\"cut\",\"on_screen\":\"Tally. Retire the shoebox.\"}]}}")
        case "panel-keyframes":
            return base(current: "keyframes", steps: "\(briefDone),\"keyframes\":{\"status\":\"awaiting\",\"question\":\"Do the key poses work?\",\"board\":\(img("brand-board")),\"issues\":[{\"problem\":\"Pose 3 crops the logo\"}]}")
        case "panel-plan":
            return base(current: "plan", steps: "\(briefDone),\"plan\":{\"status\":\"awaiting\",\"question\":\"Ready to build?\",\"shape\":\"6 scenes, 45 s, one composition per scene\",\"stated\":\"Product launch, calm voiceover, Ledger look\",\"agent\":\"6 scene animators in parallel, a Motion Director, 3 critics\"}")
        case "panel-direction":
            return base(current: "direction", steps: "\(briefDone),\"direction\":{\"status\":\"awaiting\",\"question\":\"Pick a direction\",\"recommended\":\"s1\",\"suggestions\":[{\"id\":\"s1\",\"title\":\"Swiss editorial\",\"why\":\"Calm and exact\"},{\"id\":\"s2\",\"title\":\"Riso poster\",\"why\":\"Loud and warm\"}]}")
        case "panel-unknown":
            return base(current: "research", steps: "\(briefDone),\"research\":{\"status\":\"awaiting\",\"question\":\"Anything the crew should know?\",\"context\":\"A step the app has no special screen for.\",\"options\":[{\"id\":\"go\",\"label\":\"Carry on\",\"why\":\"No changes\"},{\"id\":\"more\",\"label\":\"Look wider\",\"why\":\"Read competitors too\"}]}")
        default: return base(current: "brief", steps: briefDone)
        }
    }

    // MARK: Hosting

    /// What the harness renders for a fixture: the stage bar and the native film view, with the inspector or ask open when asked.
    struct Host: View {
        let name: String
        let model: FilmSessionModel
        var body: some View {
            if name == "ask-sheet", let ask = model.ask {
                AskSheet(model: model, ask: ask).tint(.rasan).background(Color(nsColor: .windowBackgroundColor))
            } else { stage }
        }
        private var stage: some View {
            NavigationStack {
                DecisionsHost(model: model, page: VStack(spacing: 0) {
                    FilmStageBar(current: model.snapshot.stage, viewing: model.viewingStage, canSelect: { model.canView($0) }, onSelect: { model.view($0) })
                    NativeFilmView(model: model)
                })
                .navigationTitle("Tally launch film")
            }
            .tint(.rasan)
            .onAppear {
                if name == "decisions" { model.decisionsPresented = true }
                if name == "ask", let ask = model.ask { model.dismissedAsks.insert(ask.id) }
            }
        }
    }

    /// `--snapshot-stages <dir> [--only a,b]`
    static func run(into directory: URL, only: Set<String>?) async {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let size = CGSize(width: Double(ProcessInfo.processInfo.environment["RASAN_SNAP_W"] ?? "") ?? 1120, height: Double(ProcessInfo.processInfo.environment["RASAN_SNAP_H"] ?? "") ?? 740)
        for dark in [false, true] {
            for name in names where only == nil || only!.contains(name) {
                let model = model(name)
                await SnapshotHarness.capture(Host(name: name, model: model), size: name == "ask-sheet" ? CGSize(width: 520, height: 520) : size, dark: dark, titled: true,
                                              title: "Tally launch film", to: directory.appendingPathComponent("stage-\(name)\(dark ? "-dark" : "").png"))
            }
        }
    }
}
