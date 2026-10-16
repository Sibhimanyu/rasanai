import XCTest
@testable import RasanAIStudio

final class HomeMeshClockTests: XCTestCase {
    @MainActor
    func testClockAdvancesWithoutAnActiveSceneAndStopsWhenCancelled() async throws {
        let clock = HomeMeshClock()
        let running = Task { await clock.run() }
        defer { running.cancel() }
        try await Task.sleep(for: .milliseconds(180))
        running.cancel()
        await running.value
        XCTAssertGreaterThan(clock.elapsed, 0.05)
        let stopped = clock.elapsed
        try await Task.sleep(for: .milliseconds(70))
        XCTAssertEqual(clock.elapsed, stopped)
        // Restart preserves the current phase rather than snapping the mesh to a different pattern.
        let resumed = Task { await clock.run() }
        try await Task.sleep(for: .milliseconds(120))
        resumed.cancel()
        await resumed.value
        XCTAssertGreaterThan(clock.elapsed, stopped + 0.04)
    }

    @MainActor
    func testTwoSecondsOfClockTimeMovesTheMeshWhileKeepingItsBorderFixed() {
        let first = HomeMeshField.points(at: 0)
        let later = HomeMeshField.points(at: 2.0 / 5)
        XCTAssertGreaterThan(abs(later[5].x - first[5].x), 0.02)
        for index in [0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15] {
            XCTAssertEqual(first[index], later[index])
        }
    }
}
