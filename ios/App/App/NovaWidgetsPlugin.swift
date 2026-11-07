import Foundation
import Capacitor
import WidgetKit

/// The Home Screen widgets' door from the web app (src/widgetBridge.js).
/// The widget extension cannot read the web view's storage, so Nova hands it
/// the Mac's address and token through the shared App Group, and asks iOS to
/// redraw the widgets right after a sync.
///
///   NovaWidgets.configure({ baseUrl, token })
///   NovaWidgets.reload()
@objc(NovaWidgetsPlugin)
public class NovaWidgetsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NovaWidgetsPlugin"
    public let jsName = "NovaWidgets"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reload", returnType: CAPPluginReturnPromise),
    ]

    // the same suite and keys the extension reads (NovaWidgets.swift, NovaShared)
    static let suite = "group.com.haydencooper.novaos"

    @objc func configure(_ call: CAPPluginCall) {
        guard let base = call.getString("baseUrl"), let token = call.getString("token"),
              let shared = UserDefaults(suiteName: Self.suite) else {
            return call.reject("configure needs baseUrl and token, and the App Group")
        }
        shared.set(base, forKey: "nova.baseUrl")
        shared.set(token, forKey: "nova.token")
        call.resolve()
    }

    @objc func reload(_ call: CAPPluginCall) {
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}
