/**
 * Player-related WebSocket message handlers.
 */

import { state, remotePlayers } from '../../state.js';
import { updateRemotePlayer, removeRemotePlayer } from '../../rendering/RemotePlayers.js';
import { showToast, showAnnouncement } from '../../ui/Announcements.js';
import { addKillFeedEntry } from '../../ui/SpectatorOverlay.js';
import { updateUI } from '../../ui/GameStatusHUD.js';
import { spawnParticles } from '../../vfx/ScreenEffects.js';

export function registerPlayerHandlers(room, { clearSpectating }) {
  room.onMessage('player_joined', (p) => {
    console.log('[Event] Player joined:', p.name);
    state.players.set(p.id, p);
    updateRemotePlayer(p);
    updateUI();
  });

  room.onMessage('player_left', ({ id }) => {
    state.players.delete(id);
    removeRemotePlayer(id);
    updateUI();
  });

  room.onMessage('player_temporarily_left', ({ id }) => {
    const mesh = remotePlayers.get(id);
    if (mesh?.material) {
      mesh.material.opacity = 0.3;
      mesh.material.transparent = true;
    }
  });

  room.onMessage('player_reconnected', ({ id, name }) => {
    const mesh = remotePlayers.get(id);
    if (mesh?.material) {
      mesh.material.opacity = 1;
      mesh.material.transparent = false;
    }
    showToast(`${name || 'Player'} reconnected`, 'success');
  });

  room.onMessage('player_moved', ({ id, position, velocity }) => {
    if (id === room.sessionId) return;
    let p = state.players.get(id);
    if (!p) {
      p = { id, position };
      state.players.set(id, p);
    }
    p.position = position;
    p.velocity = velocity;
    updateRemotePlayer(p);
  });

  room.onMessage('player_respawned', (data) => {
    if (data.position) spawnParticles(data.position, '#00d4ff', 20, 4);
  });

  room.onMessage('player_died', (data) => {
    const p = state.players.get(data.id);
    const name = p?.name || data.id?.slice(0, 8) || 'Player';
    addKillFeedEntry(`${name} died`);
  });

  room.onMessage('player_activated', () => {
    if (state.isSpectating) {
      clearSpectating();
      showAnnouncement({ id: `activated-${Date.now()}`, text: "You're in! Get ready for the next game!", type: 'system', duration: 4000, timestamp: Date.now() });
    }
  });
}
