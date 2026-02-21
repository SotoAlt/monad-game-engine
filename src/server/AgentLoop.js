/**
 * AgentLoop - Autonomous agent heartbeat (simplified for template)
 *
 * Ticks periodically and decides whether to invoke the AI agent.
 * Override or extend for your own agent behavior.
 */

import { AgentBridge } from './AgentBridge.js';

const MIN_INVOKE_INTERVAL = 15000;

export class AgentLoop {
  constructor(worldState, broadcastFn, config = {}) {
    this.worldState = worldState;
    this.broadcast = broadcastFn;

    this.bridge = new AgentBridge(
      config.gatewayUrl || process.env.AGENT_GATEWAY_URL || 'http://localhost:18789',
      config.sessionId || process.env.AGENT_SESSION_ID || null
    );

    this.tickInterval = config.tickInterval || 5000;
    this._timer = null;

    this.paused = false;
    this.phase = 'welcome';
    this.sessionStartTime = Date.now();
    this.lastInvokeTime = 0;
    this.lastActionTime = Date.now();
    this.gamesPlayed = 0;
    this.invokeCount = 0;

    this.pendingMentions = [];
    this.pendingWelcomes = [];
    this.lastMessageId = 0;
    this.lastEventId = 0;
  }

  start() {
    console.log('[AgentLoop] Starting agent loop');
    if (!this.bridge.sessionId) {
      console.warn('[AgentLoop] No AGENT_SESSION_ID set — agent loop will not invoke');
    }
    this._timer = setInterval(() => this.tick(), this.tickInterval);
    setTimeout(() => this.tick(), 2000);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    console.log('[AgentLoop] Stopped');
  }

  get playerCount() {
    return this.worldState.players.size;
  }

  pause() {
    this.paused = true;
    console.log('[AgentLoop] Paused');
  }

  resume() {
    this.paused = false;
    console.log('[AgentLoop] Resumed');
  }

  async tick() {
    try {
      if (this.paused) return;
      if (this.worldState.getActiveHumanCount() === 0) return;
      if (Date.now() - this.lastInvokeTime < MIN_INVOKE_INTERVAL) return;

      this.gatherContext();

      if (this.shouldInvoke()) {
        await this.invoke();
      }
    } catch (err) {
      console.error('[AgentLoop] Tick error:', err.message);
    }
  }

  gatherContext() {
    const now = Date.now();

    const messages = this.worldState.getMessages(this.lastMessageId);
    for (const msg of messages) {
      this.lastMessageId = Math.max(this.lastMessageId, msg.id);
      if (msg.senderType === 'player' && /@agent/i.test(msg.text)) {
        this.pendingMentions.push({
          id: msg.id, sender: msg.sender,
          text: msg.text, timestamp: msg.timestamp
        });
      }
    }

    const events = this.worldState.getEvents(this.lastEventId);
    for (const evt of events) {
      this.lastEventId = Math.max(this.lastEventId, evt.id);
      if (evt.type === 'player_join' && evt.data?.type !== 'ai') {
        this.pendingWelcomes.push({
          name: evt.data?.name || 'Unknown',
          playerId: evt.data?.playerId,
          timestamp: evt.timestamp
        });
      }
    }
  }

  shouldInvoke() {
    if (!this.bridge.sessionId) return false;
    if (this.worldState.isInCooldown()) return false;

    const sinceLast = Date.now() - this.lastInvokeTime;
    if (this.pendingMentions.length > 0) return true;
    if (this.pendingWelcomes.length > 0 && sinceLast > MIN_INVOKE_INTERVAL) return true;
    return sinceLast > 45000;
  }

  async invoke() {
    if (!this.bridge.sessionId) return;

    this.lastInvokeTime = Date.now();
    this.invokeCount++;

    const context = this.buildContext();

    try {
      await this.bridge.invoke(context, this.phase, 50, this.pendingMentions);
      this.lastActionTime = Date.now();
      this.pendingMentions = [];
      this.pendingWelcomes = [];
    } catch (err) {
      console.error('[AgentLoop] Invoke failed:', err.message);
    }
  }

  buildContext() {
    const players = this.worldState.getPlayers().map(p => ({
      id: p.id, name: p.name, type: p.type, state: p.state, position: p.position
    }));

    return {
      playerCount: this.playerCount,
      players,
      entityCount: this.worldState.entities.size,
      gameState: this.worldState.getGameState(),
      activeEffects: this.worldState.getActiveEffects(),
      recentChat: this.worldState.getMessages(Math.max(0, this.lastMessageId - 10)),
      leaderboard: this.worldState.getLeaderboard(),
      gamesPlayed: this.gamesPlayed,
      sessionUptime: Math.floor((Date.now() - this.sessionStartTime) / 1000),
      pendingWelcomes: this.pendingWelcomes,
      lastGameType: this.worldState.lastGameType || null,
    };
  }

  onGameEnded() {
    this.gamesPlayed++;
  }

  notifyAgentAction() {
    this.lastActionTime = Date.now();
  }

  calculateDrama() {
    return 0; // Simplified — override for custom drama scoring
  }

  getStatus() {
    return {
      phase: this.phase,
      paused: this.paused,
      drama: this.calculateDrama(),
      invokeCount: this.invokeCount,
      gamesPlayed: this.gamesPlayed,
      playerCount: this.playerCount,
      pendingMentions: this.pendingMentions.length,
      lastInvoke: this.lastInvokeTime ? Date.now() - this.lastInvokeTime : null,
      sessionUptime: Math.floor((Date.now() - this.sessionStartTime) / 1000)
    };
  }
}
