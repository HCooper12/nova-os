// The moving parts of a mentor's page, ported from the approved mockup
// (125 A, tpl.html): the odometer that rolls a number, the numeral fitted to
// its line, a name fitted to its width, and the damped spring a sheet rides.
// Plain DOM on purpose: these run per frame or per digit, outside React.

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const fmt = (n) => Number(n || 0).toLocaleString('en-AU');

/* the advance width of each digit in this element's own face, size and spacing */
const DW = new Map();
function digitW(el) {
  const cs = getComputedStyle(el);
  const key = [cs.fontWeight, cs.fontSize, cs.fontFamily, cs.letterSpacing, cs.fontVariantNumeric].join('|');
  if (DW.has(key)) return DW.get(key);
  const m = document.createElement('span');
  m.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;line-height:1';
  el.appendChild(m);
  const w = '0123456789'.split('').map((d) => { m.textContent = d; return m.getBoundingClientRect().width; });
  m.remove();
  DW.set(key, w);
  return w;
}

/** A number that rolls to its new value, column by column (the mockup's odo). */
export function odo(el, n, animate = true) {
  if (!el) return;
  const s = fmt(n);
  const cur = el.dataset.v;
  const RM = reducedMotion();
  const build = () => {
    el.innerHTML = `<span class="od" aria-hidden="true">${[...s].map((ch) => (/\d/.test(ch)
      ? `<span style="transform:translateY(0)">${'0123456789'.split('').map((d) => `<span>${d}</span>`).join('')}</span>`
      : `<span class="cm"><span>${ch}</span></span>`)).join('')}</span><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">${s}</span>`;
  };
  function set(instant) {
    const cols = [...el.querySelectorAll('.od>span')];
    let j = 0;
    const W = digitW(el);
    [...s].forEach((ch) => {
      const col = cols[j++];
      if (!col || !/\d/.test(ch)) return;
      if (instant) col.style.transition = 'none';
      col.style.transform = `translateY(${-+ch}em)`;
      col.style.width = `${W[+ch]}px`;
      if (instant) { void col.offsetWidth; col.style.transition = ''; }
    });
  }
  if (!cur || cur.length !== s.length) {
    build();
    el.dataset.v = s;
    if (!animate || RM) { set(true); return; }
    requestAnimationFrame(() => requestAnimationFrame(() => set(false)));
    return;
  }
  if (cur === s) return;
  el.dataset.v = s;
  const said = el.querySelector(':scope > span:last-child');
  if (said) said.textContent = s;
  set(!!RM);
}

export function odoRefit(el) {
  const s = el?.dataset.v;
  if (!s) return;
  const W = digitW(el);
  const cols = [...el.querySelectorAll('.od>span')];
  let j = 0;
  [...s].forEach((ch) => { const col = cols[j++]; if (col && /\d/.test(ch)) col.style.width = `${W[+ch]}px`; });
}

/** The giant numeral: fitted by code so one, two or three digits sit inside the margin. */
export function fitBig(cnt, big, of, text) {
  if (!cnt || !big || !of) return;
  const avail = cnt.clientWidth - 12 - of.offsetWidth - 18 - 14;
  const m = document.createElement('span');
  m.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:800 100px/1 var(--nv-m-sans);letter-spacing:-.06em;font-variant-numeric:proportional-nums lining-nums';
  m.textContent = text;
  cnt.appendChild(m);
  const w = m.getBoundingClientRect().width;
  m.remove();
  const size = Math.max(60, Math.min(176, Math.floor(avail * 100 / w)));
  big.style.fontSize = `${size}px`;
  cnt.style.height = `${Math.round(size * 0.745)}px`;
  odoRefit(big);
}

/** A name: the longest word must fit the content width. */
export function fitName(el, max, pad = 0) {
  if (!el) return;
  const box = el.offsetParent || el.parentElement;
  const cs = getComputedStyle(el);
  const avail = box.clientWidth - pad;
  el.style.fontSize = `${max}px`;
  const words = el.textContent.trim().split(/\s+/);
  const m = document.createElement('span');
  m.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.fontWeight} ${max}px ${cs.fontFamily};letter-spacing:${cs.letterSpacing}`;
  document.body.appendChild(m);
  let widest = 0;
  words.forEach((w) => { m.textContent = w; widest = Math.max(widest, m.getBoundingClientRect().width); });
  m.remove();
  if (widest > avail) el.style.fontSize = `${Math.floor(max * avail / widest)}px`;
}

/* a damped spring in JS: interruptible, starts from wherever the thing is, carries the finger's velocity */
export function Spring(apply, response = 0.36, damping = 0.86) {
  const k = (2 * Math.PI / response) ** 2, c = 2 * damping * Math.sqrt(k);
  const S = { x: 0, v: 0, target: 0, raf: 0, cb: null, last: 0 };
  const step = (t) => {
    const dt = Math.min(0.05, S.last ? (t - S.last) / 1000 : 1 / 60);
    S.last = t;
    for (let n = 0, h = dt / 4; n < 4; n++) { const a = -k * (S.x - S.target) - c * S.v; S.v += a * h; S.x += S.v * h; }
    if (Math.abs(S.x - S.target) < 0.4 && Math.abs(S.v) < 8) {
      S.x = S.target; S.v = 0; apply(S.x); S.raf = 0;
      const cb = S.cb; S.cb = null; if (cb) cb();
      return;
    }
    apply(S.x);
    S.raf = requestAnimationFrame(step);
  };
  return {
    get x() { return S.x; },
    stop() { cancelAnimationFrame(S.raf); S.raf = 0; S.cb = null; },
    set(x) { this.stop(); S.x = x; S.v = 0; apply(x); },
    to(target, v = S.v, cb = null) { cancelAnimationFrame(S.raf); S.target = target; S.v = v; S.cb = cb; S.last = 0; S.raf = requestAnimationFrame(step); },
  };
}
const project = (v, d = 0.998) => (v / 1000) * d / (1 - d);
const rubber = (o, dim, c = 0.55) => (o * dim * c) / (dim + c * Math.abs(o));

/** Drag a sheet down by its top edge: follows 1:1, released into the spring with the finger's velocity. */
export function sheetDrag(zone, sp, H, close) {
  let y0 = 0, x0 = 0, hist = [], on = false;
  const down = (e) => {
    if (e.target.closest('button,a')) return;
    on = true; sp.stop(); y0 = e.clientY; x0 = sp.x; hist = [[e.clientY, e.timeStamp]];
    try { zone.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  };
  const move = (e) => {
    if (!on) return;
    const d = x0 + e.clientY - y0;
    sp.set(d < 0 ? rubber(d, H()) : d);
    hist.push([e.clientY, e.timeStamp]); if (hist.length > 6) hist.shift();
  };
  const up = () => {
    if (!on) return;
    on = false;
    const [a, b] = [hist[0], hist[hist.length - 1]];
    const v = b && a && b[1] > a[1] ? (b[0] - a[0]) / ((b[1] - a[1]) / 1000) : 0;
    if (sp.x + project(v) > H() * 0.42) close(v); else sp.to(0, v);
  };
  zone.addEventListener('pointerdown', down);
  zone.addEventListener('pointermove', move);
  zone.addEventListener('pointerup', up);
  zone.addEventListener('pointercancel', up);
  return () => {
    zone.removeEventListener('pointerdown', down);
    zone.removeEventListener('pointermove', move);
    zone.removeEventListener('pointerup', up);
    zone.removeEventListener('pointercancel', up);
  };
}

/** A frame that just moved a stage forward: a small pop, then its new colour holds. */
export function popCell(el, ms = 810) {
  if (!el || reducedMotion() || !el.animate) return;
  el.style.zIndex = 5;
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(2.1)', offset: 0.32 }, { transform: 'scale(1)' }], { duration: ms, easing: 'cubic-bezier(.34,1.56,.64,1)' }).onfinish = () => { el.style.zIndex = ''; };
}
