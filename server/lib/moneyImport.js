import { readFile, readdir, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { listTransactions, dedupeKey, categorize } from './money.js';
import { createRecord, listRecords } from './inboxStore.js';

// Bank-CSV ingestion — the automatic pipeline. Drop a bank export into the
// vault's Money/Imports folder (iCloud-synced, so "save to folder" on the
// phone is enough — the SAME file Billroo imports works here unchanged) and
// the watcher parses it, drops what the ledger already has, and puts ONE
// pending record on the inbox rails listing everything new. Approving files
// the batch (undoable) and archives the CSV to Money/Imports/Processed.
// Nothing auto-files v1 — imports ride the same trust ladder as everything.

export const IMPORTS_DIR_REL = 'Money/Imports';
const PROCESSED_DIR_REL = 'Money/Imports/Processed';

/* ------------------------------ CSV parsing ------------------------------ */

// Minimal RFC-4180 line splitter (quotes, embedded commas/quotes).
function splitCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function parseDate(raw) {
  const s = (raw || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/); // AU banks: DD/MM/YYYY
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (m) return `20${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return null;
}

function parseAmount(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(n) && n !== 0 ? Math.round(n * 100) / 100 : null;
}

// Accepts the common Australian bank export shapes (the same files Billroo
// takes): headered CSVs with date/description/amount or debit+credit
// columns, and headerless CommBank-style `date,amount,description,balance`.
export function parseBankCsv(raw) {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { transactions: [], skipped: 0 };

  const first = splitCsvLine(lines[0]);
  const lower = first.map((c) => c.toLowerCase());
  const hasHeader = lower.some((c) => /date|description|narrative|amount|debit|credit|payee|merchant|details/.test(c)) && !parseDate(first[0]);

  let idx = { date: -1, desc: -1, amount: -1, debit: -1, credit: -1 };
  let start = 0;
  if (hasHeader) {
    start = 1;
    idx.date = lower.findIndex((c) => c.includes('date'));
    idx.desc = lower.findIndex((c) => /description|narrative|details|payee|merchant|memo/.test(c));
    idx.amount = lower.findIndex((c) => c.trim() === 'amount' || /transaction amount|^amount/.test(c));
    idx.debit = lower.findIndex((c) => c.includes('debit'));
    idx.credit = lower.findIndex((c) => c.includes('credit'));
  } else {
    // headerless: assume date,amount,description[,balance] (CommBank shape) —
    // but only if the first row actually fits it, so garbage fails loudly
    if (first.length < 3 || !parseDate(first[0]) || parseAmount(first[1]) == null) {
      throw new Error('unrecognised CSV columns — expected date, description and amount (or debit/credit)');
    }
    idx = { date: 0, amount: 1, desc: 2, debit: -1, credit: -1 };
  }
  if (idx.date === -1 || idx.desc === -1 || (idx.amount === -1 && idx.debit === -1 && idx.credit === -1)) {
    throw new Error('unrecognised CSV columns — expected date, description and amount (or debit/credit)');
  }

  const transactions = [];
  let skipped = 0;
  for (const line of lines.slice(start)) {
    const cells = splitCsvLine(line);
    const date = parseDate(cells[idx.date]);
    const desc = (cells[idx.desc] || '').replace(/\s+/g, ' ').trim();
    let amount = idx.amount !== -1 ? parseAmount(cells[idx.amount]) : null;
    if (amount == null && idx.debit !== -1) {
      const debit = parseAmount(cells[idx.debit]);
      const credit = idx.credit !== -1 ? parseAmount(cells[idx.credit]) : null;
      amount = debit != null ? -Math.abs(debit) : credit != null ? Math.abs(credit) : null;
    }
    if (!date || !desc || amount == null) { skipped++; continue; }
    transactions.push({ date, amount, merchant: desc, category: categorize(desc), source: 'import' });
  }
  return { transactions, skipped };
}

/* ------------------------------- the watcher ------------------------------ */

async function pendingImportFiles() {
  const items = await listRecords();
  return new Set(items.filter((r) => r.kind === 'money-import' && r.status === 'pending').map((r) => r.decision?.payload?.file).filter(Boolean));
}

export async function scanImports(vaultPath) {
  const dir = path.join(vaultPath, IMPORTS_DIR_REL);
  if (!existsSync(dir)) return { found: 0, records: [] };
  const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.csv'));
  if (!files.length) return { found: 0, records: [] };

  const existing = new Set((await listTransactions({ sinceMonths: 26 })).map(dedupeKey));
  const alreadyPending = await pendingImportFiles();
  const records = [];

  for (const file of files) {
    if (alreadyPending.has(file)) continue; // one pending record per file, ever
    let parsed;
    try {
      parsed = parseBankCsv(await readFile(path.join(dir, file), 'utf8'));
    } catch (e) {
      records.push(await createRecord({
        id: randomUUID().slice(0, 8),
        kind: 'money-import',
        text: `Import failed — ${file}`,
        source: 'cfo',
        mode: 'draft',
        status: 'error',
        createdAt: new Date().toISOString(),
        error: e.message,
        decision: { route: 'money-import', confidence: 'low', title: `Import failed — ${file}`, reason: e.message, payload: { file, transactions: [] } },
      }));
      continue;
    }

    const fresh = parsed.transactions.filter((t) => !existing.has(dedupeKey(t)));
    if (!fresh.length) {
      // nothing new — archive quietly so the folder stays clean
      await archiveImportFile(vaultPath, file);
      continue;
    }
    fresh.forEach((t) => existing.add(dedupeKey(t)));
    const spend = Math.round(fresh.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0));
    const title = `${fresh.length} transaction${fresh.length === 1 ? '' : 's'} from ${file}`;
    records.push(await createRecord({
      id: randomUUID().slice(0, 8),
      kind: 'money-import',
      text: title,
      source: 'cfo',
      mode: 'draft',
      status: 'pending',
      createdAt: new Date().toISOString(),
      decision: {
        route: 'money-import',
        confidence: 'high',
        title,
        reason: `Parsed from ${IMPORTS_DIR_REL}/${file} — ${fresh.length} new after dedupe (${parsed.transactions.length - fresh.length} already in the ledger${parsed.skipped ? `, ${parsed.skipped} unparseable lines skipped` : ''}). ~$${spend} spend.`,
        payload: { file, transactions: fresh },
      },
    }));
  }
  return { found: files.length, records };
}

export async function archiveImportFile(vaultPath, file) {
  const from = path.join(vaultPath, IMPORTS_DIR_REL, file);
  if (!existsSync(from)) return false;
  const dir = path.join(vaultPath, PROCESSED_DIR_REL);
  await mkdir(dir, { recursive: true });
  let dest = path.join(dir, file);
  if (existsSync(dest)) dest = path.join(dir, `${Date.now() % 100000}-${file}`);
  await rename(from, dest);
  return true;
}

export function startMoneyImportScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('money');
    try {
      await scanImports(vaultPath);
    } catch (err) {
      console.error('money import scan failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 5 * 60 * 1000);
}
