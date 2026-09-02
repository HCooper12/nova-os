import Cocoa
import WebKit
import Carbon.HIToolbox

// Nova in the menu bar — presence, not an app you visit.
//
// A status-bar item and a global ⌥Space hotkey summon a floating panel that
// loads Nova's own Voice screen in a WKWebView, already listening. It is
// deliberately a thin shell: no duplicated logic, no second source of truth —
// the same PWA, the same server, the same conversation. Closing it leaves the
// conversation exactly where it was, because the web app owns the state.
//
// Build: ./mac/build.sh   (swiftc only; no Xcode project, no signing needed)

let NOVA_URL_KEY = "novaBarURL"
let DEFAULT_URL = "https://hcooper12.github.io/nova-os/#/voice"

final class Panel: NSPanel {
    // A panel that can take keyboard focus while staying borderless — without
    // this the microphone button works but nothing can be typed.
    override var canBecomeKey: Bool { true }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate {
    var statusItem: NSStatusItem!
    var panel: Panel!
    var web: WKWebView!
    var hotKeyRef: EventHotKeyRef?

    func applicationDidFinishLaunching(_ note: Notification) {
        // Created one run-loop turn late: made too early in didFinishLaunching
        // the system hands back a status window with ZERO height that never
        // lands in the menu bar (button sized, item "visible", nothing drawn).
        DispatchQueue.main.async { [weak self] in self?.buildStatusItem() }
        buildPanel()
        registerHotKey()
        // no Dock icon, no app switcher — it lives in the menu bar
        NSApp.setActivationPolicy(.accessory)
        // Show once on launch. On some Macs the system refuses to place a
        // status item (its window comes back zero-height), which would leave a
        // running app with no visible way in — the hotkey is the real
        // interface, and this proves it is alive.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in self?.showPanel() }
    }

    private var novaURL: URL {
        let s = UserDefaults.standard.string(forKey: NOVA_URL_KEY) ?? DEFAULT_URL
        return URL(string: s) ?? URL(string: DEFAULT_URL)!
    }

    func buildStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            // An SF Symbol renders predictably at menu-bar size and inherits
            // the bar's light/dark treatment. The hand-drawn NSImage this
            // replaced produced an EMPTY template (alpha-only conversion lost
            // the strokes), so the item existed but was invisible — the worst
            // kind of bug: running, reachable by hotkey, and apparently absent.
            let cfg = NSImage.SymbolConfiguration(pointSize: 15, weight: .medium)
            if let sym = NSImage(systemSymbolName: "circle.hexagonpath.fill",
                                 accessibilityDescription: "Nova")?
                                 .withSymbolConfiguration(cfg) {
                sym.isTemplate = true
                button.image = sym
            } else if let sym = NSImage(systemSymbolName: "sparkle",
                                        accessibilityDescription: "Nova") {
                sym.isTemplate = true
                button.image = sym
            } else {
                button.title = "◉"          // last resort: always something to click
            }
            button.toolTip = "Nova — ⌥Space · right-click for Reload / Quit"
            button.action = #selector(toggle)
            button.target = self
            // right-click reaches the shell's own three verbs (see showMenu)
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }
        statusItem.isVisible = true
        // NOTE: on a notched Mac with a full menu bar, macOS may place this
        // item *under the notch*, where it is invisible though present. Freeing
        // one slot (System Settings → Control Centre → hide an item) shifts it
        // into view. The hotkey works either way.
    }

    func buildPanel() {
        let cfg = WKWebViewConfiguration()
        cfg.mediaTypesRequiringUserActionForPlayback = []   // Nova may speak on arrival
        cfg.allowsAirPlayForMediaPlayback = false
        let w: CGFloat = 420, h: CGFloat = 620
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: w, height: h), configuration: cfg)
        web.uiDelegate = self
        web.navigationDelegate = self
        web.setValue(false, forKey: "drawsBackground")     // let the panel's material show through
        web.load(URLRequest(url: novaURL))

        panel = Panel(contentRect: NSRect(x: 0, y: 0, width: w, height: h),
                      styleMask: [.titled, .fullSizeContentView, .nonactivatingPanel, .closable],
                      backing: .buffered, defer: false)
        panel.titlebarAppearsTransparent = true
        panel.titleVisibility = .hidden
        panel.isMovableByWindowBackground = true
        panel.level = .floating                            // stays above other apps
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true
        panel.backgroundColor = .clear

        let vis = NSVisualEffectView(frame: web.bounds)     // the Apple material behind the web view
        vis.material = .hudWindow
        vis.blendingMode = .behindWindow
        vis.state = .active
        vis.autoresizingMask = [.width, .height]
        vis.addSubview(web)
        web.autoresizingMask = [.width, .height]
        panel.contentView = vis
    }

    // Grant the mic once, at the OS prompt, rather than on every summon — but
    // only to Nova's own origin. The grant used to be unconditional, so any
    // page the web view was ever steered to could have opened the mic.
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let ours = novaURL.host?.lowercased()
        decisionHandler(ours != nil && origin.host.lowercased() == ours ? .grant : .deny)
    }

    // A failed load used to leave a blank panel — running, reachable, and
    // apparently dead. Say what happened, in the panel, with the one action.
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let target = novaURL.absoluteString
        let why = error.localizedDescription
            .replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
        let html = """
        <!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:transparent;color:#e8ecf6;font:14px/1.6 -apple-system,system-ui">
        <div style="text-align:center;max-width:300px;padding:24px">
          <div style="font:600 9px Menlo,monospace;letter-spacing:.22em;color:#e0b26a">NOVA UNREACHABLE</div>
          <div style="margin:12px 0 18px;opacity:.75">\(why)</div>
          <a href="\(target)" style="display:inline-block;padding:9px 16px;border-radius:8px;border:1px solid rgba(232,236,246,.25);color:#59e6ff;text-decoration:none;font:600 12px -apple-system,system-ui">Retry</a>
        </div></body>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    @objc func toggle() {
        if NSApp.currentEvent?.type == .rightMouseUp { showMenu(); return }
        if panel.isVisible { panel.orderOut(nil); return }
        showPanel()
    }

    // The shell's own three verbs — everything else is the web app's.
    func showMenu() {
        let menu = NSMenu()
        menu.addItem(withTitle: "Reload Nova", action: #selector(reloadNova), keyEquivalent: "r").target = self
        let where_ = NSMenuItem(title: novaURL.absoluteString, action: nil, keyEquivalent: "")
        where_.isEnabled = false
        menu.addItem(where_)
        menu.addItem(NSMenuItem.separator())
        menu.addItem(withTitle: "Quit Nova", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        statusItem.menu = menu
        statusItem.button?.performClick(nil)
        statusItem.menu = nil   // left-click keeps toggling the panel
    }

    @objc func reloadNova() {
        web.load(URLRequest(url: novaURL))
        showPanel()
    }

    func showPanel() {
        // Anchor under the status item when the system actually placed one.
        // Where it didn't (its window comes back zero-height at the origin —
        // see buildStatusItem), anchoring to it would fling the panel off the
        // bottom-left of the screen, so fall back to the top-right corner
        // where a menu-bar popover would have appeared anyway.
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        var origin = NSPoint(x: screen.maxX - panel.frame.width - 16,
                             y: screen.maxY - panel.frame.height - 8)
        // trust the status item only if the system genuinely placed it IN the
        // menu bar — a nonzero height alone isn't enough; it must be up there
        if let btn = statusItem.button, let bw = btn.window,
           bw.frame.height > 1, bw.frame.maxY > screen.maxY - 8 {
            let f = bw.convertToScreen(btn.convert(btn.bounds, to: nil))
            origin = NSPoint(x: min(f.midX - panel.frame.width / 2, screen.maxX - panel.frame.width - 12),
                             y: f.minY - panel.frame.height - 8)
        }
        // never leave it off any edge
        origin.x = max(screen.minX + 8, min(origin.x, screen.maxX - panel.frame.width - 8))
        origin.y = max(screen.minY + 8, min(origin.y, screen.maxY - panel.frame.height - 8))
        panel.setFrameOrigin(origin)
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if web.url == nil { web.load(URLRequest(url: novaURL)) }
    }

    // ⌥Space anywhere on the machine.
    func registerHotKey() {
        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard),
                                      eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { (_, _, userData) -> OSStatus in
            let me = Unmanaged<AppDelegate>.fromOpaque(userData!).takeUnretainedValue()
            DispatchQueue.main.async { me.toggle() }
            return noErr
        }, 1, &eventType, Unmanaged.passUnretained(self).toOpaque(), nil)

        let id = EventHotKeyID(signature: OSType(0x4E4F5641 /* NOVA */), id: 1)
        RegisterEventHotKey(UInt32(kVK_Space), UInt32(optionKey), id,
                            GetApplicationEventTarget(), 0, &hotKeyRef)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
