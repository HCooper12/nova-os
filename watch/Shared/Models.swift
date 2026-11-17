import Foundation

// The wrist door's payloads. Every number the Mac might not know is
// optional: nil means unknown, and an unknown number is never drawn as 0.

struct Metric: Codable, Equatable, Sendable {
    var value: Double?
    var goal: Double?

    /// Goal minus value, not below zero; nil unless both are known.
    var left: Double? {
        guard let value, let goal else { return nil }
        return max(0, goal - value)
    }

    /// Value over goal for a ring, clamped to 0...1; nil unless both are known and the goal is above zero.
    var progress: Double? {
        guard let value, let goal, goal > 0 else { return nil }
        return min(1, max(0, value / goal))
    }
}

struct Macros: Codable, Hashable, Sendable {
    var p: Double?
    var c: Double?
    var f: Double?
    var kcal: Double?

    func scaled(_ times: Double) -> Macros {
        Macros(p: p.map { $0 * times }, c: c.map { $0 * times }, f: f.map { $0 * times }, kcal: kcal.map { $0 * times })
    }
}

struct Usual: Codable, Hashable, Sendable, Identifiable {
    var key: String
    var name: String
    var macros: Macros?
    var count: Int?
    var lastDate: String?
    var id: String { key }
}

struct HRV: Codable, Equatable, Sendable {
    var value: Double?
    var date: String?
    var lo: Double?
    var hi: Double?
    var verdict: String?
}

struct Today: Codable, Equatable, Sendable {
    var at: String?
    var date: String?
    var protein: Metric?
    var kcal: Metric?
    var steps: Metric?
    var stepsAt: String?
    var hrv: HRV?
    var session: String?
    var usuals: [Usual]?
    var usualsError: String?
}

struct LoggedEntry: Codable, Equatable, Sendable {
    var id: String
    var name: String?
    var macros: Macros?
}

/// POST /wrist/food and POST /wrist/food/estimate/:id/log
struct FoodLogResult: Codable, Equatable, Sendable {
    var entry: LoggedEntry
    var date: String?
    var protein: Metric?
    var kcal: Metric?
}

/// POST /wrist/food/:id/undo
struct UndoResult: Codable, Equatable, Sendable {
    var removed: Bool?
    var protein: Metric?
    var kcal: Metric?
}

struct EstimateLine: Codable, Equatable, Sendable {
    var name: String
    var kcal: Double?
}

/// POST /wrist/food/estimate
struct Estimate: Codable, Equatable, Sendable {
    var estimateId: String
    var heard: String?
    var name: String?
    var lines: [EstimateLine]
    var macros: Macros?

    /// The total after the dropped lines are taken out. Energy follows the
    /// lines; protein is only known for the whole plate, so once a line is
    /// dropped protein is unknown (never guessed).
    func total(dropping dropped: Set<Int>) -> (kcal: Double?, protein: Double?) {
        if dropped.isEmpty { return (macros?.kcal ?? lineSum(dropped), macros?.p) }
        return (lineSum(dropped), nil)
    }

    private func lineSum(_ dropped: Set<Int>) -> Double? {
        var sum = 0.0
        for (i, line) in lines.enumerated() where !dropped.contains(i) {
            guard let k = line.kcal else { return nil }
            sum += k
        }
        return sum
    }
}

/// POST /wrist/ask and /wrist/ask/audio. `pending` and `acted` are read
/// leniently: their shape is the server's, and the watch only needs to know
/// they are there.
struct AskReply: Decodable, Equatable, Sendable {
    var text: String?
    var heard: String?
    var pending: Bool
    var acted: Bool
    var error: String?

    enum CodingKeys: String, CodingKey { case text, heard, pending, acted, error }

    init(text: String?, heard: String?, pending: Bool = false, acted: Bool = false, error: String? = nil) {
        self.text = text; self.heard = heard; self.pending = pending; self.acted = acted; self.error = error
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        text = try c.decodeIfPresent(String.self, forKey: .text)
        heard = try c.decodeIfPresent(String.self, forKey: .heard)
        error = try c.decodeIfPresent(String.self, forKey: .error)
        pending = Self.present(c, .pending)
        acted = Self.present(c, .acted)
    }

    private static func present(_ c: KeyedDecodingContainer<CodingKeys>, _ k: CodingKeys) -> Bool {
        if let b = try? c.decodeIfPresent(Bool.self, forKey: k) { return b }
        guard c.contains(k), (try? c.decodeNil(forKey: k)) == false else { return false }
        return true // an object, array, string or number: it is there
    }
}

struct PairStart: Codable, Equatable, Sendable {
    var pairingId: String
    var code: String
    var secret: String
    var expiresAt: String?
}

struct PairClaim: Codable, Equatable, Sendable {
    var pending: Bool?
    var token: String?
    var deviceId: String?
    var name: String?
}

struct ErrorBody: Codable, Sendable {
    var error: String
}

enum DoorJSON {
    /// Slow answers can arrive with whitespace before the JSON (the server
    /// writes keep-alive bytes while it thinks); trim it before decoding.
    static func trimmed(_ data: Data) -> Data {
        guard let i = data.firstIndex(where: { !($0 == 0x20 || $0 == 0x0a || $0 == 0x0d || $0 == 0x09) }) else { return Data() }
        return data[i...]
    }

    static func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        try JSONDecoder().decode(T.self, from: trimmed(data))
    }
}

/// How the numbers are written on the watch, as the mockup writes them.
enum Fmt {
    /// "1,420" (en-AU grouping), rounded
    static func int(_ v: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "en_AU")
        f.maximumFractionDigits = 0
        return f.string(from: NSNumber(value: v.rounded())) ?? String(Int(v.rounded()))
    }

    /// "3.2k" for a complication
    static func compact(_ v: Double) -> String {
        if v >= 1000 {
            let k = (v / 100).rounded() / 10
            return k == k.rounded() ? "\(Int(k))k" : String(format: "%.1fk", k)
        }
        return String(Int(v.rounded()))
    }

    /// "610 kcal · 48 g": only the parts that are known
    static func macrosLine(_ m: Macros?) -> String? {
        var parts: [String] = []
        if let k = m?.kcal { parts.append("\(int(k)) kcal") }
        if let p = m?.p { parts.append("\(int(p)) g") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// "1:52 pm"
    static func clock(_ d: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_AU")
        f.dateFormat = "h:mm a"
        return f.string(from: d).lowercased()
    }
}

/// The Digital Crown portion: a quarter serve at a time, from a quarter to four.
enum Portion {
    static let min = 0.25
    static let max = 4.0
    static let step = 0.25

    static func clamp(_ v: Double) -> Double {
        let snapped = (v / step).rounded() * step
        return Swift.min(max, Swift.max(min, snapped))
    }

    static func stepped(_ v: Double, by clicks: Int) -> Double { clamp(v + Double(clicks) * step) }

    /// "1.5", "1", "0.25"
    static func label(_ v: Double) -> String {
        var s = String(format: "%.2f", v)
        while s.hasSuffix("0") { s.removeLast() }
        if s.hasSuffix(".") { s.removeLast() }
        return s
    }
}
