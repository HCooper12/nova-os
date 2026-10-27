import AppIntents
import SwiftUI
import WidgetKit
#if os(iOS)
import CoreMotion
#endif

// NOVA ON THE HOME SCREEN AND LOCK SCREEN (his ask, 14 Oct 2026; the approved
// mockups: artifact AHa5Yp11, v6). Protein, calories, steps and HRV as rings
// against his own goals.
//
// The numbers come from the Mac's GET /api/widget/today (server/lib/
// widgetToday.js), fetched by the widget itself every 10 minutes by day and
// again whenever Nova syncs (src/widgetBridge.js). With no connection a widget
// keeps its last numbers and shows their time; numbers from an earlier day
// are never shown as today's.
//
// STEPS ARE THE ONE EXCEPTION (his ask, 27 Oct 2026: see them live on a walk).
// Apple Health receives the iPhone's steps in batches and iOS lets an app hear
// of them at most hourly, so the Mac's count trails the walk. The widget
// therefore asks the phone's motion coprocessor itself (NovaLiveSteps) at every
// redraw and shows the larger of that and the Mac's figure: never lower than
// Health's own count, never reliant on the Mac being reachable.

// MARK: - data

struct NovaMetric: Codable { var value: Double?; var goal: Double? }
struct NovaHRV: Codable { var value: Double; var date: String; var lo: Double?; var hi: Double?; var verdict: String? }
struct NovaDay: Codable {
    var at: String
    var date: String
    var protein: NovaMetric
    var kcal: NovaMetric
    var steps: NovaMetric
    var hrv: NovaHRV?
    var session: String?
}

enum NovaShared {
    static let suite = "group.com.haydencooper.novaos"
    static var defaults: UserDefaults? { UserDefaults(suiteName: suite) }

    static func cached() -> (NovaDay, Date)? {
        guard let d = defaults, let data = d.data(forKey: "nova.today"),
              let day = try? JSONDecoder().decode(NovaDay.self, from: data) else { return nil }
        return (day, d.object(forKey: "nova.todayAt") as? Date ?? .distantPast)
    }

    /// The Mac's numbers with today's steps lifted to the phone's own live count.
    static func load() async -> (NovaDay?, Date?) {
        let (day, at) = await loadMac()
        return (withLiveSteps(day, live: await NovaLiveSteps.today()), at)
    }

    /// `live` is the pedometer's count since midnight (nil when it cannot be
    /// read). Max, not sum: the Watch's steps live in Health's figure, and the
    /// phone's count only ever raises it. With the Mac unreachable and only
    /// yesterday kept, today is steps alone: the rest reads "—", never yesterday's.
    static func withLiveSteps(_ day: NovaDay?, live: Int?, now: Date = .now) -> NovaDay? {
        guard let live else { return day }
        let v = Double(live)
        let today = NovaEntry.iso(now)
        if var d = day, d.date == today {
            d.steps.value = max(d.steps.value ?? 0, v)
            return d
        }
        return NovaDay(at: "", date: today,
                       protein: .init(value: nil, goal: day?.protein.goal),
                       kcal: .init(value: nil, goal: day?.kcal.goal),
                       steps: .init(value: v, goal: day?.steps.goal), hrv: nil, session: nil)
    }

    /// The Mac's answer, or the last one kept. Never longer than iOS allows.
    static func loadMac() async -> (NovaDay?, Date?) {
        if let d = defaults, let base = d.string(forKey: "nova.baseUrl"), let token = d.string(forKey: "nova.token"),
           let url = URL(string: base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/api/widget/today") {
            var req = URLRequest(url: url, timeoutInterval: 12)
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            if let (data, resp) = try? await URLSession.shared.data(for: req),
               (resp as? HTTPURLResponse)?.statusCode == 200,
               let day = try? JSONDecoder().decode(NovaDay.self, from: data) {
                let now = Date()
                d.set(data, forKey: "nova.today")
                d.set(now, forKey: "nova.todayAt")
                return (day, now)
            }
        }
        if let (day, at) = cached() { return (day, at) }
        return (nil, nil)
    }
}

/// Steps since midnight from the iPhone's motion coprocessor: live, where
/// Health's copy is written in batches. Needs the Motion & Fitness answer the
/// app asks for once (NovaWidgetsPlugin); without it, or with the sensor
/// unavailable, this says nil and the widget keeps the Mac's figure.
enum NovaLiveSteps {
    static func today(now: Date = .now) async -> Int? {
        #if os(iOS)
        guard CMPedometer.isStepCountingAvailable() else { return nil }
        switch CMPedometer.authorizationStatus() {
        case .denied, .restricted: return nil
        default: break
        }
        let start = Calendar.current.startOfDay(for: now)
        // the query always calls back, but a widget has seconds to spare, not minutes
        return await withTaskGroup(of: Int?.self) { group in
            group.addTask {
                await withCheckedContinuation { (cont: CheckedContinuation<Int?, Never>) in
                    let p = CMPedometer()
                    p.queryPedometerData(from: start, to: now) { data, _ in
                        _ = p // held until the answer arrives
                        cont.resume(returning: data.map { $0.numberOfSteps.intValue })
                    }
                }
            }
            group.addTask { try? await Task.sleep(nanoseconds: 4_000_000_000); return nil }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
        #else
        return nil
        #endif
    }
}

struct NovaEntry: TimelineEntry {
    let date: Date
    let day: NovaDay?
    let fetchedAt: Date?
    var metric: NovaKey = .protein

    /// today's numbers only: a day that has rolled over shows nothing rather
    /// than yesterday's protein as today's
    var today: NovaDay? {
        guard let day else { return nil }
        return day.date == Self.iso(date) ? day : nil
    }
    static func iso(_ d: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: d)
    }
    var stamp: String {
        guard let fetchedAt else { return "" }
        let f = DateFormatter()
        f.dateFormat = "H:mm"
        return f.string(from: fetchedAt)
    }

    static let sample = NovaEntry(date: .now, day: NovaDay(
        at: "", date: iso(.now),
        protein: .init(value: 71, goal: 150), kcal: .init(value: 747, goal: 2100),
        steps: .init(value: 8700, goal: 10000),
        hrv: .init(value: 81.7, date: iso(.now), lo: 56, hi: 80, verdict: "recovered"), session: "Pull"),
        fetchedAt: .now)
}

/// Asks for a redraw every 10 minutes by day, 30 overnight. iOS decides what
/// it grants (a widget he looks at often gets more), so this is the ask, not a promise.
private func novaTimeline(_ entry: NovaEntry) -> Timeline<NovaEntry> {
    let hour = Calendar.current.component(.hour, from: Date())
    let gap: TimeInterval = (6..<22).contains(hour) ? 10 * 60 : 30 * 60
    return Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(gap)))
}

struct NovaProvider: TimelineProvider {
    func placeholder(in context: Context) -> NovaEntry { .sample }
    func getSnapshot(in context: Context, completion: @escaping (NovaEntry) -> Void) {
        if context.isPreview { return completion(.sample) }
        Task { let (d, at) = await NovaShared.load(); completion(NovaEntry(date: .now, day: d, fetchedAt: at)) }
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<NovaEntry>) -> Void) {
        Task { let (d, at) = await NovaShared.load(); completion(novaTimeline(NovaEntry(date: .now, day: d, fetchedAt: at))) }
    }
}

/// Where a tap lands. The app registers the novaos scheme (Info.plist) and
/// SceneDelegate turns the path into a screen hash; "recipes" is Fuel.
enum NovaLink {
    static let fuel = URL(string: "novaos://open/recipes")
}

// MARK: - the one-number widget's choice

enum NovaKey: String, AppEnum {
    case protein, kcal, steps, hrv
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Number"
    static var caseDisplayRepresentations: [NovaKey: DisplayRepresentation] = [
        .protein: "Protein", .kcal: "Calories", .steps: "Steps", .hrv: "HRV",
    ]
}

struct NovaNumberIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Number"
    static var description = IntentDescription("One of your four numbers.")
    @Parameter(title: "Show", default: .protein) var metric: NovaKey
}

struct NovaNumberProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> NovaEntry { .sample }
    func snapshot(for configuration: NovaNumberIntent, in context: Context) async -> NovaEntry {
        var e = NovaEntry.sample
        if !context.isPreview { let (d, at) = await NovaShared.load(); e = NovaEntry(date: .now, day: d, fetchedAt: at) }
        e.metric = configuration.metric
        return e
    }
    func timeline(for configuration: NovaNumberIntent, in context: Context) async -> Timeline<NovaEntry> {
        let (d, at) = await NovaShared.load()
        var e = NovaEntry(date: .now, day: d, fetchedAt: at)
        e.metric = configuration.metric
        return novaTimeline(e)
    }
}

// MARK: - look (the mockup's tokens)

enum WInk {
    static let protein = Color(hex: "#5fe8a8")
    static let kcal = Color(hex: "#ffb35c")
    static let steps = Color(hex: "#59e6ff")
    static let hrv = Color(hex: "#a493ff")
    static let ink = Color(hex: "#eef1f8")
    static let ink2 = Color(hex: "#eef1f8").opacity(0.62)
    static let ink3 = Color(hex: "#eef1f8").opacity(0.40)
    static let ground = LinearGradient(colors: [Color(hex: "#1d2750"), Color(hex: "#10152f")],
                                       startPoint: .topLeading, endPoint: .bottomTrailing)
}

extension NovaKey {
    var hue: Color { switch self { case .protein: WInk.protein; case .kcal: WInk.kcal; case .steps: WInk.steps; case .hrv: WInk.hrv } }
    var name: String { switch self { case .protein: "Protein"; case .kcal: "Calories"; case .steps: "Steps"; case .hrv: "HRV" } }
    var unit: String { switch self { case .protein: "g"; case .hrv: "ms"; default: "" } }
    static let all: [NovaKey] = [.protein, .kcal, .steps, .hrv]
}

private func fmt(_ v: Double) -> String {
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.locale = Locale(identifier: "en_AU")
    f.maximumFractionDigits = 0
    return f.string(from: NSNumber(value: v.rounded())) ?? "\(Int(v.rounded()))"
}

/// The value, the goal and the fraction for one key on one day.
struct Reading {
    let key: NovaKey
    let value: Double?
    let goal: Double?
    var fraction: Double { guard let value, let goal, goal > 0 else { return 0 }; return min(max(value / goal, 0), 1) }
    var toGo: Double? { guard let value, let goal else { return nil }; return max(goal - value, 0) }

    init(_ key: NovaKey, _ day: NovaDay?) {
        self.key = key
        switch key {
        case .protein: value = day?.protein.value; goal = day?.protein.goal
        case .kcal: value = day?.kcal.value; goal = day?.kcal.goal
        case .steps: value = day?.steps.value; goal = day?.steps.goal
        case .hrv:
            // HRV is today's reading or nothing
            value = (day?.hrv?.date == day?.date) ? day?.hrv?.value : nil; goal = nil
        }
    }
    var short: String { value.map(fmt) ?? "—" }
}

// MARK: - marks

private struct Glyph: View {
    let key: NovaKey
    let size: CGFloat
    var color: Color? = nil
    var body: some View {
        Group {
            switch key {
            case .protein: Text("P").font(.system(size: size * 1.05, weight: .heavy, design: .rounded))
            case .kcal: Image(systemName: "flame.fill").font(.system(size: size * 0.9, weight: .semibold))
            case .steps: Image(systemName: "shoeprints.fill").font(.system(size: size * 0.8, weight: .semibold))
            case .hrv: Image(systemName: "waveform.path.ecg").font(.system(size: size * 0.85, weight: .bold))
            }
        }
        .foregroundStyle(color ?? key.hue)
    }
}

private struct Ring: View {
    let fraction: Double
    let hue: Color
    let width: CGFloat
    var body: some View {
        ZStack {
            Circle().stroke(hue.opacity(0.18), lineWidth: width)
            if fraction > 0 {
                Circle().trim(from: 0, to: fraction)
                    .stroke(hue, style: StrokeStyle(lineWidth: width, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
        }
        .padding(width / 2)
    }
}

/// HRV has a usual range, not a goal: an open 240° arc, the brighter stretch
/// his own range, the dot today.
private struct HRVGauge: View {
    let reading: Reading
    let lo: Double?
    let hi: Double?
    let width: CGFloat
    private let a0 = 150.0, sweep = 240.0

    var body: some View {
        GeometryReader { g in
            let side = min(g.size.width, g.size.height)
            let r = side / 2 - width / 2 - side * 0.04
            let c = CGPoint(x: g.size.width / 2, y: g.size.height / 2)
            let lowB = min(40, (lo ?? 40) - 10), highB = max(100, (hi ?? 100) + 10)
            let ang = { (x: Double) in a0 + sweep * min(max((x - lowB) / (highB - lowB), 0), 1) }
            ZStack {
                arc(c, r, a0, a0 + sweep).stroke(WInk.hrv.opacity(0.18), style: StrokeStyle(lineWidth: width, lineCap: .round))
                if let lo, let hi {
                    arc(c, r, ang(lo), ang(hi)).stroke(WInk.hrv.opacity(0.5), style: StrokeStyle(lineWidth: width, lineCap: .round))
                }
                if let v = reading.value {
                    let a = ang(v) * .pi / 180
                    let p = CGPoint(x: c.x + r * cos(a), y: c.y + r * sin(a))
                    Circle().fill(Color(hex: "#10152f")).frame(width: width * 1.24 + 3.2, height: width * 1.24 + 3.2).position(p)
                    Circle().fill(WInk.hrv).frame(width: width * 1.24, height: width * 1.24).position(p)
                }
            }
        }
    }
    private func arc(_ c: CGPoint, _ r: CGFloat, _ from: Double, _ to: Double) -> Path {
        var p = Path()
        p.addArc(center: c, radius: r, startAngle: .degrees(from), endAngle: .degrees(to), clockwise: false)
        return p
    }
}

private struct Badge: View {
    let reading: Reading
    let hrv: NovaHRV?
    let size: CGFloat
    let glyph: CGFloat
    let width: CGFloat
    var body: some View {
        ZStack {
            if reading.key == .hrv {
                HRVGauge(reading: reading, lo: hrv?.lo, hi: hrv?.hi, width: width)
            } else {
                Ring(fraction: reading.fraction, hue: reading.key.hue, width: width)
            }
            Glyph(key: reading.key, size: glyph)
        }
        .frame(width: size, height: size)
    }
}

private struct Hero: View {
    let text: String
    let unit: String
    var body: some View {
        (Text(text).font(.system(size: 34, weight: .semibold, design: .rounded))
            + Text(unit).font(.system(size: 17, weight: .semibold, design: .rounded)))
            .monospacedDigit()
            .foregroundStyle(WInk.ink)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }
}

// MARK: - one number (small)

private func subLine(_ r: Reading, _ day: NovaDay?) -> String {
    switch r.key {
    case .protein: return r.toGo.map { $0 > 0 ? "\(fmt($0)) g to go" : "Floor met" } ?? (r.value == nil ? "Not logged yet" : "No goal set")
    case .kcal: return r.toGo.map { $0 > 0 ? "\(fmt($0)) left" : "At your target" } ?? (r.value == nil ? "Not logged yet" : "No goal set")
    case .steps: return r.toGo.map { $0 > 0 ? "\(fmt($0)) to go" : "Goal met" } ?? (r.value == nil ? "No steps yet" : "No goal set")
    case .hrv:
        guard r.value != nil else { return "No reading today" }
        switch day?.hrv?.verdict { case "recovered": return "Above your usual"; case "strained": return "Below your usual"; default: return "In your usual range" }
    }
}

struct SingleView: View {
    let reading: Reading
    let day: NovaDay?
    let stamp: String
    var hero: String? = nil
    var sub: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Badge(reading: reading, hrv: day?.hrv, size: 50, glyph: 19, width: 8)
                Spacer(minLength: 4)
                Text(stamp).font(.system(size: 11, weight: .medium)).foregroundStyle(WInk.ink3).monospacedDigit()
            }
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 4) {
                Text(reading.key.name).font(.system(size: 13, weight: .semibold)).foregroundStyle(reading.key.hue)
                Hero(text: hero ?? reading.short, unit: hero == nil && reading.value != nil ? reading.key.unit : "")
                Text(sub ?? subLine(reading, day)).font(.system(size: 12, weight: .medium)).foregroundStyle(WInk.ink2)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
        }
    }
}

// MARK: - four rings (small quad, medium row)

struct QuadView: View {
    let day: NovaDay?
    var body: some View {
        Grid(horizontalSpacing: 14, verticalSpacing: 14) {
            GridRow { badge(.protein); badge(.kcal) }
            GridRow { badge(.steps); badge(.hrv) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    private func badge(_ k: NovaKey) -> some View { Badge(reading: Reading(k, day), hrv: day?.hrv, size: 56, glyph: 19, width: 9) }
}

struct RowView: View {
    let day: NovaDay?
    var body: some View {
        HStack(spacing: 0) {
            ForEach(NovaKey.all, id: \.self) { k in
                let r = Reading(k, day)
                VStack(spacing: 10) {
                    Badge(reading: r, hrv: day?.hrv, size: 62, glyph: 22, width: 8)
                    (Text(r.short).font(.system(size: 17, weight: .semibold, design: .rounded))
                        + Text(r.value != nil ? k.unit : "").font(.system(size: 11, weight: .semibold, design: .rounded)).foregroundColor(WInk.ink2))
                        .monospacedDigit().foregroundStyle(WInk.ink).lineLimit(1).minimumScaleFactor(0.7)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .frame(maxHeight: .infinity)
    }
}

// MARK: - fuel and steps (medium)

struct FuelView: View {
    let day: NovaDay?
    var body: some View {
        let p = Reading(.protein, day), k = Reading(.kcal, day), s = Reading(.steps, day)
        HStack(spacing: 20) {
            // outside in: protein, calories, steps
            ZStack {
                Ring(fraction: p.fraction, hue: WInk.protein, width: 12.4).frame(width: 124, height: 124)
                Ring(fraction: k.fraction, hue: WInk.kcal, width: 12.4).frame(width: 94, height: 94)
                Ring(fraction: s.fraction, hue: WInk.steps, width: 12.4).frame(width: 64, height: 64)
            }
            .frame(width: 124, height: 124)
            VStack(alignment: .leading, spacing: 4) {
                line(p, of: p.goal.map { "/\(fmt($0))g" })
                line(k, of: k.goal.map { "/\(fmt($0))" })
                line(s, of: s.goal.map { "/\(fmt($0))" })
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxHeight: .infinity)
    }
    private func line(_ r: Reading, of: String?) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
                Glyph(key: r.key, size: 11)
                Text(r.key.name).font(.system(size: 12, weight: .semibold)).foregroundStyle(r.key.hue)
            }
            (Text(r.short).font(.system(size: 21, weight: .semibold, design: .rounded)).foregroundColor(WInk.ink)
                + Text(of ?? "").font(.system(size: 13, weight: .semibold, design: .rounded)).foregroundColor(r.key.hue))
                .monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
        }
    }
}

// MARK: - changes across the day

/// What matters at this hour, picked by code from the clock and his numbers:
/// recovery in the morning, protein through the day, in the evening whatever
/// is still shortest. Every goal met: it says so and goes quiet.
struct Lead {
    let key: NovaKey?
    let say: String
    let short: String
    let hero: String?

    static func pick(_ day: NovaDay?, at now: Date) -> Lead {
        guard let day else { return Lead(key: nil, say: "No numbers from your Mac yet today.", short: "Waiting", hero: nil) }
        let hour = Calendar.current.component(.hour, from: now)
        let p = Reading(.protein, day), s = Reading(.steps, day), h = Reading(.hrv, day)
        let pShort = p.toGo ?? 0, sShort = s.toGo ?? 0

        if hour < 11, let v = h.value {
            let session = day.session
            switch day.hrv?.verdict {
            case "recovered":
                return Lead(key: .hrv, say: session.map { "Recovered. Today can be a hard \($0)." } ?? "Recovered. A good day to push.", short: "Recovered", hero: fmt(v))
            case "strained":
                return Lead(key: .hrv, say: session.map { "Below your usual. Take \($0) easier." } ?? "Below your usual. An easier day.", short: "Below usual", hero: fmt(v))
            default:
                return Lead(key: .hrv, say: session.map { "In your usual range. \($0) as planned." } ?? "In your usual range.", short: "Usual range", hero: fmt(v))
            }
        }
        let proteinLine = Lead(key: .protein, say: "\(fmt(pShort)) g of protein to go.", short: "\(fmt(pShort)) g to go", hero: p.short)
        let stepsLine = Lead(key: .steps, say: "\(fmt(sShort)) steps short. A walk closes it.", short: "\(fmt(sShort)) to go", hero: s.short)
        if hour < 17 {
            if pShort > 0 { return proteinLine }
            if sShort > 0 { return stepsLine }
        } else {
            let pf = (p.goal ?? 0) > 0 ? pShort / p.goal! : 0
            let sf = (s.goal ?? 0) > 0 ? sShort / s.goal! : 0
            if pf > 0 || sf > 0 { return sf >= pf ? stepsLine : proteinLine }
        }
        if p.value == nil && s.value == nil { return Lead(key: nil, say: "Nothing logged yet today.", short: "Nothing yet", hero: nil) }
        return Lead(key: nil, say: "Every goal met today.", short: "All met", hero: nil)
    }
}

struct TodayMediumView: View {
    let entry: NovaEntry
    var body: some View {
        let day = entry.today
        let lead = Lead.pick(day, at: entry.date)
        let key = lead.key ?? .protein
        let others = NovaKey.all.filter { $0 != key && $0 != .hrv }.prefix(2)
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 6) {
                        Text(lead.key?.name ?? "Today").font(.system(size: 13, weight: .semibold)).foregroundStyle(lead.key?.hue ?? WInk.ink2)
                        Text(entry.stamp).font(.system(size: 11, weight: .medium)).foregroundStyle(WInk.ink3).monospacedDigit()
                    }
                    Spacer(minLength: 6)
                    Text(lead.say).font(.system(size: 18, design: .serif)).foregroundStyle(WInk.ink)
                        .lineLimit(3).minimumScaleFactor(0.8)
                    Spacer(minLength: 6)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if lead.key != nil {
                    Badge(reading: Reading(key, day), hrv: day?.hrv, size: 72, glyph: 24, width: 8)
                }
            }
            HStack(spacing: 14) {
                ForEach(Array(others), id: \.self) { k in
                    let r = Reading(k, day)
                    HStack(spacing: 5) {
                        Glyph(key: k, size: 10)
                        Text(r.value == nil ? "\(k.name) —" : "\(r.short)\(k == .protein ? " g" : k == .kcal ? " kcal" : " steps")")
                            .font(.system(size: 12, weight: .medium)).foregroundStyle(WInk.ink2).monospacedDigit()
                    }
                }
            }
            .frame(height: 15)
        }
    }
}

struct TodaySmallView: View {
    let entry: NovaEntry
    var body: some View {
        let day = entry.today
        let lead = Lead.pick(day, at: entry.date)
        if let key = lead.key {
            SingleView(reading: Reading(key, day), day: day, stamp: entry.stamp, sub: lead.short)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 5) {
                    if lead.short == "All met" {
                        Image(systemName: "checkmark.seal.fill").font(.system(size: 13, weight: .semibold)).foregroundStyle(WInk.protein)
                    }
                    Text("Today").font(.system(size: 13, weight: .semibold)).foregroundStyle(WInk.ink2)
                }
                Spacer(minLength: 0)
                Text(lead.say).font(.system(size: 18, design: .serif)).foregroundStyle(WInk.ink).lineLimit(4)
                Text(entry.stamp).font(.system(size: 11, weight: .medium)).foregroundStyle(WInk.ink3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - Lock Screen. iOS draws these in one tint taken from the wallpaper,
// whatever colour a widget asks for; the shapes carry the meaning there.

struct LockCircle: View {
    let reading: Reading
    let day: NovaDay?
    var body: some View {
        if reading.key == .hrv {
            let lo = min(40, (day?.hrv?.lo ?? 40) - 10), hi = max(100, (day?.hrv?.hi ?? 100) + 10)
            Gauge(value: min(max(reading.value ?? lo, lo), hi), in: lo...hi) {
                Glyph(key: .hrv, size: 11, color: .white)
            } currentValueLabel: {
                Text(reading.short).font(.system(size: 15, weight: .bold, design: .rounded)).monospacedDigit()
            }
            .gaugeStyle(.accessoryCircular)
            .tint(WInk.hrv)
        } else {
            Gauge(value: reading.fraction) {
                EmptyView()
            } currentValueLabel: {
                VStack(spacing: 1) {
                    Glyph(key: reading.key, size: 11, color: .white)
                    Text(compact(reading.value)).font(.system(size: 14, weight: .bold, design: .rounded)).monospacedDigit()
                        .minimumScaleFactor(0.7)
                }
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .tint(reading.key.hue)
        }
    }
    private func compact(_ v: Double?) -> String {
        guard let v else { return "—" }
        if v >= 10_000 { return String(format: "%.1fk", v / 1000) }
        return fmt(v)
    }
}

// MARK: - widgets

private extension View {
    func novaGround() -> some View {
        containerBackground(for: .widget) { WInk.ground }
    }
}

struct NovaRingsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "NovaRings", provider: NovaProvider()) { entry in
            NovaRingsView(entry: entry).novaGround().widgetURL(NovaLink.fuel)
        }
        .configurationDisplayName("Rings")
        .description("Protein, calories, steps and HRV at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct NovaRingsView: View {
    @Environment(\.widgetFamily) var family
    let entry: NovaEntry
    var body: some View {
        if family == .systemMedium { RowView(day: entry.today) } else { QuadView(day: entry.today) }
    }
}

struct NovaNumberWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "NovaNumber", intent: NovaNumberIntent.self, provider: NovaNumberProvider()) { entry in
            NovaNumberView(entry: entry).novaGround()
        }
        .configurationDisplayName("One number")
        .description("Protein, calories, steps or HRV. Touch and hold to choose.")
        .supportedFamilies([.systemSmall, .accessoryCircular])
    }
}

struct NovaNumberView: View {
    @Environment(\.widgetFamily) var family
    let entry: NovaEntry
    var body: some View {
        let r = Reading(entry.metric, entry.today)
        // protein and calories are Fuel numbers; steps and HRV keep opening on Home
        let link = (entry.metric == .protein || entry.metric == .kcal) ? NovaLink.fuel : nil
        Group {
            if family == .accessoryCircular { LockCircle(reading: r, day: entry.today) }
            else { SingleView(reading: r, day: entry.today, stamp: entry.stamp) }
        }
        .widgetURL(link)
    }
}

struct NovaFuelWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "NovaFuel", provider: NovaProvider()) { entry in
            FuelView(day: entry.today).novaGround().widgetURL(NovaLink.fuel)
        }
        .configurationDisplayName("Fuel and steps")
        .description("Protein, calories and steps as three rings.")
        .supportedFamilies([.systemMedium])
    }
}

struct NovaTodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "NovaToday", provider: NovaProvider()) { entry in
            NovaTodayView(entry: entry).novaGround()
        }
        .configurationDisplayName("Today")
        .description("Leads with what matters at this hour: recovery, protein, then whatever is still short.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryInline, .accessoryRectangular])
    }
}

struct NovaTodayView: View {
    @Environment(\.widgetFamily) var family
    let entry: NovaEntry
    var body: some View {
        switch family {
        case .systemMedium: TodayMediumView(entry: entry)
        case .accessoryInline: Text(inline)
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text(Lead.pick(entry.today, at: entry.date).key?.name ?? "Nova").font(.headline)
                Text(Lead.pick(entry.today, at: entry.date).say).font(.subheadline).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        default: TodaySmallView(entry: entry)
        }
    }
    private var inline: String {
        let p = Reading(.protein, entry.today), s = Reading(.steps, entry.today)
        var parts: [String] = []
        if let v = p.value { parts.append("\(fmt(v)) g protein") }
        if let t = s.toGo, t > 0 { parts.append("\(fmt(t)) steps to go") } else if let v = s.value { parts.append("\(fmt(v)) steps") }
        return parts.isEmpty ? "Nova" : parts.joined(separator: " · ")
    }
}
