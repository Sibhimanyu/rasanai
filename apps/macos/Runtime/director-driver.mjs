// App-owned supervisor. Arguments are JSON, never a shell command; stop targets only this child process group.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!job.executable?.startsWith('/') || !Array.isArray(job.arguments) || !job.cwd?.startsWith('/')) throw new Error('Invalid director job');
const child = spawn(job.executable, job.arguments, { cwd: job.cwd, env: process.env, detached: true, stdio: ['ignore', 'inherit', 'inherit'] });
let stopping = false;
let frozen = false;
let forced;
function stop() {
  if (stopping) return;
  stopping = true;
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  try { process.kill(-child.pid, 'SIGCONT'); } catch {} // A stopped group only handles SIGTERM once continued.
  forced = setTimeout(() => {
    try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    process.exit(130);
  }, 2000);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
// Pause freezes the whole director group in place; resume continues it. The driver itself is never stopped.
process.on('SIGUSR1', () => { if (stopping) return; try { process.kill(-child.pid, 'SIGSTOP'); frozen = true; } catch {} });
process.on('SIGUSR2', () => { try { process.kill(-child.pid, 'SIGCONT'); } catch {} frozen = false; });
// If the app dies while the director is frozen nobody could ever continue it, so stop it for real.
const parent = process.ppid;
setInterval(() => { if (frozen && (process.ppid !== parent || process.ppid === 1)) stop(); }, 5000).unref();
child.on('error', () => { console.error('Could not start the configured director executable.'); process.exit(1); });
child.on('exit', code => {
  if (stopping) return; // Give descendants the grace period, even if their parent exits early.
  clearTimeout(forced);
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  process.exit(code ?? 1);
});
