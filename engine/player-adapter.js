// Dj Ape1 Player Adapter. Talks to the external Player over a LOCAL, token-protected HTTP control API.
// Protocol the player must expose (127.0.0.1 only, Authorization: Bearer <token>):
//   GET  /api/status   -> {state:'playing'|'paused'|'stopped', artist,title,album,genre,playlist}
//   POST /api/play | /api/pause | /api/stop | /api/next | /api/prev
//   POST /api/playlist {name}
// A player failure never throws into the engine: it is logged and retried.
'use strict';
function create({ baseUrl, token, log, onMeta, pollMs = 2000 }) {
  let up = false, last = {}, timer;
  const call = async (path, body) => {
    const r = await fetch(baseUrl + path, { method: body === undefined && path === '/api/status' ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new Error('HTTP ' + r.status); return r.json().catch(() => ({}));
  };
  async function poll() {
    try {
      const s = await call('/api/status');
      if (!up) { up = true; log('PLAYER_CONNECTED', baseUrl); }
      if (s.title !== last.title || s.artist !== last.artist) onMeta({ artist: s.artist || '', title: s.title || '', album: s.album || '' });
      last = s;
    } catch (e) { if (up) log('PLAYER_DISCONNECTED', e.message); up = false; }
  }
  return {
    start() { poll(); timer = setInterval(poll, pollMs); }, stop() { clearInterval(timer); },
    status: () => ({ connected: up, ...last }),
    play: () => call('/api/play', {}), pause: () => call('/api/pause', {}), stop_: () => call('/api/stop', {}),
    next: () => call('/api/next', {}), prev: () => call('/api/prev', {}),
    async loadPlaylist(name) { // success only if the player confirms the playlist is really loaded (name unknown → false)
      try {
        await call('/api/playlist', { name });
        for (let i = 0; i < 8; i++) { await new Promise(r => setTimeout(r, 500)); const s = await call('/api/status'); if (s.playlist === name) { await call('/api/play', {}); log('PLAYLIST_CHANGED', name); return true; } }
        log('PLAYER_ERROR', `playlist "${name}" not found/loaded`); return false;
      } catch (e) { log('PLAYER_ERROR', `playlist "${name}": ${e.message}`); return false; } }
  };
}
module.exports = { create };
