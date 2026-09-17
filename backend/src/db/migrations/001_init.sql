CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text UNIQUE NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auctions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  description     text,
  starting_price  numeric(12,2) NOT NULL CHECK (starting_price > 0),
  current_price   numeric(12,2) NOT NULL,
  min_increment   numeric(12,2) NOT NULL DEFAULT 1.00 CHECK (min_increment > 0),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('scheduled','active','ended')),
  ends_at         timestamptz NOT NULL,
  current_bid_id  uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bids (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id    uuid NOT NULL REFERENCES auctions(id),
  user_id       uuid NOT NULL REFERENCES users(id),
  amount        numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE auctions
  ADD CONSTRAINT fk_auctions_current_bid FOREIGN KEY (current_bid_id) REFERENCES bids(id);

CREATE INDEX idx_bids_auction_amount ON bids (auction_id, amount DESC);
CREATE INDEX idx_bids_auction_created ON bids (auction_id, created_at DESC);
