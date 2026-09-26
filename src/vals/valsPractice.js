// PRACTICE — the rehearsal room's view model (design/PRACTICE-PLAN.md).
//
// One model, three renderers: the Home card in both idioms (MissionStructured
// and MissionControl read `practiceCard`) and the room itself
// (screens/Practice.jsx reads `practice`). Every fact here is the server's
// receipt from GET /api/practice or the live scene the App holds; absence
// renders as absence, never as a skill he does not have.
//
// THE LAMP is the one picture of progress, the same everywhere: one per move,
// lit once he has landed it, dim until then. On Home and in the history it
// reads the page's tallies; on the stage it reads what this scene's hidden
// notes said he just did.
//
// The helpers at the top are pure (no React, no App) so a node script can
// exercise them without a browser.

export const PRACTICE_SCENE_KEY = 'novaos.practiceScene';

// The partner's reply ends with a typed directive for the server — `NOTE {…}`
// on a scene turn, `DEBRIEF {…}` on the last one. It is never shown and
// never spoken. While streaming, the directive can be half-typed ("NOT"), so
// a trailing bare prefix of either word goes too; case-sensitive, because
// the directives are written in capitals and his partner's "No" is not.
const DIRECTIVE_RE = /(^|\n)\s*(?:NOTE|DEBRIEF)\s*(\{[\s\S]*)?$/;
const DIRECTIVE_PREFIX_RE = /(^|\n)\s*(?:N(?:O(?:T)?)?|D(?:E(?:B(?:R(?:I(?:E)?)?)?)?)?)\s*$/;
export function stripPracticeDirective(text) {
  return String(text || '').replace(DIRECTIVE_RE, '').replace(DIRECTIVE_PREFIX_RE, '').trimEnd();
}

// "Mark, a peer who is stressed" → "Mark". A cast line that does not start
// with a name ("A stressed manager") is spoken for as "Them", never invented.
const NOT_NAMES = new Set(['A', 'An', 'The', 'Your', 'His', 'Her', 'My', 'Their', 'One', 'Someone', 'Some']);
export function partnerName(other) {
  const m = /^\s*([A-Z][A-Za-z'’-]+)/.exec(String(other || ''));
  return m && !NOT_NAMES.has(m[1]) ? m[1] : 'Them';
}

// THE CAST LINE. `other` is a sentence on the page ("A peer at your level,
// not your boss. She digs in…"); the stage says only who it is: the first
// clause, and — when it does not start with a name — lower-cased, so it reads
// as "with a peer at your level, not your boss".
export function castLine(other) {
  const first = String(other || '').split(/[.;](?:\s|$)/)[0].trim().replace(/[,:\s]+$/, '');
  if (!first) return '';
  return partnerName(first) === 'Them' ? first.charAt(0).toLowerCase() + first.slice(1) : first;
}

// THE NAME THE PARTNER GIVES ITSELF. When the page's cast line names nobody,
// the partner often introduces itself in its opening turn ("I'm Claire") —
// cheap to read, and "CLAIRE" over the line beats "THEM". Only the FIRST
// partner line is read, and only a capitalised word that is not one of the
// ways a sentence starting "I'm …" usually goes on.
const NOT_A_NAME = new Set(['Not', 'Sorry', 'Just', 'Fine', 'Here', 'Sure', 'So', 'Really', 'Glad', 'Happy', 'Afraid', 'Busy', 'Only', 'Still', 'Going', 'Trying', 'Telling', 'Saying', 'Asking', 'The', 'Your', 'A', 'An']);
export function selfNamed(firstLine) {
  const m = /\bI(?:'|’)m ([A-Z][a-z]+)\b|\bI am ([A-Z][a-z]+)\b|\b[Mm]y name(?:'|’)?s ([A-Z][a-z]+)\b|\b[Mm]y name is ([A-Z][a-z]+)\b/.exec(String(firstLine || ''));
  const name = m && (m[1] || m[2] || m[3] || m[4]);
  return name && !NOT_A_NAME.has(name) ? name : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "2026-09-26" or an ISO stamp → "26 Sep". A local date string is read as
// written (no timezone shift); a full stamp is read in his local time.
export function shortDate(s) {
  const str = String(s || '');
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (ymd) return `${Number(ymd[3])} ${MONTHS[Number(ymd[2]) - 1] || ''}`.trim();
  const d = new Date(str);
  return Number.isFinite(d.getTime()) ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : '';
}

// a cut sentence says it was cut
export function shorten(s, n = 56) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}

const key = (s) => String(s || '').trim().toLowerCase();

// One lamp per move on the page: lit once landed at least once.
export function skillLamps(skill) {
  return (skill?.moves || []).map((m) => ({ name: m.name, lit: (Number(m.landed) || 0) > 0 }));
}

// "Research it" in his sentence is the explicit trigger for the web
// (PRACTICE-PLAN.md, Architecture) — the server decides too; this only says
// so up front.
export const RESEARCH_RE = /\b(?:research (?:it|this|that|them)|look (?:it|this|that) up|look up|find (?:me )?sources|search the web)\b/i;

// The skill Home carries: the day's pick when the server named one, else the
// first active skill, else the first at all.
export function homeSkill(P) {
  const skills = P?.skills || [];
  return skills.find((s) => s.slug === P?.today?.slug)
    || skills.find((s) => s.status === 'active')
    || skills[0] || null;
}

// A job still working (not one that stopped with an error) — the Home card
// and the preparing poll both read this one definition.
export const stillPreparing = (p) => p && p.status !== 'error';

export function valsPractice(app, ctx) {
  const st = app.state;
  const P = st.livePractice || null;
  const demoMode = !!ctx?.demoMode;
  const skills = P?.skills || [];
  const preparing = (P?.preparing || []).map((p) => ({
    id: p.id,
    text: shorten(p.text, 70),
    error: p.status === 'error' ? (p.error || 'it stopped without saying why') : null,
  }));

  // ---------------- the Home card ----------------
  const practiceCard = (() => {
    if (demoMode || !P) return null;
    if (!skills.length && !preparing.length) return null; // never an empty box on Home
    const s = homeSkill(P);
    const lamps = skillLamps(s);
    const landed = lamps.filter((l) => l.lit).length;
    const nextScenario = (P.today?.slug === s?.slug && P.today?.scenario) || s?.next?.scenario || null;
    return {
      slug: s?.slug || null,
      title: s?.title || null,
      lamps,
      meta: s ? (lamps.length ? `${landed} of ${lamps.length} moves landed` : 'no moves yet') : 'preparing',
      next: s && nextScenario ? { scenario: nextScenario, why: (s.next?.scenario === nextScenario ? s.next?.why : P.today?.scenario === nextScenario ? P.today?.why : '') || '' } : null,
      preparing,
      rehearse: s && nextScenario ? () => app.startRehearsal(s.slug, nextScenario) : null,
      open: () => app.openPracticeRoom(s?.slug || null),
    };
  })();

  // ---------------- the room ----------------
  const openSlug = st.practiceOpen || null;
  const scene = st.practiceScene || null;
  const lit = st.practiceLit || {};
  const debrief = st.practiceDebrief || null;

  const detail = (() => {
    const s = skills.find((x) => x.slug === openSlug);
    if (!s) return null;
    const nextName = s.next?.scenario || null;
    return {
      slug: s.slug,
      title: s.title,
      summary: s.summary || '',
      why: s.why || '',
      status: s.status || 'active',
      moves: (s.moves || []).map((m) => ({
        name: m.name,
        summary: m.summary || '',
        line: m.line || '',
        when: m.when || '',
        tell: m.tell || '',
        source: m.source || '',
        lit: (Number(m.landed) || 0) > 0,
        tally: m.tried ? `landed ${m.landed || 0} of ${m.tried}` : 'not tried yet',
      })),
      scenarios: (s.scenarios || []).map((sc) => ({
        name: sc.name,
        setting: sc.setting || '',
        other: sc.other || '',
        isNext: sc.name === nextName,
        rehearse: () => app.startRehearsal(s.slug, sc.name),
      })),
      next: nextName ? { scenario: nextName, why: s.next?.why || '', rehearse: () => app.startRehearsal(s.slug, nextName) } : null,
      noScene: !(s.scenarios || []).length,
      gaps: (s.gaps || []).map((g) => ({ text: g, book: /\b(book|epub|upload)\b/i.test(g) })),
      openLibrary: () => app.navigate('library'),
      sessions: [...(s.sessions || [])].reverse().map((x, i) => ({
        key: `${x.date || x.at || ''}-${i}`,
        date: shortDate(x.date || x.at),
        scenario: x.scenario || '',
        lamps: [
          ...(x.landed || []).map((n) => ({ name: n, lit: true })),
          ...(x.missed || []).map((n) => ({ name: n, lit: false })),
        ],
        work: x.work || '',
      })),
      openPage: s.relPath ? () => app.openPracticePage(s.relPath) : null,
      toggleStatus: () => app.setPracticeStatus(s.slug, s.status === 'active' ? 'paused' : 'active'),
      toggleLabel: s.status === 'active' ? 'Pause skill' : 'Resume skill',
      close: () => app.openPracticeSkill(s.slug),
    };
  })();

  const stage = (() => {
    if (!scene) return null;
    const skill = skills.find((x) => x.slug === scene.slug) || null;
    const sc = (skill?.scenarios || []).find((x) => x.name === scene.scenario) || null;
    const lineOf = (name) => (skill?.moves || []).find((m) => key(m.name) === key(name))?.line || '';
    // the scene's own list when the server sent one; the page's otherwise
    // (a reload resumes before the first new turn has told us again)
    const moveNames = (scene.moves && scene.moves.length ? scene.moves.map((m) => m.name) : (sc?.moves || []))
      .filter(Boolean);
    const litOf = (name) => Object.entries(lit).find(([k]) => key(k) === key(name))?.[1];
    const missedOf = (name) => (debrief?.missed || []).find((m) => key(m.move) === key(name)) || null;
    const other = scene.other || sc?.other || '';
    const lines = st.practiceScript || [];
    const named = partnerName(other);
    const firstPartner = lines.find((l) => l.who === 'partner' && !l.streaming);
    const partner = named !== 'Them' ? named : (selfNamed(firstPartner?.text) || 'Them');
    const streaming = lines.some((l) => l.streaming);
    const busy = !!st.practiceBusy;
    return {
      scenario: scene.scenario || sc?.name || 'The scene',
      setting: scene.setting || sc?.setting || '',
      other,
      cast: castLine(other),
      partner,
      // the head gives way to the conversation once the partner has opened
      // (the debrief restores it: the settled lamps ARE the result)
      compact: !debrief && lines.some((l) => l.who === 'partner' && !l.streaming),
      latestQuote: (() => {
        const q = Object.values(lit).filter((x) => typeof x === 'string' && x);
        return q.length ? q[q.length - 1] : null;
      })(),
      skillTitle: shorten(skill?.title || '', 36),
      lamps: moveNames.map((name) => {
        const q = litOf(name);
        return {
          name,
          line: (scene.moves || []).find((m) => key(m.name) === key(name))?.line || lineOf(name),
          lit: q !== undefined,
          quote: typeof q === 'string' && q ? q : null,
          missed: q === undefined ? missedOf(name) : null,
        };
      }),
      script: lines.map((l, i) => ({
        key: `${i}`,
        who: l.who,
        speaker: l.who === 'you' ? 'You' : l.who === 'partner' ? partner : l.who === 'nova' ? 'Nova' : '',
        text: l.who === 'partner' || l.who === 'nova' ? stripPracticeDirective(l.text) : l.text,
        streaming: !!l.streaming,
      })),
      busy,
      waiting: busy && !streaming,
      waitingLabel: debrief || st.practiceEnding ? 'Nova is writing the debrief' : `${partner === 'Them' ? 'They are' : `${partner} is`} thinking`,
      starting: !scene.sessionId,
      canTalk: !!scene.sessionId && !busy && !debrief && !st.practiceEnding,
      input: st.practiceInput || '',
      setInput: (e) => app.setState({ practiceInput: typeof e === 'string' ? e : e.target.value }),
      send: (text) => app.practiceTurn(typeof text === 'string' ? text : st.practiceInput),
      pause: () => app.pauseRehearsal(),
      end: () => app.endRehearsal(),
      leave: () => app.leaveRehearsal(),
      setListening: (on) => { if (!!st.practiceListening !== !!on) app.setState({ practiceListening: !!on }); },
      debrief: debrief ? {
        best: debrief.best || '',
        work: debrief.work || '',
        notes: debrief.notes || [],
        landedCount: (debrief.landed || []).length,
        missedCount: (debrief.missed || []).length,
        parsed: !!debrief.parsed,
        filed: !!debrief.recordId,
        next: debrief.next || null,
        rehearseNext: debrief.next ? () => app.startRehearsal(scene.slug, debrief.next) : null,
        done: () => app.leaveRehearsal(),
      } : null,
    };
  })();

  return {
    isPractice: st.screen === 'practice',
    practiceCard,
    practice: {
      connected: P != null,
      skillsLabel: `Rehearsal · ${skills.length} skill${skills.length === 1 ? '' : 's'}`,
      skills: skills.map((s) => {
        const lamps = skillLamps(s);
        return {
          slug: s.slug,
          title: s.title,
          lamps,
          last: s.lastRehearsedAt ? `last: ${shortDate(s.lastRehearsedAt)}` : 'not rehearsed yet',
          statusTag: s.status && s.status !== 'active' ? s.status : null,
          open: s.slug === openSlug,
          select: () => app.openPracticeSkill(s.slug),
        };
      }),
      preparing,
      detail,
      stage,
      add: {
        value: st.practiceAddDraft || '',
        set: (e) => app.setState({ practiceAddDraft: typeof e === 'string' ? e : e.target.value }),
        send: () => app.practicePrepare(),
        busy: !!st.practiceAdding,
        research: RESEARCH_RE.test(st.practiceAddDraft || ''),
      },
    },
  };
}
