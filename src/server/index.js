import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import Colyseus from 'colyseus';
import WSTransport from '@colyseus/ws-transport';
const { Server } = Colyseus;
const { WebSocketTransport } = WSTransport;
import { createServer } from 'http';
import { GameRoom } from './GameRoom.js';
import { initDB, loadArenas, deleteArenaFromDB } from './db.js';
import { initAuth } from './auth.js';
import { AgentLoop } from './AgentLoop.js';
import { ArenaManager } from './ArenaManager.js';
import { createArenaMiddleware, requireArenaKey } from './arenaMiddleware.js';
import { PORT, AFK_IDLE_MS, AFK_KICK_MS, AFK_CHECK_INTERVAL } from './constants.js';

import * as gameService from './services/gameService.js';
import * as arenaService from './services/arenaService.js';
import {
  mountAuthRoutes, mountArenaRoutes,
  mountWorldRoutes, mountGameRoutes,
  mountAgentRoutes, mountPublicRoutes,
} from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const distPath = path.join(__dirname, '../../dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath));
}

const arenaManager = new ArenaManager();
const defaultArena = arenaManager.createDefaultArena();
arenaService.setupArenaCallbacks(defaultArena, gameService);

const ctx = { arenaManager, gameService, arenaService };

mountAuthRoutes(app);
mountArenaRoutes(app, ctx);

const gameRouter = express.Router({ mergeParams: true });

// Require API key for write operations except player-facing endpoints
const PLAYER_PATHS = new Set(['/chat/send', '/chat/bridge',
  '/agent-player/join', '/agent-player/move', '/agent-player/chat', '/agent-player/leave']);
gameRouter.use((req, res, next) => {
  if (req.method === 'GET') return next();
  if (PLAYER_PATHS.has(req.path)) return next();
  requireArenaKey(req, res, next);
});

mountAgentRoutes(gameRouter, ctx);
mountWorldRoutes(gameRouter, ctx);
mountGameRoutes(gameRouter, ctx);
mountPublicRoutes(gameRouter);

const arenaMiddleware = createArenaMiddleware(arenaManager);
app.use('/api/arenas/:arenaId', arenaMiddleware, gameRouter);
app.use('/api', arenaMiddleware, gameRouter);

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer })
});

GameRoom.arenaManager = arenaManager;
gameServer.define('game', GameRoom).filterBy(['arenaId']);

if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

initAuth();

initDB().then(async (connected) => {
  if (connected) {
    await defaultArena.worldState.loadLeaderboardFromDB();

    const arenaRows = await loadArenas();
    arenaManager.loadFromDB(arenaRows);
    for (const arena of arenaManager.getAllArenas()) {
      if (arena.id !== 'default') {
        arenaService.setupArenaCallbacks(arena, gameService);
      }
    }
  }
});

defaultArena.agentLoop = new AgentLoop(
  defaultArena.worldState, defaultArena.broadcastToRoom.bind(defaultArena)
);
defaultArena.agentLoop.start();

defaultArena.aiPlayersEnabled = process.env.AI_PLAYERS === 'true';
if (defaultArena.aiPlayersEnabled) arenaService.spawnAIPlayers(defaultArena);

httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║              MONAD GAME ENGINE (Multi-Arena)               ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  HTTP API:    http://localhost:${PORT}/api                  ║
║  WebSocket:   ws://localhost:${PORT}                        ║
║  Arenas:      GET /api/arenas                             ║
║  Default:     default                                     ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

gameServer.onShutdown(() => {
  console.log('Game server shutting down');
});

// Game tick loop
let lastUpdateTime = Date.now();
setInterval(() => {
  const now = Date.now();
  const delta = (now - lastUpdateTime) / 1000;
  lastUpdateTime = now;

  for (const arena of arenaManager.getAllArenas()) {
    const ws = arena.worldState;
    const broadcast = arena.broadcastToRoom.bind(arena);

    // 1. Kinematic entities (patrol, rotate, pendulum, crush)
    const movedEntities = ws.updateKinematicEntities(delta);
    for (const entity of movedEntities) {
      broadcast('entity_modified', entity);
    }

    // 2. Chasing entities
    const chasedEntities = ws.updateChasingEntities(delta);
    for (const entity of chasedEntities) {
      broadcast('entity_modified', entity);
    }

    // 3. Breaking platforms
    ws.processBreakingPlatforms(broadcast);

    // 4. Rising hazard plane
    const hazardUpdate = ws.updateHazardPlane(delta);
    if (hazardUpdate) {
      if (now - arena.lastHazardBroadcast >= 200) {
        arena.lastHazardBroadcast = now;
        broadcast('hazard_plane_update', hazardUpdate);
      }

      for (const player of ws.players.values()) {
        if (player.state === 'alive' && player.position[1] < hazardUpdate.height) {
          player.state = 'dead';
          broadcast('player_died', { id: player.id, cause: 'hazard_plane' });
        }
      }
    }

    // 5. MiniGame tick
    if (arena.currentMiniGame?.isActive) {
      arena.currentMiniGame.update(delta);
      if (now - arena.lastStateBroadcast >= 1000) {
        arena.lastStateBroadcast = now;
        broadcast('game_state_changed', ws.getGameState());
      }
    }

    // 6. AI players
    for (const ai of arena.aiPlayers) {
      ai.update(delta);
    }

    // 7. AFK detection (throttled)
    if (now - arena._lastAfkCheck >= AFK_CHECK_INTERVAL) {
      arena._lastAfkCheck = now;
      const room = arena.gameRoom;

      for (const player of ws.players.values()) {
        if (player.type === 'ai') continue;
        if (player._disconnectedAt) continue;

        if (player.state === 'afk_warned') {
          if (now - player.afkWarningSentAt < AFK_KICK_MS) continue;
          const client = room?.getClient(player.id);
          if (client) {
            client.send('afk_kicked', { reason: 'You were kicked for being AFK.' });
            client.leave(4000);
          }
          console.log(`[AFK] Kicked ${player.name} from arena ${arena.id}`);
          continue;
        }

        if (player.state === 'dead') continue;
        if (now - player.lastActivity < AFK_IDLE_MS) continue;

        const token = Math.random().toString(36).slice(2, 10);
        player.afkWarningToken = token;
        player.afkWarningSentAt = now;
        player.state = 'afk_warned';
        const client = room?.getClient(player.id);
        if (client) {
          client.send('afk_warning', { token, timeout: AFK_KICK_MS });
        }
        console.log(`[AFK] Warning sent to ${player.name} in arena ${arena.id}`);
      }
    }
  }
}, 100);

// Stale arena cleanup — every hour, delete arenas inactive for 24h+
setInterval(() => {
  for (const id of arenaManager.findStaleArenas()) {
    try {
      arenaManager.deleteArena(id);
      deleteArenaFromDB(id);
    } catch (e) {
      console.error(`[Cleanup] Failed to delete arena ${id}:`, e.message);
    }
  }
}, 60 * 60 * 1000);

export { arenaManager };
