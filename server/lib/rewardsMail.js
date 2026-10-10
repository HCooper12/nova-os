import { readFile, writeFile, readdir, mkdir, rename, stat } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { modelFor, laneEnabled, laneSkipped } from './modelPrefs.js';
import { boundaryArgs } from './spawnBoundary.js';
import { parseEnvelope } from './modelSpend.js';
import { parseModelJson } from './jsonSalvage.js';

// OFFERS FROM HIS REWARDS EMAILS (10 Oct 2026, his yes to "Offers from his
// emails"). Nova has no mail reader and never signs in to anything. A Mail
// rule on his Mac (docs/rewards-mail-rule.md) saves each Everyday Rewards and
// Flybuys email into the vault folder REWARDS_DIR_REL; this file reads what
// lands there.
//
// Deterministic first: code decodes the email, finds the programme, and
// reads each offer's multiplier or points total, what it is on, its end date
// and whether it needs activating. Only an email code cannot read goes to a
// model (the `rewards-offer-read` lane), and the model's answer is checked by
// code before anything is stored: every figure it gives must appear in the
// email's own words, and every offer must pass the same validator code's own
// offers pass. An offer without an end date is never shown. Offers expire on
// their end date: the morning after, they leave.
//
// Nova never follows an email's Boost or Activate link: that would act on
// his account. It says "activate in the app" and takes his word.

export const REWARDS_DIR_REL = 'Inbox/Rewards Mail';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STORE = () => path.join(dataRoot(), 'rewards-offers.json');
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_FILE = 2 * 1024 * 1024;

/* ------------------------------------------------------ decoding mail -- */

function decodeQP(s) {
  const bytes = [];
  const src = s.replace(/=\r?\n/g, '');
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(src.slice(i + 1, i + 3))) { bytes.push(parseInt(src.slice(i + 1, i + 3), 16)); i += 2; }
    else { for (const b of Buffer.from(c, 'utf8')) bytes.push(b); }
  }
  return Buffer.from(bytes).toString('utf8');
}
const decodeB64 = (s) => Buffer.from(s.replace(/\s+/g, ''), 'base64').toString('utf8');

// =?utf-8?Q?…?= and =?utf-8?B?…?= in a header
export function decodeWords(s) {
  return String(s || '').replace(/=\?([^?]+)\?([QqBb])\?([^?]*)\?=/g, (_, _cs, enc, text) => (
    enc.toUpperCase() === 'B' ? decodeB64(text) : decodeQP(text.replace(/_/g, ' '))
  )).replace(/\?=\s+=\?/g, '');
}

function splitHead(raw) {
  const m = raw.match(/\r?\n\r?\n/);
  if (!m) return { head: raw, body: '' };
  return { head: raw.slice(0, m.index), body: raw.slice(m.index + m[0].length) };
}
function headers(head) {
  const out = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (m) out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

export function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|td)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&rsquo;|&lsquo;/gi, "'").replace(/&times;/gi, '×').replace(/&ndash;|&mdash;/gi, '-')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// one MIME part (and its children) to text, preferring text/plain
function partText(head, body) {
  const h = headers(head);
  const ct = h['content-type'] || 'text/plain';
  const enc = (h['content-transfer-encoding'] || '').toLowerCase();
  const boundary = ct.match(/boundary="?([^";]+)"?/i)?.[1];
  if (/^multipart\//i.test(ct) && boundary) {
    const parts = body.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?\\s*`)).slice(1)
      .map((p) => splitHead(p)).filter((p) => p.head.trim() || p.body.trim());
    const texts = parts.map((p) => ({ ct: headers(p.head)['content-type'] || '', text: partText(p.head, p.body) }));
    const plain = texts.find((t) => /text\/plain/i.test(t.ct) && t.text.trim());
    const html = texts.find((t) => /text\/html/i.test(t.ct) && t.text.trim());
    const nested = texts.find((t) => /multipart\//i.test(t.ct) && t.text.trim());
    return (plain || nested || html || { text: '' }).text;
  }
  let text = enc === 'quoted-printable' ? decodeQP(body) : enc === 'base64' ? decodeB64(body) : body;
  if (/text\/html/i.test(ct) || /^\s*<(!doctype|html)/i.test(text)) text = htmlToText(text);
  return text;
}

// An .eml (Mail's own source) or a .txt the rule wrote: who, what, when, text.
export function parseMail(raw, fileName = '') {
  const s = String(raw || '');
  const looksEml = /^(?:[A-Za-z-]+:.*\r?\n)+/.test(s) && /\r?\n\r?\n/.test(s);
  if (!looksEml) return { from: '', subject: '', date: null, text: s.trim(), file: fileName };
  const { head, body } = splitHead(s);
  const h = headers(head);
  const d = h.date ? new Date(h.date) : null;
  const text = /content-type/i.test(head) ? partText(head, body) : body;
  return {
    from: decodeWords(h.from || ''),
    subject: decodeWords(h.subject || ''),
    date: d && !Number.isNaN(d.getTime()) ? d.toISOString() : null,
    text: text.replace(/\r/g, '').trim(),
    file: fileName,
  };
}

/* --------------------------------------------------- reading the offers -- */

export function programmeOf(mail) {
  const who = `${mail.from} ${mail.subject}`.toLowerCase();
  const all = `${who} ${mail.text.slice(0, 4000)}`.toLowerCase();
  if (/everyday\s?rewards|everyday\.com\.au|woolworths/.test(who)) return 'er';
  if (/flybuys/.test(who)) return 'fb';
  if (/everyday\s?rewards/.test(all)) return 'er';
  if (/flybuys/.test(all)) return 'fb';
  return null;
}
const SHOP_OF = { er: 'w', fb: 'c' };

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const pad = (n) => String(n).padStart(2, '0');
function isoFrom(y, m, d) {
  const dt = new Date(Date.UTC(y, m, d));
  if (dt.getUTCMonth() !== m || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
// every date written in a piece of text, in order: "13 October 2026",
// "Tue 13 Oct", "13/10/2026", "13/10"; a missing year is the one that puts
// the date nearest after the email was sent
function datesIn(text, refISO) {
  const ref = refISO ? new Date(refISO) : new Date();
  const refY = ref.getUTCFullYear();
  const guessYear = (m, d) => {
    for (const y of [refY, refY + 1]) {
      const iso = isoFrom(y, m, d);
      if (iso && new Date(`${iso}T23:59:59Z`) >= new Date(ref.getTime() - 60 * 86400000)) return y;
    }
    return refY;
  };
  const out = [];
  const re = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON_RE}\\.?(?:,?\\s+(\\d{4}))?\\b|\\b${MON_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b|\\b(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?\\b`, 'gi');
  let m;
  while ((m = re.exec(text))) {
    let d, mo, y;
    if (m[1]) { d = Number(m[1]); mo = MONTHS.findIndex((x) => x.startsWith(m[2].toLowerCase().slice(0, 3))); y = m[3] ? Number(m[3]) : null; }
    else if (m[4]) { mo = MONTHS.findIndex((x) => x.startsWith(m[4].toLowerCase().slice(0, 3))); d = Number(m[5]); y = m[6] ? Number(m[6]) : null; }
    else { d = Number(m[7]); mo = Number(m[8]) - 1; y = m[9] ? Number(m[9].length === 2 ? `20${m[9]}` : m[9]) : null; }
    if (mo < 0 || mo > 11 || d < 1 || d > 31) continue;
    const iso = isoFrom(y ?? guessYear(mo, d), mo, d);
    if (iso) out.push({ iso, at: m.index, text: m[0] });
  }
  return out;
}

// the end date of a piece of text: a date after "ends/until/to/expires/-"
function endDateIn(text, ref) {
  const ds = datesIn(text, ref);
  if (!ds.length) return null;
  const ending = ds.find((d) => /(end|ends|ending|until|till|expires?|expiry|valid to|by|closes?|to|[-–])\s*(?:on\s+|midnight\s+)?(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?$/i.test(text.slice(Math.max(0, d.at - 40), d.at)));
  if (ending) return ending.iso;
  if (ds.length >= 2) return ds[ds.length - 1].iso; // "7 Oct to 13 Oct"
  return null;
}

const MULT_RE = /\b(\d{1,2})\s?[x×]\s?(?:the\s+)?(?:bonus\s+|everyday rewards\s+|flybuys\s+)?points\b/i;
const PTS_RE = /\b(\d{1,3}(?:,\d{3})+|\d{2,6})\s+(?:bonus\s+|extra\s+)?(?:everyday rewards\s+|flybuys\s+)?points\b/i;
const REDEEM_RE = /(=\s*\$\s?10|for \$10 off|\$10 (?:off|in) |redeem|balance|you have|you've (?:earned|got)|points? balance)/i;

function onWords(chunk) {
  const m = chunk.match(/\b(?:on|when you buy|buy)\s+(?:any\s+|selected\s+|participating\s+|eligible\s+)?([^.,;:!\n]{3,80})/i);
  if (!m) return null;
  return m[1].replace(/\b(at (?:woolworths|coles)|in.?store|online|each week|this week|until.*|ends.*|by \w+day.*|when you.*)$/i, '').replace(/\s+/g, ' ').trim().replace(/[*)]+$/, '') || null;
}

// one chunk of text (a paragraph or a card) into an offer, or null
// a partner shop that is neither chain: a Flybuys offer at Kmart is not a
// Coles offer, and never reaches the shopping list
const PARTNER = { fb: /\b(kmart|target|officeworks|liquorland|first choice|bunnings|shell|reddy express|catch|budget direct|ampol)\b/i, er: /\b(big w|bws|dan murphy'?s|ampol|caltex|healthylife|petstock|qantas)\b/i };
const CHAIN_WORD = { fb: /\bcoles\b/i, er: /\bwoolworths\b/i };

function offerFromChunk(chunk, prog, mail, emailEnd, emailAct) {
  const one = chunk.replace(/\s+/g, ' ');
  // the figure and what it is on are read line by line (a heading and its
  // paragraph each say it; the fuller one wins), the end date from the whole
  let best = null;
  for (const line of chunk.split(/\n/).map((l) => l.trim()).filter(Boolean)) {
    const mult = line.match(MULT_RE);
    let pts = line.match(PTS_RE);
    if (pts && REDEEM_RE.test(line.slice(Math.max(0, pts.index - 40), pts.index + pts[0].length + 40))) pts = null;
    if (!mult && !pts) continue;
    const gift = /gift ?cards?/i.test(line) || (/gift ?cards?/i.test(one) && !onWords(line));
    const spend = line.match(/\bspend\s+\$\s?(\d+(?:\.\d{2})?)/i) || one.match(/\bspend\s+\$\s?(\d+(?:\.\d{2})?)/i);
    let on = onWords(line);
    if (!on && spend) on = `a shop of $${spend[1]} or more`;
    if (!on && gift) on = 'gift cards';
    if (!on) continue;
    if (gift && !/gift ?card/i.test(on)) on = `${on} gift cards`;
    const cand = { line, mult: mult ? Number(mult[1]) : null, pts: !mult && pts ? Number(pts[1].replace(/,/g, '')) : null, gift, spend, on };
    if (!best || (cand.mult === best.mult && cand.pts === best.pts && cand.on.length > best.on.length)) best = cand;
  }
  if (!best) return null;
  const ends = endDateIn(one, mail.date) || emailEnd;
  const lower = one.toLowerCase();
  const noAct = /(no (?:need to )?(?:boost|activat)|no activation|automatically|open to all)/.test(lower);
  const act = !noAct && (/\b(boost|activate|activation)\b/.test(lower) || emailAct);
  const partner = PARTNER[prog].test(one) && !CHAIN_WORD[prog].test(one);
  return {
    programme: prog,
    shop: partner ? 'other' : SHOP_OF[prog],
    kind: best.gift ? 'gift' : best.spend && !best.mult ? 'shop' : 'line',
    on: best.on.slice(0, 80),
    mult: best.mult,
    pts: best.pts,
    cond: one.slice(0, 160),
    ends,
    activate: best.gift ? !noAct && /\b(boost|activate)\b/.test(lower) : act,
  };
}

// Code's read of an email: every offer it can find, each still to be checked.
export function readOffersByCode(mail) {
  const prog = programmeOf(mail);
  if (!prog) return { prog: null, offers: [] };
  // an end date said once for the whole email ("Offers end Tuesday 13 October")
  const tail = mail.text.match(/(?:offers?|boosts?|promotion)[^.\n]{0,40}\b(?:end|ends|valid (?:until|to)|expire)[^.\n]{0,60}/i);
  const emailEnd = tail ? endDateIn(tail[0], mail.date) : null;
  // a personalised email that says "boost" or "activate" once means it for
  // every offer in it, unless an offer says otherwise
  const emailAct = /\b(boost|boosts|boosted|activate)\b/i.test(`${mail.subject} ${mail.text}`);
  const chunks = mail.text.split(/\n\s*\n|\n(?=[•*\-–]\s)|\n(?=\d{1,2}\s?[x×]\s)/).map((c) => c.trim()).filter(Boolean);
  const offers = [];
  for (const c of chunks) {
    const o = offerFromChunk(c, prog, mail, emailEnd, emailAct);
    if (o && !offers.some((x) => x.on === o.on && x.mult === o.mult && x.pts === o.pts)) offers.push(o);
  }
  return { prog, offers };
}

/* ------------------------------------------------------ the validator -- */

// Every offer, from code or from a model, passes here before it is stored.
export function validateOffer(o, mail) {
  const reasons = [];
  if (!o || typeof o !== 'object') return { ok: false, reasons: ['not an offer'] };
  if (!['er', 'fb'].includes(o.programme)) reasons.push('no programme');
  if (o.shop !== SHOP_OF[o.programme]) reasons.push('not at Woolworths or Coles');
  const hasMult = Number.isInteger(o.mult) && o.mult >= 2 && o.mult <= 50;
  const hasPts = Number.isInteger(o.pts) && o.pts >= 10 && o.pts <= 100000;
  if (hasMult === hasPts) reasons.push(hasMult ? 'both a rate and an amount' : 'no multiplier or points total');
  if (typeof o.on !== 'string' || o.on.trim().length < 3 || o.on.length > 80) reasons.push('no product or brand');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(o.ends || '')) || Number.isNaN(Date.parse(o.ends))) reasons.push('no end date');
  if (typeof o.activate !== 'boolean') reasons.push('activation unknown');
  if (!['line', 'gift', 'shop'].includes(o.kind)) reasons.push('unknown kind');
  // a model's figures must be in the email's own words
  if (mail && o.via === 'model') {
    const t = mail.text.replace(/,/g, '');
    if (hasMult && !new RegExp(`\\b${o.mult}\\s?[x×]`, 'i').test(t)) reasons.push(`the email never says ${o.mult}x`);
    if (hasPts && !t.includes(String(o.pts))) reasons.push(`the email never says ${o.pts} points`);
    const day = Number(String(o.ends || '').slice(8, 10));
    if (day && !datesIn(mail.text, mail.date).some((d) => d.iso === o.ends)) reasons.push('the end date is not in the email');
  }
  return { ok: reasons.length === 0, reasons };
}

export const offerId = (o) => createHash('sha1').update([o.programme, o.on.toLowerCase(), o.ends, o.mult, o.pts].join('|')).digest('hex').slice(0, 12);

/* --------------------------------------------- the model, when code can't -- */

function modelPrompt(mail) {
  return `Read this loyalty-programme email and list every points offer in it. Output ONLY a JSON array, no prose:
[{"programme":"er"|"fb","kind":"line"|"gift"|"shop","on":"what it is on, under 80 characters","mult":10|null,"pts":2000|null,"ends":"YYYY-MM-DD","activate":true|false}]
- programme: "er" for Everyday Rewards (Woolworths), "fb" for Flybuys (Coles).
- mult is a points-per-dollar multiplier ("10x points"); pts is a fixed number of bonus points. Exactly one of them.
- ends: the offer's own end date as written in the email. If none is written, leave the offer out.
- activate: true if the email says to Boost or Activate it first.
- Copy figures exactly as the email writes them; never compute or guess one. An offer at another partner store is left out.
- If there is no offer, output [].

Email (sent ${mail.date || 'unknown'}), subject: ${mail.subject}
---
${mail.text.slice(0, 12000)}`;
}

export function runModelDefault(mail) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, [
      '-p', modelPrompt(mail),
      '--permission-mode', 'bypassPermissions',
      ...boundaryArgs(''),
      '--output-format', 'json',
      '--model', modelFor('rewards-offer-read'),
      '--no-session-persistence',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(err.trim().slice(0, 200) || `claude exited ${code}`));
      try {
        const env = parseEnvelope(out, { lane: 'rewards-offer-read' });
        const text = String(env.result || '');
        const m = text.match(/\[[\s\S]*\]/);
        resolve(m ? parseModelJson(m[0]) : []);
      } catch (e) { reject(e); }
    });
  });
}

/* ------------------------------------------------------------ the store -- */

const empty = () => ({ version: 1, files: {}, offers: [], marks: {} });
async function load() {
  try { return { ...empty(), ...JSON.parse(await readFile(STORE(), 'utf8')) }; } catch { return empty(); }
}
async function save(s) {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = `${STORE()}.tmp`;
  await writeFile(tmp, JSON.stringify(s, null, 1));
  await rename(tmp, STORE());
}
export function _resetForTests() { try { rmSync(STORE()); } catch { /* none */ } }

// Read every new or changed file in the folder. Code first; a model only for
// an email from a programme that code found no offer in; every offer checked.
export async function scanRewardsMail(vaultPath, { runModel = runModelDefault, now = new Date() } = {}) {
  const dir = path.join(vaultPath, REWARDS_DIR_REL);
  await mkdir(dir, { recursive: true });
  const s = await load();
  const names = (await readdir(dir)).filter((n) => /\.(eml|txt|emlx)$/i.test(n) && !n.startsWith('.'));
  const report = { read: 0, offers: 0, refused: 0, skipped: 0 };
  for (const name of names) {
    const full = path.join(dir, name);
    let st;
    try { st = await stat(full); } catch { continue; }
    if (!st.isFile() || st.size > MAX_FILE) { s.files[name] = { at: now.toISOString(), status: 'skipped', reason: 'too large to be an email' }; continue; }
    const raw = await readFile(full, 'utf8');
    const hash = createHash('sha1').update(raw).digest('hex').slice(0, 16);
    if (s.files[name]?.hash === hash) { report.skipped += 1; continue; }
    report.read += 1;
    const mail = parseMail(raw.replace(/^\d+\s*\n/, ''), name); // .emlx starts with a byte count
    const byCode = readOffersByCode(mail);
    let candidates = byCode.offers.map((o) => ({ ...o, via: 'code' }));
    let via = 'code';
    const refused = [];
    if (byCode.prog && !candidates.some((o) => validateOffer(o).ok) && /points/i.test(mail.text)) {
      if (laneEnabled('rewards-offer-read')) {
        try {
          const got = await runModel(mail);
          via = 'model';
          candidates = (Array.isArray(got) ? got : []).map((o) => ({
            programme: o?.programme, shop: SHOP_OF[o?.programme], kind: o?.kind, on: typeof o?.on === 'string' ? o.on.trim() : o?.on,
            mult: o?.mult == null ? null : Number(o.mult), pts: o?.pts == null ? null : Number(o.pts),
            ends: o?.ends, activate: o?.activate, cond: '', via: 'model',
          }));
        } catch (e) {
          refused.push(`the model could not read it: ${String(e.message).slice(0, 120)}`);
        }
      } else {
        laneSkipped('rewards-offer-read', 'rewards email offers (code could not read this one)');
        refused.push('code could not read it and the model lane is off');
      }
    }
    let kept = 0;
    for (const o of candidates) {
      const v = validateOffer(o, mail);
      if (!v.ok) { refused.push(`${o.on || 'an offer'}: ${v.reasons.join(', ')}`); continue; }
      const offer = { ...o, id: offerId(o), source: 'mail', file: name, mailDate: mail.date, subject: mail.subject.slice(0, 140), readAt: now.toISOString() };
      const i = s.offers.findIndex((x) => x.id === offer.id);
      if (i >= 0) s.offers[i] = offer; else s.offers.push(offer);
      kept += 1;
    }
    report.offers += kept;
    report.refused += refused.length;
    s.files[name] = { hash, at: now.toISOString(), status: byCode.prog ? (kept ? 'read' : 'nothing') : 'not a rewards email', via, count: kept, refused: refused.slice(0, 8), programme: byCode.prog };
  }
  await save(s);
  return report;
}

const melDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

// What the screen reads: live offers (today on or before their end date, not
// dismissed), the ones that ended this past week, and how the folder stands.
export async function offersView(vaultPath, { now = new Date() } = {}) {
  const s = await load();
  const today = melDay(now);
  const live = [];
  const ended = [];
  for (const o of s.offers) {
    const mark = s.marks[o.id] || {};
    const days = Math.round((Date.parse(`${o.ends}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    const row = { ...o, daysLeft: days, activated: !!mark.activated, dismissed: !!mark.dismissed };
    if (o.ends < today) { if (days >= -7) ended.push(row); continue; }
    if (mark.dismissed) continue;
    live.push(row);
  }
  live.sort((a, b) => a.ends.localeCompare(b.ends));
  const files = Object.entries(s.files).map(([name, f]) => ({ name, ...f }));
  const lastMail = files.filter((f) => f.status !== 'not a rewards email').sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null;
  let dirExists = false;
  try { dirExists = (await stat(path.join(vaultPath, REWARDS_DIR_REL))).isDirectory(); } catch { /* not yet */ }
  return {
    offers: live,
    ended,
    source: { dir: REWARDS_DIR_REL, dirExists, files: files.length, lastAt: lastMail?.at || null, setUp: files.length > 0 },
  };
}

// "I activated it" and "Not for me": his marks, each returning what it
// replaced so the pill's Undo restores exactly that.
export async function markOffer(id, patch) {
  const s = await load();
  if (!s.offers.some((o) => o.id === id)) throw new Error('no such offer');
  const prev = { ...(s.marks[id] || {}) };
  if (patch?.restore && typeof patch.restore === 'object') {
    // Undo: exactly the mark that was there before
    if (Object.keys(patch.restore).length) s.marks[id] = { ...patch.restore }; else delete s.marks[id];
    await save(s);
    return { mark: s.marks[id] || {}, prev };
  }
  const next = { ...prev };
  if (typeof patch?.activated === 'boolean') next.activated = patch.activated;
  if (typeof patch?.dismissed === 'boolean') next.dismissed = patch.dismissed;
  next.at = new Date().toISOString();
  s.marks[id] = next;
  await save(s);
  return { mark: next, prev };
}
