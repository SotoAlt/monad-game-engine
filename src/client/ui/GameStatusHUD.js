/**
 * Game status HUD — phase display, timer, entity/player counts.
 *
 * updateUI() is debounced via requestAnimationFrame — 111 rapid addEntity
 * calls collapse into a single DOM update on the next paint frame.
 */

import { state, remotePlayers, countdown } from '../state.js';
import { isSpectator, isDebug } from '../config.js';

export function clearCountdownInterval() {
  if (countdown.intervalId !== null) {
    clearInterval(countdown.intervalId);
    countdown.intervalId = null;
  }
}

export function updateGameStateUI() {
  const statusEl = document.getElementById('game-status');
  const phaseEl = document.getElementById('game-phase');
  const typeEl = document.getElementById('game-type');
  const timerEl = document.getElementById('game-timer');

  if (state.gameState.phase === 'lobby') {
    statusEl.style.display = 'flex';
    statusEl.className = 'lobby';
    phaseEl.textContent = 'LOBBY';
    if (state.lobbyCountdownTarget) {
      const now = Date.now();
      if (state.lobbyReadyAt && now < state.lobbyReadyAt) {
        const remaining = Math.max(0, Math.ceil((state.lobbyReadyAt - now) / 1000));
        typeEl.textContent = 'Get ready!';
        timerEl.textContent = remaining > 0 ? `Starting in ${remaining}s` : '';
        timerEl.style.color = '#f39c12';
      } else {
        typeEl.textContent = 'AI choosing next game...';
        timerEl.textContent = '';
      }
    } else {
      typeEl.textContent = 'Waiting for players...';
      timerEl.textContent = '';
    }
    return;
  }

  if (state.gameState.phase === 'building') {
    statusEl.style.display = 'flex';
    statusEl.className = 'building';
    phaseEl.textContent = 'BUILDING...';
    typeEl.textContent = 'Building arena...';
    timerEl.textContent = '';
    return;
  }

  statusEl.style.display = 'flex';
  statusEl.className = state.gameState.phase;
  phaseEl.textContent = state.gameState.phase.toUpperCase();
  typeEl.textContent = state.gameState.gameType ? `Mode: ${state.gameState.gameType}` : '';

  if (state.gameState.phase === 'playing' && state.gameState.timeRemaining !== undefined) {
    clearCountdownInterval();
    const seconds = Math.ceil(state.gameState.timeRemaining / 1000);
    timerEl.textContent = `${seconds}s`;
    timerEl.style.color = seconds <= 10 ? '#e74c3c' : 'white';
  } else if (state.gameState.phase === 'countdown') {
    if (countdown.intervalId === null) {
      timerEl.textContent = '5...';
      timerEl.style.color = '#f39c12';
    }
  } else {
    clearCountdownInterval();
    timerEl.textContent = '';
  }
}

let _uiDirty = false;
let _uiScheduled = false;

function _doUpdateUI() {
  document.getElementById('entity-count').textContent = state.entities.size;
  document.getElementById('player-count').textContent = remotePlayers.size + (isSpectator ? 0 : 1);
  document.getElementById('physics-info').textContent = `g=${state.physics.gravity}`;

  if (isDebug) {
    const entitiesDiv = document.getElementById('entities');
    entitiesDiv.innerHTML = '';
    for (const e of state.entities.values()) {
      const item = document.createElement('div');
      item.className = 'entity-item';
      item.textContent = `${e.type}: ${e.id.slice(-8)}`;
      entitiesDiv.appendChild(item);
    }
  }

  updateGameStateUI();
}

export function updateUI() {
  _uiDirty = true;
  if (_uiScheduled) return;
  _uiScheduled = true;
  requestAnimationFrame(() => {
    _uiScheduled = false;
    if (!_uiDirty) return;
    _uiDirty = false;
    _doUpdateUI();
  });
}
