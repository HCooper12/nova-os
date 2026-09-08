// THE COACH'S ANATOMY — the same muscles the 3D model is built from, in the
// detail a coach reasons with. If these two ever disagree, the Coach is
// describing one body while the figure shows another.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANATOMY, ANATOMY_GROUPS, anatomyContext, focusFor } from '../lib/anatomy.js';
import { MUSCLE_IDS } from '../lib/muscles.js';

test('every muscle group the app can highlight has anatomy behind it, and nothing extra', () => {
  assert.deepEqual([...ANATOMY_GROUPS].sort(), [...MUSCLE_IDS].sort(),
    'the atlas and the highlight vocabulary are the same closed list');
});

test('every entry carries what a coach actually needs — origin, insertion, joint, action, and the failure mode', () => {
  for (const [g, a] of Object.entries(ANATOMY)) {
    assert.ok(a.label, `${g} has no label`);
    assert.ok(a.muscles.length, `${g} has no muscles`);
    for (const m of a.muscles) {
      for (const field of ['name', 'origin', 'insertion']) {
        assert.ok(m[field] && m[field].length > 5, `${g}/${m.name}: ${field} is missing`);
      }
      for (const field of ['trainedBy', 'whenWeak']) {
        assert.ok(m[field] && m[field].length > 30, `${g}/${m.name}: ${field} is thin — this is the half a coach uses`);
      }
      assert.ok(m.joints.length, `${g}/${m.name}: names no joint`);
      assert.ok(m.actions.length, `${g}/${m.name}: names no action`);
    }
  }
});

test('the anatomy is anatomically right where it matters most to programming', () => {
  const find = (g, n) => ANATOMY[g].muscles.find((m) => m.name.includes(n));
  // the two-joint muscles are the ones that make exercise selection matter
  assert.ok(find('triceps', 'Triceps').joints.some((j) => j.includes('glenohumeral')), 'the long head crosses the shoulder');
  assert.match(find('triceps', 'Triceps').trainedBy, /overhead extensions train what pushdowns cannot/);
  assert.ok(find('calves', 'Gastrocnemius').joints.includes('knee'), 'gastrocnemius crosses the knee');
  assert.match(find('calves', 'Soleus').trainedBy, /SEATED/);
  assert.ok(find('quads', 'Quadriceps').joints.some((j) => j.includes('hip')), 'rectus femoris crosses the hip');
  assert.ok(find('hamstrings', 'Hamstring').joints.includes('hip') && find('hamstrings', 'Hamstring').joints.includes('knee'));
  assert.match(find('biceps', 'Biceps brachii').trainedBy, /incline curl/);
  assert.match(find('adductors', 'Adductor').actions.join(' '), /hip extension/, 'adductor magnus extends the hip');
});

test('the context is narrowed to what he asked about, and says it can be shown on the model', () => {
  const f = focusFor('my bench press stalls off the chest and my shoulder pinches overhead');
  assert.ok(f.includes('chest'));
  assert.ok(f.includes('rear-delts'), 'a pinching shoulder is a rotator/rear-delt question');
  assert.ok(f.includes('traps'), 'and a scapular one');
  const ctx = anatomyContext(f);
  assert.match(ctx, /Nova's 3D model is built from and can highlight/);
  assert.match(ctx, /Pectoralis major/);
  assert.ok(!/Gastrocnemius/.test(ctx), 'a bench question does not carry the calves');
  assert.ok(ctx.length < 6000, 'it must not crowd out his own history');
  assert.deepEqual(focusFor('how much should i eat today'), [], 'no anatomy, no section');
  assert.ok(anatomyContext([]).length > 4000, 'with no focus the full atlas is available');
});

test('a squat question pulls the muscles a squat actually uses', () => {
  const f = focusFor('why do my knees cave at the bottom of a squat');
  assert.ok(f.includes('quads'));
  assert.ok(f.includes('adductors') || f.includes('glutes'), 'knees caving is a hip question');
});
