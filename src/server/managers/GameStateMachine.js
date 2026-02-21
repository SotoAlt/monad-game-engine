import { randomUUID } from 'crypto';
import { VALID_GAME_TYPES } from '../../shared/constants.js';

function createLobbyState() {
  return {
    phase: 'lobby',
    currentGame: null,
    gameType: null,
    startTime: null,
    timeLimit: null,
    cooldownUntil: 0,
    winners: [],
    losers: [],
  };
}

export class GameStateMachine {
  // Valid phases: lobby, building, countdown, playing, ended
  static VALID_GAME_TYPES = VALID_GAME_TYPES;

  /**
   * @param {function} onDeactivateHazardPlane - () => void
   * @param {function} clearWorldFn - () => void (facade's clearEntities orchestration)
   */
  constructor(onDeactivateHazardPlane, clearWorldFn) {
    this._onDeactivateHazardPlane = onDeactivateHazardPlane;
    this._clearWorldFn = clearWorldFn;

    this.gameState = createLobbyState();

    this.gameHistory = [];
    this.lastGameType = undefined;
    this.lastGameEndTime = undefined;
    this.lastTemplate = null;
    this.lastTemplateLoadTime = 0;
    this.lobbyEnteredAt = Date.now();
    this.autoStartTargetTime = null;

    this._countdownTimer = null;
    this._lobbyResetTimer = null;

    this.onPhaseChange = null;
  }

  startGame(gameType, config = {}) {
    // Cancel any pending lobby reset from a previous game
    clearTimeout(this._lobbyResetTimer);

    if (!GameStateMachine.VALID_GAME_TYPES.includes(gameType)) {
      throw new Error(`Invalid game type: ${gameType}`);
    }

    const gameId = `game-${randomUUID().slice(0, 8)}`;
    const timeLimit = config.timeLimit || 60000;

    this.gameState = {
      phase: 'countdown',
      currentGame: gameId,
      gameType,
      startTime: Date.now(),
      timeLimit,
      cooldownUntil: 0,
      targetEntity: config.targetEntity || null,
      winners: [],
      losers: []
    };

    // Transition to playing after countdown
    this._countdownTimer = setTimeout(() => {
      if (this.gameState.currentGame === gameId && this.gameState.phase === 'countdown') {
        this.gameState.phase = 'playing';
        this.gameState.startTime = Date.now();
        console.log(`[GameStateMachine] Game started: ${gameType}`);

        this._notifyPhaseChange();
      }
    }, config.countdownTime || 5000);

    console.log(`[GameStateMachine] Game countdown: ${gameType} (${timeLimit}ms)`);
    return { ...this.gameState };
  }

  endGame(result, winnerId = null) {
    if (this.gameState.phase === 'lobby') {
      return this.gameState;
    }

    // Cancel countdown timer if game ends during countdown
    clearTimeout(this._countdownTimer);

    const endedGameId = this.gameState.currentGame;
    const now = Date.now();

    // Track last game type for variety enforcement
    this.lastGameType = this.gameState.gameType;
    this.lastGameEndTime = now;

    // Push to game history (cap at 8)
    this.gameHistory.push({
      type: this.gameState.gameType,
      template: this.lastTemplate,
      timestamp: now,
    });
    if (this.gameHistory.length > 8) this.gameHistory = this.gameHistory.slice(-8);

    this._onDeactivateHazardPlane();
    this.gameState.phase = 'ended';
    this.gameState.endTime = now;
    this.gameState.result = result; // 'win', 'lose', 'timeout', 'cancelled'
    this.gameState.cooldownUntil = now + 15000;

    if (winnerId) {
      this.gameState.winners.push(winnerId);
    }

    console.log(`[GameStateMachine] Game ended: ${result}`);

    this._notifyPhaseChange();

    // Return to lobby after delay (only if no new game started)
    clearTimeout(this._lobbyResetTimer);
    this._lobbyResetTimer = setTimeout(() => {
      if (this.gameState.phase === 'ended' && this.gameState.currentGame === endedGameId) {
        this.resetGameState();
      }
    }, 5000);

    return { ...this.gameState };
  }

  resetGameState() {
    this._clearWorldFn();
    this.gameState = createLobbyState();
    this.lobbyEnteredAt = Date.now();
    console.log('[GameStateMachine] Game state reset to lobby (world cleared)');

    this._notifyPhaseChange();
  }

  startBuilding() {
    this.gameState = { ...createLobbyState(), phase: 'building', startTime: Date.now() };
    console.log('[GameStateMachine] Entered building phase');
    return { ...this.gameState };
  }

  getGameState() {
    const state = { ...this.gameState };

    // Calculate remaining time if playing
    if (state.phase === 'playing' && state.timeLimit) {
      const elapsed = Date.now() - state.startTime;
      state.timeRemaining = Math.max(0, state.timeLimit - elapsed);
    }

    return state;
  }

  isInCooldown() {
    return Date.now() < this.gameState.cooldownUntil;
  }

  recordWinner(playerId) {
    if (this.gameState.phase === 'playing') {
      this.gameState.winners.push(playerId);
    }
  }

  recordLoser(playerId) {
    if (this.gameState.phase === 'playing') {
      this.gameState.losers.push(playerId);
    }
  }

  setLastTemplate(name) {
    this.lastTemplate = name;
  }

  _notifyPhaseChange() {
    if (typeof this.onPhaseChange === 'function') {
      this.onPhaseChange(this.getGameState());
    }
  }
}
