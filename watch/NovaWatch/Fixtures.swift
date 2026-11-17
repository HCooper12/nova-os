import Foundation

/// Words that only a proof fixture puts on screen. Every one is nil in a
/// Release build, and in Debug until a `-novaFixture` launch argument sets it.
@MainActor
enum FixtureText {
    static var restLine: String? = nil
    static var heard: String? = nil
    static var time: String? = nil
    /// w17 and w18 say "phone" and "capture"; live, the watch reaches the
    /// Mac directly and capture is not built, so live words differ (see README)
    static var keptSentence: String? = nil
    static var unreachableNote: String? = nil
}

/// Proof fixtures. The values are only ever set by the Debug-only code in
/// Debug/FixtureModels.swift; in Release they stay nil.
@MainActor
enum Fixture {
    static var pairCode: String? = nil
    static var portionTimes: Double? = nil
}
