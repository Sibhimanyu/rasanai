import AppKit
import SwiftUI
import StudioCore
import UniformTypeIdentifiers

// MARK: - Helpers

extension Color {
    /// "#RRGGBB" -> Color. Falls back to clear for malformed input.
    init(brandHex hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let full = h.count == 3 ? h.map { "\($0)\($0)" }.joined() : h
        guard full.count == 6, let v = UInt32(full, radix: 16) else { self = .clear; return }
        self.init(.sRGB, red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255,
                  blue: Double(v & 0xFF) / 255, opacity: 1)
    }
}

struct BrandLogoImage: View {
    let url: URL
    @State private var image: NSImage?
    var body: some View {
        Group {
            if let image { Image(nsImage: image).resizable().scaledToFit() }
            else { Color.clear }
        }
        .task(id: url) {
            let file = url
            let loaded = await Task.detached(priority: .userInitiated) { () -> NSImage? in
                guard let source = NSImage(contentsOf: file),
                      let pixels = source.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
                return NSImage(cgImage: pixels, size: source.size)
            }.value
            guard !Task.isCancelled else { return }
            image = loaded
        }
    }
}

private struct SwatchStrip: View {
    let colors: [String]
    var body: some View {
        ZStack {
            if colors.isEmpty {
                LinearGradient(colors: [Color.accentColor.opacity(0.18), Color.accentColor.opacity(0.06)],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
                Image(systemName: "swatchpalette").font(.system(size: 22, weight: .light)).foregroundStyle(.tertiary)
            } else {
                HStack(spacing: 0) { ForEach(colors, id: \.self) { Color(brandHex: $0) } }
            }
        }
    }
}

// MARK: - Grid

struct BrandsView: View {
    @Bindable var store: StudioStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var brands: [Brand] = []
    @State private var loaded = false
    @State private var reloadGeneration = 0
    @State private var showNew = false
    private var root: URL { URL(fileURLWithPath: store.settings.projectRoot, isDirectory: true) }
    private let columns = [GridItem(.adaptive(minimum: 220, maximum: 300), spacing: 18)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PageTitle(text: "Brands")
                if !loaded { PageLoadingView(title: "brands") }
                else if brands.isEmpty { empty } else { grid }
            }
            .pageColumn()
        }
        .background(Color.appBackground)
        .navigationTitle("Brands")
        .pageHeader("Brands") {
            Button { showNew = true } label: { Label("New brand", systemImage: "plus") }.help("New brand")
        }
        .onReceive(NotificationCenter.default.publisher(for: .studioCloseSheets)) { _ in showNew = false }
        .sheet(isPresented: $showNew) {
            NewBrandSheet(root: root) { brand, kit, name in
                reloadGeneration += 1
                if let kit { store.brandCompiler(for: brand.folder).start(kit: kit, brand: brand.folder, name: name, store: store) }
                store.path.append(.brand(brand.folder))
            }
        }
        .task(id: "\(root.path):\(reloadGeneration)") { await reload() }
    }

    private func reload() async {
        let folder = root
        let result = await Task.detached(priority: .userInitiated) { BrandLibrary.list(in: folder) }.value
        guard !Task.isCancelled else { return }
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.15)) { brands = result; loaded = true }
    }

    private var empty: some View {
        VStack(spacing: 14) {
            Image(systemName: "swatchpalette").font(.system(size: 40, weight: .light)).foregroundStyle(.tint)
            Text("Brands keep your colours, type and logo so every film looks like you.")
                .font(.system(size: 15)).multilineTextAlignment(.center).frame(maxWidth: 340)
            Button("New brand") { showNew = true }
                .buttonStyle(.rasanPrimary).controlSize(.large).padding(.top, 4)
        }.frame(maxWidth: .infinity, minHeight: 320)
    }

    private var grid: some View {
        LazyVGrid(columns: columns, spacing: 18) {
            ForEach(brands) { brand in
                BrandCard(brand: brand) { store.path.append(.brand(brand.folder)) }
            }
        }
    }
}

private struct BrandCard: View {
    let brand: Brand
    let open: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var hover = false
    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 0) {
                SwatchStrip(colors: brand.colors).frame(height: 84)
                    .overlay(alignment: .bottomTrailing) {
                        if let logo = brand.logo {
                            BrandLogoImage(url: logo).frame(width: 30, height: 30)
                                .padding(5).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                                .padding(8)
                        }
                    }
                VStack(alignment: .leading, spacing: 3) {
                    Text(brand.name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    Text(brand.fonts.first ?? "\(brand.colors.count) colour\(brand.colors.count == 1 ? "" : "s")")
                        .font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(14)
            }
            .workspacePanel()
            // Hover is a neutral edge, not the accent; nothing moves, since lifting or shadowing the text flickers it.
            .overlay { RoundedRectangle(cornerRadius: Workspace.radius, style: .continuous).strokeBorder(Color.primary.opacity(0.22), lineWidth: 1).opacity(hover ? 1 : 0) }
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
        .animation(reduceMotion ? nil : .snappy(duration: 0.18), value: hover)
        .contextMenu {
            Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([brand.folder]) }
        }
    }
}

// MARK: - New brand sheet

struct NewBrandSheet: View {
    let root: URL
    /// The brand, and the kit folder or .zip it is to be compiled from (with the name the person typed, if any).
    var onCreate: (Brand, URL?, String?) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var designURL: URL?
    @State private var kitURL: URL?
    @State private var pickingKit = false
    @State private var logoURL: URL?
    @State private var dropping = false
    @State private var error: String?
    @State private var working = false
    @FocusState private var focused: Bool
    private static let designExtensions = ["md", "markdown", "txt"]

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("New brand").font(.system(size: 20, weight: .semibold))
            TextField(kitURL == nil ? "Brand name" : "From the kit", text: $name).textFieldStyle(.roundedBorder).controlSize(.large).focused($focused)

            VStack(alignment: .leading, spacing: 8) {
                Text("Design system").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
                HStack(spacing: 10) {
                    choice("Blank template", "doc.badge.plus", selected: designURL == nil && kitURL == nil) { designURL = nil; kitURL = nil }
                    choice(designURL?.lastPathComponent ?? "Import DESIGN.md…", "square.and.arrow.down", selected: designURL != nil) { pickDesign() }
                    choice(kitURL?.lastPathComponent ?? "Brand kit folder…", "folder", selected: kitURL != nil) { pickingKit = true }
                }
                .onDrop(of: [.fileURL], isTargeted: $dropping) { providers in
                    guard let p = providers.first else { return false }
                    _ = p.loadObject(ofClass: URL.self) { url, _ in
                        if let url { Task { @MainActor in accept(url) } }
                    }
                    return true
                }
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color.accentColor, lineWidth: dropping ? 2 : 0).padding(-3))
                Text(hint)
                    .font(.system(size: 11)).foregroundStyle(.secondary)
            }

            if kitURL == nil { HStack {
                if let logoURL, let image = NSImage(contentsOf: logoURL) {
                    Image(nsImage: image).resizable().scaledToFit().frame(width: 28, height: 28)
                    Text(logoURL.lastPathComponent).font(.system(size: 12)).lineLimit(1)
                    Button { self.logoURL = nil } label: { Image(systemName: "xmark.circle.fill") }
                        .buttonStyle(.borderless).foregroundStyle(.secondary)
                } else {
                    Button("Add logo…") { pickLogo() }
                    Text("Optional").font(.system(size: 11)).foregroundStyle(.secondary)
                }
                Spacer()
            } }

            if let error { Text(error).font(.system(size: 12)).foregroundStyle(.red) }
            HStack {
                Spacer()
                if working { ProgressView().controlSize(.small); Text(kitURL == nil ? "Reading the brand’s files…" : "Setting up the brand…").font(.system(size: 11)).foregroundStyle(.secondary) }
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction).disabled(working)
                Button("Create") { create() }.buttonStyle(.rasanPrimary)
                    .keyboardShortcut(.defaultAction)
                    .disabled((name.trimmingCharacters(in: .whitespaces).isEmpty && kitURL == nil) || working)
            }
        }
        .padding(24).frame(width: 520).interactiveDismissDisabled(working)
        .onAppear { focused = true }
        .fileImporter(isPresented: $pickingKit, allowedContentTypes: [.folder, .zip]) { result in
            if case .success(let url) = result { accept(url) }
        }
        .animation(reduceMotion ? nil : .snappy, value: designURL)
        .animation(reduceMotion ? nil : .snappy, value: kitURL)
    }

    private func choice(_ title: String, _ symbol: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: symbol).lineLimit(1).font(.system(size: 12, weight: .medium))
                .frame(maxWidth: .infinity).padding(.vertical, 10)
                .background(selected ? Color.primary.opacity(0.12) : Color(nsColor: .controlBackgroundColor),
                            in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(selected ? Color.primary.opacity(0.5) : Color(nsColor: .separatorColor)))
        }.buttonStyle(.plain).accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var hint: String {
        if kitURL != nil { return "RasanAI reads everything in the kit, then Claude writes the design system and sorts the logos, fonts and images. This takes a few minutes; the brand opens right away." }
        return designURL == nil ? "Starts with Colours, Typography and Motion sections for you to fill in." : "Colours and fonts are read from the file. Logos, fonts and images it points to are pulled in."
    }

    private func accept(_ url: URL) {
        let isFolder = (try? url.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true
        if isFolder || url.pathExtension.lowercased() == "zip" { error = nil; kitURL = url; designURL = nil; logoURL = nil; return }
        guard Self.designExtensions.contains(url.pathExtension.lowercased()) else {
            error = "Drop a .md, .markdown or .txt design system, or a brand kit folder or .zip. Add logos, fonts and images from the brand page after you create it."; return
        }
        error = nil; kitURL = nil; designURL = url; if name.isEmpty { name = suggested(url) }
    }

    private func suggested(_ url: URL) -> String {
        let base = url.deletingPathExtension().lastPathComponent
        return base.uppercased() == "DESIGN" ? "" : base
    }

    private func pickDesign() {
        let panel = NSOpenPanel()
        panel.title = "Choose a DESIGN.md"
        panel.allowedContentTypes = ["md", "markdown"].compactMap { UTType(filenameExtension: $0) } + [.plainText]
        if panel.runModal() == .OK, let url = panel.url { accept(url) }
    }

    private func pickLogo() {
        let panel = NSOpenPanel()
        panel.title = "Choose a logo"
        panel.allowedContentTypes = [.image, .pdf]
        if panel.runModal() == .OK { logoURL = panel.url }
    }

    private func create() {
        working = true; error = nil
        let name = name, design = designURL, logo = logoURL, kit = kitURL, root = root
        Task {
            do {
                if let kit {
                    // The compile job (started by the page that opened this sheet) copies the kit's files in and writes the design system.
                    let brand = try await Task.detached { try BrandLibrary.createFromKit(kit, name: name, in: root) }.value
                    working = false; dismiss()
                    onCreate(brand, kit, name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : name)
                    return
                }
                let brand = try await Task.detached { try BrandLibrary.create(name: name, importing: design, logo: logo, in: root) }.value
                // Pull in what DESIGN.md points to and check the brand; the brand page then shows anything still missing.
                if BrandEngine.available { await BrandEngine.importAndCheck(brand.folder, design: design) }
                working = false
                dismiss()
                onCreate(brand, nil, nil)
            } catch { self.error = error.localizedDescription; working = false }
        }
    }
}

// MARK: - Brand page

struct BrandPage: View {
    @Bindable var store: StudioStore
    let brand: URL
    @State private var model: Brand?
    @State private var text = ""
    @State private var confirmDelete = false
    @State private var error: String?
    @State private var showEditor = false
    @State private var loaded = false
    @State private var reloadGeneration = 0
    @State private var checkedGeneration = -1
    @State private var report = BrandKitReport()
    private var compiler: BrandCompiler { store.brandCompiler(for: brand) }

    var body: some View {
        Group {
            if let model { content(model) }
            else if !loaded { PageLoadingView(title: "brand") }
            else { Text("This brand is no longer in your library.").foregroundStyle(.secondary) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.appBackground)
        .navigationTitle(model?.name ?? "Brand")
        .onChange(of: compiler.state) { _, _ in reloadGeneration += 1 }
        // While Claude works the manifest fills in; show it as it goes.
        .task(id: compiler.isRunning) {
            while compiler.isRunning, !Task.isCancelled {
                try? await Task.sleep(for: .seconds(6))
                if compiler.isRunning, !Task.isCancelled { reloadGeneration += 1 }
            }
        }
        .task(id: "\(brand.path):\(reloadGeneration)") { await reload() }
        .onReceive(NotificationCenter.default.publisher(for: .studioCloseSheets)) { _ in showEditor = false }
        .sheet(isPresented: $showEditor) {
            if let model {
                BrandEditorSheet(brand: model, design: text) {
                    reloadGeneration += 1
                    let folder = brand
                    Task { await BrandEngine.check(folder); reloadGeneration += 1 }
                }
            }
        }
        .pageHeader(model?.name ?? "Brand") {
            Button { showEditor = true } label: { Label("Edit Brand…", systemImage: "pencil") }.help("Edit colours, fonts and logo").disabled(model == nil)
            Menu {
                Button("Edit in TextEdit") { edit() }
                Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([brand]) }
                if let kit = model?.kit, FileManager.default.fileExists(atPath: kit.path) {
                    Button("Recompile from kit") { recompile(kit) }.disabled(compiler.isRunning)
                }
                Divider()
                Button("Delete Brand…", role: .destructive) { confirmDelete = true }
            } label: { Label("More", systemImage: "ellipsis") }
                .menuIndicator(.hidden).help("More").tint(.primary)   // a toolbar tool, white like its neighbours, not the brand tint
        }
        .confirmationDialog("Move \(model?.name ?? "this brand") to the Trash?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Move to Trash", role: .destructive) {
                if let model { do { compiler.cancel(); try BrandLibrary.delete(model); store.path.removeLast() } catch { self.error = error.localizedDescription } }
            }
        } message: { Text("Films that already use it keep their own copy.") }
        .alert("Couldn’t move the brand to the Trash", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "") }
    }

    private func recompile(_ kit: URL) {
        compiler.start(kit: kit, brand: brand, name: nil, store: store)
    }

    private func reload() async {
        let folder = brand
        let result = await Task.detached(priority: .userInitiated) {
            (BrandLibrary.load(folder), (try? String(contentsOf: folder.appendingPathComponent("DESIGN.md"), encoding: .utf8)) ?? "", BrandKitReport.load(folder))
        }.value
        guard !Task.isCancelled else { return }
        model = result.0; text = result.1; report = result.2; loaded = true
        // No check yet, or DESIGN.md changed since (edited in TextEdit): run the cheap check once and show its result.
        if let loadedBrand = result.0, loadedBrand.check == nil, BrandEngine.available, !compiler.isRunning, checkedGeneration != reloadGeneration {
            checkedGeneration = reloadGeneration
            await BrandEngine.check(folder)
            guard !Task.isCancelled else { return }
            let refreshed = await Task.detached(priority: .userInitiated) { BrandLibrary.load(folder) }.value
            if let refreshed { model = refreshed }
        }
    }

    private func edit() {
        let design = brand.appendingPathComponent("DESIGN.md")
        if let textEdit = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.TextEdit") {
            NSWorkspace.shared.open([design], withApplicationAt: textEdit, configuration: NSWorkspace.OpenConfiguration())
        } else { NSWorkspace.shared.open(design) }
    }

    private func content(_ b: Brand) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                HStack(alignment: .center, spacing: 16) {
                    if let logo = b.logo {
                        BrandLogoImage(url: logo).frame(width: 56, height: 56)
                            .padding(8).background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color(nsColor: .separatorColor)))
                    }
                    if !b.fonts.isEmpty {
                        Text(b.fonts.joined(separator: " · ")).font(.system(size: 13)).foregroundStyle(.secondary)
                    }
                    Spacer()
                }
                if let summary = report.summary {
                    Text(summary).font(.system(size: 13)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
                }

                if !b.colors.isEmpty {
                    HStack(spacing: 12) {
                        ForEach(b.colors, id: \.self) { hex in
                            VStack(spacing: 8) {
                                RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color(brandHex: hex))
                                    .frame(height: 88)
                                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color(nsColor: .separatorColor)))
                                Text(hex).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary)
                                if let role = b.colorRoles[hex], !role.isEmpty { Text(role).font(.system(size: 10)).foregroundStyle(.tertiary).lineLimit(1) }
                            }
                            .contentShape(Rectangle())
                            .onTapGesture {
                                NSPasteboard.general.clearContents(); NSPasteboard.general.setString(hex, forType: .string)
                                store.announce("Copied \(hex)")
                            }
                            .help("Click to copy \(hex)")
                            .accessibilityElement(children: .combine).accessibilityLabel("Colour \(hex)").accessibilityHint("Copies the colour")
                            .accessibilityAddTraits(.isButton)
                            .accessibilityAction(.default) {
                                NSPasteboard.general.clearContents(); NSPasteboard.general.setString(hex, forType: .string)
                                store.announce("Copied \(hex)")
                            }
                        }
                    }
                }

                BrandAssetsSection(brand: b, report: report, compiler: compiler, retry: b.kit.map { kit in { recompile(kit) } }) { reloadGeneration += 1 }

                if let rules = report.rules {
                    DisclosureGroup {
                        MarkdownText(text: rules).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 8)
                    } label: { Text("Brand rules").font(.system(size: 15, weight: .semibold)) }
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text("DESIGN.md").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
                    MarkdownText(text: text)
                        .frame(maxWidth: .infinity, alignment: .leading).workspacePanel(padding: 18)
                }
            }
            .pageColumn()
        }
    }
}

/// Line-by-line markdown: headings sized by level, inline styling kept.
private struct MarkdownText: View {
    let text: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(text.components(separatedBy: "\n").enumerated()), id: \.offset) { _, line in
                row(line)
            }
        }.textSelection(.enabled)
    }
    @ViewBuilder private func row(_ raw: String) -> some View {
        let line = raw.trimmingCharacters(in: .whitespaces)
        if line.isEmpty { Color.clear.frame(height: 4) }
        else if line.hasPrefix("<!--") { EmptyView() }
        else if line.hasPrefix("#") {
            let level = line.prefix { $0 == "#" }.count
            Text(inline(line.drop { $0 == "#" || $0 == " " }))
                .font(.system(size: level == 1 ? 18 : level == 2 ? 15 : 13, weight: .semibold))
                .padding(.top, level <= 2 ? 8 : 2)
        } else if line.hasPrefix("- ") || line.hasPrefix("* ") {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("\u{2022}").foregroundStyle(.secondary)
                Text(inline(line.dropFirst(2))).font(.system(size: 13))
            }
        } else if line.hasPrefix("```") || line.hasPrefix("---") { EmptyView() }
        else { Text(inline(Substring(line))).font(.system(size: 13)) }
    }
    private func inline(_ s: Substring) -> AttributedString {
        (try? AttributedString(markdown: String(s), options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)))
            ?? AttributedString(String(s))
    }
}
