import SwiftUI

struct KeyboardHelpView: View {
    @Environment(\.dismiss) private var dismiss
    private let shortcuts = [
        ("New Film", "⌘N"), ("Open Run", "⌘O"), ("Settings", "⌘,"),
        ("Export Film", "⌘E"), ("Reconnect Console", "⌘R"),
        ("Play / Pause", "Space"), ("Note at Playhead", "⇧⌘N"),
        ("Sample Film", "⇧⌘D"), ("Sidebar", "⌃⌘S"), ("Director Inspector", "⌥⌘0")
    ]
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Keyboard Shortcuts").font(.title2)
            ForEach(shortcuts, id: \.0) { name, keys in
                HStack { Text(name); Spacer(); Text(keys).font(.system(.body, design: .monospaced)).foregroundStyle(.secondary) }
            }
            Divider()
            Text("Open Recent is in the File menu. Playback and review actions apply to the current film.").font(.caption).foregroundStyle(.secondary)
            HStack { Spacer(); Button("Done") { dismiss() }.keyboardShortcut(.cancelAction) }
        }.padding(24).frame(width: 420)
    }
}
