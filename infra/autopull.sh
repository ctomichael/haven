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

# After the pull this script might have changed on disk (e.g. a bug fix
# to the build command below). The shell is still executing the OLD
# in-memory copy, so exec ourselves to pick up the new content before
# touching anything else. The HAVEN_AUTOPULL_REEXECED guard prevents
# an infinite loop if exec fails or the new script also calls exec.
if [ -z "${HAVEN_AUTOPULL_REEXECED:-}" ]; then
  log "Re-execing with the freshly-pulled script"
  HAVEN_AUTOPULL_REEXECED=1 export HAVEN_AUTOPULL_REEXECED
  exec "$0" "$@"
fi

log "bun install --frozen-lockfile"
sudo -u "$HAVEN_USER" -H sh -c "cd '$REPO_DIR' && /usr/local/bin/bun install --frozen-lockfile"

log "Applying safe migrations"
sudo -u "$HAVEN_USER" -H sh -c "cd '$REPO_DIR/apps/backend' && /usr/local/bin/bun run db:migrate"

log "Building dashboard"
sudo -u "$HAVEN_USER" -H sh -c "cd '$REPO_DIR' && /usr/local/bin/bun run --filter @haven/dashboard build"

log "Restarting services"
systemctl restart haven-backend haven-dashboard

log "Deployed $NEW"
