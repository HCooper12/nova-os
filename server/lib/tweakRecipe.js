import { spawn } from 'node:child_process';
import { firstBalancedObjectMatch } from './jsonSalvage.js';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { modelFor, laneEnabled, laneOffError } from './modelPrefs.js';
import { boundaryArgs } from './spawnBoundary.js';
import { settleWatchdog } from './settle.js';

const MAX_BUDGET_USD = '0.5';
// launchd services don't inherit the interactive shell's PATH — use the absolute path.
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const jobs = new Map();

// `prior` is the tweak already on screen, when he is refining rather than
// starting over: "keep the two whole eggs and give me other ways to raise the
// protein". Without it every follow-up silently restarted from the original
// recipe and quietly undid what he had just accepted.
//
// `imagePaths` — his ask: let him photograph a DIFFERENT ingredient (a
// substitute's packaging, its nutrition label, the product itself) so a swap
// like "swap in this protein powder" is computed from what the label
// actually says, not a guess. Same Read-a-path convention as the food scan
// prompts (scanFood.js), so one photo pipeline behaves one way everywhere.
export function buildPrompt(recipe, request, prior, imagePaths = []) {
  const ingredientLines = recipe.ingredients.map((i) => `- ${i.name}`).join('\n');
  const methodLines = recipe.method.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const imageBlock = imagePaths.length ? `
He has attached ${imagePaths.length} photo${imagePaths.length === 1 ? '' : 's'} of an ingredient or product for you to consider — packaging, a nutrition label, or the item itself. If a nutrition label is visible, read it precisely and use its per-serving values as ground truth for whatever quantity is actually going in (convert kJ to kcal by dividing by 4.184 if that's what's shown, and scale a label's per-serving numbers to the amount actually used, not the whole pack, unless he says otherwise). Use the photo(s) together with his request below to work out exactly what he wants swapped, added, or removed, and reflect it precisely in the ingredients list and macros.

Photo path(s):
${imagePaths.map((p) => `- ${p}`).join('\n')}
` : '';
  return `Original recipe: ${recipe.name}
Macros: ${recipe.macros.p}g P / ${recipe.macros.c}g C / ${recipe.macros.f}g F / ${recipe.macros.kcal} kcal

Ingredients:
${ingredientLines}

Method:
${methodLines}
${imageBlock}
${prior ? `He is REFINING a version you already proposed, not starting again. That version was:
Label: ${prior.label}
Macros: ${prior.macros.p}g P / ${prior.macros.c}g C / ${prior.macros.f}g F / ${prior.macros.kcal} kcal
Ingredients:
${(prior.ingredients || []).map((i) => `- ${i}`).join('\n')}
${(prior.method || []).length ? `Method:\n${prior.method.map((x, i) => `${i + 1}. ${x}`).join('\n')}` : ''}

Apply his follow-up to THAT version. Keep everything he has not asked you to change, and never silently revert a change he already has.

His follow-up: "${request}"
` : `Hayden's requested tweak: "${request}"`}

Produce an adjusted version of this recipe reflecting the request — an ingredient swap for something he's out of, a version with reduced calories/macros, a different cooking approach, etc. Recalculate the macros as accurately as you reasonably can to match the adjusted ingredients — don't just copy the original numbers. Keep it realistic and cookable with normal supermarket ingredients.

Output ONLY a single JSON object with exactly these keys:
- label: a short 3-6 word description of what changed (e.g. "No soy sauce — tamari swap" or "Lower carb, cauliflower rice")
- macros: {p, c, f, kcal}
- ingredients: array of ingredient strings
- method: array of method step strings

No markdown, no code fences, no commentary before or after — just the raw JSON object.`;
}

// `imagePaths`/`workDir` are optional — a text-only tweak (the common case)
// behaves exactly as before. When photos are attached, Read is enabled (the
// same convention scanFood.js uses: --allowedTools is not a real restriction
// under bypassPermissions, --strict-mcp-config just avoids booting MCP
// servers to read a photo) and workDir is cleaned up once the job settles,
// whether it succeeds, fails, or the process itself errors.
export function startTweak(recipe, request, prior = null, imagePaths = [], workDir = null) {
  if (!laneEnabled('tweak-recipe')) throw laneOffError('tweak-recipe');
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const hasImages = imagePaths.length > 0;
  const prompt = buildPrompt(recipe, request, prior, imagePaths);
  const cleanup = () => { if (workDir) rm(workDir, { recursive: true, force: true }).catch(() => {}); };
  const child = spawn(CLAUDE_BIN, [
    '-p', prompt,
    '--permission-mode', 'bypassPermissions',
    ...boundaryArgs(hasImages ? 'Read' : ''),
    '--output-format', 'json',
    '--max-budget-usd', MAX_BUDGET_USD,
    '--model', modelFor('tweak-recipe'), // was unpinned until the model board
    '--no-session-persistence',
  ]);

  let stdout = '';
  let stderr = '';
  settleWatchdog(child, { label: "the recipe tweak", minutes: 5 });
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => {
    if (code !== 0) {
      job.status = 'error';
      job.error = stderr.trim() || `claude exited with code ${code}`;
      cleanup();
      return;
    }
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error) throw new Error(outer.result || 'tweak generation failed');
      const text = (outer.result || '').trim();
      const jsonMatch = firstBalancedObjectMatch(text);
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
    cleanup();
  });
  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
    cleanup();
  });

  return jobId;
}

export function getTweakJob(jobId) {
  return jobs.get(jobId) || null;
}
