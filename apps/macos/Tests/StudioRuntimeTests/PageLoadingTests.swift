import Foundation
import StudioCore
import XCTest
@testable import RasanAIStudio

/// Scheduling and resource loading only: no windows, snapshots or UI automation.
final class PageLoadingTests: XCTestCase {
    private actor Requests {
        private var count = 0
        func next() -> Int { count += 1; return count }
    }
    @MainActor
    func testDestinationStartsWithShellThenBecomesReady() async {
        let activation = PageActivation()
        XCTAssertFalse(activation.isReady)
        await activation.activate()
        XCTAssertTrue(activation.isReady)
    }

    @MainActor
    func testCancelledNavigationDoesNotMountObsoletePage() async {
        let old = PageActivation()
        let task = Task { await old.activate() }
        task.cancel()
        await task.value
        XCTAssertFalse(old.isReady)
        let current = PageActivation()
        await current.activate()
        XCTAssertTrue(current.isReady)
    }

    @MainActor
    func testCachedGalleryReadRunsOffMainThreadAndSurvivesNetworkFailure() async {
        let moments = MomentCatalog.parse(Data(#"[{"id":"cached","name":"Saved move","clip":"https://example.com/clip.mp4","still":"https://example.com/still.jpg"}]"#.utf8))
        XCTAssertEqual(moments.count, 1)
        let gallery = MomentGallery(loader: { throw URLError(.notConnectedToInternet) }, cachedLoader: {
            XCTAssertFalse(Thread.isMainThread)
            return moments
        })
        await gallery.loadIfNeeded()
        XCTAssertEqual(gallery.state, .ready)
        XCTAssertEqual(gallery.moments.map(\.id), ["cached"])
        XCTAssertTrue(gallery.showingSavedCopy)
        XCTAssertFalse(gallery.isRefreshing)
    }

    @MainActor
    func testCancelledGalleryFetchCanBeRetried() async {
        let requests = Requests()
        let gallery = MomentGallery(loader: {
            if await requests.next() == 1 { try await Task.sleep(for: .seconds(30)) }
            throw URLError(.notConnectedToInternet)
        }, cachedLoader: { [] })
        let fetch = Task { await gallery.reload() }
        // Yield until the request is in flight, then simulate navigating away.
        while !gallery.isRefreshing { await Task.yield() }
        fetch.cancel()
        await fetch.value
        XCTAssertEqual(gallery.state, .idle)
        XCTAssertFalse(gallery.isRefreshing)
        await gallery.reload()
        XCTAssertEqual(gallery.state, .failed, "The next attempt runs instead of remaining stuck in loading")
        XCTAssertFalse(gallery.isRefreshing)
    }
}
