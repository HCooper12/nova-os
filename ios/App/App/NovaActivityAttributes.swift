import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// Everything Nova puts on the lock screen and in the Dynamic Island, as one
/// ActivityKit shape. Compiled into BOTH the app (which starts and updates
/// the card) and the NovaLiveActivity extension (which draws it).
///
/// A shared format: `ContentState` mirrors what src/liveActivityModel.js
/// builds, field for field. Change both or neither.
///
/// `kind` picks the layout:
///   "workout": a session he is doing (sets, next lift, clock, rest)
///   "job":     long work he started (a book read, an ingest, research)
@available(iOS 16.1, *)
public struct NovaActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var title: String
        public var detail: String
        public var done: Int?
        public var total: Int?
        /// The next lift's muscle hue, "#rrggbb" (Nova's dark-ground value).
        public var hue: String?
        /// Epoch milliseconds, as JavaScript writes them.
        public var startedAt: Double?
        public var restEndsAt: Double?
        /// Seconds.
        public var restTotal: Double?
        public var finished: Bool?
        /// Paused by him (src/sessionClock.js): the clock stops and shows
        /// `elapsed` (seconds of training so far) instead of counting.
        public var paused: Bool?
        public var elapsed: Double?
    }

    public var kind: String
    public var key: String
}

@available(iOS 16.1, *)
extension NovaActivityAttributes.ContentState {
    var started: Date? { startedAt.map { Date(timeIntervalSince1970: $0 / 1000) } }
    var restEnd: Date? { restEndsAt.map { Date(timeIntervalSince1970: $0 / 1000) } }
    var restStart: Date? {
        guard let end = restEnd, let total = restTotal else { return nil }
        return end.addingTimeInterval(-total)
    }
}
#endif
