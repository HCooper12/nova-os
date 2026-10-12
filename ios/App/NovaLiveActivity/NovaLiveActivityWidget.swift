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
            LockScreenCard(kind: context.attributes.kind, state: context.state)
                .padding(16)
                .activityBackgroundTint(Ink.ground.opacity(0.92))
                .activitySystemActionForegroundColor(Ink.cyan)
        } dynamicIsland: { context in
            let s = context.state
            let workout = context.attributes.kind == "workout"
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    if workout { SetRing(state: s, size: 44) } else { JobMark(state: s, size: 36) }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Clock(state: s, big: true).padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(s.title).font(.headline).foregroundStyle(Ink.primary).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(s.detail).font(.subheadline).foregroundStyle(Ink.secondary).lineLimit(1)
                        RestBar(state: s)
                    }
                }
            } compactLeading: {
                if workout { SetRing(state: s, size: 20) } else { JobMark(state: s, size: 18) }
            } compactTrailing: {
                Clock(state: s, big: false)
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

private func resting(_ s: NovaActivityAttributes.ContentState) -> Bool {
    guard let end = s.restEnd else { return false }
    return end > Date()
}

// MARK: - the lock-screen card

private struct LockScreenCard: View {
    let kind: String
    let state: NovaActivityAttributes.ContentState

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
                Clock(state: state, big: true)
            }
            RestBar(state: state)
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

/// The rest countdown while resting, else the session clock; nothing for a
/// finished job.
private struct Clock: View {
    let state: NovaActivityAttributes.ContentState
    let big: Bool

    var body: some View {
        Group {
            if let start = state.restStart, let end = state.restEnd, resting(state) {
                VStack(alignment: .trailing, spacing: 0) {
                    if big { Text("REST").font(.caption2.weight(.semibold)).foregroundStyle(Ink.gold) }
                    Text(timerInterval: start...end, countsDown: true)
                        .foregroundStyle(Ink.gold)
                }
            } else if state.finished == true {
                if big { Text("Ready").foregroundStyle(Ink.good) } else { Image(systemName: "checkmark").foregroundStyle(Ink.good) }
            } else if let started = state.started {
                Text(started, style: .timer).foregroundStyle(Ink.primary)
            }
        }
        .font(big ? .system(.title2, design: .rounded).weight(.semibold) : .system(.footnote, design: .rounded).weight(.semibold))
        .monospacedDigit()
        .multilineTextAlignment(.trailing)
        .frame(maxWidth: big ? 90 : 52, alignment: .trailing)
    }
}

/// How much of the rest is left, as a bar that drains on its own.
private struct RestBar: View {
    let state: NovaActivityAttributes.ContentState

    var body: some View {
        if let start = state.restStart, let end = state.restEnd, resting(state) {
            ProgressView(timerInterval: start...end, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                .tint(Ink.gold)
        }
    }
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
