import Foundation
import Capacitor
#if canImport(ActivityKit)
import ActivityKit
#endif

/// The web app's way to the real Dynamic Island and lock screen.
/// JavaScript side: src/liveActivity.js (a no-op outside this shell).
///
///   NovaLiveActivity.isAvailable()            -> { available }
///   NovaLiveActivity.sync({ kind, key, state }) starts the card for `kind`,
///       updates it while `key` is the same, or replaces it when `key` changes
///       (a new workout is a new card, not an edit of yesterday's)
///   NovaLiveActivity.end({ kind })            takes that card away
///
/// One card per kind at most. Cards left over from a previous launch are
/// adopted by kind, so a relaunch updates the card on screen instead of
/// stacking a second one beside it.
@objc(NovaLiveActivityPlugin)
public class NovaLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NovaLiveActivityPlugin"
    public let jsName = "NovaLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            call.resolve(["available": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["available": false])
        }
    }

    @objc func sync(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.reject("Live Activities need iOS 16.2") }
        guard let kind = call.getString("kind"), let key = call.getString("key"),
              let raw = call.getObject("state") else {
            return call.reject("sync needs kind, key and state")
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            return call.reject("Live Activities are switched off for Nova in Settings")
        }
        let state: NovaActivityAttributes.ContentState
        do {
            let data = try JSONSerialization.data(withJSONObject: raw)
            state = try JSONDecoder().decode(NovaActivityAttributes.ContentState.self, from: data)
        } catch {
            return call.reject("state did not match NovaActivityAttributes: \(error.localizedDescription)")
        }
        Task {
            await LiveCards.shared.sync(kind: kind, key: key, state: state)
            call.resolve()
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.resolve() }
        guard let kind = call.getString("kind") else { return call.reject("end needs kind") }
        Task {
            await LiveCards.shared.end(kind: kind)
            call.resolve()
        }
    }
}

/// The cards themselves, serialised through one actor so two quick syncs for
/// the same kind can never start two cards.
@available(iOS 16.2, *)
actor LiveCards {
    static let shared = LiveCards()

    private func current(_ kind: String) -> Activity<NovaActivityAttributes>? {
        Activity<NovaActivityAttributes>.activities.first {
            $0.attributes.kind == kind && $0.activityState == .active
        }
    }

    func sync(kind: String, key: String, state: NovaActivityAttributes.ContentState) async {
        // a stale card is one iOS should grey out: a workout clock left
        // running for hours, a job that never reported back
        let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(3 * 3600))
        if let live = current(kind) {
            if live.attributes.key == key {
                await live.update(content)
                return
            }
            await live.end(nil, dismissalPolicy: .immediate)
        }
        do {
            _ = try Activity.request(
                attributes: NovaActivityAttributes(kind: kind, key: key),
                content: content,
                pushType: nil
            )
        } catch {
            // switched off, or too many cards: the web app carries on
        }
    }

    func end(kind: String) async {
        for live in Activity<NovaActivityAttributes>.activities where live.attributes.kind == kind {
            await live.end(nil, dismissalPolicy: .immediate)
        }
    }
}
