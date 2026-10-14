// THE APP ICON IS THE CORE (option A, his pick 14 Oct 2026): the hologram
// core at rest, drawn by NovaCore itself, on the Nova page's navy and violet.
// tools/icon/core.html renders it at its tab-bar look (size 120, the SMALL
// preset) with an 8x canvas, so the 960px frame is drawn, never enlarged.
//
//   npx vite --port 5183   (the dev server must be up)
//   node scripts/gen-icons.mjs
import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const N = 1024;
const work = await mkdtemp(path.join(tmpdir(), 'nova-icon-'));
const raw = path.join(work, 'core.png');

// pure black behind the core: it paints with 'lighter', so it is laid on the
// ground below with `screen`, where black adds nothing
await promisify(execFile)('node', [path.join(ROOT, 'scripts/shot.mjs'), '--demo', '--nomobile',
  '--url', 'http://localhost:5183/nova-os/tools/icon/core.html?state=idle&size=120&dpr=8&bg=%23000',
  '--width', '128', '--height', '128', '--dpr', '8', '--wait', '2500', '--out', raw]);

const ground = Buffer.from(`<svg width="${N}" height="${N}" xmlns="http://www.w3.org/2000/svg"><defs>
<radialGradient id="t" cx="18%" cy="12%" r="70%"><stop offset="0" stop-color="#59e6ff" stop-opacity=".22"/><stop offset="1" stop-color="#59e6ff" stop-opacity="0"/></radialGradient>
<radialGradient id="v" cx="88%" cy="78%" r="75%"><stop offset="0" stop-color="#8f7bff" stop-opacity=".34"/><stop offset="1" stop-color="#8f7bff" stop-opacity="0"/></radialGradient>
<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1430"/><stop offset="1" stop-color="#090c1d"/></linearGradient>
</defs><rect width="${N}" height="${N}" fill="url(#b)"/><rect width="${N}" height="${N}" fill="url(#t)"/><rect width="${N}" height="${N}" fill="url(#v)"/></svg>`);

// `scale` of the tile the core spans: the maskable icon keeps it inside the
// 80% safe circle Android crops to
async function tile(scale) {
  const span = Math.round(N * scale);
  const core = await sharp(raw).resize(span, span, { kernel: 'lanczos3' }).png().toBuffer();
  const off = Math.round((N - span) / 2);
  return sharp(await sharp(ground).png().toBuffer()).composite([{ input: core, left: off, top: off, blend: 'screen' }]).png().toBuffer();
}

const full = await tile(0.98);
const safe = await tile(0.78);
const targets = [
  ['icon-192.png', 192, full],
  ['icon-512.png', 512, full],
  ['apple-touch-icon.png', 180, full],
  ['maskable-512.png', 512, safe],
];
for (const [name, size, src] of targets) {
  await sharp(src).resize(size, size, { kernel: 'lanczos3' }).png().toFile(path.join(ROOT, 'public/icons', name));
  console.log('wrote', name);
}
// the native shell's icon (native/README.md): one opaque 1024 square, iOS
// rounds the corners itself and rejects an icon with an alpha channel
await sharp(full).flatten({ background: '#090c1d' }).removeAlpha().png()
  .toFile(path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
console.log('wrote ios AppIcon-512@2x.png');
await rm(work, { recursive: true, force: true });
