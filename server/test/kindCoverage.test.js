// THE GUARD THAT STOPS THIS RECURRING.
//
// Three hard-coded maps silently decide what the platform can perceive
// about its own work: which agents appear in the shared fleet block, and
// which decisions become a learned preference. A record kind missing from
// them isn't an error anywhere — it just quietly does nothing, which is how
// the Watcher, the Study lane, the Forge and both coach detectors came to be
// invisible to every conversational agent, and how 31 plan-today decisions
// were never learned from.
//
// This test fails when a kind is introduced without a home, so the next
// agent is connected the day it ships.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const libDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib');
const { KIND_AGENT } = await import('../lib/fleetContext.js');

// Kinds that are deliberately NOT agent work — transient UI/plumbing records
// or his own captures. Each needs a reason, so the exemption list can't
// become a dumping ground.
const NOT_AGENT_WORK = {
  'model-choice': 'a transient gate asking which model to spend on — not work anyone did',
  followup: 'derived client-side from his calendar, not filed by an agent',
  greet: 'a spoken greeting receipt',
  voice: 'his own spoken capture',
};

function declaredKinds() {
  const found = new Set();
  for (const f of readdirSync(libDir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(path.join(libDir, f), 'utf8');
    // createRecord({ ... kind: 'x' ... }) — the only way a record is born
    for (const m of src.matchAll(/createRecord\(\s*\{[^}]*?kind:\s*'([a-z-]+)'/gs)) found.add(m[1]);
  }
  return found;
}

test('every record kind an agent files is visible to the rest of the fleet', () => {
  const missing = [...declaredKinds()].filter((k) => !KIND_AGENT[k] && !NOT_AGENT_WORK[k]);
  assert.deepEqual(
    missing, [],
    `these kinds are filed by agents but absent from fleetContext.KIND_AGENT, so no conversational agent can ever mention them: ${missing.join(', ')}. Add them there (or to NOT_AGENT_WORK with a reason).`,
  );
});

test('the exemption list stays honest — every entry carries a reason', () => {
  for (const [kind, why] of Object.entries(NOT_AGENT_WORK)) {
    assert.ok(why && why.length > 15, `${kind} needs a real reason for being exempt`);
  }
});

test('the kinds that regressed to "TYPED" are covered', () => {
  // The four the Inbox attributed to Hayden himself, and the newest agent.
  for (const k of ['coach-program', 'coach-audit', 'read-next', 'forge-job']) {
    assert.ok(KIND_AGENT[k], `${k} must name its agent`);
  }
});
