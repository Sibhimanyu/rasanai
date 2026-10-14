import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rasanai-driver-test-'));
const driver = new URL('../Runtime/director-driver.mjs', import.meta.url);
function job(arguments_) {
  const file = path.join(root, `job-${Math.random()}.json`);
  fs.writeFileSync(file, JSON.stringify({ executable: process.execPath, arguments: arguments_, cwd: root }));
  return file;
}
try {
  const result = spawnSync(process.execPath, [driver.pathname, job(['-e', 'process.exit(7)'])]);
  assert.equal(result.status, 7, 'director exit status is propagated');
  const child = spawn(process.execPath, [driver.pathname, job(['-e', 'console.log(process.pid); setInterval(()=>{},1000)'])], { stdio: ['ignore', 'pipe', 'pipe'] });
  const pid = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('driver did not start its child')), 5000);
    child.stdout.once('data', data => { clearTimeout(timer); resolve(Number(String(data).trim())); });
    child.once('error', reject);
  });
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve));
  await delay(100);
  assert.throws(() => process.kill(pid, 0), 'stop terminates the child');
  // Freeze: ticks stop on SIGUSR1, resume on SIGUSR2, and SIGTERM while frozen still exits promptly.
  const ticker = spawn(process.execPath, [driver.pathname, job(['-e', 'setInterval(()=>console.log("tick"),100)'])], { stdio: ['ignore', 'pipe', 'pipe'] });
  let ticks = 0;
  ticker.stdout.on('data', data => { ticks += String(data).split('tick').length - 1; });
  await delay(600);
  assert.ok(ticks > 0, 'ticks arrive before freezing');
  ticker.kill('SIGUSR1');
  await delay(300);
  const frozenAt = ticks;
  await delay(700);
  assert.equal(ticks, frozenAt, 'no ticks while frozen');
  ticker.kill('SIGUSR2');
  await delay(700);
  assert.ok(ticks > frozenAt, 'ticks resume after SIGUSR2');
  ticker.kill('SIGUSR1');
  await delay(300);
  const started = Date.now();
  ticker.kill('SIGTERM');
  await new Promise(resolve => ticker.once('exit', resolve));
  assert.ok(Date.now() - started < 3000, 'SIGTERM while frozen exits promptly');
  console.log('Supervisor exit/stop/freeze tests passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
