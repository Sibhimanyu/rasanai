import AppKit
import SwiftUI
import XCTest
import StudioCore
@testable import RasanAIStudio

/// The setup screens drawn offscreen (no window): each one renders, and the walk behaves as the steps say.
@MainActor final class NewFilmFlowTests: XCTestCase {
    private var root: URL!
    private var store: StudioStore!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("flow-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "flow-tests-\(UUID().uuidString)"))
        defaults.set(root.path, forKey: "projectRoot")
        store = StudioStore(settings: StudioSettings(defaults: defaults), demo: true)
    }
    override func tearDownWithError() throws { try? FileManager.default.removeItem(at: root) }

    private func host() -> FlowHost {
        FlowHost(addFiles: { _ in true }, chooseFiles: {}, removeSource: { _ in }, pickOption: { _ in }, undoAutoPick: {}, settleFormat: {},
                 briefPlaceholder: "Tell RasanAI about it", runButton: AnyView(Button("Start film") {}),
                 footerActions: AnyView(EmptyView()))
    }

    private func render(_ step: FlowStep, draft: FilmDraft, series: [Series] = [], model: NewFilmFlowModel = NewFilmFlowModel(), name: String) throws {
        store.seriesList = series
        model.begin(at: step)
        var draft = draft, title = "Sunday talk"
        let view = NewFilmFlow(store: store, model: model, draft: Binding(get: { draft }, set: { draft = $0 }), name: Binding(get: { title }, set: { title = $0 }),
                               newSources: [], existingSources: [], catalog: FormatCatalog.installed, questions: TasteQuestions.installed,
                               ready: true, editing: false, working: false, host: host(), scrolls: false)
            .frame(width: 1040, height: 720).environment(\.colorScheme, .light)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 1
        let image = try XCTUnwrap(renderer.nsImage)
        let directory = URL(fileURLWithPath: "/tmp/flow-shots", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let tiff = try XCTUnwrap(image.tiffRepresentation), png = try XCTUnwrap(NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]))
        try png.write(to: directory.appendingPathComponent("\(name).png"))
    }

    func testScreensRender() throws {
        TasteQuestions.installed = TasteQuestions.load(engine: DirectorRuntime.engineURL)
        let catalog = try XCTUnwrap(FormatCatalog.installed)
        var draft = FilmDraft(brief: "A Sunday talk about bread and wine.")
        catalog.pick(try XCTUnwrap(catalog.option("presenter")), in: &draft)
        draft.preferences = ["captions": "off"]
        let series = [try SeriesLibrary.create(name: "Quotidian", format: draft.format, aspect: "9:16", length: .asClip, in: root)]
        try render(.series, draft: draft, series: series, name: "1-series")
        try render(.kind, draft: draft, name: "2-kind")
        try render(.material, draft: draft, name: "3-material")
        try render(.shape, draft: draft, name: "5-shape")
        try render(.example, draft: draft, name: "7-example")
        try render(.question("pictures"), draft: draft, name: "6-pictures")
        try render(.question("ending"), draft: draft, name: "6-ending")
        let model = NewFilmFlowModel()
        model.provenance = ["captions": .example, "shape": .clip]; model.evidence = ["captions": "no steady text band in 0 of 30 frames"]
        try render(.review, draft: draft, model: model, name: "8-review")
    }
}
