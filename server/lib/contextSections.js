// NAMED ABSENCE — a context section that FAILED is named to the model; one
// that is honestly EMPTY says nothing.
//
// Five model lanes assembled their context from independent sections and
// swallowed a section's failure as if it were emptiness: the Daily Review's
// add() was `.catch(() => {})`, Plan Today's the same, Ask Nova's deadline
// resolved a stalled section to null, and the quick-session route wrapped
// each read in an optional catch. So a crashed money section read to the
// model as "no money logged", and a prompt that orders it to name gaps
// honestly named them WRONGLY — "no protein logged; can't tell if you skipped
// or didn't log" when the truth was a code failure. The Coach chat had the
// answer (a failures list and a NOTE, routes/workouts.js); this is that
// answer, once.
//
// Two absences, kept apart:
//   EMPTY  — the loader returned null/'' → nothing to say, so nothing said.
//   FAILED — the loader threw or timed out → named in a NOTE the model must
//            not reason past, so it never tells him to log more because of a
//            bug, and never answers "nothing" from a ledger it could not read.

export const ABSENT_NOTE = (failed) => `NOTE — these context sections FAILED to load this turn (an error or a timeout, NOT thin logging or an empty day): ${failed.map((f) => f.label).join(', ')}. If one matters to the question, say that data could not be loaded — never conclude he skipped, didn't log, or has nothing there because of it, and never tell him to log more because of it.`;

function withDeadline(promise, ms) {
  let timer;
  const clock = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${Math.round(ms / 100) / 10}s`)), ms);
    timer.unref?.();
  });
  return Promise.race([promise, clock]).finally(() => clearTimeout(timer));
}

// sections: [{ label, load: () => string | null | Promise<string | null>, ms? }]
//   parallel — run together (the conversational surfaces) or in order (the
//              morning composers, whose sections are cheap and read the same
//              files); the prompt order is the array order either way.
//   ms       — a per-section deadline; a section's own `ms` overrides it.
//   note     — append the NOTE when anything failed (default). Off only for a
//              caller that will name the failures in its own words.
export async function gatherContext(sections, { parallel = false, ms = null, note = true } = {}) {
  const runOne = async (s) => {
    try {
      let p = Promise.resolve().then(() => s.load());
      const limit = s.ms ?? ms;
      if (limit) p = withDeadline(p, limit);
      return { ok: true, value: await p };
    } catch (e) {
      return { ok: false, reason: String(e?.message || e || 'unknown error') };
    }
  };
  const results = [];
  if (parallel) results.push(...await Promise.all(sections.map(runOne)));
  else for (const s of sections) results.push(await runOne(s));

  const parts = [];
  const failed = [];
  results.forEach((r, i) => {
    if (r.ok) {
      if (typeof r.value === 'string' && r.value.trim()) parts.push(r.value);
    } else {
      failed.push({ label: sections[i].label, reason: r.reason });
    }
  });
  const text = [...parts, ...(note && failed.length ? [ABSENT_NOTE(failed)] : [])].join('\n\n');
  return { text, parts, failed };
}
