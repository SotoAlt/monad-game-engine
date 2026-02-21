/**
 * AgentBridge - Communicates with an external AI agent
 *
 * Uses a CLI tool (e.g. openclaw, custom script) to send messages to the agent.
 * The agent responds using game API HTTP calls back to the server.
 *
 * To use a different agent system, replace _execAgent() with your own invocation.
 */

import { execFile } from 'child_process';

export class AgentBridge {
  constructor(gatewayUrl, sessionId) {
    this.gatewayUrl = gatewayUrl;
    this.sessionId = sessionId || null;
    this._invoking = false;
  }

  async invoke(context, phase, drama, pendingRequests) {
    if (!this.sessionId) return;
    if (this._invoking) {
      console.log('[AgentBridge] Already invoking, skipping');
      return;
    }

    const message = this.buildMessage(context, phase, pendingRequests);

    this._invoking = true;
    try {
      await this._execAgent(message);
      console.log(`[AgentBridge] Invoked agent (phase=${phase})`);
    } catch (err) {
      console.error('[AgentBridge] Failed to invoke agent:', err.message);
    } finally {
      this._invoking = false;
    }
  }

  /**
   * Override this method to use a different agent CLI or HTTP call.
   */
  _execAgent(message) {
    return new Promise((resolve, reject) => {
      const args = ['agent', '--session-id', this.sessionId, '--message', message, '--json', '--timeout', '30'];

      execFile('openclaw', args, {
        timeout: 35000,
        env: { ...process.env, PATH: process.env.PATH + ':/usr/bin:/usr/local/bin' }
      }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Agent exec failed: ${error.message}${stderr ? ` | ${stderr}` : ''}`));
          return;
        }
        resolve(stdout);
      });
    });
  }

  buildMessage(context, phase, pendingRequests) {
    const parts = [];

    parts.push(`**Phase: ${phase.toUpperCase()}** — ${context.playerCount} players online.`);

    parts.push(`\n**World State**:`);
    parts.push(`- Players: ${context.playerCount} online`);
    if (context.players.length > 0) {
      parts.push(`- Player list: ${context.players.map(p => `${p.name} (${p.state})`).join(', ')}`);
    }
    parts.push(`- Entities: ${context.entityCount} in world`);
    parts.push(`- Game phase: ${context.gameState.phase}`);
    if (context.gameState.gameType) {
      parts.push(`- Game type: ${context.gameState.gameType}`);
    }
    parts.push(`- Games played this session: ${context.gamesPlayed}`);

    if (context.recentChat.length > 0) {
      parts.push(`\n**Recent Chat**:`);
      for (const msg of context.recentChat.slice(-10)) {
        parts.push(`  [${msg.senderType}] ${msg.sender}: ${msg.text}`);
      }
    }

    if (context.pendingWelcomes?.length > 0) {
      parts.push(`\n**NEW PLAYERS TO WELCOME**:`);
      for (const w of context.pendingWelcomes) {
        parts.push(`  - ${w.name}`);
      }
    }

    if (pendingRequests?.length > 0) {
      parts.push(`\n**Player Requests**:`);
      for (const req of pendingRequests) {
        parts.push(`  - ${req.sender}: "${req.text}"`);
      }
    }

    if (context.leaderboard.length > 0) {
      parts.push(`\n**Leaderboard**: ${context.leaderboard.slice(0, 3).map((e, i) => `${i + 1}. ${e.name} (${e.wins}W)`).join(', ')}`);
    }

    return parts.join('\n');
  }
}
