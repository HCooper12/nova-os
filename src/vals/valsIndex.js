import { dtf } from './fmt.js';
import { localDateISO } from '../localDate.js';
import { INDEX_GROUPS, ROW_META, OVERLAY_DOORS } from '../indexGroups.js';

// THE INDEX'S VIEW MODEL (P3, 26 Sep 2026 — design/HOME-REDESIGN-PLAN.md §1.3).
// Four groups of rows, each { key, label, hue, value, hot, go, warm }, plus the
// date and the "you" card at the top.
//
// EVERY VALUE IS READ, NEVER MADE. A row's value is a field another builder
// already computed — the sidebar's own counts (navMain / navVault / navSystem
// in valsChrome.js, read off the rows themselves so there is one expression
// per count, not two), the protein ring, the Home cards' labels — and when no
// honest value exists the value is '' and the row shows its name alone. A
// count the sidebar shows as '—' (configured, not yet synced) is no value
// here: a dash beside a name reads as a broken row, not as "not synced".
//
// `v` is the merged view model (App.jsx spreads this LAST, after valsSummary),
// because the fields it reads come from eight different builders.

const DATE_FMT = { weekday: 'long', day: 'numeric', month: 'long' };

// the sidebar row for a screen, wherever that screen sits in the three groups
function navRow(v, screen) {
  for (const list of [v.navMain, v.navVault, v.navSystem]) {
    const row = (list || []).find((n) => n.screen === screen);
    if (row) return row;
  }
  return null;
}
// a sidebar count as a number: '12' → 12; '—', or no count at all → null
function countOf(v, screen) {
  const c = navRow(v, screen)?.count;
  if (c == null || c === '') return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
}
const counted = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// A free-text value (a routine name, a page title, the Leader's idea) is cut at
// a word and says it was cut, so a row is never ended mid-word — the redesign
// audit's finding 5.
export function clipWords(s, max = 32) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at >= max / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:·–—-]+$/, '')}…`;
}

// FUEL, FROM THE RING ITSELF. The protein ring's own value and its own target
// ('/150G' in its `small`), so the row and the ring can never disagree; a ring
// with no reading says nothing here rather than '0 g'.
export function fuelValue(ringVitals) {
  const r = (ringVitals || []).find((x) => x && x.key === 'protein');
  if (!r || r.state === 'absent' || r.value == null || r.value === '—') return '';
  const target = /^\/\s*(\d[\d,]*)\s*g$/i.exec(String(r.small || ''));
  return target ? `${r.value} of ${target[1]} g` : `${r.value} g`;
}

function rowValue(key, v) {
  switch (key) {
    case 'workouts':
      return { value: clipWords(v.workoutCardLabel) };
    case 'recipes':
      return { value: fuelValue(v.ringVitals) };
    case 'inbox': {
      const n = Number(v.inboxPendingCount) || 0;
      return n > 0 ? { value: `${n} waiting`, hot: true } : { value: '' };
    }
    case 'todos': {
      const n = countOf(v, 'todos');
      return { value: n != null ? `${n} open` : '' };
    }
    case 'voice':
      return { value: 'Talk to Nova' };
    case 'practice': {
      const n = countOf(v, 'practice');
      return { value: v.practiceCard?.meta || (n > 0 ? counted(n, 'skill') : '') };
    }
    case 'leader': {
      // Hot only when Nova's picture of his situation has gone STALE — the same
      // test that badges the Leader tab — and then the value is what is open,
      // not today's idea: gold is "waiting on you", and an idea is not waiting.
      const row = navRow(v, 'leader');
      const open = countOf(v, 'leader');
      if (row?.countHot && open) return { value: `${open} open`, hot: true };
      return { value: clipWords(v.leaderBox?.face?.title) || (open ? `${open} open` : '') };
    }
    case 'review':
      return { value: v.reviewFrom ? `from ${clipWords(v.reviewFrom, 28)}` : '' };
    case 'technique': {
      const t = v.todayTechnique;
      return { value: t && !t.empty && t.position != null && t.total != null ? `${t.position} of ${t.total}` : '' };
    }
    case 'library': {
      const n = countOf(v, 'library');
      return { value: n != null ? counted(n, 'volume') : '' };
    }
    case 'notes': {
      const n = countOf(v, 'notes');
      return { value: n != null ? counted(n, 'note') : '' };
    }
    case 'journal': {
      const n = countOf(v, 'journal');
      return { value: n != null ? counted(n, 'day') : '' };
    }
    case 'money':
      // the ledger's own total, and only while the ledger is showing THIS month:
      // he can page the Money screen back to August, and "this month" would lie
      return { value: v.moneyLoaded && v.moneyMonth === localDateISO().slice(0, 7) && v.moneySpentLabel ? `${v.moneySpentLabel} this month` : '' };
    case 'shopping': {
      const n = countOf(v, 'shopping');
      return { value: n != null ? counted(n, 'item') : '' };
    }
    case 'stash': {
      const n = countOf(v, 'stash');
      return { value: n != null ? counted(n, 'link') : '' };
    }
    case 'galaxy':
      return { value: 'the vault as stars' };
    case 'ops': {
      const live = v.agentsIndexLabel || '';
      const pending = countOf(v, 'ops');
      return { value: [live, pending > 0 ? `${pending} pending` : ''].filter(Boolean).join(' · ') };
    }
    default:
      // Home, Briefing, Code, Console, Ambient, Settings: nothing to say that
      // would be true every time, so they say nothing
      return { value: '' };
  }
}

export function valsIndex(app, ctx, v) {
  const st = app.state;
  if (st.screen !== 'index') return { indexPage: null };

  const groups = INDEX_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    rows: g.rows.map((key) => {
      const meta = ROW_META[key] || { label: key, hue: '--nv-ink40' };
      const door = OVERLAY_DOORS[key];
      const { value = '', hot = false } = rowValue(key, v);
      return {
        key,
        label: meta.label,
        hue: meta.hue,
        value,
        hot: !!(hot && value),
        go: door ? () => app[door]() : ctx.go(key),
        warm: door ? undefined : ctx.warm(key),
      };
    }),
  }));

  const waiting = Number(v.inboxPendingCount) || 0;
  return {
    indexPage: {
      date: dtf('en-GB', DATE_FMT).format(new Date()).replace(/,/g, ''),
      you: {
        name: ctx.userName || '',
        line: [
          v.agentsIndexLabel || '',
          String(v.systemsLabel?.text || '').toLowerCase(),
          `${waiting} waiting`,
        ].filter(Boolean).join(' · '),
        open: v.goSettings,
      },
      groups,
    },
  };
}
