/**
 * ArenaInstance - Bundles all per-arena state
 *
 * Each arena gets its own WorldState, MiniGame lifecycle, SSE clients,
 * webhooks, auto-start timer, rate limits, AI players, and agent players.
 */

import { WorldState } from './WorldState.js';

const SSE_EVENTS = new Set([
  'announcement', 'player_died', 'spell_cast', 'game_state_changed',
  'player_joined', 'player_left', 'chat_message', 'floor_changed',
  'entity_spawned', 'entity_destroyed',
  'entities_batch', 'entities_destroyed_batch', 'world_cleared',
]);

export class ArenaInstance {
  constructor(id, config = {}) {
    this.id = id;
    this.name = config.name || 'Arena';
    this.description = config.description || '';
    this.gameMasterName = config.gameMasterName || 'Game Master';
    this.apiKey = config.apiKey || null;
    this.creatorId = config.creatorId || null;
    this.isDefault = config.isDefault || false;
    this.upvotes = config.upvotes || 0;
    this.createdAt = config.createdAt || Date.now();
    this.lastActive = Date.now();

    this.config = {
      maxPlayers: config.maxPlayers || 8,
      entryFee: config.entryFee || 0,
      rewards: config.rewards || '',
      allowedGameTypes: config.allowedGameTypes || ['reach'],
      defaultTemplate: config.defaultTemplate || null,
      environment: config.environment || {},
      rules: config.rules || '',
      autoStartDelay: config.autoStartDelay || 45000,
    };

    // Core game state
    this.worldState = new WorldState();
    this.currentMiniGame = null;
    this.gameRoom = null;
    this.agentLoop = null;

    // SSE and webhooks
    this.sseClients = new Set();
    this.webhooks = new Map();
    this.webhookIdCounter = 0;

    // Auto-start timer
    this.autoStartTimer = null;

    // Rate limits
    this.lastAnnouncementTime = 0;
    this.lastAgentChatTime = 0;

    // AI players
    this.aiPlayers = [];
    this.aiPlayersEnabled = false;

    // Agent players (external)
    this.agentPlayers = new Map();

    // Tick timestamps
    this.lastStateBroadcast = 0;
    this.lastHazardBroadcast = 0;
    this._lastAfkCheck = 0;
  }

  broadcastToRoom(event, data) {
    if (this.gameRoom) {
      this.gameRoom.broadcast(event, data);
    }
    if (SSE_EVENTS.has(event)) {
      this.broadcastSSE(event, data);
    }
  }

  broadcastSSE(eventType, data) {
    const payload = JSON.stringify({ type: eventType, ...data, timestamp: Date.now() });
    for (const client of this.sseClients) {
      client.res.write(`data: ${payload}\n\n`);
    }
    this.fireWebhooks(eventType, data);
  }

  fireWebhooks(eventType, data) {
    const payload = JSON.stringify({
      type: eventType,
      data,
      arenaId: this.id,
      timestamp: Date.now()
    });

    for (const webhook of this.webhooks.values()) {
      if (webhook.events && !webhook.events.includes(eventType)) continue;
      fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(5000)
      }).catch(() => {});
    }
  }

  touch() {
    this.lastActive = Date.now();
  }

  getPublicInfo() {
    const gameState = this.worldState.getGameState();
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      gameMasterName: this.gameMasterName,
      playerCount: this.worldState.players.size,
      phase: gameState.phase,
      gameType: gameState.gameType,
      isDefault: this.isDefault,
      upvotes: this.upvotes,
      config: {
        maxPlayers: this.config.maxPlayers,
        entryFee: this.config.entryFee,
        rewards: this.config.rewards,
        rules: this.config.rules,
      },
      createdAt: this.createdAt,
      lastActive: this.lastActive,
    };
  }

  dispose() {
    clearTimeout(this.autoStartTimer);
    if (this.agentLoop) {
      this.agentLoop.stop();
    }
    // Close SSE connections
    for (const client of this.sseClients) {
      client.res.end();
    }
    this.sseClients.clear();
    this.webhooks.clear();
    // Despawn AI players
    for (const ai of this.aiPlayers) {
      this.worldState.removePlayer(ai.id);
    }
    this.aiPlayers.length = 0;
  }
}
