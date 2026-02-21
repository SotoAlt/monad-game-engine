/**
 * Network manager — safe message sending and reconnection with exponential backoff.
 */

import { state, network } from '../state.js';
import { MAX_RECONNECT_ATTEMPTS, RECONNECT_BASE_DELAY, RECONNECT_MAX_DELAY } from '../config.js';
import { showReconnectOverlay, hideReconnectOverlay } from '../ui/Announcements.js';

let _connectToServerFn = null;
let _reconnectToServerFn = null;
let _reconnectTimer = null;

export function initNetworkManager({ connectToServerFn, reconnectToServerFn }) {
  _connectToServerFn = connectToServerFn;
  _reconnectToServerFn = reconnectToServerFn ?? null;
}

export function sendToServer(type, data) {
  if (!state.room) return false;

  try {
    state.room.send(type, data);
    return true;
  } catch (e) {
    console.warn('[Network] Send failed:', e.message);
    state.connected = false;
    attemptReconnect();
    return false;
  }
}

export function storeReconnectionToken() {
  if (state.room?.reconnectionToken) {
    network.reconnectionToken = state.room.reconnectionToken;
  }
}

export function cancelReconnect() {
  clearTimeout(_reconnectTimer);
  _reconnectTimer = null;
}

function onReconnectSuccess(label) {
  network.reconnectAttempts = 0;
  network.reconnectionToken = null;
  hideReconnectOverlay();
  console.log(`[Network] Reconnected via ${label}`);
}

export async function attemptReconnect() {
  if (network.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[Network] Max reconnect attempts reached');
    showReconnectOverlay(-1); // show "Connection Lost" with reload button
    return;
  }

  network.reconnectAttempts++;
  const attempt = network.reconnectAttempts;
  const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, attempt - 1), RECONNECT_MAX_DELAY);

  console.log(`[Network] Reconnecting in ${delay}ms (attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS})`);
  showReconnectOverlay(attempt);

  _reconnectTimer = setTimeout(async () => {
    // Try token-based reconnect first
    if (network.reconnectionToken && _reconnectToServerFn) {
      try {
        await _reconnectToServerFn(network.reconnectionToken);
        onReconnectSuccess('token');
        return;
      } catch (e) {
        console.warn('[Network] Token reconnect failed, trying fresh join...', e.message);
      }
    }

    // Fall back to fresh joinOrCreate
    try {
      await _connectToServerFn();
      onReconnectSuccess('fresh join');
    } catch (e) {
      console.warn('[Network] Reconnect failed:', e.message);
      attemptReconnect();
    }
  }, delay);
}
