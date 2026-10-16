import AppKit
import ImageIO

/// Reuse decoded thumbnails across navigation and gallery cells, with a bounded memory budget.
/// File metadata is part of the key so a newly rendered poster replaces an older thumbnail.
actor PosterThumbnailCache {
    static let shared = PosterThumbnailCache()
    private let images = NSCache<NSString, NSImage>()

    init() {
        images.countLimit = 128
        images.totalCostLimit = 64 * 1024 * 1024
    }

    func image(at url: URL, maxPixels: CGFloat) -> NSImage? {
        guard maxPixels.isFinite, maxPixels > 0,
              let attributes = try? FileManager.default.attributesOfItem(atPath: url.path) else { return nil }
        // URL.resourceValues can retain stale metadata on a reused URL after a render overwrites the file.
        let modified = (attributes[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
        let bytes = (attributes[.size] as? NSNumber)?.int64Value ?? 0
        let fileID = (attributes[.systemFileNumber] as? NSNumber)?.uint64Value ?? 0
        let key = "\(url.absoluteString)|\(maxPixels)|\(modified)|\(bytes)|\(fileID)" as NSString
        if let cached = images.object(forKey: key) { return cached }
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels,
            kCGImageSourceShouldCacheImmediately: true
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        let image = NSImage(cgImage: cg, size: NSSize(width: cg.width, height: cg.height))
        images.setObject(image, forKey: key, cost: cg.bytesPerRow * cg.height)
        return image
    }
}
