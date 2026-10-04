import AppKit
import StudioCore
import SwiftUI
import WebKit

/// Reuses every engine control, rather than translating special-stage actions incorrectly.
struct ConsoleWorkspace: NSViewRepresentable {
    let address: ConsoleAddress
    func makeCoordinator() -> Coordinator { Coordinator(address: address) }
    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        context.coordinator.load(view, address: address)
        return view
    }
    func updateNSView(_ view: WKWebView, context: Context) {
        if context.coordinator.address.port != address.port || context.coordinator.address.token != address.token {
            context.coordinator.load(view, address: address)
        }
    }
    @MainActor final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var address: ConsoleAddress
        init(address: ConsoleAddress) { self.address = address }
        func load(_ view: WKWebView, address: ConsoleAddress) {
            self.address = address
            view.configuration.userContentController.removeAllUserScripts()
            view.configuration.userContentController.addUserScript(WKUserScript(source:
                "Object.defineProperty(window, '__RASANAI_NATIVE_TOKEN', {value: '\(address.token)', writable: false});",
                injectionTime: .atDocumentStart, forMainFrameOnly: true))
            // The token never enters navigation/history URLs or an external website.
            let cookie = HTTPCookie(properties: [.domain: "127.0.0.1", .path: "/",
                .name: "rasa_\(address.token.prefix(6))", .value: address.token])!
            view.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) {
                view.load(address.request(path: ""))
            }
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
            if url.scheme == "about" || (url.scheme == "http" && url.host == "127.0.0.1" && url.port == address.port) {
                decisionHandler(navigationAction.shouldPerformDownload ? .download : .allow)
            } else {
                decisionHandler(.cancel)
                if navigationAction.navigationType == .linkActivated, ["https", "http"].contains(url.scheme ?? "") {
                    NSWorkspace.shared.open(url)
                }
            }
        }
        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
        func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor ([URL]?) -> Void) {
            let panel = NSOpenPanel()
            panel.allowsMultipleSelection = parameters.allowsMultipleSelection
            panel.canChooseDirectories = parameters.allowsDirectories
            panel.begin { response in completionHandler(response == .OK ? panel.urls : nil) }
        }
    }
}

extension ConsoleWorkspace.Coordinator: WKDownloadDelegate {
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping @MainActor (URL?) -> Void) {
        let panel = NSSavePanel(); panel.nameFieldStringValue = suggestedFilename
        panel.begin { result in completionHandler(result == .OK ? panel.url : nil) }
    }
}
