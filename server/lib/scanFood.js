import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { modelFor, laneEnabled, laneOffError } from './modelPrefs.js';

const MAX_BUDGET_USD = '0.5';
// Reading a label is OCR — the fast model handles it and the macros are always
// reviewed before logging. Estimating a meal photo is visual portion/ingredient
// judgement, where model strength actually moves the number, so it runs on a
// stronger one. Both are lanes on the model board (Settings → Claude models),
// and NOVA_FOOD_SCAN_MODEL / NOVA_FOOD_SCAN_MEAL_MODEL still seed their
// defaults. The meal lane used to pass NO --model at all, which meant the
// account's ambient default — the exact hole the 21-Aug Coach fix closed.
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

// Describe-it mode: no photo, just words — "1 large movie popcorn from Village
// Cinemas". Named chain items are exactly where a quick lookup beats a guess,
// so this mode alone gets WebSearch (read-only, budget-capped). The result is
// the SAME shape as a photo scan, so it flows through the identical preview →
// confirm path and is never logged without his say-so.
export function buildDescribePrompt(description) {
  return `Estimate the nutrition of this food from the user's own description. This is Australian context (Woolworths/Coles/Aldi products, AU chain sizing) unless the description says otherwise.

The description: "${description}"

- If it names a specific product, chain or venue (e.g. a cinema's large popcorn, a named cafe item), look it up so the numbers are real rather than guessed. Prefer the venue's own published nutrition; otherwise a close equivalent, and say so in the question field.
- If it's generic ("a bowl of porridge"), estimate a sensible standard portion.
- Respect any quantity or size given ("large", "two", "half of a"). If no size is given for something that varies a lot, assume a normal serving and SAY SO.

- name: a short, natural name for what was eaten, including the venue/brand when given
- macros: {p, c, f, kcal} — the total for everything described; grams for p/c/f, whole-number kcal
- confidence: "high" or "low" — low when the portion genuinely can't be pinned down, or you could not find real figures for a named item
- question: if confidence is low, ONE short question that would most improve the estimate (e.g. "was that the 120g regular or the 170g large?"). Empty string if high.

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
  const promptModeEarly = mode === 'meal' ? 'meal' : mode === 'label' ? 'label' : 'auto';
  const lane = promptModeEarly === 'label' ? 'scan-food-label' : 'scan-food-meal';
  if (!laneEnabled(lane)) throw laneOffError(lane);
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  // Explicit 'label'/'meal' still honored (legacy + tests); anything else —
  // notably the multi-photo UI's 'auto' — fuses labels + food + note together.
  const promptMode = promptModeEarly;
  const prompt = buildPrompt(promptMode, imagePaths, note);
  // label OCR → fast model; meal/auto (visual + multi-photo fusion) → strong model
  const model = modelFor(lane);
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
  args.push('--model', model); // modelFor never returns empty — the flag is always named
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

// Same job map and result shape as a photo scan, so the client polls the very
// same endpoint and renders the very same preview.
export function startFoodDescribe(description) {
  if (!laneEnabled('food-describe')) throw laneOffError('food-describe');
  const text = String(description || '').replace(/\s+/g, ' ').trim();
  if (text.length < 3) throw new Error('describe what you ate in a few more words');
  if (text.length > 300) throw new Error('keep the description under 300 characters');

  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const child = spawn(CLAUDE_BIN, [
    '-p', buildDescribePrompt(text),
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'WebSearch WebFetch',
    '--strict-mcp-config',
    '--output-format', 'json',
    '--max-budget-usd', MAX_BUDGET_USD,
    '--model', modelFor('food-describe'), // was unpinned until the model board
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
      if (outer.is_error) throw new Error(outer.result || 'estimate failed');
      const out = (outer.result || '').trim();
      const jsonMatch = out.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error(out.slice(0, 200) || 'No response received');
      job.result = normalizeResult(JSON.parse(jsonMatch[0]));
      job.status = 'ready';
    } catch (e) {
      job.status = 'error';
      job.error = e.message;
    }
  });
  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
  });

  return jobId;
}

export function getFoodScanJob(jobId) {
  return jobs.get(jobId) || null;
}
