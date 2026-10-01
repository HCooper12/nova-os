// WHAT IS THIS LINK? (1 Oct 2026, his "every door" ask.)
//
// "Adding links and telling it to add it to my recipe vault, asking it to
// research and capture something, ask it to analyse the video…" — a pasted or
// spoken link has to be recognised the same way whichever door it came in by.
// Before this file the answer lived in three copies: the server's lane router,
// the client's hand-written mirror of it (which never learned the recipe lane,
// so "add this to my recipes" on a reel went to the Watcher from the chat), and
// the Watcher's own host list. One pure module now, shared by the server
// (intentRouter, the verbs, the capture path) and the client (the composer's
// lane chip), so the two can no longer disagree.
//
// Deterministic by design (NOVA-METHOD: code decides what can be decided).
// What a link IS comes from its address; what he WANTS done with it comes from
// his words. This file answers the first question, and says which words ask
// for a recipe; the router and the verbs answer the second.
//
// Kinds:
//   channel      a body of work (a YouTube @handle, a TikTok/Instagram profile)
//   recipe-reel  one video, and his words ask for it to become a recipe
//   video        one video (the Watcher's triage, or the deep weave if asked)
//   recipe-page  a web page that is a recipe (a recipe site, a /recipe/ path),
//                or any page his words ask to be saved as a recipe
//   article      anything else worth reading or keeping
//
// Pure: no imports, no I/O. The page itself is only ever fetched by the lane
// that imports it (server/lib/recipeFromPage.js).

export const URL_RE = /https?:\/\/[^\s<>"']+/gi;

export const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com|twitch\.tv|x\.com|twitter\.com)$/i;
// a channel/profile URL is a BODY OF WORK, not one video — that's a study
export const CHANNEL_RE = /youtube\.com\/(@|c\/|channel\/|user\/)|instagram\.com\/[^/]+\/?$|tiktok\.com\/@[^/]+\/?$/i;
// vt.tiktok.com/<code> and tiktok.com/t/<code> are what the TikTok share
// sheet hands over (29 Sep): a single video behind a short link
export const VIDEO_PATH_RE = /watch\?v=|youtu\.be\/|\/reel\/|\/shorts\/|\/video\/|vimeo\.com\/\d+|\/p\/|\/status\/|vt\.tiktok\.com\/|tiktok\.com\/t\//i;

// A link plus words asking for it to become a RECIPE (29 Sep). About SAVING
// it ("add", "save", "turn into") or naming the recipe bank, so "is this
// recipe any good?" still goes to the Watcher for a verdict.
export const RECIPE_WORDS_RE = /\b(?:add|save|put|file|keep|turn|make|log|import|store)\b[^.?!]{0,40}\b(?:recipes?|recipe bank|recipe collection|fuel|meal prep)\b|\b(?:recipes?|meal prep) (?:from|in|off) (?:this|these|the (?:reel|video|post|caption))\b|\binto (?:a |my )?recipes?\b/i;

// Sites whose pages ARE recipes (and publish schema.org Recipe data). A page
// elsewhere counts when its path says so, or when his words ask for a recipe.
export const RECIPE_HOSTS = [
  'recipetineats.com', 'taste.com.au', 'delicious.com.au', 'womensweeklyfood.com.au', 'bestrecipes.com.au',
  'bbcgoodfood.com', 'allrecipes.com', 'seriouseats.com', 'bonappetit.com', 'epicurious.com',
  'food.com', 'foodnetwork.com', 'cooking.nytimes.com', 'budgetbytes.com', 'simplyrecipes.com',
  'jamieoliver.com', 'sallysbakingaddiction.com', 'minimalistbaker.com', 'cookieandkate.com',
  'halfbakedharvest.com', 'thekitchn.com', 'skinnytaste.com', 'pinchofyum.com', 'loveandlemons.com',
  'nigella.com', 'marionskitchen.com', 'myfoodbook.com.au', 'kitchenstories.com',
];
const RECIPE_PATH_RE = /\/recipes?\/|\/recipe[-_]|[-_]recipe\/?(?:[?#]|$)/i;

export function urlsIn(text) {
  return String(text || '').match(URL_RE) || [];
}

export function hostOf(u) {
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

export function isRecipeHost(host) {
  const h = String(host || '').toLowerCase();
  return RECIPE_HOSTS.some((r) => h === r || h.endsWith(`.${r}`));
}

/** A web page (not a video) that is a recipe by its address alone. */
export function isRecipePage(url) {
  const host = hostOf(url);
  if (!host || VIDEO_HOSTS.test(host)) return false;
  return isRecipeHost(host) || RECIPE_PATH_RE.test(String(url));
}

/**
 * What this link is, and why — { kind, url, host, why }. `words` are the rest
 * of what he said (the link removed); they only matter for the recipe
 * question, because a reel or a blog post is a recipe only when he says so.
 */
export function classifyLink(url, words = '') {
  const u = String(url || '').trim().replace(/[.,;:!?)\]]+$/, '');
  const host = hostOf(u);
  if (!/^https?:\/\//i.test(u) || !host) return { kind: null, url: u, host: '', why: 'that is not a link' };
  const media = VIDEO_HOSTS.test(host);
  const videoPath = VIDEO_PATH_RE.test(u);
  const recipeAsk = RECIPE_WORDS_RE.test(String(words || ''));
  if (media && CHANNEL_RE.test(u) && !videoPath) return { kind: 'channel', url: u, host, why: 'a channel or profile — a body of work, not one video' };
  if (media && videoPath) {
    return recipeAsk
      ? { kind: 'recipe-reel', url: u, host, why: 'a video you asked to keep as a recipe — the caption (and the transcript if needed) is read into your recipe bank' }
      : { kind: 'video', url: u, host, why: 'one video' };
  }
  if (!media && (recipeAsk || isRecipePage(u))) {
    return { kind: 'recipe-page', url: u, host, why: recipeAsk ? 'a page you asked to keep as a recipe' : `a recipe page (${host})` };
  }
  return { kind: 'article', url: u, host, why: 'a page to read or keep' };
}
