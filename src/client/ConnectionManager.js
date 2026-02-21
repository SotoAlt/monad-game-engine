/**
 * Connection manager — Colyseus room join, reconnect, and message handler registration.
 */

import { Client } from 'colyseus.js';
import { SERVER_URL, selectedArenaId } from './config.js';
import { state, auth } from './state.js';
import { storeReconnectionToken } from './network/NetworkManager.js';
import { registerMessageHandlers } from './network/MessageHandlers.js';
import { hideReconnectOverlay } from './ui/Announcements.js';

let _messageDeps = null;

export function initConnectionManager(messageDeps) {
  _messageDeps = messageDeps;
}

export function disconnectFromServer() {
  if (state.room) {
    state.intentionalDisconnect = true;
    state.room.leave();
    state.room = null;
    state.connected = false;
  }
}

function onRoomJoined(room) {
  state.room = room;
  state.connected = true;
  storeReconnectionToken();
  hideReconnectOverlay();
  registerMessageHandlers(room, _messageDeps);
  console.log('[Network] Connected to room:', room.roomId);
}

export async function connectToServer() {
  try {
    const client = new Client(SERVER_URL);
    const user = auth.user?.user;
    const playerName = user?.twitterUsername || user?.name || `Player-${Date.now().toString(36)}`;
    const joinOptions = { name: playerName, arenaId: selectedArenaId };
    if (auth.user?.token) joinOptions.token = auth.user.token;
    if (user?.type) joinOptions.type = user.type;

    const room = await client.joinOrCreate('game', joinOptions);
    onRoomJoined(room);
    return true;
  } catch (error) {
    console.error('[Network] Connection failed:', error);
    state.connected = false;
    return false;
  }
}

export async function reconnectToServer(token) {
  const client = new Client(SERVER_URL);
  const room = await client.reconnect(token);
  onRoomJoined(room);
  return true;
}
