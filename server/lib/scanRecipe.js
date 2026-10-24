import { keptBecause } from './plainCause.js';
import { spawn } from 'node:child_process';
import { firstBalancedObjectMatch, parseModelJson } from './jsonSalvage.js';
import { rm, mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createRecord, updateRecord } from './inboxStore.js';
import { backupFile } from './backup.js';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { modelFor, laneEnabled, laneOffError, effortArgs } from './modelPrefs.js';
import { boundaryArgs } from './spawnBoundary.js';
import { parseEnvelope } from './modelSpend.js';

// Recipe/label extraction is OCR-shaped work the human always reviews before
// saving, so it runs on the fast model by default. Change it in Settings →
// Claude models; NOVA_SCAN_MODEL still seeds the default.
// launchd services don't inherit the interactive shell's PATH — use the absolute path.
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const CATEGORIES = ['CORE DAILY MEALS', 'ROTATION / SWAP MEALS', 'TREATS'];
const jobs = new Map();

const SCHEMA_PROMPT = `You are extracting a recipe from one or more photos — a nutrition label, a recipe card, an ingredient list, cooking steps, or a social media recipe screenshot. Read every image at the paths listed below. Extract:
- name: a short, natural recipe name
- category: one of "CORE DAILY MEALS", "ROTATION / SWAP MEALS", "TREATS" — guess based on how it reads (a filling everyday meal = Core, an occasional swap = Rotation, a dessert/snack = Treats)
- makes: optional serving size / yield description, or null if not shown
- macros: {p, c, f, kcal} — protein/carbs/fat in grams, kcal as a whole number. If the label only shows kJ energy (common on Australian labels), convert to kcal by dividing by 4.184 and round to the nearest whole number.
- ingredients: array of ingredient strings, one per ingredient, as shown
- method: array of method step strings, one per step, in order (if no method is shown, e.g. a plain nutrition label, return an empty array)

If a field genuinely isn't visible across the image(s), make your best reasonable estimate from what is visible rather than leaving it blank or zero.

Output ONLY a single JSON object with exactly these keys: name, category, makes, macros, ingredients, method. No markdown, no code fences, no commentary before or after — just the raw JSON object.`;

function normalizeResult(parsed) {
  const macros = parsed.macros || {};
  return {
    name: String(parsed.name || '').trim(),
    category: CATEGORIES.includes(parsed.category) ? parsed.category : 'CORE DAILY MEALS',
    makes: parsed.makes ? String(parsed.makes).trim() : null,
    macros: {
      p: Number(macros.p) || 0,
      c: Number(macros.c) || 0,
      f: Number(macros.f) || 0,
      kcal: Number(macros.kcal) || 0,
    },
    ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients.map((s) => String(s).trim()).filter(Boolean) : [],
    method: Array.isArray(parsed.method) ? parsed.method.map((s) => String(s).trim()).filter(Boolean) : [],
  };
}

/* ----------------------- photos kept when Claude cannot read ----------------------- */

// NOTHING HE PHOTOGRAPHED IS LOST (18 Oct 2026). When the read cannot happen
// (usage ran out, the lane is off, the run failed) the photos are saved next
// to the recipe collection and a DRAFT recipe is filed: his own name (or a
// dated one), no macros set, a description that says it needs reading. An
// inbox record (kind 'recipe-scan', status 'error') points at it; Retry reads
// the saved photos and fills the draft in. Undo of the record removes the
// draft recipe.
export const SCANS_DIR_REL = 'Wiki/Health/Recipe Scans';
export const NEEDS_READING = 'Needs reading: the photos are kept and Nova reads them when Claude is available (Retry on the Inbox card).';
export const scanKeptMessage = (err) => keptBecause(err, 'Nova kept your photos as a draft recipe and will read them when you retry.');

export async function keepScanAsDraft(vaultPath, { imagePaths, name = '', reason = '' }) {
  const { addRecipe, loadRecipes } = await import('./recipes.js');
  const { savePhoto } = await import('./recipePhotos.js');
  const existing = await loadRecipes(vaultPath).catch(() => []);
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  let title = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80) || `Recipe from photos ${stamp}`;
  if (existing.some((r) => String(r.name).toLowerCase() === title.toLowerCase())) title = `${title} (${stamp})`;
  const draft = await addRecipe(vaultPath, {
    name: title, category: 'ROTATION / SWAP MEALS', makes: null, macros: null,
    ingredients: [], method: [], description: NEEDS_READING,
  });
  if (!draft) throw new Error('the draft recipe could not be added');
  const dir = path.join(vaultPath, SCANS_DIR_REL, draft.id);
  await mkdir(dir, { recursive: true });
  const kept = [];
  for (const [i, src] of imagePaths.entries()) {
    const dest = path.join(dir, path.basename(src));
    await copyFile(src, dest);
    kept.push(path.relative(vaultPath, dest));
    if (i === 0) {
      const ext = path.extname(src).slice(1).toLowerCase().replace('jpg', 'jpeg');
      const buf = await readFile(src);
      await savePhoto(vaultPath, draft.id, `data:image/${ext};base64,${buf.toString('base64')}`).catch(() => {});
    }
  }
  const record = {
    id: randomUUID().slice(0, 8), kind: 'recipe-scan', text: `Recipe photos: ${title}`,
    source: 'capture', mode: 'draft', status: 'error', createdAt: new Date().toISOString(),
    error: scanKeptMessage(reason),
    errorDetail: String(reason || '').slice(0, 300),
    recipeId: draft.id, recipeName: draft.name, photos: kept,
    undoData: { route: 'recipe', recipeId: draft.id },
  };
  await createRecord(record);
  return { message: scanKeptMessage(reason), recipeId: draft.id, recordId: record.id, name: draft.name };
}

/** Retry for kept photos: read them now and fill the draft recipe in. */
export async function retryRecipeScan(vaultPath, record, deps = {}) {
  if (!record.recipeId || !(record.photos || []).length) throw new Error('this record kept no photos');
  const imagePaths = record.photos.map((rel) => path.join(vaultPath, rel));
  const updated = await updateRecord(record.id, { status: 'classifying', error: null, errorDetail: null });
  const finish = async () => {
    try {
      const result = await (deps.read || readScanPhotos)(imagePaths);
      const { editRecipe, RECIPES_REL_PATH } = await import('./recipes.js');
      const edit = {};
      if (result.ingredients.length) edit.ingredients = result.ingredients;
      if (result.method.length) edit.method = result.method;
      if (result.macros.kcal > 0) edit.macros = result.macros;
      if (!Object.keys(edit).length) throw new Error('nothing readable in those photos');
      await editRecipe(vaultPath, record.recipeId, edit);
      // the draft's "needs reading" line is now untrue
      const full = path.join(vaultPath, RECIPES_REL_PATH);
      const raw = await readFile(full, 'utf8');
      if (raw.includes(NEEDS_READING)) {
        await backupFile(full);
        await writeFile(full, raw.replace(NEEDS_READING, `Read from your photos${edit.macros ? '; the macros are read off them, so check them' : ''}.`), 'utf8');
      }
      await updateRecord(record.id, { status: 'filed', filedAt: new Date().toISOString(), error: null, destination: `Recipe bank - ${record.recipeName} (read from your photos)` });
    } catch (e) {
      await updateRecord(record.id, { status: 'error', error: scanKeptMessage(e), errorDetail: String(e.message || e).slice(0, 300) });
    }
  };
  const done = finish();
  if (deps.await) await done;
  return updated;
}

function readScanPhotos(imagePaths) {
  return new Promise((resolve, reject) => {
    // startScan removes its work dir; these are the kept originals, so it gets copies
    const work = path.join(os.tmpdir(), 'nova-scan-retry', randomUUID().slice(0, 8));
    mkdir(work, { recursive: true }).then(async () => {
      const copies = [];
      for (const src of imagePaths) { const d = path.join(work, path.basename(src)); await copyFile(src, d); copies.push(d); }
      const id = startScan(copies, work);
      const t = setInterval(() => {
        const j = jobs.get(id);
        if (j.status === 'running') return;
        clearInterval(t);
        if (j.status === 'ready') resolve(j.result); else reject(new Error(j.error || 'the read failed'));
      }, 500);
    }).catch(reject);
  });
}

export function startScan(imagePaths, workDir, opts = {}) {
  if (!laneEnabled('scan-recipe')) throw laneOffError('scan-recipe');
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);
  // a failed read keeps the photos (opts.onFail files the draft) BEFORE the
  // work dir goes, and only then reports the error, with what was kept
  const fail = (msg) => {
    const finish = (error, extra = {}) => { Object.assign(job, extra); job.error = error; job.status = 'error'; rm(workDir, { recursive: true, force: true }).catch(() => {}); };
    if (!opts.onFail) return finish(msg);
    opts.onFail(msg).then((kept) => finish(kept?.message || msg, { kept: kept || null })).catch(() => finish(msg));
  };

  const prompt = `${SCHEMA_PROMPT}\n\nImage path(s):\n${imagePaths.map((p) => `- ${p}`).join('\n')}`;
  // stdin closed: an open pipe makes the CLI wait 3 s for input (measured 18 Oct 2026)
  const child = spawn(CLAUDE_BIN, [
    '-p', prompt,
    '--permission-mode', 'bypassPermissions',
    ...boundaryArgs('Read'),
    '--model', modelFor('scan-recipe'),
    ...effortArgs('scan-recipe'),
    '--output-format', 'json',
    '--no-session-persistence',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => {
    if (code !== 0) {
      return fail(stderr.trim() || `claude exited with code ${code}`);
    } else {
      try {
        const outer = parseEnvelope(stdout, { lane: 'scan-recipe' });
        const text = (outer.result || '').trim();
        const jsonMatch = firstBalancedObjectMatch(text);
        if (!jsonMatch) throw new Error('No JSON object found in the response');
        job.result = normalizeResult(parseModelJson(jsonMatch[0]));
        job.status = 'ready';
      } catch (e) {
        return fail('Could not read a recipe from that photo: ' + e.message);
      }
    }
    rm(workDir, { recursive: true, force: true }).catch(() => {});
  });
  child.on('error', (err) => fail(err.message));

  return jobId;
}

export function getScanJob(jobId) {
  return jobs.get(jobId) || null;
}
