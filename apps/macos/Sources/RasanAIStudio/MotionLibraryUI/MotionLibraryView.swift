import StudioCore
import SwiftUI

/// A small Motion Library browser for the Look stage and the Final advanced panel.
/// It only reports what the person wants through `onAsk`; it never edits files.
struct MotionLibraryView: View {
    var catalog: MotionKitCatalog
    var onAsk: (MotionLibraryRequest) -> Void
    var projectRoot: URL?

    @State private var model: MotionLibraryModel
    @State private var cache: MotionPreviewCache

    init(catalog: MotionKitCatalog, projectRoot: URL? = nil, onAsk: @escaping (MotionLibraryRequest) -> Void) {
        self.catalog = catalog
        self.projectRoot = projectRoot
        self.onAsk = onAsk
        _model = State(initialValue: MotionLibraryModel(catalog: catalog))
        _cache = State(initialValue: MotionPreviewCache(projectRoot: projectRoot))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            ScrollView {
                if model.visibleItems.isEmpty {
                    Text(catalog.allItems.isEmpty ? "No motions in the library yet." : "No motions match these filters.")
                        .foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.vertical, 40)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 260, maximum: 380), spacing: 12, alignment: .top)], spacing: 12) {
                        ForEach(model.visibleItems) { item in
                            MotionLibraryCard(item: item, model: model, cache: cache, onAsk: onAsk)
                        }
                    }
                    .padding(.bottom, 4)
                }
            }
            .accessibilityLabel("Motion library results")
        }
        .onChange(of: catalog) { _, new in model.catalog = new }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Motion library")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary).accessibilityHidden(true)
                TextField("Search motions", text: $model.search)
                    .textFieldStyle(.plain)
                    .accessibilityLabel("Search motions")
                if !model.search.isEmpty {
                    Button { model.search = "" } label: { Image(systemName: "xmark.circle.fill") }
                        .buttonStyle(.plain).foregroundStyle(.secondary).accessibilityLabel("Clear search")
                }
            }
            .padding(.horizontal, 10).padding(.vertical, 7)
            .background(Workspace.raised, in: RoundedRectangle(cornerRadius: 8, style: .continuous))

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    MotionChip(title: "All intents", selected: model.role == nil) { model.role = nil }
                    ForEach(MotionLibraryModel.roles, id: \.self) { role in
                        MotionChip(title: role.capitalized, count: model.count(role: role), selected: model.role == role) {
                            model.role = model.role == role ? nil : role
                        }
                    }
                }
            }
            .accessibilityLabel("Filter by intent")

            if model.families.count > 1 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        Text("Family").font(.caption).foregroundStyle(.secondary)
                        MotionChip(title: "Any", selected: model.family == nil, small: true) { model.family = nil }
                        ForEach(model.families, id: \.self) { fam in
                            MotionChip(title: fam, selected: model.family == fam, small: true) { model.family = model.family == fam ? nil : fam }
                        }
                    }
                }
                .accessibilityLabel("Filter by family")
            }
        }
    }
}

struct MotionChip: View {
    var title: String
    var count: Int? = nil
    var selected: Bool
    var small = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(title)
                if let count { Text("\(count)").foregroundStyle(.secondary) }
            }
            .font(small ? .caption : .callout)
            .padding(.horizontal, small ? 8 : 10).padding(.vertical, small ? 3 : 5)
            .background(selected ? Color.rasan.opacity(0.22) : Workspace.raised, in: Capsule())
            .overlay(Capsule().strokeBorder(selected ? Color.rasan.opacity(0.7) : Workspace.hairline))
            .foregroundStyle(selected ? Color.rasan : Color.primary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(count.map { "\(title), \($0) motions" } ?? title)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

struct MotionLibraryCard: View {
    var item: MotionKitItem
    var model: MotionLibraryModel
    var cache: MotionPreviewCache
    var onAsk: (MotionLibraryRequest) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var showAvoid = false
    @State private var showParams = false

    private var paramNames: [String] { (item.params ?? [:]).keys.sorted() }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            MotionPreviewSlot(item: item.id, role: item.role ?? "entry", cache: cache, reduceMotion: reduceMotion)

            HStack(alignment: .firstTextBaseline) {
                Text(item.displayLabel).font(.headline).lineLimit(2)
                Spacer(minLength: 6)
                if let role = item.role {
                    Text(role.capitalized).font(.caption2.weight(.medium))
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(Color.rasan.opacity(0.18), in: Capsule()).foregroundStyle(Color.rasan)
                        .accessibilityLabel("Intent: \(role)")
                }
            }
            if let use = item.useWhen {
                Text("Use when: \(use)").font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            if let avoid = item.avoidWhen, !avoid.isEmpty {
                DisclosureGroup("Avoid when", isExpanded: $showAvoid) {
                    Text(avoid).font(.callout).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
                }
                .font(.callout)
            }
            if !paramNames.isEmpty {
                DisclosureGroup("Settings", isExpanded: $showParams) {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(paramNames, id: \.self) { name in
                            MotionParamRow(item: item, name: name, model: model)
                        }
                        if model.isChanged(item: item) {
                            Button("Reset to defaults") { model.reset(item: item) }.buttonStyle(.link)
                        }
                    }
                    .padding(.top, 4)
                }
                .font(.callout)
            }
            HStack {
                Text(item.annotation).font(.caption2.monospaced()).foregroundStyle(.tertiary).lineLimit(1).truncationMode(.middle)
                Spacer()
                Button("Ask Rasan to try") { onAsk(model.request(for: item)) }
                    .buttonStyle(.borderedProminent).tint(.rasanFill)
                    .accessibilityLabel("Ask Rasan to try \(item.displayLabel)")
                    .accessibilityHint("Sends a request to the director. Nothing changes until it answers.")
            }
        }
        .padding(12)
        .cardSurface(selected: model.selectedID == item.id)
        .contentShape(Rectangle())
        .onTapGesture { model.selectedID = item.id }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(item.displayLabel)
    }
}

struct MotionParamRow: View {
    var item: MotionKitItem
    var name: String
    var model: MotionLibraryModel

    var body: some View {
        let param = item.params?[name] ?? MotionLibraryFixture.emptyParam
        let current = model.value(item: item, name: name)
        switch param.type {
        case "number":
            let lo = param.min ?? 0, hi = max(param.max ?? lo + 1, lo + 0.0001)
            let binding = Binding<Double>(
                get: { if case .number(let n) = current { return min(max(n, lo), hi) } else { return lo } },
                set: { model.set(.number($0), item: item, name: name) })
            VStack(alignment: .leading, spacing: 2) {
                HStack { Text(name).font(.caption); Spacer(); Text(MotionLibraryModel.describe(.number(binding.wrappedValue))).font(.caption.monospacedDigit()).foregroundStyle(.secondary) }
                Slider(value: binding, in: lo...hi)
                    .accessibilityLabel(name)
                    .accessibilityValue(MotionLibraryModel.describe(.number(binding.wrappedValue)))
            }
        case "enum":
            let options = param.enum ?? []
            let binding = Binding<String>(
                get: { if case .string(let s) = current { return s } else { return options.first ?? "" } },
                set: { model.set(.string($0), item: item, name: name) })
            Picker(name, selection: binding) { ForEach(options, id: \.self) { Text($0).tag($0) } }
                .pickerStyle(.menu).font(.caption).accessibilityLabel(name)
        case "boolean":
            let binding = Binding<Bool>(
                get: { if case .bool(let b) = current { return b } else { return false } },
                set: { model.set(.bool($0), item: item, name: name) })
            Toggle(name, isOn: binding).font(.caption).accessibilityLabel(name)
        default:
            let binding = Binding<String>(
                get: { if case .string(let s) = current { return s } else { return "" } },
                set: { model.set(.string($0), item: item, name: name) })
            HStack { Text(name).font(.caption); TextField(name, text: binding).textFieldStyle(.roundedBorder).accessibilityLabel(name) }
        }
    }
}

// MARK: Previews

enum MotionLibraryFixture {
    static let emptyParam: MotionKitParam = (try? JSONDecoder().decode(MotionKitParam.self, from: Data("{}".utf8)))!
    static let emptyCatalog: MotionKitCatalog = (try? MotionKitCatalog.decode(Data("{\"schema_version\":1}".utf8)))!
    static let catalog: MotionKitCatalog = {
        func item(_ id: String, _ label: String, _ family: String, _ role: String) -> String {
            """
            {"id":"\(id)","version":1,"label":"\(label)","family":"\(family)","role":"\(role)",
             "summary":"s","use_when":"A calm moment that needs a decisive \(role).","avoid_when":"Dense frames with many moving parts.",
             "params":{"duration":{"type":"number","min":0.3,"max":1.2,"default":0.6},"direction":{"type":"enum","enum":["up","down"],"default":"up"},"soft":{"type":"boolean","default":false}}}
            """
        }
        let items = [item("kinetic-type-rise-v1", "Rise", "kinetic-type", "entry"), item("shape-pulse-v1", "Pulse", "shape", "emphasis"),
                     item("product-ui-drop-v1", "Drop out", "product-ui", "exit"), item("camera-space-wipe-v1", "Wipe", "camera-space", "transition"),
                     item("texture-drift-v1", "Drift", "texture", "background"), item("ending-settle-v1", "Settle", "ending", "ending")]
        let json = "{\"schema_version\":1,\"items\":[\(items.joined(separator: ","))]}"
        return (try? MotionKitCatalog.decode(Data(json.utf8))) ?? MotionLibraryFixture.emptyCatalog
    }()
}

#Preview("Motion Library") {
    MotionLibraryView(catalog: MotionLibraryFixture.catalog) { print($0.instruction) }
        .padding(20).frame(width: 760, height: 560).background(Workspace.canvas).preferredColorScheme(.dark)
}

#Preview("Motion Library narrow") {
    MotionLibraryView(catalog: MotionLibraryFixture.catalog) { _ in }
        .padding(16).frame(width: 340, height: 520).background(Workspace.canvas).preferredColorScheme(.dark)
}
