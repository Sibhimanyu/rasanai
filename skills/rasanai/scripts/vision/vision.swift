// Apple Vision on keyframes, on-device and headless (no window, nothing leaves the Mac). Optional: footage.mjs vision runs it with
// /usr/bin/swift and works without it (the log then has no face boxes, saliency, labels or on-screen text).
//   swift vision.swift <image> [<image> ...]   ->  one JSON array on stdout:
//   [{ path, faces: [{x,y,w,h}], humans: n, saliency: [{x,y,w,h}], labels: [{id, conf}], text: ["..."] }]  (rects normalised, origin top-left)
import Foundation
import Vision
import ImageIO

func load(_ path: String) -> CGImage? {
  guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else { return nil }
  return CGImageSourceCreateImageAtIndex(src, 0, nil)
}
func rect(_ r: CGRect) -> [String: Double] {
  return ["x": Double(r.minX), "y": Double(1 - r.maxY), "w": Double(r.width), "h": Double(r.height)]
}

var out: [[String: Any]] = []
for path in CommandLine.arguments.dropFirst() {
  guard let img = load(path) else { out.append(["path": path, "error": "unreadable"]); continue }
  let handler = VNImageRequestHandler(cgImage: img, options: [:])
  let faceReq = VNDetectFaceRectanglesRequest()
  let humReq = VNDetectHumanRectanglesRequest()
  let salReq = VNGenerateAttentionBasedSaliencyImageRequest()
  let clsReq = VNClassifyImageRequest()
  let txtReq = VNRecognizeTextRequest()
  txtReq.recognitionLevel = .fast
  txtReq.usesLanguageCorrection = false
  try? handler.perform([faceReq, humReq, salReq, clsReq, txtReq])
  let faces = (faceReq.results ?? []).map { rect($0.boundingBox) }
  let humans = (humReq.results ?? []).count
  var sal: [[String: Double]] = []
  if let o = salReq.results?.first as? VNSaliencyImageObservation { sal = (o.salientObjects ?? []).map { rect($0.boundingBox) } }
  let labels: [[String: Any]] = ((clsReq.results ?? []) as [VNClassificationObservation])
    .filter { $0.confidence > 0.25 }.prefix(6).map { ["id": $0.identifier, "conf": Double($0.confidence)] }
  let text: [String] = (txtReq.results ?? []).compactMap { $0.topCandidates(1).first?.string }
  out.append(["path": path, "faces": faces, "humans": humans, "saliency": sal, "labels": labels, "text": text])
}
if let data = try? JSONSerialization.data(withJSONObject: out, options: []), let s = String(data: data, encoding: .utf8) { print(s) }
