// SETTINGS, DIRECTION A (his pick, 7 Oct 2026: "Love the rows option A and
// layout of it... ensure this is built exactly like the mockup with nothing
// missing"). design/mockups/72-redesign-settings.html, direction A, and its
// checklist design/audits/redesign-2026-09/07-settings-build-checklist.md.
//
// The pure half: the pages and their parents, the search index, and the
// sentences a row says. No JSX and no DOM, so server/test/settingsPage.test.js
// can hold the rules that the audit found broken in the old page:
//   - Talk over reads off, and says why, until "Hey Nova" is on (finding 2)
//   - the page opens on "Settings", never on a connect form (finding 1)
//   - the tab bar's count is the bar's own count (finding 4)
//   - six settings answer to speech, named as six (finding 4)

// Every page a row can open. A group of the model board is `mg:<group id>`.
export const PAGES = {
  voice: 'Voice',
  notif: 'Notifications',
  app: 'Appearance',
  check: 'Check Nova',
  you: 'You',
  cals: 'Calendars',
  models: 'Claude models',
  snap: 'Snapshots',
  mac: 'The Mac',
  browser: 'Research browser',
  notion: 'Notion',
  tabs: 'Tab bar',
  train: 'Train',
};

export function isPage(id) {
  return typeof id === 'string' && (Object.prototype.hasOwnProperty.call(PAGES, id) || /^mg:[a-z0-9_-]+$/i.test(id));
}

// a path is the pages pushed over the root, oldest first; anything foreign is
// dropped rather than trusted (it rides on a history entry, which outlives
// a deploy that renames a page)
export function cleanPath(path) {
  return Array.isArray(path) ? path.filter(isPage).slice(0, 4) : [];
}

// The title a page wears, and the word its Back button says. `names` carries
// what only the view model knows: the you page is his name, a model group is
// its label.
export function pageTitle(id, names = {}) {
  if (!id || id === 'root') return 'Settings';
  if (id === 'you') return names.you || PAGES.you;
  if (id.startsWith('mg:')) return names[id] || 'Models';
  return PAGES[id] || 'Settings';
}

// "22:30" from 22.5; the 24-hour clock quiet hours are stored in
export const hm = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;
// 22.5 from "22:30"
export function hours(clock) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(clock || ''));
  if (!m) return null;
  return Number(m[1]) + Number(m[2]) / 60;
}
// how long the window lasts, in hours, across midnight
export function quietLength(start, end) {
  const s = hours(start);
  const e = hours(end);
  if (s == null || e == null) return null;
  return ((e - s) % 24 + 24) % 24;
}
// "6 h 30" / "7 h"
export function lengthLabel(h) {
  if (h == null) return '';
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins ? `${whole} h ${mins}` : `${whole} h`;
}

// THE LINE UNDER THE NIGHT RING: where now sits against the window. `now` is
// a Date on his clock; the window is his Melbourne clock, which is this
// device's clock when he is home (the server stores it that way).
export function quietNowLine(prefs, now = new Date()) {
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (!prefs) return '';
  if (!prefs.enabled) return `Now ${clock} · every push arrives when it happens`;
  const s = hours(prefs.start);
  const len = quietLength(prefs.start, prefs.end);
  if (s == null || len == null) return `Now ${clock}`;
  const n = now.getHours() + now.getMinutes() / 60;
  const into = ((n - s) % 24 + 24) % 24;
  const waiting = prefs.waiting ? ` · ${prefs.waiting} waiting` : '';
  if (into < len) return `Now ${clock} · quiet now, held pushes arrive at ${prefs.end}${waiting}`;
  const mins = Math.round((((s - n) % 24 + 24) % 24) * 60);
  const until = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} minutes`;
  return `Now ${clock} · quiet in ${until}${waiting}`;
}

// The Notifications row's value: read from the push state and the window,
// never typed twice. Nothing when neither is known.
export function notifValue(pushState, quiet) {
  if (pushState === 'denied') return 'Blocked';
  if (pushState === 'unsupported') return 'Not installed';
  if (pushState === 'off') return 'Off';
  if (quiet && quiet.enabled) return `Quiet ${quiet.start} to ${quiet.end}`;
  if (pushState === 'on') return 'On';
  return '';
}

// TALK OVER NEEDS "HEY NOVA" (finding 2). The wake word is what holds the
// microphone open; <WakeWord> carries barge-in and mounts only while the wake
// word is on, so Talk over cannot run without it. It reads off, it is dimmed,
// and the line under it says why, whatever its own stored value is.
export function talkOver({ supported = true, wakeOn = false, bargeOn = false } = {}) {
  if (!supported) {
    return { checked: false, disabled: true, sub: 'This browser has no speech recognition, so this can’t run here.', why: 'This browser has no speech recognition, so Talk over can’t run here' };
  }
  if (!wakeOn) {
    return { checked: false, disabled: true, sub: 'Needs “Hey Nova”, which holds the microphone open.', why: 'Talk over needs “Hey Nova” on first; that is what holds the microphone open' };
  }
  return { checked: !!bargeOn, disabled: false, sub: 'Start talking while Nova speaks and he stops to listen.', why: '' };
}

// THE TAB BAR'S COUNT IS THE BAR'S OWN (finding 4). Summary's tab bar holds
// four (SummaryDock.jsx), the floating dock five (MobileChrome.jsx); the Mac
// has the sidebar and no bar at all.
export function dockSlots({ style, isMobile }) {
  if (!isMobile) return 0;
  return style === 'summary' ? 4 : 5;
}
const COUNT_WORD = ['none', 'one', 'two', 'three', 'four', 'five', 'six'];
export function tabsCopy(slots) {
  if (!slots) return 'On the Mac this order sorts the sidebar, within its groups. On the phone it fills the tab bar first and the rest live in More.';
  const n = COUNT_WORD[slots] || String(slots);
  return `The first ${n} sit in the tab bar and the rest live in More. On the Mac the same order sorts the sidebar.`;
}

// The settings that answer to speech (src/settingsVoice.js parses exactly
// these six: theme, style, core, calm, speak replies, the wake word), and the
// phrases the mockup names for them.
export const SPOKEN = {
  count: 6,
  phrases: ['dark mode', 'light mode', 'use the ember theme', 'apple layout', 'calm mode on', 'hey nova off', 'stop talking'],
};

// THE LOOK, BY NAME. A style, a palette and a material together have a name
// when they are one of the looks he named on 26 Sep; otherwise the parts.
export const LOOKS = [
  ['Nova glass', { style: 'summary', theme: 'command', material: 'glass' }],
  ['Nova lit', { style: 'summary', theme: 'command', material: 'lit' }],
  ['Nova night', { style: 'summary', theme: 'command', material: 'solid' }],
  ['Observatory', { style: 'summary', theme: 'observatory', material: 'glass' }],
  ['Apple glass', { style: 'summary', theme: 'sky', material: 'glass' }],
  ['Summary light', { style: 'summary', theme: 'daylight', material: 'glass' }],
  ['Apple layout', { style: 'cupertino', theme: 'command' }],
  ['Command Core', { style: 'command', theme: 'command' }],
];
const STYLE_NAME = { summary: 'Summary', cupertino: 'Apple layout', apple: 'Apple skin', command: 'Command Core' };
const THEME_NAME = { command: 'Command', observatory: 'Observatory', ember: 'Ember', daylight: 'Daylight', sky: 'Sky' };
const MAT_NAME = { glass: 'glass', lit: 'lit', solid: 'solid' };
export function lookName({ style, theme, material }) {
  const hit = LOOKS.find(([, l]) => l.style === style && l.theme === theme && (style !== 'summary' || l.material === material));
  if (hit) return hit[0];
  if (style === 'summary') return `${THEME_NAME[theme] || theme} ${MAT_NAME[material] || material}`;
  return `${STYLE_NAME[style] || style} · ${THEME_NAME[theme] || theme}`;
}

// THE SEARCH AT THE FOOT. It searches the settings (his call in the mockup's
// Your calls, 5): type "quiet" and Quiet hours comes up. Each entry is the
// setting's name, the page it lives on, the row lit when the page opens,
// words he might type instead, and the page's name shown beside the hit.
export const SEARCH_INDEX = [
  ['“Hey Nova”', 'voice', 'wake', 'wake word listen microphone', 'Voice'],
  ['Talk over Nova', 'voice', 'barge', 'interrupt barge stop', 'Voice'],
  ['Speak replies', 'voice', 'speak', 'voice talk aloud', 'Voice'],
  ['Voice', 'voice', 'voicepick', 'voice picker', 'Voice'],
  ['When the phone is on silent', 'voice', 'silent', 'ring switch duck music mute', 'Voice'],
  ['Sound effects', 'voice', 'sfx', 'chime tick sounds', 'Voice'],
  ['How Nova hears you', 'voice', 'hearing', 'ears dictation microphone', 'Voice'],
  ['Pause before Nova answers', 'voice', 'hold', 'turn wait end', 'Voice'],
  ['Quiet hours', 'notif', 'quiet', 'night silence push sleep', 'Notifications'],
  ['Allow notifications', 'notif', 'push', 'push watch alerts', 'Notifications'],
  ['Style', 'app', 'style', 'summary apple layout command core skin', 'Appearance'],
  ['Theme', 'app', 'theme', 'palette observatory ember daylight sky colour dark light', 'Appearance'],
  ['Material', 'app', 'mat', 'glass lit solid', 'Appearance'],
  ['Nova core', 'app', 'core', 'hologram filament orb', 'Appearance'],
  ['Calm mode', 'app', 'calm', 'glow motion dim', 'Appearance'],
  ['Rest timer', 'train', 'rest', 'timer set ring', 'Train'],
  ['Tab bar', 'tabs', 'tabs', 'dock order reorder more', 'Tab bar'],
  ['Calendars', 'cals', 'cals', 'calendar hide show', 'Connected'],
  ['The Mac', 'mac', 'mac', 'connection backend token server tailscale', 'Connected'],
  ['Research browser', 'browser', 'browser', 'instagram tiktok sign in scout', 'Connected'],
  ['Claude models', 'models', 'models', 'opus sonnet haiku lanes cost spend', 'Under the hood'],
  ['Snapshots', 'snap', 'snap', 'restore time machine backup guardian', 'Under the hood'],
  ['Can you hear Nova?', 'check', 'hear', 'speaker test sound', 'Check Nova'],
  ['Can Nova hear you?', 'check', 'mic', 'microphone mic check', 'Check Nova'],
  ['Haptics', 'check', 'haptics', 'vibration feel taptic', 'Check Nova'],
  ['About you', 'you', 'about', 'profile focus priorities', 'You'],
  ['Your numbers', 'you', 'numbers', 'intake calories protein', 'You'],
  ['What Nova has noticed', 'you', 'ladder', 'trust learning kept dismissed', 'You'],
].map(([label, page, lit, words, where]) => ({ label, page, lit, words, where }));

// every word he typed must appear in the setting's name, its words or its page
export function searchSettings(q, index = SEARCH_INDEX) {
  const words = String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return index.filter((x) => {
    const hay = `${x.label} ${x.words} ${x.where}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
