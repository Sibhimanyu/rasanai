// Side-by-side: reference | render, same height. node scripts/compare.mjs render.png out.png
import { chromium } from 'playwright-core';
import fs from 'fs';
const [render, out] = process.argv.slice(2);
const b64 = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
const exe = '/Users/sibhi-zstch1643/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
await page.setContent(`<body style="margin:0;background:#ece8e1;display:flex;gap:0;align-items:center;justify-content:center;height:1000px">
<img src="${b64('public/reference/rasan.png')}" style="height:880px"><img src="${b64(render)}" style="height:1000px"></body>`);
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
