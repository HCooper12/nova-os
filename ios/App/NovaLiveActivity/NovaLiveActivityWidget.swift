import ActivityKit
import SwiftUI
import WidgetKit

// Nova on the lock screen and in the real Dynamic Island. The data comes
// from src/liveActivityModel.js through NovaLiveActivityPlugin; this file
// only draws it.
//
// The clocks are iOS's own (Text(timerInterval:) and Text(_:style: .timer)):
// they keep counting with the phone locked and Nova suspended, which is the
// whole point of a rest timer here. Everything else is what Nova last sent.

// Nova's dark-ground tokens (src/index.css, the command theme).
private enum Ink {
    static let ground = Color(hex: "#0a0f1e")
    static let cyan = Color(hex: "#59e6ff")
    static let gold = Color(hex: "#e0b26a")
    static let good = Color(hex: "#5fe8a8")
    static let primary = Color.white.opacity(0.94)
    static let secondary = Color.white.opacity(0.6)
}

struct NovaLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: NovaActivityAttributes.self) { context in
            LockScreenCard(kind: context.attributes.kind, state: context.state, stale: context.isStale)
                .padding(16)
                .activityBackgroundTint(Ink.ground.opacity(0.92))
                .activitySystemActionForegroundColor(Ink.cyan)
        } dynamicIsland: { context in
            let s = context.state
            let stale = context.isStale
            let workout = context.attributes.kind == "workout"
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    if workout { SetRing(state: s, size: 44) } else { JobMark(state: s, size: 36) }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    SessionClock(state: s, big: true).padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(s.title).font(.headline).foregroundStyle(Ink.primary).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(s.detail).font(.subheadline).foregroundStyle(Ink.secondary).lineLimit(1)
                        RestRow(state: s, stale: stale)
                    }
                }
            } compactLeading: {
                if workout { SetRing(state: s, size: 20) } else { JobMark(state: s, size: 18) }
            } compactTrailing: {
                CompactClock(state: s, stale: stale)
            } minimal: {
                if workout { SetRing(state: s, size: 20) } else { JobMark(state: s, size: 18) }
            }
            .keylineTint(accent(s, workout: workout))
        }
    }
}

// A tap opens Nova where he left it (iOS's default for a card with no URL).
// Landing on a particular screen needs a URL scheme and a handler in the web
// app; not built yet.

private func accent(_ s: NovaActivityAttributes.ContentState, workout: Bool) -> Color {
    if s.finished == true { return Ink.good }
    if workout, let hue = s.hue { return Color(hex: hue) }
    return workout ? Ink.good : Ink.cyan
}

/// Resting only while the rest has time left AND iOS has not marked the card
/// stale. The card's stale date is the rest's end (LiveCards.staleDate), so
/// with the phone locked and no update coming, iOS still redraws it as stale
/// when the rest runs out, and the session clock comes back.
private func resting(_ s: NovaActivityAttributes.ContentState, stale: Bool) -> Bool {
    guard let end = s.restEnd, !stale else { return false }
    return end > Date()
}

// MARK: - the lock-screen card

private struct LockScreenCard: View {
    let kind: String
    let state: NovaActivityAttributes.ContentState
    let stale: Bool

    var body: some View {
        let workout = kind == "workout"
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 14) {
                if workout { SetRing(state: state, size: 52) } else { JobMark(state: state, size: 44) }
                VStack(alignment: .leading, spacing: 3) {
                    Text(workout ? "NOVA · TRAIN" : "NOVA")
                        .font(.caption2.weight(.semibold)).tracking(1.2)
                        .foregroundStyle(accent(state, workout: workout))
                    Text(state.title).font(.headline).foregroundStyle(Ink.primary).lineLimit(1)
                    Text(state.detail).font(.subheadline).foregroundStyle(Ink.secondary).lineLimit(1)
                }
                Spacer(minLength: 8)
                SessionClock(state: state, big: true)
            }
            RestRow(state: state, stale: stale)
        }
    }
}

// MARK: - parts

/// Sets done of total, as a ring in the next lift's hue.
private struct SetRing: View {
    let state: NovaActivityAttributes.ContentState
    let size: CGFloat

    var body: some View {
        let total = max(state.total ?? 0, 0)
        let done = min(max(state.done ?? 0, 0), total)
        let fraction = total > 0 ? Double(done) / Double(total) : 0
        let hue = accent(state, workout: true)
        ZStack {
            Circle().stroke(hue.opacity(0.22), lineWidth: size * 0.12)
            Circle().trim(from: 0, to: fraction)
                .stroke(hue, style: StrokeStyle(lineWidth: size * 0.12, lineCap: .round))
                .rotationEffect(.degrees(-90))
            if size >= 40 {
                Text("\(done)/\(total)")
                    .font(.system(size: size * 0.26, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Ink.primary)
            }
        }
        .frame(width: size, height: size)
    }
}

/// A job: a cyan dot while it runs, a green tick once it is ready.
private struct JobMark: View {
    let state: NovaActivityAttributes.ContentState
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle().fill((state.finished == true ? Ink.good : Ink.cyan).opacity(0.18))
            Image(systemName: state.finished == true ? "checkmark" : "sparkle")
                .font(.system(size: size * 0.45, weight: .semibold))
                .foregroundStyle(state.finished == true ? Ink.good : Ink.cyan)
        }
        .frame(width: size, height: size)
    }
}

/// ONE CARD, BOTH CLOCKS (his ask, 14 Oct): the session's total time always
/// sits top-right; a rest, while it runs, gets its own row underneath with
/// the countdown and a bar that drains on its own. Paused, the total stops
/// and says so. A finished job says Ready.
private struct SessionClock: View {
    let state: NovaActivityAttributes.ContentState
    let big: Bool

    var body: some View {
        Group {
            if state.finished == true {
                if big { Text("Ready").foregroundStyle(Ink.good) } else { Image(systemName: "checkmark").foregroundStyle(Ink.good) }
            } else if state.paused == true {
                VStack(alignment: .trailing, spacing: 1) {
                    if big { Text("PAUSED").font(.caption2.weight(.semibold)).tracking(1).foregroundStyle(Ink.secondary) }
                    Text(clockText(state.elapsed ?? 0)).foregroundStyle(Ink.secondary)
                }
            } else if let started = state.started {
                Text(started, style: .timer).foregroundStyle(Ink.primary)
            }
        }
        .font(big ? .system(.title2, design: .rounded).weight(.semibold) : .system(.footnote, design: .rounded).weight(.semibold))
        .monospacedDigit()
        .multilineTextAlignment(.trailing)
        .frame(maxWidth: big ? 96 : 52, alignment: .trailing)
    }
}

/// The island's small right-hand slot has room for one clock: the rest while
/// it runs (the one he is waiting on), else the total, else a pause mark.
private struct CompactClock: View {
    let state: NovaActivityAttributes.ContentState
    let stale: Bool

    var body: some View {
        Group {
            if let start = state.restStart, let end = state.restEnd, resting(state, stale: stale) {
                Text(timerInterval: start...end, countsDown: true).foregroundStyle(Ink.gold)
            } else if state.paused == true {
                Image(systemName: "pause.fill").foregroundStyle(Ink.secondary)
            } else {
                SessionClock(state: state, big: false)
            }
        }
        .font(.system(.footnote, design: .rounded).weight(.semibold))
        .monospacedDigit()
        .frame(maxWidth: 52, alignment: .trailing)
    }
}

/// REST, the countdown, and the bar, on one line under the card's top row.
private struct RestRow: View {
    let state: NovaActivityAttributes.ContentState
    let stale: Bool

    var body: some View {
        if let start = state.restStart, let end = state.restEnd, resting(state, stale: stale) {
            HStack(spacing: 10) {
                Text("REST").font(.caption2.weight(.semibold)).tracking(1).foregroundStyle(Ink.gold)
                Text(timerInterval: start...end, countsDown: true)
                    .font(.system(.subheadline, design: .rounded).weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(Ink.gold)
                    .frame(width: 44, alignment: .leading)
                ProgressView(timerInterval: start...end, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                    .tint(Ink.gold)
            }
        }
    }
}

/// 30:18, or 1:04:09 past the hour.
private func clockText(_ seconds: Double) -> String {
    let t = max(0, Int(seconds))
    let h = t / 3600, m = (t % 3600) / 60, sec = t % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, sec) : String(format: "%d:%02d", m, sec)
}

extension Color {
    /// "#rrggbb" → Color; anything else is Nova cyan rather than a crash.
    init(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard h.count == 6, let v = UInt32(h, radix: 16) else {
            self = Color(red: 0x59 / 255, green: 0xe6 / 255, blue: 0xff / 255)
            return
        }
        self = Color(
            red: Double((v >> 16) & 0xff) / 255,
            green: Double((v >> 8) & 0xff) / 255,
            blue: Double(v & 0xff) / 255
        )
    }
}
