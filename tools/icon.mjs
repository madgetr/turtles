// Builds the app icon, adaptive-icon layers, splash screens and Play Store icon from assets/new-icon.jpeg.
// Then run:  npx @capacitor/assets generate --android --iconBackgroundColor '#27a49c' --iconBackgroundColorDark '#27a49c' --splashBackgroundColor '#27a49c' --splashBackgroundColorDark '#27a49c'
import sharp from 'sharp';

const SRC = 'assets/new-icon.jpeg', TEAL = '#27a49c'; // teal = the art's own background colour

// Play Store + older Android launchers: the whole picture
await sharp(SRC).resize(1024, 1024).png().toFile('assets/icon-only.png');
await sharp(SRC).resize(512, 512).png().toFile('store/play-icon-512.png');

// Adaptive icon (Android 8+): phones crop to a circle/squircle showing only the middle ~2/3 of the layer,
// so the art is shrunk to 72% on a matching teal background: the face stays fully visible and the picture's
// own edges fall outside the crop.
const fg = await sharp(SRC).resize(740, 740).png().toBuffer();
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: fg, left: 142, top: 142 }]).png().toFile('assets/icon-foreground.png');
await sharp({ create: { width: 1024, height: 1024, channels: 3, background: TEAL } }).png().toFile('assets/icon-background.png');

// Splash: the icon with rounded corners in the middle of a teal screen
const R = 900;
const mask = Buffer.from(`<svg width="${R}" height="${R}"><rect width="${R}" height="${R}" rx="190" fill="#fff"/></svg>`);
const rounded = await sharp(SRC).resize(R, R).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
for (const f of ['assets/splash.png', 'assets/splash-dark.png']) {
  await sharp({ create: { width: 2732, height: 2732, channels: 3, background: TEAL } })
    .composite([{ input: rounded, left: (2732 - R) / 2, top: (2732 - R) / 2 }]).png().toFile(f);
}
// Web page (GitHub Pages) favicons
await sharp(SRC).resize(32, 32).png().toFile('icons/favicon-32.png');
await sharp(SRC).resize(180, 180).png().toFile('icons/apple-touch-icon.png');
await sharp(SRC).resize(192, 192).png().toFile('icons/icon-192.png');

console.log('icons written');
