/**
 * GameRoom - Colyseus room for real-time multiplayer
 *
 * Handles player connections, position sync, and game events.
 */

import Colyseus from 'colyseus';
const { Room } = Colyseus;
import { upsertUser } from './db.js';
import { verifyToken } from './auth.js';
import {
  isValidPosition, isValidVelocity, isValidEntityId,
  clampPosition, clampVelocity,
} from './validation.js';

function detectRequest(text) {
  const lower = text.toLowerCase();
  if (lower.includes('@agent')) {
    if (/spawn|create|build|make|add/.test(lower)) return 'spawn';
    if (/destroy|remove|delete|clear/.test(lower)) return 'destroy';
    if (/gravity|physics|bounce|friction/.test(lower)) return 'physics';
    if (/start|game|play|challenge/.test(lower)) return 'start_game';
    if (/spell|cast|effect|curse/.test(lower)) return 'spell';
    if (/help|easier|hard|difficult/.test(lower)) return 'difficulty';
    return 'general';
  }
  return null;
}

export class GameRoom extends Room {
  // ArenaManager injected by server at startup
  static arenaManager = null;

  // Per-room arena reference (resolved in onCreate)
  arena = null;

  // Rate limiting
  _chatRateLimit = new Map();
  _deathTimestamps = new Map();

  // Convenience accessors
  get worldState() { return this.arena?.worldState || null; }
  get currentMiniGame() { return this.arena?.currentMiniGame || null; }

  _systemMessage(text) {
    if (!this.worldState) return;
    const message = this.worldState.addMessage('System', 'system', text);
    this.broadcast('chat_message', message);
  }

  _isSpectator(client) {
    const player = this.worldState?.players.get(client.sessionId);
    return player?.type === 'spectator';
  }

  onCreate(options) {
    // Resolve arena from metadata (set by filterBy)
    const arenaId = this.metadata?.arenaId || 'default';
    const manager = GameRoom.arenaManager;
    if (manager) {
      this.arena = manager.getArena(arenaId);
      if (this.arena) {
        this.arena.gameRoom = this;
      }
    }

    console.log(`[GameRoom] Room created for arena: ${arenaId}`);

    // Player position updates (client -> server)
    this.onMessage('move', (client, data) => {
      if (!this.worldState) return;
      if (this._isSpectator(client)) return;

      if (!isValidPosition(data.position) || !isValidVelocity(data.velocity)) return;
      const position = clampPosition(data.position);
      const velocity = clampVelocity(data.velocity);

      // updatePlayer already marks the player active via displacement check
      this.worldState.updatePlayer(client.sessionId, { position, velocity });

      this.broadcast('player_moved', {
        id: client.sessionId,
        position,
        velocity
      }, { except: client });
    });

    this.onMessage('died', (client, data) => {
      if (!this.worldState) return;
      if (this._isSpectator(client)) return;

      const now = Date.now();
      const lastDeath = this._deathTimestamps.get(client.sessionId) || 0;
      if (now - lastDeath < 2000) return; // rate limit
      this._deathTimestamps.set(client.sessionId, now);

      if (data.position && !isValidPosition(data.position)) return;
      if (data.challengeId && !isValidEntityId(data.challengeId)) return;

      this.worldState.recordPlayerActivity(client.sessionId);

      const player = this.worldState.players.get(client.sessionId);
      const name = player?.name || client.sessionId.slice(0, 8);
      this.worldState.updatePlayer(client.sessionId, { state: 'dead' });

      if (data.challengeId) {
        this.worldState.recordChallengeAttempt(data.challengeId);
      }

      this.broadcast('player_died', {
        id: client.sessionId,
        position: data.position,
        challengeId: data.challengeId
      });

      this._systemMessage(`${name} died`);
      this.worldState.addEvent('player_death', { playerId: client.sessionId, name });

      // Notify mini-game of death (for survival, hot_potato, etc.)
      if (this.currentMiniGame?.isActive && typeof this.currentMiniGame.onPlayerDeath === 'function') {
        this.currentMiniGame.onPlayerDeath(client.sessionId);
      }

      console.log(`[GameRoom] Player died: ${client.sessionId}`);
    });

    // Player respawn
    this.onMessage('respawn', (client) => {
      if (!this.worldState) return;
      if (this._isSpectator(client)) return;

      this.worldState.recordPlayerActivity(client.sessionId);
      const player = this.worldState.players.get(client.sessionId);
      const name = player?.name || client.sessionId.slice(0, 8);
      const rp = this.worldState.respawnPoint || [0, 2, 0];
      this.worldState.updatePlayer(client.sessionId, {
        state: 'alive',
        position: [...rp]
      });

      this.broadcast('player_respawned', { id: client.sessionId });
      this._systemMessage(`${name} respawned`);
    });

    // Challenge completion
    this.onMessage('challenge_complete', (client, data) => {
      if (!this.worldState) return;
      if (!isValidEntityId(data.challengeId)) return;

      const challenge = this.worldState.completeChallenge(data.challengeId, client.sessionId);
      if (!challenge) return;

      this.broadcast('challenge_completed', {
        challengeId: data.challengeId,
        playerId: client.sessionId,
        challenge
      });

      console.log(`[GameRoom] Challenge completed: ${data.challengeId} by ${client.sessionId}`);
    });

    // Collectible pickup
    this.onMessage('collect', (client, data) => {
      if (!this.worldState) return;
      if (this._isSpectator(client)) return;
      if (!isValidEntityId(data.entityId)) return;

      this.worldState.recordPlayerActivity(client.sessionId);

      // Only allow collecting entities that still exist
      const entity = this.worldState.entities.get(data.entityId);
      if (!entity || entity.type !== 'collectible') return;

      // Remove from server state
      try {
        this.worldState.destroyEntity(data.entityId);
      } catch {
        return; // Already destroyed by another player
      }

      this.broadcast('entity_destroyed', { id: data.entityId });
      this.broadcast('collectible_picked', {
        entityId: data.entityId,
        playerId: client.sessionId
      });

      // Notify mini-game if active
      if (this.currentMiniGame?.isActive && typeof this.currentMiniGame.onCollect === 'function') {
        this.currentMiniGame.onCollect(client.sessionId, data.entityId);
      }
    });

    // Trigger activation (for goals, checkpoints)
    this.onMessage('trigger_activated', (client, data) => {
      if (!this.worldState) return;
      if (this._isSpectator(client)) return;
      if (!isValidEntityId(data.entityId)) return;
      this.worldState.recordPlayerActivity(client.sessionId);
      console.log(`[GameRoom] Trigger activated: ${data.entityId} by ${client.sessionId}`);

      this.broadcast('trigger_activated', {
        entityId: data.entityId,
        playerId: client.sessionId
      });

      // Notify mini-game if active — pass entityId for checkpoint-based games
      if (this.currentMiniGame?.isActive) {
        if (typeof this.currentMiniGame.onTriggerActivated === 'function') {
          this.currentMiniGame.onTriggerActivated(client.sessionId, data.entityId);
        } else if (typeof this.currentMiniGame.onPlayerReachedGoal === 'function') {
          this.currentMiniGame.onPlayerReachedGoal(client.sessionId);
        }
      }
    });

    // Player chat messages
    this.onMessage('chat', (client, data) => {
      if (!this.worldState || !data.text) return;

      const text = String(data.text).trim();
      if (text.length === 0 || text.length > 200) return;

      // Rate limit: 1 message per second per player
      const now = Date.now();
      const lastSent = this._chatRateLimit.get(client.sessionId) || 0;
      if (now - lastSent < 1000) {
        client.send('chat_error', { error: 'Too fast! Wait a moment.' });
        return;
      }
      this._chatRateLimit.set(client.sessionId, now);

      this.worldState.recordPlayerActivity(client.sessionId);
      const player = this.worldState.players.get(client.sessionId);
      const sender = player?.name || client.sessionId.slice(0, 8);

      const message = this.worldState.addMessage(sender, 'player', text);
      message.senderId = client.sessionId;
      message.requestType = detectRequest(text);
      this.broadcast('chat_message', message);
    });

    // Breakable platform step notification
    this.onMessage('platform_step', (client, { entityId }) => {
      if (!this.worldState) return;
      if (this._isSpectator(client)) return;
      if (!isValidEntityId(entityId)) return;
      this.worldState.recordPlayerActivity(client.sessionId);
      const started = this.worldState.startBreaking(entityId);
      if (!started) return;

      const info = this.worldState.breakingPlatforms.get(entityId);
      this.broadcast('platform_cracking', { id: entityId, breakAt: info.breakAt });
    });

    // AFK heartbeat response — player clicked "I'm here!"
    this.onMessage('afk_heartbeat', (client, data) => {
      if (!this.worldState) return;
      const player = this.worldState.players.get(client.sessionId);
      if (!player || player.state !== 'afk_warned') return;
      if (data.token !== player.afkWarningToken) return;

      this.worldState.recordPlayerActivity(client.sessionId);
      client.send('afk_cleared');
    });

    // Placeholder for future server-side physics (clients handle physics currently)
    this.setSimulationInterval(() => {}, 1000 / 60);
  }

  getClient(sessionId) {
    for (const client of this.clients) {
      if (client.sessionId === sessionId) return client;
    }
    return null;
  }

  onJoin(client, options) {
    const name = options.name || `Player-${client.sessionId.slice(0, 4)}`;
    const payload = options.token ? verifyToken(options.token) : null;
    const userId = payload?.userId ?? client.sessionId;
    const type = options.type || (payload ? 'authenticated' : 'human');
    const isUrlSpectator = type === 'spectator';

    upsertUser(userId, name, type);
    console.log(`[GameRoom] ${name} joined (${type})`);

    if (!this.worldState) return;

    // Determine initial player state:
    // - URL spectators always spectate
    // - Humans joining mid-game spectate until next round
    // - Otherwise, start alive
    const isHuman = type !== 'ai' && type !== 'spectator';
    const gamePhase = this.worldState.gameState.phase;
    const isGameActive = gamePhase === 'countdown' || gamePhase === 'playing';

    let initialState = 'alive';
    if (isUrlSpectator || (isGameActive && isHuman)) {
      initialState = 'spectating';
    }

    const player = this.worldState.addPlayer(client.sessionId, name, type, initialState, userId);

    const initState = this.worldState.getState();
    client.send('init', {
      playerId: client.sessionId,
      worldState: initState,
      spectating: initialState === 'spectating',
      lobbyCountdown: this.worldState.autoStartTargetTime || null
    });

    this.broadcast('player_joined', player, { except: client });

    // Visual announcement for human players (isHuman excludes spectators and AI)
    if (isHuman) {
      const announcement = this.worldState.announce(`${name} has entered the arena!`, 'system', 4000);
      this.broadcast('announcement', announcement);
    }

    if (initialState === 'spectating') {
      this._systemMessage(`${name} joined — watching until next round`);
    } else {
      this._systemMessage(`${name} has entered the arena`);
    }

    this.worldState.addEvent('player_join', { playerId: client.sessionId, name, type });
  }

  async onLeave(client, consented) {
    const sessionId = client.sessionId;
    console.log(`[GameRoom] Player leaving: ${sessionId} (consented: ${consented})`);

    if (!this.worldState) {
      this._finalizeLeave(sessionId);
      return;
    }

    // Clean disconnect (tab closed, intentional leave) — remove immediately
    if (consented) {
      this._finalizeLeave(sessionId);
      return;
    }

    // Unexpected disconnect — hold slot for 20s
    const player = this.worldState.players.get(sessionId);
    const name = player?.name || sessionId.slice(0, 8);

    if (player) {
      player._disconnectedAt = Date.now();
    }

    this.broadcast('player_temporarily_left', { id: sessionId, name });
    this._systemMessage(`${name} disconnected — waiting for reconnect...`);

    try {
      await this.allowReconnection(client, 20);

      // Reconnected successfully
      console.log(`[GameRoom] Player reconnected: ${sessionId}`);
      if (player) delete player._disconnectedAt;

      // Send full state to reconnected client
      const initState = this.worldState.getState();
      client.send('init', {
        playerId: sessionId,
        worldState: initState,
        reconnected: true,
        lobbyCountdown: this.worldState.autoStartTargetTime || null
      });

      this.broadcast('player_reconnected', { id: sessionId, name });
      this._systemMessage(`${name} reconnected!`);
    } catch {
      // Timeout — permanently remove
      console.log(`[GameRoom] Reconnection timeout for ${sessionId}`);
      this._finalizeLeave(sessionId);
    }
  }

  _finalizeLeave(sessionId) {
    this._chatRateLimit.delete(sessionId);
    this._deathTimestamps.delete(sessionId);

    if (!this.worldState) return;

    const player = this.worldState.players.get(sessionId);
    const name = player?.name || sessionId.slice(0, 8);

    this.worldState.removePlayer(sessionId);
    this.broadcast('player_left', { id: sessionId, name });
    this._systemMessage(`${name} has left`);
    this.worldState.addEvent('player_leave', { playerId: sessionId, name });
  }

  onDispose() {
    console.log(`[GameRoom] Room disposed for arena: ${this.arena?.id || 'unknown'}`);
    // Clear arena's room reference so a new room can be created
    if (this.arena) {
      this.arena.gameRoom = null;
    }
  }
}
