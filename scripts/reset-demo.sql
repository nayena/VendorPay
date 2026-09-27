-- Wipes all VendorPay data. The app re-seeds the six demo vendors
-- within ~30 seconds of the next visit.
DELETE FROM transactions;
DELETE FROM circle_paid;
DELETE FROM circle_members;
DELETE FROM circles;
DELETE FROM otps;
DELETE FROM vendors;
DELETE FROM meta;
