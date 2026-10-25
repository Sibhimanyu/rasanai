import StudioCore
import SwiftUI

#if DEBUG
enum MotionInspectorFixture {
    static let json = """
    {"schema_version":1,"build_digest":"abc123","film_version":2,"frame_size":{"w":1920,"h":1080},"items":[
     {"element_id":"scene-1.bg","scene_id":"scene-1","kind":"image","z":0,"active_s":[0,5],"capability":"raster","bounds_samples":[{"t_s":0,"x":0,"y":0,"w":1920,"h":1080}]},
     {"element_id":"scene-1.hero-title","scene_id":"scene-1","kind":"text","label":"Hero title","z":5,"active_s":[0,5],"editable":["text","position","scale","color","timing","motion_preset"],"capability":"dom","bounds_samples":[{"t_s":0,"x":200,"y":300,"w":900,"h":300}]},
     {"element_id":"scene-1.badge","scene_id":"scene-1","kind":"shape","label":"Badge","z":6,"active_s":[1,4],"editable":["position","color"],"capability":"dom","bounds_samples":[{"t_s":0,"x":300,"y":350,"w":200,"h":100}]}
    ]}
    """
    static var index: MotionElementIndex { try! MotionElementIndex.decode(Data(json.utf8)) }
    static func hits(at p: CGPoint) -> [MotionElementHit] { MotionElementResolver.candidates(at: p, time: 2, in: index) }
    static var title: MotionElementHit { hits(at: CGPoint(x: 0.3, y: 0.45)).first { $0.id == "scene-1.hero-title" }! }
}

#Preview("Chooser") {
    MotionElementChooser(hits: MotionInspectorFixture.hits(at: CGPoint(x: 0.2, y: 0.4)), onPick: { _ in }, onDismiss: {})
        .padding().background(ReviewTheme.room)
}

#Preview("Inspector") {
    MotionElementInspector(hit: MotionInspectorFixture.title, time: 2, filmVersion: 2, existingEditIDs: ["edit-001"], onAsk: { print($0.id) }, onClose: {})
        .frame(height: 560).background(ReviewTheme.room)
}

#Preview("Fallback") {
    MotionUnindexedFallback(reason: .raster, time: 2.4, region: MotionNormRect(x: 0.1, y: 0.2, w: 0.2, h: 0.2), onNote: { _ in })
        .background(ReviewTheme.roomRaised)
}
#endif
