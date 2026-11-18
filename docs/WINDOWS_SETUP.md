# Windows 10 host setup (laptop, always on, 500 Mbps upload)
Bandwidth is not a limit: 10 listeners ≈ 3.2 Mbps (MP3 320) or ≈ 10 Mbps (FLAC).

## 1. Install
1. Node.js LTS; FFmpeg (`ffmpeg.exe` in PATH).
2. A virtual audio cable (e.g. VB-CABLE). In Dj Ape1 → Audio panel → Output = "CABLE Input".
   To also hear it locally: Windows Sound → Recording → "CABLE Output" → Properties → Listen → play through your speakers.
3. `config.json` → `"source": {"type":"windows","windowsDevice":"CABLE Output (VB-Audio Virtual Cable)"}`
   (list names with `ffmpeg -list_devices true -f dshow -i dummy`).

## 2. Connect the player (needs the patched player build, see player-patch/)
1. Create `%APPDATA%\DjApe1\control.token` containing a random string of 24+ characters (portable: `data\control.token`).
2. `config.json` → `"player": {"enabled": true, "baseUrl": "http://127.0.0.1:47381", "token": "<same string>"}`
   (the player falls back to a random port if 47381 is busy – check djape1.log).
3. Playlist names in a show must match the player's playlist names (case-insensitive).
4. The player window can be in the tray; Windows must not sleep (Power options → Never) and the player/engine should start at login (Task Scheduler → `start-engine.bat`).

## 3. Internet access (listeners are on other networks)
- Check the router WAN IP vs. what "what is my IP" shows. If they differ → CGNAT → port forwarding will NOT work → use a VPS relay or a tunnel.
- If you have a public IP: forward TCP 443 → laptop, add a DDNS name, put **Caddy** in front of the engine for automatic HTTPS (`reverse_proxy localhost:8080`). Never expose port 8080 plain.
- Cloudflare Tunnel: check Cloudflare's current terms for serving audio/video streams before relying on it. Tailscale works but every listener must install it.
