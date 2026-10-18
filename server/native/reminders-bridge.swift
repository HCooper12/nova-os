// THE REMINDERS BRIDGE (19 Oct 2026). His ask: Nova's shopping list and the
// Reminders list Siri calls "Shopping" are one list, both ways. iCloud CalDAV
// only shows the legacy "Reminders ⚠️" placeholders since Apple's upgrade, so
// the only door to his real lists is EventKit on this Mac.
//
// A dumb pipe on purpose: it reads one list and applies the operations it is
// handed, and answers in JSON. Every decision (what changed, which side wins,
// what is undoable) lives in server/lib/remindersShop.js, where it is tested.
//
//   nova-reminders access               ask for (or report) Reminders access
//   nova-reminders lists                every reminders list: id, title
//   nova-reminders read <title>         the list's reminders
//   nova-reminders apply <title>        ops as JSON on stdin:
//     [{ "op": "add", "ref": "x", "title": "…", "notes": "…", "done": false },
//      { "op": "set", "id": "…", "title": "…", "notes": "…", "done": true },
//      { "op": "remove", "id": "…" }]
import EventKit
import Foundation

let store = EKEventStore()

func out(_ value: Any) {
  let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}
func fail(_ message: String, code: Int32 = 1) -> Never {
  out(["error": message])
  exit(code)
}

let iso = ISO8601DateFormatter()
iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

func access() -> Bool {
  let status = EKEventStore.authorizationStatus(for: .reminder)
  if status == .fullAccess { return true }
  if status == .denied || status == .restricted { return false }
  let sem = DispatchSemaphore(value: 0)
  var granted = false
  store.requestFullAccessToReminders { ok, _ in granted = ok; sem.signal() }
  sem.wait()
  return granted
}

func list(named title: String) -> EKCalendar {
  let want = title.lowercased()
  let cals = store.calendars(for: .reminder)
  guard let cal = cals.first(where: { $0.title.lowercased() == want }) else {
    fail("no Reminders list called \(title)", code: 3)
  }
  return cal
}

func row(_ r: EKReminder) -> [String: Any] {
  return [
    "id": r.calendarItemIdentifier,
    "title": r.title ?? "",
    "notes": r.notes ?? "",
    "done": r.isCompleted,
    "modified": r.lastModifiedDate.map { iso.string(from: $0) } ?? NSNull(),
    "created": r.creationDate.map { iso.string(from: $0) } ?? NSNull(),
  ]
}

func reminders(in cal: EKCalendar) -> [EKReminder] {
  let sem = DispatchSemaphore(value: 0)
  var found: [EKReminder] = []
  store.fetchReminders(matching: store.predicateForReminders(in: [cal])) { rs in found = rs ?? []; sem.signal() }
  sem.wait()
  return found
}

let args = CommandLine.arguments.dropFirst()
guard let cmd = args.first else { fail("usage: access | lists | read <list> | apply <list>") }

if cmd == "access" {
  out(["access": access(), "status": EKEventStore.authorizationStatus(for: .reminder).rawValue])
  exit(0)
}
guard access() else { fail("Reminders access is not granted", code: 2) }

switch cmd {
case "lists":
  out(["lists": store.calendars(for: .reminder).map { ["id": $0.calendarIdentifier, "title": $0.title] }])
case "read":
  guard let title = args.dropFirst().first else { fail("which list?") }
  let cal = list(named: title)
  out(["list": ["id": cal.calendarIdentifier, "title": cal.title], "items": reminders(in: cal).map(row)])
case "apply":
  guard let title = args.dropFirst().first else { fail("which list?") }
  let cal = list(named: title)
  let input = FileHandle.standardInput.readDataToEndOfFile()
  guard let ops = (try? JSONSerialization.jsonObject(with: input)) as? [[String: Any]] else { fail("ops must be a JSON array") }
  var results: [[String: Any]] = []
  for op in ops {
    let kind = op["op"] as? String ?? ""
    do {
      if kind == "add" {
        let r = EKReminder(eventStore: store)
        r.calendar = cal
        r.title = op["title"] as? String ?? ""
        if let n = op["notes"] as? String, !n.isEmpty { r.notes = n }
        r.isCompleted = op["done"] as? Bool ?? false
        try store.save(r, commit: false)
        results.append(["op": kind, "ref": op["ref"] ?? NSNull(), "ok": true, "item": row(r)])
      } else if let id = op["id"] as? String, let r = store.calendarItem(withIdentifier: id) as? EKReminder, r.calendar.calendarIdentifier == cal.calendarIdentifier {
        if kind == "set" {
          if let t = op["title"] as? String { r.title = t }
          if let n = op["notes"] as? String { r.notes = n.isEmpty ? nil : n }
          if let d = op["done"] as? Bool { r.isCompleted = d }
          try store.save(r, commit: false)
          results.append(["op": kind, "id": id, "ok": true, "item": row(r)])
        } else if kind == "remove" {
          try store.remove(r, commit: false)
          results.append(["op": kind, "id": id, "ok": true])
        } else {
          results.append(["op": kind, "id": id, "ok": false, "error": "unknown op"])
        }
      } else {
        results.append(["op": kind, "id": op["id"] ?? NSNull(), "ok": false, "error": "not on the list"])
      }
    } catch {
      results.append(["op": kind, "ref": op["ref"] ?? NSNull(), "id": op["id"] ?? NSNull(), "ok": false, "error": error.localizedDescription])
    }
  }
  do { try store.commit() } catch { fail("Reminders did not save: \(error.localizedDescription)") }
  out(["results": results])
default:
  fail("unknown command \(cmd)")
}
