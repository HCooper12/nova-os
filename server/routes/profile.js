import { Router } from 'express';
import { getProfile, setProfile, PROFILE_SECTIONS, localDay } from '../lib/profile.js';
import { fileProfileFact } from '../lib/inbox.js';
import { profileTalkTurn, talkOpener } from '../lib/profileTalk.js';
import { plainCause } from '../lib/plainCause.js';
import { PROFILE_OPTIONS, isOption, toggleOptionText } from '../lib/profileOptions.js';
import {
  pickQuestion, loadInterviewState, recordAsked, recordTurn, followUpsOn, questionById, recordResume, resumable,
} from '../lib/profileQuestions.js';
import { listRecords } from '../lib/inboxStore.js';
import { PROFILE_READERS } from '../lib/profileReach.js';

const MODES = ['interview', 'section'];
const START_MODES = [...MODES, 'resume'];

// the question Nova's reply ends with: the bank question when he moved on,
// else the follow-up he asked (its last sentence ending in "?")
function askedIn(say) {
  const qs = String(say || '').match(/[^.!?]*\?/g);
  return qs ? qs[qs.length - 1].trim() : null;
}
// a section named the way he would say it out loud
const SPOKEN = {
  about: 'you', story: 'your story', toward: "what you're working toward", values: 'what matters to you',
  training: 'your training', fuel: 'how you eat', work: 'your work', mind: 'how you think and learn',
  people: 'the people in your life', life: 'your life outside work', talk: 'how I should talk to you', taste: 'your taste',
};

// `deps.run` stubs the model lane in tests (lib/profileTalk.js's seam).
export function profileRouter(vaultPath, deps = {}) {
  const router = Router();

  router.get('/profile', async (req, res, next) => {
    try {
      res.json({ profile: await getProfile(vaultPath) });
    } catch (err) {
      next(err);
    }
  });

  router.put('/profile', async (req, res) => {
    try {
      res.json({ profile: await setProfile(vaultPath, req.body || {}) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // his own edit of one section: filed on the rails (kind 'profile-fact'),
  // so the Inbox can undo it like any other filing
  router.put('/profile/section', async (req, res) => {
    const { key, text, confirm, append } = req.body || {};
    if (!PROFILE_SECTIONS.some((s) => s.key === key)) {
      return res.status(400).json({ error: `there is no "${key}" section on the profile page` });
    }
    if (typeof text !== 'string' && !confirm) return res.status(400).json({ error: 'text is required' });
    // append (27 Oct 2026): one more line, `- text (said <date>)`, the way
    // the conversation adds a fact; a drafted section stays drafted
    if (append && (typeof text !== 'string' || !text.trim())) return res.status(400).json({ error: 'nothing to add to the section' });
    try {
      const rec = await fileProfileFact(vaultPath, {
        key,
        text: typeof text === 'string' ? (append ? text.replace(/\s+/g, ' ').trim().slice(0, 400) : text.slice(0, 4000)) : '',
        confirm: !!confirm && !append,
        append: !!append,
        said: append ? localDay() : null,
        source: 'profile',
      });
      res.json({ profile: await getProfile(vaultPath), recordId: rec.id });
    } catch (e) {
      res.status(400).json({ error: plainCause(e) });
    }
  });

  // ONE OPTION, chosen or taken off (27 Oct 2026). The option is a line
  // `- <phrase>` in its section (lib/profileOptions.js, a shared format).
  // Code computes the new text; it files on the rails with Undo, and a
  // drafted section STAYS drafted (his word on one line is not a yes to the
  // whole draft).
  router.put('/profile/option', async (req, res) => {
    const { key, phrase, on } = req.body || {};
    if (!PROFILE_SECTIONS.some((s) => s.key === key)) {
      return res.status(400).json({ error: `there is no "${key}" section on the profile page` });
    }
    if (typeof phrase !== 'string' || !isOption(key, phrase)) {
      return res.status(400).json({ error: `"${phrase}" is not one of the options for that section` });
    }
    try {
      const canon = PROFILE_OPTIONS[key].find((p) => p.trim().toLowerCase() === phrase.trim().toLowerCase());
      const before = await getProfile(vaultPath);
      const cur = before?.sections?.find((s) => s.key === key)?.text || '';
      const next = toggleOptionText(cur, canon, !!on);
      if (next === cur) return res.json({ profile: before, recordId: null });
      const rec = await fileProfileFact(vaultPath, {
        key, text: next, confirm: false, append: false, keepDraft: true, option: { phrase: canon, on: !!on }, source: 'profile',
      });
      res.json({ profile: await getProfile(vaultPath), recordId: rec.id });
    } catch (e) {
      res.status(400).json({ error: plainCause(e) });
    }
  });

  // WHO READS IT (27 Oct 2026, his ask: "ensure Nova is undoubtedly referring
  // to and using all of this information"). The list is the same one the
  // test suite checks against every module's source (lib/profileReach.js).
  router.get('/profile/reach', (req, res) => {
    res.json({ readers: PROFILE_READERS.map(({ id, label, talks }) => ({ id, label, talks })) });
  });

  // THE OPENER. No mode: the old counted line. 'interview': one short line
  // and a question code picked from the bank; 'section': a question about
  // that one section. No model either way; the question is recorded as asked.
  // RESUME (27 Oct 2026): 'resume' picks up the question still on the table
  // when it is under 14 days old, in code's words; otherwise it is a fresh
  // 'interview'. Every interview or section start counts one session.
  router.post('/profile/talk/start', async (req, res) => {
    let { mode = null } = req.body || {};
    const { key = null } = req.body || {};
    if (mode !== null && !START_MODES.includes(mode)) return res.status(400).json({ error: `mode must be one of: ${START_MODES.join(', ')}` });
    const section = mode === 'section' ? PROFILE_SECTIONS.find((s) => s.key === key) : null;
    if (mode === 'section' && !section) return res.status(400).json({ error: `there is no "${key}" section on the profile page` });
    try {
      const profile = await getProfile(vaultPath);
      if (!mode) return res.json({ say: talkOpener(profile), profile, mode: null, key: null, questionId: null });
      const state = await loadInterviewState();
      if (mode === 'resume') {
        const p = resumable(state);
        if (p) {
          await recordResume({ sessionStarted: true, lastTurnRecordIds: [] });
          return res.json({
            say: `Picking up where we left off. ${p.q}`, profile, mode: 'interview', key: p.key, questionId: p.questionId, resumed: true,
          });
        }
        mode = 'interview';
      }
      const q = pickQuestion({ profile, state, mode, key: section?.key || null });
      let say;
      if (mode === 'interview') {
        say = q ? `Let's get to know each other. ${q.q}` : "I've asked you everything I have for now. What else would you like me to know?";
      } else {
        const topic = SPOKEN[section.key] || section.title;
        say = q ? `Let's talk about ${topic}. ${q.q}` : `Let's talk about ${topic}. What would you like me to know?`;
      }
      if (q) await recordAsked(q.id);
      await recordResume({
        sessionStarted: true, lastTurnRecordIds: [],
        pending: q ? { questionId: q.id, q: q.q, key: q.key, askedAt: new Date().toISOString() } : null,
      });
      res.json({ say, profile, mode, key: section?.key || q?.key || null, questionId: q?.id || null, resumed: false });
    } catch (e) {
      res.status(500).json({ error: plainCause(e) });
    }
  });

  // WHERE THE INTERVIEW STANDS: the question waiting for him (when young
  // enough to resume), what the talk filed this week, how many sessions.
  router.get('/profile/interview', async (req, res) => {
    try {
      const state = await loadInterviewState();
      const p = resumable(state);
      const weekAgo = Date.now() - 7 * 86400000;
      const records = await listRecords();
      const learnedThisWeek = records.filter((r) => r?.kind === 'profile-fact' && r.source === 'profile-talk' && r.status === 'filed'
        && !r.decision?.payload?.confirm && new Date(r.createdAt).getTime() >= weekAgo).length;
      res.json({ pending: p ? { q: p.q, key: p.key, askedAt: p.askedAt } : null, learnedThisWeek, sessions: state.sessions });
    } catch (e) {
      res.status(500).json({ error: plainCause(e) });
    }
  });

  router.post('/profile/talk', async (req, res) => {
    const { history, text, mode = null, questionId = null } = req.body || {};
    const retract = req.body?.retract === true;
    const continued = !retract && req.body?.continued === true;
    if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'Say something first' });
    if (mode !== null && !MODES.includes(mode)) return res.status(400).json({ error: `mode must be one of: ${MODES.join(', ')}` });
    try {
      let nextQuestion = null;
      let followUps = 0;
      const before = await loadInterviewState();
      // a correction or a continuation answers the question the last answer was for
      const onTable = questionById((retract || continued) ? (before.lastTurnQuestionId || questionId) : questionId);
      if (mode) {
        // the next question, by code: in section mode the section of the
        // question on the table (or the one named), never one asked lately
        const key = mode === 'section' ? (PROFILE_SECTIONS.find((s) => s.key === req.body?.key)?.key || onTable?.key || null) : null;
        const state = await loadInterviewState();
        followUps = followUpsOn(state, onTable?.id || null);
        if (mode === 'interview' || key) {
          nextQuestion = pickQuestion({ profile: await getProfile(vaultPath), state, mode, key });
        }
      }
      const out = await profileTalkTurn(vaultPath, {
        history: Array.isArray(history) ? history : [], text,
        mode, questionId: onTable?.id || null, nextQuestion, followUps,
        retract, continued, lastTurnRecordIds: before.lastTurnRecordIds,
      }, deps.run ? { run: deps.run } : {});
      if (out.error) {
        // an explicit retract already took the facts off: never twice
        if (retract) { try { await recordResume({ lastTurnRecordIds: [] }); } catch { /* best effort */ } }
        return res.status(502).json({ error: plainCause(out.cause || out.error) });
      }
      if (mode && out.questionId) {
        try { await recordTurn({ questionId: out.questionId, movedOn: out.movedOn }); } catch { /* the turn still reaches him */ }
      }
      try {
        const filedIds = [...out.learned, ...out.confirmed].map((f) => f.recordId).filter(Boolean);
        // a continuation adds to the last answer, so a correction takes both back
        const keep = continued ? [...before.lastTurnRecordIds, ...filedIds] : filedIds;
        const asked = out.done ? null : (out.movedOn ? questionById(out.questionId)?.q : askedIn(out.say));
        const pq = questionById(out.questionId);
        await recordResume({
          lastTurnRecordIds: keep,
          lastTurnQuestionId: onTable?.id || null,
          ...(mode ? { pending: asked ? { questionId: pq?.id || null, q: asked, key: pq?.key || null, askedAt: new Date().toISOString() } : null } : {}),
        });
      } catch { /* the turn still reaches him */ }
      res.json({ ...out, mode });
    } catch (e) {
      // a filing failed after the model answered
      res.status(500).json({ error: plainCause(e) });
    }
  });

  return router;
}
