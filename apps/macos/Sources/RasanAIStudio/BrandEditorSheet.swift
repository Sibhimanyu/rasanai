import AppKit
import StudioCore
import SwiftUI
import UniformTypeIdentifiers

struct BrandEditorSheet: View {
    let brand: Brand
    let design: String
    let onSave: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var colors: [String]
    @State private var displayFont: String
    @State private var bodyFont: String
    @State private var logo: URL?
    @State private var removeLogo = false
    @State private var saving = false
    @State private var error: String?
    private let fontFamilies = NSFontManager.shared.availableFontFamilies.sorted()
    init(brand: Brand, design: String, onSave: @escaping () -> Void) {
        self.brand = brand; self.design = design; self.onSave = onSave
        _name = State(initialValue: brand.name)
        _colors = State(initialValue: brand.colors.isEmpty ? ["#0B0B12", "#F5F5FA", "#4F46E5", "#F59E0B"] : brand.colors)
        _displayFont = State(initialValue: brand.fonts.first ?? "Inter")
        _bodyFont = State(initialValue: brand.fonts.dropFirst().first ?? brand.fonts.first ?? "Inter")
    }
    private var valid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !displayFont.isEmpty && !bodyFont.isEmpty && colors.allSatisfy { $0.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Edit brand").font(.system(size: 24, weight: .semibold))
            ScrollView {
                HStack(alignment: .top, spacing: 28) {
                    VStack(alignment: .leading, spacing: 18) {
                        TextField("Brand name", text: $name).textFieldStyle(.roundedBorder)
                        Text("Colours").font(.headline)
                        ForEach(colors.indices, id: \.self) { index in
                            HStack {
                                ColorPicker("Colour \(index + 1)", selection: colorBinding(index), supportsOpacity: false)
                                TextField("#RRGGBB", text: $colors[index]).font(.system(size: 12, design: .monospaced)).textFieldStyle(.roundedBorder).frame(width: 95)
                            }
                        }
                        Text("Typography").font(.headline)
                        fontField("Display", value: $displayFont)
                        fontField("Body", value: $bodyFont)
                        Text("Use a font installed on your Mac, or enter your brand's font name.").font(.caption).foregroundStyle(.secondary)
                        HStack {
                            Button("Replace logo…") { pickLogo() }
                            if logo != nil || (brand.logo != nil && !removeLogo) {
                                Button("Remove") { logo = nil; removeLogo = true }
                            }
                        }
                    }.frame(width: 300)
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Preview").font(.headline)
                        VStack(alignment: .leading, spacing: 18) {
                            if let url = logo ?? (removeLogo ? nil : brand.logo), let image = NSImage(contentsOf: url) {
                                Image(nsImage: image).resizable().scaledToFit().frame(width: 64, height: 64)
                            }
                            Text(name.isEmpty ? "Your brand" : name).font(.custom(displayFont, size: 30)).fixedSize(horizontal: false, vertical: true)
                            Text("A film that looks and feels like you.").font(.custom(bodyFont, size: 15))
                            Text("Your next story").font(.custom(bodyFont, size: 13)).padding(.horizontal, 14).padding(.vertical, 9)
                                .background(Color(brandHex: colors[min(2, colors.count - 1)]), in: Capsule())
                        }
                        .foregroundStyle(Color(brandHex: colors[min(1, colors.count - 1)]))
                        .padding(24).frame(width: 310, alignment: .topLeading).frame(minHeight: 300, alignment: .topLeading)
                        .background(Color(brandHex: colors[0]), in: RoundedRectangle(cornerRadius: 14))
                        Text("Motion, voice and other design notes are retained. Existing films keep the brand copy they were created with.")
                            .font(.caption).foregroundStyle(.secondary).frame(width: 310)
                    }
                }.padding(.vertical, 4)
            }.disabled(saving)
            if let error { Text(error).font(.caption).foregroundStyle(.red).textSelection(.enabled) }
            HStack {
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction).disabled(saving)
                Spacer()
                if saving { ProgressView().controlSize(.small) }
                Button("Save brand") { save() }.buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction).disabled(!valid || saving)
            }
        }.padding(26).frame(width: 700, height: 630).interactiveDismissDisabled(saving)
    }
    private func colorBinding(_ index: Int) -> Binding<Color> {
        Binding(get: { Color(brandHex: colors[index]) }, set: { value in
            guard let color = NSColor(value).usingColorSpace(.sRGB) else { return }
            func channel(_ value: CGFloat) -> Int { Int((min(1, max(0, value)) * 255).rounded()) }
            colors[index] = String(format: "#%02X%02X%02X", channel(color.redComponent), channel(color.greenComponent), channel(color.blueComponent))
        })
    }
    private func fontField(_ label: String, value: Binding<String>) -> some View {
        HStack {
            TextField(label, text: value).textFieldStyle(.roundedBorder)
            Menu { ForEach(fontFamilies, id: \.self) { font in Button(font) { value.wrappedValue = font } } } label: { Image(systemName: "chevron.down") }
                .menuStyle(.borderlessButton).fixedSize().help("Choose an installed font")
        }
    }
    private func pickLogo() {
        let panel = NSOpenPanel(); panel.title = "Choose a logo"; panel.allowedContentTypes = [.image, .pdf, UTType(filenameExtension: "svg")].compactMap { $0 }; panel.canChooseDirectories = false
        if panel.runModal() == .OK { logo = panel.url; removeLogo = false }
    }
    private func save() {
        saving = true; error = nil
        let name = name, colors = colors, fonts = [displayFont, bodyFont], logo = logo, removeLogo = removeLogo
        Task {
            do {
                _ = try await Task.detached { try BrandLibrary.update(brand, name: name, colors: colors, fonts: fonts, originalText: design, logo: logo, removeLogo: removeLogo) }.value
                saving = false; onSave(); dismiss()
            } catch { self.error = error.localizedDescription; saving = false }
        }
    }
}
