// WHO IS WORKING, WHO IS WAITING, AND WHO JUST LEFT A WINDOW OPEN. Pure functions over Claude
// Code's own session list (`claude agents --json`) and its own transcript journals under
// ~/.claude/projects. No project file is read, so this is safe to run over every project on the
// Mac, including ones a caller is otherwise forbidden to look inside.
//
// THE LESSON THAT MADE THIS FILE (2026-09-23). The first version judged a session by when it was
// STARTED, and called six of seven open sessions abandoned. Five of them had been used within the
// hour; their windows were simply nine days old. A start time says nothing about whether a
// session is alive. The journal does: its last user or assistant message is the last time anyone
// spoke in it. The file's modified time is NOT that signal, because bookkeeping writes touch it.
//
// SHARED BY COPY. This exact file lives in atlas-partner (Wren) and in nova-os (Nova). Each repo
// carries a test that the two are byte-identical, so the rule cannot drift in one and not the
// other. Change it here, copy it there, and let the test prove it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Quiet longer than this and an idle session is a window left open, not a hand raised. */
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

/** The CLI names a project's journal folder by flattening the working directory this way. */
export function projectSlug(cwd) { return String(cwd || "").replace(/[^A-Za-z0-9]/g, "-"); }
export function transcriptPath(cwd, sessionId, home = os.homedir()) {
  return path.join(home, ".claude", "projects", projectSlug(cwd), `${sessionId}.jsonl`);
}

/**
 * When someone last SPOKE in a session: the newest user or assistant entry with a timestamp, read
 * from the tail of the journal. Null when the journal is missing or has no such entry.
 */
export function lastMessageAt(file, { tailBytes = 2_000_000, readTail } = {}) {
  let text;
  try {
    if (readTail) text = readTail(file, tailBytes);
    else {
      const size = fs.statSync(file).size;
      const fd = fs.openSync(file, "r");
      try {
        const start = Math.max(0, size - tailBytes);
        const buf = Buffer.alloc(size - start);
        fs.readSync(fd, buf, 0, buf.length, start);
        text = buf.toString("utf8");
      } finally { fs.closeSync(fd); }
    }
  } catch { return null; }
  let best = null;
  for (const line of String(text || "").split("\n")) {
    let j; try { j = JSON.parse(line); } catch { continue; }
    if ((j.type === "user" || j.type === "assistant") && j.timestamp) {
      const t = Date.parse(j.timestamp);
      if (Number.isFinite(t) && (best === null || t > best)) best = t;
    }
  }
  return best;
}

/** Which project a working directory belongs to, as a person would name it. */
export function projectOf(cwd) {
  const s = String(cwd || "");
  const m = s.match(/\/Claude Projects\/([^/]+)/);
  const folder = m ? m[1] : (s.split("/").filter(Boolean).pop() || "somewhere");
  const known = { Atomic_Hub: "Science Atlas", "atlas-partner": "Wren", "nova-os": "Nova" };
  return { key: folder, label: known[folder] || folder.replace(/[-_]+/g, " ") };
}

/** How long ago, the way a person says it. Never a raw count of seconds, never a decimal. */
export function agoWords(ms) {
  const v = Math.max(0, Number(ms) || 0);
  if (v < 90 * 1000) return "just now";
  const mins = Math.round(v / 60000);
  if (mins < 90) return `about ${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(v / 3600000);
  if (hours < 36) return `about ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(v / 86400000);
  return `about ${days} day${days === 1 ? "" : "s"} ago`;
}

export const STATES = ["blocked", "waiting", "working", "left-open", "gone"];
const RANK = Object.fromEntries(STATES.map((s, i) => [s, i]));

/** One sentence per state, for him. `left-open` and `gone` take the quiet time. */
export function plainFor(state, quietAgo) {
  switch (state) {
    case "working": return "Working now.";
    case "waiting": return "Waiting for you: it has something to say or a question.";
    case "blocked": return "Stuck and needs you.";
    case "left-open": return `Left open. Nothing has happened in it for ${quietAgo.replace(/^about /, "").replace(/ ago$/, "")}.`;
    case "gone": return "Finished a while ago and cannot be reopened. Safe to clear.";
    default: return "Open.";
  }
}

/**
 * PURE. The judgement for one session. `lastAt` is when someone last spoke in it (null if the
 * journal is missing). A busy session is working whatever its age. An idle one is waiting only
 * while it went quiet recently; after that it is a window left open. A background session with
 * no journal at all is gone: its process is dead and its logs cannot be read.
 */
export function judge(agent, { lastAt = null, now = Date.now(), staleAfterMs = STALE_AFTER_MS } = {}) {
  const kind = agent.kind === "background" ? "background" : "interactive";
  const busy = kind === "interactive" ? agent.status === "busy" : agent.state === "running";
  const stuck = kind === "background" && agent.state === "blocked";
  const since = lastAt ?? (Number(agent.startedAt) || now);
  const quietMs = Math.max(0, now - since);
  if (busy) return { state: "working", quietMs };
  if (kind === "background" && lastAt === null) return { state: "gone", quietMs };
  if (quietMs > staleAfterMs) return { state: "left-open", quietMs };
  return { state: stuck ? "blocked" : "waiting", quietMs };
}

/**
 * Every open session, judged. `readLast(cwd, sessionId)` is injected so a test never touches the
 * real home folder; the default reads the real journal.
 */
export function describe(agents, { launched = [], now = Date.now(), home = os.homedir(), readLast, staleAfterMs = STALE_AFTER_MS } = {}) {
  const mine = new Map((launched || []).map((l) => [l.sessionId, l]));
  const last = readLast || ((cwd, id) => lastMessageAt(transcriptPath(cwd, id, home)));
  return (agents || []).filter((a) => a && a.sessionId).map((a) => {
    const kind = a.kind === "background" ? "background" : "interactive";
    const lastAt = last(a.cwd, a.sessionId);
    const { state, quietMs } = judge(a, { lastAt, now, staleAfterMs });
    const rec = mine.get(a.sessionId) || null;
    const quietAgo = agoWords(quietMs);
    return {
      sessionId: a.sessionId, shortId: kind === "background" ? (a.id || null) : null, pid: kind === "interactive" ? (a.pid ?? null) : null,
      kind, cwd: a.cwd || "", project: projectOf(a.cwd), node: rec?.node || null,
      name: a.name || rec?.name || "A session", state, plain: plainFor(state, quietAgo),
      quietAgo, startedAgo: agoWords(now - (Number(a.startedAt) || now)), lastAt, mine: !!rec,
      canShow: state !== "gone", canClose: state === "left-open" || state === "gone",
    };
  }).sort((x, y) => RANK[x.state] - RANK[y.state] || x.quietMs - y.quietMs);
}

/** One line for a pill. Hands raised first; windows left open last and quietly. */
export function summarise(sessions) {
  const n = (s) => (sessions || []).filter((x) => x.state === s).length;
  const live = [];
  if (n("working")) live.push(`${n("working")} working`);
  if (n("waiting")) live.push(`${n("waiting")} waiting for you`);
  if (n("blocked")) live.push(`${n("blocked")} stuck and needing you`);
  const idle = n("left-open") + n("gone");
  if (!live.length && !idle) return "Nothing is running.";
  if (!live.length) return `Nothing is working. ${idle} window${idle === 1 ? "" : "s"} left open.`;
  return live.join(", ") + (idle ? `, ${idle} left open` : "");
}
