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
//       The whole page: a scroll view with the StageHeader, your content and the "Decided:" line for finished steps.
//       The step's conversation lives in the inspector (Notes). `actions` draws nothing: it holds a view that publishes
//       the step's buttons (CallActions, StepActionBar, ...) to the one status bar at the bottom of the film page.
//   StageHeader(question:context:recommended:)
//       The large question, a context line, and a "Claude recommends X" badge when `recommended` is set.
//   CallActions(model:step:primaryTitle:primarySymbol:primaryEnabled:onPrimary:)
//       Publishes "Let Claude decide" and the primary button to the status bar. `onPrimary(note)` should call
//       `model.send(...)` with the note from the inspector composer; the bar disables itself when the person can't act
//       (read-only, sending, already sent) and says "Sent to Claude" while the director picks it up. Pass
//       `primaryTitle: nil` for decide-only.
//   RecommendedBadge(text:)            Claude's pick, as a small capsule. Put it on the recommended option.
//   PayloadImage(path:contentMode:maxPixels:)   A local file named in the payload (workspace-relative or absolute).
//   AudioPreviewButton(id:path:title:) A play/pause round button; one preview plays at a time.
//   OpenInBrowserButton(path:title:)   For HTML-only boards: opens the file in the default browser (never embedded).
//   DecidedLine(decision:by:)          Green "Decided:" line.
//   StageCard / .stageCard(selected:)  The card surface for options (selected = accent outline).
//   StageSectionTitle(_:)              Small caps section label.
//   ClockLabel(seconds:)               "0:12" in monospaced digits.
//   JSONValue helpers (StudioCore): .string, .number, .bool, .strings, .array, .object, .identifier, ["key"].

// MARK: Agent name and shared metrics

extension LocalAgent {
    /// What the person calls the agent in the interface ("Claude", not "Claude Code"); `title` is the settings name.
    var shortName: String {
        switch self { case .claude: "Claude"; case .codex: "Codex"; case .custom: "Your agent" }
    }
}

extension EnvironmentValues {
    /// The running agent's name for UI copy. The film page sets it from the agent setting; fixtures keep "Claude".
    @Entry var agentName = "Claude"
}

extension EnvironmentValues {
    /// The crew member who prepared the stage on screen. NativeStageView sets it from the route; nil hides the byline.
    @Entry var crewCharacter: CrewCharacter?
}

/// One line saying who prepared a stage, in the crew member's own voice.
enum CrewCredit {
    static func line(step: String?, character: CrewCharacter) -> String {
        switch step?.lowercased() {
        case "brief": "Tara read your product and wrote this brief."
        case "story": "Kavi wrote three scripts from what Tara found."
        case "look", "films", "direction": "Chitra designed three looks for this story."
        case "animatic": "Laya timed this first cut to the music."
        case "build": "Laya is building the film, scene by scene."
        case "final", "render": "Rasika checked every scene. The last call is yours."
        case "footage", "reel": "Mala logged your clips and picked the selects."
        case "working": "Rasan is setting up the crew."
        default: "\(character.displayName) worked on this."
        }
    }
}

/// The crew member beside a one-line credit. Draws nothing when no character is set.
struct CrewByline: View {
    var step: String?
    @Environment(\.crewCharacter) private var character
    var body: some View {
        if let character {
            HStack(alignment: .bottom, spacing: 10) {
                CrewAvatar(character, style: .full(height: 48))
                Text(CrewCredit.line(step: step, character: character))
                    .font(.system(size: 13)).foregroundStyle(.secondary)
                    .padding(.bottom, 4)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(CrewCredit.line(step: step, character: character))
        }
    }
}

extension CGFloat {
    /// The one horizontal inset the film page's status text, stage heading and filmstrip header share.
    static let filmInset: CGFloat = 16
}

extension View {
    /// The one primary of a view gets the brand fill; the same control is the neutral secondary when something else is primary.
    @ViewBuilder func rasanButton(primary: Bool) -> some View {
        if primary { buttonStyle(.rasanPrimary) } else { buttonStyle(.rasanSecondary) }
    }
}

// MARK: Page

struct StageScaffold<Content: View, Actions: View>: View {
    let model: FilmSessionModel
    let step: String
    let question: String
    var context: String?
    var recommended: String?
    var maxWidth: CGFloat = 1240
    @ViewBuilder var content: Content
    @ViewBuilder var actions: Actions

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                StageHeader(question: question, context: context, recommended: recommended, step: step)
                content
                if let decision = model.payload(step)["decision"].string, model.status(step) == "done" {
                    DecidedLine(decision: decision, by: model.snapshot.decisions.first { $0.step == step }?.byUser)
                }
            }
            .padding(.horizontal, 24).padding(.top, 26).padding(.bottom, 32)
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
         maxWidth: CGFloat = 1240, @ViewBuilder content: () -> Content) {
        self.init(model: model, step: step, question: question, context: context, recommended: recommended, maxWidth: maxWidth,
                  content: content, actions: { EmptyView() })
    }
}

struct StageHeader: View {
    let question: String
    var context: String?
    /// The title of Claude's recommended option, shown as "Claude recommends X".
    var recommended: String?
    /// The step, for the crew credit line.
    var step: String?
    @Environment(\.agentName) private var agent
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            CrewByline(step: step).padding(.bottom, 8)
            Text(question)
                .font(.system(size: 29, weight: .semibold)).tracking(-0.6)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if let context, !context.isEmpty {
                Text(context).font(.system(size: 14)).foregroundStyle(.secondary).lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let recommended, !recommended.isEmpty {
                RecommendedBadge(text: "\(agent) recommends \(recommended)").padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct RecommendedBadge: View {
    /// Nil reads "<agent>'s pick".
    var text: String?
    @Environment(\.agentName) private var agent
    var body: some View {
        let text = text ?? "\(agent)'s pick"
        Label(text, systemImage: "sparkles")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Color.rasan)
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(Color.rasan.opacity(0.13), in: Capsule())
            .accessibilityLabel(text)
    }
}

struct DecidedLine: View {
    @Environment(\.agentName) private var agent
    let decision: String
    var by: Bool?
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(Color(nsColor: .systemGreen))
            (Text("Decided: ").fontWeight(.semibold) + Text(decision))
                .font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
            if let by { Text(by ? "· you" : "· \(agent)").font(.system(size: 12)).foregroundStyle(.secondary) }
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

/// The actions of a call: "Let Claude decide" and the primary button. Draws nothing itself; it publishes them to the film
/// page's status bar, which also owns the sending and looking-back states. The note comes from the inspector composer.
struct CallActions: View {
    let model: FilmSessionModel
    let step: String
    var primaryTitle: String?
    var primarySymbol: String?
    var primaryEnabled = true
    var allowDecide = true
    var onPrimary: (_ note: String) -> Void = { _ in }
    @Environment(\.agentName) private var agent

    /// Only the person's turn (or looking back, or just sent) publishes; while Claude works there is nothing to do.
    var body: some View {
        FilmActionsPublisher(actions: model.showsActions(for: step) ? FilmActions(
            step: step, primaryTitle: primaryTitle, primarySymbol: primarySymbol, primaryEnabled: primaryEnabled,
            secondaryTitle: allowDecide ? "Let \(agent) decide" : nil, secondaryHelp: "Let \(agent) make this call. It will say what it chose and why.",
            onPrimary: onPrimary,
            onSecondary: { note in Task { await model.decide(step: step, note: note) } }) : nil)
    }
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
                .foregroundStyle(playing ? Color.appBackground : Color.primary)
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
