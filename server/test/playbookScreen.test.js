// LEARN, THE SCREEN AND THE DRILLS (16 Nov 2026): a short video is also read as
// frames, a silent one from its frames alone; a rule read off the screen must
// point at a frame Nova offered and a read that opened frames; the drills for
// him reach the Repertoire on his yes and leave it on undo. The model, the
// transcript and the screen are stubs: nothing spawns the CLI or the network.
import { mkdtemp, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-screen-data-'));
process.env.CLAUDE_BIN = '/nonexistent/claude-must-not-run';

import test from 'node:test';
import assert from 'node:assert/strict';

const { validateLearn, evidenceFor, isShortForm, startLearn, parseTranscriptLines, SCREEN_MAX_SEC } = await import('../lib/playbookLearn.js');
const { formatPlaybook, parsePlaybook } = await import('../lib/playbooks.js');
const { getRecord } = await import('../lib/inboxStore.js');
const { approveRecord, undoRecord } = await import('../lib/inbox.js');
const { REPERTOIRE_REL, parseRepertoire } = await import('../lib/repertoire.js');

const SPEECH = [
  '[00:01] five hacks for building a website with claude',
  '[00:06] first write a claude md file that says what the site is for',
  '[00:14] then loop screenshot fix screenshot until it looks right',
].join('\n');
const FRAMES = [{ sec: 0, t: '0:00', path: '/w/f1.jpg' }, { sec: 9, t: '0:09', path: '/w/f2.jpg' }, { sec: 21, t: '0:21', path: '/w/f3.jpg' }];
const srcOf = (n, transcript, frames = []) => {
  const lines = parseTranscriptLines(transcript);
  return { n, title: `Reel ${n}`, speaker: 'Maker', url: `https://www.instagram.com/reel/R${n}/`, lines, frames, norm: lines.map((l) => l.text).join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ') };
};
const READ = {
  topic: 'Building a website with Claude', summary: 'Build a site with Claude in a tight loop.', triggers: ['build a website', 'landing page'], agents: ['all'],
  when: ['Starting a new site.'], method: ['Write the project file.', 'Loop screenshot and fix.'],
  rules: [
    { text: 'Write a project file stating what the site is for before any code.', kind: 'stated', source: 1, at: '0:06', quote: 'write a claude md file', seen: false },
    { text: 'Study three inspiration sites before choosing a layout.', kind: 'stated', source: 1, at: '0:09', quote: 'Inspiration Sites', seen: true },
  ],
  phrases: [], mistakes: [], stops: [], disagreements: [],
  drills: [
    { name: 'Screenshot loop', summary: 'Fix what the screenshot shows, not what you imagine.', move: 'Loop screenshot, fix, screenshot until it looks right.', drill: 'Build one small page today and run three screenshot-fix rounds on it.', tell: 'The third screenshot needs no fix.' },
    { name: 'Just read about it', move: 'x', drill: 'read about it later' },
  ],
  framesRead: 3,
};

test('short-form hosts are recognised, including YouTube Shorts', () => {
  assert.equal(isShortForm('https://www.instagram.com/reel/Dfx1B1euKsl/'), true);
  assert.equal(isShortForm('https://youtube.com/shorts/abc'), true);
  assert.equal(isShortForm('https://www.youtube.com/watch?v=abc'), false);
  assert.equal(isShortForm('not a url'), false);
});

test('validate: a seen rule is kept only at an offered frame, with frames opened, and the page says "on screen"', () => {
  const src = srcOf(1, SPEECH, FRAMES);
  const ok = validateLearn(READ, [src], { framesRead: new Map([[1, 3]]) });
  assert.equal(ok.playbook.rules.length, 2);
  const seen = ok.playbook.rules.find((r) => r.seen);
  assert.equal(seen.at, '0:09');
  assert.ok(ok.notes.some((n) => /read off the screen/.test(n) && /cannot check what the frame shows/.test(n)));
  const raw = formatPlaybook(ok.playbook);
  assert.match(raw, /\(stated, S1 0:09, on screen\)/);
  assert.match(raw, /\(stated, S1 0:06\)/);
  assert.equal(formatPlaybook(parsePlaybook(raw)), raw, 'the round trip stays byte-identical');
  assert.equal(parsePlaybook(raw).rules.find((r) => r.at === '0:09').seen, true);

  const none = validateLearn(READ, [src], { framesRead: new Map() });
  assert.equal(none.playbook.rules.length, 1);
  assert.ok(none.dropped.some((d) => /opened no frames/.test(d.why)));

  const wrongMoment = validateLearn({ ...READ, rules: [READ.rules[0], { ...READ.rules[1], at: '0:10' }] }, [src], { framesRead: new Map([[1, 3]]) });
  assert.ok(wrongMoment.dropped.some((d) => /0:10 is not a frame Nova offered/.test(d.why)));

  const noFrames = validateLearn(READ, [srcOf(1, SPEECH)], { framesRead: new Map([[1, 3]]) });
  assert.ok(noFrames.dropped.some((d) => /no frames of that source were offered/.test(d.why)));
});

test('validate: drills need a real drill and a move; a health playbook gets none', () => {
  const src = srcOf(1, SPEECH, FRAMES);
  const { drills } = validateLearn(READ, [src], { framesRead: new Map([[1, 3]]) });
  assert.equal(drills.length, 1, '"read about it" is not a drill');
  assert.equal(drills[0].family, 'Building a website with Claude');
  assert.equal(drills[0].source, 'Playbook: Building a website with Claude');

  const health = validateLearn({ ...READ, topic: 'Hypertrophy training' }, [src], { framesRead: new Map([[1, 3]]) });
  assert.deepEqual(health.drills, []);
  assert.ok(health.notes.some((n) => /Coach/.test(n)));
});

test('evidence: a reel reads the screen first in one fetch; a long video only listens; a silent reel is frames alone; both failing names both', async () => {
  const calls = [];
  const ear = async (u) => { calls.push(`ear ${u}`); return { title: 'T', uploader: 'U', transcript: SPEECH, from: 'kept' }; };
  const eye = (transcript) => async (u) => { calls.push(`eye ${u}`); return { title: 'T', uploader: 'U', transcript, transcriptSource: 'whisper', frames: FRAMES }; };

  const reel = await evidenceFor('https://www.instagram.com/reel/R1/', '/tmp/x', { getTranscript: ear, getScreen: eye(SPEECH) });
  assert.deepEqual(calls, ['eye https://www.instagram.com/reel/R1/'], 'one fetch brings speech and screen');
  assert.equal(reel.lines.length, 3);
  assert.equal(reel.frames.length, 3);
  assert.match(reel.from, /3 frames of the screen/);

  calls.length = 0;
  const longTalk = ['[00:01] hello', `[${Math.floor((SCREEN_MAX_SEC + 60) / 60)}:00] much later`].join('\n');
  const long = await evidenceFor('https://www.youtube.com/watch?v=L', '/tmp/x', { getTranscript: async () => ({ title: 'L', uploader: '', transcript: longTalk, from: 'kept' }), getScreen: eye(null) });
  assert.equal(long.frames.length, 0, 'a talk over ten minutes is not downloaded for frames');
  assert.deepEqual(calls, []);

  const silent = await evidenceFor('https://www.instagram.com/reel/R2/', '/tmp/x', { getTranscript: async () => { throw new Error('no captions'); }, getScreen: eye(null) });
  assert.equal(silent.lines.length, 0);
  assert.equal(silent.frames.length, 3);
  assert.match(silent.from, /^no speech, and 3 frames/);

  await assert.rejects(
    evidenceFor('https://www.instagram.com/reel/R3/', '/tmp/x', { getTranscript: async () => { throw new Error('no captions'); }, getScreen: async () => { throw new Error('login required'); } }),
    /no captions; the screen could not be read: login required/,
  );
});

test('a silent reel becomes a pending playbook from its frames; yes adds the drill to his Repertoire; undo takes both back', async () => {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-screen-vault-'));
  const prompts = [];
  const deps = {
    wait: true,
    transcriptFor: async () => { throw new Error('the link has no transcript, and no captions to read'); },
    screenFor: async () => ({ title: 'Website hacks', uploader: 'Maker', transcript: null, frames: FRAMES }),
    runModel: async (p) => { prompts.push(p); return { ...READ, rules: [READ.rules[1]] }; },
  };
  const s = await startLearn(vault, { urls: ['https://www.instagram.com/reel/SILENT1/'], purpose: 'build websites' }, deps);
  await s.done;
  const rec = await getRecord(s.id);
  assert.equal(rec.status, 'pending', rec.error || '');
  assert.match(prompts[0], /transcript: none \(no speech could be read; the screen is all there is\)/);
  assert.match(prompts[0], /t=0:09: \/w\/f2\.jpg/);
  assert.match(prompts[0], /Open EVERY frame/);
  assert.match(rec.text, /1 drill for you/);
  assert.match(rec.decision.payload.body, /For you to practise/);
  assert.equal(rec.learn.links[0].frames, 3);

  const filed = await approveRecord(vault, rec.id);
  assert.equal(filed.status, 'filed');
  assert.match(filed.destination, /^Wiki\/Playbooks\/Building a website with Claude\.md and 1 drill in /);
  const page = await readFile(path.join(vault, 'Wiki/Playbooks/Building a website with Claude.md'), 'utf8');
  assert.match(page, /on screen\)/);
  const rep = parseRepertoire(await readFile(path.join(vault, REPERTOIRE_REL), 'utf8'));
  assert.equal(rep[0].name, 'Building a website with Claude');
  assert.equal(rep[0].techniques[0].name, 'Screenshot loop');

  await undoRecord(vault, rec.id);
  assert.ok(!existsSync(path.join(vault, 'Wiki/Playbooks/Building a website with Claude.md')));
  const after = existsSync(path.join(vault, REPERTOIRE_REL)) ? parseRepertoire(await readFile(path.join(vault, REPERTOIRE_REL), 'utf8')) : [];
  assert.equal(after.flatMap((f) => f.techniques).length, 0, 'the drill left with the page');
});

test('a read that says it opened no frames keeps no seen rule, and with nothing heard the learn fails honestly', async () => {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-screen-vault-'));
  const deps = {
    wait: true,
    transcriptFor: async () => { throw new Error('no captions'); },
    screenFor: async () => ({ title: 'Website hacks', uploader: 'Maker', transcript: null, frames: FRAMES }),
    runModel: async () => ({ ...READ, rules: [READ.rules[1]], framesRead: 0 }),
  };
  const s = await startLearn(vault, { urls: ['https://www.instagram.com/reel/SILENT2/'] }, deps);
  await s.done;
  const rec = await getRecord(s.id);
  assert.equal(rec.status, 'error');
  assert.match(rec.error, /no rule could be traced to a real line of the transcript or a frame/);
  assert.match(rec.error, /opened no frames/);
});
