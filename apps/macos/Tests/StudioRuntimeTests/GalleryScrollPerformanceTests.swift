import AppKit
import XCTest
@testable import RasanAIStudio

/// Model and image scheduling only. No windows or desktop automation.
final class GalleryScrollPerformanceTests: XCTestCase {
    @MainActor
    private func gallery() -> MomentGallery {
        MomentGallery(autoload: false, hoverDelay: .milliseconds(20), scrollIdle: .milliseconds(30), allowsHoverMotion: { true })
    }

    @MainActor
    func testMomentumDefersPreviewUntilIdleAndHoverDwell() async throws {
        let gallery = gallery()
        gallery.hoverBegan("first")
        try await Task.sleep(for: .milliseconds(40))
        XCTAssertEqual(gallery.playingID, "first")
        gallery.noteScrollActivity()
        XCTAssertNil(gallery.playingID)
        gallery.hoverBegan("next")
        for _ in 0..<4 {
            try await Task.sleep(for: .milliseconds(20))
            gallery.noteScrollActivity()
            XCTAssertNil(gallery.playingID)
        }
        try await Task.sleep(for: .milliseconds(150))
        XCTAssertEqual(gallery.playingID, "next")
        gallery.endInteraction()
    }

    @MainActor
    func testLateExitDoesNotCancelCurrentCard() async throws {
        let gallery = gallery()
        gallery.hoverBegan("old")
        gallery.hoverBegan("current")
        gallery.hoverEnded("old")
        try await Task.sleep(for: .milliseconds(50))
        XCTAssertEqual(gallery.playingID, "current")
        gallery.endInteraction()
    }

    @MainActor
    func testLeavingPageCancelsPendingScrollAndHover() async throws {
        let gallery = gallery()
        gallery.noteScrollActivity()
        gallery.hoverBegan("gone")
        gallery.endInteraction()
        try await Task.sleep(for: .milliseconds(150))
        XCTAssertNil(gallery.playingID)
    }

    private actor Loads {
        var count = 0
        var cancelled = 0
        func image() async -> NSImage? {
            count += 1
            do { try await Task.sleep(for: .milliseconds(80)) }
            catch { cancelled += 1; return nil }
            return NSImage(size: NSSize(width: 2, height: 2))
        }
    }
    private let request = GalleryThumbnailLoader.Request(url: URL(string: "https://example.com/avatar.png")!, maxPixels: 64)

    func testDuplicateThumbnailsShareWorkerAndWarmCache() async throws {
        let loads = Loads()
        let loader = GalleryThumbnailLoader(load: { _ in await loads.image() })
        let request = request
        async let first = loader.image(for: request)
        async let second = loader.image(for: request)
        let images = await (first, second)
        XCTAssertNotNil(images.0); XCTAssertNotNil(images.1)
        let warm = await loader.image(for: request)
        XCTAssertNotNil(warm)
        let count = await loads.count
        XCTAssertEqual(count, 1)
    }

    func testCancellingOneCellKeepsSharedWorkerAlive() async throws {
        let loads = Loads()
        let loader = GalleryThumbnailLoader(load: { _ in await loads.image() })
        let request = request
        let first = Task { await loader.image(for: request) }
        let second = Task { await loader.image(for: request) }
        try await Task.sleep(for: .milliseconds(30))
        first.cancel()
        let discarded = await first.value
        let retained = await second.value
        XCTAssertNil(discarded); XCTAssertNotNil(retained)
        let count = await loads.count, cancelled = await loads.cancelled
        XCTAssertEqual(count, 1); XCTAssertEqual(cancelled, 0)
    }

    func testOffscreenOnlyRequestCancelsAndCanRetry() async throws {
        let loads = Loads()
        let loader = GalleryThumbnailLoader(load: { _ in await loads.image() })
        let request = request
        let first = Task { await loader.image(for: request) }
        try await Task.sleep(for: .milliseconds(30))
        first.cancel()
        let discarded = await first.value
        XCTAssertNil(discarded)
        let retry = await loader.image(for: request)
        XCTAssertNotNil(retry)
        let count = await loads.count, cancelled = await loads.cancelled
        XCTAssertEqual(count, 2); XCTAssertEqual(cancelled, 1)
    }
}
