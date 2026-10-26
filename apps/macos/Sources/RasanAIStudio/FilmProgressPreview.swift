import AppKit
import StudioCore
import SwiftUI

/// The newest thing that actually exists on disk for this film: the final, a render poster, the newest draft video, key
/// frame or still. Nothing is invented; when there is none the pane says so plainly.
enum ProgressPreviewItem: Equatable {
    case video(url: URL, title: String, poster: URL?)
    case image(url: URL, title: String)

    static func latest(in s: FilmProgressSnapshot) -> ProgressPreviewItem? {
        let r = s.render
        if r.state == .done, let video = r.videoURL { return .video(url: video, title: r.outputName ?? (r.kind == .final ? "Final film" : "Latest draft"), poster: r.posterURL) }
        if r.kind != .none, r.state != .notStarted, let poster = r.posterURL { return .image(url: poster, title: "Render preview") }
        let frame = s.keyframes.max { $0.addedAt < $1.addedAt }
        let draft = s.drafts.max { $0.finishedAt < $1.finishedAt }
        // A completed draft is the most useful preview once the film is being built or checked.
        if let draft, s.currentPhase >= .build || frame.map({ draft.finishedAt >= $0.addedAt }) ?? true {
            return .video(url: draft.url, title: draft.name, poster: nil)
        }
        if let still = s.newestStill { return .image(url: still, title: "Latest built frame") }
        if let frame { return .image(url: frame.url, title: frame.label) }
        if let scene = s.scenes.last(where: { $0.thumbnailURL != nil }), let url = scene.thumbnailURL { return .image(url: url, title: scene.title) }
        return nil
    }
}

/// The working screen's one picture: the newest real preview, or a calm sentence while there is none.
struct ProgressPreviewPane: View {
    let snapshot: FilmProgressSnapshot
    let aspect: Double
    /// The tallest the picture may stand, so the working screen fits its window (aspect-fit).
    var maxMediaHeight: CGFloat = 300

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            StageSectionTitle("Latest preview")
            if let item = ProgressPreviewItem.latest(in: snapshot) {
                switch item {
                case .video(let url, let title, let poster):
                    GeometryReader { proxy in
                        let width = min(460, max(1, proxy.size.width), maxMediaHeight * max(aspect, 0.1))
                        VideoTile(url: url, title: title, subtitle: nil, aspect: aspect, width: width, poster: poster)
                            .id(url)   // a new file gets a new player, never the old draft under the new title
                            .frame(maxWidth: .infinity)
                    }
                    .frame(height: min(maxMediaHeight, 460 / max(aspect, 0.1)) + 30)
                case .image(let url, let title):
                    VStack(alignment: .leading, spacing: 6) {
                        Button { NSWorkspace.shared.open(url) } label: {
                            ZStack { Color(nsColor: .underPageBackgroundColor); PosterImage(url: url, maxPixels: 900) }
                                .aspectRatio(aspect, contentMode: .fit)
                                .frame(maxWidth: 520, maxHeight: maxMediaHeight)
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                        }
                        .buttonStyle(.plain).help("Open \(title) full size").accessibilityLabel("\(title). Opens the image")
                        Text(title).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
            } else {
                HStack(spacing: 12) {
                    Image(systemName: "photo.on.rectangle").font(.system(size: 20, weight: .light)).foregroundStyle(.tertiary)
                    Text("Nothing to show yet. The first picture appears here as soon as one is made.")
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 14).padding(.vertical, 10).frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(nsColor: .quaternaryLabelColor).opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        }
    }
}

/// Render progress on the focused screen: only what the render tool reports. A bar appears only when a fraction is measured.
struct ProgressRenderStrip: View {
    let render: RenderProgress
    let now: Date

    var body: some View {
        if render.kind != .none, render.state != .notStarted, render.state != .done {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(title).font(.system(size: 13, weight: .semibold)).monospacedDigit()
                    Spacer()
                    if let eta = render.etaSeconds, render.state == .rendering {
                        Text("\(FilmProgressFormat.about(eta)) left").font(.system(size: 12)).foregroundStyle(Color.rasan)
                    }
                    Text(FilmProgressFormat.duration(render.elapsed(now: now)) + " elapsed").font(.system(size: 12)).foregroundStyle(.secondary).monospacedDigit()
                }
                if let fraction = render.fraction { ThinBar(fraction: fraction) } else { ProgressView().progressViewStyle(.linear) }
                if let stage = render.stage, !stage.isEmpty {
                    Text(stage).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            .stageCard(padding: 14)
            .accessibilityElement(children: .combine)
        }
    }

    private var title: String {
        let kind = render.kind == .final ? "final" : "draft"
        switch render.state {
        case .preparing: return "Getting the \(kind) ready"
        case .finishing: return "Assembling the video"
        default:
            if let done = render.framesDone, let total = render.framesTotal { return "\(done.formatted()) of \(total.formatted()) frames" }
            return "Rendering the \(kind)"
        }
    }
}

extension FilmProgressSnapshot {
    /// The next of the person's calls still ahead (this phase's own, if it ends in one), in plain words.
    var nextCheckpoint: String? {
        let ahead = ProgressPhase.allCases.filter { $0.index >= currentPhase.index }
        for phase in ahead {
            let state = summary(phase).state
            if state == .done || state == .skipped { continue }
            if let call = phase.yourCall { return "Next review: \(call)" }
        }
        return nil
    }
}
