import UIKit
import Capacitor
import WebKit

/// The shell's web view controller (Main.storyboard points here instead of
/// the stock CAPBridgeViewController). Its one job: register the plugins
/// that live in this app target rather than in an npm package, which
/// Capacitor cannot discover on its own.
class NovaBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NovaLiveActivityPlugin())
        bridge?.registerPluginInstance(NovaHealthPlugin())
        bridge?.registerPluginInstance(NovaWidgetsPlugin())
        // cold launch from a widget: set the hash before the app reads it, once
        if let hash = NovaDeepLink.pending {
            NovaDeepLink.pending = nil
            let js = "if (!window.location.hash || window.location.hash === '#/mission') window.location.hash = '\(hash)';"
            webView?.configuration.userContentController.addUserScript(
                WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
    }
}
