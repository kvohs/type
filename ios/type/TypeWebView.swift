import SwiftUI
import WebKit

// The WKWebView host. Loads the bundled web/index.html (the same file the
// desktop app ships) and exposes a small typeAPI bridge:
//   saveNote({content, filename})  -> .md into iCloud Drive (or local Documents)
//   sendFeedback({body})           -> confirm sheet, then POST to the Coop endpoint
// The page detects iOS through typeAPI.isIOS and turns on its touch layer.
struct TypeWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsInlineMediaPlayback = true

        let version = (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? ""
        #if DEBUG
        let debugFlag = "true"
        #else
        let debugFlag = "false"
        #endif
        // typeAPI lands before the page script runs, same contract as preload.js
        let bridge = """
        window.typeAPI = {
          isDesktop: false,
          isIOS: true,
          debug: \(debugFlag),
          log: (m) => window.webkit.messageHandlers.type.postMessage({ action: 'log', message: String(m) }),
          version: '\(version)',
          saveNote: (p) => window.webkit.messageHandlers.type.postMessage({ action: 'saveNote', content: p && p.content || '', filename: p && p.filename || 'type.md' }),
          haptic: (kind) => window.webkit.messageHandlers.type.postMessage({ action: 'haptic', kind: kind || 'key' }),
          setShellTheme: (p) => window.webkit.messageHandlers.type.postMessage({ action: 'setShellTheme', bg: p && p.bg || '#ffffff', dark: !!(p && p.dark) }),
          sendFeedback: (p) => new Promise((resolve) => {
            window.__typeFeedbackResolve = resolve;
            window.webkit.messageHandlers.type.postMessage({ action: 'sendFeedback', body: p && p.body || '' });
          }),
        };
        """
        config.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.add(context.coordinator, name: "type")

        let webView = AccessoryHidingWebView(frame: .zero, configuration: config)
        context.coordinator.webView = webView
        webView.isOpaque = false
        webView.backgroundColor = .white
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        webView.navigationDelegate = context.coordinator

        if let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web") {
            webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        weak var webView: WKWebView?

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "type", let body = message.body as? [String: Any],
                  let action = body["action"] as? String else { return }
            switch action {
            case "saveNote":
                let content = body["content"] as? String ?? ""
                let filename = body["filename"] as? String ?? "type.md"
                NoteSaver.save(content: content, filename: filename)
            case "sendFeedback":
                let text = body["body"] as? String ?? ""
                sendFeedback(text)
            case "haptic":
                Haptics.play(body["kind"] as? String ?? "key")
            case "setShellTheme":
                let bg = body["bg"] as? String ?? "#ffffff"
                let dark = body["dark"] as? Bool ?? false
                DispatchQueue.main.async {
                    ThemeStore.shared.apply(bgHex: bg, dark: dark)
                    self.webView?.backgroundColor = UIColor(typeHex: bg)
                }
            case "log":
                #if DEBUG
                // web-side diagnostics: visible in the console AND pullable
                // off-device via `devicectl device copy from` (Documents/type-diag.log)
                let line = body["message"] as? String ?? ""
                NSLog("type-web: %@", line)
                DiagLog.append(line)
                #endif
            default:
                break
            }
        }

        #if DEBUG
        // GUI-free test hooks for `simctl launch` / `devicectl launch`:
        //   -typeTestSave  drives the full saveNote chain (bridge → disk)
        //   -typeTestType  replays keyboard-style value changes through the
        //                  hidden field exactly as WebKit does after native
        //                  insertion (mutate value, dispatch 'input'), then
        //                  logs the page's writing-line state
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            let args = ProcessInfo.processInfo.arguments
            if args.contains("-typeTestSave") {
                webView.evaluateJavaScript("window.typeAPI.saveNote({ content: '# bridge test\\n', filename: 'bridge-test.md' })")
            }
            if args.contains("-typeTestType") {
                let js = """
                setTimeout(() => {
                  const mi = document.getElementById('mobileInput');
                  if (!mi) { window.typeAPI.log('TEST: no mobileInput'); return; }
                  mi.focus();
                  const sendChar = (ch) => {
                    mi.value = mi.value + ch;                 // what native insertion does
                    mi.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ch, bubbles: true }));
                  };
                  const sendBackspace = () => {
                    mi.value = mi.value.slice(0, -1);
                    mi.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }));
                  };
                  for (const c of 'ok hi') sendChar(c);
                  sendBackspace();
                  sendChar('!');
                  setTimeout(() => {
                    const lines = [...document.querySelectorAll('#feed .line')].map(l => l.textContent);
                    window.typeAPI.log('TEST page lines: ' + JSON.stringify(lines));
                  }, 300);
                }, 4000);
                """
                webView.evaluateJavaScript(js)
            }
        }
        #endif

        // external links (why?, etc.) go to Safari, never navigate the sheet away
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if let url = navigationAction.request.url, ["http", "https"].contains(url.scheme ?? "") {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        private func resolveFeedback(ok: Bool, cancelled: Bool = false, error: String? = nil) {
            var payload = "{ ok: \(ok)"
            if cancelled { payload += ", cancelled: true" }
            if let error { payload += ", error: '\(error.replacingOccurrences(of: "'", with: ""))'" }
            payload += " }"
            webView?.evaluateJavaScript("window.__typeFeedbackResolve && window.__typeFeedbackResolve(\(payload)); window.__typeFeedbackResolve = null;")
        }

        // mirror of the desktop flow: show exactly what's about to leave the
        // phone, then POST { body, version } — the recipient lives server-side
        private func sendFeedback(_ text: String) {
            let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !body.isEmpty else { resolveFeedback(ok: false, error: "empty feedback"); return }
            guard let root = webView?.window?.rootViewController else { resolveFeedback(ok: false, error: "no window"); return }

            let preview = body.count > 600 ? String(body.prefix(600)) + "\n…" : body
            let alert = UIAlertController(title: "Send this feedback to Kelly?", message: preview, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in
                self.resolveFeedback(ok: false, cancelled: true)
            })
            alert.addAction(UIAlertAction(title: "Send", style: .default) { _ in
                var req = URLRequest(url: URL(string: "https://heycoop.ai/api/type-feedback")!)
                req.httpMethod = "POST"
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                let version = (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? ""
                req.httpBody = try? JSONSerialization.data(withJSONObject: ["body": body, "version": version + " (ios)"])
                URLSession.shared.dataTask(with: req) { _, response, error in
                    DispatchQueue.main.async {
                        if let error { self.resolveFeedback(ok: false, error: error.localizedDescription); return }
                        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                        if (200..<300).contains(status) { self.resolveFeedback(ok: true) }
                        else { self.resolveFeedback(ok: false, error: "server returned \(status)") }
                    }
                }.resume()
            })
            root.present(alert, animated: true)
        }
    }
}

// WKWebView shows a shortcut bar above the keyboard for focused form fields.
// On a sheet of paper that bar is chrome, and the app's whole thesis is no
// chrome. Overriding inputAccessoryView on the content view's dynamic
// subclass (a public UIResponder property) removes it.
final class AccessoryHidingWebView: WKWebView {
    private static var hiddenClassesByContent: [String: AnyClass] = [:]

    override init(frame: CGRect, configuration: WKWebViewConfiguration) {
        super.init(frame: frame, configuration: configuration)
        // hideAccessoryBar() — DISABLED: on real hardware (iOS 26) the dynamic
        // subclass kills UITextInput insertion entirely: keydown events still
        // reach the page but no character ever lands in the field. The shortcut
        // bar is chrome we'd rather lose, but typing comes first.
    }

    required init?(coder: NSCoder) { fatalError() }

    private func hideAccessoryBar() {
        guard let contentView = scrollView.subviews.first(where: { String(describing: type(of: $0)).hasPrefix("WKContent") }) else { return }
        let baseName = String(describing: type(of: contentView))
        if let cached = Self.hiddenClassesByContent[baseName] {
            object_setClass(contentView, cached)
            return
        }
        guard let baseClass = object_getClass(contentView),
              let newClass = objc_allocateClassPair(baseClass, baseName + "_NoAccessory", 0) else { return }
        let getter: @convention(block) (AnyObject) -> UIView? = { _ in nil }
        class_addMethod(newClass, #selector(getter: UIResponder.inputAccessoryView), imp_implementationWithBlock(getter), "@@:")
        objc_registerClassPair(newClass)
        Self.hiddenClassesByContent[baseName] = newClass
        object_setClass(contentView, newClass)
    }
}
