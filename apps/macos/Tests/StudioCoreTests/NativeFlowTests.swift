import Foundation
import XCTest
@testable import StudioCore

final class NativeFlowTests: XCTestCase {
    func snap(_ json: String) throws -> SessionSnapshot { try SessionSnapshot(data: Data(json.utf8)) }

    // MARK: Router

    func testFreshConsoleAsksWhatTheVideoIsAboutAndUnknownStepsAreWorking() throws {
        // A console nobody has pushed to (CLI start): the person types what the video is about, natively. A Studio start is
        // seeded (steps.brief.status "working"), so it is never fresh and stays on the working view.
        XCTAssertEqual(StageRouter.route(try snap(#"{"current":"brief","steps":{}}"#)), .brief)
        XCTAssertEqual(StageRouter.route(try snap(#"{"current":"brief","steps":{"brief":{"status":"working","fields":{"subject":"x"}}}}"#)), .working)
        XCTAssertEqual(StageRouter.route(try snap(#"{"current":"story","steps":{}}"#)), .working)
    }
    func testDecidedCallShowsWorkingUntilTheNextPush() throws {
        let decided = #"{"current":"look","steps":{"look":{"status":"done","styles":[{"id":"sure"}]}}}"#
        XCTAssertEqual(StageRouter.route(try snap(decided)), .working)
        XCTAssertEqual(StageRouter.route(try snap(decided), viewing: "look"), .look)
        XCTAssertEqual(StageRouter.route(try snap(#"{"current":"render","steps":{"render":{"status":"done","video":"f.mp4"}}}"#)), .final)
    }

    func testBriefRoutes() throws {
        XCTAssertEqual(StageRouter.route(try snap(#"{"current":"brief","steps":{"brief":{"status":"working"}}}"#)), .working)
        XCTAssertEqual(StageRouter.route(try snap(#"{"current":"brief","steps":{"brief":{"status":"awaiting"}}}"#)), .brief)
        XCTAssertEqual(StageRouter.route(try snap(#"{"current":"story","steps":{"brief":{"status":"done"},"story":{"status":"awaiting"}}}"#), viewing: "brief"), .brief)
    }
    func testCallsRoute() throws {
        func route(_ step: String, _ payload: String) throws -> StageRoute {
            StageRouter.route(try snap(#"{"current":"\#(step)","steps":{"\#(step)":\#(payload)}}"#))
        }
        XCTAssertEqual(try route("story", #"{"status":"awaiting"}"#), .story)
        XCTAssertEqual(try route("story", #"{"status":"working"}"#), .working)
        XCTAssertEqual(try route("story", #"{"status":"awaiting","sent":{"type":"choose"}}"#), .working)
        XCTAssertEqual(try route("story", #"{"status":"awaiting","sent":{"type":"note"}}"#), .story)
        XCTAssertEqual(try route("look", #"{"status":"awaiting","styles":[]}"#), .look)
        XCTAssertEqual(try route("look", #"{"status":"awaiting","looks":[]}"#), .panel("look"))
        XCTAssertEqual(try route("films", #"{"status":"awaiting"}"#), .look)
        XCTAssertEqual(try route("direction", #"{"status":"awaiting","films":[]}"#), .look)
        XCTAssertEqual(try route("direction", #"{"status":"awaiting"}"#), .panel("direction"))
        XCTAssertEqual(try route("animatic", #"{"status":"working"}"#), .animatic)
        XCTAssertEqual(try route("build", #"{"status":"working"}"#), .build)
        XCTAssertEqual(try route("render", #"{"status":"awaiting"}"#), .final)
        XCTAssertEqual(try route("final", #"{"status":"done"}"#), .final)
        XCTAssertEqual(try route("music", #"{"status":"awaiting"}"#), .panel("music"))
        XCTAssertEqual(try route("concept", #"{"status":"awaiting"}"#), .panel("concept"))
        XCTAssertEqual(try route("brand", #"{"status":"working"}"#), .working)
    }
    func testOpenAskMakesBusyStepsInteractive() throws {
        let film = try snap(#"{"current":"music","steps":{"music":{"status":"working"}},"ask":{"id":"x","question":"Q?"}}"#)
        XCTAssertEqual(StageRouter.route(film), .panel("music"))
        XCTAssertEqual(film.ask?.id, "x")
        let answered = try snap(#"{"current":"music","steps":{"music":{"status":"working"}},"ask":{"id":"x","question":"Q?","answered":{"choice":"a"}}}"#)
        XCTAssertNil(answered.ask)
        XCTAssertEqual(StageRouter.route(answered), .working)
    }
    func testPinStepAndStageMapping() throws {
        let film = try snap(#"{"current":"animatic","steps":{"brief":{},"concept":{},"films":{},"animatic":{}}}"#)
        XCTAssertEqual(StageRouter.pinStep(for: .story, in: film), "concept")
        XCTAssertEqual(StageRouter.pinStep(for: .look, in: film), "films")
        XCTAssertNil(StageRouter.pinStep(for: .final, in: film))
    }

    // MARK: Decoding helpers

    func testAskOptionsAndDefaults() throws {
        let film = try snap(#"{"current":"animatic","steps":{},"ask":{"id":"ab12","step":"animatic","question":"Which logo?","options":[{"id":"w","label":"Wordmark","detail":"wide"},{"id":2,"label":"Mono"}],"recommended":"w"}}"#)
        let ask = try XCTUnwrap(film.ask)
        XCTAssertEqual(ask.options.map(\.id), ["w", "2"])
        XCTAssertEqual(ask.recommended, "w")
        XCTAssertEqual(ask.step, "animatic")
        XCTAssertFalse(ask.placeholder.isEmpty)
    }
    func testDecisionsCreditTheRightPerson() throws {
        let film = try snap(#"{"steps":{"story":{"status":"done","decision":"Bold","sent":{"type":"choose"}},"music":{"status":"done","decision":"Piano","sent":{"type":"decide"}},"look":{"status":"done","decision":"Ledger","by":"user"},"voice":{"status":"awaiting","decision":"x"}}}"#)
        XCTAssertEqual(film.decisions.map(\.step), ["story", "look", "music"])
        XCTAssertEqual(film.decisions.map(\.byUser), [true, true, false])
    }
    func testThreadActivityAndNotes() throws {
        let film = try snap(#"{"steps":{"story":{"thread":[{"who":"you","text":"Slower","t":"2026-10-06T09:00:00.000Z"},{"who":"claude","text":"Done","t":"2026-10-06T09:01:00.000Z"}]}},"working":{"msg":"x"},"activity":[{"t":"2026-10-06T09:00:00.000Z","msg":"sys","level":"sys"},{"t":"2026-10-06T09:00:01.000Z","msg":"first"},{"t":"2026-10-06T09:00:02.500Z","msg":"second","level":"ok"}],"comments":[{"id":"n","step":"animatic","t":3,"x":0.5,"y":0.25,"quick":"Slower","text":"hold","state":"open"},{"id":"m","step":"animatic","state":"resolved"}]}"#)
        XCTAssertEqual(film.thread(for: "story").map(\.fromUser), [true, false])
        XCTAssertFalse(film.isReplyPending(for: "story"))
        XCTAssertEqual(film.activityFeed.map(\.message), ["second", "first"])
        XCTAssertNotNil(film.activityFeed.first?.date)
        XCTAssertEqual(film.openNotes(step: "animatic").count, 1)
        XCTAssertEqual(film.openNotes().first?.x, 0.5)
        XCTAssertEqual(film.openNotes().first?.quick, "Slower")
    }
    func testFreshnessIgnoresSystemActivity() throws {
        XCTAssertTrue(try snap(#"{"steps":{},"activity":[{"msg":"boot","level":"sys"}]}"#).isFresh)
        XCTAssertFalse(try snap(#"{"steps":{},"activity":[{"msg":"hi","level":"info"}]}"#).isFresh)
        XCTAssertFalse(try snap(#"{"steps":{"brief":{"status":"working"}}}"#).isFresh)
    }

    // MARK: SSE

    func testSSEParserEmitsOnDataLine() {
        var parser = SSEParser()
        XCTAssertNil(parser.feed(line: "event: state"))
        XCTAssertEqual(parser.feed(line: #"data: {"a":1}"#), SSEEvent(name: "state", data: #"{"a":1}"#))
        XCTAssertNil(parser.feed(line: ""))
        XCTAssertNil(parser.feed(line: "event: ping"))
        XCTAssertEqual(parser.feed(line: "data: 1"), SSEEvent(name: "ping", data: "1"))
        XCTAssertNil(parser.feed(line: ": comment"))
    }

    // MARK: Brief seeding

    func testBriefSeedFieldsStatusAndActivity() throws {
        let draft = FilmDraft(brief: "  A launch film for Tally.  ", duration: 30, aspect: "9:16", brand: "Northwind")
        let seeded = try XCTUnwrap(BriefSeed.seeded(nil, title: "Tally", draft: draft, now: Date(timeIntervalSince1970: 0)))
        XCTAssertEqual(seeded["current"].string, "brief")
        let brief = seeded["steps"]["brief"]
        XCTAssertEqual(brief["status"].string, "working")
        XCTAssertEqual(brief["fields"]["subject"].string, "A launch film for Tally.")
        XCTAssertEqual(brief["fields"]["length_s"].number, 30)
        XCTAssertEqual(brief["fields"]["aspect"].string, "9:16")
        XCTAssertEqual(brief["fields"]["brand_name"].string, "Northwind")
        XCTAssertEqual(brief["fields"]["use_brand"].bool, true)
        XCTAssertEqual(seeded["activity"].array.count, 1)
        XCTAssertEqual(seeded["activity"].array[0]["msg"].string, BriefSeed.activityMessage)
        XCTAssertNotEqual(seeded["activity"].array[0]["level"].string, "sys")
        // The seeded session is exactly what the native router and the web console treat as "not fresh".
        let snapshot = try SessionSnapshot(data: JSONEncoder().encode(seeded))
        XCTAssertFalse(snapshot.isFresh)
        XCTAssertEqual(StageRouter.route(snapshot), .working)
        XCTAssertNil(brief["needs_source"].bool)
    }
    func testSeedLeavesRunsUnderWayAndEmptyBriefsAlone() throws {
        let draft = FilmDraft(brief: "Film")
        let underway = JSONValue.object(["steps": .object(["story": .object(["status": .string("awaiting")])])])
        XCTAssertNil(BriefSeed.seeded(underway, title: "t", draft: draft))
        XCTAssertNil(BriefSeed.seeded(nil, title: "t", draft: FilmDraft(brief: "  ")))
    }
    func testSeedFileCreatesResumesAndNeverClobbers() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("seed-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let file = dir.appendingPathComponent("session.json")
        XCTAssertTrue(try BriefSeed.seedFile(at: file, title: "T", draft: FilmDraft(brief: "A film")))
        let first = try Data(contentsOf: file)
        XCTAssertFalse(try BriefSeed.seedFile(at: file, title: "T", draft: FilmDraft(brief: "A film")), "second run must not reseed")
        XCTAssertEqual(try Data(contentsOf: file), first)
        // A resumed run whose session was only the empty start gets seeded.
        let empty = dir.appendingPathComponent("empty.json")
        try Data(#"{"title":"T","current":"brief","steps":{}}"#.utf8).write(to: empty)
        XCTAssertTrue(try BriefSeed.seedFile(at: empty, title: "T", draft: FilmDraft(brief: "A film")))
        // Unreadable sessions are left alone.
        let broken = dir.appendingPathComponent("broken.json")
        try Data("not json".utf8).write(to: broken)
        XCTAssertFalse(try BriefSeed.seedFile(at: broken, title: "T", draft: FilmDraft(brief: "A film")))
        XCTAssertEqual(try String(contentsOf: broken, encoding: .utf8), "not json")
        // No draft: a blank session, as before.
        let blank = dir.appendingPathComponent("blank.json")
        XCTAssertFalse(try BriefSeed.seedFile(at: blank, title: "T", draft: nil))
        XCTAssertEqual(try SessionSnapshot(data: Data(contentsOf: blank)).currentStep, "brief")
    }
    func testLaunchPromptCarriesTheHandoff() throws {
        let launch = try DirectorLaunch(agent: .claude, executable: URL(fileURLWithPath: "/usr/bin/true"), engine: URL(fileURLWithPath: "/e"),
                                        project: URL(fileURLWithPath: "/p"), run: URL(fileURLWithPath: "/p/.rasanai/r"), request: "Make a film")
        XCTAssertTrue(launch.prompt.contains("BRIEF HANDOFF"))
        XCTAssertTrue(launch.prompt.contains("never push needs_source"))
    }
}
