/**
 * Arena selection lobby — fetch and display available arenas.
 */

import { API_URL } from '../config.js';

let arenaRefreshInterval = null;

export async function showArenaLobby() {
  const lobby = document.getElementById('arena-lobby');
  const listEl = document.getElementById('arena-list');
  if (!lobby || !listEl) {
    return 'default';
  }

  lobby.style.display = 'flex';
  lobby.classList.add('screen-fade-in');

  const switchBtn = document.getElementById('arena-switch-account');
  if (switchBtn) {
    switchBtn.onclick = function handleSwitchAccount() {
      localStorage.removeItem('game:token');
      window.location.reload();
    };
  }

  async function loadArenas() {
    try {
      const res = await fetch(`${API_URL}/api/arenas`);
      const data = await res.json();
      return data.arenas || [];
    } catch {
      return [];
    }
  }

  function renderArenas(arenas) {
    if (arenas.length === 0) {
      listEl.innerHTML = '<div class="arena-loading">No arenas available</div>';
      return;
    }

    arenas.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return (b.playerCount || 0) - (a.playerCount || 0);
    });

    listEl.innerHTML = arenas.map(a => {
      const badgeClass = a.phase || 'lobby';
      const badgeText = a.phase === 'playing' ? 'LIVE' : (a.phase || 'LOBBY').toUpperCase();
      const desc = a.description ? `<div class="arena-card-desc">${a.description}</div>` : '';
      const defaultClass = a.isDefault ? ' default' : '';
      return `
        <div class="arena-card${defaultClass}" data-arena-id="${a.id}">
          <div class="arena-card-header">
            <span class="arena-card-name">${a.name || a.id}</span>
            <span class="arena-card-badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="arena-card-meta">
            <span>${a.playerCount || 0} players</span>
            <span>${a.gameMasterName || 'Game Master'}</span>
            ${a.gameType ? `<span>${a.gameType}</span>` : ''}
          </div>
          ${desc}
        </div>
      `;
    }).join('');
  }

  let arenas = await loadArenas();
  renderArenas(arenas);

  arenaRefreshInterval = setInterval(async () => {
    arenas = await loadArenas();
    renderArenas(arenas);
  }, 5000);

  return new Promise((resolve) => {
    function onArenaClick(e) {
      const card = e.target.closest('.arena-card');
      if (!card) return;

      listEl.removeEventListener('click', onArenaClick);
      clearInterval(arenaRefreshInterval);

      const arenaId = card.dataset.arenaId;
      lobby.classList.add('screen-fade-out');
      setTimeout(() => {
        lobby.style.display = 'none';
        lobby.classList.remove('screen-fade-out');
      }, 300);
      resolve(arenaId);
    }

    listEl.addEventListener('click', onArenaClick);
  });
}
