// THE WORKING GLASS (25 Sep 2026). A job Nova is running for him narrates
// itself the way the reel's Jarvis does ("YETI's winners, sir" → "brand DNA,
// locked in" → "rendering all five now" → "all five are ready"): each stage
// of the work speaks one line and raises one panel. His yes to it, 25 Sep,
// from the hugovar.ai "make me five ads" reel.
//
// EVERY WORD AND EVERY PANEL HERE IS WRITTEN BY CODE FROM THE RECORD. The
// Researcher already publishes its real progress onto its inbox record —
// the panel it planned, each worker as it returns with a findings count,
// the merge, the citation repair, the brief or the error (researcher.js
// runPanel → updateRecord). This turns those fields into the stages, and
// nothing else: a stage with no real fact behind it is not emitted, so the
// glass can never say "rendering" about a job that is not.
//
// Pure and shared: the client diffs the stages a record has reached against
// the ones it has already shown (App.narrateJobs), and the server test
// checks the words against real record shapes.

const question = (record) => String(record?.text || '').replace(/^Research:\s*/i, '').trim();

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// "A, B and C" — the spoken list, never a bulleted one
function andList(names) {
  const a = names.filter(Boolean);
  if (a.length <= 1) return a.join('');
  return `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
}

function workerNote(w) {
  if (w.status === 'error') return 'FAILED';
  if (w.status === 'done') return w.found ? `${w.found} FOUND` : 'EMPTY';
  return 'OUT';
}

function workerTone(w) {
  if (w.status === 'error') return 'warn';
  if (w.status === 'done') return w.found ? 'good' : 'gold';
  return 'cy';
}

function panelCard(workers, label, foot) {
  return {
    kind: 'list',
    tone: 'cy',
    label,
    items: workers.map((w) => ({ name: w.name, note: workerNote(w), tone: workerTone(w) })),
    foot: foot || null,
  };
}

// The stages a research record has reached so far, in the order they
// happened. Each is { key, say, card }. Keys are stable per record so a
// stage is narrated exactly once as the record advances.
export function researchStages(record) {
  if (!record || record.kind !== 'research') return [];
  const q = question(record);
  const status = String(record.status || '');
  const panel = record.panel || null;
  const workers = Array.isArray(panel?.workers) ? panel.workers : [];
  const out = [];

  out.push({
    key: 'go',
    say: 'On it. Planning who to send.',
    card: { kind: 'key', tone: 'cy', label: 'RESEARCHING', caption: q || 'Research', foot: null },
  });

  if (workers.length) {
    out.push({
      key: 'panel',
      say: `${plural(workers.length, 'researcher')} out: ${andList(workers.map((w) => w.name))}.`,
      card: panelCard(workers, 'THE PANEL', null),
    });
    // each one as it returns — its own words are the count it came back with
    const back = workers.filter((w) => w.status === 'done' || w.status === 'error');
    back.forEach((w) => {
      const say = w.status === 'error'
        ? `${w.name} failed.`
        : w.found ? `${w.name} is back with ${plural(w.found, 'finding')}.` : `${w.name} came back empty.`;
      out.push({ key: `back:${w.name}`, say, card: panelCard(workers, 'THE PANEL', panel.label || null) });
    });
  }

  if (panel?.merging) {
    const found = workers.reduce((n, w) => n + (w.status === 'done' ? (w.found || 0) : 0), 0);
    const back = workers.filter((w) => w.status === 'done' || w.status === 'error').length;
    const who = workers.length && back === workers.length ? `All ${workers.length} back` : (panel.label || 'Back');
    out.push({
      key: 'merging',
      say: `${who}, ${plural(found, 'finding')}. Writing one brief.`,
      card: { kind: 'metric', tone: 'cy', label: 'MERGING', value: String(found), caption: `FINDINGS · ${plural(workers.length, 'ANGLE').toUpperCase()}`, foot: null },
    });
  }

  if (panel?.repairing) {
    out.push({
      key: 'repairing',
      say: 'A citation did not check out. Fixing it.',
      card: { kind: 'key', tone: 'warn', label: 'CITATION CHECK', caption: 'One citation pointed at nothing. The merge is fixing only that.', foot: null },
    });
  }

  if (status === 'error') {
    out.push({
      key: 'error',
      say: `The research failed${record.error ? `: ${String(record.error).slice(0, 160)}` : ''}.`,
      card: { kind: 'key', tone: 'warn', label: 'FAILED', caption: String(record.error || 'no reason recorded').slice(0, 200), foot: 'Retry from the Inbox' },
    });
  } else if (status && status !== 'classifying' && record.decision?.title) {
    out.push({
      key: 'ready',
      say: `The brief is ready: ${record.decision.title}. It is in your Inbox.`,
      card: { kind: 'key', tone: 'good', label: 'READY', caption: record.decision.title, foot: 'Approve keeps it as a note in your vault' },
    });
  }
  return out;
}

// A settled record narrates nothing more; used to stop tracking it.
export function jobSettled(record) {
  const s = String(record?.status || '');
  return !!s && s !== 'classifying';
}

// The stages not yet shown, and the seen-set to keep. `seen` is a Set of
// keys already narrated for this record (undefined for a record never seen).
export function newStages(record, seen) {
  const stages = researchStages(record);
  // A record that is already settled the first time it is seen finished
  // while nobody was watching: it is history, not news, and seeds silently.
  // The app's own first-sight mark (`seen.set(id, null)`) came back here as
  // `undefined` on the next poll, so on 25 Sep every past brief was read out
  // aloud on each fresh device load (19 lines, three times over, and each
  // one mirrored into his conversation record).
  if (!seen && jobSettled(record)) return { fresh: [], seen: new Set(stages.map((s) => s.key)) };
  const had = seen || new Set();
  const fresh = stages.filter((s) => !had.has(s.key));
  const next = new Set(had);
  for (const s of stages) next.add(s.key);
  return { fresh, seen: next };
}
