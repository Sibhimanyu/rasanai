import StudioCore
import SwiftUI

extension FormatCatalog {
    /// The catalogue from the installed skill (the same place the app finds the rest of the skill), or nil, in which
    /// case the old kind menu stays.
    @MainActor static let installed: FormatCatalog? = FormatCatalog.load(engine: DirectorRuntime.engineURL)
}

/// "What are you making?": one editable chip when a format is picked (with the reason and Change), otherwise the
/// tile grid; picking a tile shows its options. Used in New film and in the Brief stage.
struct FormatPickerView: View {
    let catalog: FormatCatalog
    let pick: FormatPick?
    var canAct = true
    var onPick: (FormatCatalog.Option) -> Void
    var onScope: (String?) -> Void

    /// Open means the grid shows even with a pick (the person pressed Change). With no pick it is always shown.
    @Binding var changing: Bool
    /// False when the format chip lives in the prompt box toolbar instead.
    var showsChip = true
    /// The New film page keeps the grid on show, under the prompt, with or without a pick.
    var alwaysGrid = false
    /// False where the scope question is already on the page beside it (the New film format popover).
    var showsScope = true
    @State private var openTile: String?

    private var option: FormatCatalog.Option? { catalog.option(pick?.option) }
    private var showGrid: Bool { alwaysGrid || option == nil || changing }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if showsChip, let option { chip(option) }
            if showsScope, let option, option.scopeQuestion != nil, option.status != .soon { scopeQuestion(option) }
            if showGrid { grid }
        }
        .animation(.snappy(duration: 0.2), value: changing)
        .animation(.snappy(duration: 0.2), value: openTile)
        .onChange(of: pick?.option) { _, _ in changing = false }
        .accessibilityElement(children: .contain)
    }

    // MARK: Chip

    private func chip(_ option: FormatCatalog.Option) -> some View {
        let tile = catalog.tile(option.tile)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: FormatPickerView.symbol(option.tile)).font(.system(size: 14, weight: .medium)).foregroundStyle(Color.rasan)
                (Text(tile?.title ?? option.tile).foregroundStyle(.secondary) + Text("  ›  ").foregroundStyle(.tertiary) + Text(option.title).foregroundStyle(.primary))
                    .font(.system(size: 14, weight: .semibold))
                if option.status == .soon { ComingSoonBadge() }
                Spacer(minLength: 8)
                if canAct {
                    Button(changing ? "Done" : "Change") { changing.toggle() }
                        .controlSize(.small).accessibilityLabel(changing ? "Close the format list" : "Change the format")
                }
            }
            if let why = pick?.why, !why.isEmpty {
                Text(why.hasSuffix(".") ? why : why + ".").font(.system(size: 12)).foregroundStyle(.secondary)
            }
            if option.status == .soon, let soon = option.soon {
                Text(soon.missing).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                if canAct, let near = catalog.nearest(of: option) {
                    Button("Use \(near.title) instead") { onPick(near) }.controlSize(.small)
                }
            } else if option.status == .partial, let partial = option.partial {
                Label(partial, systemImage: "info.circle").font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.rasan.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color.rasan.opacity(0.35), lineWidth: 0.8) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Format: \(tile?.title ?? "") \(option.title)")
    }

    // MARK: Scope question (feature launch)

    private func scopeQuestion(_ option: FormatCatalog.Option) -> some View {
        let question = option.scopeQuestion!
        let current = pick?.scope
        return VStack(alignment: .leading, spacing: 8) {
            Text(question.question).font(.system(size: 13, weight: .semibold))
            FlowLayout(spacing: 8) {
                ForEach(question.options) { choice in
                    scopeButton(choice.label, help: choice.description, selected: current == choice.scope) { onScope(choice.scope) }
                }
                scopeButton(question.unsure, help: nil, selected: current == nil) { onScope(nil) }
            }
        }
        .disabled(!canAct)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(question.question)
    }

    private func scopeButton(_ title: String, help: String?, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: selected ? "largecircle.fill.circle" : "circle").font(.system(size: 11))
                Text(title).font(.system(size: 12.5, weight: .medium))
            }
            .foregroundStyle(Color.primary)
            .padding(.horizontal, 12).frame(height: 30)
            .background(selected ? Color.primary.opacity(0.14) : Color.primary.opacity(0.06), in: Capsule())
            .overlay { if selected { Capsule().strokeBorder(Color.primary.opacity(0.3), lineWidth: 0.8) } }
        }
        .buttonStyle(.plain).help(help ?? "")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    // MARK: Grid

    /// Opening a tile scrolls whatever scroll view holds the picker (the New film page, the popover, the Brief call) to its
    /// options, which open under the whole grid and would otherwise be out of sight.
    private var grid: some View {
        ScrollViewReader { proxy in
            VStack(alignment: .leading, spacing: 12) {
                if option == nil || alwaysGrid {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("What are you making?").font(.system(size: 15, weight: .semibold)).accessibilityAddTraits(.isHeader)
                        if alwaysGrid { Text("Optional. RasanAI picks one from your words.").font(.system(size: 12)).foregroundStyle(.secondary) }
                    }
                }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 230), spacing: 10, alignment: .top)], alignment: .leading, spacing: 10) {
                    ForEach(catalog.tiles) { tile in tileButton(tile) }
                }
                if let id = openTile, let tile = catalog.tile(id) { options(of: tile).id(FormatPickerView.optionsAnchor) }
            }
            .onChange(of: openTile) { _, id in
                guard id != nil else { return }
                // After the options are laid out, or there is nothing to scroll to yet.
                DispatchQueue.main.async { withAnimation(.snappy(duration: 0.35)) { proxy.scrollTo(FormatPickerView.optionsAnchor, anchor: .top) } }
            }
        }
    }
    private static let optionsAnchor = "format-options"

    private func tileButton(_ tile: FormatCatalog.Tile) -> some View {
        let selected = openTile == tile.id || (openTile == nil && pick?.tile == tile.id)
        return Button { openTile = openTile == tile.id ? nil : tile.id } label: {
            // Compact and the same size: icon beside the words, so twelve tiles take three rows and the prompt stays in view.
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: Self.symbol(tile.id)).font(.system(size: 15, weight: .medium)).foregroundStyle(Color.rasan)
                    .frame(width: 20, height: 18)
                VStack(alignment: .leading, spacing: 3) {
                    Text(tile.title).font(.system(size: 13, weight: .semibold)).foregroundStyle(.primary).lineLimit(1)
                    Text(tile.description).font(.system(size: 11.5)).foregroundStyle(.secondary).lineLimit(3).multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: 84, maxHeight: 84, alignment: .topLeading)
            // Selected is a raised neutral with a hairline, never brand blue (that is for the one primary action).
            .background(selected ? Color.primary.opacity(0.10) : Workspace.panel, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(selected ? Color.primary.opacity(0.35) : Workspace.hairline, lineWidth: 1) }
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain).disabled(!canAct)
        .help("Includes: " + catalog.options(in: tile).prefix(4).map(\.title).joined(separator: ", "))
        .accessibilityLabel("\(tile.title). \(tile.description)")
        .accessibilityHint("Shows its options")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func options(of tile: FormatCatalog.Tile) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            let all = catalog.options(in: tile)
            ForEach(Array(all.enumerated()), id: \.element.id) { index, option in
                optionRow(option)
                if index < all.count - 1 { Divider().opacity(0.6) }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 4)
        .background(Workspace.panel, in: RoundedRectangle(cornerRadius: Workspace.radius, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: Workspace.radius, style: .continuous).strokeBorder(Workspace.hairline, lineWidth: 1) }
        .transition(.opacity)
    }

    private func optionRow(_ option: FormatCatalog.Option) -> some View {
        let soon = option.status == .soon
        let selected = pick?.option == option.id
        return HStack(alignment: .firstTextBaseline, spacing: 12) {
            // The row is a button (focusable, Space to pick); the "Use …" shortcut of a coming-soon row sits beside it.
            Button { onPick(option) } label: {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Image(systemName: selected ? "checkmark.circle.fill" : "circle").font(.system(size: 13)).foregroundStyle(selected ? Color.primary : Color.secondary.opacity(0.6))
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 8) {
                            Text(option.title).font(.system(size: 13.5, weight: .medium)).foregroundStyle(soon ? .secondary : .primary)
                            if soon { ComingSoonBadge() }
                        }
                        Text(option.description).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                            .multilineTextAlignment(.leading)
                        if soon, let near = catalog.nearest(of: option) {
                            Text("Closest today: \(near.title)").font(.system(size: 11.5)).foregroundStyle(.tertiary)
                        }
                    }
                    Spacer(minLength: 8)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain).disabled(!canAct || soon)
            .hoverCursor(.pointingHand, enabled: canAct && !soon)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(selected ? .isSelected : [])
            .accessibilityLabel("\(option.title)\(soon ? ", coming soon" : ""). \(option.description)")
            if soon, canAct, let near = catalog.nearest(of: option) {
                Button("Use \(near.title)") { onPick(near) }.controlSize(.small)
            }
        }
        .padding(.vertical, 10)
    }

    static func symbol(_ tile: String) -> String {
        switch tile {
        case "launch": "paperplane"; case "explainer": "lightbulb"; case "brand": "seal"; case "short": "sparkles"
        case "music": "music.note"; case "reel": "film.stack"; case "talking": "person.wave.2"; case "people": "person.2"
        case "ad": "megaphone"; case "screen": "macwindow"; case "recut": "scissors"; default: "ellipsis.circle"
        }
    }
}

struct ComingSoonBadge: View {
    var body: some View {
        Text("Coming soon").font(.system(size: 10.5, weight: .semibold)).foregroundStyle(Color(nsColor: .systemOrange))
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background(Color(nsColor: .systemOrange).opacity(0.14), in: Capsule())
    }
}

/// What the picked option asks for, as plain lines (a link, a folder of clips, a script, a track).
struct FormatInputsNote: View {
    let catalog: FormatCatalog
    let option: FormatCatalog.Option
    var requiredOnly = false
    var optionalOnly = false

    var body: some View {
        let slots = catalog.inputSlots(for: option).filter { (!requiredOnly || $0.required) && (!optionalOnly || !$0.required) }
        if !slots.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(slots) { slot in
                    Label {
                        Text(slot.prompt).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    } icon: {
                        Image(systemName: slot.takesFolder ? "folder" : slot.accepts.contains("url") ? "link" : slot.takesText ? "text.alignleft" : "doc")
                            .font(.system(size: 11)).foregroundStyle(slot.required ? Color.rasan : Color.secondary)
                    }
                }
            }
            .accessibilityElement(children: .combine)
        }
    }
}
