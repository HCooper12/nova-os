// THREE-WAY MERGE, line based — so a drifted file is only refused when the
// drift and the staged edit actually collide.
//
// His report, 12 Sep 2026: an ingest approval refused with "the vault moved
// under this weave (Wiki/index.md changed since the diff)". The guard was
// right — the file HAD changed — but the collision was imaginary. A weave adds
// bullets to index.md's Sources / Entities / Concepts / Topics sections and
// appends one dated block to log.md. Nova's own journal bookkeeping
// (journal.js) upserts a single bullet in the `## Journal` section and appends
// its own block to log.md. Measured on a real weave: nine insertions across
// four sections, one bullet updated, and not one line in common with the
// journal's. The two edits had nothing to say to each other, and he was told
// to discard a $2-3.50 pass and run it again — where the same race could
// simply happen a second time.
//
// So: keep the guarantee, drop the false alarm. The guarantee that matters is
// NOTHING IS LOST — never that the file sat still. A merge is accepted only
// when no line of the base is changed two different ways and no side's content
// is dropped; anything else refuses exactly as before, naming the file.
//
// Concurrent insertions at the SAME anchor are kept, both, live side first.
// For an append-only log (log.md) that is the whole case, and taking both
// loses nothing — which is the property the drift check exists to protect.
// Identical edits from both sides are applied once, not twice.

// Files big enough to make the O(n·m) alignment expensive are not merged; they
// refuse as they always did. Honest degradation beats a slow surprise.
const MAX_LINES = 6000;

function splitLines(text) {
  const s = String(text ?? '');
  const lines = s.split('\n');
  // a trailing newline leaves a final '' that is bookkeeping, not a line
  const trailing = lines.length > 1 && lines[lines.length - 1] === '';
  if (trailing) lines.pop();
  return { lines, trailing };
}

// Longest common subsequence table, walked back into aligned runs. Plain DP:
// the vault's files are hundreds of lines, and clarity is worth more here than
// a Myers implementation nobody will read again.
function matchRuns(a, b) {
  const n = a.length, m = b.length;
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j]
        ? dp[(i + 1) * w + (j + 1)] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + (j + 1)]);
    }
  }
  const runs = []; // [{ aStart, bStart, len }]
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      const aStart = i, bStart = j;
      while (i < n && j < m && a[i] === b[j]) { i++; j++; }
      runs.push({ aStart, bStart, len: i - aStart });
    } else if (dp[(i + 1) * w + j] >= dp[i * w + (j + 1)]) i++;
    else j++;
  }
  return runs;
}

// One side's edit, as replacements of base ranges: base[start,end) → lines.
// A pure insertion has start === end.
function editsOf(base, side) {
  const runs = matchRuns(base, side);
  const out = [];
  let a = 0, b = 0;
  const push = (start, end, lines) => {
    if (end > start || lines.length) out.push({ start, end, lines });
  };
  for (const r of runs) {
    push(a, r.aStart, side.slice(b, r.bStart));
    a = r.aStart + r.len;
    b = r.bStart + r.len;
  }
  push(a, base.length, side.slice(b));
  return out;
}

const same = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);

// base → the bytes both sides were computed from (the stamped prior)
// live → what is on disk now (the drift)
// staged → what the pass wants to write
//
// { ok: true, text, merges } when it resolves — `merges` counts the drifted
// regions that were kept. { ok: false, reason } when the two edits collide.
export function mergeText(base, live, staged) {
  if (live === staged) return { ok: true, text: staged, merges: 0 };
  if (base == null) return { ok: false, reason: 'there is no common version to merge from' };

  const B = splitLines(base), L = splitLines(live), S = splitLines(staged);
  if (Math.max(B.lines.length, L.lines.length, S.lines.length) > MAX_LINES) {
    return { ok: false, reason: `it is too large to merge line by line — over ${MAX_LINES} lines` };
  }

  const liveEdits = editsOf(B.lines, L.lines);
  const stagedEdits = editsOf(B.lines, S.lines);
  if (!liveEdits.length) return { ok: true, text: staged, merges: 0 };
  if (!stagedEdits.length) return { ok: true, text: live, merges: 0 };

  const out = [];
  let at = 0, li = 0, si = 0, merges = 0;

  const emitBase = (upto) => { while (at < upto) out.push(B.lines[at++]); };

  while (li < liveEdits.length || si < stagedEdits.length) {
    const l = liveEdits[li] || null;
    const s = stagedEdits[si] || null;

    if (!s) { emitBase(l.start); out.push(...l.lines); at = l.end; li++; merges++; continue; }
    if (!l) { emitBase(s.start); out.push(...s.lines); at = s.end; si++; continue; }

    // both sides edit the same base range, or both insert at the same anchor
    const sameRange = l.start === s.start && l.end === s.end;
    const bothInsertHere = sameRange && l.start === l.end;
    if (sameRange && same(l.lines, s.lines)) {
      emitBase(l.start); out.push(...l.lines); at = l.end; li++; si++; continue;  // one edit, made twice
    }
    if (bothInsertHere) {
      // nothing is overwritten — keep what already landed, then the staged block
      emitBase(l.start); out.push(...l.lines, ...s.lines); at = l.end; li++; si++; merges++; continue;
    }
    const overlap = l.start < s.end && s.start < l.end
      // an insertion strictly inside the other side's replaced range has no
      // surviving anchor to sit against
      || (l.start === l.end && l.start > s.start && l.start < s.end)
      || (s.start === s.end && s.start > l.start && s.start < l.end);
    if (overlap) {
      const line = Math.min(l.start, s.start) + 1;
      return { ok: false, reason: `both changed the same passage, around line ${line} of the version it was computed from` };
    }

    // disjoint — take whichever comes first in the file
    const first = l.start <= s.start ? 'live' : 'staged';
    const e = first === 'live' ? l : s;
    emitBase(e.start); out.push(...e.lines); at = e.end;
    if (first === 'live') { li++; merges++; } else si++;
  }
  emitBase(B.lines.length);

  // the trailing newline follows whichever side still has content at the end
  const trailing = S.trailing || L.trailing;
  return { ok: true, text: out.join('\n') + (trailing ? '\n' : ''), merges };
}
