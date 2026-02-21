import { updateLeaderboard, loadLeaderboard } from '../db.js';

export class LeaderboardManager {
  /**
   * @param {function} getPlayerName - (id) => string|undefined
   */
  constructor(getPlayerName) {
    this.leaderboard = new Map();
    this._getPlayerName = getPlayerName;
  }

  recordGameResult(playerId, won, score = 0) {
    const name = this._getPlayerName(playerId) || playerId;

    let entry = this.leaderboard.get(playerId);
    if (!entry) {
      entry = { name, wins: 0, totalScore: 0 };
      this.leaderboard.set(playerId, entry);
    }
    entry.name = name;
    if (won) entry.wins++;
    entry.totalScore += score;

    // Fire-and-forget DB write
    updateLeaderboard(playerId, name, won, score);

    return entry;
  }

  getLeaderboard() {
    return Array.from(this.leaderboard.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.wins - a.wins || b.totalScore - a.totalScore)
      .slice(0, 10);
  }

  async loadLeaderboardFromDB() {
    try {
      const rows = await loadLeaderboard();
      for (const row of rows) {
        this.leaderboard.set(row.id, {
          name: row.name,
          wins: row.wins,
          totalScore: row.totalScore
        });
      }
      if (rows.length > 0) {
        console.log(`[LeaderboardManager] Loaded ${rows.length} leaderboard entries from DB`);
      }
    } catch (err) {
      console.error('[LeaderboardManager] Failed to load leaderboard from DB:', err.message);
    }
  }
}
