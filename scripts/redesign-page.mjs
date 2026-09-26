#!/usr/bin/env node
// Render design/REDESIGN-CHECKLIST.md as one HTML page he can open on his
// phone while the redesign runs. The markdown is the source of truth: this
// only reads it. Re-run after every tick and republish to the same artifact.
//
//   node scripts/redesign-page.mjs --now mission --out /path/to/page.html
//
// It reads §5 (tiers → pages → rows), §6 (the order table) and §7 (the
// newest ledger line) and nothing else. A row's state is its box:
//   [ ] untouched · [a] audited · [m] mockups in review · [b] built · [x] verified on his phone
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const NOW = opt('--now', '');
const OUT = opt('--out', 'redesign-checklist.html');
const SRC = path.resolve(process.cwd(), 'design/REDESIGN-CHECKLIST.md');
const md = fs.readFileSync(SRC, 'utf8');

const STATES = {
  ' ': { key: 'todo', label: 'untouched' },
  a: { key: 'audited', label: 'audited' },
  m: { key: 'mockups', label: 'mockups in review' },
  b: { key: 'built', label: 'built' },
  x: { key: 'verified', label: 'verified on your phone' },
};

// ---- §5: tiers → pages → rows -------------------------------------------
const s5 = md.split(/^## 5 · The pages/m)[1].split(/^## 6 /m)[0];
const tiers = [];
let tier = null, page = null, group = null;
for (const raw of s5.split('\n')) {
  const line = raw.trimEnd();
  let m;
  if ((m = line.match(/^### TIER (\d) · (.+)$/))) { tier = { n: +m[1], name: m[2].trim(), pages: [] }; tiers.push(tier); page = null; group = null; continue; }
  if ((m = line.match(/^#### (.+)$/))) {
    const head = m[1];
    const key = (head.match(/`([a-z]+)`/) || [])[1] || head.split(' ')[0].toLowerCase();
    const name = head.split(' — ')[0].replace(/\s*\(.*?\)\s*$/, '').trim();
    const note = (head.match(/\(([^)]*)\)/) || [])[1] || '';
    page = { key, name, note, rows: [], intro: '' };
    tier.pages.push(page); group = null; continue;
  }
  if (!tier) continue;
  if (tier.n === 0 && !page) { // the chrome has numbered groups, not pages
    if ((m = line.match(/^\*\*0\.(\d) · (.+?)\*\*/))) { page = { key: `chrome-${m[1]}`, name: m[2].replace(/ — .*$/, ''), note: 'chrome', rows: [], intro: '' }; tier.pages.push(page); continue; }
  }
  if (tier.n === 0 && page && (m = line.match(/^\*\*0\.(\d) · (.+?)\*\*/))) { page = { key: `chrome-${m[1]}`, name: m[2].replace(/ — .*$/, ''), note: 'chrome', rows: [], intro: '' }; tier.pages.push(page); continue; }
  if (!page) continue;
  if ((m = line.match(/^\*\*([^*]+)\*\*\s*(\(|$)/)) && !/^\*\*(States|Motion|Prior|First look|Overlays|How it is built|Idioms|UI-REDESIGN|Record kinds|The moments|The sections)/.test(line) === false) { /* fallthrough */ }
  if ((m = line.match(/^\*\*([^*:]+)\*\*(?:\s*\(([^)]*)\))?\s*$/))) { group = m[1].trim(); continue; }
  if ((m = line.match(/^- \[([ ambx])\] (.+)$/))) {
    const state = STATES[m[1]];
    let body = m[2];
    // the trailing locator group(s): everything from the last " — `" on
    const locs = [...body.matchAll(/`[^`]+`/g)].map((x) => x[0].slice(1, -1));
    const cut = body.lastIndexOf(' — `');
    const text = cut > 0 ? body.slice(0, cut) : body.replace(/`[^`]+`/g, '').trim();
    const [id, ...rest] = text.split(' · ');
    const nameAndDesc = rest.join(' · ');
    const [name, ...desc] = nameAndDesc.split(' — ');
    const verified = /\[Verified[^\]]*\]/.test(body);
    page.rows.push({ id: id.trim(), name: name.trim().replace(/\*\*/g, ''), desc: desc.join(' — ').replace(/\*\*/g, '').replace(/\[Verified[^\]]*\]/g, '').trim(), locs: locs.filter((l) => /[:/]/.test(l)), state, group, verified });
    continue;
  }
}

// ---- §6: the order table ------------------------------------------------
const s6 = md.split(/^## 6 · Proposed order/m)[1].split(/^## 7 /m)[0];
const order = [];
for (const line of s6.split('\n')) {
  const m = line.match(/^\| ([\d–-]+) \| \*\*(.+?)\*\*(.*?) \| (.+) \|$/);
  if (m) order.push({ n: m[1], names: m[2].split(/ · | \+ /).map((s) => s.trim()), tail: m[3].replace(/^\s*\((.*)\)\s*$/, '$1').trim(), why: m[4].trim() });
}
const allPages = tiers.flatMap((t) => t.pages);
const byName = (n) => allPages.find((p) => p.name.toLowerCase() === n.toLowerCase() || p.name.toLowerCase().startsWith(n.toLowerCase()));

// ---- §7: newest ledger line -----------------------------------------------
const s7 = md.split(/^## 7 · Ledger/m)[1] || '';
const ledger = (s7.match(/^- (.+(?:\n  .+)*)/m) || [, ''])[1].replace(/\n\s+/g, ' ');
let commit = '';
try { commit = execSync('git log -1 --format=%h -- design/REDESIGN-CHECKLIST.md', { encoding: 'utf8' }).trim(); } catch { /* no git */ }

// ---- counts -------------------------------------------------------------
const rowsAll = allPages.flatMap((p) => p.rows);
const count = (rows) => Object.fromEntries(Object.values(STATES).map((s) => [s.key, rows.filter((r) => r.state.key === s.key).length]));
const total = rowsAll.length;
const done = rowsAll.filter((r) => r.state.key === 'verified').length;

// ---- render ---------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pips = (rows) => `<span class="pips" aria-hidden="true">${rows.map((r) => `<i class="p ${r.state.key}"></i>`).join('')}</span>`;
const orderOf = (p) => { for (const o of order) for (const n of o.names) if (byName(n) === p) return o.n; return ''; };

const pageHtml = (p, t) => {
  const c = count(p.rows);
  const isNow = p.key === NOW;
  const groups = [...new Set(p.rows.map((r) => r.group))];
  const stateSummary = p.rows.length ? (c.verified === p.rows.length ? 'verified' : c.built ? 'building' : c.mockups ? 'mockups' : c.audited ? 'audited' : 'untouched') : '';
  return `<details class="page${isNow ? ' now' : ''}" id="${esc(p.key)}"${isNow ? ' open' : ''}>
  <summary>
    <span class="ord">${esc(orderOf(p))}</span>
    <span class="pname">${esc(p.name)}${isNow ? ' <em class="nowtag">now</em>' : ''}</span>
    <span class="pmeta">${p.rows.length} ${p.rows.length === 1 ? 'feature' : 'features'}${stateSummary && stateSummary !== 'untouched' ? ` · ${stateSummary}` : ''}</span>
    ${pips(p.rows)}
  </summary>
  <div class="rows">
  ${groups.map((g) => `${g ? `<h4 class="grp">${esc(g)}</h4>` : ''}
    <ol class="features">${p.rows.filter((r) => r.group === g).map((r) => `
      <li class="row ${r.state.key}">
        <span class="box" title="${esc(r.state.label)}"><span class="mark"></span></span>
        <span class="rid">${esc(r.id)}</span>
        <span class="rtext"><b>${esc(r.name)}</b>${r.desc ? ` <span class="rdesc">${esc(r.desc)}</span>` : ''}${r.verified ? ' <span class="vtag">verified in source</span>' : ''}${r.locs.length ? `<span class="loc">${r.locs.map(esc).join(' · ')}</span>` : ''}</span>
      </li>`).join('')}
    </ol>`).join('')}
  </div>
</details>`;
};

const tierHtml = (t) => `<section class="tier" id="tier-${t.n}">
  <h2><span class="tn">Tier ${t.n}</span> ${esc(t.name.replace(/\s*\(.*\)$/, ''))}</h2>
  ${t.pages.filter((p) => p.rows.length).map((p) => pageHtml(p, t)).join('\n')}
</section>`;

const legend = Object.values(STATES).map((s) => `<span class="lg ${s.key}"><i class="p ${s.key}"></i>${esc(s.label)}</span>`).join('');

const html = `<title>Nova Redesign Ledger</title>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{color-scheme:dark;--bg:#0a0f1c;--surface:#111827;--surface2:#171f33;--edge:rgba(236,229,218,.09);--ink:#ece5da;--ink2:rgba(236,229,218,.66);--ink3:rgba(236,229,218,.42);--todo:rgba(236,229,218,.16);--audited:#6be5f5;--mockups:#d8b573;--built:#8a6ad1;--verified:#5aa87c;--now:#6be5f5;--serif:"Instrument Serif",Georgia,"Times New Roman",serif;--mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;--ui:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){color-scheme:light;--bg:#f3efe7;--surface:#fbf9f4;--surface2:#f1ece2;--edge:rgba(20,26,43,.10);--ink:#141a2b;--ink2:rgba(20,26,43,.68);--ink3:rgba(20,26,43,.46);--todo:rgba(20,26,43,.14);--audited:#0f8fa5;--mockups:#9a7422;--built:#6a4fb3;--verified:#2f7a52;--now:#0f8fa5}}
:root[data-theme="light"]{color-scheme:light;--bg:#f3efe7;--surface:#fbf9f4;--surface2:#f1ece2;--edge:rgba(20,26,43,.10);--ink:#141a2b;--ink2:rgba(20,26,43,.68);--ink3:rgba(20,26,43,.46);--todo:rgba(20,26,43,.14);--audited:#0f8fa5;--mockups:#9a7422;--built:#6a4fb3;--verified:#2f7a52;--now:#0f8fa5}
html,body{background:var(--bg)}
body{margin:0;color:var(--ink);font:15px/1.5 var(--ui);-webkit-font-smoothing:antialiased}
.wrap{max-width:720px;margin:0 auto;padding-block:20px 56px;padding-inline:16px}
header h1{font:400 40px/1.05 var(--serif);margin:6px 0 4px;letter-spacing:-.01em;text-wrap:balance}
header h1 i{font-style:italic;color:var(--ink2)}
.brief{color:var(--ink2);margin:0 0 18px;max-width:60ch}
.progress{display:flex;flex-direction:column;gap:8px;margin:0 0 6px}
.bar{display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--todo);gap:1px}
.bar i{display:block;height:100%}
.bar .verified{background:var(--verified)}.bar .built{background:var(--built)}.bar .mockups{background:var(--mockups)}.bar .audited{background:var(--audited)}
.nums{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.nums b{font:400 30px/1 var(--serif);font-variant-numeric:tabular-nums}
.nums b small{font-size:18px;color:var(--ink3)}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--ink2);margin:10px 0 26px}
.lg{display:inline-flex;align-items:center;gap:6px}
.p{display:inline-block;width:7px;height:7px;border-radius:2px;background:var(--todo)}
.p.audited{background:var(--audited)}.p.mockups{background:var(--mockups)}.p.built{background:var(--built)}.p.verified{background:var(--verified)}
.tier{margin:0 0 26px}
.tier h2{font:400 22px/1.2 var(--serif);margin:0 0 10px;display:flex;align-items:baseline;gap:10px}
.tier h2 .tn{font:500 11px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}
.page{background:var(--surface);border:1px solid var(--edge);border-radius:14px;margin:0 0 8px}
.page.now{border-color:color-mix(in srgb,var(--now) 55%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--now) 14%,transparent)}
summary{list-style:none;display:grid;grid-template-columns:28px 1fr auto;grid-template-areas:"o n m" "o p p";gap:2px 10px;align-items:center;padding:12px 14px;cursor:pointer;-webkit-tap-highlight-color:transparent}
summary::-webkit-details-marker{display:none}
summary:focus-visible{outline:2px solid var(--now);outline-offset:2px;border-radius:14px}
.ord{grid-area:o;font:400 22px/1 var(--serif);color:var(--ink3);font-variant-numeric:tabular-nums;text-align:center}
.pname{grid-area:n;font:400 20px/1.15 var(--serif)}
.nowtag{font:500 10px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--now);border:1px solid color-mix(in srgb,var(--now) 50%,transparent);border-radius:999px;padding:3px 7px;vertical-align:middle;margin-left:6px;font-style:normal}
.pmeta{grid-area:m;font-size:12px;color:var(--ink3);white-space:nowrap}
.pips{grid-area:p;display:flex;flex-wrap:wrap;gap:2px;margin-top:4px}
.rows{padding:0 14px 12px;border-top:1px solid var(--edge)}
.grp{font:500 11px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ink3);margin:14px 0 6px}
.features{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:2px}
.row{display:grid;grid-template-columns:22px 34px 1fr;gap:8px;align-items:start;padding:8px 0;border-top:1px solid var(--edge)}
.row:first-child{border-top:0}
.box{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:5px;border:1.5px solid var(--ink3);margin-top:2px}
.row.audited .box{border-color:var(--audited)}.row.mockups .box{border-color:var(--mockups)}.row.built .box{border-color:var(--built)}.row.verified .box{border-color:var(--verified);background:var(--verified)}
.mark{width:8px;height:8px;border-radius:2px}
.row.audited .mark{background:var(--audited)}.row.mockups .mark{background:var(--mockups)}.row.built .mark{background:var(--built)}.row.verified .mark{background:var(--bg)}
.rid{font:500 11px/1.6 var(--mono);color:var(--ink3);margin-top:3px}
.rtext{min-width:0}
.rtext b{font-weight:600}
.rdesc{color:var(--ink2)}
.vtag{display:inline-block;font:500 10px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--mockups);border:1px solid color-mix(in srgb,var(--mockups) 50%,transparent);border-radius:999px;padding:2px 6px;margin-left:6px;vertical-align:middle}
.loc{display:block;font:400 11px/1.5 var(--mono);color:var(--ink3);margin-top:3px;overflow-wrap:anywhere}
.order{margin:0 0 30px}
.order h2{font:400 22px/1.2 var(--serif);margin:0 0 8px}
.order ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}
.order li{display:grid;grid-template-columns:max-content 1fr;gap:8px;padding:6px 0;border-top:1px solid var(--edge)}
.order li:first-child{border-top:0}
.order .on{font:400 20px/1.1 var(--serif);color:var(--ink3);font-variant-numeric:tabular-nums}
.order .oname a{color:var(--ink);text-decoration:none;font:400 17px/1.2 var(--serif)}
.order .oname a:hover{text-decoration:underline}
.order .owhy{display:block;color:var(--ink2);font-size:13px;margin-top:2px}
.order .ohold{font:500 10px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--mockups);margin-left:6px}
footer{margin-top:28px;padding-top:14px;border-top:1px solid var(--edge);font-size:12px;color:var(--ink3);line-height:1.6}
footer code{font:400 11px var(--mono)}
@media (prefers-reduced-motion: no-preference){details[open] .rows{animation:rise .22s cubic-bezier(.32,.72,0,1)}@keyframes rise{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}}
@media (max-width:420px){header h1{font-size:34px}.pmeta{grid-area:m}.row{grid-template-columns:22px 30px 1fr}}
</style>
<div class="wrap">
<header>
  <h1>Nova, page by page <i>· the redesign ledger</i></h1>
  <p class="brief">Every page Nova has and every feature on it, one row each, ticked as it moves from audit to mock-ups to built to seen on your phone. Simplicity with all functionality, a beautiful aesthetic, and ease of use.</p>
  <div class="progress">
    <div class="nums"><b>${done}<small> / ${total} verified on your phone</small></b><span class="legend" style="margin:0">${legend}</span></div>
    <div class="bar" role="img" aria-label="${done} of ${total} features verified">${Object.values(STATES).filter((s) => s.key !== 'todo').map((s) => { const n = rowsAll.filter((r) => r.state.key === s.key).length; return n ? `<i class="${s.key}" style="width:${(100 * n / total).toFixed(2)}%"></i>` : ''; }).join('')}</div>
  </div>
</header>

<section class="order">
  <h2>The order</h2>
  <ol>${order.map((o, i) => { const pages = o.names.map(byName).filter(Boolean); const hrefs = pages.length ? pages.map((p) => `<a href="#${esc(p.key)}">${esc(p.name)}</a>`).join(' · ') : esc(o.names.join(' · ')); const hold = pages.some((p) => p.key === NOW) ? '<span class="nowtag">now</span>' : ''; return `<li><span class="on">${esc(o.n)}</span><span class="oname">${hrefs}${hold}${o.tail ? ` <span class="owhy" style="display:inline">(${esc(o.tail)})</span>` : ''}<span class="owhy">${esc(o.why)}</span></span></li>`; }).join('')}</ol>
</section>

${tiers.map(tierHtml).join('\n')}

<footer>
  Source of truth: <code>design/REDESIGN-CHECKLIST.md</code>${commit ? ` at <code>${esc(commit)}</code>` : ''}. This page is rendered from it by <code>scripts/redesign-page.mjs</code> and republished after every tick.<br>Latest ledger line: ${esc(ledger)}
</footer>
</div>
<script>
// open the page named in the hash (#mission), remember what he had open
try{const h=location.hash.slice(1);if(h){const d=document.getElementById(h);if(d&&d.tagName==='DETAILS'){d.open=true;d.scrollIntoView({block:'start'});}}}catch(e){}
try{const KEY='nova-redesign-open';const saved=JSON.parse(localStorage.getItem(KEY)||'[]');for(const id of saved){const d=document.getElementById(id);if(d)d.open=true;}
document.querySelectorAll('details.page').forEach((d)=>d.addEventListener('toggle',()=>{try{const open=[...document.querySelectorAll('details.page[open]')].map((x)=>x.id);localStorage.setItem(KEY,JSON.stringify(open));}catch(e){}}));}catch(e){}
</script>
`;
fs.writeFileSync(OUT, html);
console.log(`wrote ${OUT}: ${tiers.length} tiers, ${allPages.length} pages, ${total} rows (${done} verified), order ${order.length} steps, now=${NOW || 'none'}`);
