# Migrations

Migration files live here, named `NNNN_short_description.sql`.

The runner (`../migrator.ts`):

1. Scans this folder on backend startup and on `bun run db:migrate`
2. Lints each pending migration with [`squawk`](https://github.com/sbdchd/squawk) (`npm install -g squawk-cli`) using config at `<repo>/.squawk.toml`
3. Applies migrations squawk green-lights inside a transaction and records them in `_migrations`
4. Holds anything squawk flags for manual approval via `bun run db:migrate:unsafe <name> I-UNDERSTAND-THIS-IS-UNSAFE`

Conventions:

- One concern per file; chain related DDL inside the same file
- Always include a top comment summarising the change
- Prefer additive operations (CREATE TABLE, ADD COLUMN NULL, CREATE INDEX CONCURRENTLY)
- Never edit a migration after it has been applied — write a new one
