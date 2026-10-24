import Foundation
import Observation
import StudioCore

/// What the Motion Library hands back when someone presses "Ask Rasan to try". The library never edits files itself.
struct MotionLibraryRequest: Equatable, Sendable {
    var itemID: String
    /// The `data-motion-kit` value, `motion-kit:<id>@<version>`.
    var annotation: String
    var params: [String: JSONValue]
    /// A ready-made sentence for the director.
    var instruction: String
}

/// Filters, search, selection and chosen parameter values for the Motion Library.
@Observable
@MainActor
final class MotionLibraryModel {
    static let roles = ["entry", "emphasis", "exit", "transition", "background", "scene", "ending"]

    var catalog: MotionKitCatalog
    var role: String?        // nil = all intents
    var family: String?      // nil = all families
    var search = ""
    var selectedID: String?
    private(set) var overrides: [String: [String: JSONValue]] = [:]

    init(catalog: MotionKitCatalog) { self.catalog = catalog }

    var families: [String] { catalog.families }

    var visibleItems: [MotionKitItem] {
        let needle = search.trimmingCharacters(in: .whitespaces).lowercased()
        return catalog.allItems.filter { item in
            if let role, item.role != role { return false }
            if let family, item.family != family { return false }
            guard !needle.isEmpty else { return true }
            let hay = [item.id, item.label, item.family, item.role, item.summary, item.useWhen].compactMap { $0 }.joined(separator: " ").lowercased()
            return needle.split(separator: " ").allSatisfy { hay.contains($0) }
        }
    }

    func count(role: String) -> Int { catalog.allItems.filter { $0.role == role }.count }

    // MARK: Parameters

    func defaultValue(_ param: MotionKitParam) -> JSONValue {
        if let d = param.default { return d }
        switch param.type {
        case "number": return .number(param.min ?? 0)
        case "boolean": return .bool(false)
        case "enum": return .string(param.enum?.first ?? "")
        default: return .string("")
        }
    }

    func value(item: MotionKitItem, name: String) -> JSONValue {
        if let v = overrides[item.id]?[name] { return v }
        guard let p = item.params?[name] else { return .null }
        return defaultValue(p)
    }

    func set(_ value: JSONValue, item: MotionKitItem, name: String) {
        overrides[item.id, default: [:]][name] = value
    }

    func reset(item: MotionKitItem) { overrides[item.id] = nil }

    func isChanged(item: MotionKitItem) -> Bool { !(overrides[item.id] ?? [:]).isEmpty }

    /// Every param with its current value.
    func chosenParams(item: MotionKitItem) -> [String: JSONValue] {
        var out: [String: JSONValue] = [:]
        for name in (item.params ?? [:]).keys { out[name] = value(item: item, name: name) }
        return out
    }

    func request(for item: MotionKitItem) -> MotionLibraryRequest {
        let chosen = chosenParams(item: item)
        let changed = (overrides[item.id] ?? [:]).keys.sorted()
        var text = "Try the “\(item.displayLabel)” motion (\(item.annotation))"
        if let role = item.role { text += " as the \(role)" }
        text += " where it fits the film"
        if let use = item.useWhen, !use.isEmpty { text += ". Use it when: \(use)" }
        if let avoid = item.avoidWhen, !avoid.isEmpty { text += " Avoid it when: \(avoid)" }
        if !changed.isEmpty {
            text += " Settings: " + changed.map { "\($0) = \(Self.describe(chosen[$0] ?? .null))" }.joined(separator: ", ") + "."
        }
        text += " Mark the clip root with data-motion-kit=\"\(item.annotation)\" and keep the rest of the film as it is."
        return MotionLibraryRequest(itemID: item.id, annotation: item.annotation, params: chosen, instruction: text)
    }

    static func describe(_ v: JSONValue) -> String {
        switch v {
        case .number(let n): return n == n.rounded() ? String(Int(n)) : String(format: "%.2f", n)
        case .string(let s): return s
        case .bool(let b): return b ? "on" : "off"
        default: return "-"
        }
    }
}
