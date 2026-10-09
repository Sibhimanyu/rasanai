import XCTest
@testable import StudioCore

final class AutoResumeTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_790_000_000)
    private let quiet = #"{"type":"result","subtype":"success","is_error":false,"permission_denials":[]}"#
    private let denial = #"{"type":"result","permission_denials":[{"tool_name":"Bash","tool_input":{"command":"ffmpeg -version"}}]}"#
    private func midFilm(awaiting: Bool = false) -> DirectorRecovery.Progress {
        .init(pushedAnyStep: true, currentStep: "story", finished: false, awaitingUser: awaiting)
    }
    private func decide(exit: Int32 = 0, log: String? = nil, stop: Bool = false, progress: DirectorRecovery.Progress? = nil, last: Date? = nil) -> AutoResumePolicy.Decision {
        let log = log ?? quiet
        let progress = progress ?? midFilm()
        return AutoResumePolicy.decide(outcome: DirectorRecovery.classify(exitCode: exit, log: log, progress: progress), stopRequested: stop,
                                       progress: progress, log: log, lastAutoResume: last, now: now)
    }

    func testQuietExitZeroMidFilmResumesOnceAfterTenSeconds() {
        XCTAssertEqual(decide(), .resume(after: 10))
        XCTAssertEqual(AutoResumePolicy.delay, 10)
        XCTAssertEqual(decide(progress: .init()), .resume(after: 10), "stopped before showing anything")
    }
    func testBackgroundCeilingAndUnknownCrashResume() {
        XCTAssertEqual(decide(log: "{\"type\":\"result\"}\nBackground tasks still running after 600s; terminating."), .resume(after: 10))
        XCTAssertEqual(decide(exit: 1, log: "Unexpected agent exit 9"), .resume(after: 10))
    }
    func testPressingStopOrPauseNeverResumes() {
        XCTAssertEqual(decide(stop: true), .none)
        XCTAssertEqual(decide(exit: 1, log: "boom", stop: true), .none)
    }
    func testFinishedFilmDoesNotResume() {
        let done = DirectorRecovery.Progress(pushedAnyStep: true, currentStep: "render", finished: true)
        XCTAssertEqual(decide(progress: done), .none)
    }
    func testPermissionFailuresNeverResume() {
        XCTAssertEqual(decide(log: denial), .none)
        XCTAssertEqual(decide(exit: 1, log: denial), .none)
        XCTAssertEqual(decide(exit: 1, log: "EACCES: permission denied opening source.mov"), .none)
    }
    func testSignInAndMissingToolsNeverResume() {
        XCTAssertEqual(decide(exit: 1, log: "Authentication failed"), .none)
        XCTAssertEqual(decide(exit: 1, log: "/bin/sh: ffmpeg: command not found"), .none)
    }
    func testWaitingOnThePersonNeverResumes() {
        XCTAssertEqual(decide(progress: midFilm(awaiting: true)), .none)
    }
    func testSecondStopWithinTenMinutesShowsTheFailureThenResumesAgainLater() {
        XCTAssertEqual(decide(last: now.addingTimeInterval(-120)), .none)
        XCTAssertEqual(decide(last: now.addingTimeInterval(-599)), .none)
        XCTAssertEqual(decide(last: now.addingTimeInterval(-601)), .resume(after: 10))
    }

    // MARK: Plan limit

    private var utc: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "UTC")!; return c }
    func testSessionLimitTextIsRecognisedWithItsResetTime() throws {
        let log = #"{"type":"result","is_error":true,"result":"You've hit your session limit · resets 3pm (UTC)"}"#
        let limit = try XCTUnwrap(SessionLimit.detect(in: log, now: now, calendar: utc))
        XCTAssertEqual(limit.resetText, "3pm (UTC)")
        XCTAssertEqual(limit.message, "Your Claude plan's limit was reached; it resets at 3pm (UTC).")
        let at = try XCTUnwrap(limit.resetsAt)
        XCTAssertGreaterThan(at, now)
        XCTAssertLessThanOrEqual(at.timeIntervalSince(now), 86_400)
        XCTAssertEqual(utc.component(.hour, from: at), 15)
    }
    func testResetTimeFormats() throws {
        XCTAssertEqual(utc.component(.minute, from: try XCTUnwrap(SessionLimit.parseReset("3:30am", now: now, calendar: utc))), 30)
        let dated = try XCTUnwrap(SessionLimit.parseReset("Dec 4, 9am", now: now, calendar: utc))
        XCTAssertEqual(utc.component(.month, from: dated), 12); XCTAssertEqual(utc.component(.day, from: dated), 4); XCTAssertEqual(utc.component(.hour, from: dated), 9)
        let tokyo = try XCTUnwrap(SessionLimit.parseReset("3pm (Asia/Tokyo)", now: now, calendar: utc))
        var jp = Calendar(identifier: .gregorian); jp.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        XCTAssertEqual(jp.component(.hour, from: tokyo), 15)
        XCTAssertNil(SessionLimit.parseReset("soon", now: now, calendar: utc))
        XCTAssertEqual(utc.component(.hour, from: try XCTUnwrap(SessionLimit.parseReset("12am", now: now, calendar: utc))), 0)
    }
    func testOlderEpochFormAndUnrelatedTextAreHandled() throws {
        let epoch = try XCTUnwrap(SessionLimit.detect(in: "Claude AI usage limit reached|1790003600", now: now, calendar: utc))
        XCTAssertEqual(epoch.resetsAt, Date(timeIntervalSince1970: 1_790_003_600))
        XCTAssertNil(SessionLimit.detect(in: "Researching rate limit design and token pricing", now: now))
        XCTAssertNil(SessionLimit.detect(in: "the film shows a session limit banner", now: now), "no reset time and no limit signature")
    }
    func testLimitStopOffersResumeThenAndIsNotAnAutomaticImmediateResume() throws {
        let log = #"{"type":"result","is_error":true,"result":"You've hit your session limit · resets 3pm (UTC)"}"#
        let outcome = try XCTUnwrap(DirectorRecovery.classify(exitCode: 1, log: log, progress: midFilm()))
        XCTAssertEqual(outcome.recovery, .usageLimit)
        XCTAssertTrue(outcome.detail.contains("resets at 3pm"))
        guard case .waitForLimit(let limit) = decide(exit: 1, log: log) else { return XCTFail("expected waitForLimit") }
        XCTAssertEqual(limit.resetText, "3pm (UTC)")
        // Exit 0 with the same text behaves the same, and a recent automatic resume does not block waiting for the reset.
        if case .waitForLimit = decide(exit: 0, log: log, last: now.addingTimeInterval(-30)) {} else { XCTFail("limit ignores the cooldown") }
        // Pressing Stop or waiting on the person still wins.
        XCTAssertEqual(decide(exit: 1, log: log, stop: true), .none)
        XCTAssertEqual(decide(exit: 1, log: log, progress: midFilm(awaiting: true)), .none)
    }

    // MARK: Session state

    func testProgressKnowsWhenItIsThePersonsTurn() throws {
        func session(_ json: String) throws -> DirectorRecovery.Progress { .init(session: try SessionSnapshot(data: Data(json.utf8))) }
        XCTAssertTrue(try session(#"{"current":"story","steps":{"brief":{"status":"done"},"story":{"status":"awaiting"}}}"#).awaitingUser)
        XCTAssertFalse(try session(#"{"current":"story","steps":{"brief":{"status":"done"},"story":{"status":"awaiting","sent":{"type":"choose"}}}}"#).awaitingUser)
        XCTAssertFalse(try session(#"{"current":"story","steps":{"brief":{"status":"done"},"story":{"status":"working"}}}"#).awaitingUser)
        XCTAssertTrue(try session(#"{"current":"look","steps":{"look":{"status":"working"}},"ask":{"id":"a","question":"Which?","options":[{"id":"x","label":"X"}]}}"#).awaitingUser)
    }
    func testSavedPaceIsNilWhenNeverRecorded() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("pace-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        XCTAssertNil(FilmDraft.savedPace(in: dir))
        try Data(#"{"brief":"x","duration":30,"aspect":"16:9","agent":"claude"}"#.utf8).write(to: dir.appendingPathComponent("rasanai-brief.json"))
        XCTAssertNil(FilmDraft.savedPace(in: dir))
        try Data(#"{"brief":"x","duration":30,"aspect":"16:9","agent":"claude","pace":"thorough"}"#.utf8).write(to: dir.appendingPathComponent("rasanai-brief.json"))
        XCTAssertEqual(FilmDraft.savedPace(in: dir), .thorough)
    }
}
