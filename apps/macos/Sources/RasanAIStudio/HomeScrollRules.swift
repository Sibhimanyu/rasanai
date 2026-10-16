import CoreGraphics
import Foundation
import SwiftUI

/// Which way Home's two layers are being asked to move.
enum HomeScrollDirection: Equatable {
    /// A downward scroll in the prompt: bring the films up.
    case towardFilms
    /// An upward scroll with the films already at their top: bring the prompt back.
    case towardPrompt
}

/// Gesture phase without AppKit, so the rules can be tested headless. `cancelled` maps to `.ended`; `mayBegin` and
/// `stationary` map to `.changed` (their deltas are zero).
enum HomeScrollPhase: Equatable { case none, began, changed, ended }

/// One scroll event, reduced to what the rules need.
struct HomeScrollSample: Equatable {
    /// NSEvent.scrollingDeltaX/Y: already follows the person's scroll-direction setting, so a negative `deltaY` always
    /// means "content moves up, show what is below" (a downward scroll), natural scrolling or not.
    var deltaX: CGFloat
    var deltaY: CGFloat
    /// Trackpads and Magic Mouse report points; a notched wheel reports lines.
    var precise: Bool
    var phase: HomeScrollPhase
    var momentum: HomeScrollPhase
    var timestamp: TimeInterval
}

enum HomeScrollVerdict: Equatable {
    /// Not ours: let the event reach whatever it was aimed at.
    case pass
    /// Part of a gesture that already moved Home: swallow it, so nothing underneath scrolls with it.
    case consume
    /// Move Home now, and swallow this event.
    case trigger(HomeScrollDirection)
}

/// The decision rules for turning scroll events into one deliberate Home transition. Value type, no AppKit, no clock:
/// the caller passes timestamps, so every rule is testable headless.
///
/// - A gesture is accepted only if it *started* where a transition was allowed (`allowed` at its first event), so a flick
///   that scrolls a text area or the film list to its edge never carries on into a transition.
/// - Movement is accumulated in the allowed direction; opposite movement bleeds it back, so jitter never adds up.
/// - Horizontal-leaning gestures are never ours.
/// - One transition per gesture: after a trigger the rest of that gesture and its momentum are consumed (latched).
/// - Momentum never triggers; it is consumed only when the gesture it belongs to was latched.
/// - A cooldown after a transition keeps a bounce or a second flick from flipping straight back.
struct HomeScrollRules {
    /// Distance in points a gesture must travel before it counts as deliberate.
    var threshold: CGFloat = 36
    /// A notch of a wheel is a few "lines"; this turns lines into comparable points.
    var coarseScale: CGFloat = 12
    /// Longer than the transition it follows, so a second flick cannot flip back while the deck is still travelling.
    var cooldown: TimeInterval = HomeTransitionMetrics.duration + 0.2
    /// Wheel events carry no phase; a pause this long starts a new gesture.
    var gestureGap: TimeInterval = 0.25
    /// Below this much total travel the gesture's axis is still undecided.
    var axisCommit: CGFloat = 6

    private enum Axis { case undecided, vertical, horizontal }
    private var active = false
    private var latched = false
    private var axis = Axis.undecided
    private var allowedAtStart: HomeScrollDirection?
    private var travelX: CGFloat = 0
    private var travelY: CGFloat = 0
    private var progress: CGFloat = 0
    private var lastEvent: TimeInterval = -.infinity
    private var lastTrigger: TimeInterval = -.infinity

    /// True while the remainder of a transition gesture (including momentum) is still being swallowed.
    var isLatched: Bool { latched }

    mutating func reset() {
        active = false; latched = false; axis = .undecided; allowedAtStart = nil
        travelX = 0; travelY = 0; progress = 0
    }

    /// `allowed` is what the caller's context permits right now (nil: nothing, for example the pointer is over a text area
    /// that can still scroll). It is read only on the first event of a gesture.
    mutating func handle(_ sample: HomeScrollSample, allowed: HomeScrollDirection?) -> HomeScrollVerdict {
        if sample.momentum != .none {
            let swallow = latched
            if sample.momentum == .ended { latched = false; active = false }
            return swallow ? .consume : .pass
        }

        let fresh = sample.phase == .began || !active || (sample.phase == .none && sample.timestamp - lastEvent > gestureGap)
        if fresh {
            active = true; latched = false; axis = .undecided; allowedAtStart = allowed
            travelX = 0; travelY = 0; progress = 0
        }
        lastEvent = sample.timestamp
        if sample.phase == .ended { active = false }   // the latch survives until momentum ends or a new gesture begins

        if latched { return .consume }

        let scale = sample.precise ? 1 : coarseScale
        let dx = sample.deltaX * scale, dy = sample.deltaY * scale
        travelX += abs(dx); travelY += abs(dy)
        if axis == .undecided, travelX + travelY >= axisCommit { axis = travelY > travelX ? .vertical : .horizontal }
        guard axis == .vertical, let direction = allowedAtStart else { return .pass }
        if sample.timestamp - lastTrigger < cooldown { return .pass }

        let toward = direction == .towardFilms ? -dy : dy
        progress = max(0, progress + toward)
        guard progress >= threshold else { return .pass }

        latched = true; lastTrigger = sample.timestamp; progress = 0
        if sample.phase == .ended { active = false }
        return .trigger(direction)
    }
}

/// Layout and timing for one persistent workspace travelling behind a stationary soft viewport mask.
struct HomeTransitionMetrics: Equatable {
    var browsing: Bool
    var reduceMotion: Bool
    var viewportHeight: CGFloat
    var viewportWidth: CGFloat = 1000

    static let duration: TimeInterval = 0.8
    static let promptRise: CGFloat = 24
    static let columnWidth: CGFloat = 720, columnInset: CGFloat = 32
    static let dockedBottom: CGFloat = 58, peekHeight: CGFloat = 24
    static let promptClearance: CGFloat = 90
    static let workspaceTopPadding: CGFloat = 72, workspaceHeaderHeight: CGFloat = 72, workspaceGap: CGFloat = 24
    static var cardsTop: CGFloat { workspaceTopPadding + workspaceHeaderHeight + workspaceGap }

    static let promptFade = Animation.easeOut(duration: 0.28)
    static func travel(reduceMotion: Bool) -> Animation {
        reduceMotion ? .easeOut(duration: 0.15) : .smooth(duration: duration, extraBounce: 0)
    }
    static func reveal(opening: Bool) -> Animation {
        opening ? .easeOut(duration: 0.36).delay(0.18) : .easeOut(duration: 0.18)
    }

    var promptOpacity: Double { browsing ? 0 : 1 }
    var promptOffset: CGFloat { browsing && !reduceMotion ? -Self.promptRise : 0 }
    var workspaceOffset: CGFloat {
        browsing || reduceMotion ? 0 : max(0, viewportHeight - Self.dockedBottom - Self.peekHeight - Self.cardsTop)
    }
    var workspaceOpacity: Double { browsing ? 1 : (reduceMotion ? 0 : 0.32) }
}
