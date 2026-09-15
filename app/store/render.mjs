import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const output = resolve(root, 'store', 'out');
mkdirSync(output, { recursive: true });

function pngInfo(file) {
  const bytes = readFileSync(file);
  if (bytes.subarray(0, 8).compare(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) !== 0) throw new Error(`${file} is not a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}

function render(input, out, width, height, transparent = false) {
  const profile = mkdtempSync(resolve(tmpdir(), 'deepdesk-chrome-'));
  try {
    const fileUrl = `file:///${resolve(root, input).replaceAll('\\', '/')}`;
    const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--user-data-dir=${profile}`, `--window-size=${width},${height}`, `--screenshot=${resolve(root, out)}`];
    if (transparent) args.push('--default-background-color=00000000');
    args.push(fileUrl);
    execFileSync(chrome, args, { stdio: 'inherit' });
  } finally { rmSync(profile, { recursive: true, force: true }); }
  const info = pngInfo(resolve(root, out));
  console.log(`${out}: ${info.width}x${info.height}${transparent ? `, color type ${info.colorType} (alpha)` : ''}`);
  if (info.width !== width || info.height !== height) throw new Error(`Wrong dimensions for ${out}`);
  if (transparent && info.colorType !== 6) throw new Error(`${out} does not have an alpha channel`);
}

render('store/brand/icon.html', 'store/out/icon-1024.png', 1024, 1024);
render('store/brand/icon.html', 'store/out/icon-512.png', 512, 512);
render('store/brand/feature.html', 'store/out/feature-1024x500.png', 1024, 500);
render('store/brand/icon-foreground.html', 'store/out/icon-foreground.png', 1024, 1024, true);
