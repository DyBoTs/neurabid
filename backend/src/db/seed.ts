import { pool } from '../db.js';

async function main() {
  console.log('Seeding demo data (this replaces any existing rows in users/auctions/bids)...');

  await pool.query('TRUNCATE bids, auctions, users RESTART IDENTITY CASCADE');

  const { rows: users } = await pool.query<{ id: string }>(
    `INSERT INTO users (username) VALUES ('alice'), ('bob'), ('carol') RETURNING id`,
  );
  const [alice, bob, carol] = users.map((u) => u.id);

  const { rows: auctions } = await pool.query<{ id: string }>(
    `INSERT INTO auctions (title, description, starting_price, current_price, min_increment, status, ends_at)
     VALUES
       ('Vintage Synthesizer', 'A well-loved analog synth from the 80s.', 100.00, 100.00, 5.00, 'active', now() + interval '2 hours'),
       ('Signed First-Edition Novel', 'Hardcover, signed by the author.', 50.00, 50.00, 2.00, 'active', now() + interval '30 seconds'),
       ('Retro Arcade Cabinet', 'Full-size, fully working.', 300.00, 340.00, 10.00, 'ended', now() - interval '1 hour')
     RETURNING id`,
  );
  const [synth, novel, arcade] = auctions.map((a) => a.id);

  await pool.query(
    `INSERT INTO bids (auction_id, user_id, amount) VALUES ($1, $2, 320.00), ($1, $3, 340.00)`,
    [arcade, bob, carol],
  );
  const { rows: winningBid } = await pool.query<{ id: string }>(
    `SELECT id FROM bids WHERE auction_id = $1 ORDER BY amount DESC LIMIT 1`,
    [arcade],
  );
  await pool.query('UPDATE auctions SET current_bid_id = $1 WHERE id = $2', [
    winningBid[0].id,
    arcade,
  ]);

  console.log('Seeded 3 users, 3 auctions (one active, one ending soon, one already ended).');
  console.log({ alice, bob, novel, synth });
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
