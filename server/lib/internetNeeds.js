// WHAT STILL NEEDS THE INTERNET — read from the code, not from memory.
// (2 Nov 2026, the Wi-Fi-off drill: design/LOCAL-NOVA-PLAN.md §1b.)
//
// The outbound watcher (lib/outbound.js) proves what ONE turn touched. This is
// the other half: the honest list of every feature that would stop, or fall
// back, with the internet gone, each with what it is doing RIGHT NOW on this
// Mac. "Ask Nova: on this Mac (Claude only when it cannot answer)" is read from
// the model board; "Ears: Groq (internet)" from the transcription key store;
// "Voice: Kokoro on this Mac" from the TTS engine choice. Nothing here is a
// constant dressed as a status: an entry's state comes from the same function
// the feature itself calls.
//
// Shape: { feature, needs: 'internet' | 'claude' | 'none', why, state,
//          configured, off? }. `needs` is what the feature needs AS IT IS SET
// UP NOW: a lane on this Mac reads 'none'; the same lane pinned to Claude
// reads 'claude'. A module can add its own entry with registerNeed().

const registry = new Map();   // feature → { feature, needs, why, state?: () => string|Promise<string> }

/** A module declares what it needs. `state` may be a function read per call. */
export function registerNeed(entry) {
  if (!entry?.feature) throw new Error('registerNeed: feature is required');
  if (!['internet', 'claude', 'none'].includes(entry.needs)) throw new Error('registerNeed: needs must be internet, claude or none');
  registry.set(entry.feature, { ...entry });
}

export function _clearRegisteredNeeds() { registry.clear(); }

// Lanes whose work reaches the web as well as the model: a Claude CLI with
// web tools, yt-dlp, or a page fetch by code. From the lanes' own modules
// (watcher.js, researcher / leader research, studyLane.js, scout.js,
// recipeFromVideo.js, eatOutSources.js, exerciseResearch.js).
const WEB_LANES = {
  researcher: 'searches and reads the web',
  'leader-research': 'searches and reads the web',
  'project-research': 'searches and reads the web',
  'exercise-research': 'reads exercise sources on the web',
  paper: 'reads the paper from its site',
  'study-lane': 'reads the paper from its site',
  browse: 'drives a browser on the web',
  scout: 'reads the web for leads',
  'watcher-chunk': 'downloads the video with yt-dlp',
  'watcher-verdict': 'downloads the video with yt-dlp',
  'watcher-design': 'downloads the video with yt-dlp',
  'recipe-video': 'downloads the video with yt-dlp',
  'eat-out-menu': 'reads the chain\'s menu from its site',
};

/** One entry per model lane, from the board's own answers. Pure. */
export function laneNeeds(lanes) {
  return (lanes || []).map((l) => {
    const web = WEB_LANES[l.id];
    if (l.provider === 'local') {
      return {
        feature: l.label,
        lane: l.id,
        needs: web ? 'internet' : 'none',
        why: web ? `runs on this Mac but ${web}` : 'pure text on the model on this Mac',
        state: l.enabled === false ? 'switched off' : 'on this Mac (Claude only when it cannot answer)',
        configured: true,
        ...(l.enabled === false ? { off: true } : {}),
      };
    }
    return {
      feature: l.label,
      lane: l.id,
      needs: 'claude',
      why: web ? `Claude, and it ${web}` : (l.canRunLocal ? 'pinned to Claude (it could run on this Mac)' : 'Claude only: this lane has not been moved to the Mac'),
      state: l.enabled === false ? 'switched off' : 'Claude (internet)',
      configured: true,
      ...(l.enabled === false ? { off: true } : {}),
    };
  });
}

/** The non-lane features, from facts read off the code's own switches. Pure.
 *  facts: { ears: 'groq'|'openai'|<other>|null, voice: 'elevenlabs'|'local'|null,
 *  braveKey, webBrowser, notion, todoist, telegram, pushSubs, icloud } */
export function serviceNeeds(f = {}) {
  const out = [];
  // EARS (lib/transcribe.js pickBackend)
  if (f.ears === 'groq' || f.ears === 'openai') {
    out.push({ feature: 'Ears (speech to text)', needs: 'internet', why: `lib/transcribe.js sends his recording to ${f.ears === 'groq' ? 'Groq' : 'OpenAI'} Whisper`, state: `${f.ears === 'groq' ? 'Groq' : 'OpenAI'} (internet)`, configured: true });
  } else if (f.ears) {
    out.push({ feature: 'Ears (speech to text)', needs: 'none', why: 'transcribed on this Mac', state: `${f.ears} on this Mac`, configured: true });
  } else {
    out.push({ feature: 'Ears (speech to text)', needs: 'none', why: 'no transcription key in ~/.config/watch/.env, so the Mac does not transcribe', state: 'not configured on the Mac', configured: false });
  }
  // VOICE (lib/tts.js ttsEngine)
  if (f.voice === 'elevenlabs') out.push({ feature: 'Voice (text to speech)', needs: 'internet', why: 'ELEVENLABS_API_KEY is set, so lib/tts.js uses ElevenLabs', state: 'ElevenLabs (internet)', configured: true });
  else if (f.voice === 'local') out.push({ feature: 'Voice (text to speech)', needs: 'none', why: 'NOVA_TTS_LOCAL=1 and no ElevenLabs key: the Kokoro sidecar', state: 'Kokoro on this Mac', configured: true });
  else out.push({ feature: 'Voice (text to speech)', needs: 'none', why: 'no engine on the Mac: the phone uses its own browser voice', state: 'not configured on the Mac', configured: false });
  // WEB LOOKUPS (lib/localResearch.js webCanRun)
  if (f.braveKey) out.push({ feature: 'Web lookups', needs: 'internet', why: 'Brave Search API (only the search words leave), then the pages themselves', state: 'Brave Search (internet)', configured: true });
  else if (f.webBrowser) out.push({ feature: 'Web lookups', needs: 'internet', why: 'headless Chrome searches Bing and reads the pages', state: 'Chrome to Bing (internet)', configured: true });
  else out.push({ feature: 'Web lookups', needs: 'internet', why: 'no Brave key and no Chrome profile: Ask Nova does not offer the web', state: 'not available', configured: false });
  // INTEGRATIONS: each only when its key is set
  out.push({ feature: 'Telegram bridge', needs: 'internet', why: 'lib/telegram.js polls api.telegram.org', state: f.telegram ? 'on (internet)' : 'not configured', configured: !!f.telegram });
  out.push({ feature: 'Todoist sync', needs: 'internet', why: 'lib/todoistSync.js talks to api.todoist.com', state: f.todoist ? 'on (internet)' : 'not configured', configured: !!f.todoist });
  out.push({ feature: 'Notion journal and wishlist', needs: 'internet', why: 'lib/notionJournal.js and lib/wishlist.js talk to api.notion.com', state: f.notion ? 'on (internet)' : 'not configured', configured: !!f.notion });
  out.push({ feature: 'Lock-screen notifications', needs: 'internet', why: 'lib/push.js sends web push through Apple\'s push service', state: f.pushSubs > 0 ? `${f.pushSubs} device${f.pushSubs === 1 ? '' : 's'} subscribed (internet)` : 'no device subscribed', configured: f.pushSubs > 0 });
  out.push({ feature: 'Calendar (iCloud)', needs: 'internet', why: 'lib/calendar.js reads and writes caldav.icloud.com', state: f.icloud ? 'on (internet)' : 'not configured', configured: !!f.icloud });
  // ALWAYS THE WEB when used: no key, no switch
  out.push({ feature: 'Video watching and reel imports', needs: 'internet', why: 'yt-dlp downloads from YouTube and Instagram (lib/watcher.js, lib/recipeFromVideo.js)', state: 'internet when used', configured: true });
  out.push({ feature: 'Food lookups', needs: 'internet', why: 'barcodes and nutrition from Open Food Facts and USDA (lib/barcodeLookup.js, lib/nutritionFacts.js)', state: 'internet when used', configured: true });
  out.push({ feature: 'Shopping prices and Pick it up', needs: 'internet', why: 'the chains\' own sites (lib/shopPrices.js, lib/eatOutSources.js)', state: 'internet when used', configured: true });
  out.push({ feature: 'Book covers', needs: 'internet', why: 'Open Library and iTunes (lib/bookCovers.js)', state: 'internet when used', configured: true });
  return out;
}

// ------------------------------ the facts -----------------------------------

async function quiet(fn, fallback) {
  try { return await fn(); } catch { return fallback; }
}

/** Read the facts the pure builders take, each from the module that owns it.
 *  A module that cannot be read leaves its fact unknown (null), never true. */
export async function gatherFacts() {
  const prefs = await import('./modelPrefs.js');
  const lanes = prefs.LANES.map((l) => ({
    id: l.id,
    label: l.label,
    provider: (() => { try { return prefs.providerFor(l.id); } catch { return 'claude'; } })(),
    enabled: (() => { try { return prefs.laneEnabled(l.id); } catch { return true; } })(),
    canRunLocal: !!l.local,
  }));
  const ears = await quiet(async () => (await (await import('./transcribe.js')).loadWhisperBackend())?.backend || null, null);
  const voice = await quiet(async () => (await import('./tts.js')).ttsEngine(), null);
  const web = await quiet(async () => {
    const r = await import('./localResearch.js');
    return { braveKey: !!String(process.env.BRAVE_SEARCH_KEY || '').trim(), webBrowser: r.webCanRun() };
  }, { braveKey: !!String(process.env.BRAVE_SEARCH_KEY || '').trim(), webBrowser: false });
  const notion = await quiet(async () => !!(await (await import('./notionAuth.js')).getNotionToken()), false);
  const pushSubs = await quiet(async () => Number(await (await import('./push.js')).subscriptionCount()) || 0, 0);
  return {
    lanes,
    ears,
    voice,
    braveKey: web.braveKey,
    webBrowser: web.braveKey ? true : web.webBrowser,
    notion,
    todoist: !!String(process.env.TODOIST_TOKEN || '').trim(),
    telegram: !!String(process.env.TELEGRAM_BOT_TOKEN || '').trim(),
    pushSubs,
    icloud: !!String(process.env.ICLOUD_USERNAME || '').trim(),
  };
}

/** THE HONEST LIST: every feature with its current state. `facts` may be
 *  passed (tests); otherwise read live. */
export async function internetNeeds(facts = null) {
  const f = facts || await gatherFacts();
  const list = [...serviceNeeds(f), ...laneNeeds(f.lanes)];
  for (const r of registry.values()) {
    const state = typeof r.state === 'function' ? await quiet(r.state, 'unknown') : (r.state || '');
    const entry = { feature: r.feature, needs: r.needs, why: r.why || '', state, configured: r.configured !== false };
    const i = list.findIndex((e) => e.feature === r.feature);
    if (i >= 0) list[i] = entry; else list.push(entry);
  }
  return list;
}

/** The plain summary the drill prints: which features need the internet or
 *  Claude now, switched-off and unconfigured ones left out. Pure. */
export function stillNeedsInternet(list) {
  return (list || []).filter((e) => e.needs !== 'none' && !e.off && e.configured !== false);
}
