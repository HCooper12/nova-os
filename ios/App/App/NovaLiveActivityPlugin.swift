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
        LiveCards.shared.enqueue {
            do {
                try await LiveCards.shared.sync(kind: kind, key: key, state: state)
                call.resolve()
            } catch {
                // rejected, so the web side forgets it sent this and tries
                // again (liveActivity.js retries when Nova is next in front)
                call.reject("iOS did not start the card: \(error.localizedDescription)")
            }
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.resolve() }
        guard let kind = call.getString("kind") else { return call.reject("end needs kind") }
        LiveCards.shared.enqueue {
            await LiveCards.shared.end(kind: kind)
            call.resolve()
        }
    }
}

/// The cards themselves. Every call runs strictly ONE AFTER ANOTHER, in the
/// order the web app made them (the Breaker's review, 13 Oct): an actor alone
/// is not enough, because an actor lets another call in at every `await`, so
/// two quick syncs could both find no card and both start one; and separate
/// `Task {}`s are not ordered, so "update n+1" could land before "update n".
/// One chain of tasks, each waiting for the last, closes both.
@available(iOS 16.2, *)
final class LiveCards: @unchecked Sendable {
    static let shared = LiveCards()
    private let lock = NSLock()
    private var tail: Task<Void, Never>?

    func enqueue(_ work: @escaping @Sendable () async -> Void) {
        lock.lock()
        let previous = tail
        tail = Task {
            await previous?.value
            await work()
        }
        lock.unlock()
    }

    private func current(_ kind: String) -> Activity<NovaActivityAttributes>? {
        Activity<NovaActivityAttributes>.activities.first {
            $0.attributes.kind == kind && $0.activityState == .active
        }
    }

    /// A resting card goes stale the moment the rest ends, so iOS redraws it
    /// (as stale) even with Nova asleep and the widget shows the session
    /// clock again instead of a gold 0:00 (NovaLiveActivityWidget reads
    /// `context.isStale`). Otherwise a card idle for hours greys out.
    private func staleDate(_ state: NovaActivityAttributes.ContentState) -> Date {
        if let end = state.restEnd, end > Date() { return end }
        return Date().addingTimeInterval(3 * 3600)
    }

    func sync(kind: String, key: String, state: NovaActivityAttributes.ContentState) async throws {
        let content = ActivityContent(state: state, staleDate: staleDate(state))
        if let live = current(kind) {
            if live.attributes.key == key {
                await live.update(content)
                return
            }
            await live.end(nil, dismissalPolicy: .immediate)
        }
        _ = try Activity.request(
            attributes: NovaActivityAttributes(kind: kind, key: key),
            content: content,
            pushType: nil
        )
    }

    func end(kind: String) async {
        for live in Activity<NovaActivityAttributes>.activities where live.attributes.kind == kind {
            await live.end(nil, dismissalPolicy: .immediate)
        }
    }
}
