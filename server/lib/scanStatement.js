import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { CATEGORIES, categorize } from './money.js';

// Photograph a statement page or receipt → the model extracts transaction
// lines as typed JSON → they land as a pending money-import record on the
// inbox rails, exactly like a CSV drop. The model only ever READS the image;
// deterministic code does all filing after approval.

const MAX_BUDGET_USD = '0.5';
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const jobs = new Map();

function buildPrompt(imagePaths, note) {
  return `Read the bank/card statement page or receipt in the photo(s) below and extract the individual transactions.

Output a JSON object: {"transactions": [{"date": "YYYY-MM-DD", "amount": -12.34, "merchant": "...", "category": "..."}], "confidence": "high"|"low", "question": "..."}

- amount: NEGATIVE for money out (purchases, fees), positive for money in (deposits, refunds). Use the statement's own signs/columns to decide.
- date: the transaction date. If the statement omits the year, infer it from context (statement period header if visible). Today is ${new Date().toISOString().slice(0, 10)}.
- merchant: the description line, lightly cleaned (drop card numbers / reference codes).
- category: your best fit from exactly: ${CATEGORIES.join(', ')} — or omit to leave it to Nova.
- For a RECEIPT (single purchase), output ONE transaction for the total, merchant = the store.
- confidence "low" + ONE short question if amounts/dates are genuinely ambiguous or the photo is partly unreadable; list what you could read regardless.
- If the image shows no statement or receipt at all, output {"transactions": [], "confidence": "low", "question": "<what you see instead — ask for a re-upload>"}.
${note ? `\nThe user added: "${note}"` : ''}
Image path(s):
${imagePaths.map((p) => `- ${p}`).join('\n')}

Output ONLY the JSON object. No markdown, no code fences, no commentary.`;
}

export function startStatementScan(imagePaths, workDir, note) {
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const child = spawn(CLAUDE_BIN, [
    '-p', buildPrompt(imagePaths, note),
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read',
    '--output-format', 'json',
    '--max-budget-usd', MAX_BUDGET_USD,
    '--session-id', randomUUID(),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => {
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error || code !== 0) throw new Error(outer.result || stderr.trim() || `claude exited with code ${code}`);
      const text = (outer.result || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error(text.slice(0, 200) || 'no JSON in scan response');
      const parsed = JSON.parse(jsonMatch[0]);
      const transactions = (Array.isArray(parsed.transactions) ? parsed.transactions : [])
        .map((t) => ({
          date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? t.date : new Date().toISOString().slice(0, 10),
          amount: Math.round(Number(t.amount) * 100) / 100,
          merchant: String(t.merchant || '').trim().slice(0, 120),
          category: CATEGORIES.includes(t.category) ? t.category : categorize(t.merchant || ''),
          source: 'scan',
        }))
        .filter((t) => Number.isFinite(t.amount) && t.amount !== 0 && t.merchant);
      job.result = {
        transactions,
        confidence: parsed.confidence === 'low' ? 'low' : 'high',
        question: parsed.question ? String(parsed.question).trim() : '',
      };
      job.status = 'ready';
    } catch (e) {
      job.status = 'error';
      job.error = e.message;
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

export function getStatementScanJob(jobId) {
  return jobs.get(jobId) || null;
}
