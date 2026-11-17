import Foundation
import Security

/// Build configuration surfaced through Info.plist (never typed on the watch).
enum DoorConfig {
    static var baseURL: URL {
        #if DEBUG
        // proof runs only: point at a dead port to photograph the offline screens
        if let o = UserDefaults.standard.string(forKey: "novaDoorURL"), let u = URL(string: o) { return u }
        #endif
        let s = Bundle.main.object(forInfoDictionaryKey: "NovaDoorURL") as? String ?? ""
        return URL(string: s) ?? URL(string: "http://127.0.0.1:4195")!
    }
    static var appGroup: String {
        Bundle.main.object(forInfoDictionaryKey: "NovaAppGroup") as? String ?? "group.com.haydencooper.novaos.watch"
    }
    static var keychainGroup: String? {
        guard let s = Bundle.main.object(forInfoDictionaryKey: "NovaKeychainGroup") as? String,
              !s.hasPrefix("$(") else { return nil }
        return s
    }
    /// The App Group container (the snapshot and the offline queue live here
    /// so the widgets read and add to the same ones). Falls back to the app's
    /// own Application Support when the group is not provisioned.
    static var sharedDirectory: URL {
        if let u = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) { return u }
        let u = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }
}

/// The watch token, in the Keychain, readable after first unlock and shared
/// with the widget extension through one access group.
enum TokenStore {
    private static let service = "com.haydencooper.novaos.watch.door"
    private static let account = "watch-token"

    private static func base() -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        if let g = DoorConfig.keychainGroup { q[kSecAttrAccessGroup as String] = g }
        return q
    }

    static func read() -> String? {
        var q = base()
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }

    @discardableResult
    static func save(_ token: String) -> Bool {
        clear()
        var q = base()
        q[kSecValueData as String] = Data(token.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(q as CFDictionary, nil) == errSecSuccess
    }

    static func clear() {
        SecItemDelete(base() as CFDictionary)
    }
}

/// Why a call did not give an answer. `unreachable` means the Mac did not
/// answer at all (and /wrist/health agrees); everything else carries the
/// server's own sentence when it sent one.
enum DoorError: Error, Equatable, Sendable {
    case unreachable
    case revoked                       // 401: the watch was unpaired
    case server(status: Int, message: String?, retryAfter: Int?)
    case badReply

    /// The sentence to show: the server's, or a plain statement of what is known.
    var sentence: String {
        switch self {
        case .unreachable: return "I can't reach the Mac."
        case .revoked: return "This watch is no longer paired."
        case let .server(status, message, _):
            return message ?? "The Mac answered with an error (\(status))."
        case .badReply: return "The Mac's answer could not be read."
        }
    }
}

/// A valid Idempotency-Key: 8-80 of [A-Za-z0-9._:-]. A UUID is one.
enum IdempotencyKey {
    static func make() -> String { UUID().uuidString }
    static func isValid(_ k: String) -> Bool {
        (8...80).contains(k.count) && k.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || "._:-".contains($0)) }
    }
}

/// The wrist door client. Every call but health and pairing sends the token;
/// every write sends an Idempotency-Key the caller keeps for retries.
struct DoorClient: Sendable {
    var base: URL = DoorConfig.baseURL
    var token: String?
    var session: URLSession = .shared

    /// Talk can take minutes on a slow answer; nothing shorter than 180 s.
    static let askTimeout: TimeInterval = 240
    static let defaultTimeout: TimeInterval = 30
    static let estimateTimeout: TimeInterval = 90

    // MARK: endpoints

    func health() async -> Bool {
        var r = URLRequest(url: base.appending(path: "wrist/health"))
        r.timeoutInterval = 6
        guard let (d, resp) = try? await session.data(for: r), (resp as? HTTPURLResponse)?.statusCode == 200 else { return false }
        struct OK: Decodable { var ok: Bool? }
        return (try? DoorJSON.decode(OK.self, from: d))?.ok == true
    }

    func pairStart(name: String) async throws(DoorError) -> PairStart {
        try await send("wrist/pair/start", json: ["name": name], auth: false)
    }

    func pairClaim(_ p: PairStart) async throws(DoorError) -> PairClaim {
        try await send("wrist/pair/claim", json: ["pairingId": p.pairingId, "secret": p.secret], auth: false)
    }

    func today() async throws(DoorError) -> Today {
        try await send("wrist/today", method: "GET")
    }

    func logFood(key: String, times: Double, idempotencyKey: String) async throws(DoorError) -> FoodLogResult {
        var body: [String: Any] = ["key": key]
        if times != 1 { body["times"] = times }
        return try await send("wrist/food", json: body, idempotencyKey: idempotencyKey)
    }

    func undoFood(id: String, date: String?) async throws(DoorError) -> UndoResult {
        var body: [String: Any] = [:]
        if let date { body["date"] = date }
        let safe = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? id
        return try await send("wrist/food/\(safe)/undo", json: body, idempotencyKey: IdempotencyKey.make())
    }

    func estimate(audio: Data) async throws(DoorError) -> Estimate {
        try await send("wrist/food/estimate", body: audio, contentType: "audio/mp4", timeout: Self.estimateTimeout)
    }

    func estimate(text: String) async throws(DoorError) -> Estimate {
        try await send("wrist/food/estimate", json: ["text": text], timeout: Self.estimateTimeout)
    }

    func logEstimate(id: String, drop: [Int], idempotencyKey: String) async throws(DoorError) -> FoodLogResult {
        var body: [String: Any] = [:]
        if !drop.isEmpty { body["drop"] = drop }
        return try await send("wrist/food/estimate/\(id)/log", json: body, idempotencyKey: idempotencyKey)
    }

    func ask(question: String) async throws(DoorError) -> AskReply {
        try await send("wrist/ask", json: ["question": question], timeout: Self.askTimeout)
    }

    func ask(audio: Data) async throws(DoorError) -> AskReply {
        try await send("wrist/ask/audio", body: audio, contentType: "audio/mp4", timeout: Self.askTimeout)
    }

    /// Fire and forget: a handoff that fails is silent.
    func handoff(kind: String, title: String) async {
        let _: Ignored? = try? await send("wrist/handoff", json: ["kind": kind, "title": title], timeout: 10)
    }

    private struct Ignored: Decodable {}

    // MARK: transport

    private func send<T: Decodable>(_ path: String, method: String = "POST", json: [String: Any]? = nil, body: Data? = nil,
                                    contentType: String? = nil, auth: Bool = true, idempotencyKey: String? = nil,
                                    timeout: TimeInterval = defaultTimeout) async throws(DoorError) -> T {
        var r = URLRequest(url: base.appending(path: path))
        r.httpMethod = method
        r.timeoutInterval = timeout
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if let json {
            r.httpBody = try? JSONSerialization.data(withJSONObject: json)
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        } else if let body {
            r.httpBody = body
            r.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }
        if auth {
            guard let token else { throw .revoked }
            r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let idempotencyKey { r.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key") }

        let data: Data, resp: URLResponse
        do {
            (data, resp) = try await session.data(for: r)
        } catch {
            throw await classify(error)
        }
        guard let http = resp as? HTTPURLResponse else { throw .badReply }
        if http.statusCode == 401 { throw .revoked }
        guard (200..<300).contains(http.statusCode) else {
            let msg = (try? DoorJSON.decode(ErrorBody.self, from: data))?.error
            let retry = http.value(forHTTPHeaderField: "Retry-After").flatMap { Int($0) }
            throw .server(status: http.statusCode, message: msg, retryAfter: retry)
        }
        do { return try DoorJSON.decode(T.self, from: data) } catch { throw .badReply }
    }

    /// A transport failure is "unreachable" only when health agrees; a
    /// timeout on a Mac that answers health is reported as what it was.
    private func classify(_ error: Error) async -> DoorError {
        let code = (error as? URLError)?.code
        if code == .timedOut, await health() {
            return .server(status: 0, message: "The Mac took too long to answer.", retryAfter: nil)
        }
        return .unreachable
    }
}
