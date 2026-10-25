import CoreGraphics
import Foundation
import XCTest
@testable import StudioCore

// Plan 10 (authored, NOT run: testing waits for the person's explicit approval of Plan 14). Cases U01-U13 are indexed in
// skills/rasanai/scripts/tests/fixtures/plan10/cases.json; the engine-side cases live there as JSON fixtures.
final class Plan10Tests: XCTestCase {
    private func snap(_ json: String) -> SessionSnapshot { try! SessionSnapshot(data: Data(json.utf8)) }
    private func json(_ text: String) -> JSONValue { try! JSONDecoder().decode(JSONValue.self, from: Data(text.utf8)) }
    private func close(_ a: CGFloat, _ b: CGFloat, _ eps: CGFloat = 1e-6, file: StaticString = #filePath, line: UInt = #line) { XCTAssertEqual(a, b, accuracy: eps, file: file, line: line) }

    // U05 pointer transform ---------------------------------------------------------------------------------------------------------------
    func testLetterboxedPointerMapsThroughThePictureRectangle() throws {
        let g = VideoViewGeometry(viewSize: CGSize(width: 800, height: 600), frameSize: CGSize(width: 1920, height: 1080), backingScale: 2)
        let rect = try XCTUnwrap(VideoPointerMap.contentRect(g))
        close(rect.minY, 75); close(rect.height, 450); close(rect.width, 800)
        let m = try XCTUnwrap(VideoPointerMap.map(CGPoint(x: 400, y: 300), in: g))
        XCTAssertTrue(m.onPicture)
        close(m.frameNorm.x, 0.5); close(m.frameNorm.y, 0.5); close(m.framePixel.x, 960); close(m.framePixel.y, 540)
        close(m.backingPixel.x, 800); close(m.backingPixel.y, 600)
        XCTAssertFalse(try XCTUnwrap(VideoPointerMap.map(CGPoint(x: 400, y: 20), in: g)).onPicture, "a bar is not the film")
    }
    func testCropFillAndInsets() throws {
        let crop = VideoViewGeometry(viewSize: CGSize(width: 540, height: 540), frameSize: CGSize(width: 1920, height: 1080), visibleCrop: CGRect(x: 0.25, y: 0, width: 0.5, height: 1))
        let c = try XCTUnwrap(VideoPointerMap.map(CGPoint(x: 270, y: 270), in: crop)); close(c.frameNorm.x, 0.5); close(c.frameNorm.y, 0.5)
        let fill = VideoViewGeometry(viewSize: CGSize(width: 400, height: 400), frameSize: CGSize(width: 1000, height: 500), fit: .fill)
        close(try XCTUnwrap(VideoPointerMap.map(CGPoint(x: 0, y: 200), in: fill)).frameNorm.x, 0.25)
        let inset = VideoViewGeometry(viewSize: CGSize(width: 800, height: 650), frameSize: CGSize(width: 1920, height: 1080), insets: .init(top: 50))
        let i = try XCTUnwrap(VideoPointerMap.map(CGPoint(x: 400, y: 350), in: inset)); close(i.frameNorm.y, 0.5)
        XCTAssertNil(VideoPointerMap.map(.zero, in: VideoViewGeometry(viewSize: .zero, frameSize: CGSize(width: 10, height: 10))))
        // the inverse round-trips
        let back = try XCTUnwrap(VideoPointerMap.viewPoint(forFrameNorm: CGPoint(x: 0.5, y: 0.5), in: inset)); close(back.x, 400); close(back.y, 350)
    }

    // U04 / U13 drag = one transaction; stale pointer identity ---------------------------------------------------------------------------
    func testADragIsOneTransactionAndAClickIsNone() throws {
        var c = DragCoalescer()
        c.begin(ElementReading(elementID: "scene-1.title", sceneID: "scene-1", time: 1), at: CGPoint(x: 0.5, y: 0.5))
        for i in 0..<300 { c.update(to: CGPoint(x: 0.5 + 0.1 * Double(i) / 299, y: 0.5 + 0.02 * Double(i) / 299)) }
        let tx = try XCTUnwrap(c.commit(id: "studio-test"))
        XCTAssertEqual(tx.editID, "studio-test"); close(CGFloat(tx.dx), 0.1, 1e-9); close(CGFloat(tx.dy), 0.02, 1e-9)
        XCTAssertFalse(c.isDragging)
        c.begin(ElementReading(elementID: "a", sceneID: "s", time: 0), at: CGPoint(x: 0.5, y: 0.5)); c.update(to: CGPoint(x: 0.5005, y: 0.5))
        XCTAssertNil(c.commit(), "barely moved: a click, not an edit")
    }
    func testEditCarriesTheRevisionItWasMadeAgainst() throws {
        let r = ElementReading(elementID: "scene-1.title", sceneID: "scene-1", time: 2, filmVersion: "7", buildDigest: "abc", elementDigest: "def", renderRevisionID: "rev-1")
        let edit = MotionEditBuilder.move(r, dx: 0.1, dy: 0, id: "e1")
        XCTAssertEqual(edit["build_digest"].string, "abc"); XCTAssertEqual(edit["render_revision_id"].string, "rev-1"); XCTAssertEqual(edit["fields"]["position"]["dx"].number, 0.1)
        XCTAssertNotNil(MotionEditBuilder.newID().range(of: "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$", options: .regularExpression))
        XCTAssertEqual(MotionEditBuilder.revert(of: "e1", r, id: "u1")["fields"]["revert_of"].string, "e1")
    }
    func testStalePointerIsNeverUsedSilently() throws {
        let index = try XCTUnwrap(ElementIndex(json: json(#"{"build_digest":"d1","frame_size":{"w":1000,"h":500},"items":[{"element_id":"s1.title","scene_id":"s1","kind":"text","capability":"dom","editable":["text","position"],"active_s":[0,5],"z":1,"bounds_samples":[{"t_s":0,"x":100,"y":100,"w":200,"h":50}]},{"element_id":"s1.clip","scene_id":"s1","kind":"video","capability":"raster","editable":["timing","text"],"active_s":[0,5],"z":0,"bounds_samples":[{"t_s":0,"x":0,"y":0,"w":1000,"h":500}]}]}"#)))
        let now = DisplayedRevision(renderRevisionID: "r1", indexBuildDigest: "d1")
        guard case .element(let hit) = PointerResolver.resolve(index: index, time: 1, frameNorm: CGPoint(x: 0.2, y: 0.25), pointed: now, current: now) else { return XCTFail("expected the title") }
        XCTAssertEqual(hit.elementID, "s1.title")
        guard case .regionOnly = PointerResolver.resolve(index: index, time: 1, frameNorm: CGPoint(x: 0.2, y: 0.25), pointed: DisplayedRevision(renderRevisionID: "r0", indexBuildDigest: "d1"), current: now) else { return XCTFail("a different render must not target an element") }
        guard case .regionOnly = PointerResolver.resolve(index: index, time: 1, frameNorm: CGPoint(x: 0.2, y: 0.25), pointed: DisplayedRevision(renderRevisionID: "r1", indexBuildDigest: "old"), current: now) else { return XCTFail("a rebuilt index must not be used silently") }
        guard case .none = PointerResolver.resolve(index: index, time: 1, frameNorm: CGPoint(x: 0.8, y: 0.9), pointed: now, current: now) else { return XCTFail("raster footage is clip-editable only") }
        XCTAssertEqual(try XCTUnwrap(index.items.first { $0.elementID == "s1.clip" }).directEdits, ["timing"])
    }

    // U08 progress truth ----------------------------------------------------------------------------------------------------------------
    func testReadyNeedsItsReceipt() throws {
        let base = #""revision_id":"r1","seq":3,"source":{"source_digest":"S","edit_id":"e1"},"final":{"file":"f.mp4"}"#
        let bare = try XCTUnwrap(RevisionEvent(json: json("{\(base),\"stage\":\"final_ready\"}")))
        XCTAssertEqual(bare.token.label, "Final not confirmed"); XCTAssertFalse(bare.replacesDelivered)
        let ok = try XCTUnwrap(RevisionEvent(json: json("{\(base),\"stage\":\"final_ready\",\"receipt\":{\"edit_id\":\"e1\",\"source_digest\":\"S\",\"output_checksum\":\"abc\"}}")))
        XCTAssertEqual(ok.token.label, "Final ready"); XCTAssertTrue(ok.replacesDelivered)
        let other = try XCTUnwrap(RevisionEvent(json: json("{\(base),\"stage\":\"final_ready\",\"receipt\":{\"edit_id\":\"e1\",\"source_digest\":\"OTHER\",\"output_checksum\":\"abc\"}}")))
        XCTAssertFalse(other.hasMatchingReceipt)
        let overlay = try XCTUnwrap(RevisionEvent(json: json(#"{"revision_id":"r2","stage":"preview_ready","source":{"source_digest":"S"},"preview":{"file":"p.mp4","kind":"overlay"},"receipt":{"source_digest":"S","output_checksum":"abc"}}"#)))
        XCTAssertEqual(overlay.token.label, "Preview not confirmed")
        let plan = try XCTUnwrap(RevisionEvent(json: json(#"{"revision_id":"r3","stage":"preview_pending","source":{"source_digest":"S"},"work":{"pending":["s3"],"basis":"plan"}}"#)))
        XCTAssertEqual(plan.work.lines, ["Expected to rebuild: s3"])
        XCTAssertNil(RevisionEvent(json: .null))
        XCTAssertEqual(try XCTUnwrap(RevisionEvent(json: json(#"{"revision_id":"r4","stage":"from_the_future","source":{"source_digest":"S"}}"#))).stage, .unknown, "a newer engine state never crashes an older Studio")
    }
    func testRunStateComesFromJobs() throws {
        let run = FileManager.default.temporaryDirectory.appendingPathComponent("p10-run-\(UUID().uuidString)")
        let jobs = run.appendingPathComponent("crew/jobs")
        try FileManager.default.createDirectory(at: jobs, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: run) }
        XCTAssertEqual(RunActivityReader.read(run: run).state, .stopped)
        try Data(#"{"job_id":"j1","node_id":"scene-1","state":"running","attempt":1}"#.utf8).write(to: jobs.appendingPathComponent("j1.json"))
        XCTAssertEqual(RunActivityReader.read(run: run).state, .working)
        try Data(#"{"paused":true}"#.utf8).write(to: run.appendingPathComponent("crew/pause.json"))
        XCTAssertEqual(RunActivityReader.read(run: run).state, .paused)
        try Data(#"{"job_id":"j1","node_id":"scene-1","state":"failed","attempt":2}"#.utf8).write(to: jobs.appendingPathComponent("j1.json"))
        let failed = RunActivityReader.read(run: run); XCTAssertEqual(failed.state, .failed); XCTAssertTrue(failed.jobs[0].canRetry)
        XCTAssertEqual(UsageDisplay().text, "Usage unavailable"); XCTAssertTrue(UsageDisplay(estimated: 12_000).text.contains("estimated"))
    }
    func testRetimedVersionsMapThroughBeatsNotTimestamps() throws {
        let c = TimelineCorrespondence(original: [TimelineBeat(id: "b1", start: 0, end: 2), TimelineBeat(id: "b2", start: 2, end: 4)], updated: [TimelineBeat(id: "b1", start: 0, end: 3), TimelineBeat(id: "b2", start: 3, end: 4), TimelineBeat(id: "b3", start: 4, end: 5)])
        XCTAssertFalse(c.isIdentical); XCTAssertEqual(c.added, ["b3"])
        let m = try XCTUnwrap(c.map(1.0)); close(CGFloat(m.time), 1.5); XCTAssertEqual(m.beat, "b1")
        let back = try XCTUnwrap(c.map(3.5, originalToUpdated: false)); close(CGFloat(back.time), 3.0)
    }

    // U01 / U02 five calls -----------------------------------------------------------------------------------------------------------------
    func testFiveCallsAreDifferentAndBuildIsNotASixth() throws {
        XCTAssertEqual(CreativeCall.allCases.count, 5)
        XCTAssertEqual(Set(CreativeCall.allCases.map(\.approvalMeaning)).count, 5)
        XCTAssertTrue(CallJourney.isBuildProgress(.build)); XCTAssertNil(CreativeCall(route: .build))
        XCTAssertEqual(CreativeCall(route: .animatic), .storyboard)
        let s = snap(#"{"current":"story","decide_rest":{"ts":"x"},"series":{"name":"Weekly"},"steps":{"brief":{"status":"done","sent":{"type":"approve"}},"story":{"status":"awaiting"}}}"#)
        let states = CallJourney.states(s)
        XCTAssertEqual(states.map(\.status), [.done, .current, .upcoming, .upcoming, .upcoming])
        XCTAssertEqual(states[0].source, .you); XCTAssertEqual(states[2].source, .decideRest)
        XCTAssertTrue(states[2].source?.label.contains("Chosen for you") == true)
    }
    func testAudienceTitlesAndHonestMediaLabels() {
        XCTAssertEqual(AudienceTitle.treatment(title: "Twelve small victories"), "Twelve small victories")
        XCTAssertEqual(AudienceTitle.treatment(title: "Story 2", logline: "A shoebox of receipts becomes a calm tax day."), "A shoebox of receipts becomes a")
        XCTAssertEqual(AudienceTitle.treatment(title: "Bold", index: 1), "Story idea 2")
        XCTAssertFalse(MediaKind.slideshow.mayBePresentedAsFinished); XCTAssertFalse(MediaKind.proxy.mayBePresentedAsFinished); XCTAssertTrue(MediaKind.slideshow.label.contains("not an animated preview"))
        XCTAssertEqual(MediaKind.of(payload: json(#"{"kind":"preview","status":"done"}"#), call: .final), .proxy)
    }

    // U03 U09 U10 contracts, accessibility words, optional states -----------------------------------------------------------------------------
    func testRevisionRequestRoundTripsAndOldRecordsStillDecode() throws {
        let old = try JSONDecoder().decode(RevisionRequest.self, from: Data(#"{"idempotency_key":"k","stage":"story","target_ids":["b1"],"note":"x","base_revision":2}"#.utf8))
        XCTAssertEqual(old.note, "x"); XCTAssertNil(old.pinned); XCTAssertEqual(old.status, nil)
        let full = RevisionRequest(idempotencyKey: "k2", stage: .storyboard, targetIds: ["s1"], note: "less busy", pinned: RevisionPins(renderRevisionID: "r1"), target: RevisionTarget(shotID: "s1", timeRange: [1, 2]), annotation: RevisionAnnotation(x: 0.1, y: 0.1, w: 0.2, h: 0.2, renderRevisionID: "r1"), intentCategory: "density", status: .requested)
        let back = try JSONDecoder().decode(RevisionRequest.self, from: try JSONEncoder().encode(full))
        XCTAssertEqual(back.pinned?.renderRevisionID, "r1"); XCTAssertEqual(back.annotation?.w, 0.2); XCTAssertEqual(back.target?.timeRange, [1, 2]); XCTAssertEqual(back.status, .requested)
        XCTAssertEqual(full.actionValue()["anchor"]["shot_id"].string, "s1")
    }
    func testEveryStateHasAWordAndASymbolAndSecretsAreRedacted() {
        for l in EditLifecycle.allCases { XCTAssertFalse(l.token.label.isEmpty); XCTAssertFalse(l.token.symbol.isEmpty) }
        for s in [RunActivityState.working, .waitingForYou, .paused, .rateLimited, .stopped, .failed] { XCTAssertFalse(s.token.label.isEmpty); XCTAssertFalse(s.token.symbol.isEmpty) }
        let r = ErrorRedactor.redact("failed at /Users/me/film/scene.html with token abcdef123456 and key sk-abcdefghijklmnop")
        XCTAssertFalse(r.contains("/Users")); XCTAssertFalse(r.contains("abcdef123456")); XCTAssertFalse(r.contains("sk-abcdef"))
        let rejected = EditOutcome(id: "e", ok: false, conflict: true, duplicate: false, needsReselect: true, message: nil)
        XCTAssertTrue(rejected.restoresCommittedState); XCTAssertTrue(rejected.explanation?.contains("saved version") == true)
        XCTAssertEqual(CapabilityListing(id: "x", label: "x", state: "unavailable", explanation: "no", alternative: nil).isReady, false)
    }
}
