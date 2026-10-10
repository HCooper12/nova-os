// THE DEMO'S PICTURES (mockups 84, 88, 90: "Product pictures are drawn for
// the mockup; Nova would show each page's own picture"). Demo mode only:
// live cards show the page's own picture, cached on his Mac, or the shelf's
// monogram when the page has none. Nothing here is fetched.
const P = {
  pump: ['#163330', '#0a1716', <><rect x="54" y="34" width="30" height="46" rx="8" fill="#e8f3ef" /><rect x="62" y="22" width="14" height="13" rx="2" fill="#9fb5b0" /><path d="M69 22v-6h11" stroke="#9fb5b0" strokeWidth="4" fill="none" strokeLinecap="round" /><rect x="54" y="50" width="30" height="12" fill="#ff7aa8" opacity=".6" /></>],
  tube: ['#3a2f22', '#1a1610', <><path d="M40 26h58l-6 46H46z" fill="#f3e9da" /><rect x="58" y="72" width="22" height="9" rx="2" fill="#e0b26a" /></>],
  dropper: ['#2b2140', '#141024', <><rect x="54" y="40" width="30" height="40" rx="6" fill="#c9a36a" /><rect x="58" y="26" width="22" height="15" rx="3" fill="#2b2b2f" /><ellipse cx="69" cy="20" rx="9" ry="8" fill="#2b2b2f" /></>],
  balm: ['#3a1f2a', '#1a0f16', <><rect x="60" y="34" width="18" height="44" rx="5" fill="#f2c4cf" /><rect x="60" y="34" width="18" height="12" rx="4" fill="#d98aa0" /></>],
  bag: ['#2b2018', '#140e0a', <><path d="M46 30h46l4 50H42z" fill="#6b4a33" /><path d="M46 30l6-8h34l6 8" fill="#8a6447" /><rect x="54" y="46" width="30" height="18" rx="3" fill="#f2e6d6" /></>],
  sharpener: ['#1f2a33', '#0e141a', <><rect x="36" y="52" width="66" height="22" rx="8" fill="#9aa7b2" /><path d="M58 52l11-20 11 20" fill="#c8d2da" /></>],
  arm: ['#1e2433', '#0d111c', <><rect x="44" y="70" width="50" height="8" rx="3" fill="#8b95a8" /><path d="M69 70V48l18-14" stroke="#b9c2d2" strokeWidth="6" fill="none" strokeLinecap="round" /><rect x="80" y="20" width="32" height="22" rx="3" fill="#2a3346" stroke="#b9c2d2" strokeWidth="2" /></>],
  mat: ['#1d2a26', '#0c1513', <><rect x="24" y="44" width="90" height="30" rx="8" fill="#3c5a52" /><rect x="30" y="50" width="78" height="18" rx="5" fill="#4f7468" /></>],
  page: ['#16223a', '#0b1222', <><circle cx="96" cy="26" r="10" fill="#e0b26a" opacity=".85" /><path d="M0 70l30-22 22 14 26-26 30 30 30-16v40H0z" fill="#2c4a7a" /></>],
  page2: ['#24183a', '#120c20', <><circle cx="34" cy="30" r="12" fill="#a99bff" opacity=".7" /><path d="M0 74c30-14 50 6 70-6s40-10 68 2v20H0z" fill="#3b2d66" /></>],
  serum: ['#efe6da', '#e4d6c3', <><rect x="56" y="34" width="26" height="46" rx="6" fill="#f2b33d" /><rect x="58" y="22" width="22" height="13" rx="3" fill="#2b2b2f" /><ellipse cx="69" cy="17" rx="8" ry="7" fill="#2b2b2f" /><rect x="60" y="50" width="18" height="14" rx="2" fill="#fff" opacity=".85" /></>],
  scarf: ['#3a2430', '#1c1118', <><path d="M40 28h58v14H40z" fill="#e8c9a8" /><path d="M78 42h14v38H78z" fill="#d9b48f" /><path d="M78 80l3 6 3-6 3 6 3-6" stroke="#e8c9a8" strokeWidth="2" fill="none" /></>],
  tea: ['#22301f', '#10170e', <><rect x="44" y="40" width="50" height="38" rx="4" fill="#c7d6a6" /><rect x="44" y="40" width="50" height="10" rx="3" fill="#8fa86a" /><rect x="58" y="56" width="22" height="12" rx="2" fill="#fff" opacity=".7" /></>],
  lamp: ['#2a2618', '#14120a', <><path d="M54 24h30l8 22H46z" fill="#f0d36b" /><path d="M69 46v26M54 76h30" stroke="#b9a87a" strokeWidth="5" strokeLinecap="round" /></>],
};

export function StashArt({ kind }) {
  const p = P[kind];
  if (!p) return null;
  return (
    <svg viewBox="0 0 138 92" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="138" height="92" fill={p[1]} /><rect width="138" height="46" fill={p[0]} opacity=".9" />
      <ellipse cx="69" cy="84" rx="40" ry="5" fill="#000" opacity=".25" />{p[2]}
    </svg>
  );
}
