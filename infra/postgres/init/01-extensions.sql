-- Extensions Haven relies on. Runs once on first cluster init.
-- Re-creating the volume re-runs this.

create extension if not exists vector;     -- pgvector for semantic search
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- trigram search for fallback FTS
