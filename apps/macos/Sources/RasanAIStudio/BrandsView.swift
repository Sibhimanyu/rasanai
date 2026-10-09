import AppKit
import SwiftUI
import StudioCore
import UniformTypeIdentifiers

// MARK: - Helpers

extension Color {
    /// "#RRGGBB" -> Color. Falls back to clear for malformed input.
    init(brandHex hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard h.count == 6, let v = UInt32(h, radix: 16) else { self = .clear; return }
        self.init(.sRGB, red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255,
                  blue: Double(v & 0xFF) / 255, opacity: 1)
    }
}

private func brandLogoImage(_ url: URL?) -> NSImage? {
    guard let url else { return nil }
    return NSImage(contentsOf: url)
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
    @State private var brands: [Brand] = []
    @State private var showNew = false
    private var root: URL { URL(fileURLWithPath: store.settings.projectRoot, isDirectory: true) }
    private let columns = [GridItem(.adaptive(minimum: 220, maximum: 300), spacing: 18)]

    var body: some View {
        Group {
            if brands.isEmpty { empty } else { grid }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(nsColor: .windowBackgroundColor))
        .navigationTitle("Brands")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showNew = true } label: { Label("New Brand", systemImage: "plus") }
                    .help("New brand")
            }
        }
        .sheet(isPresented: $showNew) {
            NewBrandSheet(root: root) { brand in
                reload()
                store.path.append(.brand(brand.folder))
            }
        }
        .onAppear(perform: reload)
    }

    private func reload() { withAnimation(.snappy) { brands = BrandLibrary.list(in: root) } }

    private var empty: some View {
        VStack(spacing: 14) {
            Image(systemName: "swatchpalette").font(.system(size: 40, weight: .light)).foregroundStyle(.tint)
            Text("Brands keep your colours, type and logo so every film looks like you.")
                .font(.system(size: 15)).multilineTextAlignment(.center).frame(maxWidth: 340)
            Button("New brand") { showNew = true }
                .buttonStyle(.borderedProminent).controlSize(.large).padding(.top, 4)
        }.padding(32)
    }

    private var grid: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Brands").font(.system(size: 22, weight: .semibold))
                LazyVGrid(columns: columns, spacing: 18) {
                    ForEach(brands) { brand in
                        BrandCard(brand: brand) { store.path.append(.brand(brand.folder)) }
                    }
                    NewBrandCard { showNew = true }
                }
            }.padding(28)
        }
    }
}

private struct BrandCard: View {
    let brand: Brand
    let open: () -> Void
    @State private var hover = false
    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 0) {
                SwatchStrip(colors: brand.colors).frame(height: 84)
                    .overlay(alignment: .bottomTrailing) {
                        if let image = brandLogoImage(brand.logo) {
                            Image(nsImage: image).resizable().scaledToFit().frame(width: 30, height: 30)
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
            .background(Color(nsColor: .controlBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(hover ? Color.accentColor.opacity(0.5) : Color(nsColor: .separatorColor)))
            // The shadow is the card's shape only, and nothing moves: shadowing or lifting the text flickers it.
            .background { RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color(nsColor: .controlBackgroundColor)).shadow(color: .black.opacity(hover ? 0.12 : 0), radius: 10, y: 4) }
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
        .animation(.snappy(duration: 0.18), value: hover)
        .contextMenu {
            Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([brand.folder]) }
        }
    }
}

private struct NewBrandCard: View {
    let action: () -> Void
    @State private var hover = false
    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: "plus").font(.system(size: 18, weight: .medium))
                    .frame(width: 40, height: 40)
                    .background(Color.accentColor.opacity(0.12), in: Circle())
                    .foregroundStyle(.tint)
                Text("New brand").font(.system(size: 13, weight: .medium))
            }
            .frame(maxWidth: .infinity, minHeight: 144)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(hover ? Color.accentColor.opacity(0.6) : Color(nsColor: .separatorColor),
                              style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
        .animation(.snappy(duration: 0.18), value: hover)
    }
}

// MARK: - New brand sheet

struct NewBrandSheet: View {
    let root: URL
    var onCreate: (Brand) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var designURL: URL?
    @State private var logoURL: URL?
    @State private var dropping = false
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("New brand").font(.system(size: 20, weight: .semibold))
            TextField("Brand name", text: $name).textFieldStyle(.roundedBorder).controlSize(.large).focused($focused)

            VStack(alignment: .leading, spacing: 8) {
                Text("Design system").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
                HStack(spacing: 10) {
                    choice("Blank template", "doc.badge.plus", selected: designURL == nil) { designURL = nil }
                    choice(designURL?.lastPathComponent ?? "Import DESIGN.md…", "square.and.arrow.down", selected: designURL != nil) { pickDesign() }
                }
                .onDrop(of: [.fileURL], isTargeted: $dropping) { providers in
                    guard let p = providers.first else { return false }
                    _ = p.loadObject(ofClass: URL.self) { url, _ in
                        if let url { Task { @MainActor in designURL = url; if name.isEmpty { name = suggested(url) } } }
                    }
                    return true
                }
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color.accentColor, lineWidth: dropping ? 2 : 0).padding(-3))
                Text(designURL == nil ? "Starts with Colours, Typography and Motion sections for you to fill in." : "Colours and fonts are read from the file.")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
            }

            HStack {
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
            }

            if let error { Text(error).font(.system(size: 12)).foregroundStyle(.red) }
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("Create") { create() }.buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(24).frame(width: 440)
        .onAppear { focused = true }
        .animation(.snappy, value: designURL)
    }

    private func choice(_ title: String, _ symbol: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: symbol).lineLimit(1).font(.system(size: 12, weight: .medium))
                .frame(maxWidth: .infinity).padding(.vertical, 10)
                .background(selected ? Color.accentColor.opacity(0.14) : Color(nsColor: .controlBackgroundColor),
                            in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(selected ? Color.accentColor : Color(nsColor: .separatorColor)))
                .foregroundStyle(selected ? AnyShapeStyle(.tint) : AnyShapeStyle(.primary))
        }.buttonStyle(.plain)
    }

    private func suggested(_ url: URL) -> String {
        let base = url.deletingPathExtension().lastPathComponent
        return base.uppercased() == "DESIGN" ? "" : base
    }

    private func pickDesign() {
        let panel = NSOpenPanel()
        panel.title = "Choose a DESIGN.md"
        panel.allowedContentTypes = [UTType(filenameExtension: "md") ?? .plainText, .plainText]
        if panel.runModal() == .OK, let url = panel.url { designURL = url; if name.isEmpty { name = suggested(url) } }
    }

    private func pickLogo() {
        let panel = NSOpenPanel()
        panel.title = "Choose a logo"
        panel.allowedContentTypes = [.image, .pdf]
        if panel.runModal() == .OK { logoURL = panel.url }
    }

    private func create() {
        do {
            let brand = try BrandLibrary.create(name: name, importing: designURL, logo: logoURL, in: root)
            dismiss()
            onCreate(brand)
        } catch { self.error = error.localizedDescription }
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

    var body: some View {
        Group {
            if let model { content(model) }
            else { Text("This brand is no longer in your library.").foregroundStyle(.secondary) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(nsColor: .windowBackgroundColor))
        .navigationTitle(model?.name ?? "Brand")
        .onAppear(perform: reload)
        .sheet(isPresented: $showEditor) {
            if let model { BrandEditorSheet(brand: model, design: text) { reload() } }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button("Edit Brand…") { reload(); showEditor = true }
                    Button("Edit in TextEdit") { edit() }
                    Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([brand]) }
                    Divider()
                    Button("Delete Brand…", role: .destructive) { confirmDelete = true }
                } label: { Image(systemName: "ellipsis.circle") }
            }
        }
        .confirmationDialog("Move \(model?.name ?? "this brand") to the Trash?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Move to Trash", role: .destructive) {
                if let model { do { try BrandLibrary.delete(model); store.path.removeLast() } catch { self.error = error.localizedDescription } }
            }
        } message: { Text("Films that already use it keep their own copy.") }
        .alert("Brand", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "") }
    }

    private func reload() {
        model = BrandLibrary.load(brand)
        text = (try? String(contentsOf: brand.appendingPathComponent("DESIGN.md"), encoding: .utf8)) ?? ""
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
                    if let image = brandLogoImage(b.logo) {
                        Image(nsImage: image).resizable().scaledToFit().frame(width: 56, height: 56)
                            .padding(8).background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color(nsColor: .separatorColor)))
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text(b.name).font(.system(size: 22, weight: .semibold))
                        if !b.fonts.isEmpty {
                            Text(b.fonts.joined(separator: " · ")).font(.system(size: 13)).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    Button("Edit brand…") { reload(); showEditor = true }.buttonStyle(.borderedProminent)
                }

                if !b.colors.isEmpty {
                    HStack(spacing: 12) {
                        ForEach(b.colors, id: \.self) { hex in
                            VStack(spacing: 8) {
                                RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color(brandHex: hex))
                                    .frame(height: 88)
                                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color(nsColor: .separatorColor)))
                                Text(hex).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary)
                            }
                            .onTapGesture {
                                NSPasteboard.general.clearContents(); NSPasteboard.general.setString(hex, forType: .string)
                            }
                            .help("Click to copy \(hex)")
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("DESIGN.md").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
                        Spacer()
                        Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([b.designFile]) }
                            .buttonStyle(.link).font(.system(size: 11))
                    }
                    MarkdownText(text: text)
                        .padding(18).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color(nsColor: .separatorColor)))
                }
            }
            .padding(28).frame(maxWidth: 760).frame(maxWidth: .infinity)
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
        else if line.hasPrefix("#") {
            let level = line.prefix { $0 == "#" }.count
            Text(inline(line.drop { $0 == "#" || $0 == " " }))
                .font(.system(size: level == 1 ? 18 : level == 2 ? 15 : 13, weight: .semibold))
                .padding(.top, level <= 2 ? 8 : 2)
        } else if line.hasPrefix("- ") || line.hasPrefix("* ") {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("•").foregroundStyle(.secondary)
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
