import AppIntents
import SwiftUI
import WidgetKit

// Complications (w15) and Smart Stack cards (w16). They read the snapshot
// the app writes into the App Group, and refresh it themselves from
// /wrist/today every 20 minutes. No token or no data: an honest empty state,
// never numbers.
//
// Not registered yet: the "1 job" complication and the "Forge · writing"
// card. They belong to the Forge and wait for a jobs endpoint.

struct NovaEntry: TimelineEntry {
    var date: Date
    var today: Today?
    var paired: Bool
}

struct NovaProvider: TimelineProvider {
    func placeholder(in context: Context) -> NovaEntry { NovaEntry(date: .now, today: nil, paired: true) }

    func getSnapshot(in context: Context, completion: @escaping @Sendable (NovaEntry) -> Void) {
        completion(NovaEntry(date: .now, today: SnapshotStore.read()?.today, paired: TokenStore.read() != nil))
    }

    func getTimeline(in context: Context, completion: @escaping @Sendable (Timeline<NovaEntry>) -> Void) {
        Task {
            let token = TokenStore.read()
            var today = SnapshotStore.read()?.today
            if let token, let fresh = try? await DoorClient(token: token).today() {
                today = fresh
                SnapshotStore.write(Snapshot(today: fresh, fetchedAt: .now))
                SnapshotStore.markSeen()
            }
            let entry = NovaEntry(date: .now, today: token == nil ? nil : today, paired: token != nil)
            completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(20 * 60))))
        }
    }
}

/// The plus on the Fuel card: logs his usual without opening the app.
struct LogUsualIntent: AppIntent {
    static let title: LocalizedStringResource = "Log a usual"
    static let isDiscoverable = false

    @Parameter(title: "Key") var key: String
    @Parameter(title: "Name") var name: String

    init() {}
    init(key: String, name: String) {
        self.key = key
        self.name = name
    }

    func perform() async throws -> some IntentResult {
        let idem = IdempotencyKey.make()
        let client = DoorClient(token: TokenStore.read())
        do {
            let r = try await client.logFood(key: key, times: 1, idempotencyKey: idem)
            SnapshotStore.markSeen()
            if var snap = SnapshotStore.read() {
                if let p = r.protein { snap.today.protein = p }
                if let k = r.kcal { snap.today.kcal = k }
                snap.fetchedAt = .now
                SnapshotStore.write(snap)
            }
            await client.handoff(kind: "fuel", title: r.entry.name ?? name)
        } catch {
            switch error {
            case .unreachable, .server(status: 0, _, _):
                // kept on the watch with its key; the app sends it when the Mac answers
                let usual = SnapshotStore.read()?.today.usuals?.first { $0.key == key }
                OfflineQueue().enqueue(PendingWrite(idempotencyKey: idem, kind: .usual(key: key, times: 1), name: name, macros: usual?.macros, keptAt: .now))
            default:
                break
            }
        }
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

// MARK: complications

struct CoreWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "nova.core", provider: NovaProvider()) { _ in
            CoreCircular(size: 44)
                .widgetURL(URL(string: "novawatch://talk"))
                .containerBackground(.black, for: .widget)
        }
        .configurationDisplayName("Nova")
        .description("His core. One tap and he listens.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner])
    }
}

struct NextWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "nova.next", provider: NovaProvider()) { e in
            NextRectangular(today: e.today, paired: e.paired)
                .widgetURL(URL(string: "novawatch://talk"))
                .containerBackground(.black, for: .widget)
        }
        .configurationDisplayName("Nova, next")
        .description("The session today and the protein to go.")
        .supportedFamilies([.accessoryRectangular])
    }
}

struct ProteinWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "nova.protein", provider: NovaProvider()) { e in
            MetricCircular(value: e.today?.protein?.value, progress: e.today?.protein?.progress, c: Nova.protein, text: { Fmt.int($0) })
                .widgetURL(URL(string: "novawatch://fuel"))
                .containerBackground(.black, for: .widget)
        }
        .configurationDisplayName("Protein")
        .description("Protein eaten today against the goal.")
        .supportedFamilies([.accessoryCircular])
    }
}

struct StepsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "nova.steps", provider: NovaProvider()) { e in
            MetricCircular(value: e.today?.steps?.value, progress: e.today?.steps?.progress, c: Nova.steps, text: { Fmt.compact($0) }, fontSize: 13)
                .containerBackground(.black, for: .widget)
        }
        .configurationDisplayName("Steps")
        .description("Steps today against the goal.")
        .supportedFamilies([.accessoryCircular])
    }
}

// MARK: Smart Stack

struct FuelStackWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "nova.stack.fuel", provider: NovaProvider()) { e in
            let usual = e.today?.usuals?.first
            StackFuelContent(left: e.today?.protein?.left, usualName: usual?.name, paired: e.paired) {
                if let usual {
                    Button(intent: LogUsualIntent(key: usual.key, name: usual.name)) { PlusDisc() }
                        .buttonStyle(.plain)
                }
            }
            .widgetURL(URL(string: "novawatch://fuel"))
            .containerBackground(Nova.plate(Nova.protein), for: .widget)
        }
        .configurationDisplayName("Fuel")
        .description("Protein left, and your usual for this hour in one tap.")
        .supportedFamilies([.accessoryRectangular])
    }
}

struct TalkStackWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "nova.stack.talk", provider: NovaProvider()) { _ in
            StackTalkContent()
                .widgetURL(URL(string: "novawatch://talk"))
                .containerBackground(Nova.row.color, for: .widget)
        }
        .configurationDisplayName("Talk to Nova")
        .description("Tap to talk.")
        .supportedFamilies([.accessoryRectangular])
    }
}

@main
struct NovaWidgets: WidgetBundle {
    var body: some Widget {
        CoreWidget()
        NextWidget()
        ProteinWidget()
        StepsWidget()
        FuelStackWidget()
        TalkStackWidget()
    }
}
