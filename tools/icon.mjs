// Draws the app icon (top-down turtle on sand) and writes the PNGs @capacitor/assets needs.
import sharp from 'sharp';
const hexes = [[-0.42,-0.4],[0,-0.4],[0.42,-0.4],[-0.42,0.4],[0,0.4],[0.42,0.4]].map(([x,y]) => [x,y,0.24,'#7d6230'])
  .concat([[-0.5,0],[0,0],[0.5,0]].map(([x,y]) => [x,y,0.22,'#a07e3c']));
const hex = (x, y, r) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 6 + i * Math.PI / 3; return `${(x + Math.cos(a) * r).toFixed(3)},${(y + Math.sin(a) * r).toFixed(3)}`; }).join(' ');
// turtle in local units (shell half-length 1), facing up
const turtle = `
 <g stroke="#3d5223" stroke-width="0.06" fill="#8db255">
  <ellipse cx="-0.95" cy="-0.75" rx="0.32" ry="0.26"/><ellipse cx="0.95" cy="-0.75" rx="0.32" ry="0.26"/>
  <ellipse cx="-0.9" cy="0.75" rx="0.3" ry="0.24"/><ellipse cx="0.9" cy="0.75" rx="0.3" ry="0.24"/>
  <path d="M -0.13 0.85 Q 0 1.4 0 1.35 Q 0 1.4 0.13 0.85 Z"/>
  <rect x="-0.2" y="-1.45" width="0.4" height="0.7" rx="0.2"/>
  <ellipse cx="0" cy="-1.55" rx="0.4" ry="0.45"/>
 </g>
 <circle cx="-0.25" cy="-1.62" r="0.11" fill="#1b1b1b"/><circle cx="0.25" cy="-1.62" r="0.11" fill="#1b1b1b"/>
 <circle cx="-0.22" cy="-1.66" r="0.04" fill="#fff"/><circle cx="0.28" cy="-1.66" r="0.04" fill="#fff"/>
 <ellipse cx="0" cy="0" rx="0.88" ry="1.04" fill="#3a2b12"/>
 <ellipse cx="0" cy="0" rx="0.84" ry="1" fill="#8a6a32"/>
 <g stroke="#3a2b12" stroke-width="0.05" transform="rotate(90)">${hexes.map(([x,y,r,c]) => `<polygon points="${hex(x,y,r)}" fill="${c}"/>`).join('')}</g>
 <ellipse cx="-0.3" cy="-0.2" rx="0.18" ry="0.42" fill="#fff" opacity="0.18"/>`;
const svg = (size, scale, bg) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-2 -2 4 4">
 ${bg ? `<defs><radialGradient id="g"><stop offset="0" stop-color="#e8d6a6"/><stop offset="1" stop-color="#c2a66e"/></radialGradient></defs><rect x="-2" y="-2" width="4" height="4" fill="url(#g)"/>` : ''}
 <g transform="scale(${scale}) translate(0 0.1)">${turtle}</g></svg>`);
await sharp(svg(1024, 1.05, true)).png().toFile('assets/icon-only.png');
await sharp(svg(1024, 0.72, false)).png().toFile('assets/icon-foreground.png');
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs><radialGradient id="g"><stop offset="0" stop-color="#e8d6a6"/><stop offset="1" stop-color="#c2a66e"/></radialGradient></defs><rect width="1024" height="1024" fill="url(#g)"/></svg>`)).png().toFile('assets/icon-background.png');
await sharp(svg(2732, 0.5, true)).png().toFile('assets/splash.png');
await sharp(svg(2732, 0.5, true)).png().toFile('assets/splash-dark.png');
console.log('icons written');
