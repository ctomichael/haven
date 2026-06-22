.PHONY: help db-up db-down db-logs db-psql db-reset dev install

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
