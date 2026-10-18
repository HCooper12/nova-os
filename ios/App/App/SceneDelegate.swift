import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // a widget tap that launched the app cold: the page is not loaded yet, so
        // the hash is injected as it loads (NovaBridgeViewController)
        if let url = connectionOptions.urlContexts.first?.url { NovaDeepLink.pending = NovaDeepLink.hash(for: url) }

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
        }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// novaos://open/<screen> -> "#/<screen>". Only plain screen names pass, so a
/// crafted link cannot put anything else into the page.
enum NovaDeepLink {
    static var pending: String?

    static func hash(for url: URL) -> String? {
        guard url.scheme == "novaos", url.host == "open" else { return nil }
        let screen = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !screen.isEmpty, screen.allSatisfy({ $0.isLetter || $0.isNumber }) else { return nil }
        return "#/" + screen
    }
}
