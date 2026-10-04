import SwiftUI

struct ActivityBanner: View {
    @Bindable var store: StudioStore
    var body: some View {
        HStack(spacing: 12) {
            if store.runtime.isPreparing || (store.runtime.isRunning && !store.hasPendingQuestion && store.activity.title == "Director working") {
                ProgressView().controlSize(.small)
            } else { Image(systemName: store.activity.symbol).foregroundStyle(.secondary) }
            VStack(alignment: .leading, spacing: 3) {
                Text(store.activity.title).font(.headline)
                Text(store.activity.detail).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            Spacer(minLength: 8)
            if store.hasPendingQuestion { Button("Answer…") { store.showQuestion = true } }
            if store.runtime.isRunning { Button("Stop") { store.runtime.stop() } }
            else if !store.isSample { Button("Resume…") { store.launchProject = nil; store.showDirectorSheet = true } }
            if store.runtime.logURL != nil { Button("Log") { store.showDirectorLog = true } }
        }.padding(12).background(StudioPalette.panel)
    }
}
