#!/bin/sh
# Haven — autopull. Fetches origin, fast-forwards if HEAD changed, and
# re-deploys. Invoked by haven-autopull.service (timer every 4h).
#
# Runs as root: git/build steps drop to the haven user; systemctl
# restart needs root. Manual invocation:  sudo /opt/haven/infra/autopull.sh

set -eu

REPO_DIR="${HAVEN_REPO_DIR:-/opt/haven}"
HAVEN_USER="${HAVEN_USER:-haven}"
BRANCH="${HAVEN_BRANCH:-main}"

log() { printf '\033[1;34m[haven-autopull]\033[0m %s\n' "$*"; }

cd "$REPO_DIR"

OLD=$(sudo -u "$HAVEN_USER" -H git rev-parse HEAD)
sudo -u "$HAVEN_USER" -H git fetch --quiet origin "$BRANCH"
NEW=$(sudo -u "$HAVEN_USER" -H git rev-parse "origin/$BRANCH")

if [ "$OLD" = "$NEW" ]; then
  log "No changes (HEAD still $OLD)"
  exit 0
fi

log "Pulling $OLD → $NEW"
sudo -u "$HAVEN_USER" -H git pull --ff-only --quiet origin "$BRANCH"

log "bun install --frozen-lockfile"
sudo -u "$HAVEN_USER" -H sh -c "cd '$REPO_DIR' && /usr/local/bin/bun install --frozen-lockfile"

log "Applying safe migrations"
sudo -u "$HAVEN_USER" -H sh -c "cd '$REPO_DIR/apps/backend' && /usr/local/bin/bun run db:migrate"

log "Building dashboard"
sudo -u "$HAVEN_USER" -H sh -c "cd '$REPO_DIR' && /usr/local/bin/bun run --filter @haven/dashboard build"

log "Restarting services"
systemctl restart haven-backend haven-dashboard

log "Deployed $NEW"
