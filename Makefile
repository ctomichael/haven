.PHONY: help db-up db-down db-logs db-psql db-reset dev install deploy autopull backup-db restore-db

help:
	@echo "Haven — development tasks"
	@echo ""
	@echo "  make install       Install workspace dependencies"
	@echo "  make dev           Run backend + dashboard concurrently"
	@echo ""
	@echo "  make db-up         Start the Postgres container in the background"
	@echo "  make db-down       Stop the Postgres container"
	@echo "  make db-logs       Tail Postgres logs"
	@echo "  make db-psql       Open a psql shell against the running container"
	@echo "  make db-reset      Wipe the volume and bring Postgres back up"
	@echo ""
	@echo "Production (Beelink — run with sudo):"
	@echo "  make deploy        Pull, install, migrate, build, restart services"
	@echo "  make autopull      Trigger one-shot autopull (same as deploy + git fetch gate)"
	@echo "  make backup-db     pg_dump to /var/haven/backups (keeps last 14)"
	@echo "  make restore-db BACKUP=path.sql.gz   Restore from a dump"

install:
	bun install

dev:
	bun run dev

db-up:
	docker compose up -d postgres
	@echo "Waiting for Postgres to be healthy..."
	@until docker compose exec -T postgres pg_isready -U haven -d haven > /dev/null 2>&1; do sleep 1; done
	@echo "Postgres ready on localhost:5432 (db=haven user=haven)"

db-down:
	docker compose down

db-logs:
	docker compose logs -f postgres

db-psql:
	docker compose exec postgres psql -U haven -d haven

db-reset:
	docker compose down -v
	$(MAKE) db-up

# ------------------------------------------------------------------------
# Production (Beelink) — run with sudo. See docs/deployment.md.
# ------------------------------------------------------------------------

HAVEN_USER ?= haven
REPO_DIR   ?= /opt/haven
BACKUP_DIR ?= /var/haven/backups

deploy:
	@if [ "$$(id -u)" -ne 0 ]; then echo "Run with sudo" >&2; exit 1; fi
	sudo -u $(HAVEN_USER) -H sh -c "cd $(REPO_DIR) && /usr/local/bin/bun install --frozen-lockfile"
	sudo -u $(HAVEN_USER) -H sh -c "cd $(REPO_DIR)/apps/backend && /usr/local/bin/bun run db:migrate"
	sudo -u $(HAVEN_USER) -H sh -c "cd $(REPO_DIR) && /usr/local/bin/bun --filter @haven/dashboard run build"
	systemctl restart haven-backend haven-dashboard

autopull:
	@if [ "$$(id -u)" -ne 0 ]; then echo "Run with sudo" >&2; exit 1; fi
	$(REPO_DIR)/infra/autopull.sh

backup-db:
	mkdir -p $(BACKUP_DIR)
	docker compose -f $(REPO_DIR)/docker-compose.yml exec -T postgres \
	  pg_dump -U haven -d haven --clean --if-exists \
	  | gzip > $(BACKUP_DIR)/haven-$$(date +%Y%m%d-%H%M%S).sql.gz
	@ls -t $(BACKUP_DIR)/haven-*.sql.gz | tail -n +15 | xargs -r rm
	@echo "Backups in $(BACKUP_DIR):"
	@ls -lh $(BACKUP_DIR)/haven-*.sql.gz | tail -5

restore-db:
	@if [ -z "$$BACKUP" ]; then echo "Usage: make restore-db BACKUP=/var/haven/backups/...sql.gz" >&2; exit 1; fi
	gunzip -c "$$BACKUP" | docker compose -f $(REPO_DIR)/docker-compose.yml exec -T postgres psql -U haven -d haven
