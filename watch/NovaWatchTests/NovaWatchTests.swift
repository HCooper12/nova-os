import Foundation
import Testing
@testable import Nova

// The pure parts: decoding every wrist-door payload (nulls and leading
// whitespace included), "left today", the offline queue, portion stepping.

private func data(_ s: String) -> Data { Data(s.utf8) }

@Suite("Decoding the door's payloads")
struct DecodingTests {
    @Test func `today, the contract's own example`() throws {
        let json = """
        {"at":"2026-11-17T01:19:55.448Z","date":"2026-11-17","protein":{"value":2,"goal":166},"kcal":{"value":198,"goal":2210},"steps":{"value":3222,"goal":10000},"stepsAt":"2026-11-17T01:00:00Z","hrv":{"value":63.4,"date":"2026-11-16","lo":55.9,"hi":83.3,"verdict":"strained"},"session":"Pull A","usuals":[{"key":"rice cakes with banana and honey|serving","name":"Rice cakes with banana and honey","macros":{"p":2,"c":45,"f":1,"kcal":198},"count":17,"lastDate":"2026-11-17"}]}
        """
        let t = try DoorJSON.decode(Today.self, from: data(json))
        #expect(t.protein == Metric(value: 2, goal: 166))
        #expect(t.hrv?.value == 63.4)
        #expect(t.session == "Pull A")
        #expect(t.usuals?.first?.macros?.kcal == 198)
        #expect(t.protein?.left == 164)
    }

    @Test func `today with every number unknown`() throws {
        let json = """
        {"at":null,"date":"2026-11-17","protein":{"value":null,"goal":166},"kcal":{"value":198,"goal":null},"steps":null,"hrv":null,"session":null,"usuals":null,"usualsError":"The food log could not be read."}
        """
        let t = try DoorJSON.decode(Today.self, from: data(json))
        #expect(t.protein?.value == nil)
        #expect(t.protein?.left == nil)
        #expect(t.kcal?.left == nil)
        #expect(t.kcal?.progress == nil)
        #expect(t.steps == nil)
        #expect(t.hrv == nil)
        #expect(t.usuals == nil)
        #expect(t.usualsError == "The food log could not be read.")
    }

    @Test func `leading whitespace before a slow answer`() throws {
        let r = try DoorJSON.decode(AskReply.self, from: data("  \n\n \t {\"text\":\"Forty-eight grams.\",\"heard\":\"How much protein?\"}"))
        #expect(r.text == "Forty-eight grams.")
        #expect(r.heard == "How much protein?")
        #expect(r.pending == false)
        #expect(r.acted == false)
    }

    @Test func `ask reply with pending and acted in any shape`() throws {
        let r = try DoorJSON.decode(AskReply.self, from: data(#"{"text":"On it.","pending":{"id":"x"},"acted":[{"kind":"food"}],"error":null}"#))
        #expect(r.pending)
        #expect(r.acted)
        let r2 = try DoorJSON.decode(AskReply.self, from: data(#"{"text":null,"error":"The Mac could not answer."}"#))
        #expect(r2.text == nil)
        #expect(r2.error == "The Mac could not answer.")
    }

    @Test func `food log, undo and estimate`() throws {
        let log = try DoorJSON.decode(FoodLogResult.self, from: data(#"{"entry":{"id":"e1","name":"Tuna wrap","macros":{"p":34,"c":null,"f":null,"kcal":430}},"date":"2026-11-17","protein":{"value":36,"goal":166},"kcal":{"value":628,"goal":null}}"#))
        #expect(log.entry.id == "e1")
        #expect(log.kcal?.goal == nil)
        let undo = try DoorJSON.decode(UndoResult.self, from: data(#"{"removed":true,"protein":{"value":2,"goal":166},"kcal":{"value":198,"goal":2210}}"#))
        #expect(undo.removed == true)
        let est = try DoorJSON.decode(Estimate.self, from: data(#"{"estimateId":"est1","heard":"Two eggs on toast and a long black","name":"Eggs on toast","lines":[{"name":"2 eggs","kcal":148},{"name":"Toast, 2 slices","kcal":190},{"name":"Long black","kcal":4}],"macros":{"p":19,"c":30,"f":11,"kcal":342}}"#))
        #expect(est.lines.count == 3)
        #expect(est.total(dropping: []).kcal == 342)
        #expect(est.total(dropping: []).protein == 19)
        #expect(est.total(dropping: [2]).kcal == 338)
        #expect(est.total(dropping: [2]).protein == nil) // never guessed per line
    }

    @Test func `pairing and errors`() throws {
        let s = try DoorJSON.decode(PairStart.self, from: data(#"{"pairingId":"p1","code":"482913","secret":"s","expiresAt":"2026-11-17T02:00:00Z"}"#))
        #expect(s.code == "482913")
        let pending = try DoorJSON.decode(PairClaim.self, from: data(#"{"pending":true}"#))
        #expect(pending.token == nil)
        let done = try DoorJSON.decode(PairClaim.self, from: data(#"{"token":"t","deviceId":"d","name":"Apple Watch"}"#))
        #expect(done.token == "t")
        let e = try DoorJSON.decode(ErrorBody.self, from: data(#"{"error":"Pairing is closed. Open it from Nova on your phone or Mac first."}"#))
        #expect(DoorError.server(status: 403, message: e.error, retryAfter: nil).sentence == e.error)
    }
}

@Suite("Numbers on the watch")
struct NumberTests {
    @Test(arguments: [
        (Metric(value: 76, goal: 172), 96.0),
        (Metric(value: 200, goal: 172), 0.0),   // never below zero
        (Metric(value: 0, goal: 2600), 2600.0),
    ])
    func `left today is goal minus value`(m: Metric, left: Double) {
        #expect(m.left == left)
    }

    @Test func `left today needs both numbers`() {
        #expect(Metric(value: nil, goal: 172).left == nil)
        #expect(Metric(value: 76, goal: nil).left == nil)
        #expect(Metric(value: 5, goal: 0).progress == nil)
    }

    @Test func `formatting as the mockup writes it`() {
        #expect(Fmt.int(1420) == "1,420")
        #expect(Fmt.compact(3200) == "3.2k")
        #expect(Fmt.compact(10000) == "10k")
        #expect(Fmt.macrosLine(Macros(p: 48, c: nil, f: nil, kcal: 610)) == "610 kcal · 48 g")
        #expect(Fmt.macrosLine(Macros(p: nil, c: nil, f: nil, kcal: nil)) == nil)
    }

    @Test func `portion steps a quarter at a time between a quarter and four`() {
        #expect(Portion.stepped(1, by: 2) == 1.5)
        #expect(Portion.stepped(1, by: -10) == 0.25)
        #expect(Portion.stepped(3.75, by: 3) == 4)
        #expect(Portion.clamp(1.3) == 1.25)
        #expect(Portion.label(1.5) == "1.5")
        #expect(Portion.label(1) == "1")
        #expect(Portion.label(0.25) == "0.25")
        #expect(Macros(p: 48, c: nil, f: nil, kcal: 610).scaled(1.5) == Macros(p: 72, c: nil, f: nil, kcal: 915))
    }

    @Test func `idempotency keys are valid`() {
        #expect(IdempotencyKey.isValid(IdempotencyKey.make()))
        #expect(!IdempotencyKey.isValid("short"))
        #expect(!IdempotencyKey.isValid("has a space in it"))
    }
}

@Suite("The offline queue")
struct QueueTests {
    let url: URL

    init() {
        url = FileManager.default.temporaryDirectory.appending(path: "queue-\(UUID().uuidString).json")
    }

    private func write(_ n: String) -> PendingWrite {
        PendingWrite(idempotencyKey: "key-\(n)-0000", kind: .usual(key: n, times: 1), name: n, macros: nil, keptAt: .now)
    }

    private func result(_ id: String) -> FoodLogResult {
        FoodLogResult(entry: LoggedEntry(id: id, name: nil, macros: nil), date: nil, protein: nil, kcal: nil)
    }

    @Test func `kept writes survive a relaunch`() {
        OfflineQueue(url: url).enqueue(write("a"))
        OfflineQueue(url: url).enqueue(write("b"))
        let again = OfflineQueue(url: url) // a new instance reads the file
        #expect(again.items.map(\.name) == ["a", "b"])
    }

    @Test func `the same key is kept once`() {
        let q = OfflineQueue(url: url)
        q.enqueue(write("a"))
        q.enqueue(write("a"))
        #expect(q.items.count == 1)
    }

    @Test func `drains oldest first with each write's own key`() async {
        let q = OfflineQueue(url: url)
        for n in ["a", "b", "c"] { q.enqueue(write(n)) }
        var sent: [String] = []
        let out = await q.drain { w throws(DoorError) in sent.append(w.idempotencyKey); return result(w.name) }
        #expect(sent == ["key-a-0000", "key-b-0000", "key-c-0000"])
        #expect(out.count == 3)
        #expect(q.items.isEmpty)
    }

    @Test func `stops while the Mac is away and retries with the same key`() async {
        let q = OfflineQueue(url: url)
        q.enqueue(write("a"))
        q.enqueue(write("b"))
        var keys: [String] = []
        let first = await q.drain { w throws(DoorError) in keys.append(w.idempotencyKey); throw .unreachable }
        #expect(first == [.stillAway])
        #expect(q.items.count == 2) // nothing lost, order kept
        _ = await q.drain { w throws(DoorError) in keys.append(w.idempotencyKey); return result(w.name) }
        #expect(keys == ["key-a-0000", "key-a-0000", "key-b-0000"])
        #expect(q.items.isEmpty)
    }

    @Test func `drops a write the Mac says is gone (404)`() async {
        let q = OfflineQueue(url: url)
        q.enqueue(write("a"))
        q.enqueue(write("b"))
        let out = await q.drain { w throws(DoorError) in
            if w.name == "a" { throw .server(status: 404, message: "That food is no longer in your recent log.", retryAfter: nil) }
            return result(w.name)
        }
        #expect(out.first == .gone("That food is no longer in your recent log."))
        #expect(q.items.isEmpty)
    }

    @Test func `a revoked watch keeps its writes`() async {
        let q = OfflineQueue(url: url)
        q.enqueue(write("a"))
        let out = await q.drain { _ throws(DoorError) in throw .revoked }
        #expect(out == [.revoked])
        #expect(q.items.count == 1)
    }
}
