export function mountPublicRoutes(router) {
  router.get('/public/state', (req, res) => {
    const ws = req.arena.worldState;
    const players = ws.getPlayers().map(p => ({
      name: p.name, type: p.type, state: p.state
    }));

    res.json({
      arenaId: req.arena.id,
      players,
      playerCount: players.length,
      gameState: {
        phase: ws.gameState.phase,
        gameType: ws.gameState.gameType,
        timeRemaining: ws.getGameState().timeRemaining || null
      },
      entityCount: ws.entities.size,
      activeEffects: ws.getActiveEffects().map(e => e.name),
      floorType: ws.floorType,
      environment: { skyColor: ws.environment.skyColor }
    });
  });

  router.get('/public/leaderboard', (req, res) => {
    res.json({ leaderboard: req.arena.worldState.getLeaderboard() });
  });

  router.get('/public/events', (req, res) => {
    const ws = req.arena.worldState;
    const since = parseInt(req.query.since) || 0;
    const limit = parseInt(req.query.limit) || 20;
    const filtered = since > 0
      ? ws.events.filter(e => e.timestamp > since)
      : ws.events;
    res.json({ events: filtered.slice(-limit) });
  });

  router.get('/public/stats', (req, res) => {
    const arena = req.arena;
    const ws = arena.worldState;
    const counts = { player_death: 0, bribe: 0, bribe_honored: 0, spell_cast: 0 };
    for (const event of ws.events) {
      if (event.type in counts) counts[event.type]++;
    }

    res.json({
      uptime: Math.floor(process.uptime()),
      arenaId: arena.id,
      playerCount: ws.players.size,
      entityCount: ws.entities.size,
      gamesPlayed: arena.agentLoop?.gamesPlayed || 0,
      totalDeaths: counts.player_death,
      bribesSubmitted: counts.bribe,
      bribesHonored: counts.bribe_honored,
      spellsCast: counts.spell_cast,
      agentInvocations: arena.agentLoop?.invokeCount || 0
    });
  });

  // Agent-Player API
  function requireAgentPlayer(arena, playerId, res) {
    if (!arena.agentPlayers.has(playerId)) {
      res.status(404).json({ error: 'Agent player not found. Join first.' });
      return null;
    }
    return arena.agentPlayers.get(playerId);
  }

  router.post('/agent-player/join', (req, res) => {
    const arena = req.arena;
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Missing required: name' });
    }

    const id = `agent-player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const player = arena.worldState.addPlayer(id, name, 'agent');
    arena.agentPlayers.set(id, { joinedAt: Date.now(), lastAction: Date.now() });

    arena.broadcastToRoom('player_joined', { id, name, type: 'agent' });
    arena.worldState.addEvent('player_joined', { id, name, type: 'agent' });

    res.json({ success: true, playerId: id, player });
  });

  router.post('/agent-player/move', (req, res) => {
    const arena = req.arena;
    const { playerId, position } = req.body;
    if (!playerId || !position) {
      return res.status(400).json({ error: 'Missing required: playerId, position' });
    }

    const agentEntry = requireAgentPlayer(arena, playerId, res);
    if (!agentEntry) return;

    const player = arena.worldState.updatePlayer(playerId, { position });
    if (!player) {
      return res.status(404).json({ error: 'Player not found in world state' });
    }

    agentEntry.lastAction = Date.now();
    arena.broadcastToRoom('player_moved', { id: playerId, position });
    res.json({ success: true, position: player.position });
  });

  router.get('/agent-player/:id/state', (req, res) => {
    const arena = req.arena;
    const ws = arena.worldState;
    const { id } = req.params;
    const player = ws.players.get(id);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const otherPlayers = ws.getPlayers()
      .filter(p => p.id !== id)
      .map(p => ({ name: p.name, type: p.type, state: p.state, position: p.position }));

    res.json({
      me: player,
      otherPlayers,
      gameState: ws.getGameState(),
      entities: Array.from(ws.entities.values()).map(e => ({
        id: e.id, type: e.type, position: e.position, size: e.size
      })),
      activeEffects: ws.getActiveEffects(),
      recentChat: ws.getMessages(0, 10),
      leaderboard: ws.getLeaderboard()
    });
  });

  router.post('/agent-player/chat', (req, res) => {
    const arena = req.arena;
    const { playerId, text } = req.body;
    if (!playerId || !text) {
      return res.status(400).json({ error: 'Missing required: playerId, text' });
    }

    if (!requireAgentPlayer(arena, playerId, res)) return;

    const player = arena.worldState.players.get(playerId);
    const name = player?.name || playerId;
    const message = arena.worldState.addMessage(name, 'player', String(text).trim());
    arena.broadcastToRoom('chat_message', message);
    res.json({ success: true, message });
  });

  router.post('/agent-player/leave', (req, res) => {
    const arena = req.arena;
    const { playerId } = req.body;
    if (!playerId) {
      return res.status(400).json({ error: 'Missing required: playerId' });
    }

    if (!requireAgentPlayer(arena, playerId, res)) return;

    arena.worldState.removePlayer(playerId);
    arena.agentPlayers.delete(playerId);
    arena.broadcastToRoom('player_left', { id: playerId });
    arena.worldState.addEvent('player_left', { id: playerId, type: 'agent' });
    res.json({ success: true });
  });
}
