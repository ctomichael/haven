#!/bin/sh
# Haven — autopull. Fetches origin, fast-forwards if HEAD changed, and
# re-deploys. Invoked by haven-autopull.service (triggered by either the
# 4h timer or the deploy-trigger path unit).
#
# Two passes:
#   1. (no env var) fetch, compare, pull, re-exec the freshly-pulled
#      script so any script-level fix (build command, restart logic) is
#      in effect for the deploy itself.
#   2. (HAVEN_AUTOPULL_REEXECED=1) run bun install / migrate / build /
#      restart — no git operations here, since they already happened.

set -eu

REPO_DIR="${HAVEN_REPO_DIR:-/opt/haven}"
HAVEN_USER="${HAVEN_USER:-haven}"
BRANCH="${HAVEN_BRANCH:-main}"

log() { printf '\033[1;34m[haven-autopull]\033[0m %s\n' "$*"; }

cd "$REPO_DIR"

# ----- Pass 1: pull + re-exec -------------------------------------------

if [ -z "${HAVEN_AUTOPULL_REEXECED:-}" ]; then
  OLD=$(sudo -u "$HAVEN_USER" -H git rev-parse HEAD)
  sudo -u "$HAVEN_USER" -H git fetch --quiet origin "$BRANCH"
  NEW=$(sudo -u "$HAVEN_USER" -H git rev-parse "origin/$BRANCH")

  if [ "$OLD" = "$NEW" ]; then
    log "No changes (HEAD still $OLD)"
    exit 0
  fi

  log "Pulling $OLD → $NEW"
  sudo -u "$HAVEN_USER" -H git pull --ff-only --quiet origin "$BRANCH"

  log "Re-execing with the freshly-pulled script"
  HAVEN_AUTOPULL_REEXECED=1
  HAVEN_AUTOPULL_OLD="$OLD"
  export HAVEN_AUTOPULL_REEXECED HAVEN_AUTOPULL_OLD
  exec "$0" "$@"
fi

# ----- Pass 2: build + restart ------------------------------------------

NEW=$(sudo -u "$HAVEN_USER" -H git rev-parse HEAD)
log "Deploying $NEW"

log "bun install --frozen-lockfile"
sudo -u "$HAVEN_USER" -H sh -c "cd '$REPO_DIR' && /usr/local/bin/bun install --frozen-lockfile"

log "Applying safe migrations"
sudo -u "$HAVEN_USER" -H sh -c "cd '$REPO_DIR/apps/backend' && /usr/local/bin/bun run db:migrate"

log "Building dashboard"
sudo -u "$HAVEN_USER" -H sh -c "cd '$REPO_DIR' && /usr/local/bin/bun run --filter @haven/dashboard build"

log "Restarting services"
systemctl restart haven-backend haven-dashboard

# Tell Hermes what changed (the new CHANGELOG.md entries for OLD..NEW) so it can
# adapt. Best-effort — never fail the deploy over it.
if [ -n "${HAVEN_AUTOPULL_OLD:-}" ]; then
  log "Notifying Hermes of changelog delta $HAVEN_AUTOPULL_OLD..$NEW"
  sudo -u "$HAVEN_USER" -H sh -c \
    "cd '$REPO_DIR' && /usr/local/bin/bun run apps/backend/src/scripts/notify-changelog.ts '$HAVEN_AUTOPULL_OLD' '$NEW'" \
    || log "changelog notify failed (non-fatal)"
fi

log "Deployed $NEW"
