import UIKit
import WebKit

/// Показывает тот же офлайн-интерфейс, что и Android-версия (папка www в бандле),
/// и даёт странице мост KumykNative для озвучки — с тем же API, что на Android.
final class WebViewController: UIViewController, WKScriptMessageHandler {
    private var webView: WKWebView!
    private let speaker = Speaker()

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let content = WKUserContentController()
        content.add(self, name: "kumyk")
        let bridge = """
        window.KumykNative = {
          engine: function () { return "\(speaker.engine)"; },
          speak: function (c, l) { window.webkit.messageHandlers.kumyk.postMessage({cmd: "speak", c: String(c), l: String(l), p: 1, id: ""}); },
          speakEx: function (c, l, p, id) { window.webkit.messageHandlers.kumyk.postMessage({cmd: "speak", c: String(c), l: String(l), p: Number(p) || 1, id: String(id)}); },
          stop: function () { window.webkit.messageHandlers.kumyk.postMessage({cmd: "stop"}); },
          hasLang: function (tag) { return String(tag).indexOf("ru") === 0 ? \(speaker.hasLang("ru-RU")) : false; },
          speakLang: function (t, lang, p, id) { window.webkit.messageHandlers.kumyk.postMessage({cmd: "speakLang", t: String(t), lang: String(lang), p: Number(p) || 1, id: String(id)}); }
        };
        """
        content.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController = content

        let web = WKWebView(frame: .zero, configuration: config)
        web.scrollView.contentInsetAdjustmentBehavior = .never   // отступы под «чёлку» делает CSS (safe-area)
        web.scrollView.bounces = false
        web.allowsBackForwardNavigationGestures = true            // свайп от края — назад
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0xF4 / 255, green: 0xF5 / 255, blue: 0xFA / 255, alpha: 1)
        webView = web
        view = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        speaker.onDone = { [weak self] id in
            let safe = id.filter { $0.isLetter || $0.isNumber }
            self?.webView.evaluateJavaScript("window.__ttsDone && window.__ttsDone('\(safe)')", completionHandler: nil)
        }
        guard let dir = Bundle.main.url(forResource: "www", withExtension: nil) else { return }
        webView.loadFileURL(dir.appendingPathComponent("index.html"), allowingReadAccessTo: dir)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else { return }
        switch cmd {
        case "stop":
            speaker.stop()
        case "speak":
            let id = body["id"] as? String ?? ""
            let pitch = (body["p"] as? NSNumber)?.floatValue ?? 1
            let started = speaker.speak(cyrillic: body["c"] as? String ?? "",
                                        latin: body["l"] as? String ?? "",
                                        pitch: pitch, id: id)
            if !started && !id.isEmpty { speaker.onDone?(id) }
        case "speakLang":
            let id = body["id"] as? String ?? ""
            let pitch = (body["p"] as? NSNumber)?.floatValue ?? 1
            let started = speaker.speakLang(text: body["t"] as? String ?? "",
                                            lang: body["lang"] as? String ?? "ru-RU",
                                            pitch: pitch, id: id)
            if !started && !id.isEmpty { speaker.onDone?(id) }
        default:
            break
        }
    }
}
