// HIS PAGE, AS DATA (Mentors, build slice 1). Pure: the answers of
// GET /api/mentors/:id, GET /api/mentors/queue and GET /api/mentors/:id/wall
// in, everything the page draws out. Nothing here is invented: a count, a
// title or a state that the server did not give is absent.
//
// The page has one state at a time (the mockup's states, his page, 125 A):
//
//   finding     just followed, his catalogue not listed yet
//   transcript  a video of his is being transcribed now
//   reading     a video of his is being read now
//   weaving     a batch of his is being woven into the vault now
//   paused      he paused this person, or the whole queue is paused
//   failed      a video of his could not be read (held as failed)
//   waiting     the queue waits: for his go, for his Claude usage, for YouTube
//   fresh       everything was done and a new video has arrived
//   caught      nothing of his is left to do
//   idle        none of the above (the queue has not reached him yet)

export const STAGES = ['Found', 'Transcript', 'Read', 'Woven'];
export const SWORD = ['found', 'transcripts', 'read', 'woven'];
const NOWK = ['work', 'wait', 'pause', 'need'];

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmt = (n) => Number(n || 0).toLocaleString('en-AU');
export const mins = (s) => Math.round((Number(s) || 0) / 60);

// the date of a video as the mockup writes it: "20 Nov 2026", or "Nov 2026"
// when YouTube only gave an approximate date
export function dateLabel(iso, approx) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // the channel's own calendar date (UTC), as the mockup and the register write it
  return approx ? `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}` : `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function vmeta(row) {
  if (!row) return '';
  return [dateLabel(row.date, row.approx), `${mins(row.sec)} min`].filter(Boolean).join(' · ');
}

// a short time of day, his locale: "2:00 pm"
export function clock(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

// a catalogue row's letter (server routes/mentors.js codeOf) as a stage level
// 0 found, 1 transcript, 2 read, 3 woven. A held source keeps no stage in the
// letter: a repeat ('d') was held after its transcript, so it shows as one; a
// refusal, a failure or a skip ('x', 's') never got past found.
const LEVEL = { f: 0, t: 1, r: 2, w: 3, d: 1, h: 1, x: 0, s: 0, k: null };

/** The level of every video, by id, with the one being worked on resolved. */
export function levels(catalogue, { workingStage = null } = {}) {
  const out = new Map();
  for (const [id, , code] of catalogue || []) {
    let lv = LEVEL[code];
    // a source being worked on is at the stage before the one it is doing
    if (code === 'k') lv = workingStage === 'reading' ? 1 : workingStage === 'weaving' ? 2 : 0;
    out.set(id, lv == null ? 0 : lv);
  }
  return out;
}

/** The four counts the stage strip shows: everything found, then how many got at least that far. */
export function cumulative(counts) {
  const c = counts || {};
  const total = c.total || 0;
  return [total, (c.transcript || 0) + (c.read || 0) + (c.woven || 0), (c.read || 0) + (c.woven || 0), c.woven || 0];
}

const keyToId = (key) => (String(key || '').startsWith('yt:') ? String(key).slice(3) : key || null);

/**
 * The page's state, from the three answers. `detail` is GET /mentors/:id,
 * `queue` GET /mentors/queue (may be null), `wall` GET /mentors/:id/wall
 * (may be null).
 */
export function pageModel(detail, queue, wall) {
  if (!detail?.person) return null;
  const person = detail.person;
  const counts = detail.counts || {};
  const cat = detail.catalogue || [];
  const qp = queue?.people?.find((p) => p.id === person.id) || null;
  const doing = qp?.doing || detail.doing || 'idle';
  const waiting = qp?.waiting || detail.waiting || null;
  const item = qp?.item || null;
  const n = cumulative(counts);
  const held = counts.held || {};
  const codes = new Map(cat.map(([id, , code]) => [id, code]));

  // rows by id: title, seconds, date (the wall's order carries them)
  const rows = new Map();
  for (const r of wall?.order || []) rows.set(r[0], { id: r[0], title: r[1], sec: r[2], date: r[3], approx: !!r[4] });
  for (const [id, sec] of cat) if (!rows.has(id)) rows.set(id, { id, title: '', sec, date: null, approx: false });
  const order = cat.map(([id]) => id);

  const working = ['transcript', 'reading', 'weaving'].includes(doing);
  const lv = levels(cat, { workingStage: doing });
  const workId = working ? keyToId(item?.key) : null;

  // which column would move next: transcripts left, then reads, then weaves
  const nextCol = () => {
    if (n[1] < n[0] - (held.refused || 0) - (held.skipped || 0) - (held.failed || 0)) return 1;
    if (n[2] < n[1] - (held.duplicate || 0) - (held.held || 0)) return 2;
    if (n[3] < n[2]) return 3;
    return 3;
  };
  // the newest video waiting at a level (what the next pass would take)
  const nextAt = (level) => order.find((id) => lv.get(id) === level && !['d', 'h', 'x', 's', 'k'].includes(codes.get(id))) || null;
  const failedId = order.find((id) => codes.get(id) === 'x') || null;

  let k;
  let col;
  let tokWord = null;
  let tokKind = null;
  let act = null;
  if (!counts.total && doing === 'finding') { k = 'finding'; col = 0; tokKind = 'work'; tokWord = 'Finding'; }
  else if (doing === 'transcript') { k = 'transcript'; col = 1; tokKind = 'work'; tokWord = 'Transcribing'; act = { kind: 'work', id: workId, word: 'Transcribing' }; }
  else if (doing === 'reading') { k = 'reading'; col = 2; tokKind = 'work'; tokWord = 'Reading'; act = { kind: 'lift', id: workId, word: 'Reading' }; }
  else if (doing === 'weaving') { k = 'weaving'; col = 3; tokKind = 'work'; tokWord = 'Weaving'; act = { kind: 'work', id: workId, word: 'Weaving' }; }
  else if (doing === 'paused' || person.status === 'paused' || queue?.paused) {
    k = 'paused'; col = nextCol(); tokKind = 'pause'; tokWord = 'Paused';
    const id = nextAt(col - 1);
    act = id ? { kind: 'paused', id, word: 'Paused', everyone: !!queue?.paused && person.status !== 'paused' } : null;
  } else if ((held.failed || 0) > 0 && failedId) {
    k = 'failed'; col = nextCol(); tokKind = 'need'; tokWord = `${held.failed} failed`;
    act = { kind: 'failed', id: failedId, word: 'Could not read', key: `yt:${failedId}` };
  } else if (doing === 'waiting') {
    k = 'waiting'; col = nextCol(); tokKind = 'wait';
    const on = waiting?.on;
    const until = clock(waiting?.until);
    tokWord = until ? `Resumes ${until}` : 'Waiting';
    const id = nextAt(col - 1);
    act = id ? { kind: 'waiting', id, word: on === 'usage' ? 'Claude usage' : on === 'youtube' ? 'YouTube' : on === 'weave' ? 'Weave stopped' : 'Waiting', on: on || null } : null;
  } else if (doing === 'done') {
    const fresh = order.filter((id) => codes.get(id) === 'f');
    if (fresh.length) { k = 'fresh'; col = 1; tokKind = 'dim'; tokWord = `${fresh.length} new`; }
    else { k = 'caught'; col = 3; }
  } else if (doing === 'idle' && n[3] > 0 && order.length && order.every((id) => codes.get(id) !== 't' && codes.get(id) !== 'r') && order.some((id) => codes.get(id) === 'f')) {
    const fresh = order.filter((id) => codes.get(id) === 'f');
    k = 'fresh'; col = 1; tokKind = 'dim'; tokWord = `${fresh.length} new`;
  } else { k = 'idle'; col = 3; }

  // the strip: the moving column carries the state; the rest are done or dim
  const m = n.map((v, i) => (tokKind && NOWK.includes(tokKind) && i === col ? tokKind : n[0] > 0 && v === n[0] ? 'done' : 'dim'));
  const moving = m.findIndex((x) => NOWK.includes(x));
  const numCol = moving < 0 ? (k === 'fresh' ? 3 : 3) : moving;

  // the wall: one class per video, the mockup's (r lifted, f failed, w woven,
  // rd read, t transcript, '' found, nw the new one)
  const cells = order.map((id) => {
    const level = lv.get(id) || 0;
    let cls = level === 3 ? 'w' : level === 2 ? 'rd' : level === 1 ? 't' : '';
    if (k === 'failed' && id === failedId) cls = 'f';
    if (workId && id === workId && (k === 'transcript' || k === 'reading')) cls = 'r';
    if (k === 'fresh' && codes.get(id) === 'f') cls = 'nw';
    return { id, level, cls };
  });

  // a row's token in the sheet and the lens (the mockup's stageOf)
  const stageOf = (id) => {
    if (workId && id === workId) return ['work', tokWord || 'Working'];
    if (k === 'failed' && id === failedId) return ['need', 'Failed'];
    if (k === 'fresh' && codes.get(id) === 'f') return ['dim', 'New'];
    return [['dim', 'Found'], ['dim', 'Transcript'], ['dim', 'Read'], ['done', 'Woven']][lv.get(id) || 0];
  };

  const latest = detail.latest?.[0] || null;
  return {
    k, n, m, col: numCol,
    tok: tokKind ? [tokKind, tokWord, col] : null,
    act,
    cells, rows, order,
    workId,
    stageOf,
    latest: latest ? { id: latest.id, title: latest.title, sec: latest.durationSec, date: latest.publishedAt, approx: rows.get(latest.id)?.approx || false } : null,
    blank: n[3] === 0,
    thick: n[0] ? 0.15 + 0.85 * n[3] / n[0] : 0.15,
    held,
    // the whole queue is paused (his own pause of this person is the other kind)
    everyone: k === 'paused' && !!queue?.paused && person.status !== 'paused',
    doing, waiting,
    youtubeBlockedUntil: queue?.youtubeBlockedUntil || null,
  };
}

/** The counts on the sheet's four filters: how many got at least that far. */
export function filterCounts(model) {
  return [0, 1, 2, 3].map((s) => model.cells.reduce((a, c) => a + (c.level >= s ? 1 : 0), 0));
}

/** Cells that moved forward between two models (to act the change out). */
export function advanced(prev, next) {
  if (!prev || !next) return [];
  const was = new Map(prev.cells.map((c) => [c.id, c.level]));
  return next.cells.filter((c) => was.has(c.id) && c.level > was.get(c.id)).map((c) => c.id);
}
