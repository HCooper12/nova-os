import Foundation
import Capacitor
import HealthKit
import WidgetKit

/// Nova reads Apple Health itself (his call, 14 Oct 2026: "so that all of the
/// data is as accurate all the time as possible"). Replaces the "Nova Health
/// Today" Shortcut, which could not read Health with the phone locked and,
/// summing raw samples, either missed Watch-only steps (Source = iPhone) or
/// counted shared walks twice (no Source filter).
///
/// JavaScript side: src/healthSync.js (a no-op outside this shell).
///
///   NovaHealth.isAvailable()          -> { available }
///   NovaHealth.requestAccess()        -> { requested }   (iOS shows its sheet once)
///   NovaHealth.readDay({ date })      -> { date, metrics }
///
/// `metrics` uses the server's own names (server/lib/healthData.js KNOWN):
/// steps, activeEnergyKcal, walkingRunningDistanceKm (cumulative, de-duplicated
/// across iPhone and Watch exactly as the Health app shows them),
/// restingHeartRate, hrv (the day's average SDNN, ms), vo2Max, weightKg (the
/// latest reading on or before the day), sleepAsleepMinutes (the night that
/// ENDED that morning, overlapping stages from both devices merged). A metric
/// with no data that day is left out, never sent as zero.
@objc(NovaHealthPlugin)
public class NovaHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NovaHealthPlugin"
    public let jsName = "NovaHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readDay", returnType: CAPPluginReturnPromise),
    ]

    private let store = NovaHealthReader.shared.store

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAccess(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { return call.reject("Health is not available on this device") }
        // iOS never says which types he allowed (privacy): a refused type
        // simply reads as no data, which the server already handles honestly
        store.requestAuthorization(toShare: nil, read: NovaHealthReader.readTypes) { ok, error in
            if let error { return call.reject(error.localizedDescription) }
            NovaHealthBackground.shared.start() // access may be new: begin watching now
            call.resolve(["requested": ok])
        }
    }

    @objc func readDay(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { return call.reject("Health is not available on this device") }
        guard let dateStr = call.getString("date"), let day = Self.parse(dateStr) else {
            return call.reject("readDay needs date as YYYY-MM-DD")
        }
        Task {
            let m = await NovaHealthReader.shared.metrics(for: day)
            call.resolve(["date": dateStr, "metrics": m])
        }
    }

    private static func parse(_ s: String) -> Date? {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: s)
    }
}

/// One reader of Apple Health for every caller: the page on screen
/// (NovaHealth.readDay) and the background wake (NovaHealthBackground), so the
/// two can never disagree about a day.
final class NovaHealthReader {
    static let shared = NovaHealthReader()
    let store = HKHealthStore()

    static var readTypes: Set<HKObjectType> {
        var s = Set<HKObjectType>()
        for id in [HKQuantityTypeIdentifier.stepCount, .activeEnergyBurned, .distanceWalkingRunning,
                   .restingHeartRate, .heartRateVariabilitySDNN, .vo2Max, .bodyMass] {
            if let t = HKObjectType.quantityType(forIdentifier: id) { s.insert(t) }
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { s.insert(sleep) }
        return s
    }

    /// The day's metrics in the server's own names; a metric with no data is
    /// left out, never sent as zero.
    func metrics(for day: Date) async -> [String: Any] {
        let cal = Calendar.current
        let start = cal.startOfDay(for: day)
        let end = cal.date(byAdding: .day, value: 1, to: start)!
        var m: [String: Any] = [:]
        if let v = await sum(.stepCount, .count(), start, end) { m["steps"] = Int(v.rounded()) }
        if let v = await sum(.activeEnergyBurned, .kilocalorie(), start, end) { m["activeEnergyKcal"] = Self.round1(v) }
        if let v = await sum(.distanceWalkingRunning, .meterUnit(with: .kilo), start, end) { m["walkingRunningDistanceKm"] = Self.round2(v) }
        if let v = await average(.heartRateVariabilitySDNN, .secondUnit(with: .milli), start, end) { m["hrv"] = Self.round1(v) }
        if let v = await latest(.restingHeartRate, HKUnit.count().unitDivided(by: .minute()), start, end) { m["restingHeartRate"] = Int(v.rounded()) }
        if let v = await latest(.vo2Max, HKUnit(from: "ml/kg*min"), start, end) { m["vo2Max"] = Self.round1(v) }
        // weight carries forward: the latest reading up to the day's end
        if let v = await latest(.bodyMass, .gramUnit(with: .kilo), cal.date(byAdding: .day, value: -60, to: start)!, end) { m["weightKg"] = Self.round1(v) }
        // last night: 6 pm the evening before to noon of this day
        let nightStart = cal.date(byAdding: .hour, value: -6, to: start)!
        let nightEnd = cal.date(byAdding: .hour, value: 12, to: start)!
        if let mins = await asleepMinutes(nightStart, nightEnd), mins > 0 { m["sleepAsleepMinutes"] = Int(mins.rounded()) }
        return m
    }

    // MARK: - queries

    /// HKStatisticsQuery's cumulative sum de-duplicates overlapping samples
    /// from different sources by Health's own source priority: the number the
    /// Health app shows, which is the figure he checks against.
    private func sum(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit, _ start: Date, _ end: Date) async -> Double? {
        await stat(id, .cumulativeSum, start, end) { $0.sumQuantity()?.doubleValue(for: unit) }
    }

    private func average(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit, _ start: Date, _ end: Date) async -> Double? {
        await stat(id, .discreteAverage, start, end) { $0.averageQuantity()?.doubleValue(for: unit) }
    }

    private func latest(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit, _ start: Date, _ end: Date) async -> Double? {
        await stat(id, .mostRecent, start, end) { $0.mostRecentQuantity()?.doubleValue(for: unit) }
    }

    private func stat(_ id: HKQuantityTypeIdentifier, _ options: HKStatisticsOptions, _ start: Date, _ end: Date,
                      _ pick: @escaping (HKStatistics) -> Double?) async -> Double? {
        guard let type = HKQuantityType.quantityType(forIdentifier: id) else { return nil }
        let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        return await withCheckedContinuation { cont in
            let q = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: pred, options: options) { _, stats, _ in
                cont.resume(returning: stats.flatMap(pick))
            }
            store.execute(q)
        }
    }

    /// Asleep time with the Watch's and the iPhone's records merged: the
    /// union of every asleep interval, so an hour both recorded counts once.
    private func asleepMinutes(_ start: Date, _ end: Date) async -> Double? {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return nil }
        let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let samples: [HKCategorySample] = await withCheckedContinuation { cont in
            let q = HKSampleQuery(sampleType: type, predicate: pred, limit: HKObjectQueryNoLimit,
                                  sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, s, _ in
                cont.resume(returning: (s as? [HKCategorySample]) ?? [])
            }
            store.execute(q)
        }
        let asleep: Set<Int> = Self.asleepValues
        let spans = samples.filter { asleep.contains($0.value) }
            .map { (max($0.startDate, start), min($0.endDate, end)) }
            .filter { $0.0 < $0.1 }
            .sorted { $0.0 < $1.0 }
        guard !spans.isEmpty else { return nil }
        var total: TimeInterval = 0
        var cur = spans[0]
        for s in spans.dropFirst() {
            if s.0 <= cur.1 { cur.1 = max(cur.1, s.1) } else { total += cur.1.timeIntervalSince(cur.0); cur = s }
        }
        total += cur.1.timeIntervalSince(cur.0)
        return total / 60
    }

    private static var asleepValues: Set<Int> {
        var v: Set<Int> = [HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue]
        if #available(iOS 16.0, *) {
            v.formUnion([HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                         HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                         HKCategoryValueSleepAnalysis.asleepREM.rawValue])
        }
        return v
    }

    // MARK: - helpers

    private static func round1(_ v: Double) -> Double { (v * 10).rounded() / 10 }
    private static func round2(_ v: Double) -> Double { (v * 100).rounded() / 100 }
}

/// THE WIDGETS GO STALE BETWEEN OPENS (his note, 15 Oct 2026: "the steps on the
/// widget do not seem to update much until after I have gone into nova or into
/// the Health app"). The widgets ask the Mac, and the Mac only heard from
/// Health while Nova was open. HealthKit background delivery wakes the app
/// when steps, distance or active energy change; it reads today, posts it the
/// same way the page does (POST /api/health-data, source healthkit), and asks
/// the widgets to redraw. No model is involved: numbers in, numbers out.
///
/// iOS decides the cadence (hourly at best for steps) and can't read Health
/// while the phone is locked, so updates land while it is unlocked.
final class NovaHealthBackground {
    static let shared = NovaHealthBackground()
    private var started = false
    private var inFlight = false
    private let watched: [HKQuantityTypeIdentifier] = [.stepCount, .distanceWalkingRunning, .activeEnergyBurned]

    /// Called at every launch (a background wake IS a launch) and after access is asked.
    func start() {
        guard HKHealthStore.isHealthDataAvailable(), !started else { return }
        started = true
        let store = NovaHealthReader.shared.store
        for id in watched {
            guard let type = HKObjectType.quantityType(forIdentifier: id) else { continue }
            let q = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, done, error in
                guard error == nil, let self else { done(); return }
                Task { await self.push(); done() }
            }
            store.execute(q)
            store.enableBackgroundDelivery(for: type, frequency: .hourly) { _, _ in }
        }
    }

    private func push() async {
        if inFlight { return } // three types can fire together: one push serves them
        inFlight = true
        defer { inFlight = false }
        guard let shared = UserDefaults(suiteName: NovaWidgetsPlugin.suite),
              let base = shared.string(forKey: "nova.baseUrl"), let token = shared.string(forKey: "nova.token"),
              let url = URL(string: base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/api/health-data") else { return }
        let now = Date()
        let metrics = await NovaHealthReader.shared.metrics(for: now)
        guard !metrics.isEmpty else { return } // locked, or nothing yet: say nothing rather than zero
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        var req = URLRequest(url: url, timeoutInterval: 20)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["date": f.string(from: now), "metrics": metrics, "source": "healthkit", "via": "background"])
        if let (_, res) = try? await URLSession.shared.data(for: req), (res as? HTTPURLResponse)?.statusCode == 200 {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}
