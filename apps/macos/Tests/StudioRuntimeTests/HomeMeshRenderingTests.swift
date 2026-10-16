import AppKit
import SwiftUI
import XCTest
@testable import RasanAIStudio

/// ImageRenderer draws into memory. No app windows, screen capture or desktop interaction.
final class HomeMeshRenderingTests: XCTestCase {
    @MainActor
    private func pixels(at phase: Double) throws -> [UInt8] {
        let renderer = ImageRenderer(content:
            ZStack {
                Color(red: 24.0 / 255, green: 26.0 / 255, blue: 30.0 / 255)
                HomeMeshField(phase: phase)
                Rectangle().fill(Color(red: 24.0 / 255, green: 26.0 / 255, blue: 30.0 / 255))
                    .frame(width: 180, height: 100)
            }.frame(width: 320, height: 200)
        )
        renderer.scale = 1
        let image = try XCTUnwrap(renderer.cgImage)
        var bytes = [UInt8](repeating: 0, count: 320 * 200 * 4)
        try bytes.withUnsafeMutableBytes { buffer in
            let context = try XCTUnwrap(CGContext(data: buffer.baseAddress, width: 320, height: 200, bitsPerComponent: 8,
                                                bytesPerRow: 320 * 4, space: CGColorSpaceCreateDeviceRGB(),
                                                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
            context.draw(image, in: CGRect(x: 0, y: 0, width: 320, height: 200))
        }
        return bytes
    }

    @MainActor
    func testColorMotionIsVisibleOutsideTheOpaquePrompt() throws {
        let windows = NSApplication.shared.windows.count
        let first = try pixels(at: 0)
        let later = try pixels(at: 2.0 / 5)
        var total = 0, samples = 0, changed = 0
        for y in 30..<170 {
            for x in 0..<320 where x < 70 || x >= 250 {
                let offset = (y * 320 + x) * 4
                let delta = (0..<3).reduce(0) { $0 + abs(Int(first[offset + $1]) - Int(later[offset + $1])) }
                total += delta; samples += 1
                if delta >= 6 { changed += 1 }
            }
        }
        let mean = Double(total) / Double(samples * 3)
        let fraction = Double(changed) / Double(samples)
        print("MESH visible RGB change after 2 seconds: \(mean); moving area: \(fraction)")
        XCTAssertGreaterThan(mean, 0.8, "Motion must affect exposed background pixels, not just control points hidden by the prompt")
        XCTAssertGreaterThan(fraction, 0.1)
        XCTAssertEqual(NSApplication.shared.windows.count, windows)
    }
}
