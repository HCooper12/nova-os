import { captureForReview } from './inbox.js';
import { createCoachEditRecord } from './coach.js';
import { runCalendarCommand } from './calendarCommand.js';
import { loadRecipeData } from './recipes.js';
import { loadRotation } from './rotation.js';
import { randomUUID } from 'node:crypto';
import { createRecord } from './inboxStore.js';

// Companion Phase 3 — voice-confirmed actions. The conversational agent ends
// a reply with ONE typed PROPOSE line; everything here turns that into a
// PENDING record on the existing rails. Nothing writes to the vault until
// Hayden approves — in the transcript ("yes, do it") or in the Inbox.
// Models decide, code acts; every kind below reuses a tested filer + undo.

export const PROPOSE_KINDS = ['capture', 'calendar', 'routine-edit', 'rotation-variant', 'preference', 'profile'];

export async function createVoiceProposal(vaultPath, question, raw) {
  const kind = String(raw?.kind || '').toLowerCase();
  if (!PROPOSE_KINDS.includes(kind)) throw new Error(`unknown proposal kind "${raw?.kind}"`);

  if (kind === 'capture') {
    // Free text through the SAME classifier the capture bar uses — the
    // decision shape, validation, filing, and undo are all existing rails.
    const record = await captureForReview(vaultPath, { text: raw.text, source: 'voice' });
    return { recordId: record.id, title: record.decision.title, route: record.decision.route };
  }

  if (kind === 'calendar') {
    // The existing confirm-first calendar flow, untouched: it interprets the
    // command against his real events and files a typed pending record (or
    // says honestly why it couldn't).
    const command = String(raw.command || '').trim();
    if (!command) throw new Error('the calendar proposal needs a command');
    const out = await runCalendarCommand(command);
    if (!out.proposed) throw new Error(out.reason || "the calendar change couldn't be worked out");
    return { recordId: out.record.id, title: out.record.decision.title, route: 'calendar' };
  }

  if (kind === 'preference') {
    // A correction becomes a standing rule — pending until he approves,
    // then written to the Standing Instructions page every agent reads.
    const rule = String(raw.rule || '').replace(/\s+/g, ' ').trim();
    if (!rule) throw new Error('the preference needs the rule itself');
    if (rule.length > 300) throw new Error('keep a standing instruction under 300 characters');
    const record = {
      id: randomUUID().slice(0, 8),
      text: question.slice(0, 300),
      source: 'voice',
      mode: 'review-all',
      status: 'pending',
      createdAt: new Date().toISOString(),
      decision: {
        route: 'preference',
        confidence: 'high',
        title: `Standing: ${rule.slice(0, 70)}${rule.length > 70 ? '…' : ''}`,
        reason: 'a correction worth keeping — approve and every agent reads it from here on; undo removes it',
        payload: { rule, source: 'voice' },
      },
    };
    await createRecord(record);
    return { recordId: record.id, title: record.decision.title, route: 'preference' };
  }

  if (kind === 'profile') {
    // The About You interview (or any conversation) teaching Nova who he is —
    // one profile area per proposal, his yes merges it into Wiki/Profile.md.
    const p = raw.patch || {};
    const patch = {};
    if (typeof p.focus === 'string' && p.focus.trim()) patch.focus = p.focus.trim().slice(0, 400);
    if (typeof p.bestSelf === 'string' && p.bestSelf.trim()) patch.bestSelf = p.bestSelf.trim().slice(0, 600);
    if (typeof p.notes === 'string' && p.notes.trim()) patch.notes = p.notes.trim().slice(0, 4000);
    if (Array.isArray(p.priorities)) {
      const pr = p.priorities.map((x) => String(x).trim()).filter(Boolean).slice(0, 8);
      if (pr.length) patch.priorities = pr;
    }
    const fields = Object.keys(patch);
    if (!fields.length) throw new Error('the profile proposal carried nothing to save');
    const summary = fields.map((f) => f === 'priorities' ? `priorities: ${patch.priorities.join('; ')}` : `${f}: ${patch[f]}`).join(' · ');
    const record = {
      id: randomUUID().slice(0, 8),
      text: question.slice(0, 300),
      source: 'voice',
      mode: 'review-all',
      status: 'pending',
      createdAt: new Date().toISOString(),
      decision: {
        route: 'profile',
        confidence: 'high',
        title: `About you: ${fields.join(' + ')}`,
        reason: 'learned in conversation — approve and every agent reasons from it; undo restores the prior profile',
        payload: { patch, summary },
      },
    };
    await createRecord(record);
    return { recordId: record.id, title: record.decision.title, route: 'profile' };
  }

  if (kind === 'routine-edit') {
    // Coach's exact validator and filer — same contract, different mouth.
    const record = await createCoachEditRecord(vaultPath, { question, proposal: raw, source: 'voice' });
    return { recordId: record.id, title: record.decision.title, route: 'routine-edit' };
  }

  // rotation-variant: resolve the spoken slot + alternate NAME against
  // today's real rotation; unknowns fail here, honestly, at propose time.
  const slot = String(raw.slot || '').toLowerCase().trim();
  const { recipes } = await loadRecipeData(vaultPath);
  const rotation = await loadRotation(vaultPath, recipes);
  const slotNow = rotation.slots?.[slot];
  if (!slotNow) throw new Error(`"${raw.slot}" isn't a rotation slot with a recipe today`);
  const recipe = recipes.find((r) => r.id === slotNow.id);
  const wanted = String(raw.variant || '').trim();
  let altId = null;
  let variantLabel = null;
  if (wanted) {
    const ci = (s) => String(s || '').toLowerCase();
    const alt = (recipe?.alternates || []).find((a) => ci(a.label) === ci(wanted))
      || (recipe?.alternates || []).find((a) => ci(a.label).includes(ci(wanted)) || ci(wanted).includes(ci(a.label)));
    if (!alt) throw new Error(`"${recipe?.name}" has no alternate called "${wanted}"`);
    altId = alt.id;
    variantLabel = alt.label;
  }
  const title = altId
    ? `Today only: ${slot} → ${slotNow.name} (${variantLabel})`
    : `Today only: ${slot} back to ${slotNow.name} as written`;
  const record = {
    id: randomUUID().slice(0, 8),
    text: question.slice(0, 300),
    source: 'voice',
    mode: 'review-all',
    status: 'pending',
    createdAt: new Date().toISOString(),
    decision: {
      route: 'rotation-variant',
      confidence: 'high',
      title,
      reason: 'proposed in conversation — the stored recipe never changes, and undo restores today as it was',
      payload: { slot, altId, variantLabel },
    },
  };
  await createRecord(record);
  return { recordId: record.id, title, route: 'rotation-variant' };
}
