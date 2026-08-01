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
        buildStatusItem()
        buildPanel()
        registerHotKey()
        // no Dock icon, no app switcher — it lives in the menu bar
        NSApp.setActivationPolicy(.accessory)
    }

    private var novaURL: URL {
        let s = UserDefaults.standard.string(forKey: NOVA_URL_KEY) ?? DEFAULT_URL
        return URL(string: s) ?? URL(string: DEFAULT_URL)!
    }

    func buildStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            // the core, drawn small: a filled ring reads at 16pt where a glyph doesn't
            let img = NSImage(size: NSSize(width: 16, height: 16), flipped: false) { rect in
                NSColor.controlAccentColor.setStroke()
                let ring = NSBezierPath(ovalIn: rect.insetBy(dx: 2.5, dy: 2.5))
                ring.lineWidth = 1.6
                ring.stroke()
                NSColor.controlAccentColor.setFill()
                NSBezierPath(ovalIn: rect.insetBy(dx: 6.2, dy: 6.2)).fill()
                return true
            }
            img.isTemplate = true
            button.image = img
            button.action = #selector(toggle)
            button.target = self
        }
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

    // Grant the mic once, at the OS prompt, rather than on every summon.
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    @objc func toggle() {
        if panel.isVisible { panel.orderOut(nil); return }
        showPanel()
    }

    func showPanel() {
        // anchor under the status item when we can, else top-right of the screen
        var origin = NSPoint(x: 200, y: 200)
        if let btn = statusItem.button, let bw = btn.window {
            let f = bw.convertToScreen(btn.convert(btn.bounds, to: nil))
            origin = NSPoint(x: min(f.midX - panel.frame.width / 2,
                                    (NSScreen.main?.visibleFrame.maxX ?? f.midX) - panel.frame.width - 12),
                             y: f.minY - panel.frame.height - 8)
        }
        panel.setFrameOrigin(origin)
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        // reload only if the page died; otherwise the conversation continues
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
