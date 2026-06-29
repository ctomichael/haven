#!/bin/sh
# Haven — idempotent installer for Ubuntu/Debian on the Beelink.
#
# Designed to run as root (or via sudo). Re-running is safe: every step
# is gated on a presence check or otherwise idempotent. Output goes to
# stdout; on a fresh box first run takes ~3–5 minutes.
#
# Steps:
#   1.  Verify environment (root, Linux, repo location)
#   2.  Apt: base packages
#   3.  Bun (system-wide at /usr/local/bun)
#   4.  Docker engine
#   5.  Node + squawk-cli (for migration safety lint)
#   5b. ffmpeg + whisper.cpp built from source + ggml-base.en model
#       (powers /api/voice/transcribe — first build ~3 min)
#   6.  Caddy (base apt — Cloudflare DNS module is a separate step;
#       see docs/deployment.md)
#   7.  haven system user + /var/haven/{attachments,backups}
#   8.  /etc/haven/.env from template
#   9.  Repo ownership + bun install --frozen-lockfile
#   10. Postgres container up + healthy + migrations applied
#   11. Build dashboard
#   12. Install systemd units + timer
#   13. Install /etc/caddy/Caddyfile from template
#   14. Print next-steps banner

set -eu

REPO_DIR="${HAVEN_REPO_DIR:-/opt/haven}"
ENV_FILE="${HAVEN_ENV_FILE:-/etc/haven/.env}"
HAVEN_USER="${HAVEN_USER:-haven}"
HAVEN_DATA_DIR="${HAVEN_DATA_DIR:-/var/haven}"
BUN_HOME="${BUN_HOME:-/usr/local/bun}"

log() { printf '\033[1;34m[haven-install]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[haven-install]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[haven-install]\033[0m %s\n' "$*" >&2; exit 1; }

# ---- 1. Environment checks ------------------------------------------------

[ "$(id -u)" -eq 0 ] || die "Run as root (use sudo)."
[ "$(uname -s)" = "Linux" ] || die "install.sh targets Linux (Beelink Ubuntu)."
[ -d "$REPO_DIR" ] || die "Repo not found at $REPO_DIR. Clone first, then re-run."
[ -f "$REPO_DIR/package.json" ] || die "$REPO_DIR doesn't look like the Haven repo."

# ---- 2. Apt base ----------------------------------------------------------

log "Updating apt + base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -qq -y \
  ca-certificates curl git make build-essential \
  gnupg lsb-release apt-transport-https debian-keyring debian-archive-keyring

# ---- 3. Bun ---------------------------------------------------------------

if [ ! -x "$BUN_HOME/bin/bun" ]; then
  log "Installing Bun system-wide at $BUN_HOME"
  # The Bun installer uses bash-isms (arrays, [[ ]]); piping to `sh` fails
  # on Ubuntu where /bin/sh is dash. Force bash explicitly.
  command -v bash >/dev/null 2>&1 || apt-get install -qq -y bash
  curl -fsSL https://bun.sh/install | BUN_INSTALL="$BUN_HOME" bash
fi
ln -sf "$BUN_HOME/bin/bun" /usr/local/bin/bun
ln -sf "$BUN_HOME/bin/bunx" /usr/local/bin/bunx

# ---- 4. Docker ------------------------------------------------------------

if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker engine"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null

# ---- 5. Node + squawk-cli -------------------------------------------------

if ! command -v node >/dev/null 2>&1; then
  log "Installing Node.js 20 (needed for squawk-cli)"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -qq -y nodejs
fi
if ! command -v squawk >/dev/null 2>&1; then
  log "Installing squawk-cli globally"
  npm install -g squawk-cli >/dev/null
fi

# ---- 5b. ffmpeg + whisper.cpp (voice transcription) ---------------------

apt-get install -qq -y ffmpeg cmake

WHISPER_SRC="${WHISPER_SRC:-/opt/whisper.cpp}"
WHISPER_MODEL_DIR="${WHISPER_MODEL_DIR:-/opt/whisper-models}"
WHISPER_MODEL_FILE="$WHISPER_MODEL_DIR/ggml-base.en.bin"

if ! command -v whisper-cli >/dev/null 2>&1; then
  log "Building whisper.cpp from source (~3 min)"
  if [ ! -d "$WHISPER_SRC" ]; then
    git clone --depth 1 https://github.com/ggerganov/whisper.cpp "$WHISPER_SRC"
  fi
  # whisper.cpp switched to CMake in v1.7+ — the `make whisper-cli` target
  # was removed. Detect and use whichever build system the checkout has.
  if [ -f "$WHISPER_SRC/CMakeLists.txt" ]; then
    (cd "$WHISPER_SRC" \
      && cmake -B build >/dev/null \
      && cmake --build build -j"$(nproc 2>/dev/null || echo 2)" --target whisper-cli >/dev/null)
  else
    (cd "$WHISPER_SRC" && make -j"$(nproc 2>/dev/null || echo 2)" whisper-cli >/dev/null)
  fi
  # New layout puts the binary under build/bin/; older layouts at the root.
  if [ -x "$WHISPER_SRC/build/bin/whisper-cli" ]; then
    ln -sf "$WHISPER_SRC/build/bin/whisper-cli" /usr/local/bin/whisper-cli
  elif [ -x "$WHISPER_SRC/whisper-cli" ]; then
    ln -sf "$WHISPER_SRC/whisper-cli" /usr/local/bin/whisper-cli
  else
    warn "whisper-cli binary not found after build — check $WHISPER_SRC"
  fi
fi

if [ ! -f "$WHISPER_MODEL_FILE" ]; then
  log "Downloading whisper base.en model (~145 MB)"
  mkdir -p "$WHISPER_MODEL_DIR"
  curl -fsSL -o "$WHISPER_MODEL_FILE" \
    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
fi

# ---- 6. Caddy (base) ------------------------------------------------------
# Skip with HAVEN_INSTALL_CADDY=no when you already have a reverse proxy
# (e.g. a Docker Caddy container on the host). See docs/deployment.md
# "Running behind an existing reverse proxy".

INSTALL_CADDY="${HAVEN_INSTALL_CADDY:-yes}"

if [ "$INSTALL_CADDY" != "yes" ]; then
  log "Skipping Caddy install (HAVEN_INSTALL_CADDY=$INSTALL_CADDY)"
elif ! command -v caddy >/dev/null 2>&1; then
  log "Installing Caddy (base) from official apt repo"
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -qq -y caddy
  warn "Caddy installed without the Cloudflare DNS module."
  warn "For TLS via DNS challenge, follow docs/deployment.md (xcaddy build)."
fi

# ---- 7. haven user + dirs -------------------------------------------------

if ! id "$HAVEN_USER" >/dev/null 2>&1; then
  log "Creating system user '$HAVEN_USER'"
  useradd --system --shell /bin/false --home "$HAVEN_DATA_DIR" "$HAVEN_USER"
fi
mkdir -p "$HAVEN_DATA_DIR/attachments" "$HAVEN_DATA_DIR/backups"
# Sentinel file watched by haven-deploy-trigger.path. Must exist before
# the path unit can monitor it; backend will rewrite on each deploy hit.
touch "$HAVEN_DATA_DIR/.deploy-pending"
chown -R "$HAVEN_USER:$HAVEN_USER" "$HAVEN_DATA_DIR"

# Allow haven user to talk to docker (Postgres container management)
if getent group docker >/dev/null && ! id -nG "$HAVEN_USER" | grep -qw docker; then
  usermod -aG docker "$HAVEN_USER"
fi

# ---- 8. /etc/haven/.env ---------------------------------------------------

mkdir -p "$(dirname "$ENV_FILE")"
if [ ! -f "$ENV_FILE" ]; then
  log "Installing $ENV_FILE from template"
  cp "$REPO_DIR/infra/env.example" "$ENV_FILE"
  chown root:"$HAVEN_USER" "$ENV_FILE"
  chmod 640 "$ENV_FILE"
  warn "Edit $ENV_FILE — set CADDY_DOMAIN, CF_API_TOKEN, etc., then restart services."
fi

# ---- 9. Repo perms + deps -------------------------------------------------

log "Setting repo ownership and installing workspace deps"
chown -R "$HAVEN_USER:$HAVEN_USER" "$REPO_DIR"
sudo -u "$HAVEN_USER" -H sh -c "cd '$REPO_DIR' && /usr/local/bin/bun install --frozen-lockfile"

# ---- 10. Postgres up + migrations ----------------------------------------

log "Bringing Postgres up"
sudo -u "$HAVEN_USER" -H sh -c "cd '$REPO_DIR' && docker compose up -d postgres"
i=0
while ! sudo -u "$HAVEN_USER" -H sh -c "cd '$REPO_DIR' && docker compose exec -T postgres pg_isready -U haven -d haven" >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -lt 60 ] || die "Postgres failed to become ready in 60s."
  sleep 1
done
log "Postgres ready — applying safe migrations"
sudo -u "$HAVEN_USER" -H sh -c "cd '$REPO_DIR/apps/backend' && /usr/local/bin/bun run db:migrate"

# ---- 11. Build dashboard --------------------------------------------------

log "Building dashboard"
sudo -u "$HAVEN_USER" -H sh -c "cd '$REPO_DIR' && /usr/local/bin/bun --filter @haven/dashboard run build"

# ---- 12. systemd units ----------------------------------------------------

log "Installing systemd units"
cp "$REPO_DIR/infra/systemd/"*.service /etc/systemd/system/
cp "$REPO_DIR/infra/systemd/"*.timer /etc/systemd/system/
cp "$REPO_DIR/infra/systemd/"*.path /etc/systemd/system/
systemctl daemon-reload
systemctl enable haven-backend.service haven-dashboard.service \
  haven-autopull.timer haven-deploy-trigger.path >/dev/null
systemctl restart haven-backend.service haven-dashboard.service
systemctl start haven-autopull.timer
systemctl restart haven-deploy-trigger.path

# ---- 13. Caddyfile --------------------------------------------------------

if [ "$INSTALL_CADDY" = "yes" ]; then
  mkdir -p /etc/caddy
  if [ ! -f /etc/caddy/Caddyfile ] || ! grep -q '# managed by haven-install' /etc/caddy/Caddyfile 2>/dev/null; then
    log "Installing /etc/caddy/Caddyfile from template"
    {
      echo '# managed by haven-install — edit then `systemctl reload caddy`'
      cat "$REPO_DIR/infra/Caddyfile.example"
    } > /etc/caddy/Caddyfile
  fi
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
else
  log "Caddyfile install skipped — wire your existing reverse proxy to:"
  log "    /api/*           → 127.0.0.1:8080 (haven-backend)"
  log "    /attachments/*   → /var/haven/attachments (file_server)"
  log "    /*               → 127.0.0.1:3000 (haven-dashboard)"
fi

# ---- 14. Banner -----------------------------------------------------------

cat <<EOF

\033[1;32m✔\033[0m Haven base install complete.

Repo:        $REPO_DIR
Env:         $ENV_FILE
Data:        $HAVEN_DATA_DIR
User:        $HAVEN_USER
Services:    haven-backend, haven-dashboard, haven-autopull.timer
Caddy:       $([ "$INSTALL_CADDY" = "yes" ] && echo "/etc/caddy/Caddyfile" || echo "skipped (HAVEN_INSTALL_CADDY=$INSTALL_CADDY)")
Whisper:     $(command -v whisper-cli || echo MISSING) (model: $WHISPER_MODEL_FILE)
ffmpeg:      $(command -v ffmpeg || echo MISSING)

Next steps:
  1. Edit $ENV_FILE — set CADDY_DOMAIN, CF_API_TOKEN, DATABASE_URL, etc.
  2. (If using DNS challenge for TLS) Rebuild Caddy with the Cloudflare
     module — see docs/deployment.md "Caddy + Cloudflare DNS" section.
  3. systemctl restart haven-backend haven-dashboard caddy
  4. Visit https://\$CADDY_DOMAIN

Logs:        journalctl -u haven-backend -u haven-dashboard -u caddy -f
Health:      curl -s http://127.0.0.1:8080/api/health | jq
Voice test:  say "hello world" | ffmpeg -i pipe:0 -c:a libopus /tmp/t.webm \\
             && curl -F file=@/tmp/t.webm http://127.0.0.1:8080/api/voice/transcribe

EOF
