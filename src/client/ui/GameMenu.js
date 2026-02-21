/**
 * In-game menu — Change Arena + Logout.
 */

import { logout } from '../auth.js';
import { disconnectFromServer, connectToServer } from '../ConnectionManager.js';
import { setSelectedArenaId } from '../config.js';
import { fetchInitialState } from '../network/HttpApi.js';
import { showArenaLobby } from './ArenaLobby.js';

let menuOpen = false;

function closeMenu(dropdown) {
  menuOpen = false;
  dropdown.style.display = 'none';
}

function setGameUIVisible(visible) {
  const chatPanel = document.getElementById('chat-panel');
  const controls = document.getElementById('controls');
  if (chatPanel) chatPanel.style.display = visible ? 'flex' : 'none';
  if (controls) controls.style.display = visible ? 'block' : 'none';
}

export function setupGameMenu() {
  const btn = document.getElementById('menu-btn');
  const dropdown = document.getElementById('menu-dropdown');
  if (!btn || !dropdown) return;

  btn.style.display = 'flex';

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuOpen = !menuOpen;
    dropdown.style.display = menuOpen ? 'flex' : 'none';
  });

  document.addEventListener('click', () => {
    if (menuOpen) closeMenu(dropdown);
  });
  dropdown.addEventListener('click', (e) => e.stopPropagation());

  document.getElementById('menu-change-arena')?.addEventListener('click', async () => {
    closeMenu(dropdown);
    disconnectFromServer();
    setGameUIVisible(false);

    const arenaId = await showArenaLobby();
    setSelectedArenaId(arenaId);

    await fetchInitialState();
    await connectToServer();
    setGameUIVisible(true);
  });

  document.getElementById('menu-logout')?.addEventListener('click', async () => {
    closeMenu(dropdown);
    disconnectFromServer();
    await logout();
    window.location.reload();
  });
}
