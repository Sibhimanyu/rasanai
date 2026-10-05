// Studio-owned setup. Never run commands or npm scripts from a film folder.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const allowed = ['ffmpeg', 'renderer', 'browser', 'skills'];
if (!Array.isArray(job.tools) || !job.tools.length || job.tools.some(t => !allowed.includes(t))) throw new Error('Invalid tool selection');
const root = path.join(os.homedir(), 'Library', 'Application Support', 'RasanAI', 'Tools');
const bin = path.join(root, 'bin');
const statusFile = path.join(path.dirname(process.argv[2]), 'status.json');
const completed = [];
let stopping = false;
let stopChild;
let stage;
let published;
function status(message, error = null) {
  const temporary = `${statusFile}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ message, completed, error, cancelled: stopping }));
  fs.renameSync(temporary, statusFile);
  console.log(`\n${message}`);
}
function cancel() {
  stopping = true;
  status('Cancelling setup…');
  stopChild?.();
}
process.on('SIGTERM', cancel);
process.on('SIGINT', cancel);
function checkCancellation() { if (stopping) throw new Error('Setup cancelled. Completed installations are kept.'); }
function find(name) {
  return (process.env.PATH || '').split(path.delimiter).map(d => path.join(d, name)).find(p => {
    try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; }
  });
}
function run(executable, args, message, timeout = 900_000) {
  checkCancellation();
  status(message);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: stage || root, detached: true, stdio: ['ignore', 'inherit', 'inherit'] });
    let timedOut = false;
    let grace;
    const signal = s => { if (child.pid) { try { process.kill(-child.pid, s); } catch {} } };
    const stop = () => {
      if (grace) return;
      signal('SIGTERM');
      grace = new Promise(done => setTimeout(() => { signal('SIGKILL'); done(); }, 2000));
    };
    stopChild = stop;
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
    child.on('error', error => { clearTimeout(timer); stopChild = undefined; reject(error); });
    child.on('close', async code => {
      clearTimeout(timer);
      if (grace) await grace;
      signal('SIGTERM');
      stopChild = undefined;
      if (stopping) reject(new Error('Setup cancelled. Completed installations are kept.'));
      else if (timedOut) reject(new Error('This setup step timed out. Check your connection and retry.'));
      else if (code !== 0) reject(new Error(`${message.replace(/…$/, '')} failed (exit ${code}). Open the setup log for details, then retry.`));
      else resolve();
    });
  });
}
function publishLink(name, target) {
  checkCancellation();
  const destination = path.join(bin, name);
  if (fs.existsSync(destination) && !fs.lstatSync(destination).isSymbolicLink()) throw new Error(`Unexpected file at ${destination}. Move it aside before retrying setup.`);
  const temporary = `${destination}.${path.basename(stage)}.tmp`;
  try { fs.symlinkSync(target, temporary); fs.renameSync(temporary, destination); }
  finally { fs.rmSync(temporary, { force: true }); }
}

try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Setup needs Node.js 22+. Choose Automatic in Settings → Director → Advanced to use the bundled Node.');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(root, 'packages'), { recursive: true });
  stage = fs.mkdtempSync(path.join(root, 'packages', '.setup-'));
  // Isolate npm configuration from the film, and keep downloads out of the app bundle.
  fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: 'rasanai-studio-tools', version: '1.0.0', private: true }));
  process.env.PATH = [path.dirname(process.execPath), bin, process.env.PATH].filter(Boolean).join(path.delimiter);
  process.env.npm_config_cache = path.join(root, 'cache');
  process.env.npm_config_update_notifier = 'false';
  process.env.HYPERFRAMES_NO_UPDATE_CHECK = '1';
  process.env.NO_COLOR = '1';
  // Package defaults choose the native architecture and official upstream binaries.
  for (const key of ['FFMPEG_BIN', 'FFPROBE_BIN', 'FFMPEG_BINARIES_URL', 'FFPROBE_BINARIES_URL', 'FFMPEG_BINARY_RELEASE', 'FFPROBE_BINARY_RELEASE', 'npm_config_platform', 'npm_config_arch', 'npm_config_ignore_scripts']) delete process.env[key];
  let renderer = find('hyperframes');
  const needsRenderer = job.tools.includes('renderer') || (!renderer && job.tools.some(t => t === 'browser' || t === 'skills'));
  const packages = [];
  if (job.tools.includes('ffmpeg')) packages.push('ffmpeg-static@5.3.0', '@derhuerst/ffprobe-static@5.3.0');
  if (needsRenderer) packages.push('hyperframes@0.8.127');
  if (packages.length) {
    const npm = find('npm');
    if (!npm) throw new Error('npm is missing. Choose Automatic in Settings → Director → Advanced to use the complete bundled Node distribution.');
    await run(process.execPath, [fs.realpathSync(npm), 'install', '--prefix', stage, '--registry=https://registry.npmjs.org', '--no-audit', '--no-fund', '--progress=false', '--ignore-scripts=false', ...packages], 'Downloading rendering tools…');
    const require = createRequire(path.join(stage, 'package.json'));
    const ffmpeg = job.tools.includes('ffmpeg') ? require('ffmpeg-static') : null;
    const ffprobe = job.tools.includes('ffmpeg') ? require('@derhuerst/ffprobe-static') : null;
    if (ffmpeg && ffprobe) {
      await run(ffmpeg, ['-version'], 'Checking FFmpeg…', 20_000);
      await run(ffprobe, ['-version'], 'Checking media inspection…', 20_000);
    } else if (job.tools.includes('ffmpeg')) throw new Error('FFmpeg is unavailable for this Mac architecture.');
    const rendererEntry = path.join(stage, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');
    if (needsRenderer) await run(process.execPath, [rendererEntry, '--version'], 'Checking HyperFrames…', 20_000);
    checkCancellation();
    const oldStage = stage;
    const installed = path.join(root, 'packages', path.basename(stage).replace('.setup-', 'installed-'));
    fs.renameSync(stage, installed);
    stage = installed; published = installed;
    const moved = p => path.join(installed, path.relative(oldStage, p));
    if (ffmpeg && ffprobe) {
      publishLink('ffmpeg', moved(ffmpeg)); publishLink('ffprobe', moved(ffprobe));
      completed.push('ffmpeg');
    }
    if (needsRenderer) { renderer = moved(rendererEntry); publishLink('hyperframes', renderer); completed.push('renderer'); }
  }
  if (job.tools.includes('browser')) {
    await run(renderer, ['browser', 'ensure'], 'Preparing the render browser…');
    completed.push('browser');
  }
  if (job.tools.includes('skills')) {
    await run(renderer, ['skills', 'update'], 'Installing design resources…');
    completed.push('skills');
  }
  checkCancellation();
  status('Setup finished. Rechecking readiness…');
} catch (error) {
  status(stopping ? 'Setup cancelled.' : 'Setup needs attention.', error.message);
  process.exitCode = stopping ? 130 : 1;
} finally {
  if (stage && stage !== published) fs.rmSync(stage, { recursive: true, force: true });
}
