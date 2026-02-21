/**
 * Keyboard input handling — key state tracking, help overlay, chat focus.
 */

import { state, spectator, spectatorPos } from '../state.js';

export const keys = { w: false, a: false, s: false, d: false, space: false, shift: false };

export function toggleHelpOverlay(forceShow) {
  const el = document.getElementById('help-overlay');
  if (!el) return false;
  const isVisible = el.style.display !== 'none';
  if (forceShow === false) {
    if (!isVisible) return false;
    el.style.display = 'none';
    return true;
  }
  el.style.display = (forceShow === true || !isVisible) ? 'flex' : 'none';
  return false;
}

export function setupKeyboardInput(deps) {
  const { isInSpectatorMode, fetchLeaderboard, camera } = deps;

  document.addEventListener('keydown', (e) => {
    if (state.chatFocused) {
      if (e.key === 'Escape') {
        document.getElementById('chat-input').blur();
        state.chatFocused = false;
      }
      return;
    }

    if (e.key === 'Escape') {
      if (toggleHelpOverlay(false)) return;
    }

    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = true;
    if (key === ' ' && !e.repeat) { keys.space = true; e.preventDefault(); }
    if (e.key === 'Shift') keys.shift = true;

    if (e.key === 'Enter') {
      const chatInput = document.getElementById('chat-input');
      if (chatInput) {
        chatInput.focus();
        state.chatFocused = true;
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
      }
    }

    if (isInSpectatorMode() && (key === 'w' || key === 'a' || key === 's' || key === 'd')) {
      if (!spectator.freeMode) {
        spectator.freeMode = true;
        spectatorPos.copy(camera.position);
      }
    }
    if (isInSpectatorMode() && key >= '0' && key <= '9') {
      spectator.freeMode = false;
      spectator.followIndex = key === '0' ? -1 : parseInt(key) - 1;
    }

    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      toggleHelpOverlay();
    }

    if (key === 'l') {
      const panel = document.getElementById('leaderboard-panel');
      if (!panel) return;

      const isVisible = panel.style.display === 'block';
      panel.style.display = isVisible ? 'none' : 'block';

      if (!isVisible) {
        fetchLeaderboard();
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    if (state.chatFocused) return;
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = false;
    if (key === ' ') keys.space = false;
    if (e.key === 'Shift') keys.shift = false;
  });
}
