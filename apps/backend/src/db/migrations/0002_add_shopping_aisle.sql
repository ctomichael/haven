-- 0002_add_shopping_aisle.sql
-- Add an `aisle` column to shopping_items so the /shopping sub-screen
-- can group by aisle. Nullable for backward compatibility — existing
-- rows (none in v0) sort into an 'unspecified' bucket on the client.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table shopping_items add column aisle text;
