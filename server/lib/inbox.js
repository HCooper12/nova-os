import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import matter from 'gray-matter';
import { backupFile } from './backup.js';
import { queueTodoistSync } from './todoistSync.js';
import { addTransactions, removeTransactions, CATEGORIES as MONEY_CATEGORIES } from './money.js';
import { TODO_CATEGORIES, guessTodoCategory } from './todos.js';
import { archiveImportFile } from './moneyImport.js';
import { createRecord, updateRecord, getRecord, listRecords } from './inboxStore.js';
import { addItemsDirect, removeItems, SHOPPING_CATEGORIES } from './shoppingList.js';
import * as journal from './journal.js';
import * as foodLog from './foodLog.js';
import { addStashItem, removeStashItem, formatStashItem } from './stash.js';
import { addRecipe, removeRecipe } from './recipes.js';
import { createEvent, deleteEventAt, moveEvent, moveOccurrence, putEventRaw } from './calendar.js';

// The Nova Inbox: capture any loose thought, let a READ-ONLY classifier make
// exactly one typed routing decision, then let deterministic code do the
// actual write. The model never touches files — it only emits JSON; filing,
// undo, and history are plain code. (Architecture borrowed from the
// classic second-brain pipeline: capture → classify & route → file.)

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '0.5';
const INBOX_DIR_REL = 'Wiki/Inbox';
const TODO_REL = 'Wiki/Inbox/To-Do.md';

export const ROUTES = ['shopping', 'journal', 'todo', 'note', 'food', 'expense', 'idea', 'stash', 'reminder'];
export const IDEA_FORMATS = ['short', 'long', 'thread'];
export const IDEAS_DIR_REL = 'Wiki/Studio/Ideas';
export const MODES = ['review-all', 'auto-high', 'auto-all'];

function pad(n) {
  return String(n).padStart(2, '0');
}
function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/* ------------------------------ classifier ------------------------------ */

function buildPrompt(text) {
  return `You are the inbox classifier for Nova, Hayden's personal OS backed by an Obsidian vault. A loose thought was just captured (typed or dictated). Make exactly ONE routing decision for it.

Routes and their payloads:
- "shopping" — things to buy. payload: {"items": [{"name": "...", "category": "..."}]} with category exactly one of: ${SHOPPING_CATEGORIES.join(', ')}. Clean each name to a short shopping-list form.
- "food" — food ALREADY EATEN to log. TWO payload shapes, chosen by what he said:
  - He names one of his PLANNED MEALS by its slot — "just ate dinner", "had my lunch", "ate breakfast", "had my snack" — without describing different food: payload: {"slot": "breakfast"|"lunch"|"dinner"|"snack"|"extra"}. Nova marks the real planned meal eaten with its REAL macros from his rotation. NEVER estimate macros for these — inventing numbers for a meal that already has true ones is the cardinal sin.
  - He describes SPECIFIC food ("just ate a protein bar", "had two eggs on toast"): payload: {"name": "...", "macros": {"p": 0, "c": 0, "f": 0, "kcal": 0}} — estimate macros for the described portion (whole numbers).
- "todo" — an action to do later. payload: {"items": [{"text": "short action atom", "category": "..."}]} — imperative, concrete; category exactly one of: personal, work, fitness, errands, later ("later" = ideas/someday items).
- "journal" — a reflection, feeling, or diary-style thought about the day or life. payload: {"text": "..."} — lightly cleaned (fix dictation stumbles, keep the voice; never invent content).
- "note" — an idea, insight, or piece of knowledge worth keeping. payload: {"title": "Short Title Case Name", "body": "..."} — cleaned prose, keep the substance intact.
- "idea" — a CONTENT idea (something Hayden might make: a video, post, thread). payload: {"title": "Short Working Title", "hook": "the one-line hook that makes it worth making", "format": "short"|"long"|"thread" — best guess}. Distinct from "note" (knowledge to keep) — an idea is something to potentially produce.
- "expense" — money spent (or received) to record in the ledger (e.g. "coffee 6.50", "paid the gym 89 dollars"). payload: {"amount": -6.5, "merchant": "...", "category": "...", "date": "YYYY-MM-DD or omit for today"} — amount NEGATIVE for spending, positive for money in; category exactly one of: ${MONEY_CATEGORIES.join(', ')} (best fit, or omit).
- "stash" — a LINK to keep for later: a product to restock or a page to revisit (e.g. "stash this face wash under skincare https://…"). ONLY when the capture contains an actual http(s) URL — with no URL it is a todo or note instead. payload: {"category": "Short Title Case group — reuse the user's word, e.g. Skincare", "name": "the product/page name", "url": "copied EXACTLY from the capture — never invent, complete, or fix a URL", "note": "optional short note, omit if none"}.
- "reminder" — something to be REMINDED of at a specific time ("remind me at 4pm to call the bank", "tomorrow morning remind me about the parcel"). ONLY when a time or day is stated or clearly implied — an action with no time is a todo. payload: {"text": "short imperative reminder text", "whenISO": "the moment to fire, as a full ISO 8601 local datetime like 2026-08-07T16:00:00"} — resolve relative times ("in 20 minutes", "tomorrow morning" ≈ 08:00, "tonight" ≈ 20:00) against the current date and time given below; the time must be in the FUTURE.

Also output:
- "title": a short label for the history list (≤ 8 words)
- "confidence": "high" ONLY when both the route and the payload extraction are unambiguous; otherwise "low"
- "reason": one short sentence explaining the routing (and, if confidence is low, what was ambiguous)

Rules: dictated text may have transcription errors — clean them. If the thought mixes several intents, pick the dominant one and set confidence "low". If it fits nothing well, use "note" with confidence "low". The current date and time is ${new Date().toString()}.

The captured thought:
"""
${text}
"""

Output ONLY a JSON object with exactly these keys: route, confidence, title, reason, payload. No markdown, no code fences, no commentary.`;
}

// Pure + exported for tests: coerces whatever the model produced into a safe,
// fully-typed decision (or throws if it's unusable).
export function normalizeDecision(parsed) {
  const route = ROUTES.includes(parsed.route) ? parsed.route : 'note';
  const confidence = parsed.confidence === 'high' ? 'high' : 'low';
  const title = String(parsed.title || '').trim().slice(0, 80) || 'Captured thought';
  const reason = String(parsed.reason || '').trim().slice(0, 300);
  const p = parsed.payload || {};
  let payload;
  if (route === 'shopping') {
    const items = (Array.isArray(p.items) ? p.items : [])
      .map((it) => ({
        name: String(it?.name || '').trim().slice(0, 80),
        category: SHOPPING_CATEGORIES.includes(it?.category) ? it.category : 'Household & Other',
      }))
      .filter((it) => it.name);
    if (!items.length) throw new Error('classifier returned no shopping items');
    payload = { items };
  } else if (route === 'food') {
    const slot = String(p.slot || '').trim().toLowerCase();
    if (slot) {
      if (!['breakfast', 'lunch', 'dinner', 'snack', 'extra'].includes(slot)) throw new Error(`"${slot}" is not a rotation slot`);
      payload = { slot };
    } else {
      const m = p.macros || {};
      const name = String(p.name || '').trim().slice(0, 80);
      if (!name) throw new Error('classifier returned no food name');
      payload = {
        name,
        macros: { p: Number(m.p) || 0, c: Number(m.c) || 0, f: Number(m.f) || 0, kcal: Number(m.kcal) || 0 },
      };
    }
  } else if (route === 'todo') {
    // items may be plain strings (legacy) or {text, category} objects
    const items = (Array.isArray(p.items) ? p.items : [])
      .map((it) => {
        const text = String((it && typeof it === 'object' ? it.text : it) || '').trim().slice(0, 200);
        const category = it && typeof it === 'object' && TODO_CATEGORIES.includes(it.category) ? it.category : null;
        return text ? { text, category } : null;
      })
      .filter(Boolean);
    if (!items.length) throw new Error('classifier returned no to-do items');
    payload = { items };
  } else if (route === 'journal') {
    const text = String(p.text || '').trim();
    if (!text) throw new Error('classifier returned no journal text');
    payload = { text };
  } else if (route === 'idea') {
    const ideaTitle = String(p.title || title).trim().slice(0, 120);
    const hook = String(p.hook || '').trim().slice(0, 300);
    if (!ideaTitle || !hook) throw new Error('classifier returned an incomplete idea');
    payload = { title: ideaTitle, hook, format: IDEA_FORMATS.includes(p.format) ? p.format : 'short' };
  } else if (route === 'expense') {
    const amount = Math.round(Number(p.amount) * 100) / 100;
    const merchant = String(p.merchant || '').trim().slice(0, 120);
    if (!Number.isFinite(amount) || amount === 0) throw new Error('classifier returned no usable amount');
    if (!merchant) throw new Error('classifier returned no merchant');
    payload = {
      amount,
      merchant,
      category: MONEY_CATEGORIES.includes(p.category) ? p.category : undefined,
      date: /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') ? p.date : undefined,
    };
  } else if (route === 'stash') {
    const url = String(p.url || '').trim();
    const name = String(p.name || '').trim().slice(0, 120);
    const category = String(p.category || '').trim().slice(0, 60);
    if (!/^https?:\/\/\S+$/.test(url)) throw new Error('stash needs a real http(s) link in the capture');
    if (!name) throw new Error('classifier returned no name for the link');
    if (!category) throw new Error('classifier returned no category');
    payload = { category, name, url, note: String(p.note || '').trim().slice(0, 200) || undefined };
  } else if (route === 'reminder') {
    const text = String(p.text || '').trim().slice(0, 200);
    const when = new Date(String(p.whenISO || ''));
    if (!text) throw new Error('classifier returned no reminder text');
    if (Number.isNaN(when.getTime())) throw new Error('classifier returned no valid reminder time');
    payload = { text, whenISO: when.toISOString() };
  } else {
    const noteTitle = String(p.title || title).trim().slice(0, 120) || 'Captured Note';
    const body = String(p.body || '').trim();
    if (!body) throw new Error('classifier returned no note body');
    payload = { title: noteTitle, body };
  }
  return { route, confidence, title, reason, payload };
}

function classify(text, onDone) {
  const child = spawn(CLAUDE_BIN, [
    '-p', buildPrompt(text),
    '--model', 'haiku',
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', '',
    '--output-format', 'json',
    '--max-budget-usd', MAX_BUDGET_USD,
    '--no-session-persistence',
  ]);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => {
    if (code !== 0) return onDone(new Error(stderr.trim() || `claude exited with code ${code}`));
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error) throw new Error(outer.result || 'classification failed');
      const body = (outer.result || '').trim();
      const jsonMatch = body.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error(body.slice(0, 200) || 'no JSON in classifier response');
      onDone(null, normalizeDecision(JSON.parse(jsonMatch[0])));
    } catch (e) {
      onDone(e);
    }
  });
  child.on('error', (err) => onDone(err));
}

// Voice-conversation proposals: classify NOW and land as a pending record —
// never auto-files regardless of confidence, because a proposal spoken into
// a conversation deserves an explicit yes. Resolves once the record is
// pending so the caller can show the classified title as a confirm chip.
export async function captureForReview(vaultPath, { text, source = 'voice' }) {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('nothing to file');
  const decision = await new Promise((resolve, reject) => {
    classify(clean, (err, d) => (err ? reject(err) : resolve(d)));
  });
  const record = {
    id: randomUUID().slice(0, 8),
    text: clean,
    source,
    mode: 'review-all',
    status: 'pending',
    createdAt: new Date().toISOString(),
    decision,
  };
  await createRecord(record);
  return record;
}

/* ------------------------- deterministic filing ------------------------- */

function sanitizeFilename(title) {
  const cleaned = title.replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim();
  return (cleaned || 'Captured Note').slice(0, 80);
}

async function ensureInboxNote(vaultPath, relPath, headline) {
  const full = path.join(vaultPath, relPath);
  if (existsSync(full)) return full;
  await mkdir(path.dirname(full), { recursive: true });
  const date = todayISO();
  const content = matter.stringify(`# ${headline}\n`, { type: 'raw', tags: ['inbox'], created: date, updated: date });
  await writeFile(full, content, 'utf8');
  return full;
}

// Files a normalized decision into the vault / data stores. Plain code only —
// returns { destination, undo } where undo carries exactly what is needed to
// revert this one filing later.
export async function fileDecision(vaultPath, decision, { source = 'inbox' } = {}) {
  const { route, payload } = decision;
  const date = todayISO();

  if (route === 'shopping') {
    const added = await addItemsDirect(vaultPath, payload.items.map((it) => ({ ...it, source })));
    return {
      destination: `Shopping List — ${added.map((i) => i.name).join(', ')}`,
      undo: { route, ids: added.map((i) => i.id) },
    };
  }

  if (route === 'food') {
    if (payload.slot) {
      // "I ate dinner" marks the PLANNED dinner eaten — the same tap he'd
      // make in the app, with the meal's true macros, never an estimate
      const { loadRecipeData } = await import('./recipes.js');
      const { loadRotation, setSlotConsumed } = await import('./rotation.js');
      const { recipes } = await loadRecipeData(vaultPath);
      const rotation = await loadRotation(vaultPath, recipes);
      const meal = rotation.slots?.[payload.slot];
      if (!meal) throw new Error(`there's no ${payload.slot} in today's rotation to mark eaten`);
      if (meal.consumed) throw new Error(`${payload.slot} (${meal.name}) is already marked eaten today`);
      await setSlotConsumed(vaultPath, recipes, payload.slot, true);
      // the meal joins the food log like any other — so a past day can show it
      const { setRotationEntry } = await import('./foodLog.js');
      await setRotationEntry({ slot: payload.slot, name: meal.name, macros: meal.macros, recipeId: meal.id, consumed: true }).catch(() => {});
      const { recordTodaySnapshot } = await import('./nutritionSnapshot.js');
      recordTodaySnapshot(vaultPath).catch(() => {});
      const m = meal.macros || {};
      return {
        destination: `Marked ${payload.slot} eaten — ${meal.name}${meal.variant ? ` (${meal.variant})` : ''} (${m.p}P · ${m.c}C · ${m.f}F · ${m.kcal} kcal)`,
        undo: { route, slot: payload.slot, mealName: meal.name },
      };
    }
    const day = await foodLog.addEntry({ name: payload.name, macros: payload.macros });
    const entry = day.entries[day.entries.length - 1];
    const m = entry.macros;
    return {
      destination: `Food log — ${entry.name} (${m.p}P · ${m.c}C · ${m.f}F · ${m.kcal} kcal)`,
      undo: { route, date: day.date, entryId: entry.id },
    };
  }

  if (route === 'stash') {
    await addStashItem(vaultPath, payload);
    return {
      destination: `Stash — ${payload.name} → ${payload.category}`,
      undo: { route, raw: formatStashItem(payload) },
    };
  }

  if (route === 'preference') {
    // "Correct it once and it writes that down" — an explicit standing rule
    // every agent's context loads from here on. Undo removes the exact line.
    const { addStandingRule } = await import('./standing.js');
    const { raw, rule } = await addStandingRule(vaultPath, payload.rule, payload.source || 'voice');
    return {
      destination: `Standing Instructions — "${rule.slice(0, 60)}${rule.length > 60 ? '…' : ''}"`,
      undo: { route, raw },
    };
  }

  if (route === 'reminder') {
    const { createReminder } = await import('./reminders.js');
    const entry = await createReminder({ text: payload.text, whenISO: payload.whenISO });
    const whenLabel = new Date(entry.when).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    return {
      destination: `Reminder — "${entry.text}" ${whenLabel}${entry.apple ? ` (also in Apple Reminders: ${entry.apple.list})` : ' (Nova nudge only — iCloud write did not land)'}`,
      undo: { route, reminderId: entry.id, text: entry.text },
    };
  }

  if (route === 'distill-apply') {
    const { applyDistillJob } = await import('./distill.js');
    const { applied } = await applyDistillJob(vaultPath, payload.jobId);
    return {
      destination: `Distilled into the graph — ${applied} file${applied === 1 ? '' : 's'} updated`,
      undo: { route, jobId: payload.jobId },
    };
  }

  if (route === 'profile') {
    // merge one interview's worth of About You into the profile page —
    // undo restores the ENTIRE prior profile, so a bad merge is one tap back
    const { getProfile, setProfile } = await import('./profile.js');
    const prior = await getProfile(vaultPath);
    const merged = {
      focus: payload.patch.focus ?? prior?.focus ?? '',
      priorities: payload.patch.priorities ?? prior?.priorities ?? [],
      bestSelf: payload.patch.bestSelf ?? prior?.bestSelf ?? '',
      notes: payload.patch.notes ?? prior?.notes ?? '',
    };
    await setProfile(vaultPath, merged);
    return {
      destination: `About You — ${payload.summary.slice(0, 120)}`,
      undo: { route, prior },
    };
  }

  if (route === 'agent-mode') {
    // an earned-autonomy proposal, applied deterministically on his yes;
    // undo restores the prior mode exactly
    const { AUTONOMY_TARGETS } = await import('./autonomyLedger.js');
    const target = AUTONOMY_TARGETS[payload.target];
    if (!target?.setMode) throw new Error(`"${payload.target}" is not a mode-changeable agent`);
    const prior = await target.getMode();
    await target.setMode(payload.to);
    return {
      destination: `${target.label} — mode ${prior} → ${payload.to}`,
      undo: { route, target: payload.target, prior },
    };
  }

  if (route === 'skill-backlog') {
    // pattern scout → the registry's Backlog section; undo removes the line
    const { addBacklogItem } = await import('./skills.js');
    const { line } = await addBacklogItem(vaultPath, payload.text);
    return {
      destination: `Nova Skills — Backlog: ${payload.text}`,
      undo: { route, line },
    };
  }

  if (route === 'progression-tune') {
    // Coach feedback made durable: tune the progression engine for one
    // exercise. Undo restores the exact prior tune (or clears it).
    const { setTune } = await import('./progressionTunes.js');
    const { tune, prior } = await setTune(vaultPath, {
      exerciseId: payload.exerciseId,
      name: payload.exerciseName,
      stepKg: payload.stepKg,
      repStep: payload.repStep,
      hold: payload.hold,
      focus: payload.focus,
      model: payload.model,
      note: payload.reason,
    });
    const bits = [tune.hold ? 'progressions on hold' : null, tune.stepKg != null ? `weight step ${tune.stepKg}kg` : null, tune.repStep != null ? `rep step +${tune.repStep}` : null, tune.focus ? `focus: ${tune.focus}` : null].filter(Boolean);
    return {
      destination: `Progression Tuning — ${tune.name}: ${bits.join(', ')}`,
      undo: { route, exerciseId: tune.exerciseId, name: tune.name, prior },
    };
  }

  if (route === 'exercise-resource') {
    // A Coach-curated form clip/diagram, filed onto the exercise. Undo
    // restores the exact prior knowledge fields.
    const { loadExerciseLibrary, setExerciseKnowledge } = await import('./exercises.js');
    const { exercises } = await loadExerciseLibrary(vaultPath);
    const prior = exercises.find((e) => e.id === payload.exerciseId);
    if (!prior) throw new Error(`exercise ${payload.exerciseId} no longer exists`);
    const priorKnowledge = { cues: prior.cues || null, resourceUrl: prior.resourceUrl || null };
    await setExerciseKnowledge(vaultPath, payload.exerciseId, {
      resourceUrl: payload.url,
      ...(payload.cues ? { cues: payload.cues } : {}),
    });
    return {
      destination: `Exercise Library — ${payload.exerciseName}: form resource filed`,
      undo: { route, exerciseId: payload.exerciseId, name: payload.exerciseName, prior: priorKnowledge },
    };
  }

  if (route === 'coach-learning') {
    // one approved fact into the client file — undo removes the exact line
    const { appendLearning } = await import('./coachKnowledge.js');
    const { line, kind } = await appendLearning(vaultPath, payload);
    return {
      destination: `What Works For Hayden — ${kind}: ${payload.insight.slice(0, 50)}`,
      undo: { route, line },
    };
  }

  if (route === 'training-block') {
    const { setBlock, getBlock } = await import('./trainingBlocks.js');
    const prior = await getBlock(vaultPath).catch(() => null);
    const b = await setBlock(vaultPath, payload);
    return {
      destination: `Training Block — ${b.phase}, ${b.lengthWeeks}w from ${b.startedAt}`,
      undo: { route, prior: prior ? { phase: prior.phase, startedAt: prior.startedAt, lengthWeeks: prior.lengthWeeks, deloadLastWeek: prior.deloadLastWeek, note: prior.note } : null },
    };
  }

  if (route === 'injury-log') {
    // Pain mentioned in the Coach chat, made durable — the log every
    // prescription checks. Undo removes the entry.
    const { addInjury } = await import('./injuryLog.js');
    const entry = await addInjury(vaultPath, { area: payload.area, note: payload.note, severity: payload.severity });
    return {
      destination: `Injury Log — ${entry.area} (${entry.severity})`,
      undo: { route, injuryId: entry.id, area: entry.area },
    };
  }

  if (route === 'goal-target') {
    // A measurable target proposed by the Coach. Undo removes it.
    const { addGoalTarget } = await import('./fitnessGoals.js');
    const target = await addGoalTarget(vaultPath, payload);
    return {
      destination: `Fitness Goals — target: ${target.metric} ${target.value}${target.unit || ''}${target.by ? ` by ${target.by}` : ''}`,
      undo: { route, targetId: target.id, metric: target.metric },
    };
  }

  if (route === 'routine-edit') {
    // A Coach-proposed program change, applied deterministically on approve.
    // Undo restores the routine's EXACT prior exercise list.
    const { loadExerciseLibrary, addCustomExercise } = await import('./exercises.js');
    const { loadRoutines, updateRoutine } = await import('./workouts.js');
    let { exercises } = await loadExerciseLibrary(vaultPath);
    const { routines } = await loadRoutines(vaultPath, exercises);
    const routine = routines.find((r) => r.id === payload.routineId);
    if (!routine) throw new Error(`routine "${payload.routineName}" no longer exists`);
    const priorEntries = routine.exercises.map((e) => ({
      exerciseId: e.exerciseId, targetSets: e.targetSets, targetRepsLow: e.targetRepsLow, targetRepsHigh: e.targetRepsHigh,
    }));
    let addId = payload.addExerciseId;
    if ((payload.action === 'swap' || payload.action === 'add') && !addId) {
      const removed = routine.exercises.find((e) => e.exerciseId === payload.removeExerciseId);
      const created = await addCustomExercise(vaultPath, payload.addName,
        payload.muscleGroup || removed?.muscleGroup || 'Other',
        payload.trackingType || removed?.trackingType || 'weight_reps');
      addId = created.id;
      ({ exercises } = await loadExerciseLibrary(vaultPath));
    }
    const entryFor = (base) => ({
      exerciseId: addId,
      targetSets: payload.targetSets || base?.targetSets || 3,
      targetRepsLow: payload.targetRepsLow || base?.targetRepsLow || 8,
      targetRepsHigh: payload.targetRepsHigh || base?.targetRepsHigh || 10,
    });
    let next;
    if (payload.action === 'swap') {
      next = priorEntries.map((e) => (e.exerciseId === payload.removeExerciseId ? entryFor(e) : e));
    } else if (payload.action === 'add') {
      next = [...priorEntries, entryFor(null)];
    } else if (payload.action === 'remove') {
      next = priorEntries.filter((e) => e.exerciseId !== payload.removeExerciseId);
      if (!next.length) throw new Error('that would leave the routine empty — remove the routine itself from Train instead');
    } else { // targets
      next = priorEntries.map((e) => (e.exerciseId === payload.removeExerciseId
        ? { ...e, targetSets: payload.targetSets || e.targetSets, targetRepsLow: payload.targetRepsLow || e.targetRepsLow, targetRepsHigh: payload.targetRepsHigh || e.targetRepsHigh }
        : e));
    }
    await updateRoutine(vaultPath, exercises, routine.id, { exercises: next });
    const what = payload.action === 'swap' ? `swapped ${payload.removeName} → ${payload.addName}`
      : payload.action === 'add' ? `added ${payload.addName}`
      : payload.action === 'remove' ? `removed ${payload.removeName}`
      : `retargeted ${payload.removeName}`;
    return {
      destination: `Train — ${what} in ${routine.name}`,
      undo: { route, routineId: routine.id, routineName: routine.name, priorEntries },
    };
  }

  if (route === 'rotation-variant') {
    // A today-variant for one rotation slot (or clearing one), applied on
    // approve. The stored recipe never changes; undo restores the slot's
    // exact prior override.
    const { loadRecipeData } = await import('./recipes.js');
    const { loadRotation, setSlotVariant } = await import('./rotation.js');
    const { recipes } = await loadRecipeData(vaultPath);
    const before = await loadRotation(vaultPath, recipes);
    const slotBefore = before.slots?.[payload.slot];
    if (!slotBefore) throw new Error(`the ${payload.slot} slot has no recipe today`);
    const priorAltId = slotBefore.variantId || null;
    await setSlotVariant(vaultPath, recipes, payload.slot, payload.altId || null);
    const what = payload.altId
      ? `${payload.slot} → ${slotBefore.name} (${payload.variantLabel})`
      : `${payload.slot} back to ${slotBefore.name} as written`;
    return {
      destination: `Rotation — today only: ${what}`,
      undo: { route, slot: payload.slot, priorAltId, recipeName: slotBefore.name },
    };
  }

  if (route === 'calendar') {
    // Only reached on the user's explicit approval. Writes to iCloud here.
    const action = payload.action || 'create';
    if (action === 'create') {
      const created = await createEvent(payload);
      return {
        destination: `Calendar — added ${payload.title} (${created.calendarName})`,
        undo: { route, action: 'create', objectUrl: created.objectUrl, etag: created.etag },
      };
    }
    if (action === 'move') {
      // a repeating event moves ONE occurrence via an override; a one-off
      // rewrites its own times (payload.occurrence marks which)
      if (payload.occurrence) {
        await moveOccurrence({ objectUrl: payload.objectUrl, etag: payload.etag, raw: payload.oldRaw, occurrenceStartISO: payload.occurrence, newStart: payload.newStart, newEnd: payload.newEnd });
      } else {
        await moveEvent({ objectUrl: payload.objectUrl, etag: payload.etag, raw: payload.oldRaw, newStart: payload.newStart, newEnd: payload.newEnd });
      }
      return {
        destination: `Calendar — moved ${payload.label}`,
        undo: { route, action: 'move', objectUrl: payload.objectUrl, oldRaw: payload.oldRaw },
      };
    }
    if (action === 'delete') {
      await deleteEventAt({ objectUrl: payload.objectUrl, etag: payload.etag });
      return {
        destination: `Calendar — cancelled ${payload.label}`,
        undo: { route, action: 'delete', objectUrl: payload.objectUrl, raw: payload.raw },
      };
    }
    throw new Error('unknown calendar action');
  }

  if (route === 'plan-note') {
    // a drafted plan page (Wiki/Plans/…) — create or overwrite-with-backup;
    // undo restores what was there before (or deletes a fresh file)
    const full = path.join(vaultPath, payload.relPath);
    const existed = existsSync(full);
    const prior = existed ? await readFile(full, 'utf8') : null;
    if (existed) await backupFile(full);
    await mkdir(path.dirname(full), { recursive: true });
    const fm = `---\ntype: plan\ntags: [plan]\ncreated: ${date}\nupdated: ${date}\n---\n\n`;
    await writeFile(full, fm + payload.text + '\n', 'utf8');
    return {
      destination: `Plans — ${payload.title}`,
      undo: { route, relPath: payload.relPath, prior },
    };
  }

  if (route === 'recipe') {
    const recipe = await addRecipe(vaultPath, {
      name: payload.name,
      category: payload.category || 'ROTATION / SWAP MEALS',
      makes: payload.makes || null,
      macros: payload.macros,
      ingredients: payload.ingredients || [],
      method: payload.method || [],
      description: payload.description || null,
    });
    if (!recipe) throw new Error('recipe could not be added');
    return {
      destination: `Recipe bank — ${recipe.name}`,
      undo: { route, recipeId: recipe.id },
    };
  }

  if (route === 'journal') {
    // category separates personal reflections from training receipts and
    // system briefs; label carries provenance ("Daily review reflection")
    const saved = await journal.addEntry(vaultPath, {
      text: payload.text,
      category: payload.category,
      label: payload.label,
      linkedTitle: payload.linkedTitle,
    });
    return {
      destination: `Journal — ${saved.date} ${saved.time}${saved.category !== 'personal' ? ` (${saved.category})` : ''}`,
      undo: { route, date: saved.date, time: saved.time, text: saved.text },
    };
  }

  if (route === 'todo') {
    // format + lock come from the shared todoLine contract
    const { formatTodoLine, withTodoLock } = await import('./todoLine.js');
    return withTodoLock(async () => {
      const full = await ensureInboxNote(vaultPath, TODO_REL, 'To-Do');
      await backupFile(full);
      const raw = await readFile(full, 'utf8');
      // items are {text, category} (or legacy strings); missing categories
      // fall back to the deterministic keyword guess
      const entries = payload.items.map((it) => (typeof it === 'string' ? { text: it, category: null } : it));
      const lines = entries.map((it) => formatTodoLine({ text: it.text, added: date, category: it.category || guessTodoCategory(it.text) }));
      const updated = raw.replace(/\s*$/, '\n') + lines.join('\n') + '\n';
      await writeFile(full, updated, 'utf8');
      queueTodoistSync(vaultPath); // mirror to Todoist shortly (no-op when unconfigured)
      return {
        destination: `To-Do — ${entries.map((it) => it.text).join('; ')}`,
        undo: { route, relPath: TODO_REL, lines },
      };
    });
  }

  if (route === 'expense') {
    const [added] = await addTransactions([payload], source === 'inbox' ? 'capture' : source);
    if (!added) {
      // the exact same day+amount+merchant is already in the ledger
      return { destination: 'Ledger — already recorded (duplicate, nothing added)', undo: { route, ids: [] } };
    }
    const sign = added.amount < 0 ? `-$${Math.abs(added.amount).toFixed(2)}` : `+$${added.amount.toFixed(2)}`;
    return {
      destination: `Ledger — ${added.merchant} ${sign} (${added.category})`,
      undo: { route, ids: [added.id] },
    };
  }

  if (route === 'money-import') {
    const added = await addTransactions(payload.transactions, 'import');
    if (payload.file) await archiveImportFile(vaultPath, payload.file).catch(() => {});
    const spend = Math.round(added.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0));
    return {
      destination: added.length
        ? `Ledger — ${added.length} transaction${added.length === 1 ? '' : 's'} imported (~$${spend} spend)`
        : 'Ledger — all already recorded (duplicates, nothing added)',
      undo: { route, ids: added.map((t) => t.id) },
    };
  }

  if (route === 'idea') {
    // Studio seed: its own page under Wiki/Studio/Ideas with a status
    // pipeline the board reads (seed → outlining → scripting → shipped)
    const base = sanitizeFilename(payload.title);
    let relPath = `${IDEAS_DIR_REL}/${base}.md`;
    if (existsSync(path.join(vaultPath, relPath))) {
      relPath = `${IDEAS_DIR_REL}/${base} ${Date.now() % 10000}.md`;
    }
    const full = path.join(vaultPath, relPath);
    await mkdir(path.dirname(full), { recursive: true });
    const content = matter.stringify(`# ${payload.title}\n\n**Hook:** ${payload.hook}\n`, {
      type: 'idea',
      status: 'seed',
      format: payload.format,
      created: date,
      updated: date,
    });
    await writeFile(full, content, 'utf8');
    const hash = createHash('sha256').update(content).digest('hex');
    return {
      destination: `Studio — ${payload.title} (seed, ${payload.format})`,
      undo: { route: 'note', relPath, hash }, // same hash-checked delete as notes
    };
  }

  if (route === 'idea-outline') {
    // Studio's drafted outline, approved → appended to the idea page
    const full = path.join(vaultPath, payload.relPath);
    if (!existsSync(full)) throw new Error('that idea page no longer exists');
    await backupFile(full);
    const raw = await readFile(full, 'utf8');
    const block = `\n## Outline (drafted ${date})\n\n${payload.text.trim()}\n`;
    await writeFile(full, raw.replace(/\s*$/, '\n') + block, 'utf8');
    return {
      destination: `Outline appended — ${path.basename(payload.relPath, '.md')}`,
      undo: { route: 'idea-outline', relPath: payload.relPath, block },
    };
  }

  // watch-note — the Watcher's filing, in the vault's own source convention:
  // a Wiki/Sources page (type: source, so the Notes source filter finds it)
  // plus the verbatim transcript in Raw/, linked from the frontmatter the
  // same way his hand-ingested podcasts are. The transcript was persisted by
  // the watch job under server/data/watch/; a missing file degrades honestly
  // to the source page alone.
  if (route === 'watch-note') {
    // Same video already filed? Never mint a second Source page for it —
    // refuse honestly and point at the page that exists. (A title collision
    // with a DIFFERENT video still gets a suffix, below.)
    if (payload.url) {
      const { findExistingVideoPages } = await import('./ingest.js');
      const prior = await findExistingVideoPages(vaultPath, payload.url);
      if (prior.pages.length) {
        throw new Error(`this video is already filed at ${prior.pages[0]} — use Deep weave to deepen that page instead of filing a second copy`);
      }
    }
    const base = sanitizeFilename(payload.title);
    const suffix = existsSync(path.join(vaultPath, `Wiki/Sources/${base}.md`)) ? ` ${Date.now() % 10000}` : '';
    const srcRel = `Wiki/Sources/${base}${suffix}.md`;
    const files = [];

    let transcript = null;
    if (payload.transcriptRef) {
      const dataRoot = process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
      transcript = await readFile(path.join(dataRoot, 'watch', payload.transcriptRef), 'utf8').catch(() => null);
    }
    const rawBase = `${base}${suffix} (Transcript)`;
    const rawRel = transcript ? `Raw/${rawBase}.md` : null;

    const front = {
      type: 'source',
      ...(rawRel ? { raw: `[[Raw/${rawBase}]]` } : {}),
      ...(payload.url ? { url: payload.url } : {}),
      tags: ['video', ...(payload.lane === 'coach' ? ['training'] : [])],
      created: date,
      updated: date,
    };
    const srcContent = matter.stringify(`# ${payload.title}\n\n${payload.body}\n`, front);
    const srcFull = path.join(vaultPath, srcRel);
    await mkdir(path.dirname(srcFull), { recursive: true });
    await writeFile(srcFull, srcContent, 'utf8');
    files.push({ relPath: srcRel, hash: createHash('sha256').update(srcContent).digest('hex') });

    if (rawRel) {
      const rawContent = `Verbatim video transcript fetched by Nova's Watcher, received ${date}.\nSource URL: ${payload.url || '(unknown)'}\nSource page: [[${base}${suffix}]]\n\n---\n\n${transcript}`;
      const rawFull = path.join(vaultPath, rawRel);
      await mkdir(path.dirname(rawFull), { recursive: true });
      await writeFile(rawFull, rawContent, 'utf8');
      files.push({ relPath: rawRel, hash: createHash('sha256').update(rawContent).digest('hex') });
    }
    return {
      destination: `Source — ${payload.title}${rawRel ? ' (+ transcript in Raw/)' : ' (transcript unavailable)'}`,
      undo: { route: 'watch-note', files },
    };
  }

  // note
  const base = sanitizeFilename(payload.title);
  let relPath = `${INBOX_DIR_REL}/${base}.md`;
  if (existsSync(path.join(vaultPath, relPath))) {
    relPath = `${INBOX_DIR_REL}/${base} ${Date.now() % 10000}.md`;
  }
  const full = path.join(vaultPath, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  const content = matter.stringify(`# ${payload.title}\n\n${payload.body}\n`, {
    type: 'raw',
    tags: ['inbox'],
    created: date,
    updated: date,
  });
  await writeFile(full, content, 'utf8');
  const hash = createHash('sha256').update(content).digest('hex');
  return {
    destination: `Vault note — ${payload.title}`,
    undo: { route: 'note', relPath, hash },
  };
}

// Best-effort, honest revert of one filing. Returns a human summary; throws
// with a clear message when the target changed since filing.
export async function undoFiling(vaultPath, undo) {
  // put an exercise back where it was — the volume bars follow it back, since
  // they read the library at query time
  if (undo.kind === 'exercise-muscle-group') {
    const { setExerciseMuscleGroup } = await import('./exercises.js');
    const { exercise } = await setExerciseMuscleGroup(vaultPath, undo.exerciseId, undo.muscleGroup);
    return `${exercise.name} is filed under ${undo.muscleGroup} again`;
  }
  if (undo.route === 'shopping') {
    const removed = await removeItems(vaultPath, undo.ids);
    if (!removed) throw new Error('those items are no longer on the shopping list');
    return `removed ${removed} item${removed === 1 ? '' : 's'} from the shopping list`;
  }
  if (undo.route === 'food') {
    if (undo.slot) {
      const { loadRecipeData } = await import('./recipes.js');
      const { setSlotConsumed } = await import('./rotation.js');
      const { recipes } = await loadRecipeData(vaultPath);
      await setSlotConsumed(vaultPath, recipes, undo.slot, false);
      const { setRotationEntry } = await import('./foodLog.js');
      await setRotationEntry({ slot: undo.slot, consumed: false }).catch(() => {}); // and out of the log
      const { recordTodaySnapshot } = await import('./nutritionSnapshot.js');
      recordTodaySnapshot(vaultPath).catch(() => {});
      return `unmarked ${undo.slot} — ${undo.mealName} reads as not eaten again`;
    }
    const removed = await foodLog.removeEntryOn(undo.date, undo.entryId);
    if (!removed) throw new Error('that food-log entry is no longer there');
    return 'removed the food-log entry';
  }
  if (undo.route === 'stash') {
    await removeStashItem(vaultPath, undo.raw);
    return 'removed the stashed link';
  }
  if (undo.route === 'preference') {
    const { removeStandingRule } = await import('./standing.js');
    const removed = await removeStandingRule(vaultPath, undo.raw);
    return removed ? 'removed the standing instruction' : 'that instruction was already edited out of the page';
  }
  if (undo.route === 'reminder') {
    const { removeReminder } = await import('./reminders.js');
    const removed = await removeReminder(undo.reminderId);
    return removed ? `cancelled the reminder "${removed.text}"` : 'that reminder was already gone';
  }
  if (undo.route === 'distill-apply') {
    const { undoDistillJob } = await import('./distill.js');
    const { restored } = await undoDistillJob(vaultPath, undo.jobId);
    return `restored ${restored} file${restored === 1 ? '' : 's'} to their pre-distillation state`;
  }
  if (undo.route === 'profile') {
    const { setProfile } = await import('./profile.js');
    if (undo.prior && (undo.prior.focus || undo.prior.priorities?.length || undo.prior.bestSelf || undo.prior.notes)) {
      await setProfile(vaultPath, undo.prior);
      return 'restored the previous About You';
    }
    // there was no profile before — setProfile refuses emptiness, so blank
    // every field it accepts blank and note it honestly
    await setProfile(vaultPath, { focus: '', priorities: [], bestSelf: '', notes: '(cleared — the interview draft was undone)' });
    return 'cleared the About You draft';
  }
  if (undo.route === 'agent-mode') {
    const { AUTONOMY_TARGETS } = await import('./autonomyLedger.js');
    const target = AUTONOMY_TARGETS[undo.target];
    if (!target?.setMode) throw new Error('that agent no longer has a changeable mode');
    await target.setMode(undo.prior);
    return `restored ${target.label} to ${undo.prior} mode`;
  }
  if (undo.route === 'skill-backlog') {
    const { removeBacklogItem } = await import('./skills.js');
    const ok = await removeBacklogItem(vaultPath, undo.line);
    return ok ? 'removed the backlog entry' : 'that backlog entry was already gone';
  }
  if (undo.route === 'progression-tune') {
    const { clearTune } = await import('./progressionTunes.js');
    await clearTune(vaultPath, undo.exerciseId, { restore: undo.prior });
    return undo.prior ? `restored ${undo.name}'s previous tune` : `cleared the tune — ${undo.name} progresses by the defaults again`;
  }
  if (undo.route === 'coach-learning') {
    const { removeLearning } = await import('./coachKnowledge.js');
    const r = await removeLearning(vaultPath, undo.line);
    return r.removed ? 'removed that learning from What Works For Hayden' : 'that learning was already gone';
  }
  if (undo.route === 'exercise-resource') {
    const { setExerciseKnowledge } = await import('./exercises.js');
    await setExerciseKnowledge(vaultPath, undo.exerciseId, { cues: undo.prior?.cues || '', resourceUrl: undo.prior?.resourceUrl || '' });
    return undo.prior?.resourceUrl ? `restored ${undo.name}'s previous form resource` : `removed the form resource from ${undo.name}`;
  }
  if (undo.route === 'training-block') {
    if (undo.prior) {
      const { setBlock } = await import('./trainingBlocks.js');
      await setBlock(vaultPath, undo.prior);
      return `restored the previous ${undo.prior.phase} block`;
    }
    // no prior block — leave the page; the note says so honestly
    return 'there was no block before this one — the new block stands until you set another';
  }
  if (undo.route === 'injury-log') {
    const { removeInjury } = await import('./injuryLog.js');
    await removeInjury(vaultPath, undo.injuryId);
    return `removed the ${undo.area} entry from the Injury Log`;
  }
  if (undo.route === 'goal-target') {
    const { removeGoalTarget } = await import('./fitnessGoals.js');
    await removeGoalTarget(vaultPath, undo.targetId);
    return `removed the ${undo.metric} target`;
  }
  if (undo.route === 'routine-edit') {
    const { loadExerciseLibrary } = await import('./exercises.js');
    const { updateRoutine } = await import('./workouts.js');
    const { exercises } = await loadExerciseLibrary(vaultPath);
    await updateRoutine(vaultPath, exercises, undo.routineId, { exercises: undo.priorEntries });
    return `restored ${undo.routineName} to its prior exercise list`;
  }
  if (undo.route === 'rotation-variant') {
    const { loadRecipeData } = await import('./recipes.js');
    const { setSlotVariant } = await import('./rotation.js');
    const { recipes } = await loadRecipeData(vaultPath);
    await setSlotVariant(vaultPath, recipes, undo.slot, undo.priorAltId);
    return undo.priorAltId
      ? `restored ${undo.slot}'s previous today-variant of ${undo.recipeName}`
      : `cleared the today-variant — ${undo.slot} is ${undo.recipeName} as written again`;
  }

  if (undo.route === 'plan-note') {
    const full = path.join(vaultPath, undo.relPath);
    if (!existsSync(full)) return 'the plan page is already gone';
    await backupFile(full);
    if (undo.prior != null) {
      await writeFile(full, undo.prior, 'utf8');
      return `put ${path.basename(undo.relPath)} back to its previous content`;
    }
    const { unlink } = await import('node:fs/promises');
    await unlink(full);
    return `removed ${path.basename(undo.relPath)}`;
  }

  if (undo.route === 'recipe') {
    const { removed } = await removeRecipe(vaultPath, undo.recipeId);
    if (!removed) throw new Error('that recipe has already been removed or renamed');
    return 'removed the recipe from your recipe bank';
  }

  if (undo.route === 'calendar') {
    const action = undo.action || 'create';
    if (action === 'create') {
      await deleteEventAt({ objectUrl: undo.objectUrl, etag: undo.etag });
      return 'removed the event from your calendar';
    }
    if (action === 'move') {
      await putEventRaw({ objectUrl: undo.objectUrl, raw: undo.oldRaw });
      return 'moved the event back to its original time';
    }
    if (action === 'delete') {
      await putEventRaw({ objectUrl: undo.objectUrl, raw: undo.raw });
      return 'restored the event to your calendar';
    }
    throw new Error('unknown calendar undo');
  }

  if (undo.route === 'journal') {
    const ok = await journal.removeEntry(vaultPath, undo);
    if (!ok) throw new Error('that journal entry has been edited or removed since');
    return 'removed the journal entry';
  }
  if (undo.route === 'todo') {
    const { withTodoLock } = await import('./todoLine.js');
    return withTodoLock(async () => {
      const full = path.join(vaultPath, undo.relPath);
      if (!existsSync(full)) throw new Error('the To-Do file no longer exists');
      await backupFile(full);
      let raw = await readFile(full, 'utf8');
      let removed = 0;
      for (const line of undo.lines) {
        const idx = raw.indexOf(line);
        if (idx === -1) continue;
        raw = raw.slice(0, idx) + raw.slice(idx + line.length).replace(/^\n/, '');
        removed++;
      }
      if (!removed) throw new Error('those to-do lines have been edited or checked off since');
      await writeFile(full, raw, 'utf8');
      return `removed ${removed} to-do line${removed === 1 ? '' : 's'}`;
    });
  }
  if (undo.route === 'restore') {
    const prior = path.join(vaultPath, undo.priorBackupRel);
    if (!existsSync(prior)) throw new Error('the pre-restore snapshot is gone — restore by hand from .nova-backups');
    const { copyFile } = await import('node:fs/promises');
    await copyFile(prior, path.join(vaultPath, undo.relPath));
    return `put ${path.basename(undo.relPath)} back to its pre-restore state`;
  }

  if (undo.route === 'restore-created') {
    // the restore CREATED this file (it didn't exist before) — undo removes it,
    // snapshotting first so even the undo is recoverable
    const full = path.join(vaultPath, undo.relPath);
    if (!existsSync(full)) return `${path.basename(undo.relPath)} is already gone`;
    await backupFile(full);
    const { unlink } = await import('node:fs/promises');
    await unlink(full);
    return `removed ${path.basename(undo.relPath)} (it didn't exist before the restore)`;
  }
  if (undo.route === 'idea-outline') {
    const full = path.join(vaultPath, undo.relPath);
    if (!existsSync(full)) throw new Error('that idea page no longer exists');
    const raw = await readFile(full, 'utf8');
    if (!raw.includes(undo.block)) throw new Error('the outline was edited since — remove it by hand in Obsidian');
    await backupFile(full);
    await writeFile(full, raw.replace(undo.block, '\n'), 'utf8');
    return 'removed the appended outline';
  }
  if (undo.route === 'expense' || undo.route === 'money-import') {
    if (!undo.ids.length) throw new Error('this filing added nothing (it was a duplicate) — there is nothing to undo');
    const removed = await removeTransactions(undo.ids);
    if (!removed) throw new Error('those ledger entries are no longer there');
    return `removed ${removed} ledger ${removed === 1 ? 'entry' : 'entries'} (an archived import CSV stays in Money/Imports/Processed)`;
  }
  if (undo.route === 'note') {
    const full = path.join(vaultPath, undo.relPath);
    if (!existsSync(full)) throw new Error('that note no longer exists');
    const raw = await readFile(full, 'utf8');
    const hash = createHash('sha256').update(raw).digest('hex');
    if (hash !== undo.hash) throw new Error('that note has been edited since filing — delete it in Obsidian if you still want it gone');
    await backupFile(full);
    await unlink(full);
    return 'deleted the captured note';
  }
  if (undo.route === 'watch-note') {
    // Drift check EVERY file before touching ANY — a half-undone pair would
    // leave a source page pointing at a deleted transcript or vice versa.
    for (const f of undo.files) {
      const full = path.join(vaultPath, f.relPath);
      if (!existsSync(full)) throw new Error(`${f.relPath} no longer exists`);
      const hash = createHash('sha256').update(await readFile(full, 'utf8')).digest('hex');
      if (hash !== f.hash) throw new Error(`${f.relPath} has been edited since filing — delete it in Obsidian if you still want it gone`);
    }
    for (const f of undo.files) {
      const full = path.join(vaultPath, f.relPath);
      await backupFile(full);
      await unlink(full);
    }
    return `deleted the source page${undo.files.length > 1 ? ' and its transcript' : ''}`;
  }
  if (undo.route === 'note-move') {
    // compost archive → move the note back where it was
    const from = path.join(vaultPath, undo.to);
    const back = path.join(vaultPath, undo.from);
    if (!existsSync(from)) throw new Error('the archived note no longer exists');
    if (existsSync(back)) throw new Error('a note with the original name exists again — move it by hand in Obsidian');
    const { rename } = await import('node:fs/promises');
    await rename(from, back);
    return 'moved the note back out of the archive';
  }
  if (undo.route === 'todo-restore') {
    // compost sweep → re-append the swept lines (under the shared page lock)
    const { withTodoLock } = await import('./todoLine.js');
    return withTodoLock(async () => {
      const full = path.join(vaultPath, undo.relPath);
      if (!existsSync(full)) throw new Error('the To-Do file no longer exists');
      await backupFile(full);
      const raw = await readFile(full, 'utf8');
      await writeFile(full, raw.replace(/\s*$/, '\n') + undo.lines.join('\n') + '\n', 'utf8');
      return `restored ${undo.lines.length} swept to-do line${undo.lines.length === 1 ? '' : 's'}`;
    });
  }
  throw new Error('nothing to undo for this record');
}

/* ------------------------------ orchestration ------------------------------ */

function shouldAutoFile(mode, confidence) {
  if (mode === 'auto-all') return true;
  if (mode === 'auto-high') return confidence === 'high';
  return false;
}

// The classify-and-settle step, shared by first runs and retries: the record
// moves classifying → filed | pending | error on its own, and the client
// polls it.
function runClassification(vaultPath, record) {
  classify(record.text, async (err, decision) => {
    try {
      if (err) {
        await updateRecord(record.id, { status: 'error', error: err.message });
        return;
      }
      if (shouldAutoFile(record.mode, decision.confidence)) {
        try {
          const { destination, undo } = await fileDecision(vaultPath, decision);
          await updateRecord(record.id, { status: 'filed', decision, destination, undoData: undo, filedAt: new Date().toISOString(), auto: true });
        } catch (fileErr) {
          // classification worked but filing failed — park it for review
          await updateRecord(record.id, { status: 'pending', decision, error: 'auto-filing failed: ' + fileErr.message });
        }
      } else {
        await updateRecord(record.id, { status: 'pending', decision });
      }
    } catch (storeErr) {
      console.error('inbox: failed to persist classification outcome', storeErr);
    }
  });
}

// Creates the record and kicks off async classification.
export async function startCapture(vaultPath, { text, source = 'text', mode = 'auto-high' }) {
  const record = {
    id: randomUUID().slice(0, 8),
    text,
    source: source === 'voice' ? 'voice' : 'text',
    mode: MODES.includes(mode) ? mode : 'auto-high',
    status: 'classifying',
    createdAt: new Date().toISOString(),
    decision: null,
  };
  await createRecord(record);
  runClassification(vaultPath, record);
  return record;
}

// A failed run deserves a second chance without retyping the thought. Retry
// re-runs the SAME record's generation in place — only for kinds whose full
// input survives on the record (a capture's text, a research question, a
// video URL).
// Scheduled drafts re-run on their own cadence, so retrying a stale copy
// would produce a draft whose moment has passed.
export async function retryRecord(vaultPath, id) {
  const record = await getRecord(id);
  if (!record) throw new Error('inbox record not found');
  if (record.status !== 'error') throw new Error('only errored records can be retried');
  if (record.kind === 'research') {
    const { retryResearch } = await import('./researcher.js');
    return retryResearch(vaultPath, record);
  }
  if (record.kind === 'video') {
    const { retryWatch } = await import('./watcher.js');
    return retryWatch(vaultPath, record);
  }
  if (record.kind === 'study') {
    const { retryStudy } = await import('./studyLane.js');
    return retryStudy(vaultPath, record);
  }
  if (record.kind) throw new Error('this draft comes from a scheduled agent — it re-runs on its own schedule; discard this copy');
  const updated = await updateRecord(id, { status: 'classifying', error: null });
  runClassification(vaultPath, updated);
  return updated;
}

// Time-value drafts expire: a Tuesday-morning dispatch has no value on
// Thursday, and "did Leg Day happen TODAY?" is dead by the weekend. Expiry
// is a marked discard (expired: true) — visible in the stream as a receipt,
// never a silent deletion — and only touches kinds whose worth is bound to
// a moment. Real content (captures, research, coach receipts) never expires.
const TIME_VALUE_HOURS = { dispatch: 48, review: 48, 'training-check': 48, 'week-plan': 8 * 24, 'plan-today': 24, 'weekly-debrief': 8 * 24, distill: 7 * 24, 'brain-week': 8 * 24, 'fuel-cross': 7 * 24 };
export async function expireStaleDrafts() {
  const records = await listRecords();
  const now = Date.now();
  let expired = 0;
  for (const r of records) {
    const hours = TIME_VALUE_HOURS[r.kind];
    if (!hours || r.status !== 'pending') continue;
    if (now - new Date(r.createdAt).getTime() > hours * 3600e3) {
      await updateRecord(r.id, { status: 'discarded', discardedAt: new Date().toISOString(), expired: true, error: null });
      expired++;
    }
  }
  return expired;
}

export async function approveRecord(vaultPath, id) {
  const record = await getRecord(id);
  if (!record) throw new Error('inbox record not found');
  if (record.status !== 'pending') throw new Error('only pending captures can be approved');
  // A forge job carries no `decision` because it wrote nothing to the vault —
  // its output is a disposable directory, not knowledge. Approving one means
  // "I looked at this and I'm keeping it", so it resolves the record without
  // filing anything and without undoData (there is no vault change to undo).
  // Routing it through fileDecision would throw on the missing decision.
  if (record.kind === 'forge-job') {
    return updateRecord(id, {
      status: 'filed',
      destination: record.forgeDir || null,
      filedAt: new Date().toISOString(),
      auto: false,
      error: null,
    });
  }
  // A COACH PROGRAM CHANGE. Approving it APPLIES the fix — a re-filed
  // exercise moves every past set with it, because volume is computed from
  // the library at read time. undoData carries the previous group, so a
  // change he regrets is one tap back. A finding with no applicable fix
  // (a "you're short on sets" observation) files as an acknowledgement.
  if (record.kind === 'coach-program') {
    const fix = record.fix || null;
    if (fix?.action === 'remap' && fix.exerciseId && fix.muscleGroup) {
      const { setExerciseMuscleGroup } = await import('./exercises.js');
      const { before } = await setExerciseMuscleGroup(vaultPath, fix.exerciseId, fix.muscleGroup);
      return updateRecord(id, {
        status: 'filed', destination: 'exercise library', filedAt: new Date().toISOString(), auto: false, error: null,
        undoData: { kind: 'exercise-muscle-group', exerciseId: fix.exerciseId, muscleGroup: before },
      });
    }
    return updateRecord(id, { status: 'filed', destination: null, filedAt: new Date().toISOString(), auto: false, error: null });
  }
  // A fuel-cross finding is a receipt, not a write: it carries no decision
  // because nothing goes to the vault. Approving means "seen, acknowledged".
  if (record.kind === 'fuel-cross') {
    return updateRecord(id, { status: 'filed', destination: null, filedAt: new Date().toISOString(), auto: false, error: null });
  }
  const { destination, undo } = await fileDecision(vaultPath, record.decision);
  return updateRecord(id, { status: 'filed', destination, undoData: undo, filedAt: new Date().toISOString(), auto: false, error: null });
}

export async function discardRecord(id, reason) {
  const record = await getRecord(id);
  if (!record) throw new Error('inbox record not found');
  // error records need an exit too — before this, a failed capture/import was
  // unkillable: no endpoint accepted it and it accumulated forever
  if (record.status !== 'pending' && record.status !== 'error') throw new Error('only pending or errored captures can be discarded');
  // WHY a recommendation was declined is coaching gold — it rides the record
  // so adviceContext can hold the Coach to it (and spare him being re-asked)
  const declineReason = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 300) : null;
  return updateRecord(id, { status: 'discarded', discardedAt: new Date().toISOString(), error: null, ...(declineReason ? { declineReason } : {}) });
}

export async function undoRecord(vaultPath, id) {
  const record = await getRecord(id);
  if (!record) throw new Error('inbox record not found');
  if (record.status !== 'filed' || !record.undoData) throw new Error('only filed captures can be undone');
  const summary = await undoFiling(vaultPath, record.undoData);
  return updateRecord(id, { status: 'undone', undoneAt: new Date().toISOString(), undoSummary: summary });
}
