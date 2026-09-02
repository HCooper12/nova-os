import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beat } from './heartbeat.js';

// The Telegram bridge — Nova reachable from his pocket without opening the
// app. Same rails, different mouth: incoming text rides the ask pipeline
// (context, PROPOSE, RESEARCH — everything), replies come back as messages,
// and a proposal arrives WITH its human gate: inline Yes/Leave buttons that
// call the same approve/discard endpoints the Inbox uses. The model never
// writes; the buttons do.
//
// Security is structural: the bridge is dormant without TELEGRAM_BOT_TOKEN,
// and it answers ONLY the chat in TELEGRAM_CHAT_ID. With a token but no
// chat id it logs the id of whoever writes (that's Hayden, during setup)
// and tells them how to authorize — it never answers substance.
//
// WhatsApp was considered and declined for now: the official Cloud API
// needs a Meta business app + a second phone number, and the unofficial
// route (puppeting WhatsApp Web) risks banning his personal number.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STATE_PATH = () => path.join(dataRoot(), 'telegram.json');

const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = () => String(process.env.TELEGRAM_CHAT_ID || '');
const API = () => `https://api.telegram.org/bot${TOKEN()}`;

export function telegramConfigured() { return !!TOKEN(); }

// Pure and tested: what to do with an incoming message.
export function routeIncoming(text, { authorized }) {
  const t = String(text || '').trim();
  if (!t) return { type: 'ignore' };
  if (!authorized) return { type: 'unauthorized' };
  if (/^\/start\b/.test(t)) return { type: 'start' };
  if (/^\/brief\b/.test(t)) return { type: 'brief' };
  if (/^\/new\b/.test(t)) return { type: 'new' };
  if (t.length > 1000) return { type: 'too-long' };
  return { type: 'ask', question: t };
}

export function proposalKeyboard(recordId) {
  return { inline_keyboard: [[
    { text: '✓ Yes, do it', callback_data: `ap:${recordId}` },
    { text: '✕ Leave it', callback_data: `ds:${recordId}` },
  ]] };
}

// Plain outbound line — reminders, nudges. Best-effort like everything here.
export async function sendTelegramText(text) {
  if (!telegramConfigured() || !CHAT_ID()) return;
  await tg('sendMessage', { chat_id: CHAT_ID(), text: String(text).slice(0, 4000) }).catch(() => {});
}

// Poke-style proactivity: a record newly waiting on Hayden is ANNOUNCED in
// the thread, buttons attached — the same taste filter as web push (things
// waiting on him, never everything that happens), the same rails when he
// taps. Best-effort: no bridge, no chat id, or an API hiccup all fail silent.
// forge-job announces itself (lib/forge.js composeForgeAnnouncement): it has
// to cover FAILED builds too, which never reach `pending` and so would never
// be announced here, and its message carries what the generic one can't —
// what he can now do, what it cost, and where it landed.
const ANNOUNCE_SKIP_KINDS = new Set(['followup', 'forge-job']);
export async function announceRecord(record) {
  if (!telegramConfigured() || !CHAT_ID()) return;
  if (!record || record.status !== 'pending' || ANNOUNCE_SKIP_KINDS.has(record.kind)) return;
  const title = record.decision?.title || record.text || 'Waiting for review';
  const body = String(record.decision?.payload?.text || record.decision?.reason || '').trim();
  const text = `◈ ${title}${body && body !== title ? `\n\n${body.slice(0, 900)}${body.length > 900 ? '…' : ''}` : ''}`;
  await tg('sendMessage', { chat_id: CHAT_ID(), text: text.replace(/\*\*/g, ''), reply_markup: proposalKeyboard(record.id) }).catch(() => {});
}

async function tg(method, body) {
  const r = await fetch(`${API()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(65_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description || `telegram ${method} failed (${r.status})`);
  return j.result;
}

async function loadState() {
  if (!existsSync(STATE_PATH())) return { sessionId: null, offset: 0 };
  try { return JSON.parse(await readFile(STATE_PATH(), 'utf8')); } catch { return { sessionId: null, offset: 0 }; }
}
async function saveState(state) {
  await mkdir(dataRoot(), { recursive: true });
  await writeFile(STATE_PATH(), JSON.stringify(state, null, 2), 'utf8');
}

const HELP = 'Nova, in your pocket. Just talk — questions, "add a to-do…", "stash this link…", "research X tonight". Proposals arrive with Yes/Leave buttons; nothing changes without your tap. /brief for the day\'s dispatch, /new for a fresh conversation.';

async function answerAsk(vaultPath, state, chatId, question) {
  const { startAskNova, getMessageJob } = await import('./claudeCode.js');
  const { buildAskContext } = await import('./askContext.js');
  await tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
  // a text thread is a conversation too — fast context, same as Siri
  const jobId = startAskNova(vaultPath, { question, context: await buildAskContext(vaultPath, state.sessionId, { fast: true }), sessionId: state.sessionId });
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    const job = getMessageJob(jobId);
    if (job?.status === 'ready') {
      const r = job.result;
      if (r.sessionId && r.sessionId !== state.sessionId) { state.sessionId = r.sessionId; await saveState(state); }
      let text = r.text || 'Done.';
      if (r.research?.queued) text += '\n\n◇ Queued for tonight — the brief lands in your Inbox by morning.';
      else if (r.research) text += '\n\n◇ Researching now — the brief lands in your Inbox in a few minutes.';
      if (r.panel) text += '\n\n(There\'s a visual panel for this on the Voice screen in the app.)';
      if (r.proposal) {
        await tg('sendMessage', { chat_id: chatId, text });
        await tg('sendMessage', { chat_id: chatId, text: `◈ ${r.proposal.title}`, reply_markup: proposalKeyboard(r.proposal.recordId) });
      } else {
        await tg('sendMessage', { chat_id: chatId, text });
      }
      return;
    }
    if (job?.status === 'error') {
      await tg('sendMessage', { chat_id: chatId, text: `That didn't work, sir: ${job.error}` });
      return;
    }
    await new Promise((res) => setTimeout(res, 1500));
    if (Date.now() % 9000 < 1600) await tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
  }
  await tg('sendMessage', { chat_id: chatId, text: 'Still thinking past my patience window — the reply may land in the app. Try asking again.' });
}

async function handleUpdate(vaultPath, state, update) {
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = String(cq.message?.chat?.id || '');
    if (chatId !== CHAT_ID()) { await tg('answerCallbackQuery', { callback_query_id: cq.id }).catch(() => {}); return; }
    const m = String(cq.data || '').match(/^(ap|ds):([a-z0-9-]+)$/i);
    if (!m) { await tg('answerCallbackQuery', { callback_query_id: cq.id }).catch(() => {}); return; }
    const { approveRecord, discardRecord } = await import('./inbox.js');
    let note;
    try {
      if (m[1] === 'ap') { const rec = await approveRecord(vaultPath, m[2]); note = `✓ Done — ${rec.destination || 'filed'}. Undo lives in the Inbox.`; }
      else { await discardRecord(m[2]); note = '✕ Left alone — nothing changed.'; }
    } catch (e) {
      note = `Couldn't do that: ${e.message}`;
    }
    await tg('answerCallbackQuery', { callback_query_id: cq.id }).catch(() => {});
    await tg('editMessageText', { chat_id: chatId, message_id: cq.message.message_id, text: `${cq.message.text}\n\n${note}` }).catch(() => {});
    return;
  }

  const msg = update.message;
  if (!msg) return;
  const chatId = String(msg.chat.id);
  const authorized = !!CHAT_ID() && chatId === CHAT_ID();
  if (!msg.text) {
    // A PHOTO IS A FOOD SCAN (his highest-value pocket ask); anything else
    // without text gets one honest line rather than the silence it used to.
    if (msg.photo && authorized) { await scanPhoto(vaultPath, chatId, msg); return; }
    // A VOICE NOTE IS AN ASK: transcribed the way the watcher transcribes a
    // video's audio, echoed back so he sees what was heard, then answered
    // exactly as if he had typed it.
    if ((msg.voice || msg.audio) && authorized) { await askVoice(vaultPath, state, chatId, msg); return; }
    const line = nonTextReply(msg);
    if (line && authorized) await tg('sendMessage', { chat_id: chatId, text: line }).catch(() => {});
    return;
  }
  const route = routeIncoming(msg.text, { authorized });

  if (route.type === 'unauthorized') {
    if (!CHAT_ID()) {
      console.log(`telegram: message from unauthorized chat ${chatId} — set TELEGRAM_CHAT_ID=${chatId} in server/.env to authorize`);
      await tg('sendMessage', { chat_id: chatId, text: `This Nova doesn't know you yet. If you're Hayden: set TELEGRAM_CHAT_ID=${chatId} in server/.env and reload the service.` }).catch(() => {});
    }
    // with a chat id set, strangers get silence
    return;
  }
  if (route.type === 'ignore') return;
  if (route.type === 'too-long') { await tg('sendMessage', { chat_id: chatId, text: 'Keep it under 1000 characters, sir.' }); return; }
  if (route.type === 'start') { await tg('sendMessage', { chat_id: chatId, text: HELP }); return; }
  if (route.type === 'new') {
    state.sessionId = null;
    await saveState(state);
    await tg('sendMessage', { chat_id: chatId, text: 'Fresh conversation — Nova starts clean.' });
    return;
  }
  if (route.type === 'brief') {
    const { composeDispatch } = await import('./dispatch.js');
    const slot = new Date().getHours() < 12 ? 'morning' : 'evening';
    const d = await composeDispatch(vaultPath, slot);
    await tg('sendMessage', { chat_id: chatId, text: d.text.replace(/\*\*/g, '') });
    return;
  }
  await answerAsk(vaultPath, state, chatId, route.question);
}

// Pure: what to say to a message that carries no text. null for a message
// with nothing recognisable (a service message, a chat-member change).
export function nonTextReply(msg) {
  if (!msg || msg.text || msg.photo || msg.voice || msg.audio) return null; // photos are scanned, voice notes asked
  const kind = msg.video || msg.video_note ? 'a video' : msg.document ? 'a file' : msg.sticker ? 'a sticker' : msg.location ? 'a location' : null;
  if (!kind) return null;
  return `Text, photos and voice notes here, sir — ${kind} doesn't reach Nova yet. Type it instead.`;
}

// download the note, transcribe it, echo what was heard, answer it
async function askVoice(vaultPath, state, chatId, msg) {
  const workDir = path.join(os.tmpdir(), 'nova-telegram', randomUUID().slice(0, 8));
  try {
    const media = msg.voice || msg.audio;
    await tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
    const file = await tg('getFile', { file_id: media.file_id });
    const r = await fetch(`https://api.telegram.org/file/bot${TOKEN()}/${file.file_path}`, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`voice download failed (${r.status})`);
    await mkdir(workDir, { recursive: true });
    const ext = path.extname(file.file_path || '') || '.ogg';
    const audioPath = path.join(workDir, `voice${ext}`);
    await writeFile(audioPath, Buffer.from(await r.arrayBuffer()));
    const { transcribeAudio } = await import('./transcribe.js');
    const { text } = await transcribeAudio(audioPath, { mime: media.mime_type || 'audio/ogg' });
    if (!text) throw new Error('nothing was heard in that note');
    // he sees what was heard BEFORE the answer — a mishearing is visible, not silent
    await tg('sendMessage', { chat_id: chatId, text: `Heard: “${text.slice(0, 600)}”` }).catch(() => {});
    await answerAsk(vaultPath, state, chatId, text);
  } catch (e) {
    await tg('sendMessage', { chat_id: chatId, text: `Couldn't take that voice note, sir: ${e.message} — type it instead.` }).catch(() => {});
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// Telegram sends several sizes of one photo; the scan reads the largest.
export function pickLargestPhoto(photos) {
  return [...(photos || [])].sort((a, b) => (b.file_size || (b.width || 0) * (b.height || 0)) - (a.file_size || (a.width || 0) * (a.height || 0)))[0] || null;
}

// The scan's answer as a pending food-log capture — the same 'food' route the
// app's own scan and the classifier file through; approving logs it, undo
// removes it. Pure, so the shape is pinned.
export function foodRecordFromScan(result, caption = '') {
  const name = String(result?.name || caption || 'photographed food').trim().slice(0, 120);
  const m = result?.macros || {};
  const macros = { p: Math.round(m.p || 0), c: Math.round(m.c || 0), f: Math.round(m.f || 0), kcal: Math.round(m.kcal || 0) };
  const low = result?.confidence === 'low';
  return {
    id: randomUUID().slice(0, 8),
    text: `Photo — ${name}${caption ? ` (${String(caption).slice(0, 120)})` : ''}`,
    source: 'telegram',
    mode: 'draft',
    status: 'pending',
    createdAt: new Date().toISOString(),
    decision: {
      route: 'food',
      confidence: low ? 'low' : 'high',
      title: `Log ${name} — ${macros.p}P · ${macros.c}C · ${macros.f}F · ${macros.kcal} kcal`,
      reason: `Read from your photo${low ? ' — LOW confidence, check the numbers' : ''}${result?.question ? `. ${String(result.question).trim()}` : ''}.`,
      payload: { name, macros },
    },
  };
}

// Download → the app's own scan lane → a pending record, which announces
// itself in this chat with ✓ Yes / ✕ Leave (inboxStore's notifyIfPending).
// Nothing is logged until he taps. Failures say so; the work dir is cleaned.
async function scanPhoto(vaultPath, chatId, msg) {
  const workDir = path.join(os.tmpdir(), 'nova-telegram', randomUUID().slice(0, 8));
  try {
    const photo = pickLargestPhoto(msg.photo);
    if (!photo) throw new Error('no usable photo size');
    await tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
    const file = await tg('getFile', { file_id: photo.file_id });
    const r = await fetch(`https://api.telegram.org/file/bot${TOKEN()}/${file.file_path}`, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`photo download failed (${r.status})`);
    await mkdir(workDir, { recursive: true });
    const imgPath = path.join(workDir, `photo${path.extname(file.file_path || '') || '.jpg'}`);
    await writeFile(imgPath, Buffer.from(await r.arrayBuffer()));
    const { startFoodScan, getFoodScanJob } = await import('./scanFood.js');
    const caption = String(msg.caption || '').trim();
    const jobId = startFoodScan('auto', [imgPath], workDir, caption);
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const job = getFoodScanJob(jobId);
      if (job?.status === 'ready') {
        const { createRecord } = await import('./inboxStore.js');
        await createRecord(foodRecordFromScan(job.result, caption));
        return;
      }
      if (job?.status === 'error') throw new Error(job.error || 'the scan failed');
      await new Promise((res) => setTimeout(res, 1500));
    }
    throw new Error('the scan took too long — try the app');
  } catch (e) {
    await tg('sendMessage', { chat_id: chatId, text: `Couldn't read that photo, sir: ${e.message}` }).catch(() => {});
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function startTelegramBridge(vaultPath) {
  if (!telegramConfigured()) {
    console.log('telegram: no TELEGRAM_BOT_TOKEN — bridge dormant');
    return;
  }
  let running = true;
  (async () => {
    const state = await loadState();
    console.log('telegram: bridge up, long-polling');
    while (running) {
      beat('telegram');
      try {
        const updates = await tg('getUpdates', { offset: state.offset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
        for (const u of updates) {
          // AT-MOST-ONCE, on purpose: the offset is advanced and persisted
          // BEFORE the update is handled, so a crash mid-handling drops that
          // one message rather than replaying it on restart — a duplicated
          // "log 40g protein" or a second scan proposal is the worse failure
          // in a bridge whose replies file real records (audit [66] item 4).
          state.offset = u.update_id + 1;
          await saveState(state);
          try { await handleUpdate(vaultPath, state, u); } catch (e) { console.error('telegram update failed:', e.message); }
        }
      } catch (e) {
        console.error('telegram poll failed:', e.message);
        await new Promise((res) => setTimeout(res, 10_000));
      }
    }
  })();
  return () => { running = false; };
}
