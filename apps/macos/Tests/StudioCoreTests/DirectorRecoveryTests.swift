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
}
