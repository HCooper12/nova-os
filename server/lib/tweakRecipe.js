import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const MAX_BUDGET_USD = '0.5';
// launchd services don't inherit the interactive shell's PATH — use the absolute path.
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const jobs = new Map();

function buildPrompt(recipe, request) {
  const ingredientLines = recipe.ingredients.map((i) => `- ${i.name}`).join('\n');
  const methodLines = recipe.method.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return `Original recipe: ${recipe.name}
Macros: ${recipe.macros.p}g P / ${recipe.macros.c}g C / ${recipe.macros.f}g F / ${recipe.macros.kcal} kcal

Ingredients:
${ingredientLines}

Method:
${methodLines}

Hayden's requested tweak: "${request}"

Produce an adjusted version of this recipe reflecting the request — an ingredient swap for something he's out of, a version with reduced calories/macros, a different cooking approach, etc. Recalculate the macros as accurately as you reasonably can to match the adjusted ingredients — don't just copy the original numbers. Keep it realistic and cookable with normal supermarket ingredients.

Output ONLY a single JSON object with exactly these keys:
- label: a short 3-6 word description of what changed (e.g. "No soy sauce — tamari swap" or "Lower carb, cauliflower rice")
- macros: {p, c, f, kcal}
- ingredients: array of ingredient strings
- method: array of method step strings

No markdown, no code fences, no commentary before or after — just the raw JSON object.`;
}

export function startTweak(recipe, request) {
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const prompt = buildPrompt(recipe, request);
  const child = spawn(CLAUDE_BIN, [
    '-p', prompt,
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', '',
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
      return;
    }
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error) throw new Error(outer.result || 'tweak generation failed');
      const text = (outer.result || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON object found in the response');
      const parsed = JSON.parse(jsonMatch[0]);
      const macros = parsed.macros || {};
      job.result = {
        label: String(parsed.label || 'Suggested tweak').trim(),
        macros: {
          p: Number(macros.p) || 0,
          c: Number(macros.c) || 0,
          f: Number(macros.f) || 0,
          kcal: Number(macros.kcal) || 0,
        },
        ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients.map((s) => String(s).trim()).filter(Boolean) : [],
        method: Array.isArray(parsed.method) ? parsed.method.map((s) => String(s).trim()).filter(Boolean) : [],
      };
      job.status = 'ready';
    } catch (e) {
      job.status = 'error';
      job.error = 'Could not generate a tweak: ' + e.message;
    }
  });
  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
  });

  return jobId;
}

export function getTweakJob(jobId) {
  return jobs.get(jobId) || null;
}
