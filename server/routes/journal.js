import { Router } from 'express';
import { addEntry, listEntries, updateEntry, getEntry, JOURNAL_TAGS } from '../lib/journal.js';
import { startPromptJob, getPromptJob, PROMPT_KINDS, readLifeSources, pickLifeSource, reviewConcept, LIFE_SOURCES } from '../lib/journalPrompt.js';
import { syncStatus, syncOnce, kickSync, unsaveEntry } from '../lib/notionJournal.js';

function sampleConcepts(pages, n) {
  const pool = pages.filter((p) => p.type === 'concept' || p.type === 'topic');
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n).map((p) => ({ title: p.title, excerpt: (p.paragraphs[0] || '').slice(0, 160) }));
}

export function journalRouter(vault, vaultPath, deps = {}) {
  const router = Router();
  const kick = deps.kickSync || kickSync;

  router.get('/journal/entries', async (req, res, next) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const entries = await listEntries(vaultPath, { limit });
      res.json({ entries });
    } catch (err) {
      next(err);
    }
  });

  router.post('/journal/entries', async (req, res) => {
    try {
      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!text) return res.status(400).json({ error: 'text is required' });
      const linkedTitle = req.body?.linkedTitle ? String(req.body.linkedTitle).trim() : undefined;
      const category = req.body?.category ? String(req.body.category) : undefined; // addEntry validates; defaults personal
      const label = req.body?.label ? String(req.body.label).slice(0, 60) : undefined;
      // The composer and the reflect card send his own typing (no label); a
      // labelled post is a receipt the app composed ("Focus block"), whose
      // author journal.js reads from the label. Never a client-chosen author.
      const author = label ? undefined : 'hayden';
      // his tag and the prompt he answered (mockup 95); journal.js keeps
      // them only on his own entries
      const tag = JOURNAL_TAGS.includes(req.body?.tag) ? req.body.tag : undefined;
      const prompt = req.body?.prompt ? String(req.body.prompt).slice(0, 600) : undefined;
      const promptFrom = PROMPT_KINDS.includes(req.body?.promptFrom) ? req.body.promptFrom : undefined;
      const entry = await addEntry(vaultPath, { text, author, linkedTitle, category, label, tag, prompt, promptFrom });
      // his words go to Notion soon after he writes (Nova's log never does)
      if (entry.author === 'hayden') kick(vaultPath);
      res.json({ entry });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // a retag (one tap, with Undo: the Undo is the same call with the old tag)
  router.patch('/journal/entries/:novaId', async (req, res) => {
    try {
      const tag = req.body?.tag;
      if (!JOURNAL_TAGS.includes(tag)) return res.status(400).json({ error: 'tag must be own, life or deep' });
      const was = await getEntry(vaultPath, req.params.novaId);
      if (!was) return res.status(404).json({ error: 'that entry is no longer in your journal' });
      await updateEntry(vaultPath, req.params.novaId, { tag });
      kick(vaultPath);
      res.json({ novaId: req.params.novaId, tag, previousTag: was.tag || 'own' });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // the Undo on a save: out of the vault, and the Notion copy archived
  router.delete('/journal/entries/:novaId', async (req, res) => {
    try {
      res.json(await unsaveEntry(vaultPath, req.params.novaId));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // THE THREE PROMPTS, each written at the tap (lib/journalPrompt.js)
  router.post('/journal/prompts', async (req, res) => {
    try {
      const kind = req.body?.kind;
      if (!PROMPT_KINDS.includes(kind)) return res.status(400).json({ error: 'kind must be deep, review or life' });
      const avoid = req.body?.avoid ? String(req.body.avoid).slice(0, 400) : null;
      if (kind === 'deep') return res.json({ jobId: startPromptJob({ kind, avoid }, { kind }), meta: { kind } });
      if (kind === 'review') {
        const c = await reviewConcept(vaultPath, vault).catch(() => null);
        if (!c) return res.json({ empty: true, meta: { kind }, reason: 'No Daily review concept today. Add concepts to your wiki and they arrive here.' });
        const meta = { kind, concept: c.concept };
        return res.json({ jobId: startPromptJob({ kind, concept: c.concept, gist: c.gist, avoid }, meta), meta });
      }
      const sources = await readLifeSources(vaultPath, vault);
      const turn = Number(req.body?.turn) || 0;
      const src = pickLifeSource(sources, turn);
      const lit = Object.fromEntries(LIFE_SOURCES.map((k) => [k, !!sources[k]]));
      if (!src) return res.json({ empty: true, meta: { kind, sources: lit }, reason: 'Nothing Nova reads about your life has anything in it today.' });
      const meta = { kind, source: src, from: sources[src].from, sources: lit };
      res.json({ jobId: startPromptJob({ kind, source: src, facts: sources[src].facts, avoid }, meta), meta });
    } catch (err) {
      res.status(/off/i.test(err.message) ? 409 : 400).json({ error: err.message });
    }
  });

  router.post('/journal/prompt', async (req, res, next) => {
    try {
      const seedTitle = req.body?.seedTitle ? String(req.body.seedTitle).trim() : null;
      const seedExcerpt = req.body?.seedExcerpt ? String(req.body.seedExcerpt).trim() : null;
      let seed;
      if (seedTitle) {
        seed = { seedTitle, seedExcerpt };
      } else {
        const pages = await vault.listPages();
        seed = { sample: sampleConcepts(pages, 6) };
      }
      const jobId = startPromptJob(seed);
      res.json({ jobId });
    } catch (err) {
      next(err);
    }
  });

  router.get('/journal/prompt/:jobId', (req, res) => {
    const job = getPromptJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'job not found' });
    res.json({ status: job.status, result: job.result, error: job.error });
  });

  // NOTION: the page's honest status, and a pass on demand (Retry)
  router.get('/journal/notion', async (req, res, next) => {
    try { res.json(await syncStatus(vaultPath)); } catch (err) { next(err); }
  });
  router.post('/journal/notion/sync', async (req, res, next) => {
    try {
      syncOnce(vaultPath).catch(() => {});
      res.json(await syncStatus(vaultPath));
    } catch (err) { next(err); }
  });

  return router;
}
