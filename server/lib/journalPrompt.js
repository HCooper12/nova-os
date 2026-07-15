import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const MAX_BUDGET_USD = '0.3';
// launchd services don't inherit the interactive shell's PATH — use the absolute path.
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const jobs = new Map();

function buildPrompt({ seedTitle, seedExcerpt, sample }) {
  if (seedTitle) {
    return `Hayden is about to write a journal reflection on this idea from his personal wiki:

"${seedTitle}" — ${seedExcerpt || ''}

Write ONE short, thoughtful journaling prompt (1-2 sentences) that helps him reflect on this idea and connect it to his own life or a recent situation. Speak directly to him ("you"). Output ONLY a JSON object with a single key "prompt". No markdown, no code fences, no commentary before or after.`;
  }
  const sampleLines = (sample || []).map((s) => `- ${s.title}: ${s.excerpt}`).join('\n');
  return `Hayden keeps a personal wiki of ideas he's read and reflected on. Here is a small random sample from it:
${sampleLines || '(the wiki has nothing in it yet)'}

Write ONE short, thoughtful journaling prompt (1-2 sentences) for today. You may loosely draw on one of the ideas above if it fits naturally, or just ask a good general self-reflection question — don't force a connection if none of them fit. Speak directly to him ("you"). Output ONLY a JSON object with a single key "prompt". No markdown, no code fences, no commentary before or after.`;
}

export function startPromptJob(seed) {
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const prompt = buildPrompt(seed);
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
      if (outer.is_error) throw new Error(outer.result || 'prompt generation failed');
      const text = (outer.result || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON object found in the response');
      const parsed = JSON.parse(jsonMatch[0]);
      const promptText = String(parsed.prompt || '').trim();
      if (!promptText) throw new Error('Empty prompt in response');
      job.result = { prompt: promptText };
      job.status = 'ready';
    } catch (e) {
      job.status = 'error';
      job.error = 'Could not generate a prompt: ' + e.message;
    }
  });
  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
  });

  return jobId;
}

export function getPromptJob(jobId) {
  return jobs.get(jobId) || null;
}
