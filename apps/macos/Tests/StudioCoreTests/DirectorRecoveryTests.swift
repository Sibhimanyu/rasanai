import XCTest
@testable import StudioCore

final class DirectorRecoveryTests: XCTestCase {
    func testKnownFailuresOfferSpecificRecovery() {
        let cases: [(String, DirectorRecovery)] = [
            ("ERROR: Authentication failed. Please log in.", .signIn),
            ("{\"error\":\"insufficient_quota\"}", .usageLimit),
            ("EACCES: permission denied opening source.mov", .permissions),
            ("/bin/sh: ffmpeg: command not found", .missingTools),
            ("Unexpected agent exit 9", .unknown),
            ("Researching account permissions and token pricing", .unknown)
        ]
        for (log, expected) in cases { XCTAssertEqual(DirectorRecovery.classify(log: log), expected, log) }
    }

    private let denialLog = #"{"type":"result","subtype":"success","is_error":false,"permission_denials":[{"tool_name":"Read","tool_use_id":"t","tool_input":{"file_path":"/engine/SKILL.md"}},{"tool_name":"Bash","tool_use_id":"u","tool_input":{"command":"ffmpeg -version"}}]}"#
    private func session(step: String, status: String, others: [String: String] = [:]) throws -> SessionSnapshot {
        var steps = others.mapValues { "{\"status\":\"\($0)\"}" }
        steps[step] = "{\"status\":\"\(status)\"}"
        let body = steps.map { "\"\($0.key)\":\($0.value)" }.joined(separator: ",")
        return try SessionSnapshot(data: Data("{\"current\":\"\(step)\",\"steps\":{\(body)}}".utf8))
    }
    func testQuietExitZeroWithPermissionDenialsIsAPermissionFailure() throws {
        let progress = DirectorRecovery.Progress(session: try session(step: "brief", status: "working"))
        XCTAssertFalse(progress.pushedAnyStep)
        let outcome = try XCTUnwrap(DirectorRecovery.classify(exitCode: 0, log: denialLog, progress: progress))
        XCTAssertEqual(outcome.recovery, .toolPermissions)
        XCTAssertEqual(outcome.recovery.title, "RasanAI needs permission to run its tools")
        XCTAssertTrue(outcome.detail.contains("ffmpeg -version"))
        XCTAssertTrue(outcome.detail.contains("/engine/SKILL.md"))
    }
    func testQuietExitZeroWithoutDenialsIsStoppedEarly() throws {
        let log = #"{"type":"result","subtype":"success","is_error":false,"permission_denials":[]}"#
        let none = try XCTUnwrap(DirectorRecovery.classify(exitCode: 0, log: log, progress: .init(session: try session(step: "brief", status: "working"))))
        XCTAssertEqual(none.recovery, .stoppedEarly)
        XCTAssertTrue(none.detail.contains("before it showed you anything"))
        XCTAssertTrue(none.recovery.title.hasPrefix("The director stopped before"))
        let mid = try XCTUnwrap(DirectorRecovery.classify(exitCode: 0, log: log, progress: .init(session: try session(step: "story", status: "awaiting", others: ["brief": "done"]))))
        XCTAssertEqual(mid.recovery, .stoppedEarly)
        XCTAssertTrue(mid.detail.contains("story step"))
    }
    func testRealFinishIsNotAFailureAndNonZeroExitsKeepTheirSignature() throws {
        let done = DirectorRecovery.Progress(session: try session(step: "render", status: "done", others: ["brief": "done"]))
        XCTAssertTrue(done.finished)
        XCTAssertNil(DirectorRecovery.classify(exitCode: 0, log: "", progress: done))
        XCTAssertEqual(DirectorRecovery.classify(exitCode: 1, log: "Authentication failed", progress: .init())?.recovery, .signIn)
        XCTAssertEqual(DirectorRecovery.classify(exitCode: 1, log: "boom", progress: .init())?.recovery, .unknown)
        XCTAssertEqual(DirectorRecovery.classify(exitCode: 1, log: denialLog, progress: .init())?.recovery, .toolPermissions)
    }
    func testHealthShowsAnEarlyExitAsFailedWithTheReason() {
        var telemetry = DirectorTelemetry()
        telemetry.ingest(line: #"{"type":"result","subtype":"success","is_error":false,"session_id":"s"}"#)
        let health = DirectorHealth.evaluate(telemetry, context: HealthContext(processRunning: false, exitCode: 0, endedEarlyReason: "RasanAI needs permission to run its tools"))
        XCTAssertEqual(health.state, .failed)
        XCTAssertTrue(health.detail.contains("needs permission"))
    }
    func testBackgroundCeilingExitIsRecognisedAndLaunchEnvironmentRemovesIt() throws {
        let log = "{\"type\":\"result\"}\nBackground tasks still running after 600s; terminating. Set CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 to wait indefinitely.\n"
        XCTAssertTrue(DirectorRecovery.hitBackgroundCeiling(log: log))
        let outcome = try XCTUnwrap(DirectorRecovery.classify(exitCode: 0, log: log, progress: .init(pushedAnyStep: true, currentStep: "look")))
        XCTAssertEqual(outcome.recovery, .stoppedEarly)
        XCTAssertTrue(outcome.detail.contains("helpers were still running"))
        XCTAssertEqual(DirectorLaunch.environmentOverrides["CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS"], "0")
    }
}
