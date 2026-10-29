// The Projects view model: counts are counts of real records, Home's card is
// absent when nothing waits, and the rail keeps ~6 up front.
import test from 'node:test';
import assert from 'node:assert/strict';
import { valsProjects, projectsWaiting } from '../../src/vals/valsProjects.js';

const P = (id, over = {}) => ({ id, name: `P ${id}`, kind: 'life', stage: 'planning', folder: `/x/${id}`, phases: [{ name: 'a', done: true }, { name: 'b' }], dryRun: true, ...over });
const app = (st) => ({ state: { liveInbox: [], liveProjects: [], ...st }, setState() {}, openProject() {}, navigate() {} });
const go = (k) => () => k;

test('Home card is null when nothing waits, and counts pending project cards when it does', () => {
  assert.equal(projectsWaiting({ liveInbox: [], liveProjects: [] }, go), null);
  const st = { liveProjects: [P('aaaaaaaa')], liveInbox: [
    { id: '1', status: 'pending', kind: 'project-stage', projectId: 'aaaaaaaa', decision: { title: 'Move' } },
    { id: '2', status: 'pending', kind: 'project-brief', decision: { title: 'Room' } },
    { id: '3', status: 'filed', kind: 'project-stage', projectId: 'aaaaaaaa' },
  ] };
  const w = projectsWaiting(st, go);
  assert.equal(w.count, 2);
  assert.match(w.sub, /waiting on you/);
});

test('list: phase ring, waiting count, working from a real session in the folder, show all past six', () => {
  const projects = Array.from({ length: 8 }, (_, i) => P(`0000000${i}`));
  projects.push({ id: 'atlas', name: 'Science Atlas', kind: 'build', stage: 'active', linked: { path: '/a' }, phases: [] });
  const v = valsProjects(app({
    liveProjects: projects,
    liveInbox: [{ id: 'r', status: 'pending', kind: 'project-stage', projectId: '00000003' }],
    liveMacSessions: { groups: [{ sessions: [{ cwd: '/x/00000005/build', state: 'working' }] }] },
  }));
  assert.equal(v.list.projects.length, 6);
  assert.match(v.list.showAll.label, /3 more/);
  assert.equal(v.list.projects[0].id, '00000003', 'waiting leads');
  assert.equal(v.list.projects[0].waiting, 1);
  assert.deepEqual(v.list.projects[0].phaseRing, { done: 1, total: 2 });
  assert.equal(v.list.projects[1].working, true);
});

test('a linked project page has no controls', () => {
  const v = valsProjects(app({ liveProjects: [{ id: 'atlas', name: 'Science Atlas', kind: 'build', stage: 'active', linked: { path: '/a' }, phases: [] }], projectOpen: 'atlas' }));
  assert.equal(v.page.controls, null);
  assert.equal(v.page.cost.known, false);
});
