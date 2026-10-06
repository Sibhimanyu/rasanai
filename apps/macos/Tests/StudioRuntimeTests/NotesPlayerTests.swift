import XCTest
import StudioCore
@testable import RasanAIStudio

final class NotesPlayerTests: XCTestCase {
    private let starts = [0.0, 6, 14, 22]

    func testSceneAtTime() {
        XCTAssertNil(FilmTiming.sceneIndex(at: 3, starts: []))
        XCTAssertEqual(FilmTiming.sceneIndex(at: 0, starts: starts), 0)
        XCTAssertEqual(FilmTiming.sceneIndex(at: 5.99, starts: starts), 0)
        XCTAssertEqual(FilmTiming.sceneIndex(at: 6, starts: starts), 1)
        XCTAssertEqual(FilmTiming.sceneIndex(at: 21.9, starts: starts), 2)
        XCTAssertEqual(FilmTiming.sceneIndex(at: 400, starts: starts), 3)
        XCTAssertEqual(FilmTiming.sceneIndex(at: -2, starts: starts), 0)
    }

    func testScenesFromSnapshotAndNavigation() throws {
        let json = #"{"title":"t","current":"animatic","comments":[{"id":"n","step":"animatic","scene":1,"t":20,"text":"x","state":"open"}],"steps":{"animatic":{"status":"awaiting","scenes":[{"id":1,"duration":6},{"id":2,"duration":8},{"id":3,"duration":8}]}}}"#
        let snapshot = try SessionSnapshot(data: Data(json.utf8))
        let scenes = snapshot.scenes(for: .animatic)
        XCTAssertEqual(scenes.map(\.start), [0, 6, 14])
        XCTAssertEqual(FilmTiming.sceneIndex(at: 13.9, in: scenes), 1)
        XCTAssertEqual(FilmTiming.jump(from: 7, forward: true, in: scenes), 14)
        XCTAssertEqual(FilmTiming.jump(from: 14.5, forward: false, in: scenes), 6)
        XCTAssertEqual(FilmTiming.jump(from: 15.5, forward: false, in: scenes), 14)
        XCTAssertEqual(FilmTiming.jump(from: 6.4, forward: false, in: scenes), 0)
        XCTAssertEqual(FilmTiming.jump(from: 20, forward: true, in: scenes), 14)
        XCTAssertEqual(FilmTiming.progress(at: 10, in: scenes[1]), 0.5, accuracy: 0.001)
        let note = try XCTUnwrap(snapshot.notes.first)
        XCTAssertEqual(FilmTiming.sceneIndex(of: note, in: scenes), 0)
        XCTAssertEqual(reviewTime(75.4), "1:15")
        XCTAssertEqual(reviewTime(75.4, tenths: true), "1:15.4")
        XCTAssertEqual(FilmTiming.clamp(99, 45), 45)
    }
}
