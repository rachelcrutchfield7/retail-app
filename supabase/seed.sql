-- ===========================================================
-- ReTail Seed Data
-- Version 1.0
-- ===========================================================

--------------------------------------------------------------
-- Categories
--------------------------------------------------------------

insert into categories (name, slug, icon, sort_order)
values
  ('Dogs', 'dogs', 'dog', 1),
  ('Cats', 'cats', 'cat', 2),
  ('Birds', 'birds', 'bird', 3),
  ('Fish', 'fish', 'fish', 4),
  ('Reptiles', 'reptiles', 'reptile', 5),
  ('Small Pets', 'small-pets', 'rabbit', 6),
  ('Horses', 'horses', 'horse', 7),
  ('Farm Animals', 'farm-animals', 'cow', 8),
  ('General Pet Supplies', 'general', 'paw', 9)
on conflict (slug) do update set
  name = excluded.name,
  icon = excluded.icon,
  parent_id = null,
  sort_order = excluded.sort_order,
  is_active = true;

--------------------------------------------------------------
-- Dog Subcategories
--------------------------------------------------------------

insert into categories (name, slug, icon, parent_id, sort_order)
select
  child.name,
  child.slug,
  child.icon,
  parent.id,
  child.sort_order
from categories parent
join (
  values
    ('Crates', 'dog-crates', 'box', 101),
    ('Beds', 'dog-beds', 'bed', 102),
    ('Toys', 'dog-toys', 'bone', 103),
    ('Leashes', 'dog-leashes', 'link', 104),
    ('Collars', 'dog-collars', 'tag', 105)
) as child(name, slug, icon, sort_order)
  on parent.slug = 'dogs'
on conflict (slug) do update set
  name = excluded.name,
  icon = excluded.icon,
  parent_id = excluded.parent_id,
  sort_order = excluded.sort_order,
  is_active = true;

--------------------------------------------------------------
-- Cat Subcategories
--------------------------------------------------------------

insert into categories (name, slug, icon, parent_id, sort_order)
select
  child.name,
  child.slug,
  child.icon,
  parent.id,
  child.sort_order
from categories parent
join (
  values
    ('Litter Boxes', 'cat-litter-boxes', 'box', 201),
    ('Cat Trees', 'cat-trees', 'tree', 202),
    ('Beds', 'cat-beds', 'bed', 203),
    ('Toys', 'cat-toys', 'mouse', 204)
) as child(name, slug, icon, sort_order)
  on parent.slug = 'cats'
on conflict (slug) do update set
  name = excluded.name,
  icon = excluded.icon,
  parent_id = excluded.parent_id,
  sort_order = excluded.sort_order,
  is_active = true;

--------------------------------------------------------------
-- Conditions
--------------------------------------------------------------

-- Listing conditions are stored in the listing_condition enum.
-- No seed rows are required.

--------------------------------------------------------------
-- Demo Data Notes
--------------------------------------------------------------

-- Demo users must be created through Supabase Authentication so
-- profile rows can reference real auth.users UUIDs.
--
-- Recommended demo accounts:
--   Rachel
--   Test Buyer
--   Rescue Volunteer
--
-- After demo users exist, add a separate local-only seed file with
-- their UUIDs for listings, conversations, reviews, favorites, and
-- notifications.

--------------------------------------------------------------
-- Development Checklist
--------------------------------------------------------------

-- Create one seller.
-- Create one buyer.
-- Create one conversation.
-- Create one review.
-- Favorite one listing.
-- Upload listing images.
--
-- Local demo target:
--   20 active listings
--   5 sold listings
--   5 donated listings
--   3 conversations
--   15 messages
--   10 reviews
--   8 favorites
--   5 notifications

notify pgrst, 'reload schema';
