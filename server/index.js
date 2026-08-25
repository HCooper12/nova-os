import 'dotenv/config';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Vault } from './lib/vault.js';
import { slicesForPath } from './lib/writeSlices.js';
import { libraryRouter } from './routes/library.js';
import { parseWithEmptyValues } from './lib/jsonRepair.js';
import { notesRouter } from './routes/notes.js';
import { intentRouter } from './routes/intent.js';
import { calendarRouter } from './routes/calendar.js';
import { ingestRouter } from './routes/ingest.js';
import { recipesRouter } from './routes/recipes.js';
import { shoppingListRouter } from './routes/shoppingList.js';
import { workoutsRouter } from './routes/workouts.js';
import { journalRouter } from './routes/journal.js';
import { claudeCodeRouter } from './routes/claudeCode.js';
import { healthDataRouter } from './routes/healthData.js';
import { foodLogRouter } from './routes/foodLog.js';
import { inboxRouter } from './routes/inbox.js';
import { loopsRouter } from './routes/loops.js';
import { todosRouter } from './routes/todos.js';
import { stashRouter } from './routes/stash.js';
import { opsRouter } from './routes/ops.js';
import { modelPrefsRouter } from './routes/modelPrefs.js';
import { voiceRouter } from './routes/voice.js';
import { moneyRouter } from './routes/money.js';
import { subscribe } from './lib/events.js';
import { studioRouter } from './routes/studio.js';
import { profileRouter } from './routes/profile.js';
import { startMoneyImportScheduler } from './lib/moneyImport.js';
import { startCfoScheduler } from './lib/cfoReport.js';
import { startMealPrepScheduler } from './lib/mealPrep.js';
import { startFoodSuggestScheduler } from './lib/foodSuggest.js';
import { startTrainingCheckScheduler } from './lib/trainingCheck.js';
import { startCoachCadenceScheduler } from './lib/coachCadence.js';
import { startCoachReflectionScheduler } from './lib/coachReflection.js';
import { startWeekPlanScheduler } from './lib/weekPlan.js';
import { startHealthDropsScheduler } from './lib/healthDrops.js';
import { snapshotRouter } from './routes/snapshot.js';
import { startCalendarWatch } from './lib/calendarWatch.js';
import { startDailyReviewScheduler } from './lib/dailyReview.js';
import { startHealthInsightScheduler } from './lib/healthInsight.js';
import { startDispatchScheduler } from './lib/dispatch.js';
import { startCompostScheduler } from './lib/compost.js';
import { startTodoistScheduler } from './lib/todoistSync.js';
import { startGuardianScheduler } from './lib/guardian.js';
import { startOvernightScheduler } from './lib/overnight.js';
import { startTelegramBridge } from './lib/telegram.js';
import { overnightRouter } from './routes/overnight.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');

async function ensureApiToken() {
  if (process.env.API_TOKEN) return process.env.API_TOKEN;
  const token = randomBytes(24).toString('hex');
  await appendFile(envPath, `\nAPI_TOKEN=${token}\n`).catch(() => {});
  process.env.API_TOKEN = token;
  console.log('Generated a new API_TOKEN and saved it to server/.env:');
  console.log(`  ${token}`);
  console.log('Paste this into Nova OS → Settings on each device you connect.');
  return token;
}

async function main() {
  if (!process.env.VAULT_PATH) {
    console.error('VAULT_PATH is not set. Copy server/.env.example to server/.env and fill it in.');
    process.exit(1);
  }
  const token = await ensureApiToken();

  const vault = new Vault(process.env.VAULT_PATH);
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://hcooper12.github.io,http://localhost:5183,http://localhost:5173')
    .split(',')
    .map((s) => s.trim());

  const app = express();
  app.use(cors({ origin: allowedOrigins }));
  // BINARY UPLOADS MUST BEAT THE TEXT PARSERS. The global express.text below
  // claims application/octet-stream and decodes it as UTF-8 — which silently
  // mangles every byte of an EPUB or PDF and caps it at 1mb. A book uploaded
  // through it arrived as corrupted text and extracted to zero characters,
  // with no error anywhere: the request looked fine, the file was ruined.
  // Claiming the path first is the fix; the later parsers skip a body that
  // has already been read.
  app.use('/api/ingest/book-file', express.raw({ type: '*/*', limit: '120mb' }));
  // `verify` keeps the exact bytes: when strict JSON.parse rejects a body we
  // need the original text to attempt the empty-value repair below.
  app.use(express.json({ limit: '40mb', verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } })); // headroom for a few base64-encoded recipe photos
  // A missing HealthKit sample makes the Shortcut send `"restingHeartRate":,`
  // — one absent metric used to throw away the WHOLE morning push and answer
  // "internal error". An empty slot means "no reading", which is null here,
  // so repair those and carry on; anything else still fails, and now it fails
  // in words instead of a 500.
  app.use((err, req, res, next) => {
    if (!(err instanceof SyntaxError) || err.status !== 400 || !('body' in err)) return next(err);
    const repairedBody = req.rawBody ? parseWithEmptyValues(req.rawBody) : null;
    if (repairedBody) {
      console.log(`repaired ${repairedBody.repaired} empty value(s) in ${req.method} ${req.originalUrl} — a metric had no reading; stored as null`);
      req.body = repairedBody.value;
      return next();
    }
    console.log(`malformed JSON body on ${req.method} ${req.originalUrl}: ${err.message}`);
    return res.status(400).json({ error: `the request body is not valid JSON: ${err.message}`, text: 'Nova could not read that push — the body was not valid JSON.' });
  });
  // fallback for clients (iOS Shortcuts "File" bodies) that send JSON as
  // text/plain or octet-stream; the app itself always sends application/json
  app.use(express.text({ type: ['text/*', 'application/octet-stream'], limit: '1mb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // Compare digests rather than the raw strings: timingSafeEqual needs
  // equal-length inputs, and hashing first removes any timing signal from
  // length or content.
  // Request receipts. "Did the phone even reach the Mac?" was unanswerable
  // for a whole afternoon of Shortcut debugging — the same blind spot the
  // health pushlog was built to close. One line per request: what arrived,
  // what went back, how long it took, and whether the client hung up first.
  app.use('/api', (req, res, next) => {
    const started = Date.now();
    const from = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?';
    let closedEarly = false;
    req.on('aborted', () => { closedEarly = true; });
    res.on('finish', () => {
      // ISO timestamp first: the Stream (ops activity feed) parses these
      // lines back into a timeline, and a receipt without a time can't join
      console.log(`req ${new Date().toISOString()} ${req.method} ${req.originalUrl} ← ${from} → ${res.statusCode} in ${Date.now() - started}ms`);
    });
    res.on('close', () => {
      if (!res.writableEnded) console.log(`req ${req.method} ${req.originalUrl} ← ${from} → CLIENT HUNG UP after ${Date.now() - started}ms${closedEarly ? ' (aborted)' : ''}`);
    });
    next();
  });

  const tokenDigest = createHash('sha256').update(token).digest();
  app.use('/api', (req, res, next) => {
    const auth = req.headers.authorization || '';
    const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const providedDigest = createHash('sha256').update(provided).digest();
    if (!timingSafeEqual(providedDigest, tokenDigest)) {
      // Enough shape to diagnose a mismatch from the log, never enough to
      // leak the secret: length + first 4 chars. "He re-pasted it twice"
      // is the moment guessing has to stop.
      console.log(`auth reject ${req.method} ${req.path}: header ${req.headers.authorization ? `present, scheme "${String(req.headers.authorization).split(' ')[0]}", token len ${provided.length}, starts "${provided.slice(0, 4)}"` : 'MISSING entirely'}`);
      // the spoken surface must FAIL AUDIBLY: its Shortcut speaks the `text`
      // field, and a bare 401 left Siri silently mute for a whole morning
      if (req.path === '/ask/sync') return res.status(401).json({ error: 'unauthorized', text: 'Nova cannot verify this Shortcut — the token does not match. Recopy it from Settings.' });
      return res.status(401).json({ error: 'unauthorized' });
    }
    next();
  });

  // "a broadcast() every write path calls" — made TRUE at one chokepoint:
  // every successful mutating request nudges open apps (the sweep found ~half
  // the direct-write routes never broadcast, so a second device stayed stale
  // until its next poll). Silent list: job-start/poll endpoints where nothing
  // user-visible changed yet, and the 1.5s workout-draft pings which would
  // echo-refresh other devices mid-set.
  const BROADCAST_SILENT = [
    /^\/events/, /^\/workouts\/session-draft/, /^\/push\//, /^\/ask/, /^\/tts/,
    /^\/food-log\/scan/, /^\/recipes\/scan/, /^\/recipes\/tweak/, /^\/notes\/summary/,
    /^\/journal\/prompt/, /^\/shopping-list\/add-items\//, /^\/claude-code/,
  ];
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || BROADCAST_SILENT.some((re) => re.test(req.path))) return next();
    // Tag the nudge with the slices this path can have touched, so the client
    // pulls those few instead of a whole ~30-slice snapshot for one checkbox.
    // An untagged (unknown) path still means "resync everything" — the tag is
    // an optimisation, never a filter that can hide a change. req.path is read
    // HERE, before the handler runs: Express rewrites it inside routers.
    const slices = slicesForPath(req.path);
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        import('./lib/events.js').then(({ broadcast }) => broadcast('write', slices ? { slices } : null)).catch(() => {});
      }
    });
    next();
  });

  app.use('/api', intentRouter(vault)); // the front door — one input, deterministic routing
  app.use('/api', notesRouter(vault));
  app.use('/api', libraryRouter(process.env.VAULT_PATH, vault)); // the visual Library — read-only view over Sources
  app.use('/api', calendarRouter(process.env.VAULT_PATH));
  app.use('/api', ingestRouter(process.env.VAULT_PATH));
  app.use('/api', recipesRouter(process.env.VAULT_PATH));
  app.use('/api', shoppingListRouter(process.env.VAULT_PATH));
  app.use('/api', stashRouter(process.env.VAULT_PATH));
  app.use('/api', opsRouter(process.env.VAULT_PATH));
  app.use('/api', modelPrefsRouter());
  app.use('/api', overnightRouter(process.env.VAULT_PATH));
  app.use('/api', workoutsRouter(process.env.VAULT_PATH));
  app.use('/api', journalRouter(vault, process.env.VAULT_PATH));
  app.use('/api', claudeCodeRouter({ repoPath: path.resolve(__dirname, '..'), vaultPath: process.env.VAULT_PATH }));
  app.use('/api', healthDataRouter(process.env.VAULT_PATH));
  app.use('/api', foodLogRouter(process.env.VAULT_PATH));
  app.use('/api', inboxRouter(process.env.VAULT_PATH));
  app.use('/api', loopsRouter(process.env.VAULT_PATH));
  app.use('/api', todosRouter(process.env.VAULT_PATH));
  app.use('/api', voiceRouter(process.env.VAULT_PATH));
  app.use('/api', moneyRouter(process.env.VAULT_PATH));
  app.get('/api/events', (req, res) => subscribe(res));
  app.get('/api/push/key', async (req, res) => {
    const { getPublicKey } = await import('./lib/push.js');
    res.json({ key: await getPublicKey() });
  });
  app.post('/api/push/subscribe', async (req, res) => {
    try {
      const { addSubscription } = await import('./lib/push.js');
      res.json(await addSubscription(req.body?.subscription));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.post('/api/push/test', async (req, res) => {
    const { sendPush } = await import('./lib/push.js');
    res.json(await sendPush({ title: 'Nova', body: 'Notifications are live — this is what a waiting draft will feel like.', tag: 'test' }));
  });
  app.use('/api', studioRouter(process.env.VAULT_PATH));
  app.use('/api', profileRouter(process.env.VAULT_PATH));

  // Reap orphans BEFORE the schedulers tick: a record stuck in 'classifying'
  // from before the restart can never resolve and would block today's loops.
  import('./lib/inboxStore.js').then(({ reapOrphanedClassifying }) =>
    reapOrphanedClassifying().then(({ reaped }) => {
      if (reaped) console.log(`inbox reaper: flipped ${reaped} orphaned record(s) to error`);
    })
  ).catch((e) => console.error('inbox reaper failed:', e.message));
  // and expire stale time-value drafts (old dispatches/reviews/today-checks)
  // at boot + every 6h, so the pending queue holds only things worth a yes
  const expireTick = () => import('./lib/inbox.js').then(({ expireStaleDrafts }) =>
    expireStaleDrafts().then((n) => { if (n) console.log(`inbox expiry: ${n} stale time-value draft(s) marked expired`); })
  ).catch((e) => console.error('inbox expiry failed:', e.message));
  expireTick();
  setInterval(expireTick, 6 * 3600_000);
  // prune orphaned note-summary caches (deleted notes' files lived forever)
  import('./lib/noteSummaries.js').then(({ pruneStaleSummaries }) =>
    pruneStaleSummaries().then(({ pruned }) => {
      if (pruned) console.log(`summary cache: pruned ${pruned} stale file(s)`);
    })
  ).catch(() => {});

  startHealthInsightScheduler(process.env.VAULT_PATH);
  startCoachReflectionScheduler(process.env.VAULT_PATH);
  startDispatchScheduler(process.env.VAULT_PATH);
  startCompostScheduler(process.env.VAULT_PATH);
  startTodoistScheduler(process.env.VAULT_PATH);
  startGuardianScheduler(process.env.VAULT_PATH);
  startOvernightScheduler(process.env.VAULT_PATH);
  startTelegramBridge(process.env.VAULT_PATH);
  import('./lib/pulse.js').then(({ startPulseScheduler }) => startPulseScheduler(process.env.VAULT_PATH))
    .catch((e) => console.error('pulse scheduler failed to start:', e.message));
  startMoneyImportScheduler(process.env.VAULT_PATH);
  startCfoScheduler();
  startMealPrepScheduler(process.env.VAULT_PATH);
  startFoodSuggestScheduler(process.env.VAULT_PATH);
  startTrainingCheckScheduler(process.env.VAULT_PATH);
  startCoachCadenceScheduler(process.env.VAULT_PATH);
  startWeekPlanScheduler(process.env.VAULT_PATH);
  startHealthDropsScheduler(process.env.VAULT_PATH);
  startDailyReviewScheduler(process.env.VAULT_PATH);
  import('./lib/planToday.js').then(({ startPlanTodayScheduler }) => startPlanTodayScheduler(process.env.VAULT_PATH))
    .catch((e) => console.error('plan-today scheduler failed to start:', e.message));
  import('./lib/weeklyDebrief.js').then(({ startWeeklyDebriefScheduler }) => startWeeklyDebriefScheduler(process.env.VAULT_PATH))
    .catch((e) => console.error('weekly-debrief scheduler failed to start:', e.message));
  import('./lib/reminders.js').then(({ startRemindersScheduler }) => startRemindersScheduler())
    .catch((e) => console.error('reminders scheduler failed to start:', e.message));
  import('./lib/healthMirror.js').then(({ startHealthMirrorScheduler }) => startHealthMirrorScheduler(process.env.VAULT_PATH))
    .catch((e) => console.error('health-mirror scheduler failed to start:', e.message));
  import('./lib/patternScout.js').then(({ startPatternScoutScheduler }) => startPatternScoutScheduler(process.env.VAULT_PATH))
    .catch((e) => console.error('pattern-scout scheduler failed to start:', e.message));
  import('./lib/autonomyLedger.js').then(({ startAutonomyScheduler }) => startAutonomyScheduler())
    .catch((e) => console.error('autonomy scheduler failed to start:', e.message));
  import('./lib/distill.js').then(({ startDistillScheduler }) => startDistillScheduler(process.env.VAULT_PATH))
    .catch((e) => console.error('distill scheduler failed to start:', e.message));
  import('./lib/brainWeek.js').then(({ startBrainWeekScheduler }) => startBrainWeekScheduler(process.env.VAULT_PATH))
    .catch((e) => console.error('brain week scheduler failed to start:', e.message));
  if (process.env.ICLOUD_USERNAME && process.env.ICLOUD_APP_PASSWORD) {
    startCalendarWatch();
    // pay today's CalDAV round trip once NOW, so the first sync after a
    // restart answers from the warm cache instead of blocking ~10s on iCloud
    import('./lib/calendar.js').then(({ prewarmCalendarCache }) => prewarmCalendarCache()).catch(() => {});
  }

  app.use((err, req, res, next) => {
    // A lane the user switched off is not a fault — it is the setting doing
    // exactly what he asked. Saying "internal error" to that would be the
    // dishonest-degradation failure the whole model board exists to avoid,
    // so it answers 409 carrying the reason in words he can act on.
    if (err?.laneOff) {
      console.log(`lane "${err.laneOff}" is off — refused ${req.method} ${req.originalUrl}`);
      return res.status(409).json({ error: err.message, laneOff: err.laneOff });
    }
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  });

  // Localhost-only by default: tailscale serve proxies from localhost, so the
  // https tailnet URL keeps working, and nothing on the LAN can reach the API
  // directly. Set HOST=0.0.0.0 in .env if something must hit the port raw
  // (e.g. an iOS Shortcut pointed at an IP address instead of the ts.net URL).
  const port = Number(process.env.PORT || 4173);
  // one-round-trip sync for the client — self-proxies to this server's own
  // endpoints so every slice shape stays byte-identical to its route
  app.use('/api', snapshotRouter({ port, token }));

  const host = process.env.HOST || '127.0.0.1';
  app.listen(port, host, () => console.log(`Nova OS server listening on ${host}:${port}`));

  // Local voice: boot the Kokoro sidecar now (fire-and-forget) so the first
  // spoken reply never pays its ~8s model load. Failure is honest, not
  // fatal — /tts/status keeps answering and the client falls back.
  if (process.env.NOVA_TTS_LOCAL === '1') {
    import('./lib/ttsLocal.js')
      .then(async ({ ensureSidecar, warmSpokenLines }) => {
        await ensureSidecar();
        console.log('tts sidecar warm');
        await warmSpokenLines(); // previews + acks answer instantly from first tap
      })
      .catch((e) => console.log(`tts sidecar prewarm failed: ${e.message}`));
  }

  // Also listen directly on the Mac's tailnet address (plain HTTP): the
  // shortest road for iOS Shortcuts and the health push — no DNS, no serve
  // proxy, no TLS handshake, just the WireGuard tunnel (which already
  // encrypts) straight to the port. Still invisible to the public internet
  // (100.x routes only inside the tailnet) and still behind the bearer
  // token. Tailscale can be down when we boot (it was, the morning this
  // was written) — so keep trying until the address exists, honestly
  // logging each state.
  const { execFile } = await import('node:child_process');
  const tailnetBind = () => new Promise((resolve) => {
    execFile('tailscale', ['ip', '-4'], { timeout: 5000 }, (err, stdout) => {
      const ip = String(stdout || '').trim().split('\n')[0];
      if (err || !/^100\./.test(ip)) return resolve(false);
      const s = app.listen(port, ip, () => console.log(`Nova OS server also on tailnet http://${ip}:${port}`));
      s.on('error', (e) => { console.error(`tailnet bind failed: ${e.message}`); resolve(false); });
      s.on('listening', () => resolve(true));
    });
  });
  if (!(await tailnetBind())) {
    console.log('tailnet bind pending — tailscale not up yet, retrying every 60s');
    const retry = setInterval(async () => { if (await tailnetBind()) clearInterval(retry); }, 60_000);
  }
}

main();
