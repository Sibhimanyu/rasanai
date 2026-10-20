// Headless screenshot of the studio: node scripts/shot.mjs out.png "query" [w h]
import { chromium } from 'playwright-core';
import fs from 'fs';
const [out, query = '', w = '1000', h = '1000'] = process.argv.slice(2);
const base = '/Users/sibhi-zstch1643/Library/Caches/ms-playwright';
const exe = `${base}/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text().slice(0, 300)); });
await page.goto(`http://127.0.0.1:5199/?${process.env.UI ? "" : "capture=1&"}${query}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
