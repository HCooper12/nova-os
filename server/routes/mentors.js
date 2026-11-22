import { Router } from 'express';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { searchChannels } from '../lib/mentorDiscover.js';
import {
  previewPerson, followPerson, listPeople, getPerson, setStatus, artDir, SCOPES,
} from '../lib/mentorPeople.js';
import { countsFor, listSources, backfillFromVault } from '../lib/mentorRegister.js';
import { readClaudeUsage } from '../lib/claudeUsage.js';
import {
  queueStatus, pauseQueue, allowReading, setCeilings, retrySource, retryWeave,
} from '../lib/mentorQueue.js';
import { getBook, listWeaves, undoWeave, weekSummary, listRaised, setRaisedStatus, RAISED_STATUSES } from '../lib/mentorWeave.js';

// MENTORS: the people Nova studies (lib/mentorPeople.js), the register of
// everything he has read from them (lib/mentorRegister.js), and finding a new
// person (lib/mentorDiscover.js). Part 1 of the build: discovery, following
// and the pipeline map. Nothing here calls a model or writes to the vault.
//
//   POST /mentors/find           {query}               up to 5 channels
//   POST /mentors/preview        {channelUrl}          the draft; saves nothing
//   POST /mentors/follow         {channelUrl, scope}   {person, counts}
//   GET  /mentors                                      everyone, with counts
//   GET  /mentors/:id            {person, counts, catalogue, latest}
//   POST /mentors/:id/pause|resume
//   POST /mentors/backfill       the vault's Sources into the register (once)
//   GET  /mentors/art/:file      a cached portrait or banner
//   GET  /mentors/usage          how much of his Claude plan is used
//   GET  /mentors/queue          what the queue is doing, per person (part 2)
//   POST /mentors/queue/pause    {paused}
//   POST /mentors/queue/ceilings {session, week}   percent of his plan
//   POST /mentors/:id/reading    {allowed}             his go for the paid read
//   POST /mentors/source/retry   {key}                 a held source tried again
//   GET  /mentors/:id/book       the Book (part 3), the data the vault page renders
//   GET  /mentors/:id/weaves     every weave batch of his, newest first
//   POST /mentors/weave/undo     {batchId}             one batch taken back out
//   GET  /mentors/:id/week       what was woven in the last 7 days, counted
//   GET  /mentors/:id/raised     what was raised for his review, every status, newest first
//   POST /mentors/:id/raised/:rid {status}             new, kept, dismissed or research
//
// A failure of YouTube, Apple, Open Library or a tool is a 502 that says which
// and what it answered (lib/mentorDiscover.js marks those); anything else of
// ours is a 500, a bad request a 400, an unknown person a 404.

const ART_URL = '/api/mentors/art/';
const withArtUrls = (p) => (p ? { ...p, art: { avatar: p.art?.avatar ? ART_URL + p.art.avatar : null, banner: p.art?.banner ? ART_URL + p.art.banner : null } } : p);

// one letter per catalogue row, so 2,338 rows stay small
const CODE = { found: 'f', transcript: 't', read: 'r', woven: 'w' };
const HOLD = { refused: 'x', failed: 'x', duplicate: 'd', held: 'h', skipped: 's' };
const codeOf = (s) => (s.working ? 'k' : s.hold ? (HOLD[s.hold.state] || 'h') : (CODE[s.stage] || 'f'));

// newest first: dated sources by date, then the undated ones in the order the
// channel listed them (a flat listing is newest first and has no dates)
function newestFirst(list) {
  const dated = list.filter((s) => s.publishedAt).sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));
  return [...dated, ...list.filter((s) => !s.publishedAt)];
}

export function mentorsRouter(vaultPath) {
  const router = Router();

  const fail = (res, err) => {
    const status = err?.discovery ? 502 : 500;
    res.status(status).json({ error: err?.message || 'something failed and gave no reason' });
  };

  router.post('/mentors/find', async (req, res) => {
    try {
      const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
      if (!query) return res.status(400).json({ error: 'send a name, a channel link or an @handle to look for' });
      res.json({ candidates: await searchChannels(query) });
    } catch (err) { fail(res, err); }
  });

  router.post('/mentors/preview', async (req, res) => {
    try {
      const channelUrl = typeof req.body?.channelUrl === 'string' ? req.body.channelUrl.trim() : '';
      if (!channelUrl) return res.status(400).json({ error: 'send the channel link to preview' });
      const draft = await previewPerson({ channelUrl });
      res.json({ ...draft, person: withArtUrls(draft.person) });
    } catch (err) {
      if (/channel address is needed/.test(err?.message || '')) return res.status(400).json({ error: err.message });
      fail(res, err);
    }
  });

  router.post('/mentors/follow', async (req, res) => {
    try {
      const channelUrl = typeof req.body?.channelUrl === 'string' ? req.body.channelUrl.trim() : '';
      if (!channelUrl) return res.status(400).json({ error: 'send the channel link to follow' });
      const scope = req.body?.scope ?? 'everything';
      if (!SCOPES.includes(scope)) return res.status(400).json({ error: `scope must be one of ${SCOPES.join(', ')}` });
      const person = await followPerson({ channelUrl, scope });
      res.json({ person: withArtUrls(person), counts: await countsFor(person.id) });
    } catch (err) {
      if (/channel address is needed/.test(err?.message || '')) return res.status(400).json({ error: err.message });
      fail(res, err);
    }
  });

  router.get('/mentors', async (req, res) => {
    try {
      const people = await listPeople();
      res.json({ people: await Promise.all(people.map(async (p) => ({ ...withArtUrls(p), counts: await countsFor(p.id) }))) });
    } catch (err) { fail(res, err); }
  });

  router.get('/mentors/usage', async (req, res) => {
    try { res.json({ usage: await readClaudeUsage() }); } catch (err) { fail(res, err); }
  });

  router.get('/mentors/queue', async (req, res) => {
    try { res.json(await queueStatus()); } catch (err) { fail(res, err); }
  });

  router.post('/mentors/queue/pause', async (req, res) => {
    try {
      if (typeof req.body?.paused !== 'boolean') return res.status(400).json({ error: 'send paused as true or false' });
      await pauseQueue(req.body.paused);
      res.json(await queueStatus());
    } catch (err) { fail(res, err); }
  });

  router.post('/mentors/queue/ceilings', async (req, res) => {
    try {
      const { session, week } = req.body || {};
      if (session === undefined && week === undefined) return res.status(400).json({ error: 'send session, week, or both, as a percent of his plan' });
      res.json({ ceilings: await setCeilings({ session, week }) });
    } catch (err) {
      if (/percent/.test(err?.message || '')) return res.status(400).json({ error: err.message });
      fail(res, err);
    }
  });

  router.post('/mentors/source/retry', async (req, res) => {
    try {
      const key = typeof req.body?.key === 'string' ? req.body.key.trim() : '';
      if (!key) return res.status(400).json({ error: 'send the key of the source to try again' });
      res.json({ source: await retrySource(key) });
    } catch (err) {
      if (/no source with key/.test(err?.message || '')) return res.status(404).json({ error: err.message });
      fail(res, err);
    }
  });

  router.post('/mentors/backfill', async (req, res) => {
    try {
      if (!vaultPath) return res.status(500).json({ error: 'the vault path is not set on this server (VAULT_PATH), so there is nothing to read the Sources pages from' });
      res.json(await backfillFromVault(vaultPath));
    } catch (err) { fail(res, err); }
  });

  // a plain file name that exists in the art folder, nothing else
  router.get('/mentors/art/:file', async (req, res) => {
    const file = String(req.params.file || '');
    if (!file || file !== path.basename(file) || file.includes('..') || file.startsWith('.') || /[\\/]/.test(file) || file.includes('\0')) {
      return res.status(404).json({ error: 'no such picture' });
    }
    const full = path.join(artDir(), file);
    try {
      if (!(await stat(full)).isFile()) throw new Error('not a file');
    } catch { return res.status(404).json({ error: 'no such picture' }); }
    res.sendFile(full, { headers: { 'Cache-Control': 'private, max-age=86400' } }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'no such picture' });
    });
  });

  router.get('/mentors/:id', async (req, res) => {
    try {
      const person = await getPerson(req.params.id);
      if (!person) return res.status(404).json({ error: `no person called "${req.params.id}" is followed or known` });
      const tier1 = newestFirst(await listSources({ personId: person.id, tier: 1 }));
      const idOf = (s) => (s.key.startsWith('yt:') ? s.key.slice(3) : s.key);
      const q = (await queueStatus()).people.find((x) => x.id === person.id);
      res.json({
        doing: q?.doing || 'idle',
        waiting: q?.waiting || null,
        person: withArtUrls(person),
        counts: await countsFor(person.id),
        catalogue: tier1.map((s) => [idOf(s), s.durationSec, codeOf(s)]),
        latest: tier1.slice(0, 6).map((s) => ({ id: idOf(s), title: s.title, durationSec: s.durationSec, publishedAt: s.publishedAt })),
      });
    } catch (err) { fail(res, err); }
  });

  // a weave that failed waits an hour, and after three failures waits for this
  router.post('/mentors/:id/weave/retry', async (req, res) => {
    try {
      if (!(await getPerson(req.params.id))) return res.status(404).json({ error: `no person called "${req.params.id}" is followed or known` });
      await retryWeave(req.params.id);
      res.json(await queueStatus());
    } catch (err) { fail(res, err); }
  });

  router.post('/mentors/:id/reading', async (req, res) => {
    try {
      if (!(await getPerson(req.params.id))) return res.status(404).json({ error: `no person called "${req.params.id}" is followed or known` });
      if (typeof req.body?.allowed !== 'boolean') return res.status(400).json({ error: 'send allowed as true or false' });
      res.json({ id: req.params.id, readingAllowed: await allowReading(req.params.id, req.body.allowed) });
    } catch (err) { fail(res, err); }
  });

  const known = async (req, res) => {
    if (await getPerson(req.params.id)) return true;
    res.status(404).json({ error: `no person called "${req.params.id}" is followed or known` });
    return false;
  };

  router.get('/mentors/:id/book', async (req, res) => {
    try {
      if (!(await known(req, res))) return;
      res.json({ book: await getBook(req.params.id) });
    } catch (err) { fail(res, err); }
  });

  router.get('/mentors/:id/weaves', async (req, res) => {
    try {
      if (!(await known(req, res))) return;
      res.json({ weaves: await listWeaves(req.params.id) });
    } catch (err) { fail(res, err); }
  });

  router.get('/mentors/:id/week', async (req, res) => {
    try {
      if (!(await known(req, res))) return;
      res.json(await weekSummary(req.params.id));
    } catch (err) { fail(res, err); }
  });

  router.get('/mentors/:id/raised', async (req, res) => {
    try {
      if (!(await known(req, res))) return;
      res.json({ raised: await listRaised(req.params.id) });
    } catch (err) { fail(res, err); }
  });

  router.post('/mentors/:id/raised/:rid', async (req, res) => {
    try {
      if (!(await known(req, res))) return;
      const status = typeof req.body?.status === 'string' ? req.body.status : '';
      if (!RAISED_STATUSES.includes(status)) return res.status(400).json({ error: `send status as one of ${RAISED_STATUSES.join(', ')}` });
      if (!vaultPath) return res.status(500).json({ error: 'the vault path is not set on this server (VAULT_PATH), so there is no mentor page to update' });
      res.json({ raised: await setRaisedStatus(req.params.id, req.params.rid, status, { vaultPath }) });
    } catch (err) {
      if (err?.badRequest) return res.status(400).json({ error: err.message });
      if (err?.notFound) return res.status(404).json({ error: err.message });
      if (err?.refused) return res.status(409).json({ error: err.message });
      fail(res, err);
    }
  });

  router.post('/mentors/weave/undo', async (req, res) => {
    try {
      const batchId = typeof req.body?.batchId === 'string' ? req.body.batchId.trim() : '';
      if (!batchId) return res.status(400).json({ error: 'send the batchId of the weave to undo' });
      if (!vaultPath) return res.status(500).json({ error: 'the vault path is not set on this server (VAULT_PATH), so there is no vault to undo in' });
      res.json(await undoWeave(batchId, { vaultPath }));
    } catch (err) {
      if (err?.notFound) return res.status(404).json({ error: err.message });
      if (err?.refused) return res.status(409).json({ error: err.message });
      fail(res, err);
    }
  });

  for (const [verb, status] of [['pause', 'paused'], ['resume', 'following']]) {
    router.post(`/mentors/:id/${verb}`, async (req, res) => {
      try {
        if (!(await getPerson(req.params.id))) return res.status(404).json({ error: `no person called "${req.params.id}" is followed or known` });
        res.json({ person: withArtUrls(await setStatus(req.params.id, status)) });
      } catch (err) { fail(res, err); }
    });
  }

  return router;
}
