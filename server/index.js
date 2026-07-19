import 'dotenv/config';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Vault } from './lib/vault.js';
import { notesRouter } from './routes/notes.js';
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
import { voiceRouter } from './routes/voice.js';
import { moneyRouter } from './routes/money.js';
import { startMoneyImportScheduler } from './lib/moneyImport.js';
import { startCfoScheduler } from './lib/cfoReport.js';
import { startHealthInsightScheduler } from './lib/healthInsight.js';
import { startDispatchScheduler } from './lib/dispatch.js';
import { startCompostScheduler } from './lib/compost.js';
import { startTodoistScheduler } from './lib/todoistSync.js';
import { startGuardianScheduler } from './lib/guardian.js';

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
  app.use(express.json({ limit: '40mb' })); // headroom for a few base64-encoded recipe photos

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // Compare digests rather than the raw strings: timingSafeEqual needs
  // equal-length inputs, and hashing first removes any timing signal from
  // length or content.
  const tokenDigest = createHash('sha256').update(token).digest();
  app.use('/api', (req, res, next) => {
    const auth = req.headers.authorization || '';
    const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const providedDigest = createHash('sha256').update(provided).digest();
    if (!timingSafeEqual(providedDigest, tokenDigest)) return res.status(401).json({ error: 'unauthorized' });
    next();
  });

  app.use('/api', notesRouter(vault));
  app.use('/api', calendarRouter());
  app.use('/api', ingestRouter(process.env.VAULT_PATH));
  app.use('/api', recipesRouter(process.env.VAULT_PATH));
  app.use('/api', shoppingListRouter(process.env.VAULT_PATH));
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

  startHealthInsightScheduler(process.env.VAULT_PATH);
  startDispatchScheduler(process.env.VAULT_PATH);
  startCompostScheduler(process.env.VAULT_PATH);
  startTodoistScheduler(process.env.VAULT_PATH);
  startGuardianScheduler(process.env.VAULT_PATH);
  startMoneyImportScheduler(process.env.VAULT_PATH);
  startCfoScheduler();

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  });

  // Localhost-only by default: tailscale serve proxies from localhost, so the
  // https tailnet URL keeps working, and nothing on the LAN can reach the API
  // directly. Set HOST=0.0.0.0 in .env if something must hit the port raw
  // (e.g. an iOS Shortcut pointed at an IP address instead of the ts.net URL).
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '127.0.0.1';
  app.listen(port, host, () => console.log(`Nova OS server listening on ${host}:${port}`));
}

main();
