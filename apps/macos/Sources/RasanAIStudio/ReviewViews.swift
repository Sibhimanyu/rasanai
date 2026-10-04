import SwiftUI
import StudioCore

struct BriefView: View {
    @Bindable var store: StudioStore
    @State private var subject = ""
    @State private var length = 45
    @State private var aspect = "16:9"
    @State private var narration = "Voiceover"
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 25) {
                Text("A clear brief makes a better film.").font(.system(size: 30, weight: .semibold))
                Text("Define the subject and the delivery. The director takes the craft from here.")
                    .foregroundStyle(StudioPalette.muted)
                VStack(alignment: .leading, spacing: 18) {
                    TextField("Subject or product URL", text: $subject).textFieldStyle(.roundedBorder)
                    HStack(spacing: 24) {
                        Stepper("\(length) seconds", value: $length, in: 5...600, step: 5).frame(maxWidth: 230)
                        Picker("Aspect", selection: $aspect) { Text("16:9").tag("16:9"); Text("9:16").tag("9:16"); Text("1:1").tag("1:1") }.frame(width: 160)
                    }
                    Picker("Narration", selection: $narration) {
                        Text("Voiceover").tag("Voiceover"); Text("No voiceover").tag("No voiceover")
                    }.pickerStyle(.segmented).frame(maxWidth: 300)
                }.padding(24).background(StudioPalette.panel).clipShape(RoundedRectangle(cornerRadius: 10))
                if store.isSample {
                    Text("This is a sample brief. Open an existing RasanAI run to send a real brief to its director.")
                        .foregroundStyle(StudioPalette.muted)
                    Button("Open a live run…") { store.openPanel() }.buttonStyle(.bordered)
                } else {
                    Button("Send brief to director") {
                        var fields = store.snapshot.step("brief")["fields"].object
                        fields["subject"] = .string(subject)
                        fields["length_s"] = .number(Double(length))
                        fields["aspect"] = .string(aspect)
                        fields["narration"] = .string(narration)
                        Task { await store.send(type: "submit", value: .object(fields)) }
                    }.buttonStyle(.borderedProminent).disabled(!store.canSend || subject.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                ForEach(Array(store.snapshot.step("brief")["findings"].array.enumerated()), id: \.offset) { _, finding in
                    Text(finding["text"].string ?? "").foregroundStyle(StudioPalette.muted)
                }
            }.padding(28)
        }
        .onAppear {
            let fields = store.snapshot.step("brief")["fields"]
            subject = fields["subject"].string ?? fields["content"].string ?? ""
            length = Int(fields["length_s"].number ?? 45)
            aspect = store.snapshot.aspect
            narration = fields["narration"].string ?? "Voiceover"
        }
    }
}

struct ChoiceView: View {
    @Bindable var store: StudioStore
    let kind: ReviewStage
    @State private var selection: String?
    private var options: [JSONValue] {
        let payload = store.snapshot.payload(for: kind)
        return kind == .story ? payload["stories"].array : payload["styles"].array
    }
    private var selected: JSONValue? {
        options.first { $0["id"].identifier == selection } ?? options.first
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if options.isEmpty {
                    ContentUnavailableView("The \(kind.title.lowercased()) desk is working", systemImage: kind == .story ? "text.book.closed" : "paintpalette",
                                           description: Text("The director’s three directions will appear here when they are published."))
                } else {
                    HStack(alignment: .top, spacing: 12) {
                        ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                            let chosen = option["id"].identifier == selected?["id"].identifier
                            Button { selection = option["id"].identifier } label: {
                                VStack(alignment: .leading, spacing: 12) {
                                    HStack {
                                        Text(option["angle"].string ?? option["label"].string ?? "Direction \(index + 1)")
                                            .font(.system(size: 10, weight: .medium)).textCase(.uppercase).tracking(1)
                                            .foregroundStyle(chosen ? StudioPalette.accent : StudioPalette.muted)
                                        Spacer()
                                        if chosen { Image(systemName: "checkmark.circle.fill").foregroundStyle(StudioPalette.accent) }
                                    }
                                    if kind == .look { lookPreview(option, index: index).frame(height: 120).clipShape(RoundedRectangle(cornerRadius: 5)) }
                                    Text(option["title"].string ?? option["name"].string ?? "Untitled direction")
                                        .font(.system(size: 17, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
                                    Text(option["logline"].string ?? option["blend"].string ?? "")
                                        .foregroundStyle(StudioPalette.muted).font(.system(size: 12)).lineSpacing(4)
                                    Spacer(minLength: 0)
                                }.padding(17).frame(maxWidth: .infinity, minHeight: kind == .look ? 245 : 180, alignment: .topLeading)
                                    .background(StudioPalette.panel)
                                    .clipShape(RoundedRectangle(cornerRadius: 9))
                                    .overlay { RoundedRectangle(cornerRadius: 9).stroke(chosen ? StudioPalette.accent : StudioPalette.divider, lineWidth: 1) }
                            }.buttonStyle(.plain)
                        }
                    }
                    if let selected {
                        Text(selected["title"].string ?? selected["name"].string ?? "").font(.system(size: 26, weight: .semibold))
                        Text(selected["why"].string ?? "").foregroundStyle(StudioPalette.muted).lineSpacing(5)
                        ForEach(Array(selected["beats"].array.enumerated()), id: \.offset) { _, beat in
                            HStack(alignment: .top, spacing: 18) {
                                Text("\(Int(beat["duration_s"].number ?? 0))s").font(.system(size: 12, design: .monospaced)).foregroundStyle(StudioPalette.accent).frame(width: 35)
                                VStack(alignment: .leading, spacing: 7) {
                                    Text(beat["on_screen"].string ?? beat["name"].string ?? "").fontWeight(.semibold)
                                    Text(beat["vo"].string ?? "").foregroundStyle(StudioPalette.muted)
                                    Text(beat["visual"].string ?? "").font(.system(size: 11)).foregroundStyle(StudioPalette.muted)
                                }
                            }.padding(16).frame(maxWidth: .infinity, alignment: .leading).background(StudioPalette.panel).clipShape(RoundedRectangle(cornerRadius: 6))
                        }
                        if store.isSample {
                            Text("Sample directions · explore the options without changing a live film.")
                                .font(.system(size: 12)).foregroundStyle(StudioPalette.muted)
                        } else {
                            Button("Choose this \(kind == .story ? "story" : "look")") {
                                Task { await store.send(type: "choose", value: selected["id"]) }
                            }.buttonStyle(.borderedProminent).disabled(!store.canSend)
                        }
                    }
                }
            }.padding(24)
        }
        .onAppear { selection = store.snapshot.payload(for: kind)["recommended"].identifier ?? options.first?["id"].identifier }
    }
    @ViewBuilder private func lookPreview(_ option: JSONValue, index: Int) -> some View {
        if let url = store.asset(option["poster"].string) { LocalImage(url: url) }
        else if store.isSample {
            let colors = [Color(red: 0.96, green: 0.95, blue: 0.92), Color(red: 0.13, green: 0.25, blue: 0.20), Color(red: 0.92, green: 0.43, blue: 0.34)]
            ZStack(alignment: .leading) {
                colors[index % colors.count]
                VStack(alignment: .leading, spacing: 10) {
                    Text("Tax season.\nAgain.").font(.system(size: 24, weight: .bold, design: index == 1 ? .serif : .default)).tracking(-0.8)
                    HStack(spacing: 4) { ForEach(0..<6) { n in Rectangle().frame(width: 7, height: CGFloat(12 + n * 4)) } }
                        .foregroundStyle(index == 0 ? StudioPalette.mint : Color.white.opacity(0.55))
                }.padding(15).foregroundStyle(index == 0 ? .black : .white)
            }
        } else {
            StudioPalette.raised.overlay { Label("Specimen not published", systemImage: "photo").font(.system(size: 11)).foregroundStyle(StudioPalette.muted) }
        }
    }
}

struct LibraryView: View {
    @Bindable var store: StudioStore
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text(store.section.title).font(.system(size: 28, weight: .semibold))
                switch store.section {
                case .projects:
                    Text("Project library · \(store.settings.projectRoot)").foregroundStyle(StudioPalette.muted).textSelection(.enabled)
                    HStack {
                        Button("New project folder…") { store.showNewProject = true }.buttonStyle(.borderedProminent)
                        Button("Open run…") { store.openPanel() }.buttonStyle(.borderedProminent)
                        Button("Sample film") { store.loadSample() }.buttonStyle(.bordered)
                        SettingsLink { Image(systemName: "gearshape") }.help("Settings (⌘,)")
                    }
                    if store.isLoadingProjects { ProgressView("Loading project library…").controlSize(.small) }
                    ForEach(store.localProjects, id: \.0.id) { project, folder in
                        HStack {
                            Image(systemName: "folder").font(.title2)
                            VStack(alignment: .leading) {
                                Text(project.name).fontWeight(.medium)
                                Text(folder.path).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button("Open") { store.openProject(folder) }
                            Button("Start Film…") { store.launchProject = folder; store.showDirectorSheet = true }
                                .disabled(store.runtime.isRunning || store.runtime.isPreparing)
                            Button("Show in Finder") { NSWorkspace.shared.open(folder) }
                        }.padding(18).background(StudioPalette.panel).clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    ForEach(store.recentRuns, id: \.self) { path in
                        Button { store.openRun(URL(fileURLWithPath: path)) } label: {
                            HStack {
                                Image(systemName: "film.stack").font(.system(size: 24, weight: .light))
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(URL(fileURLWithPath: path).lastPathComponent).fontWeight(.medium)
                                    Text(path).font(.system(size: 11)).foregroundStyle(StudioPalette.muted).lineLimit(2)
                                }
                                Spacer(); Image(systemName: "arrow.up.right")
                            }.padding(18).background(StudioPalette.panel).clipShape(RoundedRectangle(cornerRadius: 8))
                        }.buttonStyle(.plain)
                    }
                case .assets:
                    let paths = store.snapshot.scenes.compactMap(\.thumbnail) + [store.snapshot.audioFile, store.snapshot.finalVideo].compactMap { $0 }
                    if paths.isEmpty {
                        ContentUnavailableView("No source assets attached", systemImage: "photo.stack", description: Text(store.isSample ? "The sample uses native illustrations. Live runs show their key frames, audio, and rendered film here." : "Assets appear as the director publishes them to the run."))
                    }
                    ForEach(Array(Set(paths)).sorted(), id: \.self) { path in
                        HStack {
                            Image(systemName: "doc")
                            Text(URL(fileURLWithPath: path).lastPathComponent).lineLimit(1)
                            Spacer()
                            Button("Show in Finder") { if let url = store.asset(path) { NSWorkspace.shared.activateFileViewerSelecting([url]) } }
                                .disabled(store.asset(path) == nil)
                        }.padding(15).background(StudioPalette.panel).clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                case .brandKits:
                    if let decision = store.snapshot.step("brand")["decision"].string {
                        Text(decision).lineSpacing(5)
                    } else {
                        ContentUnavailableView("The film’s brand", systemImage: "swatchpalette", description: Text("Brand guidance is supplied by the existing RasanAI workflow. A dedicated brand-kit editor is planned for a later build."))
                    }
                case .direction:
                    ForEach(ReviewStage.allCases) { stage in
                        if let decision = store.snapshot.payload(for: stage)["decision"].string {
                            VStack(alignment: .leading, spacing: 10) {
                                Text(stage.title).font(.system(size: 16, weight: .semibold))
                                Text(decision).foregroundStyle(StudioPalette.muted).lineSpacing(5)
                            }.padding(22).frame(maxWidth: .infinity, alignment: .leading).background(StudioPalette.panel).clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                    }
                case .versions:
                    let versions = store.snapshot.final["versions"].array
                    if versions.isEmpty {
                        ContentUnavailableView("No rendered versions yet", systemImage: "clock.arrow.circlepath", description: Text("Rendered film versions will appear here when the director publishes them."))
                    }
                    ForEach(Array(versions.enumerated()), id: \.offset) { _, version in
                        HStack {
                            Text("Version \(version["v"].identifier ?? "—")").fontWeight(.medium)
                            Text(version["when"].string ?? "").foregroundStyle(StudioPalette.muted)
                            Spacer()
                            Button("Restore") {
                                store.setStage(.final)
                                Task { await store.send(type: "version", value: .object(["restore": version["v"]])) }
                            }.disabled(!store.canSend || store.isSample)
                        }.padding(18).background(StudioPalette.panel).clipShape(RoundedRectangle(cornerRadius: 7))
                    }
                case .scenes: EmptyView()
                }
                Spacer(minLength: 30)
            }.padding(28).frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
