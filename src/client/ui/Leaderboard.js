/**
 * Leaderboard fetching and rendering.
 *
 * Caches last-fetched JSON to skip redundant DOM rebuilds when scores haven't changed.
 */

import { getApiBase } from '../config.js';

let _lastLeaderboardJSON = '';

export async function fetchLeaderboard() {
  try {
    const response = await fetch(`${getApiBase()}/leaderboard`);
    const data = await response.json();
    const json = JSON.stringify(data.leaderboard);
    if (json === _lastLeaderboardJSON) return; // skip DOM rebuild
    _lastLeaderboardJSON = json;
    updateLeaderboardUI(data.leaderboard);
  } catch (e) {
    // Silent fail
  }
}

export function updateLeaderboardUI(leaderboard) {
  const entries = document.getElementById('leaderboard-entries');
  if (!entries) return;

  entries.innerHTML = '';
  if (!leaderboard || leaderboard.length === 0) {
    entries.innerHTML = '<div style="text-align:center;color:#888;padding:12px;">No games played yet</div>';
    return;
  }

  for (let i = 0; i < leaderboard.length; i++) {
    const entry = leaderboard[i];
    const row = document.createElement('div');
    row.className = 'lb-entry';

    const rank = document.createElement('span');
    rank.className = 'lb-rank';
    rank.textContent = `${i + 1}.`;

    const name = document.createElement('span');
    name.className = 'lb-name';
    name.textContent = entry.name;

    const wins = document.createElement('span');
    wins.className = 'lb-wins';
    wins.textContent = `${entry.wins}W`;

    const games = document.createElement('span');
    games.className = 'lb-games';
    games.textContent = `${entry.gamesPlayed || 0}G`;

    row.append(rank, name, wins, games);
    entries.appendChild(row);
  }
}
