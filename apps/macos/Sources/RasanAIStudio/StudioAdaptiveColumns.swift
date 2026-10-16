import SwiftUI

/// A main column and a fixed-width rail. At or above `breakpoint` they sit side by side; below it they stack at full width.
/// The choice is made from the width the parent proposes, inside the layout pass itself, so the first frame is already
/// right (no state, no width reader, no reflow after appearing). Subview 0 is the main column, subview 1 the rail.
/// `railFirst` puts the rail first (leading edge when wide, top when stacked).
struct StudioAdaptiveColumns: Layout {
    var railWidth: CGFloat
    var railFirst = false
    var breakpoint: CGFloat
    var gap: CGFloat = 24
    var stackSpacing: CGFloat = 24

    /// Wide only for a definite, finite width that reaches the breakpoint; an unspecified width measures stacked.
    private func isWide(_ width: CGFloat?) -> Bool {
        guard let width, width.isFinite else { return false }
        return width >= breakpoint
    }

    private struct Measured { var main: CGSize; var rail: CGSize; var wide: Bool; var width: CGFloat }

    private func measure(width proposed: CGFloat?, subviews: Subviews) -> Measured {
        let wide = isWide(proposed)
        if wide, let total = proposed {
            let rail = min(max(0, railWidth), total)
            let mainWidth = max(0, total - rail - max(0, gap))
            let mainSize = subviews[0].sizeThatFits(ProposedViewSize(width: mainWidth, height: nil))
            let railSize = subviews[1].sizeThatFits(ProposedViewSize(width: rail, height: nil))
            return Measured(main: CGSize(width: mainWidth, height: mainSize.height), rail: CGSize(width: rail, height: railSize.height),
                            wide: true, width: total)
        }
        let width = proposed.flatMap { $0.isFinite ? max(0, $0) : nil }
        let proposal = ProposedViewSize(width: width, height: nil)
        let mainSize = subviews[0].sizeThatFits(proposal)
        let railSize = subviews[1].sizeThatFits(proposal)
        let resolved = width ?? max(mainSize.width, railSize.width)
        return Measured(main: CGSize(width: resolved, height: mainSize.height), rail: CGSize(width: resolved, height: railSize.height),
                        wide: false, width: resolved)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard subviews.count == 2 else { return .zero }
        let m = measure(width: proposal.width, subviews: subviews)
        if m.wide { return CGSize(width: m.width, height: max(m.main.height, m.rail.height)) }
        return CGSize(width: m.width, height: m.main.height + m.rail.height + max(0, stackSpacing))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard subviews.count == 2 else { return }
        let m = measure(width: bounds.width, subviews: subviews)
        let main = subviews[0], rail = subviews[1]
        func place(_ view: LayoutSubview, x: CGFloat, y: CGFloat, size: CGSize) {
            view.place(at: CGPoint(x: bounds.minX + x, y: bounds.minY + y), anchor: .topLeading,
                       proposal: ProposedViewSize(width: size.width, height: size.height))
        }
        if m.wide {
            if railFirst {
                place(rail, x: 0, y: 0, size: m.rail)
                place(main, x: m.rail.width + max(0, gap), y: 0, size: m.main)
            } else {
                place(main, x: 0, y: 0, size: m.main)
                place(rail, x: m.main.width + max(0, gap), y: 0, size: m.rail)
            }
        } else if railFirst {
            place(rail, x: 0, y: 0, size: m.rail)
            place(main, x: 0, y: m.rail.height + max(0, stackSpacing), size: m.main)
        } else {
            place(main, x: 0, y: 0, size: m.main)
            place(rail, x: 0, y: m.main.height + max(0, stackSpacing), size: m.rail)
        }
    }
}
