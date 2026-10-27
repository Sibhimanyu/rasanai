// Contact sheet: node scripts/sheet.mjs out.png a.png b.png ...
import { chromium } from 'playwright-core';
import fs from 'fs';
const [out, ...imgs] = process.argv.slice(2);
const b64 = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
const exe = '/Users/sibhi-zstch1643/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const browser = await chromium.launch({ executablePath: exe });
const h = 520, cols = Math.min(4, imgs.length), rows = Math.ceil(imgs.length / cols);
const page = await browser.newPage({ viewport: { width: cols * 450, height: rows * h } });
await page.setContent(`<body style="margin:0;background:#ece8e1;display:grid;grid-template-columns:repeat(${cols},450px)">${imgs.map((p) => `<div style="height:${h}px;display:flex;align-items:center;justify-content:center;font:12px sans-serif;position:relative"><img src="${b64(p)}" style="max-width:450px;max-height:${h}px"><span style="position:absolute;left:6px;top:4px">${p.split('/').pop()}</span></div>`).join('')}</body>`);
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
