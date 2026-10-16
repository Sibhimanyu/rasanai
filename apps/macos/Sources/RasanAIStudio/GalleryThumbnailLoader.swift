import AppKit
import StudioCore

/// One fetch/decode per thumbnail, shared by visible cells and bounded in memory.
/// Cancelling an offscreen cell only cancels the worker when no other cell needs it.
actor GalleryThumbnailLoader {
    struct Request: Hashable, Sendable {
        let url: URL
        let maxPixels: CGFloat
        var key: NSString { "\(url.absoluteString)|\(maxPixels)" as NSString }
    }
    private struct Pending {
        let generation: UUID
        let worker: Task<NSImage?, Never>
        var waiters: Set<UUID>
    }
    static let shared = GalleryThumbnailLoader()
    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.httpMaximumConnectionsPerHost = 4
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 30
        return URLSession(configuration: configuration)
    }()
    private let images = NSCache<NSString, NSImage>()
    private var pending: [Request: Pending] = [:]
    private let load: @Sendable (Request) async -> NSImage?

    init(load: @escaping @Sendable (Request) async -> NSImage? = { request in
        guard !Task.isCancelled,
              let file = await MomentImageCache.localURL(for: request.url, session: GalleryThumbnailLoader.session),
              !Task.isCancelled else { return nil }
        return await PosterThumbnailCache.shared.image(at: file, maxPixels: request.maxPixels)
    }) {
        self.load = load
        images.countLimit = 128
        images.totalCostLimit = 48 * 1024 * 1024
    }

    func image(for request: Request) async -> NSImage? {
        guard !Task.isCancelled, request.maxPixels.isFinite, request.maxPixels > 0 else { return nil }
        // Local files can be overwritten by a render: let PosterThumbnailCache revalidate their metadata.
        if !request.url.isFileURL, let image = images.object(forKey: request.key) { return image }
        let waiter = UUID()
        var entry: Pending
        if let existing = pending[request] {
            entry = existing
            entry.waiters.insert(waiter)
        } else {
            let load = load
            entry = Pending(generation: UUID(), worker: Task.detached(priority: .userInitiated) {
                await load(request)
            }, waiters: [waiter])
        }
        pending[request] = entry
        let worker = entry.worker, generation = entry.generation
        let result = await withTaskCancellationHandler {
            await worker.value
        } onCancel: {
            Task { await self.cancel(request, generation: generation, waiter: waiter) }
        }
        if pending[request]?.generation == generation {
            pending[request] = nil
            if let result, !worker.isCancelled, !request.url.isFileURL {
                let side = min(request.maxPixels, max(result.size.width, result.size.height))
                images.setObject(result, forKey: request.key, cost: Int(side * side * 4))
            }
        }
        return Task.isCancelled ? nil : result
    }

    private func cancel(_ request: Request, generation: UUID, waiter: UUID) {
        guard var entry = pending[request], entry.generation == generation else { return }
        entry.waiters.remove(waiter)
        if entry.waiters.isEmpty {
            entry.worker.cancel()
            pending[request] = nil
        } else {
            pending[request] = entry
        }
    }
}
