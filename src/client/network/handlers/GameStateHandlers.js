/**
 * Game state and scoring WebSocket message handlers.
 */

import { GAME_TYPES } from '../../../shared/constants.js';
import { state, remotePlayers, player, countdown } from '../../state.js';
import { updateGameStateUI, clearCountdownInterval, updateUI } from '../../ui/GameStatusHUD.js';
import { fetchLeaderboard } from '../../ui/Leaderboard.js';
import { showToast } from '../../ui/Announcements.js';
import { triggerCameraShake, screenFlash, showVignette, spawnParticles } from '../../vfx/ScreenEffects.js';
import { playCountdownBeep, playWinFanfare, playCollectSound } from '../../audio/SoundManager.js';
import { applyWorldState } from '../HttpApi.js';

export function registerGameStateHandlers(room, { clearSpectating }) {
  room.onMessage('game_state_changed', (gameState) => {
    console.log('[Event] Game state changed:', gameState.phase);
    const prevPhase = state.gameState.phase;
    state.gameState = gameState;
    updateGameStateUI();

    if (gameState.phase !== 'lobby') {
      state.lobbyCountdownTarget = null;
      state.lobbyReadyAt = null;
    }

    if (gameState.phase === 'lobby' && state.isSpectating) {
      clearSpectating();
    }

    if (gameState.phase === 'lobby' || gameState.phase === 'ended') {
      const scoreOverlay = document.getElementById('score-overlay');
      const curseTimer = document.getElementById('curse-timer');
      const checkpointDisplay = document.getElementById('checkpoint-display');
      if (scoreOverlay) scoreOverlay.style.display = 'none';
      if (curseTimer) { curseTimer.style.display = 'none'; curseTimer.className = ''; }
      if (checkpointDisplay) checkpointDisplay.style.display = 'none';
      state.cursedPlayerId = null;
      for (const [, mesh] of remotePlayers) {
        if (mesh.material) {
          mesh.material.emissive?.setHex(0x000000);
          mesh.material.emissiveIntensity = 0;
        }
      }
    }

    if (gameState.phase === 'countdown' && prevPhase !== 'countdown') {
      triggerCameraShake(0.1, 5000);
      for (let i = 0; i < 5; i++) setTimeout(() => playCountdownBeep(440), i * 1000);
      setTimeout(() => playCountdownBeep(880), 5000);

      clearCountdownInterval();
      const timerEl = document.getElementById('game-timer');
      timerEl.textContent = '5...';
      timerEl.style.color = '#f39c12';
      let countdownSec = 5;
      countdown.intervalId = setInterval(() => {
        countdownSec--;
        if (countdownSec > 0) {
          timerEl.textContent = `${countdownSec}...`;
        } else {
          timerEl.textContent = 'GO!';
          timerEl.style.color = '#2ecc71';
          clearCountdownInterval();
        }
      }, 1000);
    }

    if (gameState.phase === 'ended') {
      clearCountdownInterval();
      const timerEl = document.getElementById('game-timer');
      setTimeout(fetchLeaderboard, 1000);

      const isLocalWinner = gameState.result === 'win' && gameState.winners?.includes(room.sessionId);
      if (isLocalWinner) {
        timerEl.textContent = 'YOU WIN!';
        timerEl.style.color = '#f1c40f';
        screenFlash('#f1c40f', 600);
        playWinFanfare();
        if (player.mesh) spawnParticles(player.mesh.position, '#f1c40f', 40, 10);
      } else if (gameState.result === 'timeout') {
        timerEl.textContent = 'TIME UP!';
        timerEl.style.color = '#f39c12';
      } else if (gameState.result === 'draw') {
        timerEl.textContent = 'DRAW!';
        timerEl.style.color = '#9b59b6';
      } else {
        timerEl.textContent = 'GAME OVER';
        timerEl.style.color = '#e74c3c';
        if (gameState.result === 'win') screenFlash('#e74c3c', 500);
      }
    }
  });

  room.onMessage('lobby_countdown', (data) => {
    state.lobbyCountdownTarget = data.targetTime || null;
    state.lobbyReadyAt = data.lobbyReadyAt || null;
    updateGameStateUI();
  });

  room.onMessage('init', (data) => {
    console.log('[Init] Received initial state from room');
    applyWorldState(data.worldState);
    state.lobbyCountdownTarget = data.lobbyCountdown || null;
    updateUI();

    if (data.spectating) {
      state.isSpectating = true;
      const banner = document.createElement('div');
      banner.id = 'spectator-banner';
      banner.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#f39c12;padding:10px 24px;border-radius:8px;font-size:16px;z-index:999;pointer-events:none;';
      banner.textContent = 'Spectating — WASD to fly, drag to look, 0-9 to follow players';
      document.body.appendChild(banner);
    }
  });

  room.onMessage('score_update', (data) => {
    const overlay = document.getElementById('score-overlay');
    if (!overlay) return;
    if (data.gameType !== GAME_TYPES.KING) { overlay.style.display = 'none'; return; }
    overlay.style.display = 'block';
    const target = data.targetScore || 30;
    const sorted = Object.entries(data.scores).sort((a, b) => b[1].score - a[1].score);
    overlay.innerHTML = `<div class="score-title">KING OF THE HILL (${target})</div>` +
      sorted.map(([, info]) => {
        const pct = Math.min(100, (info.score / target) * 100);
        return `<div class="score-row"><span>${info.name}</span><span>${info.score}</span></div>` +
          `<div class="score-bar"><div class="score-bar-fill" style="width:${pct}%"></div></div>`;
      }).join('');
  });

  room.onMessage('curse_changed', (data) => {
    state.cursedPlayerId = data.cursedPlayerId;
    state.curseRound = data.round;
    for (const [id, mesh] of remotePlayers) {
      if (mesh.material) {
        const isCursed = id === data.cursedPlayerId;
        mesh.material.emissive?.setHex(isCursed ? 0xff0000 : 0x000000);
        mesh.material.emissiveIntensity = isCursed ? 0.5 : 0;
      }
    }
    if (data.cursedPlayerId === room.sessionId) {
      triggerCameraShake(0.2, 300);
      showVignette('#ff0000', 0.3, data.curseDuration || 12000);
    }
    const curseEl = document.getElementById('curse-timer');
    if (curseEl) {
      curseEl.style.display = 'block';
      curseEl.textContent = `Round ${data.round} — ${data.playersAlive} alive`;
    }
  });

  room.onMessage('curse_timer_update', (data) => {
    const curseEl = document.getElementById('curse-timer');
    if (!curseEl) return;
    curseEl.style.display = 'block';
    const sec = Math.ceil(data.curseTimer / 1000);
    const isLocal = data.cursedPlayerId === room.sessionId;
    curseEl.textContent = isLocal ? `YOU HAVE THE CURSE! ${sec}s` : `Curse: ${sec}s`;
    curseEl.className = sec <= 3 ? 'pulsing' : '';
  });

  room.onMessage('curse_eliminated', (data) => {
    const mesh = remotePlayers.get(data.playerId);
    if (mesh?.material) {
      mesh.material.emissive?.setHex(0x000000);
      mesh.material.emissiveIntensity = 0;
    }
  });

  room.onMessage('collectible_picked', (data) => {
    const entity = state.entities.get(data.entityId);
    if (entity) spawnParticles(entity.position, '#f1c40f', 15, 3);
    if (data.playerId === room.sessionId) playCollectSound();
  });

  room.onMessage('minigame_ended', (data) => {
    if (data.winnerName) {
      showToast(`${data.winnerName} wins${data.gameType ? ` (${data.gameType})` : ''}!`, 'success');
    }
  });

  room.onMessage('challenge_completed', (data) => {
    showToast(data.message || 'Challenge complete!', 'success');
  });

  room.onMessage('checkpoint_reached', (data) => {
    const cpEl = document.getElementById('checkpoint-display');
    if (!cpEl) return;
    cpEl.style.display = 'block';
    if (data.playerId === room.sessionId) {
      cpEl.textContent = `Checkpoint ${data.checkpoint}/${data.total}`;
      cpEl.style.borderColor = '#2ecc71';
      triggerCameraShake(0.1, 150);
    } else {
      cpEl.textContent = `${data.playerName}: ${data.checkpoint}/${data.total}`;
      cpEl.style.borderColor = '#95a5a6';
    }
    const entity = state.entities.get(data.entityId);
    if (entity) spawnParticles(entity.position, '#2ecc71', 20, 4);
    playCollectSound();
  });
}
