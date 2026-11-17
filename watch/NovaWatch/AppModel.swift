import Foundation
import Observation
import SwiftUI
import WidgetKit

/// The talk loop, as the mockup's script runs it: rest, listening, thinking,
/// speaking, done (the held after-state), then rest again.
enum TalkPhase: Equatable {
    case rest
    case listening
    case thinking(heard: String?)
    case speaking(heard: String?, text: String, lit: Int)
    case done(text: String)
    case failed(String)          // the server's sentence (or a plain fact), held like done
    case unreachable(lastSeen: Date?)

    var core: CoreState {
        switch self {
        case .listening: CoreState(listening: true)
        case .thinking: CoreState(thinking: true)
        case .speaking: CoreState(speaking: true)
        default: .rest
        }
    }

    var isRest: Bool { if case .rest = self { true } else { false } }
}

/// The optional panel that rises in the talk hero (the mockup's protein panel).
struct TalkPanel: Equatable {
    var number: String
    var unit: String
    var label: String
    var progress: Double
}

enum Route: Hashable {
    case estimate
    case portion(Usual)
    case kept
}

/// One usual's row on Fuel.
enum RowState: Equatable {
    case idle
    case sending
    case undo(entryId: String, date: String?, until: Date)
    case done
    case said(String)    // the server's sentence, shown in the row for a moment
}

@MainActor
@Observable
final class AppModel {
    var paired: Bool
    var today: Today?
    var todayLoading = false
    var lastSeen: Date? = SnapshotStore.lastSeen()
    var kept: [PendingWrite] = []
    var path: [Route] = []
    var page = 0

    // pairing
    var pairing: PairStart?
    var pairSentence: String?
    var pairBusy = false

    // talk
    var talk: TalkPhase = .rest
    var talkLevel: Double = 0
    var panel: TalkPanel?

    // fuel
    var rows: [String: RowState] = [:]

    // estimate
    enum EstimatePhase: Equatable {
        case recording
        case waiting
        case ready(Estimate, dropped: Set<Int>)
        case logging(Estimate, dropped: Set<Int>)
        case failed(String)
    }
    var estimate: EstimatePhase = .recording

    /// true when the screen is drawing a proof fixture (no network at all)
    let isFixture: Bool

    @ObservationIgnored let queue = OfflineQueue()
    @ObservationIgnored private let recorder = Recorder()
    @ObservationIgnored private let speaker = Speaker()
    @ObservationIgnored private var talkTask: Task<Void, Never>?
    @ObservationIgnored private var levelTask: Task<Void, Never>?
    @ObservationIgnored private var pairTask: Task<Void, Never>?

    init(fixture: Bool = false) {
        isFixture = fixture
        paired = fixture ? true : TokenStore.read() != nil
        if !fixture {
            today = SnapshotStore.read()?.today
            kept = queue.items
        }
    }

    private var door: DoorClient { DoorClient(token: TokenStore.read()) }

    // MARK: arriving

    func becameActive() {
        guard !isFixture else { return }
        if paired {
            Task {
                await refresh()
                #if DEBUG
                // proof runs only: act as a tap would, against the scratch server
                switch UserDefaults.standard.string(forKey: "novaAction") {
                case "log-first": if let u = today?.usuals?.first { page = 1; tapUsual(u) }
                case "fuel": page = 1
                default: break
                }
                #endif
            }
        } else if pairing == nil {
            startPairing()
        }
    }

    func refresh() async {
        guard !isFixture, paired else { return }
        todayLoading = today == nil
        defer { todayLoading = false }
        do {
            let t = try await door.today()
            seen()
            today = t
            SnapshotStore.write(Snapshot(today: t, fetchedAt: .now))
            WidgetCenter.shared.reloadAllTimelines()
            await drain()
        } catch {
            handle(error)
        }
    }

    private func seen() {
        lastSeen = .now
        SnapshotStore.markSeen()
    }

    private func handle(_ e: DoorError) {
        if e == .revoked { unpair() }
    }

    private func unpair() {
        TokenStore.clear()
        SnapshotStore.clear()
        paired = false
        today = nil
        path = []
        talk = .rest
        startPairing()
        WidgetCenter.shared.reloadAllTimelines()
    }

    // MARK: pairing

    func startPairing() {
        guard !isFixture else { return }
        pairTask?.cancel()
        pairSentence = nil
        pairing = nil
        pairBusy = true
        pairTask = Task {
            defer { pairBusy = false }
            let client = DoorClient(token: nil)
            do {
                let p = try await client.pairStart(name: "Apple Watch")
                pairing = p
                pairBusy = false
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(2))
                    let c = try await client.pairClaim(p)
                    if let token = c.token {
                        TokenStore.save(token)
                        paired = true
                        pairing = nil
                        seen()
                        await refresh()
                        return
                    }
                }
            } catch let raw {
                let error = (raw as? DoorError) ?? .badReply
                pairing = nil
                pairSentence = error.sentence
            }
        }
    }

    // MARK: talk

    func tapTalk() {
        switch talk {
        case .rest, .done, .failed, .unreachable: startListening()
        case .listening: finishListening()
        case .thinking, .speaking: break
        }
    }

    private func startListening() {
        guard !isFixture else { return }
        talkTask?.cancel()
        speaker.stop()
        panel = nil
        talkTask = Task {
            guard await Recorder.permission() else {
                talk = .failed("Nova needs the microphone. Allow it in Settings on the watch.")
                return
            }
            do { try recorder.start() } catch {
                talk = .failed("The watch could not start recording.")
                return
            }
            withAnimation(.smooth(duration: 0.4)) { talk = .listening }
            // he stops when you stop: 1.4 s of quiet after speech, or 30 s
            var heardVoice = false
            var quietSince: Date?
            let started = Date()
            while !Task.isCancelled, recorder.isRecording {
                try? await Task.sleep(for: .milliseconds(60))
                let l = recorder.level
                talkLevel = l
                if l > 0.35 { heardVoice = true; quietSince = nil } else if heardVoice {
                    quietSince = quietSince ?? .now
                    if let q = quietSince, Date().timeIntervalSince(q) > 1.4 { break }
                }
                if Date().timeIntervalSince(started) > 30 { break }
            }
            if !Task.isCancelled { finishListening() }
        }
    }

    private func finishListening() {
        talkTask?.cancel()
        talkLevel = 0
        guard let audio = recorder.stop() else {
            withAnimation(.smooth(duration: 0.4)) { talk = .rest }
            return
        }
        withAnimation(.smooth(duration: 0.4)) { talk = .thinking(heard: nil) }
        talkTask = Task {
            do {
                let reply = try await door.ask(audio: audio)
                seen()
                if let err = reply.error, reply.text == nil {
                    withAnimation(.smooth(duration: 0.4)) { talk = .failed(err) }
                    return
                }
                let heard = reply.heard?.trimmingCharacters(in: .whitespacesAndNewlines)
                // The Mac hears the whole recording at once, so what it heard
                // arrives with the answer: show it, then speak.
                if let heard, !heard.isEmpty {
                    withAnimation(.smooth(duration: 0.35)) { talk = .thinking(heard: heard) }
                    try? await Task.sleep(for: .milliseconds(900))
                }
                let text = reply.text ?? ""
                speak(text, heard: heard)
                Task { await door.handoff(kind: "talk", title: heard ?? text) }
                await refresh()
            } catch let raw {
                let error = (raw as? DoorError) ?? .badReply
                switch error {
                case .unreachable:
                    withAnimation(.smooth(duration: 0.4)) { talk = .unreachable(lastSeen: lastSeen) }
                case .revoked: unpair()
                default:
                    withAnimation(.smooth(duration: 0.4)) { talk = .failed(error.sentence) }
                }
            }
        }
    }

    private func speak(_ text: String, heard: String?) {
        guard !text.isEmpty else { talk = .done(text: ""); return }
        withAnimation(.smooth(duration: 0.3)) { talk = .speaking(heard: heard, text: text, lit: 0) }
        speaker.speak(text, onWord: { [weak self] i in
            guard let self, case let .speaking(h, t, lit) = self.talk else { return }
            withAnimation(.easeOut(duration: 0.3)) { self.talk = .speaking(heard: h, text: t, lit: max(lit, i + 1)) }
        }, onDone: { [weak self] in
            guard let self else { return }
            withAnimation(.smooth(duration: 0.3)) { self.talk = .done(text: text) }
            self.talkTask = Task {
                try? await Task.sleep(for: .milliseconds(3600))
                guard !Task.isCancelled else { return }
                withAnimation(.smooth(duration: 0.6)) { self.panel = nil; self.talk = .rest }
            }
        })
    }

    // MARK: fuel

    func tapUsual(_ u: Usual) {
        switch rows[u.key] ?? .idle {
        case .idle, .done, .said: log(u, times: 1)
        case let .undo(id, date, _): undo(u, entryId: id, date: date)
        case .sending: break
        }
    }

    func log(_ u: Usual, times: Double) {
        guard !isFixture else { return }
        let key = IdempotencyKey.make()
        rows[u.key] = .sending
        Task {
            do {
                let r = try await door.logFood(key: u.key, times: times, idempotencyKey: key)
                seen()
                applyLog(r)
                let until = Date().addingTimeInterval(5)
                withAnimation(.snappy) { rows[u.key] = .undo(entryId: r.entry.id, date: r.date, until: until) }
                Task { await door.handoff(kind: "fuel", title: r.entry.name ?? u.name) }
                try? await Task.sleep(for: .seconds(5))
                if case .undo(r.entry.id, _, _) = rows[u.key] {
                    withAnimation(.snappy) { rows[u.key] = .done }
                }
            } catch let raw {
                let error = (raw as? DoorError) ?? .badReply
                rows[u.key] = .idle
                switch error {
                case .unreachable, .server(status: 0, _, _):
                    keep(PendingWrite(idempotencyKey: key, kind: .usual(key: u.key, times: times), name: u.name, macros: u.macros?.scaled(times), keptAt: .now))
                case .revoked: unpair()
                default:
                    rows[u.key] = .said(error.sentence)
                    try? await Task.sleep(for: .seconds(4))
                    if case .said = rows[u.key] { rows[u.key] = .idle }
                }
            }
        }
    }

    private func undo(_ u: Usual, entryId: String, date: String?) {
        rows[u.key] = .sending
        Task {
            do {
                let r = try await door.undoFood(id: entryId, date: date)
                seen()
                withAnimation(.smooth(duration: 0.55)) {
                    if let p = r.protein { today?.protein = p }
                    if let k = r.kcal { today?.kcal = k }
                    rows[u.key] = .idle
                }
                persistToday()
            } catch let raw {
                let error = (raw as? DoorError) ?? .badReply
                if error == .revoked { unpair(); return }
                rows[u.key] = .said(error.sentence)
            }
        }
    }

    private func applyLog(_ r: FoodLogResult) {
        withAnimation(.smooth(duration: 0.55)) {
            if let p = r.protein { today?.protein = p }
            if let k = r.kcal { today?.kcal = k }
        }
        persistToday()
    }

    private func persistToday() {
        guard let today else { return }
        SnapshotStore.write(Snapshot(today: today, fetchedAt: .now))
        WidgetCenter.shared.reloadAllTimelines()
    }

    private func keep(_ w: PendingWrite) {
        queue.enqueue(w)
        kept = queue.items
        path.append(.kept)
    }

    /// Sends what was kept on the watch, oldest first, each with its own key.
    func drain() async {
        guard !isFixture, !queue.items.isEmpty else { kept = queue.items; return }
        let client = door
        let outcomes = await queue.drain { w throws(DoorError) in try await client.send(w) }
        for o in outcomes {
            switch o {
            case let .sent(r): seen(); applyLog(r)
            case .revoked: unpair()
            default: break
            }
        }
        withAnimation(.smooth) { kept = queue.items }
    }

    // MARK: estimate ("Say it")

    func startEstimate() {
        guard !isFixture else { return }
        path.append(.estimate)
        estimate = .recording
        talkTask?.cancel()
        talkTask = Task {
            guard await Recorder.permission() else { estimate = .failed("Nova needs the microphone. Allow it in Settings on the watch."); return }
            do { try recorder.start() } catch { estimate = .failed("The watch could not start recording."); return }
            var heardVoice = false
            var quietSince: Date?
            let started = Date()
            while !Task.isCancelled, recorder.isRecording {
                try? await Task.sleep(for: .milliseconds(60))
                let l = recorder.level
                talkLevel = l
                if l > 0.35 { heardVoice = true; quietSince = nil } else if heardVoice {
                    quietSince = quietSince ?? .now
                    if let q = quietSince, Date().timeIntervalSince(q) > 1.4 { break }
                }
                if Date().timeIntervalSince(started) > 30 { break }
            }
            if !Task.isCancelled { finishEstimateRecording() }
        }
    }

    func finishEstimateRecording() {
        talkTask?.cancel()
        talkLevel = 0
        guard let audio = recorder.stop() else { estimate = .failed("Nothing was recorded."); return }
        withAnimation(.smooth) { estimate = .waiting }
        talkTask = Task {
            do {
                let e = try await door.estimate(audio: audio)
                seen()
                withAnimation(.smooth) { estimate = .ready(e, dropped: []) }
            } catch let raw {
                let error = (raw as? DoorError) ?? .badReply
                if error == .revoked { unpair(); return }
                estimate = .failed(error.sentence)
            }
        }
    }

    func toggleLine(_ i: Int) {
        guard case let .ready(e, dropped) = estimate else { return }
        var d = dropped
        if d.contains(i) { d.remove(i) } else if d.count < e.lines.count - 1 { d.insert(i) }
        withAnimation(.snappy) { estimate = .ready(e, dropped: d) }
    }

    func logEstimate() {
        guard case let .ready(e, dropped) = estimate, !isFixture else { return }
        let key = IdempotencyKey.make()
        let drop = dropped.sorted()
        estimate = .logging(e, dropped: dropped)
        Task {
            do {
                let r = try await door.logEstimate(id: e.estimateId, drop: drop, idempotencyKey: key)
                seen()
                applyLog(r)
                Task { await door.handoff(kind: "fuel", title: r.entry.name ?? e.name ?? "Meal") }
                path.removeAll { $0 == .estimate }
            } catch let raw {
                let error = (raw as? DoorError) ?? .badReply
                switch error {
                case .unreachable, .server(status: 0, _, _):
                    path.removeAll { $0 == .estimate }
                    let total = e.total(dropping: dropped)
                    keep(PendingWrite(idempotencyKey: key, kind: .estimate(id: e.estimateId, drop: drop), name: e.name ?? e.heard ?? "Meal",
                                      macros: Macros(p: total.protein, c: nil, f: nil, kcal: total.kcal), keptAt: .now))
                case .revoked: unpair()
                default: estimate = .failed(error.sentence)
                }
            }
        }
    }

    func cancelEstimate() {
        talkTask?.cancel()
        recorder.cancel()
        talkLevel = 0
        path.removeAll { $0 == .estimate }
    }
}
