import { NOVA_STYLES, NOVA_THEMES, NOVA_MATERIALS, NOVA_CORES } from '../theme.js';
import { REST_CHOICES } from '../sessionSummaryFacts.js';
import { hapticCapability, hapticDiagnostic } from '../haptics.js';
import { isStandalone } from '../edgeBack.js';
import { getConnection } from '../api.js';
import {
  cleanPath, pageTitle, lookName, notifValue, talkOver, dockSlots, tabsCopy, SPOKEN,
} from '../settingsModel.js';
import { demoSettingsSeed, demoBoard, DEMO_NUMBERS, DEMO_LADDER } from '../settingsDemo.js';

// SETTINGS' VIEW MODEL, direction A (his pick, 7 Oct 2026; mockup 72 A).
// The root's rows with their values, and each page's controls. Takes the
// merged view model, like the Index (valsIndex.js), because it reads the
// voice slice (valsMisc), the settings slice (valsChrome) and the rest timer
// (valsSessionSummary). Null off the Settings screen.
//
// EVERY VALUE IS READ, NEVER MADE. A row's value comes from state another
// builder or the Mac already holds; when nothing true can be said the value
// is empty and the row shows its name alone, or the page says so in words.
// What comes from the Mac carries `loading` (a skeleton until it lands) and,
// offline, `stale` (what it last said, with the time it said it). Demo mode
// shows src/settingsDemo.js, labelled demo, as Home shows its sample data.

const HEAR_LABEL = { auto: 'Automatic', nova: 'Nova’s ears', browser: 'Dictation' };
const SILENT_SUB = {
  duck: 'Your music dips for a sentence; the ring switch silences Nova.',
  speak: 'Nova speaks over the ring switch; your music pauses instead of dipping.',
};
const CORE_LINE = { hologram: 'Tilted rings round a living globe', filament: 'The original circuit-arc nebula' };
const REST_LABEL = { 60: '60 s', 90: '90 s', 120: '2 min', 180: '3 min' };

// HH:MM on this device's clock; the day too when it was not today
function clockOf(t) {
  if (t == null) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  const hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return hm;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${hm}`;
}

// A DEV-ONLY SEAM, the same family as novaos.forceStandalone (edgeBack.js):
// demo mode has no Mac, so the Loading and Offline states the rows must
// carry could not otherwise be looked at. Compiled out of the build he runs;
// it only ever reshapes demo data.
function devState() {
  try {
    if (!import.meta.env?.DEV) return null;
    const s = localStorage.getItem('novaos.settingsState');
    return s === 'loading' || s === 'offline' ? s : null;
  } catch { return null; }
}

export function valsSettings(app, ctx, v) {
  const st = app.state;
  if (st.screen !== 'settings') return { settingsPage: null };

  const demo = !!ctx.demoMode;
  const seam = demo ? devState() : null;
  const offline = !!ctx.isOffline || seam === 'offline';
  const seamLoading = seam === 'loading';
  const connected = !demo && !!getConnection();
  const staleAt = offline ? (seam === 'offline' ? clockOf(Date.now() - 150 * 60000) : clockOf(st.lastSyncAt)) : null;
  const D = demo ? (st.settingsDemo || demoSettingsSeed()) : null;
  const setDemo = (fn) => app.setState((s) => ({ settingsDemo: fn(s.settingsDemo || demoSettingsSeed()) }));

  // a thing the Mac holds: still loading, said offline, or simply known
  const macWhy = offline ? 'The Mac is offline. This waits until it is back' : 'Still reading this from the Mac';
  const held = (has, error = false) => {
    const loading = seamLoading || (!has && !error && !offline && connected);
    return { loading, stale: offline && has, locked: offline || loading, why: macWhy };
  };
  const mv = (text, h) => ({ text: h.loading ? '' : text, loading: h.loading, stale: h.stale && !!text });

  const path = cleanPath(st.settingsPath);
  const top = path[path.length - 1] || 'root';
  const go = (id, lit) => app.openSettingsPage(id, lit);

  // ---------------------------------------------------------------- voice --
  const speakOn = !!v.speakOn;
  const engine = st.liveTts;
  const speakSub = !speakOn ? 'Replies stay on the screen.'
    : engine?.configured && engine.engine === 'local' ? 'In Nova’s own voice, made on your Mac.'
      : engine?.configured && engine.engine === 'elevenlabs' ? 'In the ElevenLabs voice you chose.'
        : engine && !engine.configured ? 'In this device’s built-in voice.'
          : 'Spoken aloud.';
  const serverVoices = (v.voiceOptions || []).length > 0;
  const browserVoices = !serverVoices && v.usingBrowserVoice && (v.systemVoices || []).length > 0;
  const voicePick = serverVoices ? {
    value: v.voiceVoiceId || '',
    options: [{ value: '', label: v.voiceDefaultLabel || 'Account default' }, ...v.voiceOptions.map((o) => ({ value: o.id, label: o.name }))],
    pick: (id) => v.setVoiceId({ target: { value: id } }),
    title: 'Voice',
  } : browserVoices ? {
    value: v.speechVoiceURI || '',
    options: [{ value: '', label: 'System default' }, ...v.systemVoices.map((o) => ({ value: o.uri, label: o.name }))],
    pick: (uri) => v.setSpeechVoice({ target: { value: uri } }),
    title: 'Voice on this device',
  } : null;
  const voiceFoot = [
    'iOS has no setting that dips your music and speaks over the ring switch at once, so silent is a choice.',
    browserVoices ? 'More free voices: iOS Settings › Accessibility › Spoken Content › Voices; download one and it appears here.' : '',
    v.voiceEngineDetail ? 'For Nova’s own voice, add NOVA_TTS_LOCAL=1 (or an ElevenLabs key) to server/.env on the Mac.' : '',
  ].filter(Boolean).join(' ');
  const wakeSupported = v.wakeWordSupported !== false;
  const barge = talkOver({ supported: wakeSupported, wakeOn: !!v.wakeWordOn, bargeOn: !!v.bargeInOn });
  const hearingChoice = v.hearing || 'auto';
  const hearingHint = (v.hearingOptions || []).find((o) => o.value === hearingChoice)?.hint || '';
  const hearingSub = v.hearingNow == null
    ? 'Nothing on this device can hear you: no speech engine, and no connection to the Mac to write a recording down.'
    : hearingHint;
  const holdOn = wakeSupported || v.hearingNow === 'nova';
  const hold = (v.voiceHoldOptions || []).find((o) => o.value === v.voiceHold) || null;
  const voice = {
    speak: { on: speakOn, toggle: v.toggleSpeak, sub: speakSub },
    voicePick,
    foot: voiceFoot,
    silent: {
      value: v.audioDucks ? 'duck' : 'speak',
      options: [{ value: 'duck', label: 'Duck music' }, { value: 'speak', label: 'Speak anyway' }],
      pick: (val) => v.setAudioDucks(val === 'duck'),
      sub: v.audioDucks ? SILENT_SUB.duck : SILENT_SUB.speak,
    },
    sfx: { on: !!v.sfxOn, set: v.setSfxOn },
    wake: {
      on: !!v.wakeWordOn && wakeSupported, disabled: !wakeSupported, set: v.setWakeWord,
      text: wakeSupported ? 'Say it anywhere in Nova and the conversation starts.' : 'This browser has no speech recognition, so the wake word can’t run here.',
      why: 'This browser has no speech recognition, so the wake word can’t run here',
    },
    barge: { ...barge, set: v.setBargeIn },
    hearing: {
      value: hearingChoice,
      options: (v.hearingOptions || []).map((o) => ({ value: o.value, label: HEAR_LABEL[o.value] || o.label })),
      pick: v.setHearing,
      sub: hearingSub,
    },
    hold: holdOn && hold ? {
      value: hold.value,
      seconds: hold.holdMs / 1000,
      options: v.voiceHoldOptions.map((o) => ({ value: o.value, label: o.label })),
      pick: v.setVoiceHold,
      sub: hold.hint,
    } : null,
  };

  // -------------------------------------------------------- notifications --
  const push = demo ? D.push : st.pushState;
  const qv = v.quietHours;
  const quietPrefs = demo ? D.quiet : qv?.prefs || null;
  const quietHeld = demo ? held(true) : held(!!quietPrefs, !!qv?.error);
  const notif = {
    push: {
      state: push,
      on: push === 'on',
      loading: push === 'checking',
      // there is no unsubscribe: once allowed, iOS Settings is where it is
      // turned off, and the switch says so rather than pretending
      disabled: push === 'unsupported' || push === 'on' || push === 'checking',
      why: push === 'on' ? 'To turn notifications off, use iOS Settings › Nova › Notifications'
        : push === 'unsupported' ? 'Add Nova to the Home Screen first (Safari › Share › Add to Home Screen)'
          : 'Still checking whether this phone can be reached',
      sub: push === 'denied' ? 'Blocked. Allow them in iOS Settings › Nova.'
        : push === 'unsupported' ? 'Add Nova to the Home Screen first (Safari › Share › Add to Home Screen).'
          : 'Drafts, research outlines and Guardian alerts. iPhone mirrors them to your Watch.',
      enable: demo ? () => setDemo((d) => ({ ...d, push: 'on' })) : () => app.enablePushNotifications(),
    },
    test: push === 'on' ? (demo ? () => app.toastMsg('Demo: no phone is subscribed, so nothing is sent') : v.pushSettings?.test) : null,
    quiet: {
      prefs: quietHeld.loading ? null : quietPrefs,
      ...quietHeld,
      error: !demo && !!qv?.error && !quietPrefs,
      retry: () => app.loadQuietHours(),
      times: (qv?.times || []).length ? qv.times : Array.from({ length: 48 }, (_, i) => {
        const t = `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
        return { value: t, label: t };
      }),
      set: demo ? (patch) => setDemo((d) => ({ ...d, quiet: { ...d.quiet, ...patch } })) : (patch) => app.saveQuietHours(patch),
      busy: !!qv?.busy,
    },
  };

  // ----------------------------------------------------------- appearance --
  const style = st.novaStyle;
  const theme = st.novaTheme;
  const material = st.material || 'glass';
  const look = { style, theme, material, calm: !!st.calmMode };
  const app_ = {
    look,
    name: lookName(look),
    styles: ['summary', 'cupertino', 'apple', 'command'].map((s) => {
      const o = NOVA_STYLES.find((x) => x.value === s);
      return { value: s, label: o?.label || s, on: style === s, pick: () => app.setNovaStyle(s) };
    }),
    themes: NOVA_THEMES.map((t) => ({
      value: t.value, label: t.label, on: theme === t.value,
      disabled: !!t.appleOnly && style === 'command',
      pick: () => app.setNovaTheme(t.value),
    })),
    themeSub: style === 'command' ? 'Daylight and Sky are drawn for the Apple styles.' : '',
    materials: ['glass', 'lit', 'solid'].map((m) => {
      const o = NOVA_MATERIALS.find((x) => x.value === m);
      return { value: m, label: o?.label || m, on: material === m, disabled: style !== 'summary', pick: () => app.setMaterial(m) };
    }),
    materialSub: style === 'summary' ? '' : 'Material belongs to the Summary style.',
    cores: NOVA_CORES.map((c) => ({ value: c.value, label: c.label, line: CORE_LINE[c.value] || '', on: st.coreStyle === c.value, pick: () => app.setCoreStyle(c.value) })),
    calm: { on: !!st.calmMode, toggle: () => app.setCalmMode(!st.calmMode) },
    // picking Command Core while a light palette is on falls the theme back
    // (App.setNovaStyle); the page says so when it happens
    fallsBack: (s) => s === 'command' && (theme === 'daylight' || theme === 'sky'),
  };

  // ----------------------------------------------------------- check nova --
  const cap = hapticCapability();
  const diag = hapticDiagnostic();
  const buildLine = [
    cap.path === 'switch' ? 'iOS web' : cap.path === 'native' ? 'Native shell' : 'Browser',
    isStandalone() ? 'installed' : 'in a tab',
    demo ? 'demo' : offline ? 'offline' : 'connected',
  ].join(' · ');
  const swipe = v.backSwipe || {};
  const check = {
    voiceTest: v.voiceTest, runVoiceTest: v.runVoiceTest,
    micCheck: v.micCheck, runMicCheck: v.runMicCheck,
    earsTest: v.earsTest, runEarsTest: v.runEarsTest,
    // the swipe facts are read when he asks, as stages like the others
    swipeStages: [
      { ok: !!swipe.standalone, stage: 'Installed to the Home Screen', detail: swipe.standalone ? 'the gesture is listening' : 'running in a browser tab, where Safari owns the edge' },
      { ok: (swipe.depth || 0) > 0, stage: 'Somewhere to go back to', detail: `${swipe.depth || 0} screen${swipe.depth === 1 ? '' : 's'} deep this session` },
      { ok: !!swipe.last, stage: 'Last swipe Nova saw', detail: swipe.last || 'none yet: try one, then run this again' },
    ],
    haptics: {
      path: cap.path,
      label: cap.path === 'switch'
        ? 'iOS web: tick and threshold are one pulse, commit two, celebrate and warn three. Press each.'
        : cap.label,
      tiers: v.hapticTiers?.verdict ?? null,
      setTiers: v.hapticTiers?.set,
    },
    build: v.novaBuild,
    buildLine,
    // the line a report needs (the old haptics card's "send me this line")
    copyLine: `Build ${v.novaBuild} · ${buildLine} · iOS ${diag.iosReported} (as reported) · ${diag.browser} · overlay ${diag.overlayPath ? 'on' : 'off'} · switches ${diag.switchesOnScreen} · vibrate ${diag.vibrate ? 'yes' : 'no'}`,
  };

  // ------------------------------------------------------------------ you --
  const profile = v.profile;
  const learning = v.learning;
  const aboutView = demo ? D.about : profile?.view || null;
  const you = {
    name: ctx.userName || 'You',
    demo,
    readOnly: offline,
    connected: demo || !!profile,
    numbers: demo ? DEMO_NUMBERS : profile?.numbers || null,
    setNumbers: demo ? () => app.toastMsg('Demo: the Intake runs once the Mac is connected') : profile?.setNumbers,
    about: aboutView ? {
      focus: aboutView.focus || '',
      priorities: aboutView.priorities || [],
      bestSelf: aboutView.bestSelf || '',
      notes: aboutView.notes || '',
    } : null,
    aboutSet: demo ? true : !!profile?.set,
    editing: !demo && !!profile?.editing,
    saving: !demo && !!profile?.saving,
    draft: profile?.draft || null,
    startEdit: demo ? () => app.toastMsg('Demo: About you is edited once the Mac is connected') : profile?.startEdit,
    cancelEdit: profile?.cancelEdit,
    setField: profile?.setField,
    save: profile?.save,
    ladder: demo ? DEMO_LADDER : (learning?.enoughData ? (learning.lanes || []) : []),
    noticed: demo ? [] : (learning?.enoughData && !(learning.lanes || []).length ? learning.noticed || [] : []),
    ladderLoaded: demo || !!learning?.loaded,
  };

  // ------------------------------------------------------------ calendars --
  const cs = v.calendarSettings;
  const calList = demo ? D.calendars : cs?.calendars || [];
  const calHeld = demo ? held(true) : held(!!cs?.loaded, !!cs?.error);
  const cals = {
    ...calHeld,
    demo,
    connected: demo || !!cs,
    error: !demo && !!cs?.error,
    empty: !calHeld.loading && !(demo || cs?.error) && !!cs?.loaded && calList.length === 0,
    list: calHeld.loading ? [] : calList.map((c) => ({
      name: c.name, url: c.url, on: !c.hidden,
      toggle: demo
        ? () => setDemo((d) => ({ ...d, calendars: d.calendars.map((x) => (x.url === c.url ? { ...x, hidden: !x.hidden } : x)) }))
        : (cs.calendars.find((x) => x.url === c.url)?.toggle),
    })),
    refresh: demo ? () => app.toastMsg('Demo: these calendars are invented') : cs?.load,
  };
  const shown = calList.filter((c) => !c.hidden).length;

  // --------------------------------------------------------------- models --
  const ms = v.modelSettings;
  const board = demo ? demoBoard(D) : ms;
  const boardHeld = demo ? held(true) : held(!!ms?.loaded, !!ms?.error);
  const models = {
    ...boardHeld,
    demo,
    connected: demo || !!ms,
    error: !demo && !!ms?.error,
    retry: ms?.load,
    total: boardHeld.loading ? null : (board?.spendTotal || null),
    laneCount: board?.laneCount || 0,
    offCount: board?.offCount || 0,
    watchLine: board?.watchLine || null,
    outdated: demo ? [] : ms?.outdatedLaneLabels || [],
    anyChanged: !!board && (board.customisedCount + board.offCount) > 0,
    resetAll: demo
      ? () => { const prev = { laneOff: D.laneOff, laneModel: D.laneModel }; setDemo((d) => ({ ...d, laneOff: {}, laneModel: {} })); return () => setDemo((d) => ({ ...d, ...prev })); }
      : ms ? () => { const prev = ms.snapshot; ms.resetAll(); return () => ms.restore(prev); } : null,
    busyAll: !demo && !!ms?.busyAll,
    groups: boardHeld.loading ? [] : (board?.groups || []).map((g) => ({
      id: g.id, label: g.label, hint: g.hint, count: g.count, offCount: g.offCount,
      usd: g.usd || null, share: g.share || 0,
      lanes: (g.lanes || []).map((l) => ({
        id: l.id, label: l.label, deterministic: !!l.deterministic, enabled: !!l.enabled,
        busy: !!l.busy, offEffect: l.offEffect || 'Off.',
        model: l.model, defaultModel: l.defaultModel,
        options: (board.models || []).map((m) => ({ value: m.value, label: m.value === l.defaultModel ? `${m.label} · default` : m.label })),
        modelLabel: (() => {
          const m = (board.models || []).find((x) => x.value === l.model);
          const name = m?.label || l.model || '';
          return l.model === l.defaultModel ? `${name} · default` : name;
        })(),
        toggle: demo ? () => setDemo((d) => ({ ...d, laneOff: { ...d.laneOff, [l.id]: !d.laneOff[l.id] } })) : l.toggle,
        pick: demo
          ? (val) => setDemo((d) => { const lm = { ...d.laneModel }; if (val === l.defaultModel) delete lm[l.id]; else lm[l.id] = val; return { ...d, laneModel: lm }; })
          : (val) => l.setModel({ target: { value: val } }),
        reset: demo ? null : l.reset,
        spend: demo ? null : l.spend || null,
      })),
    })),
  };

  // ------------------------------------------------------------ snapshots --
  const tm = v.timeMachine;
  const snapHeld = demo ? held(true) : held(!!tm?.loaded);
  const snap = {
    ...snapHeld,
    demo,
    connected: demo || !!tm,
    loaded: demo || !!tm?.loaded,
    load: tm?.load,
    files: snapHeld.loading ? [] : demo
      ? D.files.map((f, i) => ({ key: `demo-${i}`, file: f.file, exists: true, stamp: f.stamp, rel: `demo:${i}` }))
      : (tm?.files || []).flatMap((f) => (f.backups || []).map((b, i) => ({
        key: b.backupRel, file: f.file, exists: f.exists, stamp: snapClock(b.stamp), rel: b.backupRel, older: i > 0,
      }))),
    restore: demo
      ? (rel) => { const f = D.files[Number(String(rel).split(':')[1])]; app.toastMsg(`Demo: the ${f?.stamp} copy of ${String(f?.file || '').split('/').pop()} would be restored, and the current one kept`); }
      : (rel) => tm?.restore(rel),
  };

  // -------------------------------------------------------------- the mac --
  const status = st.connectionStatus;
  const mac = {
    demo,
    status: demo ? 'Demo data' : offline ? `Offline since ${staleAt || 'the last sync'}` : status === 'connecting' ? 'Connecting' : 'Connected',
    ok: !demo && !offline && status === 'connected',
    url: v.settingsBaseUrl || '',
    setUrl: v.setSettingsBaseUrl,
    token: v.settingsToken || '',
    setToken: v.setSettingsToken,
    test: v.testSettingsConnection,
    testStatus: v.settingsTestStatus,
    testMessage: v.settingsTestMessage,
    save: v.saveSettingsConnection,
    disconnect: v.disconnectSettings,
    connected: !!v.connectionActive || (!demo && !!getConnection()),
  };

  // -------------------------------------------------------------- browser --
  const bs = demo ? D.browser : st.liveBrowserStatus;
  const browserHeld = demo ? held(true) : held(!!bs);
  const browserValue = !bs ? '' : bs.chrome === false ? 'No Chrome on the Mac' : bs.profileExists ? 'Profile set up' : 'Not set up yet';
  const browser = {
    ...browserHeld,
    value: mv(browserValue, browserHeld),
    signIn: demo ? () => app.toastMsg('Demo: a sign-in window opens on your Mac once it is connected') : v.browserSignIn?.open,
    busy: !!v.browserSignIn?.busy,
  };

  // -------------------------------------------------------------- tab bar --
  const slots = dockSlots({ style, isMobile: !!st.isMobile });
  const items = v.tabOrderItems || [];
  const tabs = {
    items,
    slots: slots || 4,
    copy: tabsCopy(slots),
    setOrder: v.setTabOrder,
    value: slots ? items.slice(0, slots).map((t) => t.label).join(', ') : 'Sorts the sidebar',
  };

  // ---------------------------------------------------------------- train --
  const rt = v.restTimerSetting;
  const train = rt ? {
    on: !!rt.on,
    seconds: rt.seconds,
    label: REST_LABEL[rt.seconds] || rt.label,
    toggle: rt.toggle,
    options: REST_CHOICES.map((s) => ({ value: String(s), label: REST_LABEL[s] || `${s} s` })),
    pick: (s) => (rt.choices.find((c) => String(c.value) === String(s)) || {}).pick?.(),
    sub: rt.on ? 'After each tick, the ring counts down on the tick’s own spot. Tap it to skip.' : 'Off. The tick stays put after every set.',
  } : null;

  // ----------------------------------------------------------------- rows --
  const macTile = demo || offline ? 'grey' : 'good';
  const macText = mac.status;
  const rows = {
    voice: { value: speakOn ? 'Speaks aloud' : 'Text only' },
    notif: { value: mv(notifValue(push, quietPrefs), quietHeld) },
    app: { value: app_.name },
    tabs: { value: tabs.value },
    train: train ? { value: train.on ? `Rest timer · ${train.label}` : 'Rest timer off' } : null,
    mac: { value: { text: macText, loading: false, stale: false }, ok: mac.ok, tile: macTile },
    cals: { value: mv(cals.connected && calList.length ? `${shown} of ${calList.length} shown` : '', calHeld) },
    browser: { value: browser.value },
    models: { value: mv(board ? `${board.laneCount} lanes · ${board.offCount} off` : '', boardHeld) },
    snap: { value: 'Before every write' },
    check: { value: '5 tests' },
  };

  const names = { you: you.name };
  for (const g of models.groups) names[`mg:${g.id}`] = g.label;
  const numeral = (v.tabs || []).find((t) => t.screen === 'settings')?.num || null;

  return {
    settingsPage: {
      path,
      top,
      lit: st.settingsLit || null,
      go,
      back: () => app.closeSettingsPage(),
      title: (id) => pageTitle(id, names),
      ensure: () => app.ensureSettingsData(),
      state: seamLoading ? 'loading' : offline ? 'offline' : 'live',
      offline,
      staleAt,
      banner: offline ? `The Mac is offline. What comes from it shows as it was ${staleAt ? `at ${staleAt}` : 'when it was last read'}, and waits until it is back.` : '',
      // under Command Core the page keeps its numeral, read from the same
      // list the sidebar numbers itself from (finding 4: it said XIV, the
      // sidebar XV)
      numeral: style === 'command' ? numeral : null,
      demo,
      spoken: { count: SPOKEN.count, phrases: SPOKEN.phrases, build: v.novaBuild },
      openVoice: v.openPalette,
      isMobile: !!st.isMobile,
      summary: style === 'summary',
      coreStyle: st.coreStyle,
      statusBanner: !!v.statusBanner,
      you, rows, voice, notif, app: app_, check, cals, models, snap, mac, browser, tabs, train,
      wake: voice.wake,
      calm: app_.calm,
    },
  };
}

// the snapshot's stamp (an ISO time, server/lib/guardian.js), on his clock
function snapClock(stamp) {
  const d = new Date(String(stamp || ''));
  return Number.isNaN(d.getTime()) ? String(stamp || '') : clockOf(d);
}
