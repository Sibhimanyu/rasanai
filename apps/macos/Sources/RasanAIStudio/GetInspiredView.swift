import AppKit
import AVFoundation
import StudioCore
import SwiftUI

// MARK: Pieces shared by the gallery, Home, New film and the finished page

/// A moment's still: saved under the cache folder the first time it shows, then drawn downsampled like every other poster.
struct MomentStill: View {
    let url: URL
    var maxPixels: CGFloat = 640
    @State private var local: URL?
    var body: some View {
        ZStack {
            Color.primary.opacity(0.06)
            if let local { PosterImage(url: local, maxPixels: maxPixels).transition(.opacity) }
        }
        .animation(.easeOut(duration: 0.2), value: local)
        .task(id: url) { local = await MomentImageCache.localURL(for: url) }
    }
}

/// A muted, looping clip drawn by AVPlayerLayer. It stays invisible until the first frame is ready, so the still underneath
/// never flashes black; leaving the view pauses the player.
private struct ClipPlayerView: NSViewRepresentable {
    let url: URL
    func makeNSView(context: Context) -> ClipView { ClipView(url: url) }
    func updateNSView(_ view: ClipView, context: Context) {}
    static func dismantleNSView(_ view: ClipView, coordinator: ()) { view.stop() }

    final class ClipView: NSView {
        private let player = AVQueuePlayer()
        private let looper: AVPlayerLooper
        private let playerLayer = AVPlayerLayer()
        private var readiness: NSKeyValueObservation?
        init(url: URL) {
            looper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(url: url))
            super.init(frame: .zero)
            wantsLayer = true
            playerLayer.player = player
            playerLayer.videoGravity = .resizeAspectFill
            playerLayer.opacity = 0
            layer?.addSublayer(playerLayer)
            readiness = playerLayer.observe(\.isReadyForDisplay, options: [.new]) { [weak self] layer, _ in
                guard layer.isReadyForDisplay else { return }
                Task { @MainActor in self?.reveal() }
            }
            player.isMuted = true
            player.play()
        }
        required init?(coder: NSCoder) { nil }
        override func layout() {
            super.layout()
            CATransaction.begin(); CATransaction.setDisableActions(true)
            playerLayer.frame = bounds
            CATransaction.commit()
        }
        private func reveal() {
            CATransaction.begin(); CATransaction.setDisableActions(true)
            playerLayer.opacity = 1
            CATransaction.commit()
        }
        func stop() { readiness = nil; player.pause(); looper.disableLooping() }
    }
}

private let chipFill = Color.primary.opacity(0.07)

/// One moment in the gallery. Hover plays the clip over the still (the card's background, border and the media change; the
/// text never moves). Clicking the card picks it; the credit line opens the original post.
struct MomentCard: View {
    let moment: Moment
    let selected: Bool
    let gallery: MomentGallery
    let onToggle: () -> Void
    @State private var hovering = false

    private var playing: Bool { gallery.playingID == moment.id }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onToggle) {
                VStack(alignment: .leading, spacing: 0) {
                    media
                    VStack(alignment: .leading, spacing: 4) {
                        Text(moment.name).font(.system(size: 13, weight: .semibold)).lineLimit(2, reservesSpace: true).multilineTextAlignment(.leading)
                        Text(moment.mechanic.prefix(3).map(Moment.mechanicTitle).joined(separator: " · "))
                            .font(.system(size: 11)).foregroundStyle(.tertiary).lineLimit(1)
                    }
                    .padding(.horizontal, 12).padding(.top, 10).padding(.bottom, 8).frame(maxWidth: .infinity, alignment: .leading)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help(moment.why.isEmpty ? moment.name : moment.why)
            .accessibilityLabel("\(moment.role.title): \(moment.name)")
            .accessibilityHint(selected ? "Picked. Click to remove" : "Click to pick")
            credit.padding(.horizontal, 12).padding(.bottom, 10)
        }
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .cardSurface(hovering: hovering, selected: selected)
        .onHover { inside in
            hovering = inside
            if inside { gallery.hoverBegan(moment.id) } else { gallery.hoverEnded(moment.id) }
        }
    }

    private var media: some View {
        Color.clear.aspectRatio(16.0 / 9.0, contentMode: .fit)
            .overlay { MomentStill(url: moment.stillURL) }
            .overlay { if playing { ClipPlayerView(url: moment.clipURL) } }
            .overlay(alignment: .topLeading) {
                HStack(spacing: 5) {
                    pill(moment.role.title)
                    if moment.isNew { pill("New", tint: true) }
                }.padding(8)
            }
            .overlay(alignment: .topTrailing) {
                if selected {
                    Image(systemName: "checkmark.circle.fill").font(.system(size: 22)).symbolRenderingMode(.palette)
                        .foregroundStyle(.white, Color.rasan).padding(8)
                } else if hovering {
                    Image(systemName: "plus.circle.fill").font(.system(size: 22)).symbolRenderingMode(.palette)
                        .foregroundStyle(.white, .black.opacity(0.45)).padding(8)
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if moment.duration > 0 { pill(String(format: "%.1f s", moment.duration)).padding(8) }
            }
            .clipped()
    }

    private func pill(_ text: String, tint: Bool = false) -> some View {
        Text(text).font(.system(size: 10.5, weight: .semibold)).foregroundStyle(tint ? Color.white : Color.white.opacity(0.95))
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background { Capsule().fill(tint ? Color.rasan.opacity(0.9) : Color.black.opacity(0.5)) }
    }

    @ViewBuilder private var credit: some View {
        if let creator = moment.creator {
            HStack(spacing: 6) {
                MomentAvatar(creator: creator)
                if let url = creator.url {
                    Button { SafeOpen.open(url) } label: {
                        HStack(spacing: 3) {
                            Text("By \(creator.displayName)").lineLimit(1)
                            Image(systemName: "arrow.up.right").font(.system(size: 8, weight: .semibold))
                        }
                        .font(.system(size: 11.5)).foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain).hoverCursor(.pointingHand).help("Open the original post")
                } else {
                    Text("By \(creator.displayName)").font(.system(size: 11.5)).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
        } else {
            Text("Creator not listed").font(.system(size: 11.5)).foregroundStyle(.tertiary)
        }
    }
}

private struct MomentAvatar: View {
    let creator: MomentCreator
    var body: some View {
        ZStack {
            Circle().fill(Color.rasan.opacity(0.16))
            Text(String(creator.displayName.prefix(1)).uppercased()).font(.system(size: 8.5, weight: .semibold)).foregroundStyle(Color.rasan)
            if let avatar = creator.avatar { MomentStill(url: avatar, maxPixels: 64).clipShape(Circle()) }
        }
        .frame(width: 16, height: 16)
        .accessibilityHidden(true)
    }
}

/// A picked moment as a small removable chip: "Hook: Build the claim… · By OpusClip".
struct MomentChip: View {
    let pick: FilmMoment
    let moment: Moment?
    var onRemove: (() -> Void)?
    var body: some View {
        let role = MomentRole(rawValue: pick.role)
        HStack(spacing: 8) {
            if let moment { MomentStill(url: moment.stillURL, maxPixels: 120).frame(width: 32, height: 18).clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous)) }
            Text("\(role?.title ?? pick.role.capitalized):").fontWeight(.semibold).foregroundStyle(Color.rasan).fixedSize()
            Text(moment?.name ?? pick.id).lineLimit(1).truncationMode(.tail)
            if let credit = moment?.creditLine { Text("· \(credit)").foregroundStyle(.secondary).lineLimit(1).layoutPriority(1) }
            if let onRemove {
                Button(action: onRemove) { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                    .buttonStyle(.plain).help("Remove this reference")
            }
        }
        .font(.system(size: 12))
        .padding(.leading, moment == nil ? 10 : 6).padding(.trailing, 10).frame(height: 30)
        .background(chipFill, in: Capsule())
        .frame(maxWidth: 380, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
    }
}

/// "References: <moment> by <creator>; …" on a finished film, with each credit linking to its source post.
struct MomentReferencesLine: View {
    let references: [FilmMoment]
    let gallery: MomentGallery
    private var text: AttributedString {
        var result = AttributedString("References: ")
        let found = references.compactMap { gallery.moment($0.id) }
        for (index, moment) in found.enumerated() {
            if index > 0 { result += AttributedString("; ") }
            result += AttributedString(moment.name)
            if let creator = moment.creator {
                var by = AttributedString(" by \(creator.displayName)")
                if let url = creator.url { by.link = url }
                result += by
            }
        }
        return result
    }
    var body: some View {
        if references.contains(where: { gallery.moment($0.id) != nil }) {
            Text(text).font(.system(size: 11)).foregroundStyle(.tertiary).multilineTextAlignment(.center).frame(maxWidth: 560)
                .environment(\.openURL, OpenURLAction { SafeOpen.open($0) ? .handled : .discarded })
        }
    }
}

// MARK: The gallery

/// The gallery itself: filters, a grid of cards, and the tray of picks. Used as a page and inside the New film sheet.
struct GetInspiredView: View {
    @Bindable var gallery: MomentGallery
    @Binding var selection: MomentSelection
    var primaryTitle = "Make a film with these"
    let onPrimary: () -> Void
    /// Set when shown in a sheet: adds a Cancel button.
    var onCancel: (() -> Void)?

    private let columns = [GridItem(.adaptive(minimum: 230, maximum: 320), spacing: 16, alignment: .top)]

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    if !gallery.moments.isEmpty { filters }
                    content
                    Text("Clips belong to their creators, and each card links to the original post. RasanAI borrows how a moment moves, never its words, brand or footage, and lists these credits with your finished film.")
                        .font(.system(size: 11)).foregroundStyle(.tertiary).fixedSize(horizontal: false, vertical: true).padding(.top, 6)
                }
                .padding(.horizontal, 32).padding(.top, 26).padding(.bottom, 24)
                .frame(maxWidth: 1100).frame(maxWidth: .infinity)
            }
            tray
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .task { await gallery.loadIfNeeded() }
        .onDisappear { gallery.stopPlaying() }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Get inspired").font(.system(size: 30, weight: .semibold, design: .rounded))
                Text("Real motion from real launch films. Pick up to four, one for each part of the story, and RasanAI reuses how each one moves with your own content.")
                    .font(.system(size: 13.5)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 16)
            if let onCancel { Button("Cancel", action: onCancel).keyboardShortcut(.cancelAction) }
        }
    }

    // MARK: Filters

    private var filters: some View {
        FlowLayout(spacing: 8) {
            filterChip("All", count: gallery.count(for: nil), active: gallery.role == nil && !gallery.onlyNew) { gallery.role = nil; gallery.onlyNew = false }
            ForEach(MomentRole.allCases) { role in
                filterChip(role.title, count: gallery.count(for: role), active: gallery.role == role) { gallery.role = gallery.role == role ? nil : role }
            }
            if gallery.newCount > 0 {
                filterChip("New", count: gallery.newCount, active: gallery.onlyNew, symbol: "sparkle") { gallery.onlyNew.toggle() }
            }
            mechanicMenu
        }
    }

    private func filterChip(_ title: String, count: Int, active: Bool, symbol: String? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let symbol { Image(systemName: symbol).font(.system(size: 10)) }
                Text(title).font(.system(size: 12.5, weight: .medium))
                Text("\(count)").font(.system(size: 11)).monospacedDigit().opacity(0.6)
            }
            .foregroundStyle(active ? Color.rasan : Color.primary)
            .padding(.horizontal, 12).frame(height: 28)
            .background(active ? Color.rasan.opacity(0.16) : chipFill, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    private var mechanicMenu: some View {
        Menu {
            Button("Any technique") { gallery.mechanic = nil }
            Divider()
            ForEach(gallery.mechanics, id: \.self) { tag in
                Button { gallery.mechanic = gallery.mechanic == tag ? nil : tag } label: {
                    if gallery.mechanic == tag { Label(Moment.mechanicTitle(tag), systemImage: "checkmark") } else { Text(Moment.mechanicTitle(tag)) }
                }
            }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: "slider.horizontal.3").font(.system(size: 11))
                Text(gallery.mechanic.map(Moment.mechanicTitle) ?? "Technique").font(.system(size: 12.5, weight: .medium))
                Image(systemName: "chevron.down").font(.system(size: 8, weight: .bold)).opacity(0.6)
            }
            .foregroundStyle(gallery.mechanic != nil ? Color.rasan : Color.primary)
            .padding(.horizontal, 12).frame(height: 28)
            .background(gallery.mechanic != nil ? Color.rasan.opacity(0.16) : chipFill, in: Capsule())
        }
        .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize().help("Filter by technique, like mask reveal or kinetic type")
    }

    // MARK: Content

    @ViewBuilder private var content: some View {
        switch gallery.state {
        case .idle, .loading:
            if gallery.moments.isEmpty {
                HStack(spacing: 10) { ProgressView().controlSize(.small); Text("Loading the gallery…").font(.system(size: 13)).foregroundStyle(.secondary) }
                    .frame(maxWidth: .infinity).padding(.vertical, 80)
            } else { grid }
        case .failed:
            if gallery.moments.isEmpty {
                VStack(spacing: 10) {
                    Image(systemName: "wifi.slash").font(.system(size: 26)).foregroundStyle(.tertiary)
                    Text("Couldn't load the gallery").font(.system(size: 15, weight: .semibold))
                    Text("Check your connection. Once it has loaded, it stays available offline.").font(.system(size: 12.5)).foregroundStyle(.secondary)
                    Button("Try again") { Task { await gallery.reload() } }.padding(.top, 4)
                }
                .frame(maxWidth: .infinity).padding(.vertical, 70)
            } else { grid }
        case .ready:
            grid
        }
    }

    @ViewBuilder private var grid: some View {
        if gallery.showingSavedCopy {
            HStack(spacing: 6) {
                Image(systemName: "icloud.slash").font(.system(size: 11))
                Text("Showing the saved gallery. You are offline or it can't be reached right now.")
                Button("Try again") { Task { await gallery.reload() } }.buttonStyle(.link)
            }.font(.system(size: 11.5)).foregroundStyle(.secondary)
        }
        if gallery.filtered.isEmpty {
            VStack(spacing: 8) {
                Text("Nothing matches those filters.").font(.system(size: 13)).foregroundStyle(.secondary)
                Button("Show everything") { gallery.clearFilters() }.buttonStyle(.link)
            }.frame(maxWidth: .infinity).padding(.vertical, 60)
        } else {
            LazyVGrid(columns: columns, spacing: 16) {
                ForEach(gallery.filtered) { moment in
                    MomentCard(moment: moment, selected: selection.contains(moment.id), gallery: gallery) { toggle(moment) }
                }
            }
        }
    }

    private func toggle(_ moment: Moment) {
        withAnimation(.snappy(duration: 0.2)) { selection.toggle(moment) }
    }

    // MARK: Tray

    private var tray: some View {
        HStack(spacing: 10) {
            ForEach(MomentRole.allCases) { role in slot(role) }
            VStack(spacing: 4) {
                Button(action: onPrimary) { Text(primaryTitle).padding(.horizontal, 6) }
                    .buttonStyle(.borderedProminent).controlSize(.large).disabled(selection.isEmpty)
                    .keyboardShortcut(.return, modifiers: .command)
                if !selection.isEmpty {
                    Button("Clear picks") { withAnimation(.snappy) { selection.clear() } }.buttonStyle(.link).font(.system(size: 11))
                }
            }
            .padding(.leading, 6)
        }
        .padding(.horizontal, 24).padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(Color(nsColor: .windowBackgroundColor))
        .overlay(alignment: .top) { Divider() }
        .animation(.snappy(duration: 0.2), value: selection)
    }

    @ViewBuilder private func slot(_ role: MomentRole) -> some View {
        if let pick = selection.pick(for: role) {
            let moment = gallery.moment(pick.id)
            HStack(spacing: 8) {
                if let moment {
                    MomentStill(url: moment.stillURL, maxPixels: 160).frame(width: 52, height: 30).clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(role.title).font(.system(size: 10.5, weight: .semibold)).foregroundStyle(Color.rasan)
                    Text(moment?.name ?? pick.id).font(.system(size: 11.5, weight: .medium)).lineLimit(1)
                    if let credit = moment?.creditLine { Text(credit).font(.system(size: 10.5)).foregroundStyle(.secondary).lineLimit(1) }
                }
                Spacer(minLength: 0)
                Button { withAnimation(.snappy(duration: 0.2)) { selection.remove(pick.id) } } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                    .buttonStyle(.plain).help("Remove")
            }
            .padding(8).frame(maxWidth: .infinity)
            .background(Color.rasan.opacity(0.09), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color.rasan.opacity(0.35), lineWidth: 0.5))
        } else {
            HStack(spacing: 6) {
                Image(systemName: "plus").font(.system(size: 10, weight: .semibold))
                Text(role.title).font(.system(size: 12))
            }
            .foregroundStyle(.tertiary).frame(maxWidth: .infinity, minHeight: 46)
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
            .accessibilityLabel("No \(role.title) picked yet")
        }
    }
}

/// The full gallery page, opened from Home.
struct GetInspiredPage: View {
    @Bindable var store: StudioStore
    var body: some View {
        GetInspiredView(gallery: store.gallery, selection: $store.inspirePicks) {
            let picks = store.inspirePicks.picks
            store.inspirePicks.clear()
            store.newFilm(moments: picks)
        }
        .navigationTitle("Get inspired")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                HelpButton(title: "Get inspired", lines: [
                    "Browse short moments from real launch films. Point at one to watch it play.",
                    "Click to pick it: one for the hook, proof, turn and call to action at most.",
                    "Make a film with these opens New film with your picks attached. Each card credits its creator."])
            }
        }
    }
}

/// The gallery in a sheet from New film: add or replace picks, then use them.
struct GetInspiredSheet: View {
    @Bindable var gallery: MomentGallery
    @State var selection: MomentSelection
    let onUse: ([FilmMoment]) -> Void
    let onCancel: () -> Void
    var body: some View {
        GetInspiredView(gallery: gallery, selection: $selection, primaryTitle: selection.isEmpty ? "Use these" : "Use these \(selection.count)", onPrimary: { onUse(selection.picks) }, onCancel: onCancel)
            .frame(minWidth: 860, idealWidth: 960, minHeight: 600, idealHeight: 700)
    }
}

/// Home's quiet preview: one moment per role, and a way into the whole gallery.
struct GetInspiredHomeSection: View {
    @Bindable var store: StudioStore
    private var gallery: MomentGallery { store.gallery }
    private let columns = [GridItem(.adaptive(minimum: 200, maximum: 300), spacing: 16, alignment: .top)]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Get inspired").font(.system(size: 22, weight: .semibold))
                    Text("Real motion from real launch films. Pick a few and start a film that moves like them.").font(.system(size: 12.5)).foregroundStyle(.secondary)
                }
                Spacer()
                Button { store.openGallery() } label: { Label("Browse all", systemImage: "arrow.right").labelStyle(.titleAndIcon) }
                    .buttonStyle(.link).font(.system(size: 12.5))
            }
            if gallery.spotlight.isEmpty {
                if gallery.state == .failed {
                    HStack(spacing: 8) {
                        Text("The gallery can't be reached right now.").font(.system(size: 12.5)).foregroundStyle(.secondary)
                        Button("Try again") { Task { await gallery.reload() } }.buttonStyle(.link).font(.system(size: 12.5))
                    }.padding(.vertical, 6)
                } else {
                    HStack(spacing: 8) { ProgressView().controlSize(.small); Text("Loading the gallery…").font(.system(size: 12.5)).foregroundStyle(.secondary) }.padding(.vertical, 6)
                }
            } else {
                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach(gallery.spotlight) { moment in
                        MomentCard(moment: moment, selected: store.inspirePicks.contains(moment.id), gallery: gallery) { store.openGallery(selecting: moment) }
                    }
                }
            }
        }
        .task { await gallery.loadIfNeeded() }
        .onDisappear { gallery.stopPlaying() }
    }
}
