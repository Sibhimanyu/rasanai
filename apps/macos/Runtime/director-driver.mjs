// App-owned supervisor. Arguments are JSON, never a shell command; stop targets only this child process group.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
let stopping = false;
let frozen = false;
let forced;
let child;
// The run's record of when its director ran (RunEvents.swift reads it). It outlives the app, so a relaunched Studio can
// reattach to a director that is still working, or resume one that stopped while it was closed.
const eventsFile = path.join(path.dirname(process.argv[2]), 'director-events.jsonl');
function event(fields) { try { fs.appendFileSync(eventsFile, JSON.stringify({ t: new Date().toISOString(), ...fields }) + '\n'); } catch {} }
// Pause freezes the whole director group in place; resume continues it. The driver itself is never stopped. Installed before
// the spawn: Node's default for SIGUSR1/2 would end the driver if a pause arrived first.
process.on('SIGUSR1', () => { if (stopping || !child) return; try { process.kill(-child.pid, 'SIGSTOP'); frozen = true; event({ event: 'freeze' }); } catch {} });
process.on('SIGUSR2', () => { if (!child) return; try { process.kill(-child.pid, 'SIGCONT'); } catch {} if (frozen) event({ event: 'thaw' }); frozen = false; });
const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!job.executable?.startsWith('/') || !Array.isArray(job.arguments) || !job.cwd?.startsWith('/')) throw new Error('Invalid director job');
child = spawn(job.executable, job.arguments, { cwd: job.cwd, env: process.env, detached: true, stdio: ['ignore', 'inherit', 'inherit'] });
event({ event: 'start', pid: process.pid });
let orphaned = false;
function stop() {
  if (stopping) return;
  stopping = true;
  // Written now: the forced exit below may not leave time later. Stopped by the person, or by the app going away while frozen.
  event({ event: 'exit', code: 130, stopped: true, ...(loopStopped ? { reason: 'loop-while-app-closed' } : orphaned ? { reason: 'app-closed-while-paused' } : {}) });
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  try { process.kill(-child.pid, 'SIGCONT'); } catch {} // A stopped group only handles SIGTERM once continued.
  forced = setTimeout(() => {
    try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    process.exit(130);
  }, 2000);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
// If the app dies while the director is frozen nobody could ever continue it, so stop it for real.
const parent = process.ppid;
setInterval(() => { if (frozen && (process.ppid !== parent || process.ppid === 1)) { orphaned = true; stop(); } }, 5000).unref();
// If the app crashed or was force-quit, nobody watches for loops any more, so the driver does: the same tool call with the
// same input this many times in a row (console waits and wake-ups excepted) stops the director rather than burning tokens.
const LOOP_REPEATS = 5;
const logFile = path.join(path.dirname(process.argv[2]), 'director.log');
let logOffset = (() => { try { return fs.statSync(logFile).size; } catch { return 0; } })();
let partial = '';
let lastCall = null;
let repeats = 0;
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])]));
  return value;
}
function exempt(name, input) {
  if (name === 'ScheduleWakeup') return true;
  const command = typeof input?.command === 'string' ? input.command : '';
  return name === 'Bash' && command.includes('console.mjs') && /\swait\b/.test(command);
}
function watchForLoop() {
  if (stopping || frozen) return;
  let chunk = '';
  try {
    const size = fs.statSync(logFile).size;
    if (size < logOffset) logOffset = 0;
    if (size === logOffset) return;
    const fd = fs.openSync(logFile, 'r');
    const buffer = Buffer.alloc(Math.min(size - logOffset, 4 * 1024 * 1024));
    fs.readSync(fd, buffer, 0, buffer.length, logOffset); fs.closeSync(fd);
    logOffset += buffer.length; chunk = buffer.toString('utf8');
  } catch { return; }
  const lines = (partial + chunk).split('\n');
  partial = lines.pop() ?? '';
  for (const line of lines) {
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    if (message?.type !== 'assistant' || message.parent_tool_use_id) continue;
    for (const part of message.message?.content ?? []) {
      if (part?.type !== 'tool_use' || exempt(part.name, part.input)) continue;
      const call = part.name + ' ' + JSON.stringify(sorted(part.input ?? {}));
      repeats = call === lastCall ? repeats + 1 : 1;
      lastCall = call;
      if (repeats >= LOOP_REPEATS) { orphaned = true; loopStopped = true; stop(); return; }
    }
  }
}
let loopStopped = false;
setInterval(() => { if (process.ppid !== parent || process.ppid === 1) watchForLoop(); else { try { logOffset = fs.statSync(logFile).size; } catch {} partial = ''; } }, 15000).unref();
child.on('error', () => { event({ event: 'exit', code: 1, stopped: false }); console.error('Could not start the configured director executable.'); process.exit(1); });
child.on('exit', code => {
  if (stopping) return; // Give descendants the grace period, even if their parent exits early.
  clearTimeout(forced);
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  event({ event: 'exit', code: code ?? 1, stopped: false });
  process.exit(code ?? 1);
});
