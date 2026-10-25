import XCTest
@testable import StudioCore

final class DirectorBlocksTests: XCTestCase {
    private func use(_ id: String, _ command: String) -> String {
        #"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"\#(id)","name":"Bash","input":{"command":"\#(command)"}}]}}"#
    }
    private func denied(_ id: String) -> String {
        #"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"\#(id)","is_error":true,"content":"Claude requested permissions to use Bash, but you haven't granted it yet."}]}}"#
    }

    func testDeniedInstallIsOpenAndDeduplicated() {
        var scanner = DirectorBlockScanner()
        scanner.ingest(lines: [use("a", "brew install ffmpeg"), denied("a"), use("b", "brew install ffmpeg"), denied("b")])
        XCTAssertEqual(scanner.blocks.count, 1)
        XCTAssertEqual(scanner.blocks.first?.count, 2)
        XCTAssertEqual(scanner.open?.suggestedTool, "ffmpeg")
        XCTAssertTrue(scanner.open?.message.hasPrefix("Blocked: Rasan tried to run `brew install ffmpeg`") == true)
    }

    func testToolNeedReadsTheAskOption() {
        let ask = DirectorAsk(id: "q1", step: "brief", question: "Rasan needs ffmpeg", context: "to cut video",
                              options: [.init(id: "install-tool:ffmpeg", label: "Install for me", detail: "")], recommended: nil, placeholder: "")
        XCTAssertEqual(ToolNeed(ask: ask)?.managedKey, "ffmpeg")
        XCTAssertEqual(ToolNeed(ask: ask)?.readyChoice, "tool-ready:ffmpeg")
    }
}
