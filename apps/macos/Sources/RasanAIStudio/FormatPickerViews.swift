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
    @State private var openTile: String?

    private var option: FormatCatalog.Option? { catalog.option(pick?.option) }
    private var showGrid: Bool { option == nil || changing }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if showsChip, let option { chip(option) }
            if let option, option.scopeQuestion != nil, option.status != .soon { scopeQuestion(option) }
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
            .foregroundStyle(selected ? Color.rasan : Color.primary)
            .padding(.horizontal, 12).frame(height: 30)
            .background(selected ? Color.rasan.opacity(0.16) : Color.primary.opacity(0.07), in: Capsule())
        }
        .buttonStyle(.plain).help(help ?? "")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    // MARK: Grid

    private var grid: some View {
        VStack(alignment: .leading, spacing: 12) {
            if option == nil { Text("What are you making?").font(.system(size: 15, weight: .semibold)).accessibilityAddTraits(.isHeader) }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 200, maximum: 300), spacing: 10, alignment: .top)], alignment: .leading, spacing: 10) {
                ForEach(catalog.tiles) { tile in tileButton(tile) }
            }
            if let id = openTile, let tile = catalog.tile(id) { options(of: tile) }
        }
    }

    private func tileButton(_ tile: FormatCatalog.Tile) -> some View {
        let selected = openTile == tile.id || (openTile == nil && pick?.tile == tile.id)
        return Button { openTile = openTile == tile.id ? nil : tile.id } label: {
            VStack(alignment: .leading, spacing: 5) {
                Image(systemName: Self.symbol(tile.id)).font(.system(size: 16, weight: .medium)).foregroundStyle(Color.rasan)
                Text(tile.title).font(.system(size: 13.5, weight: .semibold)).foregroundStyle(.primary)
                Text(tile.description).font(.system(size: 11.5)).foregroundStyle(.secondary).lineLimit(3).multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 104, alignment: .topLeading)
            .background(selected ? Color.rasan.opacity(0.12) : Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(selected ? Color.rasan : Color(nsColor: .separatorColor), lineWidth: selected ? 1.5 : 0.5) }
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain).disabled(!canAct)
        .help(tile.thumbnail)
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
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.55), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
        .transition(.opacity)
    }

    private func optionRow(_ option: FormatCatalog.Option) -> some View {
        let soon = option.status == .soon
        let selected = pick?.option == option.id
        return HStack(alignment: .firstTextBaseline, spacing: 12) {
            Image(systemName: selected ? "checkmark.circle.fill" : "circle").font(.system(size: 13)).foregroundStyle(selected ? Color.rasan : Color.secondary.opacity(0.6))
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(option.title).font(.system(size: 13.5, weight: .medium)).foregroundStyle(soon ? .secondary : .primary)
                    if soon { ComingSoonBadge() }
                }
                Text(option.description).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                if soon, let near = catalog.nearest(of: option) {
                    Text("Closest today: \(near.title)").font(.system(size: 11.5)).foregroundStyle(.tertiary)
                }
            }
            Spacer(minLength: 8)
            if soon, canAct, let near = catalog.nearest(of: option) {
                Button("Use \(near.title)") { onPick(near) }.controlSize(.small)
            }
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .onTapGesture { if canAct && !soon { onPick(option) } }
        .hoverCursor(.pointingHand, enabled: canAct && !soon)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(soon ? [] : .isButton)
        .accessibilityLabel("\(option.title)\(soon ? ", coming soon" : ""). \(option.description)")
    }

    static func symbol(_ tile: String) -> String {
        switch tile {
        case "launch": "rocket"; case "explainer": "lightbulb"; case "brand": "seal"; case "short": "sparkles"
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

    var body: some View {
        let slots = catalog.inputSlots(for: option)
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
