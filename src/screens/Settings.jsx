import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import '../settings.css';
import { Chevron, ScreenHead, TextAction } from '../Controls.jsx';
import { NovaCore } from '../NovaCore.jsx';
import { edgeDragInProgress } from '../edgeBack.js';
import { haptic } from '../haptics.js';
import { searchSettings } from '../settingsModel.js';
import { lightRow } from '../settingsToast.js';
import {
  snapshot, playPush, playPop, beginPop, paintPop, settlePop, releasePop, finishRunning, mainEl,
  startsSwipe, swipeDecision, decideDirection, reducedMotion, PUSH_MS,
} from '../settingsNav.js';
import { Ico, Tile, NavRow, SwitchRow, Group, HeaderCard, ActRow, Stages, Val } from './SettingsKit.jsx';
import {
  VoicePage, NotifPage, AppearancePage, CheckPage, YouPage, CalendarsPage, ModelsPage, ModelGroupPage,
  SnapshotsPage, BrowserPage, TabsPage, TrainPage,
} from './SettingsPages.jsx';

// SETTINGS, DIRECTION A ("Rows"): his pick on 7 Oct 2026: "Love the rows
// option A and layout of it, including things like a preview of the
// different appearances when toggled, etc. ensure this is built exactly like
// the mockup with nothing missing". design/mockups/72-redesign-settings.html,
// direction A; the acceptance contract is
// design/audits/redesign-2026-09/07-settings-build-checklist.md.
//
// The Index's twin: the you card, then fourteen rows in five groups, each
// with its live value and one push to its page; the pages slide in the way
// iOS Settings' do and the swipe back pops them; search at the foot finds any
// setting and opens its page with the row lit. One render for every style
// (Settings has never had a cupertino branch). Every function the old single
// scroll had moved to the row or page the mockup puts it on (REDESIGN-
// CHECKLIST §5, S1 to S13); the checklist says where each went.
//
// The view model is src/vals/valsSettings.js; the slide is src/settingsNav.js.

// ------------------------------------------------------------------ root --

function RootPage({ P, open, q, setQ }) {
  const R = P.rows;
  const hits = q.trim() ? searchSettings(q) : null;
  return (
    <>
      {P.numeral ? <ScreenHead numeral={P.numeral} label="System · Settings" style={{ margin: '0 4px 6px' }} /> : null}
      <h1 className="nv-set-lt nv-set-rise" style={{ '--i': 0 }} data-set-hcard="">Settings</h1>
      {!hits && P.banner ? <div className="nv-set-banner" role="status"><i /><span>{P.banner}</span></div> : null}
      {!hits && (
        <>
          <button type="button" className="nv-set-card nv-set-you nv-set-rise" style={{ '--i': 1 }} onClick={() => { haptic('tick'); open('you'); }}
            aria-label={`${P.you.name}. About you, your numbers, and what Nova has noticed`}>
            <NovaCore size={48} variant="mini" engine={P.coreStyle} style={{ pointerEvents: 'none' }} />
            <span><b>{P.you.name}</b><span>About you, your numbers, and what Nova has noticed</span></span>
            <Chevron tone="var(--nv-ink40)" size={13} />
          </button>
          <Group label="Nova" i={2}>
            <NavRow k="voice" tile={<Tile icon="wave" hue="var(--nv-cy)" />} label="Voice" value={R.voice.value} onOpen={() => open('voice')} />
            <SwitchRow k="wake" tile={<Tile icon="mic" hue="var(--nv-cy)" />} label="“Hey Nova”" aria="Hey Nova" on={P.wake.on} disabled={P.wake.disabled} why={P.wake.why}
              onToggle={(on) => P.wake.set(on)} />
            <NavRow k="notif" tile={<Tile icon="bell" />} label="Notifications" value={R.notif.value} staleAt={P.staleAt} onOpen={() => open('notif')} />
          </Group>
          <Group label="Look" i={3}>
            <NavRow k="app" tile={<Tile className={`disc nv-set-d-${P.app.look.theme}`}><span /></Tile>} label="Appearance" value={R.app.value} onOpen={() => open('app')} />
            <SwitchRow k="calm" tile={<Tile icon="calm" />} label="Calm mode" on={P.calm.on} onToggle={() => P.calm.toggle()} />
            <NavRow k="tabs" tile={<Tile icon="dock" />} label="Tab bar" value={R.tabs.value} onOpen={() => open('tabs')} />
          </Group>
          {R.train ? (
            <Group label="In Nova’s pages" i={4}>
              <NavRow k="train" tile={<Tile icon="dumbbell" hue="var(--nv-cy)" />} label="Train" value={R.train.value} onOpen={() => open('train')} />
            </Group>
          ) : null}
          <Group label="Connected" i={5}>
            <NavRow k="mac" tile={<Tile icon="laptop" hue={R.mac.tile === 'good' ? 'var(--s-good)' : 'var(--nv-ink40)'} />} label="The Mac" value={R.mac.value} ok={R.mac.ok} onOpen={() => open('mac')} />
            <NavRow k="cals" tile={<Tile icon="cal" />} label="Calendars" value={R.cals.value} staleAt={P.staleAt} onOpen={() => open('cals')} />
            <NavRow k="browser" tile={<Tile icon="globe" />} label="Research browser" value={R.browser.value} staleAt={P.staleAt} onOpen={() => open('browser')} />
          </Group>
          <Group label="Under the hood" i={6}>
            <NavRow k="models" tile={<Tile icon="chip" />} label="Claude models" value={R.models.value} staleAt={P.staleAt} onOpen={() => open('models')} />
            <NavRow k="snap" tile={<Tile icon="clock" />} label="Snapshots" value={R.snap.value} onOpen={() => open('snap')} />
            <NavRow k="check" tile={<Tile icon="checkc" hue="var(--nv-good)" />} label="Check Nova" value={R.check.value} onOpen={() => open('check')} />
          </Group>
          {/* the six that answer to speech, named as six (finding 4: the old
              card said "most of this page"); src/settingsVoice.js parses them */}
          <p className="nv-set-spoken nv-set-rise" style={{ '--i': 7 }}>
            Six settings also answer to speech, on the Nova screen or the Ask bar:{' '}
            {P.spoken.phrases.map((ph, i) => <span key={ph}><q>{ph}</q>{i < P.spoken.phrases.length - 1 ? ', ' : ''}</span>)}.
            {' '}He can fix what is already written, too, by voice: he asks first, and Undo puts it back. Build {P.spoken.build}.
          </p>
        </>
      )}
      {hits ? (
        hits.length ? (
          <section className="nv-set-grp">
            <div className="nv-set-gh"><span style={{ font: '600 var(--t13)/1.2 var(--nv-font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--nv-ink60)' }}>{hits.length === 1 ? '1 setting' : `${hits.length} settings`}</span></div>
            <div className="nv-set-card nv-set-list">
              {hits.map((h) => (
                <button key={`${h.page}-${h.lit}`} type="button" className="nv-set-row nx nv-set-res" onClick={() => { haptic('tick'); open(h.page, h.lit); }}>
                  <span className="nv-set-rt"><span className="nv-set-rl">{h.label}</span><span className="nv-set-rv">{h.page === 'you' ? P.you.name : h.where}</span></span>
                  <Chevron tone="var(--nv-ink40)" size={13} />
                </button>
              ))}
            </div>
          </section>
        ) : (
          <p className="nv-set-nores">No setting matches “{q.trim()}”. <button type="button" onClick={P.openVoice}>Ask Nova instead.</button></p>
        )
      ) : null}
      <label className="nv-set-search nv-set-rise" style={{ '--i': 8 }} htmlFor="nv-set-q">
        <Ico n="search" />
        <input id="nv-set-q" type="search" placeholder="Search settings" autoComplete="off" autoCapitalize="none" enterKeyHint="search"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
    </>
  );
}

// -------------------------------------------------------------- the mac --
// Kept in this file because its two fields are the only ones in Settings that
// switch autocorrect off (server/test/autocorrectFields.test.js allows this
// file and Stash.jsx alone: a pasted URL or token must never be "corrected").

function MacPage({ P }) {
  const M = P.mac;
  const stages = M.testStatus === 'ok' ? [{ ok: true, stage: 'Reached the Mac', detail: M.testMessage }]
    : M.testStatus === 'error' ? [{ ok: false, stage: 'Could not connect', detail: M.testMessage }] : null;
  return (
    <>
      <HeaderCard tile={<Tile lg icon="laptop" hue={M.ok ? 'var(--s-good)' : 'var(--nv-ink40)'} />} title="The Mac" text="Nova’s server on your Mac, reached through Tailscale." />
      <Group i={1} foot="The token is printed in the server’s terminal on first run, and kept in server/.env. server/README.md says how to run it as a service and reach it from anywhere through Tailscale.">
        <div className="nv-set-row nx">
          <span className="nv-set-rt"><span className="nv-set-rl">Status</span><Val v={M.status} ok={M.ok} /></span>
          <span />
        </div>
        <label className="nv-set-fl" htmlFor="nv-set-url">
          <span>Backend URL</span>
          <input className="nv-set-fin" id="nv-set-url" type="url" value={M.url} onChange={M.setUrl} placeholder="https://your-mac.tailxxxx.ts.net:4173"
            autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="url" />
        </label>
        <label className="nv-set-fl" htmlFor="nv-set-tok">
          <span>API token</span>
          <input className="nv-set-fin" id="nv-set-tok" type="password" value={M.token} onChange={M.setToken} placeholder="printed in the server’s terminal on first run"
            autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </label>
        <div className="nv-set-blk" data-set-key="conn">
          <ActRow label="Test the connection" sub="Reaches the Mac, checks the token, reads the vault.">
            <TextAction onClick={M.testStatus === 'testing' ? undefined : M.test} disabled={M.testStatus === 'testing'}>{M.testStatus === 'testing' ? 'Running' : stages ? 'Run again' : 'Run'}</TextAction>
          </ActRow>
          <Stages stages={stages} />
        </div>
        {M.connected ? (
          <ActRow sub="Back to demo data until you connect again.">
            <TextAction tone="warn" onClick={M.disconnect}>Disconnect</TextAction>
          </ActRow>
        ) : (
          <ActRow sub="Saves this address and token on this phone, then reads your real vault.">
            <TextAction onClick={M.save}>Connect</TextAction>
          </ActRow>
        )}
      </Group>
    </>
  );
}

function PageBody({ id, P, open }) {
  if (id === 'voice') return <VoicePage P={P} open={open} />;
  if (id === 'notif') return <NotifPage P={P} />;
  if (id === 'app') return <AppearancePage P={P} />;
  if (id === 'check') return <CheckPage P={P} />;
  if (id === 'you') return <YouPage P={P} />;
  if (id === 'cals') return <CalendarsPage P={P} />;
  if (id === 'models') return <ModelsPage P={P} open={open} />;
  if (id.startsWith('mg:')) return <ModelGroupPage P={P} id={id.slice(3)} />;
  if (id === 'snap') return <SnapshotsPage P={P} />;
  if (id === 'mac') return <MacPage P={P} />;
  if (id === 'browser') return <BrowserPage P={P} />;
  if (id === 'tabs') return <TabsPage P={P} />;
  if (id === 'train') return <TrainPage P={P} />;
  return null;
}

// THE BAR A PAGE CARRIES: Back in the accent, and the page's title once its
// own header has scrolled under the bar
function NavBar({ title, backTo, onBack, top }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const main = mainEl();
    const bar = ref.current;
    if (!main || !bar) return undefined;
    const check = () => {
      const h = bar.parentElement?.querySelector('[data-set-hcard]');
      if (!h) return;
      const hb = h.getBoundingClientRect().bottom;
      const bb = bar.getBoundingClientRect().bottom;
      setOn(hb < bb + 4);
    };
    check();
    main.addEventListener('scroll', check, { passive: true });
    return () => main.removeEventListener('scroll', check);
  }, [title]);
  return (
    <div ref={ref} className={`nv-set-nav${on ? ' on' : ''}`} style={{ '--nv-set-top': top }}>
      <button type="button" className="nv-set-bk" onClick={onBack} aria-label={`Back to ${backTo}`}>
        <Ico n="back" /><span>{backTo}</span>
      </button>
      <span className="nv-set-nt" aria-hidden="true">{title}</span>
      <span />
    </div>
  );
}

const keyOf = (path) => path.join('/') || 'root';
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export function Settings({ v }) {
  const P = v.settingsPage;
  const root = useRef(null);
  const probe = useRef(null);
  const [q, setQ] = useState('');
  const [peek, setPeek] = useState(false);
  const pend = useRef(null);
  const scrolls = useRef({});
  const prevPath = useRef(P ? P.path : []);
  const swipe = useRef(null);
  const swallow = useRef(0);
  const litDone = useRef('');
  const path = P ? P.path : [];
  const shownPath = peek ? path.slice(0, -1) : path;
  const top = shownPath[shownPath.length - 1] || 'root';

  // the Mac's side of the rows, read once Settings is on screen
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { P?.ensure(); }, []);

  // TYPE FOLLOWS THE iPHONE'S TEXT SIZE: the system body size over 17
  useLayoutEffect(() => {
    const measure = () => {
      const px = parseFloat(getComputedStyle(probe.current || document.body).fontSize) || 17;
      const ts = Math.max(0.85, Math.min(1.6, px / 17));
      root.current?.style.setProperty('--ts', ts.toFixed(3));
    };
    measure();
    window.addEventListener('resize', measure);
    document.addEventListener('visibilitychange', measure);
    return () => { window.removeEventListener('resize', measure); document.removeEventListener('visibilitychange', measure); };
  }, []);

  // ---- the stack: push and pop, decided by how the path changed ----
  // (the view model is rebuilt on every render, so the handlers read it
  // through a ref rather than closing over one render's copy)
  const live = useRef({ P, path });
  live.current = { P, path };
  const open = (id, lit) => {
    const { P: vm, path: now } = live.current;
    if (!vm) return;
    finishRunning();
    const main = mainEl();
    if (main) scrolls.current[keyOf(now)] = main.scrollTop;
    pend.current = { kind: 'push', snap: snapshot() };
    setQ('');
    vm.go(id, lit);
  };
  const back = () => {
    const { P: vm, path: now } = live.current;
    if (!vm || !now.length) return;
    finishRunning();
    pend.current = { kind: 'pop', snap: snapshot() };
    vm.back();
  };
  const pathKey = keyOf(path);

  useLayoutEffect(() => {
    const prev = prevPath.current;
    prevPath.current = path;
    if (same(prev, path)) return;
    const main = mainEl();
    const p = pend.current;
    pend.current = null;
    if (path.length > prev.length) {
      if (main) main.scrollTop = 0;
      if (p?.kind === 'push' && p.snap) playPush(p.snap);
      else if (p?.snap) p.snap.layer.remove();
      return;
    }
    // a pop: the parent comes back where he left it
    if (p?.kind === 'swipe') { setPeek(false); return; }
    if (main) main.scrollTop = scrolls.current[keyOf(path)] || 0;
    if (edgeDragInProgress()) { p?.snap?.layer.remove(); return; }
    if (p?.kind === 'pop' && p.snap) playPop(p.snap);
    else if (p?.snap) p.snap.layer.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  // while a swipe peeks at the parent, the parent sits where he left it
  useLayoutEffect(() => {
    if (!peek) return;
    const main = mainEl();
    if (main) main.scrollTop = scrolls.current[keyOf(shownPath)] || 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peek]);

  // a search hit opens its page with that row lit and in view
  const lit = P?.lit || null;
  useEffect(() => {
    const want = lit ? `${pathKey}:${lit}` : '';
    if (!want || litDone.current === want || peek) return undefined;
    litDone.current = want;
    const t = setTimeout(() => {
      const el = lightRow(lit, root.current);
      try { el?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch { el?.scrollIntoView(); }
    }, reducedMotion() ? 240 : PUSH_MS - 80);
    return () => clearTimeout(t);
  }, [lit, pathKey, peek]);

  // Escape goes back a page, as on the Mac
  const depth = path.length;
  useEffect(() => {
    if (!depth) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (e.target?.closest?.('input, textarea')) return;
      back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depth]);

  // ---- the swipe right, tracked under the finger ----
  const onPointerDown = (e) => {
    if (!path.length || swipe.current || !startsSwipe(e)) return;
    swipe.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, lock: null, pop: null, h: [] };
  };
  const onPointerMove = (e) => {
    const s = swipe.current;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x0;
    const dy = e.clientY - s.y0;
    if (!s.lock) {
      const dir = decideDirection(dx, dy);
      if (!dir) return;
      if (dir === 'v' || dx < 0) { swipe.current = null; return; }
      s.lock = 'h';
      try { root.current?.setPointerCapture(e.pointerId); } catch { /* gone */ }
      finishRunning();
      const main = mainEl();
      if (main) scrolls.current[keyOf(path)] = main.scrollTop;
      const snap = snapshot();
      s.pop = beginPop(snap);
      setPeek(true);
    }
    const x = Math.max(0, dx);
    if (s.pop) paintPop(s.pop, x);
    s.h.push([performance.now(), x]);
    if (s.h.length > 6) s.h.shift();
  };
  const onPointerUp = (e) => {
    const s = swipe.current;
    if (!s || e.pointerId !== s.id) return;
    swipe.current = null;
    if (!s.lock || !s.pop) return;
    swallow.current = performance.now();
    const h = s.h;
    const x = h.length ? h[h.length - 1][1] : 0;
    let vx = 0;
    if (h.length > 1) { const a = h[0]; const b = h[h.length - 1]; vx = (b[1] - a[1]) / Math.max(1, b[0] - a[0]); }
    const commit = e.type !== 'pointercancel' && swipeDecision({ dx: x, W: s.pop.W, vx });
    const pop = s.pop;
    if (commit) {
      settlePop(pop, true, { vx, done: () => { pend.current = { kind: 'swipe' }; P.back(); } });
    } else {
      settlePop(pop, false, {
        vx,
        done: () => {
          setPeek(false);
          requestAnimationFrame(() => {
            const main = mainEl();
            if (main) main.scrollTop = scrolls.current[keyOf(path)] || 0;
            requestAnimationFrame(() => releasePop(pop));
          });
        },
      });
    }
  };
  // a swipe that ended on a row is not also a tap on it
  const onClickCapture = (e) => { if (performance.now() - swallow.current < 120) { e.stopPropagation(); e.preventDefault(); } };

  if (!P) return null;
  const parentTitle = P.title(shownPath[shownPath.length - 2] || 'root');
  const navTop = P.isMobile ? 'calc(48px + env(safe-area-inset-top))' : '0px';
  const searchB = !P.isMobile ? '16px'
    : P.statusBanner ? 'calc(118px + min(env(safe-area-inset-bottom), 34px))'
      : P.summary ? 'calc(76px + min(env(safe-area-inset-bottom), 34px))' : 'calc(86px + min(env(safe-area-inset-bottom), 34px))';
  return (
    <div ref={root} className="nv-set" style={{ ...v.wrapSettings, '--nv-set-search-b': searchB, touchAction: path.length ? 'pan-y' : undefined }}
      data-screen-label="Settings" data-set-state={P.state}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClickCapture={onClickCapture}>
      <span ref={probe} className="nv-set-probe" aria-hidden="true">Aa</span>
      <div className="nv-set-col" key={keyOf(shownPath)} data-set-page={top}>
        {top === 'root' ? (
          <RootPage P={P} open={open} q={q} setQ={setQ} />
        ) : (
          <>
            <NavBar title={P.title(top)} backTo={parentTitle} onBack={back} top={navTop} />
            <PageBody id={top} P={P} open={open} />
          </>
        )}
      </div>
    </div>
  );
}
