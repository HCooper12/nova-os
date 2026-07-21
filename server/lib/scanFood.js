import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const MAX_BUDGET_USD = '0.5';
// Reading a label is OCR — the fast model handles it and the macros are always
// reviewed before logging. Estimating a meal photo is visual portion/ingredient
// judgement, where model strength actually moves the number, so that stays on the
// CLI default model unless explicitly overridden. Both are env-tunable.
const LABEL_MODEL = process.env.NOVA_FOOD_SCAN_MODEL || 'haiku';
const MEAL_MODEL = process.env.NOVA_FOOD_SCAN_MEAL_MODEL || null; // null → CLI default
// launchd services don't inherit the interactive shell's PATH — use the absolute path.
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const jobs = new Map();

function buildPrompt(mode, imagePaths, note) {
  const noteLine = note
    ? `\n\nThe user added this note about what/how much they actually ate: "${note}" — use it to adjust your estimate (e.g. "ate half" halves a label's per-serving values; a specific quantity overrides your own guess).`
    : '';
  const imageList = imagePaths.map((p) => `- ${p}`).join('\n');

  const notFoodInstruction = `\n\nIf the image doesn't actually show food or a nutrition label (wrong photo, too blurry to make out, etc.), still output the same JSON structure: set name to a brief note of what you actually see instead, macros all 0, confidence "low", and question asking the user to re-check and re-upload. Always output the JSON structure below no matter what the image shows — never reply with plain text instead.`;

  if (mode === 'auto') {
    return `You're given one or more photos at the paths below to work out the nutrition of a single thing the user ate. The photos may be any mix of: nutrition labels / packaging, and photos of the actual food. Use ALL of them together to produce ONE best estimate for what was actually eaten.

How to combine the photos:
- If a nutrition label is present, it's the ground truth for the macros — read it precisely. If it only shows kJ energy (common on Australian labels), convert to kcal by dividing by 4.184 and round to the nearest whole number.
- If MULTIPLE DIFFERENT labels are shown (e.g. two different products eaten together), add their contributions together. If the same product appears in more than one photo, don't double-count it.
- If a photo shows the actual food/portion, use it to judge HOW MUCH was eaten and scale the label's per-serving values to the real portion (e.g. the label is per serving of 20 pretzels but the photo — or the note — says only 8 were eaten).
- More photos should mean a MORE precise estimate: reconcile them, don't just guess from one.

- name: a short, natural name for what was eaten (use the product/packaging name when visible)
- macros: {p, c, f, kcal} — the total for everything actually eaten across the photos; grams for p/c/f, whole-number kcal
- confidence: "high" or "low" — low if the portion or a key value genuinely can't be pinned down from the photos + note
- question: if confidence is low, ONE short clarifying question that would most improve the estimate. Empty string if high.${noteLine}${notFoodInstruction}

Image path(s):
${imageList}

Output ONLY a JSON object with exactly these keys: name, macros, confidence, question. No markdown, no code fences, no commentary before or after.`;
  }

  if (mode === 'meal') {
    return `Look at the photo(s) of food at the paths below and estimate its nutrition. This is a photo of the actual meal/snack itself, not a printed label — you're visually judging portion size and likely ingredients/preparation.

- name: a short, natural description of what's in the photo
- macros: {p, c, f, kcal} — your best estimate for the portion shown (grams of protein/carbs/fat, whole-number kcal)
- confidence: "high" or "low" — low if portion size, hidden ingredients (oil, sauce, dressing), or preparation are genuinely hard to judge from the photo
- question: if confidence is low, ONE short clarifying question that would meaningfully improve the estimate. Empty string if confidence is high.${noteLine}${notFoodInstruction}

Image path(s):
${imageList}

Output ONLY a JSON object with exactly these keys: name, macros, confidence, question. No markdown, no code fences, no commentary before or after.`;
  }

  return `Read the nutrition label in the photo(s) at the paths below and extract its macros.

- name: a short name for the food (from the packaging if visible, otherwise a reasonable generic description)
- macros: {p, c, f, kcal} for what the user is actually logging — scale from the label's per-serving values per the note below if one is given, otherwise use one serving as shown. If the label only shows kJ energy (common on Australian labels), convert to kcal by dividing by 4.184 and round to the nearest whole number.
- confidence: "high" or "low" — low if the label is blurry, partially visible, or the serving size is ambiguous
- question: if confidence is low, ONE short clarifying question (e.g. "how many servings did you actually eat?"). Empty string if confidence is high.${noteLine}${notFoodInstruction}

Image path(s):
${imageList}

Output ONLY a JSON object with exactly these keys: name, macros, confidence, question. No markdown, no code fences, no commentary before or after.`;
}

function normalizeResult(parsed) {
  const macros = parsed.macros || {};
  return {
    name: String(parsed.name || '').trim(),
    macros: {
      p: Number(macros.p) || 0,
      c: Number(macros.c) || 0,
      f: Number(macros.f) || 0,
      kcal: Number(macros.kcal) || 0,
    },
    confidence: parsed.confidence === 'low' ? 'low' : 'high',
    question: parsed.question ? String(parsed.question).trim() : '',
  };
}

export function startFoodScan(mode, imagePaths, workDir, note) {
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  // Explicit 'label'/'meal' still honored (legacy + tests); anything else —
  // notably the multi-photo UI's 'auto' — fuses labels + food + note together.
  const promptMode = mode === 'meal' ? 'meal' : mode === 'label' ? 'label' : 'auto';
  const prompt = buildPrompt(promptMode, imagePaths, note);
  // label OCR → fast model; meal/auto (visual + multi-photo fusion) → strong model
  const model = promptMode === 'label' ? LABEL_MODEL : MEAL_MODEL;
  const args = [
    '-p', prompt,
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read',
    // don't boot every configured MCP server just to read a photo — pure cold-start savings
    '--strict-mcp-config',
    '--output-format', 'json',
    '--max-budget-usd', MAX_BUDGET_USD,
    '--no-session-persistence',
  ];
  if (model) args.push('--model', model);
  const child = spawn(CLAUDE_BIN, args);

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
        // The prompt asks for JSON no matter what the image shows, but if the model
        // ever breaks that (e.g. an unusual photo) fall back to its own plain-text
        // explanation rather than a generic parse-failure message.
        if (!jsonMatch) throw new Error(text.slice(0, 200) || 'No response received');
        job.result = normalizeResult(JSON.parse(jsonMatch[0]));
        job.status = 'ready';
      } catch (e) {
        job.status = 'error';
        job.error = e.message;
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

export function getFoodScanJob(jobId) {
  return jobs.get(jobId) || null;
}
