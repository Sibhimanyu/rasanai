import Foundation

/// The settings chips of the New film prompt box, in the order they are kept on the toolbar.
public enum ComposerChip: String, CaseIterable, Sendable {
    case length, pace, aspect, motion, brand
}

/// Pure layout decisions for the prompt box toolbar: which settings chips stay on the row and which fold into the overflow menu.
/// Chips are dropped from the end (brand first, length last), never wrapped. Pace follows length: how long a film takes
/// is worth keeping on the row.
public enum ComposerLayout {
    public static let gap: Double = 8
    public static let chipHeight: Double = 28

    /// Rough chip width: icon, padding and chevron plus the text at 13 pt.
    public static func estimatedWidth(label: String) -> Double { 44 + Double(label.count) * 7 }

    /// "15s", "45s", "2 min", "1 min 30s": the short value shown on the length chip.
    public static func shortLength(_ seconds: Int) -> String {
        if seconds < 60 { return "\(seconds)s" }
        let minutes = seconds / 60, rest = seconds % 60
        return rest == 0 ? "\(minutes) min" : "\(minutes) min \(rest)s"
    }

    /// Splits the chips between the row and the overflow menu. `fixed` is the width the left group, the overflow button and the
    /// primary button need, `available` the toolbar width, and `widths` each chip's width. Always keeps the order; the chips that
    /// do not fit (and everything after the first that does not) go to the overflow.
    public static func split(available: Double, fixed: Double, widths: [ComposerChip: Double], order: [ComposerChip] = ComposerChip.allCases) -> (inline: [ComposerChip], overflow: [ComposerChip]) {
        var used = fixed
        var inline: [ComposerChip] = []
        for chip in order {
            let width = (widths[chip] ?? 0) + gap
            if used + width <= available { inline.append(chip); used += width } else { break }
        }
        return (inline, Array(order.dropFirst(inline.count)))
    }
}
