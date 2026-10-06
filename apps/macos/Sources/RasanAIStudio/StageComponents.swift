import AppKit
import AVFoundation
import Observation
import StudioCore
import SwiftUI

// MARK: - Component catalog (phase 2 building blocks)
//
// Every stage view is `init(model: FilmSessionModel, step: String)` and reads its payload with `model.payload(step)`.
// The model is also in the environment (`.environment(model)`), which is how `PayloadImage` and `AudioPreviewButton`
// find files. Use these instead of rebuilding the same chrome:
//
//   StageScaffold(model:step:question:context:recommended:maxWidth:content:actions:)
//       The whole page: a scroll view with the StageHeader, your content, the "Decided:" line for finished steps,
//       the step's conversation thread, and your actions pinned at the bottom in a material bar.
//   StageHeader(question:context:recommended:)
//       The large question, a context line, and a "Claude recommends X" badge when `recommended` is set.
//   CallActions(model:step:primaryTitle:primarySymbol:primaryEnabled:onPrimary:)
//       Bottom bar: note field, "You decide this step" (`decide`), and the primary button. `onPrimary(note)` should
//       call `model.send(...)`; the bar disables itself when the person can't act (read-only, sending, already sent)
//       and shows "Sent to Claude" while the director picks it up. Pass `primaryTitle: nil` for decide-only.
//   RecommendedBadge(text:)            Claude's pick, as a small capsule. Put it on the recommended option.
//   PayloadImage(path:contentMode:maxPixels:)   A local file named in the payload (workspace-relative or absolute).
//   AudioPreviewButton(id:path:title:) A play/pause round button; one preview plays at a time.
//   OpenInBrowserButton(path:title:)   For HTML-only boards: opens the file in the default browser (never embedded).
//   DecidedLine(decision:by:)          Green "Decided:" line.
//   StageCard / .stageCard(selected:)  The card surface for options (selected = accent outline).
//   StageSectionTitle(_:)              Small caps section label.
//   StepThreadView(model:step:)        The conversation on a step (StageScaffold already includes it).
//   ClockLabel(seconds:)               "0:12" in monospaced digits.
//   JSONValue helpers (StudioCore): .string, .number, .bool, .strings, .array, .object, .identifier, ["key"].

// MARK: Page

struct StageScaffold<Content: View, Actions: View>: View {
    let model: FilmSessionModel
    let step: String
    let question: String
    var context: String?
    var recommended: String?
    var maxWidth: CGFloat = 900
    @ViewBuilder var content: Content
    @ViewBuilder var actions: Actions

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                StageHeader(question: question, context: context, recommended: recommended)
                content
                if let decision = model.payload(step)["decision"].string, model.status(step) == "done" {
                    DecidedLine(decision: decision, by: model.snapshot.decisions.first { $0.step == step }?.byUser)
                }
                StepThreadView(model: model, step: step)
            }
            .padding(.horizontal, 32).padding(.top, 28).padding(.bottom, 32)
            .frame(maxWidth: maxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            actions
        }
    }
}

extension StageScaffold where Actions == EmptyView {
    init(model: FilmSessionModel, step: String, question: String, context: String? = nil, recommended: String? = nil,
         maxWidth: CGFloat = 900, @ViewBuilder content: () -> Content) {
        self.init(model: model, step: step, question: question, context: context, recommended: recommended, maxWidth: maxWidth,
                  content: content, actions: { EmptyView() })
    }
}

struct StageHeader: View {
    let question: String
    var context: String?
    /// The title of Claude's recommended option, shown as "Claude recommends X".
    var recommended: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(question)
                .font(.system(size: 28, weight: .semibold)).tracking(-0.3)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if let context, !context.isEmpty {
                Text(context).font(.system(size: 14)).foregroundStyle(.secondary).lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let recommended, !recommended.isEmpty {
                RecommendedBadge(text: "Claude recommends \(recommended)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct RecommendedBadge: View {
    var text = "Claude's pick"
    var body: some View {
        Label(text, systemImage: "sparkles")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Color.rasan)
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(Color.rasan.opacity(0.13), in: Capsule())
            .accessibilityLabel(text)
    }
}

struct DecidedLine: View {
    let decision: String
    var by: Bool?
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(Color(nsColor: .systemGreen))
            (Text("Decided: ").fontWeight(.semibold) + Text(decision))
                .font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
            if let by { Text(by ? "· you" : "· Claude").font(.system(size: 12)).foregroundStyle(.secondary) }
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(nsColor: .systemGreen).opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

struct StageSectionTitle: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text.uppercased()).font(.system(size: 11, weight: .semibold)).tracking(0.6).foregroundStyle(.secondary)
            .accessibilityAddTraits(.isHeader)
    }
}

struct ClockLabel: View {
    let seconds: Double
    var body: some View { Text(clockText(seconds)).monospacedDigit() }
}

struct StageCard<Content: View>: View {
    var selected = false
    var padding: CGFloat = 16
    @ViewBuilder var content: Content
    var body: some View { content.padding(padding).frame(maxWidth: .infinity, alignment: .leading).cardSurface(selected: selected) }
}

extension View {
    func stageCard(selected: Bool = false, padding: CGFloat = 16) -> some View {
        self.padding(padding).frame(maxWidth: .infinity, alignment: .leading).cardSurface(selected: selected)
    }
}

// MARK: Actions

/// The bottom bar of a call: a note, "You decide this step", and the primary button.
struct CallActions: View {
    let model: FilmSessionModel
    let step: String
    var primaryTitle: String?
    var primarySymbol: String?
    var primaryEnabled = true
    var allowDecide = true
    var onPrimary: (_ note: String) -> Void = { _ in }
    @State private var note = ""

    var body: some View {
        let canAct = model.canAct(on: step)
        VStack(spacing: 8) {
            if let error = model.lastError {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    Text(error).font(.system(size: 12)).lineLimit(2)
                    Spacer()
                    Button("Dismiss") { model.dismissError() }.buttonStyle(.link).font(.system(size: 12))
                }
            }
            HStack(spacing: 10) {
                if model.isViewingPast {
                    Label("Looking back. This step is decided.", systemImage: "clock.arrow.circlepath")
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                    Spacer()
                    Button("Back to now") { model.returnToLive() }.controlSize(.large)
                } else if model.hasSent(step) && model.status(step) != "done" {
                    ProgressView().controlSize(.small)
                    Text("Sent to Claude. Waiting for the next update.").font(.system(size: 12)).foregroundStyle(.secondary)
                    Spacer()
                } else {
                    TextField("Add a note for Claude (optional)", text: $note, axis: .vertical)
                        .textFieldStyle(.plain).font(.system(size: 13)).lineLimit(1...3)
                        .padding(.horizontal, 10).padding(.vertical, 7)
                        .background(Color(nsColor: .textBackgroundColor).opacity(0.7), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                        .disabled(!canAct)
                        .onSubmit { if !trimmed.isEmpty { Task { await model.tell(trimmed, step: step) } } }
                        .accessibilityLabel("Note for Claude")
                    if allowDecide {
                        Button("Let Claude decide") { Task { await model.decide(step: step, note: trimmed) } }
                            .controlSize(.large).disabled(!canAct)
                            .help("Let Claude make this call. It will say what it chose and why.")
                    }
                    if let primaryTitle {
                        Button {
                            // The note stays in the box until the console accepts the send (see onChange below).
                            onPrimary(trimmed)
                        } label: {
                            HStack(spacing: 6) {
                                if model.isSending { ProgressView().controlSize(.small) }
                                else if let primarySymbol { Image(systemName: primarySymbol) }
                                Text(primaryTitle)
                            }.frame(minWidth: 110)
                        }
                        .buttonStyle(.borderedProminent).controlSize(.large)
                        .keyboardShortcut(.defaultAction)
                        .disabled(!canAct || !primaryEnabled)
                    }
                }
            }
        }
        .padding(.horizontal, 24).padding(.vertical, 12)
        .background(.bar)
        .overlay(alignment: .top) { Divider() }
        .onChange(of: model.sendCount) { _, _ in note = "" }
    }
    private var trimmed: String { note.trimmingCharacters(in: .whitespacesAndNewlines) }
}

// MARK: Images

/// A file named in a payload, loaded off the main thread and downsampled. Shows a quiet placeholder when it can't be read.
struct PayloadImage: View {
    let path: String?
    var contentMode: ContentMode = .fill
    var maxPixels: CGFloat = 1280
    @Environment(FilmSessionModel.self) private var model: FilmSessionModel?
    @State private var image: NSImage?
    @State private var missing = false

    private var url: URL? { model?.fileURL(path) }

    var body: some View {
        ZStack {
            if let image {
                Image(nsImage: image).resizable().aspectRatio(contentMode: contentMode)
            } else {
                Rectangle().fill(Color(nsColor: .quaternaryLabelColor).opacity(0.35))
                    .overlay { Image(systemName: missing ? "photo.badge.exclamationmark" : "photo").foregroundStyle(.tertiary).font(.system(size: 20)) }
            }
        }
        .clipped()
        .task(id: url) {
            guard let url else { image = nil; missing = path != nil; return }
            let size = maxPixels
            let loaded = await Task.detached(priority: .utility) { () -> NSImage? in
                guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
                let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                                kCGImageSourceCreateThumbnailWithTransform: true,
                                                kCGImageSourceThumbnailMaxPixelSize: size]
                guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
                return NSImage(cgImage: cg, size: NSSize(width: cg.width, height: cg.height))
            }.value
            image = loaded; missing = loaded == nil
        }
        .accessibilityHidden(true)
    }
}

// MARK: Audio

/// One preview at a time across the whole app.
@MainActor @Observable
final class AudioPreviewCenter {
    static let shared = AudioPreviewCenter()
    private(set) var playingID: String?
    private var player: AVPlayer?
    private var observer: NSObjectProtocol?
    func toggle(id: String, url: URL) {
        if playingID == id { stop(); return }
        stop()
        let item = AVPlayerItem(url: url)
        let player = AVPlayer(playerItem: item)
        observer = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.stop() }
        }
        self.player = player
        playingID = id
        player.play()
    }
    func stop() {
        player?.pause(); player = nil; playingID = nil
        if let observer { NotificationCenter.default.removeObserver(observer); self.observer = nil }
    }
}

struct AudioPreviewButton: View {
    let id: String
    let path: String?
    var title = "Preview"
    @Environment(FilmSessionModel.self) private var model: FilmSessionModel?
    private var center: AudioPreviewCenter { .shared }
    var body: some View {
        let url = model?.fileURL(path)
        let playing = center.playingID == id
        Button {
            if let url { center.toggle(id: id, url: url) }
        } label: {
            Image(systemName: playing ? "pause.fill" : "play.fill").font(.system(size: 12, weight: .semibold))
                .frame(width: 30, height: 30)
                .background(playing ? Color.rasan : Color(nsColor: .quaternaryLabelColor).opacity(0.5), in: Circle())
                .foregroundStyle(playing ? Color(nsColor: .windowBackgroundColor) : Color.primary)
        }
        .buttonStyle(.plain).disabled(url == nil)
        .help(url == nil ? "No audio file for this option" : (playing ? "Pause \(title)" : "Play \(title)"))
        .accessibilityLabel(playing ? "Pause \(title)" : "Play \(title)")
        .onDisappear { if playing { center.stop() } }
    }
}

// MARK: Browser

/// For payloads that only have an HTML board: opens it in the default browser. Never embedded.
struct OpenInBrowserButton: View {
    let path: String?
    var title = "Open in browser"
    @Environment(FilmSessionModel.self) private var model: FilmSessionModel?
    var body: some View {
        if let url = model?.fileURL(path) {
            Button { SafeOpen.open(url) } label: { Label(title, systemImage: "safari") }
                .buttonStyle(.link).font(.system(size: 12))
        }
    }
}

// MARK: Stub body

/// What the phase 1 stub screens show until their real body lands: the question, what the payload holds, and "You decide".
struct StageStubBody: View {
    let model: FilmSessionModel
    let step: String
    let name: String
    var body: some View {
        let payload = model.payload(step)
        StageScaffold(model: model, step: step,
                      question: payload["question"].string ?? StepCatalog.label(step),
                      context: payload["context"].string,
                      recommended: payload["recommended"].identifier) {
            StageCard {
                VStack(alignment: .leading, spacing: 8) {
                    Label("\(name) screen in progress", systemImage: "hammer").font(.system(size: 13, weight: .semibold))
                    Text("This step's payload has: " + payload.object.keys.sorted().joined(separator: ", "))
                        .font(.system(size: 12)).foregroundStyle(.secondary).textSelection(.enabled)
                }
            }
        } actions: {
            CallActions(model: model, step: step)
        }
    }
}


/// Opens something a payload named, but only web links and plain media/documents: a path from research output must never
/// launch an app or script through `NSWorkspace`.
enum SafeOpen {
    static let fileTypes: Set<String> = ["html", "htm", "png", "jpg", "jpeg", "gif", "webp", "heic", "pdf", "mp4", "mov", "m4a", "mp3", "wav", "txt", "md", "json"]
    static func isSafe(_ url: URL) -> Bool {
        if let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" { return url.host != nil }
        return url.isFileURL && fileTypes.contains(url.pathExtension.lowercased())
    }
    @discardableResult static func open(_ url: URL) -> Bool {
        guard isSafe(url) else { return false }
        return NSWorkspace.shared.open(url)
    }
}
