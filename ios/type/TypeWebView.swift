import SwiftUI
import WebKit
import UniformTypeIdentifiers
import CoreMotion

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

        var version = (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? ""
        if let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String, build != "1" {
            version += " · " + build      // settings footer shows the deploy stamp — the "am I current?" answer
        }
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
          listNotes: () => new Promise((resolve) => {
            window.__typeListResolve = resolve;
            window.webkit.messageHandlers.type.postMessage({ action: 'listNotes' });
          }),
          readNote: (filename) => new Promise((resolve) => {
            window.__typeReadResolve = resolve;
            window.webkit.messageHandlers.type.postMessage({ action: 'readNote', filename: filename || '' });
          }),
          shareNote: (p) => window.webkit.messageHandlers.type.postMessage({ action: 'shareNote', filename: p && p.filename || '', text: p && p.text || '' }),
          shareImage: (p) => { window.webkit.messageHandlers.type.postMessage({ action: 'shareImage', dataUrl: p && p.dataUrl || '', slug: p && p.slug || 'type-page' }); return Promise.resolve({ ok: true }); },
          deleteNote: (filename) => new Promise((resolve) => {
            window.__typeDeleteResolve = resolve;
            window.webkit.messageHandlers.type.postMessage({ action: 'deleteNote', filename: filename || '' });
          }),
          haptic: (kind) => window.webkit.messageHandlers.type.postMessage({ action: 'haptic', kind: kind || 'key' }),
          pickFolder: () => new Promise((resolve) => {
            window.__typePickFolderResolve = resolve;
            window.webkit.messageHandlers.type.postMessage({ action: 'pickFolder' });
          }),
          setShellTheme: (p) => window.webkit.messageHandlers.type.postMessage({ action: 'setShellTheme', bg: p && p.bg || '#ffffff', dark: !!(p && p.dark), accent: p && p.accent || '#df5a26' }),
          sendFeedback: (p) => new Promise((resolve) => {
            window.__typeFeedbackResolve = resolve;
            window.webkit.messageHandlers.type.postMessage({ action: 'sendFeedback', body: p && p.body || '', screenshot: p && p.screenshot || null });
          }),
        };
        """
        config.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.add(context.coordinator, name: "type")

        AccessoryHidingWebView.allowKeyboardWithoutUserAction()   // the page can raise the keyboard on its own — we're here to write
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

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, UIDocumentPickerDelegate {
        weak var webView: WKWebView?

        // --- save-folder picker ---
        // The system folder picker grants a security-scoped URL to any folder
        // Files can reach (any iCloud Drive folder, On My iPhone, providers).
        // A bookmark in UserDefaults keeps that access across launches.
        func presentFolderPicker() {
            guard let root = webView?.window?.rootViewController else { resolvePick(nil); return }
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
            picker.delegate = self
            root.present(picker, animated: true)
        }

        private func resolvePick(_ name: String?) {
            let arg: String
            if let name {
                let safe = name.replacingOccurrences(of: "\\", with: "").replacingOccurrences(of: "'", with: "\u{2019}")
                arg = "{ name: '\(safe)' }"
            } else {
                arg = "null"
            }
            webView?.evaluateJavaScript("window.__typePickFolderResolve && window.__typePickFolderResolve(\(arg)); window.__typePickFolderResolve = null;")
        }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            guard let url = urls.first else { resolvePick(nil); return }
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            if let bookmark = try? url.bookmarkData() {
                UserDefaults.standard.set(bookmark, forKey: "saveFolderBookmark")
                UserDefaults.standard.set(url.lastPathComponent, forKey: "saveFolderName")
                resolvePick(url.lastPathComponent)
            } else {
                resolvePick(nil)
            }
        }

        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
            resolvePick(nil)
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "type", let body = message.body as? [String: Any],
                  let action = body["action"] as? String else { return }
            switch action {
            case "saveNote":
                let content = body["content"] as? String ?? ""
                let filename = body["filename"] as? String ?? "type.md"
                NoteSaver.save(content: content, filename: filename) { dest in
                    // the page mentions the destination on the kept-stamp
                    self.webView?.evaluateJavaScript("window.__typeSaved && window.__typeSaved('\(dest)')")
                }
            case "listNotes":
                // hand the kept screen the saved .md files: filename + parsed
                // frontmatter (dateISO, kept, words) + body, newest-first.
                NoteSaver.list { items in
                    let data = (try? JSONSerialization.data(withJSONObject: items)) ?? Data("[]".utf8)
                    let json = String(data: data, encoding: .utf8) ?? "[]"
                    self.webView?.evaluateJavaScript("window.__typeListResolve && window.__typeListResolve(\(json)); window.__typeListResolve = null;")
                }
            case "readNote":
                let filename = body["filename"] as? String ?? ""
                NoteSaver.read(filename: filename) { text in
                    // wrap in a JSON array so the body is safely encoded, then unwrap
                    let data = (try? JSONSerialization.data(withJSONObject: [text])) ?? Data("[\"\"]".utf8)
                    let json = String(data: data, encoding: .utf8) ?? "[\"\"]"
                    self.webView?.evaluateJavaScript("window.__typeReadResolve && window.__typeReadResolve((\(json))[0]); window.__typeReadResolve = null;")
                }
            case "shareNote":
                shareNote(filename: body["filename"] as? String ?? "", text: body["text"] as? String ?? "")
            case "shareImage":
                shareImage(dataUrl: body["dataUrl"] as? String ?? "", slug: body["slug"] as? String ?? "type-page")
            case "deleteNote":
                let filename = body["filename"] as? String ?? ""
                NoteSaver.delete(filename: filename) { ok in
                    self.webView?.evaluateJavaScript("window.__typeDeleteResolve && window.__typeDeleteResolve(\(ok ? "true" : "false")); window.__typeDeleteResolve = null;")
                }
            case "sendFeedback":
                let text = body["body"] as? String ?? ""
                sendFeedback(text, screenshot: body["screenshot"] as? String)
            case "haptic":
                Haptics.play(body["kind"] as? String ?? "key")
            case "pickFolder":
                presentFolderPicker()
            case "setShellTheme":
                let bg = body["bg"] as? String ?? "#ffffff"
                let dark = body["dark"] as? Bool ?? false
                let accent = body["accent"] as? String ?? "#df5a26"
                DispatchQueue.main.async {
                    ThemeStore.shared.apply(bgHex: bg, dark: dark)
                    self.webView?.backgroundColor = UIColor(typeHex: bg)
                    // tintColor drives the text-selection highlight + grab handles + caret
                    // in the editable textarea; the OS default washed out on dark themes.
                    self.webView?.tintColor = UIColor(typeHex: accent)
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
            if args.contains("-typeTestKept") {
                // seed a couple of kept pages through the real bridge, then roll
                // the kept screen up — so `simctl io screenshot` can prove it.
                let js = """
                window.typeAPI.saveNote({ content: '---\\ndate: 2026-06-14\\nkept: 14 June 2026\\nwords: 14\\n---\\n\\nThe unlived life within us is the one Resistance guards.\\nEvery morning the same negotiation — sit down, or invent a reason not to.\\n', filename: 'type-2026-06-14-09-00.md' });
                setTimeout(() => window.typeAPI.saveNote({ content: '---\\ndate: 2026-06-12\\nkept: 12 June 2026\\nwords: 18\\n---\\n\\nTargeting in the second campaign was off. Gregory flagged it on the Next call.\\n', filename: 'type-2026-06-12-08-00.md' }), 250);
                setTimeout(() => window.typeAPI.saveNote({ content: '---\\ndate: 2026-05-28\\nkept: 28 May 2026\\nwords: 20\\n---\\n\\nThe whole point is you cannot go back and fix the line. That constraint is the feature.\\n', filename: 'type-2026-05-28-07-00.md' }), 500);
                setTimeout(() => window.__typeKept && window.__typeKept.open(), 1400);
                setTimeout(() => window.__typeKept && window.__typeKept._debugOpen(0), 2200);
                """
                webView.evaluateJavaScript(js)
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
                  for (const c of ' tou') sendChar(c);
                  // simulate iOS autocorrect: rewrite the word IN PLACE (mid-string edit)
                  mi.value = mi.value.replace(/tou$/, 'you');
                  mi.dispatchEvent(new InputEvent('input', { inputType: 'insertReplacementText', data: 'you', bubbles: true }));
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

        // present the native share sheet for a kept page. Shares the actual .md
        // (copied to a temp file so the security-scoped original can be released),
        // falling back to the plain text the page already has.
        private func shareNote(filename: String, text: String) {
            guard let root = webView?.window?.rootViewController else { return }
            var items: [Any] = []
            if let url = NoteSaver.tempCopy(filename: filename) { items = [url] }
            else if !text.isEmpty { items = [text] }
            guard !items.isEmpty else { return }
            let av = UIActivityViewController(activityItems: items, applicationActivities: nil)
            if let pop = av.popoverPresentationController, let wv = webView {
                pop.sourceView = wv
                pop.sourceRect = CGRect(x: wv.bounds.midX, y: wv.bounds.maxY - 60, width: 0, height: 0)
            }
            root.present(av, animated: true)
        }

        // share a rendered page image (a "typed sheet" of the writing) to the
        // native share sheet — write it to a temp PNG so AirDrop/Photos/Messages
        // get a real file with a sensible name.
        private func shareImage(dataUrl: String, slug: String) {
            guard let comma = dataUrl.range(of: ","),
                  let data = Data(base64Encoded: String(dataUrl[comma.upperBound...])),
                  let root = webView?.window?.rootViewController else { return }
            let safe = slug.isEmpty ? "type-page" : slug
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(safe).png")
            do { try data.write(to: url) } catch { return }
            let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            if let pop = av.popoverPresentationController, let wv = webView {
                pop.sourceView = wv
                pop.sourceRect = CGRect(x: wv.bounds.midX, y: wv.bounds.maxY - 60, width: 0, height: 0)
            }
            root.present(av, animated: true)
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
        private func sendFeedback(_ text: String, screenshot: String? = nil) {
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
                var json: [String: Any] = ["body": body, "version": version + " (ios)"]
                if let screenshot, screenshot.count <= 8_000_000 { json["screenshot"] = screenshot }
                req.httpBody = try? JSONSerialization.data(withJSONObject: json)
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
    // shake → snapshot the page as it looks right now, then the feedback
    // sheet opens with the shot riding along. Motion events ride the
    // responder chain up from the focused content view, so the webview
    // hears every shake.
    // iOS's built-in .motionShake needs a hard, sustained shake. Kept as a
    // fallback, but the primary trigger is CoreMotion below with a gentler,
    // tunable threshold so a normal flick of the wrist is enough.
    override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        if motion == .motionShake { triggerShakeFeedback() }
        super.motionEnded(motion, with: event)
    }

    private func triggerShakeFeedback() {
        takeSnapshot(with: WKSnapshotConfiguration()) { [weak self] image, _ in
            var arg = "null"
            if let jpeg = image?.jpegData(compressionQuality: 0.7) {
                arg = "'data:image/jpeg;base64,\(jpeg.base64EncodedString())'"
            }
            self?.evaluateJavaScript("window.__typeShake && window.__typeShake(\(arg))")
        }
    }

    // CoreMotion shake detection — a couple of acceleration peaks in quick
    // succession (a back-and-forth shake), not a single bump, so it's easy to
    // trigger on purpose but won't fire when you just set the phone down.
    private let motion = CMMotionManager()
    private var shakePeaks: [TimeInterval] = []
    private var lastShakeFire: TimeInterval = 0
    private func startShakeDetection() {
        guard motion.isDeviceMotionAvailable else { return }
        motion.deviceMotionUpdateInterval = 1.0 / 50.0
        motion.startDeviceMotionUpdates(to: .main) { [weak self] m, _ in
            guard let self, let a = m?.userAcceleration else { return }
            let mag = (a.x * a.x + a.y * a.y + a.z * a.z).squareRoot()   // gravity already removed
            let now = ProcessInfo.processInfo.systemUptime
            guard mag > 2.8 else { return }                              // firm, deliberate shake (doubled — was too easy)
            if let last = self.shakePeaks.last, now - last < 0.07 { return }  // same peak, one sample
            self.shakePeaks.append(now)
            self.shakePeaks = self.shakePeaks.filter { now - $0 < 0.9 }
            if self.shakePeaks.count >= 2, now - self.lastShakeFire > 2.0 {
                self.lastShakeFire = now
                self.shakePeaks.removeAll()
                self.triggerShakeFeedback()
            }
        }
    }

    private static var swappedClassesByContent: [String: AnyClass] = [:]

    // iOS normally refuses to show the keyboard for a programmatic focus() — it
    // requires a user tap. We're a writing app: the page focuses the live line as
    // soon as writing is possible and the keyboard should come up with it. Patch
    // WKContentView's focus callback to report the focus as user-initiated. Fully
    // defensive: if the private selector isn't present, nothing changes and the
    // app simply falls back to tap-to-type.
    private static var didPatchKeyboard = false
    static func allowKeyboardWithoutUserAction() {
        guard !didPatchKeyboard else { return }
        didPatchKeyboard = true
        guard let cls = NSClassFromString("WKContentView") else { return }
        let sel = NSSelectorFromString("_elementDidFocus:userIsInteracting:blurPreviousNode:activityStateChanges:userObject:")
        guard let method = class_getInstanceMethod(cls, sel) else { return }
        typealias Orig = @convention(c) (Any, Selector, UnsafeRawPointer, Bool, Bool, Bool, Any?) -> Void
        let orig = unsafeBitCast(method_getImplementation(method), to: Orig.self)
        let block: @convention(block) (Any, UnsafeRawPointer, Bool, Bool, Bool, Any?) -> Void = { me, node, _, blur, change, obj in
            orig(me, sel, node, true, blur, change, obj)   // force userIsInteracting = true
        }
        method_setImplementation(method, imp_implementationWithBlock(block))
    }

    override init(frame: CGRect, configuration: WKWebViewConfiguration) {
        super.init(frame: frame, configuration: configuration)
        // Replace the system shortcut bar (‹ ∨ ✓) with our own KEEP · kept · BURN
        // toolbar welded to the keyboard. NOTE: overriding the content view's
        // inputAccessoryView is the same lever that, when it returned nil to
        // *hide* the bar, broke text insertion on iOS 26. Returning a real
        // toolbar is a different case and is being trialled — if typing
        // misbehaves on device, delete installAccessory()/swapAccessory().
        NotificationCenter.default.addObserver(self, selector: #selector(swapAccessory),
                                               name: UIResponder.keyboardWillShowNotification, object: nil)
        installAccessory()
        startShakeDetection()
    }

    required init?(coder: NSCoder) { fatalError() }

    // A real, zero-height accessory: returning a non-nil view suppresses iOS's
    // ‹ ∨ ✓ shortcut bar WITHOUT the input-break that returning nil caused on
    // iOS 26. KEEP · ▬ · BURN live in the web bar docked just above the keyboard.
    private lazy var hiddenAccessory: UIView = {
        let v = UIView(frame: .zero)
        v.autoresizingMask = [.flexibleWidth]
        return v
    }()

    private func installAccessory(retries: Int = 8) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if !self.swapAccessory(), retries > 0 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { self.installAccessory(retries: retries - 1) }
            }
        }
    }

    @discardableResult
    @objc private func swapAccessory() -> Bool {
        guard let contentView = scrollView.subviews.first(where: { String(describing: type(of: $0)).hasPrefix("WKContent") }) else { return false }
        let baseName = String(describing: type(of: contentView))
        if String(describing: type(of: contentView)).hasSuffix("_TypeAccessory") { return true }   // already swapped
        let v = hiddenAccessory
        if let cached = Self.swappedClassesByContent[baseName] { object_setClass(contentView, cached); return true }
        guard let baseClass = object_getClass(contentView),
              let newClass = objc_allocateClassPair(baseClass, baseName + "_TypeAccessory", 0) else { return false }
        let getter: @convention(block) (AnyObject) -> UIView? = { _ in v }
        class_addMethod(newClass, #selector(getter: UIResponder.inputAccessoryView), imp_implementationWithBlock(getter), "@@:")
        objc_registerClassPair(newClass)
        Self.swappedClassesByContent[baseName] = newClass
        object_setClass(contentView, newClass)
        return true
    }
}
