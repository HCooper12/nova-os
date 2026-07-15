import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const MAX_BUDGET_USD = '1';
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

export function startScan(imagePaths, workDir) {
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const prompt = `${SCHEMA_PROMPT}\n\nImage path(s):\n${imagePaths.map((p) => `- ${p}`).join('\n')}`;
  const child = spawn(CLAUDE_BIN, [
    '-p', prompt,
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read',
    '--output-format', 'json',
    '--max-budget-usd', MAX_BUDGET_USD,
    '--no-session-persistence',
  ]);

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => {
    if (code !== 0) {
      job.status = 'error';
      job.error = stderr.trim() || `claude exited with code ${code}`;
    } else {
      try {
        const outer = JSON.parse(stdout);
        if (outer.is_error) throw new Error(outer.result || 'analysis failed');
        const text = (outer.result || '').trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON object found in the response');
        job.result = normalizeResult(JSON.parse(jsonMatch[0]));
        job.status = 'ready';
      } catch (e) {
        job.status = 'error';
        job.error = 'Could not read a recipe from that photo: ' + e.message;
      }
    }
    rm(workDir, { recursive: true, force: true }).catch(() => {});
  });
  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
    rm(workDir, { recursive: true, force: true }).catch(() => {});
  });

  return jobId;
}

export function getScanJob(jobId) {
  return jobs.get(jobId) || null;
}
