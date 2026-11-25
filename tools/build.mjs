// Copy the static game into www/ for Capacitor (no bundler needed).
import { cpSync, rmSync, mkdirSync } from 'node:fs';
rmSync('www', { recursive: true, force: true });
mkdirSync('www');
cpSync('index.html', 'www/index.html');
cpSync('privacy.html', 'www/privacy.html'); // privacy policy for the Play Store listing
cpSync('js', 'www/js', { recursive: true });
console.log('built www/');
