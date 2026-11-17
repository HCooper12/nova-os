import Foundation

/// What the app last heard from /wrist/today, written into the App Group so
/// the complications and Smart Stack can draw without a request.
struct Snapshot: Codable, Equatable, Sendable {
    var today: Today
    var fetchedAt: Date
}

enum SnapshotStore {
    static var url: URL { DoorConfig.sharedDirectory.appending(path: "today-snapshot.json") }
    static var lastSeenURL: URL { DoorConfig.sharedDirectory.appending(path: "last-seen.json") }

    static func read(from url: URL = url) -> Snapshot? {
        guard let d = try? Data(contentsOf: url) else { return nil }
        let dec = JSONDecoder(); dec.dateDecodingStrategy = .iso8601
        return try? dec.decode(Snapshot.self, from: d)
    }

    static func write(_ s: Snapshot, to url: URL = url) {
        let enc = JSONEncoder(); enc.dateEncodingStrategy = .iso8601
        try? enc.encode(s).write(to: url, options: .atomic)
    }

    /// The time of the last call the Mac answered (any endpoint).
    static func lastSeen() -> Date? {
        guard let d = try? Data(contentsOf: lastSeenURL), let t = try? JSONDecoder().decode(Double.self, from: d) else { return nil }
        return Date(timeIntervalSince1970: t)
    }

    static func markSeen(_ date: Date = .now) {
        try? JSONEncoder().encode(date.timeIntervalSince1970).write(to: lastSeenURL, options: .atomic)
    }

    static func clear() {
        try? FileManager.default.removeItem(at: url)
    }
}

/// A write kept on the watch because the Mac could not be reached. It keeps
/// the Idempotency-Key it was first sent with, so sending it again can never
/// log it twice.
struct PendingWrite: Codable, Equatable, Sendable, Identifiable {
    enum Kind: Codable, Equatable, Sendable {
        case usual(key: String, times: Double)
        case estimate(id: String, drop: [Int])
    }
    var id: String { idempotencyKey }
    var idempotencyKey: String
    var kind: Kind
    var name: String
    var macros: Macros?
    var keptAt: Date
}

/// The durable queue: a JSON file in the App Group container, read and
/// written whole (it holds a handful of entries at most).
final class OfflineQueue: @unchecked Sendable {
    // @unchecked: every access to the file goes through `lock`.
    let url: URL
    private let lock = NSLock()

    init(url: URL = DoorConfig.sharedDirectory.appending(path: "offline-queue.json")) {
        self.url = url
    }

    var items: [PendingWrite] {
        lock.lock(); defer { lock.unlock() }
        return load()
    }

    func enqueue(_ w: PendingWrite) {
        lock.lock(); defer { lock.unlock() }
        var all = load()
        guard !all.contains(where: { $0.idempotencyKey == w.idempotencyKey }) else { return }
        all.append(w)
        save(all)
    }

    func remove(_ key: String) {
        lock.lock(); defer { lock.unlock() }
        save(load().filter { $0.idempotencyKey != key })
    }

    enum Outcome: Sendable, Equatable {
        case sent(FoodLogResult)
        case gone(String)          // 404 (or another refusal): the Mac will never take it; dropped
        case stillAway             // unreachable: stop and keep the rest
        case revoked
    }

    /// Sends the kept writes oldest first, each with its own key. Stops at
    /// the first that cannot reach the Mac so order is kept.
    func drain(_ send: (PendingWrite) async throws(DoorError) -> FoodLogResult) async -> [Outcome] {
        var out: [Outcome] = []
        for w in items {
            do {
                let r = try await send(w)
                remove(w.idempotencyKey)
                out.append(.sent(r))
            } catch {
                switch error {
                case .unreachable, .server(status: 0, _, _), .server(status: 429, _, _):
                    out.append(.stillAway); return out
                case .revoked:
                    out.append(.revoked); return out
                case let .server(_, message, _):
                    remove(w.idempotencyKey)
                    out.append(.gone(message ?? "The Mac refused \(w.name)."))
                case .badReply:
                    // the Mac answered; the key makes a later retry safe, so keep it
                    out.append(.stillAway); return out
                }
            }
        }
        return out
    }

    private func load() -> [PendingWrite] {
        guard let d = try? Data(contentsOf: url) else { return [] }
        let dec = JSONDecoder(); dec.dateDecodingStrategy = .iso8601
        return (try? dec.decode([PendingWrite].self, from: d)) ?? []
    }

    private func save(_ all: [PendingWrite]) {
        let enc = JSONEncoder(); enc.dateEncodingStrategy = .iso8601
        try? enc.encode(all).write(to: url, options: .atomic)
    }
}

extension DoorClient {
    /// Sends one kept write with its original key.
    func send(_ w: PendingWrite) async throws(DoorError) -> FoodLogResult {
        switch w.kind {
        case let .usual(key, times): return try await logFood(key: key, times: times, idempotencyKey: w.idempotencyKey)
        case let .estimate(id, drop): return try await logEstimate(id: id, drop: drop, idempotencyKey: w.idempotencyKey)
        }
    }
}
