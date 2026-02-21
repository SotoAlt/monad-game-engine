/**
 * Database Module - PostgreSQL persistence with graceful fallback
 *
 * If DATABASE_URL is set, connects to PostgreSQL and auto-creates tables.
 * If not set, all functions are no-ops (dev mode works without Postgres).
 */

import pg from 'pg';
const { Pool } = pg;

let pool = null;
let dbAvailable = false;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT DEFAULT 'human',
  privy_user_id TEXT UNIQUE,
  twitter_username TEXT,
  twitter_avatar TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_seen     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leaderboard (
  user_id       TEXT PRIMARY KEY REFERENCES users(id),
  name          TEXT NOT NULL,
  wins          INTEGER DEFAULT 0,
  total_score   INTEGER DEFAULT 0,
  games_played  INTEGER DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_history (
  id            TEXT PRIMARY KEY,
  game_type     TEXT NOT NULL,
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  ended_at      TIMESTAMPTZ,
  duration_ms   INTEGER,
  result        TEXT,
  winner_id     TEXT,
  player_count  INTEGER,
  scores        JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS transactions (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  wallet_address TEXT,
  tx_hash        TEXT UNIQUE,
  tx_type        TEXT NOT NULL,
  amount         TEXT NOT NULL,
  description    TEXT,
  status         TEXT DEFAULT 'pending',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arenas (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  description      TEXT DEFAULT '',
  creator_id       TEXT,
  api_key          TEXT UNIQUE NOT NULL,
  game_master_name TEXT DEFAULT 'Game Master',
  config           JSONB DEFAULT '{}',
  upvotes          INTEGER DEFAULT 0,
  is_default       BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  last_active      TIMESTAMPTZ DEFAULT NOW()
);
`;

export async function initDB() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('[DB] No DATABASE_URL set — running in-memory only');
    return false;
  }

  try {
    pool = new Pool({ connectionString: url });
    await pool.query('SELECT 1');
    await pool.query(SCHEMA);
    // Safe migration for existing DBs
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS privy_user_id TEXT UNIQUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS twitter_username TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS twitter_avatar TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address TEXT;
    `);
    dbAvailable = true;
    console.log('[DB] PostgreSQL connected, tables ready');
    return true;
  } catch (err) {
    console.error('[DB] Connection failed, falling back to in-memory:', err.message);
    pool = null;
    dbAvailable = false;
    return false;
  }
}

export function isDBAvailable() {
  return dbAvailable;
}

// --- Users ---

export async function upsertUser(id, name, type = 'human', meta = {}) {
  if (!dbAvailable) return;
  try {
    await pool.query(
      `INSERT INTO users (id, name, type, privy_user_id, twitter_username, twitter_avatar, wallet_address, last_seen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = $2, type = $3,
         privy_user_id = COALESCE($4, users.privy_user_id),
         twitter_username = COALESCE($5, users.twitter_username),
         twitter_avatar = COALESCE($6, users.twitter_avatar),
         wallet_address = COALESCE($7, users.wallet_address),
         last_seen = NOW()`,
      [id, name, type, meta.privyUserId || null, meta.twitterUsername || null, meta.twitterAvatar || null, meta.walletAddress || null]
    );
  } catch (err) {
    console.error('[DB] upsertUser error:', err.message);
  }
}

export async function findUser(id) {
  if (!dbAvailable) return null;
  try {
    const result = await pool.query(
      'SELECT id, name, type, twitter_username, twitter_avatar, wallet_address, created_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error('[DB] findUser error:', err.message);
    return null;
  }
}

// --- Leaderboard ---

export async function updateLeaderboard(userId, name, won, score) {
  if (!dbAvailable) return;
  try {
    await pool.query(
      `INSERT INTO leaderboard (user_id, name, wins, total_score, games_played, updated_at)
       VALUES ($1, $2, $3, $4, 1, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         name = $2,
         wins = leaderboard.wins + $3,
         total_score = leaderboard.total_score + $4,
         games_played = leaderboard.games_played + 1,
         updated_at = NOW()`,
      [userId, name, won ? 1 : 0, score]
    );
  } catch (err) {
    console.error('[DB] updateLeaderboard error:', err.message);
  }
}

export async function loadLeaderboard() {
  if (!dbAvailable) return [];
  try {
    const result = await pool.query(
      `SELECT user_id AS id, name, wins, total_score AS "totalScore", games_played AS "gamesPlayed"
       FROM leaderboard
       ORDER BY wins DESC, total_score DESC
       LIMIT 10`
    );
    return result.rows;
  } catch (err) {
    console.error('[DB] loadLeaderboard error:', err.message);
    return [];
  }
}

// --- Game History ---

export async function saveGameHistory(game) {
  if (!dbAvailable) return;
  try {
    await pool.query(
      `INSERT INTO game_history (id, game_type, started_at, ended_at, duration_ms, result, winner_id, player_count, scores)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        game.id,
        game.type,
        new Date(game.startTime),
        new Date(),
        Date.now() - game.startTime,
        game.result,
        game.winnerId ?? null,
        game.playerCount,
        JSON.stringify(game.scores)
      ]
    );
  } catch (err) {
    console.error('[DB] saveGameHistory error:', err.message);
  }
}

// --- Stats ---

export async function getStats() {
  if (!dbAvailable) {
    return { totalGames: 0, totalPlayers: 0, dbConnected: false };
  }
  try {
    const [games, players] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM game_history'),
      pool.query('SELECT COUNT(*) AS count FROM users')
    ]);
    return {
      totalGames: parseInt(games.rows[0].count, 10),
      totalPlayers: parseInt(players.rows[0].count, 10),
      dbConnected: true
    };
  } catch (err) {
    console.error('[DB] getStats error:', err.message);
    return { totalGames: 0, totalPlayers: 0, dbConnected: false };
  }
}

// --- Transactions ---

// In-memory fallback for when DB is unavailable
const memTransactions = [];

export async function saveTransaction({ id, userId, walletAddress, txHash, txType, amount, description, status = 'pending' }) {
  if (!dbAvailable) {
    memTransactions.push({
      id, userId, walletAddress, txHash, txType, amount, description, status,
      createdAt: new Date().toISOString()
    });
    return;
  }
  try {
    await pool.query(
      `INSERT INTO transactions (id, user_id, wallet_address, tx_hash, tx_type, amount, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, userId, walletAddress || null, txHash || null, txType, amount, description || null, status]
    );
  } catch (err) {
    console.error('[DB] saveTransaction error:', err.message);
  }
}

export async function getTransactionsByUser(userId, limit = 20, offset = 0) {
  if (!dbAvailable) {
    return memTransactions
      .filter(t => t.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(offset, offset + limit);
  }
  try {
    const result = await pool.query(
      `SELECT id, user_id AS "userId", wallet_address AS "walletAddress", tx_hash AS "txHash",
              tx_type AS "txType", amount, description, status, created_at AS "createdAt"
       FROM transactions WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  } catch (err) {
    console.error('[DB] getTransactionsByUser error:', err.message);
    return [];
  }
}

export async function findTransactionByTxHash(txHash) {
  if (!dbAvailable) {
    return memTransactions.find(t => t.txHash === txHash) || null;
  }
  try {
    const result = await pool.query(
      'SELECT id, user_id AS "userId", tx_hash AS "txHash", status FROM transactions WHERE tx_hash = $1',
      [txHash]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error('[DB] findTransactionByTxHash error:', err.message);
    return null;
  }
}

export async function updateTransactionStatus(id, status) {
  if (!dbAvailable) {
    const tx = memTransactions.find(t => t.id === id);
    if (tx) tx.status = status;
    return;
  }
  try {
    await pool.query('UPDATE transactions SET status = $1 WHERE id = $2', [status, id]);
  } catch (err) {
    console.error('[DB] updateTransactionStatus error:', err.message);
  }
}

export async function loadVerifiedTxHashes() {
  if (!dbAvailable) {
    return memTransactions.filter(t => t.txHash).map(t => t.txHash);
  }
  try {
    const result = await pool.query('SELECT tx_hash FROM transactions WHERE tx_hash IS NOT NULL');
    return result.rows.map(r => r.tx_hash);
  } catch (err) {
    console.error('[DB] loadVerifiedTxHashes error:', err.message);
    return [];
  }
}

// --- Arenas ---

export async function loadArenas() {
  if (!dbAvailable) return [];
  try {
    const result = await pool.query(
      `SELECT id, name, description, creator_id, api_key, game_master_name,
              config, upvotes, is_default, created_at, last_active
       FROM arenas WHERE is_default = FALSE
       ORDER BY created_at ASC`
    );
    return result.rows;
  } catch (err) {
    console.error('[DB] loadArenas error:', err.message);
    return [];
  }
}

export async function saveArena(arena) {
  if (!dbAvailable) return;
  try {
    await pool.query(
      `INSERT INTO arenas (id, name, description, creator_id, api_key, game_master_name, config, upvotes, is_default, created_at, last_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         name = $2, description = $3, config = $7,
         game_master_name = $6, upvotes = $8, last_active = $11`,
      [
        arena.id,
        arena.name,
        arena.description,
        arena.creatorId || null,
        arena.apiKey,
        arena.gameMasterName,
        JSON.stringify(arena.config || {}),
        arena.upvotes || 0,
        arena.isDefault || false,
        new Date(arena.createdAt || Date.now()),
        new Date(arena.lastActive || Date.now()),
      ]
    );
  } catch (err) {
    console.error('[DB] saveArena error:', err.message);
  }
}

export async function deleteArenaFromDB(id) {
  if (!dbAvailable) return;
  try {
    await pool.query('DELETE FROM arenas WHERE id = $1 AND is_default = FALSE', [id]);
  } catch (err) {
    console.error('[DB] deleteArenaFromDB error:', err.message);
  }
}

export async function closeDB() {
  if (pool) {
    await pool.end();
    console.log('[DB] Connection pool closed');
  }
}
