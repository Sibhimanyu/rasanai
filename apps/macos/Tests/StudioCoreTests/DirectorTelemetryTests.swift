import Foundation
import Testing
@testable import StudioCore

private let t0 = Date(timeIntervalSince1970: 1_790_000_000)
private func at(_ seconds: TimeInterval) -> Date { t0.addingTimeInterval(seconds) }

private func claudeToolLine(id: String, name: String = "Bash", input: String, message: String = UUID().uuidString) -> String {
    #"{"type":"assistant","message":{"model":"claude-sonnet-5-5","id":"\#(message)","role":"assistant","content":[{"type":"tool_use","id":"\#(id)","name":"\#(name)","input":\#(input)}],"usage":{"input_tokens":10,"output_tokens":20,"cache_read_input_tokens":1000,"cache_creation_input_tokens":0}}}"#
}
private let toolResult = #"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"x","content":"ok","is_error":false}]}}"#
private let claudeInit = #"{"type":"system","subtype":"init","session_id":"s1","model":"claude-sonnet-5-5"}"#

@Suite struct ClaudeStreamParsing {
    @Test func realCaptureTotalsMatchTheResult() {
        var t = DirectorTelemetry()
        t.ingest(lines: TelemetryFixtures.claude, now: at(0))
        #expect(t.agent == "claude")
        #expect(t.sessionFinished)
        #expect(t.toolCalls == ["Bash": 1])
        #expect(t.currentModel == "claude-haiku-4-5-20251001")
        // The result's modelUsage is authoritative.
        #expect(t.tokens.cacheRead == 38_403)
        #expect(t.tokens.cacheWrite == 12_594)
        #expect(t.tokens.output == 166)
        #expect(t.cost.reportedUSD == 0.0307803)
        #expect(!t.cost.isEstimated)
        #expect(t.lastToolSummary == "Run echo command")
    }

    @Test func liveSumsDedupeStreamedMessages() {
        var t = DirectorTelemetry()
        // Stop before the result: the same message id appears for each content block and must count once.
        t.ingest(lines: Array(TelemetryFixtures.claude.prefix(while: { !$0.contains("\"type\":\"result\"") })), now: at(0))
        #expect(!t.sessionFinished)
        #expect(t.tokens.input == 18)
        #expect(t.tokens.cacheRead == 38_403)
        #expect(t.tokens.cacheWrite == 12_594)
        #expect(t.turns == 2)
        #expect(t.cost.isEstimated)
        #expect(t.cost.reportedUSD == 0)
    }

    @Test func liveEstimateIsCloseToTheReportedCost() {
        var t = DirectorTelemetry()
        t.ingest(lines: Array(TelemetryFixtures.claude.prefix(while: { !$0.contains("\"type\":\"result\"") })), now: at(0))
        // Reported 0.0308; the live sum misses the small extra haiku usage but must be in range.
        #expect(abs(t.cost.usd - 0.0307803) < 0.004)
    }

    @Test func partialOutputCountIsFlooredByWrittenText() {
        var t = DirectorTelemetry()
        let text = String(repeating: "word ", count: 400)
        t.ingest(line: #"{"type":"assistant","message":{"model":"claude-opus-5-5","id":"m1","content":[{"type":"text","text":"\#(text)"}],"usage":{"input_tokens":5,"output_tokens":1}}}"#, now: at(0))
        #expect(t.tokens.output >= 400)
    }

    @Test func sessionsAddUpAcrossResumes() {
        var t = DirectorTelemetry()
        t.ingest(lines: TelemetryFixtures.claude, now: at(0))
        let first = t.tokens.total
        let cost = t.cost.usd
        t.ingest(line: #"{"type":"system","subtype":"init","session_id":"another","model":"claude-haiku-4-5"}"#, now: at(100))
        #expect(t.tokens.total == first)
        #expect(t.sessionCount == 2)
        #expect(abs(t.cost.usd - cost) < 1e-9)
    }

    @Test func toolErrorsAndConsoleCalls() {
        var t = DirectorTelemetry()
        t.ingest(line: claudeInit, now: at(0))
        t.ingest(line: claudeToolLine(id: "a", input: #"{"command":"node scripts/console.mjs push --run /r --step story --file p.json"}"#), now: at(5))
        #expect(t.events.last?.kind == .push)
        #expect(t.events.last?.text == "Showed the story step for your review")
        #expect(t.lastConsoleCallAt == at(5))
        t.ingest(line: #"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"a","content":"boom","is_error":true}]}}"#, now: at(6))
        #expect(t.toolErrors == 1)
        #expect(t.toolInFlight == nil)
        #expect(t.modelCallInFlight)
    }

    @Test func ignoresNoiseAndBadLines() {
        var t = DirectorTelemetry()
        t.ingest(lines: ["", "plain stderr text", "{not json", #"{"type":"system","subtype":"hook_started"}"#], now: at(0))
        #expect(!t.hasData)
    }

    @Test func persistedTotalsRoundTrip() throws {
        var t = DirectorTelemetry()
        t.ingest(lines: TelemetryFixtures.claude, now: at(0))
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        var back = try decoder.decode(DirectorTelemetry.self, from: encoder.encode(t))
        #expect(back.tokens == t.tokens)
        back.closeSession()
        #expect(back.tokens == t.tokens)
        #expect(back.cost.reportedUSD == 0.0307803)
        #expect(back.liveModels.isEmpty)
    }
}

@Suite struct CodexStreamParsing {
    @Test func execStreamCountsToolsAndTurnUsage() {
        var t = DirectorTelemetry()
        t.ingest(lines: TelemetryFixtures.codex, now: at(0))
        #expect(t.agent == "codex")
        #expect(t.toolCalls == ["Shell": 1])
        #expect(t.lastToolSummary == "echo hi")
        #expect(t.tokens.cacheRead == 24_320)
        #expect(t.tokens.input == 40_535 - 24_320)
        #expect(t.tokens.output == 38)
        #expect(t.sessionFinished)
        #expect(t.lastMessage == "done")
    }

    @Test func rolloutGivesLiveTokensWithoutDoubleCounting() {
        var t = DirectorTelemetry()
        t.ingest(lines: Array(TelemetryFixtures.codex.prefix(while: { !$0.contains("turn.completed") })), now: at(0))
        #expect(t.tokens.isEmpty)
        t.ingest(lines: TelemetryFixtures.codexRollout, now: at(1))
        #expect(t.currentModel == "gpt-5.5")
        #expect(t.tokens.output == 38)
        #expect(t.tokens.total == 40_573)
        // Then the exec stream's own final usage arrives: same totals, not doubled.
        t.ingest(lines: TelemetryFixtures.codex.filter { $0.contains("turn.completed") }, now: at(2))
        #expect(t.tokens.total == 40_573)
        #expect(t.liveModels.keys.sorted() == ["gpt-5.5"])
    }

    @Test func errorsAreReadable() {
        var t = DirectorTelemetry()
        t.ingest(line: #"{"type":"turn.failed","error":{"message":"{\"type\":\"error\",\"error\":{\"message\":\"Model not supported\"}}"}}"#, now: at(0))
        #expect(t.events.last?.text == "Model not supported")
        #expect(t.sessionIsError)
    }

    @Test func billingFromAuthFile() {
        #expect(CodexBilling.detect(authData: Data(#"{"auth_mode":"chatgpt","OPENAI_API_KEY":null}"#.utf8)) == .includedInPlan)
        #expect(CodexBilling.detect(authData: Data(#"{"auth_mode":"apikey","OPENAI_API_KEY":"sk-x"}"#.utf8)) == .metered)
        #expect(CodexBilling.detect(authData: nil, environmentKey: "sk-env") == .metered)
    }
}

@Suite struct CostMath {
    @Test func haikuMatchesCliReportedCost() {
        let usage = TokenTotals(input: 922, output: 166, cacheRead: 38_403, cacheWrite: 12_594)
        #expect(abs(ModelPricing.cost(of: usage, model: "claude-haiku-4-5-20251001") - 0.0307803) < 1e-6)
    }
    @Test func opusAndSonnetFamilies() {
        let million = TokenTotals(input: 1_000_000, output: 1_000_000)
        #expect(ModelPricing.cost(of: million, model: "claude-opus-5-5") == 24)
        #expect(ModelPricing.cost(of: million, model: "claude-sonnet-5-5") == 12)
        #expect(ModelPricing.cost(of: million, model: "claude-opus-4-8") == 30)
        #expect(ModelPricing.cost(of: TokenTotals(cacheRead: 1_000_000), model: "claude-opus-5-5") == 0.2)
    }
    @Test func unknownClaudeModelErrsHigh() {
        #expect(ModelPricing.price(for: "claude-nova-9", agent: "claude") == ModelPricing.claudeFallback)
        #expect(!ModelPricing.isKnown("claude-nova-9"))
    }
    @Test func planUsersGetNoDollarFigure() {
        var t = DirectorTelemetry()
        t.billing = .includedInPlan
        t.ingest(lines: TelemetryFixtures.codex, now: at(0))
        #expect(UsageFormat.cost(t.cost) == "Included in your ChatGPT plan")
        t.billing = .metered
        #expect(UsageFormat.cost(t.cost).hasSuffix("est."))
    }
    @Test func formatting() {
        #expect(UsageFormat.tokens(842) == "842")
        #expect(UsageFormat.tokens(12_400) == "12k")
        #expect(UsageFormat.tokens(182_000) == "182k")
        #expect(UsageFormat.tokens(1_240_000) == "1.2M")
        #expect(UsageFormat.dollars(1.4249) == "$1.42")
        #expect(UsageFormat.span(200) == "3 min")
        #expect(ModelPricing.displayName("claude-opus-5-5") == "Opus 5.5")
        #expect(ModelPricing.displayName("claude-haiku-4-5-20251001") == "Haiku 4.5")
        #expect(ModelPricing.displayName("gpt-5.5") == "gpt-5.5")
    }
}

@Suite struct HealthDetection {
    private func running(_ now: Date, awaiting: Bool = false, consoleUpdate: Date? = nil) -> HealthContext {
        HealthContext(now: now, processRunning: true, awaitingUser: awaiting, lastConsoleUpdate: consoleUpdate)
    }

    @Test func startingUntilFirstEvent() {
        #expect(DirectorHealth.evaluate(DirectorTelemetry(), context: running(at(5))).state == .starting)
    }

    @Test func workingThenThinkingThenQuiet() {
        var t = DirectorTelemetry()
        t.ingest(line: claudeInit, now: at(0))
        t.ingest(line: claudeToolLine(id: "a", input: #"{"command":"ls","description":"List files"}"#), now: at(1))
        #expect(DirectorHealth.evaluate(t, context: running(at(10))).state == .working)
        t.ingest(line: toolResult, now: at(12))
        #expect(DirectorHealth.evaluate(t, context: running(at(14))).state == .working)
        let thinking = DirectorHealth.evaluate(t, context: running(at(60)))
        #expect(thinking.state == .thinking)
        let quiet = DirectorHealth.evaluate(t, context: running(at(12 + 200)))
        #expect(quiet.state == .quiet)
        #expect(quiet.detail.contains("No activity for 3 min"))
        #expect(quiet.detail.contains("List files"))
    }

    @Test func longToolsAreTrustedForTenMinutes() {
        var t = DirectorTelemetry()
        t.ingest(line: claudeInit, now: at(0))
        t.ingest(line: claudeToolLine(id: "a", input: #"{"command":"hyperframes render","description":"Render the film"}"#), now: at(1))
        #expect(DirectorHealth.evaluate(t, context: running(at(400))).state == .working)
        #expect(DirectorHealth.evaluate(t, context: running(at(700))).state == .quiet)
    }

    @Test func waitingForYouBeatsEverything() {
        var t = DirectorTelemetry()
        t.ingest(line: claudeInit, now: at(0))
        let h = DirectorHealth.evaluate(t, context: running(at(5_000), awaiting: true))
        #expect(h.state == .waitingForYou)
    }

    @Test func identicalCallsThreeTimesIsPossiblyLooping() {
        var t = DirectorTelemetry()
        t.ingest(line: claudeInit, now: at(0))
        for i in 0..<2 {
            t.ingest(line: claudeToolLine(id: "r\(i)", name: "Read", input: #"{"file_path":"/a/scene.html"}"#), now: at(Double(i) * 10))
            t.ingest(line: toolResult, now: at(Double(i) * 10 + 1))
        }
        #expect(DirectorHealth.evaluate(t, context: running(at(25))).state != .possiblyLooping)
        t.ingest(line: claudeToolLine(id: "r2", name: "Read", input: #"{"file_path":"/a/scene.html"}"#), now: at(30))
        let h = DirectorHealth.evaluate(t, context: running(at(31)))
        #expect(h.state == .possiblyLooping)
        #expect(h.loopReason?.contains("3 times") == true)
    }

    @Test func differentInputsOrWaitCallsAreNotLoops() {
        var t = DirectorTelemetry()
        t.ingest(line: claudeInit, now: at(0))
        for i in 0..<4 { t.ingest(line: claudeToolLine(id: "d\(i)", name: "Read", input: #"{"file_path":"/a/\#(i).html"}"#), now: at(Double(i))) }
        #expect(DirectorHealth.evaluate(t, context: running(at(10))).state != .possiblyLooping)
        var w = DirectorTelemetry()
        w.ingest(line: claudeInit, now: at(0))
        for i in 0..<5 { w.ingest(line: claudeToolLine(id: "w\(i)", input: #"{"command":"node console.mjs wait --run /r --timeout 600"}"#), now: at(Double(i))) }
        #expect(DirectorHealth.evaluate(w, context: running(at(10))).state != .possiblyLooping)
    }

    @Test func repeatedMessagesLoop() {
        var t = DirectorTelemetry()
        t.ingest(line: claudeInit, now: at(0))
        for i in 0..<3 {
            t.ingest(line: #"{"type":"assistant","message":{"model":"claude-sonnet-5-5","id":"m\#(i)","content":[{"type":"text","text":"Retrying the render now."}],"usage":{"input_tokens":1,"output_tokens":5}}}"#, now: at(Double(i) * 20))
        }
        #expect(DirectorHealth.evaluate(t, context: running(at(65))).state == .possiblyLooping)
    }

    @Test func heavyBurnWithoutAPushLoops() {
        var t = DirectorTelemetry()
        t.ingest(line: claudeInit, now: at(0))
        // 1.2M fresh tokens over 11 minutes, varied calls, no console push.
        for i in 0..<12 {
            t.ingest(line: #"{"type":"assistant","message":{"model":"claude-sonnet-5-5","id":"b\#(i)","content":[{"type":"tool_use","id":"u\#(i)","name":"Read","input":{"file_path":"/f\#(i)"}}],"usage":{"input_tokens":100000,"output_tokens":100,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}"#, now: at(Double(i) * 55 + 30))
        }
        let h = DirectorHealth.evaluate(t, context: running(at(12 * 55 + 31)))
        #expect(h.state == .possiblyLooping)
        #expect(h.loopReason?.contains("tokens a minute") == true)
        // A recent console update clears it.
        let calm = DirectorHealth.evaluate(t, context: running(at(12 * 55 + 31), consoleUpdate: at(12 * 55)))
        #expect(calm.state != .possiblyLooping)
    }

    @Test func cacheReadsAloneAreNotBurn() {
        var t = DirectorTelemetry()
        t.ingest(line: claudeInit, now: at(0))
        for i in 0..<12 {
            t.ingest(line: #"{"type":"assistant","message":{"model":"claude-sonnet-5-5","id":"c\#(i)","content":[{"type":"tool_use","id":"k\#(i)","name":"Read","input":{"file_path":"/f\#(i)"}}],"usage":{"input_tokens":50,"output_tokens":100,"cache_read_input_tokens":500000}}}"#, now: at(Double(i) * 55 + 30))
        }
        #expect(DirectorHealth.evaluate(t, context: running(at(12 * 55 + 31))).state != .possiblyLooping)
    }

    @Test func exitStates() {
        var t = DirectorTelemetry()
        t.ingest(lines: TelemetryFixtures.claude, now: at(0))
        #expect(DirectorHealth.evaluate(t, context: HealthContext(now: at(9), processRunning: false, exitCode: 0)).state == .finished)
        #expect(DirectorHealth.evaluate(t, context: HealthContext(now: at(9), processRunning: false, exitCode: 1)).state == .failed)
        #expect(DirectorHealth.evaluate(t, context: HealthContext(now: at(9), processRunning: false, exitCode: 15, stopRequested: true)).state == .stopped)
    }
}

@Suite struct UsageFiles {
    @Test func incrementalReadsHandlePartialLines() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("usage-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let log = dir.appendingPathComponent("director.log")
        try "one\ntwo\npart".write(to: log, atomically: true, encoding: .utf8)
        var read = DirectorUsageStore.readLines(file: log, from: 0)
        #expect(read.lines == ["one", "two"])
        let handle = try FileHandle(forWritingTo: log); try handle.seekToEnd(); try handle.write(contentsOf: Data("ial\nthree\n".utf8)); try handle.close()
        read = DirectorUsageStore.readLines(file: log, from: read.offset)
        #expect(read.lines == ["partial", "three"])
        var telemetry = DirectorTelemetry()
        telemetry.ingest(lines: TelemetryFixtures.claude, now: at(0))
        DirectorUsageStore.save(.init(telemetry: telemetry, logOffset: 42, rolloutPath: nil, rolloutOffset: 0), run: dir)
        let loaded = try #require(DirectorUsageStore.summary(run: dir))
        #expect(loaded.tokens == telemetry.tokens)
        #expect(loaded.cost.reportedUSD == 0.0307803)
    }

    @Test func readableLogShowsWhatHappened() {
        let text = DirectorLogRenderer.readable((TelemetryFixtures.claude + ["plain line from stderr"]).joined(separator: "\n"))
        #expect(text.contains("→ Bash: Run echo command"))
        #expect(text.contains("Done"))
        #expect(text.contains("Director finished"))
        #expect(text.contains("plain line from stderr"))
        #expect(!text.contains("\"type\""))
        let codex = DirectorLogRenderer.readable(TelemetryFixtures.codex.joined(separator: "\n"))
        #expect(codex.contains("→ echo hi"))
    }
}
