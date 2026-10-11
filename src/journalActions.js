import { api, getConnection } from './api.js';
import { isOfflineError } from './outbox.js';
import { tickReceipt } from './receipt.js';
import { haptic } from './haptics.js';
import { DEMO_DEEP, DEMO_REVIEW, DEMO_LIFE, DEMO_LIFE_SOURCES, demoJournalEntries, journalScenarioFromUrl } from './journalDemo.js';

// HIS JOURNAL'S ACTIONS (mockup 95), installed on App.prototype. `this` is
// the App. Demo mode runs the same paths over an in-memory copy of the demo
// day (journalDemoEntries), so every write is acted out without the network.

export const PROMPT_ORDER = ['deep', 'review', 'life'];
const TAG_OF = { deep: 'deep', review: 'life', life: 'life' };
const TAG_WORD = { own: 'Own', life: 'Life', deep: 'Deep' };
const pad = (n) => String(n).padStart(2, '0');
const nowParts = () => { const d = new Date(); return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }; };

const blankCard = () => ({ status: 'loading', prompt: null, meta: null, turn: 0, error: null });

export const journalActions = {
  journalIsDemo() { return this.state.connectionStatus === 'demo' || !getConnection(); },

  // the demo day, copied once so demo writes can change it
  journalDemoDays() {
    if (this.state.journalDemoEntries) return this.state.journalDemoEntries;
    return demoJournalEntries(journalScenarioFromUrl().jdemo);
  },
  setJournalDemoDays(fn) {
    this.setState((s) => ({ journalDemoEntries: fn(s.journalDemoEntries || demoJournalEntries(journalScenarioFromUrl().jdemo)) }));
  },

  setJournalView(view) {
    if (view === this.state.journalView) return;
    haptic('tick');
    this.setState({ journalView: view, journalFilterOpen: false, journalTagPop: null });
  },

  // ---------------------------------------------------------------- Notion
  refreshNotionJournal() {
    const conn = getConnection();
    if (!conn) return;
    api.journalNotion(conn).then((r) => this.setState({ liveNotionJournal: r, journalLanding: {} })).catch(() => {});
  },
  retryNotionJournal() {
    const conn = getConnection();
    if (!conn) { this.toastMsg('Demo: Retry runs a Notion pass in a real session'); return; }
    this.setState((s) => ({ liveNotionJournal: { ...(s.liveNotionJournal || {}), state: 'syncing' } }));
    api.syncJournalNotion(conn).then((r) => this.setState({ liveNotionJournal: r })).catch(() => {});
    clearTimeout(this.notionPollT);
    this.notionPollT = setTimeout(() => this.refreshNotionJournal(), 6000);
  },
  connectNotion() {
    // the key lives in Settings (notionAuth.js); the page only points there
    this.navigate('settings');
    setTimeout(() => this.openSettingsPage('notion'), 60);
  },

  // ---------------------------------------------------------------- the sheet
  openJournalPicker({ preset = null } = {}) {
    haptic('tick');
    const cards = { deep: blankCard(), review: blankCard(), life: blankCard() };
    const index = preset ? PROMPT_ORDER.indexOf(preset) : 0;
    this.setState({ journalPick: { open: true, index: Math.max(0, index), cards, used: preset ? [preset] : [], fromHome: !!preset }, journalTagPop: null });
    // the three are written now, at the tap, never ahead of time
    for (const k of PROMPT_ORDER) this.loadJournalPrompt(k, 0, null);
  },
  closeJournalPicker() {
    this.setState((s) => (s.journalPick ? { journalPick: { ...s.journalPick, open: false } } : null));
  },
  setJournalPickIndex(i) {
    this.setState((s) => (s.journalPick ? { journalPick: { ...s.journalPick, index: Math.max(0, Math.min(2, i)) } } : null));
  },
  patchJournalCard(kind, patch) {
    this.setState((s) => {
      if (!s.journalPick) return null;
      return { journalPick: { ...s.journalPick, cards: { ...s.journalPick.cards, [kind]: { ...s.journalPick.cards[kind], ...patch } } } };
    });
  },
  journalAnother(kind) {
    const card = this.state.journalPick?.cards?.[kind];
    if (!card || card.status === 'loading') return;
    haptic('tick');
    this.loadJournalPrompt(kind, (card.turn || 0) + 1, card.prompt);
  },
  loadJournalPrompt(kind, turn, avoid) {
    this.patchJournalCard(kind, { status: 'loading', turn, error: null });
    if (this.journalIsDemo()) {
      setTimeout(() => {
        if (kind === 'deep') this.patchJournalCard(kind, { status: 'ready', prompt: DEMO_DEEP[turn % DEMO_DEEP.length], meta: { kind, demo: true } });
        else if (kind === 'review') {
          // the same concept the demo Home shows today, so the two agree
          const concept = this.currentReviewItem?.()?.title || DEMO_REVIEW.concept;
          const prompt = concept === DEMO_REVIEW.concept ? DEMO_REVIEW.prompt : `Today's review is ${concept}. Where did it show up in your week, and what would you do differently with it tomorrow?`;
          this.patchJournalCard(kind, { status: 'ready', prompt, meta: { kind, concept, demo: true } });
        }
        else {
          const l = DEMO_LIFE[turn % DEMO_LIFE.length];
          this.patchJournalCard(kind, { status: 'ready', prompt: l.prompt, meta: { kind, source: l.source, from: l.from, sources: DEMO_LIFE_SOURCES, demo: true } });
        }
      }, turn ? 420 : 800);
      return;
    }
    const conn = getConnection();
    api.journalPrompts(conn, kind, { turn, avoid }).then((r) => {
      if (r.empty) { this.patchJournalCard(kind, { status: 'empty', error: r.reason, meta: r.meta }); return; }
      this.patchJournalCard(kind, { meta: r.meta });
      this.startPoll(`journalPrompt-${kind}`, () => api.journalPromptJob(conn, r.jobId), {
        onReady: (job) => this.patchJournalCard(kind, { status: 'ready', prompt: job.result.prompt, meta: { ...r.meta, ...job.result } }),
        onError: () => this.patchJournalCard(kind, { status: 'error', error: "Couldn't write this one." }),
      });
    }).catch((e) => {
      const off = /off/i.test(e.message || '');
      this.patchJournalCard(kind, { status: off ? 'off' : 'error', error: off ? 'Prompts are off in Settings (the journal-prompt lane).' : "Couldn't write this one." });
    });
  },
  journalToggleUse(kind) {
    const p = this.state.journalPick;
    if (!p || p.cards[kind]?.status !== 'ready') return;
    haptic('tick');
    const used = p.used.includes(kind) ? p.used.filter((k) => k !== kind) : [...p.used, kind];
    this.setState({ journalPick: { ...p, used } });
  },
  // Write: each chosen prompt is answered in turn, each saved as its own entry
  journalWrite() {
    const p = this.state.journalPick;
    if (!p) return;
    const queue = PROMPT_ORDER.filter((k) => p.used.includes(k) && p.cards[k].status === 'ready')
      .map((k) => ({ kind: k, tag: TAG_OF[k], prompt: p.cards[k].prompt, from: p.cards[k].meta?.from || (k === 'review' ? `Daily review: ${p.cards[k].meta?.concept || ''}` : null) }));
    if (!queue.length) return;
    haptic('commit');
    this.setState({ journalPick: { ...p, open: false }, journalStep: { queue, i: 0 } });
  },
  cancelJournalStep() { this.setState({ journalStep: null }); },

  // ---------------------------------------------------------------- saving
  submitJournalEntry() {
    const text = this.state.journalComposerText.trim();
    if (!text || this.state.journalSaveBusy) return;
    const step = this.state.journalStep;
    const cur = step ? step.queue[step.i] : null;
    const body = cur ? { tag: cur.tag, prompt: cur.prompt, promptFrom: cur.kind } : { tag: 'own' };
    const nextStep = step && step.i + 1 < step.queue.length ? { ...step, i: step.i + 1 } : null;
    const previousText = this.state.journalComposerText;
    haptic('commit');

    if (this.journalIsDemo()) {
      const { date, time } = nowParts();
      const novaId = `${date}T${time}-demo${Date.now() % 100000}`;
      const entry = { time, category: 'personal', by: 'Hayden', author: 'hayden', tag: body.tag, prompt: body.prompt || null, promptFrom: body.promptFrom || null, words: text, text, novaId, demoNew: true };
      this.setJournalDemoDays((days) => {
        const at = days.findIndex((d) => d.date === date);
        if (at === -1) return [{ date, sections: [entry] }, ...days];
        return days.map((d, i) => (i === at ? { ...d, sections: [...d.sections, entry] } : d));
      });
      this.setState({ journalComposerText: '', journalStep: nextStep, journalLanding: { ...this.state.journalLanding, [novaId]: 'busy' } });
      // vault first, then Notion: the glyph turns, says where it is, then rests
      setTimeout(() => this.setState((s) => ({ journalLanding: { ...s.journalLanding, [novaId]: 'wait' } })), 700);
      setTimeout(() => this.setState((s) => ({ journalLanding: { ...s.journalLanding, [novaId]: 'ok' } })), 1800);
      this.journalSavedReceipt(novaId, body.tag, cur);
      return;
    }

    const conn = getConnection();
    if (!conn) return;
    this.setState({ journalSaveBusy: true, journalSaveError: null, journalComposerText: '', journalStep: nextStep });
    api.addJournalEntry(conn, text, null, body).then(({ entry }) => {
      this.setState((s) => ({ journalSaveBusy: false, journalLanding: { ...s.journalLanding, [entry.novaId]: 'busy' } }));
      this.journalSavedReceipt(entry.novaId, body.tag, cur);
      this.refreshJournalEntries();
      // the server pushes to Notion a moment after the write; ask again then
      clearTimeout(this.notionPollT);
      this.notionPollT = setTimeout(() => this.refreshNotionJournal(), 4500);
    }).catch((e) => {
      if (isOfflineError(e)) {
        this.setState({ journalSaveBusy: false });
        this.enqueueOutbox('journal', text.slice(0, 44), { text, ...body });
        return;
      }
      // a real rejection must never eat what he wrote
      this.setState({ journalSaveBusy: false, journalComposerText: previousText, journalStep: step, journalSaveError: e.message });
    });
  },
  journalSavedReceipt(novaId, tag, cur) {
    const notion = this.state.liveNotionJournal?.state;
    const offline = this.state.connectionStatus === 'offline' || journalScenarioFromUrl().jdemo === 'offline';
    const where = offline ? 'Kept on this phone until your Mac answers' : this.journalIsDemo() || (notion && notion !== 'not-connected') ? 'Saved, Journal and Notion' : 'Saved to your Journal';
    tickReceipt({
      key: `journal:${novaId}`, label: 'entry', done: true,
      title: cur ? `Saved as ${TAG_WORD[tag]}${cur.kind === 'review' ? ', from the Daily review' : ''}` : where,
      undo: () => this.unsaveJournalEntry(novaId),
    });
  },
  unsaveJournalEntry(novaId) {
    if (this.journalIsDemo()) {
      this.setJournalDemoDays((days) => days.map((d) => ({ ...d, sections: d.sections.filter((s) => s.novaId !== novaId) })).filter((d) => d.sections.length));
      return;
    }
    const conn = getConnection();
    api.unsaveJournalEntry(conn, novaId).then(() => this.refreshJournalEntries()).catch((e) => this.toastMsg('Could not take it back: ' + e.message));
  },

  // ---------------------------------------------------------------- tags
  openJournalTagPop(novaId, rect) {
    haptic('tick');
    this.setState({ journalTagPop: { novaId, x: rect.left, y: rect.bottom } });
  },
  closeJournalTagPop() { this.setState({ journalTagPop: null }); },
  retagJournalEntry(novaId, tag, { receipt = true, was = null } = {}) {
    const find = (days) => { for (const d of days || []) for (const s of d.sections) if (s.novaId === novaId) return s; return null; };
    const cur = find(this.journalIsDemo() ? this.journalDemoDays() : this.state.liveJournalEntries);
    const prev = was || cur?.tag || 'own';
    this.setState({ journalTagPop: null });
    if (!cur || prev === tag) return;
    haptic('commit');
    const apply = (days) => days.map((d) => ({ ...d, sections: d.sections.map((s) => (s.novaId === novaId ? { ...s, tag } : s)) }));
    const undo = () => this.retagJournalEntry(novaId, prev, { receipt: false, was: tag });
    if (this.journalIsDemo()) {
      this.setJournalDemoDays(apply);
    } else {
      const conn = getConnection();
      this.setState((s) => ({ liveJournalEntries: apply(s.liveJournalEntries || []) }));
      api.retagJournalEntry(conn, novaId, tag).then(() => {
        clearTimeout(this.notionPollT);
        this.notionPollT = setTimeout(() => this.refreshNotionJournal(), 4500);
      }).catch((e) => { this.toastMsg('Could not retag: ' + e.message); this.refreshJournalEntries(); });
    }
    if (receipt) tickReceipt({ key: `jtag:${novaId}`, label: 'tag', done: true, title: `Tagged ${TAG_WORD[tag]}${this.journalIsDemo() || this.state.liveNotionJournal?.state === 'synced' ? ' · Notion too' : ''}`, undo });
    else this.toastMsg(`Back to ${TAG_WORD[tag]}`);
  },

  // ---------------------------------------------------------------- filters
  toggleJournalFilter(open) { this.setState((s) => ({ journalFilterOpen: open ?? !s.journalFilterOpen })); },
  setJournalTagFilter(t) { this.setState({ journalTagFilter: t }); },
  setJournalWho(w) { this.setState({ journalWho: w }); },
  clearJournalFilters() { this.setState({ journalTagFilter: 'all', journalWho: 'all', journalFilter: 'all' }); },

  // ---------------------------------------------------------------- Home
  // "Write on it": the Journal opens with today's Daily review prompt chosen
  openJournalFromReview() {
    this.navigate('journal');
    setTimeout(() => this.openJournalPicker({ preset: 'review' }), 60);
  },
};
