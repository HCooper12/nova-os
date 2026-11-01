// NOVA'S THIRD LOCAL BRAIN (1 Nov 2026): Apple's on-device model, the one
// behind Apple Intelligence, reached through the FoundationModels framework.
// His decision that day: free, private, no download, and it does not share
// Ollama's memory, so it can answer the short text lanes when the Mac is too
// full to load the Qwen model (as it was all of 1 Nov: 3.6 GB free).
//
// A dumb pipe on purpose, like native/reminders-bridge.swift: it answers what
// it is asked and decides nothing. Which lane runs here, what the answer
// means and whether anything is written all live in server/lib/localModel.js
// and the lane's own tested code. Models decide, code acts.
//
// A long-lived process speaking newline-delimited JSON, one request per line
// on stdin and one reply per line on stdout, so the ~3 s process start and
// the model's first load are paid once, not per capture:
//
//   {"op":"health"}                         → {"ok":true,"availability":"available"}
//   {"id":"1","system":"…","prompt":"…","json":true,"maxTokens":700,"temperature":0}
//                                           → {"id":"1","text":"…"}  or  {"id":"1","error":"…"}
//   {"id":"2","prompt":"…","schema":{…a JSON Schema object…}}
//                                           → {"id":"2","text":"{…JSON…}"}
//
// JSON. `json: true` alone asks for prose containing only JSON (the caller's
// system text says so) and Node validates it, as it does for Ollama's
// format:'json'. `schema` is the better path when a caller has one:
// GenerationSchema is Codable, and its coding IS JSON Schema with Apple's
// own "x-order" key (measured 1 Nov by encoding a @Generable struct), so a
// schema decided at runtime is decoded here and the framework's guided
// generation guarantees the shape. Missing "x-order", "title" and
// "additionalProperties" are filled in below, because the decoder requires
// them.
//
// Every request gets a FRESH session: a session keeps its transcript, and
// the window is 4,096 tokens, so a reused one would overflow after a few
// captures and carry one capture's words into the next.
//
// Errors come back as plain text, never an empty string: unavailable (with
// the framework's reason), the context window exceeded (with the token count
// the framework names), a guardrail or refusal.
//
// Build: bash server/apple-llm/build.sh  (→ server/bin/nova-apple-llm)
import Foundation
import FoundationModels

let model = SystemLanguageModel.default

func emit(_ value: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) else { return }
  // stdout is a pipe, so print() would sit in a buffer: write straight through
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data([0x0A]))
}

func availabilityText() -> (ok: Bool, text: String) {
  switch model.availability {
  case .available: return (true, "available")
  case .unavailable(let reason): return (false, "unavailable: \(reason)")
  @unknown default: return (false, "unavailable: unknown")
  }
}

// The framework's localized text is generic ("The session's transcript
// exceeded the model's context size."); its description carries the number
// ("Content contains 4176 tokens, which exceeds the maximum allowed context
// size of 4096."). Both, when they differ, so the reason is never a guess.
func errorText(_ error: Error) -> String {
  let localized = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
  let described = String(describing: error).trimmingCharacters(in: .whitespacesAndNewlines)
  if described.isEmpty || described == localized { return localized.isEmpty ? "Apple's model failed without a reason" : localized }
  if localized.isEmpty { return described }
  return "\(localized) (\(described))"
}

// A JSON Schema object from a caller → the shape GenerationSchema decodes.
// Recursive, so nested objects get their own x-order too.
func completeSchema(_ node: Any, name: String) -> Any {
  if var obj = node as? [String: Any] {
    if let props = obj["properties"] as? [String: Any] {
      var filled: [String: Any] = [:]
      for (k, v) in props { filled[k] = completeSchema(v, name: k) }
      obj["properties"] = filled
      if obj["x-order"] == nil { obj["x-order"] = props.keys.sorted() }
      if obj["title"] == nil { obj["title"] = name.isEmpty ? "Reply" : name }
      if obj["additionalProperties"] == nil { obj["additionalProperties"] = false }
      if obj["required"] == nil { obj["required"] = props.keys.sorted() }
      if obj["type"] == nil { obj["type"] = "object" }
    }
    if let items = obj["items"] { obj["items"] = completeSchema(items, name: "\(name)Item") }
    return obj
  }
  return node
}

func answer(_ req: [String: Any]) async -> [String: Any] {
  let id = req["id"].map { "\($0)" } ?? ""
  var reply: [String: Any] = ["id": id]
  let avail = availabilityText()
  guard avail.ok else { reply["error"] = "Apple's on-device model is \(avail.text)"; return reply }
  guard let prompt = req["prompt"] as? String, !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
    reply["error"] = "empty prompt"
    return reply
  }
  let system = (req["system"] as? String) ?? ""
  let maxTokens = (req["maxTokens"] as? NSNumber)?.intValue
  let temperature = (req["temperature"] as? NSNumber)?.doubleValue ?? 0
  let options = GenerationOptions(temperature: temperature, maximumResponseTokens: maxTokens)
  let session = system.isEmpty
    ? LanguageModelSession(model: model)
    : LanguageModelSession(model: model, instructions: system)
  do {
    if let raw = req["schema"] as? [String: Any] {
      let filled = completeSchema(raw, name: (raw["title"] as? String) ?? "Reply")
      let data = try JSONSerialization.data(withJSONObject: filled)
      let schema = try JSONDecoder().decode(GenerationSchema.self, from: data)
      let r = try await session.respond(to: prompt, schema: schema, options: options)
      reply["text"] = r.content.jsonString
    } else {
      let r = try await session.respond(to: prompt, options: options)
      let text = r.content
      if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        reply["error"] = "Apple's model returned no text"
      } else {
        reply["text"] = text
      }
    }
  } catch {
    reply["error"] = errorText(error)
  }
  return reply
}

@main
struct NovaAppleLLM {
  static func main() async {
    // one-shot health for a shell check: nova-apple-llm --health
    if CommandLine.arguments.contains("--health") {
      let a = availabilityText()
      emit(["ok": a.ok, "availability": a.text])
      exit(a.ok ? 0 : 1)
    }
    if case .available = model.availability {
      // load the model now, before the first request waits on it
      LanguageModelSession(model: model).prewarm()
    }
    do {
      // serial on purpose: one request at a time, replies matched by id
      for try await line in FileHandle.standardInput.bytes.lines {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { continue }
        guard let data = trimmed.data(using: .utf8),
              let req = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
          emit(["error": "not a JSON object"])
          continue
        }
        if (req["op"] as? String) == "health" {
          let a = availabilityText()
          var r: [String: Any] = ["ok": a.ok, "availability": a.text]
          if let id = req["id"] { r["id"] = "\(id)" }
          emit(r)
          continue
        }
        emit(await answer(req))
      }
    } catch {
      emit(["error": "stdin closed: \(errorText(error))"])
    }
  }
}
