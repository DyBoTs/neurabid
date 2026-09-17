-- now() is frozen at transaction start (it's the "current transaction timestamp",
-- not "current statement timestamp"). Under concurrent bid transactions that all
-- BEGIN around the same instant and then queue on the auctions row lock, every
-- one of them would get nearly the same now() value, making created_at useless
-- for determining the real order bids were actually processed/committed in.
-- clock_timestamp() always returns the true wall-clock time at the moment the
-- statement runs, which is what we actually want for an audit/ordering column.
ALTER TABLE bids ALTER COLUMN created_at SET DEFAULT clock_timestamp();
