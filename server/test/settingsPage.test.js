// SETTINGS, DIRECTION A (his pick, 7 Oct 2026; design/mockups/72 A). The
// rules the audit (design/audits/redesign-2026-09/07-settings.md §2) found
// broken in the old single scroll, held so they cannot come back: the page
// opens on "Settings" and never on a connect form; Talk over reads off, and
// says why, until "Hey Nova" is on; the tab bar's count is the bar's own;
// the six spoken settings are named as six; Nova is he; Observatory's disc
// is drawn in Observatory's colours; offline, the Mac's last word stays.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  talkOver, dockSlots, tabsCopy, searchSettings, cleanPath, notifValue, quietLength, lengthLabel,
  quietNowLine, lookName, pageTitle, SPOKEN, SEARCH_INDEX,
} from '../../src/settingsModel.js';
import { valsSettings } from '../../src/vals/valsSettings.js';
import { calendarHue } from '../lib/calendar.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const SOURCES = ['src/screens/Settings.jsx', 'src/screens/SettingsPages.jsx', 'src/screens/SettingsKit.jsx', 'src/settingsModel.js', 'src/vals/valsSettings.js'];
const all = () => SOURCES.map(read).join('\n');

test('Talk over needs "Hey Nova": off, dimmed and saying why while the wake word is off, whatever it stored', () => {
  const off = talkOver({ supported: true, wakeOn: false, bargeOn: true });
  assert.equal(off.checked, false, 'Talk over shows On while it cannot run (audit finding 2)');
  assert.equal(off.disabled, true);
  assert.match(off.sub, /Hey Nova/);
  assert.match(off.why, /holds the microphone open/);
  const on = talkOver({ supported: true, wakeOn: true, bargeOn: true });
  assert.deepEqual([on.checked, on.disabled], [true, false]);
  assert.equal(talkOver({ supported: true, wakeOn: true, bargeOn: false }).checked, false);
  const none = talkOver({ supported: false, wakeOn: true, bargeOn: true });
  assert.deepEqual([none.checked, none.disabled], [false, true]);
});

// a fake app over the merged view model: the builder reads, and writes nothing
function build({ st = {}, v = {}, ctx = {} } = {}) {
  const calls = [];
  const app = new Proxy({
    state: {
      screen: 'settings', settingsPath: [], novaStyle: 'summary', novaTheme: 'command', material: 'glass',
      coreStyle: 'hologram', calmMode: false, connectionStatus: 'demo', isMobile: true, pushState: 'on', ...st,
    },
  }, { get: (t, k) => (k in t ? t[k] : (...a) => calls.push([k, ...a])) });
  const out = valsSettings(app, { demoMode: true, isOffline: false, userName: 'Hayden', ...ctx }, {
    speakOn: true, wakeWordOn: false, bargeInOn: true, wakeWordSupported: true,
    hearingOptions: [], voiceHoldOptions: [], tabs: [],
    tabOrderItems: ['mission', 'voice', 'workouts', 'recipes', 'inbox'].map((key) => ({ key, label: key })),
    ...v,
  });
  return { P: out.settingsPage, calls };
}

test('the view model: Talk over off while Hey Nova is off even with bargeIn stored on', () => {
  const { P, calls } = build();
  assert.equal(P.voice.barge.checked, false);
  assert.equal(P.voice.barge.disabled, true);
  assert.equal(build({ v: { wakeWordOn: true } }).P.voice.barge.checked, true);
  assert.deepEqual(calls, [], 'building the view model wrote something');
});

test('null off the Settings screen; the path is cleaned of anything foreign', () => {
  assert.equal(build({ st: { screen: 'mission' } }).P, null);
  assert.deepEqual(cleanPath(['voice', 'nope', 'mg:capture', 42]), ['voice', 'mg:capture']);
  assert.deepEqual(build({ st: { settingsPath: ['models', 'mg:coach'] } }).P.path, ['models', 'mg:coach']);
  assert.equal(pageTitle('root'), 'Settings');
  assert.equal(pageTitle('you', { you: 'Hayden' }), 'Hayden');
});

test('the title is Settings, and "Connect the real vault" only ever lives on The Mac page when it is not connected', () => {
  const src = all();
  assert.doesNotMatch(src, /Connect the\s*(?:<[^>]*>\s*)?real vault/i, 'the unconditional connect title is back (audit finding 1)');
  assert.doesNotMatch(src, /runs in demo mode/);
  assert.match(read('src/screens/Settings.jsx'), /data-set-hcard="">Settings<\/h1>/);
  // connected, the Mac page offers Disconnect; only without a connection does it offer Connect
  assert.match(read('src/screens/Settings.jsx'), /\{M\.connected \? \([\s\S]*Disconnect[\s\S]*\) : \([\s\S]*Connect<\/TextAction>/);
});

test('the Mac row says what is true: demo data, connected, or offline since the last sync', () => {
  assert.equal(build().P.mac.status, 'Demo data');
  const live = build({ st: { connectionStatus: 'connected' }, ctx: { demoMode: false } }).P;
  assert.equal(live.mac.status, 'Connected');
  const at = new Date();
  at.setHours(9, 12, 0, 0);
  const off = build({ st: { connectionStatus: 'offline', lastSyncAt: at.toISOString() }, ctx: { demoMode: false, isOffline: true } }).P;
  assert.equal(off.mac.status, 'Offline since 09:12');
  assert.match(off.banner, /as it was at 09:12/);
});

test('offline, a Mac-held value keeps what the Mac last said and is marked stale; a Mac-held control is locked', () => {
  const at = new Date();
  at.setHours(9, 12, 0, 0);
  const { P } = build({
    st: { connectionStatus: 'offline', lastSyncAt: at.toISOString() },
    ctx: { demoMode: false, isOffline: true },
    v: {
      calendarSettings: { readOnly: true, loaded: true, error: false, calendars: [{ name: 'Work', url: 'u1', hidden: false }, { name: 'Gym', url: 'u2', hidden: true }] },
      quietHours: { prefs: { enabled: true, start: '22:30', end: '05:00' }, error: false, busy: false, readOnly: true, times: [] },
    },
  });
  assert.deepEqual(P.rows.cals.value, { text: '1 of 2 shown', loading: false, stale: true });
  assert.equal(P.rows.notif.value.stale, true);
  assert.equal(P.cals.locked, true);
  assert.match(P.cals.why, /offline/);
});

test('the tab bar says its own count: four under Summary, five on the floating dock, the sidebar on the Mac', () => {
  assert.equal(dockSlots({ style: 'summary', isMobile: true }), 4);
  assert.equal(dockSlots({ style: 'cupertino', isMobile: true }), 5);
  assert.equal(dockSlots({ style: 'summary', isMobile: false }), 0);
  assert.match(tabsCopy(4), /^The first four sit in the tab bar/);
  assert.match(tabsCopy(5), /^The first five/);
  assert.match(tabsCopy(0), /sidebar/);
  assert.equal(build().P.tabs.value, 'mission, voice, workouts, recipes');
  assert.doesNotMatch(all(), /first three/, 'the dock count copy is back (audit finding 4)');
});

test('the copy the audit caught: four styles, six spoken settings, Nova is he, no dashes', () => {
  const src = all();
  assert.doesNotMatch(src, /two skins/);
  assert.doesNotMatch(src, /Most of this page answers/);
  assert.equal(SPOKEN.count, 6);
  // settingsVoice.js parses exactly six kinds
  const kinds = new Set([...read('src/settingsVoice.js').matchAll(/kind: '([a-z]+)'/g)].map((m) => m[1]));
  assert.equal(kinds.size, SPOKEN.count);
  assert.doesNotMatch(src, /how it hears|and it stops|before it takes the turn|Tell it what/, 'Nova is "it" again');
  assert.doesNotMatch(src, /[—–]/, 'an em or en dash in Settings');
  assert.doesNotMatch(src, /XIV\./, 'the hard-coded numeral is back');
});

test('Observatory\'s disc is drawn in Observatory\'s own colours, never the current theme\'s tokens', () => {
  const css = read('src/settings.css');
  const disc = css.match(/\.nv-set-d-observatory \{[^}]+\}/)[0];
  assert.match(disc, /#d8b573/);
  assert.match(disc, /#6be5f5/);
  assert.doesNotMatch(disc, /var\(--nv-/);
});

test('search finds settings by every word, and opens each on its own page', () => {
  assert.deepEqual(searchSettings('quiet').map((x) => [x.label, x.page, x.lit]), [['Quiet hours', 'notif', 'quiet']]);
  assert.deepEqual(searchSettings('').length, 0);
  assert.equal(searchSettings('zebra').length, 0);
  assert.ok(searchSettings('hologram').some((x) => x.lit === 'core'));
  assert.equal(SEARCH_INDEX.length, 28, 'the mockup indexes 28 settings');
});

test('quiet hours: the window across midnight, its length, and the line under the ring', () => {
  assert.equal(quietLength('22:30', '05:00'), 6.5);
  assert.equal(lengthLabel(6.5), '6 h 30');
  assert.equal(notifValue('on', { enabled: true, start: '22:30', end: '05:00' }), 'Quiet 22:30 to 05:00');
  assert.equal(notifValue('on', { enabled: false }), 'On');
  assert.equal(notifValue('denied', null), 'Blocked');
  const late = new Date(); late.setHours(23, 0, 0, 0);
  assert.match(quietNowLine({ enabled: true, start: '22:30', end: '05:00' }, late), /quiet now, held pushes arrive at 05:00/);
  const evening = new Date(); evening.setHours(21, 40, 0, 0);
  assert.match(quietNowLine({ enabled: true, start: '22:30', end: '05:00' }, evening), /quiet in 50 minutes/);
});

test('the look by name', () => {
  assert.equal(lookName({ style: 'summary', theme: 'command', material: 'glass' }), 'Nova glass');
  assert.equal(lookName({ style: 'cupertino', theme: 'command', material: 'solid' }), 'Apple layout');
  assert.equal(lookName({ style: 'summary', theme: 'ember', material: 'lit' }), 'Ember lit');
});

test('a calendar wears its own iCloud colour, or none', () => {
  assert.equal(calendarHue('#FF2968FF'), '#ff2968');
  assert.equal(calendarHue('#1BADF8'), '#1badf8');
  assert.equal(calendarHue({ _cdata: '#34C759FF' }), '#34c759');
  assert.equal(calendarHue('blue'), null);
  assert.equal(calendarHue(undefined), null);
});
