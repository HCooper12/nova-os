// SETTINGS BY VOICE — the last of the Verbs plan's phase 2.
//
// Appearance and voice settings are CLIENT state (localStorage + a repaint),
// so a server verb could never reach them; they run here, like the gym, with
// no round trip. Pure parse → a typed intent; App.jsx applies it with the
// same setters the Settings screen calls, so there is exactly one way each
// setting is written.
//
// Strict by design: only phrasings that name a real setting AND a real value
// match. "Make it calmer" is a conversation, not a command, and falls
// through to Nova.

import { NOVA_THEMES, NOVA_STYLES, NOVA_CORES } from './theme.js';

const norm = (q) => String(q || '')
  .toLowerCase()
  .replace(/^(hey|hi|ok|okay)?[,\s]*(nova|jarvis)[,\s]*/i, '')
  .replace(/[?!.]+$/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const ON = /\b(on|yes|enable|enabled|start|please)\b/;
const OFF = /\b(off|no|disable|disabled|stop|quiet|silent)\b/;

// value → the option list it belongs to, matched on label or value
function pick(list, words) {
  const w = norm(words);
  if (!w) return null;
  const exact = list.find((o) => o.value === w || o.label.toLowerCase() === w);
  if (exact) return exact;
  const partial = list.filter((o) => o.label.toLowerCase().includes(w) || w.includes(o.value));
  return partial.length === 1 ? partial[0] : null;
}

// Returns { kind, value, said } or null. `said` is what Nova reports having
// done — written here so the sentence and the change can never disagree.
export function parseSettings(text) {
  // the wake word is read BEFORE normalising: norm() strips a leading
  // "hey nova" as the address, which is exactly the phrase here
  const rawWake = String(text || '').trim().replace(/[.!?]+$/, '')
    .match(/^(?:turn |switch )?(?:the )?(?:wake ?word|hey,? nova)\s*(on|off)$/i);
  if (rawWake) {
    const on = rawWake[1].toLowerCase() === 'on';
    return { kind: 'wake', value: on, said: on ? '"Hey Nova" is listening.' : 'Wake word off.' };
  }
  const q = norm(text);
  if (!q || q.length > 90) return null;
  let m;

  // light / dark, in his words. Daylight is the light palette and it only
  // exists under the Apple styles, so asking for it carries the style too.
  if (/^(?:go |switch |turn )?(?:to )?(?:light|day|daylight)(?: mode| theme)?$/.test(q)) {
    return { kind: 'theme', value: 'daylight', needsAppleStyle: true, said: 'Daylight — the white study.' };
  }
  if (/^(?:go |switch |turn )?(?:to )?(?:dark|night)(?: mode| theme)?$/.test(q)) {
    return { kind: 'theme', value: 'command', said: 'Back to the dark HUD.' };
  }

  if ((m = q.match(/^(?:use |switch to |go |change to |set )?(?:the )?(.+?)\s*theme$/))) {
    const o = pick(NOVA_THEMES, m[1]);
    if (o) return { kind: 'theme', value: o.value, needsAppleStyle: !!o.appleOnly, said: `${o.label} it is.` };
  }
  if (/(?:style|layout|skin)$/.test(q)) {
    // the WHOLE phrase first: "apple layout" is a style of its own, and
    // matching the stripped "apple" would have handed him the other one
    const phrase = q.replace(/^(?:use |switch to |go |change to |set )?(?:the )?/, '').trim();
    const o = pick(NOVA_STYLES, phrase) || pick(NOVA_STYLES, phrase.replace(/\s*(?:style|layout|skin)$/, ''));
    if (o) return { kind: 'style', value: o.value, said: `${o.label}.` };
  }
  if ((m = q.match(/^(?:use |switch to |go |change to |set )?(?:the )?(.+?)\s*core$/))) {
    const o = pick(NOVA_CORES, m[1]);
    if (o) return { kind: 'core', value: o.value, said: `${o.label} core.` };
  }

  if ((m = q.match(/^(?:turn |switch )?calm(?: mode)?\s*(on|off)$/)) || (m = q.match(/^(?:turn |switch )\s*(on|off)\s+calm(?: mode)?$/))) {
    const on = m[1] === 'on';
    return { kind: 'calm', value: on, said: on ? 'Calm mode on — motion dialled down.' : 'Calm mode off.' };
  }

  // speech
  if (/^(?:stop talking|stop speaking|be quiet|don'?t speak|mute yourself|silent mode)$/.test(q)) return { kind: 'speak', value: false, said: 'I will keep it to text.' };
  if (/^(?:speak (?:to me|up|your answers)|talk to me|voice on|say it out loud)$/.test(q)) return { kind: 'speak', value: true, said: 'I will speak my answers.' };
  if ((m = q.match(/^(?:turn )?(?:your )?(?:voice|speech|speaking)\s*(on|off)$/))) return { kind: 'speak', value: m[1] === 'on', said: m[1] === 'on' ? 'I will speak my answers.' : 'I will keep it to text.' };

  // the wake word
  if ((m = q.match(/^(?:turn )?(?:the )?(?:wake ?word|hey nova)\s*(on|off)$/)) || (m = q.match(/^(?:turn )\s*(on|off)\s+(?:the )?(?:wake ?word|hey nova)$/))) {
    const on = m[1] === 'on';
    return { kind: 'wake', value: on, said: on ? '"Hey Nova" is listening.' : 'Wake word off.' };
  }

  // a bare "voice off"/"calm on" shape that the specific patterns missed
  if (/^(?:calm|voice|speech|wake ?word)\b/.test(q) && (ON.test(q) || OFF.test(q))) {
    const on = ON.test(q) && !OFF.test(q);
    if (/^calm/.test(q)) return { kind: 'calm', value: on, said: on ? 'Calm mode on — motion dialled down.' : 'Calm mode off.' };
    if (/^wake ?word/.test(q)) return { kind: 'wake', value: on, said: on ? '"Hey Nova" is listening.' : 'Wake word off.' };
    return { kind: 'speak', value: on, said: on ? 'I will speak my answers.' : 'I will keep it to text.' };
  }
  return null;
}
