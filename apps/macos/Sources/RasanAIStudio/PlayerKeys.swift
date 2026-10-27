import AppKit
import StudioCore
import SwiftUI

/// The one set of player keys, shared by the review player, the plain preview and both full-screen windows:
/// Space and K play or pause, J/L slower and faster, ←/→ one second (⇧ five seconds, ⌥ previous or next scene), , and . a frame
/// while paused, Home/End, M mute, F full screen, C a note, Esc leaves full screen. Nothing with ⌘ or ⌃.
///
/// The keys are delivered only to the view that has keyboard focus, so they never fire while a text field, the Ask Rasan bar or the
/// notes box is being typed in: a field editor holds focus, and the player gets nothing. Autofocus on appear backs off for the same
/// reason when a text view is already the first responder (`PlayerKeys.canTakeFocus`).
@MainActor
enum PlayerKeys {
    /// False while the person is typing: a player that appears then must not take the keys.
    static var canTakeFocus: Bool { !(NSApp.keyWindow?.firstResponder is NSTextView) }

    static func handle<P: FilmPlayback>(_ press: KeyPress, playback: P, scenes: [FilmScene],
                                        onFullScreen: (() -> Void)?, onNote: (() -> Void)? = nil,
                                        onEscape: (() -> Void)? = nil) -> KeyPress.Result {
        guard !press.modifiers.contains(.command), !press.modifiers.contains(.control) else { return .ignored }
        switch press.key {
        case .escape:
            guard let onEscape else { return .ignored }
            onEscape(); return .handled
        case .space: playback.toggle(); return .handled
        case .leftArrow, .rightArrow:
            let forward = press.key == .rightArrow
            if press.modifiers.contains(.option) {
                guard let target = FilmTiming.jump(from: playback.time, forward: forward, in: scenes) else { return .ignored }
                playback.seek(to: target); return .handled
            }
            playback.seek(to: playback.time + (forward ? 1 : -1) * (press.modifiers.contains(.shift) ? 5 : 1))
            return .handled
        case .home: playback.seek(to: 0); return .handled
        case .end: playback.seek(to: playback.duration); return .handled
        default: break
        }
        switch press.characters.lowercased() {
        case "k": playback.pause(); return .handled
        case "j":
            guard playback.avPlayer != nil else { return .ignored }
            playback.rate = PlaybackSpeed.slower(than: playback.rate); if !playback.isPlaying { playback.play() }
            return .handled
        case "l":
            guard playback.avPlayer != nil else { playback.play(); return .handled }
            if playback.isPlaying { playback.rate = PlaybackSpeed.faster(than: playback.rate) } else { playback.play() }
            return .handled
        case ",": guard !playback.isPlaying else { return .ignored }; playback.step(frames: -1); return .handled
        case ".": guard !playback.isPlaying else { return .ignored }; playback.step(frames: 1); return .handled
        case "f":
            guard playback.avPlayer != nil, let onFullScreen else { return .ignored }
            onFullScreen(); return .handled
        case "m": playback.isMuted.toggle(); return .handled
        case "c":
            guard let onNote else { return .ignored }
            onNote(); return .handled
        default: return .ignored
        }
    }
}

extension View {
    /// Makes this view the keyboard home of a player. `focus` is the caller's focus state (so it can also take focus on a click);
    /// `onKey` runs on every press (the full-screen windows use it to bring their controls back).
    func playerKeys<P: FilmPlayback>(playback: P, scenes: [FilmScene] = [], focus: FocusState<Bool>.Binding,
                                     onFullScreen: (() -> Void)?, onNote: (() -> Void)? = nil,
                                     onEscape: (() -> Void)? = nil, onKey: (() -> Void)? = nil) -> some View {
        self
            .focusable()
            .focused(focus)
            .focusEffectDisabled()
            .onKeyPress(phases: [.down, .repeat]) { press in
                onKey?()
                return PlayerKeys.handle(press, playback: playback, scenes: scenes, onFullScreen: onFullScreen, onNote: onNote, onEscape: onEscape)
            }
    }
}
