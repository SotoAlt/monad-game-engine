/**
 * Effect, environment, chat, and lifecycle WebSocket message handlers.
 */

import { SPELL } from '../../../shared/constants.js';
import { state, hazardPlaneState, player, playerVelocity } from '../../state.js';
import { triggerCameraShake, showVignette, spawnParticles } from '../../vfx/ScreenEffects.js';
import { playSpellSound } from '../../audio/SoundManager.js';
import { setFloorType, applyEnvironment, updateHazardPlaneMaterial, getHazardPlaneMesh } from '../../scene/FloorManager.js';
import { showToast, showAnnouncement, showSpellEffect } from '../../ui/Announcements.js';
import { showAfkWarning, hideAfkWarning, showAfkKickedScreen } from '../../ui/AfkOverlay.js';
import { displayChatMessage } from '../../ui/ChatSystem.js';
import { attemptReconnect, storeReconnectionToken } from '../NetworkManager.js';
import { updateUI } from '../../ui/GameStatusHUD.js';

const SPELL_VIGNETTE_COLORS = {
  [SPELL.SPEED_BOOST]: 'rgba(46,204,113,0.3)',
  [SPELL.INVERT_CONTROLS]: 'rgba(155,89,182,0.4)',
  [SPELL.LOW_GRAVITY]: 'rgba(52,152,219,0.2)',
};

const SPELL_SCALE_VALUES = {
  [SPELL.GIANT]: 2,
  [SPELL.TINY]: 0.4,
};

const CLOSE_NORMAL = 1000;
const CLOSE_AFK_KICKED = 4000;

export function registerEffectHandlers(room) {
  room.onMessage('spell_cast', (spell) => {
    console.log(`[Spell] ${spell.name} cast for ${spell.duration}ms`);
    if (!state.activeEffects) state.activeEffects = [];
    state.activeEffects.push(spell);
    showSpellEffect(spell);
    triggerCameraShake(0.3, 200);
    playSpellSound();

    const vignetteColor = SPELL_VIGNETTE_COLORS[spell.type];
    if (vignetteColor) showVignette(vignetteColor, spell.duration);

    const scale = SPELL_SCALE_VALUES[spell.type];
    if (scale && player.mesh) {
      player.mesh.scale.setScalar(scale);
      spawnParticles(player.mesh.position, '#9b59b6', 30, 6);
    }

    setTimeout(() => {
      state.activeEffects = (state.activeEffects || []).filter(e => e.id !== spell.id);
      if (scale && player.mesh) player.mesh.scale.setScalar(1);
    }, spell.duration);
  });

  room.onMessage('respawn_point_changed', ({ position }) => { state.respawnPoint = position; });

  room.onMessage('floor_changed', ({ type }) => setFloorType(type));

  room.onMessage('hazard_plane_changed', (data) => {
    Object.assign(hazardPlaneState, data);
    const mesh = getHazardPlaneMesh();
    mesh.visible = data.active;
    mesh.position.y = hazardPlaneState.height;
    updateHazardPlaneMaterial(data.type);
  });

  room.onMessage('hazard_plane_update', (data) => {
    Object.assign(hazardPlaneState, data);
    getHazardPlaneMesh().position.y = data.height;
  });

  room.onMessage('environment_changed', applyEnvironment);

  room.onMessage('effects_cleared', () => {
    state.activeEffects = [];
    if (player.mesh) player.mesh.scale.setScalar(1);
  });

  room.onMessage('players_teleported', ({ position }) => {
    if (player.mesh && position) {
      player.mesh.position.set(...position);
      playerVelocity.set(0, 0, 0);
      player.isJumping = false;
      player.coyoteTimer = 0;
      player.jumpBufferTimer = 0;
    }
  });

  room.onMessage('physics_changed', (physics) => {
    state.physics = physics;
    updateUI();
  });

  room.onMessage('afk_warning', ({ token, timeout }) => showAfkWarning(token, timeout));
  room.onMessage('afk_cleared', hideAfkWarning);

  room.onMessage('chat_message', displayChatMessage);

  room.onMessage('chat_error', ({ error }) => {
    showToast(error || 'Message not sent', 'error');
  });

  room.onMessage('trigger_activated', (data) => {
    const entity = state.entities.get(data.entityId);
    if (entity) {
      spawnParticles(entity.position, '#9b59b6', 15, 3);
    }
  });

  room.onMessage('announcement', showAnnouncement);

  // Suppress Colyseus warning — actual disconnect handled by onLeave
  room.onMessage('afk_kicked', () => {});

  // Lifecycle handlers
  room.onLeave((code) => {
    state.connected = false;
    if (state.intentionalDisconnect) {
      state.intentionalDisconnect = false;
      return;
    }
    storeReconnectionToken();
    state.room = null;
    if (code === CLOSE_AFK_KICKED) {
      showAfkKickedScreen();
      return;
    }
    if (code === CLOSE_NORMAL) return;
    attemptReconnect();
  });

  room.onError((code, message) => {
    console.error('[Network] Room error:', code, message);
  });
}
