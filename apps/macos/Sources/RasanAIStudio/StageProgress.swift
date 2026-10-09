import StudioCore
import SwiftUI

extension ReviewStage {
    /// Plain-language step names for the progress bar ("Story" is shown as "Script").
    var stepTitle: String {
        switch self {
        case .brief: "Brief"
        case .story: "Script"
        case .look: "Look"
        case .animatic: "Animatic"
        case .final: "Final"
        }
    }
}

private func stageLabel(current: ReviewStage?, finished: Bool) -> String {
    let all = ReviewStage.allCases
    if finished { return "Finished, all \(all.count) steps done" }
    guard let current, let index = all.firstIndex(of: current) else { return "Not started" }
    return "Step \(index + 1) of \(all.count), \(current.stepTitle)"
}

/// The five steps of a film as a slim bar: finished steps filled, the current one lifted, the rest quiet.
struct FilmStageBar: View {
    let current: ReviewStage?
    var finished = false
    /// The completed stage being looked at read-only, if any.
    var viewing: ReviewStage?
    /// While Claude is working (no call is waiting for the person): how many calls are already decided. Those are ticked, the next call
    /// shows as upcoming with a quiet "working" ring, and nothing is highlighted as the current step. `nil` follows `current`.
    var decided: Int?
    /// Which stages can be opened, and what to do when one is clicked. Both nil makes the bar a plain indicator.
    var canSelect: ((ReviewStage) -> Bool)?
    var onSelect: ((ReviewStage) -> Void)?
    private var stages: [ReviewStage] { ReviewStage.allCases }
    private var working: Bool { decided != nil && !finished }
    private var currentIndex: Int {
        if finished { return stages.count }
        if let decided { return decided }
        return current.flatMap { stages.firstIndex(of: $0) } ?? -1
    }
    @State private var pulse = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(stages.enumerated()), id: \.offset) { index, stage in
                step(index, stage)
                if index < stages.count - 1 {
                    Capsule().fill(index < currentIndex ? Color.rasan.opacity(0.7) : Color(nsColor: .separatorColor))
                        .frame(height: 1.5).frame(minWidth: 12, maxWidth: .infinity).padding(.horizontal, 8)
                }
            }
        }
        .frame(maxWidth: 620)
        .padding(.horizontal, 24).frame(maxWidth: .infinity).frame(height: 36)
        .background(.bar)
        .overlay(alignment: .bottom) { Divider() }
        .animation(.snappy, value: currentIndex)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(working ? "\(decided ?? 0) of \(stages.count) calls decided, Claude is working on \(stages.indices.contains(decided ?? -1) ? stages[decided ?? 0].stepTitle : "the film")" : stageLabel(current: current, finished: finished))
    }

    @ViewBuilder private func step(_ index: Int, _ stage: ReviewStage) -> some View {
        let selectable = onSelect != nil && (canSelect?(stage) ?? false)
        if selectable || (onSelect != nil && stage == current && viewing != nil) {
            Button { onSelect?(stage) } label: { stepLabel(index, stage) }
                .buttonStyle(.plain)
                .help(stage == current ? "Back to \(stage.stepTitle)" : "Look back at \(stage.stepTitle)")
                .accessibilityLabel(stage == current ? "Back to the current step, \(stage.stepTitle)" : "Show \(stage.stepTitle), as decided")
        } else {
            stepLabel(index, stage)
        }
    }

    private func stepLabel(_ index: Int, _ stage: ReviewStage) -> some View {
        let done = index < currentIndex, active = index == currentIndex && !working
        let next = working && index == currentIndex
        let looking = viewing == stage && viewing != current
        return HStack(spacing: 7) {
            ZStack {
                if active { Circle().fill(Color.rasan.opacity(0.18)).frame(width: 22, height: 22) }
                if next {
                    Circle().strokeBorder(Color.rasan.opacity(pulse ? 0.15 : 0.5), lineWidth: 1.5).frame(width: 21, height: 21)
                        .animation(.easeInOut(duration: 1.3).repeatForever(autoreverses: true), value: pulse)
                        .onAppear { guard !reduceMotion else { return }; pulse = true }
                }
                Circle().fill(done || active ? Color.rasan : Color.clear).frame(width: 16, height: 16)
                    .overlay { Circle().strokeBorder(done || active ? Color.clear : Color(nsColor: .tertiaryLabelColor), lineWidth: 1) }
                if done {
                    Image(systemName: "checkmark").font(.system(size: 8, weight: .heavy)).foregroundStyle(Color(nsColor: .windowBackgroundColor))
                } else {
                    Text("\(index + 1)").font(.system(size: 9, weight: .bold, design: .rounded))
                        .foregroundStyle(active ? Color(nsColor: .windowBackgroundColor) : Color(nsColor: .tertiaryLabelColor))
                }
            }.frame(width: 22, height: 22)
            Text(stage.stepTitle)
                .font(.system(size: 12, weight: active ? .semibold : .medium))
                .foregroundStyle(active || looking ? Color.primary : done ? Color.secondary : next ? Color.secondary : Color(nsColor: .tertiaryLabelColor))
                .lineLimit(1).fixedSize()
        }
        .padding(.trailing, active ? 4 : 0)
        .padding(.horizontal, looking ? 8 : 0).padding(.vertical, looking ? 3 : 0)
        .background(looking ? Color.rasan.opacity(0.14) : Color.clear, in: Capsule())
        .contentShape(Rectangle())
    }
}

/// Five tiny dots for film cards: done steps tinted, the current one a short pill, the rest hollow-quiet.
struct FilmStageDots: View {
    let current: ReviewStage?
    var finished = false
    private var stages: [ReviewStage] { ReviewStage.allCases }
    private var currentIndex: Int { finished ? stages.count : (current.flatMap { stages.firstIndex(of: $0) } ?? -1) }

    var body: some View {
        HStack(spacing: 3) {
            ForEach(Array(stages.enumerated()), id: \.offset) { index, _ in
                Capsule()
                    .fill(index < currentIndex ? Color.rasan.opacity(0.5) : index == currentIndex ? Color.rasan : Color(nsColor: .quaternaryLabelColor))
                    .frame(width: index == currentIndex ? 12 : 5, height: 5)
            }
        }
        .animation(.snappy, value: currentIndex)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(stageLabel(current: current, finished: finished))
    }
}

extension SessionSnapshot {
    /// How many of the five calls are decided, counting from the brief without gaps (a call is decided when its step is done).
    var decidedCalls: Int {
        let steps: [[String]] = [["brief"], ["story", "concept"], ["look", "films"], ["animatic"], ["render", "final"]]
        var count = 0
        for names in steps {
            guard names.contains(where: { step($0)["status"].string == "done" }) else { break }
            count += 1
        }
        return count
    }
}
