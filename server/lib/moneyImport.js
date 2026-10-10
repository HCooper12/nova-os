import { readFile, readdir, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { listTransactions, dedupeKey, categorize, overrideFor, loadOverrides, onMoneyChange } from './money.js';
import { createRecord, listRecords, updateRecord } from './inboxStore.js';

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

const pad2 = (n) => String(n).padStart(2, '0');
function parseDate(raw) {
  // a spreadsheet cell: a real date (read as UTC midnight), or an Excel
  // serial when the column was not formatted as a date
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : `${raw.getUTCFullYear()}-${pad2(raw.getUTCMonth() + 1)}-${pad2(raw.getUTCDate())}`;
  if (typeof raw === 'number') {
    if (!(raw > 20000 && raw < 80000)) return null; // 1954..2118: anything else is not a date
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(raw) * 86400000);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }
  const s = String(raw ?? '').trim();
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
  if (typeof raw === 'number') return Number.isFinite(raw) && raw !== 0 ? Math.round(raw * 100) / 100 : null;
  const n = Number(String(raw).replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(n) && n !== 0 ? Math.round(n * 100) / 100 : null;
}

// A BUDGET APP'S OWN CATEGORY, mapped onto Nova's where the names clearly
// match (his open call, built as this default on 10 Oct 2026); anything
// else is null and Nova's guess from the merchant stands. Keys are the
// lowercased name with "&"/"and" and punctuation folded.
const THEIR_CATEGORY = new Map(Object.entries({
  groceries: 'Groceries', grocery: 'Groceries', supermarket: 'Groceries', supermarkets: 'Groceries',
  'eating out': 'Eating Out', 'dining out': 'Eating Out', dining: 'Eating Out', restaurants: 'Eating Out', restaurant: 'Eating Out', takeaway: 'Eating Out', 'cafes': 'Eating Out', 'cafes restaurants': 'Eating Out', 'restaurants cafes': 'Eating Out',
  transport: 'Transport', transportation: 'Transport', 'public transport': 'Transport', fuel: 'Transport', petrol: 'Transport', parking: 'Transport', tolls: 'Transport',
  'health fitness': 'Health & Fitness', health: 'Health & Fitness', fitness: 'Health & Fitness', gym: 'Health & Fitness', medical: 'Health & Fitness', pharmacy: 'Health & Fitness',
  subscriptions: 'Subscriptions', subscription: 'Subscriptions', streaming: 'Subscriptions',
  'utilities bills': 'Utilities & Bills', 'bills utilities': 'Utilities & Bills', utilities: 'Utilities & Bills', bills: 'Utilities & Bills', 'phone internet': 'Utilities & Bills', electricity: 'Utilities & Bills', insurance: 'Utilities & Bills', rent: 'Utilities & Bills',
  shopping: 'Shopping', clothing: 'Shopping', clothes: 'Shopping', electronics: 'Shopping',
  entertainment: 'Entertainment',
  income: 'Income', salary: 'Income', wages: 'Income',
  other: 'Other',
}));
export function mapTheirCategory(raw, amount) {
  const k = String(raw ?? '').toLowerCase().replace(/&|\band\b/g, ' ').replace(/[^a-z]+/g, ' ').trim();
  const c = THEIR_CATEGORY.get(k) || null;
  // money in is Income only when it is money in; a spend never files as Income
  if (c === 'Income' && !(amount > 0)) return null;
  return c;
}

const cellText = (c) => (c instanceof Date ? parseDate(c) : c == null ? '' : String(c));
const UNRECOGNISED = (kind, headers) => `unrecognised ${kind} columns: expected date, description and amount (or debit/credit)${headers ? `; this file has: ${headers.slice(0, 8).join(', ').slice(0, 120)}` : ''}`;

// THE ONE READER for a bank or budget-app export, as rows of cells (CSV text
// split, or an .xlsx sheet's own cells: strings, numbers, real dates).
// Headered with date/description/amount or debit+credit, an optional
// Category (a budget app's, mapped by mapTheirCategory) and Tags (kept as
// the line's note); or headerless CommBank-style date,amount,description.
export function parseBankRows(rows, { kind = 'CSV' } = {}) {
  const all = (rows || []).filter((r) => Array.isArray(r) && r.some((c) => cellText(c).trim()));
  if (!all.length) return { transactions: [], skipped: 0, skippedLines: [] };

  const first = all[0].map(cellText);
  const lower = first.map((c) => c.toLowerCase().trim());
  const hasHeader = lower.some((c) => /date|description|narrative|amount|debit|credit|payee|merchant|details/.test(c)) && !parseDate(all[0][0]);

  let idx = { date: -1, desc: -1, amount: -1, debit: -1, credit: -1, cat: -1, tags: -1 };
  let start = 0;
  if (hasHeader) {
    start = 1;
    idx.date = lower.findIndex((c) => c.includes('date'));
    idx.desc = lower.findIndex((c) => /description|narrative|details|payee|merchant|memo/.test(c));
    idx.amount = lower.findIndex((c) => c === 'amount' || /transaction amount|^amount/.test(c));
    idx.debit = lower.findIndex((c) => c.includes('debit'));
    idx.credit = lower.findIndex((c) => c.includes('credit'));
    idx.cat = lower.findIndex((c) => c === 'category');
    idx.tags = lower.findIndex((c) => c === 'tags' || c === 'tag');
  } else {
    // headerless: assume date,amount,description[,balance] (CommBank shape) —
    // but only if the first row actually fits it, so garbage fails loudly
    if (all[0].length < 3 || !parseDate(all[0][0]) || parseAmount(all[0][1]) == null) throw new Error(UNRECOGNISED(kind));
    idx = { date: 0, amount: 1, desc: 2, debit: -1, credit: -1, cat: -1, tags: -1 };
  }
  if (idx.date === -1 || idx.desc === -1 || (idx.amount === -1 && idx.debit === -1 && idx.credit === -1)) {
    throw new Error(UNRECOGNISED(kind, hasHeader ? first.filter(Boolean) : null));
  }

  const transactions = [];
  let skipped = 0;
  const skippedLines = []; // the first few, so a recurring format quirk is visible on the first approval
  for (const cells of all.slice(start)) {
    const date = parseDate(cells[idx.date]);
    const desc = cellText(cells[idx.desc]).replace(/\s+/g, ' ').trim();
    let amount = idx.amount !== -1 ? parseAmount(cells[idx.amount]) : null;
    if (amount == null && idx.debit !== -1) {
      const debit = parseAmount(cells[idx.debit]);
      const credit = idx.credit !== -1 ? parseAmount(cells[idx.credit]) : null;
      amount = debit != null ? -Math.abs(debit) : credit != null ? Math.abs(credit) : null;
    }
    if (!date || !desc || amount == null) {
      skipped++;
      if (skippedLines.length < 3) skippedLines.push(cells.map(cellText).join(',').trim().slice(0, 80));
      continue;
    }
    // his own merchant rule first, then the budget app's category where it
    // clearly matches one of Nova's, then Nova's guess from the merchant
    const theirs = idx.cat !== -1 ? cellText(cells[idx.cat]).trim().slice(0, 60) : '';
    const rule = overrideFor(desc);
    const mapped = theirs ? mapTheirCategory(theirs, amount) : null;
    const category = rule || mapped || categorize(desc);
    const tags = idx.tags !== -1 ? cellText(cells[idx.tags]).replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    transactions.push({
      date, amount, merchant: desc, category, source: 'import',
      ...(tags ? { note: tags } : {}),
      // where the category came from, said on the import sheet; only a file
      // that carries its own Category column has anything to say
      ...(idx.cat !== -1 ? { theirs, categoryFrom: rule ? 'rule' : mapped ? 'theirs' : 'guess' } : {}),
    });
  }
  return { transactions, skipped, skippedLines };
}

export function parseBankCsv(raw) {
  const lines = String(raw || '').split(/\r?\n/).filter((l) => l.trim());
  return parseBankRows(lines.map(splitCsvLine), { kind: 'CSV' });
}

// A BUDGET APP'S .xlsx, READ DIRECTLY (his call 10 Oct 2026, "Read it
// directly"): Billroo's export is "Excel format" with Date, Description,
// Category, Tags, Amount. The first sheet's cells go through the same
// reader as a CSV's, so dedupe, the pending record, his yes and Undo are
// the CSV path's. A file that is not really a spreadsheet says so.
export async function parseBankXlsx(buf) {
  const { readSheet } = await import('read-excel-file/node');
  let rows;
  try {
    rows = await readSheet(buf);
  } catch (e) {
    throw new Error(`this file ends in .xlsx but is not a spreadsheet Nova can open (${String(e.message || e).slice(0, 80)})`);
  }
  return parseBankRows(rows, { kind: 'spreadsheet' });
}

/* ------------------------------- the watcher ------------------------------ */

// pending AND error records block a re-scan of the SAME CONTENT of a file — a
// broken CSV used to spawn a fresh error record every 5-minute tick until the
// file was removed by hand. Keyed on file + content hash: replacing a broken
// export with a corrected one re-scans naturally and supersedes the old record.
async function pendingImportRecords() {
  const items = await listRecords();
  const out = new Map();
  for (const r of items) {
    if (r.kind !== 'money-import' || !(r.status === 'pending' || r.status === 'error')) continue;
    const file = r.decision?.payload?.file;
    if (file) out.set(file, { id: r.id, hash: r.decision?.payload?.contentHash || null, status: r.status });
  }
  return out;
}
async function pendingImportFiles() {
  const items = await listRecords();
  return new Set(
    items
      .filter((r) => r.kind === 'money-import' && (r.status === 'pending' || r.status === 'error'))
      .map((r) => r.decision?.payload?.file)
      .filter(Boolean)
  );
}

export async function scanImports(vaultPath) {
  const dir = path.join(vaultPath, IMPORTS_DIR_REL);
  if (!existsSync(dir)) return { found: 0, records: [] };
  const all = await readdir(dir);
  // A FILE NOVA CANNOT READ IS SAID, NEVER SKIPPED IN SILENCE (mockup 90's
  // file card). An .xlsx is read directly since 10 Oct 2026 (his call,
  // "Read it directly"); a .numbers file or an old .xls still raises one
  // honest card per file and content saying how to re-save it as CSV.
  const unreadable = [];
  for (const f of all.filter((x) => /\.(xls|numbers)$/i.test(x))) {
    try {
      const buf = await readFile(path.join(dir, f));
      const { noteUnreadableFile } = await import('./moneySignals.js');
      const rec = await noteUnreadableFile({ file: f, hash: createHash('sha256').update(buf).digest('hex').slice(0, 16), dir: IMPORTS_DIR_REL });
      if (rec) unreadable.push(rec);
    } catch (e) {
      console.error(`money import: could not note ${f}: ${e.message}`);
    }
  }
  const files = all.filter((f) => /\.(csv|xlsx)$/i.test(f) && !f.startsWith('~$')); // ~$ is Excel's lock file
  if (!files.length) return { found: 0, records: unreadable };

  const existing = new Set((await listTransactions({ sinceMonths: 26 })).map(dedupeKey));
  const alreadyPending = await pendingImportRecords();
  await loadOverrides().catch(() => {}); // his merchant corrections apply to every row parsed below
  const records = [...unreadable];

  for (const file of files) {
    const buf = await readFile(path.join(dir, file));
    const contentHash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
    const isXlsx = /\.xlsx$/i.test(file);
    const prior = alreadyPending.get(file);
    if (prior) {
      if (!prior.hash || prior.hash === contentHash) continue; // the same content already has its record
      // the file was REPLACED — the old record is superseded with a receipt, and the new content is scanned
      await updateRecord(prior.id, { status: 'discarded', discardedAt: new Date().toISOString(), declineReason: `superseded — ${file} was replaced with new content` }).catch(() => {});
    }
    let parsed;
    try {
      parsed = isXlsx ? await parseBankXlsx(buf) : parseBankCsv(buf.toString('utf8'));
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
        decision: { route: 'money-import', confidence: 'low', title: `Import failed — ${file}`, reason: e.message, payload: { file, contentHash, transactions: [] } },
      }));
      // born-error skips 'pending' so the normal push never fires — but a CSV
      // that won't parse is worth exactly one notification (deduped per file)
      import('./push.js').then(({ sendPush }) => sendPush({
        title: 'Ledger import failed — Nova',
        body: `${file}: ${e.message}`.slice(0, 140),
        tag: `import-fail-${file}`,
      })).catch(() => {});
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
        reason: `Parsed from ${IMPORTS_DIR_REL}/${file} — ${fresh.length} new after dedupe (${parsed.transactions.length - fresh.length} already in the ledger${parsed.skipped ? `, ${parsed.skipped} unparseable line${parsed.skipped === 1 ? '' : 's'} skipped: ${parsed.skippedLines.map((l) => `'${l}'`).join(' · ')}${parsed.skipped > parsed.skippedLines.length ? ' …' : ''}` : ''}). ~${spend} spend.`,
        payload: { file, contentHash, transactions: fresh, skippedLines: parsed.skippedLines },
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
    // the full money check runs once a night (his call, 10 Oct 2026), on
    // the first tick past 04:00 his time: price rises, bills now due, odd
    // charges, overs, and old news swept away. Code only, no model.
    const day = dayFmt.format(new Date());
    if (lastFullDay !== day && localHour(Date.now()) >= NIGHTLY_HOUR) {
      lastFullDay = day;
      try {
        const { runMoneySignals } = await import('./moneySignals.js');
        await runMoneySignals({ vaultPath });
      } catch (err) {
        console.error('money signals (nightly) failed:', err.message);
      }
    }
  };
  // ...and an over budget or an odd charge is news the moment a line lands:
  // the ledger pings on every write (lib/money.js onMoneyChange)
  onMoneyChange(async () => {
    const { runMoneySignals, ON_CHANGE_TYPES } = await import('./moneySignals.js');
    await runMoneySignals({ vaultPath, types: ON_CHANGE_TYPES });
  });
  tick();
  setInterval(tick, 5 * 60 * 1000);
}
let lastFullDay = null;
export const NIGHTLY_HOUR = 4;
const hourFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', hourCycle: 'h23' });
const localHour = (t) => Number(hourFmt.format(new Date(t)));
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' });
