// The Scout's deterministic half: what he typed → who to research, and the
// guard against forking a second page for someone already in the vault.
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import test from 'node:test';
import assert from 'node:assert/strict';

const { parseSubject, findExistingPersonPages, buildScoutPrompt, composePersonDossier } = await import('../lib/scout.js');

test('his actual request resolves to the right account', () => {
  const s = parseSubject('https://www.instagram.com/conversationalfreedom');
  assert.equal(s.kind, 'account');
  assert.equal(s.platform, 'Instagram');
  assert.equal(s.handle, 'conversationalfreedom');
  assert.equal(s.label, '@conversationalfreedom on Instagram');
});

test('the platforms he actually uses are recognised, handles normalised', () => {
  assert.equal(parseSubject('https://youtube.com/@hubermanlab').platform, 'YouTube');
  assert.equal(parseSubject('https://youtube.com/@hubermanlab').handle, 'hubermanlab');
  assert.equal(parseSubject('https://x.com/naval').platform, 'X');
  assert.equal(parseSubject('https://twitter.com/naval').platform, 'X', 'twitter.com is still X');
  assert.equal(parseSubject('https://www.tiktok.com/@someone').handle, 'someone');
  // a trailing slash and a tracking tail must not change who it is
  assert.equal(parseSubject('https://www.instagram.com/conversationalfreedom/').handle, 'conversationalfreedom');
});

test('a bare name, a bare handle and an unknown site each stay honest', () => {
  const person = parseSubject('Alex Hormozi');
  assert.equal(person.kind, 'person');
  assert.equal(person.platform, null, 'no platform must be invented');

  const handle = parseSubject('@conversationalfreedom');
  assert.equal(handle.kind, 'account');
  assert.equal(handle.handle, 'conversationalfreedom');
  assert.equal(handle.platform, null, 'an unlocated handle names no platform');

  const site = parseSubject('https://someones-blog.com/about');
  assert.equal(site.kind, 'site');

  assert.throws(() => parseSubject('   '), /who should I research/);
});

test('researching someone twice finds their existing pages instead of forking', async () => {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-scout-vault-'));
  await mkdir(path.join(vault, 'Wiki', 'Entities'), { recursive: true });
  await mkdir(path.join(vault, 'Wiki', 'Sources'), { recursive: true });
  await writeFile(path.join(vault, 'Wiki', 'Entities', 'Conversational Freedom.md'), '---\ntype: entity\n---\nNotes.');
  await writeFile(path.join(vault, 'Wiki', 'Entities', 'Someone Else.md'), '---\ntype: entity\n---\nUnrelated.');

  const s = parseSubject('https://www.instagram.com/conversationalfreedom');
  const found = findExistingPersonPages(vault, s);
  assert.equal(found.pages.length, 1, 'matches across spacing/case, and only the right person');
  assert.ok(found.pages[0].endsWith('Conversational Freedom.md'));

  // matched by URL in the body even when the filename differs
  await writeFile(path.join(vault, 'Wiki', 'Sources', 'A Talk.md'), `---\nurl: ${s.url}\n---\nBody.`);
  assert.equal(findExistingPersonPages(vault, s).pages.length, 2);
});

test('the prompt and provenance never let a researched profile pass as read', () => {
  const s = parseSubject('https://www.instagram.com/conversationalfreedom');
  const p = buildScoutPrompt(s, 'interested in how he frames disagreement');
  assert.ok(/RESEARCHING, NOT WATCHING/.test(p));
  assert.ok(/SAY WHEN YOU ARE BLOCKED/i.test(p), 'a blocked platform must be reportable');
  assert.ok(/NO PRIVATE-LIFE DIGGING/i.test(p));
  assert.ok(p.includes('interested in how he frames disagreement'), 'his emphasis reaches the researcher');

  const d = composePersonDossier(s, '## Core ideas\nx\n## Sources consulted\ny');
  assert.ok(/NOT a complete reading of their work/.test(d));
  assert.ok(d.includes(s.url));
});
