// scripts/make-adaptive-icon.js
// Reprocesses adaptive-icon.png so the logo sits within Android's safe zone.
// The safe zone is the central 66% of the canvas; we target ~60% for breathing room.
// Background is the app's brand dark colour so corners never show white on launcher.

const { Jimp } = require('jimp');

async function main() {
  // Load the source icon (512x512 — logo on white rounded-rect background)
  const logo = await Jimp.read('assets/icon.png');

  // 1024x1024 canvas — Android scales this down to each mipmap density.
  // Logo at 60% = 614px keeps it firmly inside the 66% circular safe zone.
  const CANVAS = 1024;
  const LOGO_SIZE = Math.round(CANVAS * 0.60); // 614px

  logo.resize({ w: LOGO_SIZE, h: LOGO_SIZE });

  // Fill canvas with the app brand background (#0F0F13) so no white leaks
  // when the launcher masks to a circle/squircle on dark wallpapers.
  const canvas = new Jimp({ width: CANVAS, height: CANVAS, color: 0x0F0F13FF });

  const offset = Math.round((CANVAS - LOGO_SIZE) / 2); // ~205px each side
  canvas.composite(logo, offset, offset);

  await canvas.write('assets/adaptive-icon.png');
  console.log('Done. adaptive-icon.png:', CANVAS + 'x' + CANVAS + ', logo ' + LOGO_SIZE + 'px, offset ' + offset + 'px');
}

main().catch(err => { console.error(err); process.exit(1); });
