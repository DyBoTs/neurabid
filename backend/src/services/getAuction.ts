import { pool } from '../db.js';

export interface AuctionDTO {
  id: string;
  title: string;
  description: string | null;
  startingPrice: number;
  currentPrice: number;
  minIncrement: number;
  status: string;
  startsAt: string;
  endsAt: string;
  currentBidId: string | null;
}

interface AuctionRow {
  id: string;
  title: string;
  description: string | null;
  starting_price: string;
  current_price: string;
  min_increment: string;
  status: string;
  starts_at: string;
  ends_at: string;
  current_bid_id: string | null;
}

function toDTO(row: AuctionRow): AuctionDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startingPrice: Number(row.starting_price),
    currentPrice: Number(row.current_price),
    minIncrement: Number(row.min_increment),
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    currentBidId: row.current_bid_id,
  };
}

/**
 * The single place "what does an auction look like to a client" is
 * defined. Used by both the REST routes and the WebSocket snapshot
 * (backend/src/ws/wsServer.ts) so they can never silently drift apart.
 */
export async function getAuctionById(id: string): Promise<AuctionDTO | null> {
  const { rows } = await pool.query<AuctionRow>('SELECT * FROM auctions WHERE id = $1', [id]);
  return rows[0] ? toDTO(rows[0]) : null;
}

export async function listAuctions(): Promise<AuctionDTO[]> {
  const { rows } = await pool.query<AuctionRow>(
    `SELECT * FROM auctions ORDER BY (status = 'active') DESC, ends_at ASC`,
  );
  return rows.map(toDTO);
}

export interface CreateAuctionInput {
  title: string;
  description: string | null;
  startingPrice: number;
  minIncrement: number;
  durationMinutes: number;
}

/** New auctions start immediately (starts_at = now()) — scheduling a future
 * start isn't exposed in the UI yet, though the schema/placeBid already
 * support it (see the seeded "not started" auction from Phase 1). */
export async function createAuction(input: CreateAuctionInput): Promise<AuctionDTO> {
  const { rows } = await pool.query<AuctionRow>(
    `INSERT INTO auctions (title, description, starting_price, current_price, min_increment, status, starts_at, ends_at)
     VALUES ($1, $2, $3, $3, $4, 'active', now(), now() + make_interval(mins => $5))
     RETURNING *`,
    [input.title, input.description, input.startingPrice, input.minIncrement, input.durationMinutes],
  );
  return toDTO(rows[0]);
}
