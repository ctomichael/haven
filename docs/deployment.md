# Deploying Haven

Where Haven lives in production and how to keep it updated. The dev
workflow (`bun install`, `bun run dev`, `make db-up`) is unchanged — this
doc is about the Beelink Ubuntu VM.

## Topology

```
┌──────────────┐   git push   ┌──────────┐   git pull / autopull   ┌──────────────────┐
│ Laptop (Mac) │ ───────────▶ │  GitHub  │ ───────────────────────▶│ Beelink Ubuntu VM│
│              │              │ (canon.) │                         │  /opt/haven      │
└──────────────┘              └──────────┘                         └──────────────────┘
                                                                            │
                                              systemd: haven-backend   ─────┤
                                              systemd: haven-dashboard ─────┤
                                              systemd: haven-autopull.timer ┤
                                              docker:  postgres         ────┤
                                              caddy:   reverse proxy + TLS ─┘
```

Three long-running services + a 4h timer + a Postgres container.

| Process              | Port      | Notes                                  |
|----------------------|-----------|----------------------------------------|
| haven-backend        | 8080      | Hono on Bun                            |
| haven-dashboard      | 3000      | SvelteKit SSR via adapter-node         |
| caddy                | 80, 443   | Public TLS edge → 8080 / 3000          |
| postgres (docker)    | 5432      | pgvector/pgvector:pg16                 |
| whisper-cli          | —         | Spawned by backend per transcription   |
| ffmpeg               | —         | Spawned by backend (audio → 16 kHz WAV)|

## Prerequisites

- Ubuntu 22.04 LTS or newer on the Beelink VM
- SSH access as a sudoer
- A domain you can put a wildcard or `haven.*` A record on, with DNS at
  Cloudflare (so we can get TLS via DNS-01 challenge with no inbound
  ports open)
- A Cloudflare API token with `Zone:Read` + `DNS:Edit` scoped to the zone
- A GitHub SSH deploy key for the repo (read-only is enough for pulls;
  read-write only if Hermes-dispatched commits need to push from the
  Beelink)

## First install

1. **Clone the repo** to `/opt/haven` as your sudoer user:

   ```bash
   sudo git clone git@github.com:<you>/haven.git /opt/haven
   ```

2. **Run the installer** (idempotent — safe to re-run):

   ```bash
   cd /opt/haven
   sudo ./infra/install.sh
   ```

   This installs Bun, Docker, Node + squawk-cli, ffmpeg, whisper.cpp
   (built from source — first run ~3 min) with the `ggml-base.en`
   model, and Caddy (base). It then creates the `haven` system user,
   brings up Postgres, applies migrations, builds the dashboard,
   installs systemd units, and starts everything.

3. **Fill in `/etc/haven/.env`**:

   ```bash
   sudoedit /etc/haven/.env
   ```

   Set at minimum: `CADDY_DOMAIN`, `CF_API_TOKEN`, a strong
   `DATABASE_URL` password.

4. **Build Caddy with the Cloudflare module** (see next section).

5. **Restart**:

   ```bash
   sudo systemctl restart haven-backend haven-dashboard caddy
   ```

6. **Verify**:

   ```bash
   curl -s http://127.0.0.1:8080/api/health | jq
   journalctl -u haven-backend -u haven-dashboard -u caddy -f
   ```

   Then hit `https://$CADDY_DOMAIN` from another device on the LAN.

## Caddy + Cloudflare DNS

The base Caddy from apt doesn't ship with DNS providers. We need
`caddy-dns/cloudflare` so cert renewal works without port 80 forwarding.

Build once with `xcaddy`:

```bash
# Install Go (only needed for this one-time build)
sudo apt-get install -y golang-go

# Install xcaddy
sudo curl -fsSL https://github.com/caddyserver/xcaddy/releases/latest/download/xcaddy_linux_amd64 \
  -o /usr/local/bin/xcaddy
sudo chmod +x /usr/local/bin/xcaddy

# Build a Caddy binary with the Cloudflare DNS module
sudo xcaddy build \
  --with github.com/caddy-dns/cloudflare \
  --output /usr/local/bin/caddy-cf

# Swap the binary
sudo systemctl stop caddy
sudo mv /usr/local/bin/caddy-cf /usr/bin/caddy
sudo systemctl start caddy
```

Then uncomment the `tls { dns cloudflare {$CF_API_TOKEN} }` block in
`/etc/caddy/Caddyfile` and reload:

```bash
sudo systemctl reload caddy
```

First-time cert issue takes 30–60s. Watch logs:

```bash
journalctl -u caddy -f
```

## Updates

### Manual (most common)

From any machine, SSH in and run:

```bash
ssh beelink
cd /opt/haven
sudo make deploy
```

`make deploy` does: `git pull`, `bun install --frozen-lockfile`,
`db:migrate`, dashboard build, `systemctl restart`. Whole thing takes
~10–30 seconds on a small change.

### Automatic (every 4h)

`haven-autopull.timer` runs `infra/autopull.sh` on a 4-hour cadence.
The script does `git fetch`; if `origin/main` advanced, it pulls and
re-deploys. Otherwise no-op. Logs land in journalctl:

```bash
journalctl -u haven-autopull
systemctl list-timers haven-autopull.timer
```

Trigger manually:

```bash
sudo systemctl start haven-autopull.service
```

### Hermes-dispatched widget commits

Hermes invokes Claude Code with a plan envelope; Claude Code edits
files in `/opt/haven`, commits with `widget: <slug> — <task_id>`, pushes
to GitHub. The dev-server file watcher rebuilds immediately — no need
to wait for the 4h autopull. (Migrations in the same commit are still
applied via the standard `db:migrate` path on the next backend restart;
`make deploy` after the commit does both at once.)

## Backups

Nightly via cron (set this up once):

```bash
echo '0 3 * * * root cd /opt/haven && make backup-db' \
  | sudo tee /etc/cron.d/haven-backup
```

`make backup-db` writes `/var/haven/backups/haven-YYYYMMDD-HHMMSS.sql.gz`
and keeps the last 14. Attachments live at `/var/haven/attachments` —
rsync that directory off-machine on the same schedule if it grows large
(weekly is fine for v1).

### Restore

```bash
sudo make restore-db BACKUP=/var/haven/backups/haven-20260622-030000.sql.gz
```

This pipes the dump back into the running Postgres. Stop the backend
first if you want a clean reset:

```bash
sudo systemctl stop haven-backend haven-dashboard
sudo make restore-db BACKUP=...
sudo systemctl start haven-backend haven-dashboard
```

## Rollback

Every widget is one commit by design. To remove one:

```bash
sudo -u haven git revert <sha>
sudo make deploy
```

If the commit included a migration, the migration is **forward only** —
write a new migration that reverses the change, or restore the previous
night's `pg_dump`.

## Logs

```bash
journalctl -u haven-backend -f       # API + SSE
journalctl -u haven-dashboard -f     # SvelteKit SSR
journalctl -u caddy -f               # TLS + reverse proxy
journalctl -u haven-autopull -f      # Update timer
docker compose -f /opt/haven/docker-compose.yml logs -f postgres
```

## Voice transcription

`/api/voice/transcribe` runs locally — no audio leaves the box.
`infra/install.sh` builds whisper.cpp from source and downloads the
`ggml-base.en` model (~145 MB) to `/opt/whisper-models/`. Defaults
land in `/etc/haven/.env`:

```
WHISPER_BIN=/usr/local/bin/whisper-cli
WHISPER_MODEL=/opt/whisper-models/ggml-base.en.bin
FFMPEG_BIN=/usr/bin/ffmpeg
```

Swap to a bigger / smaller model by changing `WHISPER_MODEL` and
restarting the backend. Reference cost on a small Beelink: base.en
runs ~2–4× real time, small.en ~1× real time. Quick check:

```bash
curl -sS -X POST http://127.0.0.1:8080/api/voice/transcribe \
  -F file=@/path/to/clip.webm
```

## Cheat sheet

| Action                              | Command                                              |
|-------------------------------------|------------------------------------------------------|
| Deploy now                          | `sudo make deploy`                                   |
| Trigger autopull                    | `sudo systemctl start haven-autopull.service`        |
| Check service status                | `systemctl status haven-backend haven-dashboard`     |
| Tail all logs                       | `journalctl -u haven-* -u caddy -f`                  |
| Inspect Postgres                    | `make db-psql`                                       |
| Run the MCP smoke test              | `sudo -u haven bun --filter @haven/mcp run smoke`    |
| Quick voice transcribe test         | `curl -F file=@clip.webm 127.0.0.1:8080/api/voice/transcribe` |
| Back up the DB                      | `sudo make backup-db`                                |
| Restore from a dump                 | `sudo make restore-db BACKUP=path.sql.gz`            |
| Restart everything                  | `sudo systemctl restart haven-backend haven-dashboard caddy` |
