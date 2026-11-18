// Dj Ape1 – Streaming Engine (zero dependencies). Phase 1/2 skeleton.
// One FFmpeg encoder per ACTIVE quality; every listener has its own socket queue;
// a listener whose backlog exceeds the limit is disconnected, never blocking others.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const crypto = require('crypto'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const DATA = path.join(ROOT, 'data'); fs.mkdirSync(DATA, { recursive: true });
const LOG = path.join(DATA, 'activity.log');
const log = (ev, d = '') => { const l = `${new Date().toISOString()} ${ev} ${d}`; console.log(l); fs.appendFile(LOG, l + '\n', () => {}); };

// ---------- admin token + access codes (hashed with scrypt) ----------
const tokenFile = path.join(DATA, 'admin.token');
if (!fs.existsSync(tokenFile)) fs.writeFileSync(tokenFile, crypto.randomBytes(24).toString('hex'), { mode: 0o600 });
const ADMIN = fs.readFileSync(tokenFile, 'utf8').trim();
const codesFile = path.join(DATA, 'codes.json');
let codes = fs.existsSync(codesFile) ? JSON.parse(fs.readFileSync(codesFile, 'utf8')) : [];
const saveCodes = () => fs.writeFileSync(codesFile, JSON.stringify(codes, null, 1), { mode: 0o600 });
const hash = (c, salt) => crypto.scryptSync(c, salt, 32).toString('hex');
function newCode(label, maxUses = 1, expiresAt = null) {
  const plain = crypto.randomBytes(6).toString('base64url'), salt = crypto.randomBytes(16).toString('hex');
  codes.push({ id: crypto.randomUUID(), label, salt, hash: hash(plain, salt), maxUses, expiresAt, revoked: false });
  saveCodes(); return plain; // plain text is shown ONCE, never stored
}
function findCode(plain) {
  for (const c of codes) {
    if (c.revoked || (c.expiresAt && Date.now() > c.expiresAt)) continue;
    if (crypto.timingSafeEqual(Buffer.from(hash(plain, c.salt)), Buffer.from(c.hash))) return c;
  }
  return null;
}
const isAdmin = (req, url) => (req.headers['x-admin-token'] || url.searchParams.get('admin')) === ADMIN;

// ---------- rate limit for failed auth ----------
const fails = new Map();
const limited = ip => (fails.get(ip) || []).filter(t => Date.now() - t < 60000).length >= 10;
const fail = ip => fails.set(ip, [...(fails.get(ip) || []).filter(t => Date.now() - t < 60000), Date.now()]);

// ---------- encoders ----------
const encoders = {}; // quality -> {proc, header, listeners:Set}
function inputArgs() {
  const s = cfg.source;
  if (s.type === 'windows') return ['-f', 'dshow', '-i', `audio=${s.windowsDevice}`];
  if (s.type === 'file') return ['-re', '-stream_loop', '-1', '-i', s.path];
  return ['-re', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100']; // test tone
}
function getEncoder(q) {
  if (encoders[q]) return encoders[q];
  const Q = cfg.qualities[q];
  const out = Q.codec === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', Q.bitrate, '-f', 'mp3']
                                : ['-c:a', 'flac', '-f', 'flac'];
  const e = encoders[q] = { header: null, listeners: new Set(), bytes: 0, restarts: 0 };
  const start = () => {
    e.header = null;
    e.proc = spawn('ffmpeg', ['-loglevel', 'error', ...inputArgs(), '-ac', '2', ...out, 'pipe:1']);
    let first = true;
    e.proc.stdout.on('data', chunk => {
      e.bytes += chunk.length;
      if (first && Q.codec === 'flac') { e.header = chunk; first = false; } // FLAC late joiners need the stream header
      for (const l of e.listeners) {
        if (l.res.writableLength > cfg.maxListenerBacklogBytes) { drop(l, 'slow client (backlog)'); continue; }
        l.res.write(chunk);
      }
    });
    e.proc.stderr.on('data', d => log('ENCODER_ERROR', q + ' ' + d.toString().trim()));
    e.proc.on('exit', code => {
      if (e.stopping) return;
      log('ENCODER_EXIT', `${q} code=${code}`); e.restarts++;
      setTimeout(start, Math.min(1000 * e.restarts, 10000)); // engine survives source failure
    });
  };
  start(); return e;
}
function maybeStop(q) {
  const e = encoders[q];
  if (e && e.listeners.size === 0) { e.stopping = true; e.proc.kill(); delete encoders[q]; }
}

// ---------- scheduler + player ----------
const Sched = require('./scheduler'), Adapter = require('./player-adapter');
let player = null;
function onMetaFromPlayer(m) { meta = { ...meta, ...m }; pushMeta(); }
const sched = Sched.create({ file: path.join(DATA, 'schedule.json'), tz: cfg.timezone || 'UTC', log,
  onChange: async show => { meta = { ...meta, show: show ? show.name : '' }; pushMeta();
    if (show && show.playlist && player) { const ok = await player.loadPlaylist(show.playlist); if (!ok) log('SHOW_PLAYLIST_FAILED', show.name); } } });
if (cfg.player && cfg.player.enabled) { player = Adapter.create({ baseUrl: cfg.player.baseUrl, token: cfg.player.token, log, onMeta: onMetaFromPlayer, pollMs: cfg.player.pollMs }); player.start(); }
setInterval(() => sched.tick(), 1000);

// ---------- listeners ----------
const listeners = new Map(); let nextId = 1;
const sse = new Set(); let meta = { artist: '', title: '', album: '', show: '' };
function drop(l, why) { log('LISTENER_DROPPED', `${l.name} ${why}`); l.res.destroy(); }
const pushMeta = () => sse.forEach(r => r.write(`data: ${JSON.stringify(meta)}\n\n`));

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'), ip = req.socket.remoteAddress;
  const json = (o, c = 200) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const body = () => new Promise(r => { let b = ''; req.on('data', d => b += d); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });

  if (url.pathname === '/stream') {
    if (limited(ip)) return json({ error: 'rate limited' }, 429);
    const code = findCode(url.searchParams.get('code') || '');
    if (!code) { fail(ip); log('AUTH_ERROR', ip); return json({ error: 'ACCESS DENIED' }, 403); }
    const used = [...listeners.values()].filter(l => l.codeId === code.id).length;
    if (used >= code.maxUses) return json({ error: 'code in use' }, 403);
    if (listeners.size >= cfg.maxListeners) return json({ error: 'STATION FULL – Maximum 10 listeners.' }, 503);
    let q = url.searchParams.get('q') || cfg.defaultQuality;
    if (!cfg.qualities[q] || (!cfg.allowListenerQualityChange && q !== cfg.defaultQuality)) q = cfg.defaultQuality;
    const e = getEncoder(q), l = { id: nextId++, res, q, codeId: code.id, since: Date.now(),
      name: (url.searchParams.get('name') || 'listener').slice(0, 30) };
    res.writeHead(200, { 'Content-Type': cfg.qualities[q].mime, 'Cache-Control': 'no-store', 'icy-name': cfg.stationName, 'X-Actual-Quality': q });
    if (e.header) res.write(e.header);
    e.listeners.add(l); listeners.set(l.id, l); log('LISTENER_CONNECTED', `${l.name} ${q}`);
    res.on('close', () => { e.listeners.delete(l); listeners.delete(l.id); log('LISTENER_DISCONNECTED', l.name); maybeStop(q); });
    return;
  }
  if (url.pathname === '/events') { // metadata push for listeners (code required)
    if (!findCode(url.searchParams.get('code') || '')) return json({ error: 'ACCESS DENIED' }, 403);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
    sse.add(res); res.write(`data: ${JSON.stringify(meta)}\n\n`); req.on('close', () => sse.delete(res)); return;
  }
  if (url.pathname.startsWith('/api/')) {
    if (!isAdmin(req, url)) { fail(ip); return json({ error: 'unauthorized' }, 401); }
    const P = url.pathname, post = req.method === 'POST';
    if (P === '/api/status') return json({
      station: cfg.stationName, connected: listeners.size, max: cfg.maxListeners, meta,
      listeners: [...listeners.values()].map(l => ({ id: l.id, name: l.name, quality: l.q, backlog: l.res.writableLength, seconds: Math.round((Date.now() - l.since) / 1000) })),
      encoders: Object.fromEntries(Object.entries(encoders).map(([k, e]) => [k, { bytes: e.bytes, restarts: e.restarts }])),
      codes: codes.map(c => ({ id: c.id, label: c.label, maxUses: c.maxUses, expiresAt: c.expiresAt, revoked: c.revoked })),
      uptime: Math.round(process.uptime()), rssMB: Math.round(process.memoryUsage().rss / 1e6) });
    if (P === '/api/codes' && post) return body().then(d => json({ code: newCode(d.label || 'code', d.maxUses || 1, d.expiresAt || null) }));
    if (P === '/api/revoke' && post) return body().then(d => { const c = codes.find(x => x.id === d.id); if (c) { c.revoked = true; saveCodes(); listeners.forEach(l => l.codeId === c.id && drop(l, 'code revoked')); } json({ ok: !!c }); });
    if (P === '/api/kick' && post) return body().then(d => { const l = listeners.get(d.id); if (l) drop(l, 'kicked by host'); json({ ok: !!l }); });
    if (P === '/api/meta' && post) return body().then(d => { meta = { ...meta, ...d }; pushMeta(); json(meta); });
    if (P === '/api/schedule' && !post && req.method === 'GET') { sched.tick(); return json({ tz: cfg.timezone, now: sched.now(), shows: sched.list(), current: sched.current(), next: sched.next() }); }
    if (P === '/api/schedule' && post) return body().then(d => { const r = sched.add(d); json(r, r.error ? (r.status || 400) : 200); });
    if (P === '/api/schedule' && req.method === 'DELETE') { sched.remove(url.searchParams.get('id')); return json({ ok: true }); }
    if (P === '/api/override' && post) return body().then(d => { d.clear ? sched.clearOverride() : sched.setOverride(d.show || {}, d.minutes || 30); json({ ok: true }); });
    if (P === '/api/schedule/pause' && post) return body().then(d => { sched.setPaused(!!d.paused); json({ ok: true }); });
    if (P === '/api/player') return json(player ? player.status() : { connected: false, enabled: false });
    if (P === '/api/player/cmd' && post) return body().then(async d => { if (!player || !['play','pause','next','prev'].includes(d.cmd)) return json({ error: 'unavailable' }, 400); try { await player[d.cmd](); json({ ok: true }); } catch (e) { log('PLAYER_ERROR', e.message); json({ error: e.message }, 502); } });
    if (P === '/api/logs') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(fs.existsSync(LOG) ? fs.readFileSync(LOG) : ''); }
    return json({ error: 'not found' }, 404);
  }
  if (url.pathname === '/guide') { sched.tick(); // listener program guide (code required); time comes from the server, not the browser
    if (!findCode(url.searchParams.get('code') || '')) return json({ error: 'ACCESS DENIED' }, 403);
    const strip = ({ id, name, start, end, genre, dj, desc, days }) => ({ id, name, start, end, genre, dj, desc, days });
    return json({ tz: cfg.timezone, now: sched.now(), nowShow: sched.current() && strip(sched.current()), next: sched.next() && { inMinutes: sched.next().inMinutes, show: strip(sched.next().show) }, week: sched.list().filter(s => s.enabled !== false).map(strip) });
  }
  if (url.pathname.startsWith('/assets/')) { const f = path.join(ROOT, 'web', 'assets', path.basename(url.pathname)); if (!fs.existsSync(f)) return json({ error: 'not found' }, 404);
    res.writeHead(200, { 'Content-Type': f.endsWith('.png') ? 'image/png' : 'image/jpeg', 'Cache-Control': 'max-age=86400' }); return res.end(fs.readFileSync(f)); }
  const f = { '/': 'listener.html', '/host': 'host.html' }[url.pathname];
  if (!f) return json({ error: 'not found' }, 404);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(ROOT, 'web', f)));
});
server.listen(cfg.port, cfg.bindHost || '0.0.0.0', () => { log('ENGINE_STARTED', `port ${cfg.port}`); console.log(`Host panel: http://localhost:${cfg.port}/host  (admin token: data/admin.token)`); });
process.on('SIGINT', () => { Object.values(encoders).forEach(e => { e.stopping = true; e.proc.kill(); }); process.exit(0); });
