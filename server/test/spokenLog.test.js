// The spoken log's contract: code-authored lines persist, cap, and surface
// in the context block phrased so the model owns them — the fix for Nova
// denying its own Morning Show lines to his face.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'spoken-log.json');
const { logSpoken, recentSpokenBlock } = await import('../lib/spokenLog.js');

test('spoken lines persist, surface with ownership phrasing, and honor the window', async () => {
  const saved = await readFile(FILE, 'utf8').catch(() => null);
  try {
    await writeFile(FILE, JSON.stringify({ lines: [] }));
    await logSpoken('brief', '57 drafts wait in your Inbox — nearest is “Distillation — 5 pages woven into the graph”.');
    await logSpoken('reflex', '10,986 steps yesterday, sir.');
    const block = await recentSpokenBlock();
    assert.match(block, /YOU \(NOVA\) SPOKE RECENTLY/);
    assert.match(block, /own them as things you said, never deny them/);
    assert.match(block, /Distillation — 5 pages woven/);
    assert.match(block, /\[..:.. reflex\] "10,986 steps yesterday, sir\."/);
    // outside the window → silence
    assert.equal(await recentSpokenBlock({ withinMs: 0 }), null);
    // the cap holds
    for (let i = 0; i < 70; i++) await logSpoken('brief', `line ${i}`);
    const raw = JSON.parse(await readFile(FILE, 'utf8'));
    assert.ok(raw.lines.length <= 60, `capped (got ${raw.lines.length})`);
  } finally {
    if (saved != null) await writeFile(FILE, saved); else await writeFile(FILE, JSON.stringify({ lines: [] }));
  }
});
