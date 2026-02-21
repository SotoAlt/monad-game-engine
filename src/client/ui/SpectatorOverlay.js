/**
 * Spectator overlay — drama meter, agent phase, kill feed.
 */

import { getApiBase } from '../config.js';

const killFeed = [];

export function setupSpectatorOverlay() {
  const controls = document.getElementById('controls');
  if (controls) controls.style.display = 'none';
  const overlay = document.getElementById('spectator-overlay');
  if (overlay) overlay.style.display = 'block';

  setInterval(async () => {
    try {
      const res = await fetch(`${getApiBase()}/agent/drama`);
      const data = await res.json();
      const meter = document.getElementById('drama-fill');
      const label = document.getElementById('drama-value');
      if (meter) meter.style.width = `${data.drama}%`;
      if (label) label.textContent = `${data.drama}`;
      const phaseEl = document.getElementById('agent-phase');
      if (phaseEl) phaseEl.textContent = data.phase?.toUpperCase() || '';
    } catch { /* silent */ }
  }, 2000);
}

export function addKillFeedEntry(text) {
  killFeed.push({ text, time: Date.now() });
  if (killFeed.length > 5) killFeed.shift();
  renderKillFeed();
}

function renderKillFeed() {
  const container = document.getElementById('kill-feed');
  if (!container) return;
  container.innerHTML = '';
  for (const k of killFeed) {
    const div = document.createElement('div');
    div.className = 'kill-entry';
    div.textContent = k.text;
    container.appendChild(div);
  }
}
