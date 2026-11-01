// Projects phase 2, the screen's view model and the glass: every line comes
// from a real record field; Home counts what really waits. Pure, no I/O.
import test from 'node:test';
import assert from 'node:assert/strict';
import { valsProjects, projectsWaiting, researchFeed, candidatesCard } from '../../src/vals/valsProjects.js';
import { projectResearchStages, stagesFor, newStages } from '../../src/jobBeats.js';
import { libraryFlagOf, tellMeOf } from '../../src/vals/valsInbox.js';

const PID = 'aaaaaaaa';
const calls = [];
const app = (st) => ({
  state: { liveProjects: [], ...st },
  setState() {}, openProject() {}, navigate() {},
  openCapture: (id) => calls.push(['open', id]), inboxAction: (id, k) => calls.push([k, id]),
  tellMeAbout: (p, id) => calls.push(['tell', p, id]), fileProjectWatchToLibrary: (id) => calls.push(['lib', id]),
  toggleProjectCandidate: (r, u) => calls.push(['toggle', r, u]), watchProjectCandidates: (p, r, urls) => calls.push(['watch', p, r, urls]),
  sendProjectResearch: () => {}, sendProjectVideo: () => {}, setProjectSetting: () => {},
});
const research = (over = {}) => ({ id: 'r1', kind: 'project-research', projectId: PID, status: 'filed', text: 'Research: oak or ash?', createdAt: '2026-11-01T01:00:00Z', summary: '3 claims from 2 sources · 1 claim left out: no source', droppedClaims: 1, model: 'sonnet', costUsd: 0.42, decision: { title: 'Oak or ash', route: 'project-research' }, ...over });
const watch = (over = {}) => ({ id: 'w1', kind: 'video', projectId: PID, status: 'filed', lens: 'design', lensUsed: 'design', text: 'Watch: https://youtu.be/x', createdAt: '2026-11-01T02:00:00Z', destination: 'Room — Sources/Tour.md', decision: { title: 'Japandi tour', route: 'project-watch-note', payload: {} }, libraryWorthy: { yes: true, reason: 'It is about light and sleep.' }, ...over });
const cands = { id: 'c1', kind: 'project-watch-candidates', projectId: PID, status: 'pending', createdAt: '2026-11-01T03:00:00Z', decision: { title: '2 videos', reason: 'Nothing starts until you say.', payload: { items: [{ url: 'https://www.youtube.com/watch?v=aaaaaa', why: 'a tour' }, { url: 'https://www.tiktok.com/@x/video/1', why: 'storage' }], estimateEachUsd: 3 } } };

test('the feed is newest first and says only what the records say', () => {
  const items = [research(), watch(), { ...research({ id: 'r0' }), status: 'discarded' }, { ...research({ id: 'zz', projectId: 'bbbbbbbb' }) }];
  const f = researchFeed(items, PID, app({}), {}, Date.parse('2026-11-01T04:00:00Z'));
  assert.deepEqual(f.map((c) => c.id), ['w1', 'r1']);
  assert.equal(f[1].line, '3 claims from 2 sources · 1 claim left out: no source');
  assert.equal(f[1].receipt, 'sonnet · US$0.42');
  assert.equal(f[0].label, 'Video · What it shows');
  assert.ok(f[0].library && f[0].library.reason === 'It is about light and sleep.');
  f[0].tellMe();
  assert.deepEqual(calls.at(-1), ['tell', PID, 'w1']);
});

test('a running research shows its real panel stage; an error shows its reason and Retry', () => {
  const run = researchFeed([research({ status: 'classifying', panel: { label: '2 of 4 back' } })], PID, app({}), {});
  assert.equal(run[0].status, 'running');
  assert.equal(run[0].line, 'Researching · 2 of 4 back');
  assert.equal(run[0].tellMe, null, 'nothing to tell until it is filed');
  const err = researchFeed([research({ status: 'error', error: 'all 4 researchers failed' })], PID, app({}), {});
  assert.equal(err[0].line, 'all 4 researchers failed');
  err[0].retry();
  assert.deepEqual(calls.at(-1), ['retry', 'r1']);
});

test('a design watch that fell back says so in the feed', () => {
  const f = researchFeed([watch({ lensUsed: 'reference', decision: { title: 'T', route: 'project-watch-note', payload: { fellBack: 'no frames came out of the video on this Mac' } } })], PID, app({}), {});
  assert.equal(f[0].line, 'Design lens unavailable: no frames came out of the video on this Mac');
  assert.equal(f[0].label, 'Video · What it says');
});

test('candidates: a cross leaves a link out of "Watch them"; the estimate is the real ceiling times what is kept', () => {
  const c = candidatesCard(cands, app({}), { projectCandidateCross: { c1: { 'https://www.tiktok.com/@x/video/1': true } } });
  assert.deepEqual(c.items.map((i) => i.crossed), [false, true]);
  assert.equal(c.keptCount, 1);
  assert.match(c.estimate, /up to ~US\$3\.00 for 1/);
  c.watch();
  assert.deepEqual(calls.at(-1), ['watch', PID, 'c1', ['https://www.youtube.com/watch?v=aaaaaa']]);
  const none = candidatesCard(cands, app({}), { projectCandidateCross: { c1: { 'https://www.youtube.com/watch?v=aaaaaa': true, 'https://www.tiktok.com/@x/video/1': true } } });
  assert.equal(none.watch, null);
});

test('Home counts waiting project cards from the app\'s real { items } inbox (it read 0 before)', () => {
  const st = { liveProjects: [{ id: PID, name: 'Room', phases: [] }], liveInbox: { items: [cands, research(), watch()] } };
  const w = projectsWaiting(st, (k) => () => k);
  assert.equal(w.count, 1, 'the candidates card waits; filed research does not');
});

test('the page carries research, the video box with the project lens, and candidates in the waiting list', () => {
  const p = { id: PID, name: 'Room', kind: 'life', stage: 'planning', folder: '/x', phases: [], lens: 'design', allowances: {} };
  const v = valsProjects(app({ projectOpen: PID, liveProjects: [p], liveInbox: { items: [cands, research(), watch()] } }));
  assert.equal(v.page.research.video.lens, 'design');
  assert.equal(v.page.research.video.note, 'Goes only into this project. Not your library.');
  assert.deepEqual(v.page.research.video.lenses.map((l) => l.id), ['reference', 'claims', 'design']);
  assert.equal(v.page.research.feed.length, 2);
  assert.equal(v.page.waiting.length, 1);
  assert.ok(v.page.waiting[0].candidates);
  assert.equal(v.page.controls.lens, 'design');
  const linked = valsProjects(app({ projectOpen: 'atlas', liveProjects: [{ id: 'atlas', name: 'Science Atlas', kind: 'build', stage: 'active', linked: { path: '/a' }, phases: [] }], liveInbox: { items: [] } }));
  assert.equal(linked.page.research, null, 'a linked project has no research box');
});

test('library flag and Tell me appear only on a filed project record', () => {
  assert.equal(libraryFlagOf(watch({ libraryWorthy: { yes: false, reason: 'x' } }), [], app({})), null);
  assert.equal(libraryFlagOf(watch({ status: 'classifying' }), [], app({})), null);
  assert.equal(libraryFlagOf({ ...watch(), projectId: undefined }, [], app({})), null);
  const done = libraryFlagOf(watch({ libraryRecordId: 'l1' }), [{ id: 'l1', status: 'filed', destination: 'Source — T' }], app({}));
  assert.equal(done.done, true);
  assert.equal(done.run, null);
  assert.equal(tellMeOf(research({ status: 'classifying' }), app({})), null);
  assert.equal(tellMeOf({ ...research(), projectId: null }, app({})), null);
});

test('the glass: project research narrates the panel and a filed line from the record', () => {
  const st = projectResearchStages(research());
  assert.equal(st[0].card.label, 'RESEARCHING FOR THE PROJECT');
  const ready = st.find((s) => s.key === 'ready');
  assert.equal(ready.say, 'Research filed for the project: Oak or ash. 3 claims from 2 sources · 1 claim left out: no source.');
  assert.deepEqual(projectResearchStages({ ...research(), projectId: null }), [], 'not a project record, no project stages');
});

test('the glass: a project watch says its lens, a fallback, and its destination; a failure says nothing was written', () => {
  const fell = projectResearchStages(watch({ lensUsed: 'reference' }));
  assert.match(fell[0].say, /for what it shows/);
  assert.match(fell[1].say, /The design lens could not be used, so it is a reference read\./);
  assert.equal(fell[1].card.foot, 'Room — Sources/Tour.md');
  const err = projectResearchStages(watch({ status: 'error', error: 'nothing to read' }));
  assert.equal(err[1].card.foot, 'Nothing was written');
  // a library watch is not narrated by the project stages; research still is
  assert.deepEqual(stagesFor({ kind: 'video', status: 'filed' }), []);
  assert.ok(stagesFor({ kind: 'research', status: 'classifying', text: 'Research: q' }).length);
  // seen-once rule holds for the new kinds: a settled record seen first is history
  assert.deepEqual(newStages(research(), undefined).fresh, []);
});

test('the project page has no microphone of its own: "Talk about this" opens the Voice conversation with the project attached', () => {
  const calls2 = [];
  const p = { id: PID, name: 'Room', kind: 'life', stage: 'planning', folder: '/x', phases: [], allowances: {} };
  const a = { ...app({ projectOpen: PID, liveProjects: [p], liveInbox: { items: [] } }), talkAboutProject: (x) => calls2.push(x) };
  const c = valsProjects(a).page.conversation;
  for (const k of ['sendSpoken', 'keepTalking', 'setKeepTalking', 'answerSeq', 'heardLine', 'reportMic', 'novaSpeaking']) assert.equal(k in c, false, k);
  c.talk();
  assert.deepEqual(calls2, [{ id: PID, name: 'Room' }]);
  assert.equal(typeof c.send, 'function', 'the typed box stays');
});
