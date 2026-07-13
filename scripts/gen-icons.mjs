// One-off icon generator for the PWA manifest / apple-touch-icon.
// Rasterizes an SVG orb (matching the in-app boot/sidebar orb) via sharp.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const svg = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="72%" cy="18%" r="85%">
      <stop offset="0%" stop-color="#2a1d38"/>
      <stop offset="45%" stop-color="#1a1322"/>
      <stop offset="100%" stop-color="#120d18"/>
    </radialGradient>
    <radialGradient id="orb" cx="42%" cy="36%" r="65%">
      <stop offset="0%" stop-color="#fff3da"/>
      <stop offset="30%" stop-color="#ecc98a"/>
      <stop offset="62%" stop-color="#a3742f"/>
      <stop offset="100%" stop-color="#3a2a12"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="230" fill="none" stroke="#6be5f5" stroke-opacity="0.35" stroke-width="6" stroke-dasharray="10 14"/>
  <circle cx="256" cy="256" r="192" fill="none" stroke="#d8b573" stroke-opacity="0.3" stroke-width="4"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="#6be5f5" stroke-opacity="0.8" stroke-width="8" stroke-linecap="round" stroke-dasharray="260 700"/>
  <circle cx="256" cy="256" r="112" fill="url(#orb)"/>
</svg>`;

mkdirSync(new URL('../public/icons', import.meta.url), { recursive: true });

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['maskable-512.png', 512],
];

for (const [name, size] of targets) {
  await sharp(Buffer.from(svg(size)))
    .png()
    .toFile(fileURLToPath(new URL(`../public/icons/${name}`, import.meta.url)));
  console.log('wrote', name);
}
