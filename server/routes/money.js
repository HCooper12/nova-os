import { Router } from 'express';
import { writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getMonthSummary, addTransactions, removeTransactions, setTransactionCategory, setBudget, exportFinancialYear, listMonths, CATEGORIES } from '../lib/money.js';
import { scanImports, IMPORTS_DIR_REL } from '../lib/moneyImport.js';
import { startStatementScan, getStatementScanJob } from '../lib/scanStatement.js';
import { runCfoReport } from '../lib/cfoReport.js';

const IMAGE_DATA_URL = /^data:image\/(jpeg|jpg|png|webp|gif);base64,(.+)$/;

export function moneyRouter(vaultPath) {
  const router = Router();

  router.get('/money', async (req, res, next) => {
    try {
      const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : undefined;
      const summary = await getMonthSummary(month);
      res.json({ ...summary, months: await listMonths(), categories: CATEGORIES, importsDir: IMPORTS_DIR_REL });
    } catch (err) {
      next(err);
    }
  });

  router.post('/money/transaction', async (req, res) => {
    try {
      const [added] = await addTransactions([req.body || {}], 'manual');
      res.json({ transaction: added });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/money/transaction/:id/remove', async (req, res) => {
    try {
      const removed = await removeTransactions([req.params.id]);
      if (!removed) return res.status(404).json({ error: 'transaction not found' });
      res.json({ removed });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/money/transaction/:id/category', async (req, res) => {
    try {
      res.json({ transaction: await setTransactionCategory(req.params.id, req.body?.category) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/money/budget', async (req, res) => {
    try {
      res.json({ budgets: await setBudget(req.body?.category, req.body?.amount) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/money/import/run', async (req, res) => {
    try {
      res.json(await scanImports(vaultPath));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/money/report', async (req, res) => {
    try {
      res.json(await runCfoReport({ force: !!req.body?.force }));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/money/export/:fy', async (req, res) => {
    try {
      const fy = Number(req.params.fy);
      if (!Number.isInteger(fy) || fy < 2020 || fy > 2100) return res.status(400).json({ error: 'fy must be a year like 2026' });
      const { filename, csv, count } = await exportFinancialYear(fy);
      res.set('Content-Type', 'text/csv').set('Content-Disposition', `attachment; filename="${filename}"`).set('X-Row-Count', String(count)).send(csv);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/money/scan-statement', async (req, res) => {
    try {
      const { images, note } = req.body || {};
      if (!Array.isArray(images) || !images.length) return res.status(400).json({ error: 'at least one image is required' });
      if (images.length > 3) return res.status(400).json({ error: 'up to 3 images per scan' });
      const workDir = path.join(tmpdir(), `nova-statement-${randomUUID().slice(0, 8)}`);
      await mkdir(workDir, { recursive: true });
      const paths = [];
      for (let i = 0; i < images.length; i++) {
        const m = String(images[i]).match(IMAGE_DATA_URL);
        if (!m) return res.status(400).json({ error: 'images must be jpeg/png/webp/gif data URLs' });
        const p = path.join(workDir, `page-${i + 1}.${m[1] === 'jpg' ? 'jpeg' : m[1]}`);
        await writeFile(p, Buffer.from(m[2], 'base64'));
        paths.push(p);
      }
      res.json({ jobId: startStatementScan(paths, workDir, typeof note === 'string' ? note.trim() : '') });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/money/scan/:jobId', (req, res) => {
    const job = getStatementScanJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'unknown job' });
    res.json(job);
  });

  // A finished scan's transactions → one pending money-import record on the
  // rails (deduped against the ledger), same as a CSV drop.
  router.post('/money/scan-file', async (req, res) => {
    try {
      const raw = Array.isArray(req.body?.transactions) ? req.body.transactions : [];
      if (!raw.length) return res.status(400).json({ error: 'no transactions to file' });
      const { listTransactions, dedupeKey } = await import('../lib/money.js');
      const { createRecord } = await import('../lib/inboxStore.js');
      const { randomUUID: uuid } = await import('node:crypto');
      const existing = new Set((await listTransactions({ sinceMonths: 26 })).map(dedupeKey));
      const fresh = raw.filter((t) => !existing.has(dedupeKey(t)));
      if (!fresh.length) return res.json({ record: null, duplicates: raw.length });
      const spend = Math.round(fresh.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0));
      const title = `${fresh.length} transaction${fresh.length === 1 ? '' : 's'} from a statement photo`;
      const record = await createRecord({
        id: uuid().slice(0, 8),
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
          reason: `Extracted by photo scan — ${fresh.length} new after dedupe${raw.length - fresh.length ? ` (${raw.length - fresh.length} already in the ledger)` : ''}. ~$${spend} spend.`,
          payload: { transactions: fresh },
        },
      });
      res.json({ record, duplicates: raw.length - fresh.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
