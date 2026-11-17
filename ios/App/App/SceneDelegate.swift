import UIKit
import Capacitor
import WidgetKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // a widget tap that launched the app cold: the page is not loaded yet, so
        // the hash is injected as it loads (NovaBridgeViewController)
        if let url = connectionOptions.urlContexts.first?.url {
            NovaDeepLink.pending = NovaDeepLink.hash(for: url)
            NovaDeepLink.faceFront(url)
        }

        window = UIWindow(windowScene: windowScene)
        // NovaBridgeViewController, not the stock one: it registers the app-target
        // plugins (NovaLiveActivity). Main.storyboard is not used under scenes.
        window?.rootViewController = NovaBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // already running: the page is live, so move it now
        if let url = URLContexts.first?.url, let hash = NovaDeepLink.hash(for: url) {
            (window?.rootViewController as? CAPBridgeViewController)?.webView?
                .evaluateJavaScript("window.location.hash = '\(hash)'")
            NovaDeepLink.faceFront(url)
        }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// novaos://open/<screen>[/<part>] -> "#/<screen>[/<part>]". Only plain names
/// pass, so a crafted link cannot put anything else into the page. The second
/// part says what to open on the screen ("leader/ask": the Leader's question).
enum NovaDeepLink {
    static var pending: String?

    static func hash(for url: URL) -> String? {
        guard url.scheme == "novaos", url.host == "open" else { return nil }
        let path = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let parts = path.split(separator: "/", omittingEmptySubsequences: false)
        guard (1...2).contains(parts.count),
              parts.allSatisfy({ !$0.isEmpty && $0.allSatisfy({ $0.isLetter || $0.isNumber }) }) else { return nil }
        return "#/" + path
    }

    /// A widget turned over (The Line, Lead) faces front again once he has
    /// opened Nova from it (mockup 123): every turned flag goes, and both redraw.
    static func faceFront(_ url: URL) {
        guard url.scheme == "novaos", let d = UserDefaults(suiteName: NovaWidgetsPlugin.suite) else { return }
        for k in d.dictionaryRepresentation().keys where k.hasPrefix("nova.lineTurned.") || k.hasPrefix("nova.leadTurned.") {
            d.removeObject(forKey: k)
        }
        WidgetCenter.shared.reloadTimelines(ofKind: "NovaLine")
        WidgetCenter.shared.reloadTimelines(ofKind: "NovaLead")
    }
}
