-- Wipes all VendorPay data. The app re-seeds the six demo vendors
-- (and their events, explorers and reviews) within ~30 seconds of the next visit.
DELETE FROM transactions;
DELETE FROM ratings;
DELETE FROM menu_items;
DELETE FROM circle_invites;
DELETE FROM circle_paid;
DELETE FROM circle_members;
DELETE FROM circles;
DELETE FROM otps;
DELETE FROM events;
DELETE FROM swipes;
DELETE FROM checkins;
DELETE FROM reviews;
DELETE FROM points_ledger;
DELETE FROM explorer_badges;
DELETE FROM explorers;
DELETE FROM vendors;
DELETE FROM meta;
