import AppIntents
import SwiftUI
import WidgetKit

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
// STEPS ARE HEALTH'S FIGURE, NEVER THE PHONE'S OWN COUNT (his call, 4 Nov
// 2026: "I want it to match what health says at all times"). From 27 Oct the
// widget lifted steps to max(Mac, iPhone pedometer) to move live on a walk,
// but the pedometer counts steps Health replaces with the Watch's: 10,090 on
// the widget against Health's 9,480. Health's de-duplicated total, as last
// read, is the only steps number shown.

// MARK: - data

struct NovaMetric: Codable { var value: Double?; var goal: Double? }
struct NovaHRV: Codable { var value: Double; var date: String; var lo: Double?; var hi: Double?; var verdict: String? }
struct NovaDay: Codable {
    var at: String
    var date: String
    var protein: NovaMetric
    var kcal: NovaMetric
    var steps: NovaMetric
    /// when the Mac last read Health's steps (ISO); shown beside "Steps"
    var stepsAt: String? = nil
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

    static func load() async -> (NovaDay?, Date?) { await loadMac() }

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
/// Opening any of these also turns The Line and Lead face up again.
enum NovaLink {
    static let fuel = URL(string: "novaos://open/recipes")
    /// The Line (mockup 122): the day's line, opened in Nova
    static let line = URL(string: "novaos://open/line")
    /// Lead (mockup 123): the Leader, with today's idea open
    static let lead = URL(string: "novaos://open/leader/idea")
    /// Your situation (mockup 123): the Leader, its question open for his answer
    static let situation = URL(string: "novaos://open/leader/ask")
    /// the Leader as it is
    static let leader = URL(string: "novaos://open/leader")
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
    /// "8:16 pm": when Health's steps were read, quiet beside the label (his pick A, 5 Nov 2026)
    static func readAt(_ iso: String?) -> String? {
        guard let iso else { return nil }
        let p = ISO8601DateFormatter()
        p.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let d = p.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return nil }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_AU")
        f.dateFormat = "h:mm a"
        f.amSymbol = "am"; f.pmSymbol = "pm"
        return f.string(from: d)
    }
    private func line(_ r: Reading, of: String?) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
                Glyph(key: r.key, size: 11)
                Text(r.key.name).font(.system(size: 12, weight: .semibold)).foregroundStyle(r.key.hue)
                if r.key == .steps, let t = Self.readAt(day?.stepsAt) {
                    Text("· \(t)").font(.system(size: 11, weight: .medium)).foregroundStyle(WInk.ink3).monospacedDigit()
                }
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

// MARK: - THE LINE ============================================================
//
// "The Line" (his ask, 17 Nov 2026; mockup 122, round three, APPROVED: design/
// mockups/122-the-line-widget-round-three.html). One real line a day from his
// own vault, the speaker's words exactly, from the Mac's GET /api/widget/line
// (server/lib/lineWidget.js). The look is a setting (Follows the day, Nova,
// Ink, Paper); the light in the ground sits where the day is (four drawings,
// 05:00, 11:00, 17:00, 21:00); the two dots turn the line over to its idea.
//
// Every number below is the mockup's: its CSS is the contract. The quote is
// set line by line (CoreText finds the breaks, balanced like the mockup's
// text-wrap: balance) so its line height is the mockup's 1.2, which SwiftUI's
// lineSpacing cannot reach below the font's own. The words are never cut: the
// type steps down, and a line too long for the size shows its idea instead.
//
// Honest by shape: nothing here invents a line. A line from an earlier day
// says "From Mon 16 Nov"; nothing ever fetched says so.

// MARK: line data

struct NovaLine: Codable, Equatable {
    var id: String
    var quote: String
    var em: String? = nil
    var who: String? = nil
    var host: String? = nil
    var podcast: String? = nil
    var origin: String? = nil
    var byLong: String? = nil
    var byShort: String? = nil
    var at: String? = nil
    var idea: String
    var sent: String? = nil
    /// only on `previous`: the day it was the line
    var date: String? = nil

    enum CodingKeys: String, CodingKey { case id, quote, em, who, host, podcast, origin, byLong, byShort, at, idea, sent, date }

    init(id: String, quote: String, em: String? = nil, who: String? = nil, host: String? = nil, podcast: String? = nil,
         byLong: String? = nil, byShort: String? = nil, at: String? = nil, idea: String, sent: String? = nil, date: String? = nil) {
        self.id = id; self.quote = quote; self.em = em; self.who = who; self.host = host; self.podcast = podcast
        self.byLong = byLong; self.byShort = byShort; self.at = at; self.idea = idea; self.sent = sent; self.date = date
    }

    /// Lenient: a field of the wrong type or only spaces is absent; a line
    /// without its words, id or idea is not a line.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func s(_ k: CodingKeys) -> String? {
            guard let v = (try? c.decodeIfPresent(String.self, forKey: k)) ?? nil,
                  !v.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
            return v
        }
        guard let id = s(.id), let quote = s(.quote), let idea = s(.idea) else {
            throw DecodingError.dataCorrupted(.init(codingPath: c.codingPath, debugDescription: "a line needs id, quote and idea"))
        }
        self.init(id: id, quote: quote, em: s(.em), who: s(.who), host: s(.host), podcast: s(.podcast),
                  byLong: s(.byLong), byShort: s(.byShort), at: s(.at), idea: idea, sent: s(.sent), date: s(.date))
        origin = s(.origin)
    }

    /// The accent phrase, only when it is an exact run of the line's own words.
    var emRange: NSRange? {
        guard let em, !em.isEmpty, let r = quote.range(of: em) else { return nil }
        return NSRange(r, in: quote)
    }
}

struct NovaLinePayload: Codable {
    var at: String?
    var date: String?
    var line: NovaLine?
    /// A shorter line for the small widget, sent only on a day when `line` is
    /// too long for that size.
    var short: NovaLine?
    var previous: NovaLine?

    init(at: String? = nil, date: String? = nil, line: NovaLine? = nil, short: NovaLine? = nil, previous: NovaLine? = nil) {
        self.at = at; self.date = date; self.line = line; self.short = short; self.previous = previous
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        at = (try? c.decodeIfPresent(String.self, forKey: .at)) ?? nil
        date = (try? c.decodeIfPresent(String.self, forKey: .date)) ?? nil
        line = (try? c.decodeIfPresent(NovaLine.self, forKey: .line)) ?? nil
        short = (try? c.decodeIfPresent(NovaLine.self, forKey: .short)) ?? nil
        previous = (try? c.decodeIfPresent(NovaLine.self, forKey: .previous)) ?? nil
    }
}

/// The last good answer lives in the App Group beside today's numbers, under
/// its own keys; the turned-over flag too, one per widget size.
enum NovaLineStore {
    static let lineKey = "nova.line", atKey = "nova.lineAt", turnAtKey = "nova.lineTurnAt"

    static func cached() -> (NovaLinePayload, Date)? {
        guard let d = NovaShared.defaults, let data = d.data(forKey: lineKey),
              let p = try? JSONDecoder().decode(NovaLinePayload.self, from: data) else { return nil }
        return (p, d.object(forKey: atKey) as? Date ?? .distantPast)
    }

    /// (the payload to draw, whether the Mac answered). Right after a tap on
    /// the front, today's kept answer is used as it is, so the line turns at
    /// once instead of waiting on the network.
    static func load(now: Date = .now) async -> (NovaLinePayload?, Bool) {
        let d = NovaShared.defaults
        if let (p, _) = cached(), p.date == LineDay.iso(now),
           let tapped = d?.object(forKey: turnAtKey) as? Date, now.timeIntervalSince(tapped) < 20 {
            return (p, true)
        }
        if let d, let base = d.string(forKey: "nova.baseUrl"), let token = d.string(forKey: "nova.token"),
           let url = URL(string: base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/api/widget/line") {
            var req = URLRequest(url: url, timeoutInterval: 12)
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            if let (data, resp) = try? await URLSession.shared.data(for: req),
               (resp as? HTTPURLResponse)?.statusCode == 200,
               let p = try? JSONDecoder().decode(NovaLinePayload.self, from: data) {
                d.set(data, forKey: lineKey)
                d.set(Date(), forKey: atKey)
                return (p, true)
            }
        }
        return (cached()?.0, false)
    }

    static func turned(slot: String, key: String) -> Bool {
        NovaShared.defaults?.string(forKey: "nova.lineTurned." + slot) == key
    }

    /// The flag holds "<line id>|<day>", so a new line or a new day always
    /// arrives face up.
    static func toggle(slot: String, key: String) {
        guard let d = NovaShared.defaults else { return }
        let k = "nova.lineTurned." + slot
        if d.string(forKey: k) == key { d.removeObject(forKey: k) } else { d.set(key, forKey: k) }
        d.set(Date(), forKey: turnAtKey)
    }
}

/// Days, the four times of day, and the "From Mon 16 Nov" label.
enum LineDay {
    /// local day, the same yyyy-MM-dd the Mac writes
    static func iso(_ d: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    static func from(_ iso: String?) -> String {
        let p = (iso ?? "").split(separator: "-").compactMap { Int($0) }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = .current
        guard p.count == 3, let d = cal.date(from: DateComponents(year: p[0], month: p[1], day: p[2])) else {
            return "From an earlier day"
        }
        let days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        return "From \(days[cal.component(.weekday, from: d) - 1]) \(p[2]) \(months[max(0, min(11, p[1] - 1))])"
    }

    /// 0 morning (05:00), 1 midday (11:00), 2 evening (17:00), 3 night (21:00 until 05:00)
    static let starts = [5, 11, 17, 21]
    static func phase(_ d: Date) -> Int {
        let h = Calendar.current.component(.hour, from: d)
        return h < 5 ? 3 : h < 11 ? 0 : h < 17 ? 1 : h < 21 ? 2 : 3
    }

    /// The remaining phase boundaries today, then the next local midnight (last).
    static func turns(after now: Date) -> [Date] {
        let cal = Calendar.current
        let day = cal.startOfDay(for: now)
        var out = starts.compactMap { cal.date(byAdding: .hour, value: $0, to: day) }.filter { $0 > now }
        if let midnight = cal.date(byAdding: .day, value: 1, to: day) { out.append(midnight) }
        return out
    }
}

/// What a widget shows on a day: today's line, or an earlier one said to be
/// earlier, or nothing.
enum LinePick {
    static func choose(_ p: NovaLinePayload?, on day: String) -> (line: NovaLine, from: String?)? {
        guard let p else { return nil }
        if p.date == day, let l = p.line { return (l, nil) }
        if p.date != day, let l = p.line { return (l, LineDay.from(p.date)) }
        if let prev = p.previous { return (prev, LineDay.from(prev.date)) }
        return nil
    }
}

// MARK: line looks (the mockup's three, and the setting)

struct LineLook: Equatable {
    let name: String
    let ink: Color, ink2: Color, ink3: Color, acc: Color, em: Color, sep: Color, edge: Color, light: Color
    let emItalic: Bool, bodyItalic: Bool, mark: Bool
    let bar: CGFloat, pad: CGFloat
    let ground: [Color]
    let angle: Double

    static func == (a: LineLook, b: LineLook) -> Bool { a.name == b.name }

    static let nova = LineLook(name: "nova",
        ink: Color(hex: "#eef1f8"), ink2: Color(hex: "#eef1f8").opacity(0.64), ink3: Color(hex: "#eef1f8").opacity(0.42),
        acc: Color(hex: "#a493ff"), em: Color(hex: "#cdc4ff"), sep: Color(hex: "#eef1f8").opacity(0.14),
        edge: Color.white.opacity(0.09), light: Color(hex: "#8f7bff").opacity(0.44),
        emItalic: true, bodyItalic: false, mark: true, bar: 0, pad: 0,
        ground: [Color(hex: "#1d2750"), Color(hex: "#10152f")], angle: 135)
    static let ink = LineLook(name: "ink",
        ink: Color(hex: "#f3ecdf"), ink2: Color(hex: "#f3ecdf").opacity(0.62), ink3: Color(hex: "#f3ecdf").opacity(0.40),
        acc: Color(hex: "#8f7bff"), em: Color(hex: "#b9acff"), sep: Color(hex: "#f3ecdf").opacity(0.14),
        edge: Color.white.opacity(0.10), light: Color(hex: "#8f7bff").opacity(0.20),
        emItalic: false, bodyItalic: true, mark: false, bar: 2, pad: 14,
        ground: [Color(hex: "#15161f"), Color(hex: "#0a0b11")], angle: 160)
    static let paper = LineLook(name: "paper",
        ink: Color(hex: "#1f1c18"), ink2: Color(hex: "#1f1c18").opacity(0.66), ink3: Color(hex: "#1f1c18").opacity(0.46),
        acc: Color(hex: "#5a45d6"), em: Color(hex: "#5a45d6"), sep: Color(hex: "#1f1c18").opacity(0.16),
        edge: Color.white.opacity(0.5), light: Color.white.opacity(0.85),
        emItalic: true, bodyItalic: false, mark: true, bar: 0, pad: 0,
        ground: [Color(hex: "#f4eee2"), Color(hex: "#e7decd")], angle: 160)

    /// where the light sits at each time of day: offset as a share of its own
    /// size (the mockup's --lx/--ly), and its opacity
    static let lights: [(x: CGFloat, y: CGFloat, o: Double)] = [(-0.38, -0.48, 1), (0.22, -0.60, 1), (0.88, -0.26, 0.85), (0.96, 0.40, 0.5)]
}

enum LineLookChoice: String, AppEnum {
    case day, nova, ink, paper
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Look"
    static var caseDisplayRepresentations: [LineLookChoice: DisplayRepresentation] = [
        .day: DisplayRepresentation(title: "Follows the day", subtitle: "Paper by day, Nova in the evening, Ink at night"),
        .nova: "Nova", .ink: "Ink", .paper: "Paper",
    ]
    /// Follows the day: morning and midday Paper, evening Nova, night Ink.
    /// Midday was Nova until 19 Nov; his call matched it to the Leader's Paper.
    func look(_ phase: Int) -> LineLook {
        switch self {
        case .nova: return .nova
        case .ink: return .ink
        case .paper: return .paper
        case .day: return [LineLook.paper, .paper, .nova, .ink][max(0, min(3, phase))]
        }
    }
}

struct NovaLineIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "The Line"
    static var description = IntentDescription("Choose the look. Follows the day goes from Paper by day to Ink at night.")
    @Parameter(title: "Look", default: .day) var look: LineLookChoice
}

/// A tap on the front: turn the line over to its idea. Opening Nova from the
/// back turns it face up again.
struct LineTurnIntent: AppIntent {
    static var title: LocalizedStringResource = "Turn the line over"
    static var isDiscoverable: Bool = false
    @Parameter(title: "Size") var slot: String
    @Parameter(title: "Line") var key: String
    init() {}
    init(slot: String, key: String) { self.slot = slot; self.key = key }
    func perform() async throws -> some IntentResult {
        NovaLineStore.toggle(slot: slot, key: key)
        WidgetCenter.shared.reloadTimelines(ofKind: "NovaLine")
        return .result()
    }
}

struct LineEntry: TimelineEntry {
    let date: Date
    let line: NovaLine?
    /// "From Mon 16 Nov" when the line is not today's
    var staleFrom: String? = nil
    var phase: Int
    var look: LineLook
    var turned = false
    /// "<id>|<day>" for the turn; nil draws the dots without a tap
    var turnKey: String? = nil

    /// The gallery's stand-in when nothing has been fetched: plainly not a
    /// line, and nobody's.
    static func placeholder(_ choice: LineLookChoice = .day, at date: Date = .now) -> LineEntry {
        let ph = LineDay.phase(date)
        return LineEntry(date: date, line: NovaLine(id: "placeholder", quote: "Your line for the day will sit here.", idea: "The idea behind it"),
                         phase: ph, look: choice.look(ph))
    }
}

// MARK: line sizes and type

enum LineSize {
    case small, medium, large, lock

    var slot: String { switch self { case .small: "small"; case .medium: "medium"; case .large: "large"; case .lock: "lock" } }
    var pad: CGFloat { self == .large ? 20 : 16 }
    /// the mockup's FIT steps
    var steps: [CGFloat] {
        switch self {
        case .small: [19, 17, 15, 13.5]
        case .medium: [24, 21, 18.5, 16.5, 15]
        case .large: [36, 32, 28, 24, 21]
        case .lock: [14, 13, 12]
        }
    }
    var ideaSize: CGFloat { switch self { case .small: 17; case .large: 30; case .medium: 22; case .lock: 14 } }
    var lineHeight: CGFloat { self == .large ? 1.14 : 1.2 }
    var tracking: CGFloat { self == .large ? -0.018 : self == .lock ? 0 : -0.012 }
    var byFont: CGFloat { self == .large ? 12 : 11 }
    var byTop: CGFloat { self == .large ? 16 : 10 }
}

struct LineRun: Hashable { let text: String; let em: Bool }

// LINE-FONT-BEGIN (the Mac render harness swaps this block for AppKit)
typealias LinePlatformFont = UIFont
enum LineFont {
    static func serif(_ size: CGFloat, italic: Bool) -> LinePlatformFont {
        let base = UIFont.systemFont(ofSize: size).fontDescriptor
        var d = base.withDesign(.serif) ?? base
        if italic, let i = d.withSymbolicTraits(.traitItalic) { d = i }
        return UIFont(descriptor: d, size: size)
    }
    static func sans(_ size: CGFloat, bold: Bool) -> LinePlatformFont {
        UIFont.systemFont(ofSize: size, weight: bold ? .semibold : .regular)
    }
    /// the serif at weight 500 (the Leader's titles)
    static func serifMedium(_ size: CGFloat) -> LinePlatformFont {
        let base = UIFont.systemFont(ofSize: size, weight: .medium).fontDescriptor
        return UIFont(descriptor: base.withDesign(.serif) ?? base, size: size)
    }
    /// a font's own line height per point of size
    static let serifLine: CGFloat = { let f = serif(100, italic: false); return f.lineHeight / 100 }()
}
// LINE-FONT-END

/// Where the quote breaks. CoreText finds the breaks with the same fonts the
/// views draw with; `balance` is the mockup's text-wrap: balance, as WebKit
/// (his iPhone's engine) does it.
enum LineSetter {
    static func lines(_ text: String, em: NSRange?, size: CGFloat, kern: CGFloat, bodyItalic: Bool, emItalic: Bool,
                      width: CGFloat, balance: Bool, sansBold: Bool? = nil) -> [[LineRun]] {
        let body: LinePlatformFont = sansBold.map { LineFont.sans(size, bold: $0) } ?? LineFont.serif(size, italic: bodyItalic)
        let a = NSMutableAttributedString(string: text, attributes: [.font: body, .kern: kern])
        if let em { a.addAttribute(.font, value: LineFont.serif(size, italic: emItalic), range: em) }
        var ranges = breaks(a, width)
        if balance, ranges.count > 1, ranges.count <= 10, let even = balanced(a, width, ranges.count) { ranges = even }
        let ns = text as NSString
        return ranges.map { r in
            var cuts = [r.location, r.location + r.length]
            if let em {
                for c in [em.location, em.location + em.length] where c > r.location && c < r.location + r.length { cuts.append(c) }
            }
            cuts.sort()
            var runs: [LineRun] = []
            for i in 0..<(cuts.count - 1) where cuts[i + 1] > cuts[i] {
                let piece = NSRange(location: cuts[i], length: cuts[i + 1] - cuts[i])
                let inEm = em.map { NSLocationInRange(piece.location, $0) } ?? false
                runs.append(LineRun(text: ns.substring(with: piece), em: inEm))
            }
            // the space a line ends on is not drawn
            if let last = runs.last {
                let t = last.text.replacingOccurrences(of: "\\s+$", with: "", options: .regularExpression)
                runs[runs.count - 1] = LineRun(text: t, em: last.em)
            }
            return runs
        }
    }

    /// WebKit's balance: the same number of lines, broken where the squared
    /// distance of each line from an even share of the whole is least.
    static func balanced(_ a: NSAttributedString, _ width: CGFloat, _ k: Int) -> [NSRange]? {
        let ns = a.string as NSString
        let space = CharacterSet.whitespacesAndNewlines
        func isSpace(_ c: unichar) -> Bool { UnicodeScalar(c).map { space.contains($0) } ?? false }
        var cuts = [0]
        if ns.length > 1 {
            for i in 1..<ns.length {
                let p = ns.character(at: i - 1), c = ns.character(at: i)
                if !isSpace(c) && (isSpace(p) || p == 0x2D) { cuts.append(i) }
            }
        }
        cuts.append(ns.length)
        let n = cuts.count - 1
        guard n >= k else { return nil }
        var memo: [Int: CGFloat] = [:]
        func w(_ i: Int, _ j: Int) -> CGFloat {
            if let v = memo[i * 4096 + j] { return v }
            let line = CTLineCreateWithAttributedString(a.attributedSubstring(from: NSRange(location: cuts[i], length: cuts[j] - cuts[i])))
            let v = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil) - CTLineGetTrailingWhitespaceWidth(line))
            memo[i * 4096 + j] = v
            return v
        }
        let ideal = w(0, n) / CGFloat(k)
        let inf = CGFloat.greatestFiniteMagnitude
        var cost = Array(repeating: Array(repeating: inf, count: k + 1), count: n + 1)
        var from = Array(repeating: Array(repeating: -1, count: k + 1), count: n + 1)
        cost[0][0] = 0
        for m in 1...k {
            for j in m...n {
                var i = j - 1
                while i >= m - 1 {
                    let lw = w(i, j)
                    if lw > width { break }
                    if cost[i][m - 1] < inf {
                        let c = cost[i][m - 1] + (ideal - lw) * (ideal - lw)
                        if c < cost[j][m] { cost[j][m] = c; from[j][m] = i }
                    }
                    i -= 1
                }
            }
        }
        guard cost[n][k] < inf else { return nil }
        var out: [NSRange] = []
        var j = n, m = k
        while m > 0 {
            let i = from[j][m]
            out.insert(NSRange(location: cuts[i], length: cuts[j] - cuts[i]), at: 0)
            j = i; m -= 1
        }
        return out
    }

    static func breaks(_ a: NSAttributedString, _ width: CGFloat) -> [NSRange] {
        let ts = CTTypesetterCreateWithAttributedString(a)
        var out: [NSRange] = []
        var start = 0
        while start < a.length {
            let n = max(1, CTTypesetterSuggestLineBreak(ts, start, Double(width)))
            out.append(NSRange(location: start, length: n))
            start += n
        }
        return out
    }
}

/// A set quote: one Text per line, each line exactly the mockup's line height.
struct LineLines: View {
    let lines: [[LineRun]]
    let size: CGFloat
    let lineHeight: CGFloat
    let kern: CGFloat
    let look: LineLook
    var plainColor: Color? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, runs in
                runs.reduce(Text("")) { t, r in
                    t + Text(r.text)
                        .font(.system(size: size, design: .serif))
                        .italic(r.em ? look.emItalic : look.bodyItalic)
                        .kerning(kern)
                        .foregroundStyle(r.em ? look.em : (plainColor ?? look.ink))
                }
                .lineLimit(1)
                .fixedSize()
                .frame(height: size * lineHeight)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(lines.map { $0.map(\.text).joined() }.joined(separator: " "))
    }
}

/// One attribution row: who, then whose show, then the time.
private struct LineBy: Hashable { var who: String?; var rest: String?; var right: String? }

// MARK: line faces

struct LineFace: View {
    let entry: LineEntry
    let size: LineSize
    let look: LineLook

    var body: some View {
        GeometryReader { g in
            if size == .lock { lockFace(g.size) } else { home(g.size) }
        }
    }

    // MARK: home screen

    private var padL: CGFloat { size == .small ? look.pad * 0.6 : look.pad }

    private func textWidth(_ w: CGFloat) -> CGFloat {
        w - size.pad * 2 - (size == .medium && look.mark ? 32 : 0) - look.bar - padL
    }

    private func set(_ text: String, em: NSRange?, _ fs: CGFloat, _ width: CGFloat) -> [[LineRun]] {
        LineSetter.lines(text, em: em, size: fs, kern: size.tracking * fs, bodyItalic: look.bodyItalic,
                         emItalic: look.emItalic, width: width, balance: true)
    }

    private func quote(_ lines: [[LineRun]], _ fs: CGFloat) -> LineLines {
        LineLines(lines: lines, size: fs, lineHeight: size.lineHeight, kern: size.tracking * fs, look: look)
    }

    @ViewBuilder private func home(_ s: CGSize) -> some View {
        let tw = textWidth(s.width)
        ZStack(alignment: .topTrailing) {
            Group {
                if let line = entry.line {
                    if entry.turned { ideaFace(line, tw) } else { front(line, tw) }
                } else {
                    noneFace(tw)
                }
            }
            .padding(size.pad)
            .frame(width: s.width, height: s.height, alignment: .leading)
            if entry.line != nil { dots }
        }
    }

    /// the line, at the largest step that fits whole
    @ViewBuilder private func front(_ line: NovaLine, _ tw: CGFloat) -> some View {
        let em = line.emRange
        // a short line never runs past three rows: the type steps down first
        let short = line.quote.count <= 60
        let steps = size.steps.enumerated().filter { i, fs in
            !(short && i < size.steps.count - 1 && set(line.quote, em: em, fs, tw).count > 3)
        }.map(\.element)
        ViewThatFits(in: .vertical) {
            ForEach(steps, id: \.self) { fs in
                inBox(tw) {
                    quote(set(line.quote, em: em, fs, tw), fs)
                    byRow(line)
                    if size == .large, let sent = line.sent { ideaBlock(line.idea, sent, tw) }
                }
            }
            // too long for this size: its idea, and a tap turns it over
            inBox(tw) {
                quote(set(line.idea, em: nil, size.steps[1], tw), size.steps[1])
                sub2("Tap to turn it over", tw)
                byRow(line)
            }
        }
    }

    /// turned over: the idea behind it
    @ViewBuilder private func ideaFace(_ line: NovaLine, _ tw: CGFloat) -> some View {
        ViewThatFits(in: .vertical) {
            ForEach([1, 0.85, 0.72] as [CGFloat], id: \.self) { k in
                let fs = (size.ideaSize * k).rounded()
                inBox(tw) {
                    kicker
                    quote(set(line.idea, em: nil, fs, tw), fs)
                    if size != .small { sub2(line.sent ?? "Open for the note", tw) }
                    byRow(line)
                }
            }
            inBox(tw) {
                kicker
                quote(set(line.idea, em: nil, size.ideaSize * 0.72, tw), size.ideaSize * 0.72)
                byRow(line)
            }
        }
    }

    private func noneFace(_ tw: CGFloat) -> some View {
        inBox(tw, dim: true) {
            quote(set("No line yet.", em: nil, 19, tw), 19)
            sub2("Open Nova once and he will bring one.", tw)
        }
    }

    /// the mockup's .in: the mark beside (medium) or above (small, large) the
    /// words, or Ink's rule down the left
    @ViewBuilder private func inBox<C: View>(_ tw: CGFloat, dim: Bool = false, @ViewBuilder _ content: () -> C) -> some View {
        // the column's width is known: pinned, so a stack's measuring pass
        // never offers it less and shortens the attribution for nothing
        let col = VStack(alignment: .leading, spacing: 0, content: content).frame(width: max(0, tw), alignment: .leading)
        Group {
            if size == .medium {
                HStack(alignment: .top, spacing: 10) {
                    if look.mark { mark(dim) }
                    col
                }
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    if look.mark { mark(dim) }
                    col
                }
            }
        }
        .padding(.leading, look.bar + padL)
        .overlay(alignment: .leading) {
            if look.bar > 0 { Rectangle().fill(look.acc).frame(width: look.bar).widgetAccentable() }
        }
    }

    /// the opening quote mark: the mockup's 500-weight serif glyph in a short
    /// box (line-height .74), so it hangs above the first line's cap height
    private func mark(_ dim: Bool) -> some View {
        let g: CGFloat = size == .small ? 34 : size == .large ? 64 : 44
        let h: CGFloat = size == .small ? 15 : size == .large ? 30 : 20
        let top: CGFloat = size == .small ? 2 : size == .large ? 6 : 3
        return Text("\u{201C}")
            .font(.system(size: g, weight: .medium, design: .serif))
            .foregroundStyle(look.acc)
            .fixedSize()
            .offset(y: (0.74 - LineFont.serifLine) * g / 2)
            .frame(width: 22, height: h, alignment: .topLeading)
            .padding(.top, top)
            .opacity(dim ? 0.45 : 1)
            .widgetAccentable()
            .accessibilityHidden(true)
    }

    private var kicker: some View {
        Text("The idea behind it".uppercased())
            .font(.system(size: 10, weight: .semibold))
            .kerning(1)
            .foregroundStyle(look.ink3)
            .lineLimit(1)
            .frame(height: 15)
            .padding(.bottom, 5)
    }

    /// Sans text at the mockup's CSS line height, broken by CoreText as the
    /// quote is (SwiftUI's own wrap ran a word short and its leading wide).
    private func sansLines(_ s: String, _ fs: CGFloat, _ lh: CGFloat, bold: Bool = false, color: Color, width: CGFloat) -> some View {
        let lines = LineSetter.lines(s, em: nil, size: fs, kern: 0, bodyItalic: false, emItalic: false,
                                     width: width + 1, balance: false, sansBold: bold)  // WebKit fits a hair more
        return VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, runs in
                Text(runs.map(\.text).joined())
                    .font(.system(size: fs, weight: bold ? .semibold : .regular))
                    .foregroundStyle(color)
                    .lineLimit(1)
                    .fixedSize()
                    .frame(height: fs * lh)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(s)
    }

    private func sub2(_ s: String, _ tw: CGFloat) -> some View {
        sansLines(s, 12, 1.35, color: look.ink2, width: tw).padding(.top, 4)
    }

    /// large only: the idea under a hairline
    private func ideaBlock(_ idea: String, _ sent: String, _ tw: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            sansLines(idea, 13, 1.5, bold: true, color: look.ink, width: tw)
            sansLines(sent, 13, 1.35, color: look.ink2, width: tw)
        }
        .padding(.top, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { Rectangle().fill(look.sep).frame(height: 0.5) }
        .padding(.top, 18)
    }

    // MARK: the attribution row

    /// His wording rule (17 Nov): WHO then whose show, then the time; one row,
    /// never wrapped, never cut mid-name. Each variant is tried in turn.
    private func byVariants(_ l: NovaLine) -> [LineBy] {
        var v: [LineBy] = []
        if let stale = entry.staleFrom {
            if size == .small { return [LineBy(rest: stale)] }
            if let who = l.who { v.append(LineBy(who: who, right: stale)) } else {
                for r in [l.byLong, l.byShort, l.podcast].compactMap({ $0 }) { v.append(LineBy(rest: r, right: stale)) }
            }
            v.append(LineBy(right: stale))
        } else if size == .small {
            if let who = l.who { v.append(LineBy(who: who)) } else {
                for r in [l.byLong, l.byShort, l.podcast].compactMap({ $0 }) { v.append(LineBy(rest: r)) }
            }
        } else if let who = l.who {
            if let long = l.byLong {
                if let at = l.at { v.append(LineBy(who: who, rest: long, right: at)) }
                v.append(LineBy(who: who, rest: long))
            }
            if let short = l.byShort { v.append(LineBy(who: who, rest: short)) }
            v.append(LineBy(who: who))
            if let p = l.podcast { v.append(LineBy(rest: p)) }
        } else {
            if let long = l.byLong {
                if let at = l.at { v.append(LineBy(rest: long, right: at)) }
                v.append(LineBy(rest: long))
            }
            for r in [l.byShort, l.podcast].compactMap({ $0 }) { v.append(LineBy(rest: r)) }
            if v.isEmpty, let at = l.at { v.append(LineBy(right: at)) }
        }
        var seen = Set<LineBy>()
        return v.filter { seen.insert($0).inserted }
    }

    private func byText(_ b: LineBy) -> Text {
        let fs = size.byFont
        var t = Text("")
        if let who = b.who {
            t = t + Text(who.uppercased()).font(.system(size: fs * 0.92, weight: .semibold)).kerning(fs * 0.92 * 0.09).foregroundStyle(look.ink)
        }
        if let rest = b.rest {
            let gap = b.who != nil && !rest.hasPrefix(",") ? " " : ""
            t = t + Text(gap + rest).font(.system(size: fs)).foregroundStyle(look.ink2)
        }
        return t
    }

    @ViewBuilder private func byRow(_ l: NovaLine) -> some View {
        let variants = byVariants(l)
        if !variants.isEmpty {
            ViewThatFits(in: .horizontal) {
                ForEach(Array(variants.enumerated()), id: \.offset) { i, b in
                    let last = i == variants.count - 1
                    // the 10 pt gap belongs to the time alone: a stack's spacing
                    // would also charge it against the spacer when there is no time
                    HStack(alignment: .firstTextBaseline, spacing: 0) {
                        if b.who != nil || b.rest != nil {
                            if last { byText(b).lineLimit(1).minimumScaleFactor(0.6) } else { byText(b).lineLimit(1).fixedSize() }
                        }
                        Spacer(minLength: 0)
                        if let r = b.right {
                            Text(r).font(.system(size: size.byFont)).monospacedDigit().foregroundStyle(look.ink3).lineLimit(1).fixedSize()
                                .padding(.leading, b.who != nil || b.rest != nil ? 10 : 0)
                        }
                    }
                }
            }
            .frame(height: size.byFont * 1.2)
            .padding(.top, size.byTop)
        }
    }

    // MARK: the dots

    /// A mark only (mockup 123, round two): the whole front face is the turn
    /// button (NovaLineView), so the dots just say there is a second face.
    private var dots: some View {
        HStack(spacing: 5) {
            Circle().fill(entry.turned ? look.ink3 : look.ink).frame(width: 5, height: 5)
            Circle().fill(entry.turned ? look.ink : look.ink3).frame(width: 5, height: 5)
        }
        .padding(.top, 14)
        .padding(.trailing, 14)
        .frame(width: 52, height: 44, alignment: .topTrailing)
        .accessibilityHidden(true)
    }

    // MARK: lock screen: one tint, so the phrase is in italic

    @ViewBuilder private func lockFace(_ s: CGSize) -> some View {
        let lockLook = LineLook(name: "lock", ink: Color.white.opacity(0.92), ink2: Color.white.opacity(0.62), ink3: Color.white.opacity(0.62),
                                acc: .white, em: Color.white.opacity(0.92), sep: .clear, edge: .clear, light: .clear,
                                emItalic: true, bodyItalic: false, mark: false, bar: 0, pad: 0, ground: [], angle: 0)
        let w = s.width
        let set = { (t: String, em: NSRange?, fs: CGFloat) in
            LineSetter.lines(t, em: em, size: fs, kern: 0, bodyItalic: false, emItalic: true, width: w, balance: false)
        }
        Group {
            if let line = entry.line {
                let label = entry.staleFrom ?? line.who ?? line.podcast
                ViewThatFits(in: .vertical) {
                    ForEach(size.steps, id: \.self) { fs in
                        lockBlock(LineLines(lines: set(line.quote, line.emRange, fs), size: fs, lineHeight: 1.2, kern: 0, look: lockLook), label)
                    }
                    lockBlock(LineLines(lines: set(line.idea, nil, 14), size: 14, lineHeight: 1.2, kern: 0, look: lockLook), label)
                }
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    LineLines(lines: set("No line yet.", nil, 14), size: 14, lineHeight: 1.2, kern: 0, look: lockLook)
                    Text("Open Nova once and he will bring one.").font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.62))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(width: s.width, height: s.height, alignment: .topLeading)
    }

    private func lockBlock(_ lines: LineLines, _ label: String?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            lines
            if let label {
                Text(label.uppercased())
                    .font(.system(size: 10, weight: .semibold))
                    .kerning(0.9)
                    .foregroundStyle(Color.white.opacity(0.62))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(height: 15)
                    .padding(.top, 4)
            }
        }
    }
}

/// The ground: the look's gradient, at the mockup's CSS angle, and the light
/// where the day is.
struct LineGround: View {
    let look: LineLook
    let phase: Int
    var edge = true

    var body: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            let d = w * 0.78
            let p = LineLook.lights[max(0, min(3, phase))]
            let (a, b) = Self.cssPoints(look.angle, w, h)
            ZStack(alignment: .topLeading) {
                LinearGradient(colors: look.ground, startPoint: a, endPoint: b)
                RadialGradient(colors: [look.light, look.light.opacity(0)], center: .center, startRadius: 0, endRadius: d / 2)
                    .frame(width: d, height: d)
                    .offset(x: p.x * d, y: p.y * d)
                    .opacity(p.o)
                if edge { ContainerRelativeShape().strokeBorder(look.edge, lineWidth: 0.5) }
            }
        }
    }

    /// CSS linear-gradient(<deg>) start and end on a w by h box
    static func cssPoints(_ deg: Double, _ w: CGFloat, _ h: CGFloat) -> (UnitPoint, UnitPoint) {
        let r = deg * .pi / 180
        let dx = CGFloat(sin(r)), dy = CGFloat(-cos(r))
        let len = abs(w * dx) + abs(h * dy)
        let ux = dx * len / 2 / max(w, 1), uy = dy * len / 2 / max(h, 1)
        return (UnitPoint(x: 0.5 - ux, y: 0.5 - uy), UnitPoint(x: 0.5 + ux, y: 0.5 + uy))
    }
}

// LINE-HARNESS-END (the Mac render harness compiles everything above, from
// "THE LINE", and nothing below)

struct LineProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> LineEntry { .placeholder() }

    func snapshot(for configuration: NovaLineIntent, in context: Context) async -> LineEntry {
        if context.isPreview, let (p, _) = NovaLineStore.cached(), LinePick.choose(p, on: LineDay.iso(.now)) != nil {
            return make(p, at: .now, configuration.look, LineSize(context.family))
        }
        if context.isPreview { return .placeholder(configuration.look) }
        let (p, _) = await NovaLineStore.load()
        return make(p, at: .now, configuration.look, LineSize(context.family))
    }

    /// One drawing now, one at each remaining time of day, one at midnight.
    /// At midnight the drawing honestly dates yesterday's line and asks for a
    /// reload, which fetches the new day's; a failed fetch retries within the hour.
    func timeline(for configuration: NovaLineIntent, in context: Context) async -> Timeline<LineEntry> {
        let now = Date()
        let (p, reached) = await NovaLineStore.load(now: now)
        let turns = LineDay.turns(after: now)
        let size = LineSize(context.family)
        let entries = ([now] + turns).map { make(p, at: $0, configuration.look, size) }
        let midnight = turns.last ?? now.addingTimeInterval(3600)
        return Timeline(entries: entries, policy: .after(reached ? midnight : min(midnight, now.addingTimeInterval(3600))))
    }

    private func make(_ p: NovaLinePayload?, at date: Date, _ choice: LineLookChoice, _ size: LineSize) -> LineEntry {
        let day = LineDay.iso(date)
        let ph = LineDay.phase(date)
        guard let pick = LinePick.choose(p, on: day) else {
            return LineEntry(date: date, line: nil, phase: ph, look: choice.look(ph))
        }
        // on a day when the line is too long for the small widget, the server
        // sends a shorter one; front and back both use it, and so does the key
        let shown = (size == .small && pick.from == nil ? p?.short : nil) ?? pick.line
        let key = "\(shown.id)|\(day)"
        return LineEntry(date: date, line: shown, staleFrom: pick.from, phase: ph, look: choice.look(ph),
                         turned: NovaLineStore.turned(slot: size.slot, key: key), turnKey: key)
    }
}

extension LineSize {
    init(_ family: WidgetFamily) {
        switch family {
        case .systemSmall: self = .small
        case .systemMedium: self = .medium
        case .accessoryRectangular, .accessoryInline, .accessoryCircular: self = .lock
        default: self = .large
        }
    }
}

struct NovaLineView: View {
    @Environment(\.widgetFamily) var family
    @Environment(\.widgetRenderingMode) var mode
    let entry: LineEntry

    var body: some View {
        let size = LineSize(family)
        // tinted and clear home screens draw in one colour over no ground:
        // the light-on-dark look keeps every weight legible there
        let look = mode == .fullColor ? entry.look : .nova
        let face = LineFace(entry: entry, size: size, look: look)
        // A tap anywhere on the front turns it over; on the back a tap opens
        // the line in Nova, and opening Nova turns it face up again
        // (NovaDeepLink.faceFront, SceneDelegate).
        Group {
            if size != .lock, !entry.turned, let key = entry.turnKey {
                Button(intent: LineTurnIntent(slot: size.slot, key: key)) { face }
                    .buttonStyle(.plain)
                    .accessibilityHint("Turns the line over to the idea behind it")
            } else {
                face
            }
        }
        .containerBackground(for: .widget) {
            if size != .lock { LineGround(look: look, phase: entry.phase) }
        }
        .widgetURL(NovaLink.line)
    }
}

struct NovaLineWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "NovaLine", intent: NovaLineIntent.self, provider: LineProvider()) { entry in
            NovaLineView(entry: entry)
        }
        .configurationDisplayName("The Line")
        .description("One line a day from what you have listened to, in the speaker's own words. Tap it for the idea behind it.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
        .contentMarginsDisabled()
    }
}

// MARK: - END THE LINE

// MARK: - THE LEADER ==========================================================
//
// Two widgets he stacks (his ask, 17 Nov 2026; mockup 123, round two,
// APPROVED: design/mockups/123-the-leader-widget.html). "Lead" is the day's
// general leadership idea, gold, with the two chevrons; a tap anywhere on its
// front turns it over to why it works, and a tap on the back opens Nova on the
// Leader. "Your situation" is the thread at work the Leader is following,
// violet, hidden while the phone is locked; a tap opens Nova on its question,
// ready for his answer. iOS gives a widget taps only: the swipe between them
// is the Smart Stack's.
//
// One read-only payload feeds both: GET /api/widget/leader (server/lib/
// leaderWidget.js). The idea never carries anything about his situation. The
// looks, the light and the type setting are The Line's; the CSS of 123 is the
// contract for every number below.

// MARK: leader data

struct NovaLead: Codable, Equatable {
    var date: String
    var kind: String
    var title: String
    var line: String
    var why: String? = nil
    var src: String? = nil

    enum CodingKeys: String, CodingKey { case date, kind, title, line, why, src }

    init(date: String, kind: String, title: String, line: String, why: String? = nil, src: String? = nil) {
        self.date = date; self.kind = kind; self.title = title; self.line = line; self.why = why; self.src = src
    }

    /// Lenient: a field of the wrong type or only spaces is absent; an idea
    /// without its day, title or line is not an idea.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func s(_ k: CodingKeys) -> String? {
            guard let v = (try? c.decodeIfPresent(String.self, forKey: k)) ?? nil,
                  !v.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
            return v
        }
        guard let date = s(.date), let title = s(.title), let line = s(.line) else {
            throw DecodingError.dataCorrupted(.init(codingPath: c.codingPath, debugDescription: "an idea needs date, title and line"))
        }
        self.init(date: date, kind: s(.kind) ?? "idea", title: title, line: line, why: s(.why), src: s(.src))
    }

    /// one word each (the mockup's KIND)
    var kindLabel: String {
        switch kind { case "action": return "Do today"; case "reminder": return "Remember"; default: return "Try this" }
    }
}

struct NovaSituation: Codable, Equatable {
    var headline: String? = nil
    var question: String? = nil
    var stands: String? = nil
    /// whole days since he last told Nova anything, counted by the Mac's code
    var days: Int? = nil
    var openCount: Int? = nil

    init(headline: String? = nil, question: String? = nil, stands: String? = nil, days: Int? = nil, openCount: Int? = nil) {
        self.headline = headline; self.question = question; self.stands = stands; self.days = days; self.openCount = openCount
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func s(_ k: CodingKeys) -> String? {
            guard let v = (try? c.decodeIfPresent(String.self, forKey: k)) ?? nil,
                  !v.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
            return v
        }
        headline = s(.headline); question = s(.question); stands = s(.stands)
        days = (try? c.decodeIfPresent(Int.self, forKey: .days)) ?? nil
        openCount = (try? c.decodeIfPresent(Int.self, forKey: .openCount)) ?? nil
    }
}

struct NovaLeaderOff: Codable, Equatable {
    var lead: Bool? = nil
    var situation: Bool? = nil
}

struct NovaLeaderPayload: Codable {
    var at: String?
    var date: String?
    var lead: NovaLead?
    var previous: NovaLead?
    var situation: NovaSituation?
    var off: NovaLeaderOff?

    init(at: String? = nil, date: String? = nil, lead: NovaLead? = nil, previous: NovaLead? = nil,
         situation: NovaSituation? = nil, off: NovaLeaderOff? = nil) {
        self.at = at; self.date = date; self.lead = lead; self.previous = previous; self.situation = situation; self.off = off
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        at = (try? c.decodeIfPresent(String.self, forKey: .at)) ?? nil
        date = (try? c.decodeIfPresent(String.self, forKey: .date)) ?? nil
        lead = (try? c.decodeIfPresent(NovaLead.self, forKey: .lead)) ?? nil
        previous = (try? c.decodeIfPresent(NovaLead.self, forKey: .previous)) ?? nil
        situation = (try? c.decodeIfPresent(NovaSituation.self, forKey: .situation)) ?? nil
        off = (try? c.decodeIfPresent(NovaLeaderOff.self, forKey: .off)) ?? nil
    }
}

/// The last good answer, in the App Group under its own keys; the Lead's
/// turned-over flag one per size, as The Line keeps its own.
enum NovaLeaderStore {
    static let key = "nova.leader", atKey = "nova.leaderAt", turnAtKey = "nova.leadTurnAt", turnedPrefix = "nova.leadTurned."

    static func cached() -> (NovaLeaderPayload, Date)? {
        guard let d = NovaShared.defaults, let data = d.data(forKey: key),
              let p = try? JSONDecoder().decode(NovaLeaderPayload.self, from: data) else { return nil }
        return (p, d.object(forKey: atKey) as? Date ?? .distantPast)
    }

    /// (the payload to draw, whether the Mac answered). Right after a turn,
    /// today's kept answer is used as it is, so the idea turns at once.
    static func load(now: Date = .now) async -> (NovaLeaderPayload?, Bool) {
        let d = NovaShared.defaults
        if let (p, _) = cached(), p.date == LineDay.iso(now),
           let tapped = d?.object(forKey: turnAtKey) as? Date, now.timeIntervalSince(tapped) < 20 {
            return (p, true)
        }
        if let d, let base = d.string(forKey: "nova.baseUrl"), let token = d.string(forKey: "nova.token"),
           let url = URL(string: base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/api/widget/leader") {
            var req = URLRequest(url: url, timeoutInterval: 12)
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            if let (data, resp) = try? await URLSession.shared.data(for: req),
               (resp as? HTTPURLResponse)?.statusCode == 200,
               let p = try? JSONDecoder().decode(NovaLeaderPayload.self, from: data) {
                d.set(data, forKey: key)
                d.set(Date(), forKey: atKey)
                return (p, true)
            }
        }
        return (cached()?.0, false)
    }

    static func turned(slot: String, key k: String) -> Bool {
        NovaShared.defaults?.string(forKey: turnedPrefix + slot) == k
    }

    /// Only ever turns it over: the way back is opening Nova from the back,
    /// which clears every turned flag (NovaDeepLink.faceFront), or a new day.
    static func turn(slot: String, key k: String) {
        guard let d = NovaShared.defaults else { return }
        d.set(k, forKey: turnedPrefix + slot)
        d.set(Date(), forKey: turnAtKey)
    }
}

/// Days for the Leader's labels: "Tue 17 Nov", yesterday, and whole days apart.
enum LeadDay {
    static func date(_ iso: String?) -> Date? {
        let p = (iso ?? "").split(separator: "-").compactMap { Int($0) }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = .current
        guard p.count == 3 else { return nil }
        return cal.date(from: DateComponents(year: p[0], month: p[1], day: p[2]))
    }
    static func short(_ iso: String?) -> String? {
        guard let d = date(iso) else { return nil }
        let cal = Calendar(identifier: .gregorian)
        let days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        let c = cal.dateComponents([.weekday, .day, .month], from: d)
        return "\(days[(c.weekday ?? 1) - 1]) \(c.day ?? 0) \(months[max(0, min(11, (c.month ?? 1) - 1))])"
    }
    /// whole days from a to b (b later is positive); nil when either is not a day
    static func apart(_ a: String?, _ b: String?) -> Int? {
        guard let x = date(a), let y = date(b) else { return nil }
        return Calendar(identifier: .gregorian).dateComponents([.day], from: x, to: y).day
    }
    /// "told today", "told yesterday", "told 4 days ago"
    static func told(_ d: Int?) -> String? {
        guard let d, d >= 0 else { return nil }
        return d == 0 ? "told today" : d == 1 ? "told yesterday" : "told \(d) days ago"
    }
}

enum LeadState { case today, early, stale, off, none }

/// What the Lead shows on a day: today's idea; an earlier one, labelled, when
/// today's is not written yet or the Mac was not reached; the switch; nothing.
enum LeadPick {
    static func choose(_ p: NovaLeaderPayload?, reached: Bool, on day: String) -> (lead: NovaLead?, state: LeadState) {
        guard let p else { return (nil, .none) }
        if p.date == day, let l = p.lead { return (l, .today) }
        if p.off?.lead == true { return (nil, .off) }
        if p.date == day {
            if let prev = p.previous { return (prev, .early) }
            return (nil, .none)
        }
        // an answer from an earlier day: the drawing that dates it, or the Mac not reached
        guard let l = p.lead ?? p.previous else { return (nil, .none) }
        return (l, reached ? .early : .stale)
    }
}

// MARK: leader looks (123's tokens: The Line's three, gold for the idea, violet for the situation)

enum LeadHue { case gold, violet }

extension LineLook {
    static func leader(_ base: LineLook, _ hue: LeadHue) -> LineLook {
        let gold = Color(hex: "#e0b26a"), vi = Color(hex: "#8c78ff")
        switch base.name {
        case "ink":
            return LineLook(name: "lead-ink-\(hue)",
                ink: Color(hex: "#f3ecdf"), ink2: Color(hex: "#f3ecdf").opacity(0.64), ink3: Color(hex: "#f3ecdf").opacity(0.42),
                acc: hue == .gold ? Color(hex: "#e0b26a") : Color(hex: "#a493ff"), em: .clear, sep: Color(hex: "#f3ecdf").opacity(0.14),
                edge: Color.white.opacity(0.10), light: (hue == .gold ? gold : vi).opacity(0.16),
                emItalic: false, bodyItalic: false, mark: false, bar: 0, pad: 0,
                ground: [Color(hex: "#15161f"), Color(hex: "#0a0b11")], angle: 160)
        case "paper":
            return LineLook(name: "lead-paper-\(hue)",
                ink: Color(hex: "#1f1c18"), ink2: Color(hex: "#1f1c18").opacity(0.70), ink3: Color(hex: "#1f1c18").opacity(0.50),
                acc: hue == .gold ? Color(hex: "#8a5200") : Color(hex: "#5b45c9"), em: .clear, sep: Color(hex: "#1f1c18").opacity(0.16),
                edge: Color.white.opacity(0.5), light: Color.white.opacity(0.85),
                emItalic: false, bodyItalic: false, mark: false, bar: 0, pad: 0,
                ground: [Color(hex: "#f4eee2"), Color(hex: "#e7decd")], angle: 160)
        default:
            return LineLook(name: "lead-nova-\(hue)",
                ink: Color(hex: "#eef1f8"), ink2: Color(hex: "#eef1f8").opacity(0.68), ink3: Color(hex: "#eef1f8").opacity(0.44),
                acc: hue == .gold ? Color(hex: "#e6bd7a") : Color(hex: "#b3a6ff"), em: .clear, sep: Color(hex: "#eef1f8").opacity(0.14),
                edge: Color.white.opacity(0.09), light: (hue == .gold ? gold : vi).opacity(0.30),
                emItalic: false, bodyItalic: false, mark: false, bar: 0, pad: 0,
                ground: [Color(hex: "#1d2750"), Color(hex: "#10152f")], angle: 135)
        }
    }
}

enum LeaderLookChoice: String, AppEnum {
    case day, nova, ink, paper
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Look"
    static var caseDisplayRepresentations: [LeaderLookChoice: DisplayRepresentation] = [
        .day: DisplayRepresentation(title: "Follows the day", subtitle: "Paper by day, Nova in the evening, Ink at night"),
        .nova: "Nova", .ink: "Ink", .paper: "Paper",
    ]
    /// 123's lookFor: morning and midday Paper, evening Nova, night Ink
    func look(_ phase: Int, _ hue: LeadHue) -> LineLook {
        let base: LineLook
        switch self {
        case .nova: base = .nova
        case .ink: base = .ink
        case .paper: base = .paper
        case .day: base = [LineLook.paper, .paper, .nova, .ink][max(0, min(3, phase))]
        }
        return .leader(base, hue)
    }
}

struct NovaLeaderIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Leader"
    static var description = IntentDescription("Choose the look. Follows the day goes from Paper by day to Ink at night.")
    @Parameter(title: "Look", default: .day) var look: LeaderLookChoice
}

/// A tap anywhere on the Lead's front: turn it over to why it works.
struct LeadTurnIntent: AppIntent {
    static var title: LocalizedStringResource = "Turn the idea over"
    static var isDiscoverable: Bool = false
    @Parameter(title: "Size") var slot: String
    @Parameter(title: "Idea") var key: String
    init() {}
    init(slot: String, key: String) { self.slot = slot; self.key = key }
    func perform() async throws -> some IntentResult {
        NovaLeaderStore.turn(slot: slot, key: key)
        WidgetCenter.shared.reloadTimelines(ofKind: "NovaLead")
        return .result()
    }
}

struct LeadEntry: TimelineEntry {
    let date: Date
    let lead: NovaLead?
    var state: LeadState
    var phase: Int
    var look: LineLook
    /// the day this drawing is for (yyyy-MM-dd), for "Yesterday"
    var day: String
    var turned = false
    /// "<idea day>|<day>"; nil when this drawing has no back
    var turnKey: String? = nil

    static func placeholder(_ choice: LeaderLookChoice = .day, at date: Date = .now) -> LeadEntry {
        let ph = LineDay.phase(date)
        return LeadEntry(date: date, lead: NovaLead(date: LineDay.iso(date), kind: "action", title: "Your idea for the day will sit here.",
                                                    line: "How to do it sits under it.", why: "And why it works on the back."),
                         state: .today, phase: ph, look: choice.look(ph, .gold), day: LineDay.iso(date))
    }
}

struct SituationEntry: TimelineEntry {
    let date: Date
    let situation: NovaSituation?
    /// nothing was ever fetched: say so instead of "nothing open"
    var never = false
    /// days since he told Nova, counted on to this drawing's day
    var days: Int?
    var phase: Int
    var look: LineLook

    static func placeholder(_ choice: LeaderLookChoice = .day, at date: Date = .now) -> SituationEntry {
        let ph = LineDay.phase(date)
        return SituationEntry(date: date, situation: NovaSituation(headline: "Your situation at work will sit here.",
                                                                   question: "The Leader's question about it will sit here."),
                              days: nil, phase: ph, look: choice.look(ph, .violet))
    }
}

// MARK: leader type

/// Text set as the mockup sets it: CoreText finds the breaks with the fonts
/// the views draw with, each line exactly the CSS line height, and a clamped
/// last line ends in an ellipsis (-webkit-line-clamp).
enum LeadType {
    static func lines(_ text: String, _ font: LinePlatformFont, kern: CGFloat, width: CGFloat, balance: Bool) -> [String] {
        let a = NSAttributedString(string: text, attributes: [.font: font, .kern: kern])
        var ranges = LineSetter.breaks(a, width)
        if balance, ranges.count > 1, ranges.count <= 10, let even = LineSetter.balanced(a, width, ranges.count) { ranges = even }
        let ns = text as NSString
        return ranges.map { ns.substring(with: $0).replacingOccurrences(of: "\\s+$", with: "", options: .regularExpression) }
    }

    /// at most n lines; the rest runs into the last, which the view cuts with "…"
    static func clamp(_ lines: [String], _ n: Int) -> (lines: [String], cut: Bool) {
        guard n > 0 else { return ([], !lines.isEmpty) }
        if lines.count <= n { return (lines, false) }
        return (Array(lines.prefix(n - 1)) + [lines[(n - 1)...].joined(separator: " ")], true)
    }

    /// the mockup's first(): up to the first . ! or ? that ends a word
    static func first(_ s: String) -> String {
        guard let re = try? NSRegularExpression(pattern: "^.*?[.!?]['\"\u{201D}\u{2019}]?(?=\\s|$)", options: [.dotMatchesLineSeparators]),
              let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)), let r = Range(m.range, in: s) else { return s }
        return String(s[r])
    }
}

/// A block of set lines.
struct LeadLines: View {
    let lines: [String]
    var cut = false
    let font: Font
    var italic = false
    let kern: CGFloat
    /// the line box, in points (CSS font-size x line-height)
    let box: CGFloat
    let color: Color
    let width: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(lines.enumerated()), id: \.offset) { i, l in
                let t = Text(l).font(font).italic(italic).kerning(kern).foregroundStyle(color).lineLimit(1)
                Group {
                    if cut && i == lines.count - 1 { t.truncationMode(.tail).frame(maxWidth: width, alignment: .leading) }
                    else { t.fixedSize() }
                }
                .frame(height: box)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(lines.joined(separator: " "))
    }
}

/// The Leader's mark: two chevrons (the idea), or "you are here" (the situation).
struct LeadChevrons: Shape {
    func path(in r: CGRect) -> Path {
        let sx = r.width / 13, sy = r.height / 12
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: r.minX + x * sx, y: r.minY + y * sy) }
        var path = Path()
        path.move(to: p(1.5, 5.5)); path.addLine(to: p(6.5, 1.5)); path.addLine(to: p(11.5, 5.5))
        path.move(to: p(1.5, 10.5)); path.addLine(to: p(6.5, 6.5)); path.addLine(to: p(11.5, 10.5))
        return path
    }
}

enum LeadMark { case chevrons, here, none }

struct LeadMarkView: View {
    let mark: LeadMark
    var body: some View {
        switch mark {
        case .chevrons:
            LeadChevrons().stroke(style: StrokeStyle(lineWidth: 1.8, lineCap: .round, lineJoin: .round)).frame(width: 13, height: 12)
        case .here:
            // a 12 by 12 drawing centred in the 13 by 12 box, as the SVG sits
            ZStack {
                Circle().strokeBorder(lineWidth: 1.4).frame(width: 10.6, height: 10.6)
                Circle().frame(width: 3.6, height: 3.6)
            }
            .frame(width: 13, height: 12)
        case .none:
            EmptyView()
        }
    }
}

// MARK: leader faces

/// Every Leader face. `what` picks the widget; the look carries the hue.
struct LeaderFace: View {
    enum What { case lead(LeadEntry), situation(SituationEntry) }
    let what: What
    let size: LineSize
    let look: LineLook
    /// the lock screen's rectangle while the phone is locked, drawn as iOS
    /// redacts it (for the render harness; the widget uses .privacySensitive)
    var redacted = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { g in
            if size == .lock { lock(g.size) } else { home(g.size) }
        }
    }

    private var pad: CGFloat { size == .large ? 20 : 16 }

    @ViewBuilder private func home(_ s: CGSize) -> some View {
        let w = s.width - pad * 2, h = s.height - pad * 2
        ZStack(alignment: .topTrailing) {
            Group {
                switch what {
                case .lead(let e): leadFace(e, w, h)
                case .situation(let e): situationFace(e, w, h)
                }
            }
            .frame(width: w, height: h, alignment: .topLeading)
            .padding(pad)
            .id(faceID)
            .transition(reduceMotion ? .opacity : .asymmetric(insertion: .opacity.combined(with: .offset(y: 12)),
                                                               removal: .opacity.combined(with: .offset(y: -10))))
            if case .lead(let e) = what, size == .medium, e.turnKey != nil { dots(e.turned) }
        }
        .frame(width: s.width, height: s.height)
    }

    private var faceID: String {
        switch what {
        case .lead(let e): return "lead|\(e.lead?.date ?? "-")|\(e.turned)"
        case .situation(let e): return "sit|\(e.situation?.question ?? "-")"
        }
    }

    // MARK: pieces

    /// .kd: the mark, the label in capitals, the day on the right
    private func kicker(_ label: String, day: String? = nil, mark: LeadMark, color: Color? = nil) -> some View {
        HStack(spacing: 7) {
            if mark != .none { LeadMarkView(mark: mark).foregroundStyle(color ?? look.acc).widgetAccentable() }
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold)).kerning(1.1)
                .foregroundStyle(color ?? look.acc).lineLimit(1).fixedSize()
            Spacer(minLength: 0)
            if let day {
                Text(day).font(.system(size: 11, weight: .medium)).kerning(0.66).monospacedDigit()
                    .foregroundStyle(look.ink3).lineLimit(1).fixedSize().padding(.leading, 8)
            }
        }
        .frame(height: day == nil ? 15 : 16.5)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func kickerHeight(_ day: Bool) -> CGFloat { (day ? 16.5 : 15) + 8 }

    /// .tt: the serif at 500, balanced
    private func titleLines(_ t: String, _ fs: CGFloat, _ w: CGFloat) -> [String] {
        LeadType.lines(t, LineFont.serifMedium(fs), kern: titleKern(fs), width: w, balance: true)
    }
    private func titleKern(_ fs: CGFloat) -> CGFloat { (size == .large ? -0.02 : -0.014) * fs }
    private func title(_ lines: [String], cut: Bool, _ fs: CGFloat, _ lh: CGFloat, _ w: CGFloat) -> some View {
        LeadLines(lines: lines, cut: cut, font: .system(size: fs, weight: .medium, design: .serif), kern: titleKern(fs),
                  box: fs * lh, color: look.ink, width: w)
    }

    /// sans text (WebKit fits a hair more than CoreText, as on The Line)
    private func sansLines(_ t: String, _ fs: CGFloat, _ w: CGFloat) -> [String] {
        LeadType.lines(t, LineFont.sans(fs, bold: false), kern: 0, width: w + 1, balance: false)
    }
    private func sans(_ lines: [String], cut: Bool, _ fs: CGFloat, _ lh: CGFloat, _ color: Color, _ w: CGFloat) -> some View {
        LeadLines(lines: lines, cut: cut, font: .system(size: fs), kern: 0, box: fs * lh, color: color, width: w)
    }

    /// .ft: one line at the foot, never wrapped. It is a <p>, so it keeps its
    /// 1em bottom margin under it unless the content above needs that room
    /// (`above`: the height of everything over it, `h`: the face's height).
    private func foot(_ text: String, bold: String? = nil, fs: CGFloat, above: CGFloat, _ h: CGFloat) -> some View {
        var t = Text("")
        if let bold {
            t = t + Text(bold.uppercased()).font(.system(size: fs * 0.92, weight: .semibold)).kerning(fs * 0.92 * 0.09).foregroundStyle(look.ink2)
                + Text(" ")
        }
        t = t + Text(text).font(.system(size: fs)).foregroundStyle(look.ink3)
        return VStack(spacing: 0) {
            t.lineLimit(1).truncationMode(.tail)
                .frame(height: fs * 1.2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 8)
            Color.clear.frame(height: max(0, min(fs, h - above - footHeight(fs))))
        }
    }
    private func footHeight(_ fs: CGFloat) -> CGFloat { fs * 1.2 + 8 }
    /// how far content may run into the bottom padding before a line gives
    /// way (the mockup's own samples run up to 5.2 pt into it)
    private let slack: CGFloat = 6
    private func fit(_ room: CGFloat, _ box: CGFloat) -> Int { max(1, Int((room + slack) / box)) }

    /// .quiet: the serif at 17, for a face with nothing to show
    private func quietLines(_ t: String, _ w: CGFloat, maxH: CGFloat) -> (lines: [String], cut: Bool) {
        LeadType.clamp(LeadType.lines(t, LineFont.serif(17, italic: false), kern: 0, width: w, balance: true), fit(maxH, 17 * 1.2))
    }
    private func quiet(_ q: (lines: [String], cut: Bool), _ w: CGFloat) -> some View {
        LeadLines(lines: q.lines, cut: q.cut, font: .system(size: 17, design: .serif), kern: 0, box: 17 * 1.2, color: look.ink2, width: w)
    }

    /// a face with nothing to show: the label, one serif sentence, the foot
    private func quietFace(_ label: String, mark: LeadMark, _ say: String, foot note: String, _ w: CGFloat, _ h: CGFloat) -> some View {
        let ffs: CGFloat = size == .small ? 10 : 11
        let q = quietLines(say, w, maxH: h - kickerHeight(false) - footHeight(ffs))
        return VStack(alignment: .leading, spacing: 0) {
            kicker(label, mark: mark).padding(.bottom, 8)
            quiet(q, w)
            Spacer(minLength: 0)
            foot(note, fs: ffs, above: kickerHeight(false) + CGFloat(q.lines.count) * 17 * 1.2, h)
        }
    }

    private func dots(_ turned: Bool) -> some View {
        HStack(spacing: 5) {
            Circle().fill(turned ? look.ink3 : look.ink).frame(width: 5, height: 5)
            Circle().fill(turned ? look.ink : look.ink3).frame(width: 5, height: 5)
        }
        .padding(.top, 19)
        .padding(.trailing, 14)
        .frame(width: 52, height: 44, alignment: .topTrailing)
        .accessibilityHidden(true)
    }

    // MARK: the idea

    private func leadLabel(_ e: LeadEntry, _ l: NovaLead) -> String {
        switch e.state {
        case .early:
            if LeadDay.apart(l.date, e.day) == 1 { return "Yesterday" }
            return LeadDay.short(l.date) ?? "Yesterday"
        case .stale: return "\(l.kindLabel) · \(LeadDay.short(l.date) ?? "")"
        default: return l.kindLabel
        }
    }
    private func leadFootNote(_ e: LeadEntry) -> String? {
        switch e.state {
        case .early: return "Today\u{2019}s idea has not been written yet."
        case .stale: return "Mac not reached. The last idea it sent."
        default: return nil
        }
    }

    @ViewBuilder private func leadFace(_ e: LeadEntry, _ w: CGFloat, _ h: CGFloat) -> some View {
        if let l = e.lead {
            if e.turned && size != .large { whyFace(l, w, h) }
            else if size == .small { leadSmall(e, l, w, h) }
            else if size == .large { leadLarge(e, l, w, h) }
            else { leadMedium(e, l, w, h) }
        } else if e.state == .off {
            quietFace("Lead", mark: .chevrons, "The daily idea is switched off in Settings.", foot: "Tap to open Nova", w, h)
        } else {
            quietFace("Lead", mark: .chevrons, "No idea yet.", foot: "Open Nova once and he will bring one.", w, h)
        }
    }

    private func leadSmall(_ e: LeadEntry, _ l: NovaLead, _ w: CGFloat, _ h: CGFloat) -> some View {
        let fs: CGFloat = 18, box: CGFloat = 18 * 1.16
        let note = leadFootNote(e) ?? l.src
        let room = h - kickerHeight(false) - (note == nil ? 0 : footHeight(10))
        let t = LeadType.clamp(titleLines(l.title, fs, w), fit(room, box))
        return VStack(alignment: .leading, spacing: 0) {
            kicker(leadLabel(e, l), mark: .chevrons).padding(.bottom, 8)
            title(t.lines, cut: t.cut, fs, 1.16, w)
            Spacer(minLength: 0)
            if let note { foot(note, fs: 10, above: kickerHeight(false) + CGFloat(t.lines.count) * box, h) }
        }
    }

    private func leadMedium(_ e: LeadEntry, _ l: NovaLead, _ w: CGFloat, _ h: CGFloat) -> some View {
        let fs: CGFloat = 19, box: CGFloat = 19 * 1.14, howBox: CGFloat = 12 * 1.36
        let note = leadFootNote(e)
        let room = h - kickerHeight(false) - (note == nil ? 0 : footHeight(11))
        let t = LeadType.clamp(titleLines(l.title, fs, w), fit(room, box))
        let howRoom = room - CGFloat(t.lines.count) * box - 7
        let howMax = min(note == nil ? 3 : 2, Int((howRoom + slack) / howBox))
        let how = LeadType.clamp(sansLines(LeadType.first(l.line), 12, w), howMax)
        let above = kickerHeight(false) + CGFloat(t.lines.count) * box + (how.lines.isEmpty ? 0 : 7 + CGFloat(how.lines.count) * howBox)
        return VStack(alignment: .leading, spacing: 0) {
            kicker(leadLabel(e, l), mark: .chevrons).padding(.bottom, 8)
            title(t.lines, cut: t.cut, fs, 1.14, w)
            if !how.lines.isEmpty { sans(how.lines, cut: how.cut, 12, 1.36, look.ink2, w).padding(.top, 7) }
            Spacer(minLength: 0)
            if let note { foot(note, fs: 11, above: above, h) }
        }
    }

    private func leadLarge(_ e: LeadEntry, _ l: NovaLead, _ w: CGFloat, _ h: CGFloat) -> some View {
        let fs: CGFloat = 27, box: CGFloat = 27 * 1.1
        let note = leadFootNote(e)
        let footLine = note ?? l.src
        var room = h - kickerHeight(true) - (footLine == nil ? 0 : footHeight(11)) + slack
        let t = LeadType.clamp(titleLines(l.title, fs, w), fit(room - slack, box))
        room -= CGFloat(t.lines.count) * box
        // .sepd: its label is set by `.sepd p` (13px, line-height 1.38), the
        // kicker's own rule loses on specificity
        let whyAll = l.why.map { sansLines($0, 13, w) } ?? []
        let whyBox: CGFloat = 13 * 1.38
        let whyFixed: CGFloat = whyAll.isEmpty ? 0 : 16 + 13 + whyBox + 5
        let howAll = sansLines(l.line, 14, w)
        let howBox: CGFloat = 14 * 1.4
        var whyN = min(4, whyAll.count)
        var howN = min(7, howAll.count)
        // the why keeps its lines first; the line gives way to it
        while howN > 1 && 12 + CGFloat(howN) * howBox + whyFixed + CGFloat(whyN) * whyBox > room { howN -= 1 }
        while whyN > 1 && 12 + CGFloat(howN) * howBox + whyFixed + CGFloat(whyN) * whyBox > room { whyN -= 1 }
        let how = LeadType.clamp(howAll, howN)
        let why = LeadType.clamp(whyAll, whyN)
        let above = kickerHeight(true) + CGFloat(t.lines.count) * box + 12 + CGFloat(how.lines.count) * howBox
            + (why.lines.isEmpty ? 0 : whyFixed + CGFloat(why.lines.count) * whyBox)
        return VStack(alignment: .leading, spacing: 0) {
            kicker(leadLabel(e, l), day: LeadDay.short(l.date), mark: .chevrons).padding(.bottom, 8)
            title(t.lines, cut: t.cut, fs, 1.1, w)
            sans(how.lines, cut: how.cut, 14, 1.4, look.ink2, w).padding(.top, 12)
            if !why.lines.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Why it works".uppercased()).font(.system(size: 13, weight: .semibold)).kerning(1.43)
                        .foregroundStyle(look.ink3).lineLimit(1).frame(height: whyBox).padding(.bottom, 5)
                    sans(why.lines, cut: why.cut, 13, 1.38, look.ink2, w)
                }
                .padding(.top, 13)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .top) { Rectangle().fill(look.sep).frame(height: 0.5) }
                .padding(.top, 16)
            }
            Spacer(minLength: 0)
            if let note { foot(note, fs: 11, above: above, h) } else if let src = l.src { foot(src, bold: "From", fs: 11, above: above, h) }
        }
    }

    /// the back: why it works
    private func whyFace(_ l: NovaLead, _ w: CGFloat, _ h: CGFloat) -> some View {
        let fs: CGFloat = 12.5, box: CGFloat = 12.5 * 1.38
        let ffs: CGFloat = size == .small ? 10 : 11
        let room = h - kickerHeight(false) - footHeight(ffs)
        let why = LeadType.clamp(sansLines(l.why ?? l.line, fs, w), min(5, fit(room, box)))
        return VStack(alignment: .leading, spacing: 0) {
            kicker("Why it works", mark: .chevrons).padding(.bottom, 8)
            sans(why.lines, cut: why.cut, fs, 1.38, look.ink, w)
            Spacer(minLength: 0)
            foot("Tap to open it in Nova", fs: ffs, above: kickerHeight(false) + CGFloat(why.lines.count) * box, h)
        }
    }

    // MARK: the situation

    @ViewBuilder private func situationFace(_ e: SituationEntry, _ w: CGFloat, _ h: CGFloat) -> some View {
        if let s = e.situation {
            switch size {
            case .small: sitSmall(e, s, w, h)
            case .large: sitLarge(e, s, w, h)
            default: sitMedium(e, s, w, h)
            }
        } else if e.never {
            quietFace("Your situation", mark: .here, "Your situation shows here once Nova has it.", foot: "Open Nova once and he will bring it.", w, h)
        } else {
            quietFace("Your situation", mark: .here, "Nothing open at work that you\u{2019}ve told Nova about.",
                      foot: "Tap to tell Nova what\u{2019}s going on", w, h)
        }
    }

    private func sitSmall(_ e: SituationEntry, _ s: NovaSituation, _ w: CGFloat, _ h: CGFloat) -> some View {
        let fs: CGFloat = 18, box: CGFloat = 18 * 1.16
        let since = LeadDay.told(e.days)
        let room = h - kickerHeight(false) - (since == nil ? 0 : footHeight(10))
        let t = LeadType.clamp(titleLines(s.headline ?? openWords(s.openCount), fs, w), fit(room, box))
        return VStack(alignment: .leading, spacing: 0) {
            kicker("Your situation", mark: .here).padding(.bottom, 8)
            title(t.lines, cut: t.cut, fs, 1.16, w)
            Spacer(minLength: 0)
            if let since { foot(since, fs: 10, above: kickerHeight(false) + CGFloat(t.lines.count) * box, h) }
        }
    }

    /// the question in the serif; 123 sets it with text-wrap: pretty, which
    /// WebKit evens out across the lines, so it is balanced here
    private func askLines(_ q: String, _ fs: CGFloat, italic: Bool, kern: CGFloat, _ w: CGFloat) -> [String] {
        LeadType.lines(q, LineFont.serif(fs, italic: italic), kern: kern, width: w, balance: true)
    }

    /// medium: the Leader's one question is the hero
    private func sitMedium(_ e: SituationEntry, _ s: NovaSituation, _ w: CGFloat, _ h: CGFloat) -> some View {
        let fs: CGFloat = 17, lh: CGFloat = 1.22, kern: CGFloat = -0.17
        let room = h - kickerHeight(true)
        let a = LeadType.clamp(askLines(s.question ?? s.headline ?? openWords(s.openCount), fs, italic: false, kern: kern, w),
                               min(4, fit(room, fs * lh)))
        return VStack(alignment: .leading, spacing: 0) {
            kicker("Your situation", day: LeadDay.told(e.days), mark: .here).padding(.bottom, 8)
            LeadLines(lines: a.lines, cut: a.cut, font: .system(size: fs, design: .serif), kern: kern, box: fs * lh, color: look.ink, width: w)
            Spacer(minLength: 0)
        }
    }

    /// large: the thread, where it stands, and the question
    private func sitLarge(_ e: SituationEntry, _ s: NovaSituation, _ w: CGFloat, _ h: CGFloat) -> some View {
        let fs: CGFloat = 27, box: CGFloat = 27 * 1.1
        var room = h - kickerHeight(true) - footHeight(11) + slack
        let t = LeadType.clamp(titleLines(s.headline ?? openWords(s.openCount), fs, w), fit(room - slack, box))
        room -= CGFloat(t.lines.count) * box
        let askAll = s.question.map { askLines($0, 16, italic: true, kern: 0, w) } ?? []
        let askFixed: CGFloat = askAll.isEmpty ? 0 : 12 + 15 + 2
        let stoodAll = s.stands.map { sansLines($0, 13.5, w) } ?? []
        var askN = min(4, askAll.count), stoodN = min(4, stoodAll.count)
        func need(_ a: Int, _ b: Int) -> CGFloat { (b > 0 ? 10 + CGFloat(b) * 13.5 * 1.4 : 0) + askFixed + CGFloat(a) * 16 * 1.3 }
        while stoodN > 0 && need(askN, stoodN) > room { stoodN -= 1 }
        while askN > 1 && need(askN, stoodN) > room { askN -= 1 }
        let stood = LeadType.clamp(stoodAll, stoodN), ask = LeadType.clamp(askAll, askN)
        let above = kickerHeight(true) + CGFloat(t.lines.count) * box + need(ask.lines.count, stood.lines.count)
        return VStack(alignment: .leading, spacing: 0) {
            kicker("Your situation", day: LeadDay.told(e.days), mark: .here).padding(.bottom, 8)
            title(t.lines, cut: t.cut, fs, 1.1, w)
            if !stood.lines.isEmpty { sans(stood.lines, cut: stood.cut, 13.5, 1.4, look.ink2, w).padding(.top, 10) }
            if !ask.lines.isEmpty {
                Text("Nova asks".uppercased()).font(.system(size: 10, weight: .semibold)).kerning(1.1)
                    .foregroundStyle(look.acc).frame(height: 15).padding(.top, 12).padding(.bottom, 2)
                LeadLines(lines: ask.lines, cut: ask.cut, font: .system(size: 16, design: .serif), italic: true, kern: 0,
                          box: 16 * 1.3, color: look.ink, width: w)
            }
            Spacer(minLength: 0)
            foot("Tap to answer, by voice or typing", fs: 11, above: above, h)
        }
    }

    /// when the Leader has not yet written a headline: the count, said plainly
    private func openWords(_ n: Int?) -> String {
        guard let n, n > 0 else { return "Open at work" }
        return n == 1 ? "One thing open at work" : "\(n) things open at work"
    }

    // MARK: lock screen: iOS draws it in one tint

    private func lock(_ s: CGSize) -> some View {
        let fs: CGFloat = 14, box: CGFloat = 14 * 1.2
        var label = "Lead", text: String? = nil, isSituation = false
        switch what {
        case .lead(let e): text = e.lead?.title ?? (e.state == .off ? "The daily idea is switched off." : nil)
        case .situation(let e):
            label = "Your situation"; isSituation = true
            text = e.situation.map { $0.headline ?? openWords($0.openCount) } ?? (e.never ? nil : "Nothing open at work.")
        }
        let n = max(1, Int((s.height - 18) / box))
        let c = LeadType.clamp(LeadType.lines(text ?? "Open Nova once.", LineFont.serif(fs, italic: false), kern: 0, width: s.width, balance: false), n)
        return VStack(alignment: .leading, spacing: 0) {
            Text(label.uppercased()).font(.system(size: 10, weight: .semibold)).kerning(0.9)
                .foregroundStyle(Color.white.opacity(0.62)).lineLimit(1).frame(height: 15).padding(.bottom, 3)
            if redacted && isSituation {
                // what iOS shows in place of privacy-sensitive words while locked
                VStack(alignment: .leading, spacing: 6) {
                    Capsule().fill(Color.white.opacity(0.34)).frame(width: min(150, s.width), height: 10)
                    Capsule().fill(Color.white.opacity(0.34)).frame(width: 96, height: 10)
                }
                .padding(.top, 6)
            } else {
                LeadLines(lines: c.lines, cut: c.cut, font: .system(size: fs, design: .serif), kern: 0, box: box,
                          color: Color.white.opacity(0.92), width: s.width)
                    .privacySensitive(isSituation)
            }
        }
        .frame(width: s.width, height: s.height, alignment: .topLeading)
    }
}

// LEADER-HARNESS-END (the Mac render harness compiles "THE LEADER" up to here)

struct LeadProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> LeadEntry { .placeholder() }

    func snapshot(for configuration: NovaLeaderIntent, in context: Context) async -> LeadEntry {
        if context.isPreview, let (p, _) = NovaLeaderStore.cached(), LeadPick.choose(p, reached: true, on: LineDay.iso(.now)).lead != nil {
            return make(p, reached: true, at: .now, configuration.look, LineSize(context.family))
        }
        if context.isPreview { return .placeholder(configuration.look) }
        let (p, reached) = await NovaLeaderStore.load()
        return make(p, reached: reached, at: .now, configuration.look, LineSize(context.family))
    }

    /// One drawing now, one at each remaining time of day, one at midnight.
    /// Asked again at midnight when today's idea is in; until it is written
    /// (from 06:00 on the Mac), or when the Mac was not reached, within the hour.
    func timeline(for configuration: NovaLeaderIntent, in context: Context) async -> Timeline<LeadEntry> {
        let now = Date()
        let (p, reached) = await NovaLeaderStore.load(now: now)
        let turns = LineDay.turns(after: now)
        let size = LineSize(context.family)
        let entries = ([now] + turns).map { make(p, reached: reached, at: $0, configuration.look, size) }
        let midnight = turns.last ?? now.addingTimeInterval(3600)
        let settled = reached && p?.date == LineDay.iso(now) && (p?.lead != nil || p?.off?.lead == true)
        return Timeline(entries: entries, policy: .after(settled ? midnight : min(midnight, now.addingTimeInterval(3600))))
    }

    private func make(_ p: NovaLeaderPayload?, reached: Bool, at date: Date, _ choice: LeaderLookChoice, _ size: LineSize) -> LeadEntry {
        let day = LineDay.iso(date)
        let ph = LineDay.phase(date)
        let pick = LeadPick.choose(p, reached: reached, on: day)
        var e = LeadEntry(date: date, lead: pick.lead, state: pick.state, phase: ph, look: choice.look(ph, .gold), day: day)
        // only today's idea, drawn plainly, turns over; the large one has no back
        if let l = pick.lead, pick.state == .today, size == .small || size == .medium {
            let key = "\(l.date)|\(day)"
            e.turnKey = key
            e.turned = NovaLeaderStore.turned(slot: size.slot, key: key)
        }
        return e
    }
}

struct SituationProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> SituationEntry { .placeholder() }

    func snapshot(for configuration: NovaLeaderIntent, in context: Context) async -> SituationEntry {
        if context.isPreview, let (p, _) = NovaLeaderStore.cached(), p.situation != nil {
            return make(p, at: .now, configuration.look)
        }
        if context.isPreview { return .placeholder(configuration.look) }
        let (p, _) = await NovaLeaderStore.load()
        return make(p, at: .now, configuration.look)
    }

    /// The same drawings as the Lead's. "Told N days ago" counts on at
    /// midnight from the Mac's number; answering in Nova redraws it at once
    /// (the app reloads every widget when it syncs).
    func timeline(for configuration: NovaLeaderIntent, in context: Context) async -> Timeline<SituationEntry> {
        let now = Date()
        let (p, reached) = await NovaLeaderStore.load(now: now)
        let turns = LineDay.turns(after: now)
        let entries = ([now] + turns).map { make(p, at: $0, configuration.look) }
        let midnight = turns.last ?? now.addingTimeInterval(3600)
        return Timeline(entries: entries, policy: .after(reached ? midnight : min(midnight, now.addingTimeInterval(3600))))
    }

    private func make(_ p: NovaLeaderPayload?, at date: Date, _ choice: LeaderLookChoice) -> SituationEntry {
        let ph = LineDay.phase(date)
        var days = p?.situation?.days
        if let d = days, let gap = LeadDay.apart(p?.date, LineDay.iso(date)), gap > 0 { days = d + gap }
        return SituationEntry(date: date, situation: p?.situation, never: p == nil, days: days, phase: ph, look: choice.look(ph, .violet))
    }
}

struct NovaLeadView: View {
    @Environment(\.widgetFamily) var family
    @Environment(\.widgetRenderingMode) var mode
    let entry: LeadEntry

    var body: some View {
        let size = LineSize(family)
        let look = mode == .fullColor ? entry.look : .leader(.nova, .gold)
        let face = LeaderFace(what: .lead(entry), size: size, look: look)
        // a tap anywhere on the front turns it over; on the back (and on the
        // large one, which has no back) a tap opens Nova on the idea, and
        // opening Nova turns it face up again (NovaDeepLink.faceFront)
        Group {
            if let key = entry.turnKey, !entry.turned {
                Button(intent: LeadTurnIntent(slot: size.slot, key: key)) { face }
                    .buttonStyle(.plain)
                    .accessibilityHint("Turns the idea over to why it works")
            } else {
                face
            }
        }
        .containerBackground(for: .widget) {
            if size != .lock { LineGround(look: look, phase: entry.phase) }
        }
        .widgetURL(entry.lead == nil ? NovaLink.leader : NovaLink.lead)
    }
}

struct NovaSituationView: View {
    @Environment(\.widgetFamily) var family
    @Environment(\.widgetRenderingMode) var mode
    let entry: SituationEntry

    var body: some View {
        let size = LineSize(family)
        let look = mode == .fullColor ? entry.look : .leader(.nova, .violet)
        LeaderFace(what: .situation(entry), size: size, look: look)
            // his work, so hidden whenever the phone is locked, in every size
            .privacySensitive()
            .containerBackground(for: .widget) {
                if size != .lock { LineGround(look: look, phase: entry.phase) }
            }
            .widgetURL(entry.situation == nil ? NovaLink.leader : NovaLink.situation)
    }
}

struct NovaLeadWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "NovaLead", intent: NovaLeaderIntent.self, provider: LeadProvider()) { entry in
            NovaLeadView(entry: entry)
        }
        .configurationDisplayName("Lead")
        .description("The Leader's idea for today. Tap it for why it works. Stack it with Your situation.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
        .contentMarginsDisabled()
    }
}

struct NovaSituationWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "NovaSituation", intent: NovaLeaderIntent.self, provider: SituationProvider()) { entry in
            NovaSituationView(entry: entry)
        }
        .configurationDisplayName("Your situation")
        .description("What is going on at work, and the Leader's question about it. Hidden while your phone is locked.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
        .contentMarginsDisabled()
    }
}

// MARK: - END THE LEADER
