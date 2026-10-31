import Observation
import SwiftUI

/// Let navigation commit a frame before constructing a destination's content. A cancelled navigation never mounts it.
@MainActor @Observable
final class PageActivation {
    private(set) var isReady = false

    func activate() async {
        guard !isReady else { return }
        do { try await Task.sleep(for: .milliseconds(16)) } catch { return }
        guard !Task.isCancelled else { return }
        isReady = true
    }
}

/// The closure is deliberately lazy: building the destination must not block the sidebar selection's first frame.
struct ResponsivePage<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content
    @State private var activation = PageActivation()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if activation.isReady { content() }
            else {
                PageLoadingView(title: title, delaysIndicator: true)
                    .navigationTitle(title)
                    .pageHeader(title)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: activation.isReady)
        .task { await activation.activate() }
    }
}

/// Native indeterminate progress, with optional card placeholders for a gallery's first load.
/// Fast in-memory destinations don't flash a spinner; actual asynchronous loads show one until their data arrives.
struct PageLoadingView: View {
    let title: String
    var gallery = false
    var delaysIndicator = false
    @State private var showIndicator = false

    var body: some View {
        VStack(spacing: 24) {
            HStack(spacing: 10) {
                ProgressView().controlSize(.small)
                Text("Loading \(title)…").font(.system(size: 13)).foregroundStyle(.secondary)
            }
            .opacity(!delaysIndicator || showIndicator ? 1 : 0)
            .accessibilityLabel("Loading \(title)")
            if gallery {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 230, maximum: 320), spacing: 16)], spacing: 16) {
                    ForEach(0..<6) { _ in
                        VStack(alignment: .leading, spacing: 10) {
                            RoundedRectangle(cornerRadius: 10).fill(Color.primary.opacity(0.055)).aspectRatio(16.0 / 9, contentMode: .fit)
                            Capsule().fill(Color.primary.opacity(0.055)).frame(width: 140, height: 10)
                            Capsule().fill(Color.primary.opacity(0.035)).frame(width: 90, height: 8)
                        }.padding(.bottom, 12)
                    }
                }
                .accessibilityHidden(true)
            }
        }
        .padding(.vertical, gallery ? 24 : 60)
        .frame(maxWidth: .infinity, maxHeight: gallery ? nil : .infinity)
        .task {
            guard delaysIndicator else { return }
            do { try await Task.sleep(for: .milliseconds(120)) } catch { return }
            guard !Task.isCancelled else { return }
            showIndicator = true
        }
    }
}
