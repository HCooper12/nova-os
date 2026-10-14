import Foundation
import Capacitor
import HealthKit

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

    private let store = HKHealthStore()

    private var readTypes: Set<HKObjectType> {
        var s = Set<HKObjectType>()
        for id in [HKQuantityTypeIdentifier.stepCount, .activeEnergyBurned, .distanceWalkingRunning,
                   .restingHeartRate, .heartRateVariabilitySDNN, .vo2Max, .bodyMass] {
            if let t = HKObjectType.quantityType(forIdentifier: id) { s.insert(t) }
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { s.insert(sleep) }
        return s
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAccess(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { return call.reject("Health is not available on this device") }
        // iOS never says which types he allowed (privacy): a refused type
        // simply reads as no data, which the server already handles honestly
        store.requestAuthorization(toShare: nil, read: readTypes) { ok, error in
            if let error { return call.reject(error.localizedDescription) }
            call.resolve(["requested": ok])
        }
    }

    @objc func readDay(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { return call.reject("Health is not available on this device") }
        guard let dateStr = call.getString("date"), let day = Self.parse(dateStr) else {
            return call.reject("readDay needs date as YYYY-MM-DD")
        }
        let cal = Calendar.current
        let start = cal.startOfDay(for: day)
        let end = cal.date(byAdding: .day, value: 1, to: start)!
        Task {
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
            call.resolve(["date": dateStr, "metrics": m])
        }
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

    private static func parse(_ s: String) -> Date? {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: s)
    }
    private static func round1(_ v: Double) -> Double { (v * 10).rounded() / 10 }
    private static func round2(_ v: Double) -> Double { (v * 100).rounded() / 100 }
}
