import { MIN_LOBBY_MS } from '../constants.js';
import { WorldState } from '../WorldState.js';

export function mountAgentRoutes(router, ctx) {
  const { arenaService } = ctx;

  router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now(), arenaId: req.arena.id });
  });

  router.get('/agent/context', (req, res) => {
    const arena = req.arena;
    const ws = arena.worldState;
    const sinceMessage = parseInt(req.query.since_message) || 0;
    const sinceEvent = parseInt(req.query.since_event) || 0;

    const players = ws.getPlayers().map(p => ({
      id: p.id, name: p.name, type: p.type, position: p.position, state: p.state,
      lastActivity: p.lastActivity
    }));

    const allMessages = ws.getMessages(sinceMessage);
    const spectatorCount = players.filter(p => p.state === 'spectating').length;

    res.json({
      arenaId: arena.id,
      players,
      playerCount: players.length,
      activeHumanCount: ws.getActiveHumanCount(),
      gameState: ws.getGameState(),
      entities: Array.from(ws.entities.values()).map(e => ({
        id: e.id, type: e.type, position: e.position,
        groupId: e.properties?.groupId || null
      })),
      entityCount: ws.entities.size,
      physics: { ...ws.physics },
      activeEffects: ws.getActiveEffects(),
      recentChat: allMessages,
      recentEvents: ws.getEvents(sinceEvent),
      leaderboard: ws.getLeaderboard(),
      cooldownUntil: ws.gameState.cooldownUntil,
      lobbyReadyAt: ws.lobbyEnteredAt + MIN_LOBBY_MS,
      spellCooldownUntil: ws.lastSpellCastTime + WorldState.SPELL_COOLDOWN,
      environment: { ...ws.environment },
      hazardPlane: { ...ws.hazardPlane },
      pendingWelcomes: arena.agentLoop?.pendingWelcomes || [],
      lastGameType: ws.lastGameType || null,
      lastGameEndTime: ws.lastGameEndTime || null,
      gameHistory: ws.gameHistory.map(g => ({ type: g.type, template: g.template })),
      lastTemplate: ws.lastTemplate || null
    });
  });

  router.get('/agent/status', (req, res) => {
    const arena = req.arena;
    if (arena.agentLoop) {
      return res.json(arena.agentLoop.getStatus());
    }
    res.json({
      phase: 'inactive', paused: false, drama: 0,
      invokeCount: 0, gamesPlayed: 0,
      playerCount: arena.worldState.players.size,
    });
  });

  router.post('/agent/pause', (req, res) => {
    if (req.arena.agentLoop) req.arena.agentLoop.pause();
    res.json({ success: true, status: 'paused' });
  });

  router.post('/agent/resume', (req, res) => {
    if (req.arena.agentLoop) req.arena.agentLoop.resume();
    res.json({ success: true, status: 'running' });
  });

  router.post('/agent/heartbeat', (req, res) => {
    const arena = req.arena;
    if (arena.agentLoop) arena.agentLoop.notifyAgentAction();
    res.json({
      success: true,
      drama: arena.agentLoop?.calculateDrama() || 0,
      phase: arena.agentLoop?.phase || 'inactive'
    });
  });

  // AI Players
  router.get('/ai/status', (req, res) => {
    res.json({ enabled: req.arena.aiPlayersEnabled, count: req.arena.aiPlayers.length });
  });

  router.post('/ai/enable', (req, res) => {
    const arena = req.arena;
    if (arena.aiPlayersEnabled) return res.json({ success: true, status: 'already enabled' });
    arena.aiPlayersEnabled = true;
    arenaService.spawnAIPlayers(arena);
    res.json({ success: true, status: 'enabled', count: arena.aiPlayers.length });
  });

  router.post('/ai/disable', (req, res) => {
    const arena = req.arena;
    if (!arena.aiPlayersEnabled) return res.json({ success: true, status: 'already disabled' });
    arena.aiPlayersEnabled = false;
    arenaService.despawnAIPlayers(arena);
    res.json({ success: true, status: 'disabled' });
  });

  // SSE Event Feed
  router.get('/stream/events', (req, res) => {
    const arena = req.arena;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });

    const client = { res, id: Date.now() };
    arena.sseClients.add(client);

    const initData = {
      type: 'init',
      arenaId: arena.id,
      players: arena.worldState.players.size,
      gameState: arena.worldState.getGameState()
    };
    res.write(`data: ${JSON.stringify(initData)}\n\n`);

    req.on('close', () => {
      arena.sseClients.delete(client);
    });
  });

  // Webhooks
  router.post('/webhooks/register', (req, res) => {
    const arena = req.arena;
    const { url, events } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'Missing required: url' });
    }

    const id = `webhook-${++arena.webhookIdCounter}`;
    const webhook = { id, url, events: events || null, createdAt: Date.now() };
    arena.webhooks.set(id, webhook);
    res.json({ success: true, webhook });
  });

  router.delete('/webhooks/:id', (req, res) => {
    const arena = req.arena;
    const { id } = req.params;
    if (!arena.webhooks.has(id)) {
      return res.status(404).json({ error: `Webhook not found: ${id}` });
    }
    arena.webhooks.delete(id);
    res.json({ success: true });
  });

  router.get('/webhooks', (req, res) => {
    res.json({ webhooks: Array.from(req.arena.webhooks.values()) });
  });

  // Players
  router.get('/players', (req, res) => {
    res.json({ players: req.arena.worldState.getPlayers() });
  });
}
