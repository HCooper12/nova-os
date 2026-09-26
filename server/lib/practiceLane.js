import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { NOVA_LENS } from './lens.js';
import { boundaryArgs } from './spawnBoundary.js';
import { modelFor, assertLaneOn } from './modelPrefs.js';
import { parseEnvelope } from './modelSpend.js';
import { firstBalancedObject, firstBalancedObjectMatch, parseModelJson } from './jsonSalvage.js';
import { SPOKEN_REGISTER } from './visualStream.js';
import { localDateISO } from './localDate.js';
import {
  listSkills, readSkill, validateDossier, writeSkillPage, vaultPageNames, wikilinkTarget,
  nextScene, appendSession, readPracticeState, updatePracticeState, cacheTallies, parsePracticePage, slugOf,
} from './practice.js';

// PRACTICE, THE MODEL HALF — three roles, one lane each (PRACTICE-PLAN.md):
//
//   Prepare (practice-prepare, one-shot, reads the vault): his sentence into a
//     typed JSON dossier. Code validates it, writes the page, files the record.
//   The scene partner (practice-chat, a warm session per scene): plays the
//     other person. Every reply ends with a typed NOTE line that code strips
//     before a word of it is spoken.
//   The debrief (the same session, its last turn): a typed DEBRIEF line. Code
//     checks every move name against the page, writes the session line, and
//     files the record with an undo.
//
// Models interpret; code acts. Nothing a model says reaches his vault except
// through validateDossier, validateDebrief and the writers in practice.js.

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
export const PREPARE_LANE = 'practice-prepare';

/* --------------------------------- prepare -------------------------------- */

// His words ask for the web, or they do not. A scene never touches it.
export const RESEARCH_WORDS = /\b(research|look (it )?up|find (me )?sources?|dig into)\b/i;

export async function buildPreparePrompt(vaultPath, { text, research = false, slug = null }) {
  let profile = '';
  try { const { profileContext } = await import('./profile.js'); profile = await profileContext(vaultPath); } catch { /* honest absence */ }
  let shelf = null;
  try { const { shelfContext } = await import('./sourceShelf.js'); shelf = await shelfContext(vaultPath, { topics: text, limit: 8 }); } catch { /* honest absence */ }
  const pages = await listSkills(vaultPath).catch(() => []);
  const extending = slug ? pages.find((p) => p.slug === slug) : null;
  const list = pages.map((p) => `- "${p.title}" · \`${p.relPath}\` · ${p.moves.length} moves, ${p.scenarios.length} scenes`).join('\n');
  return `${NOVA_LENS}

You are PRACTICE's preparer inside Nova. Hayden wants to rehearse a skill out loud, with Nova playing the other person and telling him afterwards what landed. Your ONLY job now is to assemble what his vault actually knows about it into a practice dossier: the moves (things he can say or do), the scenes to rehearse them in, the sources, and the gaps. You are not coaching him and not replying to him.

Your working directory is his Obsidian vault. Read the pages that bear on his sentence: the source pages below, their Raw/ transcripts, and the Wiki/Concepts pages they link. Grep for the skill's words when the shelf does not show it. ${research ? 'He asked for research, so you may also use WebSearch and WebFetch; a move you take from a page you fetched carries that page\'s URL.' : 'Read only the vault. Do not use the web.'}

${profile || 'ABOUT HAYDEN: (unavailable)'}

${shelf || 'HIS SHELF: nothing ranked for this. Search the vault with Grep and Glob for the skill he named.'}

HIS PRACTICE PAGES ALREADY (never make a second page for a skill he has; if his sentence is one of these, use its exact title and extend it):
${list || '- (none yet)'}
${extending ? `\nYOU ARE EXTENDING \`${extending.relPath}\`. Read it first. His moves and scenes stay exactly as they are; add only what is missing, under the same title "${extending.title}".\n` : ''}
HIS SENTENCE, verbatim: """${String(text).slice(0, 2000)}"""

HONESTY. Code checks each of these and drops or rewrites what fails, and the receipt says so:
- A move's "line" is a sentence HE could say out loud, in his own voice, in the scene. A move he cannot say is not a move.
- A move's "source" is exactly one of: a [[wikilink]] to a vault page you actually Read; "his words" when it comes from his sentence and nothing in the vault; "the book, unread by Nova" when it is the book's idea but the book's text is not in the vault${research ? '; "web: <https URL>" for a page you actually fetched' : ''}. Anything else becomes "his words".
- Never invent a quote from a book or a source. If the book itself is not in the vault, say so in gaps and name the fix: upload the book file in Library, and the moves get grounded in its text.
- A scenario is a real situation from his life as his profile and pages describe it, named for the moment, with one other person and the one way that person pushes back. Each scenario names one to three moves by their exact names.
- Three to six moves and two to four scenarios. Small and sayable beats complete.

Output ONLY this JSON, no code fences, no commentary:
{"title":"the skill, 2-6 words","summary":"one sentence: what the skill is","moves":[{"name":"2-5 words","summary":"one sentence","line":"the exact sentence he would say","when":"the moment to use it","tell":"how he knows it landed","source":"[[Page]] | his words | the book, unread by Nova${research ? ' | web: https://…' : ''}"}],"scenarios":[{"name":"the scene, 3-8 words","setting":"one sentence, second person","other":"who they are, and what they are like","pressure":"what they do to push back, once","moves":["exact move names"]}],"sourcesUsed":["[[Page]]"],"gaps":["what would make the feedback surer"]}`;
}

function runPrepareModel(prompt, { vaultPath, research }) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, [
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      // what the lane NEEDS; spawnBoundary denies the complement
      ...boundaryArgs(research ? 'Read Grep Glob WebSearch WebFetch' : 'Read Grep Glob'),
      '--output-format', 'json',
      '--model', modelFor(PREPARE_LANE),
      '--no-session-persistence',
    ], { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        const outer = parseEnvelope(stdout, { lane: PREPARE_LANE, code, stderr });
        const m = firstBalancedObjectMatch(outer.result || '');
        if (!m) return reject(new Error((outer.result || '').slice(0, 200) || 'the dossier did not come back as JSON'));
        resolve(parseModelJson(m[0]));
      } catch (e) { reject(e); }
    });
  });
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function prepareReceipt({ skill, notes = [], created = true }) {
  const k = skill.sources.length;
  const from = k ? `from ${k} of your source${k === 1 ? '' : 's'}` : 'from your words alone, no vault page matched';
  const bits = [
    `Practice: ${skill.title}${created ? '' : ' (extended)'}. ${plural(skill.moves.length, 'move')}, ${plural(skill.scenarios.length, 'scenario')}, ${from}.`,
  ];
  if (skill.gaps.length) bits.push(`Gaps: ${skill.gaps.join('; ')}.`);
  if (notes.length) bits.push(`${plural(notes.length, 'note')}: ${notes.join('; ')}.`);
  return bits.join(' ');
}

// The job itself — exported so a test can drive it with a stub model.
export async function runPrepareJob(vaultPath, record, { text, research = false, slug = null, runImpl = null }) {
  const { updateRecord } = await import('./inboxStore.js');
  try {
    const existingPaths = await vaultPageNames(vaultPath);
    const prompt = await buildPreparePrompt(vaultPath, { text, research, slug });
    const raw = await (runImpl || runPrepareModel)(prompt, { vaultPath, research });
    // THE WHY IS HIS, VERBATIM. Code writes it; the model is never asked to
    // paraphrase the reason he gave.
    const { skill, notes } = validateDossier({ ...raw, why: `"${String(text).trim()}"` }, { existingPaths, allowWeb: !!research });
    const written = await writeSkillPage(vaultPath, skill, { slug });
    const page = parsePracticePage(written.content);
    const now = new Date().toISOString();
    return await updateRecord(record.id, {
      status: 'filed', filedAt: now, auto: true, mode: 'auto',
      destination: written.relPath,
      text: prepareReceipt({ skill: { ...page, sources: page.sources }, notes, created: written.created }),
      decision: { route: 'practice-skill', title: page.title, payload: { slug: slugOf(page.title) } },
      undoData: { route: 'practice-skill', relPath: written.relPath, hash: written.hash, created: written.created, ...(written.created ? {} : { prior: written.prior }) },
      error: null,
    });
  } catch (e) {
    return updateRecord(record.id, { status: 'error', error: String(e.message || e).slice(0, 400) }).catch(() => null);
  }
}

// THE SAME ASK MUST NOT PREPARE TWICE. The Leader's lesson (20 Sep): a client
// timeout does not cancel the server, so a retry while the first run is still
// going would write a second page. An identical request in flight rides the
// first one's record.
const inFlight = new Map(); // hash -> record
const askKey = (text, slug, research) => createHash('sha1')
  .update(`${String(text).toLowerCase().replace(/\s+/g, ' ').trim()}|${slug || ''}|${research ? 1 : 0}`).digest('hex');

export async function startPrepare(vaultPath, { text, research = false, slug = null } = {}, { runImpl = null } = {}) {
  const said = String(text || '').trim();
  if (!said) throw new Error('say which skill you want to practise');
  assertLaneOn(PREPARE_LANE);
  const key = askKey(said, slug, research);
  const running = inFlight.get(key);
  if (running) return { ...running, repeat: true };
  const { createRecord } = await import('./inboxStore.js');
  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'practice-skill',
    text: said,
    source: 'practice',
    status: 'classifying',
    createdAt: new Date().toISOString(),
    practiceResearch: !!research,
    practiceSlug: slug || null,
  });
  inFlight.set(key, record);
  runPrepareJob(vaultPath, record, { text: said, research: !!research, slug, runImpl })
    .finally(() => inFlight.delete(key));
  return record;
}

/* ------------------------------ finding a skill --------------------------- */

const norm = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const PRACTICE_WORDS = /\b(practi[cs]e|practi[cs]ing|rehearse|rehearsing|role ?play(ing)?)\b/g;

// Pure: which existing skill (and scene) his sentence names. The longest
// matching name wins, so "the offhand dig in a team meeting" beats "dig".
export function matchPracticeAsk(skills, text) {
  const said = ` ${norm(text).replace(PRACTICE_WORDS, ' ').replace(/\s+/g, ' ').trim()} `;
  let best = null;
  const consider = (name, hit) => {
    const n = norm(name);
    if (n.length < 3 || !said.includes(` ${n} `)) return;
    if (!best || n.length > best.len) best = { ...hit, len: n.length };
  };
  for (const s of skills) {
    consider(s.title, { slug: s.slug, title: s.title, scenario: null });
    for (const m of s.moves) consider(m.name, { slug: s.slug, title: s.title, scenario: null });
    for (const c of s.scenarios) consider(c.name, { slug: s.slug, title: s.title, scenario: c.name });
  }
  return best ? { slug: best.slug, title: best.title, scenario: best.scenario } : null;
}

export async function resolvePracticeAsk(vaultPath, text) {
  return matchPracticeAsk(await listSkills(vaultPath).catch(() => []), text);
}

/* ------------------------------- the prompts ------------------------------- */

const NOTE_CONTRACT = `THE NOTE LINE — every reply, no exceptions. After your in-character words, end with ONE line, exactly this JSON form, on its own final line:
NOTE {"moves":[{"name":"<exact move name from the page>","hit":true,"quote":"<his exact words>"}],"stage":"open|mid|close","sceneOver":false}
- "moves" lists only moves he actually used in his LAST turn, by their exact names, with "quote" his own words verbatim. Nothing used, or it is your opening turn: "moves":[].
- "hit" is true only when he genuinely made the move. Do not credit a move he did not make; do not credit a near miss.
- "stage": where the scene is. "sceneOver": true only on the turn you close the scene.
Prose after NOTE does not work; only the JSON object is machine-readable. Nova's code strips the line before he hears anything.`;

export const PRACTICE_TURN_REMINDER = '[Standing reminder: stay in character, one human turn of one to three spoken sentences, never coach mid-scene unless he says pause, time out or how am I doing. End with the typed NOTE {"moves":[…],"stage":"…","sceneOver":false} line on its own final line, crediting only moves he used in this turn, quoted exactly. He HEARS this: no markdown, no lists, no wikilinks, no stage directions in brackets.]';

function movesBlock(skill, names) {
  const want = new Set((names || []).map((n) => n.toLowerCase()));
  const moves = skill.moves.filter((m) => !want.size || want.has(m.name.toLowerCase()));
  return moves.map((m) => `- ${m.name}: he says "${m.line.replace(/^"|"$/g, '')}"${m.when ? `. When: ${m.when}` : ''}${m.tell ? `. The tell it landed: ${m.tell}` : ''}`).join('\n');
}

export function buildPartnerPrompt({ skill, scenario, context = '' }) {
  return `${NOVA_LENS}

You are the SCENE PARTNER in Hayden's practice room inside Nova. He is rehearsing a skill out loud: "${skill.title}"${skill.summary ? `, ${skill.summary.replace(/\.$/, '')}` : ''}. You play ${scenario.other || 'the other person'} in this scene: ${scenario.setting || scenario.name}.

THE MOVES HE IS PRACTISING IN THIS SCENE (his lines verbatim, so you can recognise them when he makes one):
${movesBlock(skill, scenario.moves)}

EVERY MOVE ON HIS PAGE (credit any of these if he uses one):
${movesBlock(skill, [])}

HOW TO PLAY IT:
- One human turn at a time: one to three sentences, in character, the way a real person talks. Never narrate, never coach, never explain what you are doing mid-scene.
- Apply the pressure once and honestly: ${scenario.pressure || 'push back the way a real person in that seat would, once'}. Do not make it easy, and do not pile on.
- When he lands a move, let it change your stance the way a real person's would: soften, restate what you meant, go quiet. Do not reward a move he did not make.
- If he says "pause", "time out" or "how am I doing", step out of character for ONE exchange, as Nova: brief and specific about what he has done so far. Then step back in.
- End the scene when it has resolved naturally, or after about eight exchanges, with a closing line in character and "sceneOver": true.
- OPENING TURN: one sentence that sets the scene in second person ("You're at your desk; I'm Mark, and I've just walked over about the report."), then your first in-character line.

${NOTE_CONTRACT}

${SPOKEN_REGISTER}
No stage directions in brackets or asterisks. He hears only the words a person in the scene would say.
${context ? `\n${context}\n` : ''}
Begin the scene now with your opening turn.`;
}

export function buildDebriefInstruction(skill) {
  const names = skill.moves.map((m) => m.name).join(', ');
  const scenes = skill.scenarios.map((s) => s.name).join(', ');
  return `[The scene is over. Step out of it for good and speak to Hayden as Nova.

Say three to five spoken sentences to him: what landed, with his own words; what he missed, and the exact line from his page, or a line from a named source page you Read, that he could have used instead; and the ONE thing to work on next. Plain and specific; no markdown, no lists.

Then end with ONE line, exactly this JSON form, on its own final line:
DEBRIEF {"landed":[{"move":"<exact move name>","quote":"<his exact words>"}],"missed":[{"move":"<exact move name>","instead":"<the line he could have said>","source":"<[[Page]] the line comes from>"}],"best":"<his best moment, his words>","work":"<the one thing to work on, one sentence>","next":"<a scenario name from the page, or empty>"}
- Move names are exactly these: ${names}.
- "instead" is a Line from his page, or a sentence you can attribute to a source page you actually Read. Never invent a quote from the book.
- "next" is one of: ${scenes}; or "" if none fits.
Prose after DEBRIEF does not work; only the JSON object is machine-readable. Nova's code checks every name against his page and writes the session down.]`;
}

/* ------------------------------- the parsers ------------------------------- */

// The LAST line that starts with the directive word. Its JSON may run over
// several lines (a model that pretty-prints), so the object is found by
// balance, not by the end of the line.
function extractDirective(text, word) {
  const src = String(text || '');
  const re = new RegExp(`^[ \\t]*${word}\\b[ \\t]*`, 'gm');
  let m, last = null;
  while ((m = re.exec(src))) last = m;
  if (!last) return { found: false, cleanText: src.trim() };
  const start = last.index;
  const after = src.slice(start + last[0].length);
  const tidy = (s) => s.replace(/\n{3,}/g, '\n\n').trim();
  if (after.startsWith('{')) {
    const block = firstBalancedObject(after);
    if (block) {
      const end = start + last[0].length + block.length;
      const eol = src.indexOf('\n', end);
      return { found: true, block, cleanText: tidy(src.slice(0, start) + (eol === -1 ? '' : src.slice(eol))) };
    }
  }
  const eol = src.indexOf('\n', start);
  return { found: true, block: null, cleanText: tidy(src.slice(0, start) + (eol === -1 ? '' : src.slice(eol))) };
}

const canonFor = (knownMoves) => (knownMoves ? new Map(knownMoves.map((n) => [String(n).toLowerCase(), n])) : null);

// NOTE — the hidden line on every scene turn. Same contract as the Leader's
// REFLECT: a missing line is fine; a prose one is a parse error that is
// reported, never guessed at. Unknown move names are dropped when the page's
// moves are given.
export function parsePracticeNote(text, knownMoves = null) {
  const d = extractDirective(text, 'NOTE');
  if (!d.found) return { cleanText: d.cleanText, note: null };
  if (!d.block) return { cleanText: d.cleanText, note: null, parseError: 'the NOTE line was prose, not the typed JSON form' };
  let raw;
  try { raw = parseModelJson(d.block); } catch { return { cleanText: d.cleanText, note: null, parseError: 'the NOTE block was not valid JSON' }; }
  const canon = canonFor(knownMoves);
  const dropped = [];
  const moves = [];
  for (const x of Array.isArray(raw?.moves) ? raw.moves : []) {
    const name = String(x?.name || '').trim();
    if (!name) continue;
    const known = canon ? canon.get(name.toLowerCase()) : name;
    if (!known) { dropped.push(name); continue; }
    moves.push({ name: known, hit: x?.hit === true, quote: String(x?.quote || '').replace(/\s+/g, ' ').trim().slice(0, 300) });
  }
  return {
    cleanText: d.cleanText,
    note: {
      moves,
      stage: ['open', 'mid', 'close'].includes(raw?.stage) ? raw.stage : null,
      sceneOver: raw?.sceneOver === true,
      dropped,
    },
  };
}

export function parsePracticeDebrief(text) {
  const d = extractDirective(text, 'DEBRIEF');
  if (!d.found) return { cleanText: d.cleanText, debrief: null, parseError: 'there was no DEBRIEF line' };
  if (!d.block) return { cleanText: d.cleanText, debrief: null, parseError: 'the DEBRIEF line was prose, not the typed JSON form' };
  try {
    return { cleanText: d.cleanText, debrief: parseModelJson(d.block) };
  } catch {
    return { cleanText: d.cleanText, debrief: null, parseError: 'the DEBRIEF block was not valid JSON' };
  }
}

const squash = (s) => String(s || '').toLowerCase().replace(/[“”"'’.,!?]/g, '').replace(/\s+/g, ' ').trim();

// CODE CHECKS THE DEBRIEF. Pure: every move name against the page, `next`
// against the page's scenes, and every "instead" line either the page's own
// line or one attributed to a page that exists — else the page's line stands
// in, and the swap is said.
export function validateDebrief(raw, skill, { existingPaths = null } = {}) {
  const notes = [];
  const canon = new Map(skill.moves.map((m) => [m.name.toLowerCase(), m]));
  const clean = (s, n = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const landed = [];
  const seen = new Set();
  for (const x of Array.isArray(raw?.landed) ? raw.landed : []) {
    const m = canon.get(clean(x?.move).toLowerCase());
    if (!m) { if (clean(x?.move)) notes.push(`"${clean(x?.move, 60)}" is not a move on the page, so it was left out`); continue; }
    if (seen.has(m.name)) continue;
    seen.add(m.name);
    landed.push({ move: m.name, quote: clean(x?.quote) });
  }
  const missed = [];
  for (const x of Array.isArray(raw?.missed) ? raw.missed : []) {
    const m = canon.get(clean(x?.move).toLowerCase());
    if (!m) { if (clean(x?.move)) notes.push(`"${clean(x?.move, 60)}" is not a move on the page, so it was left out`); continue; }
    if (seen.has(m.name)) continue;
    seen.add(m.name);
    let instead = clean(x?.instead);
    let source = clean(x?.source, 200);
    const pageLine = skill.moves.find((mv) => squash(mv.line) === squash(instead));
    const link = wikilinkTarget(source);
    if (pageLine) source = pageLine.source;
    else if (!(instead && link && existingPaths && existingPaths.has(link))) {
      if (instead) notes.push(`the line suggested for ${m.name} was not from the page or a source Nova could check, so the page's own line stands in`);
      instead = m.line;
      source = m.source;
    }
    missed.push({ move: m.name, instead, source });
  }
  const scene = skill.scenarios.find((s) => s.name.toLowerCase() === clean(raw?.next).toLowerCase());
  const work = clean(raw?.work, 240) || 'keep rehearsing this scene';
  return { landed, missed, best: clean(raw?.best), work, next: scene ? scene.name : null, notes };
}

/* ------------------------------- the scenes -------------------------------- */

function sceneView(skill, scenario) {
  const canon = new Map(skill.moves.map((m) => [m.name.toLowerCase(), m]));
  return {
    slug: skill.slug,
    title: skill.title,
    scenario: scenario.name,
    setting: scenario.setting,
    other: scenario.other,
    // never the pressure: he should meet it, not read it first
    moves: (scenario.moves || []).map((n) => canon.get(n.toLowerCase())).filter(Boolean).map((m) => ({ name: m.name, line: m.line })),
  };
}

export async function startRehearsal(vaultPath, { slug, scenario = null, sessionId = null, text = null, end = false } = {}, { ask = null } = {}) {
  const startAsk = ask || (await import('./claudeCode.js')).startAskPractice;

  if (!sessionId) {
    assertLaneOn('practice-chat');
    const skill = await readSkill(vaultPath, slug);
    if (!skill) throw new Error('there is no practice page for that skill yet');
    if (skill.status !== 'active') throw new Error(`${skill.title} is ${skill.status}, so it is not being rehearsed; set it back to active first`);
    if (!skill.scenarios.length) throw new Error(`${skill.title} has no scenario yet, so there is nothing to rehearse; add one on the page or prepare it again`);
    let scene = scenario ? skill.scenarios.find((s) => s.name.toLowerCase() === String(scenario).toLowerCase()) : null;
    if (!scene) {
      const pick = nextScene(skill);
      scene = skill.scenarios.find((s) => s.name === pick.scenario);
    }
    const sid = randomUUID();
    await updatePracticeState((s) => {
      s.scenes[sid] = { slug: skill.slug, scenario: scene.name, startedAt: new Date().toISOString(), turns: [], notes: [], ended: false };
    });
    const jobId = startAsk(vaultPath, { text: buildPartnerPrompt({ skill, scenario: scene }), sessionId: sid, resume: false, mode: 'scene' });
    return { jobId, sessionId: sid, scene: sceneView(skill, scene) };
  }

  const state = await readPracticeState();
  const sc = state.scenes[sessionId];
  if (!sc) throw new Error('that scene is not one Nova knows; start a new one');
  if (sc.ended) throw new Error('that scene has already been debriefed; start a new one');
  const skill = await readSkill(vaultPath, sc.slug);
  if (!skill) throw new Error('the practice page for that scene is gone');
  const scene = skill.scenarios.find((s) => s.name.toLowerCase() === sc.scenario.toLowerCase())
    || { name: sc.scenario, setting: '', other: '', pressure: '', moves: [] };

  if (end) {
    const jobId = startAsk(vaultPath, { text: buildDebriefInstruction(skill), sessionId, resume: true, mode: 'debrief' });
    return { jobId, sessionId, scene: sceneView(skill, scene) };
  }
  const said = String(text || '').trim();
  if (!said) throw new Error('say your line to the scene');
  await updatePracticeState((s) => {
    s.scenes[sessionId]?.turns.push({ who: 'you', text: said.slice(0, 2000), at: new Date().toISOString() });
  });
  const jobId = startAsk(vaultPath, { text: `${PRACTICE_TURN_REMINDER}\n\n${said}`, sessionId, resume: true, mode: 'scene' });
  return { jobId, sessionId, scene: sceneView(skill, scene) };
}

// Called by claudeCode.js's finishTurn once the partner's reply is complete.
// Everything that parses, checks and writes lives here, so the conversation
// plumbing stays thin.
export async function finishPracticeTurn(replyText, { vaultPath, sessionId, mode = 'scene', now = new Date() } = {}) {
  const state = await readPracticeState();
  const sc = state.scenes[sessionId];
  const skill = sc ? await readSkill(vaultPath, sc.slug) : null;
  const known = skill ? skill.moves.map((m) => m.name) : [];

  if (mode !== 'debrief') {
    const { cleanText, note, parseError } = parsePracticeNote(replyText, known);
    const at = now.toISOString();
    if (sc) {
      await updatePracticeState((s) => {
        const scene = s.scenes[sessionId];
        if (!scene) return;
        scene.turns.push({ who: 'partner', text: cleanText, at });
        for (const m of note?.moves || []) if (m.hit) scene.notes.push({ move: m.name, hit: true, quote: m.quote, at });
        if (note?.sceneOver) scene.sceneOver = true;
        if (parseError) scene.noteErrors = (scene.noteErrors || 0) + 1;
      });
    }
    // A missing or broken NOTE is never spoken about mid-scene: breaking
    // character to report plumbing would ruin the rehearsal. It is counted on
    // the scene and returned for the screen.
    return {
      text: cleanText,
      sessionId,
      notes: { moves: (note?.moves || []).map(({ name, hit, quote }) => ({ name, hit, quote })), stage: note?.stage || null, sceneOver: !!note?.sceneOver },
      noted: !!note,
      ...(parseError ? { noteError: parseError } : {}),
      sceneOver: !!note?.sceneOver,
    };
  }

  // THE DEBRIEF. A parse failure files NOTHING and says so — the Leader's
  // REFLECT rule: a silently dropped debrief would lose the one receipt of
  // the rehearsal. The scene stays open so "end" can be asked again.
  const { cleanText, debrief: raw, parseError } = parsePracticeDebrief(replyText);
  if (!raw || !skill || !sc) {
    const why = !sc ? 'Nova has no record of this scene' : !skill ? 'the practice page is gone' : parseError;
    return {
      text: `${cleanText}${cleanText ? '\n\n' : ''}I could not write this debrief down, because ${why}, so nothing was filed. Ask me to end the scene again and I will try once more.`,
      sessionId, debrief: null, record: null, sceneOver: true,
    };
  }
  const existingPaths = await vaultPageNames(vaultPath).catch(() => null);
  const debrief = validateDebrief(raw, skill, { existingPaths });
  let appended;
  try {
    appended = await appendSession(vaultPath, skill.slug, {
      date: localDateISO(now), scenario: sc.scenario,
      landed: debrief.landed.map((x) => x.move), missed: debrief.missed.map((x) => x.move), work: debrief.work,
    }, { now });
  } catch (e) {
    return { text: `${cleanText}\n\nSaving this session to the practice page failed (${e.message}), so nothing was filed.`, sessionId, debrief, record: null, sceneOver: true };
  }
  await updatePracticeState((s) => {
    const scene = s.scenes[sessionId];
    if (scene) { scene.ended = true; scene.endedAt = now.toISOString(); scene.debrief = debrief; }
  });
  try { await cacheTallies(await readSkill(vaultPath, skill.slug) || skill); } catch { /* derived; recomputed on read */ }

  const { createRecord } = await import('./inboxStore.js');
  const id = randomUUID().slice(0, 8);
  const names = (a) => a.map((x) => x.move).join(', ');
  const at = now.toISOString();
  await createRecord({
    id, kind: 'practice-session',
    text: `Practice: ${skill.title} · ${sc.scenario} · landed ${names(debrief.landed) || 'nothing yet'} · missed ${names(debrief.missed) || 'nothing'} · work on: ${debrief.work}${debrief.notes.length ? ` (${debrief.notes.join('; ')})` : ''}`,
    source: 'practice', mode: 'auto', status: 'filed', auto: true,
    createdAt: at, filedAt: at,
    destination: appended.relPath,
    decision: { route: 'practice-session', title: `${skill.title} · ${sc.scenario}`, payload: { slug: skill.slug } },
    undoData: {
      route: 'practice-session', relPath: appended.relPath, slug: skill.slug, line: appended.line, sessionId,
      updatedLine: appended.updatedLine, addedHeading: appended.addedHeading,
    },
  });
  return { text: cleanText, sessionId, debrief, record: { id }, sceneOver: true };
}

