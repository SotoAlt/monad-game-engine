/**
 * AFK warning and kicked overlays -- styled with design system CSS classes.
 */

import { state, afk } from '../state.js';

let _keyHandler = null;

function createOverlay(titleText) {
  const overlay = document.createElement('div');
  overlay.className = 'afk-overlay';

  const brand = document.createElement('div');
  brand.className = 'afk-brand';
  brand.textContent = 'CHAOS ARENA';

  const title = document.createElement('div');
  title.className = 'afk-title';
  title.textContent = titleText;

  overlay.append(brand, title);
  return overlay;
}

export function showAfkWarning(token, timeout) {
  hideAfkWarning();

  const overlay = createOverlay('ARE YOU STILL THERE?');

  const countdownEl = document.createElement('div');
  countdownEl.className = 'afk-countdown';
  let remaining = Math.ceil(timeout / 1000);
  countdownEl.textContent = `You'll be kicked in ${remaining}s...`;

  afk.countdownInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(afk.countdownInterval);
      countdownEl.textContent = 'Kicking...';
    } else {
      countdownEl.textContent = `You'll be kicked in ${remaining}s...`;
    }
  }, 1000);

  function dismiss() {
    if (state.room) state.room.send('afk_heartbeat', { token });
    hideAfkWarning();
  }

  const btn = document.createElement('button');
  btn.className = 'afk-btn-confirm';
  btn.textContent = "I'm here!";
  btn.onclick = dismiss;

  overlay.append(countdownEl, btn);
  document.body.appendChild(overlay);
  afk.overlay = overlay;

  _keyHandler = dismiss;
  document.addEventListener('keydown', _keyHandler);
}

export function hideAfkWarning() {
  if (afk.countdownInterval) {
    clearInterval(afk.countdownInterval);
    afk.countdownInterval = null;
  }
  if (_keyHandler) {
    document.removeEventListener('keydown', _keyHandler);
    _keyHandler = null;
  }
  if (afk.overlay) {
    afk.overlay.remove();
    afk.overlay = null;
  }
}

export function showAfkKickedScreen() {
  hideAfkWarning();

  const overlay = createOverlay('DISCONNECTED');

  const reason = document.createElement('div');
  reason.className = 'afk-reason';
  reason.textContent = 'You were kicked for being AFK.';

  const btn = document.createElement('button');
  btn.className = 'afk-btn-rejoin';
  btn.textContent = 'Rejoin';
  btn.onclick = () => location.reload();

  overlay.append(reason, btn);
  document.body.appendChild(overlay);
}
