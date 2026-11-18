# Player control protocol (Dj Ape1 Player ⇄ Engine)
Local only (bind 127.0.0.1), every request `Authorization: Bearer <token>` (token in config.json, never in frontend/GitHub).
- `GET  /api/status` → `{"state":"playing|paused|stopped","artist","title","album","genre","playlist"}`
- `POST /api/play | /api/pause | /api/stop | /api/next | /api/prev` (body `{}`)
- `POST /api/playlist` body `{"name":"JazzList"}` → loads the named playlist
The engine polls status every 2 s, logs PLAYER_CONNECTED / PLAYER_DISCONNECTED / PLAYER_ERROR and keeps streaming if the player dies.
`tools/mock-player.js` is a DEV-ONLY stand-in; final acceptance requires the real player (spec §15).
