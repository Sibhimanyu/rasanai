import AppKit
import StudioCore
import SwiftUI
import UniformTypeIdentifiers

/// The brand page's Assets section: what needs attention, then Logos, Fonts and Media, each with a drop target and a "+" button.
struct BrandAssetsSection: View {
    let brand: Brand
    /// Reload the brand from disk.
    let changed: () -> Void
    @State private var importTarget: ImportTarget?
    @State private var error: String?
    @State private var pending = 0
    @State private var dropping: Group?

    enum Group: String { case logos, fonts, media }
    enum ImportTarget {
        case add(Group), locate(BrandMissing), replace(BrandAssetEntry)
        var group: Group {
            switch self {
            case .add(let g): g
            case .locate(let m): m.as == "logo" ? .logos : m.as == "font" ? .fonts : .media
            case .replace(let e): switch e { case .logo: .logos; case .font: .fonts; case .media: .media }
            }
        }
        var multiple: Bool { if case .add = self { true } else { false } }
    }

    private var manifest: BrandAssetManifest { brand.assets }
    private var fontWarnings: [String] { (brand.check?.warnings ?? []).filter { $0.lowercased().contains("font") } }
    private var otherWarnings: [String] { (brand.check?.warnings ?? []).filter { !$0.lowercased().contains("font") } }
    private var needsAttention: Bool { !(brand.check?.problems.isEmpty ?? true) || !otherWarnings.isEmpty || !manifest.missing.isEmpty }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 8) {
                Text("Assets").font(.system(size: 15, weight: .semibold))
                if pending > 0 { ProgressView().controlSize(.small) }
                Spacer()
            }
            if needsAttention { attention }
            logosGroup
            fontsGroup
            mediaGroup
        }
        .fileImporter(isPresented: Binding(get: { importTarget != nil }, set: { _ in }),
                      allowedContentTypes: Self.types(for: importTarget?.group ?? .media),
                      allowsMultipleSelection: importTarget?.multiple ?? false) { result in
            let target = importTarget; importTarget = nil
            guard let target, case .success(let urls) = result, !urls.isEmpty else { return }
            handle(target, urls)
        }
        .alert("Couldn’t update the brand’s assets", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "") }
    }

    // MARK: Needs attention

    private var attention: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Needs attention").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array((brand.check?.problems ?? []).enumerated()), id: \.offset) { _, text in note(text, symbol: "exclamationmark.octagon.fill", tint: .red) }
                ForEach(manifest.missing) { missing in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "questionmark.folder.fill").foregroundStyle(.orange).frame(width: 16)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(missing.ref).font(.system(size: 12, weight: .medium, design: .monospaced)).lineLimit(2).textSelection(.enabled)
                            Text([missing.where, missing.why].filter { !$0.isEmpty }.joined(separator: " · ")).font(.system(size: 11)).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 8)
                        Button("Locate…") { importTarget = .locate(missing) }.controlSize(.small)
                    }
                }
                ForEach(Array(otherWarnings.enumerated()), id: \.offset) { _, text in note(text, symbol: "exclamationmark.triangle.fill", tint: .orange) }
            }
            .frame(maxWidth: .infinity, alignment: .leading).workspacePanel(padding: 14)
        }
    }

    private func note(_ text: String, symbol: String, tint: Color) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: symbol).foregroundStyle(tint).frame(width: 16)
            Text(text).font(.system(size: 12)).foregroundStyle(tint == .red ? Color.red : Color.primary).fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: Groups

    private func groupHeader(_ title: String, _ group: Group, hint: String) -> some View {
        HStack {
            Text(title).font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
            Spacer()
            Button { importTarget = .add(group) } label: { Image(systemName: "plus") }
                .buttonStyle(.borderless).help(hint).accessibilityLabel(hint)
        }
    }

    private func dropZone<C: View>(_ group: Group, @ViewBuilder content: () -> C) -> some View {
        content()
            .onDrop(of: [.fileURL], isTargeted: Binding(get: { dropping == group }, set: { dropping = $0 ? group : (dropping == group ? nil : dropping) })) { providers in
                for p in providers {
                    _ = p.loadObject(ofClass: URL.self) { url, _ in
                        if let url { Task { @MainActor in handle(.add(group), [url]) } }
                    }
                }
                return !providers.isEmpty
            }
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.accentColor, lineWidth: dropping == group ? 2 : 0).padding(-4))
    }

    private func emptyHint(_ text: String) -> some View {
        Text(text).font(.system(size: 12)).foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, minHeight: 56).workspacePanel(padding: 12)
    }

    private var logosGroup: some View {
        VStack(alignment: .leading, spacing: 8) {
            groupHeader("Logos", .logos, hint: "Add a logo")
            dropZone(.logos) {
                if manifest.logos.isEmpty { emptyHint("No logo yet. Drop an SVG, PNG or PDF here, or press +. Films will set the name in type until there is one.") }
                else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 270, maximum: 380), spacing: 12, alignment: .top)], spacing: 12) {
                        ForEach(manifest.logos) { logo in
                            LogoCard(logo: logo, url: BrandAssets.url(logo.file, in: brand.folder),
                                     update: { new in write { try BrandAssets.update(.logo(new), in: $0) } },
                                     replace: { importTarget = .replace(.logo(logo)) },
                                     remove: { write { try BrandAssets.remove(.logo(logo), in: $0) } })
                        }
                    }
                }
            }
        }
    }

    private var fontsGroup: some View {
        VStack(alignment: .leading, spacing: 8) {
            groupHeader("Fonts", .fonts, hint: "Add font files")
            dropZone(.fonts) {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(fontWarnings.enumerated()), id: \.offset) { _, text in
                        note(text, symbol: "exclamationmark.triangle.fill", tint: .orange).padding(12)
                        if !manifest.fonts.isEmpty || text != fontWarnings.last { Divider() }
                    }
                    if manifest.fonts.isEmpty && fontWarnings.isEmpty {
                        Text("No font files. Drop OTF, TTF, WOFF or WOFF2 files here, or press +.").font(.system(size: 12)).foregroundStyle(.secondary).padding(12)
                    }
                    ForEach(manifest.fonts) { font in
                        FontRow(font: font,
                                update: { new in write { try BrandAssets.update(.font(new), in: $0) } },
                                remove: { write { try BrandAssets.remove(.font(font), in: $0) } })
                        if font.id != manifest.fonts.last?.id { Divider() }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading).workspacePanel()
            }
        }
    }

    private var mediaGroup: some View {
        VStack(alignment: .leading, spacing: 8) {
            groupHeader("Media", .media, hint: "Add screenshots, images, video or guideline PDFs")
            dropZone(.media) {
                if manifest.media.isEmpty { emptyHint("Screenshots, product images, icons, video and guideline PDFs. Drop them here, or press +.") }
                else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 190, maximum: 260), spacing: 12, alignment: .top)], spacing: 12) {
                        ForEach(manifest.media) { item in
                            MediaTile(item: item, url: BrandAssets.url(item.file, in: brand.folder),
                                      update: { new in write { try BrandAssets.update(.media(new), in: $0) } },
                                      remove: { write { try BrandAssets.remove(.media(item), in: $0) } })
                        }
                    }
                }
            }
        }
    }

    // MARK: Doing things

    private func handle(_ target: ImportTarget, _ urls: [URL]) {
        let folder = brand.folder
        switch target {
        case .add(let group):
            write { folder in
                var first: Error?
                for url in urls {
                    do {
                        switch group {
                        case .logos: try BrandAssets.addLogo(url, to: folder)
                        case .fonts: try BrandAssets.addFont(url, to: folder)
                        case .media: try BrandAssets.addMedia(url, to: folder)
                        }
                    } catch { first = first ?? error }
                }
                if let first { throw first }
            }
        case .locate(let missing): write { try BrandAssets.locate(missing: missing, with: urls[0], in: $0) }
        case .replace(let entry): write { try BrandAssets.replace(entry, with: urls[0], in: $0) }
        }
        _ = folder
    }

    /// Runs a manifest change off the main thread, shows the result, then re-checks (cheap) and shows that.
    private func write(_ work: @escaping @Sendable (URL) throws -> Void) {
        let folder = brand.folder
        pending += 1
        Task {
            do { try await Task.detached { try work(folder) }.value } catch { self.error = error.localizedDescription }
            changed()
            await BrandEngine.check(folder)
            pending -= 1
            changed()
        }
    }

    static func types(for group: Group) -> [UTType] {
        switch group {
        case .logos: return [.image, .pdf, .svg]
        case .fonts: return ["ttf", "otf", "woff", "woff2"].compactMap { UTType(filenameExtension: $0) } + [.font]
        case .media: return [.image, .movie, .pdf, .svg]
        }
    }
}

// MARK: - Logos

private struct LogoCard: View {
    let logo: BrandLogo
    let url: URL
    let update: (BrandLogo) -> Void
    let replace: () -> Void
    let remove: () -> Void
    private static let kinds = [("mark", "Mark"), ("wordmark", "Wordmark"), ("lockup", "Lockup"), ("app-icon", "App icon")]
    private static let versions = [("on-light", "On light"), ("on-dark", "On dark"), ("mono", "Mono"), ("reversed", "Reversed")]
    private var darkBackdrop: Bool { logo.colourVersions.contains("on-dark") || logo.colourVersions.contains("reversed") }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            BrandLogoImage(url: url).frame(width: 64, height: 64).padding(8)
                .background(darkBackdrop ? Color.black.opacity(0.85) : Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(nsColor: .separatorColor)))
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Text(url.lastPathComponent).font(.system(size: 12, weight: .medium)).lineLimit(1).truncationMode(.middle)
                    Spacer(minLength: 4)
                    Button { var new = logo; new.primary = true; update(new) } label: { Image(systemName: logo.primary ? "star.fill" : "star") }
                        .buttonStyle(.borderless).foregroundStyle(logo.primary ? Color.yellow : Color.secondary)
                        .help(logo.primary ? "This is the primary logo" : "Make this the primary logo").disabled(logo.primary)
                        .accessibilityLabel(logo.primary ? "Primary logo" : "Make primary logo")
                }
                Picker("Kind", selection: Binding(get: { logo.kind }, set: { var new = logo; new.kind = $0; update(new) })) {
                    ForEach(Self.kinds, id: \.0) { Text($0.1).tag($0.0) }
                }.labelsHidden().pickerStyle(.menu).controlSize(.small).fixedSize()
                HStack(spacing: 5) {
                    ForEach(Self.versions, id: \.0) { id, title in
                        let on = logo.colourVersions.contains(id)
                        Button {
                            var new = logo
                            if on { new.colourVersions.removeAll { $0 == id } } else { new.colourVersions.append(id) }
                            update(new)
                        } label: {
                            Text(title).font(.system(size: 10, weight: .medium)).padding(.horizontal, 7).padding(.vertical, 3)
                                .background(on ? Color.primary.opacity(0.14) : Color.clear, in: Capsule())
                                .overlay(Capsule().strokeBorder(on ? Color.primary.opacity(0.5) : Color(nsColor: .separatorColor)))
                        }.buttonStyle(.plain).accessibilityAddTraits(on ? .isSelected : [])
                    }
                }
                HStack(spacing: 10) {
                    Button("Replace…", action: replace).controlSize(.small)
                    Button("Remove", role: .destructive, action: remove).controlSize(.small)
                }
            }
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading).workspacePanel()
        .contextMenu {
            if !logo.primary { Button("Make Primary") { var new = logo; new.primary = true; update(new) } }
            Button("Replace…", action: replace)
            Button("Remove", role: .destructive, action: remove)
        }
    }
}

// MARK: - Fonts

private struct FontRow: View {
    let font: BrandFont
    let update: (BrandFont) -> Void
    let remove: () -> Void
    @State private var family: String
    @FocusState private var focused: Bool
    init(font: BrandFont, update: @escaping (BrandFont) -> Void, remove: @escaping () -> Void) {
        self.font = font; self.update = update; self.remove = remove
        _family = State(initialValue: font.family)
    }
    private func commitFamily() {
        let clean = family.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { family = font.family; return }
        guard clean != font.family else { return }
        var new = font; new.family = clean; update(new)
    }
    var body: some View {
        HStack(spacing: 12) {
            TextField("Family", text: $family).textFieldStyle(.roundedBorder).frame(width: 180)
                .focused($focused).onSubmit(commitFamily).onChange(of: focused) { _, now in if !now { commitFamily() } }
            Picker("Weight", selection: Binding(get: { font.weight }, set: { var new = font; new.weight = $0; update(new) })) {
                ForEach(Array(stride(from: 100, through: 900, by: 100)), id: \.self) { Text("\($0)").tag($0) }
            }.labelsHidden().pickerStyle(.menu).controlSize(.small).fixedSize().help("Weight")
            Picker("Style", selection: Binding(get: { font.style == "italic" ? "italic" : "normal" }, set: { var new = font; new.style = $0; update(new) })) {
                Text("Normal").tag("normal"); Text("Italic").tag("italic")
            }.labelsHidden().pickerStyle(.menu).controlSize(.small).fixedSize().help("Style")
            Text((font.file as NSString).lastPathComponent).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
            Spacer(minLength: 4)
            Button(role: .destructive, action: remove) { Image(systemName: "trash") }.buttonStyle(.borderless).help("Remove this font file").accessibilityLabel("Remove")
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .contextMenu { Button("Remove", role: .destructive, action: remove) }
    }
}

// MARK: - Media

private struct MediaTile: View {
    let item: BrandMedia
    let url: URL
    let update: (BrandMedia) -> Void
    let remove: () -> Void
    @State private var tags: String
    @FocusState private var focused: Bool
    private static let kinds = [("screenshot", "Screenshot"), ("image", "Image"), ("icon", "Icon"), ("video", "Video"), ("guideline", "Guideline")]
    init(item: BrandMedia, url: URL, update: @escaping (BrandMedia) -> Void, remove: @escaping () -> Void) {
        self.item = item; self.url = url; self.update = update; self.remove = remove
        _tags = State(initialValue: item.tags.joined(separator: ", "))
    }
    private var parsedTags: [String] { tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } }
    private func commitTags() {
        guard parsedTags != item.tags else { return }
        var new = item; new.tags = parsedTags; update(new)
    }
    private var symbol: String? {
        switch url.pathExtension.lowercased() {
        case "mp4", "mov", "m4v", "webm": "film"
        case "pdf": "doc.richtext"
        default: nil
        }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack {
                Color(nsColor: .controlBackgroundColor)
                if let symbol { Image(systemName: symbol).font(.system(size: 26, weight: .light)).foregroundStyle(.secondary) }
                else { BrandLogoImage(url: url).padding(6) }
            }
            .frame(height: 96).clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color(nsColor: .separatorColor)))
            Text(url.lastPathComponent).font(.system(size: 11, weight: .medium)).lineLimit(1).truncationMode(.middle)
            HStack {
                Picker("Kind", selection: Binding(get: { item.kind }, set: { var new = item; new.kind = $0; update(new) })) {
                    ForEach(Self.kinds, id: \.0) { Text($0.1).tag($0.0) }
                }.labelsHidden().pickerStyle(.menu).controlSize(.small).fixedSize()
                Spacer()
                Button(role: .destructive, action: remove) { Image(systemName: "trash") }.buttonStyle(.borderless).help("Remove").accessibilityLabel("Remove")
            }
            TextField("Tags, separated by commas", text: $tags).textFieldStyle(.roundedBorder).controlSize(.small)
                .focused($focused).onSubmit(commitTags).onChange(of: focused) { _, now in if !now { commitTags() } }
        }
        .padding(10).frame(maxWidth: .infinity, alignment: .leading).workspacePanel()
        .contextMenu { Button("Remove", role: .destructive, action: remove) }
    }
}
