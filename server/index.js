import 'dotenv/config';
import { randomBytes } from 'node:crypto';
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

  app.use('/api', (req, res, next) => {
    const auth = req.headers.authorization || '';
    const provided = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (provided !== token) return res.status(401).json({ error: 'unauthorized' });
    next();
  });

  app.use('/api', notesRouter(vault));
  app.use('/api', calendarRouter());
  app.use('/api', ingestRouter(process.env.VAULT_PATH));
  app.use('/api', recipesRouter(process.env.VAULT_PATH));
  app.use('/api', shoppingListRouter(process.env.VAULT_PATH));
  app.use('/api', workoutsRouter(process.env.VAULT_PATH));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  });

  const port = Number(process.env.PORT || 4173);
  app.listen(port, () => console.log(`Nova OS server listening on :${port}`));
}

main();
