-- "Reject bids before start" requires the auctions table to actually know
-- when an auction starts. Existing rows default to now(), so anything
-- already active/ended is unaffected — only newly created auctions can be
-- scheduled in the future.
ALTER TABLE auctions ADD COLUMN starts_at timestamptz NOT NULL DEFAULT now();
