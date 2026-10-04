import SwiftUI
import Combine
import AVKit
import StudioCore

enum StudioPalette {
    static let background = Color(nsColor: .windowBackgroundColor)
    static let panel = Color(nsColor: .controlBackgroundColor)
    static let raised = Color(nsColor: .underPageBackgroundColor)
    static let ink = Color.primary
    static let muted = Color.secondary
    static let accent = Color(red: 0.96, green: 0.77, blue: 0.18)
    static let mint = Color(red: 0.39, green: 0.67, blue: 0.54)
    static let divider = Color(nsColor: .separatorColor)
}

struct StudioView: View {
    @Bindable var store: StudioStore
    private let clock = Timer.publish(every: 1.0 / 30, on: .main, in: .common).autoconnect()
    @State private var lastTick = Date()
    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(StudioPalette.divider)
            HStack(spacing: 0) {
                sidebar.frame(width: 210)
                Rectangle().fill(StudioPalette.divider).frame(width: 1)
                workspace.frame(maxWidth: .infinity, maxHeight: .infinity)
                Rectangle().fill(StudioPalette.divider).frame(width: 1)
                if store.isSample || !store.useFullConsole { DirectorDesk(store: store).frame(width: 300) }
            }
            statusBar
        }
        .background(StudioPalette.background)
        .ignoresSafeArea(.container, edges: .top)
        .foregroundStyle(StudioPalette.ink)
        .tint(StudioPalette.accent)
        .font(.system(size: 13))
        .onReceive(clock) { now in
            store.advance(by: min(now.timeIntervalSince(lastTick), 0.15))
            lastTick = now
        }
        .sheet(isPresented: $store.showNoteSheet) { NoteSheet(store: store) }
        .sheet(isPresented: $store.showNewProject) { NewProjectSheet(store: store) }
        .sheet(isPresented: $store.showDirectorSheet) { DirectorSheet(store: store) }
        .sheet(isPresented: $store.showDirectorLog) { DirectorLogSheet(runtime: store.runtime) }
        .sheet(isPresented: $store.showQuestion) { DirectorQuestionSheet(store: store) }
        .onChange(of: store.settings.projectRoot) { store.reloadProjects() }
        .alert("RasanAI Studio", isPresented: Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })) {
            Button("OK") { store.errorMessage = nil }
        } message: { Text(store.errorMessage ?? "") }
    }

    private var header: some View {
        HStack(spacing: 14) {
            RasanMark().fill(StudioPalette.ink).frame(width: 22, height: 26)
            Text("RasanAI").font(.system(size: 19, weight: .semibold))
            Rectangle().fill(StudioPalette.divider).frame(width: 1, height: 22).padding(.horizontal, 5)
            Text(store.snapshot.title).font(.system(size: 15, weight: .semibold)).lineLimit(1)
            Text("\(Int(store.duration)) sec · \(store.snapshot.aspect)").foregroundStyle(StudioPalette.muted)
            if store.isSample { SmallTag(text: "SAMPLE") }
            Spacer()
            if !store.isSample {
                if store.snapshot.raw["ask"] != .null && store.snapshot.raw["ask"]["answered"] == .null {
                    Button("Answer question…") { store.showQuestion = true }
                }
                Toggle("Full workflow", isOn: $store.useFullConsole).toggleStyle(.button)
                    .help("The complete engine console: every route, review step, question, and gate")
                Button("Resume director…") { store.launchProject = nil; store.showDirectorSheet = true }
                    .disabled(store.runtime.isRunning || store.runtime.isPreparing)
            }
            if store.runtime.isRunning { Button("Stop director") { store.runtime.stop() } }
            if store.runtime.logURL != nil { Button("Log") { store.showDirectorLog = true } }
            Button { store.openPanel() } label: { Label("Open run", systemImage: "folder.badge.plus") }
                .buttonStyle(.plain).foregroundStyle(StudioPalette.muted).help("Open a RasanAI session (⌘O)")
            Button { store.exportVideo() } label: { Label("Export", systemImage: "square.and.arrow.up") }
                .buttonStyle(.bordered).disabled(store.finalURL == nil)
                .help(store.finalURL == nil ? "Connect a run with a rendered video to export" : "Export the rendered video")
        }
        .padding(.leading, 88).padding(.trailing, 20).frame(height: 60)
        .background(StudioPalette.panel)
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 5) {
                    sidebarHeading("LIBRARY")
                    ForEach([StudioSection.projects, .assets, .brandKits]) { item in navigationRow(item) }
                    sidebarHeading("THIS FILM").padding(.top, 22)
                    ForEach([StudioSection.scenes, .direction, .versions]) { item in navigationRow(item) }
                    if !store.scenes.isEmpty {
                        Rectangle().fill(StudioPalette.divider).frame(height: 1).padding(.vertical, 15)
                        ForEach(Array(store.scenes.enumerated()), id: \.element.id) { index, scene in
                            Button {
                                store.section = .scenes
                                if ![.animatic, .final].contains(store.stage) { store.setStage(.animatic) }
                                store.seek(to: scene.start)
                            } label: {
                                HStack(spacing: 10) {
                                    SceneThumbnail(scene: scene, store: store).frame(width: 56, height: 36)
                                        .clipShape(RoundedRectangle(cornerRadius: 4))
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(String(format: "%02d  %@", index + 1, scene.title)).lineLimit(1)
                                        Text(timecode(scene.duration)).font(.system(size: 11, design: .monospaced)).foregroundStyle(StudioPalette.muted)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .padding(7).background(store.selectedScene?.id == scene.id ? StudioPalette.accent.opacity(0.09) : .clear)
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                            }
                            .buttonStyle(.plain).accessibilityLabel("Scene \(index + 1), \(scene.title)")
                        }
                    }
                }.padding(12)
            }
            Button {
                if let url = store.runURL { NSWorkspace.shared.activateFileViewerSelecting([url]) }
            } label: {
                Label("On this Mac", systemImage: "laptopcomputer").foregroundStyle(StudioPalette.muted)
                    .padding(20)
            }.buttonStyle(.plain).disabled(store.runURL == nil)
        }.background(StudioPalette.panel.opacity(0.6))
    }

    private func sidebarHeading(_ title: String) -> some View {
        Text(title).font(.system(size: 10, weight: .medium)).tracking(1.4)
            .foregroundStyle(StudioPalette.muted).padding(.horizontal, 8).padding(.vertical, 9)
    }
    private func navigationRow(_ item: StudioSection) -> some View {
        Button { store.section = item } label: {
            HStack(spacing: 12) {
                Image(systemName: item.symbol).font(.system(size: 16, weight: .light)).frame(width: 20)
                Text(item.title)
                Spacer()
            }.padding(.horizontal, 11).padding(.vertical, 10)
                .foregroundStyle(store.section == item ? StudioPalette.accent : StudioPalette.ink)
                .background(store.section == item ? StudioPalette.accent.opacity(0.09) : .clear)
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }.buttonStyle(.plain)
    }

    private var workspace: some View {
        VStack(alignment: .leading, spacing: 0) {
            if store.isSample || !store.useFullConsole { workflow.padding(.horizontal, 24).padding(.top, 20) }
            switch store.section {
            case .scenes:
                if !store.isSample, store.useFullConsole, let address = store.consoleAddress {
                    ConsoleWorkspace(address: address)
                } else {
                switch store.stage {
                case .animatic, .final: FilmWorkspace(store: store)
                case .brief: BriefView(store: store)
                case .story: ChoiceView(store: store, kind: .story)
                case .look: ChoiceView(store: store, kind: .look)
                }
                }
            default: LibraryView(store: store)
            }
        }
    }

    private var workflow: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 25) {
                ForEach(ReviewStage.allCases) { stage in
                    Button { store.setStage(stage) } label: {
                        VStack(spacing: 12) {
                            HStack(spacing: 7) {
                                let done = store.snapshot.payload(for: stage)["status"].string == "done"
                                Image(systemName: done ? "checkmark.circle.fill" : (stage == store.stage ? "circle.inset.filled" : "circle"))
                                    .foregroundStyle(stage == store.stage ? StudioPalette.accent : StudioPalette.muted)
                                Text(stage.title).fontWeight(stage == store.stage ? .semibold : .regular)
                            }
                            Rectangle().fill(stage == store.stage ? StudioPalette.accent : .clear).frame(height: 2)
                        }.fixedSize(horizontal: true, vertical: false)
                    }.buttonStyle(.plain).foregroundStyle(stage == store.stage ? StudioPalette.ink : StudioPalette.muted)
                }
                Spacer(minLength: 0)
            }
            Text(store.stage.subtitle).foregroundStyle(StudioPalette.muted).font(.system(size: 12))
        }.padding(.bottom, 18)
    }

    private var statusBar: some View {
        HStack(spacing: 8) {
            Circle().fill(store.isConnected ? StudioPalette.mint : StudioPalette.muted).frame(width: 6, height: 6)
            Text(store.statusMessage).lineLimit(1)
            Spacer()
            if !store.isSample && !store.isConnected {
                Button("Reconnect") { store.connect() }.buttonStyle(.plain).foregroundStyle(StudioPalette.accent)
            }
            Text("RasanAI Studio · development preview").foregroundStyle(StudioPalette.muted)
        }.font(.system(size: 11)).padding(.horizontal, 20).frame(height: 30)
            .background(StudioPalette.panel).overlay(alignment: .top) { StudioPalette.divider.frame(height: 1) }
    }
}

struct NewProjectSheet: View {
    @Bindable var store: StudioStore
    @State private var name = ""
    @State private var creating = false
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("New Project Folder").font(.title2)
            TextField("Project name", text: $name)
            Text("Creates an organized folder in \(store.settings.projectRoot). Choose Start Film in Projects to launch your configured director.")
                .font(.caption).foregroundStyle(.secondary)
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("Create Folder") {
                    creating = true
                    Task { if await store.createProject(name) { dismiss() }; creating = false }
                }.keyboardShortcut(.defaultAction).disabled(creating || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                if creating { ProgressView().controlSize(.small) }
            }
        }.padding(24).frame(width: 470)
    }
}

struct SmallTag: View {
    let text: String
    var body: some View {
        Text(text).font(.system(size: 9, weight: .semibold)).tracking(1)
            .foregroundStyle(StudioPalette.muted).padding(.horizontal, 7).padding(.vertical, 4)
            .background(StudioPalette.raised).clipShape(RoundedRectangle(cornerRadius: 4))
    }
}

struct RasanMark: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let sx = rect.width / 102, sy = rect.height / 126
        p.move(to: CGPoint(x: 0, y: 0))
        for point in [(102.0, 0.0), (102, 62), (38, 126), (23.858, 111.858), (82, 53.716), (82, 20), (20, 20), (20, 82), (0, 82)] {
            p.addLine(to: CGPoint(x: point.0 * sx, y: point.1 * sy))
        }
        p.closeSubpath()
        p.move(to: CGPoint(x: 36 * sx, y: 31 * sy))
        p.addLine(to: CGPoint(x: 60 * sx, y: 46 * sy))
        p.addLine(to: CGPoint(x: 36 * sx, y: 61 * sy))
        p.closeSubpath()
        return p
    }
}

struct DirectorDesk: View {
    @Bindable var store: StudioStore
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Director’s desk").font(.system(size: 18, weight: .semibold)).padding(.top, 22)
            Picker("Inspector", selection: $store.showDecisions) {
                Text("Notes \(store.pendingNotes.count)").tag(false)
                Text("Decisions").tag(true)
            }.pickerStyle(.segmented).labelsHidden()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if store.showDecisions {
                        ForEach(ReviewStage.allCases) { stage in
                            if let decision = store.snapshot.payload(for: stage)["decision"].string {
                                VStack(alignment: .leading, spacing: 7) {
                                    Text(stage.title.uppercased()).font(.system(size: 10, weight: .medium)).tracking(1).foregroundStyle(StudioPalette.muted)
                                    Text(decision).lineSpacing(4)
                                }
                                Divider()
                            }
                        }
                    } else {
                        if store.pendingNotes.isEmpty {
                            Label("No notes on this stage", systemImage: "checkmark.bubble").foregroundStyle(StudioPalette.muted).padding(.vertical, 16)
                        }
                        ForEach(store.pendingNotes) { note in
                            Button { store.seek(to: note.time) } label: {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(timecode(note.time)).font(.system(size: 12, weight: .medium, design: .monospaced)).foregroundStyle(StudioPalette.accent)
                                    Text(note.text).lineSpacing(4).multilineTextAlignment(.leading).frame(maxWidth: .infinity, alignment: .leading)
                                    Text(note.scope == "film" ? "Whole film" : "Scene \(note.scene ?? "—")")
                                        .font(.system(size: 11)).foregroundStyle(StudioPalette.muted)
                                }
                            }.buttonStyle(.plain)
                            Divider()
                        }
                        if !store.pendingNotes.isEmpty {
                            Text(store.isSample ? "Sample notes stay on this Mac. Open a live run to send them to a director." : "Only the affected scenes will change.")
                                .font(.system(size: 11)).foregroundStyle(StudioPalette.muted).lineSpacing(3)
                            if !store.isSample {
                                Button { Task { await store.applyNotes() } } label: {
                                    HStack { Text("Apply \(store.pendingNotes.count) \(store.pendingNotes.count == 1 ? "note" : "notes")"); Spacer(); Image(systemName: "arrow.right") }
                                        .padding(12).fontWeight(.semibold).foregroundStyle(.black)
                                        .background(StudioPalette.accent).clipShape(RoundedRectangle(cornerRadius: 8))
                                }.buttonStyle(.plain).disabled(!store.canSend)
                            }
                        }
                    }
                    Divider().padding(.top, 4)
                    Text("Chosen direction").fontWeight(.semibold)
                    directionRow("Story", store.snapshot.step("story")["decision"].string)
                    directionRow("Look", store.snapshot.step("look")["decision"].string)
                    Divider()
                    ForEach(Array(store.snapshot.payload(for: store.stage)["thread"].array.enumerated()), id: \.offset) { _, message in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(message["who"].string == "you" ? "You" : "Director").font(.system(size: 11, weight: .medium)).foregroundStyle(StudioPalette.muted)
                            Text(message["text"].string ?? "").lineSpacing(4)
                        }
                    }
                    HStack(alignment: .top, spacing: 12) {
                        RasanMark().fill(StudioPalette.ink).frame(width: 22, height: 28).padding(9)
                            .background(Color(red: 0.11, green: 0.13, blue: 0.37)).clipShape(RoundedRectangle(cornerRadius: 8))
                        Text(store.snapshot.workingMessage ?? store.snapshot.latestActivity ?? "The director’s updates will appear here.")
                            .foregroundStyle(StudioPalette.muted).lineSpacing(4).frame(maxWidth: .infinity, alignment: .leading)
                    }
                }.padding(.vertical, 7)
            }
            if store.isSample {
                Button { store.openPanel() } label: { Label("Open a live RasanAI run", systemImage: "folder.badge.plus").frame(maxWidth: .infinity).padding(9) }
                    .buttonStyle(.bordered)
            } else {
                VStack(alignment: .trailing, spacing: 7) {
                    TextField("Tell the director what to change…", text: $store.directorMessage, axis: .vertical)
                        .textFieldStyle(.plain).lineLimit(3...5).disabled(!store.isConnected || store.isSending)
                    Button { Task { await store.sendDirectorMessage() } } label: { Image(systemName: "arrow.up.circle.fill").font(.system(size: 24)) }
                        .buttonStyle(.plain).disabled(!store.isConnected || store.isSending || store.directorMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }.padding(12).background(StudioPalette.raised).clipShape(RoundedRectangle(cornerRadius: 8))
                if [.animatic, .final].contains(store.stage) {
                    Button {
                        Task { await store.send(type: store.stage == .animatic ? "approve" : "choose", value: store.stage == .final ? .string("render") : .null) }
                    } label: {
                        HStack {
                            Text(store.awaitingAgent ? "Waiting for director…" : store.stage == .animatic ? "Approve animatic" : "Render final")
                            Spacer()
                            Image(systemName: "arrow.right")
                        }.padding(10)
                    }.buttonStyle(.bordered).disabled(!store.canSend || !store.pendingNotes.isEmpty || (store.stage == .animatic && store.snapshot.animatic == .null))
                }
            }
        }.padding(.horizontal, 20).padding(.bottom, 20).background(StudioPalette.panel.opacity(0.45))
    }
    private func directionRow(_ label: String, _ value: String?) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(label).foregroundStyle(StudioPalette.muted).frame(width: 34, alignment: .leading)
            Text(value ?? "Not chosen yet").lineSpacing(3).frame(maxWidth: .infinity, alignment: .leading)
        }.font(.system(size: 12))
    }
}

struct NoteSheet: View {
    @Bindable var store: StudioStore
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var scope = "scene"
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack { Text("Note at \(timecode(store.playhead))").font(.system(size: 20, weight: .semibold)); Spacer(); SmallTag(text: store.isSample ? "SAMPLE" : "LIVE") }
            Text(store.selectedScene?.title ?? "Whole film").foregroundStyle(StudioPalette.muted)
            TextField("What would make this moment better?", text: $text, axis: .vertical).lineLimit(4...6).textFieldStyle(.roundedBorder)
            Picker("Applies to", selection: $scope) { Text("This scene").tag("scene"); Text("Whole film").tag("film") }.pickerStyle(.segmented)
            HStack {
                Button("Cancel", role: .cancel) { dismiss() }.keyboardShortcut(.cancelAction)
                Spacer()
                Button(store.isSample ? "Save sample note" : "Send note") {
                    Task {
                        await store.addNote(text: text, scope: scope)
                        if store.errorMessage == nil { dismiss() }
                    }
                }.buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction)
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isSending)
            }
        }.padding(28).frame(width: 470).background(StudioPalette.panel).tint(StudioPalette.accent)
    }
}
