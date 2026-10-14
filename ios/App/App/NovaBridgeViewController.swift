import UIKit
import Capacitor

/// The shell's web view controller (Main.storyboard points here instead of
/// the stock CAPBridgeViewController). Its one job: register the plugins
/// that live in this app target rather than in an npm package, which
/// Capacitor cannot discover on its own.
class NovaBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NovaLiveActivityPlugin())
        bridge?.registerPluginInstance(NovaHealthPlugin())
        bridge?.registerPluginInstance(NovaWidgetsPlugin())
    }
}
