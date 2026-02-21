import { GAME_TYPES } from '../games/index.js';
import { getStats } from '../db.js';
import { ANNOUNCEMENT_COOLDOWN, AGENT_CHAT_COOLDOWN, MIN_GAME_DURATION_MS } from '../constants.js';

export function mountGameRoutes(router, ctx) {
  const { gameService } = ctx;

  router.post('/challenge/create', (req, res) => {
    const arena = req.arena;
    const { type, target, description, reward } = req.body;
    if (!type) {
      return res.status(400).json({ error: 'Missing required: type' });
    }
    try {
      const challenge = arena.worldState.createChallenge(type, target, description, reward);
      arena.broadcastToRoom('challenge_created', challenge);
      res.json({ success: true, id: challenge.id, challenge });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  router.get('/challenge/status', (req, res) => {
    res.json({ challenges: req.arena.worldState.getChallenges() });
  });

  router.post('/announce', (req, res) => {
    const arena = req.arena;
    const now = Date.now();
    if (now - arena.lastAnnouncementTime < ANNOUNCEMENT_COOLDOWN) {
      return res.status(429).json({ error: 'Announcement rate limit: wait before announcing again' });
    }
    arena.lastAnnouncementTime = now;

    const { text, type, duration } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Missing required: text' });
    }

    const announcement = arena.worldState.announce(text, type || 'agent', duration || 5000);
    arena.broadcastToRoom('announcement', announcement);
    res.json({ success: true, announcement });
  });

  router.get('/announcements', (req, res) => {
    res.json({ announcements: req.arena.worldState.getAnnouncements() });
  });

  router.get('/game/types', (req, res) => {
    res.json({ gameTypes: GAME_TYPES });
  });

  router.post('/game/start', (req, res) => {
    const arena = req.arena;
    const ws = arena.worldState;
    const { type, template } = req.body;

    if (!type && !template) {
      return res.status(400).json({ error: 'Missing required: type or template' });
    }

    if (arena.currentMiniGame?.isActive) {
      return res.status(400).json({ error: 'A game is already in progress' });
    }

    const phase = ws.gameState.phase;
    if (phase !== 'lobby' && phase !== 'building') {
      return res.status(400).json({ error: `Cannot start game during ${phase} phase` });
    }

    if (gameService.rejectIfLobbyTimer(arena, res)) return;

    if (ws.isInCooldown()) {
      const remaining = Math.ceil((ws.gameState.cooldownUntil - Date.now()) / 1000);
      return res.status(400).json({ error: `Cooldown active — wait ${remaining}s` });
    }

    const humanPlayers = ws.getPlayers().filter(p => p.type !== 'ai');
    if (humanPlayers.length === 0) {
      return res.status(400).json({ error: 'Cannot start game: no players connected' });
    }

    if (template) {
      import('../ArenaTemplates.js').then(({ TEMPLATES }) => {
        const tmpl = TEMPLATES[template];
        if (!tmpl) {
          return res.status(404).json({
            error: `Template not found: ${template}. Available: ${Object.keys(TEMPLATES).join(', ')}`
          });
        }

        const gameType = type || tmpl.gameType || 'reach';
        const gameTypeDef = GAME_TYPES[gameType];
        const minRequired = gameTypeDef?.minPlayers || 1;
        const activeCount = gameService.getActiveHumanPlayers(ws).length;
        if (activeCount < minRequired) {
          const gameName = gameTypeDef?.name || gameType;
          return res.status(400).json({
            error: `${gameName} requires ${minRequired}+ players (${activeCount} connected)`
          });
        }

        gameService.applyTemplate(arena, tmpl);
        ws.setLastTemplate(template);

        const result = gameService.doStartGame(arena, gameType, req.body);
        if (!result.success) {
          return res.status(result.status || 400).json({ error: result.error });
        }
        res.json(result);
      }).catch(err => {
        res.status(500).json({ error: err.message });
      });
    } else {
      const result = gameService.doStartGame(arena, type, req.body);
      if (!result.success) {
        return res.status(result.status || 400).json({ error: result.error });
      }
      res.json(result);
    }
  });

  router.post('/game/end', (req, res) => {
    const arena = req.arena;
    const ws = arena.worldState;
    const phase = ws.gameState.phase;

    if (phase !== 'countdown' && phase !== 'playing') {
      return res.status(400).json({ error: `No active game to end (phase: ${phase})` });
    }

    const miniGame = arena.currentMiniGame;
    if (miniGame?.isActive && miniGame.startTime && req.body.result !== 'win') {
      const elapsed = Date.now() - miniGame.startTime;
      if (elapsed < MIN_GAME_DURATION_MS) {
        return res.status(400).json({
          error: `Game just started ${Math.round(elapsed / 1000)}s ago — let it play out!`
        });
      }
    }

    const { winnerId, result: endResult = 'ended' } = req.body;
    const hadMiniGame = arena.currentMiniGame?.isActive;

    if (hadMiniGame) {
      arena.currentMiniGame.end(endResult, winnerId);
    } else {
      ws.endGame(endResult, winnerId);
      if (arena.agentLoop) arena.agentLoop.onGameEnded();
    }

    const winnerPlayer = winnerId ? ws.players.get(winnerId) : null;
    const endText = winnerPlayer ? `Game ended - Winner: ${winnerPlayer.name}` : `Game ended: ${endResult}`;
    const endMsg = ws.addMessage('System', 'system', endText);
    arena.broadcastToRoom('chat_message', endMsg);
    ws.addEvent('game_end', { result: endResult, winnerId });

    res.json({ success: true, gameState: ws.getGameState() });
  });

  router.get('/game/state', (req, res) => {
    res.json({ gameState: req.arena.worldState.getGameState() });
  });

  router.post('/game/winner', (req, res) => {
    const { playerId } = req.body;
    if (!playerId) {
      return res.status(400).json({ error: 'Missing required: playerId' });
    }
    req.arena.worldState.recordWinner(playerId);
    res.json({ success: true, gameState: req.arena.worldState.getGameState() });
  });

  router.post('/game/trick', (req, res) => {
    const arena = req.arena;
    const { trigger, action, params } = req.body;
    if (!trigger || !action) {
      return res.status(400).json({ error: 'Missing required: trigger, action' });
    }
    if (!arena.currentMiniGame?.isActive) {
      return res.status(400).json({ error: 'No active game' });
    }
    const id = arena.currentMiniGame.addTrick(trigger, action, params);
    res.json({ success: true, trickId: id });
  });

  router.get('/game/minigame', (req, res) => {
    res.json({ miniGame: req.arena.currentMiniGame?.getStatus() ?? null });
  });

  router.post('/game/building', (req, res) => {
    const arena = req.arena;
    const phase = arena.worldState.gameState.phase;
    if (phase !== 'lobby') {
      return res.status(400).json({ error: `Cannot enter building phase during ${phase} phase` });
    }
    const state = arena.worldState.startBuilding();
    arena.broadcastToRoom('game_state_changed', state);
    res.json({ success: true, gameState: state });
  });

  // Chat
  router.get('/chat/messages', (req, res) => {
    const since = parseInt(req.query.since) || 0;
    const limit = parseInt(req.query.limit) || 20;
    res.json({ messages: req.arena.worldState.getMessages(since, limit) });
  });

  router.post('/chat/send', (req, res) => {
    const arena = req.arena;
    const now = Date.now();
    if (now - arena.lastAgentChatTime < AGENT_CHAT_COOLDOWN) {
      return res.status(429).json({ error: 'Chat rate limit: wait before sending another message' });
    }
    arena.lastAgentChatTime = now;

    const { text } = req.body;
    if (!text || String(text).trim().length === 0) {
      return res.status(400).json({ error: 'Missing required: text' });
    }

    const senderName = arena.isDefault ? 'AI Game Master' : arena.gameMasterName;
    const message = arena.worldState.addMessage(senderName, 'agent', String(text).trim());
    arena.broadcastToRoom('chat_message', message);
    if (arena.agentLoop) arena.agentLoop.notifyAgentAction();
    res.json({ success: true, message });
  });

  router.post('/chat/bridge', (req, res) => {
    const arena = req.arena;
    const { sender, platform, text } = req.body;
    if (!sender || !platform || !text) {
      return res.status(400).json({ error: 'Missing required: sender, platform, text' });
    }

    const validPlatforms = ['twitch', 'discord', 'telegram'];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({ error: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}` });
    }

    const displayName = `[${platform}] ${sender}`;
    const message = arena.worldState.addMessage(displayName, 'audience', String(text).trim().slice(0, 200));
    arena.broadcastToRoom('chat_message', message);
    res.json({ success: true, message });
  });

  // Leaderboard & Stats
  router.get('/leaderboard', (req, res) => {
    res.json({ leaderboard: req.arena.worldState.getLeaderboard() });
  });

  router.get('/stats', async (req, res) => {
    const arena = req.arena;
    const dbStats = await getStats();
    res.json({
      uptime: Math.floor(process.uptime()),
      arenaId: arena.id,
      players: arena.worldState.players.size,
      entities: arena.worldState.entities.size,
      gamesPlayed: dbStats.totalGames ?? arena.worldState.statistics.totalChallengesCompleted,
      totalPlayers: dbStats.totalPlayers ?? arena.worldState.statistics.playersOnline ?? 0,
      dbConnected: dbStats.dbConnected
    });
  });
}
