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
  console.log('Supervisor exit/stop tests passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
