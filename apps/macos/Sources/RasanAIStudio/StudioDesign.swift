import StudioCore
import SwiftUI

/// The creation journey is presentation only; the director still owns the existing five review checkpoints.
enum StudioFlowStep: Int, CaseIterable, Identifiable {
    case describe, setup, brief, story, look, preview, final
    var id: Int { rawValue }
    var title: String {
        switch self {
        case .describe: "Describe"
        case .setup: "Setup"
        case .brief: "Brief"
        case .story: "Story"
        case .look: "Look"
        case .preview: "Preview"
        case .final: "Final"
        }
    }
    var reviewStage: ReviewStage? {
        switch self {
        case .describe, .setup: nil
        case .brief: .brief
        case .story: .story
        case .look: .look
        case .preview: .animatic
        case .final: .final
        }
    }
    init(_ stage: ReviewStage) {
        switch stage {
        case .brief: self = .brief
        case .story: self = .story
        case .look: self = .look
        case .animatic: self = .preview
        case .final: self = .final
        }
    }
}

/// A quiet, stable toolbar rail. Future steps are labels; completed reviews retain their existing read-only navigation.
struct StudioFlowProgress: View {
    let current: StudioFlowStep
    var viewing: StudioFlowStep?
    var finished = false
    var canSelect: (StudioFlowStep) -> Bool = { _ in false }
    var onSelect: ((StudioFlowStep) -> Void)?

    var body: some View {
        HStack(spacing: 0) {
            ForEach(StudioFlowStep.allCases) { step in
                if step != .describe {
                    Rectangle().fill(step.rawValue <= current.rawValue ? Color.rasan.opacity(0.55) : Color.primary.opacity(0.12))
                        .frame(width: 14, height: 1).padding(.bottom, 17)
                }
                if canSelect(step) || (step == current && viewing != nil), let onSelect {
                    Button { onSelect(step) } label: { marker(step) }.buttonStyle(.plain)
                        .help("Review \(step.title.lowercased())")
                } else { marker(step) }
            }
        }
        .fixedSize().accessibilityElement(children: .contain)
        .accessibilityLabel("\(current.title), step \(current.rawValue + 1) of 7")
    }

    private func marker(_ step: StudioFlowStep) -> some View {
        let active = (viewing ?? current) == step
        let done = finished || step.rawValue < current.rawValue
        return VStack(spacing: 5) {
            ZStack {
                Circle().fill(done ? Color.rasan : active ? Color.rasan.opacity(0.18) : Color.secondary.opacity(0.45))
                    .frame(width: done || active ? 12 : 5, height: done || active ? 12 : 5)
                if done { Image(systemName: "checkmark").font(.system(size: 7, weight: .bold)).foregroundStyle(Color.rasanPrimaryLabel) }
                if active { Circle().strokeBorder(Color.rasan, lineWidth: 1).frame(width: 17, height: 17) }
            }.frame(height: 17)
            Text(step.title).font(.system(size: 10.5, weight: active ? .semibold : .regular))
                .foregroundStyle(active ? Color.primary : Color.secondary)
        }
        .frame(minWidth: 40).padding(.horizontal, 2)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(step.title)\(active ? ", current" : done ? ", complete" : ", upcoming")")
    }
}
