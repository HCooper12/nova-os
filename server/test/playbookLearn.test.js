// LEARN: the checks code runs on a model's read of a transcript, and the whole
// job from links to a pending record to a page and back (undo). The model and
// the transcript fetch are stubs: nothing here spawns the CLI or touches the
// network. Temp data dir + temp vault BEFORE imports.
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-learn-data-'));
process.env.CLAUDE_BIN = '/nonexistent/claude-must-not-run';

import test from 'node:test';
import assert from 'node:assert/strict';

const L = await import('../lib/playbookLearn.js');
const { cleanLinks, parseTranscriptLines, stampToSec, secToStamp, validateLearn, startLearn, SPOTIFY_WHY } = L;
const { getRecord } = await import('../lib/inboxStore.js');
const { approveRecord, undoRecord } = await import('../lib/inbox.js');
const { parsePlaybook } = await import('../lib/playbooks.js');

const TRANSCRIPT_A = [
  '[00:01] welcome back to the channel today we talk about follow ups',
  '[00:05] send the follow up within one day of the call or the deal goes cold',
  '[00:12] always name the one thing you agreed on the call before anything else',
  '[01:03] studies of forty thousand emails show a one line ask doubles replies',
  '[01:20] take two milligrams of magnesium every night for better sleep trust me',
  '[02:10] never open with an apology because it signals low status',
].join('\n');
const TRANSCRIPT_B = [
  '[00:03] my take is wait two days before following up',
  '[00:20] keep it short and ask a question with a date in it',
].join('\n');

const srcOf = (n, transcript, extra = {}) => {
  const lines = parseTranscriptLines(transcript);
  return { n, title: `Talk ${n}`, speaker: 'Speaker', url: `https://youtu.be/vid${n}aaaaaaa`, lines, norm: lines.map((l) => l.text).join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' '), ...extra };
};

const GOOD = {
  topic: 'Sales follow-ups', summary: 'How to write a follow-up that gets a reply.', triggers: ['Follow Up', 'sales email'], agents: ['all'],
  when: ['After a call with no next step.'], method: ['Name the agreed thing.', 'Ask one dated question.'],
  rules: [
    { text: 'Send the follow-up within a day of the call.', kind: 'stated', source: 1, at: '0:05', quote: 'within one day of the call' },
    { text: 'A one line ask roughly doubles replies.', kind: 'evidenced', evidence: 'a study of forty thousand emails', domain: 'none', needs: 'a list of that size', source: 1, at: '1:03', quote: 'one line ask doubles replies' },
  ],
  phrases: ['name the one thing you agreed on'], mistakes: ['Opening with an apology.'], stops: [], disagreements: [],
};

test('stamps parse and print the same way', () => {
  assert.equal(stampToSec('1:02:03'), 3723);
  assert.equal(secToStamp(3723), '1:02:03');
  assert.equal(secToStamp(65), '1:05');
  assert.equal(parseTranscriptLines('no stamp\n[00:05] hi there\n[1:00:00] later').length, 2);
});

test('links: dedupes by video, rejects Spotify with its reason, stops at ten', () => {
  const r = cleanLinks(['https://youtu.be/abcdefghijk', 'https://www.youtube.com/watch?v=abcdefghijk&si=x', 'https://open.spotify.com/episode/123', 'not a link']);
  assert.deepEqual(r.links, ['https://youtu.be/abcdefghijk']);
  assert.equal(r.rejected.find((x) => /spotify/.test(x.url)).why, SPOTIFY_WHY);
  assert.match(r.rejected.find((x) => x.url === 'not a link').why, /not a web link/);
  const many = cleanLinks(Array.from({ length: 12 }, (_, i) => `https://youtu.be/vidid${String(i).padStart(6, '0')}`));
  assert.equal(many.links.length, 10);
  assert.equal(many.rejected.length, 2);
});

test('validate: keeps a rule traced to a real line, with its condition and evidence', () => {
  const { playbook, dropped } = validateLearn(GOOD, [srcOf(1, TRANSCRIPT_A)]);
  assert.equal(dropped.length, 0);
  assert.equal(playbook.rules.length, 2);
  assert.deepEqual(playbook.rules[1], { text: 'A one line ask roughly doubles replies.', kind: 'evidenced', source: 1, at: '1:03', needs: 'a list of that size' });
  assert.deepEqual(playbook.triggers, ['follow up', 'sales email']);
});

test('validate: drops a rule with no stamp, a stamp that is not a line, a quote that is not there, and a lifted passage', () => {
  const bad = {
    ...GOOD,
    rules: [
      { text: 'Rule with no stamp at all here.', kind: 'stated', source: 1, quote: 'within one day' },
      { text: 'Rule with a made up moment.', kind: 'stated', source: 1, at: '9:59', quote: 'within one day of the call' },
      { text: 'Rule at a real line but the quote is not there.', kind: 'stated', source: 1, at: '0:05', quote: 'the moon is made of cheese' },
      { text: 'send the follow up within one day of the call or the deal goes cold and always name the one thing you agreed on', kind: 'stated', source: 1, at: '0:05', quote: 'within one day of the call' },
      { text: 'Rule about a source that was never read.', kind: 'stated', source: 7, at: '0:05', quote: 'within one day of the call' },
      GOOD.rules[0],
    ],
  };
  const { playbook, dropped } = validateLearn(bad, [srcOf(1, TRANSCRIPT_A)]);
  assert.equal(playbook.rules.length, 1);
  assert.equal(dropped.length, 5);
  const whys = dropped.map((d) => d.why).join(' | ');
  assert.match(whys, /no timestamp/);
  assert.match(whys, /not a line of that transcript/);
  assert.match(whys, /quote is not at/);
  assert.match(whys, /copied the transcript/);
  assert.match(whys, /not read/);
});

test('validate: a health claim with no evidence stays stated, even when the model says evidenced', () => {
  const raw = {
    ...GOOD,
    rules: [
      { text: 'Take two milligrams of magnesium at night for sleep.', kind: 'evidenced', evidence: '', domain: 'health', source: 1, at: '1:20', quote: 'two milligrams of magnesium every night' },
      { text: 'A sleep rule where the speaker gave no data at all.', kind: 'evidenced', source: 1, at: '1:20', quote: 'better sleep trust me' },
    ],
  };
  const { playbook, notes } = validateLearn(raw, [srcOf(1, TRANSCRIPT_A)]);
  assert.equal(playbook.rules.length, 2);
  assert.ok(playbook.rules.every((r) => r.kind === 'stated'));
  assert.ok(notes.length >= 1);
});

test('validate: a phrase not word for word in the transcript is dropped; no traceable rule at all is an error', () => {
  const { playbook, dropped } = validateLearn({ ...GOOD, phrases: ['name the one thing you agreed on', 'a lovely phrase nobody said'] }, [srcOf(1, TRANSCRIPT_A)]);
  assert.deepEqual(playbook.phrases, ['name the one thing you agreed on']);
  assert.ok(dropped.some((d) => /word for word/.test(d.why)));
  assert.throws(() => validateLearn({ ...GOOD, rules: [{ text: 'Nothing real about this rule.', source: 1, at: '9:00', quote: 'x y z' }] }, [srcOf(1, TRANSCRIPT_A)]), /no rule could be traced/);
  assert.throws(() => validateLearn({ ...GOOD, topic: '' }, [srcOf(1, TRANSCRIPT_A)]), /topic/);
});

function stubs({ failFor = [], reads = null } = {}) {
  const calls = { model: [], fetch: [] };
  return {
    calls,
    deps: {
      wait: true,
      transcriptFor: async (url) => {
        calls.fetch.push(url);
        if (failFor.some((f) => url.includes(f))) throw new Error('Video unavailable');
        const b = url.includes('second');
        return { title: b ? 'Second talk' : 'First talk', uploader: b ? 'B. Closer' : 'A. Seller', transcript: b ? TRANSCRIPT_B : TRANSCRIPT_A, from: 'a stub' };
      },
      runModel: async (prompt) => {
        calls.model.push(prompt);
        if (reads) return reads(calls.model.length, prompt);
        return GOOD;
      },
    },
  };
}

test('one good link and one dead link: carries on, reports the dead one, files ONE pending record; yes writes the page, undo removes it', async () => {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-learn-vault-'));
  const { deps, calls } = stubs({ failFor: ['dead'] });
  const started = await startLearn(vault, { urls: ['https://youtu.be/first00001a', 'https://youtu.be/dead00000aa', 'https://open.spotify.com/episode/x'], purpose: 'follow-up emails' }, deps);
  await started.done;
  const rec = await getRecord(started.id);
  assert.equal(rec.kind, 'playbook');
  assert.equal(rec.status, 'pending');
  assert.equal(rec.decision.route, 'playbook');
  assert.equal(calls.model.length, 1, 'one source, one read, no merge');
  assert.match(calls.model[0], /follow-up emails/);
  const byUrl = Object.fromEntries(rec.learn.links.map((l) => [l.url, l]));
  assert.equal(byUrl['https://youtu.be/first00001a'].status, 'read');
  assert.equal(byUrl['https://youtu.be/dead00000aa'].status, 'failed');
  assert.match(byUrl['https://youtu.be/dead00000aa'].error, /Video unavailable/);
  assert.equal(byUrl['https://open.spotify.com/episode/x'].error, SPOTIFY_WHY);
  assert.match(rec.decision.payload.body, /Could not read: https:\/\/youtu\.be\/dead00000aa/);
  assert.match(rec.decision.payload.body, /Could not read: https:\/\/open\.spotify\.com/);
  assert.ok(!existsSync(path.join(vault, 'Wiki', 'Playbooks')), 'nothing is written before his yes');

  const filed = await approveRecord(vault, rec.id);
  assert.equal(filed.status, 'filed');
  assert.equal(filed.destination, 'Wiki/Playbooks/Sales follow-ups.md');
  const page = parsePlaybook(await readFile(path.join(vault, filed.destination), 'utf8'));
  assert.equal(page.rules.length, 2);
  assert.equal(page.sources.length, 1);
  assert.equal(page.sources[0].url, 'https://youtu.be/first00001a');
  assert.ok(!(await readFile(path.join(vault, filed.destination), 'utf8')).includes('welcome back to the channel'), 'no transcript line in the page');

  await undoRecord(vault, rec.id);
  assert.ok(!existsSync(path.join(vault, filed.destination)));
});

test('two sources are merged by a second pass, and the same topic extends the page keeping prior sources', async () => {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-learn-vault-'));
  const one = stubs();
  const a = await startLearn(vault, { urls: ['https://youtu.be/first00002a'] }, one.deps);
  await a.done;
  await approveRecord(vault, a.id);

  const two = stubs({
    reads: (n) => (n < 3
      ? { ...GOOD, rules: [{ text: 'Wait two days before following up.', kind: 'stated', source: 2, at: '0:03', quote: 'wait two days before following up' }] }
      : {
        ...GOOD,
        rules: [{ text: 'Wait two days before following up.', kind: 'stated', source: 1, at: '0:03', quote: 'wait two days before following up' }],
        disagreements: ['First talk says send within a day; Second talk says wait two days.'],
      }),
  });
  const b = await startLearn(vault, { urls: ['https://youtu.be/second0003a', 'https://youtu.be/first00003a'] }, two.deps);
  await b.done;
  assert.equal(two.calls.model.length, 3, 'a read per source, then one merge');
  assert.match(two.calls.model[2], /merging/);
  const rec = await getRecord(b.id);
  assert.equal(rec.status, 'pending', rec.error || '');
  assert.equal(rec.decision.payload.playbook.disagreements.length, 1, 'where the sources disagree is said, not blended');
  assert.equal(rec.decision.payload.playbook.sources.length, 2);
});

test('extending: the same topic keeps the prior source and adds the new one', async () => {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-learn-vault-'));
  const a = await startLearn(vault, { urls: ['https://youtu.be/first00004a'] }, stubs().deps);
  await a.done;
  await approveRecord(vault, a.id);

  const second = stubs({
    reads: () => ({ ...GOOD, rules: [{ text: 'Keep it short and ask a dated question.', kind: 'stated', source: 1, at: '0:20', quote: 'ask a question with a date in it' }], phrases: [], disagreements: ['Another talk says wait two days.'] }),
  });
  const b = await startLearn(vault, { urls: ['https://youtu.be/second0004a'] }, second.deps);
  await b.done;
  const rec = await getRecord(b.id);
  assert.equal(rec.status, 'pending', rec.error || '');
  assert.match(rec.decision.title, /^Extend playbook/);
  assert.match(second.calls.model[0], /Sales follow-ups/, 'the model is told the page exists');
  const filed = await approveRecord(vault, b.id);
  const page = parsePlaybook(await readFile(path.join(vault, filed.destination), 'utf8'));
  assert.equal(page.sources.length, 2);
  assert.equal(page.sources[0].url, 'https://youtu.be/first00004a');
  assert.equal(page.rules.length, 3, 'two prior rules plus the new one');
  assert.equal(page.rules.at(-1).source, 2);
  assert.equal(page.disagreements.length, 1);
  await undoRecord(vault, b.id);
  assert.equal(parsePlaybook(await readFile(path.join(vault, filed.destination), 'utf8')).sources.length, 1, 'undo puts the first version back');
});

test('every link failing is an error that names each reason; nothing is filed and no model is asked', async () => {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-learn-vault-'));
  const { deps, calls } = stubs({ failFor: ['dead'] });
  const s = await startLearn(vault, { urls: ['https://youtu.be/dead00001aa', 'https://youtu.be/dead00002aa'] }, deps);
  await s.done;
  const rec = await getRecord(s.id);
  assert.equal(rec.status, 'error');
  assert.match(rec.error, /nothing could be read/);
  assert.match(rec.error, /dead00001aa: Video unavailable/);
  assert.equal(calls.model.length, 0);
  assert.ok(!rec.decision);
});

test('a transcript with no timestamps cannot be learned from, and says why', async () => {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-learn-vault-'));
  const { deps } = stubs();
  deps.transcriptFor = async () => ({ title: 'x', uploader: 'y', transcript: 'just words with no stamps at all', from: 'stub' });
  const s = await startLearn(vault, { urls: ['https://youtu.be/nostamps001a'] }, deps);
  await s.done;
  const rec = await getRecord(s.id);
  assert.equal(rec.status, 'error');
  assert.match(rec.error, /no timestamps/);
});

test('the same ask while it runs rides the first run; an empty ask is refused', async () => {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-learn-vault-'));
  let release;
  const gate = new Promise((r) => { release = r; });
  const { deps } = stubs();
  const inner = deps.runModel;
  deps.runModel = async (...a) => { await gate; return inner(...a); };
  const a = await startLearn(vault, { urls: ['https://youtu.be/dupe00001aaa'] }, deps);
  const b = await startLearn(vault, { urls: ['https://youtu.be/dupe00001aaa'] }, deps);
  assert.equal(b.repeat, true);
  assert.equal(b.id, a.id);
  release();
  await a.done;
  await assert.rejects(startLearn(vault, { urls: [] }, deps), /at least one link/);
});
