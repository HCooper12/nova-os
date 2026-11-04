import UIKit
import Capacitor
import WebKit

/// The shell's web view controller (Main.storyboard points here instead of
/// the stock CAPBridgeViewController). It registers the plugins that live in
/// this app target rather than in an npm package, which Capacitor cannot
/// discover on its own, and puts Nova's saved state back if WebKit lost it.
class NovaBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NovaLiveActivityPlugin())
        bridge?.registerPluginInstance(NovaHealthPlugin())
        bridge?.registerPluginInstance(NovaWidgetsPlugin())
        bridge?.registerPluginInstance(NovaDurablePlugin())
        // runs before any of the page's own scripts, on every load
        if let js = NovaDurable.restoreScript() {
            webView?.configuration.userContentController.addUserScript(
                WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        // cold launch from a widget: set the hash before the app reads it, once
        if let hash = NovaDeepLink.pending {
            NovaDeepLink.pending = nil
            let js = "if (!window.location.hash || window.location.hash === '#/mission') window.location.hash = '\(hash)';"
            webView?.configuration.userContentController.addUserScript(
                WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
    }
}

/// NOVA'S SAVED STATE, KEPT TWICE (4 Nov 2026). His phone turned off, and
/// when it came back Nova showed demo data and asked for the backend: WebKit
/// had lost the page's storage, and with it the Mac's address and token, his
/// settings, the offline copy of his data and the queue of unsent writes.
/// An app keeps its data through that, so Nova now does too.
///
/// The page mirrors every `novaos.*` key it writes into files here, in the
/// app's own Application Support folder, which WebKit's storage purges never
/// touch (src/durable.js). On load, before the page runs, the script below puts
/// the missing ones back (smallest first, so the 2.3 MB data copy can never
/// crowd out the token under the storage cap), but ONLY when the page's
/// storage has been wiped: the page stamps `novaos.__alive` on every boot, and
/// a wipe takes the stamp with it. Or when the stamp is there but the
/// connection is not and the copy has one: a boot that ran in demo after a
/// wipe (before this build was installed) must not strand him there. A
/// deliberate Disconnect removes the copy's connection and the App Group's
/// too, so it is never undone.
///
/// If no mirror exists yet (the first launch of this build after a wipe), the
/// Mac's address and token come back from the App Group, where the widgets
/// have been keeping them since 14 Oct.
enum NovaDurable {
    static let alive = "novaos.__alive"

    static var folder: URL? {
        guard let base = try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true) else { return nil }
        let dir = base.appendingPathComponent("NovaDurable", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// only plain Nova keys become file names
    static func safe(_ key: String) -> Bool {
        guard key.hasPrefix("novaos."), key != alive, key.count <= 120 else { return false }
        return key.unicodeScalars.allSatisfy { CharacterSet.alphanumerics.contains($0) || $0 == "." || $0 == "_" || $0 == "-" }
    }

    static func fileURL(_ key: String) -> URL? { folder?.appendingPathComponent(key + ".txt") }

    static func readAll() -> [String: String] {
        guard let dir = folder, let names = try? FileManager.default.contentsOfDirectory(atPath: dir.path) else { return [:] }
        var out: [String: String] = [:]
        for name in names where name.hasSuffix(".txt") {
            let key = String(name.dropLast(4))
            guard safe(key), let s = try? String(contentsOf: dir.appendingPathComponent(name), encoding: .utf8) else { continue }
            out[key] = s
        }
        return out
    }

    static func restoreScript() -> String? {
        var saved = readAll()
        if saved["novaos.connection"] == nil,
           let shared = UserDefaults(suiteName: NovaWidgetsPlugin.suite),
           let base = shared.string(forKey: "nova.baseUrl"), let token = shared.string(forKey: "nova.token"),
           let data = try? JSONSerialization.data(withJSONObject: ["baseUrl": base, "token": token]),
           let conn = String(data: data, encoding: .utf8) {
            saved["novaos.connection"] = conn
        }
        guard !saved.isEmpty,
              let data = try? JSONSerialization.data(withJSONObject: saved),
              let json = String(data: data, encoding: .utf8) else { return nil }
        return """
        (function(){try{var ls=window.localStorage;var d=\(json);
        if(ls.getItem('\(alive)')!==null&&(ls.getItem('novaos.connection')!==null||!d['novaos.connection']))return;
        var n=0;var ks=Object.keys(d).sort(function(a,b){return d[a].length-d[b].length;});
        for(var i=0;i<ks.length;i++){var k=ks[i];if(ls.getItem(k)===null){try{ls.setItem(k,d[k]);n++;}catch(e){}}}
        window.__novaRestored=n;}catch(e){}})();
        """
    }
}

/// The page's side of the mirror (src/durable.js).
///   NovaDurable.set({ key, value })   NovaDurable.remove({ key })
@objc(NovaDurablePlugin)
public class NovaDurablePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NovaDurablePlugin"
    public let jsName = "NovaDurable"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]

    @objc func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), NovaDurable.safe(key), let value = call.getString("value"),
              let url = NovaDurable.fileURL(key) else { return call.reject("set needs a novaos.* key and a string value") }
        do {
            try value.write(to: url, atomically: true, encoding: .utf8)
            call.resolve()
        } catch { call.reject("could not save \(key): \(error.localizedDescription)") }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), NovaDurable.safe(key), let url = NovaDurable.fileURL(key) else {
            return call.reject("remove needs a novaos.* key")
        }
        try? FileManager.default.removeItem(at: url)
        // Disconnect: the widgets' copy of the token goes too, or the next
        // wipe would bring back a connection he removed
        if key == "novaos.connection", let shared = UserDefaults(suiteName: NovaWidgetsPlugin.suite) {
            shared.removeObject(forKey: "nova.baseUrl")
            shared.removeObject(forKey: "nova.token")
        }
        call.resolve()
    }
}
