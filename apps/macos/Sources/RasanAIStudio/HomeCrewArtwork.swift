import AppKit

/// Load the loose SwiftPM resource explicitly; Home doesn't depend on SwiftUI's named-asset lookup.
@MainActor
enum HomeCrewArtwork {
    static let image: NSImage = {
        guard let url = Bundle.module.url(forResource: "crew-prompt-v3", withExtension: "png"),
              let source = NSImage(contentsOf: url),
              let pixels = source.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            preconditionFailure("The Home crew artwork must be bundled and decodable")
        }
        return NSImage(cgImage: pixels, size: source.size)
    }()
}
