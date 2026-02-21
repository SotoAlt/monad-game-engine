import { createGameSync, GAME_TYPES } from '../games/index.js';
import { randomizeTemplate } from '../ArenaTemplates.js';
import {
  MIN_LOBBY_MS, AUTO_START_DELAY, ALL_TEMPLATES,
  getTemplateGameType,
} from '../constants.js';

export function getActiveHumanPlayers(ws) {
  return ws.getPlayers().filter(p => p.type !== 'ai' && p.type !== 'spectator' && p.state !== 'spectating');
}

export function rejectIfActiveGame(arena, res) {
  const phase = arena.worldState.gameState.phase;
  if (phase === 'countdown' || phase === 'playing') {
    res.status(400).json({ error: `Cannot perform this action during ${phase} phase` });
    return true;
  }
  return false;
}

export function rejectIfLobbyTimer(arena, res) {
  const ws = arena.worldState;
  if (ws.gameState.phase !== 'lobby') return false;
  const timeSinceLobby = Date.now() - ws.lobbyEnteredAt;
  if (timeSinceLobby < MIN_LOBBY_MS) {
    const remaining = Math.ceil((MIN_LOBBY_MS - timeSinceLobby) / 1000);
    res.status(400).json({ error: `Lobby phase: ${remaining}s until games can start` });
    return true;
  }
  return false;
}

export function applyTemplate(arena, tmpl, doRandomize = true) {
  const ws = arena.worldState;
  const broadcast = arena.broadcastToRoom.bind(arena);
  const finalTmpl = doRandomize ? randomizeTemplate(tmpl) : tmpl;
  ws.clearEntities();
  broadcast('world_cleared');

  const spawned = [];
  for (const entityDef of finalTmpl.entities) {
    const entity = ws.spawnEntity(entityDef.type, entityDef.position, entityDef.size, entityDef.properties || {});
    spawned.push(entity);
  }
  broadcast('entities_batch', spawned);

  if (finalTmpl.respawnPoint) {
    ws.setRespawnPoint(finalTmpl.respawnPoint);
    broadcast('respawn_point_changed', { position: finalTmpl.respawnPoint });
  }
  if (finalTmpl.floorType) {
    ws.setFloorType(finalTmpl.floorType);
    broadcast('floor_changed', { type: finalTmpl.floorType });
  }
  if (finalTmpl.environment) {
    const env = ws.setEnvironment(finalTmpl.environment);
    broadcast('environment_changed', env);
  }
  if (finalTmpl.hazardPlane) {
    ws.setHazardPlane(finalTmpl.hazardPlane);
    broadcast('hazard_plane_changed', { ...ws.hazardPlane });
  }

  return spawned.map(e => e.id);
}

export function doStartGame(arena, gameType, options) {
  const ws = arena.worldState;
  const broadcast = arena.broadcastToRoom.bind(arena);

  const gameTypeDef = GAME_TYPES[gameType];
  const minRequired = gameTypeDef?.minPlayers || 1;
  const humanPlayers = getActiveHumanPlayers(ws);

  if (humanPlayers.length < minRequired) {
    const gameName = gameTypeDef?.name || gameType;
    return { success: false, status: 400, error: `${gameName} requires ${minRequired}+ players (${humanPlayers.length} connected)` };
  }

  clearTimeout(arena.autoStartTimer);
  ws.autoStartTargetTime = null;

  try {
    const game = createGameSync(gameType, ws, broadcast, options);

    game.onEnd = () => {
      if (arena.agentLoop) arena.agentLoop.onGameEnded();
      arena.currentMiniGame = null;
    };

    arena.currentMiniGame = game;
    game.start();
    broadcast('game_state_changed', ws.getGameState());

    const startMsg = ws.addMessage('System', 'system', `Game started: ${gameType}`);
    broadcast('chat_message', startMsg);
    ws.addEvent('game_start', { type: gameType, gameId: game.id });

    return { success: true, gameId: game.id, gameState: ws.getGameState() };
  } catch (error) {
    return { success: false, status: 400, error: error.message };
  }
}

export function scheduleAutoStart(arena) {
  clearTimeout(arena.autoStartTimer);
  const ws = arena.worldState;
  const delay = arena.config.autoStartDelay || AUTO_START_DELAY;

  ws.autoStartTargetTime = Date.now() + delay;
  arena.broadcastToRoom('lobby_countdown', {
    targetTime: ws.autoStartTargetTime,
    duration: delay,
    lobbyReadyAt: ws.lobbyEnteredAt + MIN_LOBBY_MS,
  });

  arena.autoStartTimer = setTimeout(async () => {
    if (ws.gameState.phase !== 'lobby') return;
    const activePlayers = getActiveHumanPlayers(ws);
    if (activePlayers.length === 0) return;

    const recentTemplates = ws.gameHistory.slice(-3).map(g => g.template);
    const availableTemplates = ALL_TEMPLATES.filter(t => !recentTemplates.includes(t));
    const pool = availableTemplates.length > 0 ? availableTemplates : ALL_TEMPLATES;
    const template = pool[Math.floor(Math.random() * pool.length)];

    console.log(`[AutoStart:${arena.id}] Auto-starting with ${template}`);

    try {
      const { TEMPLATES } = await import('../ArenaTemplates.js');
      const tmpl = TEMPLATES[template];
      if (!tmpl) return;
      applyTemplate(arena, tmpl);
      ws.setLastTemplate(template);
      doStartGame(arena, tmpl.gameType || 'reach', {});
    } catch (e) {
      console.error(`[AutoStart:${arena.id}] Failed:`, e.message);
    }
  }, delay);
}

export function setupArenaCallbacks(arena, gameService) {
  const ws = arena.worldState;

  ws.onPlayerJoin = () => {
    if (ws.getActiveHumanCount() === 1 && ws.gameState.phase === 'lobby') {
      gameService.scheduleAutoStart(arena);
    }
  };

  ws.onPhaseChange = (phase) => {
    if (phase === 'lobby') {
      ws.activateSpectators();
      arena.broadcastToRoom('game_state_changed', ws.getGameState());
    }
  };
}

export function spawnAIPlayers(arena) {
  // Placeholder — implement AI player spawning if needed
  console.log(`[AI] AI players not configured for arena ${arena.id}`);
}

export function despawnAIPlayers(arena) {
  for (const ai of arena.aiPlayers) {
    arena.worldState.removePlayer(ai.id);
  }
  arena.aiPlayers.length = 0;
}
