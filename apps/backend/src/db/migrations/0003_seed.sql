-- 0003_seed.sql
-- Demo users + devices + a starter set of todos and shopping items so
-- the dashboard has meaningful data on a fresh install. Runs once;
-- re-running won't re-seed unless you wipe the volume (make db-reset).

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Users
insert into users (handle, display_name) values
  ('michael', 'Michael'),
  ('fiona',   'Fiona')
on conflict (handle) do nothing;

-- Devices
insert into devices (handle, kind, user_id) values
  ('wall_boox',     'wall',  null),
  ('phone_michael', 'phone', (select id from users where handle = 'michael')),
  ('phone_fiona',   'phone', (select id from users where handle = 'fiona'))
on conflict (handle) do nothing;

-- Todos
with author as (select id from users where handle = 'michael')
insert into todos (title, tags, done_at, created_at, assignee_user_id)
select
  t.title,
  t.tags,
  case when t.done then now() - interval '1 day' else null end,
  now() - interval '2 days',
  author.id
from author, (values
  ('Pay council tax',                  array['errands']::text[], false),
  ('Book the MOT',                     array['errands']::text[], false),
  ('Lily''s permission slip',          array['kids']::text[],    true),
  ('Service heat pump',                array['home']::text[],    false),
  ('Refill dishwasher salt',           array['home']::text[],    false),
  ('Replace bathroom bulb',            array['home']::text[],    true),
  ('Renew passport',                   array['errands']::text[], false),
  ('School trip permission · Theo',    array['kids']::text[],    false),
  ('Birthday card for Mum',            array['errands']::text[], true),
  ('Move clocks back',                 array['home']::text[],    true),
  ('Top up oyster card',               array['errands']::text[], false),
  ('Book swimming lessons',            array['kids']::text[],    true)
) as t(title, tags, done);

-- Shopping
insert into shopping_items (name, qty, aisle, created_at) values
  ('Oat milk',         null,    'dairy',   now() - interval '1 day'),
  ('Sourdough',        null,    'bakery',  now() - interval '1 day'),
  ('Eggs',             '×6',    'dairy',   now() - interval '1 day'),
  ('Yogurt',           null,    'dairy',   now() - interval '1 day'),
  ('Butter',           null,    'dairy',   now() - interval '1 day'),
  ('Apples',           '×4',    'produce', now() - interval '1 day'),
  ('Bananas',          '×6',    'produce', now() - interval '1 day'),
  ('Spinach',          null,    'produce', now() - interval '1 day'),
  ('Olive oil',        null,    'pantry',  now() - interval '1 day'),
  ('Rice',             '500g',  'pantry',  now() - interval '1 day'),
  ('Pasta',            '×2',    'pantry',  now() - interval '1 day'),
  ('Chopped tomatoes', '×2',    'pantry',  now() - interval '1 day'),
  ('Dark chocolate',   null,    'pantry',  now() - interval '1 day');
