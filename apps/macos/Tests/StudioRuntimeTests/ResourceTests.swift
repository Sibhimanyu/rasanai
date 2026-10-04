import XCTest
import StudioCore
@testable import RasanAIStudio

final class ResourceTests: XCTestCase {
    func testRelocatedAppFindsCLIAndXcodeResourcesWithoutBuildDirectory() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        for layout in ["sample-session.json", "Contents/Resources/sample-session.json"] {
            let app = root.appendingPathComponent(UUID().uuidString + ".app")
            let resources = app.appendingPathComponent("Contents/Resources")
            let file = resources.appendingPathComponent("RasanAIStudio_RasanAIStudio.bundle/" + layout)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data(#"{"title":"Relocated","steps":{}}"#.utf8).write(to: file)
            let found = try StudioResources.sampleURL(resourceDirectory: resources, executableDirectory: app)
            XCTAssertEqual(found, file)
            XCTAssertEqual(try SessionSnapshot(data: Data(contentsOf: found)).title, "Relocated")
            XCTAssertFalse(FileManager.default.fileExists(atPath: app.appendingPathComponent("RasanAIStudio_RasanAIStudio.bundle").path))
        }
    }

    func testCLIResourceLayout() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let file = root.appendingPathComponent("RasanAIStudio_RasanAIStudio.bundle/sample-session.json")
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(#"{"steps":{}}"#.utf8).write(to: file)
        XCTAssertEqual(try StudioResources.sampleURL(resourceDirectory: nil, executableDirectory: root), file)
    }

    func testMissingResourcesThrowInsteadOfTrapping() {
        let absent = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        XCTAssertThrowsError(try StudioResources.sampleURL(resourceDirectory: absent, executableDirectory: absent))
        XCTAssertEqual(SessionSnapshot().currentStep, "brief")
        XCTAssertTrue(SessionSnapshot().scenes(for: .animatic).isEmpty)
    }
}
