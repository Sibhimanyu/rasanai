import AppKit
import ImageIO
import UniformTypeIdentifiers
import XCTest
@testable import RasanAIStudio

/// Image decoding only: these tests never create windows or launch the app.
final class PosterThumbnailCacheTests: XCTestCase {
    private func writePoster(_ url: URL, width: Int = 1600, height: Int = 900) throws {
        let context = try XCTUnwrap(CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                                            bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.setFillColor(CGColor(red: 0.3, green: 0.4, blue: 0.7, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let image = try XCTUnwrap(context.makeImage())
        let destination = try XCTUnwrap(CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(destination, image, nil)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
    }

    func testRepeatedRequestsReuseDecodedImageAndRespectResolution() async throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".png")
        defer { try? FileManager.default.removeItem(at: url) }
        try writePoster(url)
        let cache = PosterThumbnailCache()
        let firstResult = await cache.image(at: url, maxPixels: 320)
        let first = try XCTUnwrap(firstResult)
        let again = await cache.image(at: url, maxPixels: 320)
        let largerResult = await cache.image(at: url, maxPixels: 640)
        let larger = try XCTUnwrap(largerResult)
        XCTAssertTrue(first === again)
        XCTAssertEqual(first.size.width, 320)
        XCTAssertEqual(larger.size.width, 640)
        XCTAssertFalse(first === larger)
    }

    func testRewrittenAndRemovedPostersDoNotReturnStaleImages() async throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".png")
        defer { try? FileManager.default.removeItem(at: url) }
        try writePoster(url)
        let cache = PosterThumbnailCache()
        let original = await cache.image(at: url, maxPixels: 320)
        try writePoster(url, width: 900, height: 1600)
        try FileManager.default.setAttributes([.modificationDate: Date().addingTimeInterval(2)], ofItemAtPath: url.path)
        let replacementResult = await cache.image(at: url, maxPixels: 320)
        let replacement = try XCTUnwrap(replacementResult)
        XCTAssertFalse(original === replacement)
        XCTAssertEqual(replacement.size.height, 320)
        XCTAssertLessThan(replacement.size.width, 320)
        try FileManager.default.removeItem(at: url)
        let missing = await cache.image(at: url, maxPixels: 320)
        XCTAssertNil(missing)
    }

    func testRepeatedDecodeTiming() async throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".png")
        defer { try? FileManager.default.removeItem(at: url) }
        try writePoster(url)
        let rounds = 30
        let start = Date()
        for _ in 0..<rounds { _ = await PosterThumbnailCache().image(at: url, maxPixels: 640) }
        let uncached = Date().timeIntervalSince(start)
        let cache = PosterThumbnailCache()
        _ = await cache.image(at: url, maxPixels: 640)
        let cachedStart = Date()
        for _ in 0..<rounds { _ = await cache.image(at: url, maxPixels: 640) }
        let cached = Date().timeIntervalSince(cachedStart)
        print("POSTER_BENCHMARK rounds=\(rounds) decode_ms=\(uncached * 1000) cached_ms=\(cached * 1000)")
    }
}
