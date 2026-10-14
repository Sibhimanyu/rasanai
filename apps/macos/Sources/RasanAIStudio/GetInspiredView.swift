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
/// text never moves). Clicking the card opens the large viewer (with sound); the plus button adds it to Moves I like; the
/// credit line opens the original post.
struct MomentCard: View {
    let moment: Moment
    let selected: Bool
    let gallery: MomentGallery
    let onToggle: () -> Void
    let onOpen: () -> Void
    @State private var hovering = false

    private var playing: Bool { gallery.playingID == moment.id }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onOpen) {
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
            .accessibilityLabel(moment.name)
            .accessibilityHint("Opens the viewer with sound")
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
                    if moment.isNew { pill("New", tint: true) }
                }.padding(8)
            }
            .overlay(alignment: .topTrailing) {
                if selected || hovering {
                    Button(action: onToggle) {
                        Image(systemName: selected ? "checkmark.circle.fill" : "plus.circle.fill").font(.system(size: 22)).symbolRenderingMode(.palette)
                            .foregroundStyle(selected ? Color.black : Color.white, selected ? Color.white : Color.black.opacity(0.45)).padding(8)
                    }
                    .buttonStyle(.plain).help(selected ? "Remove from your moves" : "Add to your moves")
                    .accessibilityLabel(selected ? "Remove \(moment.name) from your moves" : "Add \(moment.name) to your moves")
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if moment.duration > 0 { pill(String(format: "%.1f s", moment.duration)).padding(8) }
            }
            .clipped()
    }

    private func pill(_ text: String, tint: Bool = false) -> some View {
        Text(text).font(.system(size: 10.5, weight: .semibold)).foregroundStyle(tint ? Color.black : Color.white.opacity(0.95))
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background { Capsule().fill(tint ? Color.white.opacity(0.92) : Color.black.opacity(0.5)) }
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
            Circle().fill(Color.primary.opacity(0.12))
            Text(String(creator.displayName.prefix(1)).uppercased()).font(.system(size: 8.5, weight: .semibold)).foregroundStyle(.secondary)
            if let avatar = creator.avatar { MomentStill(url: avatar, maxPixels: 64).clipShape(Circle()) }
        }
        .frame(width: 16, height: 16)
        .accessibilityHidden(true)
    }
}

/// A picked move as a small removable chip: "Opening · Build the claim… · By OpusClip". The place is optional and set from a
/// small menu on the chip (Anywhere by default).
struct MomentChip: View {
    let pick: FilmMoment
    let moment: Moment?
    var onPlace: ((MomentPlace) -> Void)?
    var onRemove: (() -> Void)?
    var body: some View {
        HStack(spacing: 8) {
            if let moment { MomentStill(url: moment.stillURL, maxPixels: 120).frame(width: 32, height: 18).clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous)) }
            if let onPlace { PlaceMenu(place: pick.place, onChange: onPlace) }
            else if pick.place != .anywhere { Text(pick.place.title).fontWeight(.semibold).fixedSize() }
            Text(moment?.name ?? pick.id).lineLimit(1).truncationMode(.tail)
            if let credit = moment?.creditLine { Text("· \(credit)").foregroundStyle(.secondary).lineLimit(1).layoutPriority(1) }
            if let onRemove {
                Button(action: onRemove) { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                    .buttonStyle(.plain).help("Remove this move")
            }
        }
        .font(.system(size: 12))
        .padding(.leading, moment == nil ? 10 : 6).padding(.trailing, 10).frame(height: 30)
        .background(chipFill, in: Capsule())
        .frame(maxWidth: 420, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// "Where?" for one move: Opening, Between moments, Big moment, Ending or Anywhere (the default).
struct PlaceMenu: View {
    let place: MomentPlace
    let onChange: (MomentPlace) -> Void
    var body: some View {
        Menu {
            ForEach(MomentPlace.allCases) { option in
                Button { onChange(option) } label: {
                    if option == place { Label(option.title, systemImage: "checkmark") } else { Text(option.title) }
                }
            }
        } label: {
            HStack(spacing: 3) {
                Text(place.title).fontWeight(.semibold)
                Image(systemName: "chevron.down").font(.system(size: 7, weight: .bold)).opacity(0.7)
            }
            .foregroundStyle(place == .anywhere ? Color.secondary : Color.primary)
        }
        .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize().help("Where in the film should this move land? Anywhere lets the director decide.")
        .accessibilityLabel("Place: \(place.title)")
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
    /// Set on the full page (the sidebar's name for it); nil in the New film sheet, which brings its own title and Cancel.
    var pageTitle: String?
    var primaryTitle = "Make a film with these"
    let onPrimary: () -> Void
    /// Set when shown in a sheet: adds a Cancel button.
    var onCancel: (() -> Void)?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
                .modifier(InspireColumn(onPage: pageTitle != nil))
            }
            tray
        }
        .background(Color.appBackground)
        .task { await gallery.loadIfNeeded() }
        .onDisappear { gallery.stopPlaying(); gallery.closeViewer() }
        .momentViewer(gallery: gallery, selection: $selection)
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 6) {
                if let pageTitle { PageTitle(text: pageTitle) } else { Text("Inspiration").font(.system(size: 20, weight: .bold)) }
                Text("Real motion from real launch films. Click one to watch it big, with sound. Add up to four to your moves, and RasanAI reuses how each one moves with your own content.")
                    .font(.system(size: 13.5)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 16)
            if let onCancel { Button("Cancel", action: onCancel).keyboardShortcut(.cancelAction) }
        }
    }

    // MARK: Filters

    private var filters: some View {
        FlowLayout(spacing: 8) {
            filterChip("All", count: gallery.moments.count, active: !gallery.hasFilters) { gallery.clearFilters() }
            if gallery.newCount > 0 {
                filterChip("New", count: gallery.newCount, active: gallery.onlyNew, symbol: "sparkle") { gallery.onlyNew.toggle() }
            }
            ForEach(gallery.techniques) { technique in
                filterChip(technique.title, count: gallery.count(for: technique), active: gallery.technique == technique) {
                    gallery.technique = gallery.technique == technique ? nil : technique; gallery.mechanic = nil
                }
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
            .foregroundStyle(Color.primary)
            .padding(.horizontal, 12).frame(height: 28)
            .background(active ? Color.primary.opacity(0.16) : chipFill, in: Capsule())
            .overlay { if active { Capsule().strokeBorder(Color.primary.opacity(0.25), lineWidth: 1) } }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    private var mechanicMenu: some View {
        Menu {
            Button("Any move") { gallery.mechanic = nil }
            Divider()
            ForEach(gallery.mechanics, id: \.self) { tag in
                Button { gallery.mechanic = gallery.mechanic == tag ? nil : tag } label: {
                    if gallery.mechanic == tag { Label(Moment.mechanicTitle(tag), systemImage: "checkmark") } else { Text(Moment.mechanicTitle(tag)) }
                }
            }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: "slider.horizontal.3").font(.system(size: 11))
                Text(gallery.mechanic.map(Moment.mechanicTitle) ?? "Move").font(.system(size: 12.5, weight: .medium))
                Image(systemName: "chevron.down").font(.system(size: 8, weight: .bold)).opacity(0.6)
            }
            .foregroundStyle(Color.primary)
            .padding(.horizontal, 12).frame(height: 28)
            .background(gallery.mechanic != nil ? Color.primary.opacity(0.16) : chipFill, in: Capsule())
            .overlay { if gallery.mechanic != nil { Capsule().strokeBorder(Color.primary.opacity(0.25), lineWidth: 1) } }
        }
        .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize().help("Filter by how it moves, like mask reveal or kinetic type")
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
                    MomentCard(moment: moment, selected: selection.contains(moment.id), gallery: gallery, onToggle: { toggle(moment) }, onOpen: { gallery.openViewer(moment.id) })
                }
            }
        }
    }

    private func toggle(_ moment: Moment) {
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.2)) { _ = selection.toggle(moment) }
    }

    // MARK: Tray

    private var tray: some View {
        HStack(spacing: 10) {
            Text("Your moves").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary).fixedSize()
            ForEach(0..<FilmDraft.maxMoments, id: \.self) { index in slot(index) }
            VStack(spacing: 4) {
                Button(action: onPrimary) { Text(primaryTitle).padding(.horizontal, 6) }
                    .buttonStyle(.rasanPrimary).controlSize(.large).disabled(selection.isEmpty)
                    .keyboardShortcut(.return, modifiers: .command)
                if !selection.isEmpty {
                    Button("Clear") { withAnimation(reduceMotion ? nil : .snappy) { selection.clear() } }.buttonStyle(.link).font(.system(size: 11))
                }
            }
            .padding(.leading, 6)
        }
        .padding(.horizontal, 24).padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(Color.appBackground)
        .overlay(alignment: .top) { Divider() }
        .animation(reduceMotion ? nil : .snappy(duration: 0.2), value: selection)
    }

    @ViewBuilder private func slot(_ index: Int) -> some View {
        if index < selection.picks.count {
            let pick = selection.picks[index]
            let moment = gallery.moment(pick.id)
            HStack(spacing: 8) {
                if let moment {
                    MomentStill(url: moment.stillURL, maxPixels: 160).frame(width: 52, height: 30).clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                        .onTapGesture { gallery.openViewer(moment.id) }
                }
                VStack(alignment: .leading, spacing: 1) {
                    PlaceMenu(place: pick.place) { place in withAnimation(reduceMotion ? nil : .snappy(duration: 0.2)) { selection.setPlace(place, for: pick.id) } }.font(.system(size: 10.5))
                    Text(moment?.name ?? pick.id).font(.system(size: 11.5, weight: .medium)).lineLimit(1)
                    if let credit = moment?.creditLine { Text(credit).font(.system(size: 10.5)).foregroundStyle(.secondary).lineLimit(1) }
                }
                Spacer(minLength: 0)
                Button { withAnimation(reduceMotion ? nil : .snappy(duration: 0.2)) { selection.remove(pick.id) } } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                    .buttonStyle(.plain).help("Remove")
            }
            .padding(8).frame(maxWidth: .infinity)
            .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color.primary.opacity(0.25), lineWidth: 1))
        } else {
            HStack(spacing: 6) {
                Image(systemName: "plus").font(.system(size: 10, weight: .semibold))
                Text("Add a move").font(.system(size: 12))
            }
            .foregroundStyle(.tertiary).frame(maxWidth: .infinity, minHeight: 46)
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
            .accessibilityLabel("Empty slot in your moves")
        }
    }
}

/// The page keeps the library's column; the sheet keeps its own margins.
private struct InspireColumn: ViewModifier {
    let onPage: Bool
    func body(content: Content) -> some View {
        if onPage { content.pageColumn() }
        else { content.padding(.horizontal, 32).padding(.top, 26).padding(.bottom, 24).frame(maxWidth: 1100).frame(maxWidth: .infinity) }
    }
}

/// The full gallery page, opened from Home.
struct GetInspiredPage: View {
    @Bindable var store: StudioStore
    var body: some View {
        GetInspiredView(gallery: store.gallery, selection: $store.inspirePicks, pageTitle: "Inspiration") {
            let picks = store.inspirePicks.picks
            store.inspirePicks.clear()
            store.newFilm(moments: picks)
        }
        .navigationTitle("Inspiration")
        .pageHeader("Inspiration")
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
