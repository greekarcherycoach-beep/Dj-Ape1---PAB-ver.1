# Dj Ape1 – Private Audio Broadcast (Phase 1–2 skeleton)

Zero-dependency Node.js engine + FFmpeg. Run: `node engine/server.js`
- Listener: http://localhost:8080/   Host: http://localhost:8080/host
- Admin token: `data/admin.token` (created on first run, never commit `data/`)
- Source: `config.json` → `source.type`: `test` (sine), `file`, or `windows` (dshow device, e.g. a Virtual Audio Cable / "virtual-audio-capturer")
- Tests: start the engine, then `node tests.js`

## Status (honest)
Tested for real (Linux, test-tone source): auth, 10-listener cap, 11th rejected, per-listener sockets, fast client unaffected by a stalled one, FLAC late-join header.
NOT tested yet: Windows capture, internet/TURN/VPS, slow-client *drop* threshold, Android, 10 real clients on real networks, Music Player integration.

## Review of the spec – main findings
1. **Contradiction §2.1**: "build a new Music Player (automix, key/BPM phases)" vs §19 "do NOT build a Music Player". Decision proposed: Dj Ape1 owns planning/scheduling; an existing player plays. The existing music_library app can be the playlist/phase planner.
2. **Browser cannot capture Windows system audio reliably** → capture must live in the native engine (FFmpeg/WASAPI loopback), UI is only a control panel.
3. **No public IP assumed (§7)** → either a cheap VPS relay or a tunnel (Cloudflare Tunnel/Tailscale Funnel). Engine already speaks plain HTTPS-friendly HTTP, so it sits behind any reverse proxy with TLS.
4. **FLAC vs MP3 "no re-encoding" (§3)**: a live capture must be encoded once; "no per-listener re-encode" = one encoder per active quality (implemented). FLAC ≈ 0.7–1 Mbps per listener → 10 listeners ≈ 10 Mbps upload; check the host's upstream.
5. **FLAC in browsers**: fine in Chrome/Firefox/Android; Safari/iOS weak. MP3 is the safe default.
6. **WebRTC rejected** for this use: needs TURN, per-peer encoding, and gives no benefit for one-way audio where 3–5 s buffering is accepted. Chunked HTTP gives independent buffers, trivial reconnect, proxy/TLS friendliness.
7. **Auto DJ control depends on the player.** Candidates to evaluate in Phase 3: foobar2000 (beefweb/ControlServer plugin, HTTP API, playlists, metadata), VLC (HTTP interface, weaker metadata/playlists), MPD (excellent API, Windows ports less polished), AIMP (limited). Proposal: **foobar2000 + beefweb** – to be confirmed by real tests before Auto DJ is built.
8. **Time**: scheduler must run server-side (engine), timezone via IANA zone + Intl, not browser clock (§18.7) – listeners get server time offset.
9. **Gaps**: no spec for HTTPS certificate handling, backup/restore of schedule, max upstream measurement, legal note on rebroadcasting copyrighted music to remote users (private use ≠ automatically licence-free).
10. §20.2 asks for approval before dropping requirements: items deferred below need your OK.

## Architecture
```
 Music Player ──audio──▶ [Virtual Audio Cable / WASAPI loopback]
      ▲ control/metadata                    │
 Auto DJ ◀── Scheduler (engine, server time)▼
      │                              FFmpeg encoder(s): 1 per active quality (mp3_320 / mp3_192 / flac)
 Host UI ──REST/SSE──▶ ENGINE (separate process/service) ──chunked HTTP(S)──▶ each listener has its own socket queue
                                   │  backlog > limit → that listener is dropped, others unaffected
                                   └ auth: scrypt-hashed access codes, rate limit, revoke, expiry, max uses
```
Engine = separate process from the UI (closing the host window keeps broadcasting). Planned Windows service wrapper: Phase 5.

## Phases (per §17)
1 ✅ engine skeleton + minimal Host/Listener UI (not yet the vintage Hi-Fi design)
2 ◔ real streaming started: encoders, buffering policy, auth. Next: Windows dshow/WASAPI test, bitrate display, silence detection, reverse proxy/VPS guide
3 Music Player evaluation + Auto DJ + Scheduler
4 Hardening/logs export/monitoring (CPU, bandwidth)
5 Tauri/Electron wrapper, installer + portable
6 Capacitor Android listener (foreground service)
7 Docs, GitHub release
Deferred pending your approval: separate module folders from §11.2 (will be created when code exists), logo (file not provided in upload).

## Update – Phase 3 started
- Logo integrated (listener card, host header, favicon). Scheduler (`engine/scheduler.js`): server-side tz (`config.timezone`), weekly/dated shows, overnight shows, overlap check (409), manual override/pause, `/guide?code=` for listeners.
- Player adapter (`engine/player-adapter.js`) per `docs/PLAYER_API.md`; set `player.enabled:true` + token in config.json.
- Tested with a mock player: show start → playlist load → metadata, override and return to schedule, player death does not stop the engine.
- NOT done: real Dj Ape1 player (its control API is not known yet), Program Guide UI, schedule editor UI, Windows capture test.

## Update – Phase 3 UI + VPN access
- Host panel: schedule editor (days, times, genre, playlist, DJ), overlap warning, manual override / return to schedule / pause schedule, player status and prev/play/pause/next.
- Listener: LISTEN NOW / SCHEDULE tabs (audio keeps playing), NOW PLAYING SHOW, UP NEXT with countdown, per-day guide with LIVE marker, server time.
- Access via VPN: listeners reach `http://<laptop-vpn-ip>:8080/`. Set `bindHost` in config.json to the laptop's VPN IP to refuse LAN/Internet connections (default 0.0.0.0). Traffic is encrypted by the VPN; browser Notifications need a secure context (HTTPS), so they will not work over plain http (in-page notices only).
- Tests: `tests.js` (streaming), `tests_sched.js` (scheduler+player, mock), `tests_overnight.js` (overnight shows). UI pages were syntax-checked and the endpoints exercised with curl, but not yet opened in a real browser.
