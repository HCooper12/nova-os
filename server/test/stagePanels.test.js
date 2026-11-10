// THE STAGE'S PANELS, ONE LIST FOR THE MAC AND THE PHONE (10 Nov 2026,
// mockup 114): the order, the dedupe and the drawable rule NovaMac used
// inline, now src/stagePanels.js, so both stages show the same panels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stagePanels, panelLight } from '../../src/stagePanels.js';
import { proposalCard } from '../../src/stageFormFacts.js';

const metric = (label, value) => ({ kind: 'metric', label, value, caption: `${label} caption` });
const list = (label, first) => ({ kind: 'list', label, items: [{ name: first }, { name: 'second row' }] });

test('order: kept, brought back, the lookup, the answer, then the proposal', () => {
  const pinned = new Map([['k1', metric('KEPT', '1')]]);
  const brought = new Map([['b1', metric('BACK', '2')]]);
  const lookup = [{ key: 'lk:p1', card: { kind: 'page', title: 'A page', lookup: true } }];
  const model = [{ key: 'm1', card: metric('STEPS', '4') }, { key: 'm2', card: metric('WEIGHT', '82.4') }];
  const proposal = proposalCard({ recordId: 'r1', title: 'Add four sets', status: 'pending' });
  const out = stagePanels({ pinned, brought, lookup, model, proposal });
  assert.deepEqual(out.map((p) => p.key), ['k1', 'b1', 'lk:p1', 'm1', 'm2', 'proposal:r1']);
  assert.equal(out[0].pinned, true);
  assert.equal(out[1].brought, true);
});

test('a key seen once, nothing he put away, nothing that cannot be drawn', () => {
  const model = [
    { key: 'a', card: metric('STEPS', '4') },
    { key: 'a', card: metric('STEPS', '5') },
    { key: 'gone', card: metric('GONE', '1') },
    { key: 'empty', card: { kind: 'list', label: 'EMPTY', items: [] } },
    { key: 'odd', card: { kind: 'nothing-we-draw' } },
  ];
  const out = stagePanels({ model, gone: new Set(['gone']) });
  assert.deepEqual(out.map((p) => p.key), ['a']);
  assert.equal(out[0].card.value, '4');
});

test('one thing said is one panel: a later card with the same first line joins the first', () => {
  const model = [
    { key: 'coach-1', card: list('COACH', 'Swap cable fly for a deep stretch fly') },
    { key: 'coach-2', card: list('ALSO COACH', 'Swap cable fly for a deep-stretch fly!') },
    { key: 'other', card: list('OTHER', 'Something else entirely here') },
  ];
  assert.deepEqual(stagePanels({ model }).map((p) => p.key), ['coach-1', 'other']);
});

test('a page or video beat is a light on the lookup card, never a second card', () => {
  assert.equal(panelLight({ kind: 'page', source: 3 }), 'lk:p3');
  assert.equal(panelLight({ kind: 'video', clip: 2 }), 'lk:v2');
  assert.equal(panelLight({ kind: 'page', source: 3, lookup: true }), null);
  assert.equal(panelLight({ kind: 'metric' }), null);
  const lookup = [{ key: 'lk:p3', card: { kind: 'page', title: 'The page', lookup: true } }];
  const model = [{ key: 'beat', card: { kind: 'page', title: 'The page', source: 3 } }];
  assert.deepEqual(stagePanels({ lookup, model }).map((p) => p.key), ['lk:p3']);
});

test('nothing in, nothing out; arrays of pairs work as Maps do', () => {
  assert.deepEqual(stagePanels(), []);
  assert.deepEqual(stagePanels({ pinned: [['p', metric('P', '1')]] }).map((p) => p.key), ['p']);
});
