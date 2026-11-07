// Playbooks: the page contract (round-trip identity), the merge that keeps
// prior sources, the write and its undo, the trigger match and the block that
// goes into a prompt, and the application log. Temp data dir + temp vault
// BEFORE imports; nothing here touches his data or the network.
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-playbooks-data-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const pbs = await import('../lib/playbooks.js');
const { parsePlaybook, formatPlaybook, mergePlaybook, writePlaybookPage, undoPlaybook, listPlaybooks, matchPlaybooks, playbookIndex, playbookBlock, playbookTurn, labelPlaybooks, appliedSummary, appliedLogPath, dropPlaybookCache, BLOCK_CHARS } = pbs;

const vaultOf = async () => mkdtemp(path.join(tmpdir(), 'nova-playbooks-vault-'));

const SAMPLE = () => ({
  ...pbs.emptyPlaybook(),
  title: 'Sales follow-ups',
  summary: 'How to write a follow-up that gets a reply.',
  triggers: ['follow up', 'sales email'],
  sources: [{ n: 1, title: 'Follow-ups that close', speaker: 'A. Seller', url: 'https://youtu.be/abcdefghijk' }],
  created: '2026-11-07', updated: '2026-11-07',
  when: ['After a call that ended without a next step.'],
  method: ['Name the one thing agreed on the call.', 'Ask one question with a date in it.'],
  rules: [
    { text: 'Send it within a day.', kind: 'stated', source: 1, at: '2:05' },
    { text: 'Replies rise when the ask is one line.', kind: 'evidenced', source: 1, at: '1:02:03', needs: 'a list over a thousand contacts' },
    { text: 'Lead with their words, not yours.', kind: 'stated', source: 0, at: '' },
  ],
  phrases: ['Does Thursday still work?'],
  mistakes: ['Opening with an apology.'],
  stops: ['Cold outreach to a stranger.'],
});
const src = (n, id) => ({ n, title: 'T', speaker: 'S', url: `https://youtu.be/${id}` });

test('a page formatPlaybook wrote round-trips byte for byte', () => {
  const raw = formatPlaybook(SAMPLE());
  assert.equal(formatPlaybook(parsePlaybook(raw)), raw);
  const pb = parsePlaybook(raw);
  assert.equal(pb.rules[1].needs, 'a list over a thousand contacts');
  assert.equal(pb.rules[2].source, 0, 'a rule he added himself has no source');
  assert.deepEqual(pb.agents, ['all']);
  assert.equal(pb.sources[0].url, 'https://youtu.be/abcdefghijk');
});

test('a quote in a trigger or a source title survives the round trip', () => {
  const s = SAMPLE();
  s.triggers = ["don't ghost"];
  s.sources[0].title = "It's about the ask";
  const raw = formatPlaybook(s);
  assert.equal(formatPlaybook(parsePlaybook(raw)), raw);
  assert.equal(parsePlaybook(raw).triggers[0], "don't ghost");
});

test('writing a page, then extending it, keeps prior sources and his edits; undo restores', async () => {
  const vault = await vaultOf();
  const first = await writePlaybookPage(vault, SAMPLE());
  assert.equal(first.created, true);
  assert.equal(first.relPath, 'Wiki/Playbooks/Sales follow-ups.md');

  // he edits the page by hand: a rule of his own at the end of Rules
  const edited = first.content.replace('\n## Phrases to reuse', '- Always say thanks first.\n\n## Phrases to reuse');
  assert.notEqual(edited, first.content);
  await writeFile(path.join(vault, first.relPath), edited, 'utf8');

  const more = {
    ...pbs.emptyPlaybook(), title: 'Sales follow-ups', triggers: ['reply email'],
    sources: [{ n: 1, title: 'Second talk', speaker: 'B. Closer', url: 'https://youtu.be/zzzzzzzzzzz' }],
    rules: [
      { text: 'Send it within a day.', kind: 'stated', source: 1, at: '3:00' },
      { text: 'Skip the pleasantries.', kind: 'stated', source: 1, at: '4:10' },
    ],
    disagreements: ['A says send in a day; B says wait two.'],
  };
  const second = await writePlaybookPage(vault, more);
  assert.equal(second.created, false);
  const pb = parsePlaybook(second.content);
  assert.equal(pb.sources.length, 2, 'prior source kept, new one added');
  assert.equal(pb.sources[1].n, 2);
  assert.ok(pb.rules.some((r) => r.text === 'Always say thanks first.'), 'his own rule kept');
  assert.ok(pb.rules.some((r) => r.text === 'Skip the pleasantries.' && r.source === 2), 'new rule points at the new source number');
  assert.equal(pb.rules.filter((r) => /within a day/.test(r.text)).length, 1, 'a rule already there is not doubled');
  assert.deepEqual(pb.triggers, ['follow up', 'sales email', 'reply email']);
  assert.equal(pb.disagreements.length, 1);

  const msg = await undoPlaybook(vault, { relPath: second.relPath, hash: second.hash, prior: second.prior });
  assert.match(msg, /as it was/);
  assert.equal(await readFile(path.join(vault, first.relPath), 'utf8'), edited);

  const v2 = await vaultOf();
  const f = await writePlaybookPage(v2, SAMPLE());
  await writeFile(path.join(v2, f.relPath), `${f.content}\nhis note\n`, 'utf8');
  await assert.rejects(undoPlaybook(v2, { relPath: f.relPath, hash: f.hash }), /edited since filing/);
  await writeFile(path.join(v2, f.relPath), f.content, 'utf8');
  await undoPlaybook(v2, { relPath: f.relPath, hash: f.hash });
  assert.equal(existsSync(path.join(v2, f.relPath)), false);
});

test('the same link is not a second source when a page is extended', () => {
  const existing = SAMPLE();
  const merged = mergePlaybook(existing, { ...pbs.emptyPlaybook(), sources: [{ n: 1, title: 'x', speaker: 'y', url: existing.sources[0].url }], rules: [{ text: 'New thing.', kind: 'stated', source: 1, at: '0:10' }] });
  assert.equal(merged.sources.length, 1);
  assert.equal(merged.rules.at(-1).source, 1);
});

test('a path outside Wiki/Playbooks is refused on undo', async () => {
  const vault = await vaultOf();
  await assert.rejects(undoPlaybook(vault, { relPath: '../x.md', hash: 'a' }), /not a playbook/);
});

test('triggers match by words, not substrings; two at most; the agent filter holds', async () => {
  const vault = await vaultOf();
  await writePlaybookPage(vault, SAMPLE());
  await writePlaybookPage(vault, { ...SAMPLE(), title: 'Cold calls', triggers: ['cold call', 'follow up call'], sources: [src(1, 'ccccccccccc')] });
  await writePlaybookPage(vault, { ...SAMPLE(), title: 'Third', triggers: ['follow'], agents: ['coach'], sources: [src(1, 'ddddddddddd')] });
  const items = playbookIndex(vault);
  assert.deepEqual(matchPlaybooks(items, { text: 'Write the follow-ups for the sales email list', agent: 'nova' }).map((p) => p.title), ['Sales follow-ups']);
  assert.deepEqual(matchPlaybooks(items, { text: 'draft a follow up call script', agent: 'nova' }).map((p) => p.title), ['Cold calls', 'Sales follow-ups']);
  assert.deepEqual(matchPlaybooks(items, { text: 'I followed my plan', agent: 'nova' }), [], 'no trigger, no match');
  assert.deepEqual(matchPlaybooks(items, { text: 'a follow', agent: 'studio' }), [], 'agents:[coach] does not reach studio');
  assert.equal(matchPlaybooks(items, { text: 'a follow', agent: 'coach' })[0].title, 'Third');
  assert.deepEqual(matchPlaybooks(items, { text: '', agent: 'nova' }), []);
});

test('the index is cached: no re-read until the folder changes', async () => {
  const vault = await vaultOf();
  await writePlaybookPage(vault, SAMPLE());
  const a = playbookIndex(vault);
  assert.equal(playbookIndex(vault), a, 'same array object while nothing changed');
  await writePlaybookPage(vault, { ...SAMPLE(), title: 'Another', triggers: ['another'], sources: [src(1, 'eeeeeeeeeee')] });
  assert.equal(playbookIndex(vault).length, 2, 'a write drops the cache');
  assert.deepEqual(playbookIndex(await vaultOf()), [], 'no folder, no playbooks');
});

test('the block states the limit, marks stated vs evidenced, and says it never overrides', async () => {
  const vault = await vaultOf();
  const big = SAMPLE();
  big.rules = Array.from({ length: 80 }, (_, i) => ({ text: `Rule number ${i} says do a particular thing in a particular way.`, kind: i % 2 ? 'evidenced' : 'stated', source: 1, at: `${i}:00` }));
  await writePlaybookPage(vault, big);
  const block = playbookBlock(matchPlaybooks(playbookIndex(vault), { text: 'sales email', agent: 'nova' }));
  assert.ok(block.length <= BLOCK_CHARS + 900, `block stays small (${block.length})`);
  assert.match(block, /Trimmed to fit/);
  assert.match(block, /never override your rules/);
  assert.match(block, /\[stated\]/);
  assert.match(block, /\[evidenced\]/);
  assert.match(block, /The method:/);
  assert.equal(playbookBlock([]), '');
});

test('applying logs date, playbook, agent and turn id; the job carries the "using" line', async () => {
  const vault = await vaultOf();
  await writePlaybookPage(vault, SAMPLE());
  const t = playbookTurn({ text: 'write my follow up', agent: 'coach', vaultPath: vault, turnId: 'job123' });
  assert.deepEqual(t.titles, ['Sales follow-ups']);
  await new Promise((r) => setTimeout(r, 80));
  const rows = (await readFile(appliedLogPath(), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  const last = rows.at(-1);
  assert.equal(last.playbook, 'Sales follow-ups');
  assert.equal(last.agent, 'coach');
  assert.equal(last.turnId, 'job123');
  assert.match(last.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok((await appliedSummary()).byPlaybook['Sales follow-ups'].uses >= 1);

  const job = { status: 'running', result: null };
  labelPlaybooks(job, t.titles);
  job.result = { text: 'Here you go.' };
  job.status = 'ready';
  assert.equal(job.status, 'ready');
  assert.equal(job.result.playbookLine, 'using: Sales follow-ups');
  assert.deepEqual(job.result.usedPlaybooks, ['Sales follow-ups']);

  const before = (await readFile(appliedLogPath(), 'utf8')).length;
  const none = playbookTurn({ text: 'what is my weight', agent: 'nova', vaultPath: vault, turnId: 'x' });
  assert.equal(none.block, '');
  await new Promise((r) => setTimeout(r, 40));
  assert.equal((await readFile(appliedLogPath(), 'utf8')).length, before, 'no match logs nothing');
});

test('listPlaybooks skips pages of another type and reads a hand-made page', async () => {
  const vault = await vaultOf();
  await mkdir(path.join(vault, 'Wiki', 'Playbooks'), { recursive: true });
  await writeFile(path.join(vault, 'Wiki', 'Playbooks', 'Other.md'), '---\ntype: note\n---\n# Other\n', 'utf8');
  await writeFile(path.join(vault, 'Wiki', 'Playbooks', 'Mine.md'), '---\ntype: playbook\ntriggers:\n  - pricing\n---\n# Mine\n\nWhat I know.\n\n## Rules\n- Never discount first.\n', 'utf8');
  dropPlaybookCache();
  const all = await listPlaybooks(vault);
  assert.deepEqual(all.map((p) => p.title), ['Mine']);
  assert.equal(all[0].rules[0].text, 'Never discount first.');
  assert.equal(matchPlaybooks(playbookIndex(vault), { text: 'set my pricing', agent: 'nova' })[0].title, 'Mine');
});
